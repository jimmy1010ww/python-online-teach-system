// 教師後台:學生進度總覽 + 自訂題目管理
// 權限由 Supabase RLS 把關(is_teacher()),這裡的檢查只是為了介面提示。

import * as cloud from "./cloud.js";
import { DEFAULT_COURSE, CHAPTER_OPTIONS } from "./challenges.js";

const el = (id) => document.getElementById(id);

let students = [];
let progressRows = [];
let customLevels = [];

// 目前正在編輯什麼:
//   { mode: "new" }                        新增一題
//   { mode: "custom", row }                編輯老師自己新增的題目
//   { mode: "builtin", level, row|null }   編輯內建題(row 是既有的覆寫記錄)
let editing = null;

/* ── 啟動與權限 ── */
async function boot() {
  if (!cloud.isConfigured()) {
    el("gate-message").innerHTML =
      "尚未設定 Supabase。<br />請先填好 <code>js/config.js</code> 的兩個值,並在 Supabase 執行 <code>supabase/schema.sql</code>。";
    return;
  }

  // 只在使用者真的登出時才重整。INITIAL_SESSION 在訂閱當下必定觸發一次,
  // 若對它重整會讓頁面陷入無窮重載,學生進度永遠來不及顯示。
  await cloud.initCloud((_user, event) => {
    if (event === "SIGNED_OUT") window.location.reload();
  });
  const user = await cloud.refreshUser();
  if (!user) {
    el("gate-message").innerHTML =
      '尚未登入。<br /><a href="index.html">← 回遊戲頁登入</a>後再進入後台。';
    return;
  }

  const profile = await cloud.fetchProfile();
  if (profile?.role !== "teacher") {
    el("gate-message").innerHTML =
      "這個帳號沒有教師權限。<br />請在 Supabase 的 profiles 資料表把你的 role 改成 <code>teacher</code>。";
    return;
  }

  el("admin-user").textContent = `👩‍🏫 ${profile.display_name || user.email}`;
  el("admin-gate").classList.add("is-hidden");
  el("admin-body").classList.remove("is-hidden");

  bindEvents();
  fillChapterOptions();
  await refreshAll();
}

function bindEvents() {
  el("tab-students").addEventListener("click", () => switchTab("students"));
  el("tab-levels").addEventListener("click", () => switchTab("levels"));
  el("btn-refresh").addEventListener("click", refreshAll);
  el("btn-new-level").addEventListener("click", () => openEditor({ mode: "new" }));
  el("filter-chapter").addEventListener("change", renderLevels);
  el("btn-cancel-edit").addEventListener("click", closeEditor);
  el("level-form").addEventListener("submit", saveLevel);
}

function switchTab(name) {
  el("tab-students").classList.toggle("is-active", name === "students");
  el("tab-levels").classList.toggle("is-active", name === "levels");
  el("panel-students").classList.toggle("is-hidden", name !== "students");
  el("panel-levels").classList.toggle("is-hidden", name !== "levels");
}

async function refreshAll() {
  try {
    [students, progressRows, customLevels] = await Promise.all([
      cloud.adminFetchStudents(),
      cloud.adminFetchAllProgress(),
      cloud.fetchCustomLevels(),
    ]);
    renderStudents();
    renderLevels();
  } catch (err) {
    el("students-summary").textContent = `讀取失敗:${err.message}`;
  }
}

/* ── 學生進度 ── */
function renderStudents() {
  const byUser = new Map();
  for (const row of progressRows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { count: 0, stars: 0, xp: 0, last: null });
    }
    const acc = byUser.get(row.user_id);
    acc.count += 1;
    acc.stars += row.stars ?? 0;
    acc.xp += row.xp ?? 0;
    if (!acc.last || row.completed_at > acc.last) acc.last = row.completed_at;
  }

  const learners = students.filter((s) => s.role === "student");
  const totalLevels = DEFAULT_COURSE.challenges.length;
  el("students-summary").textContent =
    `共 ${learners.length} 位學生 · 課程總關卡 ${totalLevels} 關`;

  const rows = students
    .map((s) => ({ ...s, ...(byUser.get(s.id) ?? { count: 0, stars: 0, xp: 0, last: null }) }))
    .sort((a, b) => b.xp - a.xp);

  const tbody = el("students-table").querySelector("tbody");
  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const name = r.display_name || "(未命名)";
    const badge = r.role === "teacher" ? " 👩‍🏫" : "";
    tr.innerHTML = `
      <td>${escapeHtml(name)}${badge}</td>
      <td class="num">${r.count} / ${totalLevels}</td>
      <td class="num">⭐ ${r.stars}</td>
      <td class="num">${r.xp}</td>
      <td>${r.last ? new Date(r.last).toLocaleDateString("zh-TW") : "—"}</td>
    `;
    tbody.appendChild(tr);
  }

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">還沒有學生註冊</td></tr>';
  }
}

