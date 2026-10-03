import { app } from "electron";
import os from "os";
import crypto from "crypto";

// Indépendant de l'IP et du compte.
let machineIdCache;
function computeMachineId() {
  const macs = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.mac && ni.mac !== "00:00:00:00:00:00" && !ni.internal) macs.push(ni.mac);
    }
  }
  macs.sort();
  const parts = [os.hostname(), os.platform(), os.arch(), macs[0] || "no-mac"];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export function registerSystemIpc(secureIpc, { hardwareAccelerationDisabled }) {
  // Sans exposer le rapport GPU complet.
  secureIpc.handle("system:anime4k-capabilities", async () => {
    let gpuInfo = null;
    try {
      gpuInfo = await app.getGPUInfo("complete");
    } catch (_) {}

    const devices = Array.isArray(gpuInfo?.gpuDevice)
      ? gpuInfo.gpuDevice.map((device) => ({
          active: device.active === true,
          deviceString: device.deviceString || "",
          vendorId: device.vendorId ?? null,
          deviceId: device.deviceId ?? null,
          driverVendor: device.driverVendor || "",
          driverVersion: device.driverVersion || "",
        }))
      : [];

    return {
      platform: process.platform,
      arch: process.arch,
      memoryBytes: os.totalmem(),
      cpuCores: os.cpus()?.length || 0,
      hardwareAccelerationDisabled,
      featureStatus: app.getGPUFeatureStatus(),
      renderer: gpuInfo?.auxAttributes?.glRenderer || "",
      devices,
    };
  });

  secureIpc.handle("get-machine-id", () => {
    if (!machineIdCache) machineIdCache = computeMachineId();
    return machineIdCache;
  });
}
