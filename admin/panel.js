const ALL_REGION_CODES = [
  "ara","bfc","bre","caraibe","cor","cvl","ges","gf","hdf","idf","mar","naq","nor","occ","paca","pdl","re"
];

const statusEl = document.getElementById("admin-status");
const tableBody = document.getElementById("networks-table");
const regionFilter = document.getElementById("region-filter");
const refreshBtn = document.getElementById("refresh-btn");
const rebuildBtn = document.getElementById("rebuild-btn");
const approvalsPanel = document.getElementById("approvals-panel");
const approvalsBody = document.getElementById("approvals-body");
const progressEl = document.getElementById("rebuild-progress");
const progressBar = document.getElementById("rebuild-progress-bar");
const progressLabel = document.getElementById("rebuild-progress-label");
const DATA_API_URL = "../data/index.php";
const LABELS_API_URL = "./labels.php";

let networksData = null;
let labelsData = {};
let selectedRegion = "";
let authState = { authenticated: false, user: { role: null, email: null, name: null } };
let saveTimeout = null;

function buildDataApiUrl(resource, params = {}) {
  const url = new URL(DATA_API_URL, window.location.href);
  url.searchParams.set("resource", resource);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  url.searchParams.set("ts", Date.now().toString());
  return url.toString();
}

async function fetchJsonWithFallback(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) {
        continue;
      }
      return await response.json();
    } catch (error) {
      console.warn("Admin data fetch failed for", url, error);
    }
  }
  return null;
}

function directDataUrl(path) {
  return `${path}${path.includes("?") ? "&" : "?"}ts=${Date.now()}`;
}

async function loadRegionsIndexLight() {
  return fetchJsonWithFallback([
    directDataUrl("../data/regions.json"),
    buildDataApiUrl("regions")
  ]);
}

async function loadRegionNetworks(code) {
  return fetchJsonWithFallback([
    directDataUrl(`../data/networks/${code}.json`),
    buildDataApiUrl("region", { code })
  ]);
}

async function loadAggregatedNetworks() {
  return fetchJsonWithFallback([
    directDataUrl("../data/networks.json"),
    buildDataApiUrl("aggregated")
  ]);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f87171" : "#94a3b8";
}

function setProgress(current, total) {
  const pct = Math.max(0, Math.min(100, Math.round((current / Math.max(1, total)) * 100)));
  if (progressEl) {
    progressEl.style.display = "";
    progressEl.setAttribute("aria-hidden", "false");
  }
  if (progressBar) {
    progressBar.style.width = pct + "%";
  }
  if (progressLabel) {
    progressLabel.textContent = pct + "%";
  }
}

function resetProgress(hide = true) {
  if (progressBar) {
    progressBar.style.width = "0%";
  }
  if (progressLabel) {
    progressLabel.textContent = "0%";
  }
  if (hide && progressEl) {
    progressEl.style.display = "none";
    progressEl.setAttribute("aria-hidden", "true");
  }
}

async function loadLabels() {
  try {
    const response = await fetch(LABELS_API_URL, { credentials: "same-origin" });
    if (!response.ok) {
      console.warn("Failed to load labels:", response.status);
      return;
    }
    const data = await response.json();
    labelsData = data.labels || {};
  } catch (err) {
    console.warn("Error loading labels:", err);
  }
}

async function saveLabel(agencyId, zone, reseau, aliasOf) {
  const saveIndicator = document.getElementById("save-indicator");
  if (saveIndicator) {
    saveIndicator.classList.remove("saved");
    saveIndicator.classList.add("saving");
  }
  
  try {
    const response = await fetch(LABELS_API_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agencyId, zone, reseau, aliasOf })
    });
    
    if (!response.ok) {
      console.error("Failed to save label:", response.status);
      return false;
    }
    
    // Update local cache
    if (!labelsData[agencyId]) {
      labelsData[agencyId] = {};
    }
    labelsData[agencyId].zone = zone;
    labelsData[agencyId].reseau = reseau;
    if (aliasOf) {
      labelsData[agencyId].aliasOf = aliasOf;
    } else {
      delete labelsData[agencyId].aliasOf;
    }
    
    if (saveIndicator) {
      saveIndicator.classList.remove("saving");
      saveIndicator.classList.add("saved");
      setTimeout(() => saveIndicator.classList.remove("saved"), 2000);
    }
    return true;
  } catch (err) {
    console.error("Error saving label:", err);
    if (saveIndicator) {
      saveIndicator.classList.remove("saving");
    }
    return false;
  }
}

