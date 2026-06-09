import { query, run } from './database.js';
import { 
  fmtN, fmtMonthLabel, monthOptions, showToast, 
  val, setVal, parseN, clearForm, calcEfficiency, calcRegHrsUtil, calcOTUtil 
} from './utils.js';

// ── ENTRY: UTILITIES & R&M ─────────────────────────────────────────────────────
function renderEntryUtilities(c) {
  const rows = query('SELECT * FROM utilities ORDER BY month DESC LIMIT 36');
  c.innerHTML = `
    <div class="page-header">
      <h1>Utilities & R&M Entry</h1>
      <p>Enter monthly utility cost and repair & maintenance cost</p>
    </div>
    <div class="card section-gap">
      <div class="info-block"><strong>Note:</strong> Enter raw cost values. The system computes Cost per Kg automatically using the production volume for that month.</div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="u_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Utility Cost (₱ thousands)</label>
            <input type="number" id="u_util" placeholder="e.g. 1761.21" step="0.01">
            <span class="form-hint">Total electricity, water, fuel expenses</span>
          </div>
          <div class="form-group">
            <label>R&M Cost (₱ thousands)</label>
            <input type="number" id="u_rm" placeholder="e.g. 1510.80" step="0.01">
            <span class="form-hint">Repair and maintenance expenses</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveUtility()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearForm(['u_month','u_util','u_rm'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Existing Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Utility Cost (₱)</th><th>R&M Cost (₱)</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>`<tr>
              <td><strong>${fmtMonthLabel(r.month)}</strong></td>
              <td class="td-number">${fmtN(r.utility_cost,2)}</td>
              <td class="td-number">${fmtN(r.rm_cost,2)}</td>
              <td><div class="record-actions">
                <button class="btn btn-sm btn-secondary" onclick="editUtility('${r.month}',${r.utility_cost},${r.rm_cost})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecord('utilities','${r.month}')">Delete</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="4"><div class="empty"><p>No records yet. Enter data above.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
 
function saveUtility() {
  const month=val('u_month'), util=parseFloat(val('u_util')), rm=parseFloat(val('u_rm'));
  if(!month){showToast('Please select a month','error');return;}
  if(isNaN(util)&&isNaN(rm)){showToast('Enter at least one cost value','error');return;}
  run(`INSERT INTO utilities (month,utility_cost,rm_cost) VALUES (?,?,?)
    ON CONFLICT(month) DO UPDATE SET utility_cost=excluded.utility_cost, rm_cost=excluded.rm_cost`,
    [month, isNaN(util)?null:util, isNaN(rm)?null:rm]);
  showToast('Utility record saved!');
  navigateTo('entry-utilities');
}
function editUtility(month,util,rm){
  document.getElementById('u_month').value=month;
  document.getElementById('u_util').value=util||'';
  document.getElementById('u_rm').value=rm||'';
  document.querySelector('#u_month').scrollIntoView({behavior:'smooth'});
}
 
// ── ENTRY: PRODUCTION VOLUME ───────────────────────────────────────────────────
function renderEntryProduction(c) {
  const rows = query('SELECT * FROM production ORDER BY month DESC LIMIT 36');
  c.innerHTML = `
    <div class="page-header">
      <h1>Production Volume Entry</h1>
      <p>Enter monthly production volume in metric tons (MT)</p>
    </div>
    <div class="card section-gap">
      <div class="info-block"><strong>Note:</strong> Production volume is the denominator for all cost-per-Kg calculations.</div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="p_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Production Volume (MT) *</label>
            <input type="number" id="p_vol" placeholder="e.g. 1795.41" step="0.001">
            <span class="form-hint">Total production in metric tons</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveProduction()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearForm(['p_month','p_vol'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Existing Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Volume (MT)</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>`<tr>
              <td><strong>${fmtMonthLabel(r.month)}</strong></td>
              <td class="td-number">${fmtN(r.volume,3)}</td>
              <td><div class="record-actions">
                <button class="btn btn-sm btn-secondary" onclick="editProd('${r.month}',${r.volume})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecord('production','${r.month}')">Delete</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="3"><div class="empty"><p>No records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
function saveProduction(){
  const month=val('p_month'), volume=parseFloat(val('p_vol'));
  if(!month||isNaN(volume)){showToast('Month and volume are required','error');return;}
  run(`INSERT INTO production (month,volume) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET volume=excluded.volume`,[month,volume]);
  showToast('Production record saved!');navigateTo('entry-production');
}
function editProd(m,v){document.getElementById('p_month').value=m;document.getElementById('p_vol').value=v||'';}
 
// ── ENTRY: CAPACITY ────────────────────────────────────────────────────────────
function renderEntryCapacity(c) {
  const rows = query('SELECT * FROM capacity ORDER BY month DESC, line LIMIT 60');
  c.innerHTML = `
    <div class="page-header">
      <h1>Capacity & Efficiency Entry</h1>
      <p>Enter production line capacity and actual output per month</p>
    </div>
    <div class="card section-gap">
      <div class="info-block"><strong>Formula:</strong> Efficiency = Actual Output ÷ Capacity × 100%</div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="c_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Production Line *</label>
            <input type="text" id="c_line" placeholder="e.g. Line 4 ES">
            <span class="form-hint">Exact line name as in Excel (e.g. Line 4 ES, Line 6 Epoxy, Line 4 BB)</span>
          </div>
          <div class="form-group">
            <label>Capacity (units) *</label>
            <input type="number" id="c_cap" placeholder="e.g. 138046" step="0.001">
          </div>
          <div class="form-group">
            <label>Actual Output (units) *</label>
            <input type="number" id="c_act" placeholder="e.g. 132313" step="0.001">
          </div>
        </div>
        <div id="c_preview" style="margin-top:12px;font-size:13px;color:var(--gray-500)"></div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveCapacity()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearForm(['c_month','c_line','c_cap','c_act'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Existing Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Capacity</th><th>Actual Output</th><th>Efficiency</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const eff=calcEfficiency(r.capacity,r.actual_output);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td><td><strong>${r.line}</strong></td>
                <td class="td-number">${fmtN(r.capacity,0)}</td>
                <td class="td-number">${fmtN(r.actual_output,0)}</td>
                <td class="td-number"><strong>${eff!==null?(eff*100).toFixed(2)+'%':'—'}</strong></td>
                <td><div class="record-actions">
                  <button class="btn btn-sm btn-secondary" onclick="editCap('${r.month}','${r.line}',${r.capacity},${r.actual_output})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteCapacity('${r.month}','${r.line}')">Delete</button>
                </div></td>
              </tr>`;
            }).join('') : '<tr><td colspan="6"><div class="empty"><p>No records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('c_cap').addEventListener('input',previewEff);
  document.getElementById('c_act').addEventListener('input',previewEff);
}
function previewEff(){
  const cap=parseFloat(document.getElementById('c_cap').value), act=parseFloat(document.getElementById('c_act').value);
  const prev=document.getElementById('c_preview');
  if(!isNaN(cap)&&!isNaN(act)&&cap>0) prev.innerHTML=`Preview: Efficiency = <strong>${(act/cap*100).toFixed(2)}%</strong>`;
  else prev.innerHTML='';
}
function saveCapacity(){
  const month=val('c_month'),line=val('c_line').trim(),cap=parseFloat(val('c_cap')),act=parseFloat(val('c_act'));
  if(!month||!line||isNaN(cap)||isNaN(act)){showToast('All fields are required','error');return;}
  run(`INSERT INTO capacity (month,line,capacity,actual_output) VALUES (?,?,?,?)
    ON CONFLICT(month,line) DO UPDATE SET capacity=excluded.capacity, actual_output=excluded.actual_output`,
    [month,line,cap,act]);
  showToast('Capacity record saved!');navigateTo('entry-capacity');
}
function editCap(m,l,c,a){
  document.getElementById('c_month').value=m;document.getElementById('c_line').value=l;
  document.getElementById('c_cap').value=c;document.getElementById('c_act').value=a;
}
function deleteCapacity(month,line){
  if(!confirm(`Delete capacity record for ${line} in ${fmtMonthLabel(month)}?`)) return;
  run(`DELETE FROM capacity WHERE month=? AND line=?`,[month,line]);
  showToast('Deleted.','error');navigateTo('entry-capacity');
}
 
