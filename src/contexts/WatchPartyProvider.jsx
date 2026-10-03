import { createContext, useContext } from "react";
import { useWatchParty } from "@/hooks/useWatchParty";

/** Partagé entre /party et /party/:code : sinon l'état du salon se perd à la navigation. */
const WatchPartyContext = createContext(null);

export function WatchPartyProvider({ children }) {
  const party = useWatchParty();
  return <WatchPartyContext.Provider value={party}>{children}</WatchPartyContext.Provider>;
}

export function useParty() {
  const ctx = useContext(WatchPartyContext);
  if (!ctx) throw new Error("useParty doit être utilisé dans un WatchPartyProvider");
  return ctx;
}
