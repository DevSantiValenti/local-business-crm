import { storage, createSeedData, exportCsvRows } from "./modules/storage.js";
import { parseImportFile } from "./modules/importer.js";
import { LEAD_STATUSES, STATUS_META, buildLead, sortByNewest, filterLeads, groupLeadsByStatus, summarizeLeads, mapLeadToClientPayload } from "./modules/leadManager.js";
import { renderDashboard, renderStatistics, buildRevenueReport } from "./modules/dashboard.js";
import { createChartsManager } from "./modules/charts.js";
import { buildClient, computeClientFinancials, filterClients } from "./modules/clients.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Resumen", icon: "R" },
  { id: "categories", label: "Categorias", icon: "C" },
  { id: "leads", label: "Prospectos", icon: "P" },
  { id: "clients", label: "Clientes", icon: "$" },
  { id: "import", label: "Importar", icon: "I" },
  { id: "statistics", label: "Estadisticas", icon: "M" },
  { id: "settings", label: "Configuracion", icon: "S" }
];

const SECTION_TITLES = {
  dashboard: { eyebrow: "Resumen", title: "Centro de ventas" },
  categories: { eyebrow: "Organizacion", title: "Categorias de negocios" },
  leads: { eyebrow: "Prospeccion", title: "Pipeline comercial" },
  clients: { eyebrow: "Crecimiento", title: "Clientes activos" },
  import: { eyebrow: "Carga", title: "Importar negocios" },
  statistics: { eyebrow: "Metricas", title: "Rendimiento del CRM" },
  settings: { eyebrow: "Sistema", title: "Configuracion y exportacion" }
};

const LEADS_ROW_HEIGHT = 88;
const LEADS_BUFFER = 10;

const chartsManager = createChartsManager();
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast-root");
const sectionsRoot = {
  dashboard: document.getElementById("dashboard-section"),
  categories: document.getElementById("categories-section"),
  leads: document.getElementById("leads-section"),
  clients: document.getElementById("clients-section"),
  import: document.getElementById("import-section"),
  statistics: document.getElementById("statistics-section"),
  settings: document.getElementById("settings-section")
};

const state = {
  data: loadInitialData(),
  activeSection: "dashboard",
  activeCategoryId: "all",
  leadsView: "list",
  leadFilters: { search: "", categoryId: "all", status: "all", rating: "all" },
  clientFilters: { search: "", categoryId: "all", paymentStatus: "all" },
  importRows: [],
  importFileName: "",
  virtualScrollTop: 0,
  theme: document.documentElement.classList.contains("dark") ? "dark" : "light"
};

function loadInitialData() {
  const saved = normalizeData(storage.load());
  if (saved.categories.length || saved.leads.length || saved.clients.length) {
    storage.save(saved);
    return saved;
  }
  const seed = createSeedData();
  storage.save(seed);
  return seed;
}

function normalizeData(data) {
  return {
    categories: Array.isArray(data.categories) ? data.categories : [],
    leads: Array.isArray(data.leads) ? data.leads.map(normalizeLeadRecord) : [],
    clients: Array.isArray(data.clients) ? data.clients.map(normalizeClientRecord) : []
  };
}

function normalizeLeadRecord(lead) {
  const statusMap = {
    "Not contacted": "Sin contactar",
    Contacted: "Contactado",
    Rejected: "Rechazado",
    Interested: "Interesado",
    Negotiating: "Negociando",
    Client: "Cliente"
  };
  const nextStatus = statusMap[lead?.status] || lead?.status || "Sin contactar";
  return {
    ...lead,
    status: LEAD_STATUSES.includes(nextStatus) ? nextStatus : "Sin contactar",
    notes: String(lead?.notes || ""),
    name: String(lead?.name || ""),
    address: String(lead?.address || ""),
    phone: String(lead?.phone || ""),
    website: String(lead?.website || ""),
    facebook: String(lead?.facebook || ""),
    instagram: String(lead?.instagram || ""),
    twitter: String(lead?.twitter || ""),
    rating: Number(lead?.rating) || 0,
    reviews: Number(lead?.reviews) || 0
  };
}

function normalizeClientRecord(client) {
  const serviceTypeMap = { Both: "Ambos" };
  const paymentStatusMap = { Pending: "Pendiente", Paid: "Pagado", Overdue: "Vencido" };
  return {
    ...client,
    businessName: String(client?.businessName || ""),
    serviceType: serviceTypeMap[client?.serviceType] || client?.serviceType || "Landing",
    paymentStatus: paymentStatusMap[client?.paymentStatus] || client?.paymentStatus || "Pendiente",
    notes: String(client?.notes || ""),
    monthlyPrice: Number(client?.monthlyPrice) || 0
  };
}

function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META["Sin contactar"];
}

function saveData() {
  storage.save(state.data);
}

function init() {
  bindStaticEvents();
  renderApp();
}

