import { DEFAULT_LIMIT, DEFAULT_RADIUS_METERS } from "./config.js";

const ROUTE_CORE_FIELDS = `
        id
        shortName
        longName
        mode
        color
        textColor
`;

const STOP_LIST_FIELDS = `
        id
        gtfsId
        name
        lat
        lon
        code
        zoneId
        platformCode
        locationType
        parentStation {
          id
          gtfsId
          name
          lat
          lon
        }
        routes {
${ROUTE_CORE_FIELDS}
        }
`;

const STOPS_BY_RADIUS_QUERY = `
  query StopsByRadius($lat: Float!, $lon: Float!, $radius: Int!, $first: Int!) {
    stopsByRadius(lat: $lat, lon: $lon, radius: $radius, first: $first) {
      edges {
        node {
          distance
          stop {
            id
            gtfsId
            name
            lat
            lon
            locationType
            parentStation {
              id
              gtfsId
              name
              lat
              lon
            }
          }
        }
      }
    }
  }
`;

const STOPS_BY_BBOX_QUERY = `
  query StopsByBbox($minLat: Float!, $minLon: Float!, $maxLat: Float!, $maxLon: Float!) {
    stopsByBbox(minLat: $minLat, minLon: $minLon, maxLat: $maxLat, maxLon: $maxLon) {
      id
      gtfsId
      name
      lat
      lon
      locationType
      parentStation {
        id
        gtfsId
        name
        lat
        lon
      }
    }
  }
`;

const STOPS_BY_RADIUS_WITH_ROUTES_QUERY = `
  query StopsByRadiusExtended($lat: Float!, $lon: Float!, $radius: Int!, $first: Int!) {
    stopsByRadius(lat: $lat, lon: $lon, radius: $radius, first: $first) {
      edges {
        node {
          distance
          stop {
${STOP_LIST_FIELDS}
          }
        }
      }
    }
  }
`;

const STOPS_BY_BBOX_WITH_ROUTES_QUERY = `
  query StopsByBboxExtended($minLat: Float!, $minLon: Float!, $maxLat: Float!, $maxLon: Float!) {
    stopsByBbox(minLat: $minLat, minLon: $minLon, maxLat: $maxLat, maxLon: $maxLon) {
${STOP_LIST_FIELDS}
    }
  }
`;

const STOP_INFO_QUERY = `
  query StopInfo($id: String!) {
    stop(id: $id) {
${STOP_LIST_FIELDS}
      desc
    }
  }
`;

const STOP_DEPARTURES_QUERY = `
  query StopRealtimeDepartures($id: String!, $startTime: Long!, $timeRange: Int!, $numberOfDepartures: Int!) {
    stop(id: $id) {
      id
      gtfsId
      name
      platformCode
      stoptimesWithoutPatterns(
        startTime: $startTime,
        timeRange: $timeRange,
        numberOfDepartures: $numberOfDepartures,
        omitNonPickups: false,
        omitCanceled: false
      ) {
        serviceDay
        scheduledDeparture
        realtimeDeparture
        realtime
        realtimeState
        headsign
        pickupType
        stop {
          platformCode
        }
        trip {
          id
          tripHeadsign
          pattern {
            id
            headsign
            stops {
              name
            }
          }
          route {
${ROUTE_CORE_FIELDS}
          }
        }
      }
    }
  }
`;

const STOP_DEPS_BY_DATE_QUERY = `
  query StopDepsByDate($id: String!, $date: String!) {
    stop(id: $id) {
      id
      name
      stoptimesForServiceDate(date: $date, omitNonPickups: false, omitCanceled: false) {
        pattern { headsign route { id shortName longName mode color textColor } }
        stoptimes {
          serviceDay
          scheduledDeparture
          realtimeDeparture
          realtime
          headsign
          trip { tripHeadsign }
        }
      }
    }
  }
`;

const STATION_DETAILS_QUERY = `
  query StationDetails($id: String!, $startTime: Long!, $timeRange: Int!, $numberOfDepartures: Int!) {
    station(id: $id) {
      id
      name
      routes { id shortName longName mode color textColor }
      stops {
        id
        gtfsId
        platformCode
        stoptimesForPatterns(startTime: $startTime, timeRange: $timeRange, numberOfDepartures: $numberOfDepartures) {
          pattern {
            headsign
            route { id shortName longName mode color textColor }
            stops { name }
          }
          stoptimes {
            serviceDay
            scheduledDeparture
            realtimeDeparture
            realtime
            headsign
            trip { tripHeadsign }
          }
        }
      }
    }
  }
`;