// ── ENTRY: MANHOURS ────────────────────────────────────────────────────────────
function renderEntryManhours(c) {
  const rows = query('SELECT * FROM manhours ORDER BY month DESC, line LIMIT 60');
  c.innerHTML = `
    <div class="page-header">
      <h1>Manhours Entry</h1>
      <p>Enter planned and actual regular and overtime hours per line per month</p>
    </div>
    <div class="card section-gap">
      <div class="info-block">
        <strong>Formulas:</strong> Reg Utilization = Actual Reg Hrs ÷ Planned Reg Hrs × 100% &nbsp;|&nbsp; OT Utilization = Actual OT Hrs ÷ Planned OT Hrs × 100%
      </div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="mh_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Line / Group</label>
            <input type="text" id="mh_line" placeholder="e.g. Line 4 ES">
            <span class="form-hint">Leave blank for plant-wide</span>
          </div>
          <div class="form-group">
            <label>Planned Regular Hours</label>
            <input type="number" id="mh_pr" placeholder="e.g. 6480" step="0.01">
          </div>
          <div class="form-group">
            <label>Actual Regular Hours</label>
            <input type="number" id="mh_ar" placeholder="e.g. 5726.94" step="0.01">
          </div>
          <div class="form-group">
            <label>Planned OT Hours</label>
            <input type="number" id="mh_pot" placeholder="e.g. 3240" step="0.01">
          </div>
          <div class="form-group">
            <label>Actual OT Hours</label>
            <input type="number" id="mh_aot" placeholder="e.g. 1886.50" step="0.01">
          </div>
          <div class="form-group">
            <label>Absenteeism (person-days)</label>
            <input type="number" id="mh_abs" placeholder="e.g. 24" step="0.01">
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveManhours()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearForm(['mh_month','mh_line','mh_pr','mh_ar','mh_pot','mh_aot','mh_abs'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Existing Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Plan Reg</th><th>Act Reg</th><th>Reg Util%</th><th>Plan OT</th><th>Act OT</th><th>OT Util%</th><th>Absent</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const ru=calcRegHrsUtil(r.actual_reg,r.planned_reg), ou=calcOTUtil(r.actual_ot,r.planned_ot);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td><td>${r.line||'—'}</td>
                <td class="td-number">${fmtN(r.planned_reg,0)}</td><td class="td-number">${fmtN(r.actual_reg,1)}</td>
                <td class="td-number"><strong>${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(r.planned_ot,0)}</td><td class="td-number">${fmtN(r.actual_ot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${r.absenteeism!=null?fmtN(r.absenteeism,1):'—'}</td>
                <td><div class="record-actions">
                  <button class="btn btn-sm btn-secondary" onclick="editMH(${r.id})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteMH(${r.id})">Delete</button>
                </div></td>
              </tr>`;
            }).join('') : '<tr><td colspan="10"><div class="empty"><p>No records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
