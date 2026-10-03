export function translateAuthError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("pwned"))
    return "Ce mot de passe apparaît dans des fuites de données connues. Choisis-en un autre.";
  if (m.includes("captcha")) return "Vérification anti-robot échouée. Réessaie.";
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("already registered") || m.includes("already exists") || m.includes("already been registered"))
    return "Un compte existe déjà avec cet email.";
  if (m.includes("email not confirmed")) return "Confirme d'abord ton email (lien reçu par mail).";
  if (m.includes("weak password") || m.includes("at least 6") || m.includes("password should"))
    return "Mot de passe trop court (6 caractères minimum).";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Trop de tentatives. Réessaie dans un instant.";
  if (m.includes("network") || m.includes("fetch")) return "Pas de connexion. Vérifie ton réseau.";
  return "Une erreur est survenue. Réessaie.";
}
