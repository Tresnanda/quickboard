// Characterization tests for tints.ts — pin the deterministic name→tint mapping.
// Expected tint values were computed by running the FNV-1a hash + DEFAULT_ROTATION
// index from the current implementation (not guessed).

import { beforeEach, describe, expect, it } from "vitest";
import { categoryTint, itemTint, TINTS, TINT_NAMES } from "./tints";
import type { Item } from "./types";

beforeEach(() => {
  localStorage.clear();
});

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: "item-" + Math.random().toString(36).slice(2),
    label: "",
    kind: "Text",
    category: "",
    confidential: false,
    pinned: false,
    created_at: 0,
    updated_at: 0,
    last_used_at: 0,
    use_count: 0,
    environment: "",
    ...overrides,
  };
}

describe("categoryTint", () => {
  it("returns stone for empty / whitespace / undefined category", () => {
    expect(categoryTint()).toBe("stone");
    expect(categoryTint("")).toBe("stone");
    expect(categoryTint("   ")).toBe("stone");
  });

  it("is deterministic — same input maps to the same tint", () => {
    expect(categoryTint("Work")).toBe(categoryTint("Work"));
  });

  it("is case-insensitive (lowercased before hashing)", () => {
    expect(categoryTint("Work")).toBe(categoryTint("work"));
  });

  it("maps known category names to their current tint (pinned)", () => {
    expect(categoryTint("Work")).toBe("clay");
    expect(categoryTint("Finance")).toBe("sage");
    expect(categoryTint("Personal")).toBe("amber");
    expect(categoryTint("Ideas")).toBe("mint");
  });

  it("only ever returns tints from the DEFAULT_ROTATION (never neutral stone/graphite for real names)", () => {
    const rotation = new Set([
      "violet", "amber", "slate", "mint", "clay", "sky", "rose", "sage", "lilac", "sand",
    ]);
    for (const name of ["a", "b", "c", "hello world", "Taxes", "Reading List", "zzz"]) {
      expect(rotation.has(categoryTint(name))).toBe(true);
    }
  });

  it("always returns a valid registered tint name", () => {
    for (const name of ["", "Work", "random-cat"]) {
      expect(TINT_NAMES).toContain(categoryTint(name));
      expect(TINTS[categoryTint(name)]).toBeDefined();
    }
  });
});

describe("itemTint", () => {
  it("falls back to the item's category default when no appearance override exists", () => {
    const item = makeItem({ category: "Work" });
    expect(itemTint(item)).toBe(categoryTint("Work"));
    expect(itemTint(item)).toBe("clay");
  });

  it("returns stone for an item with no category and no override", () => {
    const item = makeItem({ category: "" });
    expect(itemTint(item)).toBe("stone");
  });
});

describe("TINTS registry", () => {
  it("keys match each tint's own name field", () => {
    for (const name of TINT_NAMES) {
      expect(TINTS[name].name).toBe(name);
    }
  });

  it("has 12 tints", () => {
    expect(TINT_NAMES).toHaveLength(12);
  });
});
