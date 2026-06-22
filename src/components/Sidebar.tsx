import { useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  ChevronsUpDown,
  LayoutGrid,
  Lock,
  Plus,
  Settings,
  Star,
} from "lucide-react";
import { useItems } from "../lib/items-store";
import { categoryColor } from "../lib/category-color";
import type { Item } from "../lib/types";
import { GenerativeAvatar } from "./Generative";
import { Button } from "./ui/button";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const navItemBase: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.7rem",
  padding: "0.55rem 0.7rem",
  borderRadius: "var(--r-pill)",
  fontSize: "0.84rem",
  fontWeight: 500,
  color: "var(--side-muted)",
  textDecoration: "none",
  cursor: "pointer",
  letterSpacing: "-0.005em",
  background: "transparent",
  border: "none",
  width: "100%",
  textAlign: "left",
  fontFamily: "inherit",
};

const navItemActive: React.CSSProperties = {
  ...navItemBase,
  color: "var(--ink)",
  fontWeight: 700,
};

/**
 * Sliding active-nav indicator: an elevated WHITE pill with a soft shadow.
 * Rendered only inside the active nav link; the shared `layoutId` morphs its
 * position as the active item changes. Reduced motion -> snap (layout off).
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
        background: "var(--side-elev)",
        borderRadius: "var(--r-pill)",
        boxShadow: "var(--shadow-pill)",
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
        gap: "0.7rem",
        width: "100%",
      }}
    >
      {children}
    </span>
  );
}

/** Ink rounded-square logo mark with a 2×2 grid glyph. */
function LogoMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: "26px",
        height: "26px",
        borderRadius: "8px",
        background: "#0b0b0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    </span>
  );
}

