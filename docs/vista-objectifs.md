# Vista – Objectifs fonctionnels
Application web légère destinée aux exploitants de réseaux de transport pour visualiser en temps réel l’état du réseau, basée sur les API OTP MaaSify.

## 🎯 Vision générale
Vista doit offrir une vue simple, claire et rapide de l’activité d’un réseau de transport public :
- compréhension immédiate du fonctionnement du réseau (normal / perturbé),
- surveillance des arrêts, des lignes et des véhicules,
- détection des retards, suppressions et anomalies,
- support visuel pour la prise de décision et la communication interne.

L’application doit fonctionner dans un navigateur, sans framework lourd, en HTML/CSS/JS vanilla, et s’appuyer sur une carte MapTiler personnalisée full-screen (ambiances claire et sombre).

---

## 🟦 1. Vue réseau “salle de contrôle”
Objectif : donner une vision globale et instantanée de l’état du réseau.

- Carte pleine page (style Vista Light / Dark).
- Affichage de toutes les lignes actives du réseau.
- Zoom automatique sur la zone du réseau sélectionné.
- Visualisation des arrêts et pôles d’échange.
- Visualisation des véhicules en temps réel (bus, tram, train, cars).
- Barre supérieure avec indicateurs clés :
  - nombre de véhicules en service,
  - nombre de lignes actives,
  - lignes impactées par des perturbations,
  - pourcentage d’arrêts “à l’heure” / “en retard”.

---

## 🟩 2. Monitoring par ligne
Permettre à l’exploitant de suivre ligne par ligne ce qu’il se passe.

- Sélecteur de ligne (numéro, nom, recherche).
- Tracé de la ligne sur la carte (patterns OTP).
- Liste des véhicules actuellement en service sur cette ligne.
- Informations véhicule :
  - destination,
  - retard,
  - position GPS,
  - niveau de charge si disponible (occupancy).
- Calcul du headway (intervalle réel entre deux véhicules).
- Détection :
  - trous de service (headway trop grand),
  - grappes de véhicules (plusieurs véhicules collés).

---

## 🟨 3. Monitoring par arrêt
L’exploitant doit pouvoir regarder précisément ce qui se passe sur un arrêt donné.

### Fiche arrêt
- Liste des prochains départs toutes lignes confondues.
- Heure théorique vs heure estimée (TripUpdates).
- Retard (+/- minutes).
- Dernier passage connu.
- Indicateur de charge du prochain véhicule (si disponible).
- Mise en évidence des suppressions.

### Pôles d’échange
- Vue consolidée sur les gares / hubs.
- Résumé des correspondances (respectées / ratées).
- Liste des perturbations affectant ce pôle.

---

## 🟥 4. Perturbations & messages réseau
Représenter clairement les incidents et impacts sur le réseau.

- Récupération des “Alerts” OTP (GTFS-RT Alerts).
- Affichage :
  - titre,
  - description,
  - validité,
  - lignes/arrêts affectés.
- Visualisation de zones impactées sur la carte.
- Résumé “réseau impacté” :
  - nombre de lignes affectées,
  - nombre de courses annulées ou perturbées.

---

## 🟦 5. Qualité de service temps réel (KPI live)
Donner à l’exploitant des indicateurs synthétiques sur les dernières minutes / heures.

- Pourcentage de départs à l’heure (retard < 5 min).
- Pourcentage de courses annulées.
- Segments les plus lents ou en retard.
- Ligne la plus perturbée sur les 60 dernières minutes.
- Histogramme simple du retard moyen par ligne.

---

## 🟪 6. Supervision des véhicules (GTFS-RT VehiclePositions)
Visualiser clairement la flotte en circulation.

- Markers en temps réel (mise à jour toutes les X secondes).
- Couleur par ligne.
- Rotation du marker en fonction de l’azimut si disponible.
- Popup véhicule :
  - numéro / identifiant véhicule,
  - course en cours,
  - retard,
  - prochains arrêts,
  - temps estimé d’arrivée.

---

## 🟫 7. Fonctions avancées “Vista Signature”
Distinguer Vista d’une simple carte GTFS.

### Parcours sentinelles
- Définir plusieurs trajets types (OD).
- Interroger OTP périodiquement pour détecter :
  - augmentation du temps de parcours,
  - pertes de correspondances,
  - perturbations impactant ces trajets.

### Zones sous-desservies (instantané)
- Heatmap de fréquence réelle (nb de départs/h).
- Mise en évidence des zones à faible niveau de service à l’instant T.

### Qualité de la donnée
Détecter automatiquement les anomalies dans les données open-data ou temps réel :
- arrêts orphelins,
- patterns incohérents,
- alerts orphelines,
- trips planifiés mais sans temps réel alors que la ligne est active.

---

## 🟧 8. Interface & Design System NéMO
L’interface doit suivre les principes du Design System NéMO :

- Carte full-screen (zéro scroll).
- Panneaux latéraux flottants en surcouche.
- Couleurs et accents NéMO (orange #E75C0B).
- Icônes en SVG dérivées de Google Material Symbols (Outlined).
- UI simple, lisible, contrastée, adaptée à un usage en salle d’exploitation.

---

## 🟩 9. Usage et contexte technique
- Utilisable sur une simple page web (intégrable dans un site existant).
- Dépendances minimales.
- Code clair, modulaire, en ES Modules.
- Appels OTP réalisés via `proxy.php` (MAMP / Apache).
- Compatible Mouse + Trackpad + écrans tactiles.
- Visible à distance (projection murale possible).

---

## 🏆 Résultat attendu
Un outil robuste et élégant, permettant à un exploitant de :

- comprendre en quelques secondes l’état du réseau,
- identifier les problèmes (retards, suppressions, incidents),
- suivre stops, lignes, véhicules et KPIs,
- appuyer ses décisions opérationnelles.

Vista doit rester simple, rapide, compact, maîtrisable, et fidèle à l’ADN technique de NéMO & MaaSify.