const STATION_DEPS_BY_DATE_QUERY = `
  query StationDepsByDate($id: String!, $date: String!) {
    station(id: $id) {
      id
      name
      stops {
        id
        gtfsId
        stoptimesForServiceDate(date: $date, omitNonPickups: false, omitCanceled: false) {
          pattern {
            headsign
            route { id shortName longName mode color textColor }
            stops { name }
          }
          stoptimes {
            serviceDay
            scheduledDeparture
            realtimeDeparture
            realtime
            headsign
            trip { tripHeadsign }
          }
        }
      }
    }
  }
`;

class OtpApiError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.name = "OtpApiError";
    this.type = type;
    Object.assign(this, details);
  }
}

async function callOtp(regionCode, query, variables) {
  if (!regionCode) {
    throw new OtpApiError("validation", "Parameter `regionCode` is required.");
  }
  try {
    const response = await fetch("proxy.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        region: regionCode,
        query,
        variables
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OtpApiError("network", `Proxy HTTP ${response.status} – ${response.statusText}`, {
        status: response.status,
        body: errorText
      });
    }

    const payload = await response.json();
    if (payload?.error) {
      throw new OtpApiError("network", payload.error, { raw: payload });
    }
    if (payload?.errors?.length) {
      throw new OtpApiError(
        "otp",
        payload.errors.map(err => err.message).join("; "),
        { errors: payload.errors }
      );
    }
    return payload.data;
  } catch (error) {
    if (error instanceof OtpApiError) {
      throw error;
    }
    throw new OtpApiError("network", error?.message || "Unknown network error", {
      cause: error
    });
  }
}

function normalizeRoute(route) {
  if (!route) return null;
  return {
    id: route.id || route.gtfsId || null,
    shortName: route.shortName || "",
    longName: route.longName || "",
    mode: route.mode || null,
    color: route.color || null,
    textColor: route.textColor || null
  };
}

function normalizeStopRoutes(source) {
  const lines = Array.isArray(source?.routes)
    ? source.routes.map(normalizeRoute).filter(Boolean)
    : [];
  const lineIds = lines.map(line => line?.id).filter(Boolean);
  return { lines, lineIds };
}

function hasValidCoordinates(point) {
  return typeof point?.lat === "number" && typeof point?.lon === "number";
}

function normalizeStopListItem(stop, extra = {}) {
  const { lines, lineIds } = normalizeStopRoutes(stop);
  return {
    id: stop.gtfsId || stop.id,
    name: stop.name || "Arrêt sans nom",
    lat: stop.lat,
    lon: stop.lon,
    zoneId: stop.zoneId || stop.parentStation?.zoneId || null,
    lines,
    lineIds,
    isHub: stop.locationType === "STATION" || stop.locationType === 1 || Boolean(stop.parentStation),
    parentStationId: stop.parentStation ? stop.parentStation.gtfsId || stop.parentStation.id : null,
    distance: extra.distance ?? null
  };
}

function toEpochMillis(serviceDay, seconds) {
  if (!Number.isFinite(serviceDay) || !Number.isFinite(seconds)) {
    return null;
  }
  return (serviceDay + seconds) * 1000;
}

function computeDelayMinutes(scheduledSeconds, realtimeSeconds) {
  if (!Number.isFinite(scheduledSeconds)) return null;
  if (!Number.isFinite(realtimeSeconds)) return 0;
  const deltaSeconds = realtimeSeconds - scheduledSeconds;
  return Math.round(deltaSeconds / 60);
}

function inferDepartureStatus(realtimeState, delayMinutes) {
  if (realtimeState === "CANCELED" || realtimeState === "SKIPPED") {
    return "cancelled";
  }
  if (Number.isFinite(delayMinutes) && delayMinutes >= 2) {
    return "late";
  }
  return "on_time";
}

function sortDeparturesByAbsoluteTime(list = []) {
  return [...list].sort((a, b) => {
    const at = getDepartureAbsoluteSeconds(a);
    const bt = getDepartureAbsoluteSeconds(b);
    return at - bt;
  });
}

