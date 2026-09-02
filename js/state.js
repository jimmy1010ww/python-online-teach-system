// 玩家進度狀態:localStorage 持久化(不可變更新)+ 雲端進度合併

import { DEFAULT_COURSE } from "./challenges.js";

const STORAGE_KEY = "pyquest-progress-v1";
const MAX_STARS = 3;
const FREE_ATTEMPTS = 3; // 超過這個次數才通關會扣一顆星

const EMPTY = Object.freeze({
  xp: 0,
  completed: {},
  usedHints: {},
  attempts: {},
});

let course = DEFAULT_COURSE;
let current = load();

/** 設定目前課程(含自訂題目合併後的版本) */
export function setCourse(next) {
  course = next;
}

export function getCourse() {
  return course;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      xp: Number(parsed.xp) || 0,
      completed: parsed.completed ?? {},
      usedHints: parsed.usedHints ?? {},
      attempts: parsed.attempts ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

function persist(next) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 私密瀏覽等情況存不進去,遊戲仍可玩,只是不記進度
  }
}

export function getState() {
  return current;
}

export function isCompleted(levelId) {
  return Boolean(current.completed[levelId]);
}

export function isUnlocked(index) {
  if (index === 0) return true;
  return isCompleted(course.challenges[index - 1].id);
}

export function getStars(levelId) {
  return current.completed[levelId]?.stars ?? 0;
}

export function totalStars() {
  return Object.values(current.completed).reduce((sum, c) => sum + (c.stars || 0), 0);
}

export function rankFor(xp) {
  return [...course.ranks].reverse().find((r) => xp >= r.minXp)?.title ?? course.ranks[0].title;
}

export function recordAttempt(levelId) {
  persist({
    ...current,
    attempts: { ...current.attempts, [levelId]: (current.attempts[levelId] ?? 0) + 1 },
  });
}

export function recordHint(levelId) {
  persist({
    ...current,
    usedHints: { ...current.usedHints, [levelId]: true },
  });
}

/**
 * 通關結算。回傳 {stars, gainedXp, firstClear}。
 * 星星規則:滿分 3 顆;用過提示 -1;嘗試超過 FREE_ATTEMPTS 次 -1;至少 1 顆。
 */
export function recordClear(level) {
  const firstClear = !isCompleted(level.id);
  let stars = MAX_STARS;
  if (current.usedHints[level.id]) stars -= 1;
  if ((current.attempts[level.id] ?? 0) > FREE_ATTEMPTS) stars -= 1;
  stars = Math.max(1, stars);

  const prevStars = getStars(level.id);
  const bestStars = Math.max(stars, prevStars);
  const gainedXp = firstClear ? level.xp : 0;

  persist({
    ...current,
    xp: current.xp + gainedXp,
    completed: { ...current.completed, [level.id]: { stars: bestStars } },
  });

  return { stars: bestStars, gainedXp, firstClear };
}

/* ── 雲端同步 ─────────────────────────────── */

/** 以課程定義計算某組 completed 的總 XP(避免重複累加造成漂移) */
function computeXp(completed) {
  return course.challenges.reduce(
    (sum, lv) => sum + (completed[lv.id] ? lv.xp : 0),
    0
  );
}

/**
 * 合併雲端進度(登入後呼叫)。
 * rows: [{level_id, stars}] — 取本機與雲端的星星最大值,XP 依課程重新計算。
 * 回傳需要回寫到雲端的差異列(本機比雲端好的部分)。
 */
export function mergeCloud(rows) {
  const cloudMap = Object.fromEntries(rows.map((r) => [r.level_id, r.stars]));
  const merged = { ...current.completed };
  for (const [levelId, stars] of Object.entries(cloudMap)) {
    const localStars = merged[levelId]?.stars ?? 0;
    merged[levelId] = { stars: Math.max(localStars, stars) };
  }

  persist({ ...current, completed: merged, xp: computeXp(merged) });

  const levelXp = Object.fromEntries(course.challenges.map((lv) => [lv.id, lv.xp]));
  return Object.entries(merged)
    .filter(([id, c]) => (cloudMap[id] ?? -1) < c.stars && levelXp[id] !== undefined)
    .map(([id, c]) => ({ level_id: id, stars: c.stars, xp: levelXp[id] }));
}
