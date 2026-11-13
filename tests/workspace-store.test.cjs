const test = require("node:test");
const assert = require("node:assert/strict");
const { WorkspaceStore } = require("../workspace-store.js");

function store() {
  const values = new Map();
  return new WorkspaceStore({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
}
test("guest and separate accounts never share task or timer storage", () => {
  const workspace = store();
  workspace.setItem("studyTasks", "guest");
  workspace.use("alice");
  assert.equal(workspace.getItem("studyTasks"), null);
  workspace.setItem("studyTasks", "alice tasks");
  workspace.setItem("focusSession", "alice sprint");
  workspace.use("bob");
  assert.equal(workspace.getItem("studyTasks"), null);
  assert.equal(workspace.getItem("focusSession"), null);
  workspace.use("alice");
  assert.equal(workspace.getItem("studyTasks"), "alice tasks");
  workspace.use(null);
  assert.equal(workspace.getItem("studyTasks"), "guest");
});
test("storage events from a different account cannot replace the active view", () => {
  const workspace = store();
  workspace.use("alice");
  assert.equal(workspace.logicalKey("brightwork:user:bob:studyTasks"), undefined);
  assert.equal(workspace.logicalKey("brightwork:user:alice:studyTasks"), "studyTasks");
  assert.equal(workspace.logicalKey("studyTasks"), undefined);
});
test("pending sync state survives sign-out and stays with its original account", () => {
  const workspace = store();
  workspace.use("alice");
  workspace.saveCache({ local: { tasks: ["pending"] }, base: {} });
  workspace.use("bob");
  assert.deepEqual(workspace.readCache(), {});
  workspace.use("alice");
  assert.deepEqual(workspace.readCache().local.tasks, ["pending"]);
});
