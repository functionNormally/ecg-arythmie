# Détecter une arythmie dans un ECG avec un LSTM : TP interactif

Site du TP « Compétence Transversale IA » (L3 Sciences de la Vie, parcours BPN).
Il reprend le notebook `TP_BPN_ECG_arythmie_Colab.ipynb` étape par étape. **L'entraînement du réseau de neurones
se fait dans le navigateur de chaque étudiant** (TensorFlow.js) : aucun serveur de calcul, aucune installation, et
150 étudiants peuvent l'utiliser en même temps.

| Étape | Contenu | Cellules du notebook |
|---|---|---|
| 1. Données | ECG5000, répartition des classes, battements normaux / arythmies, moyennes | 2 à 6 |
| 2. Séparation | découpage stratifié entraînement / validation / test, proportion réglable | 7 et 8 |
| 3. Modèle | taille du LSTM et de la couche Dense, schéma, nombre de paramètres, code Keras | 9 et 10 |
| 4. Entraînement | epochs, batch, vitesse d'apprentissage, courbes en direct ; ou modèle pré-entraîné | 11 à 13 |
| 5. Évaluation | `classification_report`, matrice de confusion, seuil réglable, exemples de faux négatifs / positifs | 14 et 15 |
| 6. Tester un ECG | dépôt du fichier CSV fourni par l'enseignant, ou battement n° i du test | 16 et 17 |
| 7. Questions | les questions du notebook, avec des pistes | 18 |

Durée indicative de l'entraînement (5 epochs, modèle du notebook) : environ 1 minute sur un ordinateur portable récent.

## Fichiers

- `index.html`, `style.css`, `js/` : le site.
- `data/ecg5000.bin` : les 4 998 battements (int16, échelle dans `data/meta.json`) ; `data/meta.json` contient aussi le
  découpage exact du notebook ; `data/modele_pretraine.json` : poids du modèle entraîné avec Keras (10 epochs, 98,9 % sur le test).
- `exemples/ecg_XX.csv` : ECG à distribuer aux étudiants (140 valeurs par fichier). Le corrigé n'est **pas** dans ce dépôt.
- `vendor/` : TensorFlow.js 4.22.0 (Apache-2.0) et Chart.js 4.4.1 (MIT), servis localement.

Outil pédagogique : ne pas utiliser pour un diagnostic médical.
Données : ECG5000 (domaine public, PhysioNet / UCR Time Series Archive).
