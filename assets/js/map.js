import { DEFAULT_MAP_VIEW, MAP_STYLE_URL, ZOOM_STATIONS_POINTS_MIN, ZOOM_STOPS_MIN, DISABLE_POI_LAYERS, ICON_STOP_URL, ICON_STATION_URL, USE_SPRITE_ICONS, SPRITE_STOP_ICON_NAME, SPRITE_STATION_ICON_NAME, getMapStyleURL, getIconUrlsForTheme, USE_CLUSTERING } from "./config.js";
import { fetchStopDetails, fetchStopDeparturesForDate, fetchStationAggregated } from "./api.js";
import { regionSelect } from "./ui.js";

const STOPS_SOURCE_ID = "stops";
const STATIONS_SOURCE_ID = "stations";
const STOPS_SYMBOL_LAYER_ID = "stops-symbol";
const STATIONS_SYMBOL_LAYER_ID = "stations-symbol";
const STOPS_BG_LAYER_ID = "stops-bg";
const STATIONS_BG_LAYER_ID = "stations-bg";

let mapInstance;
let stopsSourceReady = false;
let stationsSourceReady = false;
let userMarker = null;
let activePopup = null;
const stopInfoCache = new Map();

function htmlEscape(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(tsSec) {
  try {
    const d = new Date(tsSec * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const diffMin = Math.max(0, Math.round((tsSec - Math.floor(Date.now()/1000)) / 60));
    const rel = (diffMin <= 0) ? "à l'instant" : `dans ${diffMin} min`;
    return `${hh}h${mm} (${rel})`;
  } catch (e) {
    return '';
  }
}

function normalizeHexColor(c) {
  if (!c && c !== 0) return null;
  let s = String(c).trim();
  if (!s) return null;
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toUpperCase();
}

function getContrastingTextColor(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

function buildStopPopupHTML(name, info, isStationView = false) {
  const title = `<strong>${htmlEscape(name || (info && info.name) || '')}</strong>`;
  const routesArr = Array.isArray(info && info.routes) ? info.routes : [];
  const depsArr = Array.isArray(info && info.departures) ? info.departures.slice() : [];

  // Helper to format departure: within next 60 min => "X min", else "HH:MM" (+ (j+N) if provided)
  const formatDep = (absSec, dayOffsetOpt) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffMin = Math.round((absSec - nowSec) / 60);
    if (diffMin >= 0 && diffMin <= 60) {
      return `${diffMin} min`;
    }
    const d = new Date(absSec * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}h${mm}${dayOffsetOpt ? ` (J+${dayOffsetOpt})` : ''}`;
  };

  // Group by route + sensible "direction" (headsign best-effort)
  const byRouteDir = new Map();
  depsArr.forEach(d => {
    const routeId = d?.route?.id || '';
    const dir = (d?.headsign || '').trim().toLowerCase();
    if (!routeId) return;
    const key = `${routeId}__${dir}`;
    if (!byRouteDir.has(key)) {
      byRouteDir.set(key, { route: d.route, headsign: d.headsign || '', timesAbs: [] });
    }
    const absSec = ((d.realtimeDeparture != null ? d.realtimeDeparture : d.scheduledDeparture) || 0) + (d.serviceDay || 0);
    byRouteDir.get(key).timesAbs.push({ absSec, dayOffset: d._dayOffset || 0, realtime: !!d.realtime });
  });

  // Ensure routes with no departures still have at least one row (no times)
  routesArr.forEach(r => {
    const rid = r?.id;
    if (!rid) return;
    const present = Array.from(byRouteDir.keys()).some(k => k.startsWith(`${rid}__`));
    if (!present) {
      byRouteDir.set(`${rid}__`, { route: r, headsign: '', timesAbs: [] });
    }
  });

  // Build rows: chip + optional headsign + next times (up to 3)
  const rows = [];
  const stopNameNorm = (name || '').toString().trim().toLowerCase();
  for (const [, entry] of byRouteDir.entries()) {
    const r = entry.route || {};
    const label = htmlEscape((r.shortName || r.longName || '').toString());
    const bg = normalizeHexColor(r.color) || null;
    const fg = normalizeHexColor(r.textColor) || (bg ? getContrastingTextColor(bg) : null);
    const bgStyle = bg ? `background-color:${bg};` : `background-color:var(--accent);`;
    const fgStyle = fg ? `color:${fg};` : `color:#fff;`;
    const chip = `<span class="route-chip" style="${bgStyle}${fgStyle}">${label || '&nbsp;'}</span>`;
    // sort times and keep only next one
    entry.timesAbs.sort((a,b) => a.absSec - b.absSec);
    const next = entry.timesAbs[0];
    const formatted = next ? formatDep(next.absSec, next.dayOffset) : null;
    let headLabel = (entry.headsign || '').toString().trim();
    // If viewing a specific stop (not station) and the headsign equals the stop name, show "Terminus"
    if (!isStationView && headLabel && headLabel.toLowerCase() === stopNameNorm) {
      headLabel = 'Terminus';
    }
    let headsignHtml = '';
    if (headLabel) {
      headsignHtml = headLabel === 'Terminus'
        ? `<span class="route-headsign">(Terminus)</span>`
        : `<span class="route-headsign">→ ${htmlEscape(headLabel)}</span>`;
    }
    const live = (next && next.realtime) ? `<span class="rt-live" title="Temps réel"></span>` : '';
    const timesHtml = formatted ? `<span class="route-times">${live}${formatted}</span>` : `<span class="route-times"><small>—</small></span>`;
    // Place times first, then direction (headsign)
    rows.push(`<div class="route-row">${chip}${timesHtml}${headsignHtml}</div>`);
  }
  if (!rows.length) {
    return `${title}<div><small>Horaires indisponibles</small></div>`;
  }
  // Pagination 5 par 5 avec Précédent/Suivant (sans état global)
  const pageSize = 5;
  const total = rows.length;
  const pages = Math.ceil(total / pageSize);
  // Indexer les rows pour bascule par page côté DOM
  const indexed = rows.map((r, i) => {
    const visible = i < pageSize ? 'flex' : 'none';
    return r.replace('route-row', `route-row" data-i="${i}" style="display:${visible}`);
  }).join('');
  const nav = pages > 1
    ? `
      <div class="popup-nav">
        <button type="button" class="popup-page-btn popup-page-prev" disabled aria-label="Précédent"
          onclick="(function(btn){
            var c=btn.closest('.maplibregl-popup-content'); if(!c)return;
            var size=5; var items=[].slice.call(c.querySelectorAll('.route-row'));
            var p=Number(c.dataset.page||'0'); var max=Math.ceil(items.length/size)-1;
            p=Math.max(0, Math.min(max, p-1));
            items.forEach(function(el,idx){ el.style.display = (Math.floor(idx/size)===p)?'flex':'none'; });
            c.dataset.page=p;
            var prev=c.querySelector('.popup-page-prev'); var next=c.querySelector('.popup-page-next');
            if(prev) prev.disabled=(p===0); if(next) next.disabled=(p===max);
          })(this)">◀︎</button>
        <button type="button" class="popup-page-btn popup-page-next" aria-label="Suivant"
          onclick="(function(btn){
            var c=btn.closest('.maplibregl-popup-content'); if(!c)return;
            var size=5; var items=[].slice.call(c.querySelectorAll('.route-row'));
            var p=Number(c.dataset.page||'0'); var max=Math.ceil(items.length/size)-1;
            p=Math.max(0, Math.min(max, p+1));
            items.forEach(function(el,idx){ el.style.display = (Math.floor(idx/size)===p)?'flex':'none'; });
            c.dataset.page=p;
            var prev=c.querySelector('.popup-page-prev'); var next=c.querySelector('.popup-page-next');
            if(prev) prev.disabled=(p===0); if(next) next.disabled=(p===max);
          })(this)">▶︎</button>
      </div>`
    : '';
  // Place navigation at top-right (absolute), so order in DOM can be after title
  return `${title}${nav}<div class="popup-rows" data-total="${total}">${indexed}</div>`;
}

function normalizeStopId(rawId) {
  if (!rawId) return rawId;
  if (String(rawId).includes(':')) return String(rawId);
  try {
    const decoded = atob(String(rawId));
    const parts = decoded.split(':');
    if (parts.length >= 2) {
      return parts.slice(1).join(':');
    }
  } catch (_) {}
  return String(rawId);
}

async function getStopInfo(regionCode, stopId) {
  const key = `${regionCode || ''}|${stopId}`;
  const now = Date.now();
  const cached = stopInfoCache.get(key);
  if (cached && (now - cached.t) < 60000) { // 60s cache
    return cached.v;
  }
  const info = await fetchStopDetails(regionCode, stopId, { numberOfDepartures: 5, timeRange: 3600 });
  stopInfoCache.put?.(key, { t: now, v: info });
  if (!stopInfoCache.has(key)) {
    // for environments without .put, fallback to set
    stopInfoCache.set(key, { t: now, v: info });
  }
  return info;
}

async function openStopInfoPopup(e, opts = {}) {
  try {
    const feature = (e && e.features && e.features[0]) ? e.features[0] : null;
    if (!feature) return;
    const coords = (feature.geometry && feature.geometry.coordinates) ? feature.geometry.coordinates.slice() : (e.lngLat ? [e.lngLat.lng, e.lngLat.lat] : null);
    if (!coords) return;
    const name = (feature.properties && (feature.properties.name || feature.properties.stopName)) || '';
    const stopIdRaw = feature.properties && (feature.properties.id || feature.properties.stopId);
    const stopId = normalizeStopId(stopIdRaw);
    if (!(opts && opts.transient) && typeof activePopup !== "undefined" && activePopup) { try { activePopup.remove(); } catch(e){} }
    const popup = new maplibregl.Popup({ closeButton: !(opts && opts.transient), closeOnClick: !(opts && opts.transient) })
      .setLngLat(coords)
      .setHTML(`<div><span class="spinner"></span><small>Chargement…</small></div>`)
      .addTo(mapInstance);

    if (!(opts && opts.transient)) {
      try {
        activePopup = popup;
        if (typeof popup.on === "function") {
          popup.on("close", () => { if (activePopup === popup) activePopup = null; });
        }
      } catch (e) {}
    }

    const regionEl = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('region-select') : null;
    const regionCode = regionEl && regionEl.value ? regionEl.value : ((typeof regionSelect !== 'undefined' && regionSelect && regionSelect.value) ? regionSelect.value : null);
    try {
      const isStationLayer = !!(opts && opts.layerId && String(opts.layerId).includes("station"));
      let info = isStationLayer ? await fetchStationAggregated(regionCode, stopId, { numberOfDepartures: 8 }) : await getStopInfo(regionCode, stopId);
      if (!info.departures || info.departures.length === 0) {
        const now = new Date();
        for (let d = 1; d <= 7 && (!info.departures || info.departures.length === 0); d++) {
          const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
          const yyyy = String(next.getFullYear());
          const mm = String(next.getMonth() + 1).padStart(2, '0');
          const dd = String(next.getDate()).padStart(2, '0');
          try {
            const extra = isStationLayer
              ? await fetchStationDeparturesForDate(regionCode, stopId, `${yyyy}${mm}${dd}`, 8)
              : await fetchStopDeparturesForDate(regionCode, stopId, `${yyyy}${mm}${dd}`, 5);
            if (extra && Array.isArray(extra.departures) && extra.departures.length) {
              info = {
                name: info.name || extra.name,
                routes: info.routes && info.routes.length ? info.routes : [],
                departures: extra.departures.map(dep => ({ ...dep, _dayOffset: d }))
              };
            }
          } catch (_) {}
        }
        // Final fallback for stops: try parent station aggregation if available
        if (!isStationLayer && (!info.departures || info.departures.length === 0)) {
          const parentId = feature.properties && feature.properties.parentStationId;
          if (parentId) {
            try {
              const stInfo = await fetchStationAggregated(regionCode, parentId, { numberOfDepartures: 8 });
              if (stInfo && Array.isArray(stInfo.departures)) {
                // Filter to only departures that originate from this stop when available
                const onlyThisStop = stInfo.departures.filter(d => {
                  const oid = (d && d.originStopId) ? String(d.originStopId) : null;
                  return oid && (oid === stopId);
                });
                const pickedDeps = onlyThisStop.length ? onlyThisStop : stInfo.departures;
                info = {
                  name: name,
                  routes: stInfo.routes,
                  departures: pickedDeps
                };
              }
            } catch (_) {}
          }
        }
      }
      popup.setHTML(buildStopPopupHTML(name, info, isStationLayer));
    } catch (err) {
      console && console.warn && console.warn("Stop details fetch failed:", err);
      popup.setHTML(` <strong>${htmlEscape(name)}</strong><div><small>Horaires indisponibles</small></div>`);
    }

    if (opts && opts.transient && opts.layerId) {
      let hideTimer = null;
      const scheduleClose = () => {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          try { popup.remove(); } catch(e){}
          try { mapInstance.off('mouseleave', opts.layerId, scheduleClose); } catch(_) {}
        }, 500);
      };
      const clearClose = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };
      try { mapInstance.on('mouseleave', opts.layerId, scheduleClose); } catch (_e) {}
      try {
        const el = typeof popup.getElement === "function" ? popup.getElement() : null;
        if (el) {
          el.addEventListener('mouseenter', clearClose);
          el.addEventListener('mouseleave', scheduleClose);
        }
      } catch (_) {}
    }
  } catch (_e) {}
}

