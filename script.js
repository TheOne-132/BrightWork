const STORAGE_KEY = "studyTasks";
const STATS_KEY = "studyStats";
const DURATION_KEY = "focusDuration";

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

let tasks = loadTasks();
let activeFilter = "all";
let focusDurationSeconds = Number(localStorage.getItem(DURATION_KEY)) * 60 || 25 * 60;
let focusSeconds = focusDurationSeconds;
let timerInterval = null;
let selectedTaskId = "";
let studyStats = loadStats();
let pendingImport = null;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.map(normalizeTask) : [];
  } catch {
    return [];
  }
}

function normalizeTask(task) {
  return {
    id: task.id || `${Date.now()}-${Math.random()}`,
    text: String(task.text || "").trim(),
    completed: Boolean(task.completed),
    dueDate: isValidDateString(task.dueDate) ? task.dueDate : "",
    priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
    category: task.category || "",
    completedAt: task.completedAt || ""
  };
}

function saveTasks() {
  saveStorage(STORAGE_KEY, tasks);
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || { sprints: 0, streak: 0, lastStudyDate: "", studyDays: [] };
  } catch {
    return { sprints: 0, streak: 0, lastStudyDate: "", studyDays: [] };
  }
}

function saveStats() {
  saveStorage(STATS_KEY, studyStats);
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    storageStatus.hidden = true;
  } catch {
    storageStatus.textContent = "Your browser could not save changes. Export a backup before leaving.";
    storageStatus.hidden = false;
  }
}

function saveRawStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    storageStatus.hidden = true;
  } catch {
    storageStatus.textContent = "Your browser could not save changes. Export a backup before leaving.";
    storageStatus.hidden = false;
  }
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function loadTheme() {
  return localStorage.getItem("studyTheme") === "dark" ? "dark" : "light";
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
  const completed = tasks.filter((task) => task.completed).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  progressRing.style.setProperty("--progress", `${percent}%`);
  progressPercent.textContent = `${percent}%`;
  completedCount.textContent = completed;
  sprintCount.textContent = studyStats.sprints;
  streakCount.textContent = studyStats.streak;
  momentumTitle.textContent = percent === 100 && tasks.length ? "You crushed it!" : percent >= 50 ? "You are on a roll" : "Ready when you are";
  momentumMessage.textContent = percent === 100 && tasks.length ? "Every task is complete. Enjoy the win." : "Every finished task makes the next one easier.";
}

function updateFocusOptions() {
  const openTasks = getOpenTasks();
  focusTask.innerHTML = "";
  if (!openTasks.length) {
    const option = document.createElement("option");
    option.textContent = "Add an unfinished task first";
    option.value = "";
    focusTask.append(option);
    focusTask.disabled = true;
    selectedTaskId = "";
    return;
  }
  focusTask.disabled = false;
  if (!openTasks.some((task) => task.id === selectedTaskId)) selectedTaskId = openTasks[0].id;
  openTasks.forEach((task) => {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.text;
    option.selected = task.id === selectedTaskId;
    focusTask.append(option);
  });
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function updateTimer() {
  timerDisplay.textContent = formatTime(focusSeconds);
  timerRing.style.setProperty("--timer-progress", `${((focusDurationSeconds - focusSeconds) / focusDurationSeconds) * 360}deg`);
}

function markStudyDay() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  if (studyStats.lastStudyDate !== today) {
    studyStats.streak = studyStats.lastStudyDate === yesterday ? studyStats.streak + 1 : 1;
    studyStats.lastStudyDate = today;
  }
  studyStats.studyDays = Array.isArray(studyStats.studyDays) ? studyStats.studyDays : [];
  if (!studyStats.studyDays.includes(today)) studyStats.studyDays.push(today);
  saveStats();
}

function finishSprint() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerButton.textContent = "Start sprint";
  focusStatus.textContent = "Sprint complete! Nice work — your task is marked finished.";
  const task = tasks.find((item) => item.id === selectedTaskId);
  if (task) {
    task.completed = true;
    task.completedAt = new Date().toISOString();
    saveTasks();
  }
  studyStats.sprints += 1;
  markStudyDay();
  notifySprintComplete(task);
  focusSeconds = focusDurationSeconds;
  updateTimer();
  renderTasks();
  renderHistory();
}

function notifySprintComplete(task) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("Brightwork sprint complete", { body: `${task ? task.text : "Your focus session"} is finished.` });
}

