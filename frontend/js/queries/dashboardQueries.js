import { query } from '../database.js';

export function getBudgetByMonth(month) {
  return month ? query('SELECT * FROM budget WHERE month = ?', [month]) : [];
}

export function getExecutiveCostTrendRows() {
  return query(`SELECT u.month, u.utility_cost, u.rm_cost, p.volume
    FROM utilities u LEFT JOIN production p ON u.month = p.month
    ORDER BY u.month ASC LIMIT 12`);
}

export function getCostDashboardRows() {
  return query(`SELECT u.month, u.utility_cost, u.rm_cost, p.volume
    FROM utilities u LEFT JOIN production p ON u.month = p.month
    ORDER BY u.month DESC LIMIT 24`).reverse();
}

export function getProductionCapacityRows(month) {
  return month
    ? query('SELECT month, line, capacity, actual_output FROM capacity WHERE month = ? ORDER BY month DESC, line', [month])
    : query('SELECT month, line, capacity, actual_output FROM capacity ORDER BY month DESC, line');
}

export function getCapacityMonthlyTotals() {
  return query('SELECT month, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY month ORDER BY month');
}

export function getCapacityWeeklyLines(month) {
  return month
    ? query('SELECT DISTINCT line FROM capacity_weekly WHERE month = ? ORDER BY line', [month])
    : query('SELECT DISTINCT line FROM capacity_weekly ORDER BY line');
}

export function getCapacityLineSummaries(month) {
  return month
    ? query('SELECT line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity WHERE month=? GROUP BY line ORDER BY line', [month])
    : query('SELECT line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY line ORDER BY line');
}

export function getCapacityLineQuarterRows() {
  return query('SELECT month, line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY month, line ORDER BY month, line');
}

export function getCapacityWeeklyPanelRows(line, month) {
  const monthFilter = month ? 'AND month = ?' : '';
  const params = month ? [line, month] : [line];
  return query(
    `SELECT week_label, week_num, SUM(capacity) as cap, SUM(actual_output) as act, month
     FROM capacity_weekly
     WHERE line = ? ${monthFilter}
     GROUP BY month, week_label, week_num
     ORDER BY month ASC, week_num ASC, week_label ASC`,
    params
  );
}

export function getWeeklyRunrateRows(month) {
  return month
    ? query('SELECT month, line, week_label, week_num, capacity, actual_output FROM capacity_weekly WHERE month = ? ORDER BY line, week_num ASC, week_label ASC', [month])
    : query('SELECT month, line, week_label, week_num, capacity, actual_output FROM capacity_weekly ORDER BY month DESC, line, week_num ASC, week_label ASC LIMIT 200');
}

export function getBudgetActualRows(month) {
  const filter = month ? 'WHERE b.month = ?' : '';
  const params = month ? [month] : [];
  return query(`SELECT b.month, b.utility_budget, b.rm_budget, b.volume_budget, u.utility_cost, u.rm_cost, p.volume
    FROM budget b
    LEFT JOIN utilities u ON b.month = u.month
    LEFT JOIN production p ON b.month = p.month
    ${filter} ORDER BY b.month DESC LIMIT 24`, params);
}
