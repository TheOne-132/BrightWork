(function (root) {
  "use strict";
  const KEYS = ["studyTasks", "studyStats", "focusDuration", "focusSession", "dailyFocusGoal", "studyTheme"];
  class WorkspaceStore {
    constructor(storage) { this.storage = storage; this.userId = null; }
    use(userId) { this.userId = userId || null; }
    key(key) { return this.userId ? `brightwork:user:${encodeURIComponent(this.userId)}:${key}` : key; }
    getItem(key) { return this.storage.getItem(this.key(key)); }
    setItem(key, value) { this.storage.setItem(this.key(key), value); }
    logicalKey(physicalKey) { return KEYS.find((key) => this.key(key) === physicalKey); }
    readCache() { try { return JSON.parse(this.getItem("sync")) || {}; } catch { return {}; } }
    saveCache(cache) { this.setItem("sync", JSON.stringify(cache)); }
  }
  const api = { WorkspaceStore, KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BrightworkStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
