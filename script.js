/**
 * script.js  -  Bank Marketing Dashboard
 * =========================================
 * Loads bank_data.json via fetch(), decodes rows, populates
 * filter dropdowns, renders KPI cards and 7 Chart.js charts.
 *
 * Section overview:
 *   1. CONFIG  - colors, currency formatter, filter column list
 *   2. STATE   - shared mutable state (data, charts, filter values)
 *   3. LOAD    - fetch + decode helpers
 *   4. FILTERS - populate selects + change handlers
 *   5. FILTER  - apply filters to full row array
 *   6. KPIs    - compute & render KPI cards
 *   7. CHARTS  - five filter-aware charts
 *   8. TRADEOFF - slider-driven profit / precision-recall charts
 *   9. INIT    - entry point
 */

"use strict";

/* ══════════════════════════════════════════════════════════════
   1. CONFIG
══════════════════════════════════════════════════════════════ */
const CONFIG = {
  /* Colour palette  (indigo / teal) */
  colors: {
    indigo:      "#6366f1",
    indigoDark:  "#4f46e5",
    teal:        "#14b8a6",
    tealDark:    "#0d9488",
    slate:       "#94a3b8",
    slateDark:   "#64748b",
    amber:       "#f59e0b",
    rose:        "#f43f5e",
    barAlpha:    "rgba(99,102,241,0.75)",
    barAlpha2:   "rgba(20,184,166,0.75)",
  },

  /* Currency formatter (IDR) */
  currency: new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }),

  /* Columns that become filter dropdowns and their Indonesian labels */
  filterCols: [
    { col: "job",      elementId: "f-job",      label: "Pekerjaan" },
    { col: "housing",  elementId: "f-housing",  label: "KPR" },
    { col: "loan",     elementId: "f-loan",     label: "Pinjaman Pribadi" },
    { col: "default",  elementId: "f-default",  label: "Gagal Bayar" },
    { col: "contact",  elementId: "f-contact",  label: "Metode Kontak" },
    { col: "month",    elementId: "f-month",    label: "Bulan" },
    { col: "poutcome", elementId: "f-poutcome", label: "Hasil Kampanye Lalu" },
  ],

  /* Ordered months for consistent axis */
  monthOrder: ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"],
  monthLabel: {
    jan:"Jan", feb:"Feb", mar:"Mar", apr:"Apr", may:"Mei", jun:"Jun",
    jul:"Jul", aug:"Agu", sep:"Sep", oct:"Okt", nov:"Nov", dec:"Des",
  },

  /* Balance band order */
  balanceBands: ["<0","0","1-500","501-1500","1501-5000",">5000"],

  /* Call band order */
  callBands: ["1-9","10+"],

  /* Trade-off slider defaults */
  tradeoff: {
    costPerCall:   25000,
    revPerSub:     500000,
    callsPerCust:  2,
  },
};

/* ══════════════════════════════════════════════════════════════
   2. STATE
══════════════════════════════════════════════════════════════ */
const STATE = {
  fullData:       null,   // decoded flat objects
  filteredData:   null,
  labels:         null,   // inv_labels from JSON
  colOrder:       null,
  thresholdCurve: null,
  validation:     null,
  charts:         {},     // chart instances keyed by id
  filters:        {},     // { col: value | "" }
  tradeoff: {
    cost: CONFIG.tradeoff.costPerCall,
    rev:  CONFIG.tradeoff.revPerSub,
    cpn:  CONFIG.tradeoff.callsPerCust,
  },
};

/* ══════════════════════════════════════════════════════════════
   3. LOAD & DECODE
══════════════════════════════════════════════════════════════ */

/**
 * Decode a compact encoded row array into a plain object.
 * col_order tells us which position maps to which column.
 * For categorical columns, labels[col][idx] → string value.
 */
function decodeRow(arr, colOrder, labels) {
  const obj = {};
  for (let i = 0; i < colOrder.length; i++) {
    const col = colOrder[i];
    const val = arr[i];
    if (labels[col]) {
      obj[col] = labels[col][String(val)] ?? String(val);
    } else {
      obj[col] = val;  // numeric as-is
    }
  }
  return obj;
}

