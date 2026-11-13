use rusqlite::{params, Connection};

use crate::error::AppResult;

pub fn get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn
        .prepare("SELECT setting_value FROM app_settings WHERE setting_key=?1")
        .map_err(|e| format!("prepare get setting: {e}"))?;
    let mut rows = stmt
        .query(params![key])
        .map_err(|e| format!("query get setting: {e}"))?;
    if let Some(row) = rows.next().map_err(|e| format!("next: {e}"))? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?1, ?2)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        params![key, value],
    )
    .map_err(|e| format!("set setting: {e}"))?;
    Ok(())
}

pub fn set_many(conn: &Connection, pairs: &[(String, String)]) -> AppResult<()> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin tx: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO app_settings (setting_key, setting_value)
                 VALUES (?1, ?2)
                 ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value",
            )
            .map_err(|e| format!("prepare set_many: {e}"))?;
        for (k, v) in pairs {
            stmt.execute(params![k, v]).map_err(|e| format!("set_many row: {e}"))?;
        }
    }
    tx.commit().map_err(|e| format!("commit set_many: {e}"))?;
    Ok(())
}
