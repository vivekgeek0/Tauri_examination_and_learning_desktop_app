// Database layer: connection management, migrations and module re-exports.

pub mod connection;
pub mod migrations;

// Re-export the per-table helper modules so callers can do `database::questions::...`.
pub mod questions;
pub mod question_sets;
pub mod settings;
pub mod exams;
pub mod results;
