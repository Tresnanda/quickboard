import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, type Variants } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowRight, Check, Clipboard, Layers, Link2, Power, StickyNote, Zap } from "lucide-react";
import { useConfetti } from "./Confetti";
import { addText, getAutostart, setAutostart } from "../lib/ipc";
import { setSetting, useSettings } from "../lib/settings";
import { useItems } from "../lib/items-store";

const FLAG = "qb_onboarded_v1";
const BEATS = 6;

// custom curves (emil: built-ins are too weak)
const OUT = [0.23, 1, 0.32, 1] as const; // strong ease-out — entrances
const IN = [0.5, 0, 0.78, 0] as const; // ease-in — exits
const POP = { type: "spring", stiffness: 360, damping: 15 } as const; // bouncy hero
const SETTLE = { type: "spring", stiffness: 460, damping: 30 } as const; // soft, no bounce

// choreography: container slides + staggers its children in
const container: Variants = {
  enter: { opacity: 0, scale: 0.86 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: OUT, staggerChildren: 0.07, delayChildren: 0.08 } },
  exit: { opacity: 0, scale: 1.14, transition: { duration: 0.34, ease: IN } },
};
const rise: Variants = {
  enter: { opacity: 0, y: 18, filter: "blur(6px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.52, ease: OUT } },
};
function Rise({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={rise} className={className}>
      {children}
    </motion.div>
  );
}

// the logo flips into view in 3D
const logoIn: Variants = {
  enter: { opacity: 0, scale: 0.55, rotateY: -95 },
  center: { opacity: 1, scale: 1, rotateY: 0, transition: { type: "spring", stiffness: 190, damping: 15 } },
};

// kinetic headline — every character rises and resolves in a cascade
function KineticText({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center" }} aria-label={text}>
      {Array.from(text).map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          style={{ display: "inline-block", whiteSpace: "pre" }}
          initial={{ y: 18, opacity: 0, filter: "blur(5px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: OUT, delay: delay + i * 0.028 }}
        >
          {c === " " ? " " : c}
        </motion.span>
      ))}
    </span>
  );
}

// ambient layer — slow-drifting blurred orbs for depth + life
const ORBS = [
  { size: 320, color: "#f6b9d2", x: "8%", y: "16%", dx: 40, dy: 30, dur: 13 },
  { size: 280, color: "#c3a9ef", x: "64%", y: "8%", dx: -36, dy: 44, dur: 16 },
  { size: 300, color: "#aac6f6", x: "70%", y: "58%", dx: 30, dy: -40, dur: 15 },
];
function Orbs() {
  // depth-parallax: the whole field drifts opposite the cursor
  const px = useSpring(useMotionValue(0), { stiffness: 48, damping: 18 });
  const py = useSpring(useMotionValue(0), { stiffness: 48, damping: 18 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      px.set((0.5 - e.clientX / window.innerWidth) * 44);
      py.set((0.5 - e.clientY / window.innerHeight) * 44);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [px, py]);
  return (
    <motion.div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ x: px, y: py }}>
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full opacity-[0.24] blur-[64px]"
          style={{ width: o.size, height: o.size, left: o.x, top: o.y, background: o.color }}
          animate={{ x: [0, o.dx, 0], y: [0, o.dy, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </motion.div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      initial="rest"
      whileHover="hover"
      whileTap={{ scale: 0.96 }}
      variants={{ rest: { y: 0 }, hover: { y: -2 } }}
      transition={SETTLE}
      className="group relative mt-8 flex items-center gap-2 overflow-hidden rounded-full bg-[#1f2024] px-6 py-3 text-[14px] font-bold text-white"
      style={{ boxShadow: "0 8px 24px -8px rgba(0,0,0,0.55)" }}
    >
      {/* secondary: shine sweep on hover */}
      <motion.span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/25 blur-md" variants={{ rest: { x: "-160%" }, hover: { x: "560%" } }} transition={{ duration: 0.7, ease: OUT }} />
      <span className="relative">{children}</span>
      <motion.span className="relative" variants={{ rest: { x: 0 }, hover: { x: 3 } }} transition={SETTLE}>
        <ArrowRight size={17} strokeWidth={2.5} />
      </motion.span>
    </motion.button>
  );
}

/**
 * First-run flow: Hello → Save first thing → Summon it → Set up → You're set.
 * Replays on `qb:replay-onboarding`. Playful personality, three motion layers.
 */
export function Onboarding() {
  const [show, setShow] = useState(false);
  const [[beat, dir], setBeat] = useState<[number, number]>([0, 1]);
  const [saved, setSaved] = useState<{ name: string; value: string }>({ name: "", value: "" });
  const reduce = useReducedMotion();
  const { reload } = useItems();

  useEffect(() => {
    if (!localStorage.getItem(FLAG)) setShow(true);
    const replay = () => {
      setBeat([0, 1]);
      setSaved({ name: "", value: "" });
      setShow(true);
    };
    window.addEventListener("qb:replay-onboarding", replay);
    return () => window.removeEventListener("qb:replay-onboarding", replay);
  }, []);

  const go = useCallback((d: number) => setBeat(([b]) => [Math.max(0, Math.min(BEATS - 1, b + d)), d]), []);
  const finish = useCallback(() => {
    localStorage.setItem(FLAG, "1");
    setShow(false);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
          transition={{ duration: 0.45, ease: OUT }}
          className="absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
        >
          <div className="absolute inset-0" style={{ background: "linear-gradient(155deg,#fef8fb 0%,#faf8fe 50%,#f7fbff 100%)" }} />
          {!reduce && <Orbs />}
          <motion.div
            className="absolute inset-0"
            style={{ background: "radial-gradient(820px circle at 50% 40%, rgba(255,255,255,0.6), transparent 62%)" }}
            animate={reduce ? undefined : { opacity: [0.65, 1, 0.65], scale: [1, 1.05, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
          {!reduce && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.4) 50%, transparent 64%)" }}
              animate={{ x: ["-35%", "35%"] }}
              transition={{ duration: 10, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
            />
          )}

          {beat < BEATS - 1 && (
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }} onClick={finish} className="absolute right-5 top-5 z-10 rounded-full px-3 py-1.5 text-[12px] font-medium text-[#7c7689] transition-colors hover:bg-black/[0.05]">
              Skip
            </motion.button>
          )}

          {/* The beat column scrolls inside this window instead of sliding under the
              bottom chrome. The clearance bands (pt = Skip, pb = dots) live on the
              CONTENT, not the scroller — WKWebView drops a scroll container's own
              bottom padding once content overflows. */}
          <div className="relative z-10 flex h-full min-h-0 w-full max-w-[520px] flex-col items-center overflow-y-auto px-8">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={beat} custom={dir} variants={container} initial="enter" animate="center" exit="exit" className="my-auto flex w-full flex-col items-center pb-24 pt-16 text-center">
                {beat === 0 && <Hello onNext={() => go(1)} />}
                {beat === 1 && <SaveBeat onSaved={(item) => { setSaved(item); void reload(); go(1); }} />}
                {beat === 2 && <SummonBeat item={saved} onNext={() => go(1)} />}
                {beat === 3 && <TrayBeat item={saved} onNext={() => go(1)} />}
                {beat === 4 && <SetupBeat onNext={() => go(1)} />}
                {beat === 5 && <Finish item={saved} onDone={finish} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* progress dots */}
          <div className="absolute bottom-7 z-10 flex items-center gap-2">
            {Array.from({ length: BEATS }).map((_, i) => (
              <motion.span key={i} animate={{ width: i === beat ? 24 : 7, backgroundColor: i === beat ? "#1f2024" : "rgba(31,32,36,0.16)" }} transition={SETTLE} className="h-[7px] rounded-full" />
            ))}
          </div>

          {beat > 0 && beat < BEATS - 1 && (
            <motion.button whileHover={{ x: -2 }} onClick={() => go(-1)} className="absolute bottom-6 left-6 z-10 text-[12px] font-medium text-[#9a93a8] transition-colors hover:text-[#1f2024]">
              ← Back
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Hello({ onNext }: { onNext: () => void }) {
  return (
    <>
      <motion.div variants={logoIn} style={{ transformPerspective: 800 }} className="relative">
        <motion.span
          className="absolute left-1/2 top-1/2 -z-10 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(180,150,235,0.55), transparent 70%)" }}
          animate={{ opacity: [0, 0.85, 0.5], scale: [0.5, 1.15, 1] }}
          transition={{ duration: 1.3, ease: OUT, delay: 0.1 }}
        />
        <motion.img
          src="/quickboard-logo.svg"
          alt="quickboard"
          className="h-24 w-24 rounded-[26px]"
          style={{ boxShadow: "0 22px 55px -18px rgba(0,0,0,0.5)" }}
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
        />
      </motion.div>
      <KineticText text="quickboard" className="mt-6 text-[34px] font-extrabold tracking-[-0.04em] text-[#1f2024]" delay={0.35} />
      <Rise className="mt-1.5 max-w-[360px] text-[14.5px] leading-relaxed text-[#6b6577]">Save anything once. Summon it back to your cursor in seconds.</Rise>
      <Rise>
        <PrimaryButton onClick={onNext}>Get started</PrimaryButton>
      </Rise>
    </>
  );
}

function Keycap({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <span className={`grid ${wide ? "px-5" : "w-12"} h-12 place-items-center rounded-[12px] border border-black/[0.08] bg-white text-[15px] font-bold text-[#1f2024]`} style={{ boxShadow: "0 3px 0 rgba(0,0,0,0.08), 0 6px 16px -6px rgba(0,0,0,0.35)" }}>
      {children}
    </span>
  );
}

// the live "card" the user's words become — the through-line of the whole flow
function OnboardCard({ name, value }: { name: string; value: string }) {
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 16 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 16 });
  const sx = useMotionValue(50);
  const sy = useMotionValue(28);
  const sheen = useMotionTemplate`radial-gradient(170px circle at ${sx}% ${sy}%, rgba(167,139,250,0.18), transparent 62%)`;
  const isUrl = /^(https?:\/\/|www\.)/i.test(value);
  const Icon = isUrl ? Link2 : StickyNote;

  function onMove(e: React.MouseEvent) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 18);
    rx.set((0.5 - py) * 18);
    sx.set(px * 100);
    sy.set(py * 100);
  }
  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 800, boxShadow: "0 22px 46px -18px rgba(0,0,0,0.42)" }}
      className="relative w-[280px] overflow-hidden rounded-[15px] border border-black/[0.05] bg-white p-3 text-left"
    >
      <motion.div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: sheen }} />
      <div className="relative z-[2] flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#efe9fb] text-[#6b4ea8]">
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold tracking-[-0.012em] text-[#1f2024]">{name || "Untitled"}</span>
          <span className="block truncate text-[11.5px] text-[#9a93a8]">{value || "…"}</span>
        </span>
      </div>
    </motion.div>
  );
}

