/** Une régression ici ne se voit qu'en production. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySession,
  shouldKeepSessionOnInitialSignedOut,
  hasFresherSharedToken,
  deriveBanState,
} from "../src/lib/sessionGuards.js";

test("classifySession : aucune session, invité (anonyme), vrai compte", () => {
  assert.equal(classifySession(null), "none");
  assert.equal(classifySession(undefined), "none");
  assert.equal(classifySession({ user: { is_anonymous: true } }), "guest");
  assert.equal(classifySession({ user: { is_anonymous: false } }), "account");
  // `is_anonymous` absent = compte réel.
  assert.equal(classifySession({ user: {} }), "account");
});

test("shouldKeepSessionOnInitialSignedOut : le stockage tranche, pas le réseau", () => {
  // Stockage encore garni : faux négatif hors ligne.
  assert.equal(
    shouldKeepSessionOnInitialSignedOut({ access_token: "tok", user: {} }),
    true,
  );
  assert.equal(shouldKeepSessionOnInitialSignedOut(null), false);
  assert.equal(shouldKeepSessionOnInitialSignedOut(undefined), false);
  assert.equal(shouldKeepSessionOnInitialSignedOut({}), false);
  assert.equal(shouldKeepSessionOnInitialSignedOut({ access_token: "" }), false);
});

test("hasFresherSharedToken : course de refresh SSO app ↔ Hub", () => {
  const stale = "old-token";
  // Le Hub a écrit un token différent.
  assert.equal(hasFresherSharedToken({ access_token: "new-token" }, stale), true);
  // Rien de plus frais : abandonner, pas boucler.
  assert.equal(hasFresherSharedToken({ access_token: stale }, stale), false);
  assert.equal(hasFresherSharedToken(null, stale), false);
  assert.equal(hasFresherSharedToken({}, stale), false);
});

test("deriveBanState : ban compte, ban machine, non banni, réponse vide", () => {
  assert.deepEqual(
    deriveBanState({ banned: true, kind: "account", reason: "spam", until: "2026-09-01T00:00:00Z" }),
    { banned: true, kind: "account", reason: "spam", until: "2026-09-01T00:00:00Z" },
  );
  assert.deepEqual(deriveBanState({ banned: true, kind: "machine" }), {
    banned: true,
    kind: "machine",
    reason: null,
    until: null,
  });
  assert.deepEqual(deriveBanState({ banned: false }), {
    banned: false,
    kind: null,
    reason: null,
    until: null,
  });
  // Réponse absente : jamais banni par défaut.
  assert.deepEqual(deriveBanState(null), { banned: false, kind: null, reason: null, until: null });
  assert.deepEqual(deriveBanState(undefined), {
    banned: false,
    kind: null,
    reason: null,
    until: null,
  });
});
