// CSV import service.
//
// The supplied sample CSV is pipe-delimited with the header:
//   question | option_1 | option_2 | option_3 | option_4 | right_option | explanation
// (the sample's first column "0" is actually the index row; we detect headers
//  by checking for "question" so the importer auto-skips the index column.)
//
// For maximum compatibility we also accept comma-delimited CSVs with the same
// 7-field header. We never use simple string splitting — the `csv` crate
// handles quoted fields, embedded newlines and escaped quotes correctly.

use std::io::Cursor;

use serde::Serialize;

use crate::database::{question_sets, questions};
use crate::error::AppResult;
use rusqlite::Connection;

const REQUIRED_FIELDS: [&str; 7] = [
    "question",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "right_option",
    "explanation",
];

#[derive(Debug, Clone, Serialize)]
pub struct CsvPreview {
    pub filename: String,
    pub delimiter: char,
    pub total_records: usize,
    pub valid_records: usize,
    pub invalid_records: usize,
    pub duplicate_records: usize,
    pub first_valid: Vec<ParsedRow>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ParsedRow {
    pub question: String,
    pub option_1: String,
    pub option_2: String,
    pub option_3: String,
    pub option_4: String,
    pub right_option: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportOutcome {
    pub set_id: i64,
    pub set_name: String,
    pub inserted: i64,
    pub skipped_duplicates: i64,
}

/// Detects the most likely delimiter from the first non-empty line by picking
/// the character with the highest count among `|`, `,`, `\t`, `;`.
pub fn detect_delimiter(text: &str) -> char {
    let first_line = text
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("");
    let mut best = ',';
    let mut max = 0usize;
    for d in ['|', ',', '\t', ';'] {
        let c = first_line.matches(d).count();
        if c > max {
            max = c;
            best = d;
        }
    }
    best
}

/// Parses the file content into rows. The header row is identified by the
/// presence of the literal token "question" (case-insensitive) in some cell.
fn parse_with_delimiter(text: &str, delimiter: char) -> AppResult<(Vec<ParsedRow>, Vec<String>)> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .has_headers(true)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(Cursor::new(text));

    let header = reader
        .headers()
        .map_err(|e| format!("read header: {e}"))?
        .clone();

    let lowered: Vec<String> = header.iter().map(|h| h.trim().to_lowercase()).collect();
    if !lowered.iter().any(|h| h == "question") {
        return Err(format!(
            "CSV header is missing the 'question' field. Found columns: {}",
            header.iter().collect::<Vec<_>>().join(", ")
        )
        .into());
    }

    // Build a column-index map. Unknown extra columns (e.g. an id index column)
    // are simply ignored.
    let mut col = std::collections::HashMap::new();
    for (i, name) in lowered.iter().enumerate() {
        if REQUIRED_FIELDS.contains(&name.as_str()) {
            col.entry(name.clone()).or_insert(i);
        }
    }
    for f in REQUIRED_FIELDS.iter() {
        if !col.contains_key(*f) {
            return Err(format!("CSV header is missing required field '{f}'.").into());
        }
    }

    let mut out = Vec::new();
    let mut errors = Vec::new();
    for (row_idx, record) in reader.records().enumerate() {
        let record = match record {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("row {}: parse error: {e}", row_idx + 2));
                continue;
            }
        };
        let get = |key: &str| -> String {
            let i = col[key];
            record
                .get(i)
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        };
        let row = ParsedRow {
            question: get("question"),
            option_1: get("option_1"),
            option_2: get("option_2"),
            option_3: get("option_3"),
            option_4: get("option_4"),
            right_option: get("right_option"),
            explanation: get("explanation"),
        };
        if row.question.is_empty() {
            errors.push(format!("row {}: empty question text", row_idx + 2));
            continue;
        }
        if row.option_1.is_empty() || row.option_2.is_empty()
            || row.option_3.is_empty() || row.option_4.is_empty()
        {
            errors.push(format!("row {}: one or more options are empty", row_idx + 2));
            continue;
        }
        if row.right_option.is_empty() {
            errors.push(format!("row {}: right_option is empty", row_idx + 2));
            continue;
        }
        out.push(row);
    }
    Ok((out, errors))
}

