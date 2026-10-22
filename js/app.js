// Logique des 7 étapes du TP.
import {
  chargerDonnees, battement, moyenneClasse, decouper, compterClasses, roles, chercher, lireCSV, VALIDATION,
} from "./donnees.js";
import {
  initCalcul, construire, parametres, tenseurs, predire, predireSignal, chargerPretraine,
} from "./modele.js";
import { initExploration } from "./exploration.js";
import { BLEU, ROUGE, GRIS, courbeECG, tracerECG, courbeApprentissage, viderApprentissage } from "./graphiques.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const pct = (v, d = 1) => `${(v * 100).toFixed(d).replace(".", ",")} %`;
const nombre = (v) => v.toLocaleString("fr-FR");

const S = {
  D: null,
  moyennes: null,
  dec: null,          // découpage choisi à l'étape 2
  graine: 0,
  lstm: 32,
  dense: 16,
  modele: null,       // { model, dec, lstm, dense, origine, epochs, proba, roles }
  seuil: 0.5,
  cellule: [0, 1],    // case de la matrice affichée : [vrai, prédit] (0 = arythmie, 1 = normal)
  entrainement: false,
  arret: false,
};
const G = {};          // graphiques Chart.js

// ------------------------------------------------------------------ navigation
function allerA(k) {
  $$("main > section").forEach((s) => (s.hidden = s.id !== `etape-${k}`));
  $$("#etapes button").forEach((b) => b.setAttribute("aria-current", b.dataset.etape === String(k) ? "step" : "false"));
  // Centre l'étape active dans la barre (mobile) sans faire défiler la page.
  const nav = $("#etapes"), actif = $(`#etapes button[data-etape="${k}"]`);
  nav.scrollLeft = actif.offsetLeft - (nav.clientWidth - actif.clientWidth) / 2;
  history.replaceState(null, "", `#etape=${k}`);   // pas « #etape-k » : le navigateur sauterait à la section
  if (k === 4) majResumeConfig();
  window.scrollTo({ top: 0 });
}

function majVisibiliteModele() {
  const ok = !!S.modele;
  $$("[data-avec-modele]").forEach((e) => (e.hidden = !ok));
  $$("[data-sans-modele]").forEach((e) => (e.hidden = ok));
}

// ------------------------------------------------------------------ 1. Données
const choisir = (classe) => {
  const idx = [];
  for (let i = 0; i < S.D.n; i++) if (S.D.y[i] === classe) idx.push(i);
  return idx[Math.floor(Math.random() * idx.length)];
};

function initDonnees() {
  const { D } = S;
  const nNormal = D.y.reduce((s, v) => s + v, 0);
  $("#nb-total").textContent = nombre(D.n);
  $("#nb-normal").textContent = `${nombre(nNormal)} (${pct(nNormal / D.n, 0)})`;
  $("#nb-arythmie").textContent = `${nombre(D.n - nNormal)} (${pct(1 - nNormal / D.n, 0)})`;
  S.choixDonnees = { normal: D.y.indexOf(1), arythmie: D.y.indexOf(0) };   // comme X[y==1][0] et X[y==0][0]
  G.donnees = courbeECG($("#graphe-donnees"));
  dessinerDonnees();
  $("#hasard-normal").onclick = () => { S.choixDonnees.normal = choisir(1); dessinerDonnees(); };
  $("#hasard-arythmie").onclick = () => { S.choixDonnees.arythmie = choisir(0); dessinerDonnees(); };
  $("#moyennes-donnees").onchange = dessinerDonnees;
}

function seriesMoyennes() {
  return [
    { data: S.moyennes[1], label: "Normal moyen", couleur: BLEU, pointilles: true, epaisseur: 1.5 },
    { data: S.moyennes[0], label: "Arythmie moyenne", couleur: ROUGE, pointilles: true, epaisseur: 1.5 },
  ];
}

function dessinerDonnees() {
  const { normal, arythmie } = S.choixDonnees;
  const series = [
    { data: battement(S.D, normal), label: `Normal (battement n° ${normal})`, couleur: BLEU, epaisseur: 2.5 },
    { data: battement(S.D, arythmie), label: `Arythmie (battement n° ${arythmie})`, couleur: ROUGE, epaisseur: 2.5 },
  ];
  if ($("#moyennes-donnees").checked) series.push(...seriesMoyennes());
  tracerECG(G.donnees, series);
}

