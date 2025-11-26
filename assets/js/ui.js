import { REALTIME_NETWORK_IDS, REGION_NAMES } from "./config.js";
import { renderIcon } from "./utils.js";
import { getNetworkDisplayName } from "./networkStore.js";

const vistaApp = document.getElementById("vista-app");
const regionSelect = document.getElementById("region-select");
const loadBtn = document.getElementById("load-btn");
const debugEl = document.getElementById("debug");
const debugPanel = document.getElementById("debug-panel");
const debugToggle = document.getElementById("debug-toggle");
const debugCloseBtn = document.getElementById("debug-close");
const stopsListEl = document.getElementById("stops-list");
const networkSelectHidden = document.getElementById("network-select");
const networkSelectWrapper = document.getElementById("network-select-wrapper");
const networkSelectTrigger = document.getElementById("network-select-trigger");
const networkSelectDropdown = document.getElementById("network-select-dropdown");
const footerStatusEl = document.getElementById("footer-status");
const leftPanel = document.getElementById("sidebar-left");
const rightPanel = document.getElementById("sidebar-right");
const leftToggle = document.getElementById("layout-left-toggle");
const rightToggle = document.getElementById("layout-right-toggle");
const stopDetailsTitle = document.getElementById("stop-details-title");
const stopDetailsPanel = document.getElementById("stop-details");
const burgerToggle = document.getElementById("burger-toggle");
const burgerMenu = document.getElementById("burger-menu");
const burgerClose = document.getElementById("burger-close");
const burgerOverlay = document.getElementById("burger-overlay");

const panelsState = {
  left: false,
  right: false
};

let stopSelectHandler = null;
let highlightedStopId = null;

function emitStopSelection(payload) {
  if (typeof stopSelectHandler === "function") {
    stopSelectHandler(payload);
  }
}

function updateHighlightedStopState() {
  if (!stopsListEl) {
    return;
  }
  const items = stopsListEl.querySelectorAll("li[data-stop-id]");
  items.forEach(item => {
    if (!item) return;
    const isActive = highlightedStopId && item.dataset.stopId === highlightedStopId;
    if (isActive) {
      item.classList.add("is-active");
      item.setAttribute("aria-current", "true");
    } else {
      item.classList.remove("is-active");
      item.removeAttribute("aria-current");
    }
  });
}

export function initCollapsibles() {
  const headers = document.querySelectorAll(".collapsible .collapsible-header");
  headers.forEach(header => {
    header.addEventListener("click", () => {
      const section = header.closest(".collapsible");
      if (!section) return;
      const isCollapsed = section.getAttribute("data-collapsed") !== "false";
      section.setAttribute("data-collapsed", isCollapsed ? "false" : "true");
      header.setAttribute("aria-expanded", isCollapsed ? "true" : "false");
    });
  });
}

function setPanelState(panel, open) {
  if (!vistaApp) return;
  const nextState = Boolean(open);
  panelsState[panel] = nextState;

  if (panel === "left" && leftPanel) {
    leftPanel.dataset.state = nextState ? "open" : "closed";
    vistaApp.classList.toggle("sidebar-left-collapsed", !nextState);
    if (leftToggle) {
      leftToggle.setAttribute("aria-pressed", nextState ? "true" : "false");
      leftToggle.dataset.active = nextState ? "true" : "false";
    }
  }
  if (panel === "right" && rightPanel) {
    rightPanel.dataset.state = nextState ? "open" : "closed";
    vistaApp.classList.toggle("sidebar-right-collapsed", !nextState);
    if (rightToggle) {
      rightToggle.setAttribute("aria-pressed", nextState ? "true" : "false");
      rightToggle.dataset.active = nextState ? "true" : "false";
    }
  }
}

function togglePanel(panel) {
  const current = panelsState[panel];
  setPanelState(panel, !current);
}

function bindPanelClosers() {
  document.querySelectorAll("[data-panel-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.panelClose;
      if (target === "left" || target === "right") {
        setPanelState(target, false);
      }
    });
  });
}

function setDebugVisible(visible) {
  if (!debugPanel) return;
  if (visible) {
    debugPanel.classList.remove("is-hidden");
  } else {
    debugPanel.classList.add("is-hidden");
  }
  if (debugToggle) {
    debugToggle.setAttribute("aria-pressed", visible ? "true" : "false");
  }
}

