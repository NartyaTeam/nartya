import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ImagePlus, Trash2, Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  resolveAvatar,
  resolveBanner,
  resolvePageBackground,
  updateMyProfile,
  setUsername as saveUsername,
  setSocialPrefs,
  uploadProfileImage,
  clearProfileImage,
  profileErrorMessage,
  accentRgb,
} from "@/api/profile";
import { useIsPremium, usePremiumTier, pinnedLimit } from "@/lib/premium";
import { ITEMS, resolveCosmetics, avatarShapeClass } from "@/lib/cosmetics";
import CosmeticPicker from "./CosmeticPicker";
import AvatarFrame from "@/components/ambient/AvatarFrame";
import BannerDecor from "@/components/ambient/BannerDecor";
import ThemeAmbience from "@/components/ambient/ThemeAmbience";
import { profileArt } from "@/lib/profileArt";
import { listFavorites, pinFavorite, unpinFavorite } from "@/api/favorites";
import AvatarCropModal from "./AvatarCropModal";
import BannerCropModal from "./BannerCropModal";
import { SITE_HOST } from "@/config/instance";
import {
  AMBIENCES,
  AccentPicker,
  AmbiencePicker,
  EmblemPicker,
  PinnedFavoritesPicker,
  PrivacySettings,
} from "./ProfileEditFields";

const MAX_FILE_MB = 5;
const MAX_BIO = 300;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
// Miroir de la validation serveur : lettres de toute écriture, chiffres, espace, _ . -
const USERNAME_RE = /^[\p{L}\p{N}_. -]{3,24}$/u;
const legacyAccentHex = (accent) => accent === "sakura" ? "#F4648C" : "#FF713E";

