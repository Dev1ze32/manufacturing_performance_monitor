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
  const months = [];
  let d = new Date(2024, 9);
  const end = new Date(); end.setFullYear(end.getFullYear() + 2);
  while (d <= end) {
    const val = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    months.push(val);
    d.setMonth(d.getMonth()+1);
  }
  return months.map(m => `<option value="${m}" ${m===selected?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');
}

export function getDistinctMonths() {
  const sets = [ query('SELECT DISTINCT month FROM utilities'), query('SELECT DISTINCT month FROM production'), query('SELECT DISTINCT month FROM capacity') ];
  const all = new Set();
  sets.forEach(s => s.forEach(r => all.add(r.month)));
  return [...all].sort();
}

export function populateMonthFilter() {
  const sel = document.getElementById('globalMonth');
  const allMonths = getDistinctMonths();
  let d = new Date(2024, 9);
  const end = new Date(); end.setFullYear(end.getFullYear()+2);
  const months = [];
  while (d <= end) { months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()+1); }
  sel.innerHTML = '<option value="">All Months</option>' + months.map(m=>`<option value="${m}">${fmtMonthLabel(m)}</option>`).join('');
  if (allMonths.length) sel.value = allMonths[allMonths.length-1];
}

// CALCULATIONS
export function calcUtilCostPerKg(util_cost, volume) { return (!volume || volume === 0) ? null : util_cost / volume; }
export function calcRMCostPerKg(rm_cost, volume) { return (!volume || volume === 0) ? null : rm_cost / volume; }
export function calcEnggCostPerKg(util_cost, rm_cost, volume) { return (!volume || volume === 0) ? null : (util_cost + rm_cost) / volume; }
export function calcEfficiency(capacity, actual) { return (!capacity || capacity === 0) ? null : actual / capacity; }
export function calcRegHrsUtil(actual_reg, planned_reg) { return (!planned_reg || planned_reg === 0) ? null : actual_reg / planned_reg; }
export function calcOTUtil(actual_ot, planned_ot) { return (!planned_ot || planned_ot === 0) ? null : actual_ot / planned_ot; }
export function calcLossContribution(individual_loss, total_loss) { return (!total_loss || total_loss === 0) ? null : individual_loss / total_loss; }
export function calcVariance(actual, budget) { return actual - budget; }
export function calcVariancePct(actual, budget) { return (!budget || budget === 0) ? null : (actual - budget) / Math.abs(budget); }

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