/**
 * App de bureau en production : pas de menu contextuel du navigateur (Retour, Enregistrer sous,
 * Inspecter…) ni de raccourcis d'inspection. Les champs de saisie gardent leur menu
 * (copier, coller). En dev, rien n'est bloqué.
 */
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

const isInspectShortcut = (event) => {
  const key = event.key.toLowerCase();
  if (event.key === "F12") return true;
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && ["i", "j", "c"].includes(key)) return true;
  // Cmd+Option+I / J / C sur macOS.
  if (event.metaKey && event.altKey && ["i", "j", "c"].includes(key)) return true;
  return (event.ctrlKey || event.metaKey) && key === "u";
};

export function installDesktopLockdown() {
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
      event.preventDefault();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (isInspectShortcut(event)) event.preventDefault();
    },
    true,
  );
}
