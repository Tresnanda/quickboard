import { Component, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

type Colors = [string, string, string];
type Job = { key: string; colors: Colors; uTime: number; resolve: (url: string | null) => void };

// stable per-key frame so each folder samples a different moment of the flow
function timeFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return 8 + ((h % 1000) / 1000) * 26;
}

const BakeCtx = createContext<(key: string, colors: Colors) => Promise<string | null>>(async () => null);

/** Request a baked ShaderGradient image for (key, colors). Resolves to a data URL, or
 * null if WebGL/ShaderGradient is unavailable (caller falls back to the CSS cover). */
export const useShaderBake = () => useContext(BakeCtx);

const W = 360;
const H = 252;

function waitFrames(n: number): Promise<void> {
  return new Promise((res) => {
    let i = 0;
    const step = () => (++i >= n ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

class GLBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Bakes the *real* ShaderGradient (three.js) to a cached static image per card. One
 * shared offscreen canvas renders each gradient once (changing colors between bakes),
 * captures it via `preserveDrawingBuffer` → toDataURL, then unmounts when idle. Cards
 * show the CSS cover until their bake lands, then swap. Avoids a live GL context per
 * card (the context limit) while still giving the genuine ShaderGradient look.
 */
export function ShaderBakerProvider({ children }: { children: ReactNode }) {
  const cache = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, Promise<string | null>>());
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState<{ colors: Colors; uTime: number }>({ colors: ["#cfcfd6", "#dcdce4", "#ecedf2"], uTime: 13.6 });
  const [disabled, setDisabled] = useState(false);

  const capture = useCallback((): string | null => {
    const canvas = hostRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    try {
      const url = canvas?.toDataURL("image/png");
      return url && url.length > 3000 ? url : null; // tiny string ⇒ blank buffer
    } catch {
      return null;
    }
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setMounted(true);
    await waitFrames(3); // let the canvas mount + compile
    let misses = 0;
    while (queue.current.length && !disabled) {
      const job = queue.current[0];
      setCurrent({ colors: job.colors, uTime: job.uTime });
      await waitFrames(11); // let the new colors + uTime render (static — animate off)
      const url = capture();
      if (url) cache.current.set(job.key, url);
      else misses++;
      job.resolve(url);
      queue.current.shift();
      if (misses >= 3) {
        // ShaderGradient isn't producing pixels here — stop trying, use CSS covers
        setDisabled(true);
        queue.current.forEach((j) => j.resolve(null));
        queue.current = [];
      }
    }
    setMounted(false);
    running.current = false;
  }, [capture, disabled]);

  const bake = useCallback(
    (key: string, c: Colors): Promise<string | null> => {
      const hit = cache.current.get(key);
      if (hit) return Promise.resolve(hit);
      if (disabled) return Promise.resolve(null);
      const inflight = pending.current.get(key);
      if (inflight) return inflight;
      const p = new Promise<string | null>((resolve) => {
        queue.current.push({ key, colors: c, uTime: timeFor(key), resolve });
      });
      pending.current.set(key, p);
      void p.finally(() => pending.current.delete(key));
      void run();
      return p;
    },
    [disabled, run],
  );

  useEffect(() => {
    // if the boundary disables mid-flight, flush the queue to CSS fallback
    if (disabled) {
      queue.current.forEach((j) => j.resolve(null));
      queue.current = [];
      setMounted(false);
    }
  }, [disabled]);

  return (
    <BakeCtx.Provider value={bake}>
      {children}
      <div ref={hostRef} aria-hidden style={{ position: "fixed", left: -99999, top: -99999, width: W, height: H, opacity: 0, pointerEvents: "none" }}>
        {mounted && (
          <GLBoundary onError={() => setDisabled(true)}>
            <ShaderGradientCanvas preserveDrawingBuffer lazyLoad={false} pointerEvents="none" style={{ width: W, height: H }}>
              <ShaderGradient
                type="plane"
                animate="off"
                uTime={current.uTime}
                uSpeed={0.4}
                uStrength={3.6}
                uDensity={1.3}
                uFrequency={5.5}
                uAmplitude={1}
                brightness={1.25}
                cAzimuthAngle={180}
                cPolarAngle={90}
                cDistance={3.6}
                cameraZoom={1}
                positionX={-1.4}
                positionY={0}
                positionZ={0}
                rotationX={0}
                rotationY={10}
                rotationZ={50}
                reflection={0.1}
                envPreset="city"
                lightType="3d"
                grain="off"
                shader="defaults"
                color1={current.colors[0]}
                color2={current.colors[1]}
                color3={current.colors[2]}
              />
            </ShaderGradientCanvas>
          </GLBoundary>
        )}
      </div>
    </BakeCtx.Provider>
  );
}
