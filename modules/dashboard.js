import { LEAD_STATUSES } from "./leadManager.js";
import { computeClientFinancials } from "./clients.js";

export function renderDashboard(data, leadSummary, revenueReport) {
  const topClients = data.clients.map(computeClientFinancials).slice(0, 4);
  return `
    <div class="grid gap-4 xl:grid-cols-4">
      ${metricCard("Total Leads", leadSummary.total, "Businesses in pipeline", "from-indigo-500 to-indigo-400")}
      ${metricCard("Contacted", leadSummary.contacted, "Active outreach underway", "from-sky-500 to-blue-400")}
      ${metricCard("Clients", leadSummary.clients, "Converted accounts", "from-emerald-500 to-lime-400")}
      ${metricCard("MRR", money(revenueReport.mrr), "Recurring monthly revenue", "from-slate-900 to-slate-700")}
    </div>
    <div class="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div class="surface-card p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Pipeline progress</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900">Lead flow snapshot</h3>
          </div>
        </div>
        <div class="mt-6 grid gap-4 md:grid-cols-3">
          ${LEAD_STATUSES.map((status) => `
            <div class="rounded-3xl bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">${status}</p>
              <p class="mt-3 text-3xl font-bold text-slate-900">${data.leads.filter((lead) => lead.status === status).length}</p>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="surface-card p-6">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Client highlights</p>
        <div class="mt-4 space-y-3">
          ${topClients.map((client) => `
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-semibold text-slate-900">${escapeHtml(client.businessName)}</p>
                  <p class="text-xs text-slate-500">${escapeHtml(client.serviceType)}</p>
                </div>
                <span class="text-sm font-bold text-slate-900">${money(client.monthlyPrice)}</span>
              </div>
            </div>
          `).join("") || `<div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No active clients yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

export function renderStatistics(data, revenueReport) {
  return `
    <div class="grid gap-4 xl:grid-cols-3">
      <div class="surface-card p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Lead funnel</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">${data.leads.length}</p>
        <p class="mt-1 text-sm text-slate-500">Total leads tracked</p>
      </div>
      <div class="surface-card p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">MRR</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">${money(revenueReport.mrr)}</p>
        <p class="mt-1 text-sm text-slate-500">Current monthly recurring revenue</p>
      </div>
      <div class="surface-card p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Total revenue</p>
        <p class="mt-3 text-3xl font-bold text-slate-900">${money(revenueReport.totalRevenue)}</p>
        <p class="mt-1 text-sm text-slate-500">Estimated lifetime revenue</p>
      </div>
    </div>
    <div class="grid gap-6 xl:grid-cols-2">
      <div class="surface-card p-6"><div class="relative h-[260px]"><canvas id="lead-funnel-chart"></canvas></div></div>
      <div class="surface-card p-6"><div class="relative h-[260px]"><canvas id="revenue-growth-chart"></canvas></div></div>
      <div class="surface-card p-6 xl:col-span-2"><div class="relative h-[320px]"><canvas id="clients-category-chart"></canvas></div></div>
    </div>
  `;
}

export function buildRevenueReport(clients, categories) {
  const enriched = clients.map(computeClientFinancials);
  return {
    mrr: enriched.reduce((sum, client) => sum + client.monthlyPrice, 0),
    totalRevenue: enriched.reduce((sum, client) => sum + client.totalRevenue, 0),
    clientSeries: enriched.map((client) => ({
      businessName: client.businessName,
      category: categories.find((item) => item.id === client.categoryId)?.name || "Uncategorized",
      monthlyPrice: client.monthlyPrice,
      monthsActive: client.monthsActive,
      totalRevenue: client.totalRevenue
    }))
  };
}

function metricCard(label, value, helper, gradient) {
  return `
    <div class="metric-card overflow-hidden rounded-[1.7rem] bg-gradient-to-br ${gradient} p-5 text-white shadow-soft">
      <p class="text-xs font-semibold uppercase tracking-[0.22em] text-white/75">${label}</p>
      <p class="mt-4 text-4xl font-bold">${value}</p>
      <p class="mt-2 text-sm text-white/80">${helper}</p>
    </div>
  `;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
