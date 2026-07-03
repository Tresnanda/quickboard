// Pure serialize / parse / validate for quickboard backups.
//
// A backup is text-only and honest about it: only non-confidential Text items
// carry a `value`. Files and confidential items are exported as metadata with a
// null value and counted under `excluded` — they cannot be restored from here.
//
// `version` is the migration hook. Any future change to the exporter shape must
// bump it, and `parseBackup` refuses versions it doesn't understand rather than
// silently importing a mismatched shape.

import type { Kind } from "./types";

export const BACKUP_VERSION = 1;

// One item as written to disk. Non-confidential Text items carry their `value`;
// everything else serializes with `value: null`.
export type ExportedItem = {
  label: string;
  kind: Kind;
  category: string;
  environment: string;
  confidential: boolean;
  value: string | null;
  created_at: number;
};

// An entry that can actually be recreated on import (Text + non-null value).
export type ImportableItem = {
  label: string;
  kind: "Text";
  category: string;
  environment: string;
  confidential: boolean;
  value: string;
  created_at: number;
};

export type BackupEnvelope = {
  version: number;
  exportedAt: string;
  appVersion?: string;
  includes: "text";
  excluded: { files: number; confidential: number };
  items: ExportedItem[];
};

/** Serialize a set of exported items into the versioned backup envelope. */
export function serializeBackup(items: ExportedItem[], appVersion?: string): string {
  const excluded = {
    files: items.filter((it) => it.kind === "File").length,
    confidential: items.filter((it) => it.confidential).length,
  };
  const envelope: BackupEnvelope = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...(appVersion ? { appVersion } : {}),
    includes: "text",
    excluded,
    items,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parse and validate a backup file. Returns only the importable entries
 * (Text items with a non-null value) plus the count of everything skipped
 * (files + confidential/valueless items). Throws a descriptive Error on
 * malformed JSON or an unrecognized version.
 */
export function parseBackup(json: string): { items: ImportableItem[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("This file isn't valid JSON — it may be corrupted or not a quickboard backup.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("This doesn't look like a quickboard backup.");
  }

  const env = parsed as Record<string, unknown>;
  if (env.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${String(env.version)} — this quickboard expects version ${BACKUP_VERSION}.`);
  }

  if (!Array.isArray(env.items)) {
    throw new Error("This backup is missing its items list.");
  }

  const importable: ImportableItem[] = [];
  let skipped = 0;

  for (const raw of env.items) {
    if (typeof raw !== "object" || raw === null) {
      skipped += 1;
      continue;
    }
    const it = raw as Record<string, unknown>;
    // Required fields for any entry.
    if (
      typeof it.label !== "string" ||
      typeof it.kind !== "string" ||
      typeof it.category !== "string" ||
      typeof it.environment !== "string" ||
      !("value" in it)
    ) {
      skipped += 1;
      continue;
    }
    // Only non-null Text values can be recreated. Files and confidential items
    // (whose value is null) fall through to the skipped count.
    if (it.kind === "Text" && typeof it.value === "string") {
      importable.push({
        label: it.label,
        kind: "Text",
        category: it.category,
        environment: it.environment,
        confidential: typeof it.confidential === "boolean" ? it.confidential : false,
        value: it.value,
        created_at: typeof it.created_at === "number" ? it.created_at : 0,
      });
    } else {
      skipped += 1;
    }
  }

  return { items: importable, skipped };
}

/**
 * De-dupe predicate for import. The export carries no ids, so an import row is
 * considered a duplicate of an existing board item when it matches on the
 * 4-field key label + category + environment + kind. Colliding legitimate items
 * are skipped — the result toast must surface the duplicate count.
 */
export function isDuplicate(
  candidate: { label: string; category: string; environment: string; kind: Kind },
  existing: { label: string; category: string; environment: string; kind: Kind }[],
): boolean {
  return existing.some(
    (e) =>
      e.label === candidate.label &&
      e.category === candidate.category &&
      e.environment === candidate.environment &&
      e.kind === candidate.kind,
  );
}
