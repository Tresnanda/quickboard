import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listCategories, listItems } from "./ipc";
import type { Item } from "./types";

type ItemsState = {
  items: Item[];
  categories: string[];
  query: string;
  setQuery: (q: string) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  reload: () => Promise<void>;
  loading: boolean;
  error: string | null;
};

const ItemsContext = createContext<ItemsState | null>(null);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextItems, nextCategories] = await Promise.all([
        listItems(),
        listCategories(),
      ]);
      setItems(nextItems);
      setCategories(nextCategories);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<ItemsState>(
    () => ({
      items,
      categories,
      query,
      setQuery,
      addOpen,
      setAddOpen,
      reload,
      loading,
      error,
    }),
    [items, categories, query, addOpen, reload, loading, error],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsState {
  const ctx = useContext(ItemsContext);
  if (!ctx) {
    throw new Error("useItems must be used within an ItemsProvider");
  }
  return ctx;
}
