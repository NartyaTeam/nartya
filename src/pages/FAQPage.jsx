import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  HelpCircle,
  ChevronDown,
  Search,
  UserCircle,
  Play,
  Download,
  Clapperboard,
  ListChecks,
  BookOpen,
  ShieldCheck,
  Activity,
} from "lucide-react";

import { DISCORD_INVITE, CONTACT_EMAIL } from "@/config/instance";

/** Catégories → { q, a }. Une réponse peut tenir sur plusieurs paragraphes (séparés par \n). */
// Compte et connexion
const CAT_COMPTE = {
  id: "compte",
  label: "Compte & connexion",
  icon: UserCircle,
  items: [
    {
      q: "Comment créer un compte ou me connecter ?",
      a: "Deux possibilités : une adresse e-mail avec un mot de passe, ou ton compte Discord. Les deux donnent accès exactement aux mêmes fonctionnalités.\nAvec l'e-mail, un lien de confirmation t'est envoyé à l'inscription : clique dessus, puis connecte-toi. Pense à regarder dans tes spams si tu ne le vois pas.",
    },
    {
      q: "Sur ordinateur, l'app me renvoie vers le Hub pour me connecter. Pourquoi ?",
      a: "Sur Windows, macOS et Linux, la connexion se fait depuis le Nartya Hub : tu te connectes une fois dans le Hub, et toutes tes apps Nartya suivent. Te déconnecter depuis l'app te déconnecte aussi du Hub.\nSi le Hub n'est pas installé, l'app te propose de le télécharger. Sur Android et iPhone, la connexion se fait directement dans l'app.",
    },
    {
      q: "Je peux utiliser Nartya sans compte ?",
      a: "Oui, avec le mode visiteur (« Continuer en visiteur » sur l'écran de connexion, ou depuis le Hub sur ordinateur) : tu peux parcourir le catalogue et regarder des épisodes.\nEn revanche, rien n'est enregistré : pas de favoris, de listes, de progression ni de succès. Les téléchargements, la Watch Party, le profil, les amis et les signalements demandent aussi un compte.",
    },
    {
      q: "J'ai un compte e-mail. Je peux aussi me connecter avec Discord ?",
      a: "Oui. Sur Android et iPhone, va dans Paramètres → Compte → Comptes liés et lie ton Discord ; sur ordinateur, ça se fait depuis le Hub. Tu gardes le même compte et toute ta progression, et tu peux ensuite te connecter avec l'un ou l'autre.\nUne fois Discord lié, tu peux aussi importer ton avatar et ta bannière Discord sur ton profil Nartya.",
    },
    {
      q: "Est-ce que Nartya voit mon mot de passe Discord ?",
      a: "Non, jamais. La connexion Discord passe par le système officiel de Discord : tu t'identifies directement chez eux, et Nartya ne reçoit en retour que ton pseudo, ton avatar et ton identifiant.",
    },
    {
      q: "J'ai oublié mon mot de passe ou je n'arrive plus à me connecter.",
      a: `Si ton compte utilise Discord, reconnecte-toi simplement avec Discord. Pour un compte e-mail, vérifie d'abord que tu as bien confirmé ton adresse avec le lien reçu à l'inscription.\nSi ça bloque toujours, passe par le Discord ou écris-nous à ${CONTACT_EMAIL} : on t'aidera à récupérer ton compte.`,
    },
    {
      q: "Comment supprimer mon compte et mes données ?",
      a: `Écris-nous à ${CONTACT_EMAIL} (ou passe par le Discord). On supprime ton compte et les données associées (favoris, listes, progression, profil…).\nAvant ça, tu peux garder une copie de tes favoris, listes et progression : Paramètres → Sauvegarde → Exporter mes données.`,
    },
  ],
};

