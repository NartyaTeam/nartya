/**
 * Windows ne rend pas les drapeaux unicode. En chaînes, pour servir aussi aux contrôles
 * ArtPlayer. Le drapeau suit l'audio : VF → France, VA → anglais, VO/VOSTFR → pays d'origine.
 */

// Pour le drapeau chinois.
const STAR =
  "M0,-1 0.2245,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.2245,-0.309Z";

const star = (x, y, s, rot = 0) =>
  `<path d="${STAR}" fill="#FFDE00" transform="translate(${x} ${y}) scale(${s}) rotate(${rot})"/>`;

const trigram = (x, y, rot, gapTop) => {
  const rows = gapTop
    ? [-1.25, -0.25, 0.75]
    : [-0.25, 0.75, 1.75];
  const bars = rows.map((ry) => `<rect x="-1.4" y="${ry}" width="2.8" height="0.5"/>`).join("");
  return `<g fill="#000" transform="translate(${x} ${y}) rotate(${rot})">${bars}</g>`;
};

const FLAGS = {
  FR:
    '<rect width="24" height="16" fill="#fff"/><rect width="8" height="16" fill="#0055A4"/><rect x="16" width="8" height="16" fill="#EF4135"/>',
  EN:
    '<rect width="24" height="16" fill="#fff"/><rect x="10" width="4" height="16" fill="#CE1124"/><rect y="6" width="24" height="4" fill="#CE1124"/>',
  JP:
    '<rect width="24" height="16" fill="#fff"/><circle cx="12" cy="8" r="4.6" fill="#BC002D"/>',
  CN:
    '<rect width="24" height="16" fill="#DE2910"/>' +
    star(4.6, 4.6, 3) +
    star(8.4, 1.7, 1, 20) +
    star(10, 3.4, 1, -5) +
    star(10, 5.8, 1, 10) +
    star(8.4, 7.4, 1, 25),
  KR:
    '<rect width="24" height="16" fill="#fff"/>' +
    '<circle cx="12" cy="8" r="4" fill="#003478"/>' +
    '<path d="M12 4 A4 4 0 0 1 12 12 A2 2 0 0 1 12 8 A2 2 0 0 0 12 4 Z" fill="#C60C30"/>' +
    trigram(5, 3.6, 33, false) +
    trigram(19, 3.6, -33, false) +
    trigram(5, 12.4, -33, true) +
    trigram(19, 12.4, 33, true),
  TW:
    '<rect width="24" height="16" fill="#FE0000"/><rect width="12" height="8" fill="#000095"/>' +
    '<circle cx="6" cy="4" r="2.6" fill="#fff"/><circle cx="6" cy="4" r="2" fill="#000095"/><circle cx="6" cy="4" r="0.9" fill="#fff"/>',
};

const LABELS = {
  vf: "VF",
  vostfr: "VOSTFR",
  va: "VA",
  vo: "VO",
  vastfr: "VASTFR",
  vj: "VJ",
  vkr: "VKR",
  vcn: "VCN",
  vqc: "VQC",
};

const COUNTRY_TO_CODE = { JP: "JP", CN: "CN", KR: "KR", TW: "TW" };

// « vf1 », « vf2 » : ramenés au code de base.
const langBase = (lang) => (lang || "").toLowerCase().replace(/\d+$/, "");

function getFlagCode(lang, countryOfOrigin) {
  const l = langBase(lang);
  if (l === "vf" || l === "vqc") return "FR"; // France / Québec
  if (l === "va" || l === "vastfr") return "EN";
  if (l === "vj") return "JP";
  if (l === "vkr") return "KR";
  if (l === "vcn") return "CN";
  // Japon par défaut.
  return COUNTRY_TO_CODE[countryOfOrigin] || "JP";
}

export function getLanguageLabel(lang) {
  const l = (lang || "").toLowerCase();
  if (LABELS[l]) return LABELS[l];
  // « vf1 » → « VF 1 »
  const m = l.match(/^([a-z]+)(\d+)$/);
  if (m && LABELS[m[1]]) return `${LABELS[m[1]]} ${m[2]}`;
  return (lang || "").toUpperCase();
}

/** Dimensions en `em` : le drapeau suit la police, qui grandit en plein écran. */
export function getFlagSvg(lang, countryOfOrigin) {
  const code = getFlagCode(lang, countryOfOrigin);
  return (
    `<span class="nartya-flag" style="display:inline-block;width:1.5em;height:1em;line-height:0;border-radius:0.2em;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.2)">` +
    `<svg viewBox="0 0 24 16" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">${FLAGS[code] || FLAGS.JP}</svg>` +
    `</span>`
  );
}

/** `size` = hauteur en px. */
export function Flag({ lang, countryOfOrigin, size = 14, className = "", title }) {
  const code = getFlagCode(lang, countryOfOrigin);
  const w = Math.round((size * 3) / 2);
  return (
    <span
      title={title}
      className={`inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/20 ${className}`}
      style={{ width: w, height: size, lineHeight: 0 }}
    >
      <svg
        viewBox="0 0 24 16"
        width={w}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        className="block"
        dangerouslySetInnerHTML={{ __html: FLAGS[code] || FLAGS.JP }}
      />
    </span>
  );
}
