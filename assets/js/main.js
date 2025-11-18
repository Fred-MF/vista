import { getEndpointForRegion, DEFAULT_RADIUS_METERS, REGION_DEFAULT_COORDS, getIconUrlsForTheme } from "./config.js";
import { fetchStops, extractStops } from "./api.js";
import { initMap, updateMap, setMapTheme } from "./map.js";
import {
  loadBtn,
  regionSelect,
  networkSelect,
  initCollapsibles,
  populateRegionSelect,
  renderStops,
  setDebugMessage,
  setStopsMessage,
  populateNetworkSelect,
  getSelectedNetworkId,
  setLocationStatus
} from "./ui.js";
import { haversineDistance } from "./utils.js";
import {
  ensureNetworkData,
  ensureRegionIndex,
  ensureRegionData,
  getNetworksForRegion,
  getRegionNetworkMap,
  getAvailableRegions
} from "./networkStore.js";

let currentNetworks = [];
let userLocation = null;
let networkLockedByUser = false;
let networksReady = false;
let lastStops = [];
let lastStations = [];
let lastArea = null;
let currentTheme = null;

function withMessage(message) {
  setDebugMessage(message);
  setStopsMessage(message);
}

function findNetworkById(networkId) {
  if (!networkId) {
    return null;
  }
  return (
    currentNetworks.find(
      network =>
        network.agencyId === networkId ||
        network.id === networkId
    ) || null
  );
}

