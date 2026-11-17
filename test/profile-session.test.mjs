import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

const {
  REMEMBER_MS,
  rememberProfile,
  recentProfileId,
  profileToAutoOpen,
  forgetRememberedProfile,
  requestProfilePick,
  takeProfilePickRequest,
} = await import("../src/lib/profileSession.js");

const A = "acc-1";
const main = { id: "p-main", has_pin: false, locked: false };
const kid = { id: "p-kid", has_pin: false, locked: false };
const locked = { id: "p-pin", has_pin: true, locked: false };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("un seul profil s'ouvre directement, sauf s'il est protégé", () => {
  assert.equal(profileToAutoOpen([main], A), main);
  assert.equal(profileToAutoOpen([locked], A), null);
  assert.equal(profileToAutoOpen([{ ...main, locked: true }], A), null);
});

test("le dernier profil est rouvert dans la fenêtre, plus après", () => {
  rememberProfile(A, kid.id);
  const now = Date.now();
  assert.equal(profileToAutoOpen([main, kid], A, now + 60_000), kid);
  assert.equal(profileToAutoOpen([main, kid], A, now + REMEMBER_MS + 1), null);
});

test("rien à rouvrir : autre compte, profil supprimé, profil protégé, oubli", () => {
  rememberProfile(A, kid.id);
  assert.equal(recentProfileId("acc-2"), null);
  assert.equal(profileToAutoOpen([main, locked], A), null);
  rememberProfile(A, locked.id);
  assert.equal(profileToAutoOpen([main, locked], A), null);
  rememberProfile(A, kid.id);
  forgetRememberedProfile();
  assert.equal(profileToAutoOpen([main, kid], A), null);
});

test("« Changer de profil » ne vaut que pour le chargement suivant", () => {
  assert.equal(takeProfilePickRequest(), false);
  requestProfilePick();
  assert.equal(takeProfilePickRequest(), true);
  assert.equal(takeProfilePickRequest(), false);
});
