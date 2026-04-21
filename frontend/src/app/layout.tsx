import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import Sidebar from "@/components/layout/Sidebar";
import TokenProvider from "@/components/auth/TokenProvider";

export const metadata: Metadata = {
  title: "WanderSync — Personal Travel Journal",
  description: "Visualize your travels on interactive maps with trip management, media uploads, and animated path playback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body className="antialiased">
          {/* Sidebar only visible when signed in */}
          <SignedIn>
            <TokenProvider />
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </SignedIn>

          {/* Full-screen layout for sign-in / sign-up */}
          <SignedOut>
            <div className="min-h-screen">
              {children}
            </div>
          </SignedOut>
        </body>
      </html>
    </ClerkProvider>
  );
}