function handleLabelInput(agencyId, field, value) {
  // Update local cache immediately
  if (!labelsData[agencyId]) {
    labelsData[agencyId] = {};
  }
  labelsData[agencyId][field] = value;
  
  // Debounce save
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    const label = labelsData[agencyId] || {};
    saveLabel(agencyId, label.zone || "", label.reseau || "", label.aliasOf || "");
  }, 500);
}

async function ensureAuthenticated() {
  try {
    const res = await fetch("./session.php", { credentials: "same-origin" });
    const data = await res.json();
    authState = data;
  } catch {
    authState = { authenticated: false, user: { role: null } };
  }
  const role = authState?.user?.role;
  if (role !== "user" && role !== "superadmin" && role !== "admin") {
    window.location.href = "./login.html";
    return false;
  }
  if (role === "superadmin") {
    approvalsPanel.style.display = "";
    await loadApprovals();
  } else {
    approvalsPanel.style.display = "none";
  }
  return true;
}

async function loadNetworks() {
  try {
    setStatus("Chargement des réseaux…");
    
    // Load labels in parallel
    await loadLabels();
    
    // Try lightweight regions index first (with API fallback)
    const index = await loadRegionsIndexLight();
    if (index && Array.isArray(index.regions)) {
      const codes = index.regions;
      const results = await Promise.all(
        codes.map(async code => {
          const arr = await loadRegionNetworks(code);
          return [code, Array.isArray(arr) ? arr : []];
        })
      );
      const regions = {};
      results.forEach(([code, arr]) => {
        regions[code] = arr;
      });
      networksData = {
        generatedAt: index.generatedAt || null,
        regions
      };
    } else {
      // Fallback to legacy aggregated file
      const aggregated = await loadAggregatedNetworks();
      if (!aggregated) {
        throw new Error("Impossible d'accéder au référentiel (aggregated).");
      }
      networksData = aggregated;
    }
    populateRegionFilter();
    renderTable();
    const generatedAt = networksData.generatedAt
      ? new Date(networksData.generatedAt).toLocaleString("fr-FR")
      : "jamais";
    setStatus(`Dernière génération : ${generatedAt}`);
  } catch (err) {
    console.error(err);
    setStatus("Impossible de charger les données : " + err.message, true);
  }
}

