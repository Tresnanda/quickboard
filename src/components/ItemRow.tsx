import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { Check, Copy, FileText, KeyRound, Lock, Pin } from "lucide-react";
import { fileToTemp, getTextValue, setPinned } from "../lib/ipc";
import type { Item } from "../lib/types";

type ItemRowProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
  /** When true, the row plays a one-shot add-success highlight on mount. */
  justAdded?: boolean;
};

const COPY_REVERT_MS = 1200;

export function ItemRow({ item, onChanged, justAdded = false }: ItemRowProps) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const revertTimer = useRef<number | null>(null);

  const isText = item.kind === "Text";

  useEffect(() => {
    return () => {
      if (revertTimer.current !== null) {
        window.clearTimeout(revertTimer.current);
      }
    };
  }, []);

  async function handleCopy() {
    // Plan 3: gate behind Touch ID
    try {
      const value = await getTextValue(item.id);
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // Interruptible: a fresh click restarts the auto-revert timer.
      if (revertTimer.current !== null) {
        window.clearTimeout(revertTimer.current);
      }
      revertTimer.current = window.setTimeout(() => {
        setCopied(false);
        revertTimer.current = null;
      }, COPY_REVERT_MS);
    } catch {
      /* surfaced at a higher level later; copy stays silent for now */
    }
  }

  async function handleDragStart(event: React.DragEvent) {
    // Plan 3: gate behind Touch ID
    event.preventDefault();
    try {
      const path = await fileToTemp(item.id);
      await startDrag({ item: [path], icon: path });
    } catch {
      /* drag-out is best-effort */
    }
  }

  async function handleTogglePin() {
    if (busy) return;
    setBusy(true);
    try {
      await setPinned(item.id, !item.pinned);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`qb-row${justAdded ? " qb-add-flash" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.875rem",
        padding: "0.625rem 0.25rem",
        borderBottom: "1px solid var(--qb-hair)",
        borderRadius: "8px",
      }}
    >
      {/* Kind tile */}
      <div
        style={{
          position: "relative",
          width: "40px",
          height: "28px",
          flexShrink: 0,
          borderRadius: "7px",
          background: "var(--qb-hair)",
          border: "1px solid var(--qb-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--qb-muted)",
        }}
      >
        {isText ? <KeyRound size={15} /> : <FileText size={15} />}
        {item.confidential && (
          <span
            style={{
              position: "absolute",
              bottom: "-5px",
              right: "-5px",
              width: "15px",
              height: "15px",
              borderRadius: "50%",
              background: "var(--qb-bg)",
              border: "1px solid var(--qb-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--qb-amber)",
            }}
          >
            <Lock size={9} />
          </span>
        )}
      </div>

      {/* Label + subtext */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--qb-ink)",
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
            color: "var(--qb-muted)",
            marginTop: "1px",
          }}
        >
          {item.category} · {item.kind}
        </div>
      </div>

      {/* Right actions — rest at low opacity, reveal on row hover (CSS-gated) */}
      <div
        className="qb-row__actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          flexShrink: 0,
        }}
      >
        {isText ? (
          <button
            type="button"
            className="qb-press"
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.3rem 0.55rem",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: copied ? "var(--qb-green)" : "var(--qb-muted)",
              background: "transparent",
              border: "1px solid var(--qb-border)",
              borderRadius: "7px",
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
              padding: "0.3rem 0.55rem",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "var(--qb-muted)",
              background: "transparent",
              border: "1px solid var(--qb-border)",
              borderRadius: "7px",
              cursor: "grab",
            }}
          >
            <FileText size={13} />
            drag out
          </button>
        )}

        <button
          type="button"
          className="qb-press"
          onClick={handleTogglePin}
          aria-label={item.pinned ? "Unpin" : "Pin"}
          title={item.pinned ? "Unpin" : "Pin"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            color: item.pinned ? "var(--qb-amber)" : "var(--qb-muted2)",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: "7px",
            cursor: "pointer",
            transition: "color 140ms var(--ease-out)",
          }}
        >
          <Pin size={14} fill={item.pinned ? "var(--qb-amber)" : "none"} />
        </button>
      </div>
    </div>
  );
}

/**
 * Copy -> Check morph: Emil's blur-masked crossfade. The whole label
 * (icon + word) swaps between "copy"/Copy and "Copied"/Check with a short
 * blur + opacity crossfade. Reduced motion -> instant opacity swap only.
 */
function CopyMorph({ copied, reduce }: { copied: boolean; reduce: boolean }) {
  const key = copied ? "copied" : "copy";

  const enter = reduce
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(2px)" };
  const center = reduce
    ? { opacity: 1 }
    : { opacity: 1, filter: "blur(0px)" };
  const exit = reduce
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(2px)" };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {/* Invisible sizer keeps the button width stable across the swap. */}
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          visibility: "hidden",
        }}
      >
        <Check size={13} />
        Copied
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={key}
          initial={enter}
          animate={center}
          exit={exit}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          style={{
            position: "absolute",
            inset: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "copy"}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
