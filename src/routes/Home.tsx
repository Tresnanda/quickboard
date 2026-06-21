import { useEffect, useMemo, useRef, useState } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  KeyRound,
  Lock,
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

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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

// Shared-layout morph timing (pin fly-to-Quick-access + filter FLIP reflow):
// --dur-slow (0.36s) on the --ease-morph curve. Passed to Framer Motion's
// `layout` transition. Reduced motion disables `layout` entirely (instant
// reposition / cross-fade), so this curve only applies to the full path.
const MORPH_TRANSITION = {
  layout: { duration: 0.36, ease: [0.77, 0, 0.175, 1] as const },
};

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
  } = useItems();
  const reduce = useReducedMotion();
  const now = useMemo(() => new Date(), []);

  const [sort, setSort] = useState<SortMode>("recent");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const cardVariants = reduce ? childVariantsReduced : childVariants;

  // Track the most-recently-added item so its row can play a one-shot
  // add-success highlight. We key off the newest created_at; when that id
  // changes we mark it for a single flash, then clear it.
  const latestId = useMemo(() => {
    if (items.length === 0) return null;
    return items.reduce((a, b) => (b.created_at > a.created_at ? b : a)).id;
  }, [items]);

  const [flashId, setFlashId] = useState<string | null>(null);
  const seenLatest = useRef<string | null>(null);
  const firstPass = useRef(true);

  useEffect(() => {
    if (firstPass.current) {
      // Don't flash the existing newest item on initial load.
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

  // Sidebar sub-item click sets `selectedItemId`: scroll the matching row into
  // view and flash it, then clear the one-shot selection.
  useEffect(() => {
    if (!selectedItemId) return;
    const el = document.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(selectedItemId)}"]`,
    );
    if (el) {
      el.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "center",
      });
    }
    setFlashId(selectedItemId);
    const clear = window.setTimeout(() => setFlashId(null), 900);
    const release = window.setTimeout(() => setSelectedItemId(null), 1000);
    return () => {
      window.clearTimeout(clear);
      window.clearTimeout(release);
    };
    // Runs when the sidebar selects an item; the row carries a data-item-id.
  }, [selectedItemId, reduce, setSelectedItemId]);

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
  // show NON-pinned items (no duplication). Toggling `pinned` moves an item
  // between the two regions, which the shared `layoutId` morphs.
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

  return (
    <div style={{ padding: "30px 30px 48px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.4rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.8125rem",
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-0.02em",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {(() => {
              // Two-tone heading: dim the second word (e.g. "Good evening").
              const parts = greeting(now).split(" ");
              const first = parts.shift() ?? "";
              const rest = parts.join(" ");
              return (
                <>
                  {first}{" "}
                  <span style={{ color: "#bcbcbe" }}>{rest}</span>
                </>
              );
            })()}
          </h1>
          <p
            className="tabular"
            style={{
              fontSize: "0.875rem",
              color: "var(--muted)",
              margin: "0.4rem 0 0",
            }}
          >
            {items.length} {items.length === 1 ? "thing" : "things"} about you,
            one keystroke away
          </p>
        </div>
        <span
          className="tabular"
          style={{
            fontSize: "0.8125rem",
            color: "var(--faint)",
            whiteSpace: "nowrap",
            paddingTop: "0.5rem",
          }}
        >
          {formatDate(now)}
        </span>
      </header>

      {/* Controls row — sort + kind filter chips (client-side, instant) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1.75rem",
        }}
      >
        {/* Sort segmented control */}
        <div
          role="group"
          aria-label="Sort"
          style={{
            display: "inline-flex",
            padding: "3px",
            background: "#f1f1ef",
            borderRadius: "9px",
          }}
        >
          {(["recent", "name"] as const).map((mode) => {
            const active = sort === mode;
            return (
              <button
                key={mode}
                type="button"
                className="qb-press"
                aria-pressed={active}
                onClick={() => setSort(mode)}
                style={{
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: active ? "var(--ink)" : "var(--muted)",
                  background: active ? "#ffffff" : "transparent",
                  border: "none",
                  // Concentric: inner radius = outer (9px) − padding (3px) = 6px.
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                  transition: "color 140ms var(--ease-out)",
                }}
              >
                {mode === "recent" ? "Recent" : "Name"}
              </button>
            );
          })}
        </div>

        {/* Kind filter chips */}
        <div style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {(
            [
              ["all", "All"],
              ["text", "Text"],
              ["files", "Files"],
              ["confidential", "Confidential"],
            ] as const
          ).map(([key, label]) => {
            const active = kindFilter === key;
            return (
              <button
                key={key}
                type="button"
                className="qb-press"
                aria-pressed={active}
                onClick={() => setKindFilter(key)}
                style={{
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: active ? "#ffffff" : "var(--text)",
                  background: active ? "var(--ink)" : "var(--card)",
                  border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                  boxShadow: active ? "none" : "var(--shadow-sm)",
                  transition: "color 140ms var(--ease-out), background 140ms var(--ease-out)",
                }}
              >
                {label}
              </button>
            );
          })}
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
              padding: "0.35rem 0.5rem 0.35rem 0.65rem",
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

      {/* Quick access + Library share one LayoutGroup so a pinned item morphs
          (shared layoutId) between its Library row and its Quick-access card,
          and library rows FLIP-reflow when the filter changes. */}
      <LayoutGroup id="home-items">
        {/* Quick access */}
        {pinned.length > 0 && (
          <section style={{ marginBottom: "2.5rem" }}>
            <SectionLabel>Quick access</SectionLabel>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "0.8125rem",
              }}
            >
              {pinned.map((item) => (
                <QuickCard
                  key={item.id}
                  item={item}
                  variants={cardVariants}
                  reduce={!!reduce}
                  onChanged={reload}
                />
              ))}
            </motion.div>
          </section>
        )}

        {/* Library */}
        <section>
          <SectionLabel>Library</SectionLabel>

          {loading && items.length === 0 ? (
            <div style={{ fontSize: "0.9375rem", color: "var(--muted)" }}>
              Loading…
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              filtered={!!query || kindFilter !== "all" || categoryFilter !== null}
              title={
                query || kindFilter !== "all"
                  ? "Nothing matches your filters"
                  : categoryFilter !== null
                    ? `No items in ${categoryFilter}`
                    : "No items yet"
              }
              body={
                query || kindFilter !== "all"
                  ? "Try clearing a filter or searching for something else."
                  : categoryFilter !== null
                    ? "This category is empty for now."
                    : "Add your first with the button on the left."
              }
            />
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {grouped.map(([category, rows]) => (
                <div key={category} style={{ marginBottom: "2rem" }}>
                  {/* Group header with colored dot, label, count badge */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      marginBottom: "0.7rem",
                    }}
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
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "999px",
                        padding: "0.05rem 0.4rem",
                        minWidth: "20px",
                        textAlign: "center",
                      }}
                    >
                      {rows.length}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        height: "1px",
                        background: "var(--hair)",
                        marginLeft: "0.25rem",
                      }}
                    />
                  </div>

                  {/* iOS grouped-inset container: rows are hairline-divided
                      inside one rounded, soft-shadowed surface. */}
                  <div className="qb-group">
                    {rows.map((item) => (
                      <motion.div
                        key={item.id}
                        data-item-id={item.id}
                        // Shared id with the Quick-access card: pin toggle morphs
                        // this row into / out of the grid. `layout` also drives
                        // the FLIP reflow when the search filter changes the set.
                        layoutId={reduce ? undefined : item.id}
                        layout={reduce ? false : "position"}
                        variants={cardVariants}
                        transition={MORPH_TRANSITION}
                        style={{ position: "relative" }}
                      >
                        <ItemRow
                          item={item}
                          onChanged={reload}
                          justAdded={item.id === flashId}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
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
 * Empty-state panel with a tasteful monochrome dither illustration (R2.5).
 * Soft, low-contrast, ink-first — no color.
 */
function EmptyState({
  title,
  body,
}: {
  filtered: boolean;
  title: string;
  body: string;
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
        padding: "3rem 1.5rem 3.5rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Real ordered-Bayer-dither illustration (ink-first, monochrome).
          Subtle pure-black low-opacity outline keeps the image from floating. */}
      <div
        className="qb-img-outline"
        style={{
          width: "132px",
          height: "132px",
          borderRadius: "22px",
          overflow: "hidden",
          background: "#fafafa",
        }}
      >
        <DitherArt width={132} height={132} density={1.1} />
      </div>
      <div style={{ maxWidth: "22rem" }}>
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
            fontSize: "0.875rem",
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function QuickCard({
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
  const isText = item.kind === "Text";
  const isFile = item.kind === "File";
  const tile = categoryTile(item.category, item.confidential);
  const { copied, copy } = useCopy(item.id);
  const { preview, confidential } = usePreview(item);

  async function handleDragStart(event: React.DragEvent) {
    // R3: gate copy/reveal behind Touch ID
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
      // Shared id with the Library row so a pin toggle morphs the element
      // between the row and this card shape. Inner content cross-fades.
      layoutId={reduce ? undefined : item.id}
      layout={reduce ? false : true}
      variants={variants}
      transition={MORPH_TRANSITION}
      className="qb-quick-card"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        borderRadius: "var(--r-card)",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* FILE: generative dither cover band (larger seeded art, like the mock). */}
      {isFile && (
        <motion.div
          layout={reduce ? false : "position"}
          className="qb-img-outline"
          style={{
            position: "relative",
            height: "78px",
            background: "#16161a",
            overflow: "hidden",
            display: "flex",
            alignItems: "flex-end",
            padding: "0.625rem 0.8125rem",
          }}
        >
          <DitherInverse seed={item.label} />
          <span
            style={{
              position: "relative",
              zIndex: 1,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#ffffff",
              textShadow: "0 1px 4px rgba(0,0,0,.5)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.label}
          </span>
          {/* ⋯ floats over the cover, top-right (recolored light for contrast). */}
          <span
            className="qb-cover-menu"
            style={{ position: "absolute", top: "0.4rem", right: "0.4rem", zIndex: 2 }}
          >
            <ItemMenu item={item} onChanged={onChanged} />
          </span>
        </motion.div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: isFile ? "0.8125rem 0.9rem 0.9rem" : "0.9rem",
        }}
      >
        {/* TEXT / CONFIDENTIAL: tile + ⋯ row (file cover already has its own). */}
        {!isFile && (
          <motion.div
            // Cross-fade the differing inner bits while the outer box morphs.
            layout={reduce ? false : "position"}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "0.5rem",
            }}
          >
            <span
              className="qb-tile"
              style={{
                position: "relative",
                width: "38px",
                height: "38px",
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
              {/* Seeded dither behind the glyph — subtle per-item identity. */}
              <DitherArt
                width={38}
                height={38}
                density={0.95}
                seed={item.label}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "38px",
                  height: "38px",
                  opacity: 0.32,
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>
                {item.confidential ? <Lock size={16} /> : <KeyRound size={16} />}
              </span>
            </span>
            <ItemMenu item={item} onChanged={onChanged} />
          </motion.div>
        )}

        <motion.div layout={reduce ? false : "position"} style={{ minWidth: 0 }}>
          {/* File label already shown on the cover; show meta line instead. */}
          {!isFile && (
            <div
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                letterSpacing: "-0.015em",
              }}
            >
              {item.label}
            </div>
          )}

          {confidential ? (
            <div style={{ marginTop: isFile ? 0 : "3px" }}>
              <ConfidentialFrost width={120} />
            </div>
          ) : (
            <div
              className={preview ? "tabular" : undefined}
              style={{
                fontSize: "0.75rem",
                fontFamily: preview
                  ? "ui-monospace, SFMono-Regular, monospace"
                  : "inherit",
                color: "var(--muted)",
                marginTop: isFile ? 0 : "3px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                letterSpacing: preview ? "0.02em" : "0",
              }}
            >
              {preview ?? (isFile ? `File · ${item.category}` : "Text snippet")}
            </div>
          )}
        </motion.div>

        {/* Primary action: glassy copy (Text) / drag (File) */}
        <motion.div layout={reduce ? false : "position"}>
          {isText ? (
            <button
              type="button"
              onClick={() => void copy()}
              className={cn(
                "qb-glass-btn",
                copied && "text-[var(--green)]",
              )}
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
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Inverted seeded dither used on dark file-cover bands: same generative
 * pattern as the tiles, but rendered white-on-dark so it reads against the
 * #16161a cover. We wrap <DitherArt> (which paints ink dots) and invert it via
 * a CSS filter so the dots become white, then soft-mask the edges.
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
        height={78}
        density={1.05}
        seed={seed}
        style={{ width: "100%", height: "78px" }}
      />
    </span>
  );
}
