import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  Calendar,
  LayoutDashboard,
  ListMusic,
  LogOut,
  MapPin,
  Menu,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  X,
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
import { CalendarPage } from "./pages/CalendarPage";
import { VenuesPage } from "./pages/VenuesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";

interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  quickNav?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    quickNav: true,
  },
  {
    to: "/calendar",
    label: "Calendar & Blackouts",
    shortLabel: "Calendar",
    icon: Calendar,
    quickNav: true,
  },
  {
    to: "/setlists",
    label: "Setlists",
    shortLabel: "Setlists",
    icon: ListMusic,
    quickNav: true,
  },
  {
    to: "/venues",
    label: "Venues",
    shortLabel: "Venues",
    icon: MapPin,
    quickNav: true,
  },
  {
    to: "/songs",
    label: "Songs",
    shortLabel: "Songs",
    icon: Music,
  },
  {
    to: "/members",
    label: "Members & Invites",
    shortLabel: "Members",
    icon: Users,
  },
  {
    to: "/settings",
    label: "Sync & Settings",
    shortLabel: "Settings",
    icon: Settings,
  },
];

const ProtectedShell: React.FC = () => {
  const { loading, status, user, activeBand, logout } = useApp();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("riotbase.sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("riotbase.sidebarCollapsed", String(collapsed));
    } catch {
      // Ignore storage errors
    }
  }, [collapsed]);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

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

  const quickNavItems = NAV_ITEMS.filter((item) => item.quickNav);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      {/* Mobile Sticky Top Header */}
      <header className="md:hidden sticky top-0 z-30 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          className="p-2 -ml-2 rounded-lg text-zinc-300 hover:bg-zinc-800 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-zinc-100 truncate">
            {activeBand?.name || "RiotBase"}
          </div>
          <div className="text-[11px] text-zinc-400 truncate">
            {NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label ||
              "Band Manager"}
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          title="Logout"
          className="p-2 -mr-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
          />
          <aside className="relative w-72 max-w-[82vw] bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col justify-between z-10 overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  RiotBase
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <BandSwitcher />

              <nav className="space-y-1 text-sm">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                          isActive
                            ? "bg-amber-500/15 text-amber-300 font-medium"
                            : "text-zinc-300 hover:bg-zinc-800"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? "text-amber-400" : "text-zinc-400"
                            }`}
                          />
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 mt-6 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
              <span className="truncate">{user.display_name}</span>
              <button
                onClick={logout}
                className="hover:text-zinc-200 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden md:flex shrink-0 bg-zinc-900/60 border-r border-zinc-800 flex-col justify-between transition-all duration-200 ${
          collapsed ? "w-16 p-2.5" : "w-64 p-4"
        }`}
      >
        <div className="space-y-5">
          <div
            className={`flex items-center ${
              collapsed ? "justify-center" : "justify-between px-1"
            }`}
          >
            {!collapsed && (
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                RiotBase
              </span>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          <BandSwitcher collapsed={collapsed} />

          <nav className="space-y-1 text-sm">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg transition-colors ${
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
                    } ${
                      isActive
                        ? "bg-amber-500/15 text-amber-300 font-medium"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? "text-amber-400" : "text-zinc-400"
                        }`}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div
          className={`pt-4 border-t border-zinc-800 flex items-center text-xs text-zinc-400 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && <span className="truncate">{user.display_name}</span>}
          <button
            onClick={logout}
            title="Logout"
            className="hover:text-zinc-200 flex items-center gap-1 p-1.5 rounded hover:bg-zinc-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area (extra bottom padding on mobile for quick-nav bar) */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 overflow-y-auto">
        {!activeBand ? (
          <div className="text-zinc-400">
            You are not a member of any band yet. Use the band switcher to
            create one.
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Mobile Bottom Quick-Nav Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 grid grid-cols-4">
        {quickNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2.5 gap-1 text-[11px] ${
                  isActive
                    ? "text-amber-400 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.shortLabel}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

const SetupGuard: React.FC = () => {
  const { loading, status } = useApp();
  if (loading) return null;
  if (status?.initialized) return <Navigate to="/login" replace />;
  return <SetupWizard />;
};

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
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/members" element={<BandMembersPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/venues" element={<VenuesPage />} />
            <Route path="/songs" element={<SongsPage />} />
            <Route path="/setlists" element={<SetlistsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
