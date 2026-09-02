// 教師後台:學生進度總覽 + 自訂題目管理
// 權限由 Supabase RLS 把關(is_teacher()),這裡的檢查只是為了介面提示。

import * as cloud from "./cloud.js";
import { DEFAULT_COURSE, CHAPTER_OPTIONS } from "./challenges.js";

const el = (id) => document.getElementById(id);

let students = [];
let progressRows = [];
let customLevels = [];
let editingId = null; // null = 新增模式

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
  el("btn-new-level").addEventListener("click", () => openEditor(null));
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
  const select = el("f-chapter");
  select.innerHTML = CHAPTER_OPTIONS.map(
    (c) => `<option value="${c.num}">第 ${c.num} 章 — ${escapeHtml(c.title)}</option>`
  ).join("") + '<option value="10">特別任務星系(獨立章節)</option>';
}

function renderLevels() {
  el("levels-summary").textContent = `自訂題目 ${customLevels.length} 題`;
  const tbody = el("levels-table").querySelector("tbody");
  tbody.innerHTML = "";

  for (const row of customLevels) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="num">第 ${row.chapter_num} 章</td>
      <td>${row.data?.planet ?? ""} ${escapeHtml(row.data?.title ?? "(無標題)")}</td>
      <td class="num">${row.data?.xp ?? "—"}</td>
      <td class="${row.published ? "tag-published" : "tag-draft"}">
        ${row.published ? "● 已發布" : "○ 草稿"}
      </td>
      <td></td>
    `;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-ghost";
    editBtn.textContent = "編輯";
    editBtn.addEventListener("click", () => openEditor(row));

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-ghost";
    toggleBtn.textContent = row.published ? "下架" : "發布";
    toggleBtn.addEventListener("click", async () => {
      await cloud.adminUpdateLevel(row.id, { published: !row.published });
      await refreshAll();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-ghost";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", async () => {
      const title = row.data?.title ?? "這題";
      if (!confirm(`確定要永久刪除「${title}」嗎?學生已完成的紀錄不會被清除,但這關會從課程中消失。`)) return;
      await cloud.adminDeleteLevel(row.id);
      await refreshAll();
    });

    actions.append(editBtn, toggleBtn, delBtn);
    tr.lastElementChild.appendChild(actions);
    tbody.appendChild(tr);
  }

  if (customLevels.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">還沒有自訂題目,按右上角「+ 新增題目」開始出題</td></tr>';
  }
}

function openEditor(row) {
  editingId = row?.id ?? null;
  el("editor-title").textContent = row ? "編輯題目" : "新增題目";
  el("editor-error").textContent = "";

  const d = row?.data ?? {};
  el("f-chapter").value = String(row?.chapter_num ?? CHAPTER_OPTIONS[0].num);
  el("f-position").value = row?.position ?? 999;
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
  editingId = null;
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

  const payload = {
    chapter_num: Number(el("f-chapter").value),
    position: Number(el("f-position").value) || 999,
    data,
  };

  const btn = el("btn-save-level");
  btn.disabled = true;
  btn.textContent = "儲存中…";
  try {
    if (editingId) {
      await cloud.adminUpdateLevel(editingId, payload);
    } else {
      await cloud.adminInsertLevel({ ...payload, published: true });
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