function setBurgerMenuOpen(open) {
  if (!burgerMenu) return;
  const isOpen = Boolean(open);
  burgerMenu.dataset.state = isOpen ? "open" : "closed";
  if (burgerToggle) {
    burgerToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  if (burgerOverlay) {
    burgerOverlay.classList.toggle("is-visible", isOpen);
  }
  // Prevent body scroll when menu is open
  document.body.style.overflow = isOpen ? "hidden" : "";
}

function toggleBurgerMenu() {
  const isOpen = burgerMenu?.dataset.state === "open";
  setBurgerMenuOpen(!isOpen);
}

export function closeBurgerMenu() {
  setBurgerMenuOpen(false);
}

export function initLayout() {
  setPanelState("left", false);
  setPanelState("right", false);
  bindPanelClosers();

  // Burger menu
  burgerToggle?.addEventListener("click", toggleBurgerMenu);
  burgerClose?.addEventListener("click", () => setBurgerMenuOpen(false));
  burgerOverlay?.addEventListener("click", () => setBurgerMenuOpen(false));

  // Close burger menu on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && burgerMenu?.dataset.state === "open") {
      setBurgerMenuOpen(false);
    }
  });
}

export function openRightPanel() {
  setPanelState("right", true);
}

export { regionSelect, loadBtn };

export function populateRegionSelect(regionCodes) {
  if (!regionSelect) {
    return;
  }
  regionSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "– choisir –";
  regionSelect.appendChild(placeholder);

  (regionCodes || []).forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    // Use full region name from REGION_NAMES, fallback to uppercase code
    const lowerCode = code.toLowerCase();
    opt.textContent = REGION_NAMES[lowerCode] || code.toUpperCase();
    regionSelect.appendChild(opt);
  });
}

export function setDebugMessage(message) {
  if (!debugEl) return;
  debugEl.textContent = message;
}

function renderPlaceholder(message) {
  return `<li class="list-placeholder"><span>${message || "Chargement…"} </span></li>`;
}

export function setStopsMessage(message) {
  if (!stopsListEl) return;
  stopsListEl.innerHTML = renderPlaceholder(message);
}

export function setLocationStatus(message) {
  if (!footerStatusEl) return;
  footerStatusEl.textContent = message;
}

let currentNetworksList = [];
let networkSelectChangeHandler = null;

function renderRealtimeIcon() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const variant = theme === "light" ? "black" : "white";
  return `<span class="icon-stack" aria-label="Temps réel" role="img">
    <img src="assets/icons/material/wifi_1_bar_${variant}.svg" alt="" class="icon-frame" style="--frame-index:0" aria-hidden="true">
    <img src="assets/icons/material/wifi_2_bar_${variant}.svg" alt="" class="icon-frame" style="--frame-index:1" aria-hidden="true">
    <img src="assets/icons/material/wifi_${variant}.svg" alt="" class="icon-frame" style="--frame-index:2" aria-hidden="true">
  </span>`;
}

function escapeHtmlAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

function closeNetworkDropdown() {
  networkSelectWrapper?.classList.remove("is-open");
}

function openNetworkDropdown() {
  networkSelectWrapper?.classList.add("is-open");
}

function toggleNetworkDropdown() {
  if (networkSelectWrapper?.classList.contains("is-open")) {
    closeNetworkDropdown();
  } else {
    openNetworkDropdown();
  }
}

function selectNetworkOption(value, label, triggerChange = true) {
  if (!networkSelectHidden || !networkSelectTrigger) return;
  
  const oldValue = networkSelectHidden.value;
  networkSelectHidden.value = value;
  
  // Update trigger display
  const valueSpan = networkSelectTrigger.querySelector(".custom-select-value");
  if (valueSpan) {
    valueSpan.innerHTML = label;
  }
  
  // Update selected state in dropdown
  networkSelectDropdown?.querySelectorAll(".custom-select-option").forEach(opt => {
    opt.classList.toggle("is-selected", opt.dataset.value === value);
  });
  
  closeNetworkDropdown();
  
  // Trigger change event
  if (triggerChange && oldValue !== value && networkSelectChangeHandler) {
    networkSelectChangeHandler();
  }
}

