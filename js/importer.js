import { run } from './database.js';
import { fmtMonthLabel, populateMonthFilter, showToast } from './utils.js';

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

// Matches: "APR WEEK 14", "MAY WK18", "JUN WK 10", "NOV WEEK 3" etc.
const WEEK_LABEL_RE = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(?:WEEK|WK)\s*(\d+)$/i;

const PERIOD_RE = /\b(ACT|OB)\s*(\d{2,4})\s+([A-Z]{3,9})\b/i;
const MONTH_RE = /^(JANUARY|JAN|FEBRUARY|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEPT|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)$/i;

function renderImport(c) {
  const defaultFy = new Date().getFullYear();
  c.innerHTML = `
    <div class="page-header">
      <h1>Import Excel</h1>
      <p>Load workbook data into the dashboard tables</p>
    </div>

    <div class="card section-gap">
      <div class="info-block">
        <strong>Supported patterns:</strong> utilities workbooks with ACT/OB fiscal period columns, and production workbooks with repeated line blocks for capacity and manhours.
      </div>
      <div class="form-section">
        <div class="form-section-title">Workbook Import</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Excel files *</label>
            <input type="file" id="import_files" accept=".xlsx,.xls,.xlsm" multiple>
            <span class="form-hint">You can select both workbooks in one import.</span>
          </div>
          <div class="form-group">
            <label>Fiscal year for sheets without ACT/OB headers</label>
            <input type="number" id="import_fy" value="${defaultFy}" min="2020" max="2099" step="1">
            <span class="form-hint">FY2026 maps Oct 2025 through Sep 2026.</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="startExcelImport()">Import Selected Files</button>
          <button class="btn btn-secondary" onclick="resetImportResult()">Clear Result</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Import Result</div>
      <div id="import_result" class="import-result empty">
        <p>No import has run yet.</p>
        <p class="empty-hint">Choose an Excel file, then import.</p>
      </div>
    </div>
  `;
}

async function startExcelImport() {
  const input = document.getElementById('import_files');
  const result = document.getElementById('import_result');
  const fy = parseInt(document.getElementById('import_fy').value, 10);

  if (!window.XLSX) {
    showToast('Excel parser did not load. Check internet access for the XLSX CDN.', 'error');
    return;
  }
  if (!input?.files?.length) {
    showToast('Select at least one Excel file.', 'error');
    return;
  }
  if (!Number.isInteger(fy) || fy < 2020 || fy > 2099) {
    showToast('Enter a valid fiscal year.', 'error');
    return;
  }

  result.className = 'import-result';
  result.innerHTML = '<div class="loading">Reading workbook data...</div>';

  const totals = createTotals();
  const fileSummaries = [];

  try {
    for (const file of input.files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const parsed = parseWorkbook(workbook, fy);
      const applied = applyParsedData(parsed);
      mergeTotals(totals, applied);
      fileSummaries.push({ name: file.name, parsed, applied });
    }

    populateMonthFilter();
    result.innerHTML = renderImportSummary(fileSummaries, totals);
    showToast(`Import complete: ${totalAppliedRows(totals)} records updated.`);
  } catch (error) {
    console.error(error);
    result.innerHTML = `<div class="empty"><p>Import failed.</p><p class="empty-hint">${escapeHtml(error.message || String(error))}</p></div>`;
    showToast('Import failed. See the result panel.', 'error');
  }
}

function resetImportResult() {
  const result = document.getElementById('import_result');
  if (result) {
    result.className = 'import-result empty';
    result.innerHTML = '<p>No import has run yet.</p><p class="empty-hint">Choose an Excel file, then import.</p>';
  }
}

function parseWorkbook(workbook, defaultFy) {
  const parsed = createParsedData();

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) return;
    parsePeriodMetricSheet(sheet, parsed);
    parseOperationalSheet(sheet, parsed, defaultFy);
  });

  return parsed;
}

function createParsedData() {
  return {
    utilities: new Map(),
    production: new Map(),
    budget: new Map(),
    capacity: new Map(),
    capacity_weekly: new Map(),
    manhours: new Map(),
    loss: new Map()
  };
}

function createTotals() {
  return { utilities: 0, production: 0, budget: 0, capacity: 0, capacity_weekly: 0, manhours: 0, loss: 0 };
}

