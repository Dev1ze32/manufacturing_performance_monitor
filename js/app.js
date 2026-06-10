import { initDB, run } from './database.js';
import {
  getGlobalMonth,
  setGlobalMonth,
  getFY,
  renderPeriodPicker,
  populateMonthFilter,
  showToast,
  clearForm,
  fmtMonthLabel,
  getRunrateSummaryRows,
  getManhoursSummaryRows
} from './utils.js';
import * as Dashboards from './dashboard.js';
import * as Forms from './forms.js';
import * as Importer from './importer.js';

let currentPage = 'executive';

// Attach Navigation to the global scope for the HTML 'onclick' attributes
window.navigateTo = function(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('[id^="page-"]').forEach(el => el.style.display = 'none');
  document.getElementById('page-' + page).style.display = '';
  currentPage = page;
  populateMonthFilter(page);  // refresh picker to show only months relevant to this page
  renderCurrentPage();
};

window.onGlobalMonthChange = function() {
  renderCurrentPage();
};

function renderCurrentPage() {
  // For manhours, apply the special runrate fallback; all others just use the current selection
  // (already validated/adjusted by populateMonthFilter when page changed)
  const m = currentPage === 'manhours' ? resolveRunrateManhoursMonth(getGlobalMonth()) : getGlobalMonth();
  const container = document.getElementById('page-' + currentPage);
  
  switch(currentPage) {
    case 'executive': Dashboards.renderExecutive(container, m); break;
    case 'cost': Dashboards.renderCost(container, m); break;
    case 'production': Dashboards.renderProduction(container, m); break;
    case 'manhours': Dashboards.renderManhours(container, m); break;
    case 'loss': Dashboards.renderLoss(container, m); break;
    case 'budget': Dashboards.renderBudget(container, m); break;
    case 'import': Importer.renderImport(container); break;
    case 'entry-utilities': Forms.renderEntryUtilities(container); break;
    case 'entry-production': Forms.renderEntryProduction(container); break;
    case 'entry-capacity': Forms.renderEntryCapacity(container); break;
    case 'entry-manhours': Forms.renderEntryManhours(container); break;
    case 'entry-budget': Forms.renderEntryBudget(container); break;
  }
}

function resolveRunrateManhoursMonth(selectedMonth) {
  if (!selectedMonth) return '';

  const runrateMonths = getRunrateSummaryRows('').map(r => r.month).filter(Boolean);
  const manhoursMonths = getManhoursSummaryRows('').map(r => r.month).filter(Boolean);
  const availableMonths = [...new Set([...runrateMonths, ...manhoursMonths])].sort();

  if (!availableMonths.length || availableMonths.includes(selectedMonth)) return selectedMonth;

  // Selected month has no data — fall back to latest available and update the picker
  const fallbackMonth = availableMonths[availableMonths.length - 1];
  setGlobalMonth(fallbackMonth);
  renderPeriodPicker(getFY(fallbackMonth), fallbackMonth);
  return fallbackMonth;
}

// Global Generic Delete (Used by the forms)
window.deleteRecord = function(table, month) {
  if(!confirm(`Delete record for ${fmtMonthLabel(month)}?`)) return;
  run(`DELETE FROM ${table} WHERE month=?`, [month]);
  showToast('Deleted.', 'error');
  renderCurrentPage();
};

const clearableEntryTables = new Set(['utilities', 'production', 'capacity', 'manhours', 'loss', 'budget']);

window.clearExistingRecords = function(table, label) {
  if(!clearableEntryTables.has(table)) {
    showToast('Cannot clear this record set.', 'error');
    return;
  }

  if(!confirm(`Clear all ${label}? This will delete every existing record in this section.`)) return;

  const cleared = run(`DELETE FROM ${table}`);
  if(!cleared) {
    showToast(`Could not clear ${label}.`, 'error');
    return;
  }

  populateMonthFilter(currentPage);
  showToast(`${label} cleared.`, 'error');
  renderCurrentPage();
};

window.clearForm = clearForm;

// Map form handlers to the window object so inline HTML functions keep working seamlessly
Object.entries(Forms).forEach(([name, func]) => {
  window[name] = func;
});

Object.entries(Importer).forEach(([name, func]) => {
  window[name] = func;
});

// Boot Application
window.addEventListener('DOMContentLoaded', () => {
  initDB().then(() => {
    populateMonthFilter(currentPage);
    renderCurrentPage();
  });
});