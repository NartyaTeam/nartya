import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Inbox, Loader2, Palette, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { getTierList, saveTierList, tierListErrorMessage } from "@/api/tierLists";
import {
  MAX_ITEMS,
  MAX_TIERS,
  TEMPLATES,
  TIER_COLORS,
  cloneTiers,
  makeTier,
  readableTextColor,
  tiersFromTemplate,
} from "@/lib/tierLists";
import AnimePicker from "@/components/tierlists/AnimePicker";
import { TierPoster } from "@/components/tierlists/TierBoard";

const POOL = "pool";
const ROW = "row:";

const itemsOf = (board, cid) => (cid === POOL ? board.pool : board.tiers.find((t) => t.id === cid)?.items || []);
const withItems = (board, cid, items) =>
  cid === POOL ? { ...board, pool: items } : { ...board, tiers: board.tiers.map((t) => (t.id === cid ? { ...t, items } : t)) };

function containerOf(board, id) {
  if (id === POOL || board.tiers.some((t) => t.id === id)) return id;
  if (board.pool.some((it) => it.slug === id)) return POOL;
  return board.tiers.find((t) => t.items.some((it) => it.slug === id))?.id ?? null;
}

/**
 * Une rangée ne se pose que sur une rangée ; une affiche (du tableau ou du panneau) sur une
 * affiche ou une zone. Sous le pointeur d'abord : lâcher hors du tableau ne fait rien.
 */
function collision(args) {
  const type = args.active.data.current?.type;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const target = c.data.current?.type;
    return type === "row" ? target === "row" : target === "item" || target === "container";
  });
  const scoped = { ...args, droppableContainers };
  if (type === "row") return closestCenter(scoped);
  const hits = pointerWithin(scoped);
  if (!hits.length) return type === "pick" ? [] : rectIntersection(scoped);
  // Une affiche sous le pointeur passe avant la zone qui la contient.
  return [...hits].sort(
    (a, b) =>
      (a.data?.droppableContainer?.data.current?.type === "item" ? 0 : 1) -
      (b.data?.droppableContainer?.data.current?.type === "item" ? 0 : 1)
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in-fast relative max-h-[85dvh] w-full overflow-y-auto rounded-t-lg border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-muted hover:text-primary">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function SortablePoster({ item, onTap }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.slug,
    data: { type: "item" },
  });
  return (
    <TierPoster
      ref={setNodeRef}
      item={item}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, touchAction: "none" }}
      className="cursor-grab active:cursor-grabbing"
      onClick={() => onTap(item)}
      {...attributes}
      {...listeners}
    />
  );
}

function DropZone({ id, items, onTap, highlight, className = "", empty }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "container" } });
  return (
    <SortableContext id={id} items={items.map((it) => it.slug)} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`flex min-w-0 flex-1 flex-wrap content-start gap-0.5 p-0.5 transition-colors ${
          isOver || highlight ? "bg-primary/15" : ""
        } ${className}`}
      >
        {items.map((item) => (
          <SortablePoster key={item.slug} item={item} onTap={onTap} />
        ))}
        {!items.length && empty}
      </div>
    </SortableContext>
  );
}

