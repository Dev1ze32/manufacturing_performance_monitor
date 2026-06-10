import { query } from './database.js';
import { 
  fmt, fmtN, fmtPct, fmtMonthLabel, getKPIs, calcUtilCostPerKg, 
  calcRMCostPerKg, calcEnggCostPerKg, calcEfficiency, 
  calcRegHrsUtil, calcOTUtil, calcLossContribution, calcVariance, calcVariancePct,
  calcPersonDays, calcAbsenteeismRate, calcTotalManhoursUtil,
  calcPlannedRegHours, calcPlannedOTHours, getManhoursSummaryRows, getRunrateSummaryRows,
  destroyChart, charts 
} from './utils.js';


// ── EXECUTIVE DASHBOARD ───────────────────────────────────────────────────────
function renderExecutive(c, month) {
  const kpis = getKPIs(month);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
 
  // Runrate efficiency is generated from weekly capacity/actual rows.
  const capRows = getRunrateSummaryRows(month || '');
  let totalCap = 0, totalActual = 0;
  capRows.forEach(r => { totalCap += r.capacity||0; totalActual += r.actual_output||0; });
  const efficiency = totalCap > 0 ? totalActual/totalCap : null;
 
  // Manhours
  const mhRows = getManhoursSummaryRows(month || '');
  let sumPReg=0, sumAReg=0, sumPOT=0, sumAOT=0;
  mhRows.forEach(r => {
    sumPReg += r.planned_reg || calcPlannedRegHours(r.working_days, r.manpower) || 0;
    sumAReg += r.actual_reg || 0;
    sumPOT += r.planned_ot || calcPlannedOTHours(r.working_days, r.manpower) || 0;
    sumAOT += r.actual_ot || 0;
  });
 
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

  // ── Quarter summaries — dynamically group all months into fiscal quarters ─────
  // Fiscal year: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
  function fiscalQuarter(isoMonth) {
    const mo = parseInt(isoMonth.split('-')[1], 10);
    const yr = parseInt(isoMonth.split('-')[0], 10);
    if (mo >= 10) return { q: 1, fy: yr + 1 };
    if (mo <= 3)  return { q: 2, fy: yr };
    if (mo <= 6)  return { q: 3, fy: yr };
    return         { q: 4, fy: yr };
  }
  const allMonthlyRows = query(`SELECT month, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY month ORDER BY month`);
  const byQuarter = {};
  allMonthlyRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}`;
    if (!byQuarter[key]) byQuarter[key] = { cap: 0, act: 0, months: [], fy, q };
    byQuarter[key].cap += r.cap || 0;
    byQuarter[key].act += r.act || 0;
    byQuarter[key].months.push(r.month);
  });
  const quarterKeys = Object.keys(byQuarter).sort((a, b) => {
    const [, fyA, qA] = a.match(/FY(\d+) Q(\d)/);
    const [, fyB, qB] = b.match(/FY(\d+) Q(\d)/);
    return fyA !== fyB ? fyA - fyB : qA - qB;
  });

  // Get all lines for the selected month (or all months) that have weekly data
  const weeklyFilter = month ? `WHERE month = '${month}'` : '';
  const weeklyLines = query(`SELECT DISTINCT line FROM capacity_weekly ${weeklyFilter} ORDER BY line`);
  const hasWeekly = weeklyLines.length > 0;

  // Build per-line summary cards for selected period
  const lineRows = month
    ? query(`SELECT line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity WHERE month=? GROUP BY line ORDER BY line`, [month])
    : query(`SELECT line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY line ORDER BY line`);

  // Per-line quarter breakdown (for the quarter summary table)
  const lineQuarterRows = query(`SELECT month, line, SUM(capacity) as cap, SUM(actual_output) as act FROM capacity GROUP BY month, line ORDER BY month, line`);
  const byLineQuarter = {};
  lineQuarterRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}::${r.line}`;
    if (!byLineQuarter[key]) byLineQuarter[key] = { cap: 0, act: 0, label: `FY${fy} Q${q}`, line: r.line };
    byLineQuarter[key].cap += r.cap || 0;
    byLineQuarter[key].act += r.act || 0;
  });

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

    ${quarterKeys.length ? `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Quarterly Summary — All Data</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Quarter</th><th>Months Included</th><th>Total Capacity</th><th>Total Actual</th><th>Efficiency</th><th>Status</th></tr></thead>
          <tbody>
            ${quarterKeys.map(k => {
              const q = byQuarter[k];
              const eff = q.cap > 0 ? q.act / q.cap : null;
              const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
              const cls = eff === null ? 'gray' : eff >= 0.95 ? 'green' : eff >= 0.85 ? 'amber' : 'red';
              return `<tr>
                <td><strong>${k}</strong></td>
                <td style="color:var(--gray-500);font-size:12px">${q.months.map(fmtMonthLabel).join(', ')}</td>
                <td class="td-number">${fmtN(q.cap, 0)}</td>
                <td class="td-number">${fmtN(q.act, 0)}</td>
                <td class="td-number"><strong>${pct}</strong></td>
                <td><span class="pill pill-${cls}">${eff === null ? 'N/A' : eff >= 0.95 ? 'On Target' : eff >= 0.85 ? 'Watch' : 'Below'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${quarterKeys.length > 0 ? `
      <div style="margin-top:16px">
        <div class="card-title" style="margin-bottom:10px">By Line &amp; Quarter</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Quarter</th><th>Line</th><th>Capacity</th><th>Actual</th><th>Efficiency</th></tr></thead>
            <tbody>
              ${Object.values(byLineQuarter).sort((a,b) => a.label.localeCompare(b.label) || a.line.localeCompare(b.line)).map(r => {
                const eff = r.cap > 0 ? r.act / r.cap : null;
                const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
                const cls = eff === null ? '' : eff >= 0.95 ? 'td-green' : eff < 0.85 ? 'td-red' : '';
                return `<tr>
                  <td>${r.label}</td>
                  <td><strong>${r.line}</strong></td>
                  <td class="td-number">${fmtN(r.cap, 0)}</td>
                  <td class="td-number">${fmtN(r.act, 0)}</td>
                  <td class="td-number"><strong class="${cls}">${pct}</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
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
  const requestedMonth = month || '';
  const allSummaryRows = getManhoursSummaryRows('');
  const allRunrateRows = getRunrateSummaryRows('');
  const latestDataMonth = (sourceRows) => {
    const months = [...new Set(sourceRows.map(r => r.month).filter(Boolean))].sort();
    return months.length ? months[months.length - 1] : '';
  };
  const requestedRunrateRows = requestedMonth ? allRunrateRows.filter(r => r.month === requestedMonth) : allRunrateRows;
  const requestedManhoursRows = requestedMonth ? allSummaryRows.filter(r => r.month === requestedMonth) : allSummaryRows;
  const runrateMonth = requestedMonth && !requestedRunrateRows.length ? latestDataMonth(allRunrateRows) : requestedMonth;
  const manhoursMonth = requestedMonth && !requestedManhoursRows.length ? latestDataMonth(allSummaryRows) : requestedMonth;
  const runrateRows = runrateMonth ? allRunrateRows.filter(r => r.month === runrateMonth) : allRunrateRows;
  const rows = manhoursMonth ? allSummaryRows.filter(r => r.month === manhoursMonth) : allSummaryRows;
  const runrateLabel = runrateMonth ? fmtMonthLabel(runrateMonth) : 'All Months';
  const manhoursLabel = manhoursMonth ? fmtMonthLabel(manhoursMonth) : 'All Months';
  const mLabel = runrateLabel === manhoursLabel ? runrateLabel : `Runrate ${runrateLabel} / Manhours ${manhoursLabel}`;
  const fallbackNotes = [];
  if (requestedMonth && runrateMonth && runrateMonth !== requestedMonth) {
    fallbackNotes.push(`Runrate has no ${fmtMonthLabel(requestedMonth)} records, so it is showing ${runrateLabel}.`);
  }
  if (requestedMonth && manhoursMonth && manhoursMonth !== requestedMonth) {
    fallbackNotes.push(`Manhours has no ${fmtMonthLabel(requestedMonth)} records, so it is showing ${manhoursLabel}.`);
  }
  const weeklyRunrateRows = runrateMonth
    ? query(`SELECT month, line, week_label, week_num, capacity, actual_output FROM capacity_weekly WHERE month = ? ORDER BY line, week_num ASC, week_label ASC`, [runrateMonth])
    : query(`SELECT month, line, week_label, week_num, capacity, actual_output FROM capacity_weekly ORDER BY month DESC, line, week_num ASC, week_label ASC LIMIT 200`);

  let totalCapacity = 0, totalOutput = 0;
  runrateRows.forEach(r => {
    totalCapacity += r.capacity || 0;
    totalOutput += r.actual_output || 0;
  });
  const runrateEff = calcEfficiency(totalCapacity, totalOutput);
 
  // aggregate
  let totPR=0,totAR=0,totPOT=0,totAOT=0,totAbs=0, totPersonDays=0;
  const workdayValues = [];
  const manpowerValues = [];
  rows.forEach(r=>{
    totPR+=r.planned_reg||0;
    totAR+=r.actual_reg||0;
    totPOT+=r.planned_ot||0;
    totAOT+=r.actual_ot||0;
    totAbs+=r.absenteeism||0;
    const personDays = r.person_days ?? calcPersonDays(r.working_days, r.manpower);
    if (personDays !== null) totPersonDays += personDays;
    if (r.working_days != null) workdayValues.push(Number(r.working_days));
    if (r.manpower != null) manpowerValues.push(Number(r.manpower));
  });
  const regUtil=calcRegHrsUtil(totAR,totPR), otUtil=calcOTUtil(totAOT,totPOT);
  const totalMhUtil = calcTotalManhoursUtil(totAR, totAOT, totPR, totPOT);
  const plannedPersonDays = totPR > 0 ? totPR / 8 : 0;
  const absPct = totPersonDays > 0 ? totAbs / totPersonDays : (plannedPersonDays > 0 ? totAbs / plannedPersonDays : null);
  const displayedPersonDays = totPersonDays > 0 ? totPersonDays : plannedPersonDays;
  const avgWorkdays = workdayValues.length ? workdayValues.reduce((a,b)=>a+b,0) / workdayValues.length : null;
  const avgManpower = manpowerValues.length ? manpowerValues.reduce((a,b)=>a+b,0) / manpowerValues.length : null;
 
  // trend
  const trendByMonth = {};
  allSummaryRows.forEach(r => {
    if (!trendByMonth[r.month]) trendByMonth[r.month] = { month: r.month, pr: 0, ar: 0, pot: 0, aot: 0 };
    trendByMonth[r.month].pr += r.planned_reg || 0;
    trendByMonth[r.month].ar += r.actual_reg || 0;
    trendByMonth[r.month].pot += r.planned_ot || 0;
    trendByMonth[r.month].aot += r.actual_ot || 0;
  });
  const trendRows = Object.values(trendByMonth).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const trendLabels = trendRows.map(r=>fmtMonthLabel(r.month));
  const trendReg = trendRows.map(r=>calcRegHrsUtil(r.ar,r.pr));
  const trendOT = trendRows.map(r=>calcOTUtil(r.aot,r.pot));

  // ── Quarterly summary (computed dynamically from all monthly records) ─────────
  function fiscalQuarter(isoMonth) {
    const mo = parseInt(isoMonth.split('-')[1], 10);
    const yr = parseInt(isoMonth.split('-')[0], 10);
    if (mo >= 10) return { q: 1, fy: yr + 1 };
    if (mo <= 3)  return { q: 2, fy: yr };
    if (mo <= 6)  return { q: 3, fy: yr };
    return         { q: 4, fy: yr };
  }
  function sameFiscalQuarter(monthA, monthB) {
    const a = fiscalQuarter(monthA);
    const b = fiscalQuarter(monthB);
    return a.q === b.q && a.fy === b.fy;
  }
  const runrateTrendByMonth = {};
  allRunrateRows.forEach(r => {
    if (!runrateTrendByMonth[r.month]) runrateTrendByMonth[r.month] = { month: r.month, cap: 0, act: 0 };
    runrateTrendByMonth[r.month].cap += r.capacity || 0;
    runrateTrendByMonth[r.month].act += r.actual_output || 0;
  });
  const runrateTrendRows = Object.values(runrateTrendByMonth).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const runrateTrendLabels = runrateTrendRows.map(r => fmtMonthLabel(r.month));
  const runrateTrendCap = runrateTrendRows.map(r => r.cap);
  const runrateTrendAct = runrateTrendRows.map(r => r.act);
  const runrateTrendEff = runrateTrendRows.map(r => calcEfficiency(r.cap, r.act));

  const runrateLineTotals = {};
  runrateRows.forEach(r => {
    const line = r.line || 'Plant-wide';
    if (!runrateLineTotals[line]) runrateLineTotals[line] = { line, cap: 0, act: 0 };
    runrateLineTotals[line].cap += r.capacity || 0;
    runrateLineTotals[line].act += r.actual_output || 0;
  });
  const runrateLineRows = Object.values(runrateLineTotals).sort((a, b) => String(a.line).localeCompare(String(b.line)));
  const runrateLineLabels = runrateLineRows.map(r => r.line);
  const runrateLineEff = runrateLineRows.map(r => {
    const eff = calcEfficiency(r.cap, r.act);
    return eff === null ? null : eff * 100;
  });

  const runrateQuarterRows = runrateMonth ? allRunrateRows.filter(r => sameFiscalQuarter(r.month, runrateMonth)) : allRunrateRows;
  const runrateByQuarter = {};
  runrateQuarterRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}`;
    if (!runrateByQuarter[key]) runrateByQuarter[key] = { cap:0, act:0, months:[] };
    runrateByQuarter[key].cap += r.capacity || 0;
    runrateByQuarter[key].act += r.actual_output || 0;
    if (!runrateByQuarter[key].months.includes(r.month)) runrateByQuarter[key].months.push(r.month);
  });
  const runrateQKeys = Object.keys(runrateByQuarter).sort((a,b) => {
    const [,fyA,qA]=a.match(/FY(\d+) Q(\d)/); const [,fyB,qB]=b.match(/FY(\d+) Q(\d)/);
    return fyA!==fyB ? fyA-fyB : qA-qB;
  });

  const manhoursQuarterRows = manhoursMonth ? allSummaryRows.filter(r => sameFiscalQuarter(r.month, manhoursMonth)) : allSummaryRows;
  const mhByQuarter = {};
  manhoursQuarterRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}`;
    if (!mhByQuarter[key]) mhByQuarter[key] = { pr:0, ar:0, pot:0, aot:0, abs:0, personDays:0, months:[] };
    mhByQuarter[key].pr  += r.planned_reg  || 0;
    mhByQuarter[key].ar  += r.actual_reg  || 0;
    mhByQuarter[key].pot += r.planned_ot || 0;
    mhByQuarter[key].aot += r.actual_ot || 0;
    mhByQuarter[key].abs += r.absenteeism || 0;
    mhByQuarter[key].personDays += r.person_days || calcPersonDays(r.working_days, r.manpower) || 0;
    if (!mhByQuarter[key].months.includes(r.month)) mhByQuarter[key].months.push(r.month);
  });
  const mhQKeys = Object.keys(mhByQuarter).sort((a,b) => {
    const [,fyA,qA]=a.match(/FY(\d+) Q(\d)/); const [,fyB,qB]=b.match(/FY(\d+) Q(\d)/);
    return fyA!==fyB ? fyA-fyB : qA-qB;
  });

  const manhoursLineTotals = {};
  rows.forEach(r => {
    const line = r.line || 'Plant-wide';
    if (!manhoursLineTotals[line]) manhoursLineTotals[line] = { line, planned: 0, actual: 0 };
    manhoursLineTotals[line].planned += (r.planned_reg || 0) + (r.planned_ot || 0);
    manhoursLineTotals[line].actual += (r.actual_reg || 0) + (r.actual_ot || 0);
  });
  const manhoursLineRows = Object.values(manhoursLineTotals).sort((a, b) => String(a.line).localeCompare(String(b.line)));
  const manhoursLineLabels = manhoursLineRows.map(r => r.line);
  const manhoursLineUtil = manhoursLineRows.map(r => r.planned > 0 ? (r.actual / r.planned) * 100 : null);
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Runrate &amp; Manhours Dashboard</h1>
      <p>Weekly runrate efficiency and monthly manhours utilization - ${mLabel}</p>
    </div>
    ${fallbackNotes.length ? `<div class="info-block">${fallbackNotes.join(' ')}</div>` : ''}
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">RUNRATE EFFICIENCY - ${runrateLabel}</div>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Capacity</div>
          <div class="metric-value">${runrateRows.length ? fmtN(totalCapacity,0) : '&mdash;'}</div>
          <div class="metric-sub">planned output capacity</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Actual Output</div>
          <div class="metric-value">${runrateRows.length ? fmtN(totalOutput,0) : '&mdash;'}</div>
          <div class="metric-sub">actual weekly/monthly output</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Runrate Efficiency</div>
          <div class="metric-value">${runrateEff !== null ? (runrateEff*100).toFixed(2)+'%' : '&mdash;'}</div>
          <div class="metric-sub">${totalCapacity > 0 ? `${fmtN(totalOutput,0)} / ${fmtN(totalCapacity,0)}` : 'No runrate data'}</div>
          <div class="progress-bar"><div class="progress-fill ${runrateEff>=0.95?'progress-green':runrateEff>=0.85?'progress-amber':'progress-red'}" style="width:${runrateEff?Math.min(runrateEff*100,100):0}%"></div></div>
        </div>
      </div>
    </div>

    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Runrate Monthly Trend</div>
        <div class="chart-container">
          ${runrateTrendLabels.length ? '<canvas id="runrateTrendChart" aria-label="Runrate monthly trend">Runrate monthly trend</canvas>' : '<div class="empty"><p>No runrate trend data yet.</p></div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Runrate Efficiency by Line</div>
        <div class="chart-container">
          ${runrateLineLabels.length ? '<canvas id="runrateLineChart" aria-label="Runrate efficiency by line">Runrate efficiency by line</canvas>' : `<div class="empty"><p>No runrate line data for ${runrateLabel}.</p></div>`}
        </div>
      </div>
    </div>

    ${runrateQKeys.length ? `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Quarterly Runrate Summary</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Quarter</th><th>Months</th><th>Capacity</th><th>Actual</th><th>Efficiency</th></tr></thead>
          <tbody>
            ${runrateQKeys.map(k => {
              const q = runrateByQuarter[k];
              const eff = calcEfficiency(q.cap, q.act);
              return `<tr>
                <td><strong>${k}</strong></td>
                <td style="color:var(--gray-500);font-size:12px">${q.months.map(fmtMonthLabel).join(', ')}</td>
                <td class="td-number">${fmtN(q.cap,0)}</td>
                <td class="td-number">${fmtN(q.act,0)}</td>
                <td class="td-number"><strong class="${eff&&eff>=0.95?'td-green':eff&&eff<0.85?'td-red':''}">${eff!==null?(eff*100).toFixed(2)+'%':'&mdash;'}</strong></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Monthly Runrate by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Weekly Rows</th></tr></thead>
          <tbody>
            ${runrateRows.length ? runrateRows.map(r => {
              const eff = calcEfficiency(r.capacity, r.actual_output);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'&mdash;'}</td>
                <td class="td-number">${fmtN(r.capacity,0)}</td>
                <td class="td-number">${fmtN(r.actual_output,0)}</td>
                <td class="td-number"><strong class="${eff&&eff>=0.95?'td-green':eff&&eff<0.85?'td-red':''}">${eff!==null?(eff*100).toFixed(2)+'%':'&mdash;'}</strong></td>
                <td class="td-number">${r.weekly_count ? fmtN(r.weekly_count,0) : 'monthly total'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="6"><div class="empty"><p>No runrate data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Weekly Runrate Details</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Week</th><th>Capacity</th><th>Actual</th><th>Efficiency</th></tr></thead>
          <tbody>
            ${weeklyRunrateRows.length ? weeklyRunrateRows.map(r => {
              const eff = calcEfficiency(r.capacity, r.actual_output);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'&mdash;'}</td>
                <td><strong>${r.week_label||'&mdash;'}</strong></td>
                <td class="td-number">${fmtN(r.capacity,0)}</td>
                <td class="td-number">${fmtN(r.actual_output,0)}</td>
                <td class="td-number"><strong class="${eff&&eff>=0.95?'td-green':eff&&eff<0.85?'td-red':''}">${eff!==null?(eff*100).toFixed(2)+'%':'&mdash;'}</strong></td>
              </tr>`;
            }).join('') : '<tr><td colspan="6"><div class="empty"><p>No weekly runrate data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">MANHOURS - ${manhoursLabel}</div>
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
        <div class="metric-label">Planned Person-Days</div>
        <div class="metric-value">${displayedPersonDays > 0 ? fmtN(displayedPersonDays,1) : '—'}</div>
        <div class="metric-sub">${totPersonDays > 0 ? 'Working days x manpower' : 'Derived from planned regular hours'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Manpower / Days</div>
        <div class="metric-value">${avgManpower !== null ? fmtN(avgManpower,1) : '—'}</div>
        <div class="metric-sub">${avgWorkdays !== null ? `${fmtN(avgWorkdays,1)} avg working days` : 'No working-days data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Manhours Worked</div>
        <div class="metric-value">${fmtN(totAR+totAOT,0)}</div>
        <div class="metric-sub">Reg + OT actual${totalMhUtil !== null ? ` · <strong>${(totalMhUtil*100).toFixed(2)}%</strong> total utilization` : ''}</div>
      </div>
    </div>
    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Manhours Utilization Trend</div>
        <div class="chart-container">
          ${trendLabels.length ? '<canvas id="mhTrendChart" aria-label="Manhours utilization trend">Manhours trend</canvas>' : '<div class="empty"><p>No manhours trend data yet.</p></div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Planned vs Actual Manhours</div>
        <div class="chart-container">
          ${trendLabels.length ? '<canvas id="mhPlanActualChart" aria-label="Planned versus actual manhours">Planned versus actual manhours</canvas>' : '<div class="empty"><p>No planned/actual manhours data yet.</p></div>'}
        </div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Manhours Utilization by Line</div>
      <div class="chart-container">
        ${manhoursLineLabels.length ? '<canvas id="mhLineChart" aria-label="Manhours utilization by line">Manhours utilization by line</canvas>' : `<div class="empty"><p>No manhours line data for ${manhoursLabel}.</p></div>`}
      </div>
    </div>

    ${mhQKeys.length ? `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Quarterly Manhours Summary</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Quarter</th><th>Months</th><th>Person-Days</th><th>Planned Reg</th><th>Actual Reg</th><th>Reg Util%</th><th>Planned OT</th><th>Actual OT</th><th>OT Util%</th><th>Absenteeism</th><th>Absent %</th></tr></thead>
          <tbody>
            ${mhQKeys.map(k => {
              const q = mhByQuarter[k];
              const ru = calcRegHrsUtil(q.ar, q.pr);
              const ou = calcOTUtil(q.aot, q.pot);
              const personDays = q.personDays > 0 ? q.personDays : (q.pr > 0 ? q.pr / 8 : null);
              const absRate = personDays > 0 && q.abs != null ? q.abs / personDays : null;
              return `<tr>
                <td><strong>${k}</strong></td>
                <td style="color:var(--gray-500);font-size:12px">${q.months.map(fmtMonthLabel).join(', ')}</td>
                <td class="td-number">${personDays !== null ? fmtN(personDays,1) : '—'}</td>
                <td class="td-number">${fmtN(q.pr,0)}</td>
                <td class="td-number">${fmtN(q.ar,1)}</td>
                <td class="td-number"><strong class="${ru&&ru>=0.9?'td-green':ru&&ru<0.8?'td-red':''}">${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(q.pot,0)}</td>
                <td class="td-number">${fmtN(q.aot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(q.abs,0)}</td>
                <td class="td-number">${absRate!==null?(absRate*100).toFixed(2)+'%':'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Records by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Working Days</th><th>Manpower</th><th>Person-Days</th><th>Planned Reg</th><th>Actual Reg</th><th>Reg Util%</th><th>Planned OT</th><th>Actual OT</th><th>OT Util%</th><th>Total Util%</th><th>Absent</th><th>Absent %</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const ru=calcRegHrsUtil(r.actual_reg,r.planned_reg), ou=calcOTUtil(r.actual_ot,r.planned_ot);
              const rowPersonDays = r.person_days ?? calcPersonDays(r.working_days, r.manpower);
              const rowAbsPct = rowPersonDays > 0 && r.absenteeism != null
                ? r.absenteeism / rowPersonDays
                : calcAbsenteeismRate(r.absenteeism, r.working_days, r.manpower, r.planned_reg);
              const totalUtil = calcTotalManhoursUtil(r.actual_reg, r.actual_ot, r.planned_reg, r.planned_ot);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'—'}</td>
                <td class="td-number">${r.working_days!=null?fmtN(r.working_days,1):'—'}</td>
                <td class="td-number">${r.manpower!=null?fmtN(r.manpower,1):'—'}</td>
                <td class="td-number">${rowPersonDays!==null?fmtN(rowPersonDays,1):'—'}</td>
                <td class="td-number">${fmtN(r.planned_reg,0)}</td>
                <td class="td-number">${fmtN(r.actual_reg,1)}</td>
                <td class="td-number"><strong class="${ru&&ru>=0.9?'td-green':ru&&ru<0.8?'td-red':''}">${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(r.planned_ot,0)}</td>
                <td class="td-number">${fmtN(r.actual_ot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number"><strong>${totalUtil!==null?(totalUtil*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${r.absenteeism!=null?fmtN(r.absenteeism,1):'—'}</td>
                <td class="td-number">${rowAbsPct!==null?((rowAbsPct*100).toFixed(2)+'%'):'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="14"><div class="empty"><p>No manhours data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
 
  destroyChart('runrateTrend');
  const runrateTrendCtx = document.getElementById('runrateTrendChart');
  if (runrateTrendCtx && runrateTrendLabels.length) {
    charts['runrateTrend'] = new Chart(runrateTrendCtx, {
      type: 'bar',
      data: {
        labels: runrateTrendLabels,
        datasets: [
          { label: 'Capacity', data: runrateTrendCap, backgroundColor: 'rgba(59,130,246,0.35)', borderRadius: 4, yAxisID: 'y' },
          { label: 'Actual', data: runrateTrendAct, backgroundColor: 'rgba(20,184,166,0.55)', borderRadius: 4, yAxisID: 'y' },
          { type: 'line', label: 'Efficiency %', data: runrateTrendEff.map(v => v === null ? null : v * 100), borderColor: '#d97706', borderWidth: 2, tension: 0.3, pointRadius: 3, yAxisID: 'yPct' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font:{size:11}, boxWidth:10 } } },
        scales: {
          y: { position: 'left', grid:{color:'#f1f5f9'}, ticks:{font:{size:11}} },
          yPct: { position: 'right', grid:{drawOnChartArea:false}, ticks:{font:{size:11}, callback:v=>v.toFixed(0)+'%'} },
          x: { grid:{display:false}, ticks:{font:{size:11}, maxRotation:45} }
        }
      }
    });
  }

  destroyChart('runrateLine');
  const runrateLineCtx = document.getElementById('runrateLineChart');
  if (runrateLineCtx && runrateLineLabels.length) {
    charts['runrateLine'] = new Chart(runrateLineCtx, {
      type: 'bar',
      data: {
        labels: runrateLineLabels,
        datasets: [{
          label: 'Efficiency %',
          data: runrateLineEff,
          backgroundColor: runrateLineEff.map(v => v == null ? '#cbd5e1' : v >= 95 ? '#0d9488' : v >= 85 ? '#d97706' : '#dc2626'),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display:false } },
        scales: {
          x: { grid:{color:'#f1f5f9'}, ticks:{font:{size:11}, callback:v=>v.toFixed(0)+'%'} },
          y: { grid:{display:false}, ticks:{font:{size:11}} }
        }
      }
    });
  }

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

  destroyChart('mhPlanActual');
  const mhPlanCtx = document.getElementById('mhPlanActualChart');
  if (mhPlanCtx && trendLabels.length) {
    charts['mhPlanActual'] = new Chart(mhPlanCtx, {
      type:'bar',
      data:{labels:trendLabels,datasets:[
        {label:'Planned',data:trendRows.map(r => (r.pr || 0) + (r.pot || 0)),backgroundColor:'rgba(59,130,246,0.35)',borderRadius:4},
        {label:'Actual',data:trendRows.map(r => (r.ar || 0) + (r.aot || 0)),backgroundColor:'rgba(20,184,166,0.55)',borderRadius:4}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},
        scales:{y:{grid:{color:'#f1f5f9'},ticks:{font:{size:11}}},
          x:{grid:{display:false},ticks:{font:{size:11},maxRotation:45}}}}
    });
  }

  destroyChart('mhLine');
  const mhLineCtx = document.getElementById('mhLineChart');
  if (mhLineCtx && manhoursLineLabels.length) {
    charts['mhLine'] = new Chart(mhLineCtx, {
      type:'bar',
      data:{labels:manhoursLineLabels,datasets:[{
        label:'Total Utilization %',
        data:manhoursLineUtil,
        backgroundColor:manhoursLineUtil.map(v => v == null ? '#cbd5e1' : v >= 90 ? '#0d9488' : v >= 80 ? '#d97706' : '#dc2626'),
        borderRadius:4
      }]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{grid:{color:'#f1f5f9'},ticks:{font:{size:11},callback:v=>v.toFixed(0)+'%'}},
          y:{grid:{display:false},ticks:{font:{size:11}}}}}
    });
  }
}
 
// ── LOSS DASHBOARD ─────────────────────────────────────────────────────────────
function renderLoss(c, month) {
  const selectedMonth = month || '';
  const fiscalQuarter = isoMonth => {
    if (!isoMonth) return null;
    const [year, mo] = String(isoMonth).split('-').map(Number);
    if (!year || !mo) return null;
    if (mo >= 10) return { q: 1, fy: year + 1 };
    if (mo <= 3) return { q: 2, fy: year };
    if (mo <= 6) return { q: 3, fy: year };
    return { q: 4, fy: year };
  };
  const sameFiscalQuarter = (a, b) => {
    const qa = fiscalQuarter(a);
    const qb = fiscalQuarter(b);
    return !!qa && !!qb && qa.q === qb.q && qa.fy === qb.fy;
  };
  const quarterLabel = isoMonth => {
    const q = fiscalQuarter(isoMonth);
    return q ? `FY${q.fy} Q${q.q}` : fmtMonthLabel(isoMonth);
  };

  // ── Pull raw data ─────────────────────────────────────────────────────────────
  const allRunrateRows = getRunrateSummaryRows('');
  const allManhoursRows = getManhoursSummaryRows('');
  const inSelectedPeriod = row => !selectedMonth || sameFiscalQuarter(row.month, selectedMonth);
  const rrRows = allRunrateRows.filter(inSelectedPeriod);
  const mhRows = allManhoursRows.filter(inSelectedPeriod);
  const periodMonths = [...new Set([...rrRows, ...mhRows].map(r => r.month).filter(Boolean))].sort();
  const mLabel = selectedMonth ? quarterLabel(selectedMonth) : 'All Months';
  const periodLabel = selectedMonth && periodMonths.length
    ? `${mLabel} (${periodMonths.map(fmtMonthLabel).join(', ')})`
    : mLabel;

  // ── Per-line rows for the selected period ─────────────────────────────────────
  const lineBuckets = new Map();
  const getBucket = line => {
    const label = line || 'Plant-wide';
    if (!lineBuckets.has(label)) {
      lineBuckets.set(label, {
        line: label,
        months: new Set(),
        _rrCap: 0,
        _rrAct: 0,
        _personDays: 0,
        _absDays: 0,
        _plannedMH: 0,
        _actualMH: 0
      });
    }
    return lineBuckets.get(label);
  };

  rrRows.forEach(r => {
    const bucket = getBucket(r.line);
    if (r.month) bucket.months.add(r.month);
    bucket._rrCap += r.capacity || 0;
    bucket._rrAct += r.actual_output || 0;
  });

  mhRows.forEach(r => {
    const bucket = getBucket(r.line);
    if (r.month) bucket.months.add(r.month);
    bucket._personDays += r.person_days ?? calcPersonDays(r.working_days, r.manpower) ?? 0;
    bucket._absDays += r.absenteeism || 0;
    bucket._plannedMH += (r.planned_reg || 0) + (r.planned_ot || 0);
    bucket._actualMH += (r.actual_reg || 0) + (r.actual_ot || 0);
  });

  const rows = [...lineBuckets.values()]
    .sort((a, b) => String(a.line).localeCompare(String(b.line)))
    .map(bucket => {
      const runrateLoss = bucket._rrCap > 0 ? 1 - (bucket._rrAct / bucket._rrCap) : null;
      const absLoss = bucket._personDays > 0 ? bucket._absDays / bucket._personDays : null;
      const mhLoss = bucket._plannedMH > 0 ? 1 - (bucket._actualMH / bucket._plannedMH) : null;
      const rowTotal = (runrateLoss || 0) + (absLoss || 0) + (mhLoss || 0);

      return {
        ...bucket,
        period: mLabel,
        monthList: [...bucket.months].sort().map(fmtMonthLabel).join(', '),
        runrateLoss,
        absLoss,
        mhLoss,
        total: rowTotal,
        runPct: rowTotal > 0 && runrateLoss != null ? runrateLoss / rowTotal : null,
        absPct: rowTotal > 0 && absLoss != null ? absLoss / rowTotal : null,
        mhPct: rowTotal > 0 && mhLoss != null ? mhLoss / rowTotal : null
      };
    });

  // ── Aggregate for KPI cards & chart ──────────────────────────────────────────
  // Match Excel's approach: aggregate raw totals first, THEN compute loss rate.
  // e.g.  runrate loss = 1 − SUM(actual) / SUM(capacity)  (not avg of monthly rates)
  let totalCap = 0, totalAct = 0;
  let totalPersonDays = 0, totalAbsDays = 0;
  let totalPlannedMH = 0, totalActualMH = 0;

  rows.forEach(r => {
    totalCap        += r._rrCap;
    totalAct        += r._rrAct;
    totalPersonDays += r._personDays;
    totalAbsDays    += r._absDays;
    totalPlannedMH  += r._plannedMH;
    totalActualMH   += r._actualMH;
  });

  const aggRunLoss = totalCap > 0 ? 1 - totalAct / totalCap : null;
  const aggAbsLoss = totalPersonDays > 0 ? totalAbsDays / totalPersonDays : null;
  const aggMhLoss  = totalPlannedMH  > 0 ? 1 - totalActualMH / totalPlannedMH : null;

  const aggTotal = (aggRunLoss || 0) + (aggAbsLoss || 0) + (aggMhLoss || 0);
  const aggRunPct = aggTotal > 0 && aggRunLoss != null ? aggRunLoss / aggTotal : null;
  const aggAbsPct = aggTotal > 0 && aggAbsLoss != null ? aggAbsLoss / aggTotal : null;
  const aggMhPct  = aggTotal > 0 && aggMhLoss  != null ? aggMhLoss  / aggTotal : null;

  const hasData = rows.length > 0;

  // Helper: colour class for contribution cells
  const contribClass = pct => pct > 0.5 ? 'td-red' : pct > 0.25 ? 'var(--amber)' : '';

  c.innerHTML = `
    <div class="page-header">
      <h1>Loss Analysis</h1>
      <p>Derived from Runrate Efficiency &amp; Manhours data — <strong>${periodLabel}</strong></p>
    </div>
    <div class="info-block" style="margin-bottom:20px">
      <strong>Fully derived.</strong>
      Runrate Loss = 1 − (Actual ÷ Capacity) &nbsp;|&nbsp;
      Absenteeism Loss = Absences ÷ (Working Days × Manpower) &nbsp;|&nbsp;
      Manhours Loss = 1 − (Actual MH ÷ Planned MH) &nbsp;|&nbsp;
      % Contribution = Individual Loss ÷ Sum of All Three
    </div>

    <div class="metrics-grid section-gap">
      <div class="metric-card">
        <div class="metric-label">Runrate Loss %</div>
        <div class="metric-value">${aggRunLoss !== null ? (aggRunLoss*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${aggRunPct !== null ? 'Contrib: '+(aggRunPct*100).toFixed(1)+'% of total' : 'no runrate data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Absenteeism Loss %</div>
        <div class="metric-value">${aggAbsLoss !== null ? (aggAbsLoss*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${aggAbsPct !== null ? 'Contrib: '+(aggAbsPct*100).toFixed(1)+'% of total' : 'no manhours data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Manhours Loss %</div>
        <div class="metric-value">${aggMhLoss !== null ? (aggMhLoss*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${aggMhPct !== null ? 'Contrib: '+(aggMhPct*100).toFixed(1)+'% of total' : 'no manhours data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Loss</div>
        <div class="metric-value">${aggTotal > 0 ? (aggTotal*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">sum of three loss types</div>
      </div>
    </div>

    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">% Contribution Factor</div>
        <div class="chart-container">
          <canvas id="lossPieChart" aria-label="Loss contribution factor">Loss contribution breakdown</canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Loss Breakdown</div>
        ${hasData ? `
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
              <span style="font-weight:600">Runrate Loss</span>
              <span>
                <span style="color:var(--gray-500);font-size:12px;margin-right:8px">${aggRunLoss !== null ? (aggRunLoss*100).toFixed(2)+'%' : '—'}</span>
                <strong style="color:var(--amber)">${aggRunPct !== null ? (aggRunPct*100).toFixed(1)+'%' : '—'}</strong>
              </span>
            </div>
            <div class="progress-bar"><div class="progress-fill progress-amber" style="width:${aggRunPct ? Math.min(aggRunPct*100,100) : 0}%"></div></div>
          </div>
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
              <span style="font-weight:600">Absenteeism Loss</span>
              <span>
                <span style="color:var(--gray-500);font-size:12px;margin-right:8px">${aggAbsLoss !== null ? (aggAbsLoss*100).toFixed(2)+'%' : '—'}</span>
                <strong style="color:var(--red)">${aggAbsPct !== null ? (aggAbsPct*100).toFixed(1)+'%' : '—'}</strong>
              </span>
            </div>
            <div class="progress-bar"><div class="progress-fill progress-red" style="width:${aggAbsPct ? Math.min(aggAbsPct*100,100) : 0}%"></div></div>
          </div>
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
              <span style="font-weight:600">Manhours Loss</span>
              <span>
                <span style="color:var(--gray-500);font-size:12px;margin-right:8px">${aggMhLoss !== null ? (aggMhLoss*100).toFixed(2)+'%' : '—'}</span>
                <strong style="color:var(--blue)">${aggMhPct !== null ? (aggMhPct*100).toFixed(1)+'%' : '—'}</strong>
              </span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="background:var(--blue);width:${aggMhPct ? Math.min(aggMhPct*100,100) : 0}%"></div></div>
          </div>
          <div style="font-size:11px;color:var(--gray-400);padding-top:8px;border-top:1px solid var(--gray-200)">
            Left value = raw loss %; bold right value = % contribution factor
          </div>
        ` : '<div class="empty"><p>No data yet. Enter Runrate Efficiency and Manhours data first.</p></div>'}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="card-title">Loss by Line — ${mLabel}</div>
        ${!selectedMonth ? '<div style="font-size:11px;color:var(--gray-400)">Select a month in the sidebar to view its fiscal quarter</div>' : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th><th>Line</th>
              <th class="td-number">Runrate Loss %</th>
              <th class="td-number">Absence Loss %</th>
              <th class="td-number">Manhours Loss %</th>
              <th class="td-number" style="border-left:2px solid var(--gray-200)">Runrate Contrib</th>
              <th class="td-number">Absence Contrib</th>
              <th class="td-number">MH Contrib</th>
            </tr>
          </thead>
          <tbody>
            ${hasData ? rows.map(r => `<tr>
              <td title="${r.monthList}">${r.period}</td>
              <td><strong>${r.line || '—'}</strong></td>
              <td class="td-number">${r.runrateLoss != null ? (r.runrateLoss*100).toFixed(2)+'%' : '—'}</td>
              <td class="td-number">${r.absLoss    != null ? (r.absLoss*100).toFixed(2)+'%'     : '—'}</td>
              <td class="td-number">${r.mhLoss     != null ? (r.mhLoss*100).toFixed(2)+'%'      : '—'}</td>
              <td class="td-number td-red" style="border-left:2px solid var(--gray-200)">${r.runPct != null ? (r.runPct*100).toFixed(1)+'%' : '—'}</td>
              <td class="td-number td-red">${r.absPct != null ? (r.absPct*100).toFixed(1)+'%' : '—'}</td>
              <td class="td-number td-red">${r.mhPct  != null ? (r.mhPct*100).toFixed(1)+'%'  : '—'}</td>
            </tr>`).join('')
            : '<tr><td colspan="8"><div class="empty"><p>No data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  destroyChart('lossPie');
  const ctx = document.getElementById('lossPieChart');
  if (ctx && aggTotal > 0) {
    charts['lossPie'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Runrate Loss', 'Absenteeism Loss', 'Manhours Loss'],
        datasets: [{
          data: [aggRunLoss || 0, aggAbsLoss || 0, aggMhLoss || 0],
          backgroundColor: ['#d97706','#dc2626','#1a56db'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 16 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = ctx.parsed;
                const contrib = aggTotal > 0 ? (val / aggTotal * 100).toFixed(1) : '—';
                return ` ${(val*100).toFixed(2)}% loss  (${contrib}% of total)`;
              }
            }
          }
        }
      }
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