/// Produces a preview WITHOUT writing to the database.
pub fn preview(text: &str, filename: &str) -> AppResult<CsvPreview> {
    let delimiter = detect_delimiter(text);
    let (rows, errors) = parse_with_delimiter(text, delimiter)?;

    let total_records = rows.len() + errors.len();
    let valid_records = rows.len();
    let invalid_records = errors.len();

    let first_valid: Vec<ParsedRow> = rows.iter().take(5).cloned().collect();

    Ok(CsvPreview {
        filename: filename.to_string(),
        delimiter,
        total_records,
        valid_records,
        invalid_records,
        duplicate_records: 0,
        first_valid,
        errors,
    })
}

/// Parses the full CSV and returns ALL valid rows. Used by the Temporary Test
/// mode where questions are held in frontend memory only — nothing is saved
/// to the database.
pub fn parse_all(text: &str) -> AppResult<Vec<ParsedRow>> {
    let delimiter = detect_delimiter(text);
    let (rows, _errors) = parse_with_delimiter(text, delimiter)?;
    Ok(rows)
}

/// Performs the actual import. Skips duplicates when `skip_duplicates` is true.
/// Creates a `question_sets` entry and links every inserted question to it.
pub fn confirm_import(
    conn: &Connection,
    text: &str,
    filename: &str,
    skip_duplicates: bool,
) -> AppResult<ImportOutcome> {
    let delimiter = detect_delimiter(text);
    let (rows, _errors) = parse_with_delimiter(text, delimiter)?;

    let now = chrono::Utc::now().to_rfc3339();
    let set_name = filename.to_string();
    let mut inserted = 0i64;
    let mut skipped = 0i64;

    // Pre-compute duplicates per row before opening the write transaction so
    // we can still count them accurately even when skip_duplicates is false.
    let mut to_insert: Vec<ParsedRow> = Vec::with_capacity(rows.len());
    for r in &rows {
        let dup = questions::exists_with_same_text_and_options(
            conn,
            &r.question,
            &r.option_1,
            &r.option_2,
            &r.option_3,
            &r.option_4,
        )?;
        if dup && skip_duplicates {
            skipped += 1;
            continue;
        }
        to_insert.push(r.clone());
    }

    let set_id = question_sets::create_set(conn, &set_name, to_insert.len() as i64, &now)?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin tx import: {e}"))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO questions
                   (question, option_1, option_2, option_3, option_4, right_option, explanation)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| format!("prepare insert: {e}"))?;
        let mut link = tx
            .prepare(
                "INSERT OR IGNORE INTO question_set_items (question_set_id, question_id)
                 VALUES (?1, ?2)",
            )
            .map_err(|e| format!("prepare link: {e}"))?;

        for r in &to_insert {
            stmt.execute(rusqlite::params![
                r.question,
                r.option_1,
                r.option_2,
                r.option_3,
                r.option_4,
                r.right_option,
                r.explanation
            ])
            .map_err(|e| format!("insert row: {e}"))?;
            let qid = tx.last_insert_rowid();
            link.execute(rusqlite::params![set_id, qid])
                .map_err(|e| format!("link row: {e}"))?;
            inserted += 1;
        }
    }
    tx.commit().map_err(|e| format!("commit import: {e}"))?;

    // Update the imported_question_count to the actual inserted number.
    conn.execute(
        "UPDATE question_sets SET imported_question_count=?1 WHERE id=?2",
        rusqlite::params![inserted, set_id],
    )
    .map_err(|e| format!("update set count: {e}"))?;

    Ok(ImportOutcome {
        set_id,
        set_name,
        inserted,
        skipped_duplicates: skipped,
    })
}
