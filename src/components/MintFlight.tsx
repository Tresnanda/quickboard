import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const MintSetContext = createContext<(id: string) => void>(() => {});
const MintedIdContext = createContext<string | null>(null);

/**
 * Items are list rows now, so a "mint" no longer flies a card — it marks the
 * freshly-created row id. The matching <ItemRow> slides into place with a tint
 * highlight that fades (see `.qb-mint-row`). The mark clears itself shortly after.
 */
export const useMintFlight = () => useContext(MintSetContext);
export const useMintedId = () => useContext(MintedIdContext);

export function MintFlightProvider({ children }: { children: ReactNode }) {
  const [mintedId, setMintedId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const mint = useCallback((id: string) => {
    setMintedId(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMintedId(null), 1500);
  }, []);

  return (
    <MintSetContext.Provider value={mint}>
      <MintedIdContext.Provider value={mintedId}>{children}</MintedIdContext.Provider>
    </MintSetContext.Provider>
  );
}