// ------------------------------------------------------------------ 2. Séparation
function majDecoupage() {
  const testSize = Number($("#test-size").value) / 100;
  $("#test-size-val").textContent = `${Math.round(testSize * 100)} %`;
  S.dec = decouper(S.D, testSize, S.graine);
  $("#note-decoupage").textContent = S.dec.notebook
    ? "✔ Découpage identique à celui du notebook."
    : `Tirage n° ${S.graine} (différent du notebook).`;
  const ensembles = [
    ["Entraînement", S.dec.train.slice(0, S.dec.nFit)],
    [`Validation (${pct(VALIDATION, 0)} de l'entraînement)`, S.dec.train.slice(S.dec.nFit)],
    ["Test (mis de côté)", S.dec.test],
  ];
  $("#barres-decoupage").innerHTML = ensembles.map(([nom, idx]) => {
    const c = compterClasses(S.D, idx);
    const largeur = (100 * c.total) / S.D.n;
    return `<div class="barre-ligne"><span class="barre-nom">${nom}<br><strong>${nombre(c.total)}</strong> battements</span>
      <div class="barre" style="width:${largeur}%">
        <div class="seg normal" style="flex:${c.normal}" title="${c.normal} normaux">${c.normal}</div>
        <div class="seg arythmie" style="flex:${c.arythmie}" title="${c.arythmie} arythmies">${c.arythmie}</div>
      </div><span class="note">${pct(c.arythmie / c.total, 0)} d'arythmies</span></div>`;
  }).join("");
  majResumeConfig();
}

function initSeparation() {
  $("#test-size").oninput = majDecoupage;
  $("#nouveau-tirage").onclick = () => { S.graine++; majDecoupage(); };
  $("#tirage-notebook").onclick = () => { S.graine = 0; $("#test-size").value = 20; majDecoupage(); };
  majDecoupage();
}

// ------------------------------------------------------------------ 3. Modèle
function majModele() {
  S.lstm = Number($("#lstm-units").value);
  S.dense = Number($("#dense-units").value);
  const { couches, total } = parametres(S.lstm, S.dense);
  const blocs = [
    `<div class="bloc entree"><strong>Entrée</strong><span>140 points × 1</span><span class="note">le signal ECG</span></div>`,
    ...couches.map((c, k) => `<div class="bloc ${k === 0 ? "lstm" : ""}"><strong>${c.nom}</strong>
        <span>${nombre(c.n)} paramètres</span>${k === 0 ? '<span class="note">lit les points un par un 🔁</span>' : ""}</div>`),
    `<div class="bloc sortie"><strong>Sortie</strong><span>P(normal)</span><span class="note">entre 0 et 1</span></div>`,
  ];
  $("#schema").innerHTML = blocs.join('<span class="fleche">→</span>');
  $("#nb-params").textContent = nombre(total);
  majResumeConfig();
}

function initModele() {
  $("#lstm-units").onchange = majModele;
  $("#dense-units").onchange = majModele;
  majModele();
}

// ------------------------------------------------------------------ 4. Entraînement
function descriptionModele(lstm, dense) {
  return `LSTM(${lstm})${dense ? ` → Dense(${dense})` : ""} → Dense(1)`;
}

function majResumeConfig() {
  if (!S.dec) return;
  $("#resume-config").innerHTML = `Configuration : <strong>${descriptionModele(S.lstm, S.dense)}</strong>,
    entraînement sur <strong>${nombre(S.dec.nFit)}</strong> battements, validation sur
    <strong>${nombre(S.dec.train.length - S.dec.nFit)}</strong>, test : ${pct(S.dec.testSize, 0)}
    ${S.dec.notebook ? "(découpage du notebook)" : `(tirage n° ${S.graine})`}.
    <span class="note">Modifiable aux étapes 2 et 3.</span>`;
}

function verrouiller(oui) {
  S.entrainement = oui;
  $("#lancer").disabled = oui;
  $("#pretraine").disabled = oui;
  $("#arreter").disabled = !oui;
  for (const s of ["#test-size", "#nouveau-tirage", "#tirage-notebook", "#lstm-units", "#dense-units", "#epochs", "#batch", "#lr"]) {
    $(s).disabled = oui;
  }
}