function findNearestNetwork(networks) {
  if (!networks.length) {
    return null;
  }

  if (!userLocation) {
    return networks[0];
  }

  let nearest = networks[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  networks.forEach(network => {
    const coords = getNetworkCoords(network);
    if (!coords) {
      return;
    }
    const distance = haversineDistance(userLocation, coords);
    if (distance < nearestDistance) {
      nearest = network;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function findNearestRegionNetwork() {
  if (!networksReady || !userLocation) {
    return null;
  }

  const regionMap = getRegionNetworkMap();
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  Object.entries(regionMap).forEach(([regionCode, networks]) => {
    (networks || []).forEach(network => {
      const coords = getNetworkCoords(network);
      if (!coords) {
        return;
      }
      const distance = haversineDistance(userLocation, coords);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { regionCode, network };
      }
    });
  });

  return best;
}

async function autoSelectRegionForLocation() {
  let nearest = findNearestRegionNetwork();
  // Fallback: if networks not yet loaded, choose region by default centroids
  if (!nearest && userLocation) {
    let altBestCode = null;
    let altBestDist = Number.POSITIVE_INFINITY;
    Object.entries(REGION_DEFAULT_COORDS).forEach(([code, coords]) => {
      const d = haversineDistance(userLocation, coords);
      if (d < altBestDist) {
        altBestDist = d;
        altBestCode = code;
      }
    });
    if (altBestCode) {
      // Ensure some data for that region then recompute networks
      try {
        await ensureRegionData(altBestCode);
      } catch {}
      const mapAfter = getRegionNetworkMap();
      const networks = mapAfter[altBestCode] || [];
      const pick = findNearestNetwork(networks);
      if (pick) {
        nearest = { regionCode: altBestCode, network: pick };
      }
    }
  }
  if (!nearest) {
    return false;
  }

  if (regionSelect.value !== nearest.regionCode) {
    regionSelect.value = nearest.regionCode;
  }
  // Ensure regional data is loaded before populating
  await ensureRegionData(nearest.regionCode);
  networkLockedByUser = false;
  await refreshNetworkOptions(true);
  setLocationStatus(`Réseau détecté automatiquement : ${nearest.network.name}`);
  return true;
}

function getNetworkCoords(network) {
  if (!network) {
    return null;
  }
  if (
    network.centroid &&
    typeof network.centroid.lat === "number" &&
    typeof network.centroid.lon === "number"
  ) {
    return { lat: network.centroid.lat, lon: network.centroid.lon };
  }
  if (typeof network.lat === "number" && typeof network.lon === "number") {
    return { lat: network.lat, lon: network.lon };
  }
  return null;
}

async function refreshNetworkOptions(forceAutoSelection = false) {
  const regionCode = regionSelect.value;

  if (!regionCode) {
    currentNetworks = [];
    populateNetworkSelect([], null);
    return;
  }

  if (networksReady) {
    await ensureRegionData(regionCode);
  }
  currentNetworks = networksReady ? getNetworksForRegion(regionCode) : [];

  const defaultNetwork =
    !networkLockedByUser || forceAutoSelection
      ? findNearestNetwork(currentNetworks)
      : findNetworkById(getSelectedNetworkId());

  const selectedId = defaultNetwork?.agencyId || defaultNetwork?.id || null;
  populateNetworkSelect(currentNetworks, selectedId);
}

function getSelectedNetwork() {
  const networkId = getSelectedNetworkId();
  return findNetworkById(networkId) || findNearestNetwork(currentNetworks);
}

async function handleLoadClick() {
  setDebugMessage("Chargement en cours…");
  setStopsMessage("Chargement…");

  const regionCode = regionSelect.value;
  if (!regionCode) {
    const message = "Merci de choisir une région.";
    withMessage(message);
    updateMap([], null, userLocation);
    return;
  }

  const endpoint = getEndpointForRegion(regionCode);
  if (!endpoint) {
    const message =
      "Aucun endpoint OTP configuré pour cette région. Vérifie config.js.";
    withMessage(message);
    updateMap([], null, userLocation);
    return;
  }

  const network = getSelectedNetwork();
  if (!network) {
    const message =
      "Aucun réseau référencé pour cette région. Complète la configuration.";
    withMessage(message);
    updateMap([], null, userLocation);
    return;
  }

  const coords = getNetworkCoords(network) || userLocation;
  if (!coords) {
    const message =
      "Aucune coordonnée disponible pour ce réseau. Utilise la géolocalisation.";
    withMessage(message);
    return;
  }

  const baseRadius =
    Number(network.radiusMeters) ||
    Number(network.radius) ||
    DEFAULT_RADIUS_METERS;
  const radiusValue = Number.isFinite(baseRadius) ? Math.round(baseRadius) : DEFAULT_RADIUS_METERS;
  const area = {
    lat: coords.lat,
    lon: coords.lon,
    label: network.name,
    radius: radiusValue,
    bbox: network.bbox
  };

  setStopsMessage(`Recherche autour de ${network.name}…`);

  try {
    console.log("Appel OTP via proxy :", endpoint, "réseau :", network);
    const data = await fetchStops(regionCode, area);
    const { stops, stations } = extractStops(data);
    lastStops = Array.isArray(stops) ? stops : [];
    lastStations = Array.isArray(stations) ? stations : [];
    lastArea = area;
    renderStops(lastStops);
    updateMap(lastStops, lastArea, userLocation, lastStations);

    setDebugMessage(JSON.stringify(data, null, 2));
    console.log("Réponse OTP :", data);
  } catch (err) {
    console.error(err);
    const message = "Erreur lors de l'appel OTP : " + err.message;
    withMessage(message);
    updateMap([], area, userLocation);
  }
}

function handleRegionChange() {
  networkLockedByUser = false;
  refreshNetworkOptions(true);
}

function handleNetworkChange() {
  networkLockedByUser = true;
  const network = getSelectedNetwork();
  if (network) {
    setLocationStatus(`Réseau choisi : ${network.name}`);
    const coords = getNetworkCoords(network);
    if (coords) {
      updateMap([], { ...coords, label: network.name }, userLocation, []);
    }
  }
}

function detectUserLocation() {
  if (!navigator.geolocation) {
    setLocationStatus("Géolocalisation non supportée par ce navigateur.");
    return;
  }

  setLocationStatus("Recherche de la position en cours…");
  navigator.geolocation.getCurrentPosition(
    position => {
      userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      setLocationStatus(
        `Position détectée (${userLocation.lat.toFixed(
          4
        )}, ${userLocation.lon.toFixed(4)})`
      );
      Promise.resolve(autoSelectRegionForLocation()).then(selected => {
        if (!selected) {
          refreshNetworkOptions(true);
        } else {
          // Si une région/réseau a été auto-sélectionné, lancer la recherche immédiatement
          handleLoadClick();
        }
      });
      updateMap([], null, userLocation);
    },
    error => {
      console.warn("Géolocalisation impossible :", error);
      setLocationStatus("Géolocalisation indisponible ou refusée.");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000
    }
  );
}

async function init() {
  initMap();
  try {
    initCollapsibles();
    // Load region index first, then populate region select
    await ensureRegionIndex();
    networksReady = true;
    const regions = getAvailableRegions();
    populateRegionSelect(regions);
    await refreshNetworkOptions(true);
    if (userLocation) {
      await autoSelectRegionForLocation();
    }
  } catch (err) {
    console.error(err);
    setDebugMessage("Impossible de charger le référentiel réseaux : " + err.message);
    populateNetworkSelect([], null);
  }

  detectUserLocation();
  // Theme handling
  const themeBtn = document.getElementById("theme-toggle");
  const saved = localStorage.getItem("vista_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  currentTheme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", currentTheme);
  setMapTheme(currentTheme);
  const legendStopImg = document.getElementById("legend-stop-img");
  const legendStationImg = document.getElementById("legend-station-img");
  const applyLegendIcons = () => {
    const urls = getIconUrlsForTheme(currentTheme);
    if (legendStopImg) legendStopImg.src = urls.stopSvg;
    if (legendStationImg) legendStationImg.src = urls.stationSvg;
  };
  applyLegendIcons();
  const setThemeBtnLabel = () => {
    if (!themeBtn) return;
    // Affiche l'action à effectuer
    themeBtn.textContent = currentTheme === "dark" ? "Mode clair" : "Mode sombre";
  };
  setThemeBtnLabel();
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", currentTheme);
      localStorage.setItem("vista_theme", currentTheme);
      setMapTheme(currentTheme);
      applyLegendIcons();
      setThemeBtnLabel();
      setTimeout(() => {
        updateMap(lastStops, lastArea, userLocation, lastStations);
      }, 400);
    });
  }
  regionSelect.addEventListener("change", handleRegionChange);
  networkSelect.addEventListener("change", handleNetworkChange);
  loadBtn.addEventListener("click", handleLoadClick);
}

document.addEventListener("DOMContentLoaded", init);