/** Pastilles de couleur sous le bouton ; se ferme au clic à côté. */
function ColorPopover({ color, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute right-full top-0 z-30 mr-2 grid w-[13.5rem] grid-cols-6 gap-1.5 rounded-md bg-surface p-2.5 shadow-2xl ring-2 ring-border"
    >
      {TIER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onPick(c)}
          style={{ background: c }}
          className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-surface ${color === c ? "ring-text" : "ring-transparent"}`}
        />
      ))}
      <label className="relative col-span-6 mt-1 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-white/[0.06] text-xs font-bold text-muted ring-1 ring-border hover:text-text">
        <span className="h-4 w-4 rounded-full ring-1 ring-white/30" style={{ background: color }} />
        Couleur personnalisée
        <input
          type="color"
          value={color}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function EditableRow({ tier, canDelete, canAdd, highlight, onChange, onInsertBelow, onDelete, onTap }) {
  const [picking, setPicking] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: ROW + tier.id,
    data: { type: "row" },
  });
  const textColor = readableTextColor(tier.color);
  const rows = Math.min(4, Math.max(1, Math.ceil((tier.label.length || 1) / 9)));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={`relative flex min-h-[calc(4.5rem*1.4+4px)] border-b-2 border-black last:border-b-0 sm:min-h-[calc(5.25rem*1.4+4px)] ${
        isDragging ? "opacity-80 shadow-2xl" : ""
      }`}
    >
      <label
        className="flex w-20 shrink-0 cursor-text items-center justify-center px-1 sm:w-28"
        style={{ background: tier.color }}
        title="Clique pour modifier le texte"
      >
        <textarea
          value={tier.label}
          maxLength={60}
          rows={rows}
          onChange={(e) => onChange({ label: e.target.value.replace(/\n/g, " ") })}
          placeholder="Texte"
          aria-label="Texte de la rangée"
          style={{ color: textColor }}
          className="w-full resize-none overflow-hidden bg-transparent text-center text-xs font-bold leading-tight outline-none placeholder:text-current placeholder:opacity-50 focus:rounded focus:bg-black/10 sm:text-sm"
        />
      </label>
      <DropZone id={tier.id} items={tier.items} onTap={onTap} highlight={highlight} className="bg-surface/70" />
      <div className="relative flex w-9 shrink-0 flex-col items-center justify-center gap-0.5 bg-surface-2 py-1 text-muted">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="Glisser pour déplacer la rangée"
          title="Glisser pour déplacer la rangée"
          style={{ touchAction: "none" }}
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded hover:bg-white/10 hover:text-text active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-label="Changer la couleur"
          title="Changer la couleur"
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 hover:text-text"
        >
          <Palette size={15} />
        </button>
        <button
          type="button"
          onClick={onInsertBelow}
          disabled={!canAdd}
          aria-label="Ajouter une rangée en dessous"
          title="Ajouter une rangée en dessous"
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 hover:text-text disabled:opacity-30"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label="Supprimer la rangée"
          title="Supprimer la rangée (ses animes retournent dans « Non classés »)"
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-primary/15 hover:text-primary disabled:opacity-30"
        >
          <Trash2 size={15} />
        </button>
        {picking && (
          <ColorPopover
            color={tier.color}
            onPick={(color) => onChange({ color })}
            onClose={() => setPicking(false)}
          />
        )}
      </div>
    </div>
  );
}

export default function TierListEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get("from");
  const navigate = useNavigate();
  const [ready, setReady] = useState(!id && !fromId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [forkedFrom, setForkedFrom] = useState(null);
  const [board, setBoard] = useState(() => ({ tiers: tiersFromTemplate(TEMPLATES[0]), pool: [] }));
  const [active, setActive] = useState(null);
  const [overCid, setOverCid] = useState(null);
  const [menuItem, setMenuItem] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id && !fromId) return undefined;
    let alive = true;
    getTierList(id || fromId)
      .then((list) => {
        if (!alive) return;
        if (!list || (id && !list.isMine)) {
          toast.error("Tier list introuvable");
          navigate("/tierlists", { replace: true });
          return;
        }
        if (id) {
          setTitle(list.title);
          setDescription(list.description);
          setIsPublic(list.isPublic);
          setBoard({ tiers: list.tiers.map((t) => ({ ...t, items: t.items || [] })), pool: list.pool });
        } else {
          setTitle(`Ma version : ${list.title}`.slice(0, 80));
          setForkedFrom(list.id);
          setBoard({ tiers: cloneTiers(list.tiers), pool: [] });
        }
        setReady(true);
      })
      .catch(() => alive && navigate("/tierlists", { replace: true }));
    return () => {
      alive = false;
    };
  }, [id, fromId, navigate]);

  const slugs = useMemo(
    () => new Set([...board.pool, ...board.tiers.flatMap((t) => t.items)].map((it) => it.slug)),
    [board]
  );
  const has = useCallback((slug) => slugs.has(slug), [slugs]);
  const total = slugs.size;
  const ranked = total - board.pool.length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } })
  );

  const addItems = (items) => {
    const fresh = items.filter((it) => !slugs.has(it.slug));
    const room = MAX_ITEMS - total;
    if (room <= 0) {
      toast.error(`${MAX_ITEMS} animes au maximum par tier list`);
      return;
    }
    if (fresh.length > room) toast.info(`Seuls ${room} animes ont été ajoutés (${MAX_ITEMS} au maximum).`);
    setBoard((b) => ({ ...b, pool: [...b.pool, ...fresh.slice(0, room)] }));
  };

  const moveItem = (slug, toCid) => {
    setBoard((b) => {
      const from = containerOf(b, slug);
      if (!from || from === toCid) return b;
      const item = itemsOf(b, from).find((it) => it.slug === slug);
      const next = withItems(b, from, itemsOf(b, from).filter((it) => it.slug !== slug));
      return withItems(next, toCid, [...itemsOf(next, toCid), item]);
    });
  };

  const removeItem = (slug) => {
    setBoard((b) => {
      const from = containerOf(b, slug);
      return from ? withItems(b, from, itemsOf(b, from).filter((it) => it.slug !== slug)) : b;
    });
  };

  const onDragStart = ({ active: a }) => {
    const type = a.data.current?.type;
    const item =
      type === "pick"
        ? a.data.current.item
        : type === "item"
          ? [...board.pool, ...board.tiers.flatMap((t) => t.items)].find((it) => it.slug === a.id)
          : null;
    setActive({ type, item, tier: type === "row" ? board.tiers.find((t) => ROW + t.id === a.id) : null });
  };

  const onDragOver = ({ active: a, over }) => {
    const type = a.data.current?.type;
    if (type === "pick") {
      setOverCid(over ? containerOf(board, over.id) : null);
      return;
    }
    if (type !== "item" || !over) return;
    setBoard((b) => {
      const from = containerOf(b, a.id);
      const to = containerOf(b, over.id);
      if (!from || !to || from === to) return b;
      const source = itemsOf(b, from);
      const target = itemsOf(b, to);
      const item = source.find((it) => it.slug === a.id);
      const overIndex = target.findIndex((it) => it.slug === over.id);
      const index = overIndex === -1 ? target.length : overIndex;
      const next = withItems(b, from, source.filter((it) => it.slug !== a.id));
      return withItems(next, to, [...target.slice(0, index), item, ...target.slice(index)]);
    });
  };

  const endDrag = () => {
    setActive(null);
    setOverCid(null);
  };

  const onDragEnd = ({ active: a, over }) => {
    const type = a.data.current?.type;
    endDrag();
    if (!over) return;

    if (type === "row") {
      setBoard((b) => {
        const ids = b.tiers.map((t) => ROW + t.id);
        const from = ids.indexOf(a.id);
        const to = ids.indexOf(over.id);
        return from === -1 || to === -1 || from === to ? b : { ...b, tiers: arrayMove(b.tiers, from, to) };
      });
      return;
    }

    if (type === "pick") {
      const item = a.data.current.item;
      if (slugs.has(item.slug)) return;
      if (total >= MAX_ITEMS) {
        toast.error(`${MAX_ITEMS} animes au maximum par tier list`);
        return;
      }
      setBoard((b) => {
        const cid = containerOf(b, over.id);
        if (!cid) return b;
        const target = itemsOf(b, cid);
        const overIndex = target.findIndex((it) => it.slug === over.id);
        const index = overIndex === -1 ? target.length : overIndex;
        return withItems(b, cid, [...target.slice(0, index), item, ...target.slice(index)]);
      });
      return;
    }

    setBoard((b) => {
      const cid = containerOf(b, a.id);
      if (!cid || cid !== containerOf(b, over.id)) return b;
      const items = itemsOf(b, cid);
      const oldIndex = items.findIndex((it) => it.slug === a.id);
      const newIndex = items.findIndex((it) => it.slug === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return b;
      return withItems(b, cid, arrayMove(items, oldIndex, newIndex));
    });
  };

  const updateTier = (tierId, patch) =>
    setBoard((b) => ({ ...b, tiers: b.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)) }));

  const insertTier = (tierId) =>
    setBoard((b) => {
      if (b.tiers.length >= MAX_TIERS) return b;
      const i = b.tiers.findIndex((t) => t.id === tierId) + 1;
      const tiers = [...b.tiers];
      tiers.splice(i, 0, makeTier("", TIER_COLORS[(b.tiers.length + 3) % TIER_COLORS.length]));
      return { ...b, tiers };
    });

  const deleteTier = (tierId) =>
    setBoard((b) => {
      if (b.tiers.length <= 1) return b;
      const tier = b.tiers.find((t) => t.id === tierId);
      return { pool: [...b.pool, ...(tier?.items || [])], tiers: b.tiers.filter((t) => t.id !== tierId) };
    });

  const applyTemplate = (template) => {
    setBoard((b) => {
      const items = [...b.tiers.flatMap((t) => t.items), ...b.pool];
      return { tiers: tiersFromTemplate(template), pool: items };
    });
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Donne un titre à ta tier list.");
      return;
    }
    if (isPublic && ranked === 0) {
      toast.error("Classe au moins un anime avant de publier.");
      return;
    }
    setSaving(true);
    try {
      const savedId = await saveTierList({
        id: id || null,
        title,
        description,
        tiers: board.tiers,
        pool: board.pool,
        isPublic,
        forkedFrom,
      });
      toast.success(isPublic ? "Tier list publiée !" : "Brouillon enregistré");
      navigate(`/tierlists/${savedId}`, { replace: true });
    } catch (e) {
      toast.error(tierListErrorMessage(e));
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <header className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">
            {id ? "Modifier la tier list" : "Nouvelle tier list"}
          </p>
        </div>
        {/* Deux vrais champs, chacun avec son libellé : un titre sans cadre se lisait comme un
            titre déjà écrit, et l'on tapait le titre dans la description. */}
        <label className="block max-w-2xl">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Titre</span>
          <span className="flex items-center gap-3 rounded-md bg-surface px-3 ring-2 ring-border transition-shadow focus-within:ring-primary/70">
            <input
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. : Mes animes de 2026"
              className="t-impact min-w-0 flex-1 bg-transparent py-2 text-2xl outline-none placeholder:text-muted/40 md:text-3xl"
            />
            <Pencil size={16} className="shrink-0 text-muted" />
          </span>
        </label>
        <label className="mt-3 block max-w-2xl">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
            Description <span className="font-medium normal-case tracking-normal text-muted/60">(facultatif)</span>
          </span>
          <textarea
            value={description}
            maxLength={500}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explique ton classement en quelques mots"
            className="w-full resize-none rounded-md bg-surface px-3 py-2 text-sm outline-none ring-2 ring-border focus:ring-primary/70"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-1 rounded-md bg-surface p-1 ring-2 ring-border">
            {[
              [true, "Publique", Eye],
              [false, "Brouillon", EyeOff],
            ].map(([value, text, Icon]) => (
              <button
                key={text}
                type="button"
                onClick={() => setIsPublic(value)}
                className={`flex h-full items-center gap-1.5 rounded px-3 text-xs font-bold ${
                  isPublic === value ? "bg-primary text-primary-fg" : "text-muted hover:text-text"
                }`}
              >
                <Icon size={14} /> {text}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg transition-[filter] hover:brightness-110 active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isPublic ? (id ? "Enregistrer" : "Publier") : "Enregistrer le brouillon"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 items-center rounded-md px-3 text-sm font-bold text-muted hover:text-text"
          >
            Annuler
          </button>
          <span className="ml-auto text-xs tabular-nums text-muted">
            {ranked} classé{ranked > 1 ? "s" : ""} · {total}/{MAX_ITEMS}
          </span>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-muted">Modèle :</span>
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="h-8 rounded-full bg-white/[0.06] px-3 text-xs font-bold text-muted ring-1 ring-border hover:text-text"
                >
                  {template.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Clique sur le texte d'une rangée pour le changer. Glisse les affiches où tu veux, et les rangées avec{" "}
              <GripVertical size={12} className="inline align-[-2px]" />.
            </p>

            <div className="overflow-visible rounded-md bg-black ring-2 ring-border">
              <SortableContext items={board.tiers.map((t) => ROW + t.id)} strategy={verticalListSortingStrategy}>
                {board.tiers.map((tier) => (
                  <EditableRow
                    key={tier.id}
                    tier={tier}
                    canDelete={board.tiers.length > 1}
                    canAdd={board.tiers.length < MAX_TIERS}
                    highlight={active?.type === "pick" && overCid === tier.id}
                    onChange={(patch) => updateTier(tier.id, patch)}
                    onInsertBelow={() => insertTier(tier.id)}
                    onDelete={() => deleteTier(tier.id)}
                    onTap={setMenuItem}
                  />
                ))}
              </SortableContext>
            </div>
            {board.tiers.length < MAX_TIERS && (
              <button
                type="button"
                onClick={() =>
                  setBoard((b) => ({ ...b, tiers: [...b.tiers, makeTier("", TIER_COLORS[b.tiers.length % TIER_COLORS.length])] }))
                }
                className="flex h-10 items-center gap-2 rounded-md bg-white/[0.06] px-3.5 text-sm font-bold text-text ring-1 ring-border hover:text-primary"
              >
                <Plus size={16} /> Ajouter une rangée
              </button>
            )}

            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Inbox size={16} className="text-primary" /> Non classés
                <span className="text-xs font-normal text-muted">— glisse-les dans une rangée</span>
              </h2>
              <div className="flex min-h-[7rem] rounded-md border-2 border-dashed border-border">
                <DropZone
                  id={POOL}
                  items={board.pool}
                  onTap={setMenuItem}
                  highlight={active?.type === "pick" && overCid === POOL}
                  empty={
                    <p className="m-auto px-4 py-6 text-center text-xs text-muted">
                      Les animes ajoutés d'un clic arrivent ici.
                    </p>
                  }
                />
              </div>
            </section>
          </div>

          <aside className="xl:sticky xl:top-20 xl:self-start">
            <h2 className="mb-2 text-sm font-bold">Ajouter des animes</h2>
            <AnimePicker has={has} onAdd={addItems} />
          </aside>
        </div>

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {active?.item ? (
              <TierPoster item={active.item} className="rotate-3 shadow-2xl ring-2 ring-primary" />
            ) : active?.tier ? (
              <div className="flex h-12 w-72 items-center rounded-md shadow-2xl ring-2 ring-primary" style={{ background: active.tier.color }}>
                <span className="px-3 text-sm font-bold" style={{ color: readableTextColor(active.tier.color) }}>
                  {active.tier.label || "Rangée"}
                </span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>

      {menuItem && (
        <Modal title={menuItem.title} onClose={() => setMenuItem(null)}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Placer dans</p>
          <div className="space-y-1.5">
            {board.tiers.map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  moveItem(menuItem.slug, tier.id);
                  setMenuItem(null);
                }}
                style={{ background: tier.color, color: readableTextColor(tier.color) }}
                className="flex h-10 w-full items-center rounded-md px-3 text-left text-sm font-bold transition-[filter] hover:brightness-110"
              >
                {tier.label || "Sans nom"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                moveItem(menuItem.slug, POOL);
                setMenuItem(null);
              }}
              className="flex h-10 w-full items-center gap-2 rounded-md bg-white/[0.06] px-3 text-sm font-bold ring-1 ring-border"
            >
              <Inbox size={15} /> Non classés
            </button>
            <button
              type="button"
              onClick={() => {
                removeItem(menuItem.slug);
                setMenuItem(null);
              }}
              className="flex h-10 w-full items-center gap-2 rounded-md bg-primary/15 px-3 text-sm font-bold text-primary ring-1 ring-primary/40"
            >
              <Trash2 size={15} /> Retirer de la tier list
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
