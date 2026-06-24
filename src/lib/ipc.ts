import { invoke } from "@tauri-apps/api/core";
import type { Item } from "./types";

export const listItems = () => invoke<Item[]>("list_items");
export const listCategories = () => invoke<string[]>("list_categories");
export const listEnvironments = () => invoke<string[]>("list_environments");
export const addText = (label: string, category: string, environment: string, confidential: boolean, value: string) =>
  invoke<string>("add_text_item", { label, category, environment, confidential, value });
export const addFile = (label: string, category: string, environment: string, confidential: boolean, srcPath: string) =>
  invoke<string>("add_file_item", { label, category, environment, confidential, srcPath });
export const setEnvironment = (id: string, environment: string) => invoke<void>("set_environment", { id, environment });
export const updateItem = (id: string, label: string, category: string, environment: string, confidential: boolean, value: string | null) =>
  invoke<void>("update_item", { id, label, category, environment, confidential, value });
export const getTextValue = (id: string) => invoke<string>("get_text_value", { id });
export const fileToTemp = (id: string) => invoke<string>("file_to_temp", { id });
export const stageTextFile = (label: string, value: string) => invoke<string>("stage_text_file", { label, value });
export const stageBlobFile = (dataUrl: string, name: string) => invoke<string>("stage_blob_file", { dataUrl, name });
export const getImageDataUrl = (id: string) => invoke<string>("get_image_data_url", { id });
export const setPinned = (id: string, pinned: boolean) => invoke<void>("set_pinned", { id, pinned });
export const deleteItem = (id: string) => invoke<void>("delete_item", { id });
export const renameCategory = (oldName: string, newName: string, environment: string | null) => invoke<void>("rename_category", { old: oldName, new: newName, environment });
export const deleteCategory = (category: string, environment: string | null) => invoke<void>("delete_category", { category, environment });
export const renameEnvironmentItems = (oldName: string, newName: string) => invoke<void>("rename_environment", { old: oldName, new: newName });
export const deleteEnvironmentItems = (environment: string, reassignTo: string) => invoke<void>("delete_environment", { environment, reassignTo });
export const readImageAsDataUrl = (path: string) => invoke<string>("read_image_as_data_url", { path });
export const setAutostart = (enabled: boolean) => invoke<void>("set_autostart", { enabled });
export const getAutostart = () => invoke<boolean>("get_autostart");
