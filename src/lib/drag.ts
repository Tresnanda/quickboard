import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { fileToTemp, getImageDataUrl, readImageAsDataUrl } from "./ipc";

// A native drag (start_multi_drag) reports completion via a single "drag:end" event.
// Only the window that started a drag has a pending finisher, so the broadcast is safe.
let _pendingDragEnd: (() => void) | null = null;
if (typeof window !== "undefined") {
  void listen("drag:end", () => _pendingDragEnd?.());
}

/**
 * Start a macOS-native drag of files (and/or text). `origin` is the source element's
 * rect [x, y, w, h] in webview CSS px — the preview lifts off from there instead of
 * teleporting to the cursor. Resolves the grab/spring-back via the drag:end event.
 */
async function nativeDrag(files: string[], text: string | null, icon: string, origin: number[] | null, onEnd?: () => void): Promise<void> {
  _draggingOut = true;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (_pendingDragEnd === finish) _pendingDragEnd = null;
    window.setTimeout(() => {
      _draggingOut = false;
    }, 120);
    onEnd?.();
  };
  _pendingDragEnd = finish;
  window.setTimeout(finish, 15000); // safety net if the drag:end event never arrives
  try {
    await invoke("start_multi_drag", { files, text, icon, origin, viewH: window.innerHeight });
  } catch {
    finish();
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Render a tasteful "floating card" drag preview — the image with rounded corners,
// a soft drop shadow and a hairline ring baked into the PNG — and stash it in a temp
// file. This is what the OS shows following the cursor, so it should feel premium.
async function dragPreview(dataUrl: string, max = 152): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const pad = 36; // must exceed the baked shadow's reach (blur 24 + offsetY 10) or it clips
    const r = 14;
    const c = document.createElement("canvas");
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    // soft shadow cast by a rounded card
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.40)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, pad, pad, w, h, r);
    ctx.fill();
    ctx.restore();

    // the image, clipped to rounded corners
    ctx.save();
    roundRectPath(ctx, pad, pad, w, h, r);
    ctx.clip();
    ctx.drawImage(img, pad, pad, w, h);
    ctx.restore();

    // hairline ring
    roundRectPath(ctx, pad + 0.5, pad + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    return await invoke<string>("write_drag_icon", { dataUrl: c.toDataURL("image/png") });
  } catch {
    return null;
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// A tasteful drag preview for a non-image file: a horizontal chip — filled document
// icon + filename + type. Without this the OS QuickLooks the file at full size.
async function fileDragPreview(name: string): Promise<string | null> {
  try {
    const ext = name.includes(".") ? (name.split(".").pop() || "").toUpperCase().slice(0, 5) : "";
    const pad = 40; // must exceed the baked shadow's reach (blur 26 + offsetY 11) or it clips
    const cw = 224;
    const ch = 52;
    const c = document.createElement("canvas");
    c.width = cw + pad * 2;
    c.height = ch + pad * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    // shadowed white card
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 11;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, pad, pad, cw, ch, 14);
    ctx.fill();
    ctx.restore();
    roundRectPath(ctx, pad + 0.5, pad + 0.5, cw - 1, ch - 1, 14);
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // filled document glyph
    const iw = 22;
    const ih = 28;
    const fold = 8;
    const ix = pad + 16;
    const iy = pad + ch / 2 - ih / 2;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ix + iw - fold, iy);
    ctx.lineTo(ix + iw, iy + fold);
    ctx.lineTo(ix + iw, iy + ih);
    ctx.lineTo(ix, iy + ih);
    ctx.closePath();
    ctx.fillStyle = "#eef1f6";
    ctx.fill();
    ctx.strokeStyle = "#9aa3b2";
    ctx.lineWidth = 1.4;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix + iw - fold, iy);
    ctx.lineTo(ix + iw - fold, iy + fold);
    ctx.lineTo(ix + iw, iy + fold);
    ctx.stroke();
    ctx.strokeStyle = "#cdd4df";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(ix + 5, iy + 13 + i * 5);
      ctx.lineTo(ix + iw - 5, iy + 13 + i * 5);
      ctx.stroke();
    }

    // filename + type
    const tx = ix + iw + 12;
    const maxW = pad + cw - 14 - tx;
    ctx.textAlign = "left";
    ctx.fillStyle = "#1f2024";
    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(fitText(ctx, name, maxW), tx, pad + ch / 2 - 3);
    ctx.fillStyle = "#8a8d96";
    ctx.font = "500 11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(ext ? `${ext} · File` : "File", tx, pad + ch / 2 + 13);

    return await invoke<string>("write_drag_icon", { dataUrl: c.toDataURL("image/png") });
  } catch {
    return null;
  }
}

/**
 * Native drag-out of a file item with a small preview — a shrunken thumbnail for
 * images, a document card for everything else, so the OS never QuickLooks the file.
 * `thumbDataUrl` lets a caller reuse an already-loaded preview instead of re-decrypting.
 */
// True while WE are dragging a file OUT of a window — so a window's own drop-to-save
// listener can ignore the OS drag that's merely passing over it on the way out.
let _draggingOut = false;
export const isDraggingOut = (): boolean => _draggingOut;

