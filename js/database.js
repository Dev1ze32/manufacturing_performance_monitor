export let db;

export async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
  });

  const saved = localStorage.getItem('mfg_db_v2');
  if (saved) {
    try {
      const buf = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
      db = new SQL.Database(buf);
    } catch(e) {
      console.warn('Corrupt saved DB, starting fresh.', e);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  createTables();
  saveDB();
}

export function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    // FIX Bug 4: chunked btoa avoids call-stack overflow on large DBs
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < data.length; i += chunk) {
      binary += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    localStorage.setItem('mfg_db_v2', btoa(binary));
  } catch(e) {
    console.warn('Could not save DB to localStorage:', e);
  }
}

function createTables() {
  // FIX Bug 1 & 2: run each statement separately; use line TEXT NOT NULL DEFAULT ''
  // so UNIQUE(month, line) works without COALESCE expressions.
  // Plant-wide rows store line = '' (empty string), not NULL.
  const statements = [
    `CREATE TABLE IF NOT EXISTS utilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      utility_cost REAL,
      rm_cost REAL
    )`,
    `CREATE TABLE IF NOT EXISTS production (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      volume REAL
    )`,
    `CREATE TABLE IF NOT EXISTS capacity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      line TEXT NOT NULL,
      capacity REAL,
      actual_output REAL,
      UNIQUE(month, line)
    )`,
    // FIX: line DEFAULT '' instead of nullable + COALESCE in UNIQUE
    `CREATE TABLE IF NOT EXISTS manhours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      planned_reg REAL,
      actual_reg REAL,
      planned_ot REAL,
      actual_ot REAL,
      absenteeism REAL,
      UNIQUE(month, line)
    )`,
    // FIX: same for loss
    `CREATE TABLE IF NOT EXISTS loss (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      runrate_loss REAL,
      absenteeism_loss REAL,
      manhours_loss REAL,
      UNIQUE(month, line)
    )`,
    `CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      utility_budget REAL,
      rm_budget REAL,
      volume_budget REAL
    )`,
    `CREATE TABLE IF NOT EXISTS capacity_weekly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      line TEXT NOT NULL,
      week_label TEXT NOT NULL,
      week_num INTEGER,
      capacity REAL,
      actual_output REAL,
      UNIQUE(month, line, week_label)
    )`
  ];

  for (const sql of statements) {
    try {
      db.run(sql);
    } catch(e) {
      console.error('createTables failed on statement:', sql, e);
    }
  }
}

export function query(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) { rows.push(stmt.getAsObject()); }
    stmt.free();
    return rows;
  } catch(e) {
    console.error('query() error:', sql, e);
    return [];
  }
}

// FIX Bug 5: returns true/false so callers can detect failures
export function run(sql, params = []) {
  if (!db) return false;
  try {
    db.run(sql, params);
    saveDB();
    return true;
  } catch(e) {
    console.error('run() error:', sql, e);
    return false;
  }
}