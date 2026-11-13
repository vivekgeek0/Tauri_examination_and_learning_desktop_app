use serde::Serialize;
use tauri::State;

use crate::commands::settings;
use crate::error::AppResult;
use crate::models::exam::{AttemptSummary, ExamQuestionRow};
use crate::models::result::ExamResultSummary;
use crate::services::exam_service;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct StartedExamDto {
    pub attempt_id: i64,
    pub mode: String,
    pub source_label: String,
    pub started_at: String,
    pub ends_at: Option<String>,
    pub duration_seconds: i64,
    pub total_questions: i64,
    pub total_marks: f64,
    pub questions: Vec<ExamQuestionRowDto>,
}

#[derive(Debug, Serialize)]
pub struct ExamQuestionRowDto {
    pub question_id: i64,
    pub question_order: i64,
    pub selected_answer: Option<String>,
    pub is_correct: i64,
    pub is_marked_review: i64,
    pub marks_awarded: f64,
    pub response_status: String,
    pub question: String,
    pub option_1: String,
    pub option_2: String,
    pub option_3: String,
    pub option_4: String,
    pub right_option: String,
    pub explanation: String,
}

impl From<ExamQuestionRow> for ExamQuestionRowDto {
    fn from(r: ExamQuestionRow) -> Self {
        Self {
            question_id: r.question_id,
            question_order: r.question_order,
            selected_answer: r.selected_answer,
            is_correct: r.is_correct,
            is_marked_review: r.is_marked_review,
            marks_awarded: r.marks_awarded,
            response_status: r.response_status,
            question: r.question,
            option_1: r.option_1,
            option_2: r.option_2,
            option_3: r.option_3,
            option_4: r.option_4,
            right_option: r.right_option,
            explanation: r.explanation,
        }
    }
}

#[tauri::command]
pub fn start_exam(state: State<'_, AppState>, mode: String) -> AppResult<StartedExamDto> {
    let conn = state.conn();
    let s = settings::current_settings(&conn);
    let started = exam_service::start(&conn, &s, &mode)?;
    Ok(StartedExamDto {
        attempt_id: started.attempt_id,
        mode: started.mode,
        source_label: started.source_label,
        started_at: started.started_at,
        ends_at: started.ends_at,
        duration_seconds: started.duration_seconds,
        total_questions: started.total_questions,
        total_marks: started.total_marks,
        questions: started.questions.into_iter().map(Into::into).collect(),
    })
}

#[tauri::command]
pub fn get_exam_questions(state: State<'_, AppState>, attempt_id: i64) -> AppResult<Vec<ExamQuestionRowDto>> {
    let conn = state.conn();
    let rows = exam_service::get_questions(&conn, attempt_id)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

/// Starts an exam with a user-specified list of question IDs (from the
/// question bank "query & select" feature). The saved settings still control
/// duration and marking scheme; only the question selection is overridden.
#[tauri::command]
pub fn start_custom_exam(
    state: State<'_, AppState>,
    question_ids: Vec<i64>,
    mode: String,
) -> AppResult<StartedExamDto> {
    let conn = state.conn();
    let s = settings::current_settings(&conn);
    let started = exam_service::start_with_questions(&conn, &question_ids, &mode, &s)?;
    Ok(StartedExamDto {
        attempt_id: started.attempt_id,
        mode: started.mode,
        source_label: started.source_label,
        started_at: started.started_at,
        ends_at: started.ends_at,
        duration_seconds: started.duration_seconds,
        total_questions: started.total_questions,
        total_marks: started.total_marks,
        questions: started.questions.into_iter().map(Into::into).collect(),
    })
}

/// Starts an exam using all questions that belong to a specific imported set.
/// Used by the "Start Exam" button next to each set in the Import CSV screen.
#[tauri::command]
pub fn start_exam_with_set(
    state: State<'_, AppState>,
    set_id: i64,
    mode: String,
) -> AppResult<StartedExamDto> {
    let conn = state.conn();
    let s = settings::current_settings(&conn);
    let started = exam_service::start_with_set(&conn, set_id, &mode, &s)?;
    Ok(StartedExamDto {
        attempt_id: started.attempt_id,
        mode: started.mode,
        source_label: started.source_label,
        started_at: started.started_at,
        ends_at: started.ends_at,
        duration_seconds: started.duration_seconds,
        total_questions: started.total_questions,
        total_marks: started.total_marks,
        questions: started.questions.into_iter().map(Into::into).collect(),
    })
}

#[tauri::command]
pub fn save_exam_answer(
    state: State<'_, AppState>,
    attempt_id: i64,
    question_id: i64,
    selected_option_text: String,
) -> AppResult<()> {
    let conn = state.conn();
    let s = settings::current_settings(&conn);
    exam_service::save_answer(&conn, attempt_id, question_id, &selected_option_text, &s)
}

#[tauri::command]
pub fn clear_exam_answer(
    state: State<'_, AppState>,
    attempt_id: i64,
    question_id: i64,
) -> AppResult<()> {
    let conn = state.conn();
    exam_service::clear_answer(&conn, attempt_id, question_id)
}

#[tauri::command]
pub fn mark_question_for_review(
    state: State<'_, AppState>,
    attempt_id: i64,
    question_id: i64,
    marked: bool,
) -> AppResult<()> {
    let conn = state.conn();
    exam_service::mark_review(&conn, attempt_id, question_id, marked)
}

#[tauri::command]
pub fn get_active_exam(state: State<'_, AppState>) -> AppResult<Option<AttemptSummary>> {
    let conn = state.conn();
    exam_service::get_active(&conn)
}

#[tauri::command]
pub fn submit_exam(state: State<'_, AppState>, attempt_id: i64) -> AppResult<ExamResultSummary> {
    let conn = state.conn();
    let s = settings::current_settings(&conn);
    exam_service::submit(&conn, attempt_id, &s)
}

#[tauri::command]
pub fn abandon_exam(state: State<'_, AppState>, attempt_id: i64) -> AppResult<()> {
    let conn = state.conn();
    exam_service::abandon(&conn, attempt_id)
}
