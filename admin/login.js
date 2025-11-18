const statusEl = document.getElementById("login-status");
const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f87171" : "#94a3b8";
}

async function refreshSessionAndMaybeRedirect() {
  try {
    const res = await fetch("./session.php");
    const data = await res.json();
    if (data?.user?.role === "user" || data?.user?.role === "superadmin" || data?.user?.role === "admin") {
      window.location.href = "./";
      return;
    }
    if (data?.user?.role === "pending") {
      setStatus("Compte en attente d'approbation. Réessayez plus tard.");
    }
  } catch {
    // ignore
  }
}

async function doLogin() {
  const username = (usernameInput.value || "").trim();
  const password = passwordInput.value || "";
  if (!username || !password) {
    setStatus("Renseignez l'identifiant et le mot de passe.", true);
    return;
  }
  try {
    const res = await fetch("./login_password.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setStatus(payload.error || "Identifiants invalides.", true);
      return;
    }
    await refreshSessionAndMaybeRedirect();
  } catch (e) {
    console.error(e);
    setStatus("Erreur de connexion.", true);
  }
}

loginBtn.addEventListener("click", doLogin);
passwordInput.addEventListener("keydown", e => {
  if (e.key === "Enter") doLogin();
});

refreshSessionAndMaybeRedirect();

