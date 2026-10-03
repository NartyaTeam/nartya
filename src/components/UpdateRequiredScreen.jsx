import { useState } from "react";
import { Loader2 } from "lucide-react";
import { openHub } from "@/lib/hubAuth";
import { installAppUpdate } from "@/lib/installAppUpdate";
import { platform } from "@/platform";
import BlockScreen from "@/components/BlockScreen";

/**
 * L'installation est sous le plancher fixé par l'API. Le bouton mène au Hub, sinon à la page
 * de téléchargement.
 */
export default function UpdateRequiredScreen({ latest, message, downloadUrl, sha256 }) {
  const [busy, setBusy] = useState(false);
  const isAndroid = platform.name === "capacitor-android";
  // Sur iPhone, c'est l'app de sideload qui applique la mise à jour.
  const isIos = platform.name === "capacitor-ios";

  const handleUpdate = async () => {
    setBusy(true);
    try {
      if (isAndroid || isIos) {
        await installAppUpdate({ downloadUrl, sha256 });
        return;
      }
      const info = await window.electronAPI?.hub?.getInfo?.().catch(() => null);
      const res = await openHub(!!info);
      if (!res?.success && downloadUrl) {
        window.electronAPI?.openExternal?.(downloadUrl);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BlockScreen
      eyebrow="Mise à jour requise"
      title="Cette version n'est plus supportée"
      description={
        message || "Une mise à jour est nécessaire pour continuer à utiliser Nartya."
      }
      actions={
        <button onClick={handleUpdate} disabled={busy} className="btn-shu">
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {isIos ? "Ouverture…" : "Ouverture du Hub…"}
            </>
          ) : (
            isAndroid ? "Télécharger la mise à jour" : isIos ? "Voir la mise à jour" : "Mettre à jour"
          )}
        </button>
      }
      footnote={
        <>
          {latest && (
            <>
              Dernière version : <span className="text-text/80">{latest}</span>.{" "}
            </>
          )}
          {isAndroid
            ? "Le téléchargement s'ouvre dans ton navigateur. Android te demandera ensuite de confirmer l'installation de l'APK."
            : isIos
              ? "Ouvre SideStore et installe la nouvelle version depuis l'onglet Mises à jour."
              : "La mise à jour s'installe depuis Nartya Hub. S'il n'est pas encore installé, le bouton t'amène à la page de téléchargement."}
        </>
      }
    />
  );
}
