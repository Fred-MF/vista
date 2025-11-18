let aggregatedData = null; // data/networks.json (fallback)
let regionIndex = null; // array of region codes from data/regions.json
const regionCache = new Map(); // regionCode -> array of networks

async function fetchJSON(url) {
  const response = await fetch(url);
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

async function loadAggregatedIfNeeded() {
  if (aggregatedData) {
    return aggregatedData;
  }
  const data = await tryFetchJSON("data/networks.json?ts=" + Date.now());
  if (data) {
    aggregatedData = data;
  }
  return aggregatedData;
}

export async function ensureRegionIndex() {
  if (regionIndex) {
    return regionIndex;
  }
  // Prefer lightweight index
  const index = await tryFetchJSON("data/regions.json?ts=" + Date.now());
  if (index && Array.isArray(index.regions)) {
    regionIndex = index.regions.slice();
    return regionIndex;
  }
  // Fallback to aggregated file keys
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
  // Try dedicated regional file first
  const regional = await tryFetchJSON(`data/networks/${regionCode}.json?ts=${Date.now()}`);
  if (Array.isArray(regional)) {
    regionCache.set(regionCode, regional);
    return regional;
  }
  // Fallback to aggregated
  const agg = await loadAggregatedIfNeeded();
  const fromAgg = agg?.regions?.[regionCode] ?? [];
  regionCache.set(regionCode, fromAgg);
  return fromAgg;
}

// Backward-compat: keep original name in case other modules still call it
export async function ensureNetworkData() {
  await ensureRegionIndex();
  // Prime nothing else; data is loaded per-region on demand
  return true;
}

export function getNetworksForRegion(regionCode) {
  if (!regionCode) {
    return [];
  }
  if (regionCache.has(regionCode)) {
    return regionCache.get(regionCode) ?? [];
  }
  // If not cached yet, try aggregated (sync read) for immediate UI until ensureRegionData finishes
  const list = aggregatedData?.regions?.[regionCode] ?? [];
  return list;
}

export function getNetwork(regionCode, networkId) {
  return getNetworksForRegion(regionCode).find(
    network => network.agencyId === networkId || network.id === networkId
  );
}

export function getGeneratedAt() {
  // Prefer regions.json generatedAt if available later; fallback aggregated now
  return aggregatedData?.generatedAt ?? null;
}

export function getRegionNetworkMap() {
  // Build a map from what's currently cached, falling back to aggregated for missing regions
  const map = {};
  const knownRegions = new Set([
    ...Object.keys(aggregatedData?.regions ?? {}),
    ...Array.from(regionCache.keys())
  ]);
  knownRegions.forEach(code => {
    map[code] = regionCache.get(code) ?? aggregatedData?.regions?.[code] ?? [];
  });
  return map;
}

export function getAvailableRegions() {
  return regionIndex ? regionIndex.slice() : Object.keys(aggregatedData?.regions ?? {});
}
