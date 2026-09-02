// 課程總表:匯集各章節的關卡
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

// 為每一關加上「章-節」編號(例如 2-3)
export const CHAPTERS = RAW_CHAPTERS.map((ch) => ({
  ...ch,
  levels: ch.levels.map((lv, i) => ({ ...lv, label: `${ch.num}-${i + 1}` })),
}));

export const CHALLENGES = CHAPTERS.flatMap((ch) => ch.levels);

export const MAX_XP = CHALLENGES.reduce((sum, c) => sum + c.xp, 0);

// 階級門檻以總經驗值比例計算,關卡增減時自動調整
export const RANKS = [
  { minXp: 0, title: "見習飛行員" },
  { minXp: Math.round(MAX_XP * 0.08), title: "初階領航員" },
  { minXp: Math.round(MAX_XP * 0.18), title: "太空技師" },
  { minXp: Math.round(MAX_XP * 0.3), title: "星際工程師" },
  { minXp: Math.round(MAX_XP * 0.45), title: "資深探險家" },
  { minXp: Math.round(MAX_XP * 0.62), title: "艦隊指揮官" },
  { minXp: Math.round(MAX_XP * 0.8), title: "星系艦隊上將" },
  { minXp: Math.round(MAX_XP * 0.97), title: "銀河傳奇" },
];
