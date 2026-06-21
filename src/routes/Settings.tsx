import { useMemo } from "react";
import { Database, FileText, Lock, Globe, Clock } from "lucide-react";
import { useItems } from "../lib/items-store";

export function Settings() {
  const { items, loading } = useItems();

  const fileCount = useMemo(
    () => items.filter((i) => i.kind === "File").length,
    [items],
  );
  const confidentialCount = useMemo(
    () => items.filter((i) => i.confidential).length,
    [items],
  );

  return (
    <div style={{ padding: "26px 26px 40px", maxWidth: "640px", margin: "0 auto" }}>
      {/* Header */}
      <header style={{ marginBottom: "2.5rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--qb-ink)",
            letterSpacing: "-0.03em",
            margin: 0,
          }}
        >
          Settings
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--qb-muted)",
            margin: "0.3rem 0 0",
          }}
        >
          quickboard — Beta
        </p>
      </header>

      {/* Storage section */}
      <Section label="Storage">
        <StatRow
          icon={<Database size={14} />}
          label="Total items"
          value={loading ? "—" : String(items.length)}
        />
        <StatRow
          icon={<FileText size={14} />}
          label="Files"
          value={loading ? "—" : String(fileCount)}
        />
        <StatRow
          icon={<Lock size={14} />}
          label="Confidential"
          value={loading ? "—" : String(confidentialCount)}
        />
        <InfoRow>Local · encrypted on this Mac</InfoRow>
      </Section>

      {/* Coming-soon section */}
      <Section label="Keyboard">
        <ComingSoonRow
          icon={<Globe size={14} />}
          label="Global hotkey"
        />
      </Section>

      <Section label="Security">
        <ComingSoonRow
          icon={<Clock size={14} />}
          label="Confidential unlock timeout"
        />
      </Section>
    </div>
  );
}

/* ---- Sub-components ---- */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      {/* Section label */}
      <div
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--qb-muted2)",
          marginBottom: "0.75rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          border: "1px solid var(--qb-border)",
          borderRadius: "10px",
          overflow: "hidden",
          background: "var(--qb-bg)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.65rem 0.9rem",
        borderBottom: "1px solid var(--qb-hair)",
        fontSize: "0.875rem",
        color: "var(--qb-ink)",
      }}
    >
      <span
        style={{ color: "var(--qb-muted)", display: "flex", alignItems: "center" }}
      >
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="tabular" style={{ color: "var(--qb-muted2)" }}>
        {value}
      </span>
    </div>
  );
}

function InfoRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "0.65rem 0.9rem",
        fontSize: "0.8125rem",
        color: "var(--qb-muted2)",
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </div>
  );
}

function ComingSoonRow({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.65rem 0.9rem",
        borderBottom: "1px solid var(--qb-hair)",
        fontSize: "0.875rem",
        color: "var(--qb-muted)",
      }}
    >
      <span
        style={{ color: "var(--qb-muted2)", display: "flex", alignItems: "center" }}
      >
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span
        style={{
          fontSize: "0.6875rem",
          fontWeight: 500,
          letterSpacing: "0.04em",
          color: "var(--qb-muted2)",
          background: "var(--qb-hair)",
          border: "1px solid var(--qb-border)",
          borderRadius: "4px",
          padding: "1px 6px",
        }}
      >
        coming soon
      </span>
    </div>
  );
}
