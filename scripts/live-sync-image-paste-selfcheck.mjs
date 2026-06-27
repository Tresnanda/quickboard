import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ipc = readFileSync("src/lib/ipc.ts", "utf8");
const itemsStore = readFileSync("src/lib/items-store.tsx", "utf8");
const environmentsStore = readFileSync("src/lib/environments.ts", "utf8");
const summon = readFileSync("src/components/SummonPanel.tsx", "utf8");
const tray = readFileSync("src/components/TrayDock.tsx", "utf8");
const commands = readFileSync("src-tauri/src/commands.rs", "utf8");
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
const imageCommand = commands.match(/pub async fn summon_paste_image[\s\S]*?\n}\n\n\/\/\/ Dismiss/)?.[0] ?? "";

for (const command of [
  "add_text_item",
  "add_file_item",
  "set_environment",
  "update_item",
  "set_pinned",
  "delete_item",
  "rename_category",
  "delete_category",
  "rename_environment",
  "delete_environment",
]) {
  assert.match(
    ipc,
    new RegExp(`boardChanged\\(\\s*invoke(?:<[^>]+>)?\\("${command}"`, "s"),
    `${command} should emit board:changed after a successful mutation`,
  );
}

assert.match(itemsStore, /listen\("board:changed"/, "ItemsProvider should reload when another window changes the board");
assert.match(environmentsStore, /emit\("environments:changed"/, "custom environments should broadcast after localStorage writes");
assert.match(environmentsStore, /listen\("environments:changed"/, "custom environments should subscribe to cross-window writes");
assert.match(environmentsStore, /addEventListener\("storage"/, "custom environments should react to browser storage events across webviews");
assert.match(summon, /if \(!scopeEnv \|\| environments\.includes\(scopeEnv\)\) return;[\s\S]*setScopeEnv\(null\)/, "Quick Bar should leave a deleted environment scope after board sync");
assert.match(summon, /if \(!scopeCat \|\| categories\.includes\(scopeCat\)\) return;[\s\S]*setScopeCat\(null\)/, "Quick Bar should leave a deleted category scope after board sync");
assert.match(tray, /boardEnv[\s\S]*!environments\.includes\(boardEnv\)[\s\S]*setBoardEnv/, "Tray Board view should leave a deleted environment after board sync");
assert.match(tray, /boardCatList[\s\S]*filter\(\(c\) => boardCatList\.includes\(c\)\)/, "Tray Board view should leave deleted category filters after board sync");
assert.match(ipc, /export const summonPasteImage = \(id: string\) => invoke<void>\("summon_paste_image"/, "ipc should expose the native image paste command");
assert.match(summon, /if \(contentType\(it\) === "image"\) \{[\s\S]*await summonPasteImage\(it\.id\);[\s\S]*return;[\s\S]*\}/, "Quick Bar Enter should paste image items before the generic file staging fallback");
assert.match(commands, /pub async fn summon_paste_image\(/, "native command should paste image board items");
assert.match(commands, /NSPasteboardTypeTIFF/, "native image paste should write decoded image data to the pasteboard");
assert.match(commands, /setData_forType/, "native image paste should write binary image data, not a filename string");
assert.match(imageCommand, /run_on_main_thread/, "native image paste should do AppKit image/pasteboard work on the main thread");
assert.doesNotMatch(commands, /Key::Unicode\('v'\)/, "native paste should not use Enigo's layout-dependent Unicode('v') path");
assert.match(commands, /const MACOS_ANSI_V_KEYCODE: u16 = 0x09;/, "native paste should use the fixed macOS ANSI V keycode");
assert.match(commands, /fn paste_at_cursor\(app: &tauri::AppHandle\) -> Result<\(\), String>/, "native paste should share one safe paste-at-cursor helper");
assert.match(commands, /run_on_main_thread[\s\S]*enigo\.raw\(MACOS_ANSI_V_KEYCODE, Direction::Click\)/, "native paste should synthesize Cmd+V on the main thread without keyboard layout lookup");
assert.match(lib, /commands::summon_paste_image/, "native image paste command should be registered with Tauri");

console.log("live sync + image paste selfcheck passed");
