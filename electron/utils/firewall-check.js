import { execFile } from "child_process";

const CACHE_MS = 60_000;
let cached = null;

/**
 * `{ blocked, publicNetwork }`, ou `null` hors Windows. Un blocage en entrée ou un réseau
 * « Public » empêche la TV de venir chercher la vidéo.
 */
export function getFirewallStatus() {
  if (process.platform !== "win32") return Promise.resolve(null);
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.value);

  const exe = process.execPath.replace(/'/g, "''");
  const script = [
    `$rules = Get-NetFirewallApplicationFilter -Program '${exe}' -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' }`,
    "$profiles = (Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { $_.NetworkCategory.ToString() })",
    "[pscustomobject]@{ block = @($rules | Where-Object { $_.Action -eq 'Block' } | ForEach-Object { $_.Profile.ToString() }); allow = @($rules | Where-Object { $_.Action -eq 'Allow' } | ForEach-Object { $_.Profile.ToString() }); networks = @($profiles) } | ConvertTo-Json -Compress",
  ].join("; ");

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        let value = null;
        if (!err) {
          try {
            const data = JSON.parse(stdout);
            const networks = [].concat(data.networks || []);
            const block = [].concat(data.block || []).join(",");
            const allow = [].concat(data.allow || []).join(",");
            const covers = (list, category) => list.includes(category) || list.includes("Any");
            value = {
              blocked: networks.some((n) => covers(block, n)),
              publicNetwork: networks.includes("Public"),
              allowedOnNetwork: networks.some((n) => covers(allow, n)),
            };
          } catch {
            value = null;
          }
        }
        cached = { at: Date.now(), value };
        resolve(value);
      }
    );
  });
}
