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

let networksData = null;
let selectedRegion = "";
let authState = { authenticated: false, user: { role: null, email: null, name: null } };

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
    // Try lightweight regions index first
    const indexRes = await fetch("../data/regions.json?ts=" + Date.now());
    if (indexRes.ok) {
      const index = await indexRes.json();
      const codes = Array.isArray(index.regions) ? index.regions : [];
      // Load all region files in parallel for admin view
      const results = await Promise.all(
        codes.map(async code => {
          const res = await fetch(`../data/networks/${code}.json?ts=` + Date.now());
          if (!res.ok) {
            return [code, []];
          }
          const arr = await res.json();
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
      const response = await fetch("../data/networks.json?ts=" + Date.now());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      networksData = await response.json();
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
  const regions = Object.keys(networksData?.regions ?? {});
  regionFilter.innerHTML = '<option value="">Toutes</option>';
  regions.forEach(region => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region.toUpperCase();
    regionFilter.appendChild(opt);
  });
  if (regions.includes(selectedRegion)) {
    regionFilter.value = selectedRegion;
  } else {
    regionFilter.value = "";
    selectedRegion = "";
  }
}

function renderTable() {
  const regions = networksData?.regions ?? {};
  const rows = [];
  const regionKeys = selectedRegion ? [selectedRegion] : Object.keys(regions);
  regionKeys.forEach(regionCode => {
    const entries = regions[regionCode] ?? [];
    entries.forEach(network => {
      rows.push(`
        <tr>
          <td>${regionCode.toUpperCase()}</td>
          <td>${network.name}</td>
          <td>${network.stopCount ?? 0}</td>
          <td>${formatCoord(network.centroid?.lat)}</td>
          <td>${formatCoord(network.centroid?.lon)}</td>
          <td>${(network.routes || []).slice(0, 3).join(", ")}${
            (network.routes || []).length > 3 ? "…" : ""
          }</td>
        </tr>
      `);
    });
  });
  tableBody.innerHTML = rows.join("");
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
