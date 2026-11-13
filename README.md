# ExamPracticeStudio

A **Tauri v2 + Rust + SQLite** offline desktop examination and practice
application for Windows 10 / 11. The question-card interface is preserved
verbatim from the supplied HTML reference (`deepseek_html_20261002_3cd61a.html`)
so users see the same UI they are already familiar with.

## Highlights

- **Exact 8-column `questions` table** — `id` (autoincrement) + the seven
  original CSV fields (`question, option_1, option_2, option_3, option_4,
  right_option, explanation`). No subject/topic/difficulty columns.
- **SQLite persistence** — questions, settings, exam attempts, answers,
  results and snapshots all live in `exam_studio.db` inside the user's
  per-user app data directory. Nothing is lost on restart.
- **CSV import** with auto-delimiter detection (pipe `|` for the supplied
  sample, also comma `,`, tab, semicolon), preview, duplicate handling and
  transactional writes. Each import becomes a *question set* you can manage.
- **Question bank** with paginated listing, full-text search across question
  text / options / explanation, edit and delete.
- **Practice Mode** — preserves the original HTML interface: question cards,
  four options, *Check Answer* button, immediate correct/incorrect feedback,
  explanation panel with per-wrong-option bullets, live score bar, live timer,
  search, expand/collapse all, section dividers.
- **Exam Mode** — same visual design, countdown timer, question palette,
  marked-for-review, no immediate feedback, manual or automatic submission,
  backend-computed result.
- **Random unique question selection** from the entire bank or from selected
  imported sets, with optional exclusion of previously attempted questions.
- **Answer persistence + recovery** — every answer is saved to SQLite as the
  user progresses. If the app closes mid-exam, the unfinished attempt is
  detected on next launch and the user can resume or abandon it.
- **Backend-graded results** — the final score, accuracy and percentage are
  recomputed in Rust from the saved answers; the frontend's values are never
  trusted for grading.
- **Snapshots** — when an exam is completed, every question is snapshotted so
  historical review stays accurate even if the original question is later
  edited or deleted.
- **Results & history** — list of all completed attempts with one-click review
  and aggregate performance statistics.

## Project layout

```
tauri-exam-app/
├── index.html                  # Vite entry
├── package.json
├── vite.config.js
├── src/                        # Frontend (vanilla JS, no framework)
│   ├── main.js                 # Entry point
│   ├── navigation.js           # Mini router
│   ├── styles/
│   │   ├── original.css        # Verbatim CSS from the supplied HTML reference
│   │   └── app.css             # App chrome (top bar, dashboard, panels)
│   ├── lib/
│   │   ├── api.js              # Tauri command wrappers
│   │   ├── controls.js         # Dark mode, back-to-top, toast
│   │   └── question-card.js    # Question-card renderer (preserved from reference)
│   └── screens/
│       ├── dashboard.js
│       ├── question-bank.js
│       ├── import.js
│       ├── settings.js
│       ├── practice.js         # Practice Mode (original interface)
│       ├── exam.js             # Timed Exam Mode
│       ├── results.js
│       └── history.js
├── src-tauri/                  # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/default.json
│   ├── icons/                  # App icons
│   └── src/
│       ├── main.rs             # Windows entry
│       ├── lib.rs              # Tauri builder + command registration
│       ├── database/
│       │   ├── mod.rs
│       │   ├── connection.rs   # SQLite open + pragmas (WAL, FK, busy_timeout)
│       │   ├── migrations.rs   # Schema (questions + supporting tables)
│       │   ├── questions.rs
│       │   ├── question_sets.rs
│       │   ├── settings.rs
│       │   ├── exams.rs
│       │   └── results.rs
│       ├── models/
│       │   ├── mod.rs
│       │   ├── question.rs
│       │   ├── exam.rs
│       │   ├── settings.rs
│       │   └── result.rs
│       ├── services/
│       │   ├── mod.rs
│       │   ├── csv_service.rs
│       │   ├── question_service.rs
│       │   ├── exam_service.rs
│       │   └── result_service.rs
│       └── commands/
│           ├── mod.rs
│           ├── dashboard.rs
│           ├── import.rs
│           ├── questions.rs
│           ├── settings.rs
│           ├── exams.rs
│           └── results.rs
└── sample-data/
    └── set_4.csv               # The supplied 80-question sample
```

