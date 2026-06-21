import { useEffect, useId, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FileText, Folder, KeyRound, Lock } from "lucide-react";
import { useItems } from "../lib/items-store";
import { addFile, addText } from "../lib/ipc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { DitherArt } from "./DitherArt";
import { cn } from "../lib/utils";

type ItemType = "Text" | "File";

function lastPathSegment(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

/**
 * Add-item sheet — an iOS-flavoured **bottom sheet** (shadcn/ui `Sheet`, which
 * wraps Radix Dialog under the hood). It slides up from the bottom with rounded
 * top corners and a grab-handle bar.
 *
 * NO Framer Motion: the slide-up / slide-down comes from shadcn's data-state
 * Tailwind classes (`tailwindcss-animate`), which mount + unmount reliably and
 * are driven entirely by the `open` prop.
 *
 * Controlled by `useItems().addOpen` — opened from the sidebar's "Add item"
 * button. There is no trigger; closing (Esc / overlay / Cancel / X) flips
 * `addOpen` back to false and the sheet clears with its content.
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

  return (
    <Sheet open={addOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88vh] w-full max-w-[520px] gap-0 overflow-y-auto rounded-t-[22px] border-0 p-0 shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.35)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          labelInputRef.current?.focus();
        }}
        aria-describedby={`${datalistId}-desc`}
      >
        {/* Grab-handle bar (iOS sheet affordance). */}
        <div
          aria-hidden="true"
          className="flex justify-center pb-1 pt-2.5"
        >
          <span className="h-1 w-9 rounded-full bg-[#d8d8d4]" />
        </div>

        {/* Decorative real-Bayer-dither header band (ink-first, monochrome).
            Purely cosmetic — does not affect open/close. */}
        <div
          aria-hidden="true"
          className="relative h-[84px] w-full overflow-hidden border-b border-border bg-[#fafafa]"
        >
          <DitherArt
            width={520}
            height={84}
            density={1.05}
            seed="add-item-sheet"
            className="absolute inset-0 opacity-90"
            style={{ width: "100%", height: "84px" }}
          />
          {/* Soft fade into the form so the dots dissolve, not cut. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/85" />
        </div>

        <SheetHeader className="space-y-1 px-5 pt-4 text-left">
          <SheetTitle className="text-base font-bold tracking-tight text-[var(--ink)]">
            Add item
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

          <SheetFooter className="mt-1 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="qb-press"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="qb-press"
              disabled={!valid || submitting}
            >
              {submitting ? "Adding…" : "Add item"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
