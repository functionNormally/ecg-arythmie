// Étape 1 : tableau, statistiques descriptives, variabilité et distributions des caractéristiques.
/* global Chart */
import { battement } from "./donnees.js";
import { BLEU, ROUGE, courbeECG } from "./graphiques.js";

const $ = (s) => document.querySelector(s);
const fr = (v, d = 2) => v.toFixed(d).replace(".", ",");
const NB_SUPERPOSES = 40;

// Caractéristiques calculées pour chaque battement.
const CARACTERISTIQUES = [
  { cle: "min", nom: "Amplitude minimale", f: (b) => Math.min(...b) },
  { cle: "max", nom: "Amplitude maximale", f: (b) => Math.max(...b) },
  { cle: "pic", nom: "Amplitude crête à crête", f: (b) => Math.max(...b) - Math.min(...b) },
  { cle: "tmin", nom: "Instant du minimum", f: (b) => b.indexOf(Math.min(...b)) },
  { cle: "tmax", nom: "Instant du maximum", f: (b) => b.indexOf(Math.max(...b)) },
  // Pas d'écart-type du signal : ECG5000 est normalisé battement par battement (moyenne 0, écart-type 1).
  { cle: "debut", nom: "Moyenne des 20 premiers points", f: (b) => moyenne(b.subarray(0, 20)) },
  { cle: "fin", nom: "Moyenne des 20 derniers points", f: (b) => moyenne(b.subarray(120)) },
];

function moyenne(v) { let s = 0; for (const x of v) s += x; return s / v.length; }
function ecartType(v) { const m = moyenne(v); let s = 0; for (const x of v) s += (x - m) ** 2; return Math.sqrt(s / (v.length - 1)); }

function parClasse(D, valeurs) {
  const r = { 0: [], 1: [] };
  valeurs.forEach((v, i) => r[D.y[i]].push(v));
  return r;
}

// ------------------------------------------------------------------ 1.1 tableau + téléchargement
function apercu(D) {
  const lignes = 8;
  const entete = `<tr><th>n°</th>${Array.from({ length: D.T }, (_, t) => `<th>t${t}</th>`).join("")}<th>étiquette</th></tr>`;
  const corps = Array.from({ length: lignes }, (_, i) => {
    const b = battement(D, i);
    const classe = D.y[i] ? '<td class="normal"><strong>1</strong> (normal)</td>' : '<td class="arythmie"><strong>0</strong> (arythmie)</td>';
    return `<tr><th>${i}</th>${Array.from(b, (v) => `<td>${fr(v)}</td>`).join("")}${classe}</tr>`;
  }).join("");
  $("#apercu").innerHTML = `<thead>${entete}</thead><tbody>${corps}</tbody>`;
}

