import { query } from './database.js';

export let charts = {};

export function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

export function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// FORMATTERS
export function fmt(n, decimals=3) { return (n == null || isNaN(n) || !isFinite(n)) ? '—' : Number(n).toFixed(decimals); }
export function fmtN(n, decimals=0) { return (n == null || isNaN(n) || !isFinite(n)) ? '—' : Number(n).toLocaleString('en-PH', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}); }
export function fmtPct(n) { return (n == null || isNaN(n) || !isFinite(n)) ? '—' : (Number(n)*100).toFixed(2) + '%'; }
export function fmtMonthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(mo)-1] + ' ' + y;
}

// FORM/UI HELPERS
export function val(id){ return (document.getElementById(id)||{}).value||''; }
export function setVal(id,v){ const el=document.getElementById(id); if(el) el.value=v!=null?v:''; }
export function parseN(id){ const v=parseFloat(val(id)); return isNaN(v)?null:v; }
export function clearForm(ids){ ids.forEach(id=>setVal(id,'')); }
export function getGlobalMonth() { return document.getElementById('globalMonth').value; }

export function monthOptions(selected='') {
  const months = buildMonthRange(getDistinctMonths());
  return months.map(m => `<option value="${m}" ${m===selected?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');
}

export function getDistinctMonths() {
  const sets = [
    query('SELECT DISTINCT month FROM utilities'),
    query('SELECT DISTINCT month FROM production'),
    query('SELECT DISTINCT month FROM capacity_weekly'),
    query('SELECT DISTINCT month FROM manhours'),
    query('SELECT DISTINCT month FROM loss'),
    query('SELECT DISTINCT month FROM budget')
  ];
  const all = new Set();
  sets.forEach(s => s.forEach(r => all.add(r.month)));
  return [...all].sort();
}

export function populateMonthFilter() {
  const sel = document.getElementById('globalMonth');
  const allMonths = getDistinctMonths();
  const months = buildMonthRange(allMonths);
  sel.innerHTML = '<option value="">All Months</option>' + months.map(m=>`<option value="${m}">${fmtMonthLabel(m)}</option>`).join('');
  if (allMonths.length) sel.value = allMonths[allMonths.length-1];
}

function buildMonthRange(existingMonths = []) {
  const validExisting = existingMonths.filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  const now = new Date();
  const defaultStart = '2024-10';
  const defaultEnd = `${now.getFullYear() + 5}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = validExisting.length ? minMonth(defaultStart, validExisting[0]) : defaultStart;
  const end = validExisting.length ? maxMonth(defaultEnd, validExisting[validExisting.length - 1]) : defaultEnd;
  const months = [];
  let d = monthToDate(start);
  const endDate = monthToDate(end);
  while (d <= endDate) {
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function monthToDate(month) {
  const [year, monthNo] = month.split('-').map(Number);
  return new Date(year, monthNo - 1, 1);
}

function minMonth(a, b) {
  return a <= b ? a : b;
}

function maxMonth(a, b) {
  return a >= b ? a : b;
}

// CALCULATIONS
export function calcUtilCostPerKg(util_cost, volume) { return (!volume || volume === 0) ? null : util_cost / volume; }
export function calcRMCostPerKg(rm_cost, volume) { return (!volume || volume === 0) ? null : rm_cost / volume; }
export function calcEnggCostPerKg(util_cost, rm_cost, volume) { return (!volume || volume === 0) ? null : (util_cost + rm_cost) / volume; }
export function calcEfficiency(capacity, actual) { return (!capacity || capacity === 0) ? null : actual / capacity; }
export function calcRegHrsUtil(actual_reg, planned_reg) { return (!planned_reg || planned_reg === 0) ? null : actual_reg / planned_reg; }
export function calcOTUtil(actual_ot, planned_ot) { return (!planned_ot || planned_ot === 0) ? null : actual_ot / planned_ot; }
export function calcPersonDays(working_days, manpower) {
  return (!working_days || !manpower || working_days <= 0 || manpower <= 0) ? null : working_days * manpower;
}
export function calcPlannedRegHours(working_days, manpower) {
  const personDays = calcPersonDays(working_days, manpower);
  return personDays === null ? null : personDays * 8;
}
export function calcPlannedOTHours(working_days, manpower) {
  const personDays = calcPersonDays(working_days, manpower);
  return personDays === null ? null : personDays * 4;
}
export function calcTotalManhoursUtil(actual_reg, actual_ot, planned_reg, planned_ot) {
  const planned = (planned_reg || 0) + (planned_ot || 0);
  return planned <= 0 ? null : ((actual_reg || 0) + (actual_ot || 0)) / planned;
}
export function calcAbsenteeismRate(absenteeism, working_days, manpower, planned_reg) {
  const personDays = calcPersonDays(working_days, manpower);
  const plannedPersonDays = planned_reg > 0 ? planned_reg / 8 : null;
  const baseDays = personDays || plannedPersonDays;
  return (!baseDays || absenteeism == null) ? null : absenteeism / baseDays;
}
export function calcLossContribution(individual_loss, total_loss) { return (!total_loss || total_loss === 0) ? null : individual_loss / total_loss; }
export function calcVariance(actual, budget) { return actual - budget; }
export function calcVariancePct(actual, budget) { return (!budget || budget === 0) ? null : (actual - budget) / Math.abs(budget); }

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

export function getMonthData(month) {
  const u = month
    ? query(`SELECT * FROM utilities WHERE month = ? ORDER BY month DESC LIMIT 1`, [month])[0] || {}
    : query(`SELECT * FROM utilities ORDER BY month DESC LIMIT 1`)[0] || {};
  const p = month
    ? query(`SELECT * FROM production WHERE month = ? ORDER BY month DESC LIMIT 1`, [month])[0] || {}
    : query(`SELECT * FROM production ORDER BY month DESC LIMIT 1`)[0] || {};
  return { u, p };
}

export function getKPIs(month) {
  const { u, p } = getMonthData(month);
  return {
    util_cost: u.utility_cost, rm_cost: u.rm_cost, volume: p.volume,
    util_per_kg: calcUtilCostPerKg(u.utility_cost, p.volume),
    rm_per_kg: calcRMCostPerKg(u.rm_cost, p.volume),
    engg_per_kg: calcEnggCostPerKg(u.utility_cost, u.rm_cost, p.volume),
  };
}
