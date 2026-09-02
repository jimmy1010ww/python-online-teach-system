// 玩家進度狀態:localStorage 持久化(不可變更新)

import { CHALLENGES, RANKS } from "./challenges.js";

const STORAGE_KEY = "pyquest-progress-v1";
const MAX_STARS = 3;
const FREE_ATTEMPTS = 3; // 超過這個次數才通關會扣一顆星

const EMPTY = Object.freeze({
  xp: 0,
  completed: {},
  usedHints: {},
  attempts: {},
});

let current = load();

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
  return isCompleted(CHALLENGES[index - 1].id);
}

export function getStars(levelId) {
  return current.completed[levelId]?.stars ?? 0;
}

export function totalStars() {
  return Object.values(current.completed).reduce((sum, c) => sum + (c.stars || 0), 0);
}

export function rankFor(xp) {
  return [...RANKS].reverse().find((r) => xp >= r.minXp)?.title ?? RANKS[0].title;
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
