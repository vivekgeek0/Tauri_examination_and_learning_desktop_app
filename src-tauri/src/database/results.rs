use rusqlite::{params, Connection};

use crate::database::exams::HistoryRow;
use crate::error::AppResult;
use crate::models::result::{ExamResultSummary, ReviewQuestion, WrongAnsweredQuestion};

pub fn get_attempt_summary(conn: &Connection, attempt_id: i64) -> AppResult<ExamResultSummary> {
    conn.query_row(
        "SELECT id, mode, source_label, started_at, completed_at, duration_seconds,
                total_questions, correct_count, wrong_count, unanswered_count,
                total_marks, obtained_marks, accuracy, percentage, status
         FROM exam_attempts WHERE id=?1",
        params![attempt_id],
        |row| {
            Ok(ExamResultSummary {
                id: row.get(0)?,
                mode: row.get(1)?,
                source_label: row.get(2)?,
                started_at: row.get(3)?,
                completed_at: row.get::<_, Option<String>>(4)?,
                duration_seconds: row.get(5)?,
                total_questions: row.get(6)?,
                correct_count: row.get(7)?,
                wrong_count: row.get(8)?,
                unanswered_count: row.get(9)?,
                total_marks: row.get(10)?,
                obtained_marks: row.get(11)?,
                accuracy: row.get(12)?,
                percentage: row.get(13)?,
                status: row.get(14)?,
            })
        },
    )
    .map_err(|e| format!("get attempt summary: {e}"))
    .map_err(Into::into)
}