function SaveBeat({ onSaved }: { onSaved: (item: { name: string; value: string }) => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [stamping, setStamping] = useState(false);

  async function save() {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setStamping(true); // stamp of approval, then off to the board
    const label = name.trim() || v.split("\n")[0].slice(0, 48) || "My first note";
    try {
      // new users have no environments yet — land the first item in the app default
      await addText(label, "Uncategorized", "Personal", false, v);
    } catch {
      /* best-effort */
    }
    window.setTimeout(() => onSaved({ name: label, value: v }), 720);
  }

  const focusRing = { scale: 1.012, boxShadow: "0 0 0 4px rgba(31,32,36,0.07), 0 8px 22px -12px rgba(0,0,0,0.28)" };
  const inputClass = "w-full rounded-[12px] border border-black/[0.08] bg-white/80 px-4 py-2.5 text-[14px] text-[#1f2024] outline-none backdrop-blur placeholder:text-[#b3adbf]";
  const hasContent = name.trim() || value.trim();

  return (
    <>
      <KineticText text="Save your first thing" className="text-[24px] font-extrabold tracking-[-0.03em] text-[#1f2024]" delay={0.12} />
      <Rise className="mt-1.5 text-[13.5px] text-[#6b6577]">Give it a name, then the value you'll paste later.</Rise>
      <Rise className="mt-6 flex w-[380px] flex-col gap-2">
        <motion.input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          placeholder="Name (e.g. Work email)"
          whileFocus={focusRing}
          transition={SETTLE}
          className={`${inputClass} font-medium placeholder:font-normal`}
        />
        <motion.input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          placeholder="Value (the text, link, or address)"
          whileFocus={focusRing}
          transition={SETTLE}
          className={inputClass}
        />
      </Rise>
      {/* watch your two fields become a real card as you type */}
      <div className="mt-4 flex h-[64px] items-center justify-center" style={{ perspective: 900 }}>
        <AnimatePresence>
          {hasContent && (
            <motion.div
              key="preview"
              className="relative z-20"
              style={{ transformPerspective: 900 }}
              initial={{ opacity: 0, rotateX: -55, y: 24, scale: 0.9 }}
              animate={
                stamping
                  ? { scaleX: [1, 0.98, 1.09, 0.98, 1], scaleY: [1, 0.98, 0.87, 1.04, 1], rotateX: 0, y: 0, opacity: 1 }
                  : { opacity: 1, rotateX: 0, y: 0, scale: 1 }
              }
              exit={{ opacity: 0, scale: 0.9 }}
              transition={
                stamping
                  ? { duration: 0.55, times: [0, 0.18, 0.38, 0.62, 1], ease: "easeInOut" }
                  : { type: "spring", stiffness: 280, damping: 18 }
              }
            >
              <OnboardCard name={name.trim()} value={value.trim()} />

              {/* stamp of approval — anticipation, impact (badge slam + squash + shockwave + flash + particles), settle */}
              <AnimatePresence>
                {stamping && (
                  <motion.div key="stamp" className="pointer-events-none absolute inset-0 grid place-items-center" initial={false}>
                    {/* secondary: green impact flash */}
                    <motion.span className="absolute inset-0 rounded-[15px] bg-[#3f7a57]" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.16, 0] }} transition={{ duration: 0.5, times: [0, 0.3, 1], ease: OUT, delay: 0.14 }} />
                    {/* secondary: shockwave ring */}
                    <motion.span className="absolute h-12 w-12 rounded-full border-2 border-[#3f7a57]" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: [0.5, 1, 2.4], opacity: [0, 0.85, 0] }} transition={{ duration: 0.6, times: [0, 0.25, 1], ease: OUT, delay: 0.16 }} />
                    {/* ambient: particle burst */}
                    {Array.from({ length: 7 }).map((_, i) => {
                      const a = (i / 7) * Math.PI * 2;
                      return (
                        <motion.span
                          key={i}
                          className="absolute h-1.5 w-1.5 rounded-full bg-[#3f7a57]"
                          initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                          animate={{ x: Math.cos(a) * 50, y: Math.sin(a) * 50, opacity: [0, 1, 0], scale: [1, 1, 0.3] }}
                          transition={{ duration: 0.55, ease: OUT, delay: 0.2 }}
                        />
                      );
                    })}
                    {/* primary: the badge slams down with a bouncy overshoot */}
                    <motion.span
                      className="z-10 grid h-12 w-12 place-items-center rounded-full bg-[#3f7a57] text-white"
                      style={{ boxShadow: "0 10px 22px -6px rgba(63,122,87,0.75)" }}
                      initial={{ scale: 1.9, opacity: 0, rotate: -18 }}
                      animate={{ scale: 1, opacity: 1, rotate: -7 }}
                      transition={{ type: "spring", stiffness: 520, damping: 12, delay: 0.1 }}
                    >
                      <Check size={24} strokeWidth={3.2} />
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Rise>
        <PrimaryButton onClick={() => void save()}>Save it</PrimaryButton>
      </Rise>
    </>
  );
}