function parsePeriodMetricSheet(sheet, parsed) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let activePeriods = new Map();

  for (let r = range.s.r; r <= range.e.r; r++) {
    // 🛑 NEW FIX: Stop parsing if we hit the YTD Summary sections
    const firstColText = cleanText(getCellValue(sheet, r, 0));
    if (/ACTUAL\s*FY|OB\s*FY/i.test(firstColText)) {
      activePeriods.clear(); // Wipes the memory of the columns so it stops reading
      continue;
    }
    const periods = getPeriodsInRow(sheet, r, range);
    if (periods.size) {
      activePeriods = periods;
      continue;
    }

    if (!activePeriods.size) continue;

    // Stop scanning metric rows when we hit a clearly non-data section
    // (a row with no label and no numeric values in any period column)
    const label = findRowLabel(sheet, r, Math.min(range.e.c, 5));
    const metric = classifyPeriodMetric(label);
    if (!metric) continue;

    activePeriods.forEach((period, c) => {
      const value = toNumber(getCellValue(sheet, r, c));
      if (value == null) return;
      // Skip zero cost/volume values — they indicate unfilled future months
      if (value === 0) return;

      if (period.source === 'ACT') {
        if (metric === 'utility') upsertMap(parsed.utilities, period.month, { utility_cost: value });
        if (metric === 'rm') upsertMap(parsed.utilities, period.month, { rm_cost: value });
        if (metric === 'volume') upsertMap(parsed.production, period.month, { volume: value });
      }

      if (period.source === 'OB') {
        if (metric === 'utility') upsertMap(parsed.budget, period.month, { utility_budget: value });
        if (metric === 'rm') upsertMap(parsed.budget, period.month, { rm_budget: value });
        if (metric === 'volume') upsertMap(parsed.budget, period.month, { volume_budget: value });
      }
    });
  }
}

function parseOperationalSheet(sheet, parsed, defaultFy) {
  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const text = cleanText(getCellValue(sheet, r, c));
      if (!text) continue;

      if ((/RUNRATE\s+EFFICIENCY/i.test(text) || /OUTPUT\s+CAPACITY/i.test(text) || /CAPACITY\s+VS\s+ACTUAL/i.test(text)) && (/LINE/i.test(text) || /\bL\d/i.test(text))) {
        parseCapacityBlock(sheet, parsed, defaultFy, r, c, range, normalizeLineName(text));
      }

      if (/MANHOURS/i.test(text) && /LINE/i.test(text)) {
        parseManhoursBlock(sheet, parsed, defaultFy, r, c, range, normalizeLineName(text));
      }

      if (/^Q\d\b/i.test(text) && /\bL\d\b/i.test(text) && !/MANHOURS|EFFICIENCY/i.test(text)) {
        parseLossBlock(sheet, parsed, defaultFy, r, c, range, normalizeLineName(text), text);
      }
    }
  }
}

function parseCapacityBlock(sheet, parsed, defaultFy, headingRow, startCol, range, line) {
  if (!line) return;
  // Use full sheet range — multi-month blocks (e.g. Q3 = Apr/May/Jun) can span
  // 45+ rows from the heading row, so the old +40 cutoff silently dropped June data.
  const endRow = range.e.r;

  for (let r = headingRow + 1; r <= endRow; r++) {
    const rawLabel = cleanText(getCellValue(sheet, r, startCol));
    if (!rawLabel) continue;

    // Stop if we hit another block heading in this column (next line's section starts)
    if (/RUNRATE\s+EFFICIENCY/i.test(rawLabel) || /MANHOURS/i.test(rawLabel)) break;

    // ── Monthly total row ────────────────────────────────────────────────────
    if (isMonthName(rawLabel)) {
      const month = monthNameToIso(rawLabel, defaultFy);
      const capacity = toNumber(getCellValue(sheet, r, startCol + 1));
      const actual   = toNumber(getCellValue(sheet, r, startCol + 2));
      if (capacity == null && actual == null) continue;
      if (capacity === 0 && actual === 0) continue;
      upsertMap(parsed.capacity, keyed(month, line), { month, line, capacity, actual_output: actual });
      continue;
    }

    // ── Weekly row  (e.g. "APR WEEK 14", "MAY WK18") ────────────────────────
    const weekMatch = rawLabel.match(WEEK_LABEL_RE);
    if (weekMatch) {
      const monthAbbr  = weekMatch[1];
      const weekNum    = parseInt(weekMatch[2], 10);
      const month      = monthNameToIso(monthAbbr, defaultFy);
      const weekLabel  = rawLabel.toUpperCase();          // normalise casing
      const capacity   = toNumber(getCellValue(sheet, r, startCol + 1));
      const actual     = toNumber(getCellValue(sheet, r, startCol + 2));
      if (capacity == null && actual == null) continue;
      if (capacity === 0 && actual === 0) continue;      // skip empty future weeks
      upsertMap(
        parsed.capacity_weekly,
        keyed(month, line) + '::' + weekLabel,
        { month, line, week_label: weekLabel, week_num: weekNum, capacity, actual_output: actual }
      );
    }
  }
}

