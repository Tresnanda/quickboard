import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FileText, Folder, KeyRound, Lock, X } from "lucide-react";
import { useItems } from "../lib/items-store";
import { addFile, addText } from "../lib/ipc";

const MotionOverlay = motion.create(Dialog.Overlay);
const MotionContent = motion.create(Dialog.Content);

type ItemType = "Text" | "File";

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--qb-muted2)",
  marginBottom: "0.4rem",
};

const inputBase: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--qb-border)",
  borderRadius: "9px",
  background: "var(--qb-bg)",
  padding: "0.5rem 0.65rem",
  fontSize: "0.8125rem",
  color: "var(--qb-ink)",
  fontFamily: "inherit",
  outline: "none",
  letterSpacing: "-0.01em",
};

function lastPathSegment(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

export function AddItemDialog() {
  const { addOpen, setAddOpen, categories, reload } = useItems();
  const reduce = useReducedMotion();

  const [type, setType] = useState<ItemType>("Text");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datalistId = useId();
  const labelInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setType("Text");
    setLabel("");
    setValue("");
    setCategory("");
    setConfidential(false);
    setPickedPath(null);
    setSubmitting(false);
    setError(null);
  }

  // Reset whenever the dialog re-opens so stale state never leaks in.
  useEffect(() => {
    if (addOpen) {
      resetForm();
    }
  }, [addOpen]);

  const trimmedLabel = label.trim();
  const trimmedValue = value.trim();
  const valid =
    trimmedLabel.length > 0 &&
    (type === "Text" ? trimmedValue.length > 0 : pickedPath !== null);

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setAddOpen(next);
  }

  async function handleChooseFile() {
    setError(null);
    try {
      // multiple:false → open() resolves to an absolute path string, or null
      // when the user cancels the picker.
      const selected = await openFileDialog({ multiple: false, directory: false });
      if (typeof selected === "string") {
        setPickedPath(selected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    const trimmedCategory = category.trim() || "Uncategorized";
    try {
      if (type === "Text") {
        await addText(trimmedLabel, trimmedCategory, confidential, value);
      } else {
        // valid guarantees pickedPath is non-null here.
        await addFile(trimmedLabel, trimmedCategory, confidential, pickedPath as string);
      }
      await reload();
      setAddOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  // Centering is owned by Framer (it manages `transform`), so we always
  // prepend the -50%/-50% translate and let scale ride on top of it.
  const centerTransform = (latest: { scale?: number | string }) => {
    const s = latest.scale ?? 1;
    return `translate(-50%, -50%) scale(${s})`;
  };

  return (
    <Dialog.Root open={addOpen} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {addOpen && (
          <Dialog.Portal forceMount>
            <MotionOverlay
              forceMount
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(25, 25, 23, 0.32)",
                backdropFilter: "blur(2px)",
                zIndex: 50,
              }}
            />
            <MotionContent
              forceMount
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                labelInputRef.current?.focus();
              }}
              aria-describedby={undefined}
              initial={
                reduce
                  ? { opacity: 0, scale: 1 }
                  : { opacity: 0, scale: 0.96, filter: "blur(4px)" }
              }
              animate={
                reduce
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 1, scale: 1, filter: "blur(0px)" }
              }
              exit={
                reduce
                  ? { opacity: 0, scale: 1 }
                  : { opacity: 0, scale: 0.96, filter: "blur(2px)" }
              }
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              transformTemplate={centerTransform}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transformOrigin: "center",
                width: "min(440px, calc(100vw - 2rem))",
                maxHeight: "calc(100vh - 2rem)",
                overflowY: "auto",
                background: "var(--qb-bg)",
                border: "1px solid var(--qb-border)",
                borderRadius: "14px",
                boxShadow: "0 18px 48px rgba(25, 25, 23, 0.16)",
                padding: "1.25rem",
                zIndex: 51,
                fontFamily: "inherit",
              }}
            >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: "1.1rem",
            }}
          >
            <div>
              <Dialog.Title
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--qb-ink)",
                  letterSpacing: "-0.02em",
                }}
              >
                Add item
              </Dialog.Title>
              <p
                style={{
                  margin: "0.2rem 0 0",
                  fontSize: "0.75rem",
                  color: "var(--qb-muted)",
                }}
              >
                Store a snippet of text or a file, encrypted locally.
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="qb-press"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                border: "1px solid transparent",
                borderRadius: "8px",
                background: "transparent",
                color: "var(--qb-muted2)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </Dialog.Close>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {/* Label */}
            <div>
              <label htmlFor={`${datalistId}-label`} style={fieldLabel}>
                Label
              </label>
              <input
                id={`${datalistId}-label`}
                ref={labelInputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Production API key"
                required
                style={inputBase}
              />
            </div>

            {/* Type toggle */}
            <div>
              <span style={fieldLabel}>Type</span>
              <div
                role="radiogroup"
                aria-label="Item type"
                style={{
                  display: "flex",
                  gap: "0.25rem",
                  padding: "0.2rem",
                  border: "1px solid var(--qb-border)",
                  borderRadius: "10px",
                  background: "var(--qb-hair)",
                }}
              >
                {(["Text", "File"] as const).map((t) => {
                  const active = type === t;
                  const Icon = t === "Text" ? KeyRound : FileText;
                  return (
                    <button
                      key={t}
                      type="button"
                      className="qb-press"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setType(t);
                        setError(null);
                      }}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        padding: "0.4rem 0.5rem",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                        color: active ? "var(--qb-ink)" : "var(--qb-muted)",
                        background: active ? "var(--qb-bg)" : "transparent",
                        border: active
                          ? "1px solid var(--qb-border)"
                          : "1px solid transparent",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        boxShadow: active
                          ? "0 1px 2px rgba(25, 25, 23, 0.06)"
                          : "none",
                        transition: "color 120ms ease, background 120ms ease",
                      }}
                    >
                      <Icon size={14} />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Value (Text) or file picker (File) */}
            {type === "Text" ? (
              <div>
                <label htmlFor={`${datalistId}-value`} style={fieldLabel}>
                  Value
                </label>
                <textarea
                  id={`${datalistId}-value`}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Paste the text to store…"
                  rows={4}
                  style={{
                    ...inputBase,
                    resize: "vertical",
                    minHeight: "5.25rem",
                    lineHeight: 1.5,
                  }}
                />
              </div>
            ) : (
              <div>
                <span style={fieldLabel}>File</span>
                <button
                  type="button"
                  className="qb-press"
                  onClick={handleChooseFile}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.55rem 0.65rem",
                    border: "1px dashed var(--qb-border)",
                    borderRadius: "9px",
                    background: "var(--qb-hair)",
                    color: pickedPath ? "var(--qb-ink)" : "var(--qb-muted)",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <Folder size={15} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {pickedPath ? lastPathSegment(pickedPath) : "Choose file…"}
                  </span>
                </button>
                {pickedPath && (
                  <div
                    title={pickedPath}
                    style={{
                      marginTop: "0.35rem",
                      fontSize: "0.6875rem",
                      color: "var(--qb-muted2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {pickedPath}
                  </div>
                )}
              </div>
            )}

            {/* Category combobox via datalist */}
            <div>
              <label htmlFor={`${datalistId}-category`} style={fieldLabel}>
                Category
              </label>
              <input
                id={`${datalistId}-category`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list={datalistId}
                placeholder="Pick or type a category"
                style={inputBase}
              />
              <datalist id={datalistId}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {/* Confidential switch */}
            <button
              type="button"
              className="qb-press"
              role="switch"
              aria-checked={confidential}
              onClick={() => setConfidential((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.55rem 0.65rem",
                border: "1px solid var(--qb-border)",
                borderRadius: "9px",
                background: "var(--qb-bg)",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <Lock
                size={15}
                color={confidential ? "var(--qb-amber)" : "var(--qb-muted2)"}
                style={{ flexShrink: 0 }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--qb-ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Confidential
                </span>
                <span style={{ fontSize: "0.6875rem", color: "var(--qb-muted)" }}>
                  Require Touch ID before revealing.
                </span>
              </span>
              <span
                aria-hidden
                style={{
                  position: "relative",
                  width: "34px",
                  height: "20px",
                  borderRadius: "999px",
                  flexShrink: 0,
                  background: confidential ? "var(--qb-amber)" : "var(--qb-border)",
                  transition: "background 140ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: confidential ? "16px" : "2px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    boxShadow: "0 1px 2px rgba(25, 25, 23, 0.2)",
                    transition: "left 140ms ease",
                  }}
                />
              </span>
            </button>

            {error && (
              <div
                role="alert"
                style={{
                  fontSize: "0.75rem",
                  color: "#c0392b",
                  background: "rgba(192, 57, 43, 0.07)",
                  border: "1px solid rgba(192, 57, 43, 0.2)",
                  borderRadius: "8px",
                  padding: "0.5rem 0.65rem",
                }}
              >
                {error}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              <Dialog.Close
                type="button"
                className="qb-press"
                style={{
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--qb-muted)",
                  background: "transparent",
                  border: "1px solid var(--qb-border)",
                  borderRadius: "9px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                className="qb-press"
                disabled={!valid || submitting}
                style={{
                  padding: "0.5rem 0.95rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "#ffffff",
                  background: "var(--qb-ink)",
                  border: "none",
                  borderRadius: "9px",
                  cursor: valid && !submitting ? "pointer" : "not-allowed",
                  opacity: valid && !submitting ? 1 : 0.4,
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                  transition: "opacity 120ms ease",
                }}
              >
                {submitting ? "Adding…" : "Add item"}
              </button>
            </div>
          </form>
            </MotionContent>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
