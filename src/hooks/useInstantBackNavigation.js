import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Les pages entrent avec un fondu de 0,6 s (`animate-fade-in`) : sur « Retour », la page d'avant
 * réapparaissait presque transparente et semblait mettre du temps à répondre. Après un retour,
 * `--fade-delay` vaut -1 s : les fondus démarrent à leur état final, sans changer d'animation
 * (en retirer le nom les relancerait depuis zéro, d'où un flash noir). Toute navigation vers
 * l'avant rend aux pages leur fondu.
 */
const SKIP_FADE = "-1s";

// Le premier affichage de l'app est lui aussi de type POP : il garde son fondu.
let first = true;

export function useInstantBackNavigation() {
  const location = useLocation();
  const navType = useNavigationType();

  useLayoutEffect(() => {
    if (first) {
      first = false;
      return;
    }
    const style = document.documentElement.style;
    if (navType === "POP") style.setProperty("--fade-delay", SKIP_FADE);
    else style.removeProperty("--fade-delay");
  }, [location.key, navType]);
}
