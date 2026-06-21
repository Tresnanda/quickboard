import { useMemo } from "react";
import { motion } from "framer-motion";
import { FileText, KeyRound, Lock } from "lucide-react";
import { useItems } from "../lib/items-store";
import { categoryColor } from "../lib/category-color";
import { ItemRow } from "../components/ItemRow";
import type { Item } from "../lib/types";

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

// Subtle fade + small upward slide stagger on mount.
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
};
const childVariants = {
  hidden: { opacity: 0, y: 7 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function Home() {
  const { items, query, reload, loading, error } = useItems();
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(
    () => items.filter((i) => matchesQuery(i, query)),
    [items, query],
  );

  const pinned = useMemo(() => filtered.filter((i) => i.pinned), [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of filtered) {
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
    <div style={{ padding: "26px 26px 40px", maxWidth: "980px", margin: "0 auto" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--qb-ink)",
              letterSpacing: "-0.03em",
              margin: 0,
            }}
          >
            {greeting(now)}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--qb-muted)",
              margin: "0.3rem 0 0",
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
            color: "var(--qb-muted2)",
            whiteSpace: "nowrap",
            paddingTop: "0.35rem",
          }}
        >
          {formatDate(now)}
        </span>
      </header>

      {error && (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--qb-amber)",
            marginBottom: "1.5rem",
          }}
        >
          Could not load items: {error}
        </div>
      )}

      {/* Quick access */}
      {pinned.length > 0 && (
        <section style={{ marginBottom: "2.25rem" }}>
          <SectionLabel>Quick access</SectionLabel>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.75rem",
            }}
          >
            {pinned.map((item) => (
              <QuickCard key={item.id} item={item} />
            ))}
          </motion.div>
        </section>
      )}

      {/* Library */}
      <section>
        <SectionLabel>Library</SectionLabel>

        {loading && items.length === 0 ? (
          <div style={{ fontSize: "0.875rem", color: "var(--qb-muted)" }}>
            Loading…
          </div>
        ) : grouped.length === 0 ? (
          <div
            style={{
              fontSize: "0.875rem",
              color: "var(--qb-muted)",
              padding: "1rem 0",
            }}
          >
            {query
              ? "Nothing matches your search."
              : "No items yet. Add your first with the button on the left."}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {grouped.map(([category, rows]) => (
              <div key={category} style={{ marginBottom: "1.75rem" }}>
                {/* Group header with hairline rule */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: categoryColor(category),
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--qb-ink)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {category}
                  </span>
                  <span
                    className="tabular"
                    style={{ fontSize: "0.75rem", color: "var(--qb-muted2)" }}
                  >
                    {rows.length}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: "1px",
                      background: "var(--qb-border)",
                      marginLeft: "0.25rem",
                    }}
                  />
                </div>

                {rows.map((item) => (
                  <motion.div key={item.id} variants={childVariants}>
                    <ItemRow item={item} onChanged={reload} />
                  </motion.div>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Meta footer */}
      {items.length > 0 && (
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--qb-hair)",
            fontSize: "0.75rem",
            color: "var(--qb-muted2)",
          }}
        >
          {items.length} {items.length === 1 ? "item" : "items"} · {fileCount}{" "}
          {fileCount === 1 ? "file" : "files"} · {confidentialCount} confidential
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
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--qb-muted2)",
        marginBottom: "0.85rem",
      }}
    >
      {children}
    </div>
  );
}

function QuickCard({ item }: { item: Item }) {
  const isText = item.kind === "Text";
  return (
    <motion.div
      variants={childVariants}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        padding: "0.85rem",
        background: "var(--qb-bg)",
        border: "1px solid var(--qb-border)",
        borderRadius: "12px",
        boxShadow: "0 1px 2px rgba(25, 25, 23, 0.04)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "var(--qb-hair)",
            border: "1px solid var(--qb-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--qb-muted)",
          }}
        >
          {isText ? <KeyRound size={15} /> : <FileText size={15} />}
        </span>
        {item.confidential && (
          <span
            title="Confidential"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--qb-amber)",
            }}
          >
            <Lock size={13} />
          </span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--qb-ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "-0.01em",
          }}
        >
          {item.label}
        </div>
        <div
          style={{
            fontSize: "0.6875rem",
            color: "var(--qb-muted)",
            marginTop: "2px",
          }}
        >
          {isText ? "copy" : "drag out"}
        </div>
      </div>
    </motion.div>
  );
}
