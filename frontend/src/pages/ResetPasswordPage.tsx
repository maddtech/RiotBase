import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";

export const ResetPasswordPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await api.resetPassword({ token, new_password: password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <h1 className="text-xl font-bold mb-4">Set New Password</h1>
        {error && (
          <div className="mb-3 p-3 bg-red-500/10 text-red-300 text-sm rounded-lg">
            {error}
          </div>
        )}
        {done ? (
          <p className="text-emerald-400 text-sm">
            Password updated! Redirecting to login...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              required
              minLength={8}
              type="password"
              placeholder="New password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg cursor-pointer"
            >
              Update Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