function ensureMaplibre() {
  if (!window.maplibregl) {
    console.error("MapLibre GL n'est pas chargé.");
    return null;
  }
  return window.maplibregl;
}

// Clustered mode implementation (feature-flagged)
function initClusterModeLayers(maplibre) {
  if (!mapInstance.getSource(STOPS_SOURCE_ID)) {
    mapInstance.addSource(STOPS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });
  }
  if (!mapInstance.getSource(STATIONS_SOURCE_ID)) {
    mapInstance.addSource(STATIONS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: ZOOM_STATIONS_POINTS_MIN,
      clusterRadius: 60
    });
  }

  const STOPS_CLUSTERS_LAYER_ID = "stops-clusters";
  const STOPS_CLUSTER_COUNT_LAYER_ID = "stops-cluster-count";
  const STOPS_UNCLUSTERED_BG_LAYER_ID = "stops-unclustered-bg";
  const STOPS_UNCLUSTERED_SYMBOL_LAYER_ID = "stops-unclustered-symbol";

  const STATIONS_CLUSTERS_LAYER_ID = "stations-clusters";
  const STATIONS_CLUSTER_COUNT_LAYER_ID = "stations-cluster-count";
  const STATIONS_UNCLUSTERED_BG_LAYER_ID = "stations-unclustered-bg";
  const STATIONS_UNCLUSTERED_SYMBOL_LAYER_ID = "stations-unclustered-symbol";

  // Stations: clusters at low zoom
  mapInstance.addLayer({
    id: STATIONS_CLUSTERS_LAYER_ID,
    type: "circle",
    source: STATIONS_SOURCE_ID,
    filter: ["has", "point_count"],
    minzoom: 0,
    maxzoom: ZOOM_STATIONS_POINTS_MIN,
    paint: {
      "circle-color": "#10b981",
      "circle-radius": [
        "step", ["get", "point_count"],
        14, 50, 18, 200, 22
      ],
      "circle-opacity": 0.8
    }
  });
  mapInstance.addLayer({
    id: STATIONS_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: STATIONS_SOURCE_ID,
    filter: ["has", "point_count"],
    minzoom: 0,
    maxzoom: ZOOM_STATIONS_POINTS_MIN,
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 12
    },
    paint: { "text-color": "#0f172a" }
  });

  // Stations: unclustered (background + icon) between 0 and stops threshold
  mapInstance.addLayer({
    id: STATIONS_UNCLUSTERED_BG_LAYER_ID,
    type: "circle",
    source: STATIONS_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    minzoom: 0,
    maxzoom: ZOOM_STOPS_MIN,
    paint: {
      "circle-color": "#10b981",
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        0, 8, 10, 12, 13, 14, 16, 16
      ],
      "circle-opacity": 0.8,
      "circle-stroke-color": "#10b981",
      "circle-stroke-width": 2
    }
  });
  mapInstance.addLayer({
    id: STATIONS_UNCLUSTERED_SYMBOL_LAYER_ID,
    type: "symbol",
    source: STATIONS_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    minzoom: 0,
    maxzoom: ZOOM_STOPS_MIN,
    layout: {
      "icon-image": ["literal", (USE_SPRITE_ICONS ? SPRITE_STATION_ICON_NAME : "station-icon")],
      "icon-size": [
        "interpolate", ["linear"], ["zoom"],
        0, 0.3, 10, 0.48, 13, 0.56, 16, 0.64
      ],
      "icon-anchor": "center",
      "icon-allow-overlap": true
    }
  });

  // Stops: clusters in mid zooms (until individual stops appear)
  mapInstance.addLayer({
    id: STOPS_CLUSTERS_LAYER_ID,
    type: "circle",
    source: STOPS_SOURCE_ID,
    filter: ["has", "point_count"],
    minzoom: ZOOM_STATIONS_POINTS_MIN,
    maxzoom: ZOOM_STOPS_MIN,
    paint: {
      "circle-color": "#0ea5e9",
      "circle-radius": [
        "step", ["get", "point_count"],
        14, 50, 18, 200, 22
      ],
      "circle-opacity": 0.8
    }
  });
  mapInstance.addLayer({
    id: STOPS_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: STOPS_SOURCE_ID,
    filter: ["has", "point_count"],
    minzoom: ZOOM_STATIONS_POINTS_MIN,
    maxzoom: ZOOM_STOPS_MIN,
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 12
    },
    paint: { "text-color": "#0f172a" }
  });

  // Stops: unclustered (background + icon) at higher zooms
  mapInstance.addLayer({
    id: STOPS_UNCLUSTERED_BG_LAYER_ID,
    type: "circle",
    source: STOPS_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    minzoom: ZOOM_STOPS_MIN,
    paint: {
      "circle-color": "#0ea5e9",
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        17, 12, 18, 14, 20, 18, 22, 22
      ],
      "circle-opacity": 0.8,
      "circle-stroke-color": "#0ea5e9",
      "circle-stroke-width": 2
    }
  });
  mapInstance.addLayer({
    id: STOPS_UNCLUSTERED_SYMBOL_LAYER_ID,
    type: "symbol",
    source: STOPS_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    minzoom: ZOOM_STOPS_MIN,
    layout: {
      "icon-image": ["literal", (USE_SPRITE_ICONS ? SPRITE_STOP_ICON_NAME : "hail-icon")],
      "icon-size": [
        "interpolate", ["linear"], ["zoom"],
        17, 0.48, 18, 0.56, 20, 0.72, 22, 0.9
      ],
      "icon-anchor": "center",
      "icon-allow-overlap": true
    }
  });

  // Cluster interactions
  mapInstance.on("click", STATIONS_CLUSTERS_LAYER_ID, e => {
    const features = mapInstance.queryRenderedFeatures(e.point, { layers: [STATIONS_CLUSTERS_LAYER_ID] });
    const clusterId = features[0]?.properties?.cluster_id;
    const source = mapInstance.getSource(STATIONS_SOURCE_ID);
    if (!source || clusterId === undefined) return;
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      mapInstance.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });
  mapInstance.on("click", STOPS_CLUSTERS_LAYER_ID, e => {
    const features = mapInstance.queryRenderedFeatures(e.point, { layers: [STOPS_CLUSTERS_LAYER_ID] });
    const clusterId = features[0]?.properties?.cluster_id;
    const source = mapInstance.getSource(STOPS_SOURCE_ID);
    if (!source || clusterId === undefined) return;
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      mapInstance.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  mapInstance.on("mouseenter", STATIONS_CLUSTERS_LAYER_ID, () => { mapInstance.getCanvas().style.cursor = "pointer"; });
  mapInstance.on("mouseleave", STATIONS_CLUSTERS_LAYER_ID, () => { mapInstance.getCanvas().style.cursor = ""; });
  mapInstance.on("mouseenter", STOPS_CLUSTERS_LAYER_ID, () => { mapInstance.getCanvas().style.cursor = "pointer"; });
  mapInstance.on("mouseleave", STOPS_CLUSTERS_LAYER_ID, () => { mapInstance.getCanvas().style.cursor = ""; });

  // Popup on unclustered symbols
  mapInstance.on("click", STOPS_UNCLUSTERED_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STOPS_UNCLUSTERED_SYMBOL_LAYER_ID, transient: false }); });
  mapInstance.on("mouseenter", STOPS_UNCLUSTERED_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STOPS_UNCLUSTERED_SYMBOL_LAYER_ID, transient: true }); });
  mapInstance.on("click", STATIONS_UNCLUSTERED_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STATIONS_UNCLUSTERED_SYMBOL_LAYER_ID, transient: false }); });
  mapInstance.on("mouseenter", STATIONS_UNCLUSTERED_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STATIONS_UNCLUSTERED_SYMBOL_LAYER_ID, transient: true }); });

  stopsSourceReady = true;
  stationsSourceReady = true;
}


