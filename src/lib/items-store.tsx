import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { makeTrailingDebounce, shouldReload } from "./board-sync";
import { listCategories, listEnvironments, listItems } from "./ipc";
import { useEnvironments } from "./environments";
import { getSettings } from "./settings";
import type { ContentType, Item } from "./types";

type ItemsState = {
  items: Item[];
  categories: string[];
  environments: string[];

  // the active environment scopes the board (null = All environments)
  activeEnvironment: string | null;
  setActiveEnvironment: (env: string | null) => void;

  // search + filters (within the active environment)
  query: string;
  setQuery: (q: string) => void;
  categoryFilter: string | null;
  setCategoryFilter: (category: string | null) => void;
  pinnedOnly: boolean;
  setPinnedOnly: (v: boolean) => void;
  typeFilter: ContentType | null;
  setTypeFilter: (t: ContentType | null) => void;

  // surfaces
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  commitOpen: boolean; // the tray "Save to board" batch-commit modal
  setCommitOpen: (open: boolean) => void;
  commitIds: string[]; // tray entry ids to commit (empty = all staged)
  setCommitIds: (ids: string[]) => void;
  commitCategory: string; // pre-fill the commit dialog's category (from a tray lane)
  setCommitCategory: (category: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  editItem: Item | null;
  setEditItem: (item: Item | null) => void;

  // data
  reload: () => Promise<void>;
  loading: boolean;
  error: string | null;
};

const ItemsContext = createContext<ItemsState | null>(null);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [derivedEnvironments, setDerivedEnvironments] = useState<string[]>([]);
  const [activeEnvironment, setActiveEnvironmentState] = useState<string | null>(() => getSettings().defaultEnvironment);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ContentType | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitIds, setCommitIds] = useState<string[]>([]);
  const [commitCategory, setCommitCategory] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // user-created environments (client-side) merged with the item-derived list
  const customEnvironments = useEnvironments();
  const environments = useMemo(
    () => Array.from(new Set([...customEnvironments, ...derivedEnvironments])),
    [customEnvironments, derivedEnvironments],
  );

  // Switching environments resets the category filter (categories differ per env).
  const setActiveEnvironment = useCallback((env: string | null) => {
    setActiveEnvironmentState(env);
    setCategoryFilter(null);
  }, []);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [nextItems, nextCategories, nextEnvironments] = await Promise.all([
        listItems(),
        listCategories(),
        listEnvironments(),
      ]);
      setItems(nextItems);
      setCategories(nextCategories);
      setDerivedEnvironments(nextEnvironments);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Coalesce refetch bursts (bulk delete, lane commit) into one refetch, and
  // skip self-originated broadcasts — the emitting window already reloaded
  // locally after its own mutation.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const label = getCurrentWebviewWindow().label;
    const debouncedReload = makeTrailingDebounce(() => void reloadRef.current(), 80);
    const un = listen<{ source?: string }>("board:changed", (e) => {
      if (!shouldReload(e.payload, label)) return; // local mutation already handled
      debouncedReload();
    });
    return () => {
      debouncedReload.cancel();
      void un.then((f) => f());
    };
  }, []);

  const value = useMemo<ItemsState>(
    () => ({
      items, categories, environments,
      activeEnvironment, setActiveEnvironment,
      query, setQuery,
      categoryFilter, setCategoryFilter,
      pinnedOnly, setPinnedOnly,
      typeFilter, setTypeFilter,
      selectedItemId, setSelectedItemId,
      addOpen, setAddOpen,
      commitOpen, setCommitOpen,
      commitIds, setCommitIds,
      commitCategory, setCommitCategory,
      paletteOpen, setPaletteOpen,
      editItem, setEditItem,
      reload, loading, error,
    }),
    [
      items, categories, environments, activeEnvironment, setActiveEnvironment,
      query, categoryFilter, pinnedOnly, typeFilter,
      selectedItemId, addOpen, commitOpen, commitIds, commitCategory, paletteOpen, editItem, reload, loading, error,
    ],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsState {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error("useItems must be used within an ItemsProvider");
  return ctx;
}

export function useSelectedItem(): Item | null {
  const { items, selectedItemId } = useItems();
  return useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
}
