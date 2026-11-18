"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { API_URL, api, getToken } from "./api";
import type { Config, Patient, StaffBrief } from "./types";

function subscribeAuth(cb: () => void) {
  window.addEventListener("mc-auth", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("mc-auth", cb);
    window.removeEventListener("storage", cb);
  };
}

/** Token hiện tại (undefined khi đang render phía server). */
export function useToken(kind: "patient" | "staff"): string | null | undefined {
  return useSyncExternalStore(subscribeAuth, () => getToken(kind), () => undefined);
}

/** Lấy hồ sơ của token hiện tại. Kết quả gắn với token nên đổi tài khoản thì tự hết hiệu lực. */
function useMe<T>(kind: "patient" | "staff", path: string) {
  const token = useToken(kind);
  const [state, setState] = useState<{ token: string; data: T | null } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    api<T>(path, { auth: kind })
      .then((d) => alive && setState({ token, data: d }))
      .catch(() => alive && setState({ token, data: null }));
    return () => {
      alive = false;
    };
  }, [token, kind, path, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const fresh = state && state.token === token;
  return {
    data: token && fresh ? state.data : null,
    loading: token === undefined || (!!token && !fresh),
    reload,
    token,
  };
}

export function usePatient() {
  const { data, loading, reload, token } = useMe<Patient>("patient", "/api/auth/patient/me");
  return { patient: data, loading, reload, token };
}

export function useStaff() {
  const { data, loading, token } = useMe<StaffBrief>("staff", "/api/auth/staff/me");
  return { staff: data, loading, token };
}

let configCache: Config | null = null;
export function useConfig(): Config | null {
  const [cfg, setCfg] = useState<Config | null>(configCache);
  useEffect(() => {
    if (configCache) return;
    api<Config>("/api/public/config").then((c) => {
      configCache = c;
      setCfg(c);
    }).catch(() => {});
  }, []);
  return cfg;
}

/** Nghe Server-Sent Events. handlers: { tên_sự_kiện: (data) => void } */
export function useEvents(path: string | null, handlers: Record<string, (data: Record<string, unknown>) => void>) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    if (!path) return;
    const es = new EventSource(`${API_URL}${path}`);
    const names = Object.keys(ref.current);
    const listeners = names.map((n) => {
      const fn = (e: MessageEvent) => {
        try {
          ref.current[n]?.(JSON.parse(e.data));
        } catch {
          /* bỏ qua */
        }
      };
      es.addEventListener(n, fn as EventListener);
      return [n, fn] as const;
    });
    return () => {
      listeners.forEach(([n, fn]) => es.removeEventListener(n, fn as EventListener));
      es.close();
    };
  }, [path]);
}

export function useStaffEvents(handlers: Record<string, (data: Record<string, unknown>) => void>) {
  const token = useToken("staff");
  useEvents(token ? `/api/events?token=${encodeURIComponent(token)}` : null, handlers);
}

/** Đồng hồ: cập nhật mỗi giây. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Gọi lại fn theo chu kỳ khi tab đang mở. */
export function usePoll(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}
