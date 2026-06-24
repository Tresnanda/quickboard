// Resolve an item's rich content type (Note / Link / Image / File / Code) used by
// the board tabs and per-type card rendering. The backend only stores Text|File,
// so: an explicit type chosen at create time wins; otherwise we derive — files by
// extension, text by a light look at its value.

import type { Item, ContentType } from "./types";
import { getAppearance } from "./appearance";

const IMAGE_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "svg", "bmp", "avif", "tiff",
]);

export function fileExt(label: string): string {
  const dot = label.lastIndexOf(".");
  return dot > 0 && dot < label.length - 1 ? label.slice(dot + 1).toLowerCase() : "";
}

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const CODE_HINT = /=>|[{};]|\b(const|let|function|class|def|import|export|sudo|git|npm|pnpm|SELECT|curl|echo)\b/;

/**
 * Resolve content type. `value` is the item's text value when already loaded
 * (non-confidential text) — pass it so links/code can be detected; omit it and
 * text falls back to "note".
 */
export function contentType(item: Item, value?: string | null): ContentType {
  const explicit = getAppearance(item.id).type;
  if (explicit) return explicit;

  if (item.kind === "File") {
    return IMAGE_EXT.has(fileExt(item.label)) ? "image" : "file";
  }
  if (value) {
    const v = value.trim();
    if (URL_RE.test(v)) return "link";
    if (v.includes("\n") && CODE_HINT.test(v)) return "code";
  }
  return "note";
}

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  note: "Note",
  link: "Link",
  image: "Image",
  file: "File",
  code: "Code",
};
