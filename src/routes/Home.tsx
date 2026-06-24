import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SlotText } from "slot-text/react";
import { ArrowLeft, Check, ChevronDown, Code, FileText, Image as ImageIcon, Link as LinkIcon, Plus, Search, SlidersHorizontal, StickyNote } from "lucide-react";
import { useItems } from "../lib/items-store";
import { CONTENT_TYPE_LABEL, contentType } from "../lib/content-type";
import type { ContentType, Item } from "../lib/types";
import { CategoryCard } from "../components/CategoryCard";
import { FolderEditor } from "../components/FolderEditor";
import { ItemRow } from "../components/ItemRow";
import { cn } from "../lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const TYPES: { type: ContentType | null; label: string; icon?: typeof StickyNote }[] = [
  { type: null, label: "All types" },
  { type: "note", label: "Notes", icon: StickyNote },
  { type: "link", label: "Links", icon: LinkIcon },
  { type: "image", label: "Images", icon: ImageIcon },
  { type: "file", label: "Files", icon: FileText },
  { type: "code", label: "Code", icon: Code },
];

export function Home() {
  const {
    items, query, setQuery, activeEnvironment,
    categoryFilter, setCategoryFilter, pinnedOnly, setPinnedOnly, typeFilter, setTypeFilter,
  } = useItems();

  const envItems = useMemo(
    () => (activeEnvironment ? items.filter((i) => i.environment === activeEnvironment) : items),
    [items, activeEnvironment],
  );

  // categories === folders, with a live count
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of envItems) if (it.category) m.set(it.category, (m.get(it.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [envItems]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return envItems
      .filter((it) => {
        if (pinnedOnly && !it.pinned) return false;
        if (categoryFilter && it.category !== categoryFilter) return false;
        if (typeFilter && contentType(it) !== typeFilter) return false;
        if (q && !it.label.toLowerCase().includes(q) && !it.category.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (b.last_used_at || b.created_at) - (a.last_used_at || a.created_at));
  }, [envItems, query, categoryFilter, pinnedOnly, typeFilter]);

  const pinned = useMemo(() => visible.filter((i) => i.pinned), [visible]);
  const rest = useMemo(() => visible.filter((i) => !i.pinned), [visible]);
  const showPinnedSection = !pinnedOnly && pinned.length > 0;
  const mainItems = pinnedOnly ? visible : rest;

  const title = pinnedOnly ? "Favorites" : categoryFilter ?? greeting();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);

  // Insurance against WebKit stranding a folder background on resize: nudge an
  // imperceptible, *centered* sub-pixel offset so the baked cover re-rasterizes
  // without ever shifting its crop. A ResizeObserver catches the real layout change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let flip = false;
    const repaint = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        flip = !flip;
        el.querySelectorAll<HTMLElement>("[data-folder-card]").forEach((c) => {
          c.style.backgroundPosition = flip ? "calc(50% + 0.5px) center" : "center";
        });
      });
    };
    const ro = new ResizeObserver(repaint);
    ro.observe(el);
    window.addEventListener("resize", repaint);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", repaint);
      cancelAnimationFrame(raf);
    };
  }, []);

  function pickFolder(cat: string, e?: React.MouseEvent) {
    const sc = scrollRef.current;
    if (e && sc) {
      const cr = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      setOrigin({ x: cr.left - sr.left + cr.width / 2, y: cr.top - sr.top + sc.scrollTop + cr.height / 2 });
    }
    setPinnedOnly(false);
    setCategoryFilter(cat);
  }

  const itemsContent =
    visible.length === 0 ? (
      <EmptyState filtered={items.length > 0} />
    ) : (
      <>
        {showPinnedSection && (
          <section className="mb-6">
            <SectionLabel>Pinned</SectionLabel>
            <ItemList items={pinned} />
          </section>
        )}
        {mainItems.length > 0 && (
          <section>
            <SectionLabel>{pinnedOnly ? "Favorites" : showPinnedSection ? "Everything else" : categoryFilter ?? "All items"}</SectionLabel>
            <ItemList items={mainItems} />
          </section>
        )}
      </>
    );

  return (
    <div className="flex h-full flex-col">
      <div data-tauri-drag-region className="h-7 shrink-0" />

      <header className="px-5 pt-1 lg:px-8">
        <div className="flex items-center gap-1.5">
          <AnimatePresence initial={false}>
            {categoryFilter && (
              <motion.button
                key="back"
                type="button"
                onClick={() => setCategoryFilter(null)}
                aria-label="Back to folders"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 28 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="qb-press grid h-7 shrink-0 place-items-center overflow-hidden rounded-full text-[var(--muted)] hover:bg-black/[0.06]"
              >
                <ArrowLeft size={17} />
              </motion.button>
            )}
          </AnimatePresence>
          <h1 className="text-[18px] font-extrabold tracking-[-0.025em] text-[var(--ink)]">
            <AnimatePresence mode="wait">
              <motion.span
                key={title}
                className="inline-block"
                initial={{ opacity: 0, filter: "blur(5px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(5px)" }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              >
                {title}
              </motion.span>
            </AnimatePresence>
          </h1>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[var(--faint)] tabular">
          <span>{activeEnvironment ?? "All environments"} ·</span>
          <SlotText text={String(visible.length)} />
          <span>{visible.length === 1 ? "thing" : "things"}</span>
        </p>

        <div className="mb-4 mt-3 flex items-center gap-2">
          <div className="flex h-[34px] flex-1 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[#f4f4f6] px-3">
            <Search size={15} className="shrink-0 text-[var(--fainter)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your notes, links, files…"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--fainter)]"
            />
            <span className="rounded-[5px] bg-[#ececf1] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">⌘K</span>
          </div>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="qb-press flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-white px-2.5 text-[12px] font-medium text-[#54545c] outline-none hover:bg-black/[0.02]"
              >
                <SlidersHorizontal size={13} className="text-[#84848c]" />
                {typeFilter ? CONTENT_TYPE_LABEL[typeFilter] : "All types"}
                <ChevronDown size={13} className="text-[var(--fainter)]" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                style={{ transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)" }}
                className="z-50 min-w-[176px] rounded-[12px] border border-[var(--hair)] bg-white p-1.5 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
              >
                {TYPES.map((t) => {
                  const active = typeFilter === t.type;
                  const Icon = t.icon;
                  return (
                    <DropdownMenu.Item
                      key={t.label}
                      onSelect={() => setTypeFilter(t.type)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13px] outline-none transition-colors",
                        active ? "font-semibold text-[var(--ink)]" : "text-[#54545c] data-[highlighted]:bg-black/[0.04]",
                      )}
                    >
                      {Icon ? <Icon size={15} strokeWidth={1.85} className="text-[#84848c]" /> : <span className="w-[15px]" />}
                      {t.label}
                      {active && <Check size={14} className="ml-auto text-[var(--ink)]" />}
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div ref={scrollRef} className="qb-scroll flex-1 px-5 pb-8 lg:px-8">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={categoryFilter ?? (pinnedOnly ? "favorites" : "home")}
            style={{ transformOrigin: categoryFilter && origin ? `${origin.x}px ${origin.y}px` : "center 28%" }}
            initial={categoryFilter ? { opacity: 0, scale: 0.56, filter: "blur(18px)" } : { opacity: 0, scale: 1.1, filter: "blur(18px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={categoryFilter ? { opacity: 0, scale: 0.56, filter: "blur(18px)" } : { opacity: 0, scale: 1.1, filter: "blur(18px)" }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            {!categoryFilter && !pinnedOnly && folders.length > 0 && (
              <section className="mb-7">
                <SectionLabel>Folders</SectionLabel>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 132px), 178px))" }}>
                  {folders.map(([cat, count]) => (
                    <CategoryCard key={cat} category={cat} count={count} active={false} onClick={(e) => pickFolder(cat, e)} onEdit={() => setEditingFolder(cat)} />
                  ))}
                </div>
              </section>
            )}
            {itemsContent}
          </motion.div>
        </AnimatePresence>
      </div>

      <FolderEditor folder={editingFolder} onClose={() => setEditingFolder(null)} />
    </div>
  );
}

