// 課程總表:匯集內建章節,並可合併老師在後台新增的自訂題目
// 測試碼可使用:output(stdout 全文)、ns(使用者命名空間)、src(使用者原始碼)
// 關卡可加 stdin: ["..."] 提供 input() 的模擬輸入

import { CH2 } from "./levels/ch02.js";
import { CH3 } from "./levels/ch03.js";
import { CH4 } from "./levels/ch04.js";
import { CH5 } from "./levels/ch05.js";
import { CH6 } from "./levels/ch06.js";
import { CH7 } from "./levels/ch07.js";
import { CH8 } from "./levels/ch08.js";
import { CH9 } from "./levels/ch09.js";

const RAW_CHAPTERS = [CH2, CH3, CH4, CH5, CH6, CH7, CH8, CH9];

const RANK_TITLES = [
  [0, "見習飛行員"],
  [0.08, "初階領航員"],
  [0.18, "太空技師"],
  [0.3, "星際工程師"],
  [0.45, "資深探險家"],
  [0.62, "艦隊指揮官"],
  [0.8, "星系艦隊上將"],
  [0.97, "銀河傳奇"],
];

/**
 * 建立完整課程。customRows 是 Supabase custom_levels 的資料列:
 * [{ id, chapter_num, position, data: {planet,title,topic,story,instructions,starter,hint,xp,stdin?,tests} }]
 * 自訂題目會依 chapter_num 附加到對應章節之後;找不到章節的放進「特別任務星系」。
 */
export function buildCourse(customRows = []) {
  const knownNums = new Set(RAW_CHAPTERS.map((c) => c.num));
  const byChapter = new Map();
  const orphans = [];

  for (const row of customRows) {
    const level = { ...row.data, id: `custom-${row.id}` };
    if (!level.title || !Array.isArray(level.tests)) continue; // 略過格式不完整的資料
    if (knownNums.has(row.chapter_num)) {
      if (!byChapter.has(row.chapter_num)) byChapter.set(row.chapter_num, []);
      byChapter.get(row.chapter_num).push({ level, position: row.position ?? 999 });
    } else {
      orphans.push({ level, position: row.position ?? 999 });
    }
  }

  const sortByPos = (list) => [...list].sort((a, b) => a.position - b.position).map((x) => x.level);

  const chapters = RAW_CHAPTERS.map((ch) => ({
    ...ch,
    levels: [...ch.levels, ...sortByPos(byChapter.get(ch.num) ?? [])],
  }));

  if (orphans.length > 0) {
    chapters.push({
      num: 10,
      emoji: "🧪",
      title: "特別任務星系",
      subtitle: "老師出的特別挑戰",
      levels: sortByPos(orphans),
    });
  }

  const labeled = chapters.map((ch) => ({
    ...ch,
    levels: ch.levels.map((lv, i) => ({ ...lv, label: `${ch.num}-${i + 1}` })),
  }));

  const challenges = labeled.flatMap((ch) => ch.levels);
  const maxXp = challenges.reduce((sum, c) => sum + c.xp, 0);
  const ranks = RANK_TITLES.map(([ratio, title]) => ({
    minXp: Math.round(maxXp * ratio),
    title,
  }));

  return { chapters: labeled, challenges, maxXp, ranks };
}

// 內建課程(訪客模式 / 尚未載入自訂題目時的預設)
export const DEFAULT_COURSE = buildCourse();
export const CHAPTER_OPTIONS = RAW_CHAPTERS.map((c) => ({
  num: c.num,
  title: c.title,
}));
