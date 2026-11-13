// Exam lifecycle service: starts an exam, persists answers, finalises the
// attempt with backend-computed results, and supports recovery of an
// interrupted attempt.

use rusqlite::Connection;

use crate::database::{exams as edb, questions as qdb};
use crate::error::AppResult;
use crate::models::exam::{AttemptSummary, ExamAnswerUpdate, ExamQuestionRow, ExamSettings, NewAttempt};
use crate::services::question_service;

pub struct StartedExam {
    pub attempt_id: i64,
    pub mode: String,
    pub source_label: String,
    pub started_at: String,
    pub ends_at: Option<String>,
    pub duration_seconds: i64,
    pub total_questions: i64,
    pub total_marks: f64,
    pub questions: Vec<ExamQuestionRow>,
}

/// Validates settings and starts a new attempt.
pub fn start(
    conn: &Connection,
    settings: &ExamSettings,
    mode: &str,
) -> AppResult<StartedExam> {
    if settings.num_questions <= 0 {
        return Err("Number of questions must be greater than zero.".into());
    }
    if settings.duration_minutes < 0 {
        return Err("Exam duration cannot be negative.".into());
    }

    // If an active attempt exists, refuse to start a new one — the user must
    // resume or abandon the existing one.
    if let Some(existing) = edb::get_active_attempt(conn)? {
        return Err(format!(
            "An unfinished exam (id={}) is already in progress. Resume or abandon it before starting a new one.",
            existing.id
        )
        .into());
    }

    // Resolve eligible ids.
    let mut eligible = if settings.source_mode == "sets" {
        qdb::list_ids_for_sets(conn, &settings.selected_set_ids)?
    } else {
        qdb::list_ids_for_sets(conn, &[])?
    };

    if eligible.len() < settings.num_questions as usize {
        return Err(format!(
            "Not enough eligible questions. Requested {}, available {}.",
            settings.num_questions,
            eligible.len()
        )
        .into());
    }

    // Optional: exclude questions already attempted in completed exams.
    if settings.repeat_policy == "exclude" {
        let attempted: std::collections::HashSet<i64> = conn
            .prepare(
                "SELECT DISTINCT eq.question_id FROM exam_questions eq
                 INNER JOIN exam_attempts a ON a.id = eq.exam_attempt_id
                 WHERE a.status='completed'",
            )
            .map_err(|e| format!("prepare attempted: {e}"))?
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("query attempted: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        eligible.retain(|id| !attempted.contains(id));
        if eligible.len() < settings.num_questions as usize {
            return Err(format!(
                "Excluding previously attempted questions leaves only {} eligible (requested {}). \
                 Change the repeat policy or import more questions.",
                eligible.len(),
                settings.num_questions
            )
            .into());
        }
    }

    // Random selection without repetition.
    if settings.random_questions {
        shuffle(&mut eligible);
    }
    let chosen: Vec<i64> = eligible.into_iter().take(settings.num_questions as usize).collect();

    let now = chrono::Utc::now();
    let started_at = now.to_rfc3339();
    let duration_seconds = settings.duration_minutes * 60;
    let ends_at = if mode == "exam" && duration_seconds > 0 {
        Some((now + chrono::Duration::seconds(duration_seconds)).to_rfc3339())
    } else {
        None
    };
    let total_marks = settings.num_questions as f64 * settings.marks_per_correct;
    let source_label = if settings.source_mode == "sets" {
        format!("Sets: {:?}", settings.selected_set_ids)
    } else {
        "Entire question bank".to_string()
    };

    let new_attempt = NewAttempt {
        mode: mode.to_string(),
        source_label,
        started_at: started_at.clone(),
        ends_at: ends_at.clone(),
        duration_seconds,
        total_questions: settings.num_questions,
        total_marks,
    };
    let attempt_id = edb::create_attempt(conn, &new_attempt)?;

    let order_rows: Vec<(i64, i64)> = chosen
        .iter()
        .enumerate()
        .map(|(i, qid)| (*qid, (i + 1) as i64))
        .collect();
    edb::insert_exam_questions(conn, attempt_id, &order_rows)?;

    let questions = edb::get_exam_question_rows(conn, attempt_id)?;

    Ok(StartedExam {
        attempt_id,
        mode: new_attempt.mode,
        source_label: new_attempt.source_label,
        started_at,
        ends_at,
        duration_seconds,
        total_questions: settings.num_questions,
        total_marks,
        questions,
    })
}

/// Starts an exam with a user-specified list of question IDs. Used by the
/// "query & select" feature in the question bank: the user searches, picks
/// specific questions, and starts an exam with exactly those questions.
///
/// The saved settings still control duration, marking scheme, etc. Only the
/// question selection is overridden.
pub fn start_with_questions(
    conn: &Connection,
    question_ids: &[i64],
    mode: &str,
    settings: &ExamSettings,
) -> AppResult<StartedExam> {
    if question_ids.is_empty() {
        return Err("No questions selected. Select at least one question.".into());
    }
    if settings.duration_minutes < 0 {
        return Err("Exam duration cannot be negative.".into());
    }

    // If an active attempt exists, refuse to start a new one.
    if let Some(existing) = edb::get_active_attempt(conn)? {
        return Err(format!(
            "An unfinished exam (id={}) is already in progress. Resume or abandon it before starting a new one.",
            existing.id
        )
        .into());
    }

    // Verify all selected questions exist in the database.
    let mut valid_ids: Vec<i64> = Vec::with_capacity(question_ids.len());
    for &qid in question_ids {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM questions WHERE id=?1",
                rusqlite::params![qid],
                |row| row.get(0),
            )
            .map_err(|e| format!("check question exists: {e}"))?;
        if exists > 0 {
            valid_ids.push(qid);
        }
    }
    if valid_ids.is_empty() {
        return Err("None of the selected questions exist in the database.".into());
    }

    let num = valid_ids.len() as i64;
    let now = chrono::Utc::now();
    let started_at = now.to_rfc3339();
    let duration_seconds = settings.duration_minutes * 60;
    let ends_at = if mode == "exam" && duration_seconds > 0 {
        Some((now + chrono::Duration::seconds(duration_seconds)).to_rfc3339())
    } else {
        None
    };
    let total_marks = num as f64 * settings.marks_per_correct;
    let source_label = format!("Custom selection ({} questions)", num);

    let new_attempt = NewAttempt {
        mode: mode.to_string(),
        source_label,
        started_at: started_at.clone(),
        ends_at: ends_at.clone(),
        duration_seconds,
        total_questions: num,
        total_marks,
    };
    let attempt_id = edb::create_attempt(conn, &new_attempt)?;

    let order_rows: Vec<(i64, i64)> = valid_ids
        .iter()
        .enumerate()
        .map(|(i, qid)| (*qid, (i + 1) as i64))
        .collect();
    edb::insert_exam_questions(conn, attempt_id, &order_rows)?;

    let questions = edb::get_exam_question_rows(conn, attempt_id)?;

    Ok(StartedExam {
        attempt_id,
        mode: new_attempt.mode,
        source_label: new_attempt.source_label,
        started_at,
        ends_at,
        duration_seconds,
        total_questions: num,
        total_marks,
        questions,
    })
}

