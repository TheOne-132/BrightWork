const STORAGE_KEY = "studyTasks";
const STATS_KEY = "studyStats";
const DURATION_KEY = "focusDuration";
const SESSION_KEY = "focusSession";
const GOAL_KEY = "dailyFocusGoal";
const Core = BrightworkCore;

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskDueDate = document.querySelector("#task-due-date");
const taskPriority = document.querySelector("#task-priority");
const taskCategory = document.querySelector("#task-category");
const taskList = document.querySelector("#task-list");
const emptyMessage = document.querySelector("#empty-message");
const taskCount = document.querySelector("#task-count");
const filterButtons = document.querySelectorAll(".filter-button");
const exportButton = document.querySelector("#export-button");
const importInput = document.querySelector("#import-input");
const themeToggle = document.querySelector("#theme-toggle");
const focusTask = document.querySelector("#focus-task");
const focusDuration = document.querySelector("#focus-duration");
const focusStatus = document.querySelector("#focus-status");
const timerButton = document.querySelector("#timer-button");
const resetTimerButton = document.querySelector("#reset-timer");
const timerDisplay = document.querySelector("#timer-display");
const timerRing = document.querySelector("#timer-ring");
const progressRing = document.querySelector("#progress-ring");
const progressPercent = document.querySelector("#progress-percent");
const completedCount = document.querySelector("#completed-count");
const sprintCount = document.querySelector("#sprint-count");
const streakCount = document.querySelector("#streak-count");
const momentumTitle = document.querySelector("#momentum-title");
const momentumMessage = document.querySelector("#momentum-message");
const historyGrid = document.querySelector("#history-grid");
const importDialog = document.querySelector("#import-dialog");
const importSummary = document.querySelector("#import-summary");
const importPreview = document.querySelector("#import-preview");
const confirmImport = document.querySelector("#confirm-import");
const storageStatus = document.querySelector("#storage-status");
const dailyGoal = document.querySelector("#daily-goal");
const sprintResult = document.querySelector("#sprint-result");
const sprintSummary = document.querySelector("#sprint-summary");
const completeFocusTask = document.querySelector("#complete-focus-task");
const continueFocus = document.querySelector("#continue-focus");
const chooseNextTask = document.querySelector("#choose-next-task");
const focusEmptyLink = document.querySelector("#focus-empty-link");

let tasks = loadTasks();
let activeFilter = "all";
let focusDurationSeconds = validFocusMinutes(readStorage(DURATION_KEY)) * 60;
let dailyGoalMinutes = validGoalMinutes(readStorage(GOAL_KEY));
let timerInterval = null;
let selectedTaskId = "";
let studyStats = loadStats();
let focusSession = loadSession();
let pendingImport = null;
let displayedDay = Core.localDay();

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    showStorageError();
    return null;
  }
}

function showStorageError() {
  storageStatus.textContent = "Your browser could not save changes. Export a backup before leaving.";
  storageStatus.hidden = false;
}

function validFocusMinutes(value) {
  return Core.FOCUS_MINUTES.includes(Number(value)) ? Number(value) : 25;
}

function validGoalMinutes(value) {
  return Core.GOAL_MINUTES.includes(Number(value)) ? Number(value) : 50;
}

function loadSession() {
  try {
    return Core.normalizeSession(JSON.parse(readStorage(SESSION_KEY)));
  } catch {
    return null;
  }
}

function loadTasks() {
  try {
    const saved = JSON.parse(readStorage(STORAGE_KEY));
    return Array.isArray(saved) ? saved.filter((task) => task && typeof task === "object").map(normalizeTask).filter((task) => task.text) : [];
  } catch {
    return [];
  }
}

function normalizeTask(task) {
  return {
    id: String(task.id || `${Date.now()}-${Math.random()}`),
    text: String(task.text || "").trim(),
    completed: Boolean(task.completed),
    dueDate: isValidDateString(task.dueDate) ? task.dueDate : "",
    priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
    category: String(task.category || ""),
    completedAt: task.completedAt || ""
  };
}

