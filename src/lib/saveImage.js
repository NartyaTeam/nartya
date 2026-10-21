import { platform } from "@/platform";

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Enregistre une image sur l'appareil. Dans la WebView Android, un lien `download` ne fait
 * rien : l'image passe par le plugin natif (Images/Nartya). Renvoie `"gallery"` quand elle
 * y est rangée, `"shared"` quand le partage a pris le relais (Android 9 et avant),
 * `"downloaded"` ailleurs.
 */
export async function saveImage(blob, filename) {
  if (platform.os === "android") {
    const { saved } = await platform.saveImage({
      data: await toBase64(blob),
      filename,
      mimeType: blob.type || "image/png",
    });
    return saved ? "gallery" : "shared";
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