function saveManhours(){
  const month=val('mh_month'), line=val('mh_line').trim();
  const pr=parseN('mh_pr'),ar=parseN('mh_ar'),pot=parseN('mh_pot'),aot=parseN('mh_aot'),abs=parseN('mh_abs');
  if(!month){showToast('Month is required','error');return;}
  const lineKey = line || '';   // always string, never null
  run(`INSERT INTO manhours (month,line,planned_reg,actual_reg,planned_ot,actual_ot,absenteeism) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(month,line) DO UPDATE SET planned_reg=excluded.planned_reg,actual_reg=excluded.actual_reg,planned_ot=excluded.planned_ot,actual_ot=excluded.actual_ot,absenteeism=excluded.absenteeism`,
    [month, lineKey, pr, ar, pot, aot, abs]);
  showToast('Manhours record saved!');navigateTo('entry-manhours');
}
function editMH(id){
  const r=query(`SELECT * FROM manhours WHERE id=?`,[id])[0];
  if(!r)return;
  setVal('mh_month',r.month);setVal('mh_line',r.line||'');setVal('mh_pr',r.planned_reg);
  setVal('mh_ar',r.actual_reg);setVal('mh_pot',r.planned_ot);setVal('mh_aot',r.actual_ot);setVal('mh_abs',r.absenteeism);
}
function deleteMH(id){
  if(!confirm('Delete this manhours record?'))return;
  run(`DELETE FROM manhours WHERE id=?`,[id]);
  showToast('Deleted.','error');navigateTo('entry-manhours');
}
 