## Build prerequisites (Windows)

Install on your Windows machine:

1. **Node.js 18+ LTS** — https://nodejs.org/
2. **Rust (stable)** — https://www.rust-lang.org/tools/install
3. **Microsoft Visual Studio C++ Build Tools** — choose the *Desktop
   development with C++* workload. (Required by `rustc` on Windows.)
4. **WebView2 Runtime** — preinstalled on Windows 11; on Windows 10 install
   from https://developer.microsoft.com/microsoft-edge/webview2/

Verify the toolchain:

```powershell
node -v
npm -v
rustc --version
cargo --version
```

## Build & run

From the project root:

```powershell
# Install JS dependencies (one-time)
npm install

# Run in development (hot reload)
npm run tauri dev

# Produce the Windows installer
npm run tauri build
```

The built installer and standalone executable are placed in
`src-tauri/target/release/bundle/`:

- `src-tauri/target/release/bundle/msi/ExamPracticeStudio_1.0.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/ExamPracticeStudio_1.0.0_x64-setup.exe`

The first build downloads and compiles Rust dependencies (Tauri, rusqlite,
etc.); expect 5–15 minutes depending on your machine. Subsequent builds are
much faster.

## Where is my data?

The SQLite database lives in the per-user app data directory:

```
%APPDATA%\com.examplerstudio.app\exam_studio.db
```

(`%APPDATA%` typically expands to `C:\Users\<you>\AppData\Roaming`.)

Backups: copy `exam_studio.db` (and the `-wal` / `-shm` files if present)
somewhere safe. To start over with a clean database, simply delete those
files while the app is closed.

## First-run usage

1. Launch **ExamPracticeStudio**.
2. Open **Import CSV** → *Pick CSV file…* → select `sample-data/set_4.csv`.
3. Confirm the import. 80 questions are loaded.
4. Open **Exam Settings** and tweak the marking scheme / duration / source.
5. Click **Start Exam** from the dashboard.
6. Answer questions; the timer counts down. Hit **Submit Exam** when done
   (or wait for auto-submit when time runs out).
7. Review your answers from the result screen, then check **History** for
   long-term stats.

## Design notes

- **Original interface preserved.** `src/styles/original.css` is the verbatim
  CSS extracted from `deepseek_html_20261002_3cd61a.html`. `src/lib/question-card.js`
  rebuilds the same DOM structure the original JS produced, so every original
  selector still applies. Practice Mode behaves like the reference; Exam Mode
  reuses the same cards but hides the answer block until submission.
- **`right_option` stored as full text.** The sample CSV stores the correct
  answer text (e.g. `All of the above`) in `right_option`, not a letter. The
  application derives the letter on the fly for display and grades by
  comparing the user's chosen option text against the stored `right_option`
  text using normalised comparison.
- **No metadata columns on `questions`.** The seven CSV columns plus `id` are
  the only columns. Sets, settings, attempts, answers, results and snapshots
  are all in their own tables. Foreign keys are ON. The `exam_questions` →
  `questions` link uses `ON DELETE RESTRICT` so deleting a question that
  belongs to a historical attempt fails loudly instead of corrupting history.
- **Recovery.** When the app starts it queries for an `active` attempt; if
  one exists, the dashboard shows a banner offering *Resume* or *Abandon*.
  Starting a new attempt while one is already active is refused.
- **Backend grading.** `services/exam_service::submit` re-reads every
  `exam_questions` row, compares `selected_answer` against the question's
  `right_option`, recomputes marks/accuracy/percentage, then writes the
  final result and snapshots every question in one transactional flow.

## Troubleshooting

- **`error: failed to run custom build command for tauri-build`** — install
  the Visual Studio C++ Build Tools (see prerequisites).
- **`WebView2Loader.dll not found`** — install the WebView2 Runtime.
- **`npm install` fails on `@tauri-apps/cli`** — make sure Node.js is at
  least 18 LTS.
- **Database is locked / busy** — close any other instance of the app, then
  retry. The busy timeout is set to 5 seconds so brief locks should not error.
- **Want a fresh database?** Delete the `exam_studio.db*` files in
  `%APPDATA%\com.examplerstudio.app\` while the app is closed.
