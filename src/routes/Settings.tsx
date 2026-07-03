import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Trash2, Check, RefreshCw, ArrowUpCircle, Download, Upload } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { save, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { SlotText } from "slot-text/react";
import { checkForUpdate, installUpdate, useUpdater } from "../lib/updater";
import { useItems } from "../lib/items-store";
import { useSettings, setSetting, type Density } from "../lib/settings";
import { useProfile } from "../lib/profile";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { ProfileEditor } from "../components/ProfileEditor";
import { Avatar } from "../components/Avatar";
import { Select } from "../components/Select";
import { clearImageCache } from "../lib/image-cache";
import { addText, deleteItem, getAutostart, getTextValue, readTextFile, saveTextFile, setAutostart } from "../lib/ipc";
import { isDuplicate, parseBackup, serializeBackup, type ExportedItem } from "../lib/backup";
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
  // Export/import are their own little flows so they can own an inline success
  // moment (an animated check + a count-up) without blocking the rest of the page.
  const [exportPhase, setExportPhase] = useState<"idle" | "working" | "done">("idle");
  const [exportedCount, setExportedCount] = useState(0);
  const [importPhase, setImportPhase] = useState<"idle" | "working" | "done">("idle");
  const [importedCount, setImportedCount] = useState(0);

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
    if (busy || exportPhase === "working") return;
    let path: string | null;
    try {
      path = await save({ defaultPath: "quickboard-backup.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    } catch {
      toast({ message: "Couldn't open the save dialog", tone: "rose" });
      return;
    }
    if (!path) return; // user cancelled — stay silent
    setExportPhase("working");
    try {
      const exported: ExportedItem[] = await Promise.all(
        items.map(async (it) => {
          let value: string | null = null;
          if (it.kind === "Text" && !it.confidential) {
            try {
              value = await getTextValue(it.id);
            } catch {
              /* skip — this item exports as metadata only */
            }
          }
          return { label: it.label, kind: it.kind, category: it.category, environment: it.environment, confidential: it.confidential, value, created_at: it.created_at };
        }),
      );
      const included = exported.filter((e) => e.value !== null).length;
      let appVersion: string | undefined;
      try {
        appVersion = await getVersion();
      } catch {
        /* version is optional metadata */
      }
      await saveTextFile(path, serializeBackup(exported, appVersion));
      setExportedCount(included);
      setExportPhase("done");
      window.setTimeout(() => setExportPhase("idle"), 2600);
      toast({ message: `Exported ${included} text ${included === 1 ? "item" : "items"}`, icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
    } catch {
      setExportPhase("idle");
      toast({ message: "Couldn't save backup", tone: "rose" });
    }
  }

  async function importBackup() {
    if (busy || importPhase === "working") return;
    let selected: string | string[] | null;
    try {
      selected = await openFileDialog({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    } catch {
      toast({ message: "Couldn't open the file picker", tone: "rose" });
      return;
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return; // user cancelled

    let importable: ReturnType<typeof parseBackup>["items"];
    let skipped: number;
    try {
      const json = await readTextFile(path);
      ({ items: importable, skipped } = parseBackup(json));
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn't read that backup file", tone: "rose" });
      return;
    }

    if (importable.length === 0) {
      toast({
        message: skipped > 0 ? `Nothing to import — ${skipped} ${skipped === 1 ? "entry is a file or confidential item" : "entries are files or confidential items"}` : "This backup has no text items",
        tone: "rose",
      });
      return;
    }

    const ok = await confirm({
      title: "Import backup?",
      message: `Import ${importable.length} text ${importable.length === 1 ? "item" : "items"}?${skipped > 0 ? ` ${skipped} ${skipped === 1 ? "entry" : "entries"} will be skipped (files and confidential items).` : ""}`,
      confirmLabel: "Import",
    });
    if (!ok) return;

    setImportPhase("working");
    try {
      // De-dupe against the existing board and against rows already added in this
      // batch (the export carries no ids, so we match on label+category+env+kind).
      const seen = items.map((i) => ({ label: i.label, category: i.category, environment: i.environment, kind: i.kind }));
      let imported = 0;
      let duplicates = 0;
      for (const row of importable) {
        if (isDuplicate(row, seen)) {
          duplicates += 1;
          continue;
        }
        try {
          await addText(row.label, row.category, row.environment, row.confidential, row.value);
          seen.push({ label: row.label, category: row.category, environment: row.environment, kind: "Text" });
          imported += 1;
        } catch {
          /* best-effort — a single failed row shouldn't abort the whole import */
        }
      }
      await reload();
      setImportedCount(imported);
      setImportPhase("done");
      window.setTimeout(() => setImportPhase("idle"), 2600);
      const parts = [`Imported ${imported} text ${imported === 1 ? "item" : "items"}`];
      if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped`);
      if (skipped > 0) parts.push(`${skipped} not importable`);
      toast({ message: parts.join(" · "), icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
    } catch {
      setImportPhase("idle");
      toast({ message: "Couldn't finish importing", tone: "rose" });
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
      clearImageCache();
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
          <Row label="Export text items" hint="Save a JSON file. Files and confidential items aren't included.">
            <BackupButton
              phase={exportPhase}
              count={exportedCount}
              idleIcon={<Download size={14} />}
              idleLabel="Export…"
              doneVerb="Exported"
              onClick={() => void exportBackup()}
              disabled={busy}
            />
          </Row>
          <Row label="Import backup" hint="Recreate text items from a backup file. Existing duplicates are skipped.">
            <BackupButton
              phase={importPhase}
              count={importedCount}
              idleIcon={<Upload size={14} />}
              idleLabel="Import…"
              doneVerb="Imported"
              onClick={() => void importBackup()}
              disabled={busy}
            />
          </Row>
          <Row label="Clear all data" hint="Permanently delete every item.">
            <button type="button" onClick={() => void clearAll()} disabled={busy || items.length === 0} className="qb-press flex h-[32px] items-center gap-1.5 rounded-[9px] border border-[#f0d9dd] bg-[#fbf2f3] px-3 text-[12px] font-semibold text-[#b4424f] disabled:opacity-40">
              <Trash2 size={14} /> Clear…
            </button>
          </Row>
        </Section>

        <UpdatesSection />

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

function UpdatesSection() {
  const { status, version, progress, error } = useUpdater();
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => {});
  }, []);
  const checking = status === "checking";
  const downloading = status === "downloading" || status === "ready";

  return (
    <Section title="Updates">
      <Row label="Version" hint={appVersion ? `quickboard ${appVersion} — updates install automatically from GitHub.` : "quickboard"}>
        <button
          type="button"
          onClick={() => void checkForUpdate(false)}
          disabled={checking || downloading}
          className="qb-press flex h-[32px] items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-white px-3 text-[12px] font-semibold text-[var(--ink)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </Row>
      {status === "uptodate" && <div className="px-4 py-2.5 text-[11.5px] text-[#3f7a57]">You're on the latest version.</div>}
      {status === "restart_required" && <div className="px-4 py-2.5 text-[11.5px] text-[#3f7a57]">Update installed — quit quickboard and reopen it to finish.</div>}
      {status === "error" && <div className="px-4 py-2.5 text-[11.5px] text-[#b4424f]">Couldn't check for updates{error ? ` — ${error}` : ""}.</div>}
      {(status === "available" || downloading) && (
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[var(--ink)]">Version {version} available</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--faint)]">{downloading ? `Downloading… ${Math.round(progress * 100)}%` : "Installs and restarts the app."}</div>
          </div>
          <button
            type="button"
            onClick={() => void installUpdate()}
            disabled={downloading}
            className="qb-press flex h-[32px] items-center gap-1.5 rounded-[9px] bg-[var(--ink)] px-3 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            <ArrowUpCircle size={14} /> {status === "ready" ? "Restarting…" : downloading ? "Installing…" : "Install & restart"}
          </button>
        </div>
      )}
    </Section>
  );
}

// A single backup action (export or import) that owns its own inline success
// moment: an animated check that springs in, with a count-up of how many items
// moved. Motion is off the critical path — the file work already finished — and
// collapses to instant when reduced motion is on.
function BackupButton({
  phase,
  count,
  idleIcon,
  idleLabel,
  doneVerb,
  onClick,
  disabled,
}: {
  phase: "idle" | "working" | "done";
  count: number;
  idleIcon: ReactNode;
  idleLabel: string;
  doneVerb: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const done = phase === "done";
  // Crossfade + blur between phases (never a bare crossfade); reduced motion → snap.
  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, filter: "blur(4px)", y: 3 },
        animate: { opacity: 1, filter: "blur(0.01px)", y: 0 },
        exit: { opacity: 0, filter: "blur(4px)", y: -3 },
        transition: { duration: 0.18, ease: [0.2, 0, 0, 1] as const },
      };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || phase === "working"}
      className={cn(
        "qb-press relative flex h-[32px] min-w-[112px] items-center justify-center gap-1.5 overflow-hidden rounded-[9px] border px-3 text-[12px] font-semibold transition-colors duration-300 disabled:opacity-50",
        done ? "border-[#cfe6d8] bg-[#e9f4ee] text-[#3f7a57]" : "border-[var(--border)] bg-white text-[var(--ink)]",
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase === "working" ? (
          <motion.span key="working" {...swap} className="flex items-center gap-1.5">
            <RefreshCw size={13} className={reduce ? "" : "animate-spin"} /> Working…
          </motion.span>
        ) : done ? (
          <motion.span key="done" {...swap} className="flex items-center gap-1.5">
            <motion.span
              initial={reduce ? { opacity: 0 } : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
              animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1, filter: "blur(0.01px)" }}
              transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.45, bounce: 0.4 }}
              className="flex"
            >
              <Check size={14} strokeWidth={2.6} />
            </motion.span>
            <span>{doneVerb}</span>
            <span className="tabular tabular-nums">
              <SlotText text={String(count)} />
            </span>
          </motion.span>
        ) : (
          <motion.span key="idle" {...swap} className="flex items-center gap-1.5">
            {idleIcon} {idleLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
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
