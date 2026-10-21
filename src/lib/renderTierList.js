import { SITE_HOST } from "@/config/instance";
import { asset } from "@/lib/asset";
import { loadImage } from "@/lib/renderShareCard";
import { readableTextColor } from "@/lib/tierLists";

const display = '"Zen Maru Gothic", sans-serif';
const sans = '"Zen Kaku Gothic Antique", sans-serif';

const WIDTH = 1200;
const LABEL_W = 170;
const CELL_W = 102;
const CELL_H = 144;
const GAP = 2;
const HEADER_H = 120;
const FOOTER_H = 64;
const PER_ROW = Math.floor((WIDTH - LABEL_W) / (CELL_W + GAP));

function cover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(image, x + (width - image.naturalWidth * scale) / 2,
    y + (height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
  ctx.restore();
}

function fit(ctx, value, maxWidth) {
  let label = String(value || "");
  if (ctx.measureText(label).width <= maxWidth) return label;
  const chars = Array.from(label);
  while (chars.length && ctx.measureText(chars.join("") + "…").width > maxWidth) chars.pop();
  return chars.join("") + "…";
}

/** Libellé de rangée sur plusieurs lignes, centré dans sa case. */
function wrapLines(ctx, value, maxWidth, maxLines) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = fit(ctx, `${lines[maxLines - 1]}…`, maxWidth);
  }
  return lines.map((l) => fit(ctx, l, maxWidth));
}

/** Image PNG de la tier list, façon TierMaker, avec une affiche + son nom par anime. */
export async function renderTierList({ title, authorName, tiers }) {
  const rows = tiers.map((t) => Math.max(1, Math.ceil((t.items?.length || 0) / PER_ROW)));
  const height = HEADER_H + rows.reduce((sum, n) => sum + n * (CELL_H + GAP), 0) + FOOTER_H;
  const allItems = tiers.flatMap((t) => t.items || []);
  const [logo, ...images] = await Promise.all([
    loadImage(asset("icon.png")),
    ...allItems.map((it) => loadImage(it.cover)),
    document.fonts.load(`900 40px ${display}`).catch(() => {}),
  ]);
  const imageBySlug = new Map(allItems.map((it, i) => [it.slug, images[i]]));

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, WIDTH, height);

  if (logo) ctx.drawImage(logo, 32, 30, 36, 36);
  ctx.font = `900 34px ${display}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(fit(ctx, title, WIDTH - 140), logo ? 80 : 32, 62);
  ctx.font = `700 20px ${sans}`;
  ctx.fillStyle = "#ffffffaa";
  if (authorName) ctx.fillText(fit(ctx, `par ${authorName}`, WIDTH - 64), 32, 98);

  let y = HEADER_H;
  tiers.forEach((tier, index) => {
    const rowH = rows[index] * (CELL_H + GAP) - GAP;
    ctx.fillStyle = tier.color;
    ctx.fillRect(0, y, LABEL_W, rowH);
    ctx.fillStyle = "#1a1b22";
    ctx.fillRect(LABEL_W, y, WIDTH - LABEL_W, rowH);

    ctx.font = `700 22px ${sans}`;
    ctx.fillStyle = readableTextColor(tier.color);
    ctx.textAlign = "center";
    const lines = wrapLines(ctx, tier.label, LABEL_W - 20, Math.max(2, Math.floor(rowH / 28)));
    lines.forEach((line, i) => ctx.fillText(line, LABEL_W / 2, y + rowH / 2 + (i - (lines.length - 1) / 2) * 27 + 8));
    ctx.textAlign = "left";

    (tier.items || []).forEach((item, i) => {
      const cx = LABEL_W + GAP + (i % PER_ROW) * (CELL_W + GAP);
      const cy = y + Math.floor(i / PER_ROW) * (CELL_H + GAP);
      const image = imageBySlug.get(item.slug);
      if (image) cover(ctx, image, cx, cy, CELL_W, CELL_H);
      else {
        ctx.fillStyle = "#2a2b33";
        ctx.fillRect(cx, cy, CELL_W, CELL_H);
      }
      const shade = ctx.createLinearGradient(0, cy + CELL_H - 44, 0, cy + CELL_H);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.fillStyle = shade;
      ctx.fillRect(cx, cy + CELL_H - 44, CELL_W, 44);
      ctx.font = `700 13px ${sans}`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(fit(ctx, item.title, CELL_W - 8), cx + CELL_W / 2, cy + CELL_H - 8);
      ctx.textAlign = "left";
    });
    y += rowH + GAP;
  });

  ctx.font = `700 20px ${sans}`;
  ctx.fillStyle = "#ffffffcc";
  ctx.textAlign = "right";
  ctx.fillText(`Fait sur ${SITE_HOST}`, WIDTH - 32, height - 24);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export impossible"))), "image/png")
  );
}
