const regionSelect = document.getElementById("region-select");
const loadBtn = document.getElementById("load-btn");
const debugEl = document.getElementById("debug");
const stopsListEl = document.getElementById("stops-list");
const networkSelect = document.getElementById("network-select");
const locationStatusEl = document.getElementById("location-status");

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

export { regionSelect, loadBtn, networkSelect };

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
    opt.textContent = code.toUpperCase();
    regionSelect.appendChild(opt);
  });
}

export function setDebugMessage(message) {
  debugEl.textContent = message;
}

export function setStopsMessage(message) {
  stopsListEl.innerHTML = `<li>${message}</li>`;
}

export function setLocationStatus(message) {
  locationStatusEl.textContent = message;
}

export function populateNetworkSelect(networks, selectedId) {
  if (!networkSelect) {
    return;
  }

  networkSelect.innerHTML = "";

  if (!networks.length) {
    networkSelect.disabled = true;
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Sélectionne d'abord une région";
    networkSelect.appendChild(option);
    return;
  }

  networkSelect.disabled = false;
  networks.forEach(network => {
    const option = document.createElement("option");
    const value = network.agencyId || network.id || "";
    option.value = value;
    option.textContent = network.name || value || "Réseau sans nom";

    const centroid = network.centroid || {};
    if (typeof centroid.lat === "number") {
      option.dataset.lat = centroid.lat;
    }
    if (typeof centroid.lon === "number") {
      option.dataset.lon = centroid.lon;
    }

    networkSelect.appendChild(option);
  });

  if (selectedId) {
    networkSelect.value = selectedId;
    if (networkSelect.value !== selectedId) {
      networkSelect.selectedIndex = 0;
    }
  } else {
    networkSelect.selectedIndex = 0;
  }
}

export function getSelectedNetworkId() {
  return networkSelect.value;
}

export function renderStops(stops) {
  stopsListEl.innerHTML = "";
  const list = Array.isArray(stops) ? stops : [];
  if (!list.length) {
    setStopsMessage("Aucun arrêt trouvé pour cette zone.");
    return;
  }

  list.forEach(stop => {
    const li = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.className = "stop-name";
    nameSpan.textContent = stop.name;
    li.appendChild(nameSpan);

    if (typeof stop.lat === "number" && typeof stop.lon === "number") {
      const coordsSpan = document.createElement("span");
      coordsSpan.className = "stop-coords";
      coordsSpan.textContent = `(${stop.lat.toFixed(4)}, ${stop.lon.toFixed(
        4
      )})`;
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

    stopsListEl.appendChild(li);
  });
}