const fmt = (v) => v.toFixed(4);
function ligneJournal(e, total, duree, l) {
  return `Epoch ${e}/${total} — ${duree.toFixed(1)} s — loss: ${fmt(l.loss)} — accuracy: ${fmt(l.acc ?? l.accuracy)}`
    + (l.val_loss !== undefined ? ` — val_loss: ${fmt(l.val_loss)} — val_accuracy: ${fmt(l.val_acc ?? l.val_accuracy)}` : "");
}

async function installerModele(m) {
  if (S.modele && S.modele.model !== m.model) S.modele.model.dispose();
  m.proba = await predire(m.model, S.D, m.dec.test);
  m.roles = roles(m.dec);
  S.modele = m;
  majVisibiliteModele();
  majEvaluation();
  $("#resultat").innerHTML = "";
}

async function lancerEntrainement() {
  if (S.entrainement) return;
  const epochs = Math.max(1, Math.min(30, Number($("#epochs").value) || 5));
  const batch = Number($("#batch").value);
  const lr = Number($("#lr").value);
  const { lstm, dense, dec } = S;
  verrouiller(true);
  S.arret = false;
  const model = construire(lstm, dense, lr, S.D.T);
  const { xs, ys } = tenseurs(S.D, dec.train);
  const nBatch = Math.ceil(dec.nFit / batch);
  viderApprentissage(G.perte, epochs);
  viderApprentissage(G.precision, epochs);
  const journal = $("#journal");
  journal.hidden = false;
  journal.textContent = `Modèle ${descriptionModele(lstm, dense)}, ${epochs} epochs, batch ${batch}, vitesse ${lr}\n`;
  const t0 = performance.now();
  let tEpoch = t0, epoch = 0, fait = 0, lisse = null, lisseAcc = null, dernierDessin = 0;

  try {
    await model.fit(xs, ys, {
      epochs, batchSize: batch, validationSplit: VALIDATION, shuffle: true, yieldEvery: "batch",
      callbacks: {
        onEpochBegin: async (e) => { epoch = e; tEpoch = performance.now(); },
        onBatchEnd: async (b, l) => {
          fait++;
          lisse = lisse === null ? l.loss : 0.9 * lisse + 0.1 * l.loss;
          lisseAcc = lisseAcc === null ? l.acc : 0.9 * lisseAcc + 0.1 * l.acc;
          const x = epoch + (b + 1) / nBatch;
          G.perte.data.datasets[0].data.push({ x, y: lisse });
          G.precision.data.datasets[0].data.push({ x, y: lisseAcc });
          const ecoule = (performance.now() - t0) / 1000;
          const reste = (ecoule / fait) * (epochs * nBatch - fait);
          $("#barre-progression").style.width = `${(100 * fait) / (epochs * nBatch)}%`;
          $("#etat-entrainement").textContent = `Epoch ${epoch + 1}/${epochs} · paquet ${b + 1}/${nBatch} · `
            + `perte ${l.loss.toFixed(3)} · ${Math.round(ecoule)} s écoulées, encore ~${Math.ceil(reste)} s`;
          if (performance.now() - dernierDessin > 250) {
            G.perte.update(); G.precision.update();
            dernierDessin = performance.now();
          }
          if (S.arret) model.stopTraining = true;
        },
        onEpochEnd: async (e, l) => {
          G.perte.data.datasets[1].data.push({ x: e + 1, y: l.val_loss });
          G.precision.data.datasets[1].data.push({ x: e + 1, y: l.val_acc });
          G.perte.update(); G.precision.update();
          journal.textContent += ligneJournal(e + 1, epochs, (performance.now() - tEpoch) / 1000, l) + "\n";
        },
      },
    });
  } catch (err) {
    console.error(err);
    $("#etat-entrainement").textContent = `Erreur pendant l'entraînement : ${err.message}`;
    model.dispose();
    return;
  } finally {
    xs.dispose(); ys.dispose();
    verrouiller(false);
  }

  const faites = G.precision.data.datasets[1].data.length;
  if (faites === 0) {
    $("#etat-entrainement").textContent = "Entraînement arrêté avant la fin de la première epoch : aucun modèle enregistré.";
    model.dispose();
    return;
  }
  const duree = Math.round((performance.now() - t0) / 1000);
  await installerModele({ model, dec, lstm, dense, origine: "votre modèle", epochs: faites });
  $("#barre-progression").style.width = "100%";
  $("#etat-entrainement").innerHTML = `✔ Modèle entraîné en ${duree} s (${faites} epoch${faites > 1 ? "s" : ""}${S.arret ? ", arrêté" : ""}).
    Précision de test : <strong>${pct(precisionTest())}</strong>. <a href="#etape=5" data-aller="5">Voir l'évaluation →</a>`;
}

