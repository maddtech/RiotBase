import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarOff,
  ListMusic,
  MapPin,
  Music,
  Users,
} from "lucide-react";
import {
  api,
  formatDuration,
  formatEventTime,
  type BandEvent,
  type Blackout,
  type Setlist,
  type Song,
} from "../api/client";
import { useApp } from "../context/AppContext";

export const DashboardPage: React.FC = () => {
  const { activeBand } = useApp();
  const [events, setEvents] = useState<BandEvent[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBand) return;
    setLoading(true);
    Promise.all([
      api.listEvents(activeBand.id),
      api.listBlackouts(activeBand.id),
      api.listSongs(activeBand.id),
      api.listSetlists(activeBand.id),
    ])
      .then(([evs, blks, sngs, sets]) => {
        setEvents(evs);
        setBlackouts(blks);
        setSongs(sngs);
        setSetlists(sets);
      })
      .finally(() => setLoading(false));
  }, [activeBand?.id]);

  if (!activeBand) return null;

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: activeBand.default_timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const upcomingEvents = events.filter(
    (e) =>
      e.status !== "canceled" &&
      new Date(
        e.start_at_utc.endsWith("Z") ? e.start_at_utc : `${e.start_at_utc}Z`,
      ) >= now,
  );
  const nextEvent = upcomingEvents[0] || null;
  const activeOrUpcomingBlackouts = blackouts.filter(
    (b) => b.end_date >= todayStr,
  );

  const readySongs = songs.filter((s) => s.status === "ready");
  const readyRuntime = readySongs.reduce(
    (sum, s) => sum + s.duration_seconds,
    0,
  );

  const nextEventConflicts = nextEvent
    ? blackouts.filter((b) => {
        const evDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: nextEvent.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(
          new Date(
            nextEvent.start_at_utc.endsWith("Z")
              ? nextEvent.start_at_utc
              : `${nextEvent.start_at_utc}Z`,
          ),
        );
        return evDate >= b.start_date && evDate <= b.end_date;
      })
    : [];

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{activeBand.name}</h1>
          <p className="text-sm text-zinc-400">
            {[activeBand.home_city, activeBand.home_state]
              .filter(Boolean)
              .join(", ") || "Home Base"}{" "}
            •{" "}
            <span className="font-mono text-xs">
              {activeBand.default_timezone}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/calendar"
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm"
          >
            + Schedule Event
          </Link>
        </div>
      </div>

      {/* Quick Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/calendar"
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs uppercase font-semibold">
            <span>Upcoming Events</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {loading ? "—" : upcomingEvents.length}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {upcomingEvents.filter((e) => e.event_type === "gig").length} gigs •{" "}
            {upcomingEvents.filter((e) => e.event_type === "rehearsal").length}{" "}
            rehearsals
          </div>
        </Link>

        <Link
          to="/songs"
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs uppercase font-semibold">
            <span>Stage-Ready Catalog</span>
            <Music className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {loading ? "—" : `${readySongs.length} songs`}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {formatDuration(readyRuntime)} total material ({songs.length} total)
          </div>
        </Link>

        <Link
          to="/setlists"
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition"
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs uppercase font-semibold">
            <span>Saved Setlists</span>
            <ListMusic className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {loading ? "—" : setlists.length}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Ready for Stage View</div>
        </Link>
      </div>

      {/* Next Up Hero Card */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Next Up
        </h2>
        {!nextEvent ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              No upcoming gigs or rehearsals on the books.
            </p>
            <Link
              to="/calendar"
              className="text-sm text-amber-400 hover:underline flex items-center gap-1"
            >
              Add one now <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs uppercase font-bold px-2.5 py-0.5 rounded ${
                    nextEvent.event_type === "gig"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                  }`}
                >
                  {nextEvent.event_type}
                </span>
                <span className="text-xs uppercase text-zinc-400">
                  {nextEvent.status}
                </span>
              </div>
              {nextEvent.setlist_id && (
                <Link
                  to={`/setlists?setlist=${nextEvent.setlist_id}`}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-amber-300 font-medium flex items-center gap-1.5"
                >
                  <ListMusic className="w-3.5 h-3.5" /> Open Setlist (
                  {nextEvent.setlist_name})
                </Link>
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-zinc-100">
                {nextEvent.title}
              </h3>
              <p className="text-sm text-amber-300 font-medium mt-0.5">
                {
                  formatEventTime(nextEvent.start_at_utc, nextEvent.timezone)
                    .venueDisplay
                }
              </p>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
              {nextEvent.venue_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                  {nextEvent.venue_name}
                  {nextEvent.venue_city
                    ? ` (${[nextEvent.venue_city, nextEvent.venue_state].filter(Boolean).join(", ")})`
                    : ""}
                </span>
              )}
              {nextEvent.load_in_time && (
                <span>Load-in: {nextEvent.load_in_time}</span>
              )}
              {nextEvent.soundcheck_time && (
                <span>Soundcheck: {nextEvent.soundcheck_time}</span>
              )}
            </div>

            {nextEventConflicts.length > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                <AlertTriangle className="w-4 h-4" />
                Blackout conflict:{" "}
                {nextEventConflicts.map((c) => c.user_display_name).join(", ")}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Active & Upcoming Member Blackouts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <CalendarOff className="w-3.5 h-3.5 text-red-400" /> Upcoming Member
            Blackouts
          </h2>
          <Link
            to="/members"
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
          >
            <Users className="w-3.5 h-3.5" /> Roster & Invites
          </Link>
        </div>

        {activeOrUpcomingBlackouts.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-xs text-zinc-400">
            Everyone is clear—no upcoming member blackouts.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {activeOrUpcomingBlackouts.slice(0, 5).map((b) => (
              <div
                key={b.id}
                className="p-3.5 flex items-center justify-between text-sm"
              >
                <div>
                  <span className="font-semibold">{b.user_display_name}</span>
                  <span className="mx-2 text-zinc-600">•</span>
                  <span className="font-mono text-xs text-red-300">
                    {b.start_date === b.end_date
                      ? b.start_date
                      : `${b.start_date} → ${b.end_date}`}
                  </span>
                </div>
                {b.reason && (
                  <span className="text-xs text-zinc-400">{b.reason}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