function getDepartureAbsoluteSeconds(dep) {
  if (!dep) return Number.POSITIVE_INFINITY;
  if (typeof dep.scheduledTime === "number") {
    return dep.scheduledTime / 1000;
  }
  const serviceDay = Number(dep.serviceDay) || 0;
  if (typeof dep.realtimeDepartureSeconds === "number") {
    return serviceDay + dep.realtimeDepartureSeconds;
  }
  if (typeof dep.realtimeDeparture === "number" && dep.realtimeDeparture > 1e10) {
    return dep.realtimeDeparture / 1000;
  }
  if (typeof dep.realtimeDeparture === "number") {
    return serviceDay + dep.realtimeDeparture;
  }
  if (typeof dep.scheduledDeparture === "number") {
    return serviceDay + dep.scheduledDeparture;
  }
  return Number.POSITIVE_INFINITY;
}

function convertModernDepartureToLegacy(dep) {
  if (!dep) return null;
  const serviceDay = dep.serviceDay ?? null;
  const scheduledDeparture =
    dep.scheduledTime != null && serviceDay != null
      ? Math.round(dep.scheduledTime / 1000) - serviceDay
      : dep.scheduledDeparture ?? null;
  let realtimeDeparture = null;
  if (dep.realtimeDeparture != null && serviceDay != null) {
    realtimeDeparture = Math.round(dep.realtimeDeparture / 1000) - serviceDay;
  } else if (typeof dep.realtimeDepartureSeconds === "number") {
    realtimeDeparture = dep.realtimeDepartureSeconds;
  }
  const headsign = resolveDepartureHeadsign(
    { headsign: dep.headsign, trip: dep.trip, line: dep.line },
    ""
  );
  return {
    serviceDay,
    scheduledDeparture,
    realtimeDeparture,
    realtime: realtimeDeparture != null,
    headsign,
    route: normalizeRoute(dep.line)
  };
}

function getTerminalStopNameFromPattern(pattern) {
  const stops = Array.isArray(pattern?.stops) ? pattern.stops : null;
  if (!stops?.length) {
    return "";
  }
  for (let i = stops.length - 1; i >= 0; i -= 1) {
    const entry = stops[i];
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (name) {
      return name;
    }
  }
  return "";
}

function isValidHeadsign(value) {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Filter out placeholder/invalid headsigns like "- <> -", "<>", "---", etc.
  if (/^[\s\-<>]+$/.test(trimmed)) return false;
  return true;
}

function resolveDepartureHeadsign(source, fallback = "") {
  const base = typeof source?.headsign === "string" ? source.headsign.trim() : "";
  const tripHeadsign =
    typeof source?.trip?.tripHeadsign === "string" ? source.trip.tripHeadsign.trim() : "";
  const patternHeadsign =
    typeof source?.trip?.pattern?.headsign === "string"
      ? source.trip.pattern.headsign.trim()
      : "";
  const terminalStop = getTerminalStopNameFromPattern(source?.trip?.pattern);
  const routeLong =
    typeof source?.line?.longName === "string" ? source.line.longName.trim() : "";
  const routeShort =
    typeof source?.line?.shortName === "string" ? source.line.shortName.trim() : "";
  const fallbackTrim = typeof fallback === "string" ? fallback.trim() : "";
  
  // Return first valid headsign in priority order
  if (isValidHeadsign(base)) return base;
  if (isValidHeadsign(tripHeadsign)) return tripHeadsign;
  if (isValidHeadsign(patternHeadsign)) return patternHeadsign;
  if (isValidHeadsign(terminalStop)) return terminalStop;
  if (isValidHeadsign(routeLong)) return routeLong;
  if (isValidHeadsign(routeShort)) return routeShort;
  if (isValidHeadsign(fallbackTrim)) return fallbackTrim;
  
  return "";
}

function isValidBbox(bbox) {
  if (!bbox) return false;
  return (
    typeof bbox.minLat === "number" &&
    typeof bbox.minLon === "number" &&
    typeof bbox.maxLat === "number" &&
    typeof bbox.maxLon === "number"
  );
}

/**
 * Fetch all visible stops for a given network footprint.
 * @param {Object} params
 * @param {string} params.region - Région OTP (ara, idf, ...).
 * @param {string} params.networkId - Identifiant du réseau MaaSify (utilisation log/debug).
 * @param {Object} [params.bbox] - Bounding box (minLat,minLon,maxLat,maxLon).
 * @param {Object} [params.centroid] - Fallback center `{ lat, lon }` pour la recherche par rayon.
 * @param {number} [params.radiusMeters] - Rayon pour `stopsByRadius`.
 * @param {number} [params.limit] - Nombre maximum de stops à récupérer.
 * @returns {{ networkId: string|null, stops: Array, emptyReason?: string }}
 */
