// Characterization tests for content-type.ts — these pin CURRENT behavior of the
// pure classifiers `fileExt` and `contentType`. No appearance overrides are set,
// so getAppearance(...).type is undefined and derivation runs.

import { beforeEach, describe, expect, it } from "vitest";
import { fileExt, contentType, CONTENT_TYPE_LABEL } from "./content-type";
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

describe("fileExt", () => {
  it("returns the lowercased extension", () => {
    expect(fileExt("photo.PNG")).toBe("png");
    expect(fileExt("archive.tar.gz")).toBe("gz");
  });

  it("returns empty string when there is no extension", () => {
    expect(fileExt("README")).toBe("");
  });

  it("returns empty string for a leading dot (dotfile) or trailing dot", () => {
    // dot at index 0 is not > 0, so no extension
    expect(fileExt(".gitignore")).toBe("");
    // trailing dot: dot is at length-1, so no extension
    expect(fileExt("weird.")).toBe("");
  });
});

describe("contentType — File items", () => {
  it("classifies image/* mime as image", () => {
    const item = makeItem({ kind: "File", mime: "image/png", label: "whatever" });
    expect(contentType(item)).toBe("image");
  });

  it("classifies by extension when mime is absent — image extension", () => {
    const item = makeItem({ kind: "File", label: "photo.png", mime: null });
    expect(contentType(item)).toBe("image");
  });

  it("classifies a non-image file extension as file", () => {
    const item = makeItem({ kind: "File", label: "doc.pdf", mime: null });
    expect(contentType(item)).toBe("file");
  });
});

describe("contentType — Text items", () => {
  it("classifies a URL string as link", () => {
    const item = makeItem({ kind: "Text" });
    expect(contentType(item, "https://example.com/page")).toBe("link");
    expect(contentType(item, "www.example.com/page")).toBe("link");
  });

  it("classifies a multiline code-looking snippet as code", () => {
    const item = makeItem({ kind: "Text" });
    const code = "const x = 1;\nfunction f() {}";
    expect(contentType(item, code)).toBe("code");
  });

  it("classifies plain prose as note", () => {
    const item = makeItem({ kind: "Text" });
    expect(contentType(item, "just a plain reminder about groceries")).toBe("note");
  });

  it("requires a newline for code — a single-line code hint is a note", () => {
    // CODE_HINT would match, but the `v.includes("\n")` guard fails on one line.
    const item = makeItem({ kind: "Text" });
    expect(contentType(item, "const x = 1;")).toBe("note");
  });

  it("falls back to note when no value is supplied", () => {
    const item = makeItem({ kind: "Text" });
    expect(contentType(item)).toBe("note");
    expect(contentType(item, null)).toBe("note");
  });
});

describe("CONTENT_TYPE_LABEL", () => {
  it("maps every content type to a display label", () => {
    expect(CONTENT_TYPE_LABEL).toEqual({
      note: "Note",
      link: "Link",
      image: "Image",
      file: "File",
      code: "Code",
    });
  });
});
