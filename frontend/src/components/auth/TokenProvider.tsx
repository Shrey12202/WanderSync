"use client";

/**
 * TokenProvider
 *
 * Mounts invisibly inside <SignedIn> and keeps a fresh Clerk token
 * stored in the module-level `cachedToken` used by api.ts.
 * This solves the timing problem where window.Clerk isn't loaded yet
 * when the first API call fires.
 */
import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { setAuthToken } from "@/lib/api";

export default function TokenProvider() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;

    const refresh = async () => {
      const token = await getToken();
      setAuthToken(token ?? null);
    };

    refresh();
    // Refresh every 55 seconds (Clerk tokens expire after 60s)
    const interval = setInterval(refresh, 55_000);
    return () => clearInterval(interval);
  }, [isSignedIn, getToken]);

  return null;
}