export async function fetchStopsForNetwork({
  region,
  networkId,
  bbox,
  centroid,
  radiusMeters = DEFAULT_RADIUS_METERS,
  limit = DEFAULT_LIMIT
} = {}) {
  if (!region) {
    throw new OtpApiError("validation", "Parameter `region` is required.");
  }

  const useBbox = isValidBbox(bbox);
  const useRadius =
    !useBbox && centroid && typeof centroid.lat === "number" && typeof centroid.lon === "number";

  if (!useBbox && !useRadius) {
    throw new OtpApiError(
      "validation",
      "Either `bbox` or `centroid` must be provided to fetch network stops."
    );
  }

  const cappedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 1000) : DEFAULT_LIMIT;
  const normalizedRadius = Number.isFinite(radiusMeters)
    ? Math.max(Math.trunc(radiusMeters), 100)
    : DEFAULT_RADIUS_METERS;

  const query = useBbox ? STOPS_BY_BBOX_WITH_ROUTES_QUERY : STOPS_BY_RADIUS_WITH_ROUTES_QUERY;
  const variables = useBbox
    ? {
        minLat: bbox.minLat,
        minLon: bbox.minLon,
        maxLat: bbox.maxLat,
        maxLon: bbox.maxLon
      }
    : {
        lat: centroid.lat,
        lon: centroid.lon,
        radius: normalizedRadius,
        first: cappedLimit
      };

  const payload = await callOtp(region, query, variables);
  const rawStops = useBbox
    ? Array.isArray(payload?.stopsByBbox) ? payload.stopsByBbox : []
    : (payload?.stopsByRadius?.edges || [])
        .map(edge => {
          if (!edge?.node?.stop) return null;
          return { ...edge.node.stop, distance: edge.node.distance };
        })
        .filter(Boolean);

  const stops = rawStops.filter(hasValidCoordinates).map(stop => normalizeStopListItem(stop, {
    distance: stop.distance
  }));

  return {
    networkId: networkId || null,
    stops,
    emptyReason: stops.length ? undefined : "noStops"
  };
}

async function fetchStopDetailsModern({ region, stopId }) {
  if (!region || !stopId) {
    throw new OtpApiError("validation", "`region` and `stopId` are required.");
  }
  const payload = await callOtp(region, STOP_INFO_QUERY, { id: String(stopId) });
  const stop = payload?.stop;
  if (!stop) {
    return {
      id: String(stopId),
      name: "",
      code: null,
      description: null,
      zone: null,
      position: null,
      servedLines: [],
      lastUpdated: new Date().toISOString(),
      emptyReason: "stopNotFound"
    };
  }

  return {
    id: stop.gtfsId || stop.id,
    name: stop.name || "",
    code: stop.code || null,
    description: stop.desc || null,
    zone: stop.zoneId || stop.parentStation?.name || null,
    position: hasValidCoordinates(stop) ? { lat: stop.lat, lon: stop.lon } : null,
    servedLines: Array.isArray(stop.routes) ? stop.routes.map(normalizeRoute).filter(Boolean) : [],
    lastUpdated: new Date().toISOString(),
    parentStation: stop.parentStation
      ? {
          id: stop.parentStation.gtfsId || stop.parentStation.id,
          name: stop.parentStation.name || ""
        }
      : null
  };
}

async function fetchStopDetailsLegacy(regionCode, stopId, opts = {}) {
  if (!regionCode || !stopId) {
    throw new OtpApiError("validation", "`regionCode` and `stopId` are required (legacy signature).");
  }
  const detail = await fetchStopDetailsModern({ region: regionCode, stopId });
  const numberOfDepartures = Number.isFinite(opts.numberOfDepartures) ? opts.numberOfDepartures : 5;
  let departures = [];
  try {
    const realtime = await fetchStopDepartures({
      region: regionCode,
      stopId,
      max: numberOfDepartures,
      timeRangeSeconds: opts.timeRange
    });
    departures = Array.isArray(realtime.departures)
      ? realtime.departures.map(convertModernDepartureToLegacy).filter(Boolean)
      : [];
  } catch (error) {
    console.warn("fetchStopDetails legacy departures failed:", error);
  }

  return {
    name: detail.name,
    routes: detail.servedLines.map(route => ({
      id: route.id,
      shortName: route.shortName,
      longName: route.longName,
      mode: route.mode,
      color: route.color,
      textColor: route.textColor
    })),
    departures
  };
}