export function populateNetworkSelect(networks, selectedId) {
  if (!networkSelectDropdown || !networkSelectTrigger || !networkSelectWrapper) {
    return;
  }

  currentNetworksList = networks || [];
  networkSelectDropdown.innerHTML = "";

  if (!networks.length) {
    networkSelectWrapper.dataset.disabled = "true";
    networkSelectTrigger.disabled = true;
    const valueSpan = networkSelectTrigger.querySelector(".custom-select-value");
    if (valueSpan) {
      valueSpan.textContent = "Sélectionne d'abord une région";
    }
    if (networkSelectHidden) networkSelectHidden.value = "";
    return;
  }

  networkSelectWrapper.dataset.disabled = "false";
  networkSelectTrigger.disabled = false;
  
  let selectedLabel = "";
  let selectedValue = "";
  
  networks.forEach((network, index) => {
    const value = network.agencyId || network.id || "";
    const supportsRealtime =
      Boolean(network.hasRealtime === true || network.realtime === true || (value && REALTIME_NETWORK_IDS.has(value)));
    
    // Use display name (Zone / Réseau) if available, fallback to OTP name
    const displayName = getNetworkDisplayName(network);
    const label = displayName || network.name || value || "Réseau sans nom";
    
    const isSelected = selectedId ? value === selectedId : index === 0;
    if (isSelected) {
      selectedValue = value;
      selectedLabel = supportsRealtime ? `${label} ${renderRealtimeIcon()}` : label;
    }
    
    const optionHtml = `
      <div class="custom-select-option${isSelected ? " is-selected" : ""}" 
           data-value="${escapeHtmlAttr(value)}"
           data-lat="${network.centroid?.lat ?? ""}"
           data-lon="${network.centroid?.lon ?? ""}"
           title="${escapeHtmlAttr(network.name || value)}">
        <span class="custom-select-option-label">${label}</span>
        ${supportsRealtime ? renderRealtimeIcon() : ""}
      </div>
    `;
    networkSelectDropdown.insertAdjacentHTML("beforeend", optionHtml);
  });
  
  // Set initial selection
  if (networkSelectHidden) networkSelectHidden.value = selectedValue;
  const valueSpan = networkSelectTrigger.querySelector(".custom-select-value");
  if (valueSpan) {
    valueSpan.innerHTML = selectedLabel || "– sélection automatique –";
  }
  
  // Bind click handlers to options
  networkSelectDropdown.querySelectorAll(".custom-select-option").forEach(opt => {
    opt.addEventListener("click", () => {
      const value = opt.dataset.value || "";
      const labelEl = opt.querySelector(".custom-select-option-label");
      const hasRealtime = opt.querySelector(".icon-stack");
      const labelText = labelEl?.textContent || "";
      const label = hasRealtime ? `${labelText} ${renderRealtimeIcon()}` : labelText;
      selectNetworkOption(value, label);
    });
  });
}

export function getSelectedNetworkId() {
  return networkSelectHidden?.value || "";
}

export function updateRealtimeIconsTheme() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const variant = theme === "light" ? "black" : "white";
  
  // Update icons in dropdown
  const dropdownIcons = networkSelectDropdown?.querySelectorAll(".icon-stack img.icon-frame") || [];
  dropdownIcons.forEach(img => {
    const currentSrc = img.getAttribute("src") || "";
    const newSrc = currentSrc
      .replace(/wifi_1_bar_(white|black)\.svg/, `wifi_1_bar_${variant}.svg`)
      .replace(/wifi_2_bar_(white|black)\.svg/, `wifi_2_bar_${variant}.svg`)
      .replace(/wifi_(white|black)\.svg/, `wifi_${variant}.svg`);
    if (newSrc !== currentSrc) {
      img.setAttribute("src", newSrc);
    }
  });
  
  // Update icons in trigger (selected value)
  const triggerIcons = networkSelectTrigger?.querySelectorAll(".icon-stack img.icon-frame") || [];
  triggerIcons.forEach(img => {
    const currentSrc = img.getAttribute("src") || "";
    const newSrc = currentSrc
      .replace(/wifi_1_bar_(white|black)\.svg/, `wifi_1_bar_${variant}.svg`)
      .replace(/wifi_2_bar_(white|black)\.svg/, `wifi_2_bar_${variant}.svg`)
      .replace(/wifi_(white|black)\.svg/, `wifi_${variant}.svg`);
    if (newSrc !== currentSrc) {
      img.setAttribute("src", newSrc);
    }
  });
}

export function onNetworkSelectChange(handler) {
  networkSelectChangeHandler = typeof handler === "function" ? handler : null;
}

// Initialize custom select behavior
function initNetworkSelect() {
  networkSelectTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!networkSelectTrigger.disabled) {
      toggleNetworkDropdown();
    }
  });
  
  // Close on click outside
  document.addEventListener("click", (e) => {
    if (!networkSelectWrapper?.contains(e.target)) {
      closeNetworkDropdown();
    }
  });
  
  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeNetworkDropdown();
    }
  });
}

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNetworkSelect);
} else {
  initNetworkSelect();
}

