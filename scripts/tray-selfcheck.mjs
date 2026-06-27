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

const tray = await import("../src/lib/tray.ts");

assert.equal(typeof tray.restoreTray, "function");
assert.equal(typeof tray.isTrayImageFile, "function");
assert.equal(typeof tray.labelForTrayFile, "function");
assert.equal(tray.isTrayImageFile({ kind: "file", label: "Screenshot", path: "/tmp/qb-staged/blob", mime: "image/png" }), true);
assert.equal(tray.isTrayImageFile({ kind: "file", label: "photo.jpeg", path: "/tmp/qb-staged/blob" }), true);
assert.equal(tray.isTrayImageFile({ kind: "file", label: "notes.txt", path: "/tmp/qb-staged/notes.txt", mime: "text/plain" }), false);
assert.equal(tray.labelForTrayFile("42586a2ce6cdada5e5c2a9a6c3b4245a.jpg", "image/jpeg"), "Image");
assert.equal(tray.labelForTrayFile("vacation.jpg", "image/jpeg"), "vacation.jpg");

tray.clearTray();
tray.addLane("Work");
tray.addLane("Later");

const firstId = tray.addToTray({ kind: "text", label: "One", value: "one" });
const secondId = tray.addToTray({ kind: "text", label: "Two", value: "two" });

tray.moveToLane([firstId], "Work");

const entries = tray.getTray();
const lanes = tray.getLanes();

tray.removeFromTray(firstId);
tray.clearTray();
tray.restoreTray(entries, lanes);

assert.deepEqual(tray.getTray(), entries);
assert.deepEqual(tray.getLanes(), lanes);

tray.moveToLane([firstId, secondId], "Later");
tray.restoreTray(entries);
assert.deepEqual(tray.getTray(), entries);

console.log("tray selfcheck passed");
