"use client";

import Link from "next/link";
import type { TripSummary } from "@/types";
import { formatDateRange, getDurationDays } from "@/lib/utils";

interface TripCardProps {
  trip: TripSummary;
}

export default function TripCard({ trip }: TripCardProps) {
  const duration = getDurationDays(trip.start_date, trip.end_date);

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group block no-underline animate-fade-in"
    >
      <div className="relative rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-amber-500/30 transition-all duration-300 hover:shadow-[0_8px_40px_rgba(245,158,11,0.1)]">
        {/* Cover image or gradient */}
        <div className="h-40 relative overflow-hidden">
          {trip.cover_image ? (
            <img
              src={trip.cover_image}
              alt={trip.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-600/20 via-teal-600/20 to-purple-600/20 flex items-center justify-center">
              <span className="text-5xl opacity-30">🌍</span>
            </div>
          )}
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-transparent to-transparent" />

          {/* Duration badge */}
          {duration > 0 && (
            <span className="absolute top-3 right-3 text-xs px-2.5 py-1 rounded-full glass text-[var(--color-text)] font-medium">
              {duration} {duration === 1 ? "day" : "days"}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="text-lg font-semibold text-[var(--color-text)] m-0 group-hover:text-amber-400 transition-colors">
            {trip.title}
          </h3>

          <p className="text-sm text-[var(--color-text-secondary)] m-0 mt-1.5">
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>

          {trip.description && (
            <p className="text-sm text-[var(--color-text-secondary)] m-0 mt-2 line-clamp-2 opacity-70">
              {trip.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
              <span className="text-teal-400">📍</span>
              {trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
              <span className="text-amber-400">📷</span>
              {trip.media_count} {trip.media_count === 1 ? "photo" : "photos"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
