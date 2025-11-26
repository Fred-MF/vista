import { DEFAULT_RADIUS_METERS, REGION_DEFAULT_COORDS } from "./config.js";
import { haversineDistance } from "./utils.js";

const DATA_API_ENDPOINT = "data/index.php";
const LABELS_FILE = "data/network_labels.json";

let aggregatedData = null; // data/networks.json (fallback)
let regionIndex = null; // array of region codes from data/regions.json
const regionCache = new Map(); // regionCode -> array of networks
let networkLabels = {}; // agencyId -> { zone, reseau }

async function fetchJSON(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${url}`);
  }
  return response.json();
}

async function tryFetchJSON(url) {
  try {
    return await fetchJSON(url);
  } catch (_err) {
    return null;
  }
}

async function fetchDataApi(resource, params = {}) {
  try {
    const url = new URL(DATA_API_ENDPOINT, window.location.href);
    url.searchParams.set("resource", resource);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    url.searchParams.set("ts", Date.now().toString());
    const response = await fetch(url.toString(), { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on ${url}`);
    }
    return await response.json();
  } catch (error) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("Vista data API fallback failed:", error);
    }
    return null;
  }
}

async function loadAggregatedIfNeeded() {
  if (aggregatedData) {
    return aggregatedData;
  }
  let data = await tryFetchJSON(`data/networks.json?ts=${Date.now()}`);
  if (!data) {
    data = await fetchDataApi("aggregated");
  }
  if (data) {
    aggregatedData = data;
  }
  return aggregatedData;
}

function getAggregatedRegion(regionCode) {
  return aggregatedData?.regions?.[regionCode] ?? [];
}

function listKnownRegionCodes() {
  return new Set([
    ...Object.keys(aggregatedData?.regions ?? {}),
    ...Array.from(regionCache.keys())
  ]);
}

function getNetworkCoordinates(network) {
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

async function loadNetworkLabels() {
  try {
    const data = await tryFetchJSON(`${LABELS_FILE}?ts=${Date.now()}`);
    if (data && data.labels) {
      networkLabels = data.labels;
    }
  } catch (err) {
    console.warn("Failed to load network labels:", err);
  }
  return networkLabels;
}

export function getNetworkLabel(agencyId) {
  return networkLabels[agencyId] || null;
}

export function isNetworkAlias(agencyId) {
  const label = networkLabels[agencyId];
  return Boolean(label?.aliasOf);
}

export function getNetworkAliasOf(agencyId) {
  const label = networkLabels[agencyId];
  return label?.aliasOf || null;
}

export function getNetworkAliases(primaryAgencyId) {
  // Returns array of agencyIds that are aliases of the given network
  const aliases = [];
  Object.entries(networkLabels).forEach(([agencyId, label]) => {
    if (label?.aliasOf === primaryAgencyId) {
      aliases.push(agencyId);
    }
  });
  return aliases;
}

export function getAllNetworkIds(primaryAgencyId) {
  // Returns the primary + all its aliases
  return [primaryAgencyId, ...getNetworkAliases(primaryAgencyId)];
}

export function getMergedBbox(regionCode, primaryAgencyId) {
  // Merge bboxes of primary network + all its aliases
  const allIds = getAllNetworkIds(primaryAgencyId);
  const networks = getNetworksForRegion(regionCode, true); // include aliases
  
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  let found = false;
  
  allIds.forEach(id => {
    const network = networks.find(n => (n.agencyId || n.id) === id);
    if (network?.bbox) {
      found = true;
      if (network.bbox.minLat < minLat) minLat = network.bbox.minLat;
      if (network.bbox.minLon < minLon) minLon = network.bbox.minLon;
      if (network.bbox.maxLat > maxLat) maxLat = network.bbox.maxLat;
      if (network.bbox.maxLon > maxLon) maxLon = network.bbox.maxLon;
    }
  });
  
  if (!found) return null;
  return { minLat, minLon, maxLat, maxLon };
}

export function getMergedCentroid(regionCode, primaryAgencyId) {
  // Calculate average centroid of primary + aliases
  const allIds = getAllNetworkIds(primaryAgencyId);
  const networks = getNetworksForRegion(regionCode, true);
  
  let totalLat = 0, totalLon = 0, count = 0;
  
  allIds.forEach(id => {
    const network = networks.find(n => (n.agencyId || n.id) === id);
    const coords = getNetworkCoordinates(network);
    if (coords) {
      totalLat += coords.lat;
      totalLon += coords.lon;
      count++;
    }
  });
  
  if (count === 0) return null;
  return { lat: totalLat / count, lon: totalLon / count };
}

export function getMergedRadius(regionCode, primaryAgencyId) {
  // Get max radius among primary + aliases
  const allIds = getAllNetworkIds(primaryAgencyId);
  const networks = getNetworksForRegion(regionCode, true);
  
  let maxRadius = 0;
  
  allIds.forEach(id => {
    const network = networks.find(n => (n.agencyId || n.id) === id);
    const r = Number(network?.radiusMeters) || Number(network?.radius) || 0;
    if (r > maxRadius) maxRadius = r;
  });
  
  return maxRadius || DEFAULT_RADIUS_METERS;
}

export function getNetworkDisplayName(network) {
  if (!network) return "";
  const agencyId = network.agencyId || network.id;
  const label = agencyId ? networkLabels[agencyId] : null;
  
  // If we have both zone and reseau, return "Zone / Réseau"
  if (label?.zone && label?.reseau) {
    return `${label.zone} / ${label.reseau}`;
  }
  // If we only have reseau, return it
  if (label?.reseau) {
    return label.reseau;
  }
  // If we only have zone, return "Zone / nom OTP"
  if (label?.zone) {
    return `${label.zone} / ${network.name || agencyId}`;
  }
  // Fallback to OTP name
  return network.name || agencyId || "";
}

export async function ensureRegionIndex() {
  if (regionIndex) {
    return regionIndex;
  }
  
  // Load labels in parallel with region index
  loadNetworkLabels();
  let index = await tryFetchJSON(`data/regions.json?ts=${Date.now()}`);
  if (!index) {
    index = await fetchDataApi("regions");
  }
  if (index && Array.isArray(index.regions)) {
    regionIndex = index.regions.slice();
    return regionIndex;
  }
  const agg = await loadAggregatedIfNeeded();
  const map = agg?.regions ?? {};
  regionIndex = Object.keys(map);
  return regionIndex;
}

export async function ensureRegionData(regionCode) {
  if (!regionCode) {
    return [];
  }
  if (regionCache.has(regionCode)) {
    return regionCache.get(regionCode);
  }
  let regional = await tryFetchJSON(`data/networks/${regionCode}.json?ts=${Date.now()}`);
  if (!Array.isArray(regional)) {
    regional = await fetchDataApi("region", { code: regionCode });
  }
  if (Array.isArray(regional)) {
    regionCache.set(regionCode, regional);
    return regional;
  }
  const agg = await loadAggregatedIfNeeded();
  const fromAgg = agg?.regions?.[regionCode] ?? [];
  regionCache.set(regionCode, fromAgg);
  return fromAgg;
}

export async function ensureNetworkData() {
  await ensureRegionIndex();
  await loadAggregatedIfNeeded();
  return true;
}

export function getNetworksForRegion(regionCode, includeAliases = false) {
  if (!regionCode) {
    return [];
  }
  let networks;
  if (regionCache.has(regionCode)) {
    networks = regionCache.get(regionCode) ?? [];
  } else {
    networks = getAggregatedRegion(regionCode);
  }
  
  if (includeAliases) {
    return networks;
  }
  
  // Filter out networks that are aliases
  return networks.filter(network => {
    const agencyId = network.agencyId || network.id;
    return !isNetworkAlias(agencyId);
  });
}

export function findNetworkById(regionCode, networkId) {
  if (!regionCode || !networkId) {
    return null;
  }
  return (
    getNetworksForRegion(regionCode).find(
      network => network.agencyId === networkId || network.id === networkId
    ) || null
  );
}

export function getNetwork(regionCode, networkId) {
  return findNetworkById(regionCode, networkId);
}

export function getGeneratedAt() {
  return aggregatedData?.generatedAt ?? null;
}

export function getRegionNetworkMap() {
  const map = {};
  listKnownRegionCodes().forEach(code => {
    map[code] = regionCache.get(code) ?? getAggregatedRegion(code);
  });
  return map;
}

export function getAvailableRegions() {
  if (regionIndex) {
    return regionIndex.slice();
  }
  return Object.keys(aggregatedData?.regions ?? {});
}

export function findNearestNetworkInRegion(regionCode, location) {
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
    return null;
  }
  const networks = getNetworksForRegion(regionCode);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  networks.forEach(network => {
    const coords = getNetworkCoordinates(network);
    if (!coords) {
      return;
    }
    const distance = haversineDistance(location, coords);
    if (distance < bestDistance) {
      best = network;
      bestDistance = distance;
    }
  });
  return best;
}

