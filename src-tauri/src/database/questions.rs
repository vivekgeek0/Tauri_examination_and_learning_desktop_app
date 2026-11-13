// Low-level questions table access. The `Question` struct lives in `models`.
// These functions take an already-open `&Connection` so callers can wrap them
// in transactions.

use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::question::{Question, QuestionListItem};

pub fn insert_many(
    conn: &Connection,
    rows: &[(String, String, String, String, String, String, String)],
) -> AppResult<i64> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin tx: {e}"))?;
    let mut count = 0i64;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO questions
                   (question, option_1, option_2, option_3, option_4, right_option, explanation)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| format!("prepare insert: {e}"))?;
        for (q, o1, o2, o3, o4, r, ex) in rows {
            stmt.execute(params![q, o1, o2, o3, o4, r, ex])
                .map_err(|e| format!("insert row: {e}"))?;
            count += 1;
        }
    }
    tx.commit().map_err(|e| format!("commit tx: {e}"))?;
    Ok(count)
}

/// Returns true if a question with identical text and all four options exists.
pub fn exists_with_same_text_and_options(
    conn: &Connection,
    question: &str,
    o1: &str,
    o2: &str,
    o3: &str,
    o4: &str,
) -> AppResult<bool> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM questions
             WHERE question = ?1 AND option_1 = ?2 AND option_2 = ?3
               AND option_3 = ?4 AND option_4 = ?5",
            params![question, o1, o2, o3, o4],
            |row| row.get(0),
        )
        .map_err(|e| format!("dup check: {e}"))?;
    Ok(n > 0)
}

pub fn count(conn: &Connection) -> AppResult<i64> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM questions", [], |row| row.get(0))
        .map_err(|e| format!("count: {e}"))?;
    Ok(n)
}

pub fn count_in_sets(conn: &Connection, set_ids: &[i64]) -> AppResult<i64> {
    if set_ids.is_empty() {
        return count(conn);
    }
    let placeholders = std::iter::repeat("?")
        .take(set_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT COUNT(DISTINCT q.id) FROM questions q
         INNER JOIN question_set_items i ON i.question_id = q.id
         WHERE i.question_set_id IN ({placeholders})"
    );
    let params: Vec<&dyn rusqlite::ToSql> = set_ids
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();
    let n: i64 = conn
        .query_row(&sql, params.as_slice(), |row| row.get(0))
        .map_err(|e| format!("count_in_sets: {e}"))?;
    Ok(n)
}

pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<Question>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, question, option_1, option_2, option_3, option_4, right_option, explanation
             FROM questions WHERE id = ?1",
        )
        .map_err(|e| format!("prepare get_by_id: {e}"))?;
    let mut rows = stmt
        .query(params![id])
        .map_err(|e| format!("query get_by_id: {e}"))?;
    if let Some(row) = rows.next().map_err(|e| format!("next: {e}"))? {
        Ok(Some(Question {
            id: row.get(0)?,
            question: row.get(1)?,
            option_1: row.get(2)?,
            option_2: row.get(3)?,
            option_3: row.get(4)?,
            option_4: row.get(5)?,
            right_option: row.get(6)?,
            explanation: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        }))
    } else {
        Ok(None)
    }
}

pub fn paginate(
    conn: &Connection,
    offset: i64,
    limit: i64,
) -> AppResult<Vec<QuestionListItem>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, question, option_1, right_option
             FROM questions ORDER BY id LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("prepare paginate: {e}"))?;
    let rows = stmt
        .query_map(params![limit, offset], |row| {
            Ok(QuestionListItem {
                id: row.get(0)?,
                question: row.get(1)?,
                option_1: row.get(2)?,
                right_option: row.get(3)?,
            })
        })
        .map_err(|e| format!("query paginate: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn search(
    conn: &Connection,
    needle: &str,
    offset: i64,
    limit: i64,
) -> AppResult<(Vec<QuestionListItem>, i64)> {
    let like = format!("%{needle}%");
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM questions
             WHERE question LIKE ?1 OR option_1 LIKE ?1 OR option_2 LIKE ?1
                OR option_3 LIKE ?1 OR option_4 LIKE ?1 OR explanation LIKE ?1",
            params![like],
            |row| row.get(0),
        )
        .map_err(|e| format!("search count: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, question, option_1, right_option
             FROM questions
             WHERE question LIKE ?1 OR option_1 LIKE ?1 OR option_2 LIKE ?1
                OR option_3 LIKE ?1 OR option_4 LIKE ?1 OR explanation LIKE ?1
             ORDER BY id LIMIT ?2 OFFSET ?3",
        )
        .map_err(|e| format!("prepare search: {e}"))?;
    let rows = stmt
        .query_map(params![like, limit, offset], |row| {
            Ok(QuestionListItem {
                id: row.get(0)?,
                question: row.get(1)?,
                option_1: row.get(2)?,
                right_option: row.get(3)?,
            })
        })
        .map_err(|e| format!("query search: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok((out, total))
}

pub fn update(
    conn: &Connection,
    id: i64,
    question: &str,
    o1: &str,
    o2: &str,
    o3: &str,
    o4: &str,
    right: &str,
    explanation: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE questions SET question=?1, option_1=?2, option_2=?3, option_3=?4,
            option_4=?5, right_option=?6, explanation=?7 WHERE id=?8",
        params![question, o1, o2, o3, o4, right, explanation, id],
    )
    .map_err(|e| format!("update: {e}"))?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM questions WHERE id=?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    Ok(())
}

/// Returns all ids matching the source filter (entire bank OR specific sets).
/// For large banks the caller should use `random_ids_for_exam` instead.
pub fn list_ids_for_sets(conn: &Connection, set_ids: &[i64]) -> AppResult<Vec<i64>> {
    if set_ids.is_empty() {
        let mut stmt = conn
            .prepare("SELECT id FROM questions ORDER BY id")
            .map_err(|e| format!("prepare ids: {e}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("query ids: {e}"))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("row: {e}"))?);
        }
        return Ok(out);
    }
    let placeholders = std::iter::repeat("?")
        .take(set_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT DISTINCT q.id FROM questions q
         INNER JOIN question_set_items i ON i.question_id = q.id
         WHERE i.question_set_id IN ({placeholders})
         ORDER BY q.id"
    );
    let params: Vec<&dyn rusqlite::ToSql> = set_ids
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("prepare ids in sets: {e}"))?;
    let rows = stmt
        .query_map(params.as_slice(), |row| row.get::<_, i64>(0))
        .map_err(|e| format!("query ids in sets: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}