/* ── 題目管理 ── */
function fillChapterOptions() {
  const opts =
    CHAPTER_OPTIONS.map(
      (c) => `<option value="${c.num}">第 ${c.num} 章 — ${escapeHtml(c.title)}</option>`
    ).join("") + '<option value="10">特別任務星系(獨立章節)</option>';

  el("f-chapter").innerHTML = opts;
  el("filter-chapter").innerHTML = '<option value="all">全部章節</option>' + opts;
}

/** 依 override_id 索引覆寫記錄 */
function overrideMap() {
  return new Map(
    customLevels.filter((r) => r.override_id).map((r) => [r.override_id, r])
  );
}

/** 老師新增的獨立題目(非覆寫) */
function additionRows() {
  return customLevels.filter((r) => !r.override_id);
}

function renderLevels() {
  const overrides = overrideMap();
  const additions = additionRows();
  const filter = el("filter-chapter").value; // "all" 或章節號

  el("levels-summary").textContent =
    `內建 ${DEFAULT_COURSE.challenges.length} 題(已修改 ${overrides.size} 題) · 新增 ${additions.length} 題`;

  // 資料庫還沒加 override_id 欄位時,內建題只能瀏覽不能編輯
  const locked = cloud.needsMigration();
  el("migration-warning").classList.toggle("is-hidden", !locked);

  const tbody = el("levels-table").querySelector("tbody");
  tbody.innerHTML = "";

  const addRow = (cells, actions) => {
    const tr = document.createElement("tr");
    tr.innerHTML = cells;
    const box = document.createElement("div");
    box.className = "row-actions";
    actions.forEach((b) => box.appendChild(b));
    tr.lastElementChild.appendChild(box);
    tbody.appendChild(tr);
  };

  const makeBtn = (text, onClick) => {
    const b = document.createElement("button");
    b.className = "btn btn-ghost";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };

  for (const chapter of DEFAULT_COURSE.chapters) {
    if (filter !== "all" && String(chapter.num) !== filter) continue;

    // 內建題(可編輯,編輯後以覆寫記錄取代)
    for (const level of chapter.levels) {
      const ov = overrides.get(level.id);
      const shown = ov ? { ...ov.data } : level;
      const editBtn = makeBtn("編輯", () => openEditor({ mode: "builtin", level, row: ov ?? null }));
      if (locked) {
        editBtn.disabled = true;
        editBtn.title = "需要先在 Supabase 執行 migration-override.sql";
      }
      const actions = [editBtn];

      if (ov) {
        actions.push(
          makeBtn("還原內建版", async () => {
            if (!confirm(`「${level.title}」要還原成原本的內建題目嗎?你的修改會被丟棄。`)) return;
            await cloud.adminDeleteLevel(ov.id);
            await refreshAll();
          })
        );
      }

      addRow(
        `<td class="num">第 ${level.label} 關</td>
         <td>${shown.planet ?? ""} ${escapeHtml(shown.title ?? "")}</td>
         <td class="num">${shown.xp ?? "—"}</td>
         <td class="${ov ? "tag-modified" : "tag-builtin"}">${ov ? "✎ 已修改" : "內建"}</td>
         <td></td>`,
        actions
      );
    }

    // 這一章底下老師新增的題目
    for (const row of additions.filter((r) => r.chapter_num === chapter.num)) {
      addRow(
        `<td class="num">第 ${chapter.num} 章 · 新增</td>
         <td>${row.data?.planet ?? ""} ${escapeHtml(row.data?.title ?? "(無標題)")}</td>
         <td class="num">${row.data?.xp ?? "—"}</td>
         <td class="${row.published ? "tag-published" : "tag-draft"}">${row.published ? "● 已發布" : "○ 草稿"}</td>
         <td></td>`,
        [
          makeBtn("編輯", () => openEditor({ mode: "custom", row })),
          makeBtn(row.published ? "下架" : "發布", async () => {
            await cloud.adminUpdateLevel(row.id, { published: !row.published });
            await refreshAll();
          }),
          makeBtn("刪除", async () => {
            const title = row.data?.title ?? "這題";
            if (!confirm(`確定要永久刪除「${title}」嗎?學生已完成的紀錄不會被清除,但這關會從課程中消失。`)) return;
            await cloud.adminDeleteLevel(row.id);
            await refreshAll();
          }),
        ]
      );
    }
  }

  // 不屬於任何內建章節的新增題目(特別任務星系)
  const knownNums = new Set(DEFAULT_COURSE.chapters.map((c) => c.num));
  const orphans = additions.filter((r) => !knownNums.has(r.chapter_num));
  if (orphans.length > 0 && (filter === "all" || filter === "10")) {
    for (const row of orphans) {
      addRow(
        `<td class="num">特別任務</td>
         <td>${row.data?.planet ?? ""} ${escapeHtml(row.data?.title ?? "(無標題)")}</td>
         <td class="num">${row.data?.xp ?? "—"}</td>
         <td class="${row.published ? "tag-published" : "tag-draft"}">${row.published ? "● 已發布" : "○ 草稿"}</td>
         <td></td>`,
        [
          makeBtn("編輯", () => openEditor({ mode: "custom", row })),
          makeBtn(row.published ? "下架" : "發布", async () => {
            await cloud.adminUpdateLevel(row.id, { published: !row.published });
            await refreshAll();
          }),
          makeBtn("刪除", async () => {
            if (!confirm("確定要永久刪除這題嗎?")) return;
            await cloud.adminDeleteLevel(row.id);
            await refreshAll();
          }),
        ]
      );
    }
  }

  if (tbody.children.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">這個章節沒有題目</td></tr>';
  }
}

