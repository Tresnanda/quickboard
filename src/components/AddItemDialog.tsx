import { useEffect, useId, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FileText, Folder, KeyRound, Lock } from "lucide-react";
import { useItems } from "../lib/items-store";
import { addFile, addText } from "../lib/ipc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { DitherArt } from "./DitherArt";
import { GradientBrand } from "./GradientBrand";
import { cn } from "../lib/utils";

type ItemType = "Text" | "File";

function lastPathSegment(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

/** A short, partly-masked one-line preview for the live card (mirrors maskPreview). */
function previewValue(raw: string): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length === 0) return "";
  if (oneLine.length <= 6) return oneLine;
  return `${oneLine.slice(0, 6)}••••`;
}

/**
 * The **minting** Add-item experience — a split iOS bottom Sheet (shadcn/ui
 * `Sheet`, which wraps Radix Dialog). It slides up with rounded top corners and
 * a grab-handle bar. Open/close is owned entirely by `useItems().addOpen`.
 *
 * LAYOUT (split):
 *  - LEFT  = the form (Label, Value / file picker, Text·File toggle, Category
 *    combobox, Confidential switch) + the "Mint item" submit.
 *  - RIGHT = a LIVE PREVIEW item card that updates as you type — the item's
 *    MONOCHROME `DitherArt` seal, label, a category pill, a value preview — plus
 *    a gradient-shader brand art band with a small serif "quickboard" wordmark.
 *
 * The slide-up / slide-down is shadcn's data-state Tailwind animation (mounts +
 * unmounts reliably, driven by the `open` prop). NO Framer Motion here.
 */
