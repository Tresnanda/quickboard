import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

/** A styled single-select dropdown — replaces the native <select> (OS popup). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="qb-press flex h-[34px] min-w-[160px] items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[#fafafc] px-2.5 text-[12.5px] font-medium text-[var(--ink)]"
      >
        <span className="flex-1 truncate text-left">{current?.label ?? ""}</span>
        <ChevronDown size={14} className={cn("text-[var(--faint)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="qb-scroll absolute right-0 top-[calc(100%+5px)] z-30 max-h-[220px] min-w-full overflow-auto rounded-[12px] border border-[var(--hair)] bg-white p-1 shadow-pop">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn("flex w-full items-center gap-2 rounded-[8px] px-2.5 py-[7px] text-left text-[12.5px]", o.value === value ? "bg-[#f1f1f5] font-semibold text-[var(--ink)]" : "text-[var(--text)] hover:bg-[#f6f6f9]")}
            >
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <Check size={13} className="text-[var(--ink)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
