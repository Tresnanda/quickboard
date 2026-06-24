import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

/** A styled, free-text combobox to replace native <datalist> (which the webview
 * renders as an unstyleable, inconsistent OS popup). Type freely; pick a suggestion. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const typed = value.trim().toLowerCase();
  const filtered = options.filter((o) => o.toLowerCase().includes(typed) && o.toLowerCase() !== typed);
  const show = open && filtered.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setActive(-1);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && !show) {
      setOpen(true);
      return;
    }
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="qb-input"
      />
      {show && (
        <div className="qb-scroll absolute left-0 right-0 top-[calc(100%+5px)] z-30 max-h-[176px] overflow-auto rounded-[12px] border border-[var(--hair)] bg-white p-1 shadow-pop">
          {filtered.map((o, idx) => (
            <button
              key={o}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onPointerEnter={() => setActive(idx)}
              className={cn(
                "block w-full truncate rounded-[8px] px-2.5 py-[7px] text-left text-[13px] text-[var(--ink)] transition-colors",
                idx === active ? "bg-[#f1f1f5]" : "hover:bg-[#f6f6f9]",
              )}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
