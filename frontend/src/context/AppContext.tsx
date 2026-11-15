import React, { createContext, useContext, useEffect, useState } from "react";
import {
  api,
  clearToken,
  getToken,
  type Band,
  type SystemStatus,
  type User,
} from "../api/client";

interface AppContextType {
  loading: boolean;
  status: SystemStatus | null;
  user: User | null;
  bands: Band[];
  activeBand: Band | null;
  setActiveBandId: (id: string) => void;
  refreshSession: () => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const ACTIVE_BAND_KEY = "band_manager_active_band";

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [activeBandId, setActiveBandIdState] = useState<string | null>(
    localStorage.getItem(ACTIVE_BAND_KEY),
  );

  const setActiveBandId = (id: string) => {
    localStorage.setItem(ACTIVE_BAND_KEY, id);
    setActiveBandIdState(id);
  };

  const refreshSession = async () => {
    setLoading(true);
    try {
      const sysStatus = await api.getSystemStatus();
      setStatus(sysStatus);

      if (sysStatus.initialized && getToken()) {
        const [me, myBands] = await Promise.all([api.getMe(), api.listBands()]);
        setUser(me);
        setBands(myBands);
        if (myBands.length > 0 && !myBands.some((b) => b.id === activeBandId)) {
          setActiveBandId(myBands[0].id);
        }
      } else {
        setUser(null);
        setBands([]);
      }
    } catch {
      setUser(null);
      setBands([]);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearToken();
    localStorage.removeItem(ACTIVE_BAND_KEY);
    setUser(null);
    setBands([]);
    setActiveBandIdState(null);
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const activeBand =
    bands.find((b) => b.id === activeBandId) || bands[0] || null;

  return (
    <AppContext.Provider
      value={{
        loading,
        status,
        user,
        bands,
        activeBand,
        setActiveBandId,
        refreshSession,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};
