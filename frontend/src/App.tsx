import React from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import {
  Calendar,
  LayoutDashboard,
  ListMusic,
  LogOut,
  Music,
  Users,
} from "lucide-react";
import { AppProvider, useApp } from "./context/AppContext";
import { BandSwitcher } from "./components/BandSwitcher";
import { SetupWizard } from "./pages/SetupWizard";
import { LoginPage } from "./pages/LoginPage";
import { JoinInvitePage } from "./pages/JoinInvitePage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { BandMembersPage } from "./pages/BandMembersPage";
import { SongsPage } from "./pages/SongsPage";
import { SetlistsPage } from "./pages/SetlistsPage";

const ProtectedShell: React.FC = () => {
  const { loading, status, user, activeBand, logout } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">
        Loading...
      </div>
    );
  }
  if (status && !status.initialized) {
    return <Navigate to="/setup" replace />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-64 bg-zinc-900/60 border-r border-zinc-800 p-4 flex flex-col justify-between">
        <div className="space-y-6">
          <BandSwitcher />
          <nav className="space-y-1 text-sm">
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <LayoutDashboard className="w-4 h-4 text-amber-400" /> Dashboard
            </Link>
            <Link
              to="/calendar"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <Calendar className="w-4 h-4 text-zinc-400" /> Calendar &
              Blackouts
            </Link>
            <Link
              to="/songs"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <Music className="w-4 h-4 text-zinc-400" /> Songs
            </Link>
            <Link
              to="/setlists"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <ListMusic className="w-4 h-4 text-zinc-400" /> Setlists
            </Link>
            <Link
              to="/members"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <Users className="w-4 h-4 text-zinc-400" /> Members & Invites
            </Link>
          </nav>
        </div>

        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <span className="truncate">{user.display_name}</span>
          <button
            onClick={logout}
            className="hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {!activeBand ? (
          <div className="text-zinc-400">
            You are not a member of any band yet. Use the top-left switcher to
            create one.
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
};

const SetupGuard: React.FC = () => {
  const { loading, status } = useApp();
  if (loading) return null;
  if (status?.initialized) return <Navigate to="/login" replace />;
  return <SetupWizard />;
};

const DashboardHome: React.FC = () => {
  const { activeBand } = useApp();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">{activeBand?.name} Dashboard</h1>
      <p className="text-sm text-zinc-400">
        Phase 1 foundation active • Home timezone:{" "}
        <span className="font-mono">{activeBand?.default_timezone}</span>
      </p>
    </div>
  );
};

const ComingSoon: React.FC<{ title: string }> = ({ title }) => (
  <div>
    <h1 className="text-2xl font-bold">{title}</h1>
    <p className="text-sm text-zinc-400 mt-1">
      Ready for Phase 2/3 vertical slice.
    </p>
  </div>
);

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupGuard />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join/:token" element={<JoinInvitePage />} />
          <Route
            path="/reset-password/:token"
            element={<ResetPasswordPage />}
          />
          <Route element={<ProtectedShell />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/members" element={<BandMembersPage />} />
            <Route
              path="/calendar"
              element={<ComingSoon title="Calendar & Blackouts" />}
            />
            <Route path="/songs" element={<SongsPage />} />
            <Route path="/setlists" element={<SetlistsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