function initPointLayers(maplibre) {
  if (!mapInstance.getSource(STOPS_SOURCE_ID)) {
    mapInstance.addSource(STOPS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  }
  if (!mapInstance.getSource(STATIONS_SOURCE_ID)) {
    mapInstance.addSource(STATIONS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  }

  // Background circles for markers
  mapInstance.addLayer({
    id: STATIONS_BG_LAYER_ID,
    type: "circle",
    source: STATIONS_SOURCE_ID,
    minzoom: 0,
    maxzoom: ZOOM_STOPS_MIN,
    paint: {
      "circle-color": "#10b981",
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        0, 8,
        10, 12,
        13, 14,
        16, 16
      ],
      "circle-opacity": 0.8,
      "circle-stroke-color": "#10b981",
      "circle-stroke-width": 2
    }
  });

  mapInstance.addLayer({
    id: STOPS_BG_LAYER_ID,
    type: "circle",
    source: STOPS_SOURCE_ID,
    minzoom: ZOOM_STOPS_MIN,
    paint: {
      "circle-color": "#0ea5e9",
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        17, 12,
        18, 14,
        20, 18,
        22, 22
      ],
      "circle-opacity": 0.8,
      "circle-stroke-color": "#0ea5e9",
      "circle-stroke-width": 2
    }
  });

  // Symbol layers (single icon for both)
  mapInstance.addLayer({
    id: STOPS_SYMBOL_LAYER_ID,
    type: "symbol",
    source: STOPS_SOURCE_ID,
    minzoom: ZOOM_STOPS_MIN,
    layout: {
      "icon-image": ["literal", (USE_SPRITE_ICONS ? SPRITE_STOP_ICON_NAME : "hail-icon")],
      "icon-size": [
      "interpolate", ["linear"], ["zoom"],
      17, 0.48,
      18, 0.56,
      20, 0.72,
      22, 0.9
    ],
      "icon-anchor": "center",
      "icon-allow-overlap": true
    }
  });

  mapInstance.addLayer({
    id: STATIONS_SYMBOL_LAYER_ID,
    type: "symbol",
    source: STATIONS_SOURCE_ID,
    minzoom: 0,
    maxzoom: ZOOM_STOPS_MIN,
    layout: {
      "icon-image": ["literal", (USE_SPRITE_ICONS ? SPRITE_STATION_ICON_NAME : "station-icon")],
      "icon-size": [
      "interpolate", ["linear"], ["zoom"],
      0, 0.3,
      10, 0.48,
      13, 0.56,
      16, 0.64
    ],
      "icon-anchor": "center",
      "icon-allow-overlap": true
    }
  });

  mapInstance.on("click", STOPS_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STOPS_SYMBOL_LAYER_ID, transient: false }); });
  mapInstance.on("mouseenter", STOPS_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STOPS_SYMBOL_LAYER_ID, transient: true }); });
  mapInstance.on("click", STATIONS_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STATIONS_SYMBOL_LAYER_ID, transient: false }); });
  mapInstance.on("mouseenter", STATIONS_SYMBOL_LAYER_ID, e => { openStopInfoPopup(e, { layerId: STATIONS_SYMBOL_LAYER_ID, transient: true }); });

  mapInstance.on("mouseenter", STOPS_SYMBOL_LAYER_ID, () => {
    mapInstance.getCanvas().style.cursor = "pointer";
  });
  mapInstance.on("mouseleave", STOPS_SYMBOL_LAYER_ID, () => {
    mapInstance.getCanvas().style.cursor = "";
  });
  mapInstance.on("mouseenter", STATIONS_SYMBOL_LAYER_ID, () => {
    mapInstance.getCanvas().style.cursor = "pointer";
  });
  mapInstance.on("mouseleave", STATIONS_SYMBOL_LAYER_ID, () => {
    mapInstance.getCanvas().style.cursor = "";
  });

  stopsSourceReady = true;
  stationsSourceReady = true;
}

