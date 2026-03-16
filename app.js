
import { storage, createId, createSeedData, exportCsvRows } from "./modules/storage.js";
import { parseImportFile } from "./modules/importer.js";
import { LEAD_STATUSES, STATUS_META, buildLead, filterLeads, groupLeadsByStatus, mapLeadToClientPayload, sortByNewest, summarizeLeads } from "./modules/leadManager.js";
import { renderDashboard, renderStatistics, buildRevenueReport } from "./modules/dashboard.js";
import { createChartsManager } from "./modules/charts.js";
import { computeClientFinancials, buildClient, filterClients } from "./modules/clients.js";

const state = {
  currentSection: "dashboard",
  currentCategoryId: "all",
  leadsView: "list",
  leadFilters: { search: "", categoryId: "all", status: "all", rating: "all" },
  clientFilters: { search: "", categoryId: "all", paymentStatus: "all" },
  data: storage.load(),
  charts: null
};

if (!state.data.categories.length && !state.data.leads.length) {
  state.data = createSeedData();
  storage.save(state.data);
}

const sections = [
  ["dashboard", "Dashboard", "◫"],
  ["categories", "Categories", "⊚"],
  ["leads", "Leads", "▤"],
  ["clients", "Clients", "◉"],
  ["import", "Import Data", "⇪"],
  ["statistics", "Statistics", "◌"],
  ["settings", "Settings", "⚙"]
];

const $ = (selector) => document.querySelector(selector);

init();

function init() {
  state.charts = createChartsManager();
  bindEvents();
  renderAll();
}

function bindEvents() {
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("change", handleChange);
  document.body.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleShortcut);
  $("#global-search").addEventListener("input", (event) => {
    const value = event.target.value.trim().toLowerCase();
    state.leadFilters.search = value;
    state.clientFilters.search = value;
    if (state.currentSection === "clients") renderClientsSection();
    else renderLeadsSection();
  });
}

function handleClick(event) {
  const t = event.target;
  if (t.closest("[data-section]")) {
    state.currentSection = t.closest("[data-section]").dataset.section;
    renderAll();
    return;
  }
  if (t.closest("[data-category-nav]")) {
    state.currentCategoryId = t.closest("[data-category-nav]").dataset.categoryNav;
    state.leadFilters.categoryId = state.currentCategoryId;
    state.currentSection = "leads";
    renderAll();
    return;
  }
  if (t.closest("#add-lead-btn") || t.closest("#leads-add-secondary")) return openLeadModal();
  if (t.closest("#add-category-btn") || t.closest("#categories-add-secondary")) return openCategoryModal();
  if (t.closest("[data-open-lead]")) return openLeadDetail(t.closest("[data-open-lead]").dataset.openLead);
  if (t.closest("[data-quick-status]")) return cycleLeadStatus(t.closest("[data-quick-status]").dataset.quickStatus);
  if (t.closest("[data-delete-lead]")) return removeLead(t.closest("[data-delete-lead]").dataset.deleteLead);
  if (t.closest("[data-edit-category]")) return openCategoryModal(findCategory(t.closest("[data-edit-category]").dataset.editCategory));
  if (t.closest("[data-delete-category]")) return deleteCategoryById(t.closest("[data-delete-category]").dataset.deleteCategory);
  if (t.closest("[data-export]")) return exportDataset(t.closest("[data-export]").dataset.export);
  if (t.closest("[data-view-mode]")) {
    state.leadsView = t.closest("[data-view-mode]").dataset.viewMode;
    renderLeadsSection();
    return;
  }
  if (t.closest("[data-edit-client]")) {
    const client = findClient(t.closest("[data-edit-client]").dataset.editClient);
    return openClientModal(client?.leadId, client);
  }
  if (t.closest("[data-delete-client]")) return removeClient(t.closest("[data-delete-client]").dataset.deleteClient);
  if (t.closest("[data-load-demo]")) return importDemoData();
  if (t.closest("#reset-demo-data")) {
    state.data = createSeedData();
    return saveAndRender("Sample data reset");
  }
  if (t.closest("[data-close-modal]") || t.dataset.modalBackdrop === "true") return closeModal();
}

function handleChange(event) {
  const t = event.target;
  if (t.matches("[data-status-select]")) return updateLead(t.dataset.statusSelect, { status: t.value, lastContactDate: new Date().toISOString() });
  if (t.matches("#import-file")) return handleImportFile(t.files?.[0]);
}