function SummonBeat({ item, onNext }: { item: { name: string; value: string }; onNext: () => void }) {
  const [summoned, setSummoned] = useState(false);
  useEffect(() => {
    const un = listen("summon:open", () => setSummoned(true));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  return (
    <>
      <motion.div variants={rise} className="relative flex items-center gap-2">
        <AnimatePresence>
          {summoned && <motion.span key="kr" className="pointer-events-none absolute -inset-5 rounded-[20px] ring-2 ring-[#b9a6e8]" initial={{ scale: 0.85, opacity: 0.85 }} animate={{ scale: 1.45, opacity: 0 }} transition={{ duration: 0.55, ease: OUT }} />}
        </AnimatePresence>
        <motion.div className="flex items-center gap-2" animate={summoned ? { scaleY: [1, 0.76, 1], y: [0, 5, 0] } : { y: [0, -6, 0] }} transition={summoned ? { duration: 0.42, ease: OUT } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <Keycap>⌥</Keycap>
          <span className="text-[20px] font-bold text-[#b3adbf]">+</span>
          <Keycap wide>Space</Keycap>
        </motion.div>
      </motion.div>
      <Rise className="mt-7 text-[24px] font-extrabold tracking-[-0.03em] text-[#1f2024]">
        <AnimatePresence mode="wait">
          <motion.span key={summoned ? "yes" : "no"} initial={{ opacity: 0, y: 8, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(5px)" }} transition={{ duration: 0.26, ease: OUT }} className="inline-block">
            {summoned ? "There it is" : "Now summon it"}
          </motion.span>
        </AnimatePresence>
      </Rise>
      <Rise className="mt-1.5 max-w-[400px] text-[13.5px] leading-relaxed text-[#6b6577]">
        {summoned ? "Summoned from anywhere, dropped right where you need it." : `Press ⌥Space anywhere and “${item.name}” will appear.`}
      </Rise>

      {/* the exact card you made, materializing from a point of light */}
      <div className="relative mt-6 flex h-[92px] items-center justify-center">
        <AnimatePresence>
          {summoned && (
            <motion.div key="card" className="relative" initial={{ opacity: 0, scale: 0.25, filter: "blur(12px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ type: "spring", stiffness: 230, damping: 17 }}>
              {/* light burst */}
              <motion.span className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white blur-2xl" initial={{ opacity: 1, scale: 0.3 }} animate={{ opacity: 0, scale: 2.2 }} transition={{ duration: 0.7, ease: OUT }} />
              {/* expanding portal rings */}
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b9a6e8]" initial={{ scale: 0.4, opacity: 0.6 }} animate={{ scale: 2.6 + i * 0.8, opacity: 0 }} transition={{ duration: 0.85 + i * 0.12, ease: OUT, delay: i * 0.05 }} />
              ))}
              <OnboardCard name={item.name} value={item.value} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {summoned && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...POP, delay: 0.18 }}>
            <PrimaryButton onClick={onNext}>Got it</PrimaryButton>
          </motion.div>
        )}
      </AnimatePresence>
      {!summoned && (
        <Rise>
          <button onClick={onNext} className="mt-7 text-[12.5px] font-medium text-[#9a93a8] transition-colors hover:text-[#1f2024]">
            Skip for now
          </button>
        </Rise>
      )}
    </>
  );
}

// a compact, alive rendering of the real tray: two lanes with chips that cascade in
function TrayGlyph({ shown, first }: { shown: boolean; first: { name: string; value: string } }) {
  const reduce = useReducedMotion();
  const lanes = [
    { label: "Shelf", Icon: Layers, chips: [first.name || "First note", "Logo.png"] },
    { label: "Clipboard", Icon: Clipboard, chips: ["meet.google.com/abc-defg", "you@company.com"] },
  ];
  return (
    <motion.div
      className="relative w-[300px] rounded-[16px] border border-black/[0.06] bg-white/85 p-2.5 text-left backdrop-blur"
      style={{ boxShadow: "0 18px 40px -18px rgba(0,0,0,0.42)", willChange: "transform" }}
      animate={reduce ? undefined : shown ? { y: 0, scale: [1, 0.985, 1.01, 1] } : { y: [0, -4, 0] }}
      transition={shown ? { duration: 0.5, ease: OUT } : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* delight when the real tray is summoned: a portal ring + light bloom behind the glyph */}
      <AnimatePresence>
        {shown && !reduce && (
          <>
            <motion.span key="bloom" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-56 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white blur-2xl" initial={{ opacity: 0.9, scale: 0.4 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 0.7, ease: OUT }} />
            {[0, 1].map((i) => (
              <motion.span key={`ring-${i}`} className="pointer-events-none absolute inset-0 -z-10 rounded-[16px] border border-[#b9a6e8]" initial={{ scale: 0.9, opacity: 0.55 }} animate={{ scale: 1.14 + i * 0.1, opacity: 0 }} transition={{ duration: 0.7 + i * 0.12, ease: OUT, delay: i * 0.05 }} />
            ))}
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2">
        {lanes.map((lane, li) => (
          <motion.div
            key={lane.label}
            className="rounded-[12px] bg-[#f6f4fb] p-2"
            animate={{ backgroundColor: shown ? "#efe9fb" : "#f6f4fb" }}
            transition={{ duration: 0.5, ease: OUT }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#9a93a8]">
              <lane.Icon size={11} strokeWidth={2.4} /> {lane.label}
            </div>
            <div className="flex flex-col gap-1.5">
              {lane.chips.map((chip, ci) => {
                const isUrl = /^(https?:\/\/|www\.|[\w.-]+\.\w{2,})/i.test(chip) && !chip.includes(" ");
                const ChipIcon = ci === 0 && li === 0 ? StickyNote : isUrl ? Link2 : StickyNote;
                return (
                  <motion.div
                    key={chip}
                    className="flex items-center gap-2 rounded-[9px] border border-black/[0.05] bg-white px-2 py-1.5"
                    style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.42, ease: OUT, delay: 0.18 + (li * 2 + ci) * 0.07 }}
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[7px] bg-[#efe9fb] text-[#6b4ea8]">
                      <ChipIcon size={11} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-[-0.008em] text-[#1f2024]">{chip}</span>
                    {li === 1 && ci === 0 && (
                      <motion.span
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#3f7a57] text-white"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
                        transition={{ type: "spring", stiffness: 520, damping: 14, delay: 0.24 }}
                      >
                        <Check size={9} strokeWidth={3.4} />
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TrayBeat({ item, onNext }: { item: { name: string; value: string }; onNext: () => void }) {
  const [shown, setShown] = useState(false);

  function showMe() {
    void invoke("show_tray");
    setShown(true);
  }

  return (
    <>
      {/* keyboard hint: ⌥⇧Space — nudges up while idle, squashes on summon */}
      <motion.div variants={rise} className="relative flex items-center gap-1.5">
        <AnimatePresence>
          {shown && <motion.span key="kr" className="pointer-events-none absolute -inset-5 rounded-[20px] ring-2 ring-[#b9a6e8]" initial={{ scale: 0.85, opacity: 0.85 }} animate={{ scale: 1.45, opacity: 0 }} transition={{ duration: 0.55, ease: OUT }} />}
        </AnimatePresence>
        <motion.div className="flex items-center gap-1.5" animate={shown ? { scaleY: [1, 0.76, 1], y: [0, 5, 0] } : { y: [0, -6, 0] }} transition={shown ? { duration: 0.42, ease: OUT } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <Keycap>⌥</Keycap>
          <span className="text-[18px] font-bold text-[#b3adbf]">+</span>
          <Keycap>⇧</Keycap>
          <span className="text-[18px] font-bold text-[#b3adbf]">+</span>
          <Keycap wide>Space</Keycap>
        </motion.div>
      </motion.div>

      <Rise className="mt-7 text-[24px] font-extrabold tracking-[-0.03em] text-[#1f2024]">
        <AnimatePresence mode="wait">
          <motion.span key={shown ? "open" : "intro"} initial={{ opacity: 0, y: 8, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(5px)" }} transition={{ duration: 0.26, ease: OUT }} className="inline-block">
            {shown ? "There's your tray" : "A place to gather"}
          </motion.span>
        </AnimatePresence>
      </Rise>
      <Rise className="mt-1.5 max-w-[400px] text-[13.5px] leading-relaxed text-[#6b6577]">
        {shown
          ? "It floats beside your work. Sort things into lanes, then send a whole lane to your board in one step."
          : "The tray is a staging area. Drop in files and images from anywhere, sort them into lanes, then commit a lane to your board in one step."}
      </Rise>

      <Rise className="mt-6">
        <TrayGlyph shown={shown} first={item} />
      </Rise>

      {shown ? (
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...POP, delay: 0.18 }}>
          <PrimaryButton onClick={onNext}>Got it</PrimaryButton>
        </motion.div>
      ) : (
        <Rise>
          <PrimaryButton onClick={showMe}>Show me</PrimaryButton>
        </Rise>
      )}
    </>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={() => onChange(!on)} className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors" style={{ backgroundColor: on ? "#3f7a57" : "rgba(0,0,0,0.14)" }}>
      <motion.span layout transition={{ type: "spring", stiffness: 620, damping: 32 }} className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm" style={{ left: on ? 21 : 3 }} />
    </motion.button>
  );
}

function SetupRow({ icon, label, sub, on, children }: { icon: React.ReactNode; label: string; sub: string; on?: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      variants={rise}
      whileHover={{ x: 2 }}
      animate={{ boxShadow: on ? "inset 0 0 0 1px rgba(63,122,87,0.4), 0 12px 26px -12px rgba(63,122,87,0.55)" : "inset 0 0 0 1px rgba(0,0,0,0.05), 0 0 0 0 rgba(0,0,0,0)" }}
      transition={SETTLE}
      className="relative flex items-center gap-3 rounded-[14px] bg-white/70 px-4 py-3 backdrop-blur"
    >
      <motion.span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
        animate={{ backgroundColor: on ? "#d8efe1" : "rgba(0,0,0,0.04)", color: on ? "#347a55" : "#1f2024", scale: on ? [1, 1.28, 1] : 1 }}
        transition={{ duration: 0.42, ease: OUT }}
      >
        {icon}
      </motion.span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13.5px] font-bold tracking-[-0.01em] text-[#1f2024]">{label}</span>
        <span className="block truncate text-[11.5px] text-[#9a93a8]">{sub}</span>
      </span>
      {children}
    </motion.div>
  );
}

function SetupBeat({ onNext }: { onNext: () => void }) {
  const settings = useSettings();
  const [ax, setAx] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => invoke<boolean>("accessibility_trusted").then((v) => alive && setAx(v)).catch(() => {});
    void check();
    const id = window.setInterval(check, 2000);
    void getAutostart().then((v) => alive && setAutostartOn(v)).catch(() => {});
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
      <KineticText text="A couple of quick switches" className="text-[24px] font-extrabold tracking-[-0.03em] text-[#1f2024]" delay={0.12} />
      <Rise className="mt-1.5 text-[13.5px] text-[#6b6577]">So quickboard can do its thing.</Rise>

      <div className="relative mt-6 flex w-full flex-col gap-2.5">
        {/* "all systems go" bloom when every switch is on */}
        {ax && autostartOn && settings.clipboardHistory && (
          <motion.span
            key="charged"
            className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3f7a57]/35 blur-2xl"
            initial={{ opacity: 0.7, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 0.9, ease: OUT }}
          />
        )}
        <SetupRow on={ax} icon={<Zap size={17} strokeWidth={2} />} label="Let quickboard paste for you" sub="Needed to paste at your cursor">
          <AnimatePresence mode="wait">
            {ax ? (
              <motion.span key="ok" className="relative grid h-6 w-6 place-items-center rounded-full bg-[#3f7a57] text-white" initial={{ scale: 1.7, opacity: 0, rotate: -16 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 12 }}>
                <motion.span className="absolute inset-0 rounded-full ring-2 ring-[#3f7a57]/50" initial={{ scale: 0.8, opacity: 0.9 }} animate={{ scale: 2.3, opacity: 0 }} transition={{ duration: 0.6, ease: OUT }} />
                <Check size={13} strokeWidth={3.2} />
              </motion.span>
            ) : (
              <motion.button key="btn" whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }} onClick={() => void invoke("open_accessibility_settings")} className="rounded-full bg-[#1f2024] px-3 py-1.5 text-[11.5px] font-semibold text-white">
                Enable
              </motion.button>
            )}
          </AnimatePresence>
        </SetupRow>
        <SetupRow on={autostartOn} icon={<Power size={17} strokeWidth={2} />} label="Launch with your Mac" sub="Always a keystroke away">
          <Toggle on={autostartOn} onChange={(v) => { setAutostartOn(v); void setAutostart(v); }} />
        </SetupRow>
        <SetupRow on={settings.clipboardHistory} icon={<Clipboard size={17} strokeWidth={2} />} label="Remember what you copy" sub="Clipboard history, passwords skipped">
          <Toggle on={settings.clipboardHistory} onChange={(v) => setSetting("clipboardHistory", v)} />
        </SetupRow>
      </div>

      <Rise>
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
      </Rise>
    </>
  );
}

// a self-playing card: types a value, stamps it, clears, types the next — forever
function LoopingCard({ first }: { first?: { name: string; value: string } }) {
  const reduce = useReducedMotion();
  const items = useMemo(() => {
    const base = [
      { name: "Work email", value: "you@company.com" },
      { name: "Home address", value: "22 Maple Street, Apt 4" },
      { name: "Wi-Fi password", value: "sunflower-garden-92" },
      { name: "Standup link", value: "meet.google.com/abc-defg" },
    ];
    return first?.name ? [{ name: first.name, value: first.value }, ...base] : base;
  }, [first]);

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [stamped, setStamped] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (reduce) {
      setName(items[0].name);
      setValue(items[0].value);
      setStamped(true);
      return;
    }
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    async function run() {
      let i = 0;
      while (!cancelled) {
        const ex = items[i % items.length];
        setClearing(false);
        for (let c = 1; c <= ex.name.length; c++) {
          if (cancelled) return;
          setName(ex.name.slice(0, c));
          await sleep(45);
        }
        await sleep(180);
        for (let c = 1; c <= ex.value.length; c++) {
          if (cancelled) return;
          setValue(ex.value.slice(0, c));
          await sleep(36);
        }
        await sleep(330);
        if (cancelled) return;
        setStamped(true);
        await sleep(1150);
        if (cancelled) return;
        setClearing(true);
        await sleep(340);
        if (cancelled) return;
        setStamped(false);
        setName("");
        setValue("");
        await sleep(120);
        i++;
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [reduce, items]);

  return (
    <motion.div
      className="relative"
      style={{ transformPerspective: 900, willChange: "opacity, filter" }}
      animate={{ opacity: clearing ? 0.7 : 1, filter: clearing ? "blur(12px)" : "blur(0.01px)" }}
      transition={{ duration: 0.32, ease: OUT }}
    >
      <OnboardCard name={name} value={value} />
      <AnimatePresence>
        {stamped && (
          <motion.span
            key="loop-stamp"
            className="absolute -right-2.5 -top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-[#3f7a57] text-white"
            style={{ boxShadow: "0 8px 18px -5px rgba(63,122,87,0.7)" }}
            initial={{ scale: 1.7, opacity: 0, rotate: -16 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 12 }}
          >
            <motion.span className="absolute inset-0 rounded-full ring-2 ring-[#3f7a57]/50" initial={{ scale: 0.8, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.6, ease: OUT }} />
            <Check size={17} strokeWidth={3.2} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Finish({ item, onDone }: { item: { name: string; value: string }; onDone: () => void }) {
  const fire = useConfetti();
  const reduce = useReducedMotion();
  const fired = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    if (reduce || fired.current) return;
    fired.current = true;
    const ts = [
      window.setTimeout(() => fire(window.innerWidth / 2, window.innerHeight * 0.42), 240),
      window.setTimeout(() => fire(window.innerWidth * 0.3, window.innerHeight * 0.5), 480),
      window.setTimeout(() => fire(window.innerWidth * 0.7, window.innerHeight * 0.5), 620),
    ];
    return () => ts.forEach(window.clearTimeout);
  }, [fire, reduce]);

  function open() {
    if (opened.current) return;
    opened.current = true;
    if (!reduce) fire(window.innerWidth / 2, window.innerHeight * 0.72);
    window.setTimeout(onDone, 280);
  }

  return (
    <>
      {/* the checkmark-on-black-circle hero */}
      <motion.div className="relative" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 360, damping: 15 }}>
        <motion.span className="absolute -inset-4 rounded-full ring-2 ring-[#1f2024]/15" initial={{ scale: 0.6, opacity: 0.7 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.9, ease: OUT, delay: 0.15 }} />
        <motion.span className="grid h-20 w-20 place-items-center rounded-full bg-[#1f2024] text-white" style={{ boxShadow: "0 20px 50px -16px rgba(0,0,0,0.5)" }} animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}>
          <Check size={36} strokeWidth={2.5} />
        </motion.span>
      </motion.div>
      <KineticText text="You're all set" className="mt-5 text-[30px] font-extrabold tracking-[-0.035em] text-[#1f2024]" delay={0.12} />
      <Rise className="mt-1.5 max-w-[360px] text-[14px] leading-relaxed text-[#6b6577]">Save anything, then summon it anywhere with ⌥Space.</Rise>
      <Rise className="mt-6">
        <LoopingCard first={item} />
      </Rise>
      <Rise>
        <PrimaryButton onClick={open}>Open quickboard</PrimaryButton>
      </Rise>
    </>
  );
}