function parseManhoursBlock(sheet, parsed, defaultFy, headingRow, startCol, range, line) {
  if (!line) return;

  for (let r = headingRow + 1; r <= range.e.r; r++) {
    const label = cleanText(getCellValue(sheet, r, startCol));
    if (!isMonthName(label)) continue;

    const month = monthNameToIso(label, defaultFy);
    const record = { month, line };
    const sectionEnd = findNextMonthSection(sheet, startCol, r + 1, range.e.r);

    for (let rr = r + 1; rr < sectionEnd; rr++) {
      const rowLabel = cleanText(getCellValue(sheet, rr, startCol));
      const planned = toNumber(getCellValue(sheet, rr, startCol + 1));
      const actual = toNumber(getCellValue(sheet, rr, startCol + 2));

      if (/^REG\s+HRS/i.test(rowLabel)) {
        record.planned_reg = planned;
        record.actual_reg = actual;
      } else if (/^OT\s+HRS/i.test(rowLabel)) {
        record.planned_ot = planned;
        record.actual_ot = actual;
      } else if (/ABSENTEEISM/i.test(rowLabel)) {
        record.absenteeism = actual ?? planned;
      }
    }

    if (hasAnyNumber(record, ['planned_reg', 'actual_reg', 'planned_ot', 'actual_ot', 'absenteeism'])) {
      upsertMap(parsed.manhours, keyed(month, line), record);
    }
  }
}

function parseLossBlock(sheet, parsed, defaultFy, headingRow, startCol, range, line, headingText) {
  if (!line) return;

  const quarter = Number((headingText.match(/^Q(\d)/i) || [])[1]);
  const month = quarterToFiscalEndMonth(quarter, defaultFy);
  if (!month) return;

  const record = { month, line };
  const endRow = Math.min(range.e.r, headingRow + 5);

  for (let r = headingRow + 1; r <= endRow; r++) {
    const label = cleanText(getCellValue(sheet, r, startCol));
    const value = toNumber(getCellValue(sheet, r, startCol + 1));
    if (value == null) continue;

    if (/RUNRATE/i.test(label)) record.runrate_loss = normalizePercent(value);
    if (/ABSENTEEISM/i.test(label)) record.absenteeism_loss = normalizePercent(value);
    if (/MANHOURS/i.test(label)) record.manhours_loss = normalizePercent(value);
  }

  if (hasAnyNumber(record, ['runrate_loss', 'absenteeism_loss', 'manhours_loss'])) {
    upsertMap(parsed.loss, keyed(month, line), record);
  }
}

