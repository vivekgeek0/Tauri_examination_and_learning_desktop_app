// Schema migrations.
//
// IMPORTANT: The `questions` table has EXACTLY 8 columns and MUST NOT be
// modified: id (autoincrement PK) + the 7 original CSV fields
//   question, option_1, option_2, option_3, option_4, right_option, explanation
//
// All metadata (sets, settings, exam attempts, answers, results, snapshots)
// lives in supporting tables so the questions table stays untouched.

use rusqlite::Connection;

const SCHEMA: &str = r#"
-- ===== questions ============================================================
-- Exactly 8 columns. Do not add subject/topic/difficulty/etc.
CREATE TABLE IF NOT EXISTS questions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    question     TEXT NOT NULL,
    option_1     TEXT NOT NULL,
    option_2     TEXT NOT NULL,
    option_3     TEXT NOT NULL,
    option_4     TEXT NOT NULL,
    right_option TEXT NOT NULL,
    explanation  TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_text ON questions(question);

-- ===== question sets ========================================================
CREATE TABLE IF NOT EXISTS question_sets (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    set_name              TEXT NOT NULL,
    imported_question_count INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_set_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_set_id INTEGER NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    UNIQUE(question_set_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_qsi_set ON question_set_items(question_set_id);
CREATE INDEX IF NOT EXISTS idx_qsi_question ON question_set_items(question_id);

-- ===== settings =============================================================
CREATE TABLE IF NOT EXISTS app_settings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key   TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL
);

-- ===== exam attempts ========================================================
CREATE TABLE IF NOT EXISTS exam_attempts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    mode              TEXT NOT NULL,                 -- 'practice' | 'exam'
    source_label      TEXT NOT NULL,                 -- human-readable source
    started_at        TEXT NOT NULL,                 -- ISO 8601 UTC
    ends_at           TEXT,                          -- ISO 8601 UTC, NULL for practice
    completed_at      TEXT,
    duration_seconds  INTEGER NOT NULL DEFAULT 0,
    total_questions   INTEGER NOT NULL DEFAULT 0,
    correct_count     INTEGER NOT NULL DEFAULT 0,
    wrong_count       INTEGER NOT NULL DEFAULT 0,
    unanswered_count  INTEGER NOT NULL DEFAULT 0,
    total_marks       REAL    NOT NULL DEFAULT 0,
    obtained_marks    REAL    NOT NULL DEFAULT 0,
    accuracy          REAL    NOT NULL DEFAULT 0,
    percentage        REAL    NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'active' -- active | completed | abandoned
);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON exam_attempts(status);

-- ===== exam questions (one row per question selected for an attempt) ========
CREATE TABLE IF NOT EXISTS exam_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    question_order  INTEGER NOT NULL,
    selected_answer TEXT,        -- the option TEXT the user picked (matches questions.right_option convention)
    is_correct      INTEGER NOT NULL DEFAULT 0,
    is_marked_review INTEGER NOT NULL DEFAULT 0,
    marks_awarded   REAL    NOT NULL DEFAULT 0,
    response_status TEXT    NOT NULL DEFAULT 'not_answered', -- not_answered | answered
    UNIQUE(exam_attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_eq_attempt ON exam_questions(exam_attempt_id);

-- ===== exam question snapshots ==============================================
-- A historical attempt must remain reviewable even if the original question is
-- later edited or deleted. We snapshot the question text/options/explanation
-- at the time the exam is *completed*.
CREATE TABLE IF NOT EXISTS exam_question_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id     INTEGER,                          -- may be NULL after source deletion
    question_order  INTEGER NOT NULL,
    question_text   TEXT NOT NULL,
    option_1        TEXT NOT NULL,
    option_2        TEXT NOT NULL,
    option_3        TEXT NOT NULL,
    option_4        TEXT NOT NULL,
    right_option    TEXT NOT NULL,
    explanation     TEXT,
    selected_answer TEXT,
    is_correct      INTEGER NOT NULL DEFAULT 0,
    is_marked_review INTEGER NOT NULL DEFAULT 0,
    marks_awarded   REAL    NOT NULL DEFAULT 0,
    response_status TEXT    NOT NULL DEFAULT 'not_answered'
);
CREATE INDEX IF NOT EXISTS idx_snap_attempt ON exam_question_snapshots(exam_attempt_id);
"#;

pub fn run(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("migration failed: {e}"))?;
    Ok(())
}
