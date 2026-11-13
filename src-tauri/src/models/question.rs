use serde::{Deserialize, Serialize};

/// A single question row. Mirrors the EXACT 8-column `questions` table.
/// All seven original CSV fields keep their original names.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: i64,
    pub question: String,
    pub option_1: String,
    pub option_2: String,
    pub option_3: String,
    pub option_4: String,
    pub right_option: String,
    pub explanation: String,
}

/// Lightweight row used for paginated question-bank listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionListItem {
    pub id: i64,
    pub question: String,
    pub option_1: String,
    pub right_option: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionSet {
    pub id: i64,
    pub set_name: String,
    pub imported_question_count: i64,
    pub created_at: String,
}