export function AddItemDialog() {
  const { addOpen, setAddOpen, categories, reload } = useItems();

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
    // Only ever drive the store to closed from here; opening is owned by the
    // sidebar button. Ignore close requests mid-submit.
    if (next) return;
    if (submitting) return;
    setAddOpen(false);
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

  // --- Live-preview derived values (mirror what the real ItemRow shows) ---
  const previewLabel = trimmedLabel || "Untitled item";
  const previewCategory = category.trim() || "Uncategorized";
  const seedLabel = trimmedLabel || "new-item";
  const previewMeta =
    type === "File"
      ? pickedPath
        ? lastPathSegment(pickedPath)
        : `file · ${previewCategory}`
      : confidential
        ? "•••••• confidential"
        : previewValue(value) || "text snippet";

  return (
    <Sheet open={addOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92vh] w-full max-w-[820px] gap-0 overflow-y-auto rounded-t-[24px] border-0 p-0 shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.35)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          labelInputRef.current?.focus();
        }}
        aria-describedby={`${datalistId}-desc`}
      >
        {/* Grab-handle bar (iOS sheet affordance). */}
        <div aria-hidden="true" className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-[#d8d8d4]" />
        </div>

        <div className="grid gap-0 md:grid-cols-[1fr_300px]">
          {/* ── LEFT: the form ── */}
          <div className="order-2 md:order-1">
            <SheetHeader className="space-y-1 px-5 pb-1 pt-3 text-left">
              <SheetTitle className="font-serif-brand text-[1.375rem] font-semibold text-[var(--ink)]">
                Mint a new item
              </SheetTitle>
              <SheetDescription id={`${datalistId}-desc`} className="text-xs">
                Store a snippet of text or a file, encrypted locally.
              </SheetDescription>
            </SheetHeader>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 px-5 pb-6 pt-4"
            >
              {/* Label */}
              <div className="space-y-1.5">
                <Label htmlFor={`${datalistId}-label`}>Label</Label>
                <Input
                  id={`${datalistId}-label`}
                  ref={labelInputRef}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Production API key"
                  required
                />
              </div>

              {/* Type segmented toggle */}
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div
                  role="radiogroup"
                  aria-label="Item type"
                  className="flex gap-1 rounded-lg border border-input bg-secondary p-1"
                >
                  {(["Text", "File"] as const).map((t) => {
                    const active = type === t;
                    const Icon = t === "Text" ? KeyRound : FileText;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setType(t);
                          setError(null);
                        }}
                        className={cn(
                          "qb-press flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[0.8125rem] font-semibold tracking-tight transition-colors",
                          active
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
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
                <div className="space-y-1.5">
                  <Label htmlFor={`${datalistId}-value`}>Value</Label>
                  <Textarea
                    id={`${datalistId}-value`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Paste the text to store…"
                    rows={4}
                    className="min-h-[5.25rem] resize-y leading-relaxed"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>File</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleChooseFile}
                    className={cn(
                      "h-auto w-full justify-start border-dashed bg-secondary px-3 py-2.5 font-medium",
                      pickedPath ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Folder size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {pickedPath ? lastPathSegment(pickedPath) : "Choose file…"}
                    </span>
                  </Button>
                  {pickedPath && (
                    <div
                      title={pickedPath}
                      className="truncate text-[0.6875rem] text-muted-foreground"
                    >
                      {pickedPath}
                    </div>
                  )}
                </div>
              )}

              {/* Category combobox via datalist */}
              <div className="space-y-1.5">
                <Label htmlFor={`${datalistId}-category`}>Category</Label>
                <Input
                  id={`${datalistId}-category`}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list={datalistId}
                  placeholder="Pick or type a category"
                />
                <datalist id={datalistId}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Confidential switch */}
              <label
                htmlFor={`${datalistId}-confidential`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-secondary px-3 py-2.5"
              >
                <Lock
                  size={15}
                  className={cn(
                    "shrink-0",
                    confidential ? "text-foreground" : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-semibold tracking-tight text-foreground">
                    Confidential
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    Require Touch ID before revealing.
                  </span>
                </span>
                <Switch
                  id={`${datalistId}-confidential`}
                  checked={confidential}
                  onCheckedChange={setConfidential}
                />
              </label>

              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/25 bg-destructive/[0.07] px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </div>
              )}

              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="qb-press flex-1"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="qb-press flex-1"
                  disabled={!valid || submitting}
                >
                  {submitting ? "Minting…" : "Mint item"}
                </Button>
              </div>
            </form>
          </div>

          {/* ── RIGHT: live preview + gradient brand band ── */}
          <aside
            aria-hidden="true"
            className="order-1 flex flex-col gap-3 border-b border-border bg-[#fafafa] p-5 md:order-2 md:border-b-0 md:border-l"
          >
            {/* Gradient-shader brand accent strip (the ONLY colour here). */}
            <GradientBrand height={92} radius="16px" />

            <div className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-[var(--faint)]">
              Live preview
            </div>

            {/* LIVE item card — mirrors a Library row / quick card. MONOCHROME. */}
            <div
              className="qb-quick-card flex flex-col gap-3 rounded-[var(--r-card)] bg-white p-3.5"
              style={{ boxShadow: "var(--shadow-depth)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="qb-tile relative flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[var(--r-tile)] text-[var(--ink)]"
                  style={{
                    background: confidential
                      ? "rgba(11,11,12,0.06)"
                      : "var(--hair)",
                  }}
                >
                  {/* MONOCHROME seeded dither seal — NEVER the gradient. */}
                  <DitherArt
                    width={38}
                    height={38}
                    density={0.95}
                    seed={seedLabel}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "38px",
                      height: "38px",
                      opacity: 0.32,
                    }}
                  />
                  <span className="relative z-[1]">
                    {confidential ? (
                      <Lock size={16} />
                    ) : type === "File" ? (
                      <FileText size={16} />
                    ) : (
                      <KeyRound size={16} />
                    )}
                  </span>
                </span>
                {/* Category pill */}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--text)] shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
                  <span className="h-[6px] w-[6px] rounded-full bg-[var(--faint)]" />
                  {previewCategory}
                </span>
              </div>

              <div className="min-w-0">
                <div className="truncate text-[0.9375rem] font-bold tracking-[-0.015em] text-[var(--ink)]">
                  {previewLabel}
                </div>
                <div
                  className={cn(
                    "mt-0.5 truncate text-xs text-[var(--muted)]",
                    type === "Text" && !confidential && trimmedValue
                      ? "tabular font-mono"
                      : undefined,
                  )}
                >
                  {previewMeta}
                </div>
              </div>
            </div>

            <p className="font-serif-brand text-[0.8125rem] leading-snug text-[var(--muted)]">
              A clipboard of yourself — one keystroke away.
            </p>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}
