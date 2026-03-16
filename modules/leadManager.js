import { createId } from "./storage.js";

export const LEAD_STATUSES = ["Not contacted", "Contacted", "Rejected", "Interested", "Negotiating", "Client"];

export const STATUS_META = {
  "Not contacted": {
    badge: "bg-slate-200 text-slate-700",
    dot: "bg-slate-400",
    select: "border-slate-200 bg-slate-50 text-slate-700"
  },
  Contacted: {
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    select: "border-blue-200 bg-blue-50 text-blue-700"
  },
  Rejected: {
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
    select: "border-rose-200 bg-rose-50 text-rose-700"
  },
  Interested: {
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    select: "border-amber-200 bg-amber-50 text-amber-700"
  },
  Negotiating: {
    badge: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
    select: "border-purple-200 bg-purple-50 text-purple-700"
  },
  Client: {
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    select: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
};

export function buildLead(payload = {}) {
  const now = new Date().toISOString();
  return {
    id: createId("lead"),
    name: String(payload.name || "").trim(),
    address: String(payload.address || "").trim(),
    phone: String(payload.phone || "").trim(),
    website: String(payload.website || "").trim(),
    facebook: String(payload.facebook || "").trim(),
    instagram: String(payload.instagram || "").trim(),
    twitter: String(payload.twitter || "").trim(),
    rating: Number(payload.rating) || 0,
    reviews: Number(payload.reviews) || 0,
    notes: String(payload.notes || "").trim(),
    status: payload.status || "Not contacted",
    categoryId: payload.categoryId || "",
    dateAdded: payload.dateAdded || now,
    lastContactDate: payload.lastContactDate || ""
  };
}

export function sortByNewest(leads) {
  return [...leads].sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
}

export function filterLeads(leads, filters, categories) {
  const search = String(filters.search || "").toLowerCase();
  const categoryMap = new Map(categories.map((category) => [category.id, category.name.toLowerCase()]));
  return leads.filter((lead) => {
    if (filters.categoryId && filters.categoryId !== "all" && lead.categoryId !== filters.categoryId) return false;
    if (filters.status && filters.status !== "all" && lead.status !== filters.status) return false;
    if (filters.rating && filters.rating !== "all" && Number(lead.rating || 0) < Number(filters.rating)) return false;
    if (!search) return true;
    const haystack = [
      lead.name,
      lead.address,
      lead.phone,
      lead.website,
      lead.notes,
      categoryMap.get(lead.categoryId) || ""
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

export function groupLeadsByStatus(leads) {
  return LEAD_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = leads.filter((lead) => lead.status === status);
    return accumulator;
  }, {});
}

export function summarizeLeads(leads) {
  return {
    total: leads.length,
    contacted: leads.filter((lead) => lead.status === "Contacted").length,
    rejected: leads.filter((lead) => lead.status === "Rejected").length,
    interested: leads.filter((lead) => lead.status === "Interested").length,
    clients: leads.filter((lead) => lead.status === "Client").length
  };
}

export function mapLeadToClientPayload(lead, clients) {
  const existing = clients.find((client) => client.leadId === lead?.id);
  if (existing) return existing;
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  return {
    businessName: lead?.name || "",
    serviceType: "Landing",
    monthlyPrice: 100,
    startDate: now.toISOString(),
    nextBillingDate: nextMonth.toISOString(),
    paymentStatus: "Pending",
    categoryId: lead?.categoryId || "",
    notes: lead?.notes || ""
  };
}