export function renderStops(stops, { routeFilter } = {}) {
  if (!stopsListEl) return;
  stopsListEl.innerHTML = "";
  const list = Array.isArray(stops) ? stops : [];
  if (!list.length) {
    setStopsMessage("Aucun arrêt trouvé pour cette zone.");
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach(stop => {
    const li = document.createElement("li");
    li.dataset.stopId = stop.id || "";
    if (typeof stop.lat === "number") {
      li.dataset.lat = String(stop.lat);
    }
    if (typeof stop.lon === "number") {
      li.dataset.lon = String(stop.lon);
    }
    const stopLineIds = Array.isArray(stop.lineIds) && stop.lineIds.length
      ? stop.lineIds
      : Array.isArray(stop.lines)
        ? stop.lines.map(line => line?.id).filter(Boolean)
        : [];
    if (stopLineIds.length) {
      li.dataset.lines = stopLineIds.join(",");
    }
    if (Array.isArray(routeFilter) && routeFilter.length) {
      const hasMatch = stopLineIds.length ? stopLineIds.some(id => routeFilter.includes(id)) : false;
      li.dataset.filtered = hasMatch ? "0" : "1";
    } else {
      li.dataset.filtered = "0";
    }
    li.dataset.stopName = stop.name || "";
    const payload = {
      stopId: stop.id,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      parentStationId: stop.parentStationId || null
    };

    const nameSpan = document.createElement("span");
    nameSpan.className = "stop-name";
    nameSpan.textContent = stop.name;
    li.appendChild(nameSpan);

    if (typeof stop.lat === "number" && typeof stop.lon === "number") {
      const coordsSpan = document.createElement("span");
      coordsSpan.className = "stop-coords";
      coordsSpan.textContent = `(${stop.lat.toFixed(4)}, ${stop.lon.toFixed(4)})`;
      li.appendChild(coordsSpan);
    } else {
      const missingCoords = document.createElement("span");
      missingCoords.className = "stop-coords";
      missingCoords.textContent = "(coordonnées indisponibles)";
      li.appendChild(missingCoords);
    }

    if (typeof stop.distance === "number") {
      const distanceSpan = document.createElement("span");
      distanceSpan.className = "stop-coords";
      distanceSpan.textContent = ` • ${Math.round(stop.distance)} m`;
      li.appendChild(distanceSpan);
    }

    li.setAttribute("role", "button");
    li.tabIndex = 0;
    li.setAttribute("aria-label", `Afficher la fiche pour ${stop.name}`);

    li.addEventListener("click", () => {
      highlightStop(payload.stopId);
      emitStopSelection(payload);
    });
    li.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        highlightStop(payload.stopId);
        emitStopSelection(payload);
      }
    });

    if (highlightedStopId && payload.stopId && payload.stopId === highlightedStopId) {
      li.classList.add("is-active");
      li.setAttribute("aria-current", "true");
    }

    fragment.appendChild(li);
  });
  stopsListEl.appendChild(fragment);
}

export function onStopListSelect(handler) {
  stopSelectHandler = typeof handler === "function" ? handler : null;
}

export function highlightStop(stopId) {
  highlightedStopId = stopId || null;
  updateHighlightedStopState();
}

function updateStopDetailsPanel(title, html) {
  if (stopDetailsTitle && typeof title === "string") {
    stopDetailsTitle.textContent = title;
  }
  if (stopDetailsPanel) {
    stopDetailsPanel.innerHTML = html;
  }
}

