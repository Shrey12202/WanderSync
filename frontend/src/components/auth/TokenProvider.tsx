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
import { setTokenProvider } from "@/lib/api";

export default function TokenProvider() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;

    // Cache the function so api.ts can get a fresh token on every request
    setTokenProvider(getToken);

  }, [isSignedIn, getToken]);

  return null;
}
