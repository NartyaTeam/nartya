/** Message court pour le renderer ; le détail reste dans les logs. */
export function friendlyErrorMessage(err) {
  if (!err) return "Erreur inconnue";
  if (err.name === "AbortError") return "Téléchargement annulé";

  const code = err.code || err.cause?.code;
  const msg = String(err.message || err);

  if (/stall|bloqu(é|e)/i.test(msg)) return "Connexion trop lente ou interrompue, réessaie";
  if (code === "ETIMEDOUT" || /timeout|d[ée]lai d[ée]pass[ée]|timed? ?out/i.test(msg))
    return "Le serveur ne répond pas, réessaie plus tard";
  if (code === "ECONNRESET" || /ECONNRESET|socket hang up/i.test(msg))
    return "Connexion interrompue, réessaie";
  if (code === "ECONNREFUSED") return "Serveur injoignable";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Hébergeur introuvable";
  if (/URL bloqu[ée]e \(SSRF\)/i.test(msg)) return "Lien de téléchargement invalide";
  if (/Range non honor/i.test(msg)) return "Hébergeur incompatible avec ce mode de téléchargement";
  if (code === "ENOSPC" || /ENOSPC/i.test(msg)) return "Espace disque insuffisant";
  if (code === "EACCES" || code === "EPERM" || /EACCES|EPERM/i.test(msg))
    return "Accès refusé au dossier de téléchargement";

  const httpMatch = msg.match(/^HTTP (\d+)/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    if (status === 401 || status === 403) return "Accès refusé par l'hébergeur";
    if (status === 404) return "Fichier introuvable sur l'hébergeur";
    if (status === 429) return "Trop de requêtes, réessaie dans un instant";
    if (status >= 500) return "Hébergeur indisponible";
    return "Erreur de l'hébergeur";
  }

  return "Échec du téléchargement";
}
