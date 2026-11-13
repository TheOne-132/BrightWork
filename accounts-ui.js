(function () {
  "use strict";
  const workspace = BrightworkWorkspace;
  const byId = (id) => document.getElementById(id);
  const dialog = byId("auth-dialog");
  const form = byId("auth-form");
  const email = byId("auth-email");
  const password = byId("auth-password");
  const message = byId("auth-message");
  const submit = byId("auth-submit");
  const redirect = new URL(location.href);
  redirect.search = ""; redirect.hash = "";
  const client = location.protocol === "file:" ? null : BrightworkAccounts.createAccountClient(BRIGHTWORK_CONFIG, globalThis.supabase, redirect.href);
  let mode = "sign-in";
  let busy = false;
  let user = null;
  let engine = null;
  let booting = true;
  const modes = {
    "sign-in": ["Welcome back.", "Sign in to your personal study space.", "Sign in"],
    "sign-up": ["A little space of your own.", "Create an account to keep your study activity across devices.", "Create account"],
    reset: ["Let's get you back in.", "We'll email you a link to choose a new password.", "Send reset link"],
    update: ["Choose a new password.", "Your study history stays right where you left it.", "Save new password"]
  };

  function renderMode(nextMode) {
    mode = nextMode;
    const [heading, description, action] = modes[mode];
    byId("auth-heading").textContent = heading;
    byId("auth-description").textContent = description;
    byId("auth-email-field").hidden = mode === "update";
    byId("auth-password-field").hidden = mode === "reset";
    byId("auth-modes").hidden = mode === "update";
    email.required = mode !== "update";
    password.required = mode !== "reset";
    password.minLength = mode === "sign-in" ? 1 : 8;
    password.autocomplete = mode === "sign-in" ? "current-password" : "new-password";
    password.value = "";
    byId("password-hint").hidden = !["sign-up", "update"].includes(mode);
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.authMode === mode));
      button.classList.toggle("active", button.dataset.authMode === mode);
      button.disabled = busy;
    });
    submit.textContent = busy ? "Please wait…" : action;
    submit.disabled = busy || !client;
    message.textContent = client ? "" : "Cloud accounts aren't available yet. Your work still saves on this device.";
  }

  function openAuth(nextMode) {
    renderMode(nextMode);
    if (!dialog.open) dialog.showModal();
    (mode === "update" ? password : email).focus();
  }

  function showSyncStatus(state) {
    if (!user) return;
    const descriptions = {
      syncing: "Saving your activity…",
      pending: "Changes saved on this device. Waiting to sync.",
      editing: "Cloud updates will appear after you save or cancel your edit.",
      saved: "Saved to your account.",
      recovered: "Saved. Conflicting edits were kept as recovered tasks so you can review them.",
      offline: navigator.onLine ? "Cloud saving is unavailable. Your changes stay on this device; try syncing again." : "You're offline. Your changes will sync when you reconnect.",
      "storage-error": "This browser couldn't keep a local copy. Export a backup before leaving."
    };
    byId("cloud-status").textContent = descriptions[state] || descriptions.pending;
  }

  function transferVisibility() {
    let show = false;
    try {
      const guest = workspace.guestSnapshot();
      show = Boolean(user && !localStorage.getItem("brightwork:guest-owner") && !localStorage.getItem(`brightwork:skip-guest:${user.id}`) &&
        (guest.tasks.length || guest.stats.studyDays.length || guest.stats.sessions.length));
    } catch {}
    byId("guest-transfer").hidden = !show;
  }

  function renderAccount() {
    byId("account-heading").textContent = user ? "Your personal study space." : "Take your progress with you.";
    byId("account-description").textContent = user ? user.email || "Signed in" : "Create an account to keep your tasks and study history together across devices.";
    byId("open-sign-in").hidden = Boolean(user);
    byId("open-sign-up").hidden = Boolean(user);
    byId("sign-out").hidden = !user;
    byId("sync-now").hidden = !user;
    if (!user) byId("cloud-status").textContent = client ? "Saved on this device. Sign in to save to your account." : "Cloud accounts are being connected. Your work saves on this device for now.";
    transferVisibility();
  }

  function changeUser(session) {
    const nextUser = session?.user || null;
    if (!booting && nextUser?.id === user?.id) return;
    booting = false;
    engine?.stop(); engine = null;
    user = nextUser;
    const local = workspace.switchAccount(user?.id);
    renderAccount();
    if (!user) return;
    const owner = user.id;
    engine = new BrightworkSync.SyncEngine({
      local, cache: workspace.cache(), transport: client.transport(owner),
      persist: (cache) => { if (user?.id === owner) workspace.saveCache(cache); },
      apply: (snapshot) => { if (user?.id === owner) workspace.apply(snapshot); },
      status: (state) => { if (user?.id === owner) showSyncStatus(state); }
    });
    engine.sync();
  }

  workspace.onChange((snapshot) => engine?.queue(snapshot));
  workspace.onReset(() => { engine?.stop(); engine = null; user = null; workspace.switchAccount(null); renderAccount(); });
  byId("open-sign-in").addEventListener("click", () => openAuth("sign-in"));
  byId("open-sign-up").addEventListener("click", () => openAuth("sign-up"));
  byId("close-auth").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { password.value = ""; message.textContent = ""; });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => renderMode(button.dataset.authMode)));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client || busy) return;
    const action = mode;
    const address = email.value.trim();
    const secret = password.value;
    busy = true; submit.disabled = true; submit.textContent = "Please wait…"; message.textContent = "";
    document.querySelectorAll("[data-auth-mode]").forEach((button) => { button.disabled = true; });
    try {
      if (action === "sign-in") {
        const data = await client.signIn(address, secret);
        changeUser(data.session); dialog.close();
      } else if (action === "sign-up") {
        const data = await client.signUp(address, secret);
        if (data.session) { changeUser(data.session); dialog.close(); }
        else message.textContent = "Check your email to confirm your account, then return here to sign in. Open the link in this browser.";
      } else if (action === "reset") {
        await client.resetPassword(address);
        message.textContent = "If an account uses that email, a reset link is on its way. Open it in this browser.";
      } else {
        await client.updatePassword(secret);
        message.textContent = "Your password has been updated. You can close this window and continue studying.";
      }
    } catch (error) {
      const errors = { invalid_credentials: "That email and password didn't match. Please try again.", email_not_confirmed: "Confirm your email before signing in.", weak_password: "Choose a stronger password with at least 8 characters.", over_email_send_rate_limit: "Please wait a little before requesting another email." };
      message.textContent = errors[error.code] || "We couldn't complete that request. Check your connection and try again.";
    } finally {
      busy = false; password.value = ""; submit.disabled = !client; submit.textContent = modes[mode][2];
      document.querySelectorAll("[data-auth-mode]").forEach((button) => { button.disabled = false; });
    }
  });

  byId("sync-now").addEventListener("click", () => engine?.sync());
  byId("sign-out").addEventListener("click", async () => {
    if (!client) return;
    byId("sign-out").disabled = true;
    try { await engine?.sync(); await client.signOut(); changeUser(null); }
    catch { byId("cloud-status").textContent = "We couldn't sign out. Check your connection and try again."; }
    finally { byId("sign-out").disabled = false; }
  });
  byId("transfer-guest").addEventListener("click", () => {
    if (!user || !engine) return;
    if (document.querySelector("#task-list .edit-form")) { showSyncStatus("editing"); return; }
    try {
      const merged = BrightworkSync.mergeSnapshots({}, workspace.snapshot(), workspace.guestSnapshot()).snapshot;
      workspace.apply(merged); engine.queue(merged);
      localStorage.setItem("brightwork:guest-owner", user.id);
      transferVisibility();
    } catch { showSyncStatus("storage-error"); }
  });
  byId("dismiss-transfer").addEventListener("click", () => {
    if (!user) return;
    try { localStorage.setItem(`brightwork:skip-guest:${user.id}`, "true"); } catch {}
    byId("guest-transfer").hidden = true;
  });
  const refresh = () => { if (user && !document.hidden) engine?.sync(); };
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 30000);

  renderAccount();
  if (client) {
    client.watch((event, session) => { changeUser(session); if (event === "PASSWORD_RECOVERY") openAuth("update"); });
    client.session().then((session) => { if (booting) changeUser(session); }).catch(() => { byId("cloud-status").textContent = "We couldn't check your account. Your local activity is still here; try signing in again."; });
  }
})();
