import { supabase } from "@/lib/supabase";
import { getMachineId } from "@/lib/machineId";
import { platform } from "@/platform";

/** Ban, créneau d'appareil et présence en une requête. */

let cachedVersion;
async function getAppVersion() {
  if (cachedVersion !== undefined) return cachedVersion;
  try {
    cachedVersion = (await platform.getVersion()) || null;
  } catch {
    cachedVersion = null;
  }
  return cachedVersion;
}

/**
 * @returns {{ ban: {banned:boolean,kind?:string,reason?:string,until?:string},
 * device: {allowed:boolean, applicable:boolean, limit?:number, tier?:string|null, active?:number} }}
 */
export async function clientHeartbeat() {
  const p_machine_id = await getMachineId();
  const p_platform = platform.os || platform.name;
  const p_version = await getAppVersion();
  const { data, error } = await supabase.rpc("client_heartbeat", {
    p_machine_id,
    p_platform,
    p_version,
    p_app: "nartya-anime",
  });
  if (error) throw error;
  return {
    ban: data?.ban || { banned: false },
    device: data?.device || { allowed: true, applicable: false },
  };
}
