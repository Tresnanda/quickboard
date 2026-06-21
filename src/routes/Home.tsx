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
import { CopyMorph } from "../components/CopyMorph";
import { ItemMenu } from "../components/ItemMenu";
import { ItemRow } from "../components/ItemRow";
import { RollNumber } from "../components/RollNumber";
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
  const { items, query, reload, loading, error, categoryFilter, setCategoryFilter } =
    useItems();
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
              fontSize: "1.875rem",
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-0.035em",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {greeting(now)}
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--muted)",
              margin: "0.45rem 0 0",
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
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "var(--shadow-sm)",
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
                  padding: "0.3rem 0.7rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: active ? "var(--ink)" : "var(--muted)",
                  background: active ? "var(--hair)" : "transparent",
                  border: "none",
                  borderRadius: "7px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
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
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "0.875rem",
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
            <div
              style={{
                fontSize: "0.9375rem",
                color: "var(--muted)",
                padding: "1.25rem 0",
              }}
            >
              {query || kindFilter !== "all"
                ? "Nothing matches your filters."
                : categoryFilter !== null
                  ? `No items in ${categoryFilter}.`
                  : "No items yet. Add your first with the button on the left."}
            </div>
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

                  {rows.map((item) => (
                    <motion.div
                      key={item.id}
                      // Shared id with the Quick-access card: pin toggle morphs
                      // this row into / out of the grid. `layout` also drives the
                      // FLIP reflow when the search filter changes the visible set.
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
              ))}
            </motion.div>
          )}
        </section>
      </LayoutGroup>

      {/* Meta footer */}
      {items.length > 0 && (
        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1.1rem",
            borderTop: "1px solid var(--hair)",
            fontSize: "0.75rem",
            color: "var(--faint)",
          }}
        >
          <RollNumber value={items.length} />{" "}
          {items.length === 1 ? "item" : "items"} · <RollNumber value={fileCount} />{" "}
          {fileCount === 1 ? "file" : "files"} ·{" "}
          <RollNumber value={confidentialCount} /> confidential
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
  const tile = categoryTile(item.category);
  const { copied, copy } = useCopy(item.id);

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

  // R3: gate copy/reveal behind Touch ID
  const preview = item.confidential
    ? "••••••••"
    : isText
      ? "Text snippet"
      : "File";

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
        gap: "0.75rem",
        padding: "0.95rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
        boxShadow: "var(--shadow-card)",
        minWidth: 0,
      }}
    >
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
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "var(--r-tile)",
            background: item.confidential ? "rgba(217,119,6,0.1)" : tile.bg,
            border: `1px solid ${item.confidential ? "rgba(217,119,6,0.24)" : tile.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: item.confidential ? "var(--amber)" : tile.fg,
            flexShrink: 0,
          }}
        >
          {item.confidential ? (
            <Lock size={16} />
          ) : isText ? (
            <KeyRound size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>
        <ItemMenu item={item} onChanged={onChanged} />
      </motion.div>

      <motion.div layout={reduce ? false : "position"} style={{ minWidth: 0 }}>
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
        <div
          style={{
            fontSize: "0.75rem",
            fontFamily: item.confidential
              ? "ui-monospace, SFMono-Regular, monospace"
              : "inherit",
            color: "var(--muted)",
            marginTop: "3px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: item.confidential ? "0.05em" : "0",
          }}
        >
          {preview}
        </div>
      </motion.div>

      {/* Primary action: copy (Text) / drag (File) */}
      <motion.div layout={reduce ? false : "position"}>
        {isText ? (
          <button
            type="button"
            className="qb-press"
            onClick={() => void copy()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              width: "100%",
              padding: "0.4rem 0.6rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: copied ? "var(--green)" : "var(--text)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "9px",
              cursor: "pointer",
              transition: "color 140ms var(--ease-out)",
            }}
          >
            <CopyMorph copied={copied} reduce={reduce} />
          </button>
        ) : (
          <button
            type="button"
            className="qb-press"
            draggable
            onDragStart={handleDragStart}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              width: "100%",
              padding: "0.4rem 0.6rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "9px",
              cursor: "grab",
            }}
          >
            <FileText size={14} />
            drag out
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
