import { Link } from "@tanstack/react-router";
import { LayoutGrid, Settings } from "lucide-react";

const navItemBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 0.5rem",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  color: "var(--qb-ink)",
  textDecoration: "none",
  cursor: "pointer",
};

export function Sidebar() {
  return (
    <aside
      style={{
        width: "248px",
        minWidth: "248px",
        background: "var(--qb-sidebar)",
        borderRight: "1px solid var(--qb-border)",
        display: "flex",
        flexDirection: "column",
        padding: "1rem 0.75rem",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: "1rem",
          color: "var(--qb-ink)",
          letterSpacing: "-0.02em",
          marginBottom: "1rem",
          paddingLeft: "0.25rem",
        }}
      >
        quickboard
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <Link
          to="/"
          style={navItemBase}
          activeProps={{
            style: {
              ...navItemBase,
              color: "var(--qb-blue)",
              fontWeight: 600,
              background: "var(--qb-hair)",
            },
          }}
          inactiveProps={{ style: navItemBase }}
        >
          <LayoutGrid size={16} />
          Home
        </Link>

        <Link
          to="/settings"
          style={navItemBase}
          activeProps={{
            style: {
              ...navItemBase,
              color: "var(--qb-blue)",
              fontWeight: 600,
              background: "var(--qb-hair)",
            },
          }}
          inactiveProps={{ style: navItemBase }}
        >
          <Settings size={16} />
          Settings
        </Link>
      </nav>
    </aside>
  );
}
