use tauri::State;

use crate::error::AppResult;
use crate::models::question::{Question, QuestionListItem};
use crate::services::question_service;
use crate::AppState;

#[tauri::command]
pub fn get_question_count(state: State<'_, AppState>) -> AppResult<i64> {
    let conn = state.conn();
    question_service::get_count(&conn)
}

#[tauri::command]
pub fn get_questions_paginated(
    state: State<'_, AppState>,
    page: i64,
    page_size: i64,
) -> AppResult<Vec<QuestionListItem>> {
    let conn = state.conn();
    question_service::paginate(&conn, page, page_size)
}

#[tauri::command]
pub fn search_questions(
    state: State<'_, AppState>,
    needle: String,
    page: i64,
    page_size: i64,
) -> AppResult<(Vec<QuestionListItem>, i64)> {
    let conn = state.conn();
    question_service::search(&conn, &needle, page, page_size)
}

#[tauri::command]
pub fn get_question_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Option<Question>> {
    let conn = state.conn();
    question_service::get_by_id(&conn, id)
}

#[tauri::command]
pub fn update_question(state: State<'_, AppState>, question: Question) -> AppResult<()> {
    let conn = state.conn();
    question_service::update(&conn, &question)
}

#[tauri::command]
pub fn delete_question(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let conn = state.conn();
    question_service::delete(&conn, id)
}