export function Sidebar() {
  const {
    items,
    categories,
    setAddOpen,
    categoryFilter,
    setCategoryFilter,
    pinnedOnly,
    setPinnedOnly,
  } = useItems();
  const reduce = !!useReducedMotion();

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onHome = pathname === "/";
  const settingsActive = pathname.startsWith("/settings");

  // Filter-driven active states (Home / Pinned / a category are all route "/").
  const homeActive = onHome && categoryFilter === null && !pinnedOnly;
  const pinnedActive = onHome && pinnedOnly;

  const pinnedCount = useMemo(() => items.filter((i) => i.pinned).length, [items]);

  // Per-category counts (+ confidential count for the amber badge).
  const counts = useMemo(() => {
    const map = new Map<string, { total: number; confidential: number }>();
    for (const item of items as Item[]) {
      const c = map.get(item.category) ?? { total: 0, confidential: 0 };
      c.total += 1;
      if (item.confidential) c.confidential += 1;
      map.set(item.category, c);
    }
    return map;
  }, [items]);

  function pickHome() {
    setCategoryFilter(null);
    setPinnedOnly(false);
  }
  function pickPinned() {
    setCategoryFilter(null);
    setPinnedOnly(true);
  }
  function pickCategory(name: string) {
    setCategoryFilter(categoryFilter === name ? null : name);
    setPinnedOnly(false);
  }

  return (
    <aside
      style={{
        width: "244px",
        minWidth: "244px",
        flex: "none",
        background: "var(--side-bg)",
        border: "1px solid var(--side-border)",
        borderRadius: "var(--r-panel)",
        display: "flex",
        flexDirection: "column",
        padding: "2.6rem 0.75rem 0.75rem",
        height: "100%",
        boxSizing: "border-box",
        color: "var(--side-fg)",
      }}
    >
      {/* Brand — generous window-drag band. */}
      <div
        data-tauri-drag-region
        className="qb-drag"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          padding: "0.55rem 0.4rem 1rem",
        }}
      >
        <span className="qb-drag-passthrough" style={{ display: "inline-flex" }}>
          <LogoMark />
        </span>
        <span
          className="qb-drag-passthrough"
          style={{
            fontWeight: 800,
            fontSize: "1rem",
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          quickboard
        </span>
      </div>

      {/* Post note — ink button, white text. */}
      <Button
        type="button"
        onClick={() => setAddOpen(true)}
        className="qb-press qb-no-drag mb-3 h-auto justify-start gap-2 rounded-[11px] bg-[#0b0b0c] px-3 py-2.5 text-[0.84rem] font-bold tracking-tight text-white shadow-[0_2px_6px_rgba(0,0,0,.18)] hover:bg-[#0b0b0c]/90"
      >
        <Plus size={15} />
        Post note
        <kbd className="ml-auto text-[0.6875rem] font-normal text-white/50">⌘N</kbd>
      </Button>

      {/* Nav — sliding white pill shared across Home / Pinned / Settings. */}
      <LayoutGroup id="sidebar-nav">
        <nav
          className="qb-no-drag"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.125rem",
            marginBottom: "0.4rem",
          }}
        >
          <Link
            to="/"
            className="qb-press qb-side-nav"
            style={homeActive ? navItemActive : navItemBase}
            activeOptions={{ exact: true }}
            onClick={pickHome}
          >
            {homeActive && <NavIndicator reduce={reduce} />}
            <NavContent>
              <LayoutGrid size={16} />
              Home
            </NavContent>
          </Link>

          <Link
            to="/"
            className="qb-press qb-side-nav"
            style={pinnedActive ? navItemActive : navItemBase}
            activeOptions={{ exact: true }}
            onClick={pickPinned}
          >
            {pinnedActive && <NavIndicator reduce={reduce} />}
            <NavContent>
              <Star size={16} />
              Pinned
              {pinnedCount > 0 && (
                <span className="qb-badge" style={{ marginLeft: "auto" }}>
                  {pinnedCount}
                </span>
              )}
            </NavContent>
          </Link>

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

      {/* CATEGORIES — colored filter rows (click filters the board). */}
      <SectionLabel>Categories</SectionLabel>
      <div
        className="qb-no-drag"
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
          <div style={{ fontSize: "0.75rem", color: "var(--faint)", padding: "0.35rem 0.7rem" }}>
            No categories yet
          </div>
        ) : (
          categories.map((name) => {
            const c = counts.get(name) ?? { total: 0, confidential: 0 };
            const active = onHome && categoryFilter === name && !pinnedOnly;
            return (
              <button
                key={name}
                type="button"
                className="qb-press"
                onClick={() => pickCategory(name)}
                style={{
                  ...navItemBase,
                  gap: "0.6rem",
                  color: active ? "var(--ink)" : "var(--side-muted)",
                  fontWeight: active ? 700 : 500,
                  background: active ? "var(--side-elev)" : "transparent",
                  boxShadow: active ? "var(--shadow-pill)" : "none",
                }}
              >
                <span
                  aria-hidden="true"
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
                {c.confidential > 0 && (
                  <span className="qb-badge qb-badge--amber" title={`${c.confidential} confidential`}>
                    {c.confidential}
                  </span>
                )}
                <span className="qb-badge">{c.total}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="qb-no-drag" style={{ marginTop: "0.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.25rem 0.6rem 0.55rem",
            fontSize: "0.71rem",
            color: "#8a8a8e",
          }}
        >
          <Lock size={13} color="var(--green)" />
          Local · encrypted
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.45rem 0.55rem",
            background: "#ffffff",
            borderRadius: "11px",
            boxShadow: "0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.04)",
          }}
        >
          <GenerativeAvatar seed="quickboard-local-you" size={30} radius={8} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>
              you
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--faint)", lineHeight: 1.2 }}>
              Local on this Mac
            </div>
          </div>
          <button
            type="button"
            aria-label="Switch account"
            className="qb-press qb-hit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              color: "#b0b0b2",
            }}
          >
            <ChevronsUpDown size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.655rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "#a2a29c",
        textTransform: "uppercase",
        padding: "0.5rem 0.7rem 0.4rem",
      }}
    >
      {children}
    </div>
  );
}
