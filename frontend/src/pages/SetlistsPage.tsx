import React, { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { api, formatDuration, type Setlist, type Song } from "../api/client";
import { useApp } from "../context/AppContext";

interface DraftItem {
  key: string;
  item_type: "song" | "break" | "note";
  song_id: string | null;
  song?: Song | null;
  custom_label: string;
  custom_duration_seconds: number;
}

export const SetlistsPage: React.FC = () => {
  const { activeBand } = useApp();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSetlistName, setNewSetlistName] = useState("");

  // Active editor state
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stageMode, setStageMode] = useState(false);

  const loadAll = async () => {
    if (!activeBand) return;
    const [lists, catalog] = await Promise.all([
      api.listSetlists(activeBand.id),
      api.listSongs(activeBand.id),
    ]);
    setSetlists(lists);
    setSongs(catalog);
    if (lists.length > 0 && !lists.some((l) => l.id === selectedId)) {
      selectSetlist(lists[0]);
    }
  };

  const selectSetlist = (sl: Setlist) => {
    setSelectedId(sl.id);
    setDraftItems(
      sl.items.map((item, i) => ({
        key: item.id || `${Date.now()}-${i}`,
        item_type: item.item_type,
        song_id: item.song_id,
        song: item.song,
        custom_label: item.custom_label || "",
        custom_duration_seconds:
          item.custom_duration_seconds ?? item.song?.duration_seconds ?? 0,
      })),
    );
    setDirty(false);
  };

  useEffect(() => {
    setSelectedId(null);
    setDraftItems([]);
    loadAll();
  }, [activeBand?.id]);

  if (!activeBand) return null;

  const activeSetlist = setlists.find((s) => s.id === selectedId) || null;

  const handleCreateSetlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetlistName.trim()) return;
    const created = await api.createSetlist(activeBand.id, {
      name: newSetlistName.trim(),
    });
    setNewSetlistName("");
    await loadAll();
    selectSetlist(created);
  };

  const addSongToSet = (song: Song) => {
    setDraftItems((prev) => [
      ...prev,
      {
        key: `${song.id}-${Date.now()}-${Math.random()}`,
        item_type: "song",
        song_id: song.id,
        song,
        custom_label: "",
        custom_duration_seconds: song.duration_seconds,
      },
    ]);
    setDirty(true);
  };

  const addBreakOrNote = (type: "break" | "note") => {
    setDraftItems((prev) => [
      ...prev,
      {
        key: `${type}-${Date.now()}`,
        item_type: type,
        song_id: null,
        custom_label: type === "break" ? "Tuning / Crowd Talk" : "Stage Cue",
        custom_duration_seconds: type === "break" ? 120 : 0,
      },
    ]);
    setDirty(true);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftItems.length) return;
    const copy = [...draftItems];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    setDraftItems(copy);
    setDirty(true);
  };

  const removeItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleSaveItems = async () => {
    if (!activeSetlist) return;
    setSaving(true);
    try {
      const updated = await api.saveSetlistItems(
        activeBand.id,
        activeSetlist.id,
        draftItems.map((d) => ({
          item_type: d.item_type,
          song_id: d.song_id,
          custom_label: d.custom_label || null,
          custom_duration_seconds: d.custom_duration_seconds,
        })),
      );
      setSetlists((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      selectSetlist(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSetlist = async (sl: Setlist) => {
    if (!confirm(`Delete setlist "${sl.name}"?`)) return;
    await api.deleteSetlist(activeBand.id, sl.id);
    setSelectedId(null);
    await loadAll();
  };

  const liveTotalSeconds = draftItems.reduce(
    (sum, i) => sum + (i.custom_duration_seconds || 0),
    0,
  );
  const liveSongCount = draftItems.filter((i) => i.item_type === "song").length;

  // High-contrast full-screen Stage View
  if (stageMode && activeSetlist) {
    let songNumber = 0;
    return (
      <div className="fixed inset-0 bg-black text-white z-50 overflow-y-auto p-6 md:p-10">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                {activeBand.name}
              </div>
              <h1 className="text-3xl font-black tracking-tight">
                {activeSetlist.name}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right font-mono">
                <div className="text-xl font-bold text-amber-400">
                  {formatDuration(liveTotalSeconds)}
                </div>
                <div className="text-xs text-zinc-400">
                  {liveSongCount} songs
                </div>
              </div>
              <button
                onClick={() => setStageMode(false)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" /> Exit Stage View
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {draftItems.map((item) => {
              if (item.item_type !== "song") {
                return (
                  <div
                    key={item.key}
                    className="py-2 px-4 border-l-4 border-amber-500 bg-zinc-950 text-amber-300 font-mono text-base uppercase tracking-wide"
                  >
                    — {item.custom_label}{" "}
                    {item.custom_duration_seconds > 0 &&
                      `(${formatDuration(item.custom_duration_seconds)})`}
                  </div>
                );
              }
              songNumber += 1;
              return (
                <div
                  key={item.key}
                  className="flex items-baseline justify-between py-2.5 border-b border-zinc-900"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-zinc-500 text-xl w-7">
                      {songNumber}.
                    </span>
                    <div>
                      <div className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase">
                        {item.song?.title || "Unknown Song"}
                      </div>
                      {item.song?.lyrics_or_notes && (
                        <div className="text-sm text-amber-300/90 mt-0.5">
                          {item.song.lyrics_or_notes}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm text-zinc-400 shrink-0 ml-4">
                    {[
                      item.song?.tuning,
                      item.song?.musical_key,
                      item.song?.bpm ? `${item.song.bpm}bpm` : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Setlist Builder</h1>
          <p className="text-sm text-zinc-400">
            Build ordered gig sets with automatic runtime totals and Stage View.
          </p>
        </div>
        <form onSubmit={handleCreateSetlist} className="flex gap-2">
          <input
            value={newSetlistName}
            onChange={(e) => setNewSetlistName(e.target.value)}
            placeholder="New setlist name (e.g. 45-Min Club Set)"
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm w-64"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create
          </button>
        </form>
      </div>

      {/* Setlist Tabs */}
      {setlists.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
          {setlists.map((sl) => (
            <button
              key={sl.id}
              onClick={() => selectSetlist(sl)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium cursor-pointer ${
                sl.id === activeSetlist?.id
                  ? "bg-amber-500 text-zinc-950 font-semibold"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {sl.name} ({formatDuration(sl.total_duration_seconds)})
            </button>
          ))}
        </div>
      )}

      {!activeSetlist ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-400">
          Create your first setlist above to start arranging songs.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Song Catalog Picker */}
          <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 h-fit">
            <h2 className="text-sm font-semibold text-zinc-200">
              Song Catalog (Click to Add)
            </h2>
            <div className="divide-y divide-zinc-800 max-h-[520px] overflow-y-auto">
              {songs
                .filter((s) => s.status !== "retired")
                .map((song) => (
                  <button
                    key={song.id}
                    onClick={() => addSongToSet(song)}
                    className="w-full py-2.5 px-2 flex items-center justify-between hover:bg-zinc-800/70 rounded text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-100">
                        {song.title}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {song.tuning || "Standard"}{" "}
                        {song.bpm ? `• ${song.bpm} BPM` : ""}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-amber-400">
                      + {formatDuration(song.duration_seconds)}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Right: Active Setlist Sequence */}
          <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-lg font-bold">{activeSetlist.name}</h2>
                <p className="text-xs text-zinc-400 font-mono">
                  {liveSongCount} songs • Total Runtime:{" "}
                  <span className="text-amber-400 font-bold text-sm">
                    {formatDuration(liveTotalSeconds)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStageMode(true)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" /> Stage
                  View
                </button>
                <button
                  onClick={handleSaveItems}
                  disabled={!dirty || saving}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />{" "}
                  {saving ? "Saving..." : "Save Order"}
                </button>
                <button
                  onClick={() => handleDeleteSetlist(activeSetlist)}
                  title="Delete setlist"
                  className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => addBreakOrNote("break")}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs cursor-pointer"
              >
                + Add Tuning / Talk Break
              </button>
              <button
                onClick={() => addBreakOrNote("note")}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs cursor-pointer"
              >
                + Add Stage Note
              </button>
            </div>

            {draftItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">
                Click songs on the left to build this setlist.
              </div>
            ) : (
              <div className="space-y-2">
                {draftItems.map((item, index) => (
                  <div
                    key={item.key}
                    className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                      item.item_type === "song"
                        ? "bg-zinc-950 border-zinc-800"
                        : "bg-amber-500/5 border-amber-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono text-xs text-zinc-500 w-5">
                        {index + 1}.
                      </span>
                      {item.item_type === "song" ? (
                        <div className="truncate">
                          <div className="font-medium text-sm truncate">
                            {item.song?.title}
                          </div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {formatDuration(item.custom_duration_seconds)}
                            {item.song?.tuning ? ` • ${item.song.tuning}` : ""}
                          </div>
                        </div>
                      ) : (
                        <input
                          value={item.custom_label}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftItems((prev) =>
                              prev.map((d, i) =>
                                i === index ? { ...d, custom_label: val } : d,
                              ),
                            );
                            setDirty(true);
                          }}
                          className="flex-1 bg-transparent border-b border-zinc-700 text-sm text-amber-300 focus:outline-none"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveItem(index, 1)}
                        disabled={index === draftItems.length - 1}
                        className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeItem(index)}
                        className="p-1 hover:bg-red-500/20 text-red-400 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
