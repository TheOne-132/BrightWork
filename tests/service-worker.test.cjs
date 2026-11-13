const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function worker(offline = false, storageFails = false) {
  const handlers = {};
  const entries = new Map();
  const removed = [];
  let cachedFiles = [];
  const cache = {
    addAll: async (files) => { cachedFiles = files; },
    match: async (request) => entries.get(typeof request === "string" ? request : request.url),
    put: async (request, response) => entries.set(request.url, response)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8"), {
    self: { addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {}, clients: { claim: async () => {} }, location: { origin: "https://brightwork.test" } },
    caches: { open: async () => { if (storageFails) throw new Error("storage unavailable"); return cache; }, keys: async () => ["brightwork-v4", "brightwork-v5", "another-app"], delete: async (key) => removed.push(key) },
    fetch: async () => { if (offline) throw new Error("offline"); return new Response("fresh"); },
    URL, Response
  });
  return { handlers, entries, removed, files: () => cachedFiles };
}

test("offline installation includes the exact script and style URLs used by HTML", async () => {
  const app = worker();
  await new Promise((resolve) => app.handlers.install({ waitUntil: (promise) => promise.then(resolve) }));
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^"#]*)?)"/g)].map((match) => "./" + match[1]);
  for (const asset of assets) assert.ok(app.files().includes(asset), `${asset} is precached`);
});

test("activation removes old Brightwork caches and preserves unrelated caches", async () => {
  const app = worker();
  await new Promise((resolve) => app.handlers.activate({ waitUntil: (promise) => promise.then(resolve) }));
  assert.deepEqual(app.removed, ["brightwork-v4"]);
});

test("offline requests return cached assets and navigations fall back to the app", async () => {
  const app = worker(true);
  app.entries.set("https://brightwork.test/script.js?v=5", new Response("cached script"));
  app.entries.set("./index.html", new Response("cached app"));
  let response;
  app.handlers.fetch({ request: { method: "GET", url: "https://brightwork.test/script.js?v=5", mode: "cors" }, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), "cached script");
  app.handlers.fetch({ request: { method: "GET", url: "https://brightwork.test/?offline", mode: "navigate" }, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), "cached app");
});

test("unavailable cache storage does not block online requests", async () => {
  const app = worker(false, true);
  let response;
  app.handlers.fetch({ request: { method: "GET", url: "https://brightwork.test/script.js?v=5", mode: "cors" }, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), "fresh");
});
