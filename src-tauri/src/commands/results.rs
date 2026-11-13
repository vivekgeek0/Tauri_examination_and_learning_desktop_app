use tauri::State;

use crate::error::AppResult;
use crate::models::result::{ExamResultSummary, PerformanceStats, ReviewQuestion, WrongAnsweredQuestion};
use crate::services::result_service;
use crate::AppState;

#[tauri::command]
pub fn get_exam_result(state: State<'_, AppState>, attempt_id: i64) -> AppResult<ExamResultSummary> {
    let conn = state.conn();
    result_service::get_summary(&conn, attempt_id)
}

#[tauri::command]
pub fn get_exam_history(state: State<'_, AppState>, limit: Option<i64>) -> AppResult<Vec<ExamResultSummary>> {
    let conn = state.conn();
    result_service::get_history(&conn, limit.unwrap_or(200))
}

#[tauri::command]
pub fn get_exam_review(state: State<'_, AppState>, attempt_id: i64) -> AppResult<Vec<ReviewQuestion>> {
    let conn = state.conn();
    result_service::get_review(&conn, attempt_id)
}

#[tauri::command]
pub fn get_performance_statistics(state: State<'_, AppState>) -> AppResult<PerformanceStats> {
    let conn = state.conn();
    result_service::get_performance(&conn)
}

/// Returns every question the user has ever answered wrong (across all
/// completed exams), with options, correct answer, explanation, wrong count
/// and last wrong selection.
#[tauri::command]
pub fn get_wrong_answered_questions(state: State<'_, AppState>) -> AppResult<Vec<WrongAnsweredQuestion>> {
    let conn = state.conn();
    result_service::get_wrong_answered(&conn)
}
