import { useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Inbox, LayoutGrid, Lock, Plus, Search, Settings } from "lucide-react";
import { useItems } from "../lib/items-store";
import { categoryColor } from "../lib/category-color";
import { Button } from "./ui/button";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const navItemBase: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  padding: "0.45rem 0.6rem",
  borderRadius: "var(--r-pill)",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--side-muted)",
  textDecoration: "none",
  cursor: "pointer",
  letterSpacing: "-0.01em",
  background: "transparent",
  border: "none",
  width: "100%",
  textAlign: "left",
  fontFamily: "inherit",
};

// Active link: dark text on the light/white pill (drawn by NavIndicator).
const navItemActive: React.CSSProperties = {
  ...navItemBase,
  color: "var(--ink)",
  fontWeight: 600,
};

/**
 * Sliding active-nav indicator: a light/white pill. Rendered only inside the
 * active link; the shared `layoutId` makes Framer Motion morph its position as
 * the active route changes. Reduced motion -> snap (layout off).
 */
function NavIndicator({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      layoutId={reduce ? undefined : "nav-indicator"}
      layout={!reduce}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      style={{
        position: "absolute",
        inset: 0,
        background: "#ffffff",
        borderRadius: "var(--r-pill)",
        boxShadow: "0 1px 2px rgba(0,0,0,.25)",
        zIndex: 0,
      }}
    />
  );
}

/** Nav link contents sit above the sliding indicator. */
function NavContent({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        width: "100%",
      }}
    >
      {children}
    </span>
  );
}

