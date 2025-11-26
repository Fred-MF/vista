import { getEndpointForRegion, DEFAULT_RADIUS_METERS, REGION_DEFAULT_COORDS, getIconUrlsForTheme } from "./config.js";
import { fetchStops, extractStops, fetchStopDetails, fetchStationAggregated } from "./api.js";
import { 
  initMap, 
  updateMap, 
  setMapTheme, 
  focusStop,
  showNearbyMarker,
  hideNearbyMarker,
  isNearbyMarkerActive,
  setNearbyMarkerCallback
} from "./map.js";
import {
  loadBtn,
  regionSelect,
  initCollapsibles,
  initLayout,
  populateRegionSelect,
  renderStops,
  setDebugMessage,
  setStopsMessage,
  populateNetworkSelect,
  getSelectedNetworkId,
  setLocationStatus,
  onStopListSelect,
  highlightStop,
  renderStopDetailsPanel,
  setStopDetailsLoading,
  setStopDetailsMessage,
  setStopDetailsError,
  openRightPanel,
  closeBurgerMenu,
  onNetworkSelectChange,
  updateRealtimeIcons,
  // Nearby panel
  setNearbyPanelState,
  showNearbyPanel,
  hideNearbyPanel,
  setNearbyLoading,
  renderNearbyStops,
  showNearbyHint,
  onNearbyCardClick,
  onNearbyToggle,
  onNearbyClose
} from "./ui.js";
import { haversineDistance } from "./utils.js";
import {
  ensureNetworkData,
  ensureRegionIndex,
  ensureRegionData,
  getNetworksForRegion,
  getRegionNetworkMap,
  getAvailableRegions,
  buildAreaFromNetwork
} from "./networkStore.js";

let currentNetworks = [];
let userLocation = null;
let networkLockedByUser = false;
let networksReady = false;
let lastStops = [];
let lastStations = [];
let lastArea = null;
let currentTheme = null;
let lastDetailsRequestId = 0;
let activeRouteFilter = [];
let lastStopDetailsPayload = null;
let currentStopMeta = null;

// Unified refresh system for both Stop Details and Nearby panels
let unifiedRefreshTimer = null;
let unifiedRefreshAnimationId = null;
let unifiedRefreshStartTime = null;
const UNIFIED_REFRESH_INTERVAL = 30000; // 30 seconds

// Nearby mode state
let nearbyModeActive = false;
let nearbySearchTimeout = null;
let lastNearbyLocation = null;
const NEARBY_SEARCH_RADIUS = 500; // meters
const NEARBY_SEARCH_DEBOUNCE = 400; // ms

function filterDeparturesByRoutes(departures = []) {
  if (!activeRouteFilter.length) {
    return departures;
  }
  return departures.filter(dep => {
    const routeId = dep?.route?.id;
    return routeId && activeRouteFilter.includes(routeId);
  });
}

function updateStopDetailsView() {
  if (!lastStopDetailsPayload) {
    return;
  }
  const filteredDepartures = filterDeparturesByRoutes(lastStopDetailsPayload.departures || []);
  renderStopDetailsPanel({
    ...lastStopDetailsPayload,
    departures: filteredDepartures,
    activeRouteFilter,
    onRouteToggle: handleRouteFilterToggle
  });
}

function handleRouteFilterToggle(routeId) {
  if (!routeId) {
    activeRouteFilter = [];
  } else if (!activeRouteFilter.length) {
    activeRouteFilter = [routeId];
  } else if (activeRouteFilter.includes(routeId)) {
    activeRouteFilter = activeRouteFilter.filter(id => id !== routeId);
    if (!activeRouteFilter.length) {
      activeRouteFilter = [];
    }
  } else {
    activeRouteFilter = [...activeRouteFilter, routeId];
  }
  updateStopDetailsView();
  renderStops(lastStops, { routeFilter: activeRouteFilter });
}

function withMessage(message) {
  setDebugMessage(message);
  setStopsMessage(message);
}