async function utiliserPretraine() {
  if (S.entrainement) return;
  $("#etat-entrainement").textContent = "Chargement du modèle pré-entraîné…";
  const { model, info } = await chargerPretraine(S.D.T);
  const dec = decouper(S.D, 0.2, 0);   // il a été entraîné sur le découpage du notebook
  // Contrôle : TF.js doit reproduire les probabilités calculées par Keras.
  const p = await predire(model, S.D, info.controle.indices);
  const ecart = Math.max(...info.controle.proba.map((v, k) => Math.abs(v - p[k])));
  console.info("Écart TF.js / Keras sur 20 battements :", ecart);

  const h = info.history;
  viderApprentissage(G.perte, info.epochs);
  viderApprentissage(G.precision, info.epochs);
  h.loss.forEach((v, e) => G.perte.data.datasets[0].data.push({ x: e + 1, y: v }));
  h.val_loss.forEach((v, e) => G.perte.data.datasets[1].data.push({ x: e + 1, y: v }));
  h.accuracy.forEach((v, e) => G.precision.data.datasets[0].data.push({ x: e + 1, y: v }));
  h.val_accuracy.forEach((v, e) => G.precision.data.datasets[1].data.push({ x: e + 1, y: v }));
  G.perte.update(); G.precision.update();
  const journal = $("#journal");
  journal.hidden = false;
  journal.textContent = "Modèle pré-entraîné (notebook) : LSTM(32) → Dense(16) → Dense(1), 10 epochs, batch 64\n"
    + h.loss.map((_, e) => ligneJournal(e + 1, info.epochs, NaN, {
      loss: h.loss[e], acc: h.accuracy[e], val_loss: h.val_loss[e], val_acc: h.val_accuracy[e],
    }).replace(" — NaN s", "")).join("\n");
  await installerModele({ model, dec, lstm: info.lstm, dense: info.dense, origine: "modèle pré-entraîné (notebook)", epochs: info.epochs });
  $("#barre-progression").style.width = "100%";
  $("#etat-entrainement").innerHTML = `✔ Modèle pré-entraîné chargé (découpage du notebook, ${info.epochs} epochs).
    Précision de test : <strong>${pct(precisionTest())}</strong>. <a href="#etape=5" data-aller="5">Voir l'évaluation →</a>`
    + (ecart > 1e-3 ? ` <span class="arythmie">(écart inattendu avec Keras : ${ecart.toExponential(1)})</span>` : "");
}

function initEntrainement() {
  G.perte = courbeApprentissage($("#graphe-perte"), { titre: "Perte (erreur)", pourcent: false });
  G.precision = courbeApprentissage($("#graphe-precision"), { titre: "Précision", pourcent: true });
  $("#lancer").onclick = lancerEntrainement;
  $("#arreter").onclick = () => { S.arret = true; $("#etat-entrainement").textContent = "Arrêt à la fin du paquet en cours…"; };
  $("#pretraine").onclick = utiliserPretraine;
  window.addEventListener("beforeunload", (e) => { if (S.entrainement) e.preventDefault(); });
}

// ------------------------------------------------------------------ 5. Évaluation
function matrice(seuil) {
  const { dec, proba } = S.modele;
  const cm = [[0, 0], [0, 0]];   // cm[vrai][prédit], 0 = arythmie, 1 = normal
  dec.test.forEach((i, k) => cm[S.D.y[i]][proba[k] > seuil ? 1 : 0]++);
  return cm;
}

function precisionTest() {
  const cm = matrice(0.5);
  return (cm[0][0] + cm[1][1]) / S.modele.dec.test.length;
}