function saveTasks() {
  saveStorage(STORAGE_KEY, tasks);
}

function loadStats() {
  try {
    return Core.normalizeStats(JSON.parse(readStorage(STATS_KEY)));
  } catch {
    return Core.normalizeStats(null);
  }
}

function saveStats() {
  saveStorage(STATS_KEY, studyStats);
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showStorageError();
  }
}

function saveRawStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    showStorageError();
  }
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function loadTheme() {
  return readStorage("studyTheme") === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const isDarkMode = theme === "dark";
  document.body.classList.toggle("dark-mode", isDarkMode);
  themeToggle.textContent = isDarkMode ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(isDarkMode));
}

function getOpenTasks() {
  return tasks.filter((task) => !task.completed);
}

function getVisibleTasks() {
  return tasks.filter((task) => {
    if (activeFilter === "active") return !task.completed;
    if (activeFilter === "completed") return task.completed;
    if (activeFilter === "high") return task.priority === "high" && !task.completed;
    return true;
  });
}

function updateDashboard() {
  const progress = Core.dailyProgress(studyStats, tasks, dailyGoalMinutes);
  progressRing.style.setProperty("--progress", `${progress.percent}%`);
  progressPercent.textContent = `${progress.percent}%`;
  completedCount.textContent = progress.completed;
  sprintCount.textContent = progress.sprints;
  streakCount.textContent = progress.streak;
  momentumTitle.textContent = progress.percent === 100 ? "Today's goal, reached" : progress.minutes ? "You're making time" : "Ready when you are";
  momentumMessage.textContent = `${progress.minutes} of ${dailyGoalMinutes} focus minutes today.`;
}

function updateFocusOptions() {
  const openTasks = getOpenTasks();
  const locked = Boolean(focusSession);
  focusTask.innerHTML = "";
  if (locked && !openTasks.some((task) => task.id === focusSession.taskId)) {
    openTasks.unshift({ id: focusSession.taskId, text: `${focusSession.taskText} (sprint task)` });
  }
  if (locked) selectedTaskId = focusSession.taskId;
  if (!openTasks.length) {
    const option = document.createElement("option");
    option.textContent = "Add an unfinished task first";
    option.value = "";
    focusTask.append(option);
    focusTask.disabled = true;
    selectedTaskId = "";
    updateFocusControls();
    return;
  }
  focusTask.disabled = locked;
  if (!openTasks.some((task) => task.id === selectedTaskId)) selectedTaskId = openTasks[0].id;
  openTasks.forEach((task) => {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.text;
    option.selected = task.id === selectedTaskId;
    focusTask.append(option);
  });
  updateFocusControls();
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function updateTimer() {
  const duration = focusSession ? focusSession.durationSeconds : focusDurationSeconds;
  const remaining = focusSession ? Core.remainingMs(focusSession, Date.now()) : duration * 1000;
  timerDisplay.textContent = formatTime(Math.ceil(remaining / 1000));
  timerRing.style.setProperty("--timer-progress", `${(1 - remaining / (duration * 1000)) * 360}deg`);
}

function markStudyDay() {
  const today = Core.localDay();
  if (!studyStats.studyDays.includes(today)) studyStats.studyDays.push(today);
  studyStats.lastStudyDate = today;
  studyStats.streak = Core.dailyProgress(studyStats, tasks, dailyGoalMinutes).streak;
  saveStats();
}

function updateFocusControls() {
  const finished = focusSession?.status === "finished";
  focusDuration.disabled = Boolean(focusSession);
  timerButton.disabled = Boolean(finished || (!focusSession && !selectedTaskId));
  resetTimerButton.disabled = !focusSession;
  timerButton.textContent = focusSession?.status === "running" ? "Pause sprint" : focusSession?.status === "paused" ? "Resume sprint" : "Start sprint";
  sprintResult.hidden = !finished;
  focusEmptyLink.hidden = Boolean(focusSession || getOpenTasks().length);
  if (finished) {
    const task = tasks.find((item) => item.id === focusSession.taskId);
    sprintSummary.textContent = `${focusSession.durationSeconds / 60} focus minutes saved for “${focusSession.taskText}”. ${!task ? "This task has been removed." : task.completed ? "This task is already complete." : "Is the task finished, or would another sprint help?"}`;
    completeFocusTask.disabled = !task || task.completed;
    continueFocus.disabled = !task || task.completed;
    focusStatus.textContent = "Sprint complete. Your task stays open until you mark it complete.";
  } else if (focusSession) {
    focusStatus.textContent = `${focusSession.status === "paused" ? "Paused" : "Focusing"} on “${focusSession.taskText}”. Reset the sprint to change tasks.`;
  } else {
    focusStatus.textContent = selectedTaskId ? "Pick a task and choose your own focus window." : "Add a task below, then make a little time for it.";
  }
}

function finishSprint(announce = true) {
  if (!focusSession) return;
  clearInterval(timerInterval);
  timerInterval = null;
  focusSession = Core.finishSession(focusSession);
  // Another open tab may already have recorded this sprint.
  const savedStats = readStorage(STATS_KEY);
  if (savedStats) {
    try { studyStats = Core.normalizeStats(JSON.parse(savedStats)); } catch {}
  }
  studyStats = Core.recordSprint(studyStats, focusSession);
  studyStats.streak = Core.dailyProgress(studyStats, tasks, dailyGoalMinutes).streak;
  saveStats();
  saveStorage(SESSION_KEY, focusSession);
  updateTimer();
  renderTasks();
  renderHistory();
  if (announce) notifySprintComplete(focusSession);
}

function notifySprintComplete(session) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("Brightwork sprint complete", { body: `${session.durationSeconds / 60} focus minutes saved for ${session.taskText}.` });
  } catch {
    // Some mobile browsers require service worker notifications.
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification("Brightwork sprint complete", {
      body: `${session.durationSeconds / 60} focus minutes saved for ${session.taskText}.`
    })).catch(() => {});
  }
}