function escapeHtml(value) {
  if (value == null) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSectionHeader(iconName, label) {
  const icon = renderIcon(iconName, { className: "section-icon-img", alt: "" });
  return `
    <div class="stop-section-header">
      <span class="section-icon">${icon}</span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function buildMetaTile({ label, value, icon }) {
  const tileIcon = renderIcon(icon, { className: "meta-icon-img", alt: "" });
  return `
    <div class="meta-tile">
      <span class="meta-icon">${tileIcon}</span>
      <div class="meta-body">
        <span class="meta-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    </div>
  `;
}

function normalizeHexColor(value) {
  if (!value) return null;
  let hex = String(value).trim();
  if (!hex) return null;
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return `#${hex.toUpperCase()}`;
}

function formatAbsoluteTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "—";
  }
  const now = new Date();
  const date = new Date(seconds * 1000);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}h${mm}`;
  
  // Calculer la différence en jours
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const departureStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.round((departureStart - todayStart) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 0) {
    return timeStr;
  } else if (daysDiff === 1) {
    return `${timeStr} J+1`;
  } else if (daysDiff > 1) {
    return `${timeStr} J+${daysDiff}`;
  }
  // Si dans le passé (daysDiff < 0), afficher juste l'heure
  return timeStr;
}

function formatRelativeTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "";
  }
  const diffMinutes = Math.round((seconds * 1000 - Date.now()) / 60000);
  if (diffMinutes < -1) {
    return `il y a ${Math.abs(diffMinutes)} min`;
  }
  if (diffMinutes <= 1) {
    return "à l'instant";
  }
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    const minutesLabel = minutes ? `${String(minutes).padStart(2, "0")}` : "";
    return `dans ${hours}h${minutesLabel}`;
  }
  return `dans ${diffMinutes} min`;
}

function computeAbsoluteSeconds(dep) {
  const serviceDay = Number(dep?.serviceDay);
  const realtime = Number(dep?.realtimeDeparture);
  const scheduled = Number(dep?.scheduledDeparture);
  if (Number.isFinite(serviceDay) && Number.isFinite(realtime)) {
    return serviceDay + realtime;
  }
  if (Number.isFinite(serviceDay) && Number.isFinite(scheduled)) {
    return serviceDay + scheduled;
  }
  if (Number.isFinite(dep?.scheduledTime)) {
    return Math.floor(dep.scheduledTime / 1000);
  }
  if (Number.isFinite(dep?.realtimeDepartureSeconds)) {
    return Number(dep.realtimeDepartureSeconds) + (serviceDay || 0);
  }
  return null;
}

function computeDelayInfo(dep) {
  const realtime = Number(dep?.realtimeDeparture);
  const scheduled = Number(dep?.scheduledDeparture);
  if (Number.isFinite(realtime) && Number.isFinite(scheduled)) {
    const deltaMinutes = Math.round((realtime - scheduled) / 60);
    if (deltaMinutes > 1) {
      return { text: `+${deltaMinutes} min`, modifier: "delay" };
    }
    if (deltaMinutes < -1) {
      return { text: `${deltaMinutes} min`, modifier: "early" };
    }
    return null;
  }
  return null;
}

function buildRouteChip(route, { isInteractive = false, active = true } = {}) {
  if (!route) {
    return "";
  }
  const label = route.shortName || route.longName || route.id;
  if (!label) {
    return "";
  }
  const bg = normalizeHexColor(route.color);
  const fg = normalizeHexColor(route.textColor);
  const styles = [];
  if (bg) styles.push(`background-color:${bg}`);
  if (fg) styles.push(`color:${fg}`);
  const routeId = route?.id ? String(route.id) : "";
  const canToggle = Boolean(isInteractive && routeId);
  const classes = ["route-chip"];
  if (canToggle) {
    classes.push("route-chip--filter");
    classes.push(active ? "is-active" : "is-inactive");
  }
  const dataAttrs = [];
  if (canToggle) {
    dataAttrs.push(`data-route-id="${escapeHtml(routeId)}"`);
    dataAttrs.push(`tabindex="0"`);
    if (label) dataAttrs.push(`data-route-label="${escapeHtml(label)}"`);
  }
  const attrString = dataAttrs.length ? ` ${dataAttrs.join(" ")}` : "";
  return `<span class="${classes.join(" ")}"${styles.length ? ` style="${styles.join(";")}"` : ""}${attrString}>${escapeHtml(label)}</span>`;
}

function renderDepartureRow(dep) {
  const absSeconds = computeAbsoluteSeconds(dep);
  const timeLabel = formatAbsoluteTime(absSeconds);
  const relLabel = formatRelativeTime(absSeconds);
  const headsign = dep?.headsign
    ? escapeHtml(dep.headsign)
    : `<span class="muted">Direction inconnue</span>`;
  const delayInfo = computeDelayInfo(dep);
  const badgeClass = delayInfo?.modifier ? ` is-${delayInfo.modifier}` : "";
  const routeChip = buildRouteChip(dep?.route);
  const isRealtime = Boolean(dep?.realtime);
  const statusIcon = isRealtime
    ? `<span class="departure-status-icon is-realtime" title="Temps réel">${renderIcon("realtime", {
        className: "realtime-icon",
        alt: "Temps réel"
      })}</span>`
    : `<span class="departure-status-icon" title="Horaire planifié">${renderIcon("scheduled", {
        className: "scheduled-icon",
        alt: "Horaire planifié"
      })}</span>`;
  const statusLabel = isRealtime ? "Temps réel" : "Horaire planifié";
  const relativeLabel = relLabel ? `<small>${escapeHtml(relLabel)}</small>` : "";
  const delayBadge = delayInfo?.text
    ? `<span class="delay-badge${badgeClass}">${escapeHtml(delayInfo.text)}</span>`
    : "";

  return `
    <li class="departure-row carousel-card">
      <div class="departure-line">${routeChip || ""}</div>
      <div class="departure-direction">→ ${headsign}</div>
      <div class="departure-time">
        <strong>${escapeHtml(timeLabel)}</strong>
        ${relativeLabel}
        ${delayBadge}
      </div>
      <div class="departure-status" data-status="${isRealtime ? "realtime" : "scheduled"}">
        ${statusIcon}
        <span class="status-label">${statusLabel}</span>
      </div>
    </li>
  `;
}

function buildRoutesSection(routes = [], { routeFilter = [], onToggle } = {}) {
  const header = buildSectionHeader("direction", `Ligne${routes?.length > 1 ? "s" : ""}${routes?.length ? ` (${routes.length})` : ""}`);
  if (!Array.isArray(routes) || !routes.length) {
    return `
      <section class="stop-routes">
        ${header}
        <p class="empty-state">Aucune ligne publiée pour cet arrêt.</p>
      </section>
    `;
  }
  const chipsHTML = routes
    .map(route => {
      const id = route?.id;
      const active = !routeFilter.length || (id ? routeFilter.includes(id) : true);
      return buildRouteChip(route, { isInteractive: true, active });
    })
    .filter(Boolean)
    .join("");
  return `
    <section class="stop-routes">
      ${header}
      <div class="route-chip-group" role="group" aria-label="Filtres lignes" data-route-filter>
        ${chipsHTML}
      </div>
    </section>
  `;
}

function buildDeparturesSection(departures) {
  const header = buildSectionHeader("time", "Prochains départs");
  if (!Array.isArray(departures) || !departures.length) {
    return `
      <section class="stop-departures">
        ${header}
        <p class="empty-state">Aucun départ planifié pour l'instant.</p>
      </section>
    `;
  }
  const items = departures.slice(0, 8).map(renderDepartureRow).join("");
  return `
    <section class="stop-departures">
      ${header}
      <ul class="departures-list">
        ${items}
      </ul>
    </section>
  `;
}

function buildStopMetaSection(details) {
  const tiles = [];
  if (details.typeLabel) {
    tiles.push({
      label: "Type",
      value: details.typeLabel,
      icon: details.typeLabel.toLowerCase().includes("station") ? "station" : "stop"
    });
  }
  if (details.coordinates && Number.isFinite(details.coordinates.lat) && Number.isFinite(details.coordinates.lon)) {
    tiles.push({
      label: "Coordonnées",
      value: `${details.coordinates.lat.toFixed(4)}, ${details.coordinates.lon.toFixed(4)}`,
      icon: "recenter"
    });
  }
  if (typeof details.totalStops === "number") {
    tiles.push({
      label: "Points desservis",
      value: String(details.totalStops),
      icon: "info"
    });
  }
  if (!tiles.length) {
    return "";
  }
  return `<div class="stop-meta-grid">${tiles.map(tile => buildMetaTile(tile)).join("")}</div>`;
}

export function setStopDetailsMessage(message, title = "Aucun arrêt sélectionné") {
  updateStopDetailsPanel(title, `<p class="empty-state">${escapeHtml(message || "Clique un arrêt sur la carte ou dans la liste.")}</p>`);
}

export function setStopDetailsLoading(label = "Chargement…") {
  updateStopDetailsPanel(label, `<p class="stop-details-loading"><span class="spinner"></span><span>Chargement des départs…</span></p>`);
}

export function setStopDetailsError(message) {
  updateStopDetailsPanel("Impossible de charger", `<p class="stop-details-error">${escapeHtml(message || "Impossible de récupérer les informations de l'arrêt.")}</p>`);
}

export function renderStopDetailsPanel(details = {}) {
  if (!stopDetailsPanel) {
    return;
  }
  const title = details.title || details.name || (details.typeLabel === "Station" ? "Station sélectionnée" : "Arrêt sélectionné");
  const meta = buildStopMetaSection(details);
  const routesSection = buildRoutesSection(details.routes || [], {
    routeFilter: details.activeRouteFilter || [],
    onToggle: details.onRouteToggle
  });
  const departuresSection = buildDeparturesSection(details.departures || []);
  updateStopDetailsPanel(title, `${meta}${routesSection}${departuresSection}`);
  bindRouteFilterControls(details.onRouteToggle);
}

function bindRouteFilterControls(handler) {
  if (!stopDetailsPanel || typeof handler !== "function") {
    return;
  }
  const container = stopDetailsPanel.querySelector("[data-route-filter]");
  if (!container) {
    return;
  }
  container.querySelectorAll(".route-chip--filter").forEach(chip => {
    const routeId = chip.getAttribute("data-route-id");
    if (!routeId) {
      return;
    }
    const toggle = () => handler(routeId);
    chip.addEventListener("click", toggle);
    chip.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  });
}

if (stopDetailsPanel) {
  setStopDetailsMessage("Clique un arrêt sur la carte ou dans la liste.");
}

// ═══════════════════════════════════════════════════════════
// Realtime Icons Update (theme switch)
// ═══════════════════════════════════════════════════════════

export function updateRealtimeIcons() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const variant = theme === "light" ? "black" : "white";
  // Update all realtime icons in the network select dropdown and trigger
  const iconFrames = document.querySelectorAll(".icon-stack .icon-frame");
  iconFrames.forEach(img => {
    const src = img.getAttribute("src") || "";
    // Replace white/black variant in the src
    const newSrc = src.replace(/_(white|black)\.svg$/, `_${variant}.svg`);
    if (newSrc !== src) {
      img.src = newSrc;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Nearby Panel (Carousel)
// ═══════════════════════════════════════════════════════════

const nearbyPanel = document.getElementById("nearby-panel");
const nearbyTrack = document.getElementById("nearby-track");
const nearbyDots = document.getElementById("nearby-dots");
const nearbyCount = document.getElementById("nearby-count");
const nearbyCloseBtn = document.getElementById("nearby-close");
const nearbyToggleBtn = document.getElementById("nearby-toggle");
const nearbyHint = document.getElementById("nearby-hint");

let nearbyCardClickHandler = null;
let nearbyScrollObserver = null;

function normalizeHexColorNearby(value) {
  if (!value) return null;
  let hex = String(value).trim();
  if (!hex) return null;
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toUpperCase()}`;
}

