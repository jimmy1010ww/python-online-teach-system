// 登入/註冊 UI:頁首按鈕 + 彈窗
// 依賴 index.html 的 #auth-modal 標記與 cloud.js

import * as cloud from "./cloud.js";

const el = (id) => document.getElementById(id);

let mode = "signin"; // signin | signup

export function initAuthUI() {
  if (!cloud.isConfigured()) {
    el("btn-auth").classList.add("is-hidden");
    return;
  }

  el("btn-auth").addEventListener("click", () => openModal("signin"));
  el("btn-logout").addEventListener("click", async () => {
    await cloud.signOut();
  });
  el("auth-close").addEventListener("click", closeModal);
  el("auth-modal").addEventListener("click", (e) => {
    if (e.target === el("auth-modal")) closeModal();
  });
  el("tab-signin").addEventListener("click", () => switchMode("signin"));
  el("tab-signup").addEventListener("click", () => switchMode("signup"));
  el("auth-form").addEventListener("submit", handleSubmit);
}

/** 更新頁首的登入狀態顯示 */
export function renderAuthState(user, profile) {
  const loggedIn = Boolean(user);
  el("btn-auth").classList.toggle("is-hidden", loggedIn || !cloud.isConfigured());
  el("user-chip").classList.toggle("is-hidden", !loggedIn);
  if (loggedIn) {
    const name = profile?.display_name || user.email;
    el("user-name").textContent = `👨‍🚀 ${name}`;
    el("admin-link").classList.toggle("is-hidden", profile?.role !== "teacher");
  }
}

function openModal(next) {
  switchMode(next);
  el("auth-error").textContent = "";
  el("auth-modal").classList.remove("is-hidden");
  el("auth-email").focus();
}

export function closeModal() {
  el("auth-modal").classList.add("is-hidden");
}

function switchMode(next) {
  mode = next;
  el("tab-signin").classList.toggle("is-active", mode === "signin");
  el("tab-signup").classList.toggle("is-active", mode === "signup");
  el("auth-name-row").classList.toggle("is-hidden", mode === "signin");
  el("auth-submit").textContent = mode === "signin" ? "登入" : "註冊";
  el("auth-error").textContent = "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const email = el("auth-email").value.trim();
  const password = el("auth-password").value;
  const name = el("auth-name").value.trim();
  const btn = el("auth-submit");
  el("auth-error").textContent = "";

  if (mode === "signup" && !name) {
    el("auth-error").textContent = "請輸入暱稱(老師和排行榜會看到這個名字)";
    return;
  }

  btn.disabled = true;
  btn.textContent = "處理中…";
  try {
    if (mode === "signin") {
      await cloud.signIn(email, password);
    } else {
      await cloud.signUp(email, password, name);
    }
    closeModal();
  } catch (err) {
    el("auth-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = mode === "signin" ? "登入" : "註冊";
  }
}
