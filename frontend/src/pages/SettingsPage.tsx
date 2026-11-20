import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  Download,
  RefreshCw,
  Send,
  Server,
  Upload,
} from "lucide-react";
import { api, type AdminSettings, type BandImportResult } from "../api/client";
import { useApp } from "../context/AppContext";

export const SettingsPage: React.FC = () => {
  const { activeBand, user, refreshSession } = useApp();
  const [copiedIcal, setCopiedIcal] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Band JSON Import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importRaw, setImportRaw] = useState<Record<string, any> | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [updateBandProfile, setUpdateBandProfile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<BandImportResult | null>(
    null,
  );
  const [importErr, setImportErr] = useState<string | null>(null);

  // Instance Admin BYOK Settings state
  const [adminCfg, setAdminCfg] = useState<AdminSettings | null>(null);
  const [publicSignup, setPublicSignup] = useState(false);
  const [googleKey, setGoogleKey] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user?.is_instance_admin) {
      api.getAdminSettings().then((cfg) => {
        setAdminCfg(cfg);
        setPublicSignup(cfg.allow_public_signup);
        setSmtpHost(cfg.smtp_host || "");
        setSmtpPort(cfg.smtp_port ? String(cfg.smtp_port) : "587");
        setSmtpUser(cfg.smtp_user || "");
        setSmtpFrom(cfg.smtp_from || "");
      });
    }
  }, [user?.is_instance_admin]);

  if (!activeBand) return null;

  const icalUrl = `${window.location.origin}/api/v1/ical/${activeBand.id}/${activeBand.ical_token}.ics`;

  const copyIcal = () => {
    navigator.clipboard.writeText(icalUrl);
    setCopiedIcal(true);
    setTimeout(() => setCopiedIcal(false), 2000);
  };

  const handleRotateIcal = async () => {
    if (
      !confirm(
        "Rotate the iCal feed URL? Existing calendar subscriptions will stop updating until re-added.",
      )
    )
      return;
    await api.rotateIcalToken(activeBand.id);
    await refreshSession();
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const data = await api.exportBandBackup(activeBand.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeBand.slug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleSelectImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setImportErr(null);
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          "Invalid JSON structure: expected a RiotBase backup object.",
        );
      }
      const hasKnownSection = [
        "songs",
        "setlists",
        "venues",
        "events",
        "blackouts",
      ].some((k) => Array.isArray(parsed[k]));
      if (!hasKnownSection) {
        throw new Error(
          "File does not contain valid RiotBase backup sections (songs, setlists, venues, events, or blackouts).",
        );
      }
      setImportRaw(parsed);
      setImportFileName(file.name);
    } catch (err: any) {
      setImportRaw(null);
      setImportFileName("");
      setImportErr(err.message || "Failed to parse JSON file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRunImport = async () => {
    if (!importRaw) return;
    if (
      importMode === "replace" &&
      !confirm(
        `Replace ALL existing songs, setlists, events, blackouts, and venue notes for ${activeBand.name}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setImporting(true);
    setImportErr(null);
    setImportResult(null);
    try {
      const res = await api.importBandBackup(activeBand.id, {
        mode: importMode,
        update_band_profile: updateBandProfile,
        data: importRaw,
      });
      setImportResult(res);
      setImportRaw(null);
      setImportFileName("");
      await refreshSession();
    } catch (err: any) {
      setImportErr(err.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleSaveAdminSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      const updated = await api.updateAdminSettings({
        allow_public_signup: publicSignup,
        ...(googleKey ? { google_places_api_key: googleKey } : {}),
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort || "587", 10),
        smtp_user: smtpUser,
        ...(smtpPass ? { smtp_pass: smtpPass } : {}),
        smtp_from: smtpFrom,
      });
      setAdminCfg(updated);
      setGoogleKey("");
      setSmtpPass("");
      await refreshSession();
      setMsg("Instance settings saved.");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleTestSmtp = async () => {
    setMsg(null);
    setErr(null);
    try {
      await api.testSmtp();
      setMsg(`Test email sent to ${user?.email}.`);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Calendar Sync, Backups & Settings
        </h1>
        <p className="text-sm text-zinc-400">
          Subscribe to {activeBand.name}'s outbound calendar feed, export band
          data, and manage optional server integrations.
        </p>
      </div>

      {/* 1. Outbound iCal Feed */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" /> Outbound iCal
            Subscription Feed (.ics)
          </h2>
          {activeBand.my_role === "admin" && (
            <button
              onClick={handleRotateIcal}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rotate URL
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          Add this private URL as a subscribed calendar in Apple Calendar,
          Google Calendar, or Outlook. Confirmed and hold gigs/rehearsals sync
          automatically without cluttering this app with your personal events.
        </p>
        <div className="flex items-center gap-2 p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg">
          <input
            readOnly
            value={icalUrl}
            className="flex-1 bg-transparent text-xs font-mono text-zinc-300"
          />
          <button
            onClick={copyIcal}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs flex items-center gap-1.5 cursor-pointer"
          >
            {copiedIcal ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedIcal ? "Copied" : "Copy URL"}
          </button>
        </div>
      </section>

      {/* 2. One-Click JSON Backup Export */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-base">Export Band Data Backup</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Download a portable JSON snapshot of all songs, setlists, events,
            blackouts, and private venue notes for {activeBand.name}.
          </p>
        </div>
        <button
          onClick={handleExportJson}
          disabled={exporting}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
        >
          <Download className="w-4 h-4 text-amber-400" />
          {exporting ? "Exporting..." : "Download JSON Backup"}
        </button>
      </section>

      {/* 2b. Band JSON Backup Import (Band Admins Only) */}
      {activeBand.my_role === "admin" && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-base">Import Band Data Backup</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Restore or merge songs, setlists, venues, events, and blackouts
                from a RiotBase JSON export into {activeBand.name}.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleSelectImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                Select JSON File
              </button>
            </div>
          </div>

          {importErr && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg">
              {importErr}
            </div>
          )}

          {importResult && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg space-y-1">
              <div className="font-semibold">
                Import complete (
                {importResult.mode === "merge" ? "Merged" : "Replaced"}):
              </div>
              <div>
                {importResult.counts.songs} songs,{" "}
                {importResult.counts.setlists} setlists,{" "}
                {importResult.counts.venues} venues,{" "}
                {importResult.counts.events} events,{" "}
                {importResult.counts.blackouts} blackouts
                {importResult.counts.skipped_blackouts > 0 &&
                  ` (${importResult.counts.skipped_blackouts} blackouts skipped — user not in band)`}
              </div>
            </div>
          )}

          {importRaw && (
            <div className="p-4 bg-zinc-950 border border-zinc-700 rounded-lg space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div>
                  <div className="text-xs font-mono text-amber-400">
                    {importFileName}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {importRaw.band?.name
                      ? `Source band: ${importRaw.band.name}`
                      : "RiotBase JSON Snapshot"}
                    {importRaw.exported_at_utc &&
                      ` • Exported ${new Date(importRaw.exported_at_utc).toLocaleString()}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImportRaw(null);
                    setImportFileName("");
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {/* Record Count Preview Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                {[
                  { label: "Songs", count: importRaw.songs?.length ?? 0 },
                  { label: "Setlists", count: importRaw.setlists?.length ?? 0 },
                  { label: "Venues", count: importRaw.venues?.length ?? 0 },
                  { label: "Events", count: importRaw.events?.length ?? 0 },
                  {
                    label: "Blackouts",
                    count: importRaw.blackouts?.length ?? 0,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg"
                  >
                    <div className="text-base font-bold text-zinc-100">
                      {stat.count}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Import Mode & Options */}
              <div className="space-y-2.5 text-xs">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "merge"}
                      onChange={() => setImportMode("merge")}
                      className="accent-amber-500"
                    />
                    <span>
                      <strong className="text-zinc-200">Merge / Upsert</strong>{" "}
                      <span className="text-zinc-400">
                        (Add new & update matching records)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                      className="accent-amber-500"
                    />
                    <span>
                      <strong className="text-zinc-200">Replace All</strong>{" "}
                      <span className="text-zinc-400">
                        (Wipe current band data first)
                      </span>
                    </span>
                  </label>
                </div>

                {importMode === "replace" && (
                  <div className="flex items-center gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-lg">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Replace mode deletes all existing songs, setlists, events,
                      blackouts, and private venue notes for {activeBand.name}{" "}
                      before importing.
                    </span>
                  </div>
                )}

                {importRaw.band && (
                  <label className="flex items-center gap-2 text-zinc-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={updateBandProfile}
                      onChange={(e) => setUpdateBandProfile(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Also update band city, state, and default timezone from
                    backup
                  </label>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRunImport}
                  disabled={importing}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
                >
                  {importing
                    ? "Importing..."
                    : importMode === "merge"
                      ? "Merge Into Band"
                      : "Replace & Restore Band"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. Instance Admin Optional BYOK Settings */}
      {user?.is_instance_admin && adminCfg && (
        <form
          onSubmit={handleSaveAdminSettings}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5"
        >
          <div>
            <h2 className="font-bold text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-400" /> Instance Admin
              Settings (Optional BYOK Integrations)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Everything works out of the box with zero keys. Add Google Places
              or SMTP credentials below only if desired.
            </p>
          </div>

          {msg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg">
              {msg}
            </div>
          )}
          {err && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg">
              {err}
            </div>
          )}

          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={publicSignup}
              onChange={(e) => setPublicSignup(e.target.checked)}
              className="accent-amber-500"
            />
            Allow open user registration without an invite link
          </label>

          <div className="border-t border-zinc-800 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Tier 3 Venue Lookup: Google Places API Key
              </label>
              <span className="text-xs font-mono text-zinc-500">
                {adminCfg.has_google_places_key
                  ? "Configured"
                  : "Not set (using Local DB + MusicBrainz/OSM)"}
              </span>
            </div>
            <input
              type="password"
              placeholder={
                adminCfg.has_google_places_key
                  ? "•••••••••••••••• (enter new key to replace)"
                  : "AIza..."
              }
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono"
            />
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Optional SMTP Server (Password Resets & Gig/Rehearsal Emails)
              </label>
              {adminCfg.smtp_host && (
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3 text-amber-400" /> Send Test Email
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <input
                  placeholder="SMTP Host (e.g. smtp.gmail.com)"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Port (587)"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="SMTP Username"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
              <input
                type="password"
                placeholder={
                  adminCfg.has_smtp_pass
                    ? "•••••••• (leave blank to keep)"
                    : "SMTP Password / App Password"
                }
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
              />
            </div>

            <input
              placeholder="From Address (e.g. Band Manager <noreply@yourdomain.com>)"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm cursor-pointer"
            >
              Save Instance Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
