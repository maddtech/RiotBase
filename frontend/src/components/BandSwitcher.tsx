import React, { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { api, getBrowserTimezone } from "../api/client";
import { useApp } from "../context/AppContext";

export const BandSwitcher: React.FC = () => {
  const { bands, activeBand, setActiveBandId, refreshSession } = useApp();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await api.createBand({
      name: newName,
      home_city: newCity || undefined,
      home_state: newState || undefined,
      default_timezone: getBrowserTimezone(),
    });
    await refreshSession();
    setActiveBandId(created.id);
    setCreating(false);
    setOpen(false);
    setNewName("");
    setNewCity("");
    setNewState("");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-left cursor-pointer"
      >
        <div className="truncate">
          <div className="font-semibold text-sm text-zinc-100 truncate">
            {activeBand?.name || "Select Band"}
          </div>
          <div className="text-xs text-zinc-400 capitalize">
            {activeBand?.my_role}
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 p-1.5 space-y-1">
          {bands.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setActiveBandId(b.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded text-sm cursor-pointer ${
                b.id === activeBand?.id
                  ? "bg-amber-500/15 text-amber-300 font-medium"
                  : "hover:bg-zinc-800"
              }`}
            >
              {b.name}
            </button>
          ))}
          <div className="border-t border-zinc-800 pt-1">
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-zinc-800 rounded cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Another Band
            </button>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-lg font-bold">Create Another Band</h2>
            <input
              required
              placeholder="Band Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Home City"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
              />
              <input
                placeholder="State"
                value={newState}
                onChange={(e) => setNewState(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-4 py-2 bg-zinc-800 rounded-lg text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
              >
                Create Band
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
