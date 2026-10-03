/**
 * API locale si le dossier `api/` est présent, sinon l'API publique. `NARTYA_DEV_API` force
 * une adresse.
 * node scripts/dev.mjs web       interface dans le navigateur
 * node scripts/dev.mjs electron  fenêtre Electron
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { API_URL } from "../src/config/instance.js";

const target = process.argv[2] === "electron" ? "electron" : "web";
const hasLocalApi = existsSync(new URL("../api/src/index.js", import.meta.url));
const local = !process.env.NARTYA_DEV_API && hasLocalApi;

const script = `${target === "electron" ? "electron:dev" : "dev:web"}:${local ? "local" : "public"}`;
const env = { ...process.env };
if (!local) env.NARTYA_DEV_API ||= API_URL;

console.log(`[dev] API ${local ? "locale (api/)" : env.NARTYA_DEV_API}`);
const child = spawn("npm", ["run", script], { stdio: "inherit", shell: true, env });
child.on("exit", (code) => process.exit(code ?? 0));