function telecharger(D, excel) {
  const sep = excel ? ";" : ",";
  const nombreTxt = excel ? (v) => v.toFixed(4).replace(".", ",") : (v) => v.toFixed(4);
  const lignes = [];
  if (excel) lignes.push([...Array.from({ length: D.T }, (_, t) => `t${t}`), "etiquette"].join(sep));
  for (let i = 0; i < D.n; i++) lignes.push([...Array.from(battement(D, i), nombreTxt), D.y[i]].join(sep));
  const url = URL.createObjectURL(new Blob([lignes.join("\r\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: excel ? "ecg5000_excel.csv" : "ecg5000.csv" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ 1.2 statistiques descriptives
function statistiques(D, valeurs) {
  const lignes = CARACTERISTIQUES.map((c) => {
    const g = parClasse(D, valeurs[c.cle]);
    const [mN, sN, mA, sA] = [moyenne(g[1]), ecartType(g[1]), moyenne(g[0]), ecartType(g[0])];
    const sp = Math.sqrt(((g[1].length - 1) * sN ** 2 + (g[0].length - 1) * sA ** 2) / (g[1].length + g[0].length - 2));
    const d = Math.abs(mN - mA) / sp;
    const d1 = c.cle.startsWith("t") ? 0 : 2;
    const force = d > 1.5 ? "très grande" : d > 0.8 ? "grande" : d > 0.5 ? "moyenne" : "faible";
    return `<tr><th>${c.nom}</th><td class="normal">${fr(mN, d1)} ± ${fr(sN, d1)}</td>
      <td class="arythmie">${fr(mA, d1)} ± ${fr(sA, d1)}</td><td>${fr(d)} <span class="note">(${force})</span></td></tr>`;
  }).join("");
  $("#stats").innerHTML = `<thead><tr><th>Caractéristique du battement</th><th class="normal">Normaux</th>
    <th class="arythmie">Arythmies</th><th>Écart entre classes<br><span class="note">d de Cohen</span></th></tr></thead>
    <tbody>${lignes}</tbody>`;
}

// ------------------------------------------------------------------ 1.4 superposition et bande moyenne ± écart-type
function couleurTransparente(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function dessinerSuperposition(chart, D) {
  const datasets = [];
  for (const [classe, couleur, nom] of [[1, BLEU, "Normaux"], [0, ROUGE, "Arythmies"]]) {
    const idx = [];
    for (let i = 0; i < D.n; i++) if (D.y[i] === classe) idx.push(i);
    for (let k = 0; k < NB_SUPERPOSES; k++) {
      const i = idx[Math.floor(Math.random() * idx.length)];
      datasets.push({
        label: k === 0 ? `${nom} (${NB_SUPERPOSES} battements)` : "",
        data: Array.from(battement(D, i), (v, t) => ({ x: t, y: v })),
        borderColor: couleurTransparente(couleur, 0.25), backgroundColor: couleur, borderWidth: 1,
      });
    }
  }
  chart.data.datasets = datasets;
  chart.update();
}

function bande(D) {
  const datasets = [];
  for (const [classe, couleur, nom] of [[1, BLEU, "Normal"], [0, ROUGE, "Arythmie"]]) {
    const m = new Float64Array(D.T), s = new Float64Array(D.T);
    let k = 0;
    for (let i = 0; i < D.n; i++) {
      if (D.y[i] !== classe) continue;
      const b = battement(D, i);
      for (let t = 0; t < D.T; t++) { m[t] += b[t]; s[t] += b[t] * b[t]; }
      k++;
    }
    const moy = Array.from(m, (v) => v / k);
    const et = Array.from(s, (v, t) => Math.sqrt(Math.max(v / k - moy[t] ** 2, 0)));
    const pts = (f) => moy.map((v, t) => ({ x: t, y: f(v, t) }));
    datasets.push(
      { label: "", data: pts((v, t) => v - et[t]), borderWidth: 0, pointRadius: 0, fill: false },
      { label: "", data: pts((v, t) => v + et[t]), borderWidth: 0, pointRadius: 0, fill: "-1",
        backgroundColor: couleurTransparente(couleur, 0.18) },
      { label: `${nom} : moyenne ± écart-type`, data: pts((v) => v), borderColor: couleur, backgroundColor: couleur, borderWidth: 2.5 },
    );
  }
  return datasets;
}

// ------------------------------------------------------------------ 1.5 histogrammes
function histogramme(chart, D, valeurs, nom) {
  const g = parClasse(D, valeurs);
  let lo = Infinity, hi = -Infinity;
  for (const v of valeurs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const nb = 30, pas = (hi - lo) / nb || 1;
  const compter = (vals) => {
    const c = new Array(nb).fill(0);
    for (const v of vals) c[Math.min(nb - 1, Math.floor((v - lo) / pas))]++;
    return c.map((x) => x / vals.length);
  };
  const [pN, pA] = [compter(g[1]), compter(g[0])];
  chart.data.labels = Array.from({ length: nb }, (_, k) => fr(lo + (k + 0.5) * pas, Math.abs(pas) < 1 ? 2 : 0));
  chart.data.datasets[0].data = pN;
  chart.data.datasets[1].data = pA;
  chart.options.scales.x.title.text = nom;
  chart.update();

  // Meilleure règle « un seul seuil » sur cette caractéristique : point de comparaison pour le LSTM.
  const tri = Array.from(valeurs, (v, i) => [v, D.y[i]]).sort((a, b) => a[0] - b[0]);
  const nNormal = g[1].length;
  let normauxAvant = 0, meilleur = 0;
  tri.forEach(([, y], k) => {
    normauxAvant += y;
    const arythmiesAvant = k + 1 - normauxAvant;
    // règle « arythmie si valeur <= seuil » ou l'inverse
    const acc1 = (arythmiesAvant + (nNormal - normauxAvant)) / D.n;
    meilleur = Math.max(meilleur, acc1, 1 - acc1);
  });
  const chevauchement = pN.reduce((s, v, k) => s + Math.min(v, pA[k]), 0);
  $("#chevauchement").innerHTML = `Chevauchement des deux distributions : <strong>${Math.round(chevauchement * 100)} %</strong>.
    Avec une règle à un seul seuil sur cette caractéristique, on classerait au mieux
    <strong>${fr(meilleur * 100, 1)} %</strong> des battements correctement. Le LSTM, lui, utilise les 140 points à la fois.`;
}

export function initExploration(D) {
  apercu(D);
  $("#telecharger-csv").onclick = () => telecharger(D, false);
  $("#telecharger-excel").onclick = () => telecharger(D, true);

  const valeurs = {};
  for (const c of CARACTERISTIQUES) valeurs[c.cle] = Float32Array.from({ length: D.n }, (_, i) => c.f(battement(D, i)));
  statistiques(D, valeurs);

  const sansLegendeVide = { labels: { filter: (item) => item.text !== "" } };
  const superposition = courbeECG($("#graphe-superposition"));
  superposition.options.plugins.legend = { position: "bottom", ...sansLegendeVide };
  superposition.options.plugins.tooltip.enabled = false;
  dessinerSuperposition(superposition, D);
  $("#autres-battements").onclick = () => dessinerSuperposition(superposition, D);

  const graphBande = courbeECG($("#graphe-bande"));
  graphBande.options.plugins.legend = { position: "bottom", ...sansLegendeVide };
  graphBande.options.plugins.tooltip.enabled = false;
  graphBande.data.datasets = bande(D);
  graphBande.update();

  const histo = new Chart($("#graphe-histo"), {
    type: "bar",
    data: { labels: [], datasets: [
      { label: "Normaux", data: [], backgroundColor: couleurTransparente(BLEU, 0.6) },
      { label: "Arythmies", data: [], backgroundColor: couleurTransparente(ROUGE, 0.6) },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      datasets: { bar: { categoryPercentage: 0.95, barPercentage: 1 } },
      scales: {
        x: { title: { display: true, text: "" }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { title: { display: true, text: "Part des battements de la classe" }, ticks: { callback: (v) => `${Math.round(v * 100)} %` } },
      },
      plugins: { legend: { position: "bottom" } },
    },
  });

  const select = $("#caracteristique");
  select.innerHTML = '<option value="instant">Amplitude à un instant t (curseur)</option>'
    + CARACTERISTIQUES.map((c) => `<option value="${c.cle}">${c.nom}</option>`).join("");
  const maj = () => {
    const instant = select.value === "instant";
    $("#reglage-instant").hidden = !instant;
    if (instant) {
      const t = Number($("#instant").value);
      $("#instant-val").textContent = t;
      histogramme(histo, D, Float32Array.from({ length: D.n }, (_, i) => D.X[i * D.T + t]), `Amplitude à l'instant t = ${t}`);
    } else {
      const c = CARACTERISTIQUES.find((x) => x.cle === select.value);
      histogramme(histo, D, valeurs[c.cle], c.nom);
    }
  };
  select.onchange = maj;
  $("#instant").oninput = maj;
  maj();
}