async function loadData() {
  const resp = await fetch("bank_data.json");
  if (!resp.ok) throw new Error(`Gagal memuat bank_data.json: ${resp.status}`);
  const json = await resp.json();

  STATE.labels         = json.labels;
  STATE.colOrder       = json.col_order;
  STATE.thresholdCurve = json.threshold_curve;
  STATE.validation     = json.validation;

  // Decode all rows
  STATE.fullData = json.rows.map(r => decodeRow(r, json.col_order, json.labels));
  STATE.filteredData = STATE.fullData;
}

/* ══════════════════════════════════════════════════════════════
   4. FILTERS - populate & wire up
══════════════════════════════════════════════════════════════ */

function getUniqueValues(col) {
  const set = new Set(STATE.fullData.map(r => r[col]));
  return [...set].sort();
}

function populateFilters() {
  for (const { col, elementId } of CONFIG.filterCols) {
    const el = document.getElementById(elementId);
    if (!el) continue;
    STATE.filters[col] = "";
    const vals = getUniqueValues(col);
    vals.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = translateValue(col, v);
      el.appendChild(opt);
    });
    el.addEventListener("change", () => {
      STATE.filters[col] = el.value;
      applyFiltersAndRedraw();
    });
  }

  document.getElementById("btn-reset").addEventListener("click", resetFilters);
}

/** Translate raw values to Indonesian display text */
function translateValue(col, v) {
  const maps = {
    housing:  { yes: "Ya", no: "Tidak" },
    loan:     { yes: "Ya", no: "Tidak" },
    default:  { yes: "Ya (Gagal Bayar)", no: "Tidak" },
    contact:  { cellular: "Ponsel", telephone: "Telepon Rumah", unknown: "Tidak Diketahui" },
    poutcome: { success: "Sukses", failure: "Gagal", other: "Lainnya", unknown: "Tidak Diketahui" },
    month:    CONFIG.monthLabel,
  };
  if (maps[col] && maps[col][v]) return maps[col][v];
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function resetFilters() {
  for (const { col, elementId } of CONFIG.filterCols) {
    STATE.filters[col] = "";
    const el = document.getElementById(elementId);
    if (el) el.value = "";
  }
  applyFiltersAndRedraw();
}

/* ══════════════════════════════════════════════════════════════
   5. APPLY FILTERS
══════════════════════════════════════════════════════════════ */
function applyFilters() {
  STATE.filteredData = STATE.fullData.filter(row => {
    for (const { col } of CONFIG.filterCols) {
      const fv = STATE.filters[col];
      if (fv && row[col] !== fv) return false;
    }
    return true;
  });
}

function applyFiltersAndRedraw() {
  applyFilters();
  renderKPIs();
  renderFilterCharts();
}

/* ══════════════════════════════════════════════════════════════
   6. KPIs
══════════════════════════════════════════════════════════════ */
function renderKPIs() {
  const rows = STATE.filteredData;
  const total = rows.length;
  const subs  = rows.filter(r => r.y === "yes").length;
  const conv  = total > 0 ? subs / total : 0;
  const totalCalls = rows.reduce((s, r) => s + r.campaign, 0);
  const cps  = subs > 0 ? (totalCalls / subs) : 0;

  document.getElementById("kpi-total").textContent = total.toLocaleString("id-ID");
  document.getElementById("kpi-conv").textContent  = (conv * 100).toFixed(1) + "%";
  document.getElementById("kpi-subs").textContent  = subs.toLocaleString("id-ID");
  document.getElementById("kpi-cps").textContent   = cps.toFixed(1) + "×";
}

/* ══════════════════════════════════════════════════════════════
   7. FILTER-AWARE CHARTS  helpers
══════════════════════════════════════════════════════════════ */

/**
 * Group rows by a column, returning { label, yes, no, total } array.
 * Optionally enforces a custom key order.
 */
function groupBy(rows, col, order) {
  const map = {};
  rows.forEach(r => {
    const k = r[col] ?? "?";
    if (!map[k]) map[k] = { yes: 0, no: 0 };
    if (r.y === "yes") map[k].yes++;
    else               map[k].no++;
  });
  const keys = order
    ? order.filter(k => map[k])
    : Object.keys(map).sort();
  return keys.map(k => ({
    label: k,
    yes:   map[k]?.yes ?? 0,
    no:    map[k]?.no  ?? 0,
    total: (map[k]?.yes ?? 0) + (map[k]?.no ?? 0),
  }));
}

/** Create or update a Chart.js instance. */
function upsertChart(id, config) {
  if (STATE.charts[id]) {
    STATE.charts[id].destroy();
  }
  const ctx = document.getElementById(id);
  STATE.charts[id] = new Chart(ctx, config);
}

/** Default tooltip that shows count. */
function convTooltip(label, yes, total) {
  const pct = total > 0 ? ((yes / total) * 100).toFixed(1) : "0.0";
  return `${label}: ${pct}% konversi (${yes.toLocaleString("id-ID")} dari ${total.toLocaleString("id-ID")} nasabah)`;
}

/* ── 7a. Konversi per Bulan ─────────────────────────────── */
function renderChartMonth() {
  const groups = groupBy(STATE.filteredData, "month", CONFIG.monthOrder);
  upsertChart("chart-month", {
    type: "bar",
    data: {
      labels: groups.map(g => CONFIG.monthLabel[g.label] ?? g.label),
      datasets: [{
        label: "Tingkat Konversi (%)",
        data: groups.map(g => g.total > 0 ? +((g.yes / g.total) * 100).toFixed(2) : 0),
        backgroundColor: CONFIG.colors.barAlpha,
        borderColor:     CONFIG.colors.indigo,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const g = groups[ctx.dataIndex];
              return convTooltip(CONFIG.monthLabel[g.label] ?? g.label, g.yes, g.total);
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + "%" } },
        x: { grid: { display: false } },
      },
    },
  });
}

