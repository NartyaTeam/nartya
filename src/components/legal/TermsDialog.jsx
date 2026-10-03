import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { CONTACT_EMAIL } from "@/config/instance";

/** À mettre à jour en cas de modification. */
const EFFECTIVE_DATE = "16 juin 2026";

const SECTIONS = [
  {
    title: "1. Objet",
    body: "Nartya est une application (ordinateur, Android et iPhone) permettant de parcourir un catalogue d'animes et de mangas, d'en suivre la progression et d'organiser une collection personnelle. En créant un compte ou en utilisant l'application, vous acceptez les présentes conditions d'utilisation.",
  },
  {
    title: "2. Nature du service",
    body: "Nartya n'héberge, ne stocke ni ne diffuse aucun contenu vidéo. L'application agrège des liens et métadonnées provenant de services tiers indépendants. La disponibilité, la qualité et la légalité des contenus relèvent de la seule responsabilité de ces tiers. Nartya peut cesser de fonctionner à tout moment si ces sources évoluent ou deviennent indisponibles.",
  },
  {
    title: "3. Compte utilisateur",
    body: "L'authentification se fait par adresse e-mail et mot de passe, ou via Discord. Un mode visiteur, sans compte, permet aussi d'utiliser une partie du service. Vous êtes responsable de la sécurité de vos identifiants (mot de passe, compte Discord) et des activités effectuées via votre compte. Vous vous engagez à fournir des informations exactes et à ne pas usurper l'identité d'un tiers.",
  },
  {
    title: "4. Utilisation acceptable",
    body: "Vous vous engagez à ne pas détourner l'application, à ne pas tenter d'en contourner les mécanismes de sécurité, à ne pas l'utiliser à des fins illégales et à ne pas perturber son fonctionnement ou celui des services tiers qu'elle interroge. Tout usage abusif peut entraîner la suspension de votre accès.",
  },
  {
    title: "5. Propriété intellectuelle",
    body: "Les animes, marques, visuels et autres contenus restent la propriété de leurs ayants droit respectifs. L'interface, le code et l'identité visuelle de Nartya appartiennent à NartyaTeam et ne peuvent être reproduits sans autorisation.",
  },
  {
    title: "6. Données personnelles",
    body: "Nartya conserve les données strictement nécessaires au service : adresse e-mail ou identifiant Discord selon le mode de connexion, pseudonyme, avatar, profil, favoris, listes et progression de visionnage. Ces données sont hébergées via Supabase et ne sont jamais revendues. Vous pouvez demander la suppression de votre compte et des données associées.",
  },
  {
    title: "7. Disponibilité et garanties",
    body: "L'application est fournie « en l'état », sans garantie de disponibilité, d'exactitude ou d'adéquation à un usage particulier. NartyaTeam ne saurait être tenue responsable des interruptions, pertes de données ou dommages résultant de l'utilisation de l'application ou des contenus tiers.",
  },
  {
    title: "8. Modifications",
    body: "Les présentes conditions peuvent être modifiées à tout moment. La poursuite de l'utilisation de l'application après mise à jour vaut acceptation des nouvelles conditions.",
  },
  {
    title: "9. Contact",
    body: `Pour toute question relative aux présentes conditions, vous pouvez contacter l'équipe à ${CONTACT_EMAIL}.`,
  },
];

export default function TermsDialog({ open, onOpenChange }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95">
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <Dialog.Title className="font-display text-xl font-bold tracking-tight">
                Conditions d'utilisation
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted">
                En vigueur depuis le {EFFECTIVE_DATE}
              </Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-text">
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {SECTIONS.map((s) => (
                <section key={s.title}>
                  <h3 className="mb-1.5 text-sm font-semibold text-text">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{s.body}</p>
                </section>
              ))}
            </div>
          </div>

          <footer className="border-t border-border px-6 py-4 text-right">
            <Dialog.Close className="btn-shu">J'ai compris</Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