function formatNearbyEta(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  
  const now = new Date();
  const departureTime = seconds * 1000;
  const diffMinutes = Math.round((departureTime - now.getTime()) / 60000);
  
  // Si moins de 60 minutes : "Dans X min."
  if (diffMinutes < 1) return "Dans < 1 min.";
  if (diffMinutes < 60) {
    return `Dans ${diffMinutes} min.`;
  }
  
  // Si 60 minutes et plus : afficher l'heure absolue "HHhMM"
  const date = new Date(departureTime);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}h${mm}`;
  
  // Calculer la différence en jours
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const departureStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.round((departureStart - todayStart) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 0) {
    return timeStr;
  } else if (daysDiff === 1) {
    return `${timeStr} J+1`;
  } else if (daysDiff > 1) {
    return `${timeStr} J+${daysDiff}`;
  }
  return timeStr;
}

function computeNearbyAbsoluteSeconds(dep) {
  const serviceDay = Number(dep?.serviceDay);
  const realtime = Number(dep?.realtimeDeparture);
  const scheduled = Number(dep?.scheduledDeparture);
  if (Number.isFinite(serviceDay) && Number.isFinite(realtime)) {
    return serviceDay + realtime;
  }
  if (Number.isFinite(serviceDay) && Number.isFinite(scheduled)) {
    return serviceDay + scheduled;
  }
  return null;
}

function renderNearbyDeparture(dep) {
  const absSeconds = computeNearbyAbsoluteSeconds(dep);
  const eta = formatNearbyEta(absSeconds);
  const isRealtime = Boolean(dep?.realtime);
  const headsign = dep?.headsign || "Direction inconnue";
  const route = dep?.route || {};
  const lineLabel = route.shortName || route.longName || "";
  const bgColor = normalizeHexColorNearby(route.color) || "#6b7280";
  const textColor = normalizeHexColorNearby(route.textColor) || "#ffffff";

  return `
    <div class="nearby-departure">
      <span class="nearby-line-badge" style="background:${bgColor};color:${textColor}">${escapeHtml(lineLabel)}</span>
      <span class="nearby-destination">${escapeHtml(headsign)}</span>
      <span class="nearby-eta${isRealtime ? " realtime" : ""}">
        ${isRealtime ? '<span class="realtime-dot"></span>' : ""}
        ${escapeHtml(eta)}
      </span>
    </div>
  `;
}

function renderNearbyCard(stop, index) {
  const name = stop.name || "Arrêt";
  const distance = typeof stop.distance === "number" ? `${Math.round(stop.distance)} m` : "";
  const departures = Array.isArray(stop.departures) ? stop.departures.slice(0, 3) : [];
  const departuresHtml = departures.length
    ? departures.map(renderNearbyDeparture).join("")
    : '<div class="nearby-departure" style="opacity:0.5;justify-content:center;">Aucun départ prévu</div>';

  return `
    <article class="nearby-card" tabindex="0" data-stop-id="${escapeHtml(stop.id || "")}" data-index="${index}">
      <div class="nearby-card-header">
        <span class="nearby-card-name">${escapeHtml(name)}</span>
        <span class="nearby-card-distance">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>
          ${escapeHtml(distance)}
        </span>
      </div>
      <div class="nearby-departures">
        ${departuresHtml}
      </div>
      <div class="nearby-card-footer">
        <span class="nearby-card-cta">Voir plus →</span>
      </div>
    </article>
  `;
}

function renderNearbySkeletonCards(count = 3) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(`
      <article class="nearby-card skeleton" data-index="${i}">
        <div class="nearby-card-header">
          <span class="nearby-card-name"></span>
          <span class="nearby-card-distance"></span>
        </div>
        <div class="nearby-departures">
          <div class="nearby-departure"></div>
          <div class="nearby-departure"></div>
        </div>
      </article>
    `);
  }
  return cards.join("");
}

function renderNearbyEmpty() {
  return `
    <div class="nearby-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
      <span class="nearby-empty-text">Aucun arrêt trouvé à proximité. Déplacez le marqueur vers une zone desservie.</span>
    </div>
  `;
}

function updateNearbyDots(count, activeIndex = 0) {
  if (!nearbyDots) return;
  if (count <= 1) {
    nearbyDots.innerHTML = "";
    return;
  }
  const dots = [];
  for (let i = 0; i < count; i++) {
    dots.push(`<span class="nearby-dot${i === activeIndex ? " active" : ""}"></span>`);
  }
  nearbyDots.innerHTML = dots.join("");
}

function setupNearbyScrollObserver() {
  if (!nearbyTrack || nearbyScrollObserver) return;

  const cards = nearbyTrack.querySelectorAll(".nearby-card:not(.skeleton)");
  if (cards.length <= 1) return;

  nearbyScrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const index = parseInt(entry.target.dataset.index, 10) || 0;
          updateNearbyDots(cards.length, index);
        }
      });
    },
    {
      root: nearbyTrack,
      threshold: 0.5
    }
  );

  cards.forEach((card) => nearbyScrollObserver.observe(card));
}

function clearNearbyScrollObserver() {
  if (nearbyScrollObserver) {
    nearbyScrollObserver.disconnect();
    nearbyScrollObserver = null;
  }
}

function bindNearbyCardEvents() {
  if (!nearbyTrack) return;

  nearbyTrack.querySelectorAll(".nearby-card:not(.skeleton)").forEach((card) => {
    const handler = () => {
      const stopId = card.dataset.stopId;
      if (stopId && typeof nearbyCardClickHandler === "function") {
        nearbyCardClickHandler(stopId);
      }
    };
    card.addEventListener("click", handler);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });
}

export function setNearbyPanelState(state) {
  if (!nearbyPanel) return;
  nearbyPanel.dataset.state = state;
  
  if (nearbyToggleBtn) {
    nearbyToggleBtn.setAttribute("aria-pressed", state !== "hidden" ? "true" : "false");
  }
  
  // Toggle class on vista-shell for sidebar-right positioning
  const shell = document.getElementById("vista-shell");
  if (shell) {
    shell.classList.toggle("nearby-panel-open", state !== "hidden");
  }
}

export function showNearbyPanel() {
  setNearbyPanelState("visible");
}

export function hideNearbyPanel() {
  setNearbyPanelState("hidden");
  clearNearbyScrollObserver();
}

export function setNearbyLoading() {
  if (!nearbyTrack || !nearbyCount) return;
  setNearbyPanelState("loading");
  nearbyCount.textContent = "";
  nearbyTrack.innerHTML = renderNearbySkeletonCards(3);
  if (nearbyHint) nearbyHint.style.display = "none";
  if (nearbyDots) nearbyDots.innerHTML = "";
}

export function renderNearbyStops(stops = []) {
  if (!nearbyTrack || !nearbyCount) return;

  clearNearbyScrollObserver();

  if (!stops.length) {
    nearbyTrack.innerHTML = renderNearbyEmpty();
    nearbyCount.textContent = "";
    if (nearbyHint) nearbyHint.style.display = "none";
    if (nearbyDots) nearbyDots.innerHTML = "";
    setNearbyPanelState("visible");
    return;
  }

  nearbyCount.textContent = `${stops.length} arrêt${stops.length > 1 ? "s" : ""}`;
  nearbyTrack.innerHTML = stops.map((stop, i) => renderNearbyCard(stop, i)).join("");
  if (nearbyHint) nearbyHint.style.display = "none";

  updateNearbyDots(stops.length, 0);
  setupNearbyScrollObserver();
  bindNearbyCardEvents();
  setNearbyPanelState("visible");
}

export function showNearbyHint() {
  if (!nearbyTrack || !nearbyCount) return;
  nearbyTrack.innerHTML = "";
  nearbyCount.textContent = "";
  if (nearbyHint) nearbyHint.style.display = "flex";
  if (nearbyDots) nearbyDots.innerHTML = "";
  setNearbyPanelState("visible");
}

export function onNearbyCardClick(handler) {
  nearbyCardClickHandler = typeof handler === "function" ? handler : null;
}

export function onNearbyToggle(handler) {
  if (!nearbyToggleBtn) return;
  nearbyToggleBtn.addEventListener("click", () => {
    if (typeof handler === "function") {
      handler();
    }
  });
}

export function onNearbyClose(handler) {
  if (!nearbyCloseBtn) return;
  nearbyCloseBtn.addEventListener("click", () => {
    if (typeof handler === "function") {
      handler();
    }
  });
}
