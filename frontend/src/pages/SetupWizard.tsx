import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Disc3, ArrowRight } from "lucide-react";
import { api, getBrowserTimezone, setToken } from "../api/client";
import { useApp } from "../context/AppContext";

export const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const { refreshSession } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Admin user
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: Band #1
  const [bandName, setBandName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeState, setHomeState] = useState("");
  const [instrumentRole, setInstrumentRole] = useState("");
  const [timezone] = useState(getBrowserTimezone());

  // Step 3: Optional Invite Link
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.setupInstance({
        display_name: displayName,
        email,
        password,
        band_name: bandName,
        home_city: homeCity || undefined,
        home_state: homeState || undefined,
        default_timezone: timezone,
        instrument_role: instrumentRole || undefined,
      });
      setToken(res.access_token);
      await refreshSession();

      // Pre-generate a convenient invite link for Step 3
      const bands = await api.listBands();
      if (bands[0]) {
        const inv = await api.createInvite(bands[0].id, { role: "member" });
        setInviteUrl(`${window.location.origin}/join/${inv.token}`);
      }
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
            <Disc3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Initial Server Setup
            </h1>
            <p className="text-sm text-zinc-400">Step {step} of 3</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold">1. Create Admin Account</h2>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Your Name
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Eric"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Password (min 8 chars)
              </label>
              <input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="w-full mt-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              Next: Band Profile <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleCompleteSetup} className="space-y-4">
            <h2 className="text-lg font-semibold">2. Create Your First Band</h2>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Band / Project Name
              </label>
              <input
                required
                value={bandName}
                onChange={(e) => setBandName(e.target.value)}
                placeholder="Soda City Riot"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-zinc-300 mb-1">
                  Home City
                </label>
                <input
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                  placeholder="Columbia"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-300 mb-1">
                  State / Region
                </label>
                <input
                  value={homeState}
                  onChange={(e) => setHomeState(e.target.value)}
                  placeholder="SC"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Your Role / Instrument (optional)
              </label>
              <input
                value={instrumentRole}
                onChange={(e) => setInstrumentRole(e.target.value)}
                placeholder="Drums"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
            <p className="text-xs text-zinc-400">
              Detected timezone:{" "}
              <span className="text-zinc-200 font-mono">{timezone}</span>
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Complete Setup"}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              3. Invite Your Bandmates (Optional)
            </h2>
            <p className="text-sm text-zinc-400">
              Drop this link in your band chat so members can create their login
              and join{" "}
              <span className="text-zinc-200 font-medium">{bandName}</span>{" "}
              immediately—no email server needed.
            </p>
            {inviteUrl && (
              <div className="flex items-center gap-2 p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 bg-transparent text-xs font-mono text-zinc-300 focus:outline-none"
                />
                <button
                  onClick={copyInvite}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg cursor-pointer"
            >
              Go to Band Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
