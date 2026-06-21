import { useEffect, useMemo, useRef, useState } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ChevronDown,
  FileText,
  Inbox,
  KeyRound,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { useItems } from "../lib/items-store";
import { categoryColor, categoryTile } from "../lib/category-color";
import { fileToTemp } from "../lib/ipc";
import { useCopy } from "../lib/use-copy";
import { usePreview } from "../lib/use-preview";
import { CopyMorph } from "../components/CopyMorph";
import { ConfidentialFrost } from "../components/Generative";
import { ItemMenu } from "../components/ItemMenu";
import { ItemRow } from "../components/ItemRow";
import { RollNumber } from "../components/RollNumber";
import { DitherArt } from "../components/DitherArt";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

type SortMode = "recent" | "name";
type KindFilter = "all" | "text" | "files" | "confidential";

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Short date for the header pill (e.g. "Mon · 22 Jun").
function formatDatePill(date: Date): string {
  const wd = date.toLocaleDateString(undefined, { weekday: "short" });
  const dm = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `${wd} · ${dm}`;
}

function matchesQuery(item: Item, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    item.category.toLowerCase().includes(needle)
  );
}

function matchesKind(item: Item, kind: KindFilter): boolean {
  switch (kind) {
    case "text":
      return item.kind === "Text";
    case "files":
      return item.kind === "File";
    case "confidential":
      return item.confidential;
    default:
      return true;
  }
}

// Subtle fade + small upward slide stagger on mount (35ms stagger, --dur-std,
// --ease-out). Reduced-motion swaps in fade-only variants.
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
const childVariants = {
  hidden: { opacity: 0, y: 7 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const },
  },
};
const childVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.22 } },
};

// Bento tiles use static CSS-grid placement — no Framer `layout` morph, which
// glitched the grid on add/remove/filter. Filtering repositions instantly.