function syncTimer() {
  if (focusSession?.status === "running" && Core.remainingMs(focusSession, Date.now()) <= 0) finishSprint();
  updateTimer();
  const today = Core.localDay();
  if (today !== displayedDay) {
    displayedDay = today;
    updateDashboard();
    renderHistory();
  }
}

function startSprint() {
  const task = tasks.find((item) => item.id === selectedTaskId && !item.completed);
  if (!task) return;
  focusSession = Core.createSession(task, focusDurationSeconds, Date.now(), `${Date.now()}-${Math.random()}`);
  saveStorage(SESSION_KEY, focusSession);
  clearInterval(timerInterval);
  timerInterval = setInterval(syncTimer, 1000);
  updateFocusOptions();
  renderTasks();
  updateTimer();
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

function resetSprint() {
  clearInterval(timerInterval);
  timerInterval = null;
  focusSession = null;
  saveStorage(SESSION_KEY, null);
  renderTasks();
  updateTimer();
}

function restoreSprint() {
  clearInterval(timerInterval);
  timerInterval = null;
  if (focusSession?.status === "finished") finishSprint(false);
  else if (focusSession?.status === "running") {
    syncTimer();
    if (focusSession.status === "running") timerInterval = setInterval(syncTimer, 1000);
  }
}

function renderFocusButton(task) {
  const button = document.createElement("button");
  button.className = "focus-task-button";
  button.type = "button";
  button.textContent = "Focus";
  button.disabled = Boolean(focusSession && (focusSession.status === "finished" || focusSession.taskId !== task.id));
  button.setAttribute("aria-label", `Focus on "${task.text}"`);
  button.addEventListener("click", () => {
    if (focusSession && focusSession.taskId !== task.id) return;
    selectedTaskId = task.id;
    updateFocusOptions();
    document.querySelector(".focus-card").scrollIntoView({ behavior: "smooth", block: "center" });
    focusTask.focus();
  });
  return button;
}

function renderTaskEditor(task, listItem) {
  listItem.innerHTML = "";
  const editor = document.createElement("form");
  editor.className = "edit-form";
  const textInput = createEditorInput("text", task.text, "Task name", 120);
  textInput.required = true;
  const dueDateInput = createEditorInput("date", task.dueDate, "Due date");
  const priorityInput = document.createElement("select");
  priorityInput.setAttribute("aria-label", "Priority");
  ["low", "medium", "high"].forEach((priority) => {
    const option = document.createElement("option");
    option.value = priority;
    option.textContent = priority[0].toUpperCase() + priority.slice(1);
    priorityInput.append(option);
  });
  priorityInput.value = task.priority;
  const categoryInput = createEditorInput("text", task.category, "Category", 30);
  categoryInput.placeholder = "Category";
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary-task-button";
  cancelButton.textContent = "Cancel";
  editor.append(textInput, dueDateInput, priorityInput, categoryInput, saveButton, cancelButton);
  editor.addEventListener("submit", (event) => {
    event.preventDefault();
    task.text = textInput.value.trim();
    task.dueDate = dueDateInput.value;
    task.priority = priorityInput.value;
    task.category = categoryInput.value.trim();
    saveTasks();
    renderTasks();
  });
  cancelButton.addEventListener("click", renderTasks);
  listItem.append(editor);
}

function createEditorInput(type, value, label, maxLength) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.setAttribute("aria-label", label);
  if (maxLength) input.maxLength = maxLength;
  return input;
}

