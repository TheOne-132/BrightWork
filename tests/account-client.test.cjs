const test = require("node:test");
const assert = require("node:assert/strict");
const { validConfiguration, createAccountClient } = require("../account-client.js");
const config = { supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_public-test-key" };

test("configuration accepts public keys and rejects privileged keys and insecure URLs", () => {
  assert.equal(validConfiguration(config), true);
  assert.equal(validConfiguration({ ...config, supabasePublishableKey: "sb_secret_do-not-use" }), false);
  assert.equal(validConfiguration({ ...config, supabaseUrl: "http://project.supabase.co" }), false);
  const jwt = (role) => `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.equal(validConfiguration({ ...config, supabasePublishableKey: jwt("anon") }), true);
  assert.equal(validConfiguration({ ...config, supabasePublishableKey: jwt("service_role") }), false);
  assert.equal(createAccountClient({}, {}), null);
});

test("authentication delegates passwords to the official client and uses safe session options", async () => {
  const calls = [];
  const client = createAccountClient(config, { createClient: (url, key, options) => {
    assert.equal(options.auth.flowType, "pkce");
    return { auth: {
      signUp: async (credentials) => { calls.push(credentials); return { data: { session: null } }; },
      signOut: async (options) => { calls.push(options); return { data: {} }; }
    } };
  } }, "https://brightwork.test/");
  await client.signUp("student@example.test", "a-private-password");
  await client.signOut();
  assert.equal(calls[0].options.emailRedirectTo, "https://brightwork.test/");
  assert.deepEqual(calls[1], { scope: "local" });
});

test("cloud reads filter the account and writes use an atomic revision RPC", async () => {
  const calls = [];
  const builder = (data) => ({ abortSignal(signal) { assert.equal(signal.aborted, false); return this; }, retry(enabled) { assert.equal(enabled, false); return Promise.resolve({ data }); } });
  const client = createAccountClient(config, { createClient: () => ({
    from: (table) => ({ select: () => ({ eq: (column, id) => ({ maybeSingle: () => { calls.push({ table, column, id }); return builder(null); } }) }) }),
    rpc: (name, args) => { calls.push({ name, args }); return builder({ revision: 2, payload: args.new_payload }); }
  }) });
  await client.transport("account-a").read();
  await client.transport("account-a").write({ tasks: [] }, 1);
  assert.deepEqual(calls[0], { table: "brightwork_workspaces", column: "user_id", id: "account-a" });
  assert.equal(calls[1].name, "save_brightwork_workspace");
  assert.deepEqual(calls[1].args, { new_payload: { tasks: [] }, expected_revision: 1 });
});

test("provider failures are surfaced instead of reporting a successful save", async () => {
  const client = createAccountClient(config, { createClient: () => ({ auth: { signInWithPassword: async () => ({ error: new Error("Invalid login credentials") }) } }) });
  await assert.rejects(client.signIn("a@example.test", "bad"), /Invalid login/);
});
