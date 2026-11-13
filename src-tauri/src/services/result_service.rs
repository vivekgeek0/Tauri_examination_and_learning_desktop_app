// Result service: aggregates history and performance statistics.

use rusqlite::Connection;

use crate::database::{exams as edb, results as rdb};
use crate::error::AppResult;
use crate::models::result::{ExamResultSummary, PerformanceStats, ReviewQuestion, WrongAnsweredQuestion};

pub fn get_summary(conn: &Connection, attempt_id: i64) -> AppResult<ExamResultSummary> {
    rdb::get_attempt_summary(conn, attempt_id)
}

pub fn get_review(conn: &Connection, attempt_id: i64) -> AppResult<Vec<ReviewQuestion>> {
    rdb::get_review_questions(conn, attempt_id)
}

pub fn get_history(conn: &Connection, limit: i64) -> AppResult<Vec<ExamResultSummary>> {
    let rows = edb::list_history(conn, limit)?;
    Ok(rdb::history_rows_to_summary(rows))
}

pub fn get_wrong_answered(conn: &Connection) -> AppResult<Vec<WrongAnsweredQuestion>> {
    rdb::get_wrong_answered(conn)
}

pub fn get_performance(conn: &Connection) -> AppResult<PerformanceStats> {
    let rows = edb::list_history(conn, 1000)?;
    let summaries = rdb::history_rows_to_summary(rows);

    let total_exams = summaries.len() as i64;
    let mut best_percentage = 0.0f64;
    let mut average_percentage = 0.0f64;
    let mut average_accuracy = 0.0f64;
    let mut best_accuracy = 0.0f64;
    let mut total_questions_attempted = 0i64;
    let mut total_correct = 0i64;

    for s in &summaries {
        if s.percentage > best_percentage {
            best_percentage = s.percentage;
        }
        if s.accuracy > best_accuracy {
            best_accuracy = s.accuracy;
        }
        average_percentage += s.percentage;
        average_accuracy += s.accuracy;
        total_questions_attempted += s.correct_count + s.wrong_count;
        total_correct += s.correct_count;
    }
    if !summaries.is_empty() {
        average_percentage /= summaries.len() as f64;
        average_accuracy /= summaries.len() as f64;
    }

    let recent: Vec<ExamResultSummary> = summaries.into_iter().take(10).collect();

    Ok(PerformanceStats {
        total_exams,
        best_percentage,
        average_percentage,
        average_accuracy,
        best_accuracy,
        total_questions_attempted,
        total_correct,
        recent,
    })
}
