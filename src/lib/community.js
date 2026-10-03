import { platform } from "@/platform";
import { DISCORD_INVITE } from "@/config/instance";

export function openDiscord() {
  platform.openExternal(DISCORD_INVITE);
}