function renderTasks() {
  taskList.innerHTML = "";
  const visibleTasks = getVisibleTasks();
  emptyMessage.hidden = visibleTasks.length > 0;
  emptyMessage.textContent = tasks.length ? "No tasks match this filter." : "No tasks yet. Add your first study task above.";
  const remaining = tasks.filter((task) => !task.completed).length;
  taskCount.textContent = `${remaining} ${remaining === 1 ? "task" : "tasks"} left`;
  updateFocusOptions();
  updateDashboard();
  visibleTasks.forEach((task) => {
    const listItem = document.createElement("li");
    listItem.className = `task-item priority-${task.priority}`;
    if (task.completed) listItem.classList.add("completed");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Mark "${task.text}" as ${task.completed ? "incomplete" : "complete"}`);
    checkbox.addEventListener("change", () => toggleTask(task.id));
    const details = document.createElement("span");
    details.className = "task-details";
    const text = document.createElement("span");
    text.textContent = task.text;
    const metadata = document.createElement("small");
    metadata.textContent = [task.category, task.dueDate ? `Due ${task.dueDate}` : "", task.priority].filter(Boolean).join(" · ");
    details.append(text, metadata);
    label.append(checkbox, details);
    const editButton = document.createElement("button");
    editButton.className = "small-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => renderTaskEditor(task, listItem));
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete "${task.text}"`);
    deleteButton.addEventListener("click", () => deleteTask(task.id));
    listItem.append(label);
    if (!task.completed) listItem.append(renderFocusButton(task));
    listItem.append(editButton, deleteButton);
    taskList.append(listItem);
  });
}

function addTask(formData) {
  tasks.push({ id: `${Date.now()}-${Math.random()}`, text: formData.text, completed: false, dueDate: formData.dueDate, priority: formData.priority, category: formData.category, completedAt: "" });
  saveTasks();
  renderTasks();
}

function toggleTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  const isCompleting = !task.completed;
  task.completed = isCompleting;
  task.completedAt = isCompleting ? new Date().toISOString() : "";
  if (isCompleting) markStudyDay();
  saveTasks();
  renderTasks();
  renderHistory();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  saveTasks();
  renderTasks();
}

function renderHistory() {
  historyGrid.innerHTML = "";
  const today = new Date();
  for (let offset = 27; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dateString = Core.localDay(date);
    const day = document.createElement("span");
    day.className = `history-day${studyStats.studyDays?.includes(dateString) ? " studied" : ""}`;
    day.title = `${dateString}${studyStats.studyDays?.includes(dateString) ? " — studied" : ""}`;
    day.setAttribute("aria-label", day.title);
    historyGrid.append(day);
  }
}

