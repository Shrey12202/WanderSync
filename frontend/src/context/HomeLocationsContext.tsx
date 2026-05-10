"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { getHomeLocations } from "@/lib/api";
import type { HomeLocation } from "@/types";

type HomeLocationsContextValue = {
  homeLocations: HomeLocation[];
  homesLoading: boolean;
  reloadHomes: () => Promise<void>;
};

const HomeLocationsContext = createContext<HomeLocationsContextValue | null>(null);

export function HomeLocationsProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const { getToken } = useAuth();
  const [homeLocations, setHomeLocations] = useState<HomeLocation[]>([]);
  const [homesLoading, setHomesLoading] = useState(false);

  const reloadHomes = useCallback(async () => {
    if (!signedIn) {
      setHomeLocations([]);
      return;
    }
    setHomesLoading(true);
    try {
      await getToken();
      const rows = await getHomeLocations();
      setHomeLocations(rows);
    } catch {
      setHomeLocations([]);
    } finally {
      setHomesLoading(false);
    }
  }, [signedIn, getToken]);

  useEffect(() => {
    reloadHomes();
  }, [reloadHomes]);

  const value = useMemo(
    () => ({ homeLocations, homesLoading, reloadHomes }),
    [homeLocations, homesLoading, reloadHomes]
  );

  return (
    <HomeLocationsContext.Provider value={value}>{children}</HomeLocationsContext.Provider>
  );
}

export function useHomeLocations(): HomeLocationsContextValue {
  const ctx = useContext(HomeLocationsContext);
  if (!ctx) {
    return {
      homeLocations: [],
      homesLoading: false,
      reloadHomes: async () => {},
    };
  }
  return ctx;
}
