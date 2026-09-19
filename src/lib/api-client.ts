'use client';

export async function api<T = unknown>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method ?? 'GET',
    headers: opts?.body ? { 'content-type': 'application/json' } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin', // session cookie is always sent same-origin (explicit, future-proof)
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response' }));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data.data as T;
}

import { useEffect, useRef } from 'react';

export function usePolling(fn: () => void | Promise<void>, ms: number, active = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!active) return;
    void saved.current();
    const id = setInterval(() => void saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}
