import { useNavigate } from "react-router-dom";
import {
  Lock,
  Heart,
  Download,
  Clapperboard,
  ListChecks,
  User,
  Settings,
  Headphones,
  Users,
} from "lucide-react";

/** Clé passée par `ProtectedRoute` (prop `feature`). */
const FEATURES = {
  party: {
    icon: Clapperboard,
    title: "Watch Party",
    pitch:
      "Grâce à la Watch Party, regarde tes animes en parfaite synchro avec tes amis, où que vous soyez.",
    perks: ["Lecture synchronisée en temps réel", "Chat & réactions en direct", "File d'attente partagée"],
  },
  downloads: {
    icon: Download,
    title: "Téléchargements",
    pitch:
      "Télécharge tes épisodes pour les regarder hors ligne — dans le train, l'avion ou sans connexion.",
    perks: ["Visionnage 100 % hors ligne", "Téléchargement d'une saison entière", "Choix de la qualité"],
  },
  favorites: {
    icon: Heart,
    title: "Favoris",
    pitch:
      "Ajoute tes animes en favori pour les retrouver en un clin d'œil et bâtir ta collection.",
    perks: ["Ta collection à portée de main", "Reprise de la progression", "Mise en avant sur ton profil"],
  },
  lists: {
    icon: ListChecks,
    title: "Mes listes",
    pitch:
      "Organise tes animes en listes — En cours, À voir, Terminé — et suis ta progression saison après saison.",
    perks: ["Statuts personnalisés", "Suivi automatique du visionnage", "Historique conservé"],
  },
  profile: {
    icon: User,
    title: "Ton profil",
    pitch:
      "Crée ton profil public : avatar, bannière, statistiques de visionnage et vitrine de tes préférés.",
    perks: ["Page publique /u/ton-pseudo", "Statistiques de visionnage", "Vitrine de favoris & activité"],
  },
  settings: {
    icon: Settings,
    title: "Paramètres",
    pitch:
      "Personnalise ton expérience : langue et source par défaut, qualité, lecture automatique et plus.",
    perks: ["Langue & source par défaut", "Qualité de téléchargement", "Réglages du lecteur"],
  },
  friends: {
    icon: Users,
    title: "Communauté",
    pitch:
      "Ajoute tes amis, retrouve-les par leur pseudo et découvre leurs profils et ce qu'ils regardent.",
    perks: ["Ajout d'amis par @pseudo", "Demandes d'amis & acceptation", "Accès aux profils de tes amis"],
  },
  reports: {
    icon: Headphones,
    title: "Signalements",
    pitch:
      "Signale un souci et suis son traitement : l’équipe peut te répondre directement, sans passer par Discord.",
    perks: ["Suivi de chaque signalement", "Dossier technique joint automatiquement", "Réponses Staff et Admin identifiées"],
  },
};

const FALLBACK = {
  icon: Lock,
  title: "Réservé aux comptes",
  pitch: "Crée un compte gratuit pour débloquer toutes les fonctionnalités de Nartya.",
  perks: ["Favoris & progression", "Listes & téléchargements", "Watch party & profil"],
};

export default function GuestGate({ feature }) {
  const navigate = useNavigate();
  const cfg = FEATURES[feature] || FALLBACK;
  const Icon = cfg.icon;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md animate-slide-up rounded-lg bg-surface/70 p-8 text-center shadow-card ring-1 ring-border backdrop-blur-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
          <Icon size={24} />
        </div>

        <p className="text-[0.7rem] font-medium uppercase tracking-kana text-muted/70">
          Réservé aux comptes
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold">{cfg.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{cfg.pitch}</p>

        <ul className="mx-auto mt-6 flex max-w-xs flex-col gap-2.5 text-left">
          {cfg.perks.map((label) => (
            <li key={label} className="flex items-center gap-3 text-sm text-text/85">
              <Icon size={16} className="shrink-0 text-primary" />
              {label}
            </li>
          ))}
        </ul>

        <button
          onClick={() => navigate("/login")}
          className="mt-7 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Créer un compte / Se connecter
        </button>
        <button
          onClick={() => navigate("/")}
          className="mt-3 w-full text-sm font-medium text-muted transition-colors hover:text-text"
        >
          Continuer à regarder
        </button>
      </div>
    </div>
  );
}