export default function ProfileEditModal({ onClose }) {
  const user = useAuthStore((s) => s.user);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const isPremium = useIsPremium();
  const tier = usePremiumTier();
  const maxPins = pinnedLimit(user); // 12 gratuit / 30 Nartya+ / illimité Ultimate
  const maxPinsLabel = maxPins === Infinity ? "∞" : maxPins;

  const [username, setUsernameField] = useState(user?.username || "");
  const [handle, setHandle] = useState(user?.handle || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [accent, setAccent] = useState(() => /^#[0-9a-f]{6}$/i.test(user?.accent_color || "") ? user.accent_color : legacyAccentHex(user?.accent_color));
  const [ambient, setAmbient] = useState(() => AMBIENCES.some((item) => item.id === user?.ambient_theme) ? user.ambient_theme : null);
  const [emblem, setEmblem] = useState(user?.profile_emblem || null);
  // Tel qu'il sera stocké.
  const [cosmetics, setCosmetics] = useState(() => ({
    ornament: ITEMS.ornament[user?.cosmetic_ornament] ? user.cosmetic_ornament : null,
    banner: ITEMS.banner[user?.cosmetic_banner] ? user.cosmetic_banner : null,
  }));
  // Résolu comme l'affichage public, gating de palier compris.
  const preview = resolveCosmetics({
    ...user,
    cosmetic_ornament: cosmetics.ornament,
    cosmetic_banner: cosmetics.banner,
  });
  const previewAccent = accentRgb(accent);

  const [isPublic, setIsPublic] = useState(user?.is_public ?? true);
  const [activityPublic, setActivityPublic] = useState(user?.activity_public ?? true);
  const [favoritesPublic, setFavoritesPublic] = useState(user?.favorites_public ?? true);
  const [friendsPublic, setFriendsPublic] = useState(user?.friends_public ?? true);
  const [presencePublic, setPresencePublic] = useState(user?.presence_public ?? true);

  const [avatarUrl, setAvatarUrl] = useState(() => resolveAvatar(user));
  const [bannerUrl, setBannerUrl] = useState(() => resolveBanner(user));
  const [backgroundUrl, setBackgroundUrl] = useState(() => resolvePageBackground(user));
  const [uploading, setUploading] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [bannerCropFile, setBannerCropFile] = useState(null);
  const [bannerDims, setBannerDims] = useState(null);

  const [favorites, setFavorites] = useState(null);
  const [pinned, setPinned] = useState(() => new Set());

  const avatarInput = useRef(null);
  const bannerInput = useRef(null);
  const backgroundInput = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && !uploading && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, uploading]);

  useEffect(() => {
    listFavorites()
      .then((rows) => {
        setFavorites(rows);
        setPinned(new Set(rows.filter((r) => r.pinned_at).map((r) => r.anime_slug)));
      })
      .catch(() => setFavorites([]));
  }, []);

  const handleValid = HANDLE_RE.test(handle.trim().toLowerCase());
  const usernameValid = USERNAME_RE.test(username.trim().replace(/\s+/g, " "));

  // Aperçu local immédiat.
  const doUpload = async (kind, fileOrBlob) => {
    setUploading(kind);
    try {
      await uploadProfileImage(kind, fileOrBlob);
      await loadProfile();
      const localUrl = URL.createObjectURL(fileOrBlob);
      if (kind === "avatar") setAvatarUrl(localUrl);
      else if (kind === "banner") setBannerUrl(localUrl);
      else setBackgroundUrl(localUrl);
    } catch (e) {
      toast.error("Échec de l'envoi de l'image.");
    } finally {
      setUploading(null);
    }
  };

  const pickImage = async (kind, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Seules les images sont acceptées.");
    // Gif : avatar réservé aux abonnés, bannière et fond de page à Ultimate.
    const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name || "");
    if (kind === "avatar" && isGif && !isPremium) {
      toast.info("L'avatar animé (gif) est réservé aux abonnés Nartya + / Ultimate.");
      return;
    }
    if ((kind === "banner" || kind === "background") && isGif && tier !== "ultimate") {
      toast.info(
        kind === "banner"
          ? "La bannière animée (gif) est réservée aux abonnés Ultimate."
          : "Le fond de page animé (gif) est réservé aux abonnés Ultimate."
      );
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024)
      return toast.error(`Image trop lourde (${MAX_FILE_MB} Mo max).`);
    // Un gif est gardé tel quel, et le fond de page n'est pas recadré.
    if (!isGif && (kind === "avatar" || kind === "banner")) {
      if (kind === "avatar") setCropFile(file);
      else setBannerCropFile(file);
      return;
    }
    await doUpload(kind, file);
  };

  const onCropConfirm = async (blob) => {
    setCropFile(null);
    if (!blob) return;
    await doUpload("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  };

  const onBannerCropConfirm = async (blob) => {
    setBannerCropFile(null);
    if (!blob) return;
    await doUpload("banner", new File([blob], "banner.jpg", { type: "image/jpeg" }));
  };

  const removeImage = async (kind) => {
    setUploading(kind);
    try {
      await clearProfileImage(kind);
      await loadProfile();
      if (kind === "avatar") setAvatarUrl(user?.avatar || null); // repli sur l'avatar Discord
      else if (kind === "banner") {
        setBannerUrl(null);
        setBannerDims(null);
      } else {
        setBackgroundUrl(null);
      }
    } catch {
      toast.error("Impossible de retirer l'image.");
    } finally {
      setUploading(null);
    }
  };

  const togglePin = async (slug) => {
    const isPinned = pinned.has(slug);
    if (!isPinned && pinned.size >= maxPins)
      return toast.info(
        isPremium
          ? `Maximum ${maxPinsLabel} favoris mis en avant.`
          : `Maximum ${maxPinsLabel} favoris mis en avant — passe à une offre supérieure pour en épingler plus.`
      );
    setPinned((prev) => {
      const next = new Set(prev);
      isPinned ? next.delete(slug) : next.add(slug);
      return next;
    });
    try {
      isPinned ? await unpinFavorite(slug) : await pinFavorite(slug);
    } catch (e) {
      setPinned((prev) => {
        const next = new Set(prev);
        isPinned ? next.add(slug) : next.delete(slug);
        return next;
      });
      toast.error(
        (e?.message || "").includes("pin_limit")
          ? `Limite de favoris mis en avant atteinte (${maxPinsLabel}).`
          : "Action impossible."
      );
    }
  };

  const save = async () => {
    const h = handle.trim().toLowerCase();
    if (!HANDLE_RE.test(h)) return toast.info("Pseudo public invalide (3–20 car. : a-z, 0-9, _).");
    const u = username.trim().replace(/\s+/g, " ");
    if (!USERNAME_RE.test(u)) return toast.info("Pseudo invalide (3–24 car. : lettres, chiffres, espace, _ . -).");
    setSaving(true);
    try {
      // Le pseudo a sa propre RPC.
      if (u !== (user?.username || "")) await saveUsername(u);
      await updateMyProfile({
        handle: h,
        bio: bio.trim(),
        accent,
        // La valeur stockée est préservée pour un non-abonné.
        emblem: isPremium ? emblem : user?.profile_emblem ?? null,
        ambient: isPremium ? ambient : null,
        // Non abonné : la RPC garde les valeurs stockées.
        cosmetics: isPremium ? cosmetics : undefined,
        isPublic,
        activityPublic,
        favoritesPublic,
      });
      await setSocialPrefs(friendsPublic, presencePublic);
      await loadProfile();
      toast.success("Profil mis à jour ✨");
      onClose();
    } catch (e) {
      toast.error(profileErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || !!uploading;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !busy && onClose()} />

      <div
        className="animate-fade-in-fast relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] sm:max-h-[92vh] sm:rounded-lg sm:border sm:pb-0"
        style={previewAccent ? { "--primary": previewAccent } : undefined}
      >
        <div className="relative shrink-0 bg-gradient-to-b from-primary/[0.05] to-transparent px-4 pb-4 pt-5 sm:px-6 sm:pt-4">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20 sm:hidden" />
          <button
            onClick={onClose}
            disabled={busy}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Mon profil</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Éditer le profil</h2>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 py-2 sm:px-6">
          <div>
            {/* Même ratio que le recadrage et que la bannière réelle. */}
            <div className="relative aspect-[460/148] w-full overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border">
              {bannerUrl || profileArt(preview.banner) ? (
                <img
                  src={bannerUrl || profileArt(preview.banner)?.background}
                  alt=""
                  className="h-full w-full object-cover"
                  onLoad={(e) =>
                    setBannerDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })
                  }
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/25 via-surface-2 to-bg" />
              )}
              {/* Une source trop petite paraît floue en pleine largeur. */}
              {bannerUrl && bannerDims && (
                <span
                  className="absolute bottom-2 right-3 z-10 rounded bg-black/55 px-2 py-0.5 text-[0.7rem] font-medium tabular-nums text-white/90 ring-1 ring-white/15 backdrop-blur"
                  title={
                    bannerDims.w < 1920
                      ? "Résolution faible pour le plein écran : réimporte une source d'au moins 1920 px de large."
                      : "Dimensions de la bannière"
                  }
                >
                  {bannerDims.w} × {bannerDims.h} px
                  {bannerDims.w < 1920 && <span className="ml-1 text-amber-300">· faible</span>}
                </span>
              )}
              {isPremium && preview.banner && <BannerDecor token={preview.banner} />}
              {isPremium && ambient && <ThemeAmbience token={ambient === "sakura_fall" ? "kurotsuki" : ambient === "phantom" ? "raijin" : ambient === "ocean" ? "grand_line" : ambient} />}
              <div className="pointer-events-none absolute inset-0 bg-black/20" />
              {/* Seconde couche du décor, au premier plan, comme dans l'en-tête réel. */}
              {isPremium && preview.banner && <BannerDecor token={preview.banner} layer="front" />}
              <input
                ref={bannerInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  pickImage("banner", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="absolute right-3 top-3 z-10 flex gap-2">
                <button
                  onClick={() => bannerInput.current?.click()}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-40"
                >
                  {uploading === "banner" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ImagePlus size={13} />
                  )}
                  Bannière
                </button>
                {bannerUrl && (
                  <button
                    onClick={() => removeImage("banner")}
                    disabled={busy}
                    title="Retirer la bannière"
                    className="rounded-md bg-black/55 p-1.5 text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="-mt-10 flex items-end gap-4 px-4">
              <div className="relative">
                <div
                  className={`h-20 w-20 overflow-hidden border-4 border-surface bg-surface-2 ${avatarShapeClass(
                    preview.ornament,
                    "rounded-xl"
                  )}`}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
                      {(user?.username || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {isPremium && preview.ornament && <AvatarFrame token={preview.ornament} />}
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    pickImage("avatar", e.target.files?.[0]);
                    e.target.value = ""; // permet de re-choisir le même fichier
                  }}
                />
                <button
                  onClick={() => avatarInput.current?.click()}
                  disabled={busy}
                  title="Changer l'avatar"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-fg ring-2 ring-surface transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  {uploading === "avatar" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ImagePlus size={13} />
                  )}
                </button>
              </div>
              {user?.avatar_custom && (
                <button
                  onClick={() => removeImage("avatar")}
                  disabled={busy}
                  className="mb-1 text-xs font-medium text-muted transition-colors hover:text-primary disabled:opacity-40"
                >
                  Rétablir l'avatar Discord
                </button>
              )}
            </div>
          </div>

          {/* Distinct de la bannière, affiché flouté et sans recadrage ; sans lui, l'aperçu montre la bannière. */}
          <div>
            <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
              Fond de page
            </label>
            <div className="relative mt-2 h-24 w-full overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border">
              {(backgroundUrl || bannerUrl) ? (
                // Même flou que le rendu réel.
                <div
                  className="h-full w-full scale-105 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${backgroundUrl || bannerUrl})`,
                    filter: "brightness(0.55) saturate(1.1) blur(6px)",
                  }}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/25 via-surface-2 to-bg" />
              )}
              <input
                ref={backgroundInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  pickImage("background", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 gap-2">
                <button
                  onClick={() => backgroundInput.current?.click()}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-40"
                >
                  {uploading === "background" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ImagePlus size={13} />
                  )}
                  Choisir
                </button>
                {backgroundUrl && (
                  <button
                    onClick={() => removeImage("background")}
                    disabled={busy}
                    title="Retirer le fond de page"
                    className="rounded-md bg-black/55 p-1.5 text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Affiché flouté derrière tout ton profil. Sans image dédiée, ta bannière est
              reprise pour ce fond ; sans bannière non plus, la couleur du thème.
            </p>
          </div>

          <div>
            <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
              Pseudo affiché
            </label>
            <div
              className={`mt-2 flex items-center rounded-md border bg-bg/40 px-3 transition-colors focus-within:border-primary/60 ${
                username && !usernameValid ? "border-red-500/50" : "border-border"
              }`}
            >
              <input
                value={username}
                onChange={(e) => setUsernameField(e.target.value)}
                maxLength={24}
                placeholder="Ton pseudo"
                className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted/70"
              />
            </div>
            {username && !usernameValid ? (
              <p className="mt-1.5 text-xs text-red-400">
                3 à 24 caractères : lettres, chiffres, espace, « _ », « . » et « - ».
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                Le nom affiché sur ton profil. Il ne change plus tout seul.
              </p>
            )}
          </div>

          <div>
            <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
              Pseudo public (lien de profil)
            </label>
            <div
              className={`mt-2 flex items-center rounded-md border bg-bg/40 px-3 transition-colors focus-within:border-primary/60 ${
                handle && !handleValid ? "border-red-500/50" : "border-border"
              }`}
            >
              <span className="text-sm text-muted">{SITE_HOST}/u/</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                maxLength={20}
                placeholder="pseudo"
                className="w-full bg-transparent py-2.5 pl-0.5 text-sm outline-none placeholder:text-muted/70"
              />
            </div>
            {handle && !handleValid && (
              <p className="mt-1.5 text-xs text-red-400">
                3 à 20 caractères : lettres minuscules, chiffres et « _ ».
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
                Bio
              </label>
              <span className="text-[0.7rem] tabular-nums text-muted/60">
                {bio.length}/{MAX_BIO}
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={MAX_BIO}
              rows={3}
              placeholder="Présente-toi en quelques mots…"
              className="mt-2 w-full resize-none rounded-md border border-border bg-bg/40 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary/60"
            />
          </div>

          <AccentPicker accent={accent} onChange={setAccent} />

          <CosmeticPicker
            isPremium={isPremium}
            tier={tier}
            value={cosmetics}
            onChange={setCosmetics}
            avatarUrl={avatarUrl}
            username={username}
          />

          <AmbiencePicker isPremium={isPremium} ambient={ambient} onChange={setAmbient} />

          <EmblemPicker isPremium={isPremium} emblem={emblem} onChange={setEmblem} />

          <PinnedFavoritesPicker
            favorites={favorites}
            pinned={pinned}
            maxPinsLabel={maxPinsLabel}
            onToggle={togglePin}
          />

          <PrivacySettings
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            activityPublic={activityPublic}
            setActivityPublic={setActivityPublic}
            favoritesPublic={favoritesPublic}
            setFavoritesPublic={setFavoritesPublic}
            friendsPublic={friendsPublic}
            setFriendsPublic={setFriendsPublic}
            presencePublic={presencePublic}
            setPresencePublic={setPresencePublic}
          />
        </div>

        <div className="mt-2 flex shrink-0 items-center justify-end gap-4 border-t border-border px-4 py-4 sm:px-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={save}
            disabled={busy || !handleValid || !usernameValid}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={15} />}
            Enregistrer
          </button>
        </div>
      </div>

      {cropFile && (
        <AvatarCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={onCropConfirm} />
      )}

      {bannerCropFile && (
        <BannerCropModal
          file={bannerCropFile}
          onCancel={() => setBannerCropFile(null)}
          onConfirm={onBannerCropConfirm}
        />
      )}
    </div>,
    document.body
  );
}