export function initMap() {
  if (mapInstance) {
    return mapInstance;
  }

  const maplibre = ensureMaplibre();
  if (!maplibre) {
    return null;
  }

  mapInstance = new maplibre.Map({
    container: "map",
    style: MAP_STYLE_URL,
    center: [DEFAULT_MAP_VIEW.lon, DEFAULT_MAP_VIEW.lat],
    zoom: DEFAULT_MAP_VIEW.zoom
  });

  // If relying on style sprite, do not add images; otherwise ensure custom icons exist
  if (!USE_SPRITE_ICONS) {
    // Provide missing images on demand (with SVG-first strategy)
    async function addSvgIcon(name, svgUrl, pngFallbackUrl) {
      try {
        const res = await fetch(svgUrl, { mode: "cors" });
        if (!res.ok) throw new Error("SVG fetch failed " + res.status);
        const svgText = await res.text();
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        mapInstance.loadImage(url, (err, image) => {
          URL.revokeObjectURL(url);
          if (err || !image) {
            mapInstance.loadImage(pngFallbackUrl, (err2, image2) => {
              if (err2 || !image2) return;
              if (mapInstance.hasImage && mapInstance.hasImage(name)) {
                mapInstance.removeImage(name);
              }
              if (mapInstance.addImage) mapInstance.addImage(name, image2);
            });
            return;
          }
          if (mapInstance.hasImage && mapInstance.hasImage(name)) {
            mapInstance.removeImage(name);
          }
          if (mapInstance.addImage) mapInstance.addImage(name, image);
        });
      } catch (_e) {
        mapInstance.loadImage(pngFallbackUrl, (err2, image2) => {
          if (err2 || !image2) return;
          if (mapInstance.hasImage && mapInstance.hasImage(name)) {
            mapInstance.removeImage(name);
          }
          if (mapInstance.addImage) mapInstance.addImage(name, image2);
        });
      }
    }
    mapInstance.on("styleimagemissing", e => {
      if (!e || !e.id) return;
      const theme = document.documentElement.getAttribute("data-theme") || "dark";
      const urls = getIconUrlsForTheme(theme);
      if (e.id === "hail-icon") {
        addSvgIcon("hail-icon", urls.stopSvg, ICON_STOP_URL);
      } else if (e.id === "station-icon") {
        addSvgIcon("station-icon", urls.stationSvg, ICON_STATION_URL);
      }
    });
    // Preload icons once
    const initialTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const initialUrls = getIconUrlsForTheme(initialTheme);
    addSvgIcon("hail-icon", initialUrls.stopSvg, ICON_STOP_URL);
    addSvgIcon("station-icon", initialUrls.stationSvg, ICON_STATION_URL);
  }

  mapInstance.on("load", async () => {
    // Précharger les icônes locales avant d'ajouter les couches pour éviter
    // les warnings "Image ... could not be loaded"
    if (!USE_SPRITE_ICONS) {
      // utilitaire local async
      const loadIconPromise = (name, svgUrl, pngFallbackUrl) => {
        return new Promise(resolve => {
          const addImageFromSvg = () => {
            fetch(svgUrl, { mode: "cors" })
              .then(res => (res.ok ? res.text() : Promise.reject(new Error("svg http " + res.status))))
              .then(svgText => {
                const blob = new Blob([svgText], { type: "image/svg+xml" });
                const url = URL.createObjectURL(blob);
                mapInstance.loadImage(url, (err, image) => {
                  URL.revokeObjectURL(url);
                  if (!err && image) {
                    if (mapInstance.hasImage && mapInstance.hasImage(name)) {
                      mapInstance.removeImage(name);
                    }
                    if (mapInstance.addImage) mapInstance.addImage(name, image);
                    resolve(true);
                    return;
                  }
                  // fallback PNG
                  mapInstance.loadImage(pngFallbackUrl, (err2, image2) => {
                    if (!err2 && image2) {
                      if (mapInstance.hasImage && mapInstance.hasImage(name)) {
                        mapInstance.removeImage(name);
                      }
                      if (mapInstance.addImage) mapInstance.addImage(name, image2);
                    }
                    resolve(mapInstance.hasImage(name));
                  });
                });
              })
              .catch(() => {
                mapInstance.loadImage(pngFallbackUrl, (err2, image2) => {
                  if (!err2 && image2) {
                    if (mapInstance.hasImage && mapInstance.hasImage(name)) {
                      mapInstance.removeImage(name);
                    }
                    if (mapInstance.addImage) mapInstance.addImage(name, image2);
                  }
                  resolve(mapInstance.hasImage(name));
                });
              });
          };
          addImageFromSvg();
        });
      };
      const themeNow = document.documentElement.getAttribute("data-theme") || "dark";
      const urls = getIconUrlsForTheme(themeNow);
      await Promise.all([
        loadIconPromise("hail-icon", urls.stopSvg, ICON_STOP_URL),
        loadIconPromise("station-icon", urls.stationSvg, ICON_STATION_URL)
      ]);
    }

    if (USE_CLUSTERING) { try { initClusterModeLayers(maplibre); } catch (e) { console.warn("Clustering init failed, falling back to non-cluster mode:", e); initPointLayers(maplibre); } } else { initPointLayers(maplibre); }
    if (DISABLE_POI_LAYERS) {
      const disable = () => {
        try {
          const style = mapInstance.getStyle();
          (style?.layers || []).forEach(layer => {
            const id = layer?.id || "";
            const type = layer?.type || "";
            const sourceLayer = layer?.["source-layer"] || "";
            if (
              type === "symbol" &&
              (id.includes("poi") || id.includes("amenity") || sourceLayer.includes("poi") || sourceLayer.includes("amenity"))
            ) {
              if (mapInstance.getLayer(id)) {
                mapInstance.setLayoutProperty(id, "visibility", "none");
              }
            }
          });
        } catch (e) {
          console.warn("Désactivation des POI impossible:", e);
        }
      };
      disable();
      mapInstance.on("styledata", disable);
    }
  });

  // Log zoom level in console (on zoom end to avoid noise)
  mapInstance.on("zoomend", () => {
    try {
      const z = typeof mapInstance.getZoom === "function" ? mapInstance.getZoom() : null;
      if (typeof z === "number") {
        console.log("[Vista] Zoom:", z.toFixed(2));
      }
    } catch (_) {}
  });

  mapInstance.addControl(new maplibre.NavigationControl(), "top-right");
  return mapInstance;
}

