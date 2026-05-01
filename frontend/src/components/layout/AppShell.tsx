"use client";

import { useAuth } from "@clerk/nextjs";
import Sidebar from "@/components/layout/Sidebar";
import TokenProvider from "@/components/auth/TokenProvider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();

  // While Clerk loads, render a minimal shell so the page doesn't flash
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)] text-sm animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    // Full-screen layout for sign-in / sign-up pages
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <>
      <TokenProvider />
      <div className="flex flex-col-reverse md:flex-row h-[100dvh] overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative">{children}</main>
      </div>
    </>
  );
}
