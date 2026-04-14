"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Map", icon: "🗺️" },
  { href: "/trips", label: "Dashboard", icon: "✈️" },
  { href: "/photos", label: "Photos", icon: "📷" },
  { href: "/upload", label: "Upload", icon: "📤" },
  { href: "/exif-viewer", label: "Photo Meta", icon: "🔍" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[280px] h-screen flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--color-border)]">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-teal-500 flex items-center justify-center text-xl">
            🌍
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text)] m-0 leading-tight">WorldMap</h1>
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

      {/* Footer */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-[var(--color-text-secondary)] m-0">
            Personal travel journal
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-1 opacity-50">
            v1.0.0
          </p>
        </div>
      </div>
    </aside>
  );
}
