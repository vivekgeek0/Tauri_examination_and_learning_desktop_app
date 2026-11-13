// Opens a SQLite connection with the options required by the application:
// - foreign keys ON (so cascade rules work)
// - WAL journal mode (better concurrency and crash safety)
// - busy timeout so a brief lock won't immediately error
//
// The `bundled` feature of rusqlite ships its own SQLite, so we never depend
// on a system libsqlite3.

use rusqlite::Connection;
use std::path::Path;

pub fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("open db: {e}"))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;",
    )
    .map_err(|e| format!("pragma init: {e}"))?;

    Ok(conn)
}
