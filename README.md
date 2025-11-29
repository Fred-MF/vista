# Vista  
Monitoring temps réel des réseaux de transport (OTP MaaSify)

Vista est une application web légère en HTML/CSS/JS vanilla, destinée aux exploitants de réseaux de transport pour visualiser en direct l'activité de leur réseau : arrêts, prochains départs, véhicules en temps réel, perturbations, etc.

L’application s'appuie sur :
- MapTiler (styles Vista Light / Dark)
- MapLibre GL JS (moteur de carte)
- OTP MaaSify (API GraphQL + GTFS-RT)
- un proxy PHP (MAMP) pour contourner les CORS

---

# 📦 Architecture du projet

Structure principale :

vista/
  index.html
  assets/
    css/style.css
    icons/material/  (SVG Material Symbols)
    js/
      main.js
      map.js
      api.js
      ui.js
      networkStore.js
      utils.js
  data/
    index.php
    regions.json
    networks/
      <region>.json
      networks.json
  proxy.php
  docs/
    vista-objectifs.md
    vista-architecture.md

La description détaillée de chaque fichier est disponible dans :
- docs/vista-architecture.md
- docs/vista-objectifs.md

### Modules JS (V0.2.1)
- `main.js` : orchestration pure (sélections, géoloc, synchronisation carte/UI, thème).
- `map.js` : encapsule MapLibre et expose des callbacks (`fetchStopInfo`, `fetchStationInfo`, `onStopClick`, `onVehicleClick`) fournis par `main.js`.
- `api.js` : toutes les requêtes OTP passent par un helper commun (`callOtp`) et retournent des objets normalisés (routes, départs triés).
- `ui.js` : gère uniquement le DOM/panneaux et relaie les interactions via les handlers injectés.
- `networkStore.js` : charge/cache les fichiers `data/`, bascule automatiquement sur `data/index.php` lorsque l'hébergement bloque l'accès direct aux `.json`, et propose `findNearestRegionNetwork`, `findNearestNetworkInRegion`, `buildAreaFromNetwork`.
- `vehicles.js` : gestion des véhicules en temps réel (GTFS-RT VehiclePositions), animation fluide, interpolation des positions, filtrage intelligent.

## Layout V0.2.1 (full-screen)
- `div#vista-app` encapsule l’application et véhicule les classes d’état (`sidebar-left-collapsed`, etc.).
- `header#vista-topbar` contient les sélecteurs région/réseau, boutons Layout/Thème/Debug et affiche le statut de géolocalisation.
- `main#vista-shell` aligne :
  - `aside#sidebar-left` (liste d’arrêts, légende MapLibre),
  - `div#map-wrapper` (contient `#map` + overlays KPI),
- `aside#sidebar-right` (fiche arrêt, cartes “carousel” NéMO pour les prochains départs).
- `div#debug-panel` est un panneau flottant (toggle via `#debug-toggle`).
- Les modules JS manipulent ces zones via des IDs fixes (`stops-list`, `stop-details`, `kpi-chips`, etc.) exposés dans `ui.js`.

---

# 🚀 Fonctionnalités (V0.2.1)

- Carte full-screen (MapTiler)
- Sélection région / réseau MaaSify
- Chargement et affichage des arrêts
- Popup arrêt
- Panneau latéral liste d'arrêts
- Panneau latéral fiche arrêt (prochains départs)
- **Véhicules en temps réel** : affichage animé des véhicules en circulation (GTFS-RT VehiclePositions), popups dynamiques, surbrillance des tracés de lignes
- Zone debug
- Thème clair / sombre

---

# 🛠 Installation & lancement

## 1. Cloner le repo

git clone https://github.com/<username>/vista.git  
cd vista

## 2. Installer un serveur local

Utiliser MAMP : https://www.mamp.info/en/mamp/mac/

## 3. Placer le projet dans MAMP

Mettre le dossier vista/ dans :

/Applications/MAMP/htdocs/

L’application sera accessible à :

http://localhost:8888/vista/

## 4. Ajouter la clé MapTiler

Dans assets/js/config.js :

MAPTILER_API_KEY = "A_REMPLACER";

## 5. Vérifier proxy PHP

Accéder à :

http://localhost:8888/vista/proxy.php

Résultat attendu :

{"error":"Invalid request"}

## 6. Vérifier le relai de données statiques

Accéder à :

http://localhost:8888/vista/data/index.php?resource=regions

Résultat attendu : contenu JSON (`generatedAt`, `regions`).  
Ce relai est utilisé en fallback par l’interface publique ET par l’admin quand l’hébergement empêche le service direct des fichiers `.json`.

---

# 🌐 API OTP MaaSify

Toutes les requêtes passent par :

proxy.php?region=<code_region>

api.js envoie ensuite la requête GraphQL vers le bon endpoint OTP.

---

# 🎨 Design System NéMO

Vista suit la charte NéMO :
- couleur d'accent : #E75C0B
- UI sombre et contrastée
- éléments arrondis
- icônes Material Symbols (SVG) dans assets/icons/material/
- fiches arrêts basées sur le composant “carousel-card” (ligne · direction · statut temps réel vs planifié · horaire/retard).

---

# 🧩 Développement avec Cursor

Le projet est optimisé pour Cursor + Codex :
- modules courts et clairs
- logique maîtrisée par fichier (map.js, api.js, ui.js…)
- documentation précise dans /docs
- facilité à demander des refactorings ciblés via Cmd+K

Exemple de prompt Cursor :

Tu es mon assistant dev pour Vista.
Respecte les contraintes du projet (HTML/CSS/JS vanilla, MapTiler, OTP via proxy PHP).
Applique la modification demandée en alignement avec docs/vista-architecture.md.

---

# 🗺 Roadmap

## V0.2
- Interface full-screen NéMO
- Panneaux overlay
- Amélioration fiches arrêts
- Intégration SVG Material Symbols propre

## V0.2.1
- Véhicules temps réel (VehiclePositions) avec animation fluide
- Popups dynamiques véhicules
- Surbrillance des tracés de lignes

## V0.3
- Perturbations (Alerts)
- KPI réseau live

## V1.0
- Parcours sentinelles
- Heatmap fréquence
- Contrôle qualité données GTFS/RT

---

# 📝 Licence

Projet privé (Monkey Factory / NéMO / IRIS Interactive).  
Tous droits réservés.
