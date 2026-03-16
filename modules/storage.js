const STORAGE_KEY = "local-leads-crm-v1";

export const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { categories: [], leads: [], clients: [] };
      const parsed = JSON.parse(raw);
      return {
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        leads: Array.isArray(parsed.leads) ? parsed.leads : [],
        clients: Array.isArray(parsed.clients) ? parsed.clients : []
      };
    } catch {
      return { categories: [], leads: [], clients: [] };
    }
  },
  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
};

export function createId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function exportCsvRows(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function createSeedData() {
  const categories = [
    "Rotiserias",
    "Clothing Stores",
    "Dentists",
    "Pharmacies",
    "Gyms"
  ].map((name) => ({ id: createId("cat"), name, createdAt: new Date().toISOString() }));

  const leads = [
    {
      name: "Smile Studio",
      address: "412 Market Street",
      phone: "+54 11 4444 1900",
      website: "https://smilestudio.example.com",
      instagram: "https://instagram.com/smilestudio",
      rating: 4.8,
      reviews: 124,
      categoryId: categories[2].id,
      status: "Interested"
    },
    {
      name: "Viva Gym",
      address: "55 Palermo Avenue",
      phone: "+54 11 4444 1910",
      website: "https://vivagym.example.com",
      instagram: "https://instagram.com/vivagym",
      rating: 4.6,
      reviews: 250,
      categoryId: categories[4].id,
      status: "Contacted"
    },
    {
      name: "Moda Norte",
      address: "89 Belgrano Street",
      phone: "+54 11 4444 1920",
      website: "",
      instagram: "https://instagram.com/modanorte",
      rating: 4.1,
      reviews: 48,
      categoryId: categories[1].id,
      status: "Not contacted"
    }
  ].map((lead, index) => ({
    id: createId("lead"),
    facebook: "",
    twitter: "",
    notes: index === 0 ? "Strong interest in both landing page refresh and Maps optimization." : "",
    dateAdded: new Date(Date.now() - index * 86400000).toISOString(),
    lastContactDate: new Date(Date.now() - index * 43200000).toISOString(),
    ...lead
  }));

  const clients = [
    {
      id: createId("client"),
      leadId: leads[0].id,
      businessName: "Smile Studio",
      serviceType: "Both",
      monthlyPrice: 180,
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 100).toISOString(),
      nextBillingDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20).toISOString(),
      paymentStatus: "Paid",
      categoryId: categories[2].id,
      notes: "Monthly local SEO plus landing page maintenance."
    }
  ];

  leads[0].status = "Client";
  return { categories, leads, clients };
}
