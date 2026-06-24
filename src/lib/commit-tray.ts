import { addFile, addText } from "./ipc";
import { setAppearance } from "./appearance";
import { getSettings } from "./settings";
import { committable, getTray, removeFromTray, type TrayEntry } from "./tray";

/**
 * Commit the temporary (text / file) tray entries to the board, then drop them
 * from the tray. Board-item references are left staged. Returns how many landed.
 */
export async function commitTray(entries?: TrayEntry[]): Promise<number> {
  const pending = committable(entries ?? getTray());
  if (!pending.length) return 0;
  const env = getSettings().defaultEnvironment ?? "Personal";
  let n = 0;
  for (const e of pending) {
    try {
      if (e.kind === "file" && e.path) {
        await addFile(e.label, "Uncategorized", env, false, e.path);
        n++;
      } else if (e.kind === "text") {
        const id = await addText(e.label, "Uncategorized", env, false, e.value ?? "");
        setAppearance(id, { type: e.isUrl ? "link" : "note" });
        n++;
      }
    } catch {
      /* skip */
    }
    removeFromTray(e.id);
  }
  return n;
}
