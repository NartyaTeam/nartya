/**
 * Une page d'accueil porte plus de cent squelettes dont les images, chargées à la demande, sont
 * hors écran : leur animation tournait en continu et occupait le thread principal en entier
 * (mesuré à ~95 % au repos), ce qui bloquait le scroll plusieurs secondes. Seuls les squelettes
 * à l'écran s'animent.
 */

const IDLE_CLASS = "skeleton-idle";

export function installSkeletonVisibility() {
  if (typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle(IDLE_CLASS, !entry.isIntersecting);
    },
    { rootMargin: "200px" }
  );

  const watch = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(".skeleton")) observer.observe(node);
    node.querySelectorAll(".skeleton").forEach((el) => observer.observe(el));
  };

  new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(watch);
  }).observe(document.body, { childList: true, subtree: true });

  watch(document.body);
}
