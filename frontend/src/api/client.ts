export interface InvitePreview {
  band_name: string;
  home_city: string | null;
  home_state: string | null;
  role: "admin" | "member";
}

export interface SystemStatus {
  initialized: boolean;
  public_signup_enabled: boolean;
  smtp_enabled: boolean;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  preferred_timezone: string | null;
  is_instance_admin: boolean;
}

export interface Band {
  id: string;
  name: string;
  slug: string;
  home_city: string | null;
  home_state: string | null;
  default_timezone: string;
  ical_token: string;
  my_role: "admin" | "member";
}

export interface BandMember {
  user_id: string;
  display_name: string;
  email: string;
  role: "admin" | "member";
  instrument_role: string | null;
  joined_at: string;
}

export interface Invite {
  id: string;
  token: string;
  role: "admin" | "member";
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
}

export interface Song {
  id: string;
  band_id: string;
  title: string;
  artist: string | null;
  is_cover: boolean;
  bpm: number | null;
  musical_key: string | null;
  tuning: string | null;
  duration_seconds: number;
  status: "ready" | "learning" | "retired";
  lyrics_or_notes: string | null;
  created_at: string;
}

export interface SetlistItem {
  id?: string;
  position: number;
  item_type: "song" | "break" | "note";
  song_id: string | null;
  custom_label: string | null;
  custom_duration_seconds: number | null;
  song?: Song | null;
}

export interface Setlist {
  id: string;
  band_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  total_duration_seconds: number;
  song_count: number;
  items: SetlistItem[];
}

export function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const TOKEN_KEY = "band_manager_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Timezone": getBrowserTimezone(),
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`/api/v1${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearToken();
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `Request failed (${res.status})`);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export const api = {
  getSystemStatus: () => request<SystemStatus>("/system/status"),

  setupInstance: (data: {
    display_name: string;
    email: string;
    password: string;
    band_name: string;
    home_city?: string;
    home_state?: string;
    default_timezone: string;
    instrument_role?: string;
  }) => request<{ access_token: string }>("/setup", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  register: (data: {
    display_name: string;
    email: string;
    password: string;
    invite_token?: string;
  }) => request<{ access_token: string }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  resetPassword: (data: { token: string; new_password: string }) =>
    request<void>("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),

  getMe: () => request<User>("/auth/me"),

  listBands: () => request<Band[]>("/bands"),

  createBand: (data: {
    name: string;
    home_city?: string;
    home_state?: string;
    default_timezone: string;
    instrument_role?: string;
  }) => request<Band>("/bands", { method: "POST", body: JSON.stringify(data) }),

  listMembers: (bandId: string) => request<BandMember[]>(`/bands/${bandId}/members`),

  updateMember: (bandId: string, userId: string, data: { role: "admin" | "member"; instrument_role?: string }) =>
    request<BandMember>(`/bands/${bandId}/members/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),

  createInvite: (bandId: string, data: { role: "admin" | "member"; expires_in_hours?: number }) =>
    request<Invite>(`/bands/${bandId}/invites`, { method: "POST", body: JSON.stringify(data) }),

  previewInvite: (token: string) => request<InvitePreview>(`/invites/${token}`),

  acceptInvite: (token: string) => request<Band>(`/invites/${token}/accept`, { method: "POST" }),

  generateResetLink: (bandId: string, userId: string) =>
    request<{ reset_url: string; expires_in_hours: number }>(`/bands/${bandId}/members/${userId}/reset-link`, {
      method: "POST",
    }),

  listSongs: (bandId: string, params?: { q?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.status) query.set("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request<Song[]>(`/bands/${bandId}/songs${qs}`);
  },

  createSong: (bandId: string, data: Partial<Song> & { title: string }) =>
    request<Song>(`/bands/${bandId}/songs`, { method: "POST", body: JSON.stringify(data) }),

  updateSong: (bandId: string, songId: string, data: Partial<Song>) =>
    request<Song>(`/bands/${bandId}/songs/${songId}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteSong: (bandId: string, songId: string) =>
    request<void>(`/bands/${bandId}/songs/${songId}`, { method: "DELETE" }),

  listSetlists: (bandId: string) => request<Setlist[]>(`/bands/${bandId}/setlists`),

  createSetlist: (bandId: string, data: { name: string; notes?: string }) =>
    request<Setlist>(`/bands/${bandId}/setlists`, { method: "POST", body: JSON.stringify(data) }),

  getSetlist: (bandId: string, setlistId: string) =>
    request<Setlist>(`/bands/${bandId}/setlists/${setlistId}`),

  updateSetlist: (bandId: string, setlistId: string, data: { name?: string; notes?: string }) =>
    request<Setlist>(`/bands/${bandId}/setlists/${setlistId}`, { method: "PATCH", body: JSON.stringify(data) }),

  saveSetlistItems: (
    bandId: string,
    setlistId: string,
    items: Array<{
      song_id?: string | null;
      item_type: "song" | "break" | "note";
      custom_label?: string | null;
      custom_duration_seconds?: number | null;
    }>
  ) =>
    request<Setlist>(`/bands/${bandId}/setlists/${setlistId}/items`, {
      method: "PUT",
      body: JSON.stringify(items),
    }),

  deleteSetlist: (bandId: string, setlistId: string) =>
    request<void>(`/bands/${bandId}/setlists/${setlistId}`, { method: "DELETE" }),
};