import { query } from './database.js';
import { 
  fmt, fmtN, fmtPct, fmtMonthLabel, getKPIs, calcUtilCostPerKg, 
  calcRMCostPerKg, calcEnggCostPerKg, calcEfficiency, 
  calcRegHrsUtil, calcOTUtil, calcLossContribution, calcVariance, calcVariancePct,
  destroyChart, charts 
} from './utils.js';


// ── EXECUTIVE DASHBOARD ───────────────────────────────────────────────────────
function renderExecutive(c, month) {
  const kpis = getKPIs(month);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
 
  // Get efficiency for selected month
  const capRows = month ? query(`SELECT * FROM capacity WHERE month = ?`, [month]) :
    query(`SELECT * FROM capacity ORDER BY month DESC`);
  let totalCap = 0, totalActual = 0;
  capRows.forEach(r => { totalCap += r.capacity||0; totalActual += r.actual_output||0; });
  const efficiency = totalCap > 0 ? totalActual/totalCap : null;
 
  // Manhours
  const mhRows = month ? query(`SELECT * FROM manhours WHERE month = ?`, [month]) :
    query(`SELECT * FROM manhours ORDER BY month DESC`);
  let sumPReg=0, sumAReg=0, sumPOT=0, sumAOT=0;
  mhRows.forEach(r => { sumPReg+=r.planned_reg||0; sumAReg+=r.actual_reg||0; sumPOT+=r.planned_ot||0; sumAOT+=r.actual_ot||0; });
 
  const regUtil = calcRegHrsUtil(sumAReg, sumPReg);
  const otUtil = calcOTUtil(sumAOT, sumPOT);
 
  const budRows = month ? query(`SELECT * FROM budget WHERE month = ?`, [month]) : [];
  const bud = budRows[0] || {};
 
  function kpiCard(label, value, unit='', badge='', hint='') {
    const hasVal = value !== null && value !== undefined && !isNaN(value) && isFinite(value);
    return `<div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${hasVal ? (unit==='%' ? (value*100).toFixed(2)+'%' : fmt(value,3)) : '—'}</div>
      ${hint ? `<div class="metric-sub">${hint}</div>` : ''}
      ${badge ? `<div class="metric-badge badge-${badge.type}">${badge.text}</div>` : ''}
    </div>`;
  }
 
  // Trend data (last 12 months)
  const trendU = query(`SELECT u.month, u.utility_cost, u.rm_cost, p.volume
    FROM utilities u LEFT JOIN production p ON u.month = p.month
    ORDER BY u.month ASC LIMIT 12`);
 
  const trendLabels = trendU.map(r => fmtMonthLabel(r.month));
  const trendUtil = trendU.map(r => r.volume > 0 ? (r.utility_cost/r.volume) : null);
  const trendRM = trendU.map(r => r.volume > 0 ? (r.rm_cost/r.volume) : null);
  const trendEngg = trendU.map(r => r.volume > 0 ? ((r.utility_cost+r.rm_cost)/r.volume) : null);
 
  c.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1>Executive Summary</h1>
          <p>Key performance indicators — ${mLabel}</p>
        </div>
      </div>
    </div>
 
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px; color:var(--gray-500);">COST PERFORMANCE</div>
      <div class="metrics-grid">
        ${kpiCard('Utility Cost / Kg', kpis.util_per_kg, '', '', kpis.util_cost ? `₱ ${fmtN(kpis.util_cost,2)} total` : '')}
        ${kpiCard('R&M Cost / Kg', kpis.rm_per_kg, '', '', kpis.rm_cost ? `₱ ${fmtN(kpis.rm_cost,2)} total` : '')}
        ${kpiCard('Engineering Cost / Kg', kpis.engg_per_kg, '', '', 'Utilities + R&M combined')}
        ${kpiCard('Production Volume', kpis.volume, '', '', 'in metric tons')}
      </div>
    </div>
 
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px; color:var(--gray-500);">PRODUCTION PERFORMANCE</div>
      <div class="metrics-grid">
        ${kpiCard('Overall Efficiency', efficiency, '%', '', totalCap > 0 ? `${fmtN(totalActual,0)} / ${fmtN(totalCap,0)} units` : '')}
        ${kpiCard('Regular Hrs Utilization', regUtil, '%', '', sumPReg > 0 ? `${fmtN(sumAReg,1)} / ${fmtN(sumPReg,0)} hrs` : '')}
        ${kpiCard('OT Utilization', otUtil, '%', '', sumPOT > 0 ? `${fmtN(sumAOT,1)} / ${fmtN(sumPOT,0)} hrs` : '')}
      </div>
    </div>
 
    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Cost per Kg Trend</div>
        <div class="chart-container">
          <canvas id="execTrendChart" aria-label="Cost per Kg trend chart">Cost per Kg trend data</canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Cost Breakdown — ${mLabel}</div>
        <div class="chart-container">
          <canvas id="execPieChart" aria-label="Cost breakdown pie chart">Cost breakdown for selected month</canvas>
        </div>
      </div>
    </div>
  `;
 
  // Trend chart
  destroyChart('execTrend');
  const ctx1 = document.getElementById('execTrendChart');
  if (ctx1 && trendLabels.length) {
    charts['execTrend'] = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [
          { label: 'Util/Kg', data: trendUtil, borderColor: '#3b82f6', borderWidth: 2, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, fill: false },
          { label: 'R&M/Kg', data: trendRM, borderColor: '#f59e0b', borderWidth: 2, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, fill: false },
          { label: 'Engg/Kg', data: trendEngg, borderColor: '#8b5cf6', borderWidth: 2, borderDash: [4,4], tension: 0.4, pointRadius: 0, pointHoverRadius: 5, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false }, // Syncs tooltips vertically
        plugins: { 
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: {size: 12} } } 
        },
        scales: { 
          y: { border: { display: false }, grid: { color: '#f1f5f9', drawTicks: false } }, 
          x: { border: { display: false }, grid: { display: false } } 
        }
      }
    });
  }
 
  // Pie chart
  destroyChart('execPie');
  const ctx2 = document.getElementById('execPieChart');
  if (ctx2 && kpis.util_cost && kpis.rm_cost) {
    charts['execPie'] = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Utilities', 'R&M'],
        datasets: [{ 
          data: [kpis.util_cost, kpis.rm_cost], 
          backgroundColor: ['#3b82f6', '#f59e0b'], 
          borderWidth: 0, // Removes the harsh white separator
          hoverOffset: 4  // Pops out slightly when hovered
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '75%', // Makes the ring thinner and cleaner
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
          tooltip: { callbacks: { label: ctx => `₱ ${fmtN(ctx.parsed, 2)}` } }
        }
      }
    });
  }
}
 
// ── COST DASHBOARD ─────────────────────────────────────────────────────────────
function renderCost(c, month) {
  const rows = query(`SELECT u.month, u.utility_cost, u.rm_cost, p.volume
    FROM utilities u LEFT JOIN production p ON u.month = p.month
    ORDER BY u.month DESC LIMIT 24`).reverse();
 
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
  const sel = month ? rows.filter(r=>r.month===month) : rows;
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Cost Dashboard</h1>
      <p>Utilities, R&M, and Engineering cost per Kg — ${mLabel}</p>
    </div>
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Cost per Kg — Monthly Trend</div>
      <div class="chart-container">
        <canvas id="costChart" aria-label="Monthly cost per kg trend">Cost per kg trend</canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Monthly Cost Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Month</th><th>Utility Cost (₱)</th><th>R&M Cost (₱)</th><th>Volume (MT)</th>
            <th>Util / Kg</th><th>R&M / Kg</th><th>Engg / Kg</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => {
              const upk = calcUtilCostPerKg(r.utility_cost, r.volume);
              const rpk = calcRMCostPerKg(r.rm_cost, r.volume);
              const epk = calcEnggCostPerKg(r.utility_cost, r.rm_cost, r.volume);
              return `<tr>
                <td><strong>${fmtMonthLabel(r.month)}</strong></td>
                <td class="td-number">${r.utility_cost != null ? fmtN(r.utility_cost,2) : '—'}</td>
                <td class="td-number">${r.rm_cost != null ? fmtN(r.rm_cost,2) : '—'}</td>
                <td class="td-number">${r.volume != null ? fmtN(r.volume,3) : '—'}</td>
                <td class="td-number">${fmt(upk,3)}</td>
                <td class="td-number">${fmt(rpk,3)}</td>
                <td class="td-number">${fmt(epk,3)}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="7"><div class="empty"><p>No data yet. Enter data via the Data Entry section.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
 
  destroyChart('costChart');
  const ctx = document.getElementById('costChart');
  if (ctx && rows.length) {
    const labels = rows.map(r=>fmtMonthLabel(r.month));
    const utilPK = rows.map(r=>calcUtilCostPerKg(r.utility_cost,r.volume));
    const rmPK = rows.map(r=>calcRMCostPerKg(r.rm_cost,r.volume));
    const enggPK = rows.map(r=>calcEnggCostPerKg(r.utility_cost,r.rm_cost,r.volume));
    charts['costChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Util/Kg', data: utilPK, backgroundColor: 'rgba(26,86,219,0.7)' },
          { label: 'R&M/Kg', data: rmPK, backgroundColor: 'rgba(217,119,6,0.7)' },
          { type: 'line', label: 'Engg/Kg', data: enggPK, borderColor: '#7c3aed', borderDash:[4,3], pointRadius:3, fill:false, tension:0.3 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: { labels: { font:{size:11}, boxWidth:10 } } },
        scales: {
          y: { grid:{color:'#f1f5f9'}, ticks:{font:{size:11}}, title:{display:true,text:'₱ / Kg',font:{size:11}} },
          x: { grid:{display:false}, ticks:{font:{size:11},maxRotation:45,autoSkip:false} }
        }
      }
    });
  }
}
 
