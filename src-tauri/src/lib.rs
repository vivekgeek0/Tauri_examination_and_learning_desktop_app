// ============================================================================
// ExamPracticeStudio - Tauri + Rust + SQLite application library root.
//
// The frontend (HTML/CSS/JS) calls into Rust via Tauri commands. All database
// operations live in the Rust backend. The frontend never touches SQLite
// directly and never holds the whole question bank in memory.
// ============================================================================

pub mod commands;
pub mod database;
pub mod error;
pub mod models;
pub mod services;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

/// Shared application state. The SQLite connection is wrapped in a Mutex so it
/// can be safely shared between Tauri command handlers running on the async
/// runtime. SQLite with a single writer connection is plenty for a desktop
/// single-user application and avoids the complexity of a connection pool.
pub struct AppState {
    pub db: Mutex<Connection>,
}

impl AppState {
    /// Locks the connection. Panics only if a previous handler poisoned the
    /// mutex (i.e. panicked while holding the lock); in that case restarting
    /// is the safe option.
    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.db
            .lock()
            .expect("database mutex poisoned; restart the application")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Resolve the database path inside the per-user app data directory
            // so it survives reinstalls and is writable on Windows.
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app_data_dir");

            let db_path = app_dir.join("exam_studio.db");
            log::info!("SQLite database path: {}", db_path.display());

            let conn = database::connection::open(&db_path)?;
            database::migrations::run(&conn)?;

            let state = AppState {
                db: Mutex::new(conn),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // dashboard
            commands::dashboard::get_dashboard_statistics,
            // import
            commands::import::preview_csv_import,
            commands::import::parse_csv_full,
            commands::import::confirm_csv_import,
            commands::import::get_question_sets,
            commands::import::delete_question_set,
            // questions
            commands::questions::get_question_count,
            commands::questions::get_questions_paginated,
            commands::questions::search_questions,
            commands::questions::get_question_by_id,
            commands::questions::update_question,
            commands::questions::delete_question,
            // settings
            commands::settings::get_exam_setting,
            commands::settings::save_exam_setting,
            commands::settings::save_exam_settings_bulk,
            // exams
            commands::exams::start_exam,
            commands::exams::start_custom_exam,
            commands::exams::start_exam_with_set,
            commands::exams::get_exam_questions,
            commands::exams::save_exam_answer,
            commands::exams::clear_exam_answer,
            commands::exams::mark_question_for_review,
            commands::exams::get_active_exam,
            commands::exams::submit_exam,
            commands::exams::abandon_exam,
            // results
            commands::results::get_exam_result,
            commands::results::get_exam_history,
            commands::results::get_exam_review,
            commands::results::get_performance_statistics,
            commands::results::get_wrong_answered_questions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