function bindStaticEvents() {
  document.getElementById("add-category-btn")?.addEventListener("click", () => openCategoryModal());
  document.getElementById("add-lead-btn")?.addEventListener("click", () => openLeadModal());
  document.getElementById("global-search")?.addEventListener("input", (event) => {
    const value = event.target.value || "";
    state.leadFilters.search = value;
    state.clientFilters.search = value;
    if (!["leads", "clients"].includes(state.activeSection)) state.activeSection = "leads";
    renderApp();
  });
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("submit", handleDocumentSubmit);
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

function renderApp() {
  syncHeader();
  renderNav();
  renderSidebarCategories();
  renderSections();
}

function syncHeader() {
  const config = SECTION_TITLES[state.activeSection];
  document.getElementById("page-eyebrow").textContent = config.eyebrow;
  document.getElementById("page-title").textContent = config.title;
  const searchInput = document.getElementById("global-search");
  if (searchInput && searchInput.value !== state.leadFilters.search) searchInput.value = state.leadFilters.search;
  const themeButton = document.getElementById("theme-toggle");
  if (themeButton) themeButton.textContent = state.theme === "dark" ? "Claro" : "Oscuro";
}

function renderNav() {
  const nav = document.getElementById("nav-sections");
  nav.innerHTML = NAV_ITEMS.map((item) => `
    <button class="nav-item w-full text-left ${state.activeSection === item.id ? "active" : ""}" data-nav-section="${item.id}">
      <span class="text-lg">${item.icon}</span>
      <span class="font-semibold">${item.label}</span>
    </button>
  `).join("");
}

function renderSidebarCategories() {
  const root = document.getElementById("sidebar-categories");
  root.innerHTML = [
    `<button class="category-item w-full text-left ${state.activeCategoryId === "all" ? "active" : ""}" data-category-filter="all"><span class="text-base">#</span><span class="font-medium">Todas</span></button>`,
    ...state.data.categories.map((category) => `
      <button class="category-item w-full text-left ${state.activeCategoryId === category.id ? "active" : ""}" data-category-filter="${category.id}">
        <span class="text-base">•</span>
        <span class="font-medium truncate">${escapeHtml(category.name)}</span>
      </button>
    `)
  ].join("");
}

function renderSections() {
  Object.entries(sectionsRoot).forEach(([section, element]) => {
    element.classList.toggle("hidden", state.activeSection !== section);
  });

  const leadSummary = summarizeLeads(state.data.leads);
  const revenueReport = buildRevenueReport(state.data.clients, state.data.categories);

  sectionsRoot.dashboard.innerHTML = renderDashboardSection(leadSummary, revenueReport);
  sectionsRoot.categories.innerHTML = renderCategoriesSection();
  sectionsRoot.leads.innerHTML = renderLeadsSection();
  sectionsRoot.clients.innerHTML = renderClientsSection();
  sectionsRoot.import.innerHTML = renderImportSection();
  sectionsRoot.statistics.innerHTML = renderStatisticsSection(revenueReport);
  sectionsRoot.settings.innerHTML = renderSettingsSection(revenueReport);

  if (state.activeSection === 'statistics') chartsManager.render(state.data);
}
function renderDashboardSection(leadSummary, revenueReport) {
  return `
    <div class="slide-up space-y-6">
      ${renderDashboard(state.data, leadSummary, revenueReport)}
      <div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div class="surface-card p-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Actividad reciente</p>
              <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Ultimos leads cargados</h3>
            </div>
            <button class="crm-pill text-sm font-semibold text-brand" data-nav-section="leads">Ver pipeline</button>
          </div>
          <div class="mt-5 space-y-3">
            ${sortByNewest(state.data.leads).slice(0, 5).map((lead) => recentLeadCard(lead)).join("") || emptyState("Todavia no hay leads cargados.")}
          </div>
        </div>
        <div class="surface-card p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Objetivos</p>
              <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Ritmo comercial</h3>
            </div>
            <span class="crm-pill text-xs font-semibold text-slate-500 dark:text-slate-300">${state.data.leads.length} registros</span>
          </div>
          <div class="mt-5 space-y-4">
            ${progressRow("Contactados", leadSummary.contacted, leadSummary.total, "bg-sky-500")}
            ${progressRow("Interesados", leadSummary.interested, leadSummary.total, "bg-amber-500")}
            ${progressRow("Clientes", leadSummary.clients, leadSummary.total, "bg-emerald-500")}
          </div>
          <div class="mt-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
            <p class="text-sm font-semibold">Facturacion acumulada</p>
            <p class="mt-3 text-4xl font-bold">${money(revenueReport.totalRevenue)}</p>
            <p class="mt-2 text-sm text-white/70">Suma estimada segun meses activos y fee mensual.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCategoriesSection() {
  return `
    <div class="slide-up space-y-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400">Agrupa tus negocios por rubro para segmentar mejor la prospeccion.</p>
        </div>
        <button class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft" data-action="new-category">Nueva categoria</button>
      </div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${state.data.categories.map((category) => renderCategoryCard(category)).join("") || emptyState("Todavia no creaste categorias.")}
      </div>
    </div>
  `;
}

function renderLeadsSection() {
  const filtered = getFilteredLeads();
  return `
    <div class="slide-up space-y-6">
      <div class="surface-card p-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Gestion de leads</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Vista CRM estilo pipeline</h3>
          </div>
          <div class="flex flex-wrap gap-3">
            <button class="crm-pill text-sm font-semibold ${state.leadsView === "list" ? "text-brand border-brand/30" : "text-slate-500 dark:text-slate-300"}" data-view="list">Lista</button>
            <button class="crm-pill text-sm font-semibold ${state.leadsView === "kanban" ? "text-brand border-brand/30" : "text-slate-500 dark:text-slate-300"}" data-view="kanban">Kanban</button>
            <button class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft" data-action="new-lead">Nuevo lead</button>
          </div>
        </div>
        <div class="mt-5 grid gap-3 lg:grid-cols-4">
          ${filterSelect("filter-category", state.leadFilters.categoryId, buildCategoryOptions("Todas las categorias"))}
          ${filterSelect("filter-status", state.leadFilters.status, [{ value: "all", label: "Todos los estados" }, ...LEAD_STATUSES.map((status) => ({ value: status, label: status }))])}
          ${filterSelect("filter-rating", state.leadFilters.rating, [{ value: "all", label: "Cualquier rating" }, { value: "4.5", label: "4.5 o mas" }, { value: "4", label: "4 o mas" }, { value: "3", label: "3 o mas" }])}
          <div class="crm-pill flex items-center justify-between text-sm text-slate-500 dark:text-slate-300"><span>${filtered.length} prospectos visibles</span><span class="font-semibold">${state.leadsView === "kanban" ? "Pipeline" : "Lista"}</span></div>
        </div>
      </div>
      ${state.leadsView === "kanban" ? renderKanbanView(filtered) : renderLeadsListView(filtered)}
    </div>
  `;
}

function renderClientsSection() {
  const filtered = filterClients(state.data.clients, state.clientFilters, state.data.categories).map(computeClientFinancials);
  return `
    <div class="slide-up space-y-6">
      <div class="surface-card p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Base de clientes</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Seguimiento de cuentas activas</h3>
          </div>
          <div class="grid gap-3 md:grid-cols-2 xl:w-[420px]">
            ${filterSelect("client-filter-category", state.clientFilters.categoryId, buildCategoryOptions("Todas las categorias"))}
            ${filterSelect("client-filter-payment", state.clientFilters.paymentStatus, [{ value: "all", label: "Todos los pagos" }, { value: "Pendiente", label: "Pendiente" }, { value: "Pagado", label: "Pagado" }, { value: "Vencido", label: "Vencido" }])}
          </div>
        </div>
      </div>
      <div class="grid gap-4 xl:grid-cols-3">
        ${filtered.map((client) => renderClientCard(client)).join("") || emptyState("Todavia no hay clientes activos.")}
      </div>
    </div>
  `;
}

function renderImportSection() {
  return `
    <div class="slide-up grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div class="surface-card p-6">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Carga masiva</p>
        <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Importa exportaciones de Google Maps</h3>
        <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">Sube archivos CSV o XLSX, asignalos a una categoria y genera leads listos para trabajar.</p>
        <div class="mt-6 space-y-4">
          <label class="block rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/70">
            <input id="import-file-input" type="file" accept=".csv,.xlsx,.xls" class="hidden">
            <span class="text-sm font-semibold text-slate-700 dark:text-slate-200">Seleccionar archivo</span>
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">${state.importFileName || "CSV, XLSX o export de scraper"}</p>
          </label>
          ${filterSelect("import-category", state.activeCategoryId !== "all" ? state.activeCategoryId : (state.data.categories[0]?.id || ""), buildCategoryOptions("Selecciona una categoria", true))}
          <button class="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft ${state.importRows.length ? "" : "opacity-60"}" data-action="confirm-import">Importar ${state.importRows.length ? `(${state.importRows.length})` : ""}</button>
        </div>
      </div>
      <div class="surface-card p-6">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Vista previa</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Negocios detectados</h3>
          </div>
          <span class="crm-pill text-xs font-semibold text-slate-500 dark:text-slate-300">${state.importRows.length} filas</span>
        </div>
        <div class="mt-5 space-y-3 max-h-[540px] overflow-auto pr-1">
          ${state.importRows.slice(0, 60).map((row) => `
            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-semibold text-slate-900 dark:text-white">${escapeHtml(row.name || "Sin nombre")}</p>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${escapeHtml(row.address || "Sin direccion")}</p>
                </div>
                <span class="badge bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">${Number(row.rating || 0).toFixed(1)}</span>
              </div>
            </div>
          `).join("") || emptyState("Aun no cargaste un archivo para importar.")}
        </div>
      </div>
    </div>
  `;
}

function renderStatisticsSection(revenueReport) {
  return `<div class="slide-up space-y-6">${renderStatistics(state.data, revenueReport)}</div>`;
}

function renderSettingsSection(revenueReport) {
  return `
    <div class="slide-up grid gap-6 xl:grid-cols-2">
      <div class="surface-card p-6">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Exportacion</p>
        <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Descarga tus datos</h3>
        <div class="mt-5 grid gap-3">
          <button class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200" data-export="leads">Exportar leads a CSV</button>
          <button class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200" data-export="clients">Exportar clientes a CSV</button>
          <button class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200" data-export="revenue">Exportar reporte de ingresos</button>
        </div>
      </div>
      <div class="surface-card p-6">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Preferencias</p>
        <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">Modo y almacenamiento</h3>
        <div class="mt-5 space-y-4 text-sm text-slate-500 dark:text-slate-400">
          <p>La app guarda categorias, leads y clientes en LocalStorage para funcionar sin backend.</p>
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p class="font-semibold text-slate-900 dark:text-white">Tema actual: ${state.theme === "dark" ? "Oscuro" : "Claro"}</p>
            <p class="mt-2">MRR actual: <span class="font-semibold text-slate-900 dark:text-white">${money(revenueReport.mrr)}</span></p>
            <p class="mt-1">Facturacion total: <span class="font-semibold text-slate-900 dark:text-white">${money(revenueReport.totalRevenue)}</span></p>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderCategoryCard(category) {
  const count = state.data.leads.filter((lead) => lead.categoryId === category.id).length;
  const clients = state.data.clients.filter((client) => client.categoryId === category.id).length;
  return `
    <article class="category-card surface-card p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Categoria</p>
          <h4 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">${escapeHtml(category.name)}</h4>
        </div>
        <span class="crm-pill text-xs font-semibold text-brand">${count} leads</span>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/70"><p class="text-slate-400">Prospectos</p><p class="mt-1 font-bold text-slate-900 dark:text-white">${count}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/70"><p class="text-slate-400">Clientes</p><p class="mt-1 font-bold text-slate-900 dark:text-white">${clients}</p></div>
      </div>
      <div class="mt-5 flex gap-3">
        <button class="crm-pill text-sm font-semibold text-slate-600 dark:text-slate-300" data-edit-category="${category.id}">Renombrar</button>
        <button class="crm-pill text-sm font-semibold text-rose-600 dark:text-rose-300" data-delete-category="${category.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function renderLeadsListView(leads) {
  if (!leads.length) return emptyState("No hay leads que coincidan con los filtros.");

  return `
    <div class="surface-card overflow-hidden">
      <div class="hidden border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:border-slate-800 lg:grid lg:grid-cols-[minmax(280px,2fr)_minmax(180px,1fr)_minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(140px,0.85fr)_50px] lg:gap-4">
        <span>Negocio</span><span>Telefono</span><span>Web</span><span>Estado</span><span>Categoria</span><span></span>
      </div>
      <div class="virtual-list">
        ${leads.map((lead) => renderLeadRow(lead)).join("")}
      </div>
    </div>
  `;
}

function renderLeadRow(lead) {
  const categoryName = getCategoryName(lead.categoryId);
  return `
    <div class="lead-row">
      <div>
        <div class="flex items-center gap-3">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/20 to-cyan-400/20 text-sm font-bold text-brand">${initials(lead.name)}</div>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">${escapeHtml(lead.name)}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(lead.address || "Sin direccion")}</p>
          </div>
        </div>
      </div>
      <div class="text-sm text-slate-600 dark:text-slate-300">${escapeHtml(lead.phone || "Sin telefono")}</div>
      <div class="text-sm text-slate-600 dark:text-slate-300">${lead.website ? anchor(lead.website, "Abrir web") : "Sin web"}</div>
      <div>${statusSelect(lead.id, lead.status)}</div>
      <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(categoryName)}</div>
      <div class="flex items-center gap-2"><button class="crm-pill px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300" data-whatsapp="${lead.id}">WhatsApp</button><button class="crm-pill px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300" data-open-lead="${lead.id}">Ver</button></div>
    </div>
  `;
}

function renderKanbanView(leads) {
  const grouped = groupLeadsByStatus(leads);
  return `
    <div class="grid gap-4 xl:grid-cols-6">
      ${LEAD_STATUSES.map((status) => `
        <div class="kanban-column surface-card p-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full ${getStatusMeta(status).dot}"></span><h4 class="text-sm font-semibold text-slate-900 dark:text-white">${status}</h4></div>
            <span class="badge ${getStatusMeta(status).badge}">${grouped[status].length}</span>
          </div>
          <div class="mt-4 space-y-3">
            ${grouped[status].map((lead) => renderKanbanCard(lead)).join("") || `<div class="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-700">Sin leads</div>`}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderKanbanCard(lead) {
  return `
    <article class="kanban-card rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div class="flex items-start justify-between gap-3">
        <div>
          <button class="text-left font-semibold text-slate-900 dark:text-white" data-open-lead="${lead.id}">${escapeHtml(lead.name)}</button>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${escapeHtml(getCategoryName(lead.categoryId))}</p>
        </div>
        <span class="badge ${getStatusMeta(lead.status).badge}">${(lead.rating || 0).toFixed(1)}</span>
      </div>
      <p class="mt-3 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">${escapeHtml(lead.address || "Sin direccion")}</p>
      <div class="mt-4">${statusSelect(lead.id, lead.status, true)}</div>
    </article>
  `;
}

function renderClientCard(client) {
  return `
    <article class="client-card surface-card p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">${escapeHtml(getCategoryName(client.categoryId))}</p>
          <h4 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">${escapeHtml(client.businessName)}</h4>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${escapeHtml(normalizeServiceType(client.serviceType))}</p>
        </div>
        <span class="badge ${client.paymentStatus === "Pagado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : client.paymentStatus === "Vencido" ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200"}">${escapeHtml(client.paymentStatus)}</span>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/70"><p class="text-slate-400">Fee mensual</p><p class="mt-1 font-bold text-slate-900 dark:text-white">${money(client.monthlyPrice)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/70"><p class="text-slate-400">Meses activos</p><p class="mt-1 font-bold text-slate-900 dark:text-white">${client.monthsActive}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/70"><p class="text-slate-400">Facturacion</p><p class="mt-1 font-bold text-slate-900 dark:text-white">${money(client.totalRevenue)}</p></div>
        <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/70"><p class="text-slate-400">Proximo cobro</p><p class="mt-1 font-bold text-slate-900 dark:text-white">${formatDate(client.nextBillingDate)}</p></div>
      </div>
      <div class="mt-5">
        <button class="crm-pill text-sm font-semibold text-slate-600 dark:text-slate-300" data-open-client="${client.id}">Ver detalle</button>
      </div>
    </article>
  `;
}

function recentLeadCard(lead) {
  return `
    <button class="w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-brand/30 dark:border-slate-800 dark:bg-slate-900/70" data-open-lead="${lead.id}">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-semibold text-slate-900 dark:text-white">${escapeHtml(lead.name)}</p>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${escapeHtml(getCategoryName(lead.categoryId))}</p>
        </div>
        <span class="badge ${getStatusMeta(lead.status).badge}">${lead.status}</span>
      </div>
    </button>
  `;
}

function progressRow(label, value, total, barClass) {
  const width = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return `
    <div>
      <div class="mb-2 flex items-center justify-between text-sm"><span class="font-medium text-slate-700 dark:text-slate-200">${label}</span><span class="text-slate-400">${width}%</span></div>
      <div class="h-3 rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-full rounded-full ${barClass}" style="width:${width}%"></div></div>
    </div>
  `;
}

function statusSelect(leadId, currentStatus, compact = false) {
  return `
    <select class="w-full rounded-2xl border px-3 py-${compact ? "2" : "3"} text-sm font-semibold outline-none transition ${getStatusMeta(currentStatus).select}" data-status-select="${leadId}">
      ${LEAD_STATUSES.map((status) => `<option value="${status}" ${status === currentStatus ? "selected" : ""}>${status}</option>`).join("")}
    </select>
  `;
}
function handleDocumentClick(event) {
  if (event.target.closest('[data-status-select]')) return;
  const navButton = event.target.closest('[data-nav-section]');
  if (navButton) {
    state.activeSection = navButton.dataset.navSection;
    renderApp();
    return;
  }

  const categoryFilter = event.target.closest("[data-category-filter]");
  if (categoryFilter) {
    state.activeCategoryId = categoryFilter.dataset.categoryFilter;
    state.leadFilters.categoryId = state.activeCategoryId;
    state.clientFilters.categoryId = state.activeCategoryId;
    state.activeSection = "leads";
    renderApp();
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.leadsView = viewButton.dataset.view;
    renderApp();
    return;
  }

  if (event.target.closest("[data-action='new-category']")) return openCategoryModal();
  if (event.target.closest("[data-action='new-lead']")) return openLeadModal();
  if (event.target.closest("[data-action='confirm-import']")) return confirmImport();
  if (event.target.closest("[data-delete-lead]")) return removeLead(event.target.closest("[data-delete-lead]").dataset.deleteLead);
  if (event.target.closest("[data-save-category]")) {
    const form = document.getElementById("category-form");
    if (form) submitCategoryForm(new FormData(form));
    return;
  }
  if (event.target.closest("[data-save-lead]")) {
    const form = document.getElementById("lead-form");
    if (form) submitLeadForm(new FormData(form));
    return;
  }
  if (event.target.closest("[data-save-client]")) {
    const form = document.getElementById("client-form");
    if (form) submitClientForm(new FormData(form));
    return;
  }

  const whatsappButton = event.target.closest("[data-whatsapp]");
  if (whatsappButton) {
    openWhatsApp(findLead(whatsappButton.dataset.whatsapp));
    return;
  }

  const openLeadButton = event.target.closest("[data-open-lead]");
  if (openLeadButton) {
    const lead = findLead(openLeadButton.dataset.openLead);
    if (lead) openLeadModal(lead);
    return;
  }

  const openClientButton = event.target.closest("[data-open-client]");
  if (openClientButton) {
    const client = findClient(openClientButton.dataset.openClient);
    if (client) openClientModal(client);
    return;
  }

  const editCategoryButton = event.target.closest("[data-edit-category]");
  if (editCategoryButton) {
    const category = findCategory(editCategoryButton.dataset.editCategory);
    if (category) openCategoryModal(category);
    return;
  }

  const deleteCategoryButton = event.target.closest("[data-delete-category]");
  if (deleteCategoryButton) {
    deleteCategory(deleteCategoryButton.dataset.deleteCategory);
    return;
  }

  const exportButton = event.target.closest("[data-export]");
  if (exportButton) {
    exportData(exportButton.dataset.export);
    return;
  }

  if (event.target.matches("[data-modal-close]")) closeModal();
}

async function handleDocumentChange(event) {
  const leadStatus = event.target.closest("[data-status-select]");
  if (leadStatus) {
    updateLeadStatus(leadStatus.dataset.statusSelect, event.target.value);
    return;
  }

  if (event.target.id === "filter-category") {
    state.leadFilters.categoryId = event.target.value;
    state.activeCategoryId = event.target.value;
    renderApp();
    return;
  }
  if (event.target.id === "filter-status") {
    state.leadFilters.status = event.target.value;
    renderApp();
    return;
  }
  if (event.target.id === "filter-rating") {
    state.leadFilters.rating = event.target.value;
    renderApp();
    return;
  }
  if (event.target.id === "client-filter-category") {
    state.clientFilters.categoryId = event.target.value;
    renderApp();
    return;
  }
  if (event.target.id === "client-filter-payment") {
    state.clientFilters.paymentStatus = event.target.value;
    renderApp();
    return;
  }

  if (event.target.id === "import-file-input") {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      state.importRows = await parseImportFile(file);
      state.importFileName = file.name;
      toast(`Archivo listo: ${file.name}`);
    } catch {
      state.importRows = [];
      state.importFileName = "";
      toast("No pudimos leer el archivo.", true);
    }
    renderApp();
    return;
  }
}

function handleCategoryFormSubmit(event) {
  event.preventDefault();
  submitCategoryForm(new FormData(event.currentTarget));
}

function handleLeadFormSubmit(event) {
  event.preventDefault();
  submitLeadForm(new FormData(event.currentTarget));
}

function handleClientFormSubmit(event) {
  event.preventDefault();
  submitClientForm(new FormData(event.currentTarget));
}

function handleDocumentSubmit(event) {
  if (event.target.id === "category-form") {
    event.preventDefault();
    submitCategoryForm(new FormData(event.target));
    return;
  }
  if (event.target.id === "lead-form") {
    event.preventDefault();
    submitLeadForm(new FormData(event.target));
    return;
  }
  if (event.target.id === "client-form") {
    event.preventDefault();
    submitClientForm(new FormData(event.target));
  }
}

function handleKeyboardShortcuts(event) {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "/") {
    event.preventDefault();
    document.getElementById("global-search")?.focus();
  }
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    openLeadModal();
  }
  if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    state.activeSection = "leads";
    state.leadsView = state.leadsView === "list" ? "kanban" : "list";
    renderApp();
  }
  if (event.key.toLowerCase() === "d") {
    event.preventDefault();
    toggleTheme();
  }
  if (event.key === "Escape") closeModal();
}

function openCategoryModal(category = null) {
  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm fade-in">
      <div class="surface-card slide-up w-full max-w-lg p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Categoria</p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">${category ? "Editar categoria" : "Nueva categoria"}</h3>
          </div>
          <button data-modal-close class="crm-pill text-sm font-semibold text-slate-500 dark:text-slate-300">Cerrar</button>
        </div>
        <form id="category-form" class="mt-6 space-y-4">
          <input type="hidden" name="id" value="${category?.id || ""}">
          <div>
            <label class="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Nombre</label>
            <input name="name" required value="${escapeAttr(category?.name || "")}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          </div>
          <button type="button" data-save-category class="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft">Guardar categoria</button>
        </form>
      </div>
    </div>
  `;
}

function openLeadModal(lead = null) {
  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm fade-in overflow-y-auto">
      <div class="surface-card slide-up w-full max-w-4xl p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Lead</p>
            <h3 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">${lead ? escapeHtml(lead.name) : "Nuevo lead"}</h3>
            ${lead ? `<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Creado ${formatDate(lead.dateAdded)}</p>` : ""}
          </div>
          <div class="flex flex-wrap gap-2">
            ${lead ? quickLeadActions(lead) + whatsappAction(lead) : ""}
            <button data-modal-close class="crm-pill text-sm font-semibold text-slate-500 dark:text-slate-300">Cerrar</button>
          </div>
        </div>
        <form id="lead-form" class="mt-6 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value="${lead?.id || ""}">
          ${formField("Nombre", "name", lead?.name, true)}
          ${formField("Telefono", "phone", lead?.phone)}
          ${formField("Direccion", "address", lead?.address, false, "md:col-span-2")}
          ${formField("Sitio web", "website", lead?.website)}
          ${formField("Facebook", "facebook", lead?.facebook)}
          ${formField("Instagram", "instagram", lead?.instagram)}
          ${formField("Twitter", "twitter", lead?.twitter)}
          ${formSelect("Categoria", "categoryId", buildCategoryOptions("Selecciona una categoria", true), lead?.categoryId || "", false)}
          ${formSelect("Estado", "status", LEAD_STATUSES.map((status) => ({ value: status, label: status })), lead?.status || "Sin contactar", false)}
          ${formField("Rating", "rating", lead?.rating || "", false, "", "number", "0", "0.1")}
          ${formField("Reseñas", "reviews", lead?.reviews || "", false, "", "number", "0", "1")}
          <div class="md:col-span-2">
            <label class="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Notas</label>
            <textarea name="notes" rows="5" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-white">${escapeHtml(lead?.notes || "")}</textarea>
          </div>
          <div class="md:col-span-2 flex justify-end">
            <button type="button" data-save-lead class="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-soft">Guardar lead</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
function openClientModal(client) {
  const financials = computeClientFinancials(client);
  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm fade-in overflow-y-auto">
      <div class="surface-card slide-up w-full max-w-3xl p-6">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Cliente</p>
            <h3 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">${escapeHtml(client.businessName)}</h3>
          </div>
          <button data-modal-close class="crm-pill text-sm font-semibold text-slate-500 dark:text-slate-300">Cerrar</button>
        </div>
        <form id="client-form" class="mt-6 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value="${client.id}">
          ${formField("Negocio", "businessName", client.businessName, true)}
          ${formSelect("Servicio", "serviceType", [{ value: "Landing", label: "Landing" }, { value: "SEO", label: "SEO" }, { value: "Ambos", label: "Ambos" }], normalizeServiceType(client.serviceType), false)}
          ${formField("Precio mensual", "monthlyPrice", client.monthlyPrice, true, "", "number", "0", "1")}
          ${formSelect("Estado de pago", "paymentStatus", [{ value: "Pendiente", label: "Pendiente" }, { value: "Pagado", label: "Pagado" }, { value: "Vencido", label: "Vencido" }], client.paymentStatus, false)}
          ${formField("Inicio", "startDate", isoDate(client.startDate), true, "", "date")}
          ${formField("Proximo cobro", "nextBillingDate", isoDate(client.nextBillingDate), true, "", "date")}
          ${formSelect("Categoria", "categoryId", buildCategoryOptions("Selecciona una categoria", true), client.categoryId, false)}
          <div class="md:col-span-2 rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/70">
            <div class="grid gap-3 md:grid-cols-3">
              <div><p class="text-xs uppercase tracking-[0.18em] text-slate-400">Meses activos</p><p class="mt-2 text-xl font-bold text-slate-900 dark:text-white">${financials.monthsActive}</p></div>
              <div><p class="text-xs uppercase tracking-[0.18em] text-slate-400">Facturacion</p><p class="mt-2 text-xl font-bold text-slate-900 dark:text-white">${money(financials.totalRevenue)}</p></div>
              <div><p class="text-xs uppercase tracking-[0.18em] text-slate-400">Fee mensual</p><p class="mt-2 text-xl font-bold text-slate-900 dark:text-white">${money(financials.monthlyPrice)}</p></div>
            </div>
          </div>
          <div class="md:col-span-2">
            <label class="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Notas</label>
            <textarea name="notes" rows="4" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-white">${escapeHtml(client.notes || "")}</textarea>
          </div>
          <div class="md:col-span-2 flex justify-end">
            <button type="button" data-save-client class="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-soft">Guardar cliente</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function submitCategoryForm(formData) {
  const name = String(formData.get("name") || "").trim();
  const id = String(formData.get("id") || "");
  if (!name) return toast("El nombre es obligatorio.", true);
  if (id) {
    state.data.categories = state.data.categories.map((category) => category.id === id ? { ...category, name } : category);
    toast("Categoria actualizada.");
  } else {
    state.data.categories.unshift({ id: cryptoId("cat"), name, createdAt: new Date().toISOString() });
    toast("Categoria creada.");
  }
  saveData();
  closeModal();
  renderApp();
}

function submitLeadForm(formData) {
  const payload = Object.fromEntries(formData.entries());
  const leadId = String(payload.id || "");
  const leadData = buildLead({
    ...payload,
    rating: Number(payload.rating) || 0,
    reviews: Number(payload.reviews) || 0,
    status: payload.status || "Sin contactar"
  });
  if (!leadData.name) return toast("El nombre del negocio es obligatorio.", true);

  if (leadId) {
    const original = findLead(leadId);
    state.data.leads = state.data.leads.map((lead) => lead.id === leadId ? { ...leadData, id: leadId, dateAdded: original.dateAdded, lastContactDate: original.lastContactDate } : lead);
    toast("Lead actualizado.");
  } else {
    state.data.leads.unshift(leadData);
    toast("Lead creado.");
  }

  if (leadData.status === "Cliente") upsertClientFromLead(leadId || leadData.id);
  saveData();
  closeModal();
  renderApp();
}

function submitClientForm(formData) {
  const payload = Object.fromEntries(formData.entries());
  const clientId = String(payload.id || "");
  const nextClient = buildClient({
    ...payload,
    leadId: payload.leadId || "",
    monthlyPrice: Number(payload.monthlyPrice) || 0,
    serviceType: payload.serviceType || "Landing"
  });

  if (clientId && state.data.clients.some((client) => client.id === clientId)) {
    nextClient.id = clientId;
    state.data.clients = state.data.clients.map((client) => client.id === clientId ? nextClient : client);
    toast("Cliente actualizado.");
  } else {
    state.data.clients.unshift(nextClient);
    toast("Cliente creado.");
  }

  saveData();
  closeModal();
  renderApp();
}

function deleteCategory(categoryId) {
  const category = findCategory(categoryId);
  if (!category) return;
  if (!confirm(`Eliminar la categoria "${category.name}"? Los leads quedaran sin categoria.`)) return;
  state.data.categories = state.data.categories.filter((item) => item.id !== categoryId);
  state.data.leads = state.data.leads.map((lead) => lead.categoryId === categoryId ? { ...lead, categoryId: "" } : lead);
  state.data.clients = state.data.clients.map((client) => client.categoryId === categoryId ? { ...client, categoryId: "" } : client);
  if (state.activeCategoryId === categoryId) state.activeCategoryId = "all";
  saveData();
  renderApp();
  toast("Categoria eliminada.");
}

function updateLeadStatus(leadId, status) {
  state.data.leads = state.data.leads.map((lead) => lead.id === leadId ? { ...lead, status, lastContactDate: new Date().toISOString() } : lead);
  if (status === "Cliente") upsertClientFromLead(leadId);
  saveData();
  renderApp();
  toast(`Estado actualizado a ${status}.`);
}

function upsertClientFromLead(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  const existing = state.data.clients.find((client) => client.leadId === lead.id);
  if (existing) return;
  const client = buildClient({ ...mapLeadToClientPayload(lead, state.data.clients), leadId: lead.id, businessName: lead.name });
  state.data.clients.unshift(client);
}

async function confirmImport() {
  if (!state.importRows.length) return toast("Primero carga un archivo para importar.", true);
  const select = document.getElementById("import-category");
  const categoryId = select?.value || "";
  const rows = state.importRows.map((row) => buildLead({ ...row, categoryId, status: "Sin contactar" }));
  state.data.leads = [...rows, ...state.data.leads];
  state.importRows = [];
  state.importFileName = "";
  saveData();
  state.activeSection = "leads";
  renderApp();
  toast(`${rows.length} leads importados.`);
}

function exportData(type) {
  if (type === "leads") {
    exportCsvRows("leads.csv", state.data.leads.map((lead) => ({
      Nombre: lead.name,
      Direccion: lead.address,
      Telefono: lead.phone,
      "Sitio web": lead.website,
      Facebook: lead.facebook,
      Instagram: lead.instagram,
      Twitter: lead.twitter,
      Rating: lead.rating,
      Reseñas: lead.reviews,
      Estado: lead.status,
      Categoria: getCategoryName(lead.categoryId),
      Notas: lead.notes,
      "Fecha alta": lead.dateAdded,
      "Ultimo contacto": lead.lastContactDate
    })));
  }
  if (type === "clients") {
    exportCsvRows("clientes.csv", state.data.clients.map((client) => ({
      Negocio: client.businessName,
      Servicio: normalizeServiceType(client.serviceType),
      "Precio mensual": client.monthlyPrice,
      Inicio: client.startDate,
      "Proximo cobro": client.nextBillingDate,
      Pago: client.paymentStatus,
      Categoria: getCategoryName(client.categoryId),
      Notas: client.notes
    })));
  }
  if (type === "revenue") {
    const report = buildRevenueReport(state.data.clients, state.data.categories);
    exportCsvRows("reporte-ingresos.csv", report.clientSeries.map((item) => ({
      Negocio: item.businessName,
      Categoria: item.category,
      "Precio mensual": item.monthlyPrice,
      "Meses activos": item.monthsActive,
      "Facturacion total": item.totalRevenue
    })));
  }
  toast("Exportacion lista.");
}
function getFilteredLeads() {
  const filters = { ...state.leadFilters };
  if (state.activeCategoryId !== "all" && filters.categoryId === "all") filters.categoryId = state.activeCategoryId;
  return filterLeads(sortByNewest(state.data.leads), filters, state.data.categories);
}

function findLead(leadId) {
  return state.data.leads.find((lead) => lead.id === leadId);
}

function findClient(clientId) {
  return state.data.clients.find((client) => client.id === clientId);
}

function findCategory(categoryId) {
  return state.data.categories.find((category) => category.id === categoryId);
}

function getCategoryName(categoryId) {
  return state.data.categories.find((category) => category.id === categoryId)?.name || "Sin categoria";
}

function buildCategoryOptions(placeholder, allowEmpty = false) {
  const options = state.data.categories.map((category) => ({ value: category.id, label: category.name }));
  return [{ value: allowEmpty ? "" : "all", label: placeholder }, ...options];
}

function filterSelect(id, current, options) {
  return `
    <select id="${id}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      ${options.map((option) => `<option value="${option.value}" ${String(option.value) === String(current) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>
  `;
}

function formField(label, name, value = "", required = false, wrapperClass = "", type = "text", min = "", step = "") {
  return `
    <div class="${wrapperClass}">
      <label class="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">${label}</label>
      <input type="${type}" name="${name}" value="${escapeAttr(value)}" ${required ? "required" : ""} ${min !== "" ? `min="${min}"` : ""} ${step !== "" ? `step="${step}"` : ""} class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-white">
    </div>
  `;
}

function formSelect(label, name, options, current, required = false) {
  return `
    <div>
      <label class="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">${label}</label>
      <select name="${name}" ${required ? "required" : ""} class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        ${options.map((option) => `<option value="${option.value}" ${String(option.value) === String(current) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </div>
  `;
}

function whatsappAction(lead) {
  if (!lead?.phone) return "";
  return `<button class="crm-pill text-sm font-semibold text-emerald-600 dark:text-emerald-300" data-whatsapp="${lead.id}">Enviar WhatsApp</button>`;
}

function quickLeadActions(lead) {
  return `
    <button class="crm-pill text-sm font-semibold text-slate-600 dark:text-slate-300" data-quick-status="${lead.id}:Contactado">Marcar contactado</button>
    <button class="crm-pill text-sm font-semibold text-amber-600 dark:text-amber-300" data-quick-status="${lead.id}:Interesado">Marcar interesado</button>
    <button class="crm-pill text-sm font-semibold text-rose-600 dark:text-rose-300" data-quick-status="${lead.id}:Rechazado">Marcar rechazado</button>
    <button class="crm-pill text-sm font-semibold text-emerald-600 dark:text-emerald-300" data-quick-status="${lead.id}:Cliente">Convertir a cliente</button>
    <button class="crm-pill text-sm font-semibold text-rose-600 dark:text-rose-300" data-delete-lead="${lead.id}">Eliminar lead</button>
  `;
}

document.addEventListener("click", (event) => {
  const quick = event.target.closest("[data-quick-status]");
  if (!quick) return;
  const [leadId, status] = quick.dataset.quickStatus.split(":");
  updateLeadStatus(leadId, status);
  const lead = findLead(leadId);
  if (lead) openLeadModal(lead);
});




function removeLead(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  if (!confirm(`Eliminar el lead "${lead.name}"?`)) return;
  state.data.leads = state.data.leads.filter((item) => item.id !== leadId);
  state.data.clients = state.data.clients.filter((client) => client.leadId !== leadId);
  saveData();
  closeModal();
  renderApp();
  toast("Lead eliminado.");
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", state.theme === "dark");
  localStorage.setItem("crm-theme", state.theme);
  renderApp();
}

function toast(message, isError = false) {
  const item = document.createElement("div");
  item.className = `pointer-events-auto rounded-2xl px-4 py-3 text-sm font-semibold shadow-soft ${isError ? "bg-rose-500 text-white" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"}`;
  item.textContent = message;
  toastRoot.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function initials(value) {
  return String(value || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function normalizeServiceType(value) {
  if (value === "Both") return "Ambos";
  return value || "Landing";
}

function emptyState(text) {
  return `<div class="rounded-[1.8rem] border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">${text}</div>`;
}

function openWhatsApp(lead) {
  if (!lead?.phone) {
    toast("Este lead no tiene telefono cargado.", true);
    return;
  }
  const digits = String(lead.phone).replace(/[^\d]/g, "");
  if (!digits) {
    toast("No pudimos interpretar el telefono para WhatsApp.", true);
    return;
  }
  const message = encodeURIComponent(`Hola ${lead.name || ""}, te contacto por una propuesta para mejorar tu presencia digital con landing page y Google Maps.`.trim());
  window.open(`https://wa.me/${digits}?text=${message}`, "_blank", "noopener,noreferrer");
}

function anchor(url, label) {
  return `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer" class="font-semibold text-brand hover:underline">${label}</a>`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function isoDate(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function money(value) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
}

function cryptoId(prefix) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${random}_${Date.now().toString(36)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

init();
























