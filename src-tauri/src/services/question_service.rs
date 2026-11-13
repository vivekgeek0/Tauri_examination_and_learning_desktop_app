// Question service — thin orchestration above the database layer.

use rusqlite::Connection;

use crate::database::questions as qdb;
use crate::error::AppResult;
use crate::models::question::{Question, QuestionListItem};

pub fn get_count(conn: &Connection) -> AppResult<i64> {
    qdb::count(conn)
}

pub fn paginate(
    conn: &Connection,
    page: i64,
    page_size: i64,
) -> AppResult<Vec<QuestionListItem>> {
    let offset = ((page - 1).max(0)) * page_size;
    qdb::paginate(conn, offset, page_size)
}

pub fn search(
    conn: &Connection,
    needle: &str,
    page: i64,
    page_size: i64,
) -> AppResult<(Vec<QuestionListItem>, i64)> {
    let offset = ((page - 1).max(0)) * page_size;
    qdb::search(conn, needle, offset, page_size)
}

pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<Question>> {
    qdb::get_by_id(conn, id)
}

pub fn update(conn: &Connection, q: &Question) -> AppResult<()> {
    qdb::update(
        conn,
        q.id,
        &q.question,
        &q.option_1,
        &q.option_2,
        &q.option_3,
        &q.option_4,
        &q.right_option,
        &q.explanation,
    )
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    qdb::delete(conn, id)
}

/// Compares the user's selected option text to the question's right_option
/// text. Returns true on exact match (after normalisation).
///
/// The sample CSV stores the FULL CORRECT ANSWER TEXT in right_option
/// (e.g. "All of the above"), NOT a letter. The frontend sends the option
/// text the user clicked; this function does the comparison.
pub fn is_answer_correct(q: &Question, selected_option_text: &str) -> bool {
    fn norm(s: &str) -> String {
        s.trim()
            .to_lowercase()
            .trim_end_matches('.')
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }
    norm(&q.right_option) == norm(selected_option_text)
}

/// Same comparison but on raw strings — used by the exam engine when grading.
pub fn matches_right_option(right_option: &str, selected_option_text: &str) -> bool {
    fn norm(s: &str) -> String {
        s.trim()
            .to_lowercase()
            .trim_end_matches('.')
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }
    norm(right_option) == norm(selected_option_text)
}
