import React, { useEffect, useState } from "react";
import { Copy, KeyRound, Link2, Shield } from "lucide-react";
import { api, type BandMember } from "../api/client";
import { useApp } from "../context/AppContext";

export const BandMembersPage: React.FC = () => {
  const { activeBand, user } = useApp();
  const [members, setMembers] = useState<BandMember[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = async () => {
    if (!activeBand) return;
    const list = await api.listMembers(activeBand.id);
    setMembers(list);
  };

  useEffect(() => {
    setInviteUrl(null);
    setResetUrl(null);
    setError(null);
    loadMembers();
  }, [activeBand?.id]);

  if (!activeBand) return null;
  const isAdmin = activeBand.my_role === "admin";

  const handleGenerateInvite = async (role: "member" | "admin") => {
    const inv = await api.createInvite(activeBand.id, { role });
    setInviteUrl(`${window.location.origin}/join/${inv.token}`);
  };

  const handleToggleRole = async (member: BandMember) => {
    setError(null);
    try {
      const nextRole = member.role === "admin" ? "member" : "admin";
      await api.updateMember(activeBand.id, member.user_id, { role: nextRole });
      await loadMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetLink = async (member: BandMember) => {
    const res = await api.generateResetLink(activeBand.id, member.user_id);
    setResetUrl(res.reset_url);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Band Members & Invites</h1>
        <p className="text-sm text-zinc-400">
          Manage roster permissions and invite links for {activeBand.name}.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-sm text-zinc-200">
            Generate Invite Link
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleGenerateInvite("member")}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-sm flex items-center gap-2 cursor-pointer"
            >
              <Link2 className="w-4 h-4" /> Create Member Invite
            </button>
            <button
              onClick={() => handleGenerateInvite("admin")}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
            >
              <Shield className="w-4 h-4" /> Create Co-Admin Invite
            </button>
          </div>
          {inviteUrl && (
            <div className="flex items-center gap-2 p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 bg-transparent text-xs font-mono text-zinc-300"
              />
              <button
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="px-2.5 py-1 bg-zinc-800 rounded text-xs flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          )}
        </div>
      )}

      {resetUrl && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-amber-300">
            One-Time Password Reset Link (expires in 24h — send privately to
            member):
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={resetUrl}
              className="flex-1 bg-zinc-950 px-2.5 py-1.5 rounded text-xs font-mono"
            />
            <button
              onClick={() => navigator.clipboard.writeText(resetUrl)}
              className="px-3 py-1.5 bg-zinc-800 rounded text-xs cursor-pointer"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="p-4 flex items-center justify-between gap-4"
          >
            <div>
              <div className="font-medium flex items-center gap-2">
                {m.display_name}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    m.role === "admin"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {m.role}
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                {m.email} {m.instrument_role ? `• ${m.instrument_role}` : ""}
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleRole(m)}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs cursor-pointer"
                >
                  {m.role === "admin" ? "Demote to Member" : "Make Admin"}
                </button>
                {m.user_id !== user?.id && (
                  <button
                    onClick={() => handleResetLink(m)}
                    title="Generate one-time password reset link"
                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Reset PW
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