/* ── 7b. Konversi per Jumlah Panggilan ──────────────────── */
function renderChartContacts() {
  const groups = groupBy(STATE.filteredData, "call_band", CONFIG.callBands);
  upsertChart("chart-contacts", {
    type: "bar",
    data: {
      labels: groups.map(g => g.label + " panggilan"),
      datasets: [{
        label: "Tingkat Konversi (%)",
        data: groups.map(g => g.total > 0 ? +((g.yes / g.total) * 100).toFixed(2) : 0),
        backgroundColor: CONFIG.colors.barAlpha2,
        borderColor:     CONFIG.colors.teal,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const g = groups[ctx.dataIndex];
              return convTooltip(g.label + " panggilan", g.yes, g.total);
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + "%" } },
        x: { grid: { display: false } },
      },
    },
  });
}

/* ── 7c. Konversi per Saldo ─────────────────────────────── */
function renderChartBalance() {
  const groups = groupBy(STATE.filteredData, "balance_band", CONFIG.balanceBands);
  upsertChart("chart-balance", {
    type: "bar",
    data: {
      labels: groups.map(g => g.label),
      datasets: [{
        label: "Tingkat Konversi (%)",
        data: groups.map(g => g.total > 0 ? +((g.yes / g.total) * 100).toFixed(2) : 0),
        backgroundColor: "rgba(79,70,229,0.70)",
        borderColor:     CONFIG.colors.indigoDark,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const g = groups[ctx.dataIndex];
              return convTooltip("Saldo " + g.label, g.yes, g.total);
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + "%" } },
        x: { grid: { display: false } },
      },
    },
  });
}

