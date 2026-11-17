import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Les pages entrent avec un fondu de 0,6 s (`animate-fade-in`) : sur « Retour », la page d'avant
 * réapparaissait presque transparente et semblait mettre du temps à répondre. Pendant une
 * navigation en arrière, `html[data-nav-pop]` coupe ces fondus (cf. index.css) ; l'attribut
 * retombe juste après, pour que les fenêtres ouvertes ensuite gardent le leur.
 */
const POP_WINDOW_MS = 900;

// Le premier affichage de l'app est lui aussi de type POP : il garde son fondu.
let first = true;
let timer = null;

export function useInstantBackNavigation() {
  const location = useLocation();
  const navType = useNavigationType();

  useLayoutEffect(() => {
    if (first) {
      first = false;
      return;
    }
    if (navType !== "POP") return;
    const root = document.documentElement;
    root.setAttribute("data-nav-pop", "");
    clearTimeout(timer);
    timer = setTimeout(() => root.removeAttribute("data-nav-pop"), POP_WINDOW_MS);
  }, [location.key, navType]);
}
