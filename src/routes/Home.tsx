import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Plus, Search } from "lucide-react";
import { useItems } from "../lib/items-store";
import { NoteCard } from "../components/NoteCard";
import { RollNumber } from "../components/RollNumber";
import type { Item } from "../lib/types";

type KindFilter = "all" | "text" | "files" | "confidential";

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
      return item.kind === "Text" && !item.confidential;
    case "files":
      return item.kind === "File";
    case "confidential":
      return item.confidential;
    default:
      return true;
  }
}

export function Home() {
  const {
    items,
    query,
    setQuery,
    reload,
    loading,
    error,
    categoryFilter,
    pinnedOnly,
    setAddOpen,
  } = useItems();
  const now = useMemo(() => new Date(), []);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the board search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Filter (search + sidebar category + kind tab), then sort pinned-first,
  // then most-recent.
  const filtered = useMemo(() => {
    const list = items.filter(
      (i) =>
        matchesQuery(i, query) &&
        (categoryFilter === null || i.category === categoryFilter) &&
        (!pinnedOnly || i.pinned) &&
        matchesKind(i, kindFilter),
    );
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (
        b.last_used_at - a.last_used_at || b.created_at - a.created_at
      );
    });
  }, [items, query, categoryFilter, pinnedOnly, kindFilter]);

  const confidentialCount = useMemo(
    () => items.filter((i) => i.confidential).length,
    [items],
  );

  const isFiltered =
    !!query || kindFilter !== "all" || categoryFilter !== null || pinnedOnly;

  const tabs = [
    ["all", "All"],
    ["text", "Text"],
    ["files", "Files"],
    ["confidential", "Confidential"],
  ] as const;

  return (
    <div className="qb-board-page">
      {/* ── Header: greeting + centered search + type tabs ── */}
      <header className="qb-board-head">
        <h1 className="qb-board-greeting">
          {(() => {
            const parts = greeting(now).split(" ");
            const first = parts.shift() ?? "";
            const rest = parts.join(" ");
            return (
              <>
                {first} <span style={{ color: "#c4c4c6" }}>{rest}</span>
              </>
            );
          })()}
        </h1>

        {/* Centered ⌘K search bar — bound to the store query (live-filters). */}
        <div className="qb-board-search">
          <Search size={16} strokeWidth={1.7} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your notes, keys, files…"
            aria-label="Search notes"
            spellCheck={false}
          />
          <span className="qb-board-kbd" aria-hidden="true">
            ⌘K
          </span>
        </div>

        {/* Type tabs: All · Text · Files · Confidential */}
        <div className="qb-board-tabs" role="group" aria-label="Filter by type">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="qb-board-tab qb-press"
              aria-pressed={kindFilter === key}
              onClick={() => setKindFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--amber)",
            marginBottom: "1rem",
          }}
        >
          Could not load items: {error}
        </div>
      )}

      {/* ── The pinboard: a masonry of sticky NoteCards ── */}
      {loading && items.length === 0 ? (
        <div style={{ fontSize: "0.9375rem", color: "var(--muted)" }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            isFiltered
              ? query || kindFilter !== "all"
                ? "Nothing matches your filters"
                : categoryFilter !== null
                  ? `No items in ${categoryFilter}`
                  : "Nothing here yet"
              : "Mint your first item"
          }
          body={
            isFiltered
              ? query || kindFilter !== "all"
                ? "Try clearing a filter or searching for something else."
                : "This category is empty for now."
              : "Store a snippet or a file — encrypted locally, one keystroke away."
          }
          onMint={isFiltered ? undefined : () => setAddOpen(true)}
        />
      ) : (
        <div className="qb-board">
          {filtered.map((item) => (
            <NoteCard key={item.id} item={item} onChanged={reload} />
          ))}
        </div>
      )}

      {/* Meta footer — amber "N confidential" badge (a meaningful signal). */}
      {items.length > 0 && (
        <div className="qb-board-foot">
          <span>
            <RollNumber value={items.length} />{" "}
            {items.length === 1 ? "item" : "items"} ·
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

/**
 * Empty-state panel — minimal & MONOCHROME (ink-first). A small Lucide icon in a
 * neutral `--hair` tile, the headline (Plus Jakarta), a muted subline, and — for
 * the whole-app empty state — a "Mint your first item" button. NO gradient.
 */
function EmptyState({
  title,
  body,
  onMint,
}: {
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
        marginTop: "0.5rem",
      }}
    >
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