function handleInput(event) {
  const t = event.target;
  if (t.matches("[data-filter]")) {
    state.leadFilters[t.dataset.filter] = t.value;
    renderLeadsSection();
    return;
  }
  if (t.matches("[data-client-filter]")) {
    state.clientFilters[t.dataset.clientFilter] = t.value;
    renderClientsSection();
  }
}

function handleShortcut(event) {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "/") {
    event.preventDefault();
    return $("#global-search").focus();
  }
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    return openLeadModal();
  }
  if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    state.currentSection = "leads";
    state.leadsView = state.leadsView === "list" ? "kanban" : "list";
    renderAll();
  }
}

function renderAll() {
  renderNav();
  sections.forEach(([key, label]) => {
    const section = document.getElementById(`${key}-section`);
    section.classList.toggle("hidden", key !== state.currentSection);
    if (key === state.currentSection) {
      $("#page-eyebrow").textContent = label;
      $("#page-title").textContent = pageTitle(key);
    }
  });
  renderDashboardSection();
  renderCategoriesSection();
  renderLeadsSection();
  renderClientsSection();
  renderImportSection();
  renderStatisticsSection();
  renderSettingsSection();
}

function renderNav() {
  $("#nav-sections").innerHTML = sections.map(([key, label, icon]) => `
    <button class="nav-item w-full text-left ${state.currentSection === key ? "active" : ""}" data-section="${key}">
      <span class="text-base">${icon}</span>
      <span class="font-medium">${label}</span>
    </button>
  `).join("");
  const items = [{ id: "all", name: "All categories", count: state.data.leads.length }].concat(state.data.categories.map((category) => ({ id: category.id, name: category.name, count: state.data.leads.filter((lead) => lead.categoryId === category.id).length })));
  $("#sidebar-categories").innerHTML = items.map((item) => `
    <button class="category-item w-full justify-between text-left ${state.currentCategoryId === item.id ? "active" : ""}" data-category-nav="${item.id}">
      <span class="truncate">${escapeHtml(item.name)}</span>
      <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">${item.count}</span>
    </button>
  `).join("");
}
function renderDashboardSection() {
  $("#dashboard-section").innerHTML = renderDashboard(state.data, summarizeLeads(state.data.leads), buildRevenueReport(state.data.clients, state.data.categories));
}

function renderCategoriesSection() {
  const cards = state.data.categories.map((category) => {
    const totalLeads = state.data.leads.filter((lead) => lead.categoryId === category.id).length;
    const clientCount = state.data.clients.filter((client) => client.categoryId === category.id).length;
    return `
      <div class="category-card surface-card p-5">
        <div class="flex items-start justify-between gap-4">
          <div><p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Category</p><h3 class="mt-2 text-lg font-bold text-slate-900">${escapeHtml(category.name)}</h3></div>
          <div class="flex gap-2"><button data-edit-category="${category.id}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand">Rename</button><button data-delete-category="${category.id}" class="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50">Delete</button></div>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2"><div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs uppercase tracking-[0.2em] text-slate-400">Leads</p><p class="mt-2 text-2xl font-bold">${totalLeads}</p></div><div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs uppercase tracking-[0.2em] text-slate-400">Clients</p><p class="mt-2 text-2xl font-bold">${clientCount}</p></div></div>
      </div>
    `;
  }).join("");
  $("#categories-section").innerHTML = `<div class="flex items-center justify-between"><p class="text-sm text-slate-500">Build dedicated lead buckets for each local business niche.</p><button id="categories-add-secondary" class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft">Create Category</button></div><div class="grid gap-4 lg:grid-cols-2">${cards || `<div class="surface-card p-6 text-sm text-slate-500">No categories yet.</div>`}</div>`;
}