// Même mise en forme que sklearn.metrics.classification_report(digits=2).
function rapportClassification(cm) {
  const noms = ["Arythmie (0)", "Normal (1)"];
  const w = Math.max(...noms.map((s) => s.length), "weighted avg".length);
  const col = (v) => " " + String(v).padStart(9);
  const f2 = (v) => col(v.toFixed(2));
  const lignes = [" ".repeat(w) + " " + ["precision", "recall", "f1-score", "support"].map(col).join(""), ""];
  const n = cm[0][0] + cm[0][1] + cm[1][0] + cm[1][1];
  const stats = [0, 1].map((c) => {
    const support = cm[c][0] + cm[c][1];
    const predits = cm[0][c] + cm[1][c];
    const p = predits ? cm[c][c] / predits : 0;
    const r = support ? cm[c][c] / support : 0;
    const f = p + r ? (2 * p * r) / (p + r) : 0;
    return { p, r, f, support };
  });
  stats.forEach((s, c) => lignes.push(noms[c].padStart(w) + " " + f2(s.p) + f2(s.r) + f2(s.f) + col(s.support)));
  lignes.push("");
  lignes.push("accuracy".padStart(w) + " " + col("") + col("") + f2((cm[0][0] + cm[1][1]) / n) + col(n));
  const moy = (k, poids) => stats.reduce((a, s) => a + s[k] * poids(s), 0);
  lignes.push("macro avg".padStart(w) + " " + ["p", "r", "f"].map((k) => f2(moy(k, () => 0.5))).join("") + col(n));
  lignes.push("weighted avg".padStart(w) + " " + ["p", "r", "f"].map((k) => f2(moy(k, (s) => s.support / n))).join("") + col(n));
  return lignes.join("\n");
}

const CASES = {
  "0,0": { nom: "Vrais positifs", detail: "arythmies détectées", ok: true },
  "0,1": { nom: "Faux négatifs", detail: "arythmies manquées (classées normales)", ok: false },
  "1,0": { nom: "Faux positifs", detail: "fausses alertes (normaux classés arythmie)", ok: false },
  "1,1": { nom: "Vrais négatifs", detail: "normaux reconnus", ok: true },
};

function majEvaluation() {
  if (!S.modele) return;
  const m = S.modele;
  $("#eval-modele").innerHTML = `Modèle évalué : <strong>${m.origine}</strong>, ${descriptionModele(m.lstm, m.dense)},
    ${m.epochs} epoch${m.epochs > 1 ? "s" : ""}, sur <strong>${nombre(m.dec.test.length)} battements de test</strong> jamais vus pendant l'entraînement.`;
  const cm = matrice(S.seuil);
  const max = Math.max(...cm.flat());
  const cases = [];
  cases.push('<div></div><div class="entete-col">Prédit : arythmie</div><div class="entete-col">Prédit : normal</div>');
  for (const v of [0, 1]) {
    cases.push(`<div class="entete-ligne">Vrai : ${v ? "normal" : "arythmie"}</div>`);
    for (const p of [0, 1]) {
      const c = CASES[`${v},${p}`];
      const actif = S.cellule[0] === v && S.cellule[1] === p ? " active" : "";
      const intensite = 0.12 + 0.6 * (cm[v][p] / max);
      const fond = c.ok ? `rgba(37,99,235,${intensite})` : `rgba(220,38,38,${Math.max(intensite, 0.25)})`;
      cases.push(`<button class="case${actif}" data-v="${v}" data-p="${p}" style="background:${fond}">
        <span class="nb">${cm[v][p]}</span><span>${c.nom}</span></button>`);
    }
  }
  $("#matrice").innerHTML = cases.join("");
  $$("#matrice .case").forEach((b) => (b.onclick = () => {
    S.cellule = [Number(b.dataset.v), Number(b.dataset.p)];
    majEvaluation();
  }));

  const vp = cm[0][0], fn = cm[0][1], fp = cm[1][0], vn = cm[1][1];
  $("#tuiles-eval").innerHTML = [
    ["Exactitude", (vp + vn) / (vp + fn + fp + vn), "bien classés"],
    ["Sensibilité", vp / Math.max(vp + fn, 1), "arythmies détectées"],
    ["Spécificité", vn / Math.max(vn + fp, 1), "normaux reconnus"],
  ].map(([n, v, d]) => `<div class="tuile"><span class="valeur">${pct(v)}</span><span>${n}</span><span class="note">${d}</span></div>`).join("");
  $("#rapport").textContent = rapportClassification(cm);
  dessinerExemples();
}

