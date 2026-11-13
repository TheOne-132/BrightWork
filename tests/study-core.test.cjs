const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const Core = require("../study-core.js");

const task = { id: "biology", text: "Review biology", completed: false };
const noon = new Date(2026, 10, 13, 12).getTime();
const finished = (id = "sprint-1", end = noon, seconds = 1500) =>
  Core.finishSession(Core.createSession(task, seconds, end - seconds * 1000, id));

test("elapsed wall time catches up after throttled callbacks or device sleep", () => {
  const session = Core.createSession(task, 300, noon, "sleep");
  assert.equal(Core.remainingMs(session, noon + 240000), 60000);
  assert.equal(Core.remainingMs(session, noon + 900000), 0);
});

test("the task and duration are snapshots of the sprint that started", () => {
  const original = { ...task };
  const session = Core.createSession(original, 1500, noon, "bound-task");
  original.id = "math";
  original.text = "Practice math";
  assert.equal(session.taskId, "biology");
  assert.equal(session.taskText, "Review biology");
  assert.equal(session.durationSeconds, 1500);
});

test("pause and resume preserve precise remaining time across a reload", () => {
  const session = Core.createSession(task, 300, noon, "pause");
  const paused = Core.pauseSession(session, noon + 90500);
  const restored = Core.normalizeSession(JSON.parse(JSON.stringify(paused)));
  assert.equal(Core.remainingMs(restored, noon + 3600000), 209500);
  const resumed = Core.resumeSession(restored, noon + 3600000);
  assert.equal(Core.remainingMs(resumed, noon + 3600500), 209000);
});

test("a running sprint survives JSON storage without restarting the countdown", () => {
  const session = Core.createSession(task, 300, noon, "refresh");
  const restored = Core.normalizeSession(JSON.parse(JSON.stringify(session)));
  assert.equal(Core.remainingMs(restored, noon + 60000), 240000);
});

test("restored session data rejects invalid durations and timestamps", () => {
  const session = Core.createSession(task, 300, noon, "validation");
  assert.equal(Core.normalizeSession({ ...session, durationSeconds: -5 }), null);
  assert.equal(Core.normalizeSession({ ...session, endsAt: "tomorrow" }), null);
  assert.equal(Core.normalizeSession({ ...session, remainingMs: Infinity }), null);
  assert.equal(Core.normalizeSession({ ...session, status: "finished", finishedAt: "invalid" }), null);
});

test("completion records effort without marking the task complete", () => {
  const original = { ...task };
  const session = Core.finishSession(Core.createSession(original, 1500, noon, "effort"));
  const stats = Core.recordSprint(Core.normalizeStats(null), session);
  assert.equal(original.completed, false);
  assert.equal(stats.sessions[0].taskId, original.id);
  assert.equal(stats.sessions[0].durationSeconds, 1500);
  assert.equal(stats.sprints, 1);
});

test("restoring an expired or finished sprint counts it exactly once", () => {
  const session = finished();
  const stats = Core.recordSprint(Core.normalizeStats(null), session);
  const restored = Core.normalizeStats(JSON.parse(JSON.stringify(stats)));
  const duplicate = Core.recordSprint(restored, Core.finishSession(session));
  assert.equal(duplicate.sprints, 1);
  assert.equal(duplicate.sessions.length, 1);
});

test("late wake-up credits the scheduled finish day", () => {
  const end = new Date(2026, 10, 12, 23, 59).getTime();
  const stats = Core.recordSprint(Core.normalizeStats(null), finished("overnight", end));
  assert.equal(stats.sessions[0].day, "2026-11-12");
  assert.equal(Core.dailyProgress(stats, [], 50, noon).minutes, 0);
});

test("daily goal depends on focused minutes, regardless of the task backlog", () => {
  const stats = Core.recordSprint(Core.normalizeStats(null), finished());
  const backlog = Array.from({ length: 20 }, (_, i) => ({ id: String(i), completed: false, dueDate: "2026-11-14" }));
  const progress = Core.dailyProgress(stats, backlog, 50, noon);
  assert.equal(progress.minutes, 25);
  assert.equal(progress.percent, 50);
  assert.equal(progress.sprints, 1);
  assert.equal(Core.dailyProgress(stats, [], 15, noon).percent, 100);
});

test("completed today excludes old tasks and daily totals roll over at midnight", () => {
  const stats = Core.recordSprint(Core.normalizeStats(null), finished());
  const tasks = [
    { completed: true, completedAt: new Date(noon).toISOString() },
    { completed: true, completedAt: new Date(2026, 10, 12, 12).toISOString() },
    { completed: false, completedAt: new Date(noon).toISOString() }
  ];
  assert.equal(Core.dailyProgress(stats, tasks, 50, noon).completed, 1);
  const tomorrow = Core.dailyProgress(stats, tasks, 50, new Date(2026, 10, 14, 0, 1));
  assert.equal(tomorrow.minutes, 0);
  assert.equal(tomorrow.sprints, 0);
  assert.equal(tomorrow.completed, 0);
});

test("streak is recalculated and expires after a missed day", () => {
  const stats = Core.normalizeStats({ streak: 99, studyDays: ["2026-11-11", "2026-11-12"] });
  assert.equal(Core.dailyProgress(stats, [], 50, noon).streak, 2);
  assert.equal(Core.dailyProgress(stats, [], 50, new Date(2026, 10, 14, 12)).streak, 0);
});

test("old backups preserve their history without inventing historical minutes", () => {
  const stats = Core.normalizeStats({ sprints: 12, streak: 3, studyDays: ["2026-11-12"] });
  assert.equal(stats.sprints, 12);
  assert.deepEqual(stats.studyDays, ["2026-11-12"]);
  assert.deepEqual(stats.sessions, []);
  assert.equal(Core.dailyProgress(stats, [], 50, noon).minutes, 0);
});

test("imported stats discard malformed and duplicate session records", () => {
  const stats = Core.recordSprint(Core.normalizeStats(null), finished());
  const cleaned = Core.normalizeStats({ sessions: [...stats.sessions, stats.sessions[0], null, { id: "invalid", durationSeconds: 999999, finishedAt: "invalid" }] });
  assert.equal(cleaned.sessions.length, 1);
  assert.equal(cleaned.sprints, 1);
});

test("local calendar follows Lagos midnight and New York daylight saving", () => {
  const runInZone = (zone, source) => JSON.parse(execFileSync(process.execPath, ["-e", source], {
    cwd: require("node:path").resolve(__dirname, ".."), env: { ...process.env, TZ: zone }, encoding: "utf8"
  }));
  const lagos = runInZone("Africa/Lagos", `const C=require('./study-core.js');console.log(JSON.stringify(C.localDay('2026-11-12T23:30:00Z')));`);
  assert.equal(lagos, "2026-11-13");
  const newYork = runInZone("America/New_York", `const C=require('./study-core.js'); const s=C.normalizeStats({studyDays:['2026-10-31','2026-11-01']}); console.log(JSON.stringify({day:C.localDay('2026-11-02T00:30:00Z'),streak:C.dailyProgress(s,[],50,new Date(2026,10,2,12)).streak}));`);
  assert.deepEqual(newYork, { day: "2026-11-01", streak: 2 });
});
