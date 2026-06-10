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
  const filter = month ? 'WHERE month = ?' : '';
  const params = month ? [month] : [];
  return query(`${effectiveCapacityCte}
    SELECT month, line, capacity, actual_output, machine_availability, weekly_count
    FROM effective
    ${filter}
    ORDER BY month DESC, line`, params);
}

export function getCapacityMonthlyTotals() {
  return query(`${effectiveCapacityCte}
    SELECT month, SUM(capacity) as cap, SUM(actual_output) as act, AVG(machine_availability) as machine_availability
    FROM effective
    GROUP BY month
    ORDER BY month`);
}

export function getCapacityWeeklyLines(month) {
  return month
    ? query('SELECT DISTINCT line FROM capacity_weekly WHERE month = ? ORDER BY line', [month])
    : query('SELECT DISTINCT line FROM capacity_weekly ORDER BY line');
}

export function getCapacityLineSummaries(month) {
  const filter = month ? 'WHERE month = ?' : '';
  const params = month ? [month] : [];
  return query(`${effectiveCapacityCte}
    SELECT line, SUM(capacity) as cap, SUM(actual_output) as act, AVG(machine_availability) as machine_availability
    FROM effective
    ${filter}
    GROUP BY line
    ORDER BY line`, params);
}

export function getCapacityLineQuarterRows() {
  return query(`${effectiveCapacityCte}
    SELECT month, line, SUM(capacity) as cap, SUM(actual_output) as act, AVG(machine_availability) as machine_availability
    FROM effective
    GROUP BY month, line
    ORDER BY month, line`);
}

export function getCapacityWeeklyPanelRows(line, month) {
  const monthFilter = month ? 'AND month = ?' : '';
  const params = month ? [line, month] : [line];
  return query(
    `SELECT week_label, week_num, SUM(capacity) as cap, SUM(actual_output) as act, AVG(machine_availability) as machine_availability, month
     FROM capacity_weekly
     WHERE line = ? ${monthFilter}
     GROUP BY month, week_label, week_num
     ORDER BY month ASC, week_num ASC, week_label ASC`,
    params
  );
}

export function getWeeklyRunrateRows(month) {
  return month
    ? query('SELECT month, line, week_label, week_num, capacity, actual_output, machine_availability FROM capacity_weekly WHERE month = ? ORDER BY line, week_num ASC, week_label ASC', [month])
    : query('SELECT month, line, week_label, week_num, capacity, actual_output, machine_availability FROM capacity_weekly ORDER BY month DESC, line, week_num ASC, week_label ASC LIMIT 200');
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
