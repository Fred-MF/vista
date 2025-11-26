# Vista – TODO V0.2
Objectif : transformer la V0.1 (prototype) en véritable interface Vista full-screen, fidèle au Design System NéMO, organisée, propre et exploitable par Cursor/Codex.

Cette version se concentre sur 4 grands axes :
1) Interface full-screen  
2) Architecture front propre  
3) Liste d’arrêts + fiche arrêt améliorée  
4) Intégration stable des icônes Material Symbols SVG

Chaque tâche est prévue pour être réalisée **indépendamment** via Cursor.

---

# 1. Interface full-screen (rework index.html + style.css)

## 1.1 Refonte du layout global
- Transformer l’interface pour que la carte occupe 100% de l’écran.
- Ajouter deux panneaux overlay :
  - **Sidebar gauche** = liste d’arrêts
  - **Sidebar droite** = fiche arrêt
- Ajouter une **topbar** fixe contenant :
  - Sélecteur région
  - Sélecteur réseau
  - Boutons (theme, debug, etc.)

## 1.2 Style NéMO
Respecter les principes :
- Couleur accent : **#E75C0B**
- Panneaux avec arrondis (8–12px), ombres légères
- UI sombre (mais compatible style Light)
- Typo lisible + spacing généreux

## 1.3 Responsivité minimale
- Panneaux masquables sur mobile
- Layout qui reste utilisable à partir de 1024px large

---

# 2. Nettoyage & structuration du code

## 2.1 main.js
- Alléger le fichier (orchestration seulement)
- Déplacer toute logique UI → ui.js
- Déplacer toute logique carte → map.js
- Déplacer toute logique data → networkStore.js

## 2.2 map.js
- Centraliser tout ce qui concerne la carte :
  - initialisation
  - gestion des couches
  - affichage des arrêts
- Préparer l’architecture pour l’ajout futur des véhicules

## 2.3 ui.js
- Créer un module propre avec :
  - updateStopList(stops)
  - updateStopDetails(stop)
  - toggleLeftPanel()
  - toggleRightPanel()
- Éviter toute logique métier (appel d’API, logique carte)

## 2.4 api.js
- Centraliser toutes les requêtes OTP MaaSify
- Ajouter une fonction utilitaire :
  - getStopTimes(stopId)
- Améliorer la gestion des erreurs

---

# 3. Liste d’arrêts + fiche arrêt

## 3.1 Liste d’arrêts (sidebar gauche)
- Liste scrollable
- Chaque item affiche :
  - icône d’arrêt (SVG Material Symbols)
  - nom de l’arrêt
  - éventuellement la ligne la plus proche
- Sur clic : recentrer carte + charger fiche arrêt

## 3.2 Fiche arrêt (sidebar droite)
- Afficher :
  - nom de l’arrêt
  - zone/pôle si existant
  - liste “Prochains départs”
- Pour chaque départ :
  - ligne (avec couleur)
  - destination
  - heure théorique vs estimée
  - retard (+/- minutes)
- Gestion des cas :
  - aucun départ
  - arrêt non desservi
  - erreur OTP

## 3.3 Intégration OTP
- Utiliser api.js pour récupérer :
  - stopsById
  - stopTimesForStop

---

# 4. Icônes Material Symbols SVG

## 4.1 Standardiser les icônes
- Mettre tous les fichiers SVG dans :
  assets/icons/material/

## 4.2 Fonctions utilitaires
- Ajouter dans utils.js :
  - une fonction loadSvgIcon(name)
    renvoyant le contenu du fichier (fetch + injection DOM)

## 4.3 Icônes à intégrer en priorité (V0.2)
- “location_on” (arrêts)
- “schedule” (next departure)
- “arrow_forward” (destination)
- “info” (info panel)
- “close” (fermeture panneau)

## 4.4 Homogénéité UI
- Icônes monochromes
- Couleur adaptative selon thème
- Taille standard 24px / 32px selon usage

---

# 5. Fonctionnalités complémentaires (V0.2)

## 5.1 Switching dark/light MapTiler
- Ajouter bouton thème dans la topbar
- Appeler setMapTheme('light'|'dark') dans map.js
- Recharger uniquement le style (pas la carte entière)

## 5.2 Debug amélioré
- Ajouter un panneau flottant en bas à gauche :
  - logs API
  - erreurs
  - durées de requêtes
- Activable/désactivable via topbar

## 5.3 Gestion du chargement
- Ajouter un mini loader dans la sidebar droite quand un arrêt est cliqué
- Indiquer un état “loading”

---

# 6. Nettoyage global

## 6.1 Suppression des vieux fichiers et tests
- Retirer tout code non utilisé
- Harmoniser structure et noms

## 6.2 Mise en conformité modules
- Vérifier que tous les JS utilisent bien :
  export function …
  import { … } from …

## 6.3 Documenter
- Ajouter mini-doc dans les fichiers complexes (map.js, api.js)

---

# 7. Tests manuels à réaliser (checklist)

- Lancement sur MAMP : OK
- Chargement liste régions : OK
- Sélection réseau → caméra se repositionne : OK
- Arrêts affichés : OK
- Liste d’arrêts opérationnelle : OK
- Clic arrêt → fiche arrêt → prochains départs : OK
- Mode clair/sombre : OK
- Panneaux overlay fonctionnels : OK
- Aucun crash console : OK

---

# 🎯 Résultat attendu V0.2

En fin de V0.2, Vista doit :

- ressembler à une vraie application cartographique moderne,
- être full-screen, propre, fluide, utilisable,
- respecter NéMO,
- avoir une architecture modulaire prête pour :
  - véhicules,
  - perturbations,
  - KPI réseau,
  - heatmaps,
  - parcours sentinelles.

La V0.2 est le socle durable du projet Vista.
