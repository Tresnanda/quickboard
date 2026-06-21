import { useState } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { Check, Copy, FileText, KeyRound, Lock, Pin } from "lucide-react";
import { fileToTemp, getTextValue, setPinned } from "../lib/ipc";
import type { Item } from "../lib/types";

type ItemRowProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
};

export function ItemRow({ item, onChanged }: ItemRowProps) {
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  const isText = item.kind === "Text";

  async function handleCopy() {
    // Plan 3: gate behind Touch ID
    try {
      const value = await getTextValue(item.id);
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.875rem",
        padding: "0.625rem 0.25rem",
        borderBottom: "1px solid var(--qb-hair)",
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

      {/* Right actions */}
      <div
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
              opacity: hover || copied ? 1 : 0.55,
              transition: "opacity 140ms ease, color 140ms ease",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "copy"}
          </button>
        ) : (
          <button
            type="button"
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
              opacity: hover ? 1 : 0.55,
              transition: "opacity 140ms ease",
            }}
          >
            <FileText size={13} />
            drag out
          </button>
        )}

        <button
          type="button"
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
            opacity: item.pinned || hover ? 1 : 0,
            transition: "opacity 140ms ease, color 140ms ease",
          }}
        >
          <Pin
            size={14}
            fill={item.pinned ? "var(--qb-amber)" : "none"}
          />
        </button>
      </div>
    </div>
  );
}
