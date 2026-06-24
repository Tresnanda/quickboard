import { useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { SlotText } from "slot-text/react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, ChevronDown, ChevronsUpDown, House, LayoutGrid, MoreHorizontal, Plus, Settings as SettingsIcon, Star, Zap } from "lucide-react";
import { useItems } from "../lib/items-store";
import { useAppearance } from "../lib/appearance";
import { useProfile } from "../lib/profile";
import { ICONS } from "../lib/icons";
import { TINTS } from "../lib/tints";
import { Avatar } from "./Avatar";
import { NewEnvironmentModal } from "./NewEnvironmentModal";
import { ProfileEditor } from "./ProfileEditor";
import { cn } from "../lib/utils";

export function Sidebar() {
  const {
    items, environments, activeEnvironment, categoryFilter, pinnedOnly,
    setActiveEnvironment, setCategoryFilter, setPinnedOnly, setTypeFilter, setAddOpen, setPaletteOpen,
  } = useItems();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onHome = pathname === "/";
  const [envOpen, setEnvOpen] = useState(true);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [editEnv, setEditEnv] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profile = useProfile();

  // magnetic pull on the primary CTA
  const reduce = useReducedMotion();
  const newMagX = useMotionValue(0);
  const newMagY = useMotionValue(0);
  const newX = useSpring(newMagX, { stiffness: 300, damping: 18 });
  const newY = useSpring(newMagY, { stiffness: 300, damping: 18 });
  function onNewMove(e: React.MouseEvent) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    newMagX.set((e.clientX - (r.left + r.width / 2)) * 0.2);
    newMagY.set((e.clientY - (r.top + r.height / 2)) * 0.32);
  }
  function onNewLeave() {
    newMagX.set(0);
    newMagY.set(0);
  }

  const favCount = useMemo(() => items.filter((i) => i.pinned).length, [items]);
  const countByEnv = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.environment, (m.get(it.environment) ?? 0) + 1);
    return m;
  }, [items]);

  function goHome() {
    setPinnedOnly(false);
    setCategoryFilter(null);
    setTypeFilter(null);
    if (!onHome) navigate({ to: "/" });
  }
  function goFavorites() {
    setPinnedOnly(true);
    setCategoryFilter(null);
    setTypeFilter(null);
    if (!onHome) navigate({ to: "/" });
  }
  function goEnv(env: string | null) {
    setActiveEnvironment(env);
    setPinnedOnly(false);
    setTypeFilter(null);
    if (!onHome) navigate({ to: "/" });
  }

  const homeActive = onHome && !pinnedOnly && !categoryFilter;
  const favActive = onHome && pinnedOnly;

  return (
    <aside className="flex w-[226px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--sidebar)] shadow-[var(--shadow-shell)]">
      <div data-tauri-drag-region className="h-8 shrink-0" />

      <div data-tauri-drag-region className="flex items-center gap-2.5 px-4 pb-3">
        <img src="/quickboard-logo.svg" alt="quickboard" draggable={false} className="h-[28px] w-[28px] rounded-[9px] shadow-ink" />
        <span className="text-[14px] font-extrabold tracking-[-0.025em] text-[var(--ink)]">quickboard</span>
      </div>

      <div className="px-3">
        <motion.button
          type="button"
          onClick={() => setAddOpen(true)}
          onMouseMove={onNewMove}
          onMouseLeave={onNewLeave}
          whileTap={{ scale: 0.96 }}
          style={{ x: newX, y: newY }}
          className="qb-no-drag qb-shine flex h-[36px] w-full items-center gap-2.5 rounded-[11px] bg-[var(--ink)] px-3 text-[13px] font-semibold tracking-[-0.01em] text-white shadow-ink"
        >
          <Plus size={16} strokeWidth={2.1} />
          New item
          <span className="ml-auto rounded-[5px] bg-white/10 px-1.5 py-0.5 text-[10px] font-medium opacity-80">⌘N</span>
        </motion.button>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="qb-press mt-1 flex h-[33px] w-full items-center gap-2.5 rounded-[10px] px-3 text-[12.5px] font-medium text-[#54545c] hover:bg-black/[0.04]"
        >
          <Zap size={16} strokeWidth={1.8} className="text-[#84848c]" />
          Quick find
          <span className="ml-auto rounded-[5px] bg-[#e9e9ee] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">⌘K</span>
        </button>
      </div>

      <nav className="qb-scroll flex flex-1 flex-col gap-1.5 px-3 pt-3">
        <NavRow icon={<House size={16} strokeWidth={1.85} />} active={homeActive} onClick={goHome}>Home</NavRow>
        <NavRow icon={<Star size={16} strokeWidth={1.85} />} active={favActive} onClick={goFavorites} badge={favCount > 0 ? favCount : undefined}>
          Favorites
        </NavRow>
        <Link
          to="/settings"
          className={cn(
            "qb-press relative flex h-[32px] items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px]",
            pathname === "/settings" ? "font-semibold text-[var(--ink)]" : "font-medium text-[#54545c] hover:bg-black/[0.04]",
          )}
        >
          {pathname === "/settings" && (
            <motion.span layoutId="sb-nav" className="absolute inset-0 rounded-[9px] bg-[#e8e8ec]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
          )}
          <SettingsIcon size={16} strokeWidth={1.85} className={cn("relative", pathname === "/settings" ? "text-[var(--ink)]" : "text-[#84848c]")} />
          <span className="relative">Settings</span>
        </Link>

        <div className="mt-5 flex items-center gap-1 px-2.5 pb-1.5">
          <button
            type="button"
            onClick={() => setEnvOpen((v) => !v)}
            className="qb-press flex flex-1 items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--fainter)]"
          >
            Environments
            <ChevronDown size={13} className={cn("transition-transform duration-200", envOpen ? "" : "-rotate-90")} />
          </button>
          <button
            type="button"
            onClick={() => setEnvModalOpen(true)}
            aria-label="New environment"
            className="qb-press grid h-[19px] w-[19px] place-items-center rounded-[6px] text-[var(--fainter)] hover:bg-black/[0.06] hover:text-[var(--ink)]"
          >
            <Plus size={13} strokeWidth={2.3} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {envOpen && (
            <motion.div
              key="envlist"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col gap-1.5 overflow-hidden"
            >
              <NavRow icon={<LayoutGrid size={16} strokeWidth={1.85} />} active={onHome && activeEnvironment === null} onClick={() => goEnv(null)} badge={items.length || undefined} small pillId="sb-env">
                All environments
              </NavRow>
              {environments.map((env) => (
                <EnvRow
                  key={env}
                  env={env}
                  active={onHome && activeEnvironment === env}
                  onClick={() => goEnv(env)}
                  onEdit={() => setEditEnv(env)}
                  badge={countByEnv.get(env) || undefined}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="qb-press flex w-full items-center gap-2.5 rounded-[13px] border border-[var(--border)] bg-white px-2.5 py-2 text-left shadow-sm hover:bg-[#fafafc]"
        >
          <Avatar name={profile.name || "you"} tint={profile.tint} photo={profile.photo} className="h-[31px] w-[31px] rounded-[9px] text-[13px] ring-1 ring-black/5" />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold leading-tight text-[var(--ink)]">{profile.name === "you" ? "you" : profile.name}</div>
            <div className="truncate text-[10.5px] text-[var(--faint)]">{profile.status || "Local on this Mac"}</div>
          </div>
          <ChevronsUpDown size={16} className="ml-auto text-[#b9b9c1]" />
        </button>
      </div>

      <NewEnvironmentModal open={envModalOpen || editEnv !== null} edit={editEnv} onClose={() => { setEnvModalOpen(false); setEditEnv(null); }} />
      <ProfileEditor open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  );
}

function NavRow({
  icon, active, onClick, badge, pillId = "sb-nav", children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
  small?: boolean;
  pillId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "qb-press relative flex h-[32px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px]",
        active ? "font-semibold text-[var(--ink)]" : "font-medium text-[#54545c] hover:bg-black/[0.04]",
      )}
    >
      {active && (
        <motion.span
          layoutId={pillId}
          className="absolute inset-0 rounded-[9px] bg-[#e8e8ec]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className={cn("relative", active ? "text-[var(--ink)]" : "text-[#84848c]")}>{icon}</span>
      <span className="relative truncate">{children}</span>
      {badge != null && (
        <span className="relative ml-auto inline-flex h-[20px] min-w-[22px] items-center justify-center rounded-[7px] bg-[#e9e9ee] px-[6px] text-[11px] font-medium text-[#82828a] tabular">
          <SlotText text={String(badge)} />
        </span>
      )}
    </button>
  );
}

/** An environment row — uses the environment's chosen icon + color (from the appearance
 * store under `env:${name}`), falling back to a neutral box. */
function EnvRow({ env, active, badge, onClick, onEdit }: { env: string; active: boolean; badge?: number; onClick: () => void; onEdit: () => void }) {
  const app = useAppearance(`env:${env}`);
  const Icon = app.icon ? ICONS[app.icon] : Box;
  const color = app.tint ? TINTS[app.tint].tileInk : undefined;
  return (
    <div className="group/env relative">
      <NavRow icon={<Icon size={16} strokeWidth={1.85} style={color ? { color } : undefined} />} active={active} onClick={onClick} badge={badge} small pillId="sb-env">
        {env}
      </NavRow>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        aria-label={`Manage ${env}`}
        className="qb-press absolute right-1.5 top-1/2 z-10 grid h-[22px] w-[22px] -translate-y-1/2 place-items-center rounded-[7px] bg-[#e8e8ec] text-[#84848c] opacity-0 transition-opacity hover:text-[var(--ink)] group-hover/env:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