export function Home() {
  const {
    items,
    query,
    reload,
    loading,
    error,
    categoryFilter,
    setCategoryFilter,
    selectedItemId,
    setSelectedItemId,
    setAddOpen,
  } = useItems();
  const reduce = useReducedMotion();
  const now = useMemo(() => new Date(), []);

  const [sort, setSort] = useState<SortMode>("recent");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const cardVariants = reduce ? childVariantsReduced : childVariants;

  // Track the most-recently-added item so its row can play a one-shot
  // add-success highlight.
  const latestId = useMemo(() => {
    if (items.length === 0) return null;
    return items.reduce((a, b) => (b.created_at > a.created_at ? b : a)).id;
  }, [items]);

  const [flashId, setFlashId] = useState<string | null>(null);
  const seenLatest = useRef<string | null>(null);
  const firstPass = useRef(true);

  useEffect(() => {
    if (firstPass.current) {
      firstPass.current = false;
      seenLatest.current = latestId;
      return;
    }
    if (latestId && latestId !== seenLatest.current) {
      seenLatest.current = latestId;
      setFlashId(latestId);
      const t = window.setTimeout(() => setFlashId(null), 700);
      return () => window.clearTimeout(t);
    }
  }, [latestId]);

  // Sidebar sub-item click sets `selectedItemId`: ensure its category is
  // expanded, scroll the matching row into view and flash it.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedItemId) return;
    const target = items.find((i) => i.id === selectedItemId);
    if (target) {
      // Auto-expand the category so the row is mounted before we scroll to it.
      setExpanded((prev) => ({ ...prev, [target.category]: true }));
    }
    const scroll = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(selectedItemId)}"]`,
      );
      if (el) {
        el.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "center",
        });
      }
    }, 60);
    setFlashId(selectedItemId);
    const clear = window.setTimeout(() => setFlashId(null), 900);
    const release = window.setTimeout(() => setSelectedItemId(null), 1000);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
      window.clearTimeout(release);
    };
  }, [selectedItemId, reduce, setSelectedItemId, items]);

  // Client-side filter (search + category + kind chip) then sort.
  const filtered = useMemo(() => {
    const list = items.filter(
      (i) =>
        matchesQuery(i, query) &&
        (categoryFilter === null || i.category === categoryFilter) &&
        matchesKind(i, kindFilter),
    );
    return list.sort((a, b) =>
      sort === "name"
        ? a.label.localeCompare(b.label)
        : b.last_used_at - a.last_used_at || b.created_at - a.created_at,
    );
  }, [items, query, categoryFilter, kindFilter, sort]);

  const pinned = useMemo(() => filtered.filter((i) => i.pinned), [filtered]);

  // IA: pinned items live ONLY in Quick access; the Library category groups
  // show NON-pinned items (no duplication).
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of filtered) {
      if (item.pinned) continue;
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const fileCount = useMemo(
    () => items.filter((i) => i.kind === "File").length,
    [items],
  );
  const confidentialCount = useMemo(
    () => items.filter((i) => i.confidential).length,
    [items],
  );

  // Bento Quick-access composition: a hero (the top pinned/most-used), then a
  // file tile (first pinned File for the dither cover), then compact tiles.
  const heroItem = pinned[0] ?? null;
  const restPinned = pinned.slice(1);
  const fileTile = restPinned.find((i) => i.kind === "File") ?? null;
  const compact = restPinned.filter((i) => i.id !== fileTile?.id).slice(0, 4);

  const isFilteredEmpty =
    !!query || kindFilter !== "all" || categoryFilter !== null;

  return (
    <div style={{ padding: "30px 30px 48px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* ── Redesigned header: tighter two-tone greeting + date pill ── */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.625rem",
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {(() => {
              const parts = greeting(now).split(" ");
              const first = parts.shift() ?? "";
              const rest = parts.join(" ");
              return (
                <>
                  {first}{" "}
                  <span style={{ color: "#c4c4c6" }}>{rest}</span>
                </>
              );
            })()}
          </h1>
          <p
            className="tabular"
            style={{
              fontSize: "0.8125rem",
              color: "var(--muted)",
              margin: "0.25rem 0 0",
            }}
          >
            {items.length} {items.length === 1 ? "thing" : "things"} about you,
            one keystroke away
          </p>
        </div>
        <span
          className="tabular"
          style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "#aeaeb2",
            whiteSpace: "nowrap",
            background: "#f6f6f5",
            borderRadius: "9px",
            padding: "0.375rem 0.6875rem",
          }}
        >
          {formatDatePill(now)}
        </span>
      </header>

      {/* ── Unified control toolbar: segmented sort · divider · filter pills ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1.75rem",
        }}
      >
        <div className="qb-toolbar" role="group" aria-label="Sort and filter">
          {/* Segmented sort */}
          <div className="qb-seg" role="group" aria-label="Sort">
            {(["recent", "name"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="qb-seg-btn qb-press"
                aria-pressed={sort === mode}
                onClick={() => setSort(mode)}
              >
                {mode === "recent" ? "Recent" : "Name"}
              </button>
            ))}
          </div>

          <span aria-hidden="true" className="qb-toolbar-div" />

          {/* Filter pills */}
          <div style={{ display: "inline-flex", gap: "0.25rem" }}>
            {(
              [
                ["all", "All"],
                ["text", "Text"],
                ["files", "Files"],
                ["confidential", "Confidential"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="qb-fpill qb-press"
                aria-pressed={kindFilter === key}
                onClick={() => setKindFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Active category filter chip (set from the Sidebar). Click to clear. */}
        {categoryFilter !== null && (
          <button
            type="button"
            className="qb-press"
            onClick={() => setCategoryFilter(null)}
            aria-label={`Clear filter: ${categoryFilter}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.4rem 0.5rem 0.4rem 0.65rem",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              boxShadow: "var(--shadow-sm)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--ink)",
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "-0.01em",
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: categoryColor(categoryFilter),
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>Filtered:</span>
            {categoryFilter}
            <X size={14} color="var(--muted)" />
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--amber)",
            marginBottom: "1.5rem",
          }}
        >
          Could not load items: {error}
        </div>
      )}

      <LayoutGroup id="home-items">
        {/* ── Bento Quick access ── */}
        {pinned.length > 0 && heroItem && (
          <section style={{ marginBottom: "2.5rem" }}>
            <SectionLabel>Quick access</SectionLabel>
            <motion.div
              className="qb-bento"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {/* Hero tile (2×2) */}
              <BentoHero
                item={heroItem}
                variants={cardVariants}
                reduce={!!reduce}
                onChanged={reload}
              />

              {/* File dither-cover tile (monochrome), if a pinned File exists */}
              {fileTile && (
                <BentoFile
                  item={fileTile}
                  variants={cardVariants}
                  onChanged={reload}
                />
              )}

              {/* Compact tiles */}
              {compact.map((item) => (
                <BentoCompact
                  key={item.id}
                  item={item}
                  variants={cardVariants}
                  onChanged={reload}
                />
              ))}

              {/* "Mint item" add tile */}
              <motion.button
                type="button"
                variants={cardVariants}
                className="qb-bento-tile qb-bento-add"
                onClick={() => setAddOpen(true)}
              >
                <Plus size={16} />
                <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                  Mint item
                </span>
              </motion.button>
            </motion.div>
          </section>
        )}

        {/* ── Library: wallet-style collapsible categories ── */}
        <section>
          <SectionLabel>Library</SectionLabel>

          {loading && items.length === 0 ? (
            <div style={{ fontSize: "0.9375rem", color: "var(--muted)" }}>
              Loading…
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              filtered={isFilteredEmpty}
              title={
                query || kindFilter !== "all"
                  ? "Nothing matches your filters"
                  : categoryFilter !== null
                    ? `No items in ${categoryFilter}`
                    : "Mint your first item"
              }
              body={
                query || kindFilter !== "all"
                  ? "Try clearing a filter or searching for something else."
                  : categoryFilter !== null
                    ? "This category is empty for now."
                    : "Store a snippet or a file — encrypted locally, one keystroke away."
              }
              onMint={isFilteredEmpty ? undefined : () => setAddOpen(true)}
            />
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {grouped.map(([category, rows]) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  rows={rows}
                  expanded={expanded[category] ?? false}
                  onToggle={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [category]: !(prev[category] ?? false),
                    }))
                  }
                  reduce={!!reduce}
                  cardVariants={cardVariants}
                  flashId={flashId}
                  onChanged={reload}
                />
              ))}
            </motion.div>
          )}
        </section>
      </LayoutGroup>

      {/* Meta footer — amber "N confidential" badge (a meaningful signal). */}
      {items.length > 0 && (
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.1rem",
            borderTop: "1px solid var(--hair)",
            fontSize: "0.78rem",
            color: "var(--faint)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>
            <RollNumber value={items.length} />{" "}
            {items.length === 1 ? "item" : "items"} ·{" "}
            <RollNumber value={fileCount} />{" "}
            {fileCount === 1 ? "file" : "files"} ·
          </span>
          {confidentialCount > 0 ? (
            <span
              className="tabular"
              style={{
                color: "#b45309",
                background: "#fef0d9",
                borderRadius: "7px",
                padding: "0.1rem 0.5rem",
                fontWeight: 700,
                fontSize: "0.69rem",
              }}
            >
              {confidentialCount} confidential
            </span>
          ) : (
            <span>
              <RollNumber value={confidentialCount} /> confidential
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--faint)",
        marginBottom: "0.9rem",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Empty-state panel — minimal & MONOCHROME (ink-first). A small Lucide icon in a
 * neutral `--hair` tile, the headline (Plus Jakarta), a muted subline, and — for
 * the whole-app empty state — a "Mint your first item" button. NO gradient: the
 * gradient shader is reserved for the ONE minting-sheet brand panel.
 */
function EmptyState({
  title,
  body,
  onMint,
}: {
  filtered: boolean;
  title: string;
  body: string;
  onMint?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "1rem",
        padding: "2.75rem 1.5rem 3rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Neutral monochrome tile + small icon. */}
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "44px",
          height: "44px",
          borderRadius: "var(--r-tile)",
          background: "var(--hair)",
          color: "var(--muted)",
        }}
      >
        <Inbox size={20} strokeWidth={1.75} />
      </span>

      <div style={{ maxWidth: "24rem" }}>
        <div
          style={{
            fontSize: "1.0625rem",
            fontWeight: 700,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <p
          style={{
            margin: "0.4rem 0 0",
            fontSize: "0.8125rem",
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      </div>

      {onMint && (
        <button
          type="button"
          className="qb-press"
          onClick={onMint}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            minHeight: "40px",
            padding: "0.55rem 1rem",
            marginTop: "0.25rem",
            background: "var(--ink)",
            color: "#fff",
            border: "none",
            borderRadius: "11px",
            fontFamily: "inherit",
            fontSize: "0.8125rem",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            cursor: "pointer",
          }}
        >
          <Plus size={15} />
          Mint your first item
        </button>
      )}
    </div>
  );
}

// ── Wallet-style collapsible category ──────────────────────────────────────
function CategoryGroup({
  category,
  rows,
  expanded,
  onToggle,
  reduce,
  cardVariants,
  flashId,
  onChanged,
}: {
  category: string;
  rows: Item[];
  expanded: boolean;
  onToggle: () => void;
  reduce: boolean;
  cardVariants: typeof childVariants | typeof childVariantsReduced;
  flashId: string | null;
  onChanged: () => void | Promise<void>;
}) {
  return (
    <motion.div
      variants={cardVariants}
      layout={reduce ? undefined : true}
      transition={reduce ? undefined : { layout: { duration: 0.28, ease: [0.23, 1, 0.32, 1] } }}
      style={{ marginBottom: "1.5rem", position: "relative" }}
    >
      {/* The deck↔list swap crossfades with a small blur bridge (two different
          layouts read as one morph), while `layout` above animates the height
          change both ways so nothing snaps. Rows stagger in on expand. */}
      <AnimatePresence initial={false} mode="popLayout">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {/* Header shown only while expanded — click to collapse to the deck. */}
            <button
              type="button"
              className="qb-ghead"
              aria-expanded={true}
              onClick={onToggle}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: categoryColor(category),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  color: "var(--ink)",
                  letterSpacing: "-0.01em",
                }}
              >
                {category}
              </span>
              <span
                className="tabular"
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--muted)",
                  background: "#f3f3f2",
                  borderRadius: "999px",
                  padding: "0.05rem 0.45rem",
                  minWidth: "20px",
                  textAlign: "center",
                }}
              >
                {rows.length}
              </span>
              <span className="qb-chevron" data-expanded={true} style={{ marginLeft: "auto" }}>
                <ChevronDown size={17} />
              </span>
            </button>
            <motion.div
              className="qb-group"
              variants={reduce ? undefined : containerVariants}
              initial={reduce ? false : "hidden"}
              animate={reduce ? false : "show"}
            >
              {rows.map((item) => (
                <motion.div
                  key={item.id}
                  variants={reduce ? undefined : cardVariants}
                  data-item-id={item.id}
                  style={{ position: "relative" }}
                >
                  <ItemRow
                    item={item}
                    onChanged={onChanged}
                    justAdded={item.id === flashId}
                  />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="deck"
            initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985, filter: "blur(4px)" }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <CategoryDeck
              category={category}
              count={rows.length}
              color={categoryColor(category)}
              onExpand={onToggle}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Collapsed category as a wallet deck — a small fanned stack representing the
 * whole category (name + item count). Click anywhere to expand to the list.
 */
function CategoryDeck({
  category,
  count,
  color,
  onExpand,
}: {
  category: string;
  count: number;
  color: string;
  onExpand: () => void;
}) {
  // How many shadow cards fan out behind the top (0–2), hinting at depth.
  const layers = Math.min(2, Math.max(0, count - 1));

  return (
    <div
      className="qb-deck"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      style={{ marginBottom: "0.5rem" }}
    >
      {layers >= 2 && (
        <div
          className="qb-deck-card"
          style={{ top: "-12px", transform: "scale(0.95)", opacity: 0.5, height: "62px" }}
        />
      )}
      {layers >= 1 && (
        <div
          className="qb-deck-card"
          style={{ top: "-6px", transform: "scale(0.975)", opacity: 0.8, height: "62px" }}
        />
      )}

      {/* Top card — the category itself. */}
      <div className="qb-deck-card qb-deck-top" style={{ top: 0 }}>
        <span
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 700,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {category}
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--muted)",
              marginTop: "1px",
            }}
          >
            {count === 1 ? "1 item" : `${count} items`}
          </div>
        </div>
        <span className="qb-chevron" style={{ color: "var(--faint)", marginLeft: "auto" }}>
          <ChevronDown size={17} />
        </span>
      </div>
    </div>
  );
}

// ── Bento tiles ─────────────────────────────────────────────────────────────
/** Hero (2×2): the top pinned / most-used item. MONOCHROME seal. */
function BentoHero({
  item,
  variants,
  reduce,
  onChanged,
}: {
  item: Item;
  variants: typeof childVariants | typeof childVariantsReduced;
  reduce: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const tile = categoryTile(item.category, item.confidential);
  const { copied, copy } = useCopy(item.id);
  const { preview, confidential } = usePreview(item);
  const isText = item.kind === "Text";

  async function handleDragStart(event: React.DragEvent) {
    event.preventDefault();
    try {
      const path = await fileToTemp(item.id);
      await startDrag({ item: [path], icon: path });
    } catch {
      /* drag-out is best-effort */
    }
  }

  return (
    <motion.div
      variants={variants}
      className="qb-bento-tile qb-bento-hero"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          className="qb-tile"
          style={{
            position: "relative",
            width: "44px",
            height: "44px",
            borderRadius: "var(--r-tile)",
            background: tile.bg,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: tile.fg,
            flexShrink: 0,
          }}
        >
          <DitherArt
            width={44}
            height={44}
            density={0.95}
            seed={item.label}
            style={{
              position: "absolute",
              inset: 0,
              width: "44px",
              height: "44px",
              opacity: 0.32,
            }}
          />
          <span style={{ position: "relative", zIndex: 1 }}>
            {item.confidential ? <Lock size={20} /> : <KeyRound size={20} />}
          </span>
        </span>
        <ItemMenu item={item} onChanged={onChanged} />
      </div>

      <div style={{ marginTop: "0.7rem", minWidth: 0 }}>
        <div
          style={{
            fontSize: "1.0625rem",
            fontWeight: 800,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </div>
        {confidential ? (
          <div style={{ marginTop: "4px" }}>
            <ConfidentialFrost width={150} />
          </div>
        ) : (
          <div
            className={preview ? "tabular" : undefined}
            style={{
              fontSize: "0.8125rem",
              fontFamily: preview
                ? "ui-monospace, SFMono-Regular, monospace"
                : "inherit",
              color: "var(--muted)",
              marginTop: "4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: preview ? "0.02em" : "0",
            }}
          >
            {preview ?? (isText ? "Text snippet" : `File · ${item.category}`)}
          </div>
        )}
      </div>

      <div style={{ marginTop: "auto", paddingTop: "0.7rem" }}>
        {isText ? (
          <button
            type="button"
            onClick={() => void copy()}
            className={cn("qb-glass-btn", copied && "text-[var(--green)]")}
          >
            <CopyMorph copied={copied} reduce={reduce} />
          </button>
        ) : (
          <button
            type="button"
            draggable
            onDragStart={handleDragStart}
            className="qb-glass-btn cursor-grab"
          >
            <FileText size={14} />
            drag out
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** File tile — MONOCHROME dither cover band (inverse on dark), label + meta. */
function BentoFile({
  item,
  variants,
  onChanged,
}: {
  item: Item;
  variants: typeof childVariants | typeof childVariantsReduced;
  onChanged: () => void | Promise<void>;
}) {
  async function handleDragStart(event: React.DragEvent) {
    event.preventDefault();
    try {
      const path = await fileToTemp(item.id);
      await startDrag({ item: [path], icon: path });
    } catch {
      /* drag-out is best-effort */
    }
  }

  return (
    <motion.div
      variants={variants}
      className="qb-bento-tile qb-bento-file qb-img-outline"
      style={{ color: "#fff" }}
    >
      <div
        draggable
        onDragStart={handleDragStart}
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "flex-end",
          padding: "0.6875rem",
          overflow: "hidden",
          cursor: "grab",
        }}
      >
        <DitherInverse seed={item.label} />
        <span
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: "0.8125rem",
            fontWeight: 700,
            color: "#fff",
            textShadow: "0 1px 4px rgba(0,0,0,.5)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </span>
        <span
          className="qb-cover-menu"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "0.4rem", right: "0.4rem", zIndex: 2 }}
        >
          <ItemMenu item={item} onChanged={onChanged} />
        </span>
      </div>
      <div
        style={{
          padding: "0.5rem 0.75rem",
          fontSize: "0.6875rem",
          color: "#a8a8ac",
        }}
      >
        File · {item.category}
      </div>
    </motion.div>
  );
}

/** Compact tile — small seal + label + snippet line. MONOCHROME. */
function BentoCompact({
  item,
  variants,
  onChanged,
}: {
  item: Item;
  variants: typeof childVariants | typeof childVariantsReduced;
  onChanged: () => void | Promise<void>;
}) {
  const tile = categoryTile(item.category, item.confidential);
  const { preview, confidential } = usePreview(item);
  const isText = item.kind === "Text";
  const { copied, copy } = useCopy(item.id);

  async function handleDragStart(event: React.DragEvent) {
    event.preventDefault();
    try {
      const path = await fileToTemp(item.id);
      await startDrag({ item: [path], icon: path });
    } catch {
      /* drag-out is best-effort */
    }
  }

  return (
    <motion.div
      variants={variants}
      className="qb-bento-tile"
      role={isText ? "button" : undefined}
      tabIndex={isText ? 0 : undefined}
      onClick={isText ? () => void copy() : undefined}
      onKeyDown={
        isText
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void copy();
              }
            }
          : undefined
      }
      style={{ cursor: isText ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          className="qb-tile"
          draggable={!isText}
          onDragStart={!isText ? handleDragStart : undefined}
          style={{
            position: "relative",
            width: "32px",
            height: "32px",
            borderRadius: "var(--r-tile)",
            background: tile.bg,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: tile.fg,
            flexShrink: 0,
            cursor: isText ? undefined : "grab",
          }}
        >
          <DitherArt
            width={32}
            height={32}
            density={0.95}
            seed={item.label}
            style={{
              position: "absolute",
              inset: 0,
              width: "32px",
              height: "32px",
              opacity: 0.32,
            }}
          />
          <span style={{ position: "relative", zIndex: 1 }}>
            {item.confidential ? (
              <Lock size={15} />
            ) : isText ? (
              <KeyRound size={15} />
            ) : (
              <FileText size={15} />
            )}
          </span>
        </span>
        <span
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ItemMenu item={item} onChanged={onChanged} />
        </span>
      </div>
      <div style={{ marginTop: "auto", minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.84rem",
            fontWeight: 800,
            color: "var(--ink)",
            letterSpacing: "-0.015em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </div>
        <div
          className={preview && !confidential ? "tabular" : undefined}
          style={{
            fontSize: "0.6875rem",
            color: "var(--muted)",
            marginTop: "1px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily:
              preview && !confidential
                ? "ui-monospace, SFMono-Regular, monospace"
                : "inherit",
          }}
        >
          {copied ? (
            <span style={{ color: "var(--green)", fontWeight: 600 }}>Copied</span>
          ) : confidential ? (
            "confidential"
          ) : (
            preview ?? (isText ? "snippet" : item.category)
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Inverted seeded dither used on dark file-cover bands: same generative
 * MONOCHROME pattern as the tiles, rendered white-on-dark via a CSS filter.
 */
function DitherInverse({ seed }: { seed: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.55,
        filter: "invert(1)",
        maskImage:
          "radial-gradient(120% 90% at 30% 20%, #000 30%, transparent 78%)",
        WebkitMaskImage:
          "radial-gradient(120% 90% at 30% 20%, #000 30%, transparent 78%)",
      }}
    >
      <DitherArt
        width={200}
        height={120}
        density={1.05}
        seed={seed}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}