function applyParsedData(parsed) {
  const totals = createTotals();

  parsed.utilities.forEach((r, month) => {
    if (isAllZeroOrNull(r, ['utility_cost', 'rm_cost'])) return;
    if (run(`INSERT INTO utilities (month, utility_cost, rm_cost) VALUES (?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        utility_cost = COALESCE(excluded.utility_cost, utilities.utility_cost),
        rm_cost = COALESCE(excluded.rm_cost, utilities.rm_cost)`,
      [month, nullIfMissing(r.utility_cost), nullIfMissing(r.rm_cost)])) totals.utilities++;
  });

  parsed.production.forEach((r, month) => {
    if (r.volume == null || r.volume === 0) return;
    if (run(`INSERT INTO production (month, volume) VALUES (?, ?)
      ON CONFLICT(month) DO UPDATE SET volume = excluded.volume`,
      [month, r.volume])) totals.production++;
  });

  parsed.budget.forEach((r, month) => {
    if (isAllZeroOrNull(r, ['utility_budget', 'rm_budget', 'volume_budget'])) return;
    if (run(`INSERT INTO budget (month, utility_budget, rm_budget, volume_budget) VALUES (?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        utility_budget = COALESCE(excluded.utility_budget, budget.utility_budget),
        rm_budget = COALESCE(excluded.rm_budget, budget.rm_budget),
        volume_budget = COALESCE(excluded.volume_budget, budget.volume_budget)`,
      [month, nullIfMissing(r.utility_budget), nullIfMissing(r.rm_budget), nullIfMissing(r.volume_budget)])) totals.budget++;
  });

  parsed.capacity.forEach(r => {
    if (isAllZeroOrNull(r, ['capacity', 'actual_output'])) return;
    if (run(`INSERT INTO capacity (month, line, capacity, actual_output) VALUES (?, ?, ?, ?)
      ON CONFLICT(month, line) DO UPDATE SET
        capacity = COALESCE(excluded.capacity, capacity.capacity),
        actual_output = COALESCE(excluded.actual_output, capacity.actual_output)`,
      [r.month, r.line, nullIfMissing(r.capacity), nullIfMissing(r.actual_output)])) totals.capacity++;
  });

  parsed.capacity_weekly.forEach(r => {
    if (isAllZeroOrNull(r, ['capacity', 'actual_output'])) return;
    if (run(`INSERT INTO capacity_weekly (month, line, week_label, week_num, capacity, actual_output) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(month, line, week_label) DO UPDATE SET
        week_num = excluded.week_num,
        capacity = COALESCE(excluded.capacity, capacity_weekly.capacity),
        actual_output = COALESCE(excluded.actual_output, capacity_weekly.actual_output)`,
      [r.month, r.line, r.week_label, r.week_num ?? null, nullIfMissing(r.capacity), nullIfMissing(r.actual_output)])) totals.capacity_weekly++;
  });

  parsed.manhours.forEach(r => {
    if (isAllZeroOrNull(r, ['planned_reg', 'actual_reg', 'planned_ot', 'actual_ot', 'absenteeism'])) return;
    if (run(`INSERT INTO manhours (month, line, planned_reg, actual_reg, planned_ot, actual_ot, absenteeism) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month, line) DO UPDATE SET
        planned_reg = COALESCE(excluded.planned_reg, manhours.planned_reg),
        actual_reg = COALESCE(excluded.actual_reg, manhours.actual_reg),
        planned_ot = COALESCE(excluded.planned_ot, manhours.planned_ot),
        actual_ot = COALESCE(excluded.actual_ot, manhours.actual_ot),
        absenteeism = COALESCE(excluded.absenteeism, manhours.absenteeism)`,
      [r.month, r.line || '', nullIfMissing(r.planned_reg), nullIfMissing(r.actual_reg), nullIfMissing(r.planned_ot), nullIfMissing(r.actual_ot), nullIfMissing(r.absenteeism)])) totals.manhours++;
  });

  parsed.loss.forEach(r => {
    if (isAllZeroOrNull(r, ['runrate_loss', 'absenteeism_loss', 'manhours_loss'])) return;
    if (run(`INSERT INTO loss (month, line, runrate_loss, absenteeism_loss, manhours_loss) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(month, line) DO UPDATE SET
        runrate_loss = COALESCE(excluded.runrate_loss, loss.runrate_loss),
        absenteeism_loss = COALESCE(excluded.absenteeism_loss, loss.absenteeism_loss),
        manhours_loss = COALESCE(excluded.manhours_loss, loss.manhours_loss)`,
      [r.month, r.line || '', nullIfMissing(r.runrate_loss), nullIfMissing(r.absenteeism_loss), nullIfMissing(r.manhours_loss)])) totals.loss++;
  });

  return totals;
}

function getPeriodsInRow(sheet, r, range) {
  const periods = new Map();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const period = parsePeriodHeader(getCellValue(sheet, r, c));
    if (period) periods.set(c, period);
  }
  return periods;
}

function parsePeriodHeader(value) {
  const match = cleanText(value).match(PERIOD_RE);
  if (!match) return null;

  const monthNo = monthNumber(match[3]);
  if (!monthNo) return null;

  const fiscalYear = normalizeYear(match[2]);
  const calendarYear = monthNo >= 10 ? fiscalYear - 1 : fiscalYear;

  return {
    source: match[1].toUpperCase(),
    month: isoMonth(calendarYear, monthNo)
  };
}

function classifyPeriodMetric(label) {
  const text = cleanText(label);
  if (!text) return null;
  if (/UTILIT/i.test(text)) return 'utility';
  if (/^(R\s*&\s*M|R&M|REPAIR)/i.test(text)) return 'rm';
  if (/VOLUME/i.test(text)) return 'volume';
  return null;
}

function findRowLabel(sheet, r, maxCol) {
  for (let c = 0; c <= maxCol; c++) {
    const value = getCellValue(sheet, r, c);
    if (typeof value === 'string' && cleanText(value)) return value;
  }
  return '';
}

function findNextMonthSection(sheet, startCol, fromRow, maxRow) {
  for (let r = fromRow; r <= maxRow; r++) {
    if (isMonthName(getCellValue(sheet, r, startCol))) return r;
  }
  return Math.min(maxRow + 1, fromRow + 12);
}

