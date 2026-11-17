import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THEME_COLORS,
  THEME_VERSION,
  contrastRatio,
  themeToVars,
  validateTheme,
} from "../src/lib/themeFormat.js";

const base = () => ({ v: THEME_VERSION, name: "Nuit", colors: { ...DEFAULT_THEME_COLORS } });

test("la palette d'origine est un thème valide et lisible", () => {
  const r = validateTheme(base());
  assert.equal(r.ok, true);
  assert.equal(r.theme.grain, true);
});

test("les champs inconnus sont écartés", () => {
  const r = validateTheme({ ...base(), css: "body{display:none}", script: "alert(1)" });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.theme).sort(), ["colors", "description", "grain", "name", "v"]);
});

test("une couleur qui n'est pas #rrggbb refuse le thème", () => {
  for (const bad of ["red", "#fff", "url(x)", "#12345g", "rgb(0,0,0)", "#ff713e;}body{x:y", 12]) {
    const t = base();
    t.colors.primary = bad;
    assert.equal(validateTheme(t).ok, false, String(bad));
  }
});

test("une couleur manquante, un nom trop court ou une mauvaise version refusent le thème", () => {
  const missing = base();
  delete missing.colors.muted;
  assert.equal(validateTheme(missing).ok, false);
  assert.equal(validateTheme({ ...base(), name: "x" }).ok, false);
  assert.equal(validateTheme({ ...base(), v: 2 }).ok, false);
  assert.equal(validateTheme(null).ok, false);
  assert.equal(validateTheme([]).ok, false);
});

test("le nom est nettoyé des balises et caractères de contrôle", () => {
  const r = validateTheme({ ...base(), name: "  <b>Mon\u0000  thème</b> " });
  assert.equal(r.ok, true);
  assert.equal(r.theme.name, "bMon thème/b");
});

test("un texte illisible sur le fond est refusé, sauf pour l'éditeur", () => {
  const t = base();
  t.colors.text = "#202020";
  assert.equal(validateTheme(t).ok, false);
  assert.equal(validateTheme(t, { requireReadable: false }).ok, true);
});

test("contraste noir sur blanc = 21", () => {
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01);
});

test("les variables sont au format RGB attendu par Tailwind", () => {
  const vars = themeToVars(validateTheme(base()).theme);
  assert.equal(vars["--primary"], "255 113 62");
  assert.equal(vars["--bg-2"], "27 25 31");
});
