import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ChevronDown,
  ChevronsUpDown,
  Inbox,
  LayoutGrid,
  Lock,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useItems } from "../lib/items-store";
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

// Active link: ink text on the elevated white pill (drawn by NavIndicator).
const navItemActive: React.CSSProperties = {
  ...navItemBase,
  color: "var(--ink)",
  fontWeight: 700,
};

/**
 * Sliding active-nav indicator: an elevated WHITE pill with a soft shadow.
 * Rendered only inside the active link; the shared `layoutId` morphs its
 * position as the active route changes. Reduced motion -> snap (layout off).
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

/** Ink rounded-square logo mark with a 2×2 grid glyph (matches the mock). */
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
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
      >
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
    query,
    setQuery,
    setAddOpen,
    categoryFilter,
    setCategoryFilter,
    setSelectedItemId,
  } = useItems();
  const reduce = !!useReducedMotion();

  // Which category groups are expanded (the active filtered one starts open).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  // Items grouped by category (for the expandable sub-rows + counts).
  const byCategory = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [items]);

  function toggleCategory(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function openItem(category: string, id: string) {
    setCategoryFilter(category);
    setSelectedItemId(id);
  }

  return (
    <aside
      // The sidebar card; the brand/empty top band is the drag handle.
      // Interactive children opt back out individually (.qb-no-drag).
      style={{
        width: "244px",
        minWidth: "244px",
        flex: "none",
        background: "var(--side-bg)",
        border: "1px solid var(--side-border)",
        borderRadius: "var(--r-panel)",
        display: "flex",
        flexDirection: "column",
        // Extra top padding clears the overlaid macOS traffic lights.
        padding: "2.6rem 0.75rem 0.75rem",
        height: "100%",
        boxSizing: "border-box",
        color: "var(--side-fg)",
      }}
    >
      {/* Brand — GENEROUS drag band. data-tauri-drag-region makes the whole
          band a window-drag handle; the non-interactive logo/brand carry
          pointer-events:none (.qb-drag-passthrough) so the mousedown lands on
          the band itself and dragging always starts. */}
      <div
        data-tauri-drag-region
        className="qb-drag"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          padding: "0.55rem 0.4rem 0.95rem",
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
        <span
          className="qb-drag-passthrough"
          style={{
            fontSize: "0.59rem",
            fontWeight: 700,
            color: "#7a7a7e",
            background: "#ececea",
            borderRadius: "6px",
            padding: "0.2rem 0.4rem",
            letterSpacing: "0.02em",
          }}
        >
          BETA
        </span>
      </div>

      {/* Search — light field on the light card. */}
      <label
        className="qb-no-drag"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          padding: "0.55rem 0.7rem",
          background: "#ffffff",
          borderRadius: "10px",
          marginBottom: "0.7rem",
          // Seam via soft layered shadow (shadows over hard borders).
          boxShadow:
            "0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.04)",
        }}
      >
        <Search size={15} color="var(--faint)" style={{ flexShrink: 0 }} />
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
            color: "var(--ink)",
            fontFamily: "inherit",
          }}
        />
        <kbd
          style={{
            fontSize: "0.6875rem",
            color: "var(--faint)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            padding: "0 0.25rem",
            fontFamily: "inherit",
          }}
        >
          ⌘F
        </kbd>
      </label>

      {/* Add item — ink / near-black button, white text. */}
      <Button
        type="button"
        onClick={() => setAddOpen(true)}
        className="qb-press qb-no-drag mb-4 h-auto justify-start gap-2 rounded-[11px] bg-[#0b0b0c] px-3 py-2.5 text-[0.84rem] font-bold tracking-tight text-white shadow-[0_2px_6px_rgba(0,0,0,.18)] hover:bg-[#0b0b0c]/90"
      >
        <Plus size={15} />
        Add item
        <kbd className="ml-auto text-[0.6875rem] font-normal text-white/50">
          ⌘N
        </kbd>
      </Button>

      {/* Nav — sliding white pill shared across links via layoutId */}
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
                className="qb-badge"
                style={{ marginLeft: "auto" }}
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

      {/* CATEGORIES — expandable groups (#33). */}
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
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--faint)",
              padding: "0.35rem 0.7rem",
            }}
          >
            No categories yet
          </div>
        ) : (
          categories.map((name) => {
            const rows = byCategory.get(name) ?? [];
            const count = rows.length;
            const confidentialCount = rows.filter((r) => r.confidential).length;
            const isOpen = !!expanded[name];
            const filterActive = categoryFilter === name;
            return (
              <CategoryGroup
                key={name}
                name={name}
                rows={rows}
                count={count}
                confidentialCount={confidentialCount}
                isOpen={isOpen}
                filterActive={filterActive}
                reduce={reduce}
                onToggle={() => toggleCategory(name)}
                onPickItem={(id) => openItem(name, id)}
              />
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
              padding: "0 0.7rem",
              marginBottom: "0.4rem",
            }}
          >
            <span
              style={{
                fontSize: "0.655rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#a2a29c",
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
                gap: "0.15rem",
                fontSize: "0.66rem",
                fontWeight: 600,
                color: "#8a8a86",
                cursor: "not-allowed",
                userSelect: "none",
              }}
            >
              <Plus size={11} />
              Add
            </span>
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#b0b0ab",
              padding: "0.1rem 0.7rem 0.3rem",
            }}
          >
            Coming soon
          </div>
        </div>
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
        {/* Refined account row — gradient avatar + identity + switcher, in a
            white pill with a soft layered seam (shadow over hard border). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.45rem 0.55rem",
            background: "#ffffff",
            borderRadius: "11px",
            boxShadow:
              "0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.04)",
          }}
        >
          {/* Deterministic generative gradient avatar (hashed seed). */}
          <GenerativeAvatar seed="quickboard-local-you" size={30} radius={8} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--ink)",
                lineHeight: 1.3,
              }}
            >
              you
            </div>
            <div
              style={{
                fontSize: "0.6875rem",
                color: "var(--faint)",
                lineHeight: 1.2,
              }}
            >
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