function populateRegionFilter() {
  const regions = new Set(Object.keys(networksData?.regions ?? {}));
  ALL_REGION_CODES.forEach(code => regions.add(code));
  regionFilter.innerHTML = '<option value="">Toutes</option>';
  Array.from(regions)
    .sort()
    .forEach(region => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region.toUpperCase();
    regionFilter.appendChild(opt);
  });
  const regionList = Array.from(regions);
  if (regionList.includes(selectedRegion)) {
    regionFilter.value = selectedRegion;
  } else {
    regionFilter.value = "";
    selectedRegion = "";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRealtimeIcon() {
  // Animated wifi icon with 3 frames
  const frames = [
    "../assets/icons/material/wifi_1_bar_white.svg",
    "../assets/icons/material/wifi_2_bar_white.svg",
    "../assets/icons/material/wifi_white.svg"
  ];
  const framesHtml = frames
    .map((src, i) => `<img src="${src}" alt="" class="icon-frame" style="--frame-index:${i}" aria-hidden="true">`)
    .join("");
  return `<span class="realtime-badge"><span class="icon-stack" aria-label="Temps réel" role="img">${framesHtml}</span> Live</span>`;
}

function renderTable() {
  const regions = networksData?.regions ?? {};
  const rows = [];
  const regionKeys = selectedRegion ? [selectedRegion] : Object.keys(regions).sort();
  
  // Build list of all networks for alias dropdown
  const allNetworks = [];
  Object.keys(regions).sort().forEach(rCode => {
    (regions[rCode] ?? []).forEach(n => {
      allNetworks.push({
        agencyId: n.agencyId || "",
        name: n.name || n.agencyId || "",
        region: rCode
      });
    });
  });
  
  regionKeys.forEach(regionCode => {
    const entries = regions[regionCode] ?? [];
    entries.forEach(network => {
      const agencyId = network.agencyId || "";
      const label = labelsData[agencyId] || {};
      const hasRealtime = network.hasRealtime === true;
      const currentAlias = label.aliasOf || "";
      
      // Build alias dropdown options (exclude self)
      const aliasOptions = allNetworks
        .filter(n => n.agencyId !== agencyId)
        .map(n => {
          const selected = n.agencyId === currentAlias ? " selected" : "";
          const displayName = `${n.region.toUpperCase()}: ${n.name}`;
          return `<option value="${escapeHtml(n.agencyId)}"${selected}>${escapeHtml(displayName)}</option>`;
        })
        .join("");
      
      const isAlias = currentAlias !== "";
      const rowClass = isAlias ? ' class="is-alias"' : "";
      
      rows.push(`
        <tr data-agency-id="${escapeHtml(agencyId)}"${rowClass}>
          <td>${regionCode.toUpperCase()}</td>
          <td title="${escapeHtml(agencyId)}">${escapeHtml(network.name)}</td>
          <td class="editable-cell">
            <input type="text" 
                   data-field="zone" 
                   value="${escapeHtml(label.zone || "")}" 
                   placeholder="ex: Agglo Orléans">
          </td>
          <td class="editable-cell">
            <input type="text" 
                   data-field="reseau" 
                   value="${escapeHtml(label.reseau || "")}" 
                   placeholder="ex: TAO">
          </td>
          <td class="editable-cell">
            <select data-field="aliasOf">
              <option value="">— aucun —</option>
              ${aliasOptions}
            </select>
          </td>
          <td>${network.stopCount ?? 0}</td>
          <td>${hasRealtime ? renderRealtimeIcon() : "—"}</td>
        </tr>
      `);
    });
  });
  tableBody.innerHTML = rows.join("");
  
  // Bind input handlers
  tableBody.querySelectorAll("input[data-field]").forEach(input => {
    const row = input.closest("tr");
    const agencyId = row?.dataset.agencyId;
    const field = input.dataset.field;
    if (!agencyId || !field) return;
    
    input.addEventListener("input", () => {
      handleLabelInput(agencyId, field, input.value);
    });
  });
  
  // Bind select handlers for alias
  tableBody.querySelectorAll("select[data-field='aliasOf']").forEach(select => {
    const row = select.closest("tr");
    const agencyId = row?.dataset.agencyId;
    if (!agencyId) return;
    
    select.addEventListener("change", () => {
      handleLabelInput(agencyId, "aliasOf", select.value);
      // Update row styling
      row.classList.toggle("is-alias", select.value !== "");
    });
  });
}

function formatCoord(value) {
  if (typeof value !== "number") {
    return "–";
  }
  return value.toFixed(4);
}

async function rebuildNetworks() {
  try {
    if (!authState.authenticated || (authState.user.role !== "user" && authState.user.role !== "superadmin" && authState.user.role !== "admin")) {
      window.location.href = "./login.html";
      return;
    }
    setStatus("Reconstruction en cours…");
    rebuildBtn.disabled = true;
    // Determine which regions to rebuild: current filter or all
    const regions = networksData?.regions ? Object.keys(networksData.regions) : [];
    const queue = selectedRegion ? [selectedRegion] : regions;
    if (!queue.length) {
      setStatus("Aucune région à reconstruire (données absentes).", true);
      return;
    }
    const errors = [];
    const results = [];
    let i = 0;
    setProgress(0, queue.length);
    for (const code of queue) {
      i += 1;
      setStatus(`Reconstruction ${code.toUpperCase()} (${i}/${queue.length})…`);
      const url = `./rebuild.php?region=${encodeURIComponent(code)}`;
      const resp = await fetch(url, { method: "POST", credentials: "same-origin" });
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await resp.text();
        errors.push({ region: code, message: `Non-JSON HTTP ${resp.status} (${text.slice(0,120)}…)` });
        setProgress(i, queue.length);
        continue;
      }
      const json = await resp.json();
      if (!resp.ok || json.status === "error" || (json.errors && json.errors.length)) {
        errors.push({ region: code, message: (json.message || "Échec partiel") });
      } else {
        results.push(code);
      }
      setProgress(i, queue.length);
    }
    const doneMsg = `Reconstruction terminée. OK: ${results.length}/${queue.length}${errors.length ? `, erreurs: ${errors.length}` : ""}.`;
    setStatus(doneMsg, !!errors.length);
    await loadNetworks();
  } catch (err) {
    console.error(err);
    setStatus("Échec de la reconstruction : " + err.message, true);
  } finally {
    rebuildBtn.disabled = false;
    setTimeout(() => resetProgress(true), 800);
  }
}

