// Le modèle du notebook, en TensorFlow.js : Input(140,1) -> LSTM -> Dense(relu) -> Dense(1, sigmoid).
/* global tf */
import { battement } from "./donnees.js";

export async function initCalcul() {
  tf.wasm.setWasmPaths("vendor/");
  for (const b of ["wasm", "webgl", "cpu"]) {
    try {
      if (await tf.setBackend(b)) {
        await tf.ready();
        return b;
      }
    } catch (e) {
      console.warn("Backend indisponible :", b, e);
    }
  }
  throw new Error("Aucun moteur de calcul TensorFlow.js disponible.");
}

export function construire(lstm, dense, lr, T) {
  const m = tf.sequential();
  // TF.js utilise hardSigmoid par défaut pour les portes, Keras (notebook) utilise sigmoid.
  m.add(tf.layers.lstm({ units: lstm, inputShape: [T, 1], recurrentActivation: "sigmoid" }));
  if (dense > 0) m.add(tf.layers.dense({ units: dense, activation: "relu" }));
  m.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));
  m.compile({ optimizer: tf.train.adam(lr), loss: "binaryCrossentropy", metrics: ["accuracy"] });
  return m;
}

export function parametres(lstm, dense) {
  const couches = [{ nom: `LSTM (${lstm})`, n: 4 * lstm * (lstm + 2) }];   // 4 portes x (entrée + mémoire + biais)
  const avant = dense > 0 ? dense : lstm;
  if (dense > 0) couches.push({ nom: `Dense (${dense}, ReLU)`, n: lstm * dense + dense });
  couches.push({ nom: "Dense (1, sigmoïde)", n: avant + 1 });
  return { couches, total: couches.reduce((s, c) => s + c.n, 0) };
}

export function codeKeras(lstm, dense) {
  return [
    "model = models.Sequential([",
    "    layers.Input(shape=(X.shape[1], 1)),",
    `    layers.LSTM(${lstm}),`,
    ...(dense > 0 ? [`    layers.Dense(${dense}, activation='relu'),`] : []),
    "    layers.Dense(1, activation='sigmoid'),   # proba d'être 'normal'",
    "])",
    "model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])",
  ].join("\n");
}

function tenseurX(D, indices) {
  const buf = new Float32Array(indices.length * D.T);
  indices.forEach((i, k) => buf.set(battement(D, i), k * D.T));
  return tf.tensor3d(buf, [indices.length, D.T, 1]);
}

export function tenseurs(D, indices) {
  return {
    xs: tenseurX(D, indices),
    ys: tf.tensor2d(Float32Array.from(indices, (i) => D.y[i]), [indices.length, 1]),
  };
}

// Probabilité d'être NORMAL pour chaque battement.
export async function predire(model, D, indices) {
  const out = new Float32Array(indices.length);
  for (let s = 0; s < indices.length; s += 250) {
    const p = tf.tidy(() => model.predict(tenseurX(D, indices.slice(s, s + 250))).reshape([-1]));
    out.set(await p.data(), s);
    p.dispose();
  }
  return out;
}

export async function predireSignal(model, signal) {
  const p = tf.tidy(() => model.predict(tf.tensor3d(signal, [1, signal.length, 1])).reshape([-1]));
  const v = (await p.data())[0];
  p.dispose();
  return v;
}

// Modèle entraîné avec le notebook (train_export.py, 10 epochs) : on recharge ses poids.
export async function chargerPretraine(T) {
  const j = await fetch("data/modele_pretraine.json").then((r) => r.json());
  const model = construire(j.lstm, j.dense, 0.001, T);
  const poids = j.poids.map((p) => tf.tensor(p.valeurs, p.shape));
  model.setWeights(poids);
  poids.forEach((t) => t.dispose());
  return { model, info: j };
}
