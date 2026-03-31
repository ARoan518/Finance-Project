/* =========================================================
   PropCompare · main.js
   Rental Property Investment Comparison Tool
   ========================================================= */

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  const STORAGE_KEY = 'propcompare_v1';
  const EMOJIS = ['🏠','🏡','🏘️','🏗️','🏢','🏬','🏙️','🏚️'];
  const COLORS = [
    '#d4a847','#3ecf8e','#f06565','#6e8efb',
    '#f0a265','#a06efb','#65c8f0','#f065b8'
  ];

  let state = {
    properties: [],
    editingId: null,
    sortBy: 'cap_rate',
  };

  // ── Load / Save ─────────────────────────────────────────
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.properties = JSON.parse(raw);
    } catch (e) { state.properties = []; }
    if (!state.properties.length) seedData();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.properties));
  }

  function seedData() {
    const defaults = [
      {
        name: 'Maple Street Duplex',
        address: '1204 Maple St, Austin TX',
        purchase_price: 425000,
        down_payment_pct: 20,
        interest_rate: 6.75,
        loan_term: 30,
        monthly_rent: 3600,
        vacancy_rate: 5,
        other_income: 0,
        property_tax: 5100,
        insurance: 1800,
        maintenance: 2400,
        management_pct: 8,
        hoa: 0,
        utilities: 0,
        closing_costs: 8500,
        rehab_costs: 15000,
        appreciation_rate: 3,
      },
      {
        name: 'Riverside Condo',
        address: '88 River View Dr, Nashville TN',
        purchase_price: 285000,
        down_payment_pct: 25,
        interest_rate: 6.5,
        loan_term: 30,
        monthly_rent: 2200,
        vacancy_rate: 6,
        other_income: 50,
        property_tax: 3200,
        insurance: 1100,
        maintenance: 1200,
        management_pct: 10,
        hoa: 3600,
        utilities: 0,
        closing_costs: 5700,
        rehab_costs: 5000,
        appreciation_rate: 2.5,
      },
    ];
    defaults.forEach(addProperty);
  }

  // ── Calculations ─────────────────────────────────────────
  function calcProperty(p) {
    const price        = +p.purchase_price;
    const downPct      = +p.down_payment_pct / 100;
    const down         = price * downPct;
    const loan         = price - down;
    const rate         = +p.interest_rate / 100 / 12;
    const n            = +p.loan_term * 12;
    const closing      = +p.closing_costs || 0;
    const rehab        = +p.rehab_costs   || 0;
    const total_invest = down + closing + rehab;

    // Mortgage payment
    let mortgage = 0;
    if (rate > 0) {
      mortgage = loan * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
    } else {
      mortgage = loan / n;
    }

    const gross_annual_rent = +p.monthly_rent * 12;
    const vacancy_loss      = gross_annual_rent * (+p.vacancy_rate / 100);
    const other_income      = +p.other_income * 12;
    const effective_income  = gross_annual_rent - vacancy_loss + other_income;

    const prop_tax     = +p.property_tax;
    const insurance    = +p.insurance;
    const maintenance  = +p.maintenance;
    const management   = effective_income * (+p.management_pct / 100);
    const hoa          = +p.hoa;
    const utilities    = +p.utilities;
    const total_opex   = prop_tax + insurance + maintenance + management + hoa + utilities;

    const noi          = effective_income - total_opex;
    const annual_mtg   = mortgage * 12;
    const annual_cf    = noi - annual_mtg;
    const monthly_cf   = annual_cf / 12;

    const cap_rate     = price > 0 ? (noi / price) * 100 : 0;
    const cash_on_cash = total_invest > 0 ? (annual_cf / total_invest) * 100 : 0;
    const grm          = +p.monthly_rent > 0 ? price / (+p.monthly_rent * 12) : 0;
    const dscr         = annual_mtg > 0 ? noi / annual_mtg : 0;
    const ltv          = price > 0 ? (loan / price) * 100 : 0;
    const break_even   = effective_income > 0
      ? ((total_opex + annual_mtg) / effective_income) * 100
      : 0;

    // 5-year projection
    const proj = [];
    let equity = down;
    let balance = loan;
    for (let y = 1; y <= 5; y++) {
      const appreciation = price * Math.pow(1 + +p.appreciation_rate / 100, y) - price;
      const cf_cum = annual_cf * y;
      // rough principal paydown
      let ppd = 0;
      for (let m = 0; m < 12; m++) {
        const interest = balance * rate;
        const principal = mortgage - interest;
        ppd += principal;
        balance -= principal;
      }
      equity += ppd;
      proj.push({
        year: y,
        cashflow: cf_cum,
        equity_paydown: equity - down,
        appreciation: appreciation,
        total_return: cf_cum + (equity - down) + appreciation,
      });
    }

    return {
      ...p,
      _calc: {
        down, loan, mortgage, total_invest,
        gross_annual_rent, vacancy_loss, effective_income, other_income,
        prop_tax, insurance, maintenance, management, hoa, utilities,
        total_opex, noi, annual_mtg, annual_cf, monthly_cf,
        cap_rate, cash_on_cash, grm, dscr, ltv, break_even,
        proj,
      }
    };
  }

  function ratingClass(key, value) {
    const rules = {
      cap_rate:     [v => v >= 7, v => v >= 5],
      cash_on_cash: [v => v >= 8, v => v >= 5],
      dscr:         [v => v >= 1.3, v => v >= 1.0],
      monthly_cf:   [v => v >= 300, v => v >= 0],
      grm:          [v => v <= 10, v => v <= 15],
      break_even:   [v => v <= 75, v => v <= 90],
    };
    const r = rules[key];
    if (!r) return 'neutral';
    if (r[0](value)) return 'good';
    if (r[1](value)) return 'warn';
    return 'bad';
  }

  function fmt$(v)  { return '$' + Math.round(v).toLocaleString(); }
  function fmtPct(v){ return v.toFixed(2) + '%'; }
  function fmtX(v)  { return v.toFixed(2) + 'x'; }

  // ── Property CRUD ─────────────────────────────────────────
  let idCounter = Date.now();

  function addProperty(data) {
    const idx = state.properties.length % EMOJIS.length;
    const p = {
      id: ++idCounter,
      _emoji: EMOJIS[idx],
      _color: COLORS[idx],
      ...data,
    };
    state.properties.push(p);
    saveState();
  }

  function updateProperty(id, data) {
    const i = state.properties.findIndex(p => p.id === id);
    if (i === -1) return;
    state.properties[i] = { ...state.properties[i], ...data };
    saveState();
  }

  function removeProperty(id) {
    state.properties = state.properties.filter(p => p.id !== id);
    saveState();
  }

  // ── Sort ─────────────────────────────────────────────────
  function sortedProperties() {
    const calced = state.properties.map(calcProperty);
    const key = state.sortBy;
    return calced.sort((a, b) => {
      const av = a._calc[key] ?? 0;
      const bv = b._calc[key] ?? 0;
      if (key === 'grm') return av - bv; // lower is better
      return bv - av;
    });
  }

  // ── Render ────────────────────────────────────────────────
  function render() {
    renderSummary();
    renderCards();
    renderCompareTable();
  }

  function renderSummary() {
    const el = document.getElementById('summary-bar');
    if (!el) return;

    if (!state.properties.length) { el.innerHTML = ''; return; }

    const calced = state.properties.map(calcProperty);
    const total_deployed = calced.reduce((s, p) => s + p._calc.total_invest, 0);
    const total_cf = calced.reduce((s, p) => s + p._calc.monthly_cf, 0);
    const avg_cap = calced.reduce((s, p) => s + p._calc.cap_rate, 0) / calced.length;
    const avg_coc = calced.reduce((s, p) => s + p._calc.cash_on_cash, 0) / calced.length;

    el.innerHTML = `
      <div class="summary-card">
        <div class="summary-card-label">Properties</div>
        <div class="summary-card-value">${state.properties.length}</div>
        <div class="summary-card-sub">in portfolio</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Total Deployed</div>
        <div class="summary-card-value">${fmt$(total_deployed)}</div>
        <div class="summary-card-sub">capital invested</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Portfolio Cash Flow</div>
        <div class="summary-card-value" style="color:${total_cf >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt$(total_cf)}<span style="font-size:16px;color:var(--text-3)">/mo</span></div>
        <div class="summary-card-sub">combined monthly</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Avg Cap Rate</div>
        <div class="summary-card-value">${fmtPct(avg_cap)}</div>
        <div class="summary-card-sub">across portfolio</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Avg Cash-on-Cash</div>
        <div class="summary-card-value">${fmtPct(avg_coc)}</div>
        <div class="summary-card-sub">return on equity</div>
      </div>
    `;
  }

  function renderCards() {
    const grid = document.getElementById('properties-grid');
    if (!grid) return;

    const sorted = sortedProperties();
    const bestId = sorted.length ? sorted[0].id : null;

    if (!sorted.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏘️</div>
          <h3>No properties yet</h3>
          <p>Click <strong>Add Property</strong> to start comparing investments.</p>
        </div>`;
      return;
    }

    grid.innerHTML = sorted.map((p, idx) => {
      const c = p._calc;
      const isBest = p.id === bestId;
      const animDelay = idx * 0.06;

      return `
      <article class="property-card ${isBest ? 'best-pick' : ''}" data-id="${p.id}" style="animation-delay:${animDelay}s">
        <div class="card-header">
          <div class="card-color-dot" style="background:${p._color}20;color:${p._color}">${p._emoji}</div>
          <div class="card-title-group">
            <div class="card-name">${escHtml(p.name)}</div>
            <div class="card-address">${escHtml(p.address || '—')}</div>
          </div>
          <div class="card-actions">
            <button class="card-btn edit-btn" data-id="${p.id}" title="Edit">✏️</button>
            <button class="card-btn delete delete-btn" data-id="${p.id}" title="Delete">🗑</button>
          </div>
        </div>

        <div class="card-metrics">
          <div class="metric-cell">
            <div class="metric-label">Cap Rate</div>
            <div class="metric-value ${ratingClass('cap_rate', c.cap_rate)}">${fmtPct(c.cap_rate)}</div>
          </div>
          <div class="metric-cell">
            <div class="metric-label">Cash-on-Cash</div>
            <div class="metric-value ${ratingClass('cash_on_cash', c.cash_on_cash)}">${fmtPct(c.cash_on_cash)}</div>
          </div>
          <div class="metric-cell">
            <div class="metric-label">Monthly CF</div>
            <div class="metric-value ${ratingClass('monthly_cf', c.monthly_cf)}">${fmt$(c.monthly_cf)}</div>
          </div>
        </div>

        <div class="card-body">
          <div class="card-row">
            <span class="card-row-label">Purchase Price</span>
            <span class="card-row-value">${fmt$(p.purchase_price)}</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">Total Invested</span>
            <span class="card-row-value">${fmt$(c.total_invest)}</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">Mortgage</span>
            <span class="card-row-value expense">${fmt$(c.mortgage)}/mo</span>
          </div>

          <div class="card-divider"></div>

          <div class="card-row">
            <span class="card-row-label">Gross Rent</span>
            <span class="card-row-value income">${fmt$(p.monthly_rent)}/mo</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">Eff. Gross Income</span>
            <span class="card-row-value income">${fmt$(c.effective_income / 12)}/mo</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">Operating Expenses</span>
            <span class="card-row-value expense">${fmt$(c.total_opex / 12)}/mo</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">NOI</span>
            <span class="card-row-value">${fmt$(c.noi / 12)}/mo</span>
          </div>

          <div class="card-divider"></div>

          <div class="card-row">
            <span class="card-row-label">GRM</span>
            <span class="card-row-value ${ratingClass('grm', c.grm)}">${c.grm.toFixed(1)}x</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">DSCR</span>
            <span class="card-row-value ${ratingClass('dscr', c.dscr)}">${fmtX(c.dscr)}</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">Break-Even Ratio</span>
            <span class="card-row-value ${ratingClass('break_even', c.break_even)}">${fmtPct(c.break_even)}</span>
          </div>

          <div class="card-divider"></div>

          <div class="card-row">
            <span class="card-row-label">5-Year Total Return</span>
            <span class="card-row-value cashflow">${fmt$(c.proj[4].total_return)}</span>
          </div>
        </div>
      </article>`;
    }).join('');

    // Attach events
    grid.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openModal(+btn.dataset.id));
    });
    grid.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Remove this property?')) {
          removeProperty(+btn.dataset.id);
          render();
        }
      });
    });
  }

  function renderCompareTable() {
    const wrap = document.getElementById('compare-table-wrap');
    if (!wrap) return;
    const section = document.getElementById('compare-section');

    const sorted = sortedProperties();
    if (sorted.length < 2) {
      if (section) section.classList.add('hidden');
      return;
    }
    if (section) section.classList.remove('hidden');

    const names = sorted.map(p => `
      <th style="color:${p._color}">
        ${p._emoji} ${escHtml(p.name)}
      </th>`).join('');

    function bestWorst(key, arr, lowerIsBetter = false) {
      const vals = arr.map(p => p._calc[key]);
      const best = lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
      const worst = lowerIsBetter ? Math.max(...vals) : Math.min(...vals);
      return arr.map(p => {
        const v = p._calc[key];
        if (v === best) return 'cell-best';
        if (v === worst) return 'cell-worst';
        return 'cell-mid';
      });
    }

    function row(label, fn, format, lowerIsBetter = false) {
      const classes = bestWorst(null, sorted, lowerIsBetter);
      const vals = sorted.map(p => fn(p._calc));
      const best = lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
      const worst = lowerIsBetter ? Math.max(...vals) : Math.min(...vals);
      const cells = sorted.map((p, i) => {
        const v = fn(p._calc);
        const cls = v === best ? 'cell-best' : v === worst ? 'cell-worst' : 'cell-mid';
        return `<td class="${cls}">${format(v)}</td>`;
      }).join('');
      return `<tr><td class="row-label">${label}</td>${cells}</tr>`;
    }

    function sectionRow(title) {
      return `<tr class="section-row"><td colspan="${sorted.length + 1}">${title}</td></tr>`;
    }

    const html = `
      <table class="compare-table">
        <thead>
          <tr>
            <th>Metric</th>
            ${names}
          </tr>
        </thead>
        <tbody>
          ${sectionRow('Acquisition')}
          ${row('Purchase Price',  c => c.purchase_price || 0, fmt$, true)}
          ${row('Down Payment',    c => c.down,          fmt$)}
          ${row('Total Invested',  c => c.total_invest,  fmt$, true)}
          ${row('LTV',             c => c.ltv,           fmtPct, true)}

          ${sectionRow('Income & Expenses')}
          ${row('Monthly Rent',    c => +state.properties.find(p=>p.id===sorted.find(s=>s._calc===c)?.id)?._calc?.gross_annual_rent/12 || c.gross_annual_rent/12, fmt$)}
          ${row('Eff. Gross Income / yr', c => c.effective_income, fmt$)}
          ${row('Total OpEx / yr', c => c.total_opex, fmt$, true)}
          ${row('Mortgage / mo',   c => c.mortgage, fmt$, true)}
          ${row('NOI / yr',        c => c.noi, fmt$)}

          ${sectionRow('Returns')}
          ${row('Cap Rate',        c => c.cap_rate,      fmtPct)}
          ${row('Cash-on-Cash',    c => c.cash_on_cash,  fmtPct)}
          ${row('Monthly Cash Flow', c => c.monthly_cf,  fmt$)}
          ${row('GRM',             c => c.grm,           v => v.toFixed(1)+'x', true)}
          ${row('DSCR',            c => c.dscr,          fmtX)}
          ${row('Break-Even Ratio',c => c.break_even,    fmtPct, true)}

          ${sectionRow('5-Year Projection')}
          ${row('Total Cash Flow', c => c.proj[4].cashflow,      fmt$)}
          ${row('Equity Paydown',  c => c.proj[4].equity_paydown, fmt$)}
          ${row('Appreciation',    c => c.proj[4].appreciation,  fmt$)}
          ${row('Total Return',    c => c.proj[4].total_return,  fmt$)}
        </tbody>
      </table>`;

    wrap.innerHTML = html;
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal(id = null) {
    state.editingId = id;
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');

    if (id) {
      const p = state.properties.find(p => p.id === id);
      if (!p) return;
      title.textContent = 'Edit Property';
      fillForm(p);
    } else {
      title.textContent = 'Add Property';
      document.getElementById('prop-form').reset();
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
    state.editingId = null;
  }

  function fillForm(p) {
    const fields = [
      'name','address','purchase_price','down_payment_pct','interest_rate','loan_term',
      'monthly_rent','vacancy_rate','other_income',
      'property_tax','insurance','maintenance','management_pct','hoa','utilities',
      'closing_costs','rehab_costs','appreciation_rate',
    ];
    fields.forEach(f => {
      const el = document.getElementById('f-' + f);
      if (el && p[f] !== undefined) el.value = p[f];
    });
  }

  function getFormData() {
    const fields = [
      'name','address',
      'purchase_price','down_payment_pct','interest_rate','loan_term',
      'monthly_rent','vacancy_rate','other_income',
      'property_tax','insurance','maintenance','management_pct','hoa','utilities',
      'closing_costs','rehab_costs','appreciation_rate',
    ];
    const data = {};
    fields.forEach(f => {
      const el = document.getElementById('f-' + f);
      if (!el) return;
      data[f] = el.type === 'text' || f === 'name' || f === 'address'
        ? el.value.trim()
        : +el.value || 0;
    });
    return data;
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    loadState();

    // Add Property button
    document.getElementById('btn-add')?.addEventListener('click', () => openModal());

    // Close modal
    document.getElementById('modal-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel')?.addEventListener('click', closeModal);

    // Save
    document.getElementById('btn-save')?.addEventListener('click', () => {
      const data = getFormData();
      if (!data.name || !data.purchase_price || !data.monthly_rent) {
        alert('Please fill in Name, Purchase Price, and Monthly Rent.');
        return;
      }
      if (state.editingId) {
        updateProperty(state.editingId, data);
      } else {
        addProperty(data);
      }
      closeModal();
      render();
    });

    // Sort
    document.getElementById('sort-select')?.addEventListener('change', e => {
      state.sortBy = e.target.value;
      render();
    });

    // Clear all
    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (confirm('Clear all properties? This cannot be undone.')) {
        state.properties = [];
        saveState();
        render();
      }
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    render();
  }

  // ── Utils ─────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
