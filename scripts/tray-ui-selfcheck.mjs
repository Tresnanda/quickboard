import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/TrayDock.tsx", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src-tauri/src/commands.rs", import.meta.url), "utf8");
const laneMoveSelect = source.slice(source.indexOf("function LaneMoveSelect"), source.indexOf("function ClearClipsMenu"));

assert.equal(/<select[\s>]/.test(source), false, "TrayDock should not use native select controls");
assert.match(source, /dragPathOut/, "Single staged image drags should use the image-aware drag path");
assert.match(source, /isTrayImageFile\(trigger\)/, "Tray image drag should be detected before generic file drag");
assert.equal(/const movesWithinTray/.test(source), false, "Shelf row drag should stay native drag-out; use Move for lanes");
assert.equal(/dataTransfer\.setData\(TRAY_ENTRY_DRAG/.test(source), false, "Shelf row drag should not start an HTML lane drag");
assert.match(source, /ev\.preventDefault\(\);\s*onDrag\(\);/, "Shelf rows should prevent browser drag and call native drag-out");
assert.match(source, /aria-label="Paste at cursor"[\s\S]*?onPaste\(\)/, "Text paste control should still call the shared paste path");
assert.equal(/dataTransfer\.setData\("text\/plain", entry\.label\)/.test(source), false, "Lane drag should not leak labels as external plain-text drops");
assert.match(commands, /pub fn show_tray[\s\S]*capture_frontmost\(\)/, "Tray show should capture the app that owns paste focus");
assert.match(commands, /pub fn tray_paste[\s\S]*reactivate_prev\(\)/, "Tray paste should reactivate the captured app before Cmd+V");
assert.equal(/>\s*Move\s*<ChevronDown/.test(laneMoveSelect), false, "Row move control should be compact, not a text pill");

console.log("tray ui selfcheck passed");