function renderLeadsSection() {
  const filtered = sortByNewest(filterLeads(state.data.leads, state.leadFilters, state.data.categories));
  const summary = summarizeLeads(filtered);
  $("#leads-section").innerHTML = `
    <div class="surface-card p-4 sm:p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap gap-3">
          <select data-filter="categoryId" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">${buildCategoryOptions(state.leadFilters.categoryId)}</select>
          <select data-filter="status" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="all">All statuses</option>${LEAD_STATUSES.map((status) => `<option value="${status}" ${state.leadFilters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
          <select data-filter="rating" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="all">Any rating</option><option value="4" ${state.leadFilters.rating === "4" ? "selected" : ""}>4.0+</option><option value="3" ${state.leadFilters.rating === "3" ? "selected" : ""}>3.0+</option><option value="2" ${state.leadFilters.rating === "2" ? "selected" : ""}>2.0+</option></select>
        </div>
        <div class="flex items-center gap-3"><div class="rounded-2xl bg-slate-100 p-1"><button data-view-mode="list" class="rounded-xl px-3 py-2 text-sm font-semibold ${state.leadsView === "list" ? "bg-white text-slate-900 shadow-soft" : "text-slate-500"}">List</button><button data-view-mode="kanban" class="rounded-xl px-3 py-2 text-sm font-semibold ${state.leadsView === "kanban" ? "bg-white text-slate-900 shadow-soft" : "text-slate-500"}">Kanban</button></div><button id="leads-add-secondary" class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft">Add Lead</button></div>
      </div>
    </div>
    <div class="grid gap-4 xl:grid-cols-4">${metric("Visible leads", summary.total, "from current filters")}${metric("Interested", summary.interested, "high intent prospects")}${metric("Clients", summary.clients, "won opportunities")}${metric("Rejected", summary.rejected, "closed lost")}</div>
    ${state.leadsView === "list" ? renderLeadListShell(filtered) : renderKanban(filtered)}
  `;
  if (state.leadsView === "list") mountVirtualList(filtered);
}

function renderLeadListShell(filtered) {
  return `<div class="surface-card overflow-hidden"><div class="hidden border-b border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 md:block"><div class="lead-row !min-h-0 !border-b-0 !px-0"><span>Business</span><span>Phone</span><span>Website</span><span>Status</span><span>Category</span><span></span></div></div><div id="virtual-list" class="virtual-list"></div>${!filtered.length ? `<div class="p-6 text-sm text-slate-500">No leads match the current filters.</div>` : ""}</div>`;
}

function mountVirtualList(leads) {
  const host = $("#virtual-list");
  if (!host) return;
  const rowHeight = 72;
  const overscan = 6;
  if (window.innerWidth < 768) {
    host.style.height = "auto";
    host.innerHTML = leads.slice(0, 300).map(renderLeadRow).join("") + (leads.length > 300 ? `<div class="p-4 text-xs text-slate-500">Showing first 300 rows on mobile for performance.</div>` : "");
    return;
  }
  function renderViewport() {
    const containerHeight = host.clientHeight || 620;
    const scrollTop = host.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / rowHeight) + overscan * 2;
    const end = Math.min(leads.length, start + visibleCount);
    const offsetY = start * rowHeight;
    const rows = leads.slice(start, end).map(renderLeadRow).join("");
    host.innerHTML = `<div class="virtual-spacer" style="height:${leads.length * rowHeight}px"><div style="transform:translateY(${offsetY}px)">${rows}</div></div>`;
  }
  host.onscroll = renderViewport;
  renderViewport();
}

function renderLeadRow(lead) {
  return `
    <div class="lead-row cursor-pointer" data-open-lead="${lead.id}">
      <div class="min-w-0"><p class="truncate font-semibold text-slate-900">${escapeHtml(lead.name)}</p><p class="truncate text-xs text-slate-500">${escapeHtml(lead.address || "No address")}</p></div>
      <div class="truncate text-sm text-slate-600">${escapeHtml(lead.phone || "No phone")}</div>
      <div class="truncate text-sm">${lead.website ? `<a href="${escapeAttribute(lead.website)}" target="_blank" class="text-brand hover:underline" onclick="event.stopPropagation()">${escapeHtml(stripProtocol(lead.website))}</a>` : `<span class="text-slate-400">No website</span>`}</div>
      <div><select data-status-select="${lead.id}" onclick="event.stopPropagation()" class="rounded-full border px-3 py-2 text-xs font-semibold ${STATUS_META[lead.status].select}">${LEAD_STATUSES.map((status) => `<option value="${status}" ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      <div class="text-sm text-slate-600">${escapeHtml(getCategoryName(lead.categoryId))}</div>
      <button data-quick-status="${lead.id}" onclick="event.stopPropagation()" class="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand">Next</button>
    </div>
  `;
}

function renderKanban(leads) {
  const grouped = groupLeadsByStatus(leads);
  return `<div class="grid gap-4 xl:grid-cols-6">${LEAD_STATUSES.map((status) => `
    <div class="kanban-column surface-card p-4"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full ${STATUS_META[status].dot}"></span><h3 class="font-semibold text-slate-900">${status}</h3></div><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">${grouped[status].length}</span></div><div class="mt-4 space-y-3">${grouped[status].slice(0, 120).map((lead) => `<button data-open-lead="${lead.id}" class="kanban-card w-full rounded-2xl border border-slate-200 bg-white p-4 text-left"><div class="flex items-start justify-between gap-3"><div><p class="font-semibold text-slate-900">${escapeHtml(lead.name)}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(getCategoryName(lead.categoryId))}</p></div><span class="badge ${STATUS_META[lead.status].badge}">${lead.rating ? `${lead.rating}★` : "No rate"}</span></div><p class="mt-3 text-sm text-slate-500">${escapeHtml(lead.address || "No address saved")}</p></button>`).join("")}${grouped[status].length > 120 ? `<p class="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-500">Showing first 120 cards. Use list view for full-volume review.</p>` : ""}</div></div>
  `).join("")}</div>`;
}
function renderClientsSection() {
  const clients = filterClients(state.data.clients, state.clientFilters, state.data.categories).map(computeClientFinancials);
  const totalMrr = clients.reduce((sum, client) => sum + client.monthlyPrice, 0);
  const totalRevenue = clients.reduce((sum, client) => sum + client.totalRevenue, 0);
  $("#clients-section").innerHTML = `
    <div class="surface-card p-4 sm:p-5"><div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div class="flex flex-wrap gap-3"><select data-client-filter="categoryId" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">${buildCategoryOptions(state.clientFilters.categoryId)}</select><select data-client-filter="paymentStatus" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="all">Any payment status</option><option value="Paid" ${state.clientFilters.paymentStatus === "Paid" ? "selected" : ""}>Paid</option><option value="Pending" ${state.clientFilters.paymentStatus === "Pending" ? "selected" : ""}>Pending</option><option value="Overdue" ${state.clientFilters.paymentStatus === "Overdue" ? "selected" : ""}>Overdue</option></select></div><button data-export="clients" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-brand hover:text-brand">Export Clients CSV</button></div></div>
    <div class="grid gap-4 lg:grid-cols-3">${metric("Active clients", clients.length, "current paying accounts")}${metric("MRR", formatMoney(totalMrr), "monthly recurring revenue")}${metric("Total revenue", formatMoney(totalRevenue), "lifetime estimated value")}</div>
    <div class="grid gap-4 xl:grid-cols-2">${clients.map(renderClientCard).join("") || `<div class="surface-card p-6 text-sm text-slate-500">No clients yet.</div>`}</div>
  `;
}

function renderClientCard(client) {
  return `<article class="client-card surface-card p-5"><div class="flex items-start justify-between gap-4"><div><p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">${escapeHtml(getCategoryName(client.categoryId))}</p><h3 class="mt-2 text-xl font-bold text-slate-900">${escapeHtml(client.businessName)}</h3></div><span class="badge ${client.paymentStatus === "Paid" ? "bg-emerald-100 text-emerald-700" : client.paymentStatus === "Pending" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}">${escapeHtml(client.paymentStatus)}</span></div><div class="mt-5 grid gap-3 sm:grid-cols-2">${clientMetric("Service", client.serviceType)}${clientMetric("Monthly price", formatMoney(client.monthlyPrice))}${clientMetric("Start date", formatDate(client.startDate))}${clientMetric("Next billing", formatDate(client.nextBillingDate))}${clientMetric("Months active", client.monthsActive)}${clientMetric("Revenue", formatMoney(client.totalRevenue))}</div><p class="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">${escapeHtml(client.notes || "No notes yet.")}</p><div class="mt-4 flex gap-3"><button data-edit-client="${client.id}" class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand hover:text-brand">Edit</button><button data-delete-client="${client.id}" class="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50">Delete</button></div></article>`;
}

function renderImportSection() {
  $("#import-section").innerHTML = `<div class="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]"><div class="surface-card p-6"><p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Import businesses</p><h3 class="mt-2 text-2xl font-bold text-slate-900">Upload CSV or Excel exports</h3><p class="mt-3 max-w-2xl text-sm text-slate-500">Supports .csv, .xlsx, and common Google Maps scraper columns like name, address, phone, website, social URLs, rating, and reviews.</p><div class="mt-6 grid gap-4 md:grid-cols-2"><label class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-brand hover:bg-indigo-50"><input id="import-file" type="file" accept=".csv,.xlsx,.xls" class="hidden"><span class="block text-sm font-semibold text-slate-700">Drop or choose file</span><span class="mt-2 block text-xs text-slate-500">SheetJS handles Excel imports in-browser.</span></label><div class="rounded-3xl bg-slate-900 p-6 text-white"><p class="text-sm font-semibold">Recommended columns</p><p class="mt-3 text-xs leading-6 text-slate-300">Name, Address, Phone, Website, Facebook, Instagram, Twitter, Rating, Reviews</p><button data-load-demo="true" class="mt-4 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">Load demo dataset</button></div></div></div><div class="surface-card p-6"><p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Import mapping</p><div class="mt-4 space-y-4 text-sm text-slate-600"><div class="rounded-2xl bg-slate-50 p-4">1. Choose a file and a target category after parsing.</div><div class="rounded-2xl bg-slate-50 p-4">2. Preview record count before saving.</div><div class="rounded-2xl bg-slate-50 p-4">3. Bulk import runs client-side and persists in LocalStorage.</div></div></div></div>`;
}

function renderStatisticsSection() {
  $("#statistics-section").innerHTML = renderStatistics(state.data, buildRevenueReport(state.data.clients, state.data.categories));
  state.charts.render(state.data);
}

function renderSettingsSection() {
  $("#settings-section").innerHTML = `<div class="grid gap-4 xl:grid-cols-2"><div class="surface-card p-6"><p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Data exports</p><h3 class="mt-2 text-xl font-bold text-slate-900">Take your CRM data anywhere</h3><div class="mt-5 flex flex-wrap gap-3"><button data-export="leads" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-brand hover:text-brand">Export Leads CSV</button><button data-export="clients" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-brand hover:text-brand">Export Clients CSV</button><button data-export="revenue" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-brand hover:text-brand">Export Revenue Report</button></div></div><div class="surface-card p-6"><p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Persistence</p><h3 class="mt-2 text-xl font-bold text-slate-900">Offline-first by default</h3><p class="mt-3 text-sm text-slate-500">All categories, leads, and clients are stored locally in your browser so the site deploys cleanly on Netlify without a backend.</p><button id="reset-demo-data" class="mt-5 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-500 hover:bg-rose-50">Reset sample data</button></div></div>`;
}

function openCategoryModal(category) {
  openModal({ title: category ? "Rename Category" : "Create Category", body: `<form id="category-form" class="space-y-4"><div><label class="mb-2 block text-sm font-semibold text-slate-700">Category name</label><input name="name" required value="${escapeAttribute(category?.name || "")}" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Rotiserias, Dentists, Gyms"></div><div class="flex justify-end gap-3"><button type="button" data-close-modal class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white">${category ? "Save changes" : "Create category"}</button></div></form>`, onOpen() { $("#category-form").addEventListener("submit", (event) => { event.preventDefault(); const name = String(new FormData(event.target).get("name")).trim(); if (!name) return; if (category) category.name = name; else state.data.categories.push({ id: createId("cat"), name, createdAt: new Date().toISOString() }); closeModal(); saveAndRender("Category saved"); }); } });
}

function openLeadModal(existingLead) {
  const lead = existingLead || {};
  openModal({ title: existingLead ? "Edit Lead" : "Add Lead", body: `<form id="lead-form" class="grid gap-4 md:grid-cols-2">${field("Name", "name", lead.name, true)}${field("Address", "address", lead.address)}${field("Phone", "phone", lead.phone)}${field("Website", "website", lead.website)}${field("Facebook", "facebook", lead.facebook)}${field("Instagram", "instagram", lead.instagram)}${field("Twitter", "twitter", lead.twitter)}<div><label class="mb-2 block text-sm font-semibold text-slate-700">Category</label><select name="categoryId" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${buildCategoryOptions(lead.categoryId || state.currentCategoryId, true)}</select></div><div class="md:col-span-2"><label class="mb-2 block text-sm font-semibold text-slate-700">Notes</label><textarea name="notes" rows="4" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${escapeHtml(lead.notes || "")}</textarea></div><div class="md:col-span-2 flex justify-end gap-3"><button type="button" data-close-modal class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white">${existingLead ? "Update lead" : "Save lead"}</button></div></form>`, onOpen() { $("#lead-form").addEventListener("submit", (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.target).entries()); if (existingLead) Object.assign(existingLead, payload); else state.data.leads.unshift(buildLead(payload)); closeModal(); saveAndRender(existingLead ? "Lead updated" : "Lead created"); }); } });
}

function openLeadDetail(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  openModal({ title: lead.name, wide: true, body: `<div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div class="space-y-4"><div class="grid gap-3 sm:grid-cols-2">${detailItem("Address", lead.address || "No address")}${detailItem("Phone", lead.phone || "No phone")}${detailItem("Website", lead.website ? `<a class="text-brand hover:underline" href="${escapeAttribute(lead.website)}" target="_blank">${escapeHtml(lead.website)}</a>` : "No website")}${detailItem("Category", getCategoryName(lead.categoryId))}${detailItem("Rating", lead.rating ? `${lead.rating} / 5` : "No rating")}${detailItem("Reviews", lead.reviews || "0")}</div><div class="grid gap-3 sm:grid-cols-3">${detailItem("Facebook", socialLink(lead.facebook))}${detailItem("Instagram", socialLink(lead.instagram))}${detailItem("Twitter", socialLink(lead.twitter))}</div><div class="rounded-3xl bg-slate-50 p-5"><p class="text-sm font-semibold text-slate-900">Conversation notes</p><textarea id="lead-notes" rows="7" class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">${escapeHtml(lead.notes || "")}</textarea><div class="mt-3 flex justify-end"><button id="save-lead-notes" class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save notes</button></div></div></div><div class="space-y-4"><div class="rounded-3xl bg-slate-900 p-5 text-white"><p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Pipeline stage</p><h3 class="mt-2 text-xl font-bold">${lead.status}</h3><p class="mt-2 text-sm text-slate-300">Added ${formatDate(lead.dateAdded)}. Last contact ${formatDate(lead.lastContactDate || lead.dateAdded)}.</p></div><div class="surface-card !shadow-none p-5"><p class="text-sm font-semibold text-slate-900">Actions</p><div class="mt-4 grid gap-3"><button data-detail-status="Contacted" class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">Mark as contacted</button><button data-detail-status="Rejected" class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">Mark as rejected</button><button data-detail-status="Interested" class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">Mark as interested</button><button id="convert-current-lead" class="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">Convert to client</button></div><div class="mt-4 flex gap-3"><button id="edit-current-lead" class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Edit lead</button><button data-delete-lead="${lead.id}" class="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-500">Delete</button></div></div></div></div>`, onOpen() { $("#save-lead-notes").addEventListener("click", () => { lead.notes = $("#lead-notes").value; saveAndRender("Notes updated"); openLeadDetail(lead.id); }); document.querySelectorAll("[data-detail-status]").forEach((button) => button.addEventListener("click", () => { updateLead(lead.id, { status: button.dataset.detailStatus, lastContactDate: new Date().toISOString() }); openLeadDetail(lead.id); })); $("#edit-current-lead").addEventListener("click", () => { closeModal(); openLeadModal(lead); }); $("#convert-current-lead").addEventListener("click", () => { closeModal(); openClientModal(lead.id); }); } });
}
function openClientModal(leadId, existingClient) {
  const lead = findLead(leadId);
  const defaults = existingClient || mapLeadToClientPayload(lead, state.data.clients);
  openModal({ title: existingClient ? "Edit Client" : `Convert ${lead?.name || "Lead"} to Client`, body: `<form id="client-form" class="grid gap-4 md:grid-cols-2">${field("Business Name", "businessName", defaults.businessName, true)}<div><label class="mb-2 block text-sm font-semibold text-slate-700">Service Type</label><select name="serviceType" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${["Landing", "SEO", "Both"].map((value) => `<option value="${value}" ${defaults.serviceType === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div><label class="mb-2 block text-sm font-semibold text-slate-700">Monthly Price</label><input name="monthlyPrice" type="number" min="0" step="1" value="${escapeAttribute(defaults.monthlyPrice || "")}" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"></div><div><label class="mb-2 block text-sm font-semibold text-slate-700">Start Date</label><input name="startDate" type="date" value="${toDateInput(defaults.startDate)}" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"></div><div><label class="mb-2 block text-sm font-semibold text-slate-700">Next Billing Date</label><input name="nextBillingDate" type="date" value="${toDateInput(defaults.nextBillingDate)}" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"></div><div><label class="mb-2 block text-sm font-semibold text-slate-700">Payment Status</label><select name="paymentStatus" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${["Paid", "Pending", "Overdue"].map((value) => `<option value="${value}" ${defaults.paymentStatus === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div><label class="mb-2 block text-sm font-semibold text-slate-700">Category</label><select name="categoryId" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${buildCategoryOptions(defaults.categoryId, true)}</select></div><div class="md:col-span-2"><label class="mb-2 block text-sm font-semibold text-slate-700">Notes</label><textarea name="notes" rows="4" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${escapeHtml(defaults.notes || "")}</textarea></div><div class="md:col-span-2 flex justify-end gap-3"><button type="button" data-close-modal class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white">${existingClient ? "Save client" : "Convert to client"}</button></div></form>`, onOpen() { $("#client-form").addEventListener("submit", (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.target).entries()); if (existingClient) Object.assign(existingClient, payload); else state.data.clients.unshift(buildClient({ ...payload, leadId })); if (lead) { lead.status = "Client"; lead.lastContactDate = new Date().toISOString(); } closeModal(); saveAndRender(existingClient ? "Client updated" : "Lead converted to client"); }); } });
}

function openImportPreviewModal(records) {
  openModal({ title: "Confirm Import", wide: true, body: `<form id="import-preview-form" class="space-y-5"><div class="grid gap-4 md:grid-cols-[0.7fr_1.3fr]"><div><label class="mb-2 block text-sm font-semibold text-slate-700">Assign category</label><select name="categoryId" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">${buildCategoryOptions(state.currentCategoryId, true)}</select></div><div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Parsed <strong>${records.length}</strong> businesses. Preview below shows the first 8 rows.</div></div><div class="overflow-x-auto rounded-2xl border border-slate-200"><table class="min-w-full divide-y divide-slate-200 text-sm"><thead class="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-400"><tr><th class="px-4 py-3">Name</th><th class="px-4 py-3">Phone</th><th class="px-4 py-3">Website</th><th class="px-4 py-3">Rating</th></tr></thead><tbody class="divide-y divide-slate-100">${records.slice(0, 8).map((record) => `<tr><td class="px-4 py-3">${escapeHtml(record.name || "")}</td><td class="px-4 py-3">${escapeHtml(record.phone || "")}</td><td class="px-4 py-3">${escapeHtml(record.website || "")}</td><td class="px-4 py-3">${escapeHtml(String(record.rating || ""))}</td></tr>`).join("")}</tbody></table></div><div class="flex justify-end gap-3"><button type="button" data-close-modal class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" class="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white">Import ${records.length} leads</button></div></form>`, onOpen() { $("#import-preview-form").addEventListener("submit", (event) => { event.preventDefault(); const categoryId = new FormData(event.target).get("categoryId"); state.data.leads = records.map((record) => buildLead({ ...record, categoryId })).concat(state.data.leads); closeModal(); state.currentSection = "leads"; saveAndRender(`${records.length} leads imported`); }); } });
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const records = await parseImportFile(file);
    if (!records.length) return toast("No valid rows found in file", true);
    openImportPreviewModal(records);
  } catch (error) {
    toast(`Import failed: ${error.message}`, true);
  }
}

function updateLead(id, changes) {
  const lead = findLead(id);
  if (!lead) return;
  Object.assign(lead, changes);
  saveAndRender("Lead updated");
}

function cycleLeadStatus(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  const index = LEAD_STATUSES.indexOf(lead.status);
  updateLead(leadId, { status: LEAD_STATUSES[(index + 1) % LEAD_STATUSES.length], lastContactDate: new Date().toISOString() });
}

function removeLead(id) {
  state.data.leads = state.data.leads.filter((lead) => lead.id !== id);
  state.data.clients = state.data.clients.filter((client) => client.leadId !== id);
  closeModal();
  saveAndRender("Lead deleted");
}

function removeClient(id) {
  state.data.clients = state.data.clients.filter((client) => client.id !== id);
  saveAndRender("Client deleted");
}

function deleteCategoryById(id) {
  if (state.data.leads.some((lead) => lead.categoryId === id) || state.data.clients.some((client) => client.categoryId === id)) return toast("Move or remove linked leads and clients before deleting this category", true);
  state.data.categories = state.data.categories.filter((category) => category.id !== id);
  saveAndRender("Category deleted");
}

function exportDataset(type) {
  if (type === "leads") return exportCsvRows("leads-export.csv", state.data.leads.map((lead) => ({ Name: lead.name, Address: lead.address, Phone: lead.phone, Website: lead.website, Facebook: lead.facebook, Instagram: lead.instagram, Twitter: lead.twitter, Rating: lead.rating, Reviews: lead.reviews, Status: lead.status, Category: getCategoryName(lead.categoryId), Notes: lead.notes, DateAdded: lead.dateAdded, LastContactDate: lead.lastContactDate })));
  if (type === "clients") return exportCsvRows("clients-export.csv", state.data.clients.map((client) => { const stats = computeClientFinancials(client); return { BusinessName: stats.businessName, ServiceType: stats.serviceType, Category: getCategoryName(stats.categoryId), MonthlyPrice: stats.monthlyPrice, StartDate: stats.startDate, NextBillingDate: stats.nextBillingDate, PaymentStatus: stats.paymentStatus, MonthsActive: stats.monthsActive, TotalRevenue: stats.totalRevenue, Notes: stats.notes }; }));
  return exportCsvRows("revenue-report.csv", buildRevenueReport(state.data.clients, state.data.categories).clientSeries);
}

function importDemoData() {
  const categoryId = state.data.categories[0]?.id || "";
  const records = Array.from({ length: 24 }, (_, index) => ({ name: `Business ${index + 1}`, address: `${120 + index} Main Street`, phone: `+54 11 555${String(index).padStart(4, "0")}`, website: `https://business${index + 1}.example.com`, facebook: `https://facebook.com/business${index + 1}`, instagram: `https://instagram.com/business${index + 1}`, twitter: "", rating: Number((3 + (index % 3) * 0.5).toFixed(1)), reviews: 20 + index * 3, categoryId }));
  state.data.leads = records.map((record) => buildLead(record)).concat(state.data.leads);
  saveAndRender("Demo businesses imported");
}

function saveAndRender(message) { storage.save(state.data); renderAll(); if (message) toast(message); }
function buildCategoryOptions(selectedId, includeEmpty = false) { const options = []; if (!includeEmpty) options.push(`<option value="all" ${selectedId === "all" ? "selected" : ""}>All categories</option>`); if (includeEmpty) options.push(`<option value="">No category</option>`); return options.concat(state.data.categories.map((category) => `<option value="${category.id}" ${selectedId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`)).join(""); }
function openModal({ title, body, onOpen, wide = false }) { $("#modal-root").innerHTML = `<div data-modal-backdrop="true" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4 fade-in"><div class="slide-up max-h-[92vh] w-full ${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto rounded-[2rem] bg-white p-6 shadow-soft"><div class="mb-5 flex items-center justify-between gap-4"><h3 class="text-xl font-bold text-slate-900">${escapeHtml(title)}</h3><button data-close-modal class="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500">Close</button></div>${body}</div></div>`; if (onOpen) onOpen(); }
function closeModal() { $("#modal-root").innerHTML = ""; }
function toast(message, error = false) { const root = $("#toast-root"); const el = document.createElement("div"); el.className = `rounded-2xl px-4 py-3 text-sm font-semibold shadow-soft fade-in ${error ? "bg-rose-500 text-white" : "bg-slate-900 text-white"}`; el.textContent = message; root.appendChild(el); setTimeout(() => el.remove(), 2200); }
function pageTitle(key) { return { dashboard: "Sales overview", categories: "Organize by business type", leads: "Lead pipeline", clients: "Client revenue management", import: "Import business databases", statistics: "Performance analytics", settings: "Workspace preferences" }[key]; }
function metric(label, value, helper) { return `<div class="surface-card p-5"><p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">${label}</p><p class="mt-3 text-3xl font-bold text-slate-900">${value}</p><p class="mt-2 text-sm text-slate-500">${helper}</p></div>`; }
function field(label, name, value = "", required = false) { return `<div><label class="mb-2 block text-sm font-semibold text-slate-700">${label}</label><input name="${name}" ${required ? "required" : ""} value="${escapeAttribute(value || "")}" class="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"></div>`; }
function detailItem(label, value) { return `<div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">${label}</p><div class="mt-2 text-sm text-slate-700">${value}</div></div>`; }
function socialLink(value) { if (!value) return "Not provided"; return `<a class="text-brand hover:underline" href="${escapeAttribute(value)}" target="_blank">${escapeHtml(stripProtocol(value))}</a>`; }
function clientMetric(label, value) { return `<div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs uppercase tracking-[0.18em] text-slate-400">${label}</p><p class="mt-2 text-sm font-semibold text-slate-800">${escapeHtml(String(value))}</p></div>`; }
function toDateInput(value) { if (!value) return ""; return new Date(value).toISOString().slice(0, 10); }
function formatDate(value) { if (!value) return "No date"; return new Date(value).toLocaleDateString(); }
function formatMoney(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0)); }
function getCategoryName(id) { return findCategory(id)?.name || "Uncategorized"; }
function findCategory(id) { return state.data.categories.find((item) => item.id === id); }
function findLead(id) { return state.data.leads.find((item) => item.id === id); }
function findClient(id) { return state.data.clients.find((item) => item.id === id); }
function stripProtocol(value) { return String(value || "").replace(/^https?:\/\//, ""); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function escapeAttribute(value) { return escapeHtml(value).replace(/\"/g, "&quot;"); }
