// Double appui sur « Recherche » dans la barre du bas : la page efface son champ et le focalise.
// La demande peut précéder le montage de la page, d'où l'indicateur en attente.
const EVENT = "nartya:focus-search";
let pending = false;

export function requestSearchFocus() {
  pending = true;
  window.dispatchEvent(new Event(EVENT));
}

/** Vrai une seule fois par demande non encore traitée. */
export function consumeSearchFocus() {
  const was = pending;
  pending = false;
  return was;
}

export function onSearchFocusRequest(handler) {
  const listener = () => {
    if (consumeSearchFocus()) handler();
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
