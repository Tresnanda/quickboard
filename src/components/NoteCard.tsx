import { useMemo } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, FileText, KeyRound, Lock, Star } from "lucide-react";
import { fileToTemp, setPinned } from "../lib/ipc";
import { categoryColor } from "../lib/category-color";
import { useCopy } from "../lib/use-copy";
import { usePreview } from "../lib/use-preview";
import { useReveal } from "../lib/use-reveal";
import { ConfidentialFrost } from "./Generative";
import { ItemMenu } from "./ItemMenu";
import type { Item } from "../lib/types";

type NoteCardProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
};

// FNV-1a 32-bit hash → deterministic small integers (stable rotation per id).
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic note rotation in [-1.4deg, +1.4deg], stable across renders. */
function noteRotation(id: string): number {
  const h = hash(id);
  // Map the hash into [-1.4, 1.4] with ~0.1deg granularity (29 steps).
  const step = h % 29; // 0..28
  return (step - 14) * 0.1;
}

/** Relative time label: "2m ago" / "3h ago" / "Yesterday" / "Mar 4". */
export function relativeTime(unixSecs: number): string {
  if (!unixSecs) return "";
  const nowSecs = Date.now() / 1000;
  const diff = Math.max(0, nowSecs - unixSecs);
  const mins = Math.floor(diff / 60);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  // Older → a short calendar date (e.g. "Mar 4").
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * A single sticky note on the pinboard.
 *
 *   - a colored pushpin (category-keyed; amber for confidential),
 *   - a clean neutral icon tile (NO dither) with a Lucide glyph by kind,
 *   - a favorite star (filled when pinned) that toggles `setPinned`,
 *   - the title, type-specific content (masked text / file meta / frost+reveal),
 *   - a footer with the category chip + relative time,
 *   - a soft color tint washed from the category color, a small stable rotation,
 *     and a hover lift (CSS, hover/fine + reduced-motion safe).
 *
 * Click the note body copies (text, non-confidential); confidential bodies do
 * nothing (use the Eye). The star / eye / ⋯ menu all stopPropagation.
 */
export function NoteCard({ item, onChanged }: NoteCardProps) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(item.id);
  const { preview, confidential } = usePreview(item);
  const {
    revealed,
    value: revealedValue,
    busy: revealing,
    toggle: toggleReveal,
  } = useReveal(item.id);

  const isText = item.kind === "Text";
  const catColor = categoryColor(item.category);
  const rotation = useMemo(() => noteRotation(item.id), [item.id]);

  // Soft paper tint washed from the category color. Neutral paper when there is
  // no meaningful category color (categoryColor returns a CSS var today).
  const tint = `color-mix(in srgb, var(--catColor) 14%, #fbfaf7)`;

  // Pushpin variant — amber for confidential, else keyed off the category color.
  const pinClass = confidential ? "qb-pin qb-pin--amber" : "qb-pin";

  async function handleDragStart(event: React.DragEvent) {
    // File drag-out: backend gates confidential access. Best-effort.
    event.preventDefault();
    try {
      const path = await fileToTemp(item.id);
      await startDrag({ item: [path], icon: path });
    } catch {
      /* drag-out is best-effort */
    }
  }

  async function handleToggleFavorite(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await setPinned(item.id, !item.pinned);
      await onChanged();
    } catch {
      /* best-effort */
    }
  }

  // The note body is clickable-to-copy ONLY for non-confidential Text.
  const bodyCopyable = isText && !confidential;

  function handleBodyClick() {
    if (bodyCopyable) void copy();
  }

  return (
    <div
      className="qb-note"
      style={
        {
          "--catColor": catColor,
          background: tint,
          transform: reduce ? undefined : `rotate(${rotation}deg)`,
          cursor: bodyCopyable ? "pointer" : "default",
        } as React.CSSProperties
      }
      role={bodyCopyable ? "button" : undefined}
      tabIndex={bodyCopyable ? 0 : undefined}
      onClick={bodyCopyable ? handleBodyClick : undefined}
      onKeyDown={
        bodyCopyable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void copy();
              }
            }
          : undefined
      }
    >
      {/* Pushpin — inherits --catColor from the note wrapper. */}
      <span aria-hidden="true" className={pinClass} />

      {/* Head: clean icon tile + favorite star */}
      <div className="qb-note__head">
        <span className="qb-note__seal" aria-hidden="true">
          {confidential ? (
            <Lock size={16} strokeWidth={1.7} />
          ) : isText ? (
            <KeyRound size={16} strokeWidth={1.7} />
          ) : (
            <FileText size={16} strokeWidth={1.7} />
          )}
        </span>
        <button
          type="button"
          className="qb-note__star"
          aria-label={item.pinned ? "Unfavorite" : "Favorite"}
          aria-pressed={item.pinned}
          onClick={handleToggleFavorite}
          onMouseDown={(e) => e.stopPropagation()}
          data-on={item.pinned ? "true" : "false"}
        >
          <Star
            size={15}
            strokeWidth={1.7}
            fill={item.pinned ? "#f5b301" : "none"}
            color={item.pinned ? "#f5b301" : "currentColor"}
          />
        </button>
      </div>

      {/* Title */}
      <div className="qb-note__title">{item.label}</div>

      {/* Type-specific content */}
      {confidential ? (
        <div style={{ marginTop: "5px" }}>
          {revealed ? (
            <motion.div
              initial={reduce ? false : { opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="qb-note__mono tabular"
            >
              {revealedValue}
            </motion.div>
          ) : (
            <ConfidentialFrost />
          )}
          <button
            type="button"
            className="qb-note__eye"
            onClick={(e) => {
              e.stopPropagation();
              void toggleReveal();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={revealing}
            aria-label={revealed ? "Hide value" : "Reveal value with Touch ID"}
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
      ) : isText ? (
        <div className="qb-note__mono tabular" style={{ marginTop: "5px" }}>
          {copied ? (
            <span style={{ color: "var(--green)", fontWeight: 600 }}>Copied</span>
          ) : (
            preview ?? "Text snippet"
          )}
        </div>
      ) : (
        // File — meta line + a plain (non-motion) draggable handle to drag out.
        <div
          draggable
          onDragStart={handleDragStart}
          onClick={(e) => e.stopPropagation()}
          className="qb-note__file"
          style={{ cursor: "grab" }}
        >
          {fileExt(item.label)} · {item.category}
        </div>
      )}

      {/* Footer: category chip + relative time */}
      <div className="qb-note__foot">
        <span className="qb-note__chip">{item.category}</span>
        <span className="qb-note__time tabular">
          {relativeTime(item.last_used_at || item.created_at)}
        </span>
      </div>

      {/* ⋯ overflow menu — bottom-right, stops propagation so the body's
          copy-on-click never fires from menu interactions. */}
      <span
        className="qb-note__menu"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ItemMenu item={item} onChanged={onChanged} />
      </span>
    </div>
  );
}

/** Upper-cased file extension from a label (e.g. "Passport.pdf" → "PDF"). */
function fileExt(label: string): string {
  const dot = label.lastIndexOf(".");
  if (dot <= 0 || dot === label.length - 1) return "FILE";
  return label.slice(dot + 1).toUpperCase();
}
