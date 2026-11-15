import React, { useEffect, useState } from "react";
import { Edit2, Globe, MapPin } from "lucide-react";
import { api, type Venue } from "../api/client";
import { useApp } from "../context/AppContext";

export const VenuesPage: React.FC = () => {
  const { activeBand } = useApp();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [contact, setContact] = useState("");
  const [loadIn, setLoadIn] = useState("");
  const [payout, setPayout] = useState("");

  const loadVenues = async () => {
    if (!activeBand) return;
    setVenues(await api.listVenues(activeBand.id));
  };

  useEffect(() => {
    loadVenues();
  }, [activeBand?.id]);

  if (!activeBand) return null;

  const openNotes = (v: Venue) => {
    setEditing(v);
    setContact(v.booking_contact || "");
    setLoadIn(v.load_in_notes || "");
    setPayout(v.payout_notes || "");
  };

  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await api.saveVenue(activeBand.id, {
      local_venue_id: editing.id,
      name: editing.name,
      booking_contact: contact,
      load_in_notes: loadIn,
      payout_notes: payout,
    });
    setEditing(null);
    await loadVenues();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Saved Venues & Private Band Notes
        </h1>
        <p className="text-sm text-zinc-400">
          Venues cached from your gigs and searches. Notes below are private to{" "}
          {activeBand.name}.
        </p>
      </div>

      {venues.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-400">
          No saved venues yet. Search and select a venue when adding a gig to
          cache it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues.map((v) => (
            <div
              key={v.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />{" "}
                    {v.name}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {[v.address, v.city, v.state].filter(Boolean).join(", ")} •{" "}
                    <span className="font-mono">{v.timezone}</span>
                  </p>
                </div>
                <button
                  onClick={() => openNotes(v)}
                  className="p-1.5 hover:bg-zinc-800 rounded text-zinc-300 cursor-pointer"
                  title="Edit private band notes"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {v.website && (
                <a
                  href={v.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1"
                >
                  <Globe className="w-3 h-3" /> Website
                </a>
              )}

              <div className="pt-2 border-t border-zinc-800 space-y-1 text-xs text-zinc-300">
                <div>
                  <span className="text-zinc-500">Booking:</span>{" "}
                  {v.booking_contact || "—"}
                </div>
                <div>
                  <span className="text-zinc-500">Load-in:</span>{" "}
                  {v.load_in_notes || "—"}
                </div>
                <div>
                  <span className="text-zinc-500">Payout:</span>{" "}
                  {v.payout_notes || "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveNotes}
            className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-lg font-bold">
              Private Band Notes: {editing.name}
            </h2>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Booking Contact
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Name / email / phone"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Load-In & Parking Notes
              </label>
              <textarea
                rows={2}
                value={loadIn}
                onChange={(e) => setLoadIn(e.target.value)}
                placeholder="Back alley door, street parking after 6 PM..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Payout / Deal History
              </label>
              <textarea
                rows={2}
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
                placeholder="80/20 door split after soundguy..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 bg-zinc-800 rounded-lg text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
              >
                Save Notes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
