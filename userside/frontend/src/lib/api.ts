// Typed client for the FastAPI backend (/api, proxied by Vite in development).

export type Company = {
  id: number;
  name: string;
  business_info: string;
  max_concurrent_calls: number;
  call_window_start: number;
  call_window_end: number;
};
export type User = { id: number; name: string; email: string };
export type Session = { token: string; user: User; company: Company };

export type CampaignStatus = "draft" | "running" | "paused" | "completed";
export type Campaign = {
  id: number;
  name: string;
  opening_message: string;
  instructions: string;
  status: CampaignStatus;
  created_at: string;
  counts: Record<string, number>;
  notice: string; // why a running campaign is not calling right now
};

export type ContactStatus =
  | "pending"
  | "dialing"
  | "in_progress"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed"
  | "skipped_dnd";
export type Turn = { user: string; agent: string };
export type Contact = {
  id: number;
  phone: string;
  name: string;
  status: ContactStatus;
  attempts: number;
  duration_seconds: number;
  error: string;
  transcript: Turn[];
  updated_at: string;
};
export type ImportResult = { added: number; duplicates: number; invalid: number; invalid_samples: string[] };
export type Dnd = { id: number; phone: string; reason: string; created_at: string };
export type Stats = {
  campaigns: number;
  running_campaigns: number;
  contacts: number;
  by_status: Record<string, number>;
  talk_seconds: number;
  in_call_window: boolean;
  dialer: { enabled: boolean; dial_mode: string; max_global_calls: number; last_error: string };
};

export type ActivityDay = { date: string; answered: number; not_reached: number };
export type CallLog = Contact & { campaign_id: number; campaign_name: string; called_at: string | null };
export type CallPage = { total: number; items: CallLog[] };

const TOKEN_KEY = "voicellm_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: stay logged in for this tab only */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// a 401 anywhere means the session is gone; AuthProvider listens for this
export const UNAUTHORIZED_EVENT = "voicellm:unauthorized";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, errorMessage(data) || `Request failed (${res.status})`);
  }
  return data as T;
}

function errorMessage(data: { detail?: unknown }): string {
  const d = data?.detail;
  if (typeof d === "string") return d;
  // FastAPI validation errors: [{loc, msg}]
  if (Array.isArray(d) && d.length) {
    const first = d[0] as { loc?: string[]; msg?: string };
    const field = first.loc?.[first.loc.length - 1];
    return `${field ? field.replace(/_/g, " ") + ": " : ""}${(first.msg || "").replace(/^Value error, /, "")}`;
  }
  return "";
}

export const api = {
  register: (b: { company_name: string; name: string; email: string; password: string }) =>
    request<Session>("POST", "/auth/register", b),
  login: (b: { email: string; password: string }) => request<Session>("POST", "/auth/login", b),
  me: () => request<Session>("GET", "/auth/me"),

  company: () => request<Company>("GET", "/company"),
  updateCompany: (b: Partial<Omit<Company, "id">>) => request<Company>("PATCH", "/company", b),
  stats: () => request<Stats>("GET", "/company/stats"),
  dnd: () => request<Dnd[]>("GET", "/company/dnd"),
  addDnd: (phone: string) => request<Dnd>("POST", "/company/dnd", { phone }),
  deleteDnd: (id: number) => request<void>("DELETE", `/company/dnd/${id}`),

  campaigns: () => request<Campaign[]>("GET", "/campaigns"),
  campaign: (id: number) => request<Campaign>("GET", `/campaigns/${id}`),
  createCampaign: (b: { name: string; opening_message: string; instructions: string }) =>
    request<Campaign>("POST", "/campaigns", b),
  updateCampaign: (id: number, b: Partial<Pick<Campaign, "name" | "opening_message" | "instructions">>) =>
    request<Campaign>("PATCH", `/campaigns/${id}`, b),
  deleteCampaign: (id: number) => request<void>("DELETE", `/campaigns/${id}`),
  startCampaign: (id: number) => request<Campaign>("POST", `/campaigns/${id}/start`),
  pauseCampaign: (id: number) => request<Campaign>("POST", `/campaigns/${id}/pause`),
  retryCampaign: (id: number) => request<Campaign>("POST", `/campaigns/${id}/retry`),

  contacts: (id: number) => request<Contact[]>("GET", `/campaigns/${id}/contacts?limit=5000`),
  addContacts: (id: number, phones: string) => request<ImportResult>("POST", `/campaigns/${id}/contacts`, { phones }),
  uploadContacts: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportResult>("POST", `/campaigns/${id}/upload`, form);
  },
  deleteContact: (id: number, contactId: number) => request<void>("DELETE", `/campaigns/${id}/contacts/${contactId}`),
  clearPending: (id: number) => request<void>("DELETE", `/campaigns/${id}/contacts`),

  activity: (days = 14) => request<ActivityDay[]>("GET", `/company/activity?days=${days}`),
  calls: (p: { q?: string; status?: string; campaign_id?: number; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return request<CallPage>("GET", `/calls?${qs}`);
  },
  /** Downloads the campaign results as CSV (needs the auth header, so no plain link). */
  exportCsv: async (id: number) => {
    const res = await fetch(`/api/campaigns/${id}/export.csv`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError(res.status, "Could not export the results");
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "results.csv";
    downloadBlob(await res.blob(), name);
  },
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