function dessinerExemples() {
  const [v, p] = S.cellule;
  const { dec, proba } = S.modele;
  const c = CASES[`${v},${p}`];
  let ks = [];
  dec.test.forEach((i, k) => { if (S.D.y[i] === v && (proba[k] > S.seuil ? 1 : 0) === p) ks.push(k); });
  // Les plus « sûrs » d'eux d'abord : ce sont les erreurs les plus instructives.
  ks.sort((a, b) => (p === 1 ? proba[b] - proba[a] : proba[a] - proba[b]));
  const total = ks.length;
  ks = ks.slice(0, 8);
  $("#titre-exemples").textContent = `${c.nom} : ${c.detail} (${total}${total > 8 ? ", les 8 plus nets" : ""})`;
  const grille = $("#exemples");
  if (!G.exemples) {
    G.exemples = [];
    grille.innerHTML = Array.from({ length: 8 }, (_, k) =>
      `<figure><div class="graphe mini"><canvas id="ex-${k}"></canvas></div><figcaption id="ex-legende-${k}"></figcaption></figure>`).join("")
      + '<p class="note" id="ex-aucun" hidden>Aucun battement dans cette case à ce seuil.</p>';
    for (let k = 0; k < 8; k++) G.exemples.push(courbeECG($(`#ex-${k}`), { mini: true }));
  }
  const couleur = v === 0 ? ROUGE : BLEU;
  G.exemples.forEach((ch, j) => {
    const fig = ch.canvas.closest("figure");
    fig.hidden = j >= ks.length;
    if (j >= ks.length) return;
    const k = ks[j], i = dec.test[k];
    tracerECG(ch, [
      { data: S.moyennes[1], label: "Normal moyen", couleur: GRIS, pointilles: true, epaisseur: 1 },
      { data: battement(S.D, i), label: "Battement", couleur, epaisseur: 2 },
    ]);
    $(`#ex-legende-${j}`).textContent = `n° ${i} · P(normal) = ${pct(proba[k], 0)}`;
  });
  $("#ex-aucun").hidden = ks.length > 0;
}

function initEvaluation() {
  $("#seuil").oninput = () => {
    S.seuil = Number($("#seuil").value);
    $("#seuil-val").textContent = S.seuil.toFixed(2).replace(".", ",");
    majEvaluation();
  };
}

// ------------------------------------------------------------------ 6. Tester un ECG
async function analyser(signal, nom) {
  if (!S.modele) return;
  const p = await predireSignal(S.modele.model, signal);
  const normal = p > S.seuil;
  const series = [{ data: signal, label: nom, couleur: normal ? BLEU : ROUGE, epaisseur: 2.5 }];
  if ($("#moyennes-test").checked) series.push(...seriesMoyennes());
  tracerECG(G.test, series);

  let html = `<p class="verdict ${normal ? "normal" : "arythmie"}">${normal ? "💙 NORMAL" : "❤️‍🔥 ARYTHMIE"}</p>
    <div class="jauge"><div style="width:${p * 100}%"></div><span class="repere" style="left:${S.seuil * 100}%"></span></div>
    <p>Probabilité d'être normal : <strong>${pct(p)}</strong> · seuil de décision : ${S.seuil.toFixed(2).replace(".", ",")}
      <span class="note">(réglable à l'étape 5)</span></p>`;
  if ($("#reveler").checked) {
    const i = chercher(S.D, signal);
    if (i === null) {
      html += `<p class="note">ℹ️ Diagnostic réel inconnu : ce signal ne fait pas partie d'ECG5000.</p>`;
    } else {
      const vraiNormal = S.D.y[i] === 1;
      const role = S.modele.roles.get(i);
      html += `<p><strong>Vrai diagnostic :</strong> ${vraiNormal ? "NORMAL" : "ARYTHMIE"} (battement n° ${i} d'ECG5000)</p>`;
      if (vraiNormal === normal) html += "<p>✅ Le modèle a raison.</p>";
      else if (normal) html += `<p class="arythmie">❌ <strong>Faux négatif</strong> : une arythmie classée normale, l'erreur la plus grave en médecine.</p>`;
      else html += `<p>⚠️ <strong>Faux positif</strong> : un battement normal classé arythmie (fausse alerte).</p>`;
      html += role === "test"
        ? `<p class="note">Ce battement fait partie du <strong>test</strong> : le modèle ne l'a jamais vu pendant l'entraînement.</p>`
        : `<p class="note">⚠️ Ce battement faisait partie des données d'<strong>${role}</strong> de ce modèle : il l'a déjà vu !</p>`;
    }
  }
  $("#resultat").innerHTML = html;
  S.dernierTest = { signal, nom };
}