export function setMapTheme(theme) {
  if (!mapInstance) return;
  const nextStyle = getMapStyleURL(theme);
  try {
    mapInstance.setStyle(nextStyle);
    // Après changement de style, les images sont réinitialisées — elles seront
    // redemandées via styleimagemissing et rechargées avec la variante du thème.
  } catch (e) {
    console.warn("Impossible de changer le style de carte:", e);
  }
}
function setStopsGeojson(features) {
  if (!mapInstance || !stopsSourceReady) {
    return;
  }
  const source = mapInstance.getSource(STOPS_SOURCE_ID);
  if (!source) {
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features
  });
}

function setStationsGeojson(features) {
  if (!mapInstance || !stationsSourceReady) {
    return;
  }
  const source = mapInstance.getSource(STATIONS_SOURCE_ID);
  if (!source) {
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features
  });
}

function ensureUserMarker(maplibre, userLocation) {
  if (!userLocation) {
    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
    return;
  }
  if (!userMarker) {
    userMarker = new maplibre.Marker({ color: "#f97316" });
  }
  userMarker
    .setLngLat([userLocation.lon, userLocation.lat])
    .setPopup(
      new maplibre.Popup({ closeButton: false }).setHTML(
        `<strong>Ta position</strong><br>${userLocation.lat.toFixed(
          4
        )}, ${userLocation.lon.toFixed(4)}`
      )
    )
    .addTo(mapInstance);
}