regionFilter.addEventListener("change", () => {
  selectedRegion = regionFilter.value;
  renderTable();
});

refreshBtn.addEventListener("click", loadNetworks);
rebuildBtn.addEventListener("click", rebuildNetworks);

async function loadApprovals() {
  try {
    const res = await fetch("./authorize.php");
    const data = await res.json();
    const rows = (data.pendingEmails || []).map(email => {
      return `
        <tr>
          <td>${email}</td>
          <td>
            <button data-approve="${email}">Approuver</button>
            <button data-deny="${email}">Refuser</button>
          </td>
        </tr>
      `;
    });
    approvalsBody.innerHTML = rows.join("");
    approvalsBody.querySelectorAll("button[data-approve]").forEach(btn => {
      btn.addEventListener("click", () => approveEmail(btn.getAttribute("data-approve")));
    });
    approvalsBody.querySelectorAll("button[data-deny]").forEach(btn => {
      btn.addEventListener("click", () => denyEmail(btn.getAttribute("data-deny")));
    });
  } catch (e) {
    console.error(e);
  }
}

async function approveEmail(email) {
  await fetch("./authorize.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", email })
  });
  await loadApprovals();
}

async function denyEmail(email) {
  await fetch("./authorize.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "deny", email })
  });
  await loadApprovals();
}

ensureAuthenticated().then(ok => {
  if (ok) {
    loadNetworks();
  }
});

// Logout button (toolbar)
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("./logout.php", { method: "POST" });
    } catch {}
    window.location.href = "./login.html";
  });
}

// CSV Import
const importCsvInput = document.getElementById("import-csv-input");
if (importCsvInput) {
  importCsvInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setStatus("Import CSV en cours…");
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await fetch(LABELS_API_URL + "?action=import", {
        method: "POST",
        credentials: "same-origin",
        body: formData
      });
      
      const result = await response.json();
      
      if (result.status === "ok") {
        setStatus(`Import terminé : ${result.imported} labels importés, ${result.skipped} ignorés.`);
        // Reload to refresh the table
        await loadNetworks();
      } else {
        setStatus("Erreur import : " + (result.message || "Erreur inconnue"), true);
      }
    } catch (err) {
      console.error("CSV import error:", err);
      setStatus("Erreur lors de l'import CSV : " + err.message, true);
    }
    
    // Reset file input
    importCsvInput.value = "";
  });
}
