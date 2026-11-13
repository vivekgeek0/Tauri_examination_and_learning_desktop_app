use tauri::State;

use crate::database::settings as sdb;
use crate::error::AppResult;
use crate::models::exam::ExamSettings;
use crate::AppState;

const KEY_NUM_QUESTIONS: &str = "num_questions";
const KEY_DURATION: &str = "duration_minutes";
const KEY_MARKS_CORRECT: &str = "marks_per_correct";
const KEY_NEGATIVE: &str = "negative_marks_per_wrong";
const KEY_UNANSWERED: &str = "marks_per_unanswered";
const KEY_RANDOM_Q: &str = "random_questions";
const KEY_RANDOM_O: &str = "random_options";
const KEY_SOURCE_MODE: &str = "source_mode";
const KEY_SET_IDS: &str = "selected_set_ids";
const KEY_DEFAULT_MODE: &str = "default_mode";
const KEY_REPEAT_POLICY: &str = "repeat_policy";

fn parse_set_ids(s: &str) -> Vec<i64> {
    s.split(',')
        .filter_map(|p| p.trim().parse::<i64>().ok())
        .collect()
}

fn settings_from_db(conn: &rusqlite::Connection) -> ExamSettings {
    let mut s = ExamSettings::default();
    if let Ok(Some(v)) = sdb::get(conn, KEY_NUM_QUESTIONS) {
        if let Ok(n) = v.parse() { s.num_questions = n; }
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_DURATION) {
        if let Ok(n) = v.parse() { s.duration_minutes = n; }
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_MARKS_CORRECT) {
        if let Ok(n) = v.parse() { s.marks_per_correct = n; }
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_NEGATIVE) {
        if let Ok(n) = v.parse() { s.negative_marks_per_wrong = n; }
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_UNANSWERED) {
        if let Ok(n) = v.parse() { s.marks_per_unanswered = n; }
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_RANDOM_Q) {
        s.random_questions = v == "1" || v == "true";
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_RANDOM_O) {
        s.random_options = v == "1" || v == "true";
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_SOURCE_MODE) {
        s.source_mode = v;
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_SET_IDS) {
        s.selected_set_ids = parse_set_ids(&v);
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_DEFAULT_MODE) {
        s.default_mode = v;
    }
    if let Ok(Some(v)) = sdb::get(conn, KEY_REPEAT_POLICY) {
        s.repeat_policy = v;
    }
    s
}

#[tauri::command]
pub fn get_exam_setting(state: State<'_, AppState>) -> AppResult<ExamSettings> {
    let conn = state.conn();
    Ok(settings_from_db(&conn))
}

#[tauri::command]
pub fn save_exam_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> AppResult<()> {
    let conn = state.conn();
    sdb::set(&conn, &key, &value)
}

#[tauri::command]
pub fn save_exam_settings_bulk(state: State<'_, AppState>, settings: ExamSettings) -> AppResult<()> {
    let conn = state.conn();
    let set_ids = settings
        .selected_set_ids
        .iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let pairs = vec![
        (KEY_NUM_QUESTIONS.to_string(), settings.num_questions.to_string()),
        (KEY_DURATION.to_string(), settings.duration_minutes.to_string()),
        (KEY_MARKS_CORRECT.to_string(), settings.marks_per_correct.to_string()),
        (KEY_NEGATIVE.to_string(), settings.negative_marks_per_wrong.to_string()),
        (KEY_UNANSWERED.to_string(), settings.marks_per_unanswered.to_string()),
        (KEY_RANDOM_Q.to_string(), if settings.random_questions { "1" } else { "0" }.into()),
        (KEY_RANDOM_O.to_string(), if settings.random_options { "1" } else { "0" }.into()),
        (KEY_SOURCE_MODE.to_string(), settings.source_mode.clone()),
        (KEY_SET_IDS.to_string(), set_ids),
        (KEY_DEFAULT_MODE.to_string(), settings.default_mode.clone()),
        (KEY_REPEAT_POLICY.to_string(), settings.repeat_policy.clone()),
    ];
    sdb::set_many(&conn, &pairs)
}

/// Internal helper used by the exam commands so they always work from the
/// persisted settings.
pub fn current_settings(conn: &rusqlite::Connection) -> ExamSettings {
    settings_from_db(conn)
}
