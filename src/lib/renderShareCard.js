import { SITE_HOST } from "@/config/instance";
import { asset } from "@/lib/asset";

// Une <img> du profil a pu mettre en cache une réponse sans en-têtes CORS : on recharge en
// mode CORS, sinon le canvas devient inexploitable.
async function loadImage(src) {
  if (!src) return null;
  let objectUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const url = new URL(src, document.baseURI);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const response = await fetch(url.href, {
        mode: "cors", credentials: "omit", cache: "reload", signal: controller.signal,
      });
      if (!response.ok) return null;
      objectUrl = URL.createObjectURL(await response.blob());
    }
    return await decodeImage(objectUrl || src, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function decodeImage(src, signal) {
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (value) => {
      signal.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
      resolve(value);
    };
    const abort = () => finish(null);
    if (signal.aborted) return resolve(null);
    signal.addEventListener("abort", abort, { once: true });
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = src;
  });
}
function cover(ctx, image, x, y, width, height, radius = 0) {
  if (!image) return;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(image, x + (width - image.naturalWidth * scale) / 2,
    y + (height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
  ctx.restore();
}
const display = '"Zen Maru Gothic", sans-serif';
const sans = '"Zen Kaku Gothic Antique", sans-serif';
const number = (value) => value == null ? "—" : value.toLocaleString("fr-FR");

export async function renderShareCard(scene) {
  const sources = [scene.banner, scene.avatar, scene.frame, scene.overlay, asset("icon.png"), ...scene.posters];
  const [images] = await Promise.all([
    Promise.all(sources.map(loadImage)),
    Promise.all([document.fonts.load(`900 64px ${display}`), document.fonts.load(`700 32px ${sans}`)]).catch(() => {}),
  ]);
  const [banner, avatar, frame, overlay, logo, ...posters] = images;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const rgb = scene.accent || "239 35 42";
  const accent = `rgb(${rgb})`;
  const tint = (alpha) => `rgb(${rgb} / ${alpha})`;
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, 1080, 1350);
  // Cadrage panoramique : plus haut, le fond coupe les côtés de la bannière.
  const bannerHeight = 460;
  cover(ctx, banner, 0, 0, 1080, bannerHeight);
  if (overlay) cover(ctx, overlay, 0, 0, 1080, bannerHeight);
  const shade = ctx.createLinearGradient(0, 0, 0, bannerHeight);
  shade.addColorStop(0, "rgba(8,9,13,0.45)");
  shade.addColorStop(0.24, "rgba(8,9,13,0)");
  shade.addColorStop(0.64, "rgba(8,9,13,0)");
  shade.addColorStop(0.82, "rgba(8,9,13,0.35)");
  shade.addColorStop(1, "#0b0c10");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 1080, bannerHeight);
  const glow = ctx.createRadialGradient(980, 850, 0, 980, 850, 850);
  glow.addColorStop(0, tint(0.26));
  glow.addColorStop(1, tint(0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, bannerHeight, 1080, 1350 - bannerHeight);
  function text(value, x, y, size, color = "#fff", family = sans, weight = 700, maxWidth = 952) {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    let label = String(value);
    if (ctx.measureText(label).width > maxWidth) {
      const chars = Array.from(label);
      while (chars.length && ctx.measureText(chars.join("") + "…").width > maxWidth) chars.pop();
      label = chars.join("") + "…";
    }
    ctx.fillText(label, x, y);
  }
  if (logo) ctx.drawImage(logo, 64, 57, 42, 42);
  text("N A R T Y A", logo ? 125 : 64, 90, 30, "#fff", display, 900);
  ctx.textAlign = "right";
  text("MON UNIVERS ANIME", 1016, 87, 21, "#ffffffcc");
  ctx.textAlign = "left";
  if (scene.kanji) {
    // Centré sur ses dimensions réelles : la ligne de base seule ignore les jambages.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, bannerHeight);
    ctx.clip();
    ctx.font = `700 190px ${display}`;
    const bounds = ctx.measureText(scene.kanji);
    const centerX = 916;
    const centerY = 252;
    const x = centerX + (bounds.actualBoundingBoxLeft - bounds.actualBoundingBoxRight) / 2;
    const y = centerY + (bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent) / 2;
    // Même filigrane et même fusion que la bannière de ProfilePage.
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = `rgb(255 255 255 / ${banner ? 0.7 : 0.78})`;
    ctx.fillText(scene.kanji, x, y);
    ctx.strokeStyle = "rgb(255 255 255 / 0.1)";
    ctx.lineWidth = 1;
    ctx.strokeText(scene.kanji, x, y);
    ctx.restore();
  }
  // Le paysage s'efface derrière l'identité, pour la lisibilité.
  ctx.fillStyle = "#16171e";
  ctx.beginPath();
  ctx.arc(148, 455, 88, 0, Math.PI * 2);
  ctx.fill();
  cover(ctx, avatar, 64, 371, 168, 168, 84);
  if (!avatar) {
    ctx.textAlign = "center";
    text(Array.from(scene.username.trim())[0]?.toUpperCase() || "?", 148, 480, 72, "#fff", display, 900);
    ctx.textAlign = "left";
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(148, 455, 86, 0, Math.PI * 2);
  ctx.stroke();
  if (frame) {
    const size = 168 * (scene.frameScale || 140) / 100;
    ctx.drawImage(frame, 148 - size / 2, 455 - size / 2, size, size);
  }
  text(scene.username, 270, 455, 58, "#fff", display, 900, 738);
  text(scene.handle ? `@${scene.handle}` : "Passion anime", 273, 502, 29, "#ffffffb3", sans, 700, 735);
  text("DES HISTOIRES, DES ÉMOTIONS.", 64, 622, 23, accent);
  text(number(scene.hours), 58, 760, 126, "#fff", display, 900, 710);
  ctx.font = `900 126px ${display}`;
  const hoursWidth = Math.min(ctx.measureText(number(scene.hours)).width, 710);
  text("heures", 78 + hoursWidth, 756, 35, accent, display, 900, 230);
  text("passées dans d’autres mondes", 64, 810, 29, "#ffffffa6");
  const metrics = [[scene.episodes, "ÉPISODES"], [scene.animes, "ANIMES"]];
  if (scene.rank) metrics.push([scene.rank, "RANG"]);
  metrics.forEach(([value, label], i) => {
    const x = 64 + i * 318;
    ctx.fillStyle = "#ffffff18";
    ctx.fillRect(x, 856, 280, 1);
    text(number(value), x, 920, 47, "#fff", display, 900, 280);
    text(label, x, 955, 19, "#ffffff88");
  });
  if (scene.posters.length) {
    text("DANS MON UNIVERS", 64, 1015, 20, accent);
    posters.forEach((poster, i) => {
      const x = 64 + i * 126;
      ctx.fillStyle = "#ffffff0d";
      ctx.beginPath();
      ctx.roundRect(x, 1040, 110, 160, 9);
      ctx.fill();
      cover(ctx, poster, x, 1040, 110, 160, 9);
    });
  } else {
    text("Le prochain coup de cœur", 64, 1080, 38, "#ffffffbd", display);
    text("n’est jamais très loin.", 64, 1135, 38, "#ffffffbd", display);
  }
  ctx.fillStyle = "#ffffff20";
  ctx.fillRect(64, 1246, 952, 1);
  text("À chaque anime, une nouvelle histoire.", 64, 1296, 23, "#ffffff88");
  ctx.textAlign = "right";
  text(SITE_HOST, 1016, 1296, 27, "#fff");
  return { canvas, missingImages: sources.filter((src, i) => src && !images[i]).length };
}
