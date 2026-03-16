import { LEAD_STATUSES } from "./leadManager.js";
import { computeClientFinancials } from "./clients.js";

export function renderDashboard(data, leadSummary, revenueReport) {
  const topClients = data.clients.map(computeClientFinancials).slice(0, 4);
  return `
    <div class="grid gap-4 xl:grid-cols-4">
      ${metricCard("Leads totales", leadSummary.total, "Negocios cargados en el embudo", "from-indigo-500 to-violet-500")}
      ${metricCard("Contactados", leadSummary.contacted, "Seguimiento en curso", "from-sky-500 to-cyan-500")}
      ${metricCard("Clientes", leadSummary.clients, "Oportunidades ganadas", "from-emerald-500 to-teal-500")}
      ${metricCard("MRR", money(revenueReport.mrr), "Ingreso recurrente mensual", "from-slate-900 to-slate-700")}
    </div>
    <div class="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <div class="surface-card p-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Embudo comercial</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Panorama del pipeline</h3>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Visualiza el avance de los contactos y la conversion de negocios locales.</p>
          </div>
          <div class="crm-pill text-sm font-medium text-slate-600 dark:text-slate-300">${data.categories.length} categorias activas</div>
        </div>
        <div class="mt-6 grid gap-4 md:grid-cols-3">
          ${LEAD_STATUSES.map((status) => `
            <div class="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">${status}</p>
              <p class="mt-3 text-3xl font-bold text-slate-900 dark:text-white">${data.leads.filter((lead) => lead.status === status).length}</p>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="surface-card p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Clientes destacados</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Cuentas activas</h3>
          </div>
          <span class="crm-pill text-xs font-semibold text-emerald-600 dark:text-emerald-300">${topClients.length || 0} visibles</span>
        </div>
        <div class="mt-4 space-y-3">
          ${topClients.map((client) => `
            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-semibold text-slate-900 dark:text-white">${escapeHtml(client.businessName)}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(client.serviceType)}</p>
                </div>
                <span class="text-sm font-bold text-slate-900 dark:text-white">${money(client.monthlyPrice)}</span>
              </div>
            </div>
          `).join("") || `<div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Aun no hay clientes activos.</div>`}
        </div>
      </div>
    </div>
  `;
}

export function renderStatistics(data, revenueReport) {
  return `
    <div class="grid gap-4 xl:grid-cols-3">
      <div class="surface-card p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Conversion</p>
        <p class="mt-3 text-3xl font-bold text-slate-900 dark:text-white">${data.leads.length ? Math.round((data.clients.length / data.leads.length) * 100) : 0}%</p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Porcentaje de leads convertidos en clientes</p>
      </div>
      <div class="surface-card p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">MRR</p>
        <p class="mt-3 text-3xl font-bold text-slate-900 dark:text-white">${money(revenueReport.mrr)}</p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Ingreso recurrente mensual actual</p>
      </div>
      <div class="surface-card p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Facturacion total</p>
        <p class="mt-3 text-3xl font-bold text-slate-900 dark:text-white">${money(revenueReport.totalRevenue)}</p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Valor estimado acumulado</p>
      </div>
    </div>
    <div class="grid gap-6 xl:grid-cols-2">
      <div class="surface-card p-6"><div class="mb-4"><p class="text-sm font-semibold text-slate-900 dark:text-white">Embudo de leads</p><p class="text-xs text-slate-500 dark:text-slate-400">Distribucion por etapa comercial</p></div><div class="relative h-[260px]"><canvas id="lead-funnel-chart"></canvas></div></div>
      <div class="surface-card p-6"><div class="mb-4"><p class="text-sm font-semibold text-slate-900 dark:text-white">Crecimiento de ingresos</p><p class="text-xs text-slate-500 dark:text-slate-400">Evolucion del MRR por cliente</p></div><div class="relative h-[260px]"><canvas id="revenue-growth-chart"></canvas></div></div>
      <div class="surface-card p-6 xl:col-span-2"><div class="mb-4"><p class="text-sm font-semibold text-slate-900 dark:text-white">Clientes por categoria</p><p class="text-xs text-slate-500 dark:text-slate-400">Segmentos con mejor conversion</p></div><div class="relative h-[320px]"><canvas id="clients-category-chart"></canvas></div></div>
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
      category: categories.find((item) => item.id === client.categoryId)?.name || "Sin categoria",
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
  return `U$D ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}




