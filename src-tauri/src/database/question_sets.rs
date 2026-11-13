use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::question::QuestionSet;

pub fn create_set(
    conn: &Connection,
    set_name: &str,
    count: i64,
    created_at: &str,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO question_sets (set_name, imported_question_count, created_at)
         VALUES (?1, ?2, ?3)",
        params![set_name, count, created_at],
    )
    .map_err(|e| format!("insert set: {e}"))?;
    Ok(conn.last_insert_rowid())
}

pub fn link_question_to_set(
    conn: &Connection,
    set_id: i64,
    question_id: i64,
) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO question_set_items (question_set_id, question_id)
         VALUES (?1, ?2)",
        params![set_id, question_id],
    )
    .map_err(|e| format!("link set: {e}"))?;
    Ok(())
}

pub fn list_sets(conn: &Connection) -> AppResult<Vec<QuestionSet>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, set_name, imported_question_count, created_at
             FROM question_sets ORDER BY id DESC",
        )
        .map_err(|e| format!("prepare sets: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(QuestionSet {
                id: row.get(0)?,
                set_name: row.get(1)?,
                imported_question_count: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("query sets: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn delete_set(conn: &Connection, set_id: i64) -> AppResult<()> {
    // Question set items cascade-delete. The questions themselves are NOT
    // removed: they may belong to other sets or to historical attempts.
    conn.execute("DELETE FROM question_sets WHERE id=?1", params![set_id])
        .map_err(|e| format!("delete set: {e}"))?;
    Ok(())
}