/// Starts an exam using all questions that belong to a specific imported set.
/// Used by the "Start Exam" button next to each set in the Import CSV screen.
pub fn start_with_set(
    conn: &Connection,
    set_id: i64,
    mode: &str,
    settings: &ExamSettings,
) -> AppResult<StartedExam> {
    let ids = qdb::list_ids_for_sets(conn, &[set_id])?;
    if ids.is_empty() {
        return Err(format!("Set {} has no questions.", set_id).into());
    }
    start_with_questions(conn, &ids, mode, settings)
}

pub fn get_active(conn: &Connection) -> AppResult<Option<AttemptSummary>> {
    edb::get_active_attempt(conn)
}

pub fn get_questions(conn: &Connection, attempt_id: i64) -> AppResult<Vec<ExamQuestionRow>> {
    edb::get_exam_question_rows(conn, attempt_id)
}

/// Records an answer. Grading is done in the backend by comparing the selected
/// option text against the question's right_option text.
pub fn save_answer(
    conn: &Connection,
    attempt_id: i64,
    question_id: i64,
    selected_option_text: &str,
    settings: &ExamSettings,
) -> AppResult<()> {
    let q = qdb::get_by_id(conn, question_id)?
        .ok_or_else(|| "question no longer exists".to_string())?;
    let is_correct = question_service::matches_right_option(&q.right_option, selected_option_text);
    let marks = if is_correct {
        settings.marks_per_correct
    } else {
        -settings.negative_marks_per_wrong
    };
    let upd = ExamAnswerUpdate {
        question_id,
        selected_answer: selected_option_text.to_string(),
        is_correct,
        marks_awarded: marks,
    };
    edb::apply_answer(conn, attempt_id, &upd)
}

