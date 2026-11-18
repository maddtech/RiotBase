import React, { useEffect, useState } from "react";
import { Building2, Check, Globe, MapPin, Plus } from "lucide-react";
import { api, type Venue, type VenueCandidate } from "../api/client";
import { useApp } from "../context/AppContext";

interface Props {
  selectedVenue: Venue | null;
  onSelectVenue: (venue: Venue | null) => void;
}

export const VenueAutocomplete: React.FC<Props> = ({
  selectedVenue,
  onSelectVenue,
}) => {
  const { activeBand } = useApp();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<VenueCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // Manual DIY entry state
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualState, setManualState] = useState("");

  useEffect(() => {
    if (!activeBand || query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchVenues(activeBand.id, query.trim());
        setCandidates(res);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, activeBand?.id]);

  if (!activeBand) return null;

  const handlePickCandidate = async (candidate: VenueCandidate) => {
    const saved = await api.saveVenue(activeBand.id, candidate);
    onSelectVenue(saved);
    setQuery("");
    setCandidates([]);
  };

  const handleCreateManual = async () => {
    if (!manualName.trim()) return;
    const saved = await api.saveVenue(activeBand.id, {
      name: manualName.trim(),
      address: manualAddress.trim() || null,
      city: manualCity.trim() || null,
      state: manualState.trim() || null,
      timezone: activeBand.default_timezone,
      external_source: "local",
    });
    onSelectVenue(saved);
    setManualMode(false);
  };

  if (selectedVenue) {
    return (
      <div className="p-3 bg-zinc-950 border border-amber-500/40 rounded-lg flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {selectedVenue.name}
          </div>
          <div className="text-xs text-zinc-400">
            {[selectedVenue.address, selectedVenue.city, selectedVenue.state]
              .filter(Boolean)
              .join(", ") || "Custom Location"}{" "}
            • <span className="font-mono">{selectedVenue.timezone}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelectVenue(null)}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!manualMode ? (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venue (Local DB, MusicBrainz, OpenStreetMap)..."
            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-amber-500"
          />
          {searching && (
            <span className="text-xs text-zinc-500 absolute right-3 top-2.5">
              Searching...
            </span>
          )}

          {(candidates.length > 0 || query.trim().length >= 2) && (
            <div className="mt-1 bg-zinc-950 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto divide-y divide-zinc-800">
              {candidates.map((c, idx) => (
                <button
                  key={`${c.external_source}-${c.external_id || idx}`}
                  type="button"
                  onClick={() => handlePickCandidate(c)}
                  className="w-full p-2.5 text-left hover:bg-zinc-800/80 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {[c.address, c.city, c.state]
                        .filter(Boolean)
                        .join(", ") || c.timezone}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0 flex items-center gap-1">
                    {c.external_source === "local" ? (
                      <Building2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Globe className="w-3 h-3 text-amber-400" />
                    )}
                    {c.external_source}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setManualName(query);
                  setManualMode(true);
                }}
                className="w-full p-2.5 text-left text-xs text-amber-400 hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add "
                {query || "DIY / House Venue"}" manually
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 bg-zinc-950 border border-zinc-700 rounded-lg space-y-2.5">
          <div className="text-xs font-semibold text-zinc-300">
            Manual / DIY Venue Entry
          </div>
          <input
            placeholder="Venue Name *"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
          />
          <input
            placeholder="Street Address"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="City"
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
            <input
              placeholder="State"
              value={manualState}
              onChange={(e) => setManualState(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="px-3 py-1 bg-zinc-800 rounded text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateManual}
              className="px-3 py-1 bg-amber-500 text-zinc-950 font-semibold rounded text-xs flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Save Venue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
