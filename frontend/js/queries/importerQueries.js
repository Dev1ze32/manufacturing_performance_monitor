import { run } from '../database.js';

export function upsertImportedUtility(month, utilityCost, rmCost) {
  return run(`INSERT INTO utilities (month, utility_cost, rm_cost) VALUES (?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        utility_cost = COALESCE(excluded.utility_cost, utilities.utility_cost),
        rm_cost = COALESCE(excluded.rm_cost, utilities.rm_cost)`,
    [month, utilityCost, rmCost]);
}

export function upsertImportedProduction(month, volume) {
  return run(`INSERT INTO production (month, volume) VALUES (?, ?)
      ON CONFLICT(month) DO UPDATE SET volume = excluded.volume`,
    [month, volume]);
}

export function upsertImportedBudget(month, utilityBudget, rmBudget, volumeBudget) {
  return run(`INSERT INTO budget (month, utility_budget, rm_budget, volume_budget) VALUES (?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        utility_budget = COALESCE(excluded.utility_budget, budget.utility_budget),
        rm_budget = COALESCE(excluded.rm_budget, budget.rm_budget),
        volume_budget = COALESCE(excluded.volume_budget, budget.volume_budget)`,
    [month, utilityBudget, rmBudget, volumeBudget]);
}

export function upsertImportedCapacity(record) {
  return run(`INSERT INTO capacity (month, line, capacity, actual_output, machine_availability) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(month, line) DO UPDATE SET
        capacity = COALESCE(excluded.capacity, capacity.capacity),
        actual_output = COALESCE(excluded.actual_output, capacity.actual_output),
        machine_availability = COALESCE(excluded.machine_availability, capacity.machine_availability)`,
    [
      record.month,
      record.line || '',
      record.capacity,
      record.actual_output,
      record.machine_availability
    ]);
}

export function upsertImportedWeeklyCapacity(record) {
  const saved = run(`INSERT INTO capacity_weekly (month, line, week_label, week_num, capacity, actual_output, machine_availability) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month, line, week_label) DO UPDATE SET
        week_num = excluded.week_num,
        capacity = COALESCE(excluded.capacity, capacity_weekly.capacity),
        actual_output = COALESCE(excluded.actual_output, capacity_weekly.actual_output),
        machine_availability = COALESCE(excluded.machine_availability, capacity_weekly.machine_availability)`,
    [
      record.month,
      record.line,
      record.week_label,
      record.week_num,
      record.capacity,
      record.actual_output,
      record.machine_availability
    ]);

  return saved;
}

export function upsertImportedManhours(record) {
  const saved = run(`INSERT INTO manhours (month, line, working_days, manpower, planned_reg, actual_reg, planned_ot, actual_ot, absenteeism) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month, line) DO UPDATE SET
        working_days = COALESCE(excluded.working_days, manhours.working_days),
        manpower = COALESCE(excluded.manpower, manhours.manpower),
        planned_reg = COALESCE(excluded.planned_reg, manhours.planned_reg),
        actual_reg = COALESCE(excluded.actual_reg, manhours.actual_reg),
        planned_ot = COALESCE(excluded.planned_ot, manhours.planned_ot),
        actual_ot = COALESCE(excluded.actual_ot, manhours.actual_ot),
        absenteeism = COALESCE(excluded.absenteeism, manhours.absenteeism)`,
    [
      record.month,
      record.line || '',
      record.working_days,
      record.manpower,
      record.planned_reg,
      record.actual_reg,
      record.planned_ot,
      record.actual_ot,
      record.absenteeism
    ]);

  if (saved) run('DELETE FROM manhours_weekly WHERE month = ? AND line = ?', [record.month, record.line || '']);
  return saved;
}
