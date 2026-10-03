import { safeUpdateUrl } from "@/lib/appUpdate";
import { platform } from "@/platform";

/** Android télécharge, contrôle et installe l'APK ; ailleurs, téléchargement externe. */
export async function installAppUpdate({ downloadUrl, sha256 } = {}) {
  const url = safeUpdateUrl(downloadUrl);
  if (platform.name === "capacitor-android" && typeof platform.installUpdate === "function") {
    const result = await platform.installUpdate({ url, sha256: sha256 || "" });
    if (!result?.started && !result?.permissionRequired) {
      throw new Error(result?.error || "Impossible de préparer la mise à jour");
    }
    return result;
  }

  await Promise.resolve(platform.openExternal(url));
  return { opened: true };
}
