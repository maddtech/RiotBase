import React, { useEffect, useState } from "react";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { api, formatDuration, type Song } from "../api/client";
import { useApp } from "../context/AppContext";

export const SongsPage: React.FC = () => {
  const { activeBand } = useApp();
  const [songs, setSongs] = useState<Song[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Song | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isCover, setIsCover] = useState(false);
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [tuning, setTuning] = useState("Standard E");
  const [mins, setMins] = useState("3");
  const [secs, setSecs] = useState("00");
  const [status, setStatus] = useState<"ready" | "learning" | "retired">(
    "ready",
  );
  const [notes, setNotes] = useState("");

  const loadSongs = async () => {
    if (!activeBand) return;
    const data = await api.listSongs(activeBand.id, {
      q: search || undefined,
      status: statusFilter || undefined,
    });
    setSongs(data);
  };

  useEffect(() => {
    loadSongs();
  }, [activeBand?.id, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setArtist("");
    setIsCover(false);
    setBpm("");
    setMusicalKey("");
    setTuning("Standard E");
    setMins("3");
    setSecs("00");
    setStatus("ready");
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (song: Song) => {
    setEditing(song);
    setTitle(song.title);
    setArtist(song.artist || "");
    setIsCover(song.is_cover);
    setBpm(song.bpm ? String(song.bpm) : "");
    setMusicalKey(song.musical_key || "");
    setTuning(song.tuning || "");
    setMins(String(Math.floor(song.duration_seconds / 60)));
    setSecs(String(song.duration_seconds % 60).padStart(2, "0"));
    setStatus(song.status);
    setNotes(song.lyrics_or_notes || "");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBand) return;
    const duration_seconds = Math.max(
      1,
      parseInt(mins || "0", 10) * 60 + parseInt(secs || "0", 10),
    );
    const payload = {
      title: title.trim(),
      artist: isCover ? artist.trim() || null : null,
      is_cover: isCover,
      bpm: bpm ? parseInt(bpm, 10) : null,
      musical_key: musicalKey.trim() || null,
      tuning: tuning.trim() || null,
      duration_seconds,
      status,
      lyrics_or_notes: notes.trim() || null,
    };

    if (editing) {
      await api.updateSong(activeBand.id, editing.id, payload);
    } else {
      await api.createSong(activeBand.id, payload);
    }
    setModalOpen(false);
    await loadSongs();
  };

  const handleDelete = async (song: Song) => {
    if (
      !activeBand ||
      !confirm(`Delete "${song.title}" from the song repository?`)
    )
      return;
    await api.deleteSong(activeBand.id, song.id);
    await loadSongs();
  };

  if (!activeBand) return null;

  const totalCatalogSeconds = songs.reduce(
    (acc, s) => acc + s.duration_seconds,
    0,
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Song Repository</h1>
          <p className="text-sm text-zinc-400">
            {songs.length} songs • Total catalog runtime:{" "}
            {formatDuration(totalCatalogSeconds)}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Song
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search songs or cover artists..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="ready">Stage Ready</option>
          <option value="learning">In Progress</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {/* Song Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {songs.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            No songs yet. Click{" "}
            <span className="text-zinc-200 font-medium">+ Add Song</span> to
            build your catalog.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/60 text-zinc-400 text-xs uppercase border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">BPM / Key / Tuning</th>
                <th className="py-3 px-3">Length</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {songs.map((song) => (
                <tr key={song.id} className="hover:bg-zinc-800/40">
                  <td className="py-3 px-4">
                    <div className="font-medium text-zinc-100">
                      {song.title}
                    </div>
                    {song.lyrics_or_notes && (
                      <div className="text-xs text-zinc-400 truncate max-w-md">
                        {song.lyrics_or_notes}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-xs text-zinc-300">
                    {song.is_cover
                      ? `Cover${song.artist ? ` (${song.artist})` : ""}`
                      : "Original"}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono text-zinc-300">
                    {[
                      song.bpm ? `${song.bpm} BPM` : null,
                      song.musical_key,
                      song.tuning,
                    ]
                      .filter(Boolean)
                      .join(" • ") || "—"}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs">
                    {formatDuration(song.duration_seconds)}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        song.status === "ready"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : song.status === "learning"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {song.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      onClick={() => openEdit(song)}
                      className="p-1.5 hover:bg-zinc-700 rounded text-zinc-300 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(song)}
                      className="p-1.5 hover:bg-red-500/20 rounded text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? "Edit Song" : "Add Song"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Song Title *
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCover}
                  onChange={(e) => setIsCover(e.target.checked)}
                  className="accent-amber-500"
                />
                Cover Song
              </label>
              {isCover && (
                <input
                  placeholder="Original Artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Duration (Min : Sec)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={mins}
                    onChange={(e) => setMins(e.target.value)}
                    className="w-full px-2 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono"
                  />
                  <span>:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={secs}
                    onChange={(e) => setSecs(e.target.value)}
                    className="w-full px-2 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">BPM</label>
                <input
                  type="number"
                  min={20}
                  max={400}
                  placeholder="165"
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Key</label>
                <input
                  placeholder="E minor"
                  value={musicalKey}
                  onChange={(e) => setMusicalKey(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Tuning
                </label>
                <input
                  placeholder="Standard E / Drop D"
                  value={tuning}
                  onChange={(e) => setTuning(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
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
                  <option value="ready">Stage Ready</option>
                  <option value="learning">In Progress</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Stage Notes / Intro Cue / Lyrics
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Drum count-in on hi-hat, guitar feedback intro..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 rounded-lg text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
              >
                Save Song
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
