const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSnapshot: normal, mergeSnapshots: merge, SyncEngine } = require("../sync-core.js");
const task = (id, text = id) => ({ id, text });

test("a missing cloud workspace is normalized without losing local work", () => {
  assert.deepEqual(normal(null), normal({}));
  assert.equal(merge(null, { tasks: [task("local")] }, null).snapshot.tasks[0].id, "local");
});

test("independent offline additions on two devices both survive", () => {
  const result = merge({}, { tasks: [task("a")] }, { tasks: [task("b")] });
  assert.deepEqual(new Set(result.snapshot.tasks.map((t) => t.id)), new Set(["a", "b"]));
});
test("deletions sync without resurrecting unchanged remote tasks", () => {
  const base = { tasks: [task("a"), task("b")] };
  assert.deepEqual(merge(base, { tasks: [task("b")] }, base).snapshot.tasks.map((t) => t.id), ["b"]);
  assert.deepEqual(merge(base, base, { tasks: [task("b")] }).snapshot.tasks.map((t) => t.id), ["b"]);
});
test("edits to separate fields merge on one task", () => {
  const base = normal({ tasks: [task("a")] });
  const local = normal({ tasks: [{ ...base.tasks[0], text: "New title" }] });
  const remote = normal({ tasks: [{ ...base.tasks[0], priority: "high" }] });
  const result = merge(base, local, remote);
  assert.equal(result.conflicts, 0);
  assert.equal(result.snapshot.tasks[0].text, "New title");
  assert.equal(result.snapshot.tasks[0].priority, "high");
});
test("conflicting titles preserve both versions with a stable recovered id", () => {
  const base = { tasks: [task("a")] };
  const local = { tasks: [task("a", "Local title")] };
  const remote = { tasks: [task("a", "Remote title")] };
  const result = merge(base, local, remote);
  assert.equal(result.conflicts, 1);
  assert.equal(result.snapshot.tasks.length, 2);
  assert.ok(result.snapshot.tasks.some((t) => t.text === "Local title"));
  assert.ok(result.snapshot.tasks.some((t) => t.text.includes("Remote title")));
  assert.deepEqual(merge(base, local, remote), result);
});
test("a concurrent deletion cannot silently erase an edited task", () => {
  const result = merge({ tasks: [task("a")] }, {}, { tasks: [task("a", "New work")] });
  assert.equal(result.snapshot.tasks[0].text, "New work");
  assert.equal(result.conflicts, 1);
});
test("sprint histories deduplicate ids and preserve legacy sprint totals", () => {
  const session = { id: "s1", durationSeconds: 300, finishedAt: "2026-11-13T12:00:00Z" };
  const base = { stats: { sprints: 8, sessions: [] } };
  const result = merge(base, { stats: { sprints: 9, sessions: [session] } }, { stats: { sprints: 9, sessions: [session] } });
  assert.equal(result.snapshot.stats.sprints, 9);
  assert.equal(result.snapshot.stats.sessions.length, 1);
});
test("stale revisions retry against the latest remote snapshot", async () => {
  let writes = 0;
  let applied;
  const engine = new SyncEngine({
    local: { tasks: [task("local")] }, persist() {}, apply: (snapshot) => { applied = snapshot; }, status() {},
    transport: {
      read: async () => null,
      write: async (payload, revision) => {
        writes += 1;
        if (writes === 1) return { conflict: true, revision: 1, payload: normal({ tasks: [task("remote")] }) };
        assert.equal(revision, 1);
        return { conflict: false, revision: 2, payload };
      }
    }
  });
  await engine.sync(); engine.stop();
  assert.equal(writes, 2);
  assert.equal(applied.tasks.length, 2);
});
test("failed uploads retain a durable pending copy for the next login", async () => {
  let saved;
  let state;
  const engine = new SyncEngine({ local: { tasks: [task("offline")] }, persist: (cache) => { saved = cache; }, apply() { throw new Error("Must not replace local data"); }, status: (status) => { state = status; }, transport: { read: async () => { throw new Error("No network"); } } });
  await engine.sync(); engine.stop();
  assert.equal(state, "offline");
  assert.equal(saved.local.tasks[0].id, "offline");
});
test("an account switch ignores an old in-flight response", async () => {
  let finish;
  let applied = false;
  const engine = new SyncEngine({ local: {}, persist() {}, apply() { applied = true; }, status() {}, transport: { read: () => new Promise((resolve) => { finish = resolve; }) } });
  const syncing = engine.sync(); engine.stop();
  finish({ revision: 1, payload: normal({ tasks: [task("another-account")] }) });
  await syncing;
  assert.equal(applied, false);
});
test("edits made during an upload remain pending rather than being overwritten", async () => {
  let finish;
  let saved;
  const original = normal({ tasks: [task("a")] });
  const engine = new SyncEngine({ local: original, persist: (cache) => { saved = cache; }, apply() {}, status() {}, transport: { read: async () => null, write: (payload) => new Promise((resolve) => { finish = () => resolve({ revision: 1, payload }); }) } });
  const syncing = engine.sync();
  await new Promise((resolve) => setImmediate(resolve));
  engine.queue({ tasks: [task("a", "Edited while saving")] });
  finish(); await syncing; engine.stop();
  assert.equal(saved.local.tasks[0].text, "Edited while saving");
  assert.equal(saved.base.tasks[0].text, "a");
});
