(function (root) {
  "use strict";

  const FOCUS_MINUTES = [5, 15, 25, 45, 60];
  const GOAL_MINUTES = [15, 25, 50, 90, 120];

  function localDay(value = new Date()) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function previousDay(day) {
    const [year, month, date] = day.split("-").map(Number);
    return localDay(new Date(year, month - 1, date - 1, 12));
  }

  function normalizeStats(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const seen = new Set();
    const sessions = (Array.isArray(source.sessions) ? source.sessions : []).filter((session) => {
      if (!session || typeof session.id !== "string" || seen.has(session.id)) return false;
      if (!Number.isFinite(session.durationSeconds) || session.durationSeconds <= 0 || session.durationSeconds > 3600) return false;
      if (!Number.isFinite(Date.parse(session.finishedAt))) return false;
      seen.add(session.id);
      return true;
    }).map((session) => ({
      id: session.id,
      taskId: String(session.taskId || ""),
      taskText: String(session.taskText || ""),
      durationSeconds: session.durationSeconds,
      finishedAt: session.finishedAt,
      day: /^\d{4}-\d{2}-\d{2}$/.test(session.day) ? session.day : localDay(session.finishedAt)
    }));
    const studyDays = [...new Set([
      ...(Array.isArray(source.studyDays) ? source.studyDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) : []),
      ...sessions.map((session) => session.day)
    ])].sort();
    return {
      sprints: Math.max(sessions.length, Number.isFinite(source.sprints) ? source.sprints : 0),
      streak: Number.isFinite(source.streak) ? source.streak : 0,
      lastStudyDate: studyDays.at(-1) || "",
      studyDays,
      sessions
    };
  }

  function createSession(task, durationSeconds, now, id) {
    return {
      id, taskId: task.id, taskText: task.text, durationSeconds,
      remainingMs: durationSeconds * 1000,
      endsAt: now + durationSeconds * 1000,
      status: "running"
    };
  }

  function normalizeSession(raw) {
    if (!raw || typeof raw.id !== "string" || typeof raw.taskId !== "string" || typeof raw.taskText !== "string") return null;
    if (!FOCUS_MINUTES.includes(raw.durationSeconds / 60)) return null;
    if (!["running", "paused", "finished"].includes(raw.status)) return null;
    if (!Number.isFinite(raw.remainingMs) || raw.remainingMs < 0 || raw.remainingMs > raw.durationSeconds * 1000) return null;
    if (raw.status === "running" && (!Number.isFinite(raw.endsAt) || raw.endsAt <= 0)) return null;
    if (raw.status === "finished" && !Number.isFinite(Date.parse(raw.finishedAt))) return null;
    return { ...raw };
  }

  function remainingMs(session, now) {
    if (session.status === "finished") return 0;
    return Math.max(0, Math.min(session.durationSeconds * 1000,
      session.status === "running" ? session.endsAt - now : session.remainingMs));
  }

  function pauseSession(session, now) {
    return { ...session, remainingMs: remainingMs(session, now), endsAt: null, status: "paused" };
  }

  function resumeSession(session, now) {
    return { ...session, endsAt: now + session.remainingMs, status: "running" };
  }

  function finishSession(session) {
    return {
      ...session, status: "finished", remainingMs: 0,
      finishedAt: session.finishedAt || new Date(session.endsAt).toISOString(), endsAt: null
    };
  }

  function recordSprint(stats, session) {
    if (stats.sessions.some((item) => item.id === session.id)) return stats;
    const day = localDay(session.finishedAt);
    return {
      ...stats,
      sprints: stats.sprints + 1,
      lastStudyDate: [stats.lastStudyDate, day].sort().at(-1),
      studyDays: [...new Set([...stats.studyDays, day])].sort(),
      sessions: [...stats.sessions, {
        id: session.id, taskId: session.taskId, taskText: session.taskText,
        durationSeconds: session.durationSeconds, finishedAt: session.finishedAt, day
      }]
    };
  }

  function dailyProgress(stats, tasks, goal, now = new Date()) {
    const today = localDay(now);
    const sessions = stats.sessions.filter((session) => session.day === today);
    const minutes = sessions.reduce((total, session) => total + session.durationSeconds / 60, 0);
    const days = new Set(stats.studyDays);
    let day = days.has(today) ? today : previousDay(today);
    let streak = 0;
    while (days.has(day)) {
      streak += 1;
      day = previousDay(day);
    }
    return {
      minutes,
      percent: Math.min(100, Math.round(minutes / goal * 100)),
      sprints: sessions.length,
      completed: tasks.filter((task) => task.completed && task.completedAt && localDay(task.completedAt) === today).length,
      streak
    };
  }

  const core = {
    FOCUS_MINUTES, GOAL_MINUTES, localDay, normalizeStats, createSession, normalizeSession,
    remainingMs, pauseSession, resumeSession, finishSession, recordSprint, dailyProgress
  };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  else root.BrightworkCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this);