/* ── 7d. Konversi per Pekerjaan (horizontal) ─────────────── */
function renderChartJob() {
  const groups = groupBy(STATE.filteredData, "job");
  // Sort descending by conversion rate
  groups.sort((a, b) => {
    const ra = a.total > 0 ? a.yes / a.total : 0;
    const rb = b.total > 0 ? b.yes / b.total : 0;
    return rb - ra;
  });
  upsertChart("chart-job", {
    type: "bar",
    data: {
      labels: groups.map(g => g.label.charAt(0).toUpperCase() + g.label.slice(1)),
      datasets: [{
        label: "Tingkat Konversi (%)",
        data: groups.map(g => g.total > 0 ? +((g.yes / g.total) * 100).toFixed(2) : 0),
        backgroundColor: groups.map((_, i) =>
          `hsla(${243 + i * 12}, 70%, 60%, 0.80)`
        ),
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const g = groups[ctx.dataIndex];
              return convTooltip(g.label, g.yes, g.total);
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => v + "%" } },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ── 7e. Konversi per Hasil Kampanye Lalu ───────────────── */
function renderChartPoutcome() {
  const order = ["success","failure","other","unknown"];
  const groups = groupBy(STATE.filteredData, "poutcome", order);
  const labelMap = {
    success: "Sukses", failure: "Gagal", other: "Lainnya", unknown: "Tidak Diketahui",
  };
  upsertChart("chart-poutcome", {
    type: "doughnut",
    data: {
      labels: groups.map(g => labelMap[g.label] ?? g.label),
      datasets: [{
        data: groups.map(g => g.yes),
        backgroundColor: [
          CONFIG.colors.teal, CONFIG.colors.rose, CONFIG.colors.amber, CONFIG.colors.slate,
        ],
        borderWidth: 2,
        borderColor: "#fff",
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const g = groups[ctx.dataIndex];
              const pct = g.total > 0 ? ((g.yes / g.total) * 100).toFixed(1) : "0.0";
              return `${ctx.label}: ${g.yes.toLocaleString("id-ID")} berlangganan (${pct}% konversi dari ${g.total.toLocaleString("id-ID")})`;
            },
          },
        },
      },
    },
  });
}

function renderFilterCharts() {
  renderChartMonth();
  renderChartContacts();
  renderChartBalance();
  renderChartJob();
  renderChartPoutcome();
}

/* ══════════════════════════════════════════════════════════════
   8. TRADE-OFF SECTION
══════════════════════════════════════════════════════════════ */

/**
 * For each threshold point in the curve, compute:
 *   profit = tp * rev - contacted * callsPerCust * costPerCall
 */
function computeProfitCurve(cost, rev, cpn) {
  return STATE.thresholdCurve.map(pt => {
    const profit = pt.tp * rev - pt.contacted * cpn * cost;
    return { ...pt, profit };
  });
}

/**
 * Find the threshold entry with maximum profit.
 */
function findOptimal(curve) {
  return curve.reduce((best, pt) => pt.profit > best.profit ? pt : best, curve[0]);
}

/** Profit when contacting everyone (threshold = 0) */
function profitAll(curve) {
  return curve[0].profit;
}

function renderTradeoffCharts() {
  const { cost, rev, cpn } = STATE.tradeoff;
  const curve    = computeProfitCurve(cost, rev, cpn);
  const optimal  = findOptimal(curve);
  const allProfit = profitAll(curve);

  const labels    = curve.map(pt => pt.threshold.toFixed(2));
  const profits   = curve.map(pt => Math.round(pt.profit));
  const precisions = curve.map(pt => +(pt.precision * 100).toFixed(2));
  const recalls    = curve.map(pt => +(pt.recall    * 100).toFixed(2));

  /* ── Profit chart ──────────────────────────────────────── */
  upsertChart("chart-profit", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Profit Estimasi (Rp)",
          data: profits,
          borderColor: CONFIG.colors.indigo,
          backgroundColor: "rgba(99,102,241,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: "Threshold Optimal",
          data: curve.map(pt =>
            pt.threshold === optimal.threshold ? Math.round(pt.profit) : null
          ),
          borderColor: CONFIG.colors.amber,
          backgroundColor: CONFIG.colors.amber,
          pointRadius: 7,
          pointStyle: "star",
          showLine: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 11 }, boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 0) {
                return "Profit: " + CONFIG.currency.format(ctx.parsed.y);
              }
              return "Optimal";
            },
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: v => CONFIG.currency.format(v),
            maxTicksLimit: 6,
          },
        },
        x: {
          title: { display: true, text: "Threshold Probabilitas", font: { size: 11 } },
          ticks: { maxTicksLimit: 10 },
        },
      },
    },
  });

  /* ── Precision-Recall chart ────────────────────────────── */
  upsertChart("chart-pr", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Presisi (%)",
          data: precisions,
          borderColor: CONFIG.colors.teal,
          backgroundColor: "rgba(20,184,166,0.08)",
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: "Recall (%)",
          data: recalls,
          borderColor: CONFIG.colors.rose,
          backgroundColor: "rgba(244,63,94,0.08)",
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
          borderDash: [4, 3],
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 11 }, boxWidth: 14 } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ": " + ctx.parsed.y.toFixed(1) + "%",
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: v => v + "%" },
        },
        x: {
          title: { display: true, text: "Threshold Probabilitas", font: { size: 11 } },
          ticks: { maxTicksLimit: 10 },
        },
      },
    },
  });

  /* ── Optimal box values ─────────────────────────────────── */
  const pct = pct => (pct * 100).toFixed(1) + "%";
  const valSize = STATE.validation.size;

  document.getElementById("opt-threshold").textContent  = optimal.threshold.toFixed(2);
  document.getElementById("opt-contacted").textContent  =
    optimal.contacted.toLocaleString("id-ID") + " (" +
    ((optimal.contacted / valSize) * 100).toFixed(1) + "%)";
  document.getElementById("opt-recall").textContent     = pct(optimal.recall);
  document.getElementById("opt-precision").textContent  = pct(optimal.precision);
  document.getElementById("opt-profit").textContent     = CONFIG.currency.format(optimal.profit);
  const diff = optimal.profit - allProfit;
  const diffEl = document.getElementById("opt-vs-all");
  diffEl.textContent = (diff >= 0 ? "+" : "") + CONFIG.currency.format(diff);
  diffEl.style.color = diff >= 0 ? CONFIG.colors.teal : CONFIG.colors.rose;

  document.getElementById("model-auc").textContent = STATE.validation.roc_auc.toFixed(4);
}

