import { query, run } from '../database.js';

export function getUtilityRows() {
  return query('SELECT * FROM utilities ORDER BY month DESC LIMIT 36');
}

export function getActualCostRows() {
  return query(`SELECT month, utility_cost, rm_cost, volume FROM (
      SELECT u.month, u.utility_cost, u.rm_cost, p.volume
      FROM utilities u
      LEFT JOIN production p ON u.month = p.month
      UNION
      SELECT p.month, u.utility_cost, u.rm_cost, p.volume
      FROM production p
      LEFT JOIN utilities u ON p.month = u.month
    )
    ORDER BY month DESC LIMIT 36`);
}

export function saveUtilityRecord(month, utilityCost, rmCost) {
  return run(`INSERT INTO utilities (month,utility_cost,rm_cost) VALUES (?,?,?)
    ON CONFLICT(month) DO UPDATE SET utility_cost=excluded.utility_cost, rm_cost=excluded.rm_cost`,
    [month, utilityCost, rmCost]);
}

export function getProductionRows() {
  return query('SELECT * FROM production ORDER BY month DESC LIMIT 36');
}

export function saveProductionRecord(month, volume) {
  return run('INSERT INTO production (month,volume) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET volume=excluded.volume', [month, volume]);
}

export function saveActualCostRecord(month, utilityCost, rmCost, volume) {
  let saved = true;

  if (utilityCost != null || rmCost != null) {
    saved = saveUtilityRecord(month, utilityCost, rmCost) && saved;
  }

  if (volume != null) {
    saved = saveProductionRecord(month, volume) && saved;
  }

  return saved;
}

export function deleteActualCostRecord(month) {
  const deletedUtilities = run('DELETE FROM utilities WHERE month=?', [month]);
  const deletedProduction = run('DELETE FROM production WHERE month=?', [month]);
  return deletedUtilities && deletedProduction;
}

export function clearActualCostRecords() {
  const clearedUtilities = run('DELETE FROM utilities');
  const clearedProduction = run('DELETE FROM production');
  return clearedUtilities && clearedProduction;
}

export function getCapacityRows() {
  return query('SELECT * FROM capacity ORDER BY month DESC, line LIMIT 60');
}

export function getCapacityWeeklyRows() {
  return query('SELECT * FROM capacity_weekly ORDER BY month DESC, line, week_num ASC, week_label ASC LIMIT 200');
}

export function saveCapacityRecord(month, line, capacity, actualOutput, machineAvailability = null) {
  return run(`INSERT INTO capacity (month,line,capacity,actual_output,machine_availability) VALUES (?,?,?,?,?)
    ON CONFLICT(month,line) DO UPDATE SET
      capacity=excluded.capacity,
      actual_output=excluded.actual_output,
      machine_availability=excluded.machine_availability`,
    [month, line, capacity, actualOutput, machineAvailability]);
}

export function saveWeeklyCapacityRecord(month, line, weekLabel, weekNum, capacity, actualOutput, machineAvailability = null) {
  return run(`INSERT INTO capacity_weekly (month,line,week_label,week_num,capacity,actual_output,machine_availability) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(month,line,week_label) DO UPDATE SET
      week_num=excluded.week_num,
      capacity=excluded.capacity,
      actual_output=excluded.actual_output,
      machine_availability=excluded.machine_availability`,
    [month, line, weekLabel, weekNum, capacity, actualOutput, machineAvailability]);
}

export function getWeeklyCapacityById(id) {
  return query('SELECT * FROM capacity_weekly WHERE id=?', [id])[0];
}

export function deleteCapacityRecord(month, line) {
  return run('DELETE FROM capacity WHERE month=? AND line=?', [month, line]);
}

export function deleteWeeklyCapacityRecord(id) {
  return run('DELETE FROM capacity_weekly WHERE id=?', [id]);
}

export function clearWeeklyCapacityRecords() {
  return run('DELETE FROM capacity_weekly');
}

export function clearRunrateRecords() {
  const clearedWeekly = run('DELETE FROM capacity_weekly');
  const clearedMonthly = run('DELETE FROM capacity');
  return clearedWeekly && clearedMonthly;
}

export function getManhoursRows() {
  return query('SELECT * FROM manhours ORDER BY month DESC, line LIMIT 200');
}

export function getLegacyManhoursWeeklyCount() {
  return query('SELECT COUNT(*) as count FROM manhours_weekly')[0]?.count || 0;
}

export function getCapacityLineRows() {
  return query('SELECT DISTINCT line FROM capacity');
}

export function getCapacityWeeklyLineRows() {
  return query('SELECT DISTINCT line FROM capacity_weekly');
}

export function saveManhoursRecord(record) {
  return run(`INSERT INTO manhours (month,line,working_days,manpower,planned_reg,actual_reg,planned_ot,actual_ot,absenteeism)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(month,line) DO UPDATE SET
        working_days=excluded.working_days,
        manpower=excluded.manpower,
        planned_reg=excluded.planned_reg,
        actual_reg=excluded.actual_reg,
        planned_ot=excluded.planned_ot,
        actual_ot=excluded.actual_ot,
        absenteeism=excluded.absenteeism`,
    [
      record.month,
      record.line,
      record.workingDays,
      record.manpower,
      record.plannedReg,
      record.actualReg,
      record.plannedOT,
      record.actualOT,
      record.absenteeism
    ]);
}

export function deleteLegacyManhoursWeeklyRows(month, line) {
  return run('DELETE FROM manhours_weekly WHERE month=? AND line=?', [month, line]);
}

export function getManhoursById(id) {
  return query('SELECT * FROM manhours WHERE id=?', [id])[0];
}

export function deleteManhoursRecord(id) {
  return run('DELETE FROM manhours WHERE id=?', [id]);
}

export function clearManhoursRecords() {
  const clearedMonthly = run('DELETE FROM manhours');
  const clearedWeekly = run('DELETE FROM manhours_weekly');
  return clearedMonthly && clearedWeekly;
}

export function getBudgetRows() {
  return query('SELECT * FROM budget ORDER BY month DESC LIMIT 36');
}

export function saveBudgetRecord(month, utilityBudget, rmBudget, volumeBudget) {
  return run(`INSERT INTO budget (month,utility_budget,rm_budget,volume_budget) VALUES (?,?,?,?)
    ON CONFLICT(month) DO UPDATE SET utility_budget=excluded.utility_budget,rm_budget=excluded.rm_budget,volume_budget=excluded.volume_budget`,
    [month, utilityBudget, rmBudget, volumeBudget]);
}
