use serde::Serialize;
use tauri::State;

use crate::database::{question_sets, questions as qdb};
use crate::error::AppResult;
use crate::services::result_service;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_questions: i64,
    pub total_sets: i64,
    pub total_exams: i64,
    pub best_percentage: f64,
    pub average_percentage: f64,
    pub average_accuracy: f64,
    pub most_recent: Option<String>,
}

#[tauri::command]
pub fn get_dashboard_statistics(state: State<'_, AppState>) -> AppResult<DashboardStats> {
    let conn = state.conn();
    let total_questions = qdb::count(&conn)?;
    let sets = question_sets::list_sets(&conn)?;
    let total_sets = sets.len() as i64;
    let stats = result_service::get_performance(&conn)?;
    let most_recent = stats.recent.first().and_then(|s| s.completed_at.clone());

    Ok(DashboardStats {
        total_questions,
        total_sets,
        total_exams: stats.total_exams,
        best_percentage: stats.best_percentage,
        average_percentage: stats.average_percentage,
        average_accuracy: stats.average_accuracy,
        most_recent,
    })
}