function getCurrentRegionCode() {
  return regionSelect?.value || "";
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

async function fetchPopupStopInfo(stopId) {
  const regionCode = getCurrentRegionCode();
  if (!regionCode || !stopId) {
    return null;
  }
  try {
    return await fetchStopDetails(regionCode, stopId, { numberOfDepartures: 5 });
  } catch (error) {
    console.warn("fetchPopupStopInfo failed:", error);
    return null;
  }
}

async function fetchPopupStationInfo(stationId) {
  const regionCode = getCurrentRegionCode();
  if (!regionCode || !stationId) {
    return null;
  }
  try {
    return await fetchStationAggregated(regionCode, stationId, { numberOfDepartures: 6 });
  } catch (error) {
    console.warn("fetchPopupStationInfo failed:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Unified Refresh System (Stop Details + Nearby)
// ═══════════════════════════════════════════════════════════

function updateUnifiedProgressBars() {
  if (!unifiedRefreshStartTime) {
    stopUnifiedProgressAnimation();
    return;
  }
  
  const elapsed = Date.now() - unifiedRefreshStartTime;
  const progress = Math.min(100, (elapsed / UNIFIED_REFRESH_INTERVAL) * 100);
  
  // Update Stop Details progress bar (if stop is selected)
  const stopProgressBar = document.getElementById("refresh-progress");
  const stopProgressFill = document.getElementById("refresh-progress-fill");
  if (stopProgressBar && stopProgressFill && currentStopMeta?.stopId) {
    stopProgressBar.classList.add("is-active");
    stopProgressFill.style.width = `${progress}%`;
  }
  
  // Update Nearby progress bar (if nearby mode is active)
  const nearbyProgressBar = document.getElementById("nearby-refresh-progress");
  const nearbyProgressFill = document.getElementById("nearby-refresh-progress-fill");
  if (nearbyProgressBar && nearbyProgressFill && nearbyModeActive && lastNearbyLocation) {
    nearbyProgressBar.classList.add("is-active");
    nearbyProgressFill.style.width = `${progress}%`;
  }
  
  if (progress < 100) {
    unifiedRefreshAnimationId = requestAnimationFrame(updateUnifiedProgressBars);
  }
}

function stopUnifiedProgressAnimation() {
  if (unifiedRefreshAnimationId) {
    cancelAnimationFrame(unifiedRefreshAnimationId);
    unifiedRefreshAnimationId = null;
  }
  unifiedRefreshStartTime = null;
  
  // Reset Stop Details progress bar
  const stopProgressBar = document.getElementById("refresh-progress");
  const stopProgressFill = document.getElementById("refresh-progress-fill");
  if (stopProgressBar) stopProgressBar.classList.remove("is-active");
  if (stopProgressFill) stopProgressFill.style.width = "0%";
  
  // Reset Nearby progress bar
  const nearbyProgressBar = document.getElementById("nearby-refresh-progress");
  const nearbyProgressFill = document.getElementById("nearby-refresh-progress-fill");
  if (nearbyProgressBar) nearbyProgressBar.classList.remove("is-active");
  if (nearbyProgressFill) nearbyProgressFill.style.width = "0%";
}

function startUnifiedProgressAnimation() {
  stopUnifiedProgressAnimation();
  unifiedRefreshStartTime = Date.now();
  unifiedRefreshAnimationId = requestAnimationFrame(updateUnifiedProgressBars);
}

function unifiedRefreshStop() {
  if (unifiedRefreshTimer) {
    clearInterval(unifiedRefreshTimer);
    unifiedRefreshTimer = null;
  }
  stopUnifiedProgressAnimation();
}

async function performUnifiedRefresh() {
  const hasStopDetails = Boolean(currentStopMeta?.stopId);
  const hasNearby = nearbyModeActive && lastNearbyLocation;
  
  // If neither panel is active, stop refresh
  if (!hasStopDetails && !hasNearby) {
    unifiedRefreshStop();
    return;
  }
  
  // Restart progress animation for next cycle
  startUnifiedProgressAnimation();
  
  const regionCode = getCurrentRegionCode();
  if (!regionCode) return;
  
  // Refresh Stop Details if active
  if (hasStopDetails) {
    try {
      const detail = currentStopMeta.isStation
        ? await fetchStationAggregated(regionCode, currentStopMeta.stopId, { numberOfDepartures: 8 })
        : await fetchStopDetails(regionCode, currentStopMeta.stopId, { numberOfDepartures: 8 });
      
      if (currentStopMeta?.stopId) {
        lastStopDetailsPayload = {
          ...lastStopDetailsPayload,
          departures: detail?.departures || []
        };
        updateStopDetailsView();
      }
    } catch (error) {
      console.warn("Stop details auto-refresh failed:", error);
    }
  }
  
  // Refresh Nearby if active
  if (hasNearby) {
    await searchNearbyStops(lastNearbyLocation, { silent: true });
  }
}

function unifiedRefreshStart() {
  unifiedRefreshStop();
  
  const hasStopDetails = Boolean(currentStopMeta?.stopId);
  const hasNearby = nearbyModeActive && lastNearbyLocation;
  
  if (!hasStopDetails && !hasNearby) return;
  
  // Start progress bar animation
  startUnifiedProgressAnimation();
  
  // Set up refresh interval
  unifiedRefreshTimer = setInterval(performUnifiedRefresh, UNIFIED_REFRESH_INTERVAL);
}

// Wrapper functions for backward compatibility
function stopDetailsRefreshStop() {
  // Only stop unified refresh if nearby is also not active
  if (!nearbyModeActive || !lastNearbyLocation) {
    unifiedRefreshStop();
  } else {
    // Just hide the stop details progress bar
    const stopProgressBar = document.getElementById("refresh-progress");
    const stopProgressFill = document.getElementById("refresh-progress-fill");
    if (stopProgressBar) stopProgressBar.classList.remove("is-active");
    if (stopProgressFill) stopProgressFill.style.width = "0%";
  }
}

function stopDetailsRefreshStart() {
  unifiedRefreshStart();
}

function clearSelectedStop(message) {
  stopDetailsRefreshStop();
  currentStopMeta = null;
  highlightStop(null);
  activeRouteFilter = [];
  lastStopDetailsPayload = null;
  setStopDetailsMessage(message || "Clique un arrêt sur la carte ou dans la liste.");
  if (lastStops.length) {
    renderStops(lastStops, { routeFilter: activeRouteFilter });
  }
}

async function loadStopDetails(meta = {}) {
  const regionCode = getCurrentRegionCode();
  if (!regionCode) {
    setStopDetailsMessage("Sélectionne d'abord une région.");
    return;
  }
  if (!meta?.stopId) {
    setStopDetailsMessage("Clique un arrêt sur la carte ou dans la liste.");
    return;
  }
  
  // Stop any existing refresh timer
  stopDetailsRefreshStop();
  
  const coordinates =
    meta.coordinates && typeof meta.coordinates.lat === "number" && typeof meta.coordinates.lon === "number"
      ? meta.coordinates
      : null;

  setStopDetailsLoading(meta.name || (meta.isStation ? "Station" : "Arrêt"));
  const requestId = ++lastDetailsRequestId;
  try {
    const detail = meta.isStation
      ? await fetchStationAggregated(regionCode, meta.stopId, { numberOfDepartures: 8 })
      : await fetchStopDetails(regionCode, meta.stopId, { numberOfDepartures: 8 });
    if (requestId !== lastDetailsRequestId) {
      return;
    }
    
    // Save current stop meta for refresh
    currentStopMeta = {
      stopId: meta.stopId,
      name: meta.name,
      coordinates,
      isStation: Boolean(meta.isStation)
    };
    
    lastStopDetailsPayload = {
      title: detail?.name || meta.name || (meta.isStation ? "Station" : "Arrêt"),
      typeLabel: meta.isStation ? "Station" : "Arrêt",
      coordinates,
      routes: detail?.routes || [],
      departures: detail?.departures || []
    };
    activeRouteFilter = [];
    updateStopDetailsView();
    renderStops(lastStops, { routeFilter: activeRouteFilter });
    
    // Start auto-refresh timer
    stopDetailsRefreshStart();
  } catch (error) {
    console.error("loadStopDetails failed:", error);
    if (requestId !== lastDetailsRequestId) {
      return;
    }
    setStopDetailsError("Impossible de charger les départs.");
  }
}

function handleMapStopSelection(meta) {
  if (!meta?.stopId) {
    return;
  }
  const coordsArray = Array.isArray(meta.coordinates) ? meta.coordinates : null;
  const coordinates =
    coordsArray && coordsArray.length >= 2
      ? { lon: Number(coordsArray[0]), lat: Number(coordsArray[1]) }
      : null;
  highlightStop(meta.stopId);
  openRightPanel();
  loadStopDetails({
    stopId: meta.stopId,
    name: meta.name,
    coordinates,
    isStation: Boolean(meta.isStation)
  });
}

function handleListStopSelection(stop) {
  if (!stop?.stopId) {
    return;
  }
  const coordinates =
    typeof stop.lat === "number" && typeof stop.lon === "number"
      ? { lat: stop.lat, lon: stop.lon }
      : null;
  if (coordinates) {
    focusStop({ lat: coordinates.lat, lon: coordinates.lon }, { zoom: 16 });
  }
  highlightStop(stop.stopId);
  openRightPanel();
  loadStopDetails({
    stopId: stop.stopId,
    name: stop.name,
    coordinates,
    isStation: false
  });
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
  closeBurgerMenu();
  // Désactiver le mode "À proximité" lors du chargement d'un réseau
  if (nearbyModeActive) {
    deactivateNearbyMode();
  }
  setDebugMessage("Chargement en cours…");
  setStopsMessage("Chargement…");
  clearSelectedStop();

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

  // Build area using merged bbox/centroid if network has aliases
  let area = buildAreaFromNetwork(network, regionCode);
  
  // Fallback to user location if no network coords
  if (!area && userLocation) {
    area = {
      lat: userLocation.lat,
      lon: userLocation.lon,
      label: network.name,
      radius: DEFAULT_RADIUS_METERS
    };
  }
  
  if (!area) {
    const message =
      "Aucune coordonnée disponible pour ce réseau. Utilise la géolocalisation.";
    withMessage(message);
    return;
  }

  setStopsMessage(`Recherche autour de ${network.name}…`);

  try {
    console.log("Appel OTP via proxy :", endpoint, "réseau :", network);
    const data = await fetchStops(regionCode, area);
    const { stops, stations } = extractStops(data);
    lastStops = Array.isArray(stops) ? stops : [];
    lastStations = Array.isArray(stations) ? stations : [];
    lastArea = area;
    renderStops(lastStops, { routeFilter: activeRouteFilter });
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
  clearSelectedStop();
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

// ═══════════════════════════════════════════════════════════
// Nearby Mode Functions
// ═══════════════════════════════════════════════════════════

// Wrapper functions for nearby refresh - now uses unified system
function nearbyRefreshStop() {
  // Only stop unified refresh if stop details is also not active
  if (!currentStopMeta?.stopId) {
    unifiedRefreshStop();
  } else {
    // Just hide the nearby progress bar
    const nearbyProgressBar = document.getElementById("nearby-refresh-progress");
    const nearbyProgressFill = document.getElementById("nearby-refresh-progress-fill");
    if (nearbyProgressBar) nearbyProgressBar.classList.remove("is-active");
    if (nearbyProgressFill) nearbyProgressFill.style.width = "0%";
  }
}

function nearbyRefreshStart() {
  unifiedRefreshStart();
}

async function searchNearbyStops(location, options = {}) {
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
    return;
  }

  const regionCode = regionSelect.value;
  if (!regionCode) {
    renderNearbyStops([]);
    return;
  }

  // Save location for refresh
  lastNearbyLocation = location;

  // Only show loading state if not a silent refresh
  if (!options.silent) {
    setNearbyLoading();
    // Stop any existing refresh timer when doing a new search
    nearbyRefreshStop();
  }

  try {
    // Use fetchStopsForNetwork with centroid (stopsByRadius)
    const { fetchStopsForNetwork, fetchStopDepartures } = await import("./api.js");
    
    // Fetch stops near the location
    const result = await fetchStopsForNetwork({
      region: regionCode,
      centroid: { lat: location.lat, lon: location.lon },
      radiusMeters: NEARBY_SEARCH_RADIUS,
      limit: 10
    });

    const stops = result?.stops || [];
    
    if (!stops.length) {
      renderNearbyStops([]);
      if (!options.silent) nearbyRefreshStart();
      return;
    }

    // Sort by distance and take first 6
    const sortedStops = stops
      .filter(s => typeof s.distance === "number")
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);

    // Fetch departures for each stop (in parallel)
    const stopsWithDepartures = await Promise.all(
      sortedStops.map(async (stop) => {
        try {
          const depResult = await fetchStopDepartures({
            region: regionCode,
            stopId: stop.id,
            max: 3
          });
          // Map API response to card format
          const departures = (depResult?.departures || []).map(dep => ({
            headsign: dep.headsign,
            realtime: dep.realtimeDepartureSeconds != null,
            serviceDay: dep.serviceDay,
            scheduledDeparture: dep.scheduledDeparture,
            realtimeDeparture: dep.realtimeDepartureSeconds,
            route: dep.line
          }));
          return { ...stop, departures };
        } catch (err) {
          console.warn("Failed to fetch departures for stop", stop.id, err);
          return { ...stop, departures: [] };
        }
      })
    );

    renderNearbyStops(stopsWithDepartures);
    
    // Start refresh timer after successful search (only if not already a refresh)
    if (!options.silent) {
      nearbyRefreshStart();
    }
  } catch (err) {
    console.error("Nearby search failed:", err);
    renderNearbyStops([]);
    if (!options.silent) nearbyRefreshStart();
  }
}

function handleNearbyMarkerDrag(location) {
  // Stop refresh timer when dragging
  nearbyRefreshStop();
  
  // Debounce the search
  if (nearbySearchTimeout) {
    clearTimeout(nearbySearchTimeout);
  }
  nearbySearchTimeout = setTimeout(() => {
    searchNearbyStops(location);
  }, NEARBY_SEARCH_DEBOUNCE);
}

function activateNearbyMode() {
  if (nearbyModeActive) return;
  
  nearbyModeActive = true;
  closeBurgerMenu();
  
  // Set up the marker callback
  setNearbyMarkerCallback(handleNearbyMarkerDrag);
  
  // Utiliser le centroïde du réseau sélectionné comme position initiale
  const network = getSelectedNetwork();
  const regionCode = getCurrentRegionCode();
  const area = buildAreaFromNetwork(network, regionCode);
  const initialLocation = area ? { lat: area.lat, lon: area.lon } : null;
  
  // Show the marker at network centroid
  const initialPos = showNearbyMarker(initialLocation);
  
  // Si on a une position initiale, lancer la recherche immédiatement
  // Sinon afficher l'indication
  if (initialPos) {
    // Show loading state and trigger search immediately
    setNearbyLoading();
    searchNearbyStops(initialPos);
  } else {
    showNearbyHint();
  }
}

function deactivateNearbyMode() {
  if (!nearbyModeActive) return;
  
  nearbyModeActive = false;
  
  // Clear pending search
  if (nearbySearchTimeout) {
    clearTimeout(nearbySearchTimeout);
    nearbySearchTimeout = null;
  }
  
  // Stop refresh timer
  nearbyRefreshStop();
  lastNearbyLocation = null;
  
  // Remove marker and hide panel
  hideNearbyMarker();
  hideNearbyPanel();
  setNearbyMarkerCallback(null);
}

function toggleNearbyMode() {
  if (nearbyModeActive) {
    deactivateNearbyMode();
  } else {
    activateNearbyMode();
  }
}

function handleNearbyCardClick(stopId) {
  if (!stopId) return;
  
  // Find the stop in the nearby results
  // For now, we'll trigger a stop details fetch similar to map click
  const meta = {
    stopId,
    name: null,
    lat: null,
    lon: null
  };
  
  handleMapStopSelection(meta);
}

async function init() {
  initLayout();
  initMap({
    fetchStopInfo: fetchPopupStopInfo,
    fetchStationInfo: fetchPopupStationInfo,
    onStopClick: handleMapStopSelection
  });
  onStopListSelect(handleListStopSelection);
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
  const themeLightBtn = document.getElementById("theme-light");
  const themeDarkBtn = document.getElementById("theme-dark");
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
  const updateThemeButtons = () => {
    if (themeLightBtn) themeLightBtn.setAttribute("aria-pressed", currentTheme === "light" ? "true" : "false");
    if (themeDarkBtn) themeDarkBtn.setAttribute("aria-pressed", currentTheme === "dark" ? "true" : "false");
  };
  updateThemeButtons();
  const setTheme = (theme) => {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("vista_theme", currentTheme);
    setMapTheme(currentTheme);
    applyLegendIcons();
    updateThemeButtons();
    updateRealtimeIcons();
    // Les données seront automatiquement ré-appliquées après le chargement du style
    // via le mécanisme pendingMapApply dans map.js
  };
  if (themeLightBtn) {
    themeLightBtn.addEventListener("click", () => setTheme("light"));
  }
  if (themeDarkBtn) {
    themeDarkBtn.addEventListener("click", () => setTheme("dark"));
  }
  regionSelect.addEventListener("change", handleRegionChange);
  onNetworkSelectChange(handleNetworkChange);
  loadBtn.addEventListener("click", handleLoadClick);

  // Nearby mode handlers
  onNearbyToggle(toggleNearbyMode);
  onNearbyClose(deactivateNearbyMode);
  onNearbyCardClick(handleNearbyCardClick);
}

document.addEventListener("DOMContentLoaded", init);