function getCellValue(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : null;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[,%₱PHP\s]/gi, '');
  if (!cleaned || cleaned === '-') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value) {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function normalizeLineName(text) {
  const cleaned = cleanText(text).replace(/^Q\d+\s+/i, '');
  const compact = cleaned
    .replace(/\b(APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY|MARCH)\b.*$/i, '')
    .replace(/\bRUNRATE\b.*$/i, '')
    .replace(/\bMANHOURS\b.*$/i, '')
    .trim();

  const shortLine = compact.match(/\bL(\d+)\s+(.+)$/i);
  if (shortLine) {
    const product = shortLine[2].trim();
    if (/ELASTOSEAL|ES\b/i.test(product)) return `Line ${shortLine[1]} ES`;
    if (/EPOXY/i.test(product)) return `Line ${shortLine[1]} Epoxy`;
    if (/\bBB\b/i.test(product)) return `Line ${shortLine[1]} BB`;
    return `Line ${shortLine[1]} ${titleCase(product)}`;
  }

  const line = compact.match(/\bLINE\s+\d+\s+.+$/i);
  return line ? titleCase(line[0]).replace(/\bEs\b/g, 'ES').replace(/\bBb\b/g, 'BB') : '';
}

function titleCase(value) {
  return cleanText(value).toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}

function isMonthName(value) {
  return MONTH_RE.test(cleanText(value));
}

function monthNumber(value) {
  return MONTHS[cleanText(value).toLowerCase()];
}

function monthNameToIso(monthName, fiscalYear) {
  const monthNo = monthNumber(monthName);
  const year = monthNo >= 10 ? fiscalYear - 1 : fiscalYear;
  return isoMonth(year, monthNo);
}

function quarterToFiscalEndMonth(quarter, fiscalYear) {
  const fiscalQuarterEnd = { 1: [fiscalYear - 1, 12], 2: [fiscalYear, 3], 3: [fiscalYear, 6], 4: [fiscalYear, 9] };
  const end = fiscalQuarterEnd[quarter];
  return end ? isoMonth(end[0], end[1]) : '';
}

function normalizeYear(value) {
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function isoMonth(year, monthNo) {
  return `${year}-${String(monthNo).padStart(2, '0')}`;
}

function keyed(month, line) {
  return `${month}::${line}`;
}

function upsertMap(map, key, patch) {
  map.set(key, { ...(map.get(key) || {}), ...patch });
}

function nullIfMissing(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function normalizePercent(value) {
  const n = nullIfMissing(value);
  return n == null ? null : (Math.abs(n) > 1 ? n / 100 : n);
}

function hasAnyNumber(record, fields) {
  return fields.some(field => record[field] != null && Number.isFinite(Number(record[field])));
}

function isAllZeroOrNull(record, fields) {
  return fields.every(field => record[field] == null || Number(record[field]) === 0);
}

function mergeTotals(target, source) {
  Object.keys(target).forEach(key => { target[key] += source[key] || 0; });
}

function totalAppliedRows(totals) {
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}

function renderImportSummary(fileSummaries, totals) {
  const cards = [
    ['Utilities', totals.utilities],
    ['Production', totals.production],
    ['Budget', totals.budget],
    ['Capacity (Monthly)', totals.capacity],
    ['Capacity (Weekly)', totals.capacity_weekly],
    ['Manhours', totals.manhours],
    ['Loss', totals.loss]
  ].map(([label, value]) => `
    <div class="import-stat">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-sub">records updated</div>
    </div>
  `).join('');

  const files = fileSummaries.map(summary => {
    const months = collectMonths(summary.parsed);
    return `<tr>
      <td><strong>${escapeHtml(summary.name)}</strong></td>
      <td>${months.length ? escapeHtml(formatMonthRange(months)) : '-'}</td>
      <td class="td-number">${totalAppliedRows(summary.applied)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="import-stats">${cards}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>File</th><th>Months detected</th><th>Rows updated</th></tr></thead>
        <tbody>${files}</tbody>
      </table>
    </div>
  `;
}

function collectMonths(parsed) {
  const months = new Set();
  ['utilities', 'production', 'budget'].forEach(key => {
    parsed[key].forEach((_, month) => months.add(month));
  });
  ['capacity', 'manhours', 'loss'].forEach(key => {
    parsed[key].forEach(record => months.add(record.month));
  });
  return [...months].filter(Boolean).sort();
}

function formatMonthRange(months) {
  if (months.length === 1) return fmtMonthLabel(months[0]);
  return `${fmtMonthLabel(months[0])} to ${fmtMonthLabel(months[months.length - 1])}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

export { renderImport, startExcelImport, resetImportResult };