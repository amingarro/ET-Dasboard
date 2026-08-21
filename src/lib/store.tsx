"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { StoreSchema } from "@/types/electron-api";

const initialState: StoreSchema = {
  onboarded: false,
  theme: "system",
  dockMode: "expanded",
  services: [],
  layout: {
    groups: [],
    activeGroupId: null,
  },
  driveSyncEnabled: false,
};

interface StoreContextValue {
  state: StoreSchema;
  loading: boolean;
  update: (patch: Partial<StoreSchema>) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreSchema>(initialState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.store.getAll().then((value) => {
      setState(value);
      setLoading(false);
    });
    const unsubscribe = window.electronAPI.store.onChange((value) => {
      setState(value);
    });
    return unsubscribe;
  }, []);

  const update = useCallback((patch: Partial<StoreSchema>) => {
    setState((prev) => ({ ...prev, ...patch }));
    window.electronAPI.store.set(patch);
  }, []);

  return (
    <StoreContext.Provider value={{ state, loading, update }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