export function Sidebar() {
  const {
    items,
    categories,
    query,
    setQuery,
    setAddOpen,
    categoryFilter,
    setCategoryFilter,
  } = useItems();
  const reduce = !!useReducedMotion();

  // Active route drives which link hosts the sliding indicator.
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const onHome = pathname === "/";
  const settingsActive = pathname.startsWith("/settings");

  // "Home" = on / with no category filter. "All items" = on / with no filter
  // too, but we surface it as a distinct entry that always clears the filter.
  const homeActive = onHome && categoryFilter === null;
  const allItemsActive = onHome && categoryFilter === null;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return (
    <aside
      className="qb-no-drag"
      style={{
        width: "236px",
        minWidth: "236px",
        background: "var(--side-bg)",
        display: "flex",
        flexDirection: "column",
        // Extra top padding clears the overlaid macOS traffic lights.
        padding: "2.25rem 0.75rem 0.875rem",
        height: "100%",
        boxSizing: "border-box",
        color: "var(--side-fg)",
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
            fontWeight: 800,
            fontSize: "1rem",
            color: "var(--side-fg)",
            letterSpacing: "-0.025em",
          }}
        >
          quickboard
        </span>
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 600,
            color: "var(--side-muted)",
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.08)",
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
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: "9px",
          background: "rgba(255,255,255,.05)",
          marginBottom: "0.6rem",
        }}
      >
        <Search
          size={15}
          color="var(--side-muted)"
          style={{ flexShrink: 0 }}
        />
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
            color: "var(--side-fg)",
            fontFamily: "inherit",
          }}
        />
        <kbd
          style={{
            fontSize: "0.6875rem",
            color: "var(--side-muted)",
            fontFamily: "inherit",
          }}
        >
          ⌘F
        </kbd>
      </label>

      {/* Add item — prominent button. On the dark sidebar the primary surface
          is white-on-ink (inverse of the content area), so this is a custom
          white shadcn Button rather than the default ink/primary variant. */}
      <Button
        type="button"
        onClick={() => setAddOpen(true)}
        className="qb-press mb-[1.1rem] h-auto justify-start gap-2 rounded-[10px] bg-white px-[0.65rem] py-2 text-[0.8125rem] font-bold tracking-tight text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,.25)] hover:bg-white/90"
      >
        <Plus size={15} />
        Add item
        <kbd className="ml-auto text-[0.6875rem] font-normal text-[var(--faint)]">
          ⌘N
        </kbd>
      </Button>

      {/* Nav — sliding light pill shared across links via layoutId */}
      <LayoutGroup id="sidebar-nav">
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.125rem",
            marginBottom: "1.25rem",
          }}
        >
          {/* Home — clears any active category filter */}
          <Link
            to="/"
            className="qb-press qb-side-nav"
            style={homeActive ? navItemActive : navItemBase}
            activeOptions={{ exact: true }}
            onClick={() => setCategoryFilter(null)}
          >
            {homeActive && <NavIndicator reduce={reduce} />}
            <NavContent>
              <LayoutGrid size={16} />
              Home
            </NavContent>
          </Link>

          {/* All items — same route, always clears the filter (full library) */}
          <Link
            to="/"
            className="qb-press qb-side-nav"
            style={allItemsActive ? navItemActive : navItemBase}
            activeOptions={{ exact: true }}
            onClick={() => setCategoryFilter(null)}
          >
            <NavContent>
              <Inbox size={16} />
              All items
              <span
                className="tabular"
                style={{
                  marginLeft: "auto",
                  fontSize: "0.75rem",
                  color: allItemsActive ? "var(--muted)" : "var(--side-muted)",
                }}
              >
                {items.length}
              </span>
            </NavContent>
          </Link>

          {/* Settings */}
          <Link
            to="/settings"
            className="qb-press qb-side-nav"
            style={settingsActive ? navItemActive : navItemBase}
          >
            {settingsActive && <NavIndicator reduce={reduce} />}
            <NavContent>
              <Settings size={16} />
              Settings
            </NavContent>
          </Link>
        </nav>
      </LayoutGroup>

      {/* CATEGORIES — clickable filters */}
      <SectionLabel>Categories</SectionLabel>
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
              color: "var(--side-muted)",
              padding: "0.3rem 0.6rem",
            }}
          >
            No categories yet
          </div>
        ) : (
          categories.map((name) => {
            const active = categoryFilter === name;
            return (
              <button
                key={name}
                type="button"
                className="qb-press qb-side-cat"
                aria-pressed={active}
                onClick={() => setCategoryFilter(active ? null : name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "var(--r-pill)",
                  fontSize: "0.8125rem",
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--ink)" : "var(--side-fg)",
                  background: active ? "#ffffff" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  width: "100%",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.25)" : "none",
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
                  style={{
                    fontSize: "0.75rem",
                    color: active ? "var(--muted)" : "var(--side-muted)",
                  }}
                >
                  {counts.get(name) ?? 0}
                </span>
              </button>
            );
          })
        )}

        {/* ENVIRONMENTS — scaffold only (real folders land in R4) */}
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 0.6rem",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--faint)",
                textTransform: "uppercase",
              }}
            >
              Environments
            </span>
            <span
              title="Folders are coming soon"
              aria-disabled="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.2rem",
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: "var(--side-muted)",
                opacity: 0.5,
                cursor: "not-allowed",
                userSelect: "none",
              }}
            >
              <Plus size={12} />
              Add
            </span>
          </div>
          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--side-muted)",
              padding: "0.1rem 0.6rem 0.3rem",
              opacity: 0.6,
            }}
          >
            Coming soon
          </div>
        </div>
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
            color: "var(--side-muted)",
            marginBottom: "0.6rem",
          }}
        >
          <Lock size={12} color="var(--green)" />
          Local · encrypted
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            padding: "0.5rem 0.6rem",
            borderTop: "1px solid rgba(255,255,255,.06)",
          }}
        >
          <span
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: "rgba(255,255,255,.1)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "var(--side-fg)",
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
                color: "var(--side-fg)",
                lineHeight: 1.2,
              }}
            >
              you
            </div>
            <div
              style={{
                fontSize: "0.6875rem",
                color: "var(--side-muted)",
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "var(--faint)",
        textTransform: "uppercase",
        padding: "0 0.6rem",
        marginBottom: "0.5rem",
      }}
    >
      {children}
    </div>
  );
}