function exportData() {
  const backup = { version: 2, tasks, stats: studyStats, theme: loadTheme(), focusDuration: focusDurationSeconds / 60, dailyGoal: dailyGoalMinutes };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `brightwork-backup-${Core.localDay()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseDateValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isValidDateString(text)) return text;
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const converted = `${slashDate[3]}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}`;
    return isValidDateString(converted) ? converted : "";
  }
  const normalized = text.toLowerCase();
  const relativeDate = new Date();
  if (normalized === "tomorrow") {
    relativeDate.setDate(relativeDate.getDate() + 1);
    return Core.localDay(relativeDate);
  }
  if (normalized === "today") return Core.localDay(relativeDate);
  else {
    const parsed = Date.parse(text);
    if (Number.isNaN(parsed)) return "";
    const converted = Core.localDay(new Date(parsed));
    return isValidDateString(converted) ? converted : "";
  }
}

function parseImportedTask(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text ?? raw.title ?? raw.name ?? raw.task ?? raw.taskname ?? raw.description ?? "").trim();
  if (!text) return null;
  const rawPriority = String(raw.priority || "medium").toLowerCase();
  const priority = ["low", "medium", "high"].includes(rawPriority) ? rawPriority : "medium";
  return normalizeTask({
    id: `imported-${Date.now()}-${index}-${Math.random()}`,
    text,
    completed: raw.completed === true || ["true", "done", "completed", "1"].includes(String(raw.completed).toLowerCase()),
    dueDate: parseDateValue(raw.dueDate ?? raw.duedate ?? raw.due ?? raw.deadline),
    priority,
    category: String(raw.category ?? raw.subject ?? "").trim(),
    completedAt: raw.completedAt || ""
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.toLowerCase().replace(/[\s_-]+/g, ""));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function parseTextTasks(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    const raw = { text: parts[0] };
    parts.slice(1).forEach((part) => {
      const lower = part.toLowerCase();
      if (["low", "medium", "high"].includes(lower)) raw.priority = lower;
      else if (parseDateValue(part)) raw.dueDate = part;
      else if (!raw.category) raw.category = part;
    });
    return raw;
  });
}

function parseImportContent(text, extension) {
  if (extension === "json" || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    const parsed = JSON.parse(text);
    const sourceTasks = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (!Array.isArray(sourceTasks)) throw new Error("JSON must contain a tasks array.");
    return { tasks: sourceTasks, stats: Array.isArray(parsed) ? null : parsed.stats, theme: parsed.theme, focusDuration: parsed.focusDuration, dailyGoal: parsed.dailyGoal };
  }
  if (extension === "csv") return { tasks: parseCsv(text) };
  return { tasks: parseTextTasks(text) };
}

function showImportPreview(parsed, invalidCount) {
  const seen = new Set();
  const validTasks = parsed.tasks.map(parseImportedTask).filter(Boolean);
  const duplicates = validTasks.filter((task) => {
    const key = task.text.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  }).length;
  const uniqueTasks = validTasks.filter((task, index) => {
    const key = task.text.toLowerCase();
    return validTasks.findIndex((candidate) => candidate.text.toLowerCase() === key) === index;
  });
  const existingText = new Set(tasks.map((task) => task.text.toLowerCase()));
  const existingDuplicates = uniqueTasks.filter((task) => existingText.has(task.text.toLowerCase())).length;
  pendingImport = { ...parsed, tasks: uniqueTasks, skipped: invalidCount + duplicates, existingDuplicates };
  document.querySelector('input[name="import-mode"][value="add"]').checked = true;
  updateImportSummary();
  importPreview.innerHTML = "";
  uniqueTasks.slice(0, 20).forEach((task) => {
    const item = document.createElement("li");
    item.textContent = task.text;
    const metadata = document.createElement("small");
    metadata.textContent = [task.category, task.dueDate ? `Due ${task.dueDate}` : "", task.priority].filter(Boolean).join(" · ");
    item.append(metadata);
    importPreview.append(item);
  });
  if (uniqueTasks.length > 20) {
    const more = document.createElement("li");
    more.textContent = `…and ${uniqueTasks.length - 20} more`;
    importPreview.append(more);
  }
  importDialog.showModal();
}

function updateImportSummary() {
  if (!pendingImport) return;
  const replace = document.querySelector('input[name="import-mode"]:checked').value === "replace";
  const skipped = pendingImport.skipped + (replace ? 0 : pendingImport.existingDuplicates);
  importSummary.textContent = `${pendingImport.tasks.length} task${pendingImport.tasks.length === 1 ? "" : "s"} found${skipped ? ` · ${skipped} skipped` : ""}. ${replace ? "Your current tasks will be replaced." : "Choose how to add them."}`;
  confirmImport.disabled = !replace && !pendingImport.tasks.length;
}

function importData(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const extension = file.name.split(".").pop().toLowerCase();
      const parsed = parseImportContent(String(reader.result), extension);
      const invalidCount = parsed.tasks.filter((task) => !parseImportedTask(task, 0)).length;
      showImportPreview(parsed, invalidCount);
    } catch (error) {
      importSummary.textContent = `Import failed: ${error.message}`;
      importPreview.innerHTML = "";
      pendingImport = null;
      importDialog.showModal();
    }
  });
  reader.addEventListener("error", () => {
    importSummary.textContent = "Import failed: the file could not be read.";
    importPreview.innerHTML = "";
    pendingImport = null;
    importDialog.showModal();
  });
  reader.readAsText(file);
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return taskInput.focus();
  addTask({ text, dueDate: taskDueDate.value, priority: taskPriority.value, category: taskCategory.value.trim() });
  taskForm.reset();
  taskPriority.value = "medium";
  taskInput.focus();
});

filterButtons.forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  filterButtons.forEach((item) => {
    item.classList.toggle("active", item === button);
    item.setAttribute("aria-pressed", String(item === button));
  });
  renderTasks();
}));

exportButton.addEventListener("click", exportData);
document.querySelector("#import-button").addEventListener("click", () => importInput.click());
importInput.addEventListener("change", () => { if (importInput.files[0]) importData(importInput.files[0]); });
confirmImport.addEventListener("click", () => {
  if (!pendingImport) return;
  const mode = document.querySelector("input[name=\"import-mode\"]:checked").value;
  if (mode === "add" && !pendingImport.tasks.length) return;
  if (mode === "replace" && focusSession && focusSession.status !== "finished") {
    importSummary.textContent = "Finish or reset your current sprint before replacing tasks. You can still add tasks.";
    return;
  }
  const existingText = new Set(tasks.map((task) => task.text.toLowerCase()));
  const importedTasks = pendingImport.tasks.filter((task) => !existingText.has(task.text.toLowerCase()));
  tasks = mode === "replace" ? pendingImport.tasks : [...tasks, ...importedTasks];
  if (mode === "replace") {
    resetSprint();
    if (pendingImport.stats) studyStats = Core.normalizeStats(pendingImport.stats);
  }
  if (mode === "replace" && ["light", "dark"].includes(pendingImport.theme)) {
    saveRawStorage("studyTheme", pendingImport.theme);
    applyTheme(pendingImport.theme);
  }
  if (mode === "replace" && pendingImport.focusDuration != null) {
    focusDurationSeconds = validFocusMinutes(pendingImport.focusDuration) * 60;
    focusDuration.value = String(focusDurationSeconds / 60);
    saveRawStorage(DURATION_KEY, String(focusDurationSeconds / 60));
    updateTimer();
  }
  if (mode === "replace" && pendingImport.dailyGoal != null) {
    dailyGoalMinutes = validGoalMinutes(pendingImport.dailyGoal);
    dailyGoal.value = String(dailyGoalMinutes);
    saveRawStorage(GOAL_KEY, String(dailyGoalMinutes));
  }
  saveTasks();
  saveStats();
  pendingImport = null;
  importDialog.close();
  importInput.value = "";
  renderTasks();
  renderHistory();
});
importDialog.addEventListener("close", () => {
  pendingImport = null;
  importInput.value = "";
});
document.querySelectorAll('input[name="import-mode"]').forEach((input) => input.addEventListener("change", updateImportSummary));
focusTask.addEventListener("change", () => {
  if (focusSession) return updateFocusOptions();
  selectedTaskId = focusTask.value;
});
if (focusSession) focusDurationSeconds = focusSession.durationSeconds;
focusDuration.value = String(focusDurationSeconds / 60);
focusDuration.addEventListener("change", () => {
  if (focusSession) return;
  focusDurationSeconds = validFocusMinutes(focusDuration.value) * 60;
  saveRawStorage(DURATION_KEY, String(focusDurationSeconds / 60));
  updateTimer();
});

timerButton.addEventListener("click", () => {
  syncTimer();
  if (focusSession?.status === "finished") return;
  if (!focusSession) return startSprint();
  if (focusSession.status === "running") {
    focusSession = Core.pauseSession(focusSession, Date.now());
    clearInterval(timerInterval);
    timerInterval = null;
  } else {
    focusSession = Core.resumeSession(focusSession, Date.now());
    timerInterval = setInterval(syncTimer, 1000);
  }
  saveStorage(SESSION_KEY, focusSession);
  updateFocusControls();
  updateTimer();
});

resetTimerButton.addEventListener("click", resetSprint);
completeFocusTask.addEventListener("click", () => {
  if (focusSession?.status !== "finished") return;
  const taskId = focusSession.taskId;
  const task = tasks.find((item) => item.id === taskId);
  if (task && !task.completed) toggleTask(taskId);
  resetSprint();
});
continueFocus.addEventListener("click", () => {
  if (focusSession?.status !== "finished") return;
  const taskId = focusSession.taskId;
  resetSprint();
  selectedTaskId = taskId;
  startSprint();
});
chooseNextTask.addEventListener("click", () => {
  resetSprint();
  if (getOpenTasks().length) focusTask.focus();
  else taskInput.focus();
});
dailyGoal.value = String(dailyGoalMinutes);
dailyGoal.addEventListener("change", () => {
  dailyGoalMinutes = validGoalMinutes(dailyGoal.value);
  saveRawStorage(GOAL_KEY, String(dailyGoalMinutes));
  updateDashboard();
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
  saveRawStorage("studyTheme", nextTheme);
  applyTheme(nextTheme);
});

applyTheme(loadTheme());
updateTimer();
renderTasks();
renderHistory();
restoreSprint();
document.addEventListener("visibilitychange", syncTimer);
window.addEventListener("pageshow", syncTimer);
window.addEventListener("focus", syncTimer);
window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage) return;
  if (event.key === null || event.key === STORAGE_KEY) tasks = loadTasks();
  if (event.key === null || event.key === STATS_KEY) studyStats = loadStats();
  if (event.key === null || event.key === SESSION_KEY) focusSession = loadSession();
  if (event.key === null || event.key === GOAL_KEY) dailyGoalMinutes = validGoalMinutes(readStorage(GOAL_KEY));
  if (event.key === null || event.key === DURATION_KEY || event.key === SESSION_KEY) {
    focusDurationSeconds = focusSession ? focusSession.durationSeconds : validFocusMinutes(readStorage(DURATION_KEY)) * 60;
  }
  dailyGoal.value = String(dailyGoalMinutes);
  focusDuration.value = String(focusDurationSeconds / 60);
  if (event.key === null || event.key === "studyTheme") applyTheme(loadTheme());
  renderTasks();
  renderHistory();
  updateTimer();
  if (event.key === null || event.key === SESSION_KEY) restoreSprint();
});
// Refresh daily totals even when the app stays open across midnight without a sprint.
setInterval(syncTimer, 30000);
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
