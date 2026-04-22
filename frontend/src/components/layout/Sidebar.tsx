"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const NAV_ITEMS = [
  { href: "/", label: "Map", icon: "🗺️" },
  { href: "/trips", label: "Dashboard", icon: "✈️" },
  { href: "/photos", label: "Media", icon: "📷" },
  { href: "/memories", label: "Memory Wall", icon: "🌍" },
  { href: "/upload", label: "Upload", icon: "📤" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  // Prefer username → firstName → email prefix (never show full email)
  const displayName =
    user?.username ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Traveller";
  const initials = displayName[0]?.toUpperCase() ?? "T";

  return (
    <aside className="w-[280px] h-screen flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--color-border)]">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-teal-500 flex items-center justify-center text-xl">
            🌍
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text)] m-0 leading-tight">WanderSync</h1>
            <p className="text-xs text-[var(--color-text-secondary)] m-0">Travel Journal</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium no-underline transition-all duration-200 ${
                isActive
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] border border-transparent"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Profile Footer — click to go to /profile */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <Link
          href="/profile"
          className={`flex items-center gap-3 p-3 rounded-xl no-underline transition-all group ${
            pathname === "/profile"
              ? "bg-amber-500/10 border border-amber-500/20"
              : "hover:bg-[var(--color-surface-hover)] border border-transparent"
          }`}
        >
          {/* Avatar */}
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt="Profile"
              className="w-9 h-9 rounded-xl object-cover border-2 border-amber-500/30 flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-teal-500 flex items-center justify-center text-sm font-bold text-[#0a0e1a] flex-shrink-0">
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)] m-0 truncate">
              {displayName}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] m-0 opacity-60 group-hover:opacity-100 transition-opacity">
              View Profile →
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
