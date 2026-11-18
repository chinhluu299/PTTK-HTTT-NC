export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Auth = "patient" | "staff" | "none";

const TOKEN_KEY = { patient: "mc.patient.token", staff: "mc.staff.token" } as const;

export function getToken(kind: "patient" | "staff"): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY[kind]);
  } catch {
    return null;
  }
}

export function setToken(kind: "patient" | "staff", token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY[kind], token);
    else localStorage.removeItem(TOKEN_KEY[kind]);
  } catch {
    /* trình duyệt chặn storage */
  }
  window.dispatchEvent(new Event("mc-auth"));
}

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  auth?: Auth;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = opts.body || opts.form ? "POST" : "GET", body, form, auth = "none", signal } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth !== "none") {
    const t = getToken(auth);
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.");
  }
  if (res.status === 401 && auth !== "none") {
    setToken(auth, null);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    const msg = typeof detail === "string" ? detail : "Có lỗi xảy ra, vui lòng thử lại.";
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Có lỗi xảy ra";
}