function initTest() {
  G.test = courbeECG($("#graphe-test"));
  const select = $("#exemple");
  for (const f of S.D.meta.exemples) select.insertAdjacentHTML("beforeend", `<option>${f}</option>`);
  const erreur = (msg) => { $("#resultat").innerHTML = `<p class="arythmie">⚠️ ${msg}</p>`; };

  const lireFichier = async (f) => {
    try { await analyser(lireCSV(await f.text(), S.D.T), f.name); select.value = ""; }
    catch (e) { erreur(e.message); }
  };
  $("#fichier").onchange = (e) => e.target.files[0] && lireFichier(e.target.files[0]);
  const depot = $("#depot");
  depot.ondragover = (e) => { e.preventDefault(); depot.classList.add("survol"); };
  depot.ondragleave = () => depot.classList.remove("survol");
  depot.ondrop = (e) => { e.preventDefault(); depot.classList.remove("survol"); e.dataTransfer.files[0] && lireFichier(e.dataTransfer.files[0]); };

  select.onchange = async () => {
    if (!select.value) return;
    try { await analyser(lireCSV(await fetch(`exemples/${select.value}`).then((r) => r.text()), S.D.T), select.value); }
    catch (e) { erreur(e.message); }
  };
  const parIndice = () => {
    const test = S.modele.dec.test;
    const k = Math.max(0, Math.min(test.length - 1, Number($("#indice-test").value) || 0));
    $("#indice-test").value = k;
    $("#indice-test").max = test.length - 1;
    analyser(battement(S.D, test[k]), `Battement n° ${k} du jeu de test`);
  };
  $("#indice-test").onchange = parIndice;
  $("#indice-hasard").onclick = () => {
    $("#indice-test").value = Math.floor(Math.random() * S.modele.dec.test.length);
    parIndice();
  };
  const reanalyser = () => S.dernierTest && analyser(S.dernierTest.signal, S.dernierTest.nom);
  $("#reveler").onchange = reanalyser;
  $("#moyennes-test").onchange = reanalyser;
}

// ------------------------------------------------------------------ démarrage
async function demarrer() {
  document.addEventListener("click", (e) => {
    const cible = e.target.closest("[data-aller], #etapes button");
    if (!cible) return;
    e.preventDefault();
    allerA(Number(cible.dataset.aller ?? cible.dataset.etape));
  });
  const depart = Number((location.hash.match(/etape-(\d)/) || [])[1]) || 1;
  allerA(depart >= 1 && depart <= 7 ? depart : 1);
  majVisibiliteModele();

  try {
    const [D, backend] = await Promise.all([chargerDonnees(), initCalcul()]);
    S.D = D;
    S.moyennes = { 0: moyenneClasse(D, 0), 1: moyenneClasse(D, 1) };
    initDonnees();
    initExploration(D);
    initSeparation();
    initModele();
    initEntrainement();
    initEvaluation();
    initTest();
    const moteurs = { wasm: "WebAssembly", webgl: "WebGL (carte graphique)", cpu: "JavaScript" };
    $("#statut").textContent = `✔ ${nombre(D.n)} battements chargés · calcul sur votre ordinateur (${moteurs[backend] ?? backend})`;
    document.body.dataset.pret = "1";
  } catch (e) {
    console.error(e);
    $("#statut").textContent = `⚠️ Erreur de chargement : ${e.message}. Rechargez la page.`;
  }
}

demarrer();