function ItemList({ items }: { items: Item[] }) {
  return (
    <motion.div layout className="divide-y divide-[var(--hair)] overflow-hidden rounded-[14px] border border-[var(--hair)] bg-white">
      <AnimatePresence mode="popLayout">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: Math.min(i, 12) * 0.02 }}
          >
            <ItemRow item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--fainter)]">{children}</div>;
}

const EMPTY_ITEM: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.23, 1, 0.32, 1] } } };

function EmptyState({ filtered }: { filtered: boolean }) {
  const { setAddOpen } = useItems();
  return (
    <motion.div
      className="grid place-items-center py-16"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }}
    >
      <div className="max-w-[300px] text-center">
        <motion.div variants={EMPTY_ITEM} className="mb-4">
          <div className="qb-float mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-[var(--hair)] bg-white text-[var(--faint)] shadow-sm">
            <StickyNote size={24} strokeWidth={1.6} />
          </div>
        </motion.div>
        <motion.h2 variants={EMPTY_ITEM} className="text-balance text-[16px] font-bold tracking-[-0.01em] text-[var(--ink)]">
          {filtered ? "Nothing here" : "Welcome to quickboard"}
        </motion.h2>
        <motion.p variants={EMPTY_ITEM} className="mt-1 text-pretty text-[13px] leading-relaxed text-[var(--faint)]">
          {filtered ? "No items match this view." : "Stash the things you reach for constantly — facts, files, snippets — and summon them in a keystroke."}
        </motion.p>
        {!filtered && (
          <motion.button
            variants={EMPTY_ITEM}
            type="button"
            onClick={() => setAddOpen(true)}
            className="qb-press qb-shine mt-4 inline-flex h-[38px] items-center gap-2 rounded-[11px] bg-[var(--ink)] px-4 text-[13px] font-semibold text-white shadow-ink"
          >
            <Plus size={15} strokeWidth={2.2} />
            Add your first item
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