/** Wire up slider events and read current values. */
function initTradeoffSliders() {
  const fmt = CONFIG.currency.format.bind(CONFIG.currency);

  const slCost = document.getElementById("sl-cost");
  const slRev  = document.getElementById("sl-rev");
  const slCpn  = document.getElementById("sl-cpn");
  const vCost  = document.getElementById("val-cost");
  const vRev   = document.getElementById("val-rev");
  const vCpn   = document.getElementById("val-cpn");

  function readSliders() {
    STATE.tradeoff.cost = parseInt(slCost.value, 10);
    STATE.tradeoff.rev  = parseInt(slRev.value,  10);
    STATE.tradeoff.cpn  = parseInt(slCpn.value,  10);
    vCost.textContent = fmt(STATE.tradeoff.cost);
    vRev.textContent  = fmt(STATE.tradeoff.rev);
    vCpn.textContent  = STATE.tradeoff.cpn;
  }

  slCost.addEventListener("input", () => { readSliders(); renderTradeoffCharts(); });
  slRev.addEventListener("input",  () => { readSliders(); renderTradeoffCharts(); });
  slCpn.addEventListener("input",  () => { readSliders(); renderTradeoffCharts(); });

  readSliders(); // set initial display values
}

/* ══════════════════════════════════════════════════════════════
   9. INIT
══════════════════════════════════════════════════════════════ */
async function init() {
  try {
    await loadData();

    // Populate filter dropdowns
    populateFilters();

    // Initial render (no filters active)
    applyFilters();
    renderKPIs();
    renderFilterCharts();

    // Trade-off section
    initTradeoffSliders();
    renderTradeoffCharts();

    // Hide loading overlay
    document.getElementById("loading-overlay").style.display = "none";

  } catch (err) {
    console.error("Dashboard error:", err);
    const overlay = document.getElementById("loading-overlay");
    overlay.innerHTML = `
      <div style="color:#f43f5e;text-align:center;padding:2rem;">
        <div style="font-size:2rem;">⚠️</div>
        <div style="font-weight:700;margin:.5rem 0;">Gagal memuat data</div>
        <div style="font-size:.85rem;color:#64748b;">${err.message}</div>
        <div style="font-size:.8rem;color:#94a3b8;margin-top:.5rem;">
          Pastikan Anda membuka halaman ini melalui Live Server (VS Code) atau server lokal,<br>
          bukan langsung dari sistem file.
        </div>
      </div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
