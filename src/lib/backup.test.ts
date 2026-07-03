import { describe, it, expect } from "vitest";
import { serializeBackup, parseBackup, isDuplicate, BACKUP_VERSION, type ExportedItem } from "./backup";

const textItem: ExportedItem = {
  label: "API key",
  kind: "Text",
  category: "Work",
  environment: "prod",
  confidential: false,
  value: "sk-abc123",
  created_at: 1000,
};

const confidentialItem: ExportedItem = {
  label: "DB password",
  kind: "Text",
  category: "Work",
  environment: "prod",
  confidential: true,
  value: null, // confidential text exports with a null value
  created_at: 1001,
};

const fileItem: ExportedItem = {
  label: "cert.pem",
  kind: "File",
  category: "Work",
  environment: "prod",
  confidential: false,
  value: null,
  created_at: 1002,
};

describe("serializeBackup", () => {
  it("writes the versioned envelope with excluded counts", () => {
    const json = serializeBackup([textItem, confidentialItem, fileItem]);
    const env = JSON.parse(json);
    expect(env.version).toBe(BACKUP_VERSION);
    expect(env.includes).toBe("text");
    expect(env.excluded).toEqual({ files: 1, confidential: 1 });
    expect(env.items).toHaveLength(3);
    expect(typeof env.exportedAt).toBe("string");
  });

  it("includes appVersion only when provided", () => {
    expect(JSON.parse(serializeBackup([textItem])).appVersion).toBeUndefined();
    expect(JSON.parse(serializeBackup([textItem], "0.2.4")).appVersion).toBe("0.2.4");
  });
});

describe("parseBackup", () => {
  it("round-trips a serialized backup, importing only text values", () => {
    const json = serializeBackup([textItem, confidentialItem, fileItem]);
    const { items, skipped } = parseBackup(json);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: "API key", value: "sk-abc123", kind: "Text" });
    // confidential (null value) + file both counted as skipped, not importable
    expect(skipped).toBe(2);
  });

  it("counts confidential and file entries as skipped, not importable", () => {
    const json = serializeBackup([confidentialItem, fileItem]);
    const { items, skipped } = parseBackup(json);
    expect(items).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseBackup("{not json")).toThrow(/valid JSON/i);
  });

  it("throws on a wrong version", () => {
    const json = JSON.stringify({ version: 99, items: [] });
    expect(() => parseBackup(json)).toThrow(/version/i);
  });

  it("throws when items is missing", () => {
    const json = JSON.stringify({ version: BACKUP_VERSION });
    expect(() => parseBackup(json)).toThrow(/items/i);
  });

  it("throws when the payload isn't an object", () => {
    expect(() => parseBackup("[]")).toThrow(/backup/i);
  });

  it("skips malformed item entries but keeps valid ones", () => {
    const json = JSON.stringify({
      version: BACKUP_VERSION,
      items: [textItem, { label: "broken" }, null],
    });
    const { items, skipped } = parseBackup(json);
    expect(items).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe("isDuplicate", () => {
  const existing = [{ label: "API key", category: "Work", environment: "prod", kind: "Text" as const }];

  it("matches on the 4-field key", () => {
    expect(isDuplicate({ label: "API key", category: "Work", environment: "prod", kind: "Text" }, existing)).toBe(true);
  });

  it("does not match when any field differs", () => {
    expect(isDuplicate({ label: "API key", category: "Personal", environment: "prod", kind: "Text" }, existing)).toBe(false);
    expect(isDuplicate({ label: "API key", category: "Work", environment: "dev", kind: "Text" }, existing)).toBe(false);
    expect(isDuplicate({ label: "Other", category: "Work", environment: "prod", kind: "Text" }, existing)).toBe(false);
    expect(isDuplicate({ label: "API key", category: "Work", environment: "prod", kind: "File" }, existing)).toBe(false);
  });
});
