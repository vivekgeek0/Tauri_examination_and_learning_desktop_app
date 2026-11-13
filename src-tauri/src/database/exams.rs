use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::exam::{
    AttemptSummary, ExamAnswerUpdate, ExamQuestionRow, NewAttempt,
};

pub fn create_attempt(conn: &Connection, a: &NewAttempt) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO exam_attempts
           (mode, source_label, started_at, ends_at, duration_seconds,
            total_questions, total_marks, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active')",
        params![
            a.mode,
            a.source_label,
            a.started_at,
            a.ends_at,
            a.duration_seconds,
            a.total_questions,
            a.total_marks
        ],
    )
    .map_err(|e| format!("insert attempt: {e}"))?;
    Ok(conn.last_insert_rowid())
}

pub fn insert_exam_questions(
    conn: &Connection,
    attempt_id: i64,
    rows: &[(i64, i64)], // (question_id, question_order)
) -> AppResult<()> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin tx: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO exam_questions
                   (exam_attempt_id, question_id, question_order, response_status)
                 VALUES (?1, ?2, ?3, 'not_answered')",
            )
            .map_err(|e| format!("prepare eq: {e}"))?;
        for (qid, order) in rows {
            stmt.execute(params![attempt_id, qid, order])
                .map_err(|e| format!("insert eq: {e}"))?;
        }
    }
    tx.commit().map_err(|e| format!("commit eq: {e}"))?;
    Ok(())
}

pub fn list_exam_question_ids(conn: &Connection, attempt_id: i64) -> AppResult<Vec<(i64, i64)>> {
    let mut stmt = conn
        .prepare(
            "SELECT question_id, question_order FROM exam_questions
             WHERE exam_attempt_id=?1 ORDER BY question_order",
        )
        .map_err(|e| format!("prepare list eq: {e}"))?;
    let rows = stmt
        .query_map(params![attempt_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("query list eq: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn get_exam_question_rows(
    conn: &Connection,
    attempt_id: i64,
) -> AppResult<Vec<ExamQuestionRow>> {
    let mut stmt = conn
        .prepare(
            "SELECT eq.question_id, eq.question_order, eq.selected_answer,
                    eq.is_correct, eq.is_marked_review, eq.marks_awarded,
                    eq.response_status,
                    q.question, q.option_1, q.option_2, q.option_3, q.option_4,
                    q.right_option, q.explanation
             FROM exam_questions eq
             INNER JOIN questions q ON q.id = eq.question_id
             WHERE eq.exam_attempt_id=?1
             ORDER BY eq.question_order",
        )
        .map_err(|e| format!("prepare eq rows: {e}"))?;
    let rows = stmt
        .query_map(params![attempt_id], |row| {
            Ok(ExamQuestionRow {
                question_id: row.get(0)?,
                question_order: row.get(1)?,
                selected_answer: row.get(2)?,
                is_correct: row.get(3)?,
                is_marked_review: row.get(4)?,
                marks_awarded: row.get(5)?,
                response_status: row.get(6)?,
                question: row.get(7)?,
                option_1: row.get(8)?,
                option_2: row.get(9)?,
                option_3: row.get(10)?,
                option_4: row.get(11)?,
                right_option: row.get(12)?,
                explanation: row.get::<_, Option<String>>(13)?.unwrap_or_default(),
            })
        })
        .map_err(|e| format!("query eq rows: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn apply_answer(conn: &Connection, attempt_id: i64, upd: &ExamAnswerUpdate) -> AppResult<()> {
    conn.execute(
        "UPDATE exam_questions
            SET selected_answer=?1,
                is_correct=?2,
                marks_awarded=?3,
                response_status='answered'
          WHERE exam_attempt_id=?4 AND question_id=?5",
        params![
            upd.selected_answer,
            upd.is_correct as i64,
            upd.marks_awarded,
            attempt_id,
            upd.question_id
        ],
    )
    .map_err(|e| format!("apply answer: {e}"))?;
    Ok(())
}

pub fn clear_answer(conn: &Connection, attempt_id: i64, question_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE exam_questions
            SET selected_answer=NULL, is_correct=0, marks_awarded=0,
                response_status='not_answered'
          WHERE exam_attempt_id=?1 AND question_id=?2",
        params![attempt_id, question_id],
    )
    .map_err(|e| format!("clear answer: {e}"))?;
    Ok(())
}

pub fn set_marked_review(
    conn: &Connection,
    attempt_id: i64,
    question_id: i64,
    marked: bool,
) -> AppResult<()> {
    conn.execute(
        "UPDATE exam_questions SET is_marked_review=?1
          WHERE exam_attempt_id=?2 AND question_id=?3",
        params![marked as i64, attempt_id, question_id],
    )
    .map_err(|e| format!("set marked: {e}"))?;
    Ok(())
}

pub fn get_active_attempt(conn: &Connection) -> AppResult<Option<AttemptSummary>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, mode, source_label, started_at, ends_at, duration_seconds,
                    total_questions, total_marks, status
             FROM exam_attempts WHERE status='active' ORDER BY id DESC LIMIT 1",
        )
        .map_err(|e| format!("prepare active: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AttemptSummary {
                id: row.get(0)?,
                mode: row.get(1)?,
                source_label: row.get(2)?,
                started_at: row.get(3)?,
                ends_at: row.get::<_, Option<String>>(4)?,
                duration_seconds: row.get(5)?,
                total_questions: row.get(6)?,
                total_marks: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(|e| format!("query active: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out.into_iter().next())
}

pub fn finalize_attempt(
    conn: &Connection,
    attempt_id: i64,
    completed_at: &str,
    duration_seconds: i64,
    correct: i64,
    wrong: i64,
    unanswered: i64,
    obtained_marks: f64,
    accuracy: f64,
    percentage: f64,
) -> AppResult<()> {
    conn.execute(
        "UPDATE exam_attempts
            SET status='completed',
                completed_at=?1,
                duration_seconds=?2,
                correct_count=?3,
                wrong_count=?4,
                unanswered_count=?5,
                obtained_marks=?6,
                accuracy=?7,
                percentage=?8
          WHERE id=?9",
        params![
            completed_at,
            duration_seconds,
            correct,
            wrong,
            unanswered,
            obtained_marks,
            accuracy,
            percentage,
            attempt_id
        ],
    )
    .map_err(|e| format!("finalize: {e}"))?;
    Ok(())
}

pub fn abandon_attempt(conn: &Connection, attempt_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE exam_attempts SET status='abandoned' WHERE id=?1",
        params![attempt_id],
    )
    .map_err(|e| format!("abandon: {e}"))?;
    Ok(())
}

pub fn list_history(conn: &Connection, limit: i64) -> AppResult<Vec<HistoryRow>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, mode, source_label, started_at, completed_at, duration_seconds,
                    total_questions, correct_count, wrong_count, unanswered_count,
                    total_marks, obtained_marks, accuracy, percentage, status
             FROM exam_attempts
             WHERE status='completed'
             ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| format!("prepare history: {e}"))?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(HistoryRow {
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
        })
        .map_err(|e| format!("query history: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub struct HistoryRow {
    pub id: i64,
    pub mode: String,
    pub source_label: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_seconds: i64,
    pub total_questions: i64,
    pub correct_count: i64,
    pub wrong_count: i64,
    pub unanswered_count: i64,
    pub total_marks: f64,
    pub obtained_marks: f64,
    pub accuracy: f64,
    pub percentage: f64,
    pub status: String,
}
