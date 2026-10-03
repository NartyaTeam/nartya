/**
 * Retour OAuth en loopback (RFC 8252) : `nartya://` est peu fiable sur Linux et ChromeOS. Les
 * ports candidats doivent être autorisés côté Supabase (Redirect URLs).
 */

import http from "http";

// À autoriser dans Supabase : http://127.0.0.1:<port>/auth-callback
const CANDIDATE_PORTS = [8351, 8352, 8353];
const CALLBACK_PATH = "/auth-callback";
const HOST = "127.0.0.1";

const SUCCESS_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nartya — Connexion réussie</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       background:#0b0b0f;color:#f5f5f7}
  .card{text-align:center;max-width:420px;padding:40px 28px}
  .check{width:64px;height:64px;border-radius:50%;background:#5865F2;
         display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
  .check svg{width:34px;height:34px;stroke:#fff;stroke-width:3;fill:none}
  h1{font-size:20px;margin:0 0 10px}
  p{font-size:14px;color:#a1a1aa;margin:0;line-height:1.5}
</style>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <h1>Connexion réussie</h1>
    <p>Vous pouvez fermer cet onglet et revenir à l'application Nartya.</p>
  </div>
  <script>setTimeout(function(){ try { window.close(); } catch (e) {} }, 800);</script>
</body>
</html>`;

function decodeOAuthError(value) {
  if (!value) return "";
  const withSpaces = String(value).replace(/\+/g, " ");
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

function oauthErrorCopy(searchParams) {
  const raw = decodeOAuthError(
    searchParams.get("error_description") || searchParams.get("error_code") || searchParams.get("error")
  );
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("identity is already linked to another user") ||
    normalized.includes("identity_already_exists")
  ) {
    return {
      title: "Ce compte Discord est déjà utilisé",
      message:
        "Il est déjà lié à un autre compte Nartya. Connectez-vous à ce compte ou choisissez un autre compte Discord.",
    };
  }
  if (normalized.includes("access_denied")) {
    return {
      title: "Autorisation annulée",
      message: "Aucune modification n'a été apportée à votre compte Nartya.",
    };
  }
  return {
    title: "Échec de la connexion",
    message: "Refermez cet onglet et réessayez depuis l'application Nartya.",
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function errorHtml(searchParams) {
  const copy = oauthErrorCopy(searchParams);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nartya — ${escapeHtml(copy.title)}</title>
<style>
html,body{height:100%;margin:0}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
background:#0b0b0f;color:#f5f5f7;display:flex;align-items:center;justify-content:center;text-align:center}
.card{max-width:460px;padding:40px 28px}.mark{width:64px;height:64px;border-radius:8px;background:#ff4a2d1a;
border:1px solid #ff4a2d55;color:#ff7259;display:flex;align-items:center;justify-content:center;
margin:0 auto 24px;font-size:34px;font-weight:300}h1{font-size:21px;margin:0 0 10px}
p{font-size:14px;color:#a1a1aa;margin:0;line-height:1.6}
</style></head><body><main class="card"><div class="mark">!</div>
<h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.message)}</p></main></body></html>`;
}

class AuthCallbackServer {
  constructor() {
    /** @type {http.Server|null} */
    this.server = null;
    /** @type {number|null} */
    this.port = null;
    /** @type {((url: string) => void)|null} */
    this.onCallback = null;
  }

  /** @returns {Promise<number|null>} le port retenu, ou null */
  async start(onCallback) {
    this.onCallback = onCallback;
    for (const port of CANDIDATE_PORTS) {
      try {
        await this._listen(port);
        this.port = port;
        console.log(`[AuthCallback] serveur OAuth loopback démarré sur ${HOST}:${port}`);
        return port;
      } catch (e) {
        if (e && e.code === "EADDRINUSE") continue;
        console.error("[AuthCallback] erreur démarrage:", e);
        return null;
      }
    }
    console.error(
      `[AuthCallback] aucun port loopback disponible parmi ${CANDIDATE_PORTS.join(", ")}`
    );
    return null;
  }

  _listen(port) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this._handle(req, res));
      const onError = (err) => reject(err);
      server.once("error", onError);
      server.listen(port, HOST, () => {
        server.removeListener("error", onError);
        this.server = server;
        resolve();
      });
    });
  }

  _handle(req, res) {
    let parsed;
    try {
      parsed = new URL(req.url, `http://${HOST}:${this.port}`);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
      return;
    }

    if (parsed.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const hasCode = parsed.searchParams.has("code");
    const fullUrl = `http://${HOST}:${this.port}${req.url}`;

    // Même canal IPC que le deep-link.
    try {
      this.onCallback?.(fullUrl);
    } catch (e) {
      console.error("[AuthCallback] onCallback a échoué:", e);
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(hasCode ? SUCCESS_HTML : errorHtml(parsed.searchParams));
  }

  /** @returns {string|null} null si le serveur n'est pas démarré */
  getRedirectUrl() {
    if (!this.port) return null;
    return `http://${HOST}:${this.port}${CALLBACK_PATH}`;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = null;
    }
  }
}

const authCallbackServer = new AuthCallbackServer();
export default authCallbackServer;
