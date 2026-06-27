import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  },
};

const {
  CLIPBOARD_CAP,
  addClip,
  clearClipsSince,
  clearClipboard,
  clipMatches,
  clipPreview,
  getClipboard,
  labelForClipValue,
  restoreClips,
  shouldSuppressClipboardCapture,
  suppressClipboardCapture,
} = await import("../src/lib/clipboard.ts");

function textClip(value, label = value) {
  return {
    id: value,
    kind: "text",
    label,
    value,
    ts: 1,
  };
}

clearClipboard();

assert.equal(CLIPBOARD_CAP, 100);
assert.equal(labelForClipValue("https://www.example.com/path"), "example.com");
assert.equal(clipPreview(textClip("first\nsecond")), "first second");
assert.equal(clipMatches(textClip("first\nsecond"), "first second"), true);
assert.equal(clipMatches(textClip("first\nsecond"), "second third"), false);
assert.equal(clipMatches({ ...textClip("from browser"), sourceApp: "Safari" }, "safari"), true);

suppressClipboardCapture("internal paste");
assert.equal(shouldSuppressClipboardCapture("internal paste"), true);
assert.equal(shouldSuppressClipboardCapture("internal paste"), false);

addClip({ kind: "text", label: "Repeat", value: "repeat" });
addClip({ kind: "text", label: "Repeat", value: "repeat" });
assert.equal(getClipboard().length, 1);

for (let i = 0; i < CLIPBOARD_CAP + 5; i += 1) {
  addClip({ kind: "text", label: `Clip ${i}`, value: `clip-${i}` });
}

assert.equal(getClipboard().length, CLIPBOARD_CAP);
assert.equal(getClipboard()[0]?.value, `clip-${CLIPBOARD_CAP + 4}`);
assert.equal(getClipboard().at(-1)?.value, "clip-5");

const removed = clearClipsSince(Math.floor(Date.now() / 1000) - 60);
assert.equal(removed.length, CLIPBOARD_CAP);
assert.equal(getClipboard().length, 0);
restoreClips(removed.slice(0, 2));
assert.equal(getClipboard().length, 2);

console.log("clipboard selfcheck passed");
