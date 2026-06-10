import { query } from '../database.js';

const effectiveCapacityCte = `
  WITH weekly AS (
    SELECT
      cw.month,
      cw.line,
      SUM(cw.capacity) as capacity,
      SUM(cw.actual_output) as actual_output,
      COALESCE(AVG(cw.machine_availability), (
        SELECT c.machine_availability
        FROM capacity c
        WHERE c.month = cw.month AND c.line = cw.line
        LIMIT 1
      )) as machine_availability,
      COUNT(*) as weekly_count
    FROM capacity_weekly cw
    GROUP BY cw.month, cw.line
  ),
  manual AS (
    SELECT
      c.month,
      c.line,
      c.capacity,
      c.actual_output,
      c.machine_availability,
      0 as weekly_count
    FROM capacity c
    WHERE NOT EXISTS (
      SELECT 1
      FROM weekly w
      WHERE w.month = c.month AND w.line = c.line
    )
  ),
  effective AS (
    SELECT * FROM weekly
    UNION ALL
    SELECT * FROM manual
  )
`;

export function getAllDistinctMonthRows() {
  return [
    ...query('SELECT DISTINCT month FROM utilities'),
    ...query('SELECT DISTINCT month FROM production'),
    ...query('SELECT DISTINCT month FROM capacity'),
    ...query('SELECT DISTINCT month FROM capacity_weekly'),
    ...query('SELECT DISTINCT month FROM manhours'),
    ...query('SELECT DISTINCT month FROM loss'),
    ...query('SELECT DISTINCT month FROM budget')
  ];
}

export function getCostDistinctMonthRows() {
  return [
    ...query('SELECT DISTINCT month FROM utilities'),
    ...query('SELECT DISTINCT month FROM production')
  ];
}

export function getRunrateManhoursDistinctMonthRows() {
  return [
    ...query('SELECT DISTINCT month FROM capacity'),
    ...query('SELECT DISTINCT month FROM capacity_weekly'),
    ...query('SELECT DISTINCT month FROM manhours')
  ];
}

export function getBudgetDistinctMonthRows() {
  return [
    ...query('SELECT DISTINCT month FROM budget'),
    ...query('SELECT DISTINCT month FROM utilities'),
    ...query('SELECT DISTINCT month FROM production')
  ];
}

export function getManhoursSummaryRows(month = '') {
  const where = month ? 'WHERE m.month = ?' : '';
  const params = month ? [month] : [];

  return query(`SELECT
      m.month,
      m.line,
      m.working_days,
      m.manpower,
      CASE WHEN m.working_days IS NOT NULL AND m.manpower IS NOT NULL THEN m.working_days * m.manpower ELSE NULL END as person_days,
      CASE WHEN m.working_days IS NOT NULL AND m.manpower IS NOT NULL THEN m.working_days * m.manpower * 8 ELSE m.planned_reg END as planned_reg,
      m.actual_reg,
      CASE WHEN m.working_days IS NOT NULL AND m.manpower IS NOT NULL THEN m.working_days * m.manpower * 4 ELSE m.planned_ot END as planned_ot,
      m.actual_ot,
      m.absenteeism,
      0 as weekly_count
    FROM manhours m
    ${where}
    ORDER BY m.month DESC, m.line`, params);
}

export function getRunrateSummaryRows(month = '') {
  const where = month ? 'WHERE month = ?' : '';
  const params = month ? [month] : [];
  return query(`${effectiveCapacityCte}
    SELECT
      month,
      line,
      SUM(capacity) as capacity,
      SUM(actual_output) as actual_output,
      AVG(machine_availability) as machine_availability,
      SUM(weekly_count) as weekly_count
    FROM effective
    ${where}
    GROUP BY month, line
    ORDER BY month DESC, line`, params);
}

export function getLatestUtilitiesRecord(month) {
  return month
    ? query('SELECT * FROM utilities WHERE month = ? ORDER BY month DESC LIMIT 1', [month])[0] || {}
    : query('SELECT * FROM utilities ORDER BY month DESC LIMIT 1')[0] || {};
}

export function getLatestProductionRecord(month) {
  return month
    ? query('SELECT * FROM production WHERE month = ? ORDER BY month DESC LIMIT 1', [month])[0] || {}
    : query('SELECT * FROM production ORDER BY month DESC LIMIT 1')[0] || {};
}
