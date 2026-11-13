// ============================================================================
// error.rs — application error type. Wraps rusqlite::Error (and generic
// String messages) so `?` works inside any function returning AppResult<T>.
// Implements Serialize so Tauri command handlers can return AppResult<T>
// directly without manual .map_err() at every call site.
// ============================================================================

use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Sqlite(rusqlite::Error),
    Other(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Sqlite(e) => write!(f, "{e}"),
            AppError::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for AppError {}

// --- Conversions so `?` works on rusqlite::Error and String inside any
// --- function that returns AppResult<T>. ---

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Sqlite(e)
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Other(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Other(s.to_string())
    }
}

// Serialize as a plain string so the frontend receives a readable message.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