/**
 * One expandable category group: a trigger row (dot + name + chevron + count
 * badge) and, when expanded, a tree-connected list of its items. The selected
 * sub-item paints an elevated white pill.
 */
function CategoryGroup({
  name,
  rows,
  count,
  confidentialCount,
  isOpen,
  filterActive,
  reduce,
  onToggle,
  onPickItem,
}: {
  name: string;
  rows: Item[];
  count: number;
  confidentialCount: number;
  isOpen: boolean;
  filterActive: boolean;
  reduce: boolean;
  onToggle: () => void;
  onPickItem: (id: string) => void;
}) {
  const { selectedItemId } = useItems();

  return (
    <div>
      <button
        type="button"
        className="qb-press qb-cat-trigger"
        data-active={filterActive ? "true" : "false"}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "#b6b6b1",
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
        {/* Confidential count gets an amber badge (color where it matters);
            otherwise a neutral gray count badge. */}
        {confidentialCount > 0 && (
          <span
            className="qb-badge qb-badge--amber"
            title={`${confidentialCount} confidential`}
          >
            {confidentialCount}
          </span>
        )}
        <span className="qb-badge">{count}</span>
        <span
          className="qb-chevron qb-hit"
          data-expanded={isOpen ? "true" : "false"}
          aria-hidden="true"
        >
          <ChevronDown size={14} />
        </span>
      </button>

      {/* Expand / collapse — height + opacity, interruptible, reduced-motion
          aware (instant when reduced). */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="sub"
            initial={reduce ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 1, height: 0 } : { opacity: 0, height: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.26, ease: EASE_OUT }
            }
            style={{ overflow: "hidden" }}
          >
            <div className="qb-tree">
              {rows.length === 0 ? (
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--faint)",
                    padding: "0.3rem 0.55rem",
                  }}
                >
                  Empty
                </div>
              ) : (
                rows.map((item) => {
                  const selected = selectedItemId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="qb-press qb-subrow"
                      aria-current={selected ? "true" : "false"}
                      onClick={() => onPickItem(item.id)}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.label}
                      </span>
                      {item.confidential && (
                        <Lock
                          size={11}
                          color="#b45309"
                          style={{ flexShrink: 0 }}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
