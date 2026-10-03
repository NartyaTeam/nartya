import { supabase } from "@/lib/supabase";
import { getMachineId } from "@/lib/machineId";

export async function releaseDeviceSlot() {
  try {
    const p_machine_id = await getMachineId();
    if (!p_machine_id) return;
    await supabase.rpc("release_device_slot", { p_machine_id });
  } catch {
    // Le créneau expirera tout seul.
  }
}
