import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, Lock, Plus, Search, Settings } from "lucide-react";
import { useItems } from "../lib/items-store";
import { categoryColor } from "../lib/category-color";

const navItemBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  padding: "0.45rem 0.6rem",
  borderRadius: "8px",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--qb-muted)",
  textDecoration: "none",
  cursor: "pointer",
  letterSpacing: "-0.01em",
};

const navItemActive: React.CSSProperties = {
  ...navItemBase,
  color: "var(--qb-ink)",
  fontWeight: 600,
  background: "var(--qb-hair)",
};

export function Sidebar() {
  const { items, categories, query, setQuery, setAddOpen } = useItems();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return (
    <aside
      style={{
        width: "248px",
        minWidth: "248px",
        background: "var(--qb-sidebar)",
        borderRight: "1px solid var(--qb-border)",
        display: "flex",
        flexDirection: "column",
        padding: "50px 0.75rem 0.875rem",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0 0.35rem",
          marginBottom: "1.1rem",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "1rem",
            color: "var(--qb-ink)",
            letterSpacing: "-0.025em",
          }}
        >
          quickboard
        </span>
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 600,
            color: "var(--qb-muted)",
            background: "var(--qb-hair)",
            border: "1px solid var(--qb-border)",
            borderRadius: "999px",
            padding: "0.05rem 0.4rem",
            letterSpacing: "0.02em",
          }}
        >
          Beta
        </span>
      </div>

      {/* Search */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.45rem 0.6rem",
          border: "1px solid var(--qb-border)",
          borderRadius: "9px",
          background: "var(--qb-bg)",
          marginBottom: "0.6rem",
        }}
      >
        <Search size={15} color="var(--qb-muted2)" style={{ flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "0.8125rem",
            color: "var(--qb-ink)",
            fontFamily: "inherit",
          }}
        />
        <kbd
          style={{
            fontSize: "0.6875rem",
            color: "var(--qb-muted2)",
            fontFamily: "inherit",
          }}
        >
          ⌘F
        </kbd>
      </label>

      {/* Add item */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.65rem",
          background: "var(--qb-ink)",
          color: "#ffffff",
          border: "none",
          borderRadius: "10px",
          fontSize: "0.8125rem",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: "1.1rem",
          fontFamily: "inherit",
          letterSpacing: "-0.01em",
        }}
      >
        <Plus size={15} />
        Add item
        <kbd
          style={{
            marginLeft: "auto",
            fontSize: "0.6875rem",
            color: "rgba(255,255,255,0.45)",
            fontFamily: "inherit",
          }}
        >
          ⌘N
        </kbd>
      </button>

      {/* Nav */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.125rem",
          marginBottom: "1.25rem",
        }}
      >
        <Link
          to="/"
          style={navItemBase}
          activeProps={{ style: navItemActive }}
          inactiveProps={{ style: navItemBase }}
          activeOptions={{ exact: true }}
        >
          <LayoutGrid size={16} />
          Home
        </Link>
        <Link
          to="/settings"
          style={navItemBase}
          activeProps={{ style: navItemActive }}
          inactiveProps={{ style: navItemBase }}
        >
          <Settings size={16} />
          Settings
        </Link>
      </nav>

      {/* Categories */}
      <div
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--qb-muted2)",
          padding: "0 0.6rem",
          marginBottom: "0.5rem",
        }}
      >
        CATEGORIES
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.0625rem",
          overflowY: "auto",
          flex: 1,
          minHeight: 0,
        }}
      >
        {categories.length === 0 ? (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--qb-muted2)",
              padding: "0.3rem 0.6rem",
            }}
          >
            No categories yet
          </div>
        ) : (
          categories.map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "8px",
                fontSize: "0.8125rem",
                color: "var(--qb-ink)",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: categoryColor(name),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name}
              </span>
              <span
                className="tabular"
                style={{ fontSize: "0.75rem", color: "var(--qb-muted2)" }}
              >
                {counts.get(name) ?? 0}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "0.75rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0 0.6rem",
            fontSize: "0.6875rem",
            color: "var(--qb-muted)",
            marginBottom: "0.6rem",
          }}
        >
          <Lock size={12} color="var(--qb-green)" />
          Local · encrypted
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            padding: "0.5rem 0.6rem",
            borderTop: "1px solid var(--qb-border)",
          }}
        >
          <span
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: "var(--qb-ink)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Y
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--qb-ink)",
                lineHeight: 1.2,
              }}
            >
              you
            </div>
            <div
              style={{
                fontSize: "0.6875rem",
                color: "var(--qb-muted)",
                lineHeight: 1.2,
              }}
            >
              Local on this Mac
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