// Regarder et collectionner
const ANIME_WATCH = {
  id: "regarder",
  label: "Regarder des animes",
  icon: Play,
  items: [
    {
      q: "Sur quels appareils Nartya est disponible ?",
      a: "Sur ordinateur (Windows, macOS 13 ou plus récent, Linux), sur Android et sur iPhone. C'est le même compte partout : favoris, listes et progression te suivent d'un appareil à l'autre.\nTout se télécharge depuis nartya.app.",
    },
    {
      q: "D'où viennent les vidéos ? Est-ce que Nartya héberge les animes ?",
      a: "Non, Nartya n'héberge aucune vidéo. L'application va chercher les épisodes chez des lecteurs vidéo tiers indépendants, appelés « sources ».\nLa liste des sources change régulièrement, au gré des mises en ligne : l'app utilise automatiquement celles qui sont disponibles pour l'épisode que tu lances.",
    },
    {
      q: "Un épisode ne démarre pas ou reste bloqué en chargement. Que faire ?",
      a: "C'est presque toujours la source vidéo qui est momentanément indisponible, pas l'app. Nartya passe alors tout seul à une autre source, au chargement comme en pleine lecture, en reprenant là où tu en étais. Le message d'erreur n'apparaît que si toutes les sources de l'épisode ont échoué.\nPour choisir une source toi-même : Paramètres → Lecture → Source prioritaire, ou active « Contrôles avancés du lecteur » pour la changer directement depuis le lecteur.\nTu peux aussi vérifier l'état du service (lien en bas de cette page) ou ouvrir un signalement.",
    },
    {
      q: "La vidéo se met en pause toutes les quelques secondes pour charger.",
      a: "La source n'envoie pas la vidéo assez vite pour la qualité demandée. Nartya baisse alors la qualité tout seul, et change de source si ça ne suffit pas.\nLe réglage « Qualité de lecture » est un maximum, pas une qualité imposée. Si les coupures continuent, baisse-le dans Paramètres → Lecture.",
    },
    {
      q: "Pourquoi certains animes n'ont pas de VF (ou pas de VOSTFR) ?",
      a: "Les langues disponibles dépendent de ce que proposent les sources : si une langue n'apparaît pas pour un épisode, c'est qu'aucune source ne la propose pour l'instant. Tu peux choisir ta langue préférée dans Paramètres → Lecture → Langue par défaut.",
    },
    {
      q: "Comment sauter les génériques d'ouverture et de fin ?",
      a: "Pendant un générique, un bouton apparaît pour le passer en un clic. Pour qu'il soit sauté tout seul, active « Autoskip intro / ending » dans Paramètres → Lecture.",
    },
    {
      q: "L'épisode suivant s'enchaîne tout seul (ou pas). Comment régler ça ?",
      a: "C'est la « Lecture automatique », dans Paramètres → Lecture. Quand elle est active, un compte à rebours, que tu peux annuler, s'affiche à la fin de l'épisode avant de passer au suivant.",
    },
    {
      q: "Le son est vraiment faible sur certains épisodes.",
      a: "Certaines sources ont un son bas à l'origine. Le lecteur intègre un boost audio qui permet de monter le volume au-delà de 100 %.",
    },
    {
      q: "Je peux regarder sur ma télé ?",
      a: "Oui : depuis le lecteur, tu peux envoyer l'épisode vers ta télé, puis piloter la lecture avec la télécommande.",
    },
    {
      q: "Je ne veux pas me faire spoiler par les vignettes des épisodes.",
      a: "Active le mode anti-spoiler depuis la liste des épisodes d'un anime : les vignettes des épisodes que tu n'as pas encore vus sont floutées.",
    },
    {
      q: "Les fiches des animes sont lentes à s'ouvrir chez moi.",
      a: "Active le « Mode no beauty » dans Paramètres → Lecture : les fiches ne chargent plus que l'essentiel pour lancer un épisode (sans bannière ni vignettes) et s'ouvrent beaucoup plus vite. Sur une machine modeste, le « Mode performance » (Paramètres → Apparence) allège aussi l'interface.",
    },
  ],
};

const ANIME_OFFLINE = {
  id: "hors-ligne",
  label: "Hors ligne & téléchargements",
  icon: Download,
  items: [
    {
      q: "Puis-je regarder sans connexion internet ?",
      a: "Oui : télécharge un épisode (ou un chapitre de scan) et il reste disponible hors ligne. Sans réseau, seuls tes téléchargements sont accessibles : le catalogue, la recherche et la Watch Party ont besoin d'internet.\nLe téléchargement demande un compte : il n'est pas disponible en mode visiteur.",
    },
    {
      q: "Où sont stockés les téléchargements et combien de place ça prend ?",
      a: "Sur ton appareil, avec un seul fichier vidéo par épisode. Sa taille dépend de la « Qualité de téléchargement » choisie dans Paramètres → Téléchargements : une qualité plus basse prend moins de place.\nTu peux aussi y régler le nombre de téléchargements en même temps.",
    },
  ],
};

