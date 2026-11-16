// Pour le ban machine. Null hors coque desktop.
import { platform } from "@/platform";

let cached;

export async function getMachineId() {
  if (cached !== undefined) return cached;
  try {
    cached = (await platform.getMachineId()) || null;
  } catch {
    cached = null;
  }
  return cached;
}
