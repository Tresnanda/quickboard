import { useCallback, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import Cropper, { type Area } from "react-easy-crop";
import { Minus, Plus, X } from "lucide-react";

async function cropToDataUrl(src: string, area: Area, outMax = 640): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, outMax / Math.max(area.width, area.height));
      const w = Math.max(1, Math.round(area.width * scale));
      const h = Math.max(1, Math.round(area.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** Crop-on-upload, used everywhere an image is chosen. `src` is the picked image as a
 * data URL; `onCrop` receives the cropped data URL. Pass `aspect` (w/h) and an optional
 * `round` for a circular mask (avatars). */
export function ImageCropper({
  src,
  aspect,
  round = false,
  onCancel,
  onCrop,
}: {
  src: string | null;
  aspect: number;
  round?: boolean;
  onCancel: () => void;
  onCrop: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  async function use() {
    if (!src || !area || busy) return;
    setBusy(true);
    onCrop(await cropToDataUrl(src, area));
  }

  return (
    <Dialog.Root open={!!src} onOpenChange={(o) => !o && onCancel()}>
      <AnimatePresence>
        {src && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center p-6">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className="pointer-events-auto w-[460px] max-w-[calc(100vw-3rem)] rounded-[20px] bg-white p-3 shadow-modal"
                  initial={{ opacity: 0, scale: 0.94, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 6 }}
                  transition={{ type: "spring", duration: 0.4, bounce: 0.14 }}
                >
                  <div className="flex items-center justify-between px-1 pb-2.5">
                    <Dialog.Title className="text-[14px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">Crop image</Dialog.Title>
                    <Dialog.Close className="qb-press grid h-7 w-7 place-items-center rounded-full text-[#52525b] hover:bg-black/[0.05]" aria-label="Close">
                      <X size={15} />
                    </Dialog.Close>
                  </div>

                  <div className="relative h-[290px] overflow-hidden rounded-[14px] bg-[#0c0c0d]">
                    <Cropper
                      image={src}
                      crop={crop}
                      zoom={zoom}
                      aspect={aspect}
                      cropShape={round ? "round" : "rect"}
                      showGrid={false}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onComplete}
                    />
                    <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-1.5 py-1 text-white backdrop-blur">
                      <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))} className="qb-press grid h-6 w-6 place-items-center rounded-full hover:bg-white/15" aria-label="Zoom out">
                        <Minus size={14} />
                      </button>
                      <span className="w-[40px] text-center text-[11px] font-semibold tabular">{Math.round(zoom * 100)}%</span>
                      <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))} className="qb-press grid h-6 w-6 place-items-center rounded-full hover:bg-white/15" aria-label="Zoom in">
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="qb-press h-[38px] rounded-[11px] border border-[var(--border)] bg-white px-4 text-[12.5px] font-semibold text-[var(--text)]">
                      Cancel
                    </button>
                    <button type="button" onClick={() => void use()} disabled={busy} className="qb-press h-[38px] rounded-[11px] bg-[var(--ink)] px-4 text-[12.5px] font-semibold text-white shadow-ink disabled:opacity-50">
                      Use image
                    </button>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
