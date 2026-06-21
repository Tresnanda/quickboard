import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { useReducedMotion } from "framer-motion";
import { FileText, KeyRound, Lock } from "lucide-react";
import { fileToTemp } from "../lib/ipc";
import { categoryTile } from "../lib/category-color";
import { useCopy } from "../lib/use-copy";
import { CopyMorph } from "./CopyMorph";
import { ItemMenu } from "./ItemMenu";
import type { Item } from "../lib/types";

type ItemRowProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
  /** When true, the row plays a one-shot add-success highlight on mount. */
  justAdded?: boolean;
};

export function ItemRow({ item, onChanged, justAdded = false }: ItemRowProps) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(item.id);

  const isText = item.kind === "Text";
  const tile = categoryTile(item.category, item.confidential);

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

  // Confidential value preview is masked; the real Touch ID gate is R3.
  // R3: gate copy/reveal behind Touch ID
  const preview = item.confidential
    ? "••••••••"
    : `${item.category} · ${item.kind}`;

  return (
    <div
      className={`qb-card-row${justAdded ? " qb-add-flash" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.875rem",
        padding: "0.7rem 0.8rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        boxShadow: "var(--shadow-sm)",
        marginBottom: "0.5rem",
      }}
    >
      {/* Monochrome icon tile (R2.5) — neutral gray bg + ink glyph, no color */}
      <div
        style={{
          position: "relative",
          width: "38px",
          height: "38px",
          flexShrink: 0,
          borderRadius: "var(--r-tile)",
          background: tile.bg,
          border: `1px solid ${tile.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tile.fg,
        }}
      >
        {item.confidential ? (
          <Lock size={16} />
        ) : isText ? (
          <KeyRound size={16} />
        ) : (
          <FileText size={16} />
        )}
      </div>

      {/* Label + value preview */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
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
            marginTop: "2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: item.confidential ? "0.05em" : "0",
          }}
        >
          {preview}
        </div>
      </div>

      {/* Right actions — rest at low opacity, reveal on row hover (CSS-gated) */}
      <div
        className="qb-row__actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          flexShrink: 0,
        }}
      >
        {isText ? (
          <button
            type="button"
            className="qb-press"
            onClick={() => void copy()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.32rem 0.6rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: copied ? "var(--green)" : "var(--text)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "color 140ms var(--ease-out)",
            }}
          >
            <CopyMorph copied={copied} reduce={!!reduce} />
          </button>
        ) : (
          <button
            type="button"
            className="qb-press"
            draggable
            onDragStart={handleDragStart}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.32rem 0.6rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              cursor: "grab",
            }}
          >
            <FileText size={13} />
            drag out
          </button>
        )}

        <ItemMenu item={item} onChanged={onChanged} />
      </div>
    </div>
  );
}
