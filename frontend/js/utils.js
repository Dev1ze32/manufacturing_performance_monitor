import {
  getAllDistinctMonthRows,
  getBudgetDistinctMonthRows,
  getCostDistinctMonthRows,
  getLatestProductionRecord,
  getLatestUtilitiesRecord,
  getManhoursSummaryRows as fetchManhoursSummaryRows,
  getRunrateManhoursDistinctMonthRows,
  getRunrateSummaryRows as fetchRunrateSummaryRows
} from './queries/utilsQueries.js';

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

export function normalizeLineName(value) {
  const cleaned = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const compact = cleaned
    .replace(/^Q\d+\s+/i, '')
    .replace(/\b(APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY|MARCH)\b.*$/i, '')
    .replace(/\bRUNRATE\b.*$/i, '')
    .replace(/\bMANHOURS\b.*$/i, '')
    .trim();

  const shortLine = compact.match(/\bL(?:INE)?\s*(\d+)\s+(.+)$/i);
  if (shortLine) {
    const product = shortLine[2].trim();
    if (/ELASTOSEAL|ES\b/i.test(product)) return `Line ${shortLine[1]} ES`;
    if (/EPOXY/i.test(product)) return `Line ${shortLine[1]} Epoxy`;
    if (/\bBB\b/i.test(product)) return `Line ${shortLine[1]} BB`;
    return `Line ${shortLine[1]} ${titleCase(product)}`;
  }

  return titleCase(compact).replace(/\bEs\b/g, 'ES').replace(/\bBb\b/g, 'BB');
}

function titleCase(value) {
  return String(value).toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}

// Module-level source of truth for the selected month.
// No longer depends on <select> having matching <option> elements loaded.
let _globalMonth = '';
export function getGlobalMonth() { return _globalMonth; }
export function setGlobalMonth(m) { _globalMonth = m || ''; }