export async function dragOutItem(id: string, isImage: boolean, thumbDataUrl?: string | null, onEnd?: () => void, origin?: number[] | null): Promise<void> {
  try {
    const path = await fileToTemp(id);
    const name = path.split(/[\\/]/).pop() || "file";
    // a small generated preview so the OS never QuickLooks the raw file at full size
    let icon: string | null = null;
    if (isImage) {
      // Deliberately uncached: a confidential-image drag is Touch-ID-gated per
      // fetch, and caching here would let a second drag skip re-auth.
      const src = thumbDataUrl ?? (await getImageDataUrl(id).catch(() => null));
      if (src) icon = await dragPreview(src);
    }
    if (!icon) icon = await fileDragPreview(name);
    // native drag lifts the preview off the source element (origin), then springs
    // the grab back when the drag ends.
    await nativeDrag([path], null, icon ?? path, origin ?? null, onEnd);
  } catch {
    onEnd?.();
  }
}

// "N items" preview — a small stacked-cards chip for multi-file drags.
async function multiDragPreview(count: number): Promise<string | null> {
  try {
    const pad = 40; // must exceed the baked shadow's reach (blur 26 + offsetY 11) or it clips
    const cw = 150;
    const ch = 54;
    const c = document.createElement("canvas");
    c.width = cw + pad * 2;
    c.height = ch + pad * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 11;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, pad, pad, cw, ch, 14);
    ctx.fill();
    ctx.restore();
    roundRectPath(ctx, pad + 0.5, pad + 0.5, cw - 1, ch - 1, 14);
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const sx = pad + 16;
    const sy = pad + ch / 2 - 12;
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#aab2c0";
    roundRectPath(ctx, sx + 6, sy - 3, 18, 18, 4);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, sx, sy + 3, 18, 18, 4);
    ctx.fill();
    ctx.strokeStyle = "#7c8696";
    ctx.stroke();
    ctx.fillStyle = "#1f2024";
    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${count} items`, sx + 36, pad + ch / 2 + 5);
    return await invoke<string>("write_drag_icon", { dataUrl: c.toDataURL("image/png") });
  } catch {
    return null;
  }
}

// Text drag preview — a card with a note glyph + the label.
async function textDragPreview(label: string): Promise<string | null> {
  try {
    const pad = 40; // must exceed the baked shadow's reach (blur 26 + offsetY 11) or it clips
    const cw = 200;
    const ch = 50;
    const c = document.createElement("canvas");
    c.width = cw + pad * 2;
    c.height = ch + pad * 2;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 11;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, pad, pad, cw, ch, 14);
    ctx.fill();
    ctx.restore();
    roundRectPath(ctx, pad + 0.5, pad + 0.5, cw - 1, ch - 1, 14);
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const gx = pad + 16;
    const gy = pad + ch / 2 - 7;
    ctx.strokeStyle = "#9aa3b2";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(gx, gy + i * 7);
      ctx.lineTo(gx + (i === 2 ? 11 : 19), gy + i * 7);
      ctx.stroke();
    }
    const tx = gx + 32;
    ctx.fillStyle = "#1f2024";
    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fitText(ctx, label, pad + cw - 14 - tx), tx, pad + ch / 2 + 5);
    return await invoke<string>("write_drag_icon", { dataUrl: c.toDataURL("image/png") });
  } catch {
    return null;
  }
}

/** Drag several file items out at once (the "5 photos → Figma" case). */
export async function dragFilesOut(itemIds: string[], onEnd?: () => void): Promise<void> {
  _draggingOut = true;
  const finish = () => {
    window.setTimeout(() => {
      _draggingOut = false;
    }, 120);
    onEnd?.();
  };
  try {
    const paths: string[] = [];
    for (const id of itemIds) {
      try {
        paths.push(await fileToTemp(id));
      } catch {
        /* skip */
      }
    }
    if (!paths.length) {
      finish();
      return;
    }
    const icon = (await multiDragPreview(paths.length)) ?? paths[0];
    await startDrag({ item: paths, icon }, finish);
  } catch {
    finish();
  }
}

/** Drag a set of already-resolved file paths out at once. */
export async function dragPathsOut(paths: string[], onEnd?: () => void): Promise<void> {
  if (!paths.length) {
    onEnd?.();
    return;
  }
  const icon = (await multiDragPreview(paths.length)) ?? paths[0];
  await nativeDrag(paths, null, icon, null, onEnd);
}

export async function dragPathOut(path: string, isImage: boolean, onEnd?: () => void): Promise<void> {
  let icon: string | null = null;
  if (isImage) {
    const src = await readImageAsDataUrl(path).catch(() => null);
    if (src) icon = await dragPreview(src);
  }
  if (!icon) icon = await fileDragPreview(path.split(/[\\/]/).pop() || "file");
  await nativeDrag([path], null, icon ?? path, null, onEnd);
}

/** Drag a text entry out as plain text (drop into a field / editor). */
export async function dragTextOut(text: string, label: string, onEnd?: () => void): Promise<void> {
  _draggingOut = true;
  const finish = () => {
    window.setTimeout(() => {
      _draggingOut = false;
    }, 120);
    onEnd?.();
  };
  try {
    const icon = (await textDragPreview(label)) ?? "";
    await startDrag({ item: { data: text, types: ["public.utf8-plain-text"] }, icon }, finish);
  } catch {
    finish();
  }
}

/**
 * Native drag carrying files AND text together (mixed tray selections). The drag
 * plugin only carries one type per drag, so this routes through a custom macOS
 * NSDraggingSession — each drop target reads what it understands (Finder → files +
 * a text clip, a text field → the text, a rich editor → both).
 */
export async function dragMixedOut(paths: string[], text: string, onEnd?: () => void): Promise<void> {
  const icon = (await multiDragPreview(paths.length + 1)) ?? paths[0] ?? "";
  await nativeDrag(paths, text, icon, null, onEnd);
}
