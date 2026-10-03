/** Décisions pures, testables sans Supabase ni bundler. */

export function classifySession(session) {
  if (!session) return "none";
  return session.user?.is_anonymous ? "guest" : "account";
}

/** Hors ligne, `INITIAL_SESSION, null` peut survenir avec une session encore valide. */
export function shouldKeepSessionOnInitialSignedOut(storedSession) {
  return !!storedSession?.access_token;
}

/** Sinon, la déconnexion est réelle. */
export function hasFresherSharedToken(freshSession, staleAccessToken) {
  return !!freshSession?.access_token && freshSession.access_token !== staleAccessToken;
}

/** On ne bloque jamais sur une inférence. */
export function deriveBanState(payload) {
  return {
    banned: !!payload?.banned,
    kind: payload?.kind || null,
    reason: payload?.reason || null,
    until: payload?.until || null,
  };
}
