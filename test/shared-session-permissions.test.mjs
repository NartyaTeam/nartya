/**
 * Refresh token en clair : 0600, dossier 0700, y compris sur une installation existante.
 * Les ACL Windows ne sont pas testées ici.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initSharedSession, registerSessionIpc } from "../electron/utils/shared-session.js";

const mode = (p) => fs.statSync(p).mode & 0o777;

test("session.json est créé en 0600 dans un dossier 0700", { skip: process.platform === "win32" }, async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "nartya-shared-"));
  const sharedDir = path.join(appData, "Nartya", "shared");
  // Installation antérieure : lisible par tous.
  fs.mkdirSync(sharedDir, { recursive: true, mode: 0o755 });
  fs.chmodSync(sharedDir, 0o755);
  fs.writeFileSync(path.join(sharedDir, "session.json"), "{}", { mode: 0o644 });

  const file = initSharedSession({ getPath: () => appData });
  assert.equal(mode(sharedDir), 0o700);
  assert.equal(mode(file), 0o600);

  const handlers = {};
  registerSessionIpc({ handle: (channel, fn) => (handlers[channel] = fn) });
  assert.equal(await handlers["session:set"]({}, "nartya-auth", '{"access_token":"x"}'), true);
  assert.equal(mode(file), 0o600);
  assert.equal(await handlers["session:get"]({}, "nartya-auth"), '{"access_token":"x"}');
});
