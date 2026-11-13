# Brightwork

Brightwork is a calm, browser-based study task tracker. It helps you turn a study plan into focused action without needing an account, a database, or external libraries.

## What it includes

- Add, edit, complete, and delete study tasks
- Add due dates, priorities, and categories
- Filter tasks by all, active, completed, or high priority
- Choose a focus task and a focus duration
- Pause, resume, and reset focus sprints
- Record a finished sprint without automatically completing its task
- Choose **Mark task complete**, **Continue focusing**, or **Choose another task** after a sprint
- Set a daily focus goal and track completed focus minutes, tasks finished today, sprints today, and study streaks
- Recover running and paused sprints after a refresh or device sleep
- View a 28-day study history
- Switch between light and dark mode
- Import tasks from Brightwork JSON, flexible JSON, CSV, or plain text
- Preview imports before adding them or replacing existing tasks
- Export a complete JSON backup
- Request browser notifications when a focus sprint finishes
- Install as a phone-like app through PWA support
- Work offline after the service worker has cached the app

## Run it locally

Brightwork is a static website, so it does not need `npm install` or a build step.

### Option 1: Open the file

Double-click `index.html`.

This is enough to use tasks and the timer. However, service workers, notifications, and PWA installation work best when the app is served over `localhost` or HTTPS.

### Option 2: Use a local server

If Python is installed:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also use the VS Code Live Server extension if you already have it installed.

### Option 3: Use Node.js

If Node.js is installed, no dependency installation is needed:

```powershell
npm start
```

Open `http://127.0.0.1:8000`. The development server listens only on your computer.

## Your daily study loop

1. Add a task, then select it in the focus panel near the top of the page.
2. Choose a focus length and start your sprint. The task and duration stay attached to that sprint until you finish or reset it.
3. Pause and resume whenever you need to. Refreshing the page preserves the sprint; a running timer catches up using its saved finish time.
4. When the sprint finishes, its full duration counts toward your daily focus goal. The task stays open until you choose **Mark task complete**.
5. Continue with the same task or choose another one.

Resetting a sprint discards that unfinished sprint. Minutes count only for completed sprints. A sprint that spans midnight counts on its scheduled finish day, using the device's local calendar. Daily totals reset at local midnight; adding future tasks does not reduce your progress.

Browser suspension or closing the app can delay the completion screen and notification. Brightwork catches up the next time the app runs; it does not run a background alarm while the browser is closed.

## Project structure

```text
brightwork/
├── index.html          # Page structure and accessible form controls
├── styles.css          # Warm visual design and responsive layout
├── script.js           # Tasks, timer, filters, import/export, and persistence
├── study-core.js       # Timestamp-based sprint state and daily progress calculations
├── manifest.json       # Installable PWA metadata
├── service-worker.js   # Offline caching
├── icon.svg            # Brightwork app icon
├── tests/              # Dependency-free timer, calendar, and offline regression tests
├── tools/serve.cjs     # Optional local Node.js server
└── README.md           # Project documentation
```

## How data is stored

Brightwork stores data locally in the browser with `localStorage`:

- Tasks use the `studyTasks` key
- Progress and history use the `studyStats` key
- Focus duration uses the `focusDuration` key
- Running, paused, and finished sprint state uses the `focusSession` key
- Daily focus goal uses the `dailyFocusGoal` key
- Theme preference uses the `studyTheme` key

Study stats retain completed sprint records so daily minutes can be calculated without depending on the current task list. Existing tasks and study history are preserved when upgrading. Older backups do not contain sprint durations, so historical focus minutes are not estimated.

There is no server-side account or external database. Data stays in the browser where Brightwork is used. Use **Export** regularly if you want a portable backup.

Clearing browser storage, using a private browsing window, or switching browsers can remove or hide your saved tasks.

## Import formats

### Brightwork or flexible JSON

Brightwork backups use this structure:

```json
{
  "tasks": [
    {
      "text": "Review biology chapter 4",
      "dueDate": "2026-12-01",
      "priority": "high",
      "category": "Biology",
      "completed": false
    }
  ]
}
```

You can also import a JSON array directly. Common task fields such as `text`, `title`, `name`, `task`, and `description` are recognized.

### CSV

```csv
task,dueDate,priority,category,completed
Review chapter 4,2026-12-01,high,Biology,false
Practice equations,tomorrow,medium,Math,false
```

### Plain text

One task per line:

```text
Review chapter 3
Practice algebra
Prepare biology notes
```

You can add optional details with pipe separators:

```text
Review calculus notes | high | Mathematics | tomorrow
```

The import screen previews the tasks and lets you choose **Add to my tasks** or **Replace my tasks**. Duplicate task names are skipped when adding.

New backups include the daily goal and completed sprint history, along with tasks, theme, and focus length. Replacing tasks restores those settings when present. Finish or reset an active sprint before replacing tasks; adding tasks remains available during a sprint. Active timers stay in their original browser and are not part of exported backups.

## Run checks

With a current Node.js version installed:

```powershell
npm test
```

The tests cover elapsed time after suspension, pause and refresh recovery, task binding, counting completed sprints once, daily rollover, local dates and daylight saving, legacy backups, and offline asset caching. No external test libraries are required.

## Notifications and permissions

When you start a focus sprint, Brightwork may ask for browser notification permission. If permission is granted, a notification appears when the sprint ends.

Notifications and PWA installation generally require HTTPS, except when running on `localhost`.

## Publish with GitHub Pages

1. Create a new GitHub repository, for example `brightwork`.
2. Upload the project files to the repository root.
3. Open the repository's **Settings**.
4. Select **Pages**.
5. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
6. Save the settings.

GitHub will provide a URL similar to:

```text
https://YOUR-USERNAME.github.io/brightwork/
```

Use the HTTPS URL when testing notifications and installing Brightwork.

## Publish with Netlify

After the project is in GitHub:

1. Sign in to Netlify.
2. Choose **Add new site** → **Import an existing project**.
3. Select GitHub and authorize the repository.
4. Choose the Brightwork repository.
5. Leave the build command empty.
6. Set the publish directory to:

```text
.
```

7. Deploy the site.

Netlify will give you an HTTPS URL and can automatically redeploy whenever you push changes to GitHub.

## Security notes

- Imported content is rendered as text rather than trusted HTML.
- Imported dates are normalized and invalid calendar dates are discarded.
- No external JavaScript libraries or remote scripts are required.
- Local task data is not uploaded anywhere by Brightwork.
- Treat exported backup files as private because they contain your task data and study history.

## Browser support

Brightwork works in current versions of Chrome, Edge, Firefox, and Safari. Some features depend on browser support:

- Notifications require permission and usually HTTPS
- Service workers and PWA installation require `localhost` or HTTPS
- Web storage can be disabled or limited by private browsing settings

## License

No license has been selected yet. If you publish Brightwork publicly, add a license such as MIT so others know how they may use the code.
