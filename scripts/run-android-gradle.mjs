import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const tasks = process.argv.slice(2);

if (tasks.length === 0 || tasks.some((task) => !/^[A-Za-z][A-Za-z0-9:]*$/.test(task))) {
  console.error("Usage: node scripts/run-android-gradle.mjs <gradle-task> [...]");
  process.exit(2);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = path.join(projectRoot, "android");
const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "bash";
const args = isWindows
  ? ["/d", "/s", "/c", ["gradlew.bat", ...tasks].join(" ")]
  : [path.join(androidRoot, "gradlew"), ...tasks];

const result = spawnSync(command, args, {
  cwd: androidRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Impossible de lancer Gradle Android: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`Gradle Android interrompu par le signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