const ANIME_LISTS = {
  id: "listes",
  label: "Mes listes & progression",
  icon: ListChecks,
  items: [
    {
      q: "À quoi sert « Mes listes » et pourquoi un anime passe tout seul en « Terminé » ?",
      a: "Mes listes classe tes animes par statut (En cours, Terminé, En pause…). Quand tu as vu tous les épisodes d'un anime, il passe automatiquement en « Terminé ». Tu peux changer son statut ou ses dates dans le détail de l'anime, et réorganiser tes listes par glisser-déposer.",
    },
    {
      q: "Ma progression est-elle enregistrée si je change d'appareil ?",
      a: "Oui : favoris, listes et progression sont liés à ton compte et synchronisés, que tu te connectes par e-mail ou par Discord. Tu retrouves tout en te connectant sur un autre ordinateur ou sur ton téléphone.\nEn mode visiteur, en revanche, rien n'est enregistré.",
    },
    {
      q: "Comment être prévenu quand un nouvel épisode sort ?",
      a: "Active les notifications de sorties dans Paramètres → Notifications. Le Planning te montre aussi toutes les sorties de la semaine.",
    },
    {
      q: "Je peux faire une sauvegarde de mes données ?",
      a: "Oui, dans Paramètres → Sauvegarde : « Exporter mes données » télécharge un fichier avec tes favoris, listes et progression. Tu pourras l'importer plus tard : l'import complète tes données sans rien effacer.",
    },
  ],
};

const ANIME_WATCHPARTY = {
  id: "watch-party",
  label: "Watch Party & communauté",
  icon: Clapperboard,
  items: [
    {
      q: "Comment regarder un anime avec des amis, en même temps ?",
      a: "Va dans Watch Party, crée un salon, puis partage le code à tes amis pour qu'ils te rejoignent. La lecture est synchronisée pour tout le monde, avec un chat et une file d'attente. Chaque participant a besoin d'un compte.",
    },
    {
      q: "Comment ajouter des amis ?",
      a: "Dans la page Amis, cherche un membre par son pseudo ou son @handle et envoie-lui une demande. Dès qu'il l'accepte, vous êtes amis.",
    },
    {
      q: "Comment personnaliser mon profil ?",
      a: "Depuis ton profil, tu peux changer ta photo, ta bannière, tes couleurs, ton fond et ta parure, et partager ta carte Nartya. Ton profil affiche aussi ton rang, ton activité, tes succès et tes anime préférés.",
    },
    {
      q: "Comment fonctionne le classement ?",
      a: "Le classement repose sur ce que tu regardes vraiment : seuls les épisodes réellement visionnés comptent, pas ceux marqués « vus » à la main.",
    },
  ],
};

const CAT_SCANS = {
  id: "scans",
  label: "Mangas & scans",
  icon: BookOpen,
  items: [
    {
      q: "Je peux lire des mangas sur Nartya ?",
      a: "Oui, depuis l'onglet Mangas : cherche un manga, lis ses chapitres dans l'app ou télécharge-les pour les lire hors ligne. Ta progression de lecture est enregistrée avec ton compte.",
    },
  ],
};

