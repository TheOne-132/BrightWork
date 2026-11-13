(function (root) {
  "use strict";
  const Core = typeof module !== "undefined" && module.exports ? require("./study-core.js") : root.BrightworkCore;
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function normalizeSnapshot(raw = {}) {
    raw = raw && typeof raw === "object" ? raw : {};
    const seen = new Set();
    const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).filter((task) => {
      if (!task || typeof task.id !== "string" || !task.text || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }).map((task) => ({
      id: task.id, text: String(task.text).trim().slice(0, 120), completed: Boolean(task.completed),
      dueDate: String(task.dueDate || ""), priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
      category: String(task.category || "").slice(0, 30), completedAt: String(task.completedAt || "")
    }));
    const preferences = raw.preferences || {};
    return {
      version: 3, tasks, stats: Core.normalizeStats(raw.stats), preferences: {
        theme: preferences.theme === "dark" ? "dark" : "light",
        focusDuration: Core.FOCUS_MINUTES.includes(Number(preferences.focusDuration)) ? Number(preferences.focusDuration) : 25,
        dailyGoal: Core.GOAL_MINUTES.includes(Number(preferences.dailyGoal)) ? Number(preferences.dailyGoal) : 50
      }
    };
  }

  function conflictId(task) {
    let hash = 2166136261;
    for (const character of JSON.stringify(task)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return `${task.id}-recovered-${(hash >>> 0).toString(16)}`;
  }

  // Compare both devices with their last shared copy. Deletions are meaningful;
  // simultaneous edits to the same field keep a recovered copy instead of losing work.
  function mergeSnapshots(base, local, remote) {
    base = normalizeSnapshot(base); local = normalizeSnapshot(local); remote = normalizeSnapshot(remote);
    const maps = [base, local, remote].map((snapshot) => new Map(snapshot.tasks.map((task) => [task.id, task])));
    const ids = new Set([...maps[1].keys(), ...maps[2].keys(), ...maps[0].keys()]);
    const tasks = new Map();
    let conflicts = 0;
    for (const id of ids) {
      const [before, here, there] = maps.map((map) => map.get(id));
      let result;
      if (equal(here, before)) result = there;
      else if (equal(there, before) || equal(here, there)) result = here;
      else if (!here || !there) { result = here || there; conflicts += 1; }
      else {
        result = { ...here };
        let conflicting = false;
        for (const key of Object.keys(here).filter((key) => key !== "id")) {
          if (equal(here[key], before?.[key])) result[key] = there[key];
          else if (!equal(there[key], before?.[key]) && !equal(here[key], there[key])) conflicting = true;
        }
        if (conflicting) {
          const recovered = { ...there, id: conflictId(there), text: `${there.text.slice(0, 103)} (recovered copy)` };
          tasks.set(recovered.id, recovered);
          conflicts += 1;
        }
      }
      if (result) tasks.set(id, result);
    }
    const sessions = new Map([...remote.stats.sessions, ...local.stats.sessions].map((session) => [session.id, session]));
    const legacySprints = Math.max(0, ...[base, local, remote].map((snapshot) => snapshot.stats.sprints - snapshot.stats.sessions.length));
    const stats = Core.normalizeStats({
      sprints: legacySprints + sessions.size, sessions: [...sessions.values()],
      studyDays: [...new Set([...remote.stats.studyDays, ...local.stats.studyDays])]
    });
    const preferences = {};
    for (const key of Object.keys(local.preferences)) {
      preferences[key] = equal(local.preferences[key], base.preferences[key]) ? remote.preferences[key] : local.preferences[key];
    }
    return { snapshot: normalizeSnapshot({ tasks: [...tasks.values()], stats, preferences }), conflicts };
  }

  class SyncEngine {
    constructor({ transport, local, cache = {}, persist, apply, status }) {
      this.transport = transport;
      this.local = normalizeSnapshot(local);
      this.base = normalizeSnapshot(cache.base);
      this.persist = persist;
      this.apply = apply;
      this.status = status;
      this.generation = 0;
      this.stopped = false;
      this.busy = null;
      this.timer = null;
    }

    queue(snapshot) {
      if (this.stopped) return;
      this.local = normalizeSnapshot(snapshot);
      this.generation += 1;
      this.saveCache();
      this.status("pending");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.sync(), 700);
    }

    saveCache() {
      try { this.persist({ base: this.base, local: this.local }); }
      catch { this.status("storage-error"); }
    }

    async sync() {
      if (this.stopped) return;
      if (this.busy) return this.busy;
      clearTimeout(this.timer);
      this.busy = this.perform().finally(() => { this.busy = null; });
      return this.busy;
    }

    async perform() {
      const generation = this.generation;
      const sentLocal = copy(this.local);
      const base = copy(this.base);
      this.status("syncing");
      try {
        let remote = await this.transport.read();
        let merged;
        let conflicts = 0;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (this.stopped) return;
          merged = mergeSnapshots(base, sentLocal, remote?.payload || {});
          conflicts = merged.conflicts;
          if (remote && equal(merged.snapshot, normalizeSnapshot(remote.payload))) break;
          const saved = await this.transport.write(merged.snapshot, remote?.revision || 0);
          if (!saved.conflict) { remote = saved; break; }
          remote = saved;
          if (attempt === 3) throw new Error("Changes are arriving from another device. Try syncing again.");
        }
        if (this.stopped) return;
        this.base = normalizeSnapshot(remote.payload);
        const newerEdits = generation !== this.generation;
        this.local = newerEdits ? mergeSnapshots(sentLocal, this.local, this.base).snapshot : this.base;
        this.saveCache();
        this.apply(copy(this.local));
        this.status(newerEdits ? "pending" : conflicts ? "recovered" : "saved");
        if (newerEdits) this.timer = setTimeout(() => this.sync(), 0);
      } catch (error) {
        if (!this.stopped) { this.saveCache(); this.status("offline", error); }
      }
    }

    stop() { this.stopped = true; clearTimeout(this.timer); }
  }

  const api = { normalizeSnapshot, mergeSnapshots, SyncEngine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BrightworkSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
