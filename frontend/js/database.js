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
  migrateTables();   // <-- ADD THIS LINE
  saveDB();
}

export function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
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
      machine_availability REAL,
      UNIQUE(month, line)
    )`,
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
    `CREATE TABLE IF NOT EXISTS manhours_weekly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      week_label TEXT NOT NULL,
      week_num INTEGER,
      working_days REAL,
      manpower REAL,
      actual_reg REAL,
      actual_ot REAL,
      absenteeism REAL,
      UNIQUE(month, line, week_label)
    )`,
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
      machine_availability REAL,
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

function migrateTables() {
  // Add working_days and manpower to manhours if not exist
  try {
    db.run("ALTER TABLE manhours ADD COLUMN working_days REAL");
  } catch(e) { /* column already exists */ }
  try {
    db.run("ALTER TABLE manhours ADD COLUMN manpower REAL");
  } catch(e) { /* column already exists */ }
  try {
    db.run("ALTER TABLE capacity ADD COLUMN machine_availability REAL");
  } catch(e) { /* column already exists */ }
  try {
    db.run("ALTER TABLE capacity_weekly ADD COLUMN machine_availability REAL");
  } catch(e) { /* column already exists */ }

  try {
    db.run(`INSERT INTO manhours (month, line, working_days, manpower, planned_reg, actual_reg, planned_ot, actual_ot, absenteeism)
      SELECT
        month,
        line,
        working_days,
        manpower,
        CASE WHEN person_days > 0 THEN person_days * 8 ELSE NULL END,
        actual_reg,
        CASE WHEN person_days > 0 THEN person_days * 4 ELSE NULL END,
        actual_ot,
        absenteeism
      FROM (
        SELECT
          w.month,
          w.line,
          SUM(COALESCE(w.working_days, 0)) as working_days,
          CASE
            WHEN SUM(COALESCE(w.working_days, 0)) > 0 THEN
              SUM(CASE WHEN w.working_days IS NOT NULL AND w.manpower IS NOT NULL THEN w.working_days * w.manpower ELSE 0 END) / SUM(COALESCE(w.working_days, 0))
            ELSE AVG(w.manpower)
          END as manpower,
          SUM(CASE WHEN w.working_days IS NOT NULL AND w.manpower IS NOT NULL THEN w.working_days * w.manpower ELSE 0 END) as person_days,
          SUM(w.actual_reg) as actual_reg,
          SUM(w.actual_ot) as actual_ot,
          SUM(w.absenteeism) as absenteeism
        FROM manhours_weekly w
        WHERE NOT EXISTS (
          SELECT 1 FROM manhours m
          WHERE m.month = w.month AND m.line = w.line
        )
        GROUP BY w.month, w.line
      )
      WHERE person_days > 0 OR actual_reg IS NOT NULL OR actual_ot IS NOT NULL OR absenteeism IS NOT NULL`);
  } catch(e) {
    console.warn('Legacy weekly manhours migration skipped.', e);
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