const CAT_CONFIDENTIALITE = {
  id: "confidentialite",
  label: "Confidentialité & sécurité",
  icon: ShieldCheck,
  items: [
    {
      q: "Mes amis Discord voient ce que je regarde. Comment le cacher ?",
      a: "C'est la présence Discord, qui affiche ton activité sur ton profil Discord (sur ordinateur uniquement). Tu peux la désactiver dans Paramètres → Confidentialité → Présence Discord.",
    },
    {
      q: "Mon antivirus/navigateur me met en garde au téléchargement. C'est un virus ?",
      a: "Non. Chaque version de Nartya est analysée par plus de 70 antivirus (VirusTotal) avant d'être publiée, avec une empreinte de vérification. Le rapport de chaque fichier est consultable sur nartya.app/verification. Ces alertes sont des « faux positifs » fréquents pour les applications peu répandues.\nTélécharge toujours Nartya depuis le site officiel, nartya.app.",
    },
    {
      q: "Quelles données Nartya conserve sur moi ?",
      a: "Le strict nécessaire au service : ton adresse e-mail ou ton identifiant Discord (selon ta façon de te connecter), ton pseudo, ton avatar, ton profil, tes favoris, tes listes et ta progression. Ces données ne sont jamais revendues, et ton adresse e-mail n'est jamais montrée aux autres membres.",
    },
    {
      q: "Comment se passent les mises à jour ?",
      a: "Sur ordinateur, c'est le Nartya Hub qui met tes apps à jour. Sur Android, l'app te prévient quand une nouvelle version est disponible et t'aide à l'installer. Sur iPhone, la nouvelle version s'installe depuis SideStore.\nAprès chaque mise à jour, le récap « Quoi de neuf » te présente les nouveautés.",
    },
    {
      q: "Nartya est-il gratuit ? Y a-t-il de la publicité ?",
      a: "Oui, Nartya est entièrement gratuit. Les offres Premium (Supporter, Ultimate) apportent des avantages de personnalisation et de confort, mais aucun épisode ni aucune fonction de visionnage n'est réservé aux abonnés. Elles se gèrent depuis le Hub.\nLes éventuelles publicités que tu croises pendant une vidéo viennent des lecteurs tiers, pas de Nartya.",
    },
  ],
};

const ANIME_CATEGORIES = [
  CAT_COMPTE,
  ANIME_WATCH,
  ANIME_OFFLINE,
  ANIME_LISTS,
  ANIME_WATCHPARTY,
  CAT_SCANS,
  CAT_CONFIDENTIALITE,
];


function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-surface/40">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-text">{q}</span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180 text-primary" : ""}`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 px-5 pb-4 text-sm leading-relaxed text-muted">
            {a.split("\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const source = ANIME_CATEGORIES;

  const q = query.trim().toLowerCase();

  const categories = useMemo(() => {
    if (!q) return source;
    return source.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [q, source]);

  const toggle = (key) => setOpenId((cur) => (cur === key ? null : key));

  const jumpTo = (id) => {
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex items-center gap-3">
        <HelpCircle size={26} className="text-primary" />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-glow">Foire aux questions</h1>
          <p className="mt-1 text-sm text-muted">
            Les réponses aux questions les plus courantes sur Nartya.
          </p>
        </div>
      </div>

      <div className="mb-4 flex h-11 w-full items-center gap-2.5 rounded-md bg-surface px-3.5 ring-1 ring-border focus-within:ring-primary/60">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une question…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      {/* Masqué pendant une recherche. */}
      {!q && (
        <div className="mb-8 flex flex-wrap gap-2">
          {source.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => jumpTo(cat.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/40 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-text"
              >
                <Icon size={13} className="text-primary" />
                {cat.label}
              </button>
            );
          })}
        </div>
      )}

      {categories.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Aucune question ne correspond à « {query} ».
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-6">
                <div className="mb-3 flex items-center gap-2.5">
                  <Icon size={16} className="text-primary" />
                  <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text">
                    {cat.label}
                  </h2>
                  <span className="text-xs font-medium text-muted/60">{cat.items.length}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {cat.items.map((it, i) => {
                    const key = `${cat.id}-${i}`;
                    return (
                      <FaqItem
                        key={key}
                        q={it.q}
                        a={it.a}
                        open={openId === key}
                        onToggle={() => toggle(key)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-10 rounded-lg border border-border/60 bg-surface/40 p-5 text-center">
        <p className="text-sm text-text">Tu ne trouves pas ta réponse&nbsp;?</p>
        <p className="mt-1 text-xs text-muted">
          Ouvre un{" "}
          <Link
            to="/reports"
            className="font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
          >
            signalement
          </Link>{" "}
          directement dans l’app, pose ta question sur notre{" "}
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
          >
            Discord
          </a>{" "}
          ou écris-nous à{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-3 text-xs text-muted">
          Un anime met du temps à charger ou ne s'ouvre pas ?{" "}
          <Link
            to="/uptime"
            className="inline-flex items-center gap-1 font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
          >
            <Activity size={12} />
            Vérifie l'état du service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
