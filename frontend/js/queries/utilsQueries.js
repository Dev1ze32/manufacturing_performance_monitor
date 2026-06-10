import { query } from '../database.js';

export function getAllDistinctMonthRows() {
  return [
    ...query('SELECT DISTINCT month FROM utilities'),
    ...query('SELECT DISTINCT month FROM production'),
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
  const weeklyWhere = month ? 'WHERE month = ?' : '';
  const weeklyParams = month ? [month] : [];
  return query(`SELECT
      month,
      line,
      SUM(capacity) as capacity,
      SUM(actual_output) as actual_output,
      COUNT(*) as weekly_count
    FROM capacity_weekly
    ${weeklyWhere}
    GROUP BY month, line
    ORDER BY month DESC, line`, weeklyParams);
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
