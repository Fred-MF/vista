<?php
declare(strict_types=1);

$hash = null;
$error = null;

if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "POST") {
    $password = (string)($_POST["password"] ?? "");
    if ($password === "") {
        $error = "Veuillez saisir un mot de passe.";
    } else {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        if ($hash === false) {
            $error = "Impossible de générer le hash.";
        }
    }
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Vista – Générateur de hash</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="../assets/css/style.css">
  <style>
    body { background: #020617; min-height: 100vh; display: grid; place-items: center; }
    .card { width: 100%; max-width: 640px; padding: 1.25rem; border: 1px solid #1e293b; border-radius: 0.75rem; background: #0b1120; }
    .admin-toolbar { position: fixed; top: 10px; right: 12px; display: flex; gap: 8px; align-items: center; z-index: 50; }
    .tool-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid #1e293b; border-radius: 8px; background: #0b1120; color: #e5e7eb; cursor: pointer; }
    .tool-btn:hover { background: #111827; }
    .tool-btn svg { width: 16px; height: 16px; }
    .card h1 { margin-top: 0; font-size: 1.1rem; }
    .row { display: flex; gap: 0.5rem; align-items: center; }
    .row + .row { margin-top: 0.5rem; }
    input[type="password"] { width: 100%; padding: 0.5rem; border: 1px solid #1e293b; background: #020617; color: #e5e7eb; border-radius: 0.375rem; }
    button { padding: 0.45rem 0.8rem; border: 1px solid #1e293b; border-color: #38bdf8; background: #020617; color: #e5e7eb; border-radius: 0.375rem; cursor: pointer; }
    .status { margin-top: 0.75rem; font-size: 0.9rem; }
    .status.error { color: #f87171; }
    .status.ok { color: #34d399; }
    textarea { width: 100%; min-height: 120px; padding: 0.5rem; border: 1px solid #1e293b; background: #020617; color: #e5e7eb; border-radius: 0.375rem; }
    .hint { color: #94a3b8; font-size: 0.85rem; margin-top: 0.5rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  </style>
</head>
<body>
  <div class="admin-toolbar">
    <button id="logout-btn" class="tool-btn" title="Se déconnecter" onclick="(async()=>{try{await fetch('./logout.php',{method:'POST'})}catch(e){}window.location.href='./login.html'})()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      Déconnexion
    </button>
  </div>
  <main class="card">
    <h1>Générateur de hash (password_hash)</h1>
    <form method="post" action="">
      <div class="row">
        <input type="password" name="password" placeholder="Mot de passe à hasher" autocomplete="new-password" required>
        <button type="submit">Générer</button>
      </div>
    </form>
    <?php if ($error): ?>
      <div class="status error"><?php echo htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></div>
    <?php elseif ($hash): ?>
      <div class="status ok">Hash généré avec PASSWORD_DEFAULT :</div>
      <div class="row" style="margin-top: 0.5rem;">
        <textarea readonly class="mono" onclick="this.select()"><?php echo htmlspecialchars($hash, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></textarea>
      </div>
      <div class="hint">
        Copiez ce hash dans <span class="mono">admin/.basic_auth.json</span> à la clé <span class="mono">passwordHash</span>.<br>
        Exemple:
        <pre class="mono" style="white-space: pre-wrap; margin-top: 0.25rem;">{
  "username": "admin",
  "passwordHash": "<?php echo htmlspecialchars($hash, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"
}</pre>
      </div>
    <?php endif; ?>
  </main>
</body>
</html>

