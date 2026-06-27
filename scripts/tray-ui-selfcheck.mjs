import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/TrayDock.tsx", import.meta.url), "utf8");

assert.equal(/<select[\s>]/.test(source), false, "TrayDock should not use native select controls");
assert.match(source, /\.setDragImage\(/, "Lane drag should set an explicit drag preview");
assert.match(source, /dragPathOut/, "Single staged image drags should use the image-aware drag path");
assert.match(source, /isTrayImageFile\(trigger\)/, "Tray image drag should be detected before generic file drag");

console.log("tray ui selfcheck passed");