function renderFocusButton(task) {
  const button = document.createElement("button");
  button.className = "focus-task-button";
  button.type = "button";
  button.textContent = "Focus";
  button.setAttribute("aria-label", `Focus on "${task.text}"`);
  button.addEventListener("click", () => {
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
    checkbox.setAttribute("aria-label", `Mark "${task.text}" as complete`);
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
    const dateString = date.toISOString().slice(0, 10);
    const day = document.createElement("span");
    day.className = `history-day${studyStats.studyDays?.includes(dateString) ? " studied" : ""}`;
    day.title = `${dateString}${studyStats.studyDays?.includes(dateString) ? " — studied" : ""}`;
    day.setAttribute("aria-label", day.title);
    historyGrid.append(day);
  }
}

function exportData() {
  const backup = { tasks, stats: studyStats, theme: localStorage.getItem("studyTheme"), focusDuration: localStorage.getItem(DURATION_KEY) };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `brightwork-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
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
    return relativeDate.toISOString().slice(0, 10);
  }
  if (normalized === "today") return relativeDate.toISOString().slice(0, 10);
  else {
    const parsed = Date.parse(text);
    if (Number.isNaN(parsed)) return "";
    const converted = new Date(parsed).toISOString().slice(0, 10);
    return isValidDateString(converted) ? converted : "";
  }
  return relativeDate.toISOString().slice(0, 10);
}

function parseImportedTask(raw, index) {
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
    return { tasks: sourceTasks, stats: Array.isArray(parsed) ? null : parsed.stats, theme: parsed.theme, focusDuration: parsed.focusDuration };
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
  pendingImport = { ...parsed, tasks: uniqueTasks };
  const existingText = new Set(tasks.map((task) => task.text.toLowerCase()));
  const existingDuplicates = uniqueTasks.filter((task) => existingText.has(task.text.toLowerCase())).length;
  importSummary.textContent = `${uniqueTasks.length} task${uniqueTasks.length === 1 ? "" : "s"} found${invalidCount + duplicates + existingDuplicates ? ` · ${invalidCount + duplicates + existingDuplicates} skipped` : ""}. Choose how to add them.`;
  importPreview.innerHTML = "";
  validTasks.slice(0, 20).forEach((task) => {
    const item = document.createElement("li");
    item.textContent = task.text;
    const metadata = document.createElement("small");
    metadata.textContent = [task.category, task.dueDate ? `Due ${task.dueDate}` : "", task.priority].filter(Boolean).join(" · ");
    item.append(metadata);
    importPreview.append(item);
  });
  if (validTasks.length > 20) {
    const more = document.createElement("li");
    more.textContent = `…and ${validTasks.length - 20} more`;
    importPreview.append(more);
  }
  importDialog.showModal();
}

function importData(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const extension = file.name.split(".").pop().toLowerCase();
      const parsed = parseImportContent(String(reader.result), extension);
      const invalidCount = parsed.tasks.filter((task) => !String(task.text ?? task.title ?? task.name ?? task.task ?? task.taskname ?? task.description ?? "").trim()).length;
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
  filterButtons.forEach((item) => item.classList.toggle("active", item === button));
  renderTasks();
}));

exportButton.addEventListener("click", exportData);
importInput.addEventListener("change", () => { if (importInput.files[0]) importData(importInput.files[0]); });
confirmImport.addEventListener("click", () => {
  if (!pendingImport || !pendingImport.tasks.length) return;
  const mode = document.querySelector("input[name=\"import-mode\"]:checked").value;
  const existingText = new Set(tasks.map((task) => task.text.toLowerCase()));
  const importedTasks = pendingImport.tasks.filter((task) => !existingText.has(task.text.toLowerCase()));
  tasks = mode === "replace" ? pendingImport.tasks : [...tasks, ...importedTasks];
  if (mode === "replace" && pendingImport.stats) studyStats = pendingImport.stats;
  if (mode === "replace" && ["light", "dark"].includes(pendingImport.theme)) {
    saveRawStorage("studyTheme", pendingImport.theme);
    applyTheme(pendingImport.theme);
  }
  if (mode === "replace" && Number(pendingImport.focusDuration)) {
    focusDurationSeconds = Number(pendingImport.focusDuration) * 60;
    focusSeconds = focusDurationSeconds;
    focusDuration.value = pendingImport.focusDuration;
    saveRawStorage(DURATION_KEY, pendingImport.focusDuration);
    updateTimer();
  }
  saveTasks();
  saveStats();
  pendingImport = null;
  importDialog.close();
  importInput.value = "";
  renderTasks();
  renderHistory();
});
focusTask.addEventListener("change", () => { selectedTaskId = focusTask.value; });
focusDuration.value = String(focusDurationSeconds / 60);
focusDuration.addEventListener("change", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  focusDurationSeconds = Number(focusDuration.value) * 60;
  focusSeconds = focusDurationSeconds;
  localStorage.setItem(DURATION_KEY, String(focusDurationSeconds / 60));
  timerButton.textContent = "Start sprint";
  updateTimer();
});

timerButton.addEventListener("click", () => {
  if (!selectedTaskId) return;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerButton.textContent = "Resume sprint";
    return;
  }
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  timerInterval = setInterval(() => {
    focusSeconds -= 1;
    updateTimer();
    if (focusSeconds <= 0) finishSprint();
  }, 1000);
  timerButton.textContent = "Pause sprint";
});

resetTimerButton.addEventListener("click", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  focusSeconds = focusDurationSeconds;
  timerButton.textContent = "Start sprint";
  updateTimer();
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
  localStorage.setItem("studyTheme", nextTheme);
  applyTheme(nextTheme);
});

applyTheme(loadTheme());
updateTimer();
renderTasks();
renderHistory();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
