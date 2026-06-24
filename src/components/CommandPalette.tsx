import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useItems } from "../lib/items-store";
import { getTextValue } from "../lib/ipc";
import { getAppearance } from "../lib/appearance";
import { ICONS, defaultIcon } from "../lib/icons";
import { contentType } from "../lib/content-type";
import { TINTS, itemTint } from "../lib/tints";
import { cn } from "../lib/utils";

const MAX = 8;

/**
 * ⌘K quick switcher. Used dozens of times a day → NO open animation (emil).
 * Type to filter, ↑/↓ to move, Enter copies the highlighted item (or opens a
 * file), click opens the detail modal.
 */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, items, setSelectedItemId } = useItems();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setIdx(0);
    }
  }, [paletteOpen]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? items.filter((i) => i.label.toLowerCase().includes(s) || i.category.toLowerCase().includes(s) || i.environment.toLowerCase().includes(s))
      : [...items].sort((a, b) => (b.last_used_at || b.created_at) - (a.last_used_at || a.created_at));
    return list.slice(0, MAX);
  }, [items, q]);

  useEffect(() => {
    if (idx >= results.length) setIdx(0);
  }, [results, idx]);

  async function copyItem(i: number) {
    const it = results[i];
    if (!it) return;
    if (it.kind === "Text") {
      try {
        const v = await getTextValue(it.id);
        await navigator.clipboard.writeText(v);
      } catch {
        /* cancelled */
      }
      setPaletteOpen(false);
    } else {
      setPaletteOpen(false);
      setSelectedItemId(it.id);
    }
  }

  function openItem(i: number) {
    const it = results[i];
    if (!it) return;
    setPaletteOpen(false);
    setSelectedItemId(it.id);
  }

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-[14%] z-50 w-[560px] max-w-[calc(100vw-3rem)] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[var(--hair)] bg-white shadow-modal"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              void copyItem(idx);
            }
          }}
        >
          <Dialog.Title className="sr-only">Quick find</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-[var(--hair)] px-4">
            <Search size={17} className="text-[var(--fainter)]" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIdx(0);
              }}
              placeholder="Search your board…   ↵ to copy"
              className="h-[52px] flex-1 bg-transparent text-[14.5px] text-[var(--ink)] outline-none placeholder:text-[var(--fainter)]"
            />
          </div>
          <div className="qb-scroll max-h-[340px] p-1.5">
            {results.length === 0 ? (
              <div className="px-3 py-7 text-center text-[13px] text-[var(--faint)]">No matches</div>
            ) : (
              results.map((it, i) => {
                const type = contentType(it);
                const name = getAppearance(it.id).icon ?? defaultIcon(type, it.confidential);
                const Icon = ICONS[name];
                const t = TINTS[itemTint(it)];
                return (
                  <button
                    key={it.id}
                    type="button"
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => openItem(i)}
                    className={cn("flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-left", i === idx && "bg-[#f3f3f6]")}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center" style={{ color: t.tileInk }}>
                      <Icon size={18} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-[var(--ink)]">{it.label}</span>
                      <span className="block truncate text-[11.5px] text-[var(--faint)]">{it.environment} · {it.category}</span>
                    </span>
                    {i === idx && <span className="shrink-0 text-[11px] text-[var(--faint)]">↵ copy</span>}
                  </button>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