// ── PRODUCTION DASHBOARD ───────────────────────────────────────────────────────
function renderProduction(c, month) {
  const filter = month ? `WHERE month = '${month}'` : '';
  const rows = query(`SELECT month, line, capacity, actual_output FROM capacity ${filter} ORDER BY month DESC, line`);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';

  // Aggregate by month for the trend chart
  const byMonth = {};
  rows.forEach(r => {
    if (!byMonth[r.month]) byMonth[r.month] = { cap: 0, act: 0 };
    byMonth[r.month].cap += r.capacity || 0;
    byMonth[r.month].act += r.actual_output || 0;
  });
  const trendMonths = Object.keys(byMonth).sort();
  const trendEff = trendMonths.map(m => byMonth[m].cap > 0 ? byMonth[m].act / byMonth[m].cap * 100 : null);

  // Get all lines for the selected month (or all months) that have weekly data
  const weeklyFilter = month ? `WHERE month = '${month}'` : '';
  const weeklyLines = query(`SELECT DISTINCT line FROM capacity_weekly ${weeklyFilter} ORDER BY line`);
  const hasWeekly = weeklyLines.length > 0;

  // Build per-line summary cards for selected period
  const lineRows = month
    ? query(`SELECT line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity WHERE month=? GROUP BY line ORDER BY line`, [month])
    : query(`SELECT line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY line ORDER BY line`);

  c.innerHTML = `
    <div class="page-header">
      <h1>Production Dashboard</h1>
      <p>Capacity, output, and efficiency by line — ${mLabel}</p>
    </div>

    ${lineRows.length ? `
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">LINE SUMMARY — ${mLabel}</div>
      <div class="metrics-grid">
        ${lineRows.map(r => {
          const eff = r.cap > 0 ? r.act / r.cap : null;
          const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
          const color = eff === null ? 'var(--gray-400)' : eff >= 0.95 ? 'var(--green)' : eff >= 0.85 ? 'var(--amber)' : 'var(--red)';
          return `<div class="metric-card" style="border-left:3px solid ${color}">
            <div class="metric-label">${r.line}</div>
            <div class="metric-value" style="color:${color};font-size:22px">${pct}</div>
            <div class="metric-sub">${fmtN(r.act, 0)} / ${fmtN(r.cap, 0)} units</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Overall Efficiency Trend (%)</div>
      <div class="chart-container">
        <canvas id="prodTrendChart" aria-label="Efficiency trend">Efficiency trend</canvas>
      </div>
    </div>

    ${hasWeekly ? `
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">WEEKLY BREAKDOWN BY LINE</div>
      <div class="info-block" style="margin-bottom:16px">
        <strong>Weekly view:</strong> Each line's week-by-week capacity vs actual output. 
        Efficiency &lt; 85% is flagged red; &gt; 100% means actual exceeded planned capacity.
      </div>
      <div id="weekly-line-tabs" class="tabs" style="margin-bottom:0">
        ${weeklyLines.map((r, i) => `<button class="tab ${i === 0 ? 'active' : ''}" onclick="switchWeeklyTab('${r.line}', this)">${r.line}</button>`).join('')}
      </div>
      <div id="weekly-panels">
        ${weeklyLines.map((r, i) => renderWeeklyPanel(r.line, month, i === 0)).join('')}
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Monthly Efficiency by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Capacity (units)</th><th>Actual Output (units)</th><th>Efficiency %</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => {
              const eff = calcEfficiency(r.capacity, r.actual_output);
              const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
              const statusClass = eff === null ? 'gray' : eff >= 0.95 ? 'green' : eff >= 0.85 ? 'amber' : 'red';
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td><strong>${r.line}</strong></td>
                <td class="td-number">${fmtN(r.capacity, 0)}</td>
                <td class="td-number">${fmtN(r.actual_output, 0)}</td>
                <td class="td-number"><strong>${pct}</strong></td>
                <td><span class="pill pill-${statusClass}">${eff === null ? 'N/A' : eff >= 0.95 ? 'On Target' : eff >= 0.85 ? 'Watch' : 'Below Target'}</span></td>
              </tr>`;
            }).join('') : '<tr><td colspan="6"><div class="empty"><p>No capacity data. Use Capacity & Efficiency entry.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Trend chart
  destroyChart('prodTrend');
  const ctx = document.getElementById('prodTrendChart');
  if (ctx && trendMonths.length) {
    charts['prodTrend'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendMonths.map(fmtMonthLabel),
        datasets: [
          { label: 'Efficiency %', data: trendEff, borderColor: '#15803d', backgroundColor: 'rgba(21,128,61,0.08)', fill: true, tension: 0.3, pointRadius: 4 },
          { label: 'Target (95%)', data: trendMonths.map(() => 95), borderColor: '#dc2626', borderDash: [6, 3], pointRadius: 0, borderWidth: 1.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: {
          y: { min: 50, max: 115, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: false } }
        }
      }
    });
  }

  // Draw charts for the first line's weekly panel
  if (hasWeekly) {
    const firstLine = weeklyLines[0].line;
    drawWeeklyCharts(firstLine, month);
  }
}

function renderWeeklyPanel(line, month, visible) {
  const monthFilter = month ? `AND month = '${month}'` : '';
  const weeks = query(
    `SELECT week_label, week_num, SUM(capacity) as cap, SUM(actual_output) as act, month
     FROM capacity_weekly
     WHERE line = ? ${monthFilter}
     GROUP BY month, week_label, week_num
     ORDER BY month ASC, week_num ASC, week_label ASC`,
    [line]
  );

  const panelId = 'weekly-panel-' + line.replace(/\s+/g, '-');
  const chartId = 'weekly-chart-' + line.replace(/\s+/g, '-');

  if (!weeks.length) {
    return `<div id="${panelId}" class="weekly-panel card" style="${visible ? '' : 'display:none'}">
      <div class="empty"><p>No weekly data for ${line}.</p></div>
    </div>`;
  }

  const rows = weeks.map(w => {
    const eff = w.cap > 0 ? w.act / w.cap : null;
    const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
    const cls = eff === null ? '' : eff > 1.0 ? 'td-green' : eff >= 0.85 ? '' : 'td-red';
    return `<tr>
      <td>${fmtMonthLabel(w.month)}</td>
      <td><strong>${w.week_label}</strong></td>
      <td class="td-number">${fmtN(w.cap, 0)}</td>
      <td class="td-number">${fmtN(w.act, 0)}</td>
      <td class="td-number"><strong class="${cls}">${pct}</strong></td>
      <td><span class="pill pill-${eff === null ? 'gray' : eff > 1.0 ? 'blue' : eff >= 0.95 ? 'green' : eff >= 0.85 ? 'amber' : 'red'}">${eff === null ? 'N/A' : eff > 1.0 ? 'Exceeded' : eff >= 0.95 ? 'On Target' : eff >= 0.85 ? 'Watch' : 'Below'}</span></td>
    </tr>`;
  }).join('');

  return `
    <div id="${panelId}" class="weekly-panel card" style="${visible ? '' : 'display:none'}">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:280px">
          <div class="card-title" style="margin-bottom:10px">${line} — Weekly Capacity vs Actual</div>
          <div class="chart-container" style="height:220px">
            <canvas id="${chartId}" aria-label="${line} weekly chart">${line} weekly data</canvas>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Week</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function drawWeeklyCharts(line, month) {
  const monthFilter = month ? `AND month = '${month}'` : '';
  const weeks = query(
    `SELECT week_label, week_num, SUM(capacity) as cap, SUM(actual_output) as act, month
     FROM capacity_weekly
     WHERE line = ? ${monthFilter}
     GROUP BY month, week_label, week_num
     ORDER BY month ASC, week_num ASC, week_label ASC`,
    [line]
  );
  if (!weeks.length) return;

  const chartId = 'weekly-chart-' + line.replace(/\s+/g, '-');
  const chartKey = 'weekly-' + line;
  destroyChart(chartKey);
  const ctx = document.getElementById(chartId);
  if (!ctx) return;

  const labels = weeks.map(w => w.week_label);
  const capData = weeks.map(w => w.cap);
  const actData = weeks.map(w => w.act);
  const effData = weeks.map(w => w.cap > 0 ? +(w.act / w.cap * 100).toFixed(2) : null);

  charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Capacity', data: capData, backgroundColor: 'rgba(59,130,246,0.25)', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 3, order: 2 },
        { label: 'Actual', data: actData, backgroundColor: 'rgba(21,128,61,0.6)', borderColor: '#15803d', borderWidth: 1.5, borderRadius: 3, order: 2 },
        { type: 'line', label: 'Eff %', data: effData, borderColor: '#7c3aed', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#7c3aed', fill: false, tension: 0.3, yAxisID: 'y2', order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { font: { size: 11 }, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Eff %') return ` Efficiency: ${ctx.parsed.y?.toFixed(2)}%`;
              return ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
            }
          }
        }
      },
      scales: {
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Units', font: { size: 10 } } },
        y2: { position: 'right', min: 0, max: 130, grid: { display: false }, ticks: { font: { size: 10 }, callback: v => v + '%' }, title: { display: true, text: 'Eff %', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 40 } }
      }
    }
  });
}

