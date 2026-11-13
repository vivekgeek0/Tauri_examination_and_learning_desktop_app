use tauri::State;

use crate::database::question_sets;
use crate::error::AppResult;
use crate::models::question::QuestionSet;
use crate::services::csv_service::{self, CsvPreview, ImportOutcome, ParsedRow};
use crate::AppState;

#[tauri::command]
pub fn preview_csv_import(_state: State<'_, AppState>, content: String, filename: String) -> AppResult<CsvPreview> {
    csv_service::preview(&content, &filename)
}

/// Parses a CSV and returns ALL valid rows without saving anything to the
/// database. Used by the Temporary Test mode.
#[tauri::command]
pub fn parse_csv_full(_state: State<'_, AppState>, content: String) -> AppResult<Vec<ParsedRow>> {
    csv_service::parse_all(&content)
}

#[tauri::command]
pub fn confirm_csv_import(
    state: State<'_, AppState>,
    content: String,
    filename: String,
    skip_duplicates: bool,
) -> AppResult<ImportOutcome> {
    let conn = state.conn();
    csv_service::confirm_import(&conn, &content, &filename, skip_duplicates)
}

#[tauri::command]
pub fn get_question_sets(state: State<'_, AppState>) -> AppResult<Vec<QuestionSet>> {
    let conn = state.conn();
    question_sets::list_sets(&conn)
}

#[tauri::command]
pub fn delete_question_set(state: State<'_, AppState>, set_id: i64) -> AppResult<()> {
    let conn = state.conn();
    question_sets::delete_set(&conn, set_id)
}
