// Tauri command handlers. Each function is `#[tauri::command]` and accepts a
// `State<AppState>` plus any serialisable arguments from the frontend.
//
// All handlers lock the shared SQLite connection, delegate to the appropriate
// service, and return serialisable results. Errors are returned as plain
// Strings so the frontend can render them without depending on Rust error
// types.

pub mod dashboard;
pub mod exams;
pub mod import;
pub mod questions;
pub mod results;
pub mod settings;
