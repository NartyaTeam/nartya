import { supabase } from "@/lib/supabase";
import { getMachineId } from "@/lib/machineId";

/**
 * Appelable sans session.
 * @returns {{ banned: boolean, kind?: 'account'|'machine', reason?: string|null, until?: string|null }}
 */
export async function checkBan() {
  const machineId = await getMachineId();
  const { data, error } = await supabase.rpc("check_ban", { p_machine_id: machineId });
  if (error) throw error;
  return data || { banned: false };
}