pub fn clear_answer(conn: &Connection, attempt_id: i64, question_id: i64) -> AppResult<()> {
    edb::clear_answer(conn, attempt_id, question_id)
}

pub fn mark_review(
    conn: &Connection,
    attempt_id: i64,
    question_id: i64,
    marked: bool,
) -> AppResult<()> {
    edb::set_marked_review(conn, attempt_id, question_id, marked)
}

pub fn abandon(conn: &Connection, attempt_id: i64) -> AppResult<()> {
    edb::abandon_attempt(conn, attempt_id)
}

/// Finalises the attempt. All grading happens here in the backend using the
/// saved answers and the live questions table.
pub fn submit(
    conn: &Connection,
    attempt_id: i64,
    settings: &ExamSettings,
) -> AppResult<crate::models::result::ExamResultSummary> {
    let rows = edb::get_exam_question_rows(conn, attempt_id)?;
    let total_questions = rows.len() as i64;

    let mut correct = 0i64;
    let mut wrong = 0i64;
    let mut unanswered = 0i64;
    let mut obtained = 0.0f64;

    // Recompute marks in the backend — never trust the frontend.
    for r in &rows {
        match &r.selected_answer {
            Some(ans) if !ans.is_empty() => {
                let is_correct =
                    question_service::matches_right_option(&r.right_option, ans);
                let marks = if is_correct {
                    correct += 1;
                    settings.marks_per_correct
                } else {
                    wrong += 1;
                    -settings.negative_marks_per_wrong
                };
                obtained += marks;
                // Persist the recomputed values too so the snapshot is accurate.
                edb::apply_answer(
                    conn,
                    attempt_id,
                    &ExamAnswerUpdate {
                        question_id: r.question_id,
                        selected_answer: ans.clone(),
                        is_correct,
                        marks_awarded: marks,
                    },
                )?;
            }
            _ => {
                unanswered += 1;
                obtained += settings.marks_per_unanswered;
            }
        }
    }

    let attempted = correct + wrong;
    let accuracy = if attempted > 0 {
        (correct as f64 / attempted as f64) * 100.0
    } else {
        0.0
    };
    let total_marks = total_questions as f64 * settings.marks_per_correct;
    let percentage = if total_marks > 0.0 {
        (obtained / total_marks) * 100.0
    } else {
        0.0
    };

    let attempt = edb::get_active_attempt(conn)?
        .filter(|a| a.id == attempt_id)
        .ok_or_else(|| "attempt not found or already completed".to_string())?;
    let duration_seconds = attempt.duration_seconds.max(0);
    let completed_at = chrono::Utc::now().to_rfc3339();

    edb::finalize_attempt(
        conn,
        attempt_id,
        &completed_at,
        duration_seconds,
        correct,
        wrong,
        unanswered,
        obtained,
        accuracy,
        percentage,
    )?;

    // Snapshot every question so historical review stays accurate.
    crate::database::results::write_snapshots(conn, attempt_id)?;

    crate::database::results::get_attempt_summary(conn, attempt_id)
}

fn shuffle<T>(v: &mut Vec<T>) {
    use rand::seq::SliceRandom;
    let mut rng = rand::thread_rng();
    v.shuffle(&mut rng);
}
