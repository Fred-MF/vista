// Configuration et constantes partagées
export const MAPTILES_KEY = "qDh7iktwydGLl7iZILsj";
export const MAP_STYLE_URL_LIGHT = `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILES_KEY}`;
export const MAP_STYLE_URL_DARK = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILES_KEY}`;
export const MAP_STYLE_URL = MAP_STYLE_URL_DARK;

// Liste optionnelle des réseaux disposant d'un flux temps réel (agencyId ou id)
export const REALTIME_NETWORK_IDS = new Set([
  // "idf:ratp",
  // "ara:lyon:tcl"
]);

export const OTP_ENDPOINTS = {
  ara: "https://otp-ara.maasify.io/otp/routers/default/index/graphql",
  bfc: "https://otp-bfc.maasify.io/otp/routers/default/index/graphql",
  bre: "https://otp-bre.maasify.io/otp/routers/default/index/graphql",
  caraibe: "https://otp-caraibe.maasify.io/otp/routers/default/index/graphql", // Guyane
  cor: "https://otp-cor.maasify.io/otp/routers/default/index/graphql",
  cvl: "https://otp-cvl.maasify.io/otp/routers/default/index/graphql",
  ges: "https://otp-ges.maasify.io/otp/routers/default/index/graphql",
  gf: "https://otp-gf.maasify.io/otp/routers/default/index/graphql", // Guadeloupe
  hdf: "https://otp-hdf.maasify.io/otp/routers/default/index/graphql",
  idf: "https://otp-idf.maasify.io/otp/routers/default/index/graphql",
  mar: "https://otp-mar.maasify.io/otp/routers/default/index/graphql", // Martinique
  naq: "https://otp-naq.maasify.io/otp/routers/default/index/graphql",
  nor: "https://otp-nor.maasify.io/otp/routers/default/index/graphql",
  occ: "https://otp-occ.maasify.io/otp/routers/default/index/graphql",
  paca: "https://otp-paca.maasify.io/otp/routers/default/index/graphql",
  pdl: "https://otp-pdl.maasify.io/otp/routers/default/index/graphql",
  re: "https://otp-re.maasify.io/otp/routers/default/index/graphql"
};

export const REGION_NAMES = {
  ara: "Auvergne-Rhône-Alpes",
  bfc: "Bourgogne-Franche-Comté",
  bre: "Bretagne",
  caraibe: "Guyane",
  cor: "Corse",
  cvl: "Centre-Val de Loire",
  ges: "Grand Est",
  gf: "Guadeloupe",
  hdf: "Hauts-de-France",
  idf: "Île-de-France",
  mar: "Martinique",
  naq: "Nouvelle-Aquitaine",
  nor: "Normandie",
  occ: "Occitanie",
  paca: "Provence-Alpes-Côte d'Azur",
  pdl: "Pays de la Loire",
  re: "La Réunion"
};

export const REGION_DEFAULT_COORDS = {
  ara: { lat: 45.7578, lon: 4.832, label: "Lyon" },
  bfc: { lat: 47.322, lon: 5.0415, label: "Dijon" },
  bre: { lat: 48.1173, lon: -1.6778, label: "Rennes" },
  caraibe: { lat: 4.9224, lon: -52.3135, label: "Cayenne" },
  cor: { lat: 41.9192, lon: 8.7386, label: "Ajaccio" },
  cvl: { lat: 47.9025, lon: 1.909, label: "Orléans" },
  ges: { lat: 48.5734, lon: 7.7521, label: "Strasbourg" },
  gf: { lat: 16.2374, lon: -61.5331, label: "Pointe-à-Pitre" },
  hdf: { lat: 50.6292, lon: 3.0573, label: "Lille" },
  idf: { lat: 48.8566, lon: 2.3522, label: "Paris" },
  mar: { lat: 14.6161, lon: -61.0588, label: "Fort-de-France" },
  naq: { lat: 44.8378, lon: -0.5792, label: "Bordeaux" },
  nor: { lat: 49.4432, lon: 1.0993, label: "Rouen" },
  occ: { lat: 43.6045, lon: 1.4442, label: "Toulouse" },
  paca: { lat: 43.2965, lon: 5.3698, label: "Marseille" },
  pdl: { lat: 47.2184, lon: -1.5536, label: "Nantes" },
  re: { lat: -20.8821, lon: 55.4503, label: "Saint-Denis" }
};

export const DEFAULT_RADIUS_METERS = 800;
export const DEFAULT_LIMIT = 200;

export const DEFAULT_MAP_VIEW = {
  lat: REGION_DEFAULT_COORDS.idf.lat,
  lon: REGION_DEFAULT_COORDS.idf.lon,
  zoom: 11
};

export function getEndpointForRegion(regionCode) {
  return OTP_ENDPOINTS[regionCode] || null;
}

// Google Sign-In client id (public)
export const GOOGLE_CLIENT_ID = "411573598240-tqhbh48ts3bcnof79ctnt8tkgvf6q3p5.apps.googleusercontent.com";

// Map zoom thresholds for POI display
export const ZOOM_STATIONS_POINTS_MIN = 20; // show individual stations from this zoom
export const ZOOM_STOPS_MIN = 17; // show stop points from this zoom
export const DISABLE_POI_LAYERS = true;
export const USE_CLUSTERING = true;
// Local icons (light/dark variants) - provide your own files under assets/svg/icones/
export const ICON_STOP_SVG_URL_LIGHT = "assets/icons/hail_white.svg";
export const ICON_STOP_SVG_URL_DARK = "assets/icons/hail_black.svg";
export const ICON_STATION_SVG_URL_LIGHT = "assets/icons/subway_walk_black.svg";
export const ICON_STATION_SVG_URL_DARK = "assets/icons/subway_walk_black.svg";
// Backward-compat PNG fallbacks (unused if SVGs exist)
export const ICON_STOP_URL = "assets/icons/hail_black.png";
export const ICON_STATION_URL = "assets/icons/directions_subway_black.png";

export function getMapStyleURL(theme) {
  return theme === "light" ? MAP_STYLE_URL_LIGHT : MAP_STYLE_URL_DARK;
}
// If you manage icons in your MapTiler style's sprite, set this to true.
// Then define the icon names exactly as they appear in your sprite.
export const USE_SPRITE_ICONS = false;
export const SPRITE_STOP_ICON_NAME = "hail-icon";
export const SPRITE_STATION_ICON_NAME = "station-icon";

export function getIconUrlsForTheme(theme) {
  const isLight = theme === "light";
  return {
    stopSvg: isLight ? ICON_STOP_SVG_URL_LIGHT : ICON_STOP_SVG_URL_DARK,
    stationSvg: isLight ? ICON_STATION_SVG_URL_LIGHT : ICON_STATION_SVG_URL_DARK
  };
}