function openEditor(ctx = { mode: "new" }) {
  editing = ctx;
  el("editor-error").textContent = "";

  // 決定表單要填入的內容:內建題若已被改過,顯示改過的版本
  let d = {};
  let chapterNum = CHAPTER_OPTIONS[0].num;
  let position = 999;

  if (ctx.mode === "builtin") {
    d = ctx.row ? ctx.row.data : ctx.level;
    chapterNum = ctx.level.label.split("-")[0];
    el("editor-title").textContent = `編輯內建題目 — 第 ${ctx.level.label} 關`;
  } else if (ctx.mode === "custom") {
    d = ctx.row.data ?? {};
    chapterNum = ctx.row.chapter_num;
    position = ctx.row.position ?? 999;
    el("editor-title").textContent = "編輯題目";
  } else {
    el("editor-title").textContent = "新增題目";
  }

  // 內建題是「就地取代」,章節與排序由原本的位置決定,不讓老師改
  const isBuiltin = ctx.mode === "builtin";
  el("row-chapter").classList.toggle("is-hidden", isBuiltin);
  el("row-position").classList.toggle("is-hidden", isBuiltin);
  el("builtin-note").classList.toggle("is-hidden", !isBuiltin);

  el("f-chapter").value = String(chapterNum);
  el("f-position").value = position;
  el("f-planet").value = d.planet ?? "🪐";
  el("f-title").value = d.title ?? "";
  el("f-topic").value = d.topic ?? "";
  el("f-xp").value = d.xp ?? 50;
  el("f-story").value = d.story ?? "";
  el("f-instructions").value = (d.instructions ?? []).join("\n");
  el("f-starter").value = d.starter ?? "";
  el("f-hint").value = d.hint ?? "";
  el("f-stdin").value = (d.stdin ?? []).join("\n");
  el("f-tests").value = d.tests ? JSON.stringify(d.tests, null, 2) : "";

  el("level-editor").classList.remove("is-hidden");
  el("level-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  editing = null;
  el("level-editor").classList.add("is-hidden");
  el("level-form").reset();
}

async function saveLevel(e) {
  e.preventDefault();
  const errorEl = el("editor-error");
  errorEl.textContent = "";

  let tests;
  try {
    tests = JSON.parse(el("f-tests").value);
  } catch (err) {
    errorEl.textContent = `測試不是有效的 JSON:${err.message}`;
    return;
  }
  if (!Array.isArray(tests) || tests.length === 0) {
    errorEl.textContent = "測試必須是至少含一個項目的陣列";
    return;
  }
  const bad = tests.find((t) => typeof t?.name !== "string" || typeof t?.code !== "string");
  if (bad) {
    errorEl.textContent = "每個測試都要有 name 和 code 兩個字串欄位";
    return;
  }

  const instructions = el("f-instructions").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (instructions.length === 0) {
    errorEl.textContent = "任務目標至少要寫一條";
    return;
  }

  const stdin = el("f-stdin").value.split("\n").filter((s) => s !== "");

  const data = {
    planet: el("f-planet").value.trim(),
    title: el("f-title").value.trim(),
    topic: el("f-topic").value.trim(),
    story: el("f-story").value.trim(),
    instructions,
    starter: el("f-starter").value,
    hint: el("f-hint").value.trim(),
    xp: Number(el("f-xp").value),
    tests,
  };
  if (stdin.length > 0) data.stdin = stdin;

  const btn = el("btn-save-level");
  btn.disabled = true;
  btn.textContent = "儲存中…";
  try {
    if (editing.mode === "builtin") {
      // 覆寫內建題:已經改過就更新那筆,否則新建一筆覆寫記錄
      if (editing.row) {
        await cloud.adminUpdateLevel(editing.row.id, { data, published: true });
      } else {
        await cloud.adminInsertLevel({
          chapter_num: Number(editing.level.label.split("-")[0]),
          position: 0,
          data,
          override_id: editing.level.id,
          published: true,
        });
      }
    } else {
      const payload = {
        chapter_num: Number(el("f-chapter").value),
        position: Number(el("f-position").value) || 999,
        data,
      };
      if (editing.mode === "custom") {
        await cloud.adminUpdateLevel(editing.row.id, payload);
      } else {
        await cloud.adminInsertLevel({ ...payload, published: true });
      }
    }
    closeEditor();
    await refreshAll();
  } catch (err) {
    errorEl.textContent = `儲存失敗:${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "儲存題目";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

boot();
