/* =========================================================
   PropCompare · main.js  v2.0
   Enhanced Rental Property Investment Comparison Tool
   ========================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'propcompare_v2';
  const EMOJIS      = ['🏠','🏡','🏘️','🏗️','🏢','🏬','🏙️','🏚️'];
  const COLORS      = ['#d4a847','#3ecf8e','#f06565','#6e8efb','#f0a265','#a06efb','#65c8f0','#f065b8'];

  let state = { properties: [], editingId: null, sortBy: 'cap_rate' };

  // ── Persistence ──────────────────────────────────────────
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.properties = JSON.parse(raw);
    } catch(e) { state.properties = []; }
    if (!state.properties.length) seedData();
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.properties));
  }

  function seedData() {
    [
      {
        property_type:'multi_family', name:'Maple Street Duplex', address:'1204 Maple St, Austin TX',
        sqft:2400, price_per_sqft:177, units:2,
        purchase_price:425000, down_payment_pct:20, interest_rate:6.75, loan_term:30, loan_type:'conventional', points:0,
        closing_costs:8500, rehab_costs:15000,
        monthly_rent:3600, vacancy_rate:5, other_income:0, rent_growth:2,
        property_tax:5100, insurance:1800, maintenance:2400, management_pct:8,
        hoa:0, utilities:0, capex_reserve:1200, landscaping:0, pest_control:0,
        appreciation_rate:3, hold_years:5,
      },
      {
        property_type:'single_family', name:'Riverside Ranch', address:'88 River View Dr, Nashville TN',
        sqft:1850, price_per_sqft:154, units:1,
        purchase_price:285000, down_payment_pct:25, interest_rate:6.5, loan_term:30, loan_type:'conventional', points:0,
        closing_costs:5700, rehab_costs:5000,
        monthly_rent:2200, vacancy_rate:6, other_income:50, rent_growth:2,
        property_tax:3200, insurance:1100, maintenance:1200, management_pct:10,
        hoa:3600, utilities:0, capex_reserve:800, landscaping:600, pest_control:300,
        appreciation_rate:2.5, hold_years:5,
      },
    ].forEach(addProperty);
  }

  // ── IRR (Newton-Raphson) ─────────────────────────────────
  function calcIRR(cashflows) {
    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
      let npv = 0, dnpv = 0;
      cashflows.forEach((cf, t) => {
        const d = Math.pow(1 + rate, t);
        npv  += cf / d;
        dnpv -= t * cf / (d * (1 + rate));
      });
      if (Math.abs(dnpv) < 1e-10) break;
      const nr = rate - npv / dnpv;
      if (Math.abs(nr - rate) < 1e-7) { rate = nr; break; }
      rate = nr;
    }
    return isFinite(rate) && rate > -1 ? rate * 100 : null;
  }

  // ── Core Calculator ──────────────────────────────────────
  function calcProperty(p) {
    const price       = +p.purchase_price    || 0;
    const sqft        = +p.sqft              || 0;
    const downPct     = +p.down_payment_pct  / 100;
    const down        = price * downPct;
    const points_cost = price * ((+p.points || 0) / 100);
    const closing     = +p.closing_costs     || 0;
    const rehab       = +p.rehab_costs       || 0;
    const total_invest= down + closing + rehab + points_cost;
    const loan        = price - down;
    const rate_mo     = (+p.interest_rate / 100) / 12;
    const n           = +p.loan_term * 12;
    const hold        = Math.max(1, +p.hold_years || 5);
    const mgmt_pct    = +p.management_pct / 100;
    const rent_growth = +p.rent_growth / 100 || 0;
    const appr_rate   = +p.appreciation_rate / 100 || 0;

    let mortgage = 0;
    if (rate_mo > 0 && n > 0) {
      mortgage = loan * (rate_mo * Math.pow(1 + rate_mo, n)) / (Math.pow(1 + rate_mo, n) - 1);
    } else if (n > 0) {
      mortgage = loan / n;
    }

    const gross_annual_rent = +p.monthly_rent * 12;
    const vacancy_loss      = gross_annual_rent * (+p.vacancy_rate / 100);
    const other_income_ann  = +p.other_income * 12;
    const effective_income  = gross_annual_rent - vacancy_loss + other_income_ann;
    const management        = effective_income * mgmt_pct;

    const prop_tax    = +p.property_tax    || 0;
    const insurance   = +p.insurance       || 0;
    const maintenance = +p.maintenance     || 0;
    const hoa         = +p.hoa             || 0;
    const utilities   = +p.utilities       || 0;
    const capex       = +p.capex_reserve   || 0;
    const landscaping = +p.landscaping     || 0;
    const pest        = +p.pest_control    || 0;
    const opex_fixed  = prop_tax + insurance + maintenance + hoa + utilities + capex + landscaping + pest;
    const total_opex  = opex_fixed + management;

    const noi          = effective_income - total_opex;
    const annual_mtg   = mortgage * 12;
    const annual_cf    = noi - annual_mtg;
    const monthly_cf   = annual_cf / 12;
    const cap_rate     = price > 0 ? (noi / price) * 100 : 0;
    const cash_on_cash = total_invest > 0 ? (annual_cf / total_invest) * 100 : 0;
    const grm          = gross_annual_rent > 0 ? price / gross_annual_rent : 0;
    const dscr         = annual_mtg > 0 ? noi / annual_mtg : 0;
    const ltv          = price > 0 ? (loan / price) * 100 : 0;
    const break_even_ratio   = effective_income > 0 ? ((total_opex + annual_mtg) / effective_income) * 100 : 0;
    const expense_ratio      = effective_income > 0 ? (total_opex / effective_income) * 100 : 0;
    const price_per_sqft_calc= sqft > 0 ? price / sqft : (+p.price_per_sqft || 0);
    const rent_per_sqft      = sqft > 0 && +p.monthly_rent > 0 ? +p.monthly_rent / sqft : 0;

    // Break-even vacancy: vacancy % at which cashflow = 0
    const be_eff = mgmt_pct < 1 ? (opex_fixed + annual_mtg) / (1 - mgmt_pct) : 0;
    const break_even_vacancy = gross_annual_rent > 0
      ? Math.max(0, Math.min(100, (1 - (be_eff - other_income_ann) / gross_annual_rent) * 100))
      : 0;

    // Multi-year projection
    const irr_flows = [-total_invest];
    let bal = loan;
    const proj = [];

    for (let y = 1; y <= hold; y++) {
      let ppd = 0;
      for (let m = 0; m < 12; m++) {
        const interest  = bal * rate_mo;
        const principal = Math.max(0, mortgage - interest);
        ppd += principal;
        bal  = Math.max(0, bal - principal);
      }
      const rf        = Math.pow(1 + rent_growth, y - 1);
      const gross_y   = gross_annual_rent * rf;
      const vac_y     = gross_y * (+p.vacancy_rate / 100);
      const eff_y     = gross_y - vac_y + other_income_ann;
      const cf_y      = eff_y - (opex_fixed + eff_y * mgmt_pct) - annual_mtg;
      const cum_cf    = (proj[y-2]?.cumulative_cf || 0) + cf_y;
      const equity_pd = loan - bal;
      const appreciation = price * Math.pow(1 + appr_rate, y) - price;
      const prop_value   = price + appreciation;
      const sale_proceeds= prop_value - bal - prop_value * 0.06;
      const total_return = cum_cf + equity_pd + appreciation;
      proj.push({ year: y, annual_cf: cf_y, cumulative_cf: cum_cf, equity_paydown: equity_pd, appreciation, total_return, prop_value, sale_proceeds });
      irr_flows.push(y < hold ? cf_y : cf_y + sale_proceeds);
    }

    const irr   = calcIRR(irr_flows);
    const npv_10= irr_flows.reduce((s, cf, t) => s + cf / Math.pow(1.10, t), 0);

    return {
      ...p,
      _calc: {
        down, loan, mortgage, total_invest, points_cost, closing, rehab,
        gross_annual_rent, vacancy_loss, effective_income, other_income_ann, management,
        prop_tax, insurance, maintenance, hoa, utilities, capex, landscaping, pest,
        opex_fixed, total_opex, noi, annual_mtg, annual_cf, monthly_cf,
        cap_rate, cash_on_cash, grm, dscr, ltv,
        break_even_ratio, break_even_vacancy, expense_ratio,
        price_per_sqft_calc, rent_per_sqft,
        irr, npv_10, proj,
      }
    };
  }

  // ── Helpers ───────────────────────────────────────────────
  function ratingClass(key, value) {
    if (value == null) return 'neutral';
    const rules = {
      cap_rate:           [v=>v>=7,   v=>v>=5],
      cash_on_cash:       [v=>v>=8,   v=>v>=5],
      dscr:               [v=>v>=1.3, v=>v>=1.0],
      monthly_cf:         [v=>v>=300, v=>v>=0],
      grm:                [v=>v<=10,  v=>v<=15],
      break_even_ratio:   [v=>v<=75,  v=>v<=90],
      break_even_vacancy: [v=>v>=20,  v=>v>=10],
      irr:                [v=>v>=15,  v=>v>=10],
      expense_ratio:      [v=>v<=40,  v=>v<=55],
    };
    const r = rules[key];
    if (!r) return 'neutral';
    return r[0](value) ? 'good' : r[1](value) ? 'warn' : 'bad';
  }

  const fmt$   = v => '$' + Math.round(v).toLocaleString();
  const fmtPct = v => v == null ? '—' : v.toFixed(2) + '%';
  const fmtX   = v => v.toFixed(2) + 'x';
  const fmtSqft= v => v > 0 ? '$' + v.toFixed(2) + '/ft²' : '—';

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function cardRow(label, value, style='') {
    return `<div class="card-row"><span class="card-row-label">${label}</span><span class="card-row-value" style="${style}">${value}</span></div>`;
  }

  // ── CRUD ──────────────────────────────────────────────────
  let idCounter = Date.now();
  function addProperty(data) {
    const idx = state.properties.length % EMOJIS.length;
    state.properties.push({ id: ++idCounter, _emoji: EMOJIS[idx], _color: COLORS[idx], ...data });
    saveState();
  }
  function updateProperty(id, data) {
    const i = state.properties.findIndex(p => p.id === id);
    if (i !== -1) { state.properties[i] = { ...state.properties[i], ...data }; saveState(); }
  }
  function removeProperty(id) {
    state.properties = state.properties.filter(p => p.id !== id);
    saveState();
  }

  function sortedProperties() {
    const calced = state.properties.map(calcProperty);
    const key    = state.sortBy;
    return calced.sort((a, b) => {
      const av = a._calc[key] ?? -Infinity;
      const bv = b._calc[key] ?? -Infinity;
      return (key==='grm'||key==='break_even_ratio') ? av-bv : bv-av;
    });
  }

  // ── Render ────────────────────────────────────────────────
  function render() { renderSummary(); renderCards(); renderCompareTable(); }

  function renderSummary() {
    const el = document.getElementById('summary-bar');
    if (!el) return;
    if (!state.properties.length) { el.innerHTML=''; return; }
    const c = state.properties.map(calcProperty);
    const n = c.length;
    const total_invest = c.reduce((s,p)=>s+p._calc.total_invest,0);
    const total_cf     = c.reduce((s,p)=>s+p._calc.monthly_cf,0);
    const avg_cap      = c.reduce((s,p)=>s+p._calc.cap_rate,0)/n;
    const avg_coc      = c.reduce((s,p)=>s+p._calc.cash_on_cash,0)/n;
    const irrC         = c.filter(p=>p._calc.irr!=null);
    const avg_irr      = irrC.length ? irrC.reduce((s,p)=>s+p._calc.irr,0)/irrC.length : null;
    el.innerHTML = `
      <div class="summary-card"><div class="summary-card-label">Properties</div><div class="summary-card-value">${n}</div><div class="summary-card-sub">in portfolio</div></div>
      <div class="summary-card"><div class="summary-card-label">Total Deployed</div><div class="summary-card-value">${fmt$(total_invest)}</div><div class="summary-card-sub">capital invested</div></div>
      <div class="summary-card"><div class="summary-card-label">Portfolio Cash Flow</div><div class="summary-card-value" style="color:${total_cf>=0?'var(--green)':'var(--red)'}">${fmt$(total_cf)}<span style="font-size:14px;color:var(--text-3)">/mo</span></div><div class="summary-card-sub">combined monthly</div></div>
      <div class="summary-card"><div class="summary-card-label">Avg Cap Rate</div><div class="summary-card-value">${fmtPct(avg_cap)}</div><div class="summary-card-sub">across portfolio</div></div>
      <div class="summary-card"><div class="summary-card-label">Avg Cash-on-Cash</div><div class="summary-card-value">${fmtPct(avg_coc)}</div><div class="summary-card-sub">return on equity</div></div>
      <div class="summary-card"><div class="summary-card-label">Avg IRR</div><div class="summary-card-value">${avg_irr!=null?fmtPct(avg_irr):'—'}</div><div class="summary-card-sub">on exit</div></div>
    `;
  }

  function renderCards() {
    const grid = document.getElementById('properties-grid');
    if (!grid) return;
    const sorted = sortedProperties();
    const bestId = sorted.length ? sorted[0].id : null;
    if (!sorted.length) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏘️</div><h3>No properties yet</h3><p>Click <strong>Add Property</strong> to start comparing.</p></div>`;
      return;
    }
    grid.innerHTML = sorted.map((p, idx) => {
      const c = p._calc;
      const typeLabel = p.property_type==='multi_family' ? `Multi-Family · ${p.units||'?'} units` : 'Single-Family';
      return `
      <article class="property-card ${p.id===bestId?'best-pick':''}" data-id="${p.id}" style="animation-delay:${idx*0.06}s">
        <div class="card-header">
          <div class="card-color-dot" style="background:${p._color}20;color:${p._color}">${p._emoji}</div>
          <div class="card-title-group">
            <div class="card-name">${escHtml(p.name)}</div>
            <div class="card-address">${escHtml(p.address||'—')} <span class="type-badge">${typeLabel}</span></div>
          </div>
          <div class="card-actions">
            <button class="card-btn edit-btn" data-id="${p.id}" title="Edit">✏️</button>
            <button class="card-btn delete delete-btn" data-id="${p.id}" title="Delete">🗑</button>
          </div>
        </div>

        <div class="card-metrics">
          <div class="metric-cell"><div class="metric-label">Cap Rate</div><div class="metric-value ${ratingClass('cap_rate',c.cap_rate)}">${fmtPct(c.cap_rate)}</div></div>
          <div class="metric-cell"><div class="metric-label">Cash-on-Cash</div><div class="metric-value ${ratingClass('cash_on_cash',c.cash_on_cash)}">${fmtPct(c.cash_on_cash)}</div></div>
          <div class="metric-cell"><div class="metric-label">IRR (${p.hold_years}yr)</div><div class="metric-value ${ratingClass('irr',c.irr)}">${c.irr!=null?fmtPct(c.irr):'—'}</div></div>
        </div>

        <div class="card-body">
          <div class="card-tabs">
            <button class="card-tab active" data-card="${p.id}" data-tab="overview">Overview</button>
            <button class="card-tab" data-card="${p.id}" data-tab="financing">Financing</button>
            <button class="card-tab" data-card="${p.id}" data-tab="income">Income & Expenses</button>
            <button class="card-tab" data-card="${p.id}" data-tab="projection">Projection</button>
          </div>

          <div class="card-tab-panel active" data-card="${p.id}" data-panel="overview">
            ${cardRow('Purchase Price',      fmt$(+p.purchase_price))}
            ${cardRow('Price / ft²',         fmtSqft(c.price_per_sqft_calc))}
            ${cardRow('Total Invested',      fmt$(c.total_invest), 'color:var(--gold)')}
            ${cardRow('Monthly Cash Flow',   fmt$(c.monthly_cf),   `color:${c.monthly_cf>=0?'var(--green)':'var(--red)'}`)}
            ${cardRow('NOI / yr',            fmt$(c.noi))}
            ${cardRow('DSCR',                fmtX(c.dscr),         `color:var(--${c.dscr>=1.3?'green':c.dscr>=1?'gold':'red'})`)}
            ${cardRow('GRM',                 c.grm.toFixed(1)+'x')}
            ${cardRow('Break-Even Vacancy',  fmtPct(c.break_even_vacancy), `color:var(--${ratingClass('break_even_vacancy',c.break_even_vacancy)==='good'?'green':ratingClass('break_even_vacancy',c.break_even_vacancy)==='warn'?'gold':'red'})`)}
            ${cardRow('NPV @ 10% hurdle',    fmt$(c.npv_10),       `color:${c.npv_10>=0?'var(--green)':'var(--red)'}`)}
          </div>

          <div class="card-tab-panel" data-card="${p.id}" data-panel="financing">
            ${cardRow('Purchase Price',   fmt$(+p.purchase_price))}
            ${cardRow('Down Payment',     fmt$(c.down)+` (${p.down_payment_pct}%)`)}
            ${cardRow('Loan Amount',      fmt$(c.loan))}
            ${cardRow('LTV',              fmtPct(c.ltv))}
            ${cardRow('Interest Rate',    p.interest_rate+'%')}
            ${cardRow('Loan Term',        p.loan_term+' years')}
            ${cardRow('Loan Type',        (p.loan_type||'conventional').replace(/_/g,' '))}
            ${+p.points ? cardRow('Points',fmt$(c.points_cost)+` (${p.points} pts)`) : ''}
            ${cardRow('Closing Costs',    fmt$(c.closing))}
            ${cardRow('Rehab / Repairs',  fmt$(c.rehab))}
            ${cardRow('Monthly Mortgage', fmt$(c.mortgage)+'/mo', 'color:var(--red)')}
            ${cardRow('Total Cash In',    fmt$(c.total_invest),   'color:var(--gold)')}
          </div>

          <div class="card-tab-panel" data-card="${p.id}" data-panel="income">
            <div class="sub-section-label">Income (annual)</div>
            ${cardRow('Gross Rent',       fmt$(c.gross_annual_rent),   'color:var(--green)')}
            ${cardRow('Vacancy Loss',     '− '+fmt$(c.vacancy_loss),   'color:var(--red)')}
            ${+p.other_income ? cardRow('Other Income', '+ '+fmt$(c.other_income_ann)) : ''}
            ${cardRow('Effective Income', fmt$(c.effective_income),    'color:var(--green);font-weight:600')}
            ${c.rent_per_sqft ? cardRow('Rent / ft²',  fmtSqft(c.rent_per_sqft)+'/mo') : ''}
            <div class="sub-section-label" style="margin-top:10px">Expenses (annual)</div>
            ${cardRow('Property Tax',      fmt$(c.prop_tax))}
            ${cardRow('Insurance',         fmt$(c.insurance))}
            ${cardRow('Maintenance',       fmt$(c.maintenance))}
            ${cardRow('Property Mgmt',     fmt$(c.management))}
            ${c.hoa        ? cardRow('HOA',          fmt$(c.hoa))        : ''}
            ${c.utilities  ? cardRow('Utilities',    fmt$(c.utilities))  : ''}
            ${c.capex      ? cardRow('CapEx Reserve',fmt$(c.capex))      : ''}
            ${c.landscaping? cardRow('Landscaping',  fmt$(c.landscaping)): ''}
            ${c.pest       ? cardRow('Pest Control', fmt$(c.pest))       : ''}
            ${cardRow('Total OpEx / yr',   fmt$(c.total_opex),  'color:var(--red)')}
            ${cardRow('Expense Ratio',     fmtPct(c.expense_ratio), `color:var(--${ratingClass('expense_ratio',c.expense_ratio)==='good'?'green':ratingClass('expense_ratio',c.expense_ratio)==='warn'?'gold':'red'})`)}
            <div class="sub-section-label" style="margin-top:10px">Bottom Line</div>
            ${cardRow('NOI / yr',          fmt$(c.noi))}
            ${cardRow('Debt Service / yr', fmt$(c.annual_mtg),  'color:var(--red)')}
            ${cardRow('Annual Cash Flow',  fmt$(c.annual_cf),   `color:${c.annual_cf>=0?'var(--green)':'var(--red)'}`)}
            ${cardRow('Monthly Cash Flow', fmt$(c.monthly_cf),  `color:${c.monthly_cf>=0?'var(--green)':'var(--red)'}; font-weight:600`)}
            ${cardRow('Break-Even Ratio',  fmtPct(c.break_even_ratio), `color:var(--${ratingClass('break_even_ratio',c.break_even_ratio)==='good'?'green':ratingClass('break_even_ratio',c.break_even_ratio)==='warn'?'gold':'red'})`)}
          </div>

          <div class="card-tab-panel" data-card="${p.id}" data-panel="projection">
            <div class="proj-table-wrap">
              <table class="proj-table">
                <thead><tr><th>Yr</th><th>Cum. CF</th><th>Equity</th><th>Appr.</th><th>Total Return</th></tr></thead>
                <tbody>${c.proj.map(r=>`<tr>
                  <td>${r.year}</td>
                  <td style="color:${r.cumulative_cf>=0?'var(--green)':'var(--red)'}">${fmt$(r.cumulative_cf)}</td>
                  <td>${fmt$(r.equity_paydown)}</td>
                  <td>${fmt$(r.appreciation)}</td>
                  <td style="color:var(--gold);font-weight:600">${fmt$(r.total_return)}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
            <div style="margin-top:14px">
              ${cardRow('IRR ('+p.hold_years+'-yr)', c.irr!=null?fmtPct(c.irr):'—', `color:var(--${ratingClass('irr',c.irr)==='good'?'green':ratingClass('irr',c.irr)==='warn'?'gold':'red'})`)}
              ${cardRow('NPV @ 10%', fmt$(c.npv_10), `color:${c.npv_10>=0?'var(--green)':'var(--red)'}`)}
              ${cardRow('Est. Value (Yr '+p.hold_years+')', fmt$(c.proj[c.proj.length-1].prop_value))}
              ${cardRow('Net Sale Proceeds', fmt$(c.proj[c.proj.length-1].sale_proceeds))}
            </div>
          </div>
        </div>
      </article>`;
    }).join('');

    grid.querySelectorAll('.card-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.card, tab = btn.dataset.tab;
        grid.querySelectorAll(`.card-tab[data-card="${cid}"]`).forEach(b=>b.classList.remove('active'));
        grid.querySelectorAll(`.card-tab-panel[data-card="${cid}"]`).forEach(p=>p.classList.remove('active'));
        btn.classList.add('active');
        grid.querySelector(`.card-tab-panel[data-card="${cid}"][data-panel="${tab}"]`)?.classList.add('active');
      });
    });
    grid.querySelectorAll('.edit-btn').forEach(b=>b.addEventListener('click',()=>openModal(+b.dataset.id)));
    grid.querySelectorAll('.delete-btn').forEach(b=>b.addEventListener('click',()=>{
      if(confirm('Remove this property?')){ removeProperty(+b.dataset.id); render(); }
    }));
  }

  function renderCompareTable() {
    const wrap = document.getElementById('compare-table-wrap');
    const section = document.getElementById('compare-section');
    if (!wrap) return;
    const sorted = sortedProperties();
    if (sorted.length < 2) { section?.classList.add('hidden'); return; }
    section?.classList.remove('hidden');

    function bw(vals, lb=false) {
      const nums = vals.map(v=>v??-Infinity);
      const best=lb?Math.min(...nums):Math.max(...nums), worst=lb?Math.max(...nums):Math.min(...nums);
      return nums.map(v=>v===best?'cell-best':v===worst?'cell-worst':'cell-mid');
    }
    function row(label, fn, fmt, lb=false) {
      const vals=sorted.map(p=>fn(p._calc,p)), cls=bw(vals,lb);
      return `<tr><td class="row-label">${label}</td>${sorted.map((_,i)=>`<td class="${cls[i]}">${vals[i]!=null?fmt(vals[i]):'—'}</td>`).join('')}</tr>`;
    }
    function sr(t){return`<tr class="section-row"><td colspan="${sorted.length+1}">${t}</td></tr>`;}

    wrap.innerHTML=`<table class="compare-table"><thead><tr><th>Metric</th>${sorted.map(p=>`<th style="color:${p._color}">${p._emoji} ${escHtml(p.name)}</th>`).join('')}</tr></thead><tbody>
      ${sr('Property')}
      ${row('Type',           (_,p)=>p.property_type==='multi_family'?'Multi-Family':'Single-Family',v=>v)}
      ${row('Sq Ft',          (_,p)=>+p.sqft||0,             v=>v?v.toLocaleString():'—')}
      ${row('Units',          (_,p)=>+p.units||1,            v=>v)}
      ${row('Price / ft²',    c=>c.price_per_sqft_calc,      v=>fmtSqft(v),true)}
      ${sr('Acquisition')}
      ${row('Purchase Price', (_,p)=>+p.purchase_price,      fmt$,true)}
      ${row('Down Payment',   c=>c.down,                     fmt$)}
      ${row('Loan Amount',    c=>c.loan,                     fmt$,true)}
      ${row('Total Invested', c=>c.total_invest,             fmt$,true)}
      ${row('LTV',            c=>c.ltv,                      fmtPct,true)}
      ${sr('Financing')}
      ${row('Interest Rate',  (_,p)=>+p.interest_rate,       v=>v+'%',true)}
      ${row('Monthly Mortgage',c=>c.mortgage,                fmt$,true)}
      ${row('Annual Debt Svc',c=>c.annual_mtg,               fmt$,true)}
      ${sr('Income & Expenses')}
      ${row('Monthly Rent',   (_,p)=>+p.monthly_rent,        fmt$)}
      ${row('Vacancy Rate',   (_,p)=>+p.vacancy_rate,        v=>v+'%',true)}
      ${row('Eff. Income/yr', c=>c.effective_income,         fmt$)}
      ${row('Total OpEx/yr',  c=>c.total_opex,               fmt$,true)}
      ${row('Expense Ratio',  c=>c.expense_ratio,            fmtPct,true)}
      ${row('NOI / yr',       c=>c.noi,                      fmt$)}
      ${sr('Returns')}
      ${row('Monthly CF',     c=>c.monthly_cf,               fmt$)}
      ${row('Cap Rate',       c=>c.cap_rate,                 fmtPct)}
      ${row('Cash-on-Cash',   c=>c.cash_on_cash,             fmtPct)}
      ${row('GRM',            c=>c.grm,                      v=>v.toFixed(1)+'x',true)}
      ${row('DSCR',           c=>c.dscr,                     fmtX)}
      ${row('IRR',            c=>c.irr,                      fmtPct)}
      ${row('NPV @ 10%',      c=>c.npv_10,                   fmt$)}
      ${sr('Risk / Break-Even')}
      ${row('Break-Even Ratio',   c=>c.break_even_ratio,     fmtPct,true)}
      ${row('Break-Even Vacancy', c=>c.break_even_vacancy,   fmtPct)}
      ${sr('Projection (hold period)')}
      ${row('Cum. Cash Flow',  c=>c.proj[c.proj.length-1].cumulative_cf,  fmt$)}
      ${row('Equity Paydown',  c=>c.proj[c.proj.length-1].equity_paydown, fmt$)}
      ${row('Appreciation',    c=>c.proj[c.proj.length-1].appreciation,   fmt$)}
      ${row('Total Return',    c=>c.proj[c.proj.length-1].total_return,   fmt$)}
      ${row('Net Sale Proceeds',c=>c.proj[c.proj.length-1].sale_proceeds, fmt$)}
    </tbody></table>`;
  }

  // ── Modal ─────────────────────────────────────────────────
  const ALL_FIELDS = [
    'property_type','name','address','sqft','price_per_sqft','units',
    'purchase_price','down_payment_pct','interest_rate','loan_term','loan_type','points',
    'closing_costs','rehab_costs',
    'monthly_rent','vacancy_rate','other_income','rent_growth',
    'property_tax','insurance','maintenance','management_pct',
    'hoa','utilities','capex_reserve','landscaping','pest_control',
    'appreciation_rate','hold_years',
  ];

  function openModal(id=null) {
    state.editingId = id;
    document.getElementById('modal-title').textContent = id ? 'Edit Property' : 'Add Property';
    if (id) {
      const p = state.properties.find(p=>p.id===id);
      if (p) { fillForm(p); }
    } else {
      document.getElementById('prop-form').reset();
      toggleTypeFields('single_family');
    }
    document.getElementById('modal-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
    state.editingId = null;
  }

  function fillForm(p) {
    ALL_FIELDS.forEach(f => {
      const el = document.getElementById('f-'+f);
      if (el && p[f] !== undefined) el.value = p[f];
    });
    toggleTypeFields(p.property_type || 'single_family');
  }

  function getFormData() {
    const textFields = ['property_type','name','address','loan_type'];
    const data = {};
    ALL_FIELDS.forEach(f => {
      const el = document.getElementById('f-'+f);
      if (!el) return;
      data[f] = textFields.includes(f) ? el.value.trim() : (+el.value||0);
    });
    return data;
  }

  function toggleTypeFields(type) {
    document.getElementById('mf-fields')?.style.setProperty('display', type==='multi_family'?'':'none');
    document.getElementById('sf-fields')?.style.setProperty('display', type==='single_family'?'':'none');
  }

  function init() {
    loadState();

    document.getElementById('btn-add')?.addEventListener('click', ()=>openModal());
    document.getElementById('modal-overlay')?.addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal(); });
    document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

    document.getElementById('f-property_type')?.addEventListener('change', e=>toggleTypeFields(e.target.value));

    // Auto-calc price/sqft
    ['f-purchase_price','f-sqft'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const price = +document.getElementById('f-purchase_price')?.value||0;
        const sqft  = +document.getElementById('f-sqft')?.value||0;
        const el    = document.getElementById('f-price_per_sqft');
        if (el && price && sqft) el.value = (price/sqft).toFixed(2);
      });
    });

    document.getElementById('btn-save')?.addEventListener('click', ()=>{
      const data = getFormData();
      if (!data.name || !data.purchase_price || !data.monthly_rent) {
        alert('Please fill in Name, Purchase Price, and Monthly Rent.'); return;
      }
      state.editingId ? updateProperty(state.editingId, data) : addProperty(data);
      closeModal(); render();
    });

    document.getElementById('sort-select')?.addEventListener('change', e=>{ state.sortBy=e.target.value; render(); });
    document.getElementById('btn-clear')?.addEventListener('click', ()=>{
      if(confirm('Clear all properties?')){ state.properties=[]; saveState(); render(); }
    });

    render();
  }

  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',init) : init();
})();
