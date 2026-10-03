import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, CircleDot, Sparkles, ImagePlus } from "lucide-react";
import BannerDecor from "@/components/ambient/BannerDecor";
import AvatarFrame from "@/components/ambient/AvatarFrame";
import { KurotsukiStreaks } from "@/components/ambient/KurotsukiArt";
import { PROFILE_ARTS, profileArt } from "@/lib/profileArt";
import { asset } from "@/lib/asset";

function ArtToggle({ label, checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ef232a] ${checked ? "border-[#ef232a]/45 bg-[#ef232a]/10 text-white" : "border-white/10 text-white/50"}`}>
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${checked ? "bg-[#ef232a] text-white" : "border border-white/25"}`}>
        {checked && <Check size={10} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

/** Atelier de dev, sans compte ni sauvegarde. Toute collection de `PROFILE_ARTS` apparaît ici. */
export default function ProfileArtPreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [themeId, setThemeId] = useState(() => profileArt(searchParams.get("theme"))?.id || PROFILE_ARTS[0]?.id);
  const theme = profileArt(themeId) || PROFILE_ARTS[0];

  const [scene, setScene] = useState(true);
  const [decor, setDecor] = useState(true);
  const [frame, setFrame] = useState(true);
  const [motes, setMotes] = useState(true);
  const [customBanner, setCustomBanner] = useState(null);
  const [imageError, setImageError] = useState("");
  useEffect(() => () => { if (customBanner) URL.revokeObjectURL(customBanner); }, [customBanner]);

  const selectTheme = (id) => {
    setThemeId(id);
    setCustomBanner(null);
    setSearchParams(id === PROFILE_ARTS[0]?.id ? {} : { theme: id }, { replace: true });
  };

  if (!theme) {
    return (
      <main className="min-h-full bg-[#090a0d] px-4 py-16 text-center text-[#f2eeee]">
        <p className="text-sm text-[#9aa0aa]">Aucune collection dans PROFILE_ARTS pour l'instant.</p>
      </main>
    );
  }

  const banner = customBanner || (scene ? theme.background : null);
  return (
    <main className="min-h-full bg-[#090a0d] px-4 py-7 text-[#f2eeee] sm:px-8 sm:py-10" style={{ "--primary": theme.rgb }}>
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#a5aebe]">
          <a href={asset("#/profile")} className="inline-flex items-center gap-2 hover:text-white"><ArrowLeft size={14} /> Profil</a>
          <span className="rounded-full border border-[#ef232a]/25 px-3 py-1.5 text-[#ef555a]">Collection expérimentale · aperçu local</span>
        </div>

        {PROFILE_ARTS.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Collection">
            {PROFILE_ARTS.map((art) => (
              <button
                key={art.id}
                type="button"
                role="tab"
                aria-selected={art.id === theme.id}
                onClick={() => selectTheme(art.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                  art.id === theme.id
                    ? "border-white/60 bg-white/10 text-white"
                    : "border-white/10 text-white/50 hover:text-white/80"
                }`}
                style={art.id === theme.id ? { borderColor: `rgb(${art.rgb} / 0.6)`, background: `rgb(${art.rgb} / 0.12)` } : undefined}
              >
                {art.label}
              </button>
            ))}
          </div>
        )}

        <div className="mb-7 mt-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#ef3037]">Nartya Atelier</p>
            <h1 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">{theme.label} <span className="font-sans text-xl font-light text-[#9ca2ae] sm:text-2xl">/ {theme.subtitle}</span></h1>
          </div>
          <CircleDot size={28} strokeWidth={1} className="hidden text-[#ef3037] sm:block" />
        </div>

        <div className="mb-5 flex flex-wrap gap-2" aria-label="Calques du thème">
          <ArtToggle label="Paysage" checked={scene} onChange={(next) => { setScene(next); setCustomBanner(null); }} />
          <ArtToggle label="Overlay" checked={decor} onChange={setDecor} />
          <ArtToggle label="Cadre d’avatar" checked={frame} onChange={setFrame} />
          {theme.id === "kurotsuki" && <ArtToggle label="Speed lines" checked={motes} onChange={setMotes} />}
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-xs text-[#acb7c8] focus-within:outline focus-within:outline-2 focus-within:outline-[#decea4] hover:text-white">
            <ImagePlus size={14} /> Essayer ma bannière
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Essayer ma bannière" className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
                setImageError("Choisis une image PNG, JPEG ou WebP de moins de 10 Mo.");
                return;
              }
              setImageError("");
              setCustomBanner(URL.createObjectURL(file));
            }} />
          </label>
          {customBanner && <button type="button" onClick={() => { setCustomBanner(null); setImageError(""); }} className="px-2 text-xs text-[#ef555a] underline">Retirer mon image</button>}
        </div>
        {imageError && <p role="alert" className="mb-4 text-sm text-amber-200">{imageError}</p>}

        <section className="overflow-hidden rounded-2xl border border-[#b8c6de]/15 bg-[#0f1723] shadow-[0_24px_80px_#0005]" aria-label="Profil de démonstration">
          <div className="relative h-[220px] overflow-hidden bg-[radial-gradient(ellipse_at_70%_20%,#25344c,#101a2a_70%)] sm:h-auto sm:aspect-[3/1]">
            {banner && <img src={banner} alt={theme.label} onError={() => { if (customBanner) { setCustomBanner(null); setImageError("Cette image ne peut pas être affichée."); } }} className="absolute inset-0 h-full w-full object-cover object-[65%_center]" />}
            {decor && <BannerDecor token={theme.id} />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f1723] via-transparent to-transparent" />
            {decor && <BannerDecor token={theme.id} layer="front" />}
            {motes && theme.id === "kurotsuki" && <KurotsukiStreaks />}
            <span className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[10px] uppercase tracking-[.18em] text-white/80 backdrop-blur-md sm:right-6 sm:top-6">{theme.subtitle}</span>
          </div>
          <div className="relative px-6 pb-8 sm:px-10">
            <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-6">
              <div className="flex min-w-0 items-end gap-5 sm:gap-7">
                <div className="relative -mt-9 mb-2 h-20 w-20 shrink-0 sm:-mt-12 sm:h-[104px] sm:w-[104px]">
                  <div className="flex h-full w-full items-center justify-center rounded-full border border-white/20 bg-[#191a1f] font-display text-4xl text-white shadow-xl">{theme.label[0]}</div>
                  {frame && <AvatarFrame token={theme.id} />}
                </div>
                <div className="pb-1">
                  <p className="mb-2 text-[9px] uppercase tracking-[.22em] text-[#f0333a]">Collection {theme.label}</p>
                  <h2 className="font-display text-2xl sm:text-3xl">Dernier épisode</h2>
                  <p className="mt-2 text-xs text-[#9298a3]">@{theme.id} · Profil de démonstration</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 text-xs text-[#cabc97]"><Sparkles size={14} /> Parure illustrée</span>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className="max-w-lg font-display text-base leading-relaxed text-[#b9bbc2]">« La prochaine scène commence quand l’écran devient noir. »</p>
              <div className="flex gap-8 text-xs text-[#8492a9]">
                <div><span className="mb-1 block text-xl text-[#e7e2d6]">128 h</span>Visionnage</div>
                <div><span className="mb-1 block text-xl text-[#e7e2d6]">36</span>Animes</div>
                <div><span className="mb-1 block text-xl text-[#e7e2d6]">12</span>Favoris</div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { title: "01 / Le key visual", src: theme.background, text: "Un plan large pensé comme un opening d’anime.", fit: "object-cover" },
            { title: "02 / L’overlay", src: theme.overlay, text: "Encre, trames et effets au format exact de la bannière.", fit: "object-contain" },
            { title: "03 / Le cadre", src: theme.frame, text: "Le même vocabulaire graphique autour de l’avatar.", fit: "object-contain" },
          ].map((item) => (
            <a key={item.title} href={item.src} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10 bg-[#111b29] transition-colors hover:border-[#d6c498]/40">
              <div className="h-28 overflow-hidden bg-[#192437] p-2"><img src={item.src} alt={item.title} loading="lazy" className={`h-full w-full ${item.fit}`} /></div>
              <div className="p-4"><h3 className="text-xs font-medium text-[#e3d5b5]">{item.title}</h3><p className="mt-2 text-xs leading-relaxed text-[#93a1b7]">{item.text}</p></div>
            </a>
          ))}
        </div>
        <p className="mt-6 text-xs leading-relaxed text-[#76859c]">Cet atelier ne sauvegarde rien sur ton compte. Les chiffres sont fictifs. Une image importée reste sur cet appareil.</p>
      </div>
    </main>
  );
}
