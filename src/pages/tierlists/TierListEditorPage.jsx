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
import { ChevronDown, Eye, EyeOff, GripVertical, Inbox, LayoutTemplate, Loader2, Music, Palette, Plus, Save, Trash2, Tv, UserRound, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { getTierList, saveTierList, tierListErrorMessage } from "@/api/tierLists";
import {
  MAX_ITEMS,
  MAX_TIERS,
  TEMPLATES,
  TIER_COLORS,
  KINDS,
  cloneTiers,
  kindOfTiers,
  makeTier,
  readableTextColor,
  tiersFromTemplate,
} from "@/lib/tierLists";
import SegmentedControl from "@/components/ui/SegmentedControl";
import AnimePicker from "@/components/tierlists/AnimePicker";
import { TierPoster } from "@/components/tierlists/TierBoard";

const POOL = "pool";
const ROW = "row:";

const KIND_OPTIONS = [
  { value: "anime", label: KINDS.anime.label, Icon: Tv },
  { value: "character", label: KINDS.character.label, Icon: UserRound },
  { value: "music", label: KINDS.music.label, Icon: Music },
];

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

function SortablePoster({ item, onTap, selected = false, small = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.slug,
    data: { type: "item" },
  });
  return (
    <TierPoster
      ref={setNodeRef}
      item={item}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, touchAction: "none" }}
      className={`cursor-grab active:cursor-grabbing ${small ? "!w-14 sm:!w-16" : ""} ${
        selected ? "z-[1] scale-105 ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""
      }`}
      onClick={() => onTap(item)}
      {...attributes}
      {...listeners}
    />
  );
}

function DropZone({ id, items, onTap, highlight, className = "", empty, tail, nowrap = false, selected = null, small = false }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "container" } });
  return (
    <SortableContext id={id} items={items.map((it) => it.slug)} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`flex min-w-0 flex-1 gap-0.5 p-0.5 transition-colors ${
          nowrap ? "flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden px-2 py-2" : "flex-wrap content-start"
        } ${isOver || highlight ? "bg-primary/15" : ""} ${className}`}
      >
        {items.map((item) => (
          <SortablePoster key={item.slug} item={item} onTap={onTap} selected={selected === item.slug} small={small} />
        ))}
        {!items.length && empty}
        {tail}
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
          className={`h-7 w-7 rounded ring-2 ring-offset-2 ring-offset-surface ${color === c ? "ring-text" : "ring-transparent"}`}
        />
      ))}
      <label className="relative col-span-6 mt-1 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-surface-2 text-xs font-bold text-muted hover:text-text">
        <span className="h-4 w-4 rounded ring-1 ring-white/30" style={{ background: color }} />
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

/** Menu des modèles de rangées ; se ferme au clic à côté. */
function TemplateMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-12 items-center gap-2 rounded-md bg-surface px-3.5 text-sm font-bold text-text ring-2 ring-border transition-colors hover:ring-primary/60"
      >
        <LayoutTemplate size={16} /> Modèles <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-md bg-surface p-1 shadow-2xl ring-2 ring-border">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                onPick(template);
                setOpen(false);
              }}
              className="flex h-9 w-full items-center rounded px-3 text-left text-sm font-bold text-muted hover:bg-white/[0.06] hover:text-text"
            >
              {template.name}
            </button>
          ))}
          <p className="px-3 pb-1.5 pt-1 text-[0.7rem] leading-snug text-muted">
            Remet les rangées à zéro, les animes sont conservés.
          </p>
        </div>
      )}
    </div>
  );
}

