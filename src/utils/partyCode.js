// Alphabet sans caractères ambigus (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generatePartyCode() {
  let code = "";
  const bytes = new Uint32Array(CODE_LENGTH);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

export function normalizePartyCode(input) {
  return String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

export function isValidPartyCode(input) {
  const c = normalizePartyCode(input);
  return c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch));
}
