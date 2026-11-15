import React, { useEffect, useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Download,
  RefreshCw,
  Send,
  Server,
} from "lucide-react";
import { api, type AdminSettings } from "../api/client";
import { useApp } from "../context/AppContext";

export const SettingsPage: React.FC = () => {
  const { activeBand, user, refreshSession } = useApp();
  const [copiedIcal, setCopiedIcal] = useState(false);
  const [exporting, setExporting] = useState(false);

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
