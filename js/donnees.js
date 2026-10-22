// Chargement du jeu ECG5000 et découpage entraînement / validation / test.

export const VALIDATION = 0.1;   // comme validation_split=0.1 dans le notebook

export async function chargerDonnees() {
  const [meta, buf] = await Promise.all([
    fetch("data/meta.json").then((r) => r.json()),
    fetch("data/ecg5000.bin").then((r) => r.arrayBuffer()),
  ]);
  const { n, points: T, echelle } = meta;
  const q = new Int16Array(buf, 0, n * T);
  const X = new Float32Array(n * T);
  for (let i = 0; i < X.length; i++) X[i] = q[i] / echelle;
  const y = new Uint8Array(buf, n * T * 2, n);   // 1 = normal, 0 = arythmie
  return { n, T, X, y, meta };
}

export function battement(D, i) {
  return D.X.subarray(i * D.T, (i + 1) * D.T);
}

export function moyenneClasse(D, classe) {
  const m = new Float32Array(D.T);
  let k = 0;
  for (let i = 0; i < D.n; i++) {
    if (D.y[i] !== classe) continue;
    const b = battement(D, i);
    for (let t = 0; t < D.T; t++) m[t] += b[t];
    k++;
  }
  return m.map((v) => v / k);
}

function generateur(graine) {          // mulberry32 : tirage reproductible
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function melanger(tab, alea) {
  for (let i = tab.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [tab[i], tab[j]] = [tab[j], tab[i]];
  }
  return tab;
}

// Découpage stratifié. Avec 20 % et la graine 0, on reprend exactement celui du notebook
// (train_test_split(..., test_size=0.2, random_state=0, stratify=y)).
export function decouper(D, testSize, graine) {
  let train, test;
  const notebook = Math.abs(testSize - 0.2) < 1e-9 && graine === 0;
  if (notebook) {
    ({ train, test } = D.meta.notebook);
  } else {
    const alea = generateur(graine * 7919 + Math.round(testSize * 100));
    train = []; test = [];
    for (const classe of [0, 1]) {
      const idx = melanger([...Array(D.n).keys()].filter((i) => D.y[i] === classe), alea);
      const k = Math.round(idx.length * testSize);
      test.push(...idx.slice(0, k));
      train.push(...idx.slice(k));
    }
    melanger(train, alea);
    melanger(test, alea);
  }
  // Keras / TF.js prennent la validation à la FIN des données d'entraînement.
  const nFit = Math.floor(train.length * (1 - VALIDATION));
  return { train, test, nFit, notebook, testSize, graine };
}

export function compterClasses(D, indices) {
  let normal = 0;
  for (const i of indices) normal += D.y[i];
  return { normal, arythmie: indices.length - normal, total: indices.length };
}

// Rôle de chaque battement pour un découpage donné : "entraînement", "validation" ou "test".
export function roles(dec) {
  const r = new Map();
  dec.train.forEach((i, k) => r.set(i, k < dec.nFit ? "entraînement" : "validation"));
  dec.test.forEach((i) => r.set(i, "test"));
  return r;
}

// Retrouve un signal dans le jeu de données (tolérance : quantification + arrondi CSV).
export function chercher(D, signal) {
  for (let i = 0; i < D.n; i++) {
    const b = battement(D, i);
    let ok = true;
    for (let t = 0; t < D.T && ok; t++) ok = Math.abs(b[t] - signal[t]) < 2e-3;
    if (ok) return i;
  }
  return null;
}

const NOMBRE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

export function lireCSV(texte, T) {
  if (texte.includes(";")) texte = texte.replaceAll(",", ".").replaceAll(";", " ");   // Excel français
  const valeurs = Float32Array.from(texte.match(NOMBRE) ?? [], Number);
  if (valeurs.length !== T) {
    throw new Error(`Le fichier contient ${valeurs.length} valeurs : il en faut exactement ${T} (un battement ECG5000).`);
  }
  return valeurs;
}
