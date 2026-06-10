import { run } from '../database.js';

const monthScopedTables = new Set(['utilities', 'production', 'capacity', 'manhours', 'loss', 'budget']);
const clearableEntryTables = new Set(['utilities', 'production', 'capacity', 'manhours', 'loss', 'budget']);

function isAllowedTable(table, allowedTables) {
  return allowedTables.has(table);
}

export function deleteRecordByMonth(table, month) {
  if (!isAllowedTable(table, monthScopedTables)) return false;
  return run(`DELETE FROM ${table} WHERE month=?`, [month]);
}

export function clearEntryTable(table) {
  if (!isAllowedTable(table, clearableEntryTables)) return false;
  if (table === 'manhours') {
    const clearedMonthly = run('DELETE FROM manhours');
    const clearedWeekly = run('DELETE FROM manhours_weekly');
    return clearedMonthly && clearedWeekly;
  }
  return run(`DELETE FROM ${table}`);
}