export function updateMap(stops, area, userLocation, stations = []) {
  if (!mapInstance) {
    return;
  }

  const maplibre = ensureMaplibre();
  if (!maplibre) {
    return;
  }

  const applyUpdate = () => {
    const stopFeatures = (stops || [])
      .filter(stop => typeof stop.lat === "number" && typeof stop.lon === "number")
      .map(stop => ({
        type: "Feature",
        properties: {
          id: stop.id,
          name: stop.name || "Arrêt sans nom",
          parentStationId: stop.parentStationId || (stop.parentStation && stop.parentStation.id) || null
        },
        geometry: {
          type: "Point",
          coordinates: [stop.lon, stop.lat]
        }
      }));
    const stationFeatures = (stations || [])
      .filter(st => typeof st.lat === "number" && typeof st.lon === "number")
      .map(st => ({
        type: "Feature",
        properties: {
          id: st.id,
          name: st.name || "Station"
        },
        geometry: {
          type: "Point",
          coordinates: [st.lon, st.lat]
        }
      }));

    setStopsGeojson(stopFeatures);
    setStationsGeojson(stationFeatures);
    ensureUserMarker(maplibre, userLocation);

    const bounds = new maplibre.LngLatBounds();
    let hasBounds = false;
    stopFeatures.forEach(feature => {
      bounds.extend(feature.geometry.coordinates);
      hasBounds = true;
    });
    stationFeatures.forEach(feature => {
      bounds.extend(feature.geometry.coordinates);
      hasBounds = true;
    });
    if (userLocation) {
      bounds.extend([userLocation.lon, userLocation.lat]);
      hasBounds = true;
    }

    if (hasBounds && typeof bounds.isValid === "function" && bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 15 });
    } else if (area && typeof area.lat === "number" && typeof area.lon === "number") {
      mapInstance.setCenter([area.lon, area.lat]);
      mapInstance.setZoom(12);
    }
  };

  if (!stopsSourceReady || !stationsSourceReady) {
    mapInstance.once("load", applyUpdate);
    return;
  }

  applyUpdate();
}
