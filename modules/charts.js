import { LEAD_STATUSES } from "./leadManager.js";
import { computeClientFinancials } from "./clients.js";

export function createChartsManager() {
  const chartRefs = {};

  function destroyCharts() {
    Object.values(chartRefs).forEach((chart) => chart?.destroy());
  }

  function render(data) {
    const funnelCanvas = document.getElementById("lead-funnel-chart");
    const revenueCanvas = document.getElementById("revenue-growth-chart");
    const clientsCanvas = document.getElementById("clients-category-chart");
    if (!funnelCanvas || !revenueCanvas || !clientsCanvas || typeof Chart === "undefined") return;

    destroyCharts();

    chartRefs.funnel = new Chart(funnelCanvas, {
      type: "bar",
      data: {
        labels: LEAD_STATUSES,
        datasets: [{
          label: "Prospectos",
          data: LEAD_STATUSES.map((status) => data.leads.filter((lead) => lead.status === status).length),
          backgroundColor: ["#CBD5E1", "#60A5FA", "#F87171", "#FBBF24", "#A78BFA", "#4ADE80"],
          borderRadius: 12
        }]
      },
      options: chartOptions(false)
    });

    const enrichedClients = data.clients.map(computeClientFinancials);
    const revenueSeries = enrichedClients
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map((client, index) => ({
        label: client.businessName,
        total: enrichedClients.slice(0, index + 1).reduce((sum, item) => sum + item.monthlyPrice, 0)
      }));

    chartRefs.revenue = new Chart(revenueCanvas, {
      type: "line",
      data: {
        labels: revenueSeries.map((item) => item.label),
        datasets: [{
          label: "Evolucion MRR",
          data: revenueSeries.map((item) => item.total),
          borderColor: "#6366F1",
          backgroundColor: "rgba(99, 102, 241, 0.15)",
          fill: true,
          tension: 0.35
        }]
      },
      options: chartOptions(true)
    });

    const categoryMap = new Map(data.categories.map((category) => [category.id, category.name]));
    const counts = enrichedClients.reduce((accumulator, client) => {
      const key = categoryMap.get(client.categoryId) || "Sin categoria";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    chartRefs.clients = new Chart(clientsCanvas, {
      type: "doughnut",
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: ["#6366F1", "#22C55E", "#F59E0B", "#0EA5E9", "#F43F5E", "#8B5CF6"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, padding: 18 }
          }
        }
      }
    });
  }

  return { render };
}

function chartOptions(showLegend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148, 163, 184, 0.16)" },
        ticks: { precision: 0 }
      },
      x: {
        grid: { display: false }
      }
    },
    plugins: {
      legend: {
        display: showLegend
      }
    }
  };
}