// ── ENTRY: LOSS ────────────────────────────────────────────────────────────────
function renderEntryLoss(c) {
  const rows = query('SELECT * FROM loss ORDER BY month DESC, line LIMIT 60');
  c.innerHTML = `
    <div class="page-header">
      <h1>Loss Analysis Entry</h1>
      <p>Enter runrate, absenteeism, and manhours loss values per line</p>
    </div>
    <div class="card section-gap">
      <div class="info-block">
        <strong>Formula:</strong> Loss Contribution % = Individual Loss ÷ Total Loss × 100%
      </div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="l_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Line / Group</label>
            <input type="text" id="l_line" placeholder="e.g. Line 4 ES">
            <span class="form-hint">Leave blank for plant-wide</span>
          </div>
          <div class="form-group">
            <label>Runrate Loss</label>
            <input type="number" id="l_run" placeholder="e.g. 0.0683" step="0.0001">
            <span class="form-hint">Enter as decimal (e.g. 0.0683 = 6.83%)</span>
          </div>
          <div class="form-group">
            <label>Absenteeism Loss</label>
            <input type="number" id="l_abs" placeholder="e.g. 0.0296" step="0.0001">
            <span class="form-hint">Enter as decimal (e.g. 0.0296 = 2.96%)</span>
          </div>
          <div class="form-group">
            <label>Manhours Loss</label>
            <input type="number" id="l_mh" placeholder="e.g. 0.2167" step="0.0001">
            <span class="form-hint">Enter as decimal (e.g. 0.2167 = 21.67%)</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveLoss()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearForm(['l_month','l_line','l_run','l_abs','l_mh'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Existing Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Runrate Loss</th><th>Absenteeism Loss</th><th>Manhours Loss</th><th>Total</th><th>Runrate %</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const tot=(r.runrate_loss||0)+(r.absenteeism_loss||0)+(r.manhours_loss||0);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td><td>${r.line||'—'}</td>
                <td class="td-number">${fmtN(r.runrate_loss,4)}</td>
                <td class="td-number">${fmtN(r.absenteeism_loss,4)}</td>
                <td class="td-number">${fmtN(r.manhours_loss,4)}</td>
                <td class="td-number"><strong>${fmtN(tot,4)}</strong></td>
                <td class="td-number">${tot>0?((r.runrate_loss/tot)*100).toFixed(1)+'%':'—'}</td>
                <td><div class="record-actions">
                  <button class="btn btn-sm btn-secondary" onclick="editLoss(${r.id})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteLoss(${r.id})">Delete</button>
                </div></td>
              </tr>`;
            }).join('') : '<tr><td colspan="8"><div class="empty"><p>No records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