/**
 * Stop details helper that supports both the new ({ region, stopId }) signature
 * and the legacy (regionCode, stopId, opts) usage.
 */
export async function fetchStopDetails(arg1, arg2, arg3 = {}) {
  if (typeof arg1 === "object" && arg1 !== null && !Array.isArray(arg1)) {
    return fetchStopDetailsModern(arg1);
  }
  return fetchStopDetailsLegacy(arg1, arg2, arg3);
}

/**
 * Fetch realtime departures for a stop.
 * @param {Object} params
 * @param {string} params.region
 * @param {string} params.stopId
 * @param {number} [params.max=8]
 * @param {number} [params.timeRangeSeconds=5400]
 * @param {number} [params.startTime] - unix epoch seconds
 * @returns {{ stopId: string, generatedAt: number, departures: Array, emptyReason?: string }}
 */
export async function fetchStopDepartures({
  region,
  stopId,
  max = 5,
  timeRangeSeconds,
  startTime
} = {}) {
  if (!region || !stopId) {
    throw new OtpApiError("validation", "`region` and `stopId` are required.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const start = Number.isFinite(startTime) ? Math.floor(startTime) : nowSec;
  const timeRange = Number.isFinite(timeRangeSeconds)
    ? Math.max(Math.floor(timeRangeSeconds), 900)
    : 48 * 3600;
  const numberOfDepartures = Number.isFinite(max) ? Math.max(Math.floor(max), 1) : 5;

  const payload = await callOtp(region, STOP_DEPARTURES_QUERY, {
    id: String(stopId),
    startTime: start,
    timeRange,
    numberOfDepartures
  });

  const stop = payload?.stop;
  if (!stop) {
    return {
      stopId: String(stopId),
      generatedAt: Date.now(),
      departures: [],
      emptyReason: "stopNotFound"
    };
  }

  const stoptimes = Array.isArray(stop.stoptimesWithoutPatterns) ? stop.stoptimesWithoutPatterns : [];
  const fallbackHeadsign = stop?.name || "";
  const normalized = stoptimes
    .map(st => {
      const scheduledSeconds = Number.isFinite(st.scheduledDeparture) ? st.scheduledDeparture : null;
      const realtimeSeconds = Number.isFinite(st.realtimeDeparture) ? st.realtimeDeparture : null;
      const delayMinutes = computeDelayMinutes(scheduledSeconds, realtimeSeconds);
      const rawHeadsign = resolveDepartureHeadsign(
        { headsign: st.headsign, trip: st.trip, line: st.trip?.route },
        fallbackHeadsign
      );
      return {
        tripId: st.trip?.id || null,
        serviceDay: st.serviceDay ?? null,
        line: normalizeRoute(st.trip?.route),
        headsign: rawHeadsign,
        scheduledDeparture: scheduledSeconds,
        scheduledTime: toEpochMillis(st.serviceDay, scheduledSeconds),
        realtimeDepartureSeconds: realtimeSeconds,
        realtimeDeparture: toEpochMillis(st.serviceDay, realtimeSeconds),
        delayMinutes,
        status: inferDepartureStatus(st.realtimeState, delayMinutes),
        platform: st.stop?.platformCode || stop.platformCode || null,
        occupancy: st.trip?.occupancyStatus || null
      };
    })
    .filter(dep => dep.line && dep.scheduledTime != null);

  const departures = sortDeparturesByAbsoluteTime(normalized).slice(0, numberOfDepartures);

  return {
    stopId: stop.gtfsId || stop.id || String(stopId),
    generatedAt: Date.now(),
    departures,
    emptyReason: departures.length ? undefined : "noDepartures"
  };
}

export async function fetchStops(regionCode, area) {
  const useBbox =
    area?.bbox &&
    typeof area.bbox.minLat === "number" &&
    typeof area.bbox.minLon === "number" &&
    typeof area.bbox.maxLat === "number" &&
    typeof area.bbox.maxLon === "number";

  const variables = useBbox
    ? {
        minLat: area.bbox.minLat,
        minLon: area.bbox.minLon,
        maxLat: area.bbox.maxLat,
        maxLon: area.bbox.maxLon
      }
    : {
        lat: area.lat,
        lon: area.lon,
        radius: Math.trunc(area.radius ?? DEFAULT_RADIUS_METERS),
        first: DEFAULT_LIMIT
      };

  const data = await callOtp(
    regionCode,
    useBbox ? STOPS_BY_BBOX_QUERY : STOPS_BY_RADIUS_QUERY,
    variables
  );
  return { data };
}

export function extractStops(data) {
  let items = [];
  if (data?.data?.stopsByBbox) {
    items = (data.data.stopsByBbox || []).map(s => {
      const { lineIds } = normalizeStopRoutes(s);
      return {
        id: s.gtfsId || s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        locationType: s.locationType,
        parentStation: s.parentStation || null,
        lineIds
      };
    });
  } else {
    const edges = data?.data?.stopsByRadius?.edges ?? [];
    items = edges
      .map(edge => edge?.node)
      .filter(Boolean)
      .map(node => {
        if (!node.stop) return null;
        const { lineIds } = normalizeStopRoutes(node.stop);
        return {
          id: node.stop.gtfsId || node.stop.id,
          name: node.stop.name,
          lat: node.stop.lat,
          lon: node.stop.lon,
          locationType: node.stop.locationType,
          parentStation: node.stop.parentStation
            ? {
                id: node.stop.parentStation.gtfsId || node.stop.parentStation.id,
                name: node.stop.parentStation.name,
                lat: node.stop.parentStation.lat,
                lon: node.stop.parentStation.lon
              }
            : null,
          distance: node.distance,
          lineIds
        };
      })
      .filter(Boolean);
  }

  const stationMap = new Map();
  const stations = [];
  const stops = [];

  items.forEach(item => {
    const isStation = item.locationType === "STATION" || item.locationType === 1;
    if (isStation) {
      if (hasValidCoordinates(item)) {
        const stId = item.gtfsId || item.id;
        if (!stationMap.has(stId)) {
          const st = {
            id: stId,
            name: item.name || "Station",
            lat: item.lat,
            lon: item.lon
          };
          stationMap.set(stId, st);
          stations.push(st);
        }
      }
      return;
    }
    if (hasValidCoordinates(item)) {
      stops.push({
        id: item.id,
        name: item.name || "Arrêt sans nom",
        lat: item.lat,
        lon: item.lon,
        distance: item.distance,
        parentStationId: item.parentStation ? item.parentStation.gtfsId || item.parentStation.id : null
      });
    }
    if (item.parentStation && hasValidCoordinates(item.parentStation)) {
      const ps = item.parentStation;
      const psId = ps.gtfsId || ps.id;
      if (ps && psId && !stationMap.has(psId)) {
        const st = {
          id: psId,
          name: ps.name || "Station",
          lat: ps.lat,
          lon: ps.lon
        };
        stationMap.set(psId, st);
        stations.push(st);
      }
    }
  });

  return { stops, stations };
}

export async function fetchStopDeparturesForDate(regionCode, stopId, serviceDate, numberOfDepartures = 5) {
  const payload = await callOtp(regionCode, STOP_DEPS_BY_DATE_QUERY, {
    id: String(stopId),
    date: String(serviceDate)
  });
  const stop = payload?.stop;
  if (!stop) return { name: undefined, departures: [], emptyReason: "stopNotFound" };
  const deps = [];
  const patterns = Array.isArray(stop.stoptimesForServiceDate) ? stop.stoptimesForServiceDate : [];
  patterns.forEach(p => {
    const r = normalizeRoute(p.pattern?.route);
    (p.stoptimes || []).forEach(st => {
      deps.push({
        serviceDay: st.serviceDay,
        scheduledDeparture: st.scheduledDeparture,
        realtimeDeparture: st.realtimeDeparture,
        realtime: !!st.realtime,
        headsign: st.headsign || p.pattern?.headsign || st.trip?.tripHeadsign || "",
        route: r
      });
    });
  });
  const ordered = sortDeparturesByAbsoluteTime(deps);
  const sliced = ordered.slice(0, numberOfDepartures);
  return {
    name: stop.name,
    departures: sliced,
    emptyReason: sliced.length ? undefined : "noDepartures"
  };
}

export async function fetchStationAggregated(regionCode, stationId, opts = {}) {
  const numberOfDepartures = Number.isFinite(opts.numberOfDepartures) ? opts.numberOfDepartures : 5;
  const nowSec = Math.floor(Date.now() / 1000);
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const secondsToEndOfDay = Math.max(0, Math.floor((endOfDay.getTime() - Date.now()) / 1000));
  const timeRange = Number.isFinite(opts.timeRange) ? opts.timeRange : Math.max(3600, secondsToEndOfDay + 6 * 3600);
  const startTime = nowSec;

  const payload = await callOtp(regionCode, STATION_DETAILS_QUERY, {
    id: String(stationId),
    startTime,
    timeRange,
    numberOfDepartures
  });
  const station = payload?.station;
  if (!station) return { name: undefined, routes: [], departures: [] };

  const departures = [];
  (Array.isArray(station.stops) ? station.stops : []).forEach(cs => {
    (cs?.stoptimesForPatterns || []).forEach(p => {
      const r = normalizeRoute(p?.pattern?.route);
      const patternHeadsign = p?.pattern?.headsign || "";
      const patternStops = p?.pattern?.stops || [];
      (p?.stoptimes || []).forEach(st => {
        // Merge pattern info into trip for headsign resolution
        const tripWithPattern = {
          ...st.trip,
          pattern: { headsign: patternHeadsign, stops: patternStops }
        };
        departures.push({
          serviceDay: st.serviceDay,
          scheduledDeparture: st.scheduledDeparture,
          realtimeDeparture: st.realtimeDeparture,
          realtime: !!st.realtime,
          headsign: resolveDepartureHeadsign(
            { headsign: st.headsign, trip: tripWithPattern, line: p?.pattern?.route },
            station.name
          ),
          route: r,
          originStopId: cs?.gtfsId || cs?.id || null
        });
      });
    });
  });

  const ordered = sortDeparturesByAbsoluteTime(departures);
  const routeMap = new Map();
  ordered.forEach(d => {
    const id = d.route?.id;
    if (!id) return;
    if (!routeMap.has(id)) routeMap.set(id, d.route);
  });
  let routes = Array.from(routeMap.values());
  if (!routes.length && Array.isArray(station.routes)) {
    routes = station.routes.map(r => ({
      id: r.id,
      shortName: r.shortName || "",
      longName: r.longName || "",
      mode: r.mode || null,
      color: r.color || null,
      textColor: r.textColor || null
    }));
  }
  return {
    name: station.name,
    routes,
    departures: ordered,
    emptyReason: ordered.length ? undefined : "noDepartures"
  };
}

export async function fetchStationDeparturesForDate(regionCode, stationId, serviceDate, numberOfDepartures = 5) {
  const payload = await callOtp(regionCode, STATION_DEPS_BY_DATE_QUERY, {
    id: String(stationId),
    date: String(serviceDate)
  });
  const station = payload?.station;
  if (!station) return { name: undefined, routes: [], departures: [] };
  const departures = [];
  (Array.isArray(station.stops) ? station.stops : []).forEach(cs => {
    (cs?.stoptimesForServiceDate || []).forEach(p => {
      const r = normalizeRoute(p?.pattern?.route);
      const patternHeadsign = p?.pattern?.headsign || "";
      const patternStops = p?.pattern?.stops || [];
      (p?.stoptimes || []).forEach(st => {
        // Merge pattern info into trip for headsign resolution
        const tripWithPattern = {
          ...st.trip,
          pattern: { headsign: patternHeadsign, stops: patternStops }
        };
        departures.push({
          serviceDay: st.serviceDay,
          scheduledDeparture: st.scheduledDeparture,
          realtimeDeparture: st.realtimeDeparture,
          realtime: !!st.realtime,
          headsign: resolveDepartureHeadsign(
            { headsign: st.headsign, trip: tripWithPattern, line: p?.pattern?.route },
            station.name
          ),
          route: r,
          originStopId: cs?.gtfsId || cs?.id || null
        });
      });
    });
  });
  const ordered = sortDeparturesByAbsoluteTime(departures);
  const routeMap = new Map();
  departures.forEach(d => {
    const id = d.route?.id;
    if (id && !routeMap.has(id)) {
      routeMap.set(id, d.route);
    }
  });
  const routes = Array.from(routeMap.values());
  const sliced = ordered.slice(0, numberOfDepartures);
  return {
    name: station.name,
    routes,
    departures: sliced,
    emptyReason: sliced.length ? undefined : "noDepartures"
  };
}