export function findNearestRegionNetwork(location) {
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
    return null;
  }
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  listKnownRegionCodes().forEach(regionCode => {
    const networks = getNetworksForRegion(regionCode);
    networks.forEach(network => {
      const coords = getNetworkCoordinates(network);
      if (!coords) {
        return;
      }
      const distance = haversineDistance(location, coords);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { regionCode, network };
      }
    });
  });
  return best;
}

export function getNetworkCoordinatesFor(regionCode, networkId) {
  return getNetworkCoordinates(findNetworkById(regionCode, networkId));
}

export function getRegionFallbackCoords(regionCode) {
  return REGION_DEFAULT_COORDS?.[regionCode] || null;
}

export function buildAreaFromNetwork(network, regionCode = null) {
  const agencyId = network?.agencyId || network?.id;
  const hasAliases = agencyId && getNetworkAliases(agencyId).length > 0;
  
  // If this network has aliases and we know the region, merge areas
  if (hasAliases && regionCode) {
    const mergedBbox = getMergedBbox(regionCode, agencyId);
    const mergedCentroid = getMergedCentroid(regionCode, agencyId);
    const mergedRadius = getMergedRadius(regionCode, agencyId);
    
    if (mergedCentroid) {
      return {
        lat: mergedCentroid.lat,
        lon: mergedCentroid.lon,
        label: network?.name || "Zone réseau",
        radius: Math.round(mergedRadius),
        bbox: mergedBbox
      };
    }
  }
  
  // Default: use network's own coordinates
  const coords = getNetworkCoordinates(network);
  if (!coords) {
    return null;
  }
  const baseRadius =
    Number(network?.radiusMeters) ||
    Number(network?.radius) ||
    DEFAULT_RADIUS_METERS;
  const radiusValue = Number.isFinite(baseRadius) ? Math.round(baseRadius) : DEFAULT_RADIUS_METERS;
  return {
    lat: coords.lat,
    lon: coords.lon,
    label: network?.name || "Zone réseau",
    radius: radiusValue,
    bbox: network?.bbox
  };
}
