import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { useReducedMotion } from "framer-motion";
import { FileText, KeyRound, Lock } from "lucide-react";
import { fileToTemp } from "../lib/ipc";
import { categoryTile } from "../lib/category-color";
import { useCopy } from "../lib/use-copy";
import { usePreview } from "../lib/use-preview";
import { CopyMorph } from "./CopyMorph";
import { ConfidentialFrost } from "./Generative";
import { DitherArt } from "./DitherArt";
import { ItemMenu } from "./ItemMenu";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

type ItemRowProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
  /** When true, the row plays a one-shot add-success highlight on mount. */
  justAdded?: boolean;
};

/**
 * A single Library row, styled as an iOS grouped-inset list row: a seeded
 * dither tile + label + value preview + copy/drag + ⋯. The depth and the
 * hairline dividers come from the enclosing `.qb-group` container (see Home),
 * so the row itself carries no border or shadow.
 */
export function ItemRow({ item, onChanged, justAdded = false }: ItemRowProps) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(item.id);
  const { preview, confidential } = usePreview(item);

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

  return (
    <div className={`qb-group-row${justAdded ? " qb-add-flash" : ""}`}>
      {/* Seeded dither tile (generative per-item identity) behind the glyph. */}
      <div
        className="qb-tile"
        style={{
          position: "relative",
          width: "36px",
          height: "36px",
          flexShrink: 0,
          borderRadius: "var(--r-tile)",
          background: tile.bg,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tile.fg,
        }}
      >
        <DitherArt
          width={36}
          height={36}
          density={0.95}
          seed={item.label}
          style={{
            position: "absolute",
            inset: 0,
            width: "36px",
            height: "36px",
            opacity: 0.32,
          }}
        />
        <span style={{ position: "relative", zIndex: 1 }}>
          {item.confidential ? (
            <Lock size={16} />
          ) : isText ? (
            <KeyRound size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>
      </div>

      {/* Label + value preview */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </div>
        {confidential ? (
          <ConfidentialFrost width={110} />
        ) : (
          <div
            className={preview ? "tabular" : undefined}
            style={{
              fontSize: "0.75rem",
              fontFamily: preview
                ? "ui-monospace, SFMono-Regular, monospace"
                : "inherit",
              color: "var(--muted)",
              marginTop: "2px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: preview ? "0.02em" : "0",
            }}
          >
            {preview ?? (isText ? "snippet · text" : `file · ${item.category}`)}
          </div>
        )}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copy()}
            className={cn(
              "qb-press h-auto gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
              copied ? "text-[var(--green)]" : "text-[var(--text)]",
            )}
          >
            <CopyMorph copied={copied} reduce={!!reduce} />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            draggable
            onDragStart={handleDragStart}
            className="qb-press h-auto cursor-grab gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text)]"
          >
            <FileText size={13} />
            drag out
          </Button>
        )}

        <ItemMenu item={item} onChanged={onChanged} />
      </div>
    </div>
  );
}
