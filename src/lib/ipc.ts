import { invoke } from "@tauri-apps/api/core";
import type { Item } from "./types";

export const listItems = () => invoke<Item[]>("list_items");
export const listCategories = () => invoke<string[]>("list_categories");
export const addText = (label: string, category: string, confidential: boolean, value: string) =>
  invoke<string>("add_text_item", { label, category, confidential, value });
export const addFile = (label: string, category: string, confidential: boolean, srcPath: string) =>
  invoke<string>("add_file_item", { label, category, confidential, srcPath });
export const getTextValue = (id: string) => invoke<string>("get_text_value", { id });
export const fileToTemp = (id: string) => invoke<string>("file_to_temp", { id });
export const setPinned = (id: string, pinned: boolean) => invoke<void>("set_pinned", { id, pinned });
export const deleteItem = (id: string) => invoke<void>("delete_item", { id });
