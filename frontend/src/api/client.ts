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

export interface VenueCandidate {
  local_venue_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  website: string | null;
  external_source: "local" | "musicbrainz" | "osm" | "google";
  external_id: string | null;
}

export interface Venue extends VenueCandidate {
  id: string;
  booking_contact: string | null;
  load_in_notes: string | null;
  payout_notes: string | null;
}

export interface BandEvent {
  id: string;
  band_id: string;
  venue_id: string | null;
  setlist_id: string | null;
  event_type: "gig" | "rehearsal";
  title: string;
  status: "hold" | "confirmed" | "canceled";
  start_at_utc: string;
  end_at_utc: string | null;
  timezone: string;
  load_in_time: string | null;
  soundcheck_time: string | null;
  notes: string | null;
  flyer_filename: string | null;
  flyer_content_type: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  setlist_name: string | null;
}

export interface Blackout {
  id: string;
  band_id: string;
  user_id: string;
  user_display_name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface AdminSettings {
  allow_public_signup: boolean;
  has_google_places_key: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  has_smtp_pass: boolean;
  smtp_from: string | null;
}

export interface BandImportResult {
  status: string;
  mode: "merge" | "replace";
  counts: {
    songs: number;
    setlists: number;
    venues: number;
    events: number;
    blackouts: number;
    skipped_blackouts: number;
  };
}

export function formatEventTime(utcIso: string, venueTimezone: string): {
  venueDisplay: string;
  localDiffers: boolean;
  userDisplay: string;
} {
  const normalizedIso =
    utcIso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(utcIso) ? utcIso : `${utcIso}Z`;
  const date = new Date(normalizedIso);
  const browserTz = getBrowserTimezone();

  const venueDisplay = new Intl.DateTimeFormat("en-US", {
    timeZone: venueTimezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  const userDisplay = new Intl.DateTimeFormat("en-US", {
    timeZone: browserTz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  return {
    venueDisplay,
    localDiffers: browserTz !== venueTimezone,
    userDisplay,
  };
}

export function toLocalDateTimeInput(utcIso: string, venueTimezone: string): string {
  const normalizedIso =
    utcIso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(utcIso) ? utcIso : `${utcIso}Z`;
  const date = new Date(normalizedIso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: venueTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
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

  searchVenues: (bandId: string, q: string) =>
    request<VenueCandidate[]>(`/bands/${bandId}/venues/search?q=${encodeURIComponent(q)}`),

  listVenues: (bandId: string) => request<Venue[]>(`/bands/${bandId}/venues`),

  saveVenue: (bandId: string, data: Partial<VenueCandidate> & {
    name: string;
    booking_contact?: string;
    load_in_notes?: string;
    payout_notes?: string;
  }) => request<Venue>(`/bands/${bandId}/venues`, { method: "POST", body: JSON.stringify(data) }),

  listEvents: (bandId: string) => request<BandEvent[]>(`/bands/${bandId}/events`),

  createEvent: (
    bandId: string,
    data: {
      event_type: "gig" | "rehearsal";
      title: string;
      status: "hold" | "confirmed" | "canceled";
      venue_id?: string | null;
      setlist_id?: string | null;
      local_start: string;
      local_end?: string | null;
      timezone: string;
      load_in_time?: string;
      soundcheck_time?: string;
      notes?: string;
    }
  ) => request<BandEvent>(`/bands/${bandId}/events`, { method: "POST", body: JSON.stringify(data) }),

  deleteEvent: (bandId: string, eventId: string) =>
    request<void>(`/bands/${bandId}/events/${eventId}`, { method: "DELETE" }),

  uploadEventFlyer: async (bandId: string, eventId: string, file: File): Promise<BandEvent> => {
    const token = getToken();
    const headers: Record<string, string> = {
      "X-Timezone": getBrowserTimezone(),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`/api/v1/bands/${bandId}/events/${eventId}/flyer`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401 && token) {
        clearToken();
      }
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Flyer upload failed (${res.status})`);
    }
    return res.json();
  },

  deleteEventFlyer: (bandId: string, eventId: string) =>
    request<BandEvent>(`/bands/${bandId}/events/${eventId}/flyer`, { method: "DELETE" }),

  fetchEventFlyerBlob: async (bandId: string, eventId: string): Promise<Blob> => {
    const token = getToken();
    const headers: Record<string, string> = {
      "X-Timezone": getBrowserTimezone(),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/v1/bands/${bandId}/events/${eventId}/flyer`, {
      headers,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Failed to load flyer (${res.status})`);
    }
    return res.blob();
  },

  listBlackouts: (bandId: string) => request<Blackout[]>(`/bands/${bandId}/blackouts`),

  createBlackout: (bandId: string, data: { start_date: string; end_date: string; reason?: string }) =>
    request<Blackout>(`/bands/${bandId}/blackouts`, { method: "POST", body: JSON.stringify(data) }),

  deleteBlackout: (bandId: string, blackoutId: string) =>
    request<void>(`/bands/${bandId}/blackouts/${blackoutId}`, { method: "DELETE" }),  

  rotateIcalToken: (bandId: string) =>
    request<{ ical_token: string }>(`/bands/${bandId}/ical/rotate`, { method: "POST" }),

  exportBandBackup: (bandId: string) => request<Record<string, unknown>>(`/bands/${bandId}/export`),

  importBandBackup: (
    bandId: string,
    payload: {
      mode: "merge" | "replace";
      update_band_profile: boolean;
      data: Record<string, unknown>;
    },
  ) =>
    request<BandImportResult>(`/bands/${bandId}/import`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  notifyEventMembers: (bandId: string, eventId: string) =>
    request<{ sent_to_count: number }>(`/bands/${bandId}/events/${eventId}/notify`, { method: "POST" }),

  forgotPassword: (email: string) =>
    request<{ detail: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  getAdminSettings: () => request<AdminSettings>("/admin/settings"),

  updateAdminSettings: (data: {
    allow_public_signup?: boolean;
    google_places_api_key?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_user?: string;
    smtp_pass?: string;
    smtp_from?: string;
  }) => request<AdminSettings>("/admin/settings", { method: "PATCH", body: JSON.stringify(data) }),

  testSmtp: () => request<{ status: string }>("/admin/settings/test-smtp", { method: "POST" }),

  updateEvent: (
    bandId: string,
    eventId: string,
    data: {
      event_type?: "gig" | "rehearsal";
      title?: string;
      status?: "hold" | "confirmed" | "canceled";
      venue_id?: string | null;
      setlist_id?: string | null;
      local_start?: string;
      local_end?: string | null;
      timezone?: string;
      load_in_time?: string | null;
      soundcheck_time?: string | null;
      notes?: string | null;
    }
  ) => request<BandEvent>(`/bands/${bandId}/events/${eventId}`, { method: "PATCH", body: JSON.stringify(data) }),
};