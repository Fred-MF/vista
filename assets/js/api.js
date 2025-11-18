import { DEFAULT_LIMIT, DEFAULT_RADIUS_METERS } from "./config.js";

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

  const response = await fetch("proxy.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      region: regionCode,
      query: useBbox ? STOPS_BY_BBOX_QUERY : STOPS_BY_RADIUS_QUERY,
      variables
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Proxy HTTP ${response.status} – ${response.statusText} : ${errorText}`
    );
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export function extractStops(data) {
  // Normalize to a flat array of stop-like nodes with optional parentStation/locationType
  let items = [];
  if (data?.data?.stopsByBbox) {
    items = (data.data.stopsByBbox || []).map(s => ({
      id: (s.gtfsId || s.id), name: s.name, lat: s.lat, lon: s.lon,
      locationType: s.locationType, parentStation: s.parentStation || null
    }));
  } else {
    const edges = data?.data?.stopsByRadius?.edges ?? [];
    items = edges
      .map(edge => edge?.node)
      .filter(Boolean)
      .map(node => {
        if (!node.stop) return null;
        return {
          id: (node.stop.gtfsId || node.stop.id),
          name: node.stop.name,
          lat: node.stop.lat,
          lon: node.stop.lon,
          locationType: node.stop.locationType,
          parentStation: node.stop.parentStation ? { id: (node.stop.parentStation.gtfsId || node.stop.parentStation.id), name: node.stop.parentStation.name, lat: node.stop.parentStation.lat, lon: node.stop.parentStation.lon } : null,
          distance: node.distance
        };
      })
      .filter(Boolean);
  }

  const cleanCoord = p => typeof p?.lat === "number" && typeof p?.lon === "number";

  const stationMap = new Map();
  const stations = [];
  const stops = [];

  items.forEach(item => {
    const isStation = item.locationType === "STATION" || item.locationType === 1;
    if (isStation) {
      if (cleanCoord(item)) {
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
    // Normal stop point
    if (cleanCoord(item)) {
      stops.push({
        id: item.id,
        name: item.name || "Arrêt sans nom",
        lat: item.lat,
        lon: item.lon,
        distance: item.distance,
        parentStationId: item.parentStation ? (item.parentStation.gtfsId || item.parentStation.id) : null
      });
    }
    // Parent station if any
    if (item.parentStation && cleanCoord(item.parentStation)) {
      const ps = item.parentStation;
      const psId = (ps && (ps.gtfsId || ps.id));
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


// --- Stop details (routes and upcoming departures) ---
const STOP_DETAILS_QUERY = `
  query StopDetails($id: String!, $startTime: Long!, $timeRange: Int!, $numberOfDepartures: Int!) {
    stop(id: $id) {
      id
      name
      routes { id shortName longName mode color textColor }
      stoptimesWithoutPatterns(startTime: $startTime, timeRange: $timeRange, numberOfDepartures: $numberOfDepartures) {
        serviceDay
        scheduledDeparture
        realtimeDeparture
        realtime
        headsign
        trip { route { id shortName longName mode color textColor } tripHeadsign }
      }
      stoptimesForPatterns(startTime: $startTime, timeRange: $timeRange, numberOfDepartures: $numberOfDepartures) {
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

export async function fetchStopDetails(regionCode, stopId, opts = {}) {
  const numberOfDepartures = Number.isFinite(opts.numberOfDepartures) ? opts.numberOfDepartures : 5;
  const nowSec = Math.floor(Date.now() / 1000);
  // Cover until end of day by default
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const secondsToEndOfDay = Math.max(0, Math.floor((endOfDay.getTime() - Date.now()) / 1000));
  // Extend window to cover post-midnight runs (service often ends around 02:00)
  const timeRange = Number.isFinite(opts.timeRange) ? opts.timeRange : Math.max(3600, secondsToEndOfDay + 6 * 3600);
  const startTime = nowSec;

  const response = await fetch("proxy.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: regionCode,
      query: STOP_DETAILS_QUERY,
      variables: { id: String(stopId), startTime, timeRange, numberOfDepartures }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proxy HTTP ${response.status} – ${response.statusText} : ${errorText}`);
  }

  const data = await response.json();
  if (data?.errors && data.errors.length) {
    throw new Error(data.errors.map(e=>e.message).join("; "))
  }
  const stop = data?.data?.stop;
  if (!stop) return { routes: [], departures: [], name: undefined };

  const routes = Array.isArray(stop.routes) ? stop.routes.map(r => ({
    id: r.id,
    shortName: r.shortName || "",
    longName: r.longName || "",
    mode: r.mode || null,
    color: r.color || null,
    textColor: r.textColor || null
  })) : [];

  const departures = Array.isArray(stop.stoptimesWithoutPatterns)
    ? stop.stoptimesWithoutPatterns.map(st => ({
        serviceDay: st.serviceDay,
        scheduledDeparture: st.scheduledDeparture,
        realtimeDeparture: st.realtimeDeparture,
        realtime: !!st.realtime,
        headsign: st.headsign || st.trip?.tripHeadsign || "",
        route: st.trip?.route ? {
          id: st.trip.route.id,
          shortName: st.trip.route.shortName || "",
          longName: st.trip.route.longName || "",
          mode: st.trip.route.mode || null,
          color: st.trip.route.color || null,
          textColor: st.trip.route.textColor || null
        } : null
      }))
    : [];
  if (!departures.length && Array.isArray(stop.stoptimesForPatterns)) {
    stop.stoptimesForPatterns.forEach(p => {
      const r = p.pattern && p.pattern.route ? {
        id: p.pattern.route.id,
        shortName: p.pattern.route.shortName || "",
        longName: p.pattern.route.longName || "",
        mode: p.pattern.route.mode || null,
        color: p.pattern.route.color || null,
        textColor: p.pattern.route.textColor || null
      } : null;
      (p.stoptimes || []).slice(0, Number.isFinite(opts.numberOfDepartures)?opts.numberOfDepartures:5).forEach(st => {
        departures.push({
          serviceDay: st.serviceDay,
          scheduledDeparture: st.scheduledDeparture,
          realtimeDeparture: st.realtimeDeparture,
          realtime: !!st.realtime,
          headsign: st.headsign || p.pattern?.headsign || st.trip?.tripHeadsign || "",
          route: r
        });
      });
    });
  }


  return { name: stop.name, routes, departures };
}

// Fetch departures for a specific service date (format YYYYMMDD) to look ahead (e.g. J+1, J+2)
const STOP_DEPS_BY_DATE_QUERY = `
  query StopDepsByDate($id: String!, $date: String!, $numberOfDepartures: Int!) {
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

export async function fetchStopDeparturesForDate(regionCode, stopId, serviceDate, numberOfDepartures = 5) {
  const response = await fetch("proxy.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: regionCode,
      query: STOP_DEPS_BY_DATE_QUERY,
      variables: { id: String(stopId), date: String(serviceDate), numberOfDepartures }
    })
  });
  if (!response || !response.ok) {
    const t = response ? (await response.text()) : "no response";
    throw new Error(`Proxy HTTP ${response?.status} – ${response?.statusText} : ${t}`);
  }
  const data = await response.json();
  const stop = data?.data?.stop;
  if (!stop) return { name: undefined, departures: [] };
  const deps = [];
  const patterns = Array.isArray(stop.stoptimesForServiceDate) ? stop.stoptimesForServiceDate : [];
  patterns.forEach(p => {
    const r = p.pattern && p.pattern.route ? {
      id: p.pattern.route.id,
      shortName: p.pattern.route.shortName || "",
      longName: p.pattern.route.longName || "",
      mode: p.pattern.route.mode || null,
      color: p.pattern.route.color || null,
      textColor: p.pattern.route.textColor || null
    } : null;
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
  // Sort by absolute time within that service date
  deps.sort((a,b) => (a.serviceDay + (a.realtime ? a.realtimeDeparture : a.scheduledDeparture)) - (b.serviceDay + (b.realtime ? b.realtimeDeparture : b.scheduledDeparture)));
  return { name: stop.name, departures: deps.slice(0, numberOfDepartures) };
}

// ---- Station (aggregate child stops by route/direction-like key) ----
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
  }
`;

export async function fetchStationAggregated(regionCode, stationId, opts = {}) {
  const numberOfDepartures = Number.isFinite(opts.numberOfDepartures) ? opts.numberOfDepartures : 5;
  const nowSec = Math.floor(Date.now() / 1000);
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const secondsToEndOfDay = Math.max(0, Math.floor((endOfDay.getTime() - Date.now()) / 1000));
  const timeRange = Number.isFinite(opts.timeRange) ? opts.timeRange : Math.max(3600, secondsToEndOfDay + 6 * 3600);
  const startTime = nowSec;

  const response = await fetch("proxy.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: regionCode,
      query: STATION_DETAILS_QUERY,
      variables: { id: String(stationId), startTime, timeRange, numberOfDepartures }
    })
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Proxy HTTP ${response.status} – ${response.statusText} : ${t}`);
  }
  const data = await response.json();
  if (data?.errors && data.errors.length) {
    throw new Error(data.errors.map(e=>e.message).join("; "));
  }
  const station = data?.data?.station;
  if (!station) return { name: undefined, routes: [], departures: [] };

  // Flatten child stoptimes into departures with route
  const departures = [];
  (Array.isArray(station.stops) ? station.stops : []).forEach(cs => {
    (cs?.stoptimesForPatterns || []).forEach(p => {
      const r = p?.pattern?.route ? {
        id: p.pattern.route.id,
        shortName: p.pattern.route.shortName || "",
        longName: p.pattern.route.longName || "",
        mode: p.pattern.route.mode || null,
        color: p.pattern.route.color || null,
        textColor: p.pattern.route.textColor || null
      } : null;
      (p?.stoptimes || []).forEach(st => {
        departures.push({
          serviceDay: st.serviceDay,
          scheduledDeparture: st.scheduledDeparture,
          realtimeDeparture: st.realtimeDeparture,
          realtime: !!st.realtime,
          headsign: st.headsign || p.pattern?.headsign || st.trip?.tripHeadsign || "",
          route: r,
          originStopId: cs?.gtfsId || cs?.id || null
        });
      });
    });
  });
  // Sort and cap to a reasonable number per route later in UI
  departures.sort((a,b) => {
    const at = (a.serviceDay || 0) + ((a.realtimeDeparture != null ? a.realtimeDeparture : a.scheduledDeparture) || 0);
    const bt = (b.serviceDay || 0) + ((b.realtimeDeparture != null ? b.realtimeDeparture : b.scheduledDeparture) || 0);
    return at - bt;
  });

  // Build a deduped routes list (for chips)
  const routeMap = new Map();
  departures.forEach(d => {
    const id = d.route?.id;
    if (!id) return;
    if (!routeMap.has(id)) routeMap.set(id, d.route);
  });
  let routes = Array.from(routeMap.values());
  // If no departures yielded routes, fall back to declared station routes (to at least show chips)
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
  return { name: station.name, routes, departures };
}

// Fetch next-day departures for a station by aggregating child stops (J+N)
const STATION_DEPS_BY_DATE_QUERY = `
  query StationDepsByDate($id: String!, $date: String!, $numberOfDepartures: Int!) {
    station(id: $id) {
      id
      name
      stops {
        id
        gtfsId
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
  }
`;

export async function fetchStationDeparturesForDate(regionCode, stationId, serviceDate, numberOfDepartures = 5) {
  const response = await fetch("proxy.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      region: regionCode,
      query: STATION_DEPS_BY_DATE_QUERY,
      variables: { id: String(stationId), date: String(serviceDate), numberOfDepartures }
    })
  });
  if (!response || !response.ok) {
    const t = response ? (await response.text()) : "no response";
    throw new Error(`Proxy HTTP ${response?.status} – ${response?.statusText} : ${t}`);
  }
  const data = await response.json();
  const station = data?.data?.station;
  if (!station) return { name: undefined, routes: [], departures: [] };
  const departures = [];
  (Array.isArray(station.stops) ? station.stops : []).forEach(cs => {
    (cs?.stoptimesForServiceDate || []).forEach(p => {
      const r = p?.pattern?.route ? {
        id: p.pattern.route.id,
        shortName: p.pattern.route.shortName || "",
        longName: p.pattern.route.longName || "",
        mode: p.pattern.route.mode || null,
        color: p.pattern.route.color || null,
        textColor: p.pattern.route.textColor || null
      } : null;
      (p?.stoptimes || []).forEach(st => {
        departures.push({
          serviceDay: st.serviceDay,
          scheduledDeparture: st.scheduledDeparture,
          realtimeDeparture: st.realtimeDeparture,
          realtime: !!st.realtime,
          headsign: st.headsign || p.pattern?.headsign || st.trip?.tripHeadsign || "",
          route: r,
          originStopId: cs?.gtfsId || cs?.id || null
        });
      });
    });
  });
  departures.sort((a,b) => {
    const at = (a.serviceDay || 0) + ((a.realtimeDeparture != null ? a.realtimeDeparture : a.scheduledDeparture) || 0);
    const bt = (b.serviceDay || 0) + ((b.realtimeDeparture != null ? b.realtimeDeparture : b.scheduledDeparture) || 0);
    return at - bt;
  });
  const routeMap = new Map();
  departures.forEach(d => { const id = d.route?.id; if (id && !routeMap.has(id)) routeMap.set(id, d.route); });
  const routes = Array.from(routeMap.values());
  return { name: station.name, routes, departures: departures.slice(0, numberOfDepartures) };
}