export function monthOptions(selected='') {
  const months = buildMonthRange(getDistinctMonths());
  return months.map(m => `<option value="${m}" ${m===selected?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');
}

export function getDistinctMonths() {
  const all = new Set();
  getAllDistinctMonthRows().forEach(r => all.add(r.month));
  return [...all].sort();
}

// Returns months that have relevant data for a specific dashboard page.
// Data entry pages fall through to all months (they show everything).
export function getMonthsForPage(page) {
  switch (page) {
    case 'cost':
      return unionMonths(getCostDistinctMonthRows());
    case 'manhours':
      return unionMonths(getRunrateManhoursDistinctMonthRows());
    case 'loss':
      return unionMonths(getRunrateManhoursDistinctMonthRows());
    case 'budget':
      return unionMonths(getBudgetDistinctMonthRows());
    case 'executive':
      // Executive uses everything — show all months that have any data
      return getDistinctMonths();
    default:
      // Data entry pages and others: all months
      return getDistinctMonths();
  }
}

function unionMonths(...sets) {
  const all = new Set();
  sets.forEach(s => s.forEach(r => all.add(r.month)));
  return [...all].sort();
}

// ── FISCAL YEAR HELPERS ────────────────────────────────────────────────────────
// Fiscal year starts in October. FY26 = Oct 2025 → Sep 2026.
// getFY(month) returns the fiscal year number for a given YYYY-MM string.
export function getFY(month) {
  if (!month) return null;
  const [y, mo] = month.split('-').map(Number);
  return mo >= 10 ? y + 1 : y;
}

// Returns the 12 YYYY-MM months that belong to a given fiscal year, in FY order.
export function getFYMonths(fy) {
  const months = [];
  for (let mo = 10; mo <= 12; mo++) months.push(`${fy - 1}-${String(mo).padStart(2,'0')}`);
  for (let mo = 1; mo <= 9; mo++) months.push(`${fy}-${String(mo).padStart(2,'0')}`);
  return months;
}

// Returns Set of months that have at least one data record.
export function getMonthsWithData() {
  return new Set(getDistinctMonths());
}

// Returns the current fiscal year based on today's date.
export function getCurrentFY() {
  const now = new Date();
  return getFY(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
}

export function populateMonthFilter(page) {
  const dataMonths = page ? getMonthsForPage(page) : getDistinctMonths();
  const currentFY = getCurrentFY();

  // Auto-select latest month with data for this page; keep current selection if it's valid
  const currentSel = getGlobalMonth();
  const latestMonth = dataMonths.length ? dataMonths[dataMonths.length - 1] : null;
  const validSel = currentSel && dataMonths.includes(currentSel) ? currentSel : latestMonth;
  setGlobalMonth(validSel);

  const latestDataFY = validSel ? getFY(validSel) : currentFY;
  const displayFY = Math.max(latestDataFY, currentFY);

  renderPeriodPicker(displayFY, validSel, new Set(dataMonths));
}

// Renders the custom FY period picker into #period-picker-root
// relevantMonths: optional Set of months to show — defaults to all months with any data
export function renderPeriodPicker(fy, selectedMonth, relevantMonths) {
  const root = document.getElementById('period-picker-root');
  if (!root) return;

  const withData = relevantMonths || getMonthsWithData();
  // Cache for _fyNav and _selectMonth to reuse the same filter
  window._currentPickerMonths = withData;
  const fyMonths = getFYMonths(fy);
  const shortNames = ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'];
  const currentFY = getCurrentFY();

  // Determine earliest FY that has data (or current FY if none)
  const allData = getDistinctMonths();
  const earliestFY = allData.length ? getFY(allData[0]) : currentFY;
  const canGoPrev = fy > earliestFY;
  const canGoNext = fy < currentFY + 1; // allow one FY ahead of current

  // Only show months that actually have data
  const visibleMonths = fyMonths.map((m, i) => ({ m, i })).filter(({ m }) => withData.has(m));

  const monthButtons = visibleMonths.length
    ? visibleMonths.map(({ m, i }) => {
        const isSelected = m === selectedMonth;
        return `<button class="period-month has-data ${isSelected ? 'selected' : ''}"
          onclick="window._selectMonth('${m}')"
          title="${fmtMonthLabel(m)}"
        >${shortNames[i]}</button>`;
      }).join('')
    : `<div class="period-empty">No data for FY${fy}</div>`;

  root.innerHTML = `
    <div class="period-picker">
      <div class="period-picker-header">
        <button class="period-nav ${canGoPrev ? '' : 'disabled'}" onclick="window._fyNav(${fy - 1})" ${canGoPrev ? '' : 'disabled'} title="Previous fiscal year">&#8249;</button>
        <span class="period-fy-label">FY${fy}</span>
        <button class="period-nav ${canGoNext ? '' : 'disabled'}" onclick="window._fyNav(${fy + 1})" ${canGoNext ? '' : 'disabled'} title="Next fiscal year">&#8250;</button>
      </div>
      <div class="period-months">
        ${monthButtons}
      </div>
      <button class="period-all-btn ${!selectedMonth ? 'selected' : ''}" onclick="window._selectMonth('')">
        All Months
      </button>
    </div>`;
}

// Wired up in app.js boot
window._fyNav = function(fy) {
  renderPeriodPicker(fy, getGlobalMonth() || null, window._currentPickerMonths);
};

window._selectMonth = function(month) {
  setGlobalMonth(month);
  const fy = month ? getFY(month) : getCurrentFY();
  const relevantMonths = window._currentPickerMonths;
  const months = relevantMonths ? [...relevantMonths] : getDistinctMonths();
  const latestFY = months.length ? getFY(months[months.length - 1]) : getCurrentFY();
  renderPeriodPicker(month ? fy : Math.max(latestFY, getCurrentFY()), month || null, relevantMonths);
  if (window.onGlobalMonthChange) window.onGlobalMonthChange();
};

function buildMonthRange(existingMonths = []) {
  const validExisting = existingMonths.filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  // FY-aligned start: Oct 2024 (FY25 start)
  const defaultStart = '2024-10';
  // End: always through the END of the current fiscal year so data entry
  // for upcoming months is always possible — no manual maintenance needed.
  // Current FY ends in Sep of the FY number (e.g. FY26 ends Sep 2026).
  // We extend one full FY ahead so the next year's months are also enterable.
  const fy = getCurrentFY();
  const fyEnd = `${fy}-09`;           // Sep of current FY = last month of FY
  const nextFyEnd = `${fy + 1}-09`;  // Sep of next FY = always one year of runway
  const dataEnd = validExisting.length ? validExisting[validExisting.length - 1] : '';
  const defaultEnd = maxMonth(nextFyEnd, dataEnd || nextFyEnd);
  const start = validExisting.length ? minMonth(defaultStart, validExisting[0]) : defaultStart;
  const months = [];
  let d = monthToDate(start);
  const endDate = monthToDate(defaultEnd);
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
export function calcOTRate(actual_ot, actual_reg) {
  const total = (actual_ot || 0) + (actual_reg || 0);
  return total <= 0 ? null : (actual_ot || 0) / total;
}
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
  return fetchManhoursSummaryRows(month);
}

export function getRunrateSummaryRows(month = '') {
  return fetchRunrateSummaryRows(month);
}

export function getMonthData(month) {
  const u = getLatestUtilitiesRecord(month);
  const p = getLatestProductionRecord(month);
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
