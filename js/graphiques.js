// Petits utilitaires Chart.js pour les courbes ECG et les courbes d'apprentissage.
/* global Chart */

export const BLEU = "#2563eb";
export const ROUGE = "#dc2626";
export const GRIS = "#9ca3af";
export const VERT = "#059669";

Chart.defaults.animation = false;
Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.color = "#475569";

export function courbeECG(canvas, { mini = false } = {}) {
  return new Chart(canvas, {
    type: "line",
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      elements: { point: { radius: 0 } },
      interaction: { intersect: false, mode: "nearest", axis: "x" },
      scales: {
        x: { type: "linear", min: 0, max: 139, ticks: { display: !mini },
             title: { display: !mini, text: "Temps (échantillons)" }, grid: { display: !mini } },
        y: { ticks: { display: !mini }, title: { display: !mini, text: "Amplitude" } },
      },
      plugins: { legend: { display: !mini, position: "bottom" }, tooltip: { enabled: !mini } },
    },
  });
}

// series : [{ data: Float32Array, label, couleur, pointilles?, epaisseur? }]
export function tracerECG(chart, series) {
  chart.data.datasets = series.map((s) => ({
    label: s.label,
    data: Array.from(s.data, (v, t) => ({ x: t, y: v })),
    borderColor: s.couleur,
    backgroundColor: s.couleur,
    borderWidth: s.epaisseur ?? 2,
    borderDash: s.pointilles ? [6, 4] : [],
  }));
  chart.update();
}

export function courbeApprentissage(canvas, { titre, pourcent }) {
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        { label: "Entraînement", data: [], borderColor: BLEU, backgroundColor: BLEU, borderWidth: 2, pointRadius: 0 },
        { label: "Validation", data: [], borderColor: ROUGE, backgroundColor: ROUGE, borderWidth: 2, pointRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 10 } },
      datasets: { line: { clip: false } },   // le dernier point de validation tombe sur le bord
      scales: {
        x: { type: "linear", min: 0, title: { display: true, text: "Epoch" }, ticks: { stepSize: 1 } },
        y: { title: { display: true, text: titre },
             ticks: pourcent ? { callback: (v) => `${Math.round(v * 100)} %` } : {} },
      },
      plugins: { legend: { position: "bottom" }, title: { display: true, text: titre } },
    },
  });
}

export function viderApprentissage(chart, epochs) {
  chart.data.datasets.forEach((d) => (d.data = []));
  chart.options.scales.x.max = epochs;
  chart.update();
}