/// Reads the snapshot table first (preferred for completed attempts).
/// Falls back to live exam_questions+questions join for still-active attempts.
pub fn get_review_questions(
    conn: &Connection,
    attempt_id: i64,
) -> AppResult<Vec<ReviewQuestion>> {
    let snap_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exam_question_snapshots WHERE exam_attempt_id=?1",
            params![attempt_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("snap count: {e}"))?;

    if snap_count > 0 {
        let mut stmt = conn
            .prepare(
                "SELECT question_order, question_text, option_1, option_2, option_3,
                        option_4, right_option, explanation, selected_answer,
                        is_correct, is_marked_review, marks_awarded, response_status
                 FROM exam_question_snapshots
                 WHERE exam_attempt_id=?1
                 ORDER BY question_order",
            )
            .map_err(|e| format!("prepare snap: {e}"))?;
        let rows = stmt
            .query_map(params![attempt_id], |row| {
                Ok(ReviewQuestion {
                    question_order: row.get(0)?,
                    question: row.get(1)?,
                    option_1: row.get(2)?,
                    option_2: row.get(3)?,
                    option_3: row.get(4)?,
                    option_4: row.get(5)?,
                    right_option: row.get(6)?,
                    explanation: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                    selected_answer: row.get(8)?,
                    is_correct: row.get(9)?,
                    is_marked_review: row.get(10)?,
                    marks_awarded: row.get(11)?,
                    response_status: row.get(12)?,
                })
            })
            .map_err(|e| format!("query snap: {e}"))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("row: {e}"))?);
        }
        return Ok(out);
    }

    // Fallback: live join (for an in-progress attempt being reviewed, although
    // normally review only happens after submission which writes snapshots).
    let mut stmt = conn
        .prepare(
            "SELECT eq.question_order, q.question, q.option_1, q.option_2, q.option_3,
                    q.option_4, q.right_option, q.explanation, eq.selected_answer,
                    eq.is_correct, eq.is_marked_review, eq.marks_awarded, eq.response_status
             FROM exam_questions eq
             INNER JOIN questions q ON q.id = eq.question_id
             WHERE eq.exam_attempt_id=?1
             ORDER BY eq.question_order",
        )
        .map_err(|e| format!("prepare review fallback: {e}"))?;
    let rows = stmt
        .query_map(params![attempt_id], |row| {
            Ok(ReviewQuestion {
                question_order: row.get(0)?,
                question: row.get(1)?,
                option_1: row.get(2)?,
                option_2: row.get(3)?,
                option_3: row.get(4)?,
                option_4: row.get(5)?,
                right_option: row.get(6)?,
                explanation: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                selected_answer: row.get(8)?,
                is_correct: row.get(9)?,
                is_marked_review: row.get(10)?,
                marks_awarded: row.get(11)?,
                response_status: row.get(12)?,
            })
        })
        .map_err(|e| format!("query review fallback: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

/// Snapshots every question of a completed attempt so the historical review
/// remains accurate even if the source question is later edited or deleted.
pub fn write_snapshots(
    conn: &Connection,
    attempt_id: i64,
) -> AppResult<()> {
    let rows = crate::database::exams::get_exam_question_rows(conn, attempt_id)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin tx snap: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO exam_question_snapshots
                   (exam_attempt_id, question_id, question_order, question_text,
                    option_1, option_2, option_3, option_4, right_option, explanation,
                    selected_answer, is_correct, is_marked_review, marks_awarded,
                    response_status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            )
            .map_err(|e| format!("prepare snap insert: {e}"))?;
        for r in &rows {
            stmt.execute(params![
                attempt_id,
                r.question_id,
                r.question_order,
                r.question,
                r.option_1,
                r.option_2,
                r.option_3,
                r.option_4,
                r.right_option,
                r.explanation,
                r.selected_answer,
                r.is_correct,
                r.is_marked_review,
                r.marks_awarded,
                r.response_status,
            ])
            .map_err(|e| format!("snap insert row: {e}"))?;
        }
    }
    tx.commit().map_err(|e| format!("commit snap: {e}"))?;
    Ok(())
}

pub fn history_rows_to_summary(rows: Vec<HistoryRow>) -> Vec<ExamResultSummary> {
    rows.into_iter()
        .map(|r| ExamResultSummary {
            id: r.id,
            mode: r.mode,
            source_label: r.source_label,
            started_at: r.started_at,
            completed_at: r.completed_at,
            duration_seconds: r.duration_seconds,
            total_questions: r.total_questions,
            correct_count: r.correct_count,
            wrong_count: r.wrong_count,
            unanswered_count: r.unanswered_count,
            total_marks: r.total_marks,
            obtained_marks: r.obtained_marks,
            accuracy: r.accuracy,
            percentage: r.percentage,
            status: r.status,
        })
        .collect()
}

/// Returns every question the user has answered wrong at least once across all
/// completed exams, with the wrong-answer count and the most recent wrong
/// selection. Ordered by wrong count descending (most-missed first).
pub fn get_wrong_answered(conn: &Connection) -> AppResult<Vec<WrongAnsweredQuestion>> {
    let mut stmt = conn
        .prepare(
            "SELECT q.id, q.question, q.option_1, q.option_2, q.option_3, q.option_4,
                    q.right_option, q.explanation,
                    COUNT(eq.id) AS wrong_count,
                    (SELECT eq2.selected_answer
                       FROM exam_questions eq2
                       INNER JOIN exam_attempts a2 ON a2.id = eq2.exam_attempt_id
                       WHERE eq2.question_id = q.id AND eq2.is_correct = 0
                         AND eq2.response_status = 'answered' AND a2.status = 'completed'
                       ORDER BY eq2.id DESC LIMIT 1) AS last_wrong_answer
             FROM exam_questions eq
             INNER JOIN questions q ON q.id = eq.question_id
             INNER JOIN exam_attempts a ON a.id = eq.exam_attempt_id
             WHERE eq.is_correct = 0
               AND eq.response_status = 'answered'
               AND a.status = 'completed'
             GROUP BY q.id
             ORDER BY wrong_count DESC, q.id",
        )
        .map_err(|e| format!("prepare wrong_answered: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(WrongAnsweredQuestion {
                id: row.get(0)?,
                question: row.get(1)?,
                option_1: row.get(2)?,
                option_2: row.get(3)?,
                option_3: row.get(4)?,
                option_4: row.get(5)?,
                right_option: row.get(6)?,
                explanation: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                wrong_count: row.get(8)?,
                last_wrong_answer: row.get(9)?,
            })
        })
        .map_err(|e| format!("query wrong_answered: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}