function EditableRow({ tier, index, placing, canDelete, canAdd, highlight, onChange, onInsertBelow, onDelete, onTap, onPlace }) {
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
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? "box-shadow 150ms ease" : transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={`relative flex min-h-[calc(4.5rem*1.4+4px)] border-b-2 border-black bg-black last:border-b-0 sm:min-h-[calc(5.25rem*1.4+4px)] ${
        isDragging ? "shadow-[0_18px_40px_-8px_rgba(0,0,0,0.85)] ring-2 ring-primary" : ""
      }`}
    >
      <label
        className="relative flex w-20 shrink-0 cursor-text items-center justify-center px-1 sm:w-28"
        style={{ background: tier.color }}
        title="Clique pour modifier le texte"
      >
        {placing && index < 10 && (
          <span
            aria-hidden="true"
            className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded bg-black/55 px-1 text-[0.7rem] font-bold tabular-nums text-white"
          >
            {(index + 1) % 10}
          </span>
        )}
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
      <DropZone
        id={tier.id}
        items={tier.items}
        onTap={onTap}
        highlight={highlight}
        className="bg-surface/70"
        tail={
          placing && (
            <button
              type="button"
              onClick={() => onPlace(tier.id)}
              className="flex h-10 items-center gap-1.5 self-center rounded-md border-2 border-dashed border-primary/60 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
            >
              <Plus size={14} /> Placer ici
            </button>
          )
        }
      />
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
  const [publishing, setPublishing] = useState(false);
  const [kind, setKind] = useState(() => (KINDS[params.get("kind")] ? params.get("kind") : "anime"));
  const [selected, setSelected] = useState(null);
  const [trayOpen, setTrayOpen] = useState(true);

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
          setKind(kindOfTiers(list.tiers, list.pool));
        } else {
          setTitle(`Ma version : ${list.title}`.slice(0, 80));
          setForkedFrom(list.id);
          setBoard({ tiers: cloneTiers(list.tiers), pool: [] });
          setKind(kindOfTiers(list.tiers));
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

  // Classement rapide : un élément du bac est sélectionné, un clic sur une rangée (ou sa touche
  // 1-9, 0) l'y pose et sélectionne le suivant.
  const current = board.pool.some((it) => it.slug === selected) ? selected : null;

  const placeSelected = (tierId) => {
    if (!current) return;
    const at = board.pool.findIndex((it) => it.slug === current);
    const rest = board.pool.filter((it) => it.slug !== current);
    moveItem(current, tierId);
    setSelected(rest[Math.min(at, rest.length - 1)]?.slug ?? null);
  };

  const placeRef = useRef(placeSelected);
  placeRef.current = placeSelected;
  const tiersRef = useRef(board.tiers);
  tiersRef.current = board.tiers;
  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (e.ctrlKey || e.metaKey || e.altKey || tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if (!/^[0-9]$/.test(e.key)) return;
      const tier = tiersRef.current[e.key === "0" ? 9 : Number(e.key) - 1];
      if (tier) {
        e.preventDefault();
        placeRef.current(tier.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current]);

  const onDragStart = ({ active: a }) => {
    const type = a.data.current?.type;
    const item =
      type === "pick"
        ? a.data.current.item
        : type === "item"
          ? [...board.pool, ...board.tiers.flatMap((t) => t.items)].find((it) => it.slug === a.id)
          : null;
    setActive({ type, item });
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

  // Une rangée se déplace telle quelle, à la verticale, sans aperçu flottant.
  const rowAxis = ({ active: a, transform }) =>
    a?.data.current?.type === "row" ? { ...transform, x: 0 } : transform;

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
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+3.75rem)] sm:px-8 md:py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-impact truncate text-3xl md:text-4xl">
            {title.trim() || (id ? "Modifier la tier list" : "Nouvelle tier list")}
          </h1>
          <p className="mt-1 text-xs tabular-nums text-muted">
            {ranked} classé{ranked > 1 ? "s" : ""} · {total}/{MAX_ITEMS} {KINDS[kind].many}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 items-center rounded-md px-3 text-sm font-bold text-muted hover:text-text"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => setPublishing(true)}
            className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg transition-[filter] hover:brightness-110 active:scale-95"
          >
            <Save size={16} /> {id ? "Enregistrer" : "Publier"}
          </button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
        modifiers={[rowAxis]}
      >
        <div className="relative z-20 flex flex-wrap items-center gap-2">
          <AnimePicker kind={kind} has={has} onAdd={addItems} className="min-w-[14rem] flex-1" />
          <SegmentedControl
            label="Type de tier list"
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
            className="shrink-0 !h-12"
          />
          <div className="ml-auto flex items-center gap-2">
            {board.tiers.length < MAX_TIERS && (
              <button
                type="button"
                onClick={() =>
                  setBoard((b) => ({ ...b, tiers: [...b.tiers, makeTier("", TIER_COLORS[b.tiers.length % TIER_COLORS.length])] }))
                }
                className="flex h-12 items-center gap-2 rounded-md bg-surface px-3.5 text-sm font-bold text-text ring-2 ring-border transition-colors hover:text-primary hover:ring-primary/60"
              >
                <Plus size={16} /> Rangée
              </button>
            )}
            <TemplateMenu onPick={applyTemplate} />
          </div>
        </div>

        <div className="mt-4 min-w-0 space-y-4">
          <div className="overflow-visible rounded-md bg-black ring-2 ring-border">
            <SortableContext items={board.tiers.map((t) => ROW + t.id)} strategy={verticalListSortingStrategy}>
              {board.tiers.map((tier, index) => (
                <EditableRow
                  key={tier.id}
                  tier={tier}
                  index={index}
                  placing={Boolean(current)}
                  onPlace={placeSelected}
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

        </div>

        <section
          aria-label="Non classés"
          className="sticky bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 mt-4 rounded-md bg-surface shadow-2xl ring-2 ring-border md:bottom-3"
        >
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <Inbox size={14} className="shrink-0 text-primary" />
            <span className="shrink-0 font-bold text-text">Non classés ({board.pool.length})</span>
            <span className="min-w-0 flex-1 truncate text-muted">
              {current
                ? `Clique une rangée ou tape sa touche (1${board.tiers.length > 1 ? `–${board.tiers.length >= 10 ? "9, 0" : board.tiers.length}` : ""}) · Échap pour annuler`
                : board.pool.length
                  ? "Clique un élément puis une rangée, ou glisse-le."
                  : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setTrayOpen((v) => !v);
              }}
              aria-expanded={trayOpen}
              aria-label={trayOpen ? "Masquer les non classés" : "Afficher les non classés"}
              title={trayOpen ? "Masquer" : "Afficher"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white/10 hover:text-text"
            >
              <ChevronDown size={16} className={`transition-transform ${trayOpen ? "" : "rotate-180"}`} />
            </button>
          </div>
          {trayOpen && (
            <div className={`flex px-1 pb-1 ${board.pool.length ? "min-h-[6.5rem]" : "min-h-[3rem]"}`}>
              <DropZone
                id={POOL}
                items={board.pool}
                onTap={(item) => setSelected((cur) => (cur === item.slug ? null : item.slug))}
                highlight={active?.type === "pick" && overCid === POOL}
                nowrap
                small
                selected={current}
                className={board.pool.length ? "min-h-[5.5rem]" : "min-h-[2.5rem]"}
                empty={
                  <p className="m-auto px-4 text-center text-xs text-muted">
                    Ajoute des {KINDS[kind].many} avec la recherche : ils arrivent ici.
                  </p>
                }
              />
            </div>
          )}
        </section>

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {active?.item ? (
              <TierPoster item={active.item} className="rotate-3 shadow-2xl ring-2 ring-primary" />
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>

      {publishing && (
        <Modal title={id ? "Enregistrer la tier list" : "Publier la tier list"} onClose={() => !saving && setPublishing(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Titre</span>
              <input
                value={title}
                maxLength={80}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : Mes animes de 2026"
                className="h-11 w-full rounded-md bg-bg/60 px-3 text-sm font-bold outline-none ring-2 ring-border placeholder:font-normal placeholder:text-muted focus:ring-primary/70"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                Description <span className="font-medium normal-case tracking-normal text-muted/60">(facultatif)</span>
              </span>
              <textarea
                value={description}
                maxLength={500}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explique ton classement en quelques mots"
                className="w-full resize-none rounded-md bg-bg/60 px-3 py-2 text-sm outline-none ring-2 ring-border placeholder:text-muted focus:ring-primary/70"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Visibilité</span>
              <SegmentedControl
                label="Visibilité"
                options={[
                  { value: "public", label: "Publique", Icon: Eye },
                  { value: "draft", label: "Brouillon", Icon: EyeOff },
                ]}
                value={isPublic ? "public" : "draft"}
                onChange={(value) => setIsPublic(value === "public")}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPublishing(false)}
                disabled={saving}
                className="flex h-10 items-center rounded-md px-3 text-sm font-bold text-muted hover:text-text"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg transition-[filter] hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isPublic ? (id ? "Enregistrer" : "Publier") : "Enregistrer le brouillon"}
              </button>
            </div>
          </div>
        </Modal>
      )}

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
              className="flex h-10 w-full items-center gap-2 rounded-md bg-surface-2 px-3 text-sm font-bold"
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
