import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarOff,
  CalendarPlus,
  Download,
  Edit2,
  ExternalLink,
  ImagePlus,
  ListMusic,
  Mail,
  MapPin,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  formatEventTime,
  toLocalDateTimeInput,
  type BandEvent,
  type Blackout,
  type Setlist,
  type Venue,
} from "../api/client";
import {
  downloadEventFlyer,
  EventFlyerThumbnail,
} from "../components/EventFlyerPreview";
import { VenueAutocomplete } from "../components/VenueAutocomplete";
import { useApp } from "../context/AppContext";

export const CalendarPage: React.FC = () => {
  const { activeBand, user, status: sysStatus } = useApp();
  const [events, setEvents] = useState<BandEvent[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  // Event modal state (handles both Create and Edit)
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BandEvent | null>(null);
  const [eventType, setEventType] = useState<"gig" | "rehearsal">("gig");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"hold" | "confirmed" | "canceled">(
    "confirmed",
  );
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [setlistId, setSetlistId] = useState("");
  const [localStart, setLocalStart] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [loadInTime, setLoadInTime] = useState("");
  const [soundcheckTime, setSoundcheckTime] = useState("");
  const [notes, setNotes] = useState("");

  // Event flyer upload state inside Create / Edit modal
  const flyerInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFlyerFile, setPendingFlyerFile] = useState<File | null>(null);
  const [pendingFlyerPreview, setPendingFlyerPreview] = useState<string | null>(
    null,
  );
  const [removeExistingFlyer, setRemoveExistingFlyer] = useState(false);
  const [flyerError, setFlyerError] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);

  // Blackout modal state
  const [blackoutModalOpen, setBlackoutModalOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const loadData = async () => {
    if (!activeBand) return;
    const [evs, blks, sets, vens] = await Promise.all([
      api.listEvents(activeBand.id),
      api.listBlackouts(activeBand.id),
      api.listSetlists(activeBand.id),
      api.listVenues(activeBand.id),
    ]);
    setEvents(evs);
    setBlackouts(blks);
    setSetlists(sets);
    setVenues(vens);
  };

  useEffect(() => {
    loadData();
  }, [activeBand?.id]);

  if (!activeBand) return null;

  const clearPendingFlyer = () => {
    if (pendingFlyerPreview) {
      URL.revokeObjectURL(pendingFlyerPreview);
    }
    setPendingFlyerFile(null);
    setPendingFlyerPreview(null);
    setRemoveExistingFlyer(false);
    setFlyerError(null);
    if (flyerInputRef.current) {
      flyerInputRef.current.value = "";
    }
  };

  const openCreateModal = () => {
    clearPendingFlyer();
    setEditingEvent(null);
    setEventType("gig");
    setTitle("");
    setStatus("confirmed");
    setSelectedVenue(null);
    setSetlistId("");
    setLocalStart("");
    setTimezone(activeBand.default_timezone);
    setLoadInTime("");
    setSoundcheckTime("");
    setNotes("");
    setEventModalOpen(true);
  };

  const openEditModal = (ev: BandEvent) => {
    clearPendingFlyer();
    setEditingEvent(ev);
    setEventType(ev.event_type);
    setTitle(ev.title);
    setStatus(ev.status);
    setSelectedVenue(
      ev.venue_id ? venues.find((v) => v.id === ev.venue_id) || null : null,
    );
    setSetlistId(ev.setlist_id || "");
    setLocalStart(toLocalDateTimeInput(ev.start_at_utc, ev.timezone));
    setTimezone(ev.timezone);
    setLoadInTime(ev.load_in_time || "");
    setSoundcheckTime(ev.soundcheck_time || "");
    setNotes(ev.notes || "");
    setEventModalOpen(true);
  };

  const handleSelectFlyerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFlyerError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFlyerError("Only JPG, PNG, and WebP flyer images are supported.");
      if (flyerInputRef.current) flyerInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFlyerError("Flyer file must be 10 MB or smaller.");
      if (flyerInputRef.current) flyerInputRef.current.value = "";
      return;
    }

    if (pendingFlyerPreview) {
      URL.revokeObjectURL(pendingFlyerPreview);
    }
    setPendingFlyerFile(file);
    setPendingFlyerPreview(URL.createObjectURL(file));
    setRemoveExistingFlyer(false);
    if (flyerInputRef.current) flyerInputRef.current.value = "";
  };

  const handleVenuePicked = (v: Venue | null) => {
    setSelectedVenue(v);
    if (v) {
      setTimezone(v.timezone);
      if (!title.trim() && eventType === "gig") {
        setTitle(`Live at ${v.name}`);
      }
    } else {
      setTimezone(activeBand.default_timezone);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlyerError(null);
    setSavingEvent(true);
    try {
      const payload = {
        event_type: eventType,
        title: title.trim(),
        status,
        venue_id: selectedVenue?.id || null,
        setlist_id: setlistId || null,
        local_start: localStart,
        timezone,
        load_in_time: loadInTime.trim() || null,
        soundcheck_time: soundcheckTime.trim() || null,
        notes: notes.trim() || null,
      };

      const saved = editingEvent
        ? await api.updateEvent(activeBand.id, editingEvent.id, payload)
        : await api.createEvent(activeBand.id, {
            ...payload,
            load_in_time: payload.load_in_time || undefined,
            soundcheck_time: payload.soundcheck_time || undefined,
            notes: payload.notes || undefined,
          });

      if (pendingFlyerFile) {
        await api.uploadEventFlyer(activeBand.id, saved.id, pendingFlyerFile);
      } else if (
        editingEvent &&
        editingEvent.flyer_filename &&
        removeExistingFlyer
      ) {
        await api.deleteEventFlyer(activeBand.id, saved.id);
      }

      clearPendingFlyer();
      setEventModalOpen(false);
      setEditingEvent(null);
      await loadData();
    } catch (err: any) {
      setFlyerError(err.message || "Failed to save event or flyer.");
      await loadData();
    } finally {
      setSavingEvent(false);
    }
  };

  const handleQuickSetlistChange = async (
    ev: BandEvent,
    nextSetlistId: string,
  ) => {
    await api.updateEvent(activeBand.id, ev.id, {
      setlist_id: nextSetlistId || null,
    });
    await loadData();
  };

  const handleCreateBlackout = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createBlackout(activeBand.id, {
      start_date: startDate,
      end_date: endDate || startDate,
      reason: reason.trim() || undefined,
    });
    setBlackoutModalOpen(false);
    setStartDate("");
    setEndDate("");
    setReason("");
    await loadData();
  };

  const getOverlappingBlackouts = (ev: BandEvent) => {
    const evDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: ev.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ev.start_at_utc));

    return blackouts.filter(
      (b) => evDate >= b.start_date && evDate <= b.end_date,
    );
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Calendar & Member Blackouts</h1>
          <p className="text-sm text-zinc-400">
            Schedule gigs and rehearsals with automatic venue timezones and
            check member availability.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBlackoutModalOpen(true)}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
          >
            <CalendarOff className="w-4 h-4 text-red-400" /> Block Dates
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm flex items-center gap-2 cursor-pointer"
          >
            <CalendarPlus className="w-4 h-4" /> Add Gig / Rehearsal
          </button>
        </div>
      </div>

      {/* Upcoming Gigs & Rehearsals */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Gigs & Rehearsals
        </h2>
        {events.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-400">
            No gigs or rehearsals scheduled yet.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => {
              const timeInfo = formatEventTime(ev.start_at_utc, ev.timezone);
              const conflicts = getOverlappingBlackouts(ev);

              return (
                <div
                  key={ev.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-[260px]">
                    {ev.flyer_filename && (
                      <EventFlyerThumbnail
                        bandId={activeBand.id}
                        eventId={ev.id}
                        eventTitle={ev.title}
                        flyerFilename={ev.flyer_filename}
                        size="md"
                      />
                    )}
                    <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] uppercase font-bold px-2 py-0.5 rounded ${
                          ev.event_type === "gig"
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                        }`}
                      >
                        {ev.event_type}
                      </span>
                      <span className="text-xs uppercase text-zinc-400">
                        {ev.status}
                      </span>
                      <h3 className="font-bold text-base text-zinc-100">
                        {ev.title}
                      </h3>
                    </div>

                    <div className="text-sm text-zinc-200 font-medium">
                      {timeInfo.venueDisplay}
                      {timeInfo.localDiffers && (
                        <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-300">
                          {timeInfo.userDisplay} your time
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
                      {ev.venue_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                          {ev.venue_name}
                          {ev.venue_city
                            ? ` (${[ev.venue_city, ev.venue_state].filter(Boolean).join(", ")})`
                            : ""}
                        </span>
                      )}
                      {ev.load_in_time && (
                        <span>Load-in: {ev.load_in_time}</span>
                      )}
                      {ev.soundcheck_time && (
                        <span>Soundcheck: {ev.soundcheck_time}</span>
                      )}
                    </div>

                    {/* Inline Quick Setlist Switcher */}
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <ListMusic className="w-3.5 h-3.5 text-amber-400" />
                        <span>Setlist:</span>
                        <select
                          value={ev.setlist_id || ""}
                          onChange={(e) =>
                            handleQuickSetlistChange(ev, e.target.value)
                          }
                          className="px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">— Unassigned —</option>
                          {setlists.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {ev.setlist_id && (
                        <Link
                          to={`/setlists?setlist=${ev.setlist_id}`}
                          className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1"
                        >
                          Open Setlist <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>

                    {ev.notes && (
                      <p className="text-xs text-zinc-400 pt-0.5">{ev.notes}</p>
                    )}

                    {conflicts.length > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Blackout conflict:{" "}
                        {conflicts.map((c) => c.user_display_name).join(", ")}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Card Actions: Flyer Download, Optional Email, Edit, Delete */}
                  <div className="flex items-center gap-1">
                    {ev.flyer_filename && (
                      <button
                        onClick={() =>
                          downloadEventFlyer(
                            activeBand.id,
                            ev.id,
                            ev.title,
                            ev.flyer_filename!,
                          ).catch((err) => alert(err.message))
                        }
                        title="Download show flyer"
                        className="p-1.5 hover:bg-zinc-800 text-zinc-300 rounded cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {sysStatus?.smtp_enabled && (
                      <button
                        onClick={async () => {
                          setNotifyingId(ev.id);
                          try {
                            const res = await api.notifyEventMembers(
                              activeBand.id,
                              ev.id,
                            );
                            alert(
                              `Event details emailed to ${res.sent_to_count} band member(s).`,
                            );
                          } catch (err: any) {
                            alert(err.message);
                          } finally {
                            setNotifyingId(null);
                          }
                        }}
                        disabled={notifyingId === ev.id}
                        title="Email event reminder to band"
                        className="p-1.5 hover:bg-amber-500/20 text-amber-400 rounded cursor-pointer disabled:opacity-40"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => openEditModal(ev)}
                      title="Edit event"
                      className="p-1.5 hover:bg-zinc-800 text-zinc-300 rounded cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={async () => {
                        if (confirm(`Delete "${ev.title}"?`)) {
                          await api.deleteEvent(activeBand.id, ev.id);
                          await loadData();
                        }
                      }}
                      title="Delete event"
                      className="p-1.5 hover:bg-red-500/20 text-red-400 rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Member Blackouts */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Member Blackout Dates
        </h2>
        {blackouts.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-sm text-zinc-400">
            No member blackout dates logged.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {blackouts.map((b) => (
              <div
                key={b.id}
                className="p-3.5 flex items-center justify-between gap-4 text-sm"
              >
                <div>
                  <span className="font-semibold text-zinc-100">
                    {b.user_display_name}
                  </span>
                  <span className="mx-2 text-zinc-500">•</span>
                  <span className="font-mono text-xs text-red-300">
                    {b.start_date === b.end_date
                      ? b.start_date
                      : `${b.start_date} → ${b.end_date}`}
                  </span>
                  {b.reason && (
                    <span className="ml-2 text-xs text-zinc-400">
                      ({b.reason})
                    </span>
                  )}
                </div>
                {(b.user_id === user?.id || activeBand.my_role === "admin") && (
                  <button
                    onClick={async () => {
                      await api.deleteBlackout(activeBand.id, b.id);
                      await loadData();
                    }}
                    className="p-1 hover:bg-red-500/20 text-red-400 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create / Edit Event Modal */}
      {eventModalOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEvent}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editingEvent ? "Edit Event" : "Schedule Event"}
              </h2>
              <button
                type="button"
                onClick={() => setEventModalOpen(false)}
                className="text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                >
                  <option value="gig">Gig / Show</option>
                  <option value="rehearsal">Rehearsal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="hold">Hold / Tentative</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Venue / Location (Optional)
              </label>
              <VenueAutocomplete
                selectedVenue={selectedVenue}
                onSelectVenue={handleVenuePicked}
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Event Title *
              </label>
              <input
                required
                placeholder="e.g. Punk Night @ New Brookland Tavern"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Local Start Date & Time *
                </label>
                <input
                  required
                  type="datetime-local"
                  value={localStart}
                  onChange={(e) => setLocalStart(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Event Timezone
                </label>
                <input
                  required
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Load-In
                </label>
                <input
                  placeholder="6:00 PM"
                  value={loadInTime}
                  onChange={(e) => setLoadInTime(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Soundcheck
                </label>
                <input
                  placeholder="6:45 PM"
                  value={soundcheckTime}
                  onChange={(e) => setSoundcheckTime(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Setlist
                </label>
                <select
                  value={setlistId}
                  onChange={(e) => setSetlistId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                >
                  <option value="">None</option>
                  {setlists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>

            {/* Show Flyer / Poster Attachment */}
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs text-zinc-400">
                  Show Flyer / Poster (Optional • JPG, PNG, WebP up to 10 MB)
                </label>
                <input
                  ref={flyerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleSelectFlyerFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => flyerInputRef.current?.click()}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                  {pendingFlyerFile ||
                  (editingEvent?.flyer_filename && !removeExistingFlyer)
                    ? "Replace Flyer"
                    : "Upload Flyer"}
                </button>
              </div>

              {flyerError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg">
                  {flyerError}
                </div>
              )}

              {pendingFlyerPreview && pendingFlyerFile ? (
                <div className="flex items-center justify-between gap-3 p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={pendingFlyerPreview}
                      alt="Selected flyer preview"
                      className="w-12 h-15 object-cover rounded border border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200 truncate">
                        {pendingFlyerFile.name}
                      </div>
                      <div className="text-[11px] text-amber-400">
                        Ready to upload on save (
                        {(pendingFlyerFile.size / 1024 / 1024).toFixed(2)} MB)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearPendingFlyer}
                    className="text-xs text-red-400 hover:underline shrink-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : editingEvent?.flyer_filename && !removeExistingFlyer ? (
                <div className="flex items-center justify-between gap-3 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <EventFlyerThumbnail
                      bandId={activeBand.id}
                      eventId={editingEvent.id}
                      eventTitle={editingEvent.title}
                      flyerFilename={editingEvent.flyer_filename}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200">
                        Current Show Flyer
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Click thumbnail to preview or download
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingFlyer(true)}
                    className="text-xs text-red-400 hover:underline shrink-0 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : editingEvent?.flyer_filename && removeExistingFlyer ? (
                <div className="flex items-center justify-between p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                  <span>Current flyer will be removed when you save.</span>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingFlyer(false)}
                    className="underline cursor-pointer"
                  >
                    Undo
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  clearPendingFlyer();
                  setEventModalOpen(false);
                }}
                className="px-4 py-2 bg-zinc-800 rounded-lg text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEvent}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
              >
                {savingEvent
                  ? "Saving..."
                  : editingEvent
                    ? "Save Changes"
                    : "Save Event"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Block Dates Modal */}
      {blackoutModalOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateBlackout}
            className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-lg font-bold">Block Out Unavailable Dates</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Start Date *
                </label>
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate) setEndDate(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  End Date *
                </label>
                <input
                  required
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Reason (Optional)
              </label>
              <input
                placeholder="Out of town / Work travel"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBlackoutModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 rounded-lg text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
              >
                Save Blackout
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
