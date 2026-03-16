import { createId } from "./storage.js";

export function buildClient(payload) {
  return {
    id: createId("client"),
    leadId: payload.leadId || "",
    businessName: String(payload.businessName || "").trim(),
    serviceType: payload.serviceType || "Landing",
    monthlyPrice: Number(payload.monthlyPrice) || 0,
    startDate: payload.startDate || new Date().toISOString(),
    nextBillingDate: payload.nextBillingDate || new Date().toISOString(),
    paymentStatus: payload.paymentStatus || "Pending",
    categoryId: payload.categoryId || "",
    notes: String(payload.notes || "").trim()
  };
}

export function computeClientFinancials(client) {
  const monthsActive = getMonthsActive(client.startDate);
  return {
    ...client,
    monthsActive,
    totalRevenue: monthsActive * Number(client.monthlyPrice || 0)
  };
}

export function filterClients(clients, filters, categories) {
  const search = String(filters.search || "").toLowerCase();
  const categoryMap = new Map(categories.map((category) => [category.id, category.name.toLowerCase()]));
  return clients.filter((client) => {
    if (filters.categoryId && filters.categoryId !== "all" && client.categoryId !== filters.categoryId) return false;
    if (filters.paymentStatus && filters.paymentStatus !== "all" && client.paymentStatus !== filters.paymentStatus) return false;
    if (!search) return true;
    return [
      client.businessName,
      client.notes,
      categoryMap.get(client.categoryId) || "",
      client.serviceType
    ].join(" ").toLowerCase().includes(search);
  });
}

function getMonthsActive(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  if (months < 1) months = 1;
  return months;
}
