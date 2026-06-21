// Stable category -> token color mapping, hashed by name so the same
// category always renders the same accent across Sidebar and Home.

const PALETTE = [
  "var(--accent)",
  "var(--green)",
  "var(--amber)",
  "var(--blue)",
  "var(--violet)",
  "var(--rose)",
  "var(--cyan)",
] as const;

export function categoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}
