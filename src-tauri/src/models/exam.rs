use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamSettings {
    pub num_questions: i64,
    pub duration_minutes: i64,
    pub marks_per_correct: f64,
    pub negative_marks_per_wrong: f64,
    pub marks_per_unanswered: f64,
    pub random_questions: bool,
    pub random_options: bool,
    /// "all" or "sets" — picked in the UI
    pub source_mode: String,
    /// Comma-separated set ids when source_mode == "sets"
    pub selected_set_ids: Vec<i64>,
    /// "practice" or "exam"
    pub default_mode: String,
    /// "allow" | "exclude"
    pub repeat_policy: String,
}

impl Default for ExamSettings {
    fn default() -> Self {
        Self {
            num_questions: 80,
            duration_minutes: 60,
            marks_per_correct: 1.0,
            negative_marks_per_wrong: 0.25,
            marks_per_unanswered: 0.0,
            random_questions: true,
            random_options: false,
            source_mode: "all".to_string(),
            selected_set_ids: vec![],
            default_mode: "exam".to_string(),
            repeat_policy: "allow".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NewAttempt {
    pub mode: String,
    pub source_label: String,
    pub started_at: String,
    pub ends_at: Option<String>,
    pub duration_seconds: i64,
    pub total_questions: i64,
    pub total_marks: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttemptSummary {
    pub id: i64,
    pub mode: String,
    pub source_label: String,
    pub started_at: String,
    pub ends_at: Option<String>,
    pub duration_seconds: i64,
    pub total_questions: i64,
    pub total_marks: f64,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct ExamAnswerUpdate {
    pub question_id: i64,
    pub selected_answer: String,
    pub is_correct: bool,
    pub marks_awarded: f64,
}

/// A row of `exam_questions` joined with `questions`, used during exam play
/// and to build the review snapshot.
#[derive(Debug, Clone)]
pub struct ExamQuestionRow {
    pub question_id: i64,
    pub question_order: i64,
    pub selected_answer: Option<String>,
    pub is_correct: i64,
    pub is_marked_review: i64,
    pub marks_awarded: f64,
    pub response_status: String,
    pub question: String,
    pub option_1: String,
    pub option_2: String,
    pub option_3: String,
    pub option_4: String,
    pub right_option: String,
    pub explanation: String,
}
