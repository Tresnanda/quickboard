export type Kind = "Text" | "File";
export type Item = {
  id: string; label: string; kind: Kind; category: string;
  confidential: boolean; pinned: boolean;
  created_at: number; updated_at: number; last_used_at: number; use_count: number;
};
