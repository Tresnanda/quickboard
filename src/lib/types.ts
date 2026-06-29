// Backend item model (mirrors src-tauri/src/model.rs — do not drift).
export type Kind = "Text" | "File";

export type Item = {
  id: string;
  label: string;
  kind: Kind;
  category: string;
  confidential: boolean;
  pinned: boolean;
  created_at: number;
  updated_at: number;
  last_used_at: number;
  use_count: number;
  environment: string;
  mime?: string | null; // File items only — the stored mime (e.g. "image/png"); null for text/confidential
};

// Rich content type used by the new UI (tabs / card rendering). The backend only
// stores Text|File; everything richer is derived or held in the client-side
// appearance store. See lib/content-type.ts and lib/appearance.ts.
export type ContentType = "note" | "link" | "image" | "file" | "code";
