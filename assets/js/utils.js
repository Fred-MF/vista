const EARTH_RADIUS_KM = 6371;

export function haversineDistance(coordA, coordB) {
  if (
    typeof coordA?.lat !== "number" ||
    typeof coordA?.lon !== "number" ||
    typeof coordB?.lat !== "number" ||
    typeof coordB?.lon !== "number"
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(coordB.lat - coordA.lat);
  const dLon = toRad(coordB.lon - coordA.lon);

  const lat1 = toRad(coordA.lat);
  const lat2 = toRad(coordB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

const ICON_BASE_PATH = "assets/icons/material";

const ICON_MAP = {
  stop: {
    dark: "location_on_white.svg",
    light: "location_on_black.svg"
  },
  station: {
    dark: "location_on_white.svg",
    light: "location_on_black.svg"
  },
  time: {
    dark: "schedule_white.svg",
    light: "schedule_black.svg",
  },
  scheduled: {
    dark: "calendar_clock_white.svg",
    light: "calendar_clock_black.svg",
  },
  direction: {
    dark: "arrow_forward_white.svg",
    light: "arrow_forward_black.svg",
  },
  delay: {
    dark: "warning_white.svg",
    light: "warning_black.svg",
  },
  cancel: {
    dark: "cancel_white.svg",
    light: "cancel_black.svg",
  },
  realtime: {
    dark: ["wifi_white.svg", "wifi_1_bar_white.svg", "wifi_2_bar_white.svg"],
    light: ["wifi_black.svg", "wifi_1_bar_black.svg", "wifi_2_bar_black.svg"],
  },
  recenter: {
    dark: "my_location_white.svg",
    light: "my_location_black.svg",
  },
  info: {
    dark: "info_white.svg",
    light: "info_black.svg"
  }
};

function getDocumentTheme() {
  if (typeof document !== "undefined") {
    const theme = document.documentElement?.getAttribute("data-theme");
    if (theme === "light" || theme === "dark") {
      return theme;
    }
  }
  return "dark";
}

function resolveIconFile(entry, themePreference) {
  if (!entry) {
    return null;
  }
  if (typeof entry === "string") {
    return entry;
  }
  const desiredTheme = themePreference || getDocumentTheme();
  const themed = entry[desiredTheme] ?? entry.dark ?? entry.light;
  if (Array.isArray(themed)) {
    return themed;
  }
  if (typeof themed === "string") {
    return themed;
  }
  const fallback = Object.values(entry)[0];
  return Array.isArray(fallback) ? fallback : fallback || null;
}

/**
 * Retourne le chemin relatif vers le SVG correspondant.
 * @param {string} name - clé logique (ex: "stop", "time").
 * @param {("light"|"dark")} [theme]
 * @returns {string|null}
 */
export function getIconPath(name, theme) {
  if (!name) {
    return null;
  }
  const file = resolveIconFile(ICON_MAP[name] || ICON_MAP.info, theme);
  if (!file) {
    return null;
  }
  if (Array.isArray(file)) {
    return file.map(frame => `${ICON_BASE_PATH}/${frame}`);
  }
  return `${ICON_BASE_PATH}/${file}`;
}

/**
 * Génère un snippet <img> prêt à être injecté dans un template string.
 * @param {string} name - clé logique (ex: "stop").
 * @param {Object} options
 * @param {string} [options.className] - classes supplémentaires.
 * @param {string} [options.alt] - texte alternatif (par défaut vide pour icon décoratif).
 * @param {("light"|"dark")} [options.theme] - forcer un thème (sinon utilise data-theme).
 * @returns {string}
 */
export function renderIcon(name, { className = "", alt = "", theme } = {}) {
  const resolved = getIconPath(name, theme);
  if (!resolved) {
    return "";
  }
  const safeAlt = alt ? String(alt) : "";
  if (Array.isArray(resolved)) {
    const frames = resolved
      .map((frame, index) => {
        return `<img src="${frame}" alt="" class="icon-frame" data-frame="${index}" style="--frame-index:${index}" aria-hidden="true">`;
      })
      .join("");
    const containerClasses = ["icon", "icon-stack", className].filter(Boolean).join(" ");
    const aria = safeAlt ? ` aria-label="${safeAlt}" role="img"` : ' aria-hidden="true"';
    return `<span class="${containerClasses}"${aria}>${frames}</span>`;
  }
  const classes = ["icon", className].filter(Boolean).join(" ");
  return `<img src="${resolved}" alt="${safeAlt}" class="${classes}">`;
}
