import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Disc3 } from "lucide-react";
import { api, setToken } from "../api/client";
import { useApp } from "../context/AppContext";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { status, refreshSession } = useApp();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({ display_name: displayName, email, password });
      setToken(res.access_token);
      await refreshSession();
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Disc3 className="w-7 h-7 text-amber-400" />
          <h1 className="text-xl font-bold">
            {mode === "login" ? "Sign In" : "Create Account"}
          </h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Display Name
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Password</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg cursor-pointer disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : "Register"}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-zinc-800 text-xs text-zinc-400 space-y-2">
          {status?.public_signup_enabled && (
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-amber-400 hover:underline block cursor-pointer"
            >
              {mode === "login"
                ? "Need an account? Register here"
                : "Already have an account? Sign in"}
            </button>
          )}
          <p>
            Forgot your password? Ask your Band Admin for a one-time reset link.
          </p>
        </div>
      </div>
    </div>
  );
};
