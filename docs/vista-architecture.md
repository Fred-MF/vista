# Vista – Architecture technique

Vista est une application web légère, construite en HTML/CSS/JS vanilla, avec un backend minimal (proxy PHP) permettant d’interroger les API OTP MaaSify.
Le code est organisé en modules ES6 pour maximiser la clarté, la maintenabilité et faciliter le travail avec Cursor/Codex.

---

# 1. Structure globale du projet

vista/
  index.html
  assets/
    css/
      style.css
    icons/
      material/
        (SVG Material Symbols)
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
    (autres documents projet)

---

# 2. Rôle des fichiers principaux

## 2.1 index.html
- Point d’entrée de l’application.
- Structure V0.2 :
  - `div#vista-app` = shell principal qui héberge les classes d’état (`sidebar-left-collapsed`, etc.).
  - `header#vista-topbar` = topbar fixe (logo, statut géoloc, sélecteurs région/réseau, boutons `layout-left-toggle`, `layout-right-toggle`, `theme-toggle`, `debug-toggle`).
  - `main#vista-shell` = layout full-screen :
    - `aside#sidebar-left` (liste d’arrêts, légende, hook `ul#stops-list`),
    - `div#map-wrapper` (MapLibre `#map`, overlay KPI `#kpi-chips`),
    - `aside#sidebar-right` (fiche arrêt, hook `div#stop-details`).
  - `div#debug-panel` = panneau flottant (toggle via `#debug-toggle`).
- Charge `assets/js/main.js`.

---

## 2.2 assets/css/style.css
- Mise en page générale.
- Gère :
  - carte full-screen,
  - panneaux latéraux,
  - topbar,
  - thèmes clair / sombre,
  - styles NéMO (couleurs, arrondis, typographies).

---

## 2.3 assets/js/main.js
- Point d’orchestration.
- Initialise :
  - la carte (`map.js`),
  - l’interface (`ui.js`),
  - les données réseau (`networkStore.js`),
  - les premières requêtes OTP.
- Coordonne les interactions utilisateur.

---

## 2.4 assets/js/map.js
- Gestion de la carte MapLibre/MapTiler.
- Responsabilités :
  - création et configuration de la carte,
  - changement de thème Light/Dark,
  - ajout de sources & layers (arrêts, stations, clusters),
  - interactions carte (popup, survol, zoom) via callbacks injectés (`fetchStopInfo`, `fetchStationInfo`, `onStopClick`),
  - rendu des arrêts / véhicules.
- Ne connaît pas OTP ni le DOM : tout passe par les callbacks fournis par `main.js`.

---

## 2.5 assets/js/api.js
- Couche d’accès aux API OTP MaaSify via le proxy PHP.
- Contient :
  - un helper générique `callOtp()` (POST `proxy.php`) qui centralise erreurs et parsing,
  - requêtes GraphQL spécialisées (`fetchStops`, `fetchStopDetails`, `fetchStationAggregated`, etc.),
  - normalisation systématique des routes/départs (tri par temps absolu).
- Aucun effet de bord : chaque fonction retourne uniquement des objets de données.

---

## 2.6 assets/js/ui.js
- Gestion du DOM et des panneaux.
- Affiche :
  - la liste des arrêts,
  - la fiche arrêt (cartes “carousel” inspirées du Design System NéMO : colonne unique ligne/direction/statut/horaire, badge de retard, infobulle sur le statut temps réel),
  - les stats,
  - la zone debug.
- Aucun accès direct à OTP ni à MapLibre.
- Fournit les hooks layout (`initLayout`, `togglePanel`, `showRightPanelLoading`, `updateStopDetails`, etc.) utilisés par `main.js` pour manipuler `#vista-topbar`, `#sidebar-left`, `#sidebar-right` et `#debug-panel`.

---

## 2.7 assets/js/networkStore.js
- Gère les métadonnées réseau :
  - chargement/cache de `data/regions.json` et `data/networks/*.json`,
  - fallback sur `data/index.php` lorsque l’hébergeur bloque l’accès direct aux `.json`,
  - fallback final sur `data/networks.json` agrégé.
- Fournit :
  - `ensureNetworkData()`, `ensureRegionData(regionCode)`,
  - `getNetworksForRegion(regionCode)`, `findNetworkById(regionCode, networkId)`,
  - `findNearestRegionNetwork(location)` / `findNearestNetworkInRegion(regionCode, location)` pour la géolocalisation,
  - `buildAreaFromNetwork(network)` pour produire la zone recherchée par `main.js`,
  - helpers coordonnés (`getNetworkCoordinatesFor`, `getRegionFallbackCoords`).

---

## 2.8 assets/js/utils.js
- Fonctions utilitaires :
  - distance Haversine,
  - formatage (heures, retards),
  - helpers divers.

---

## 2.9 data/
- Données statiques + relai PHP :
  - `regions.json`, `networks/*.json`, `networks.json`,
  - `index.php` : endpoint simple (`?resource=regions|aggregated|region&code=ara`) qui stream les fichiers JSON quand ils ne peuvent pas être servis directement (mutualisé, authentifié, etc.). Utilisé par le front **et** l’admin.

---

## 2.10 proxy.php
- Serveur intermédiaire entre le frontend et les endpoints OTP MaaSify.
- Rôle :
  - éviter les CORS,
  - router `region → endpoint OTP`,
  - transférer les requêtes GraphQL.

## 2.11 admin/*
- Interface d’administration pour reconstruire le référentiel.
- `panel.js` consomme désormais les mêmes JSON que le front, avec fallback systématique via `../data/index.php` avant de basculer sur `../data/networks.json`. Permet de fonctionner même quand les fichiers statiques sont protégés.

---

# 3. Flux fonctionnel (MVP)

1. L’utilisateur ouvre `index.html`.
2. `main.js` initialise la carte et l’UI.
3. L’utilisateur choisit une région → `networkStore.js` fournit les réseaux.
4. L’utilisateur choisit un réseau → Vista :
   - centre la carte,
   - interroge OTP pour les arrêts (`api.js`),
   - affiche les arrêts (`map.js`),
   - remplit la liste d’arrêts (`ui.js`).
5. L’utilisateur clique un arrêt → Vista récupère les prochains passages et les affiche dans la fiche arrêt.

---

# 4. Principes d’architecture

- Séparation stricte carte / API / UI / orchestrateur.
- Pas de framework (pas de React, Vue, bundler).
- Modules ES6 partout.
- Design System NéMO comme référentiel UI.
- Code simple, lisible, compréhensible par Cursor.
- Design full-screen avec panneaux overlay.
- Données OTP isolées dans `api.js`.
- Réseaux MaaSify isolés dans `networkStore.js`.

---

# 5. Évolutions futures prévues

- Vue full-screen NéMO (V0.2).
- Ajout des véhicules (GTFS-RT VehiclePositions).
- Ajout des perturbations (GTFS-RT Alerts).
- KPI temps réel.
- Refactorisation possible de `map.js` (modules par layer).

---

# Conclusion

Ce document sert de référence pour maintenir une architecture claire et stable.  
Cursor/Codex doit s’y référer pour toutes les futures implémentations afin de rester cohérent avec l’intention initiale de Vista, son périmètre, et l’organisation voulue.
