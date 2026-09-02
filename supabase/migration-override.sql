-- 增修:讓老師也能在後台編輯「內建 52 題」
-- 執行方式:Supabase Dashboard → SQL Editor → 貼上執行(schema.sql 跑過之後再跑這個)
--
-- 原理:內建題目仍然放在程式碼裡當基準,不搬進資料庫。
-- 老師編輯某一題時,這裡會存一筆「覆寫」記錄,載入課程時取代掉原本那題。
-- 覆寫記錄的 override_id 指向內建關卡的 id(例如 'c2-var'),
-- 因為關卡 id 不變,學生已經通關的紀錄不會受影響;刪掉覆寫記錄即還原成原版。

alter table public.custom_levels
  add column if not exists override_id text;

-- 同一道內建題最多只會有一筆覆寫記錄
create unique index if not exists custom_levels_override_id_key
  on public.custom_levels (override_id)
  where override_id is not null;

comment on column public.custom_levels.override_id is
  '有值 = 覆寫該 id 的內建關卡;NULL = 這是老師新增的獨立題目';
