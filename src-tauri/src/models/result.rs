use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamResultSummary {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewQuestion {
    pub question_order: i64,
    pub question: String,
    pub option_1: String,
    pub option_2: String,
    pub option_3: String,
    pub option_4: String,
    pub right_option: String,
    pub explanation: String,
    pub selected_answer: Option<String>,
    pub is_correct: i64,
    pub is_marked_review: i64,
    pub marks_awarded: f64,
    pub response_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceStats {
    pub total_exams: i64,
    pub best_percentage: f64,
    pub average_percentage: f64,
    pub average_accuracy: f64,
    pub best_accuracy: f64,
    pub total_questions_attempted: i64,
    pub total_correct: i64,
    pub recent: Vec<ExamResultSummary>,
}

/// A question the user has answered wrong at least once across all completed
/// exams. Includes the wrong-answer count and the most recent wrong selection
/// so the user can study their mistakes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrongAnsweredQuestion {
    pub id: i64,
    pub question: String,
    pub option_1: String,
    pub option_2: String,
    pub option_3: String,
    pub option_4: String,
    pub right_option: String,
    pub explanation: String,
    pub wrong_count: i64,
    pub last_wrong_answer: Option<String>,
}