function saveLoss(){
  const month=val('l_month'), line=val('l_line').trim();
  const runVal=parseN('l_run'), abs=parseN('l_abs'), mh=parseN('l_mh');
  if(!month){showToast('Month is required','error');return;}
  run(`INSERT INTO loss (month,line,runrate_loss,absenteeism_loss,manhours_loss) VALUES (?,?,?,?,?)
    ON CONFLICT(month,line) DO UPDATE SET runrate_loss=excluded.runrate_loss,absenteeism_loss=excluded.absenteeism_loss,manhours_loss=excluded.manhours_loss`,
    [month, line||'', runVal, abs, mh]);  // always string, never null
  showToast('Loss record saved!');navigateTo('entry-loss');
}
function editLoss(id){
  const r=query(`SELECT * FROM loss WHERE id=?`,[id])[0];
  if(!r)return;
  setVal('l_month',r.month);setVal('l_line',r.line||'');setVal('l_run',r.runrate_loss);setVal('l_abs',r.absenteeism_loss);setVal('l_mh',r.manhours_loss);
}
function deleteLoss(id){if(!confirm('Delete?'))return;run(`DELETE FROM loss WHERE id=?`,[id]);showToast('Deleted.','error');navigateTo('entry-loss');}
 
// ── ENTRY: BUDGET ──────────────────────────────────────────────────────────────
function renderEntryBudget(c) {
  const rows = query('SELECT * FROM budget ORDER BY month DESC LIMIT 36');
  c.innerHTML = `
    <div class="page-header">
      <h1>Budget Entry</h1>
      <p>Enter monthly budget targets for utilities, R&M, and volume</p>
    </div>
    <div class="card section-gap">
      <div class="info-block"><strong>Formula:</strong> Variance = Actual − Budget. Positive variance = over budget (unfavorable for cost).</div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Budget Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="b_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Utility Budget (₱)</label>
            <input type="number" id="b_ubud" placeholder="e.g. 9001" step="0.01">
          </div>
          <div class="form-group">
            <label>R&M Budget (₱)</label>
            <input type="number" id="b_rbud" placeholder="e.g. 4500" step="0.01">
          </div>
          <div class="form-group">
            <label>Volume Budget (MT)</label>
            <input type="number" id="b_vbud" placeholder="e.g. 1800" step="0.001">
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveBudget()">Save Budget</button>
          <button class="btn btn-secondary" onclick="clearForm(['b_month','b_ubud','b_rbud','b_vbud'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Existing Budget Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Utility Budget</th><th>R&M Budget</th><th>Volume Budget (MT)</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>`<tr>
              <td><strong>${fmtMonthLabel(r.month)}</strong></td>
              <td class="td-number">${fmtN(r.utility_budget,2)}</td>
              <td class="td-number">${fmtN(r.rm_budget,2)}</td>
              <td class="td-number">${fmtN(r.volume_budget,3)}</td>
              <td><div class="record-actions">
                <button class="btn btn-sm btn-secondary" onclick="editBudget('${r.month}',${r.utility_budget},${r.rm_budget},${r.volume_budget})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecord('budget','${r.month}')">Delete</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="5"><div class="empty"><p>No budget records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
function saveBudget(){
  const month=val('b_month'),ub=parseN('b_ubud'),rb=parseN('b_rbud'),vb=parseN('b_vbud');
  if(!month){showToast('Month is required','error');return;}
  run(`INSERT INTO budget (month,utility_budget,rm_budget,volume_budget) VALUES (?,?,?,?)
    ON CONFLICT(month) DO UPDATE SET utility_budget=excluded.utility_budget,rm_budget=excluded.rm_budget,volume_budget=excluded.volume_budget`,
    [month,ub,rb,vb]);
  showToast('Budget saved!');navigateTo('entry-budget');
}
function editBudget(m,ub,rb,vb){
  setVal('b_month',m);setVal('b_ubud',ub);setVal('b_rbud',rb);setVal('b_vbud',vb);
}

export {
  renderEntryUtilities, saveUtility, editUtility,
  renderEntryProduction, saveProduction, editProd,
  renderEntryCapacity, saveCapacity, editCap, deleteCapacity, previewEff,
  renderEntryManhours, saveManhours, editMH, deleteMH,
  renderEntryLoss, saveLoss, editLoss, deleteLoss,
  renderEntryBudget, saveBudget, editBudget
};