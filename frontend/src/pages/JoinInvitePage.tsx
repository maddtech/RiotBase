import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setToken, type InvitePreview } from "../api/client";
import { useApp } from "../context/AppContext";

export const JoinInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, refreshSession, setActiveBandId } = useApp();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .previewInvite(token)
      .then(setPreview)
      .catch((err) => setError(err.message));
  }, [token]);

  const handleJoinLoggedIn = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const band = await api.acceptInvite(token);
      await refreshSession();
      setActiveBandId(band.id);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterAndJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.register({
        display_name: displayName,
        email,
        password,
        invite_token: token,
      });
      setToken(res.access_token);
      await refreshSession();
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        {error ? (
          <div className="text-red-300 text-sm">{error}</div>
        ) : !preview ? (
          <div className="text-zinc-400 text-sm">Loading invite...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold">
                Band Invite
              </p>
              <h1 className="text-2xl font-bold mt-1">{preview.band_name}</h1>
              {(preview.home_city || preview.home_state) && (
                <p className="text-sm text-zinc-400">
                  {[preview.home_city, preview.home_state]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>

            {user ? (
              <button
                onClick={handleJoinLoggedIn}
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg cursor-pointer"
              >
                {submitting ? "Joining..." : `Join as ${user.display_name}`}
              </button>
            ) : (
              <form onSubmit={handleRegisterAndJoin} className="space-y-3">
                <input
                  required
                  placeholder="Your Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
                />
                <input
                  required
                  minLength={8}
                  type="password"
                  placeholder="Create Password (min 8 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg cursor-pointer"
                >
                  {submitting ? "Joining..." : "Create Account & Join Band"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
