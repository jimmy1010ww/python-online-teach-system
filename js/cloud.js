// Supabase 雲端層:登入、進度同步、自訂題目
// 未設定 config.js 時所有函式安全降級(回傳 null / 空陣列),遊戲照常以訪客模式運作。

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let client = null;
let profile = null; // { display_name, role }
let cachedUser = null;

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** 初始化;onAuthChanged(user|null) 會在登入/登出時被呼叫。回傳目前的 user(或 null)。 */
export async function initCloud(onAuthChanged) {
  if (!isConfigured()) return null;
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  );
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  client.auth.onAuthStateChange((_event, session) => {
    profile = null;
    cachedUser = session?.user ?? null;
    if (onAuthChanged) onAuthChanged(cachedUser);
  });

  const { data } = await client.auth.getSession();
  cachedUser = data.session?.user ?? null;
  return cachedUser;
}

export async function refreshUser() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  cachedUser = data.session?.user ?? null;
  return cachedUser;
}

export async function signUp(email, password, displayName) {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(friendlyAuthError(error));
  return data.user;
}

export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error));
  return data.user;
}

export async function signOut() {
  await client?.auth.signOut();
}

function friendlyAuthError(error) {
  const msg = error.message || "";
  if (msg.includes("Invalid login credentials")) return "帳號或密碼錯誤";
  if (msg.includes("already registered")) return "這個信箱已經註冊過了";
  if (msg.includes("at least 6 characters")) return "密碼至少要 6 個字元";
  if (msg.includes("valid email")) return "信箱格式不正確";
  if (msg.includes("Email not confirmed")) return "信箱尚未驗證,請查收驗證信(或請老師到 Supabase 關閉信箱驗證)";
  return `發生錯誤:${msg}`;
}

/** 取得自己的 profile(含 role) */
export async function fetchProfile() {
  if (!client) return null;
  if (profile) return profile;
  const user = await refreshUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();
  if (error) return null;
  profile = data;
  return profile;
}

/** 讀取自己的雲端進度 */
export async function fetchProgress() {
  const user = await refreshUser();
  if (!user) return [];
  const { data, error } = await client
    .from("progress")
    .select("level_id, stars, xp")
    .eq("user_id", user.id);
  if (error) {
    console.warn("讀取雲端進度失敗:", error.message);
    return [];
  }
  return data;
}

/** 寫入(upsert)一批進度 rows: [{level_id, stars, xp}] */
export async function upsertProgress(rows) {
  const user = await refreshUser();
  if (!user || rows.length === 0) return;
  const payload = rows.map((r) => ({
    ...r,
    user_id: user.id,
    completed_at: new Date().toISOString(),
  }));
  const { error } = await client.from("progress").upsert(payload);
  if (error) console.warn("同步進度失敗:", error.message);
}

/** 讀取已發布的自訂題目 */
export async function fetchCustomLevels() {
  if (!client) return [];
  const { data, error } = await client
    .from("custom_levels")
    .select("id, chapter_num, position, data, published")
    .order("chapter_num")
    .order("position");
  if (error) {
    console.warn("讀取自訂題目失敗:", error.message);
    return [];
  }
  return data;
}

/* ── 後台(老師)專用 ───────────────────────── */

export async function adminFetchStudents() {
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, role, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function adminFetchAllProgress() {
  const { data, error } = await client
    .from("progress")
    .select("user_id, level_id, stars, xp, completed_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function adminInsertLevel(row) {
  const user = await refreshUser();
  const { error } = await client
    .from("custom_levels")
    .insert({ ...row, created_by: user?.id });
  if (error) throw new Error(error.message);
}

export async function adminUpdateLevel(id, patch) {
  const { error } = await client.from("custom_levels").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function adminDeleteLevel(id) {
  const { error } = await client.from("custom_levels").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
