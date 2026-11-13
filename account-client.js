(function (root) {
  "use strict";

  function validConfiguration(config) {
    if (!config?.supabaseUrl || !config?.supabasePublishableKey) return false;
    let url;
    try { url = new URL(config.supabaseUrl); } catch { return false; }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return false;
    const key = config.supabasePublishableKey;
    if (key.startsWith("sb_publishable_")) return true;
    // Older projects expose an anon JWT. Reject privileged server credentials.
    try { return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; }
    catch { return false; }
  }

  function createAccountClient(config, sdk, redirectUrl) {
    if (!validConfiguration(config) || !sdk?.createClient) return null;
    const client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
    });
    async function result(promise) {
      const { data, error } = await promise;
      if (error) throw error;
      return data;
    }
    async function databaseResult(builder) {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 10000);
      try {
        // The app owns retrying pending work on reconnect. SDK backoff would
        // otherwise leave an offline user looking at a saving indicator.
        return await result(builder.abortSignal(controller.signal).retry(false));
      } finally { clearTimeout(deadline); }
    }
    return {
      session: async () => (await result(client.auth.getSession())).session,
      watch(callback) {
        // Supabase holds its auth lock while invoking listeners. Do subsequent
        // auth/database calls in a later task, outside that lock.
        return client.auth.onAuthStateChange((event, session) => setTimeout(() => callback(event, session), 0)).data.subscription;
      },
      signIn: (email, password) => result(client.auth.signInWithPassword({ email, password })),
      signUp: (email, password) => result(client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl } })),
      resetPassword: (email) => result(client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl })),
      updatePassword: (password) => result(client.auth.updateUser({ password })),
      signOut: () => result(client.auth.signOut({ scope: "local" })),
      transport(userId) {
        return {
          read: () => databaseResult(client.from("brightwork_workspaces").select("payload, revision").eq("user_id", userId).maybeSingle()),
          write: (payload, revision) => databaseResult(client.rpc("save_brightwork_workspace", { new_payload: payload, expected_revision: revision, expected_user_id: userId }))
        };
      }
    };
  }
  const api = { validConfiguration, createAccountClient };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BrightworkAccounts = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