// Called by tab buttons
window.switchWeeklyTab = function(line, btn) {
  // Toggle tab active state
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Show/hide panels
  document.querySelectorAll('.weekly-panel').forEach(p => p.style.display = 'none');
  const panelId = 'weekly-panel-' + line.replace(/\s+/g, '-');
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = '';

  // Draw chart for this line (lazy init — only draw once panel is visible)
  const month = document.getElementById('globalMonth')?.value || '';
  drawWeeklyCharts(line, month);
};
 
// ── MANHOURS DASHBOARD ─────────────────────────────────────────────────────────
function renderManhours(c, month) {
  const filter = month ? `WHERE month = '${month}'` : '';
  const rows = query(`SELECT * FROM manhours ${filter} ORDER BY month DESC, line`);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
 
  // aggregate
  let totPR=0,totAR=0,totPOT=0,totAOT=0,totAbs=0;
  rows.forEach(r=>{totPR+=r.planned_reg||0;totAR+=r.actual_reg||0;totPOT+=r.planned_ot||0;totAOT+=r.actual_ot||0;totAbs+=r.absenteeism||0;});
  const regUtil=calcRegHrsUtil(totAR,totPR), otUtil=calcOTUtil(totAOT,totPOT);
  // Absenteeism % = absent person-days / (planned reg hrs / 8hrs per day)
  const plannedPersonDays = totPR > 0 ? totPR / 8 : 0;
  const absPct = plannedPersonDays > 0 ? totAbs / plannedPersonDays : null;
 
  // trend
  const trendRows = query(`SELECT month, SUM(planned_reg) as pr, SUM(actual_reg) as ar, SUM(planned_ot) as pot, SUM(actual_ot) as aot FROM manhours GROUP BY month ORDER BY month`);
  const trendLabels = trendRows.map(r=>fmtMonthLabel(r.month));
  const trendReg = trendRows.map(r=>calcRegHrsUtil(r.ar,r.pr));
  const trendOT = trendRows.map(r=>calcOTUtil(r.aot,r.pot));
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Manhours Dashboard</h1>
      <p>Regular hours and OT utilization — ${mLabel}</p>
    </div>
    <div class="metrics-grid section-gap">
      <div class="metric-card">
        <div class="metric-label">Regular Hrs Utilization</div>
        <div class="metric-value">${regUtil !== null ? (regUtil*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${fmtN(totAR,1)} / ${fmtN(totPR,0)} hrs</div>
        <div class="progress-bar"><div class="progress-fill ${regUtil>=0.9?'progress-green':regUtil>=0.8?'progress-amber':'progress-red'}" style="width:${regUtil?Math.min(regUtil*100,100):0}%"></div></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">OT Utilization</div>
        <div class="metric-value">${otUtil !== null ? (otUtil*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${fmtN(totAOT,1)} / ${fmtN(totPOT,0)} hrs</div>
        <div class="progress-bar"><div class="progress-fill ${otUtil>=0.9?'progress-green':otUtil>=0.7?'progress-amber':'progress-red'}" style="width:${otUtil?Math.min(otUtil*100,100):0}%"></div></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Absenteeism</div>
        <div class="metric-value">${fmtN(totAbs,0)}</div>
        <div class="metric-sub">person-days absent${absPct !== null ? ` · <strong>${(absPct*100).toFixed(2)}%</strong> of planned days` : ''}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Manhours Worked</div>
        <div class="metric-value">${fmtN(totAR+totAOT,0)}</div>
        <div class="metric-sub">Reg + OT actual</div>
      </div>
    </div>
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Utilization Trend</div>
      <div class="chart-container">
        <canvas id="mhTrendChart" aria-label="Manhours utilization trend">Manhours trend</canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Records by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Planned Reg</th><th>Actual Reg</th><th>Reg Util%</th><th>Planned OT</th><th>Actual OT</th><th>OT Util%</th><th>Absent</th><th>Absent %</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const ru=calcRegHrsUtil(r.actual_reg,r.planned_reg), ou=calcOTUtil(r.actual_ot,r.planned_ot);
              const rowAbsPct = (r.planned_reg > 0 && r.absenteeism != null) ? r.absenteeism / (r.planned_reg / 8) : null;
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'—'}</td>
                <td class="td-number">${fmtN(r.planned_reg,0)}</td>
                <td class="td-number">${fmtN(r.actual_reg,1)}</td>
                <td class="td-number"><strong class="${ru&&ru>=0.9?'td-green':ru&&ru<0.8?'td-red':''}">${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(r.planned_ot,0)}</td>
                <td class="td-number">${fmtN(r.actual_ot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${r.absenteeism!=null?fmtN(r.absenteeism,1):'—'}</td>
                <td class="td-number">${rowAbsPct!==null?((rowAbsPct*100).toFixed(2)+'%'):'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="9"><div class="empty"><p>No manhours data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
 
  destroyChart('mhTrend');
  const ctx=document.getElementById('mhTrendChart');
  if(ctx && trendLabels.length){
    charts['mhTrend']=new Chart(ctx,{
      type:'line',
      data:{labels:trendLabels,datasets:[
        {label:'Reg Util%',data:trendReg.map(v=>v?v*100:null),borderColor:'#1a56db',tension:0.3,pointRadius:3},
        {label:'OT Util%',data:trendOT.map(v=>v?v*100:null),borderColor:'#d97706',borderDash:[4,3],tension:0.3,pointRadius:3}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},
        scales:{y:{ticks:{font:{size:11},callback:v=>v.toFixed(0)+'%'},grid:{color:'#f1f5f9'}},
          x:{grid:{display:false},ticks:{font:{size:11},maxRotation:45}}}}
    });
  }
}
 
// ── LOSS DASHBOARD ─────────────────────────────────────────────────────────────
function renderLoss(c, month) {
  const filter = month ? `WHERE month = '${month}'` : '';
  const rows = query(`SELECT * FROM loss ${filter} ORDER BY month DESC, line`);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
 
  let totRun=0,totAbs=0,totMH=0;
  rows.forEach(r=>{totRun+=r.runrate_loss||0;totAbs+=r.absenteeism_loss||0;totMH+=r.manhours_loss||0;});
  const total=totRun+totAbs+totMH;
  const runPct=calcLossContribution(totRun,total), absPct=calcLossContribution(totAbs,total), mhPct=calcLossContribution(totMH,total);
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Loss Analysis</h1>
      <p>Runrate, absenteeism, and manhours loss contribution — ${mLabel}</p>
    </div>
    <div class="metrics-grid section-gap">
      <div class="metric-card">
        <div class="metric-label">Runrate Loss</div>
        <div class="metric-value">${runPct!==null?(runPct*100).toFixed(1)+'%':'—'}</div>
        <div class="metric-sub">contribution to total loss</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Absenteeism Loss</div>
        <div class="metric-value">${absPct!==null?(absPct*100).toFixed(1)+'%':'—'}</div>
        <div class="metric-sub">contribution to total loss</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Manhours Loss</div>
        <div class="metric-value">${mhPct!==null?(mhPct*100).toFixed(1)+'%':'—'}</div>
        <div class="metric-sub">contribution to total loss</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Loss</div>
        <div class="metric-value">${fmtN(total,2)}</div>
        <div class="metric-sub">combined loss value</div>
      </div>
    </div>
    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Loss Contribution</div>
        <div class="chart-container">
          <canvas id="lossPieChart" aria-label="Loss contribution pie">Loss contribution breakdown</canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Loss Breakdown</div>
        ${total > 0 ? `
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px"><span>Runrate Loss</span><strong>${runPct!==null?(runPct*100).toFixed(1)+'%':'—'}</strong></div>
            <div class="progress-bar"><div class="progress-fill progress-amber" style="width:${runPct?runPct*100:0}%"></div></div>
          </div>
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px"><span>Absenteeism Loss</span><strong>${absPct!==null?(absPct*100).toFixed(1)+'%':'—'}</strong></div>
            <div class="progress-bar"><div class="progress-fill progress-red" style="width:${absPct?absPct*100:0}%"></div></div>
          </div>
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px"><span>Manhours Loss</span><strong>${mhPct!==null?(mhPct*100).toFixed(1)+'%':'—'}</strong></div>
            <div class="progress-bar"><div class="progress-fill progress-green" style="width:${mhPct?mhPct*100:0}%"></div></div>
          </div>
        ` : '<div class="empty"><p>No loss data for this period.</p></div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Loss Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Runrate Loss</th><th>Absenteeism Loss</th><th>Manhours Loss</th><th>Total</th><th>Runrate %</th><th>Absent %</th><th>MH %</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const tot=( r.runrate_loss||0)+(r.absenteeism_loss||0)+(r.manhours_loss||0);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'—'}</td>
                <td class="td-number">${fmtN(r.runrate_loss,2)}</td>
                <td class="td-number">${fmtN(r.absenteeism_loss,2)}</td>
                <td class="td-number">${fmtN(r.manhours_loss,2)}</td>
                <td class="td-number"><strong>${fmtN(tot,2)}</strong></td>
                <td class="td-number">${tot>0?((r.runrate_loss/tot)*100).toFixed(1)+'%':'—'}</td>
                <td class="td-number">${tot>0?((r.absenteeism_loss/tot)*100).toFixed(1)+'%':'—'}</td>
                <td class="td-number">${tot>0?((r.manhours_loss/tot)*100).toFixed(1)+'%':'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="9"><div class="empty"><p>No loss data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
 
  destroyChart('lossPie');
  const ctx=document.getElementById('lossPieChart');
  if(ctx && total>0){
    charts['lossPie']=new Chart(ctx,{
      type:'doughnut',
      data:{labels:['Runrate Loss','Absenteeism Loss','Manhours Loss'],
        datasets:[{data:[totRun,totAbs,totMH],backgroundColor:['#d97706','#dc2626','#1a56db'],borderWidth:2,borderColor:'#fff'}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}},
          tooltip:{callbacks:{label:ctx=>`${(ctx.parsed/(totRun+totAbs+totMH)*100).toFixed(1)}% (${fmtN(ctx.parsed,2)})`}}}}
    });
  }
}
 
// ── BUDGET DASHBOARD ───────────────────────────────────────────────────────────
function renderBudget(c, month) {
  const filter = month ? `WHERE b.month = '${month}'` : '';
  const rows = query(`SELECT b.month, b.utility_budget, b.rm_budget, b.volume_budget, u.utility_cost, u.rm_cost, p.volume
    FROM budget b
    LEFT JOIN utilities u ON b.month = u.month
    LEFT JOIN production p ON b.month = p.month
    ${filter} ORDER BY b.month DESC LIMIT 24`);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Budget vs Actual</h1>
      <p>Variance = Actual − Budget — ${mLabel}</p>
    </div>
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Budget vs Actual</div>
      <div class="chart-container">
        <canvas id="budgetChart" aria-label="Budget vs actual bar chart">Budget vs actual comparison</canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Budget Variance Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th>
            <th>Util Budget</th><th>Util Actual</th><th>Util Var (₱)</th><th>Util Var %</th>
            <th>R&M Budget</th><th>R&M Actual</th><th>R&M Var (₱)</th><th>R&M Var %</th>
            <th>Vol Budget (MT)</th><th>Vol Actual (MT)</th><th>Vol Var</th><th>Vol Var %</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const uv=r.utility_cost!=null?calcVariance(r.utility_cost,r.utility_budget):null;
              const uvp=r.utility_cost!=null?calcVariancePct(r.utility_cost,r.utility_budget):null;
              const rv=r.rm_cost!=null?calcVariance(r.rm_cost,r.rm_budget):null;
              const rvp=r.rm_cost!=null?calcVariancePct(r.rm_cost,r.rm_budget):null;
              const vv=r.volume!=null?calcVariance(r.volume,r.volume_budget):null;
              const vvp=r.volume!=null?calcVariancePct(r.volume,r.volume_budget):null;
              return `<tr>
                <td><strong>${fmtMonthLabel(r.month)}</strong></td>
                <td class="td-number">${fmtN(r.utility_budget,2)}</td>
                <td class="td-number">${r.utility_cost!=null?fmtN(r.utility_cost,2):'—'}</td>
                <td class="td-number ${uv!==null?(uv>0?'td-red':'td-green'):''}"><strong>${uv!==null?fmtN(uv,2):'—'}</strong></td>
                <td class="td-number ${uvp!==null?(uvp>0?'td-red':'td-green'):''}">${uvp!==null?((uvp*100).toFixed(1)+'%'):'—'}</td>
                <td class="td-number">${fmtN(r.rm_budget,2)}</td>
                <td class="td-number">${r.rm_cost!=null?fmtN(r.rm_cost,2):'—'}</td>
                <td class="td-number ${rv!==null?(rv>0?'td-red':'td-green'):''}"><strong>${rv!==null?fmtN(rv,2):'—'}</strong></td>
                <td class="td-number ${rvp!==null?(rvp>0?'td-red':'td-green'):''}">${rvp!==null?((rvp*100).toFixed(1)+'%'):'—'}</td>
                <td class="td-number">${fmtN(r.volume_budget,3)}</td>
                <td class="td-number">${r.volume!=null?fmtN(r.volume,3):'—'}</td>
                <td class="td-number ${vv!==null?(vv<0?'td-red':'td-green'):''}"><strong>${vv!==null?fmtN(vv,3):'—'}</strong></td>
                <td class="td-number ${vvp!==null?(vvp<0?'td-red':'td-green'):''}">${vvp!==null?((vvp*100).toFixed(1)+'%'):'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="13"><div class="empty"><p>No budget data. Enter budgets first.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
 
  destroyChart('budgetChart');
  const ctx=document.getElementById('budgetChart');
  if(ctx && rows.length){
    const labels=rows.map(r=>fmtMonthLabel(r.month)).reverse();
    const ubud=rows.map(r=>r.utility_budget).reverse(), uact=rows.map(r=>r.utility_cost).reverse();
    const rbud=rows.map(r=>r.rm_budget).reverse(), ract=rows.map(r=>r.rm_cost).reverse();
    charts['budgetChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels, 
        datasets: [
          { label: 'Util Budget', data: ubud, backgroundColor: '#bfdbfe', borderRadius: 4, barPercentage: 0.6 },
          { label: 'Util Actual', data: uact, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.6 },
          { label: 'R&M Budget', data: rbud, backgroundColor: '#fcd34d', borderRadius: 4, barPercentage: 0.6 },
          { label: 'R&M Actual', data: ract, backgroundColor: '#f59e0b', borderRadius: 4, barPercentage: 0.6 }
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},
        scales:{y:{grid:{color:'#f1f5f9'},ticks:{font:{size:11}}},x:{grid:{display:false},ticks:{font:{size:11},maxRotation:45,autoSkip:false}}}}
    });
  }
}

export { renderExecutive, renderCost, renderProduction, renderManhours, renderLoss, renderBudget };