import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ShieldCheck, ClipboardCopy, Trash2, Check } from "lucide-react";
import { SlotText } from "slot-text/react";
import { useItems } from "../lib/items-store";
import { useSettings, setSetting, type Density } from "../lib/settings";
import { useProfile } from "../lib/profile";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { ProfileEditor } from "../components/ProfileEditor";
import { Avatar } from "../components/Avatar";
import { Select } from "../components/Select";
import { deleteItem, getAutostart, getTextValue, setAutostart } from "../lib/ipc";
import { cn } from "../lib/utils";

export function Settings() {
  const { items, environments, reload } = useItems();
  const settings = useSettings();
  const profile = useProfile();
  const confirm = useConfirm();
  const toast = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autostart, setAutostartState] = useState(false);

  useEffect(() => {
    void getAutostart().then(setAutostartState).catch(() => {});
  }, []);

  async function toggleAutostart(v: boolean) {
    setAutostartState(v);
    try {
      await setAutostart(v);
    } catch {
      setAutostartState(!v);
    }
  }

  const stats = useMemo(
    () => ({
      total: items.length,
      files: items.filter((i) => i.kind === "File").length,
      confidential: items.filter((i) => i.confidential).length,
    }),
    [items],
  );

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    try {
      const exported = await Promise.all(
        items.map(async (it) => {
          let value: string | null = null;
          if (it.kind === "Text" && !it.confidential) {
            try {
              value = await getTextValue(it.id);
            } catch {
              /* skip */
            }
          }
          return { label: it.label, kind: it.kind, category: it.category, environment: it.environment, confidential: it.confidential, value, created_at: it.created_at };
        }),
      );
      const json = JSON.stringify({ exportedAt: new Date().toISOString(), count: exported.length, items: exported }, null, 2);
      await navigator.clipboard.writeText(json);
      toast({ message: `Backup of ${exported.length} items copied`, icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
    } catch {
      toast({ message: "Couldn't copy backup", icon: <ClipboardCopy size={14} />, tone: "rose" });
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (busy || items.length === 0) return;
    const ok = await confirm({ title: "Clear all data?", message: "Every item will be permanently deleted. This can't be undone.", confirmLabel: "Delete everything", tone: "danger" });
    if (!ok) return;
    setBusy(true);
    try {
      for (const it of items) {
        try {
          await deleteItem(it.id);
        } catch {
          /* best-effort */
        }
      }
      await reload();
      toast({ message: "All data cleared", icon: <Trash2 size={14} strokeWidth={2.2} />, tone: "rose" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div data-tauri-drag-region className="h-7 shrink-0" />
      <div className="qb-scroll flex-1 px-7 pb-10 pt-1">
        <h1 className="text-[18px] font-extrabold tracking-[-0.03em] text-[var(--ink)]">Settings</h1>
        <p className="mt-0.5 text-[11.5px] text-[var(--faint)]">Everything stays local on this Mac.</p>

        {/* profile */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="qb-press mt-5 flex w-full max-w-[540px] items-center gap-3 rounded-card border border-[var(--hair)] bg-white p-3 text-left shadow-sm hover:bg-[#fafafc]"
        >
          <Avatar name={profile.name || "you"} tint={profile.tint} photo={profile.photo} className="h-[42px] w-[42px] rounded-[12px] text-[16px] ring-1 ring-black/5" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold text-[var(--ink)]">{profile.name === "you" ? "you" : profile.name}</div>
            <div className="truncate text-[11.5px] text-[var(--faint)]">{profile.status || "Local on this Mac"}</div>
          </div>
          <span className="ml-auto text-[12px] font-semibold text-[var(--muted)]">Edit</span>
        </button>

        {/* stats */}
        <div className="mt-4 grid max-w-[540px] grid-cols-3 gap-3">
          <Stat label="Items" value={stats.total} />
          <Stat label="Files" value={stats.files} />
          <Stat label="Confidential" value={stats.confidential} />
        </div>

        <Section title="Behavior">
          <Row label="Confirm before deleting" hint="Ask before removing an item or folder.">
            <Toggle on={settings.confirmDelete} onChange={(v) => setSetting("confirmDelete", v)} />
          </Row>
          <Row label="Launch environment" hint="Which environment is active when the app opens.">
            <Select
              value={settings.defaultEnvironment ?? ""}
              options={[{ value: "", label: "All environments" }, ...environments.map((env) => ({ value: env, label: env }))]}
              onChange={(v) => setSetting("defaultEnvironment", v || null)}
            />
          </Row>
          <Row label="Launch at login" hint="Run quietly in the background so ⌥Space works without opening the app.">
            <Toggle on={autostart} onChange={(v) => void toggleAutostart(v)} />
          </Row>
        </Section>

        <Section title="Appearance & motion">
          <Row label="Density" hint="How tightly the board packs.">
            <Segmented<Density>
              value={settings.density}
              options={[
                { v: "comfortable", l: "Comfortable" },
                { v: "compact", l: "Compact" },
              ]}
              onChange={(v) => setSetting("density", v)}
            />
          </Row>
          <Row label="Reduce motion" hint="Minimise animations across the app.">
            <Toggle on={settings.reduceMotion} onChange={(v) => setSetting("reduceMotion", v)} />
          </Row>
          <Row label="Tactile sounds" hint="Subtle clicks when you summon, paste, and save.">
            <Toggle on={settings.soundEffects} onChange={(v) => setSetting("soundEffects", v)} />
          </Row>
          <Row label="Clipboard history" hint="Keep a rolling history of what you copy in the tray's Clipboard lane. Password-manager copies are skipped.">
            <Toggle on={settings.clipboardHistory} onChange={(v) => setSetting("clipboardHistory", v)} />
          </Row>
        </Section>

        <Section title="Security">
          <Row label="Auto-hide secrets" hint="How long a revealed value stays visible.">
            <Segmented
              value={String(settings.autoHideSeconds)}
              options={[
                { v: "15", l: "15s" },
                { v: "30", l: "30s" },
                { v: "60", l: "1m" },
                { v: "300", l: "5m" },
              ]}
              onChange={(v) => setSetting("autoHideSeconds", Number(v))}
            />
          </Row>
          <Row label="Lock on focus loss" hint="Hide revealed secrets when the app loses focus.">
            <Toggle on={settings.lockOnBlur} onChange={(v) => setSetting("lockOnBlur", v)} />
          </Row>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#e6f2ea] text-[#3f7a57]">
              <ShieldCheck size={16} />
            </span>
            <div className="text-[11.5px] text-[var(--muted)]">Confidential items are encrypted at rest and unlock with Touch ID.</div>
          </div>
        </Section>

        <Section title="Data & backup">
          <Row label="Export backup" hint="Copy a JSON of everything to your clipboard.">
            <button type="button" onClick={() => void exportBackup()} disabled={busy} className="qb-press flex h-[32px] items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-white px-3 text-[12px] font-semibold text-[var(--ink)] disabled:opacity-50">
              <ClipboardCopy size={14} /> Copy
            </button>
          </Row>
          <Row label="Clear all data" hint="Permanently delete every item.">
            <button type="button" onClick={() => void clearAll()} disabled={busy || items.length === 0} className="qb-press flex h-[32px] items-center gap-1.5 rounded-[9px] border border-[#f0d9dd] bg-[#fbf2f3] px-3 text-[12px] font-semibold text-[#b4424f] disabled:opacity-40">
              <Trash2 size={14} /> Clear…
            </button>
          </Row>
        </Section>

        <Section title="About">
          <Row label="Onboarding" hint="Run the first-launch flow again.">
            <button type="button" onClick={() => window.dispatchEvent(new Event("qb:replay-onboarding"))} className="qb-press qb-shine flex h-[32px] items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-white px-3 text-[12px] font-semibold text-[var(--ink)]">
              Replay
            </button>
          </Row>
        </Section>
      </div>

      <ProfileEditor open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-[var(--hair)] bg-white p-4 shadow-sm">
      <div className="text-[22px] font-extrabold tracking-[-0.03em] text-[var(--ink)] tabular">
        <SlotText text={String(value)} />
      </div>
      <div className="mt-0.5 text-[11.5px] text-[var(--faint)]">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 max-w-[540px]">
      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--fainter)]">{title}</div>
      <div className="divide-y divide-[var(--hair)] overflow-hidden rounded-card border border-[var(--hair)] bg-white shadow-sm">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[var(--ink)]">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-[var(--faint)]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn("qb-press relative h-[24px] w-[42px] shrink-0 rounded-full transition-colors", on ? "bg-[var(--ink)]" : "bg-[#d8d8de]")}
    >
      <span className={cn("absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all duration-200", on ? "left-[21px]" : "left-[3px]")} />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-[9px] bg-[#eeeef2] p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn("qb-press rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors", value === o.v ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]")}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
