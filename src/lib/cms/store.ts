import { useRef, useSyncExternalStore } from "react";
import { seedState } from "./seed";
import type { CmsState } from "./types";

/**
 * Website CMS store.
 *
 * Persisted in localStorage so that admin CRUD genuinely changes what the
 * public site renders during review. This is the single seam to swap for a
 * real database later: keep the same read/write API.
 */

const KEY = "civilcraft.cms.v3";

let state: CmsState = seedState;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...seedState, ...(JSON.parse(raw) as CmsState) };
  } catch {
    /* ignore corrupt storage */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getCmsState(): CmsState {
  hydrate();
  return state;
}

export function setCmsState(updater: (prev: CmsState) => CmsState) {
  hydrate();
  state = updater(state);
  persist();
  emit();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCms<T>(selector: (s: CmsState) => T): T {
  // Selectors often derive new arrays/objects (filter/find/map). Cache the
  // result per state identity so getSnapshot stays referentially stable and
  // React doesn't re-render forever.
  const cache = useRef<{ state: CmsState; value: T } | null>(null);

  const read = (source: CmsState) => {
    if (cache.current && cache.current.state === source) return cache.current.value;
    const value = selector(source);
    cache.current = { state: source, value };
    return value;
  };

  return useSyncExternalStore(
    subscribe,
    () => read(getCmsState()),
    () => read(seedState),
  );
}

export function resetCms() {
  setCmsState(() => seedState);
}

export function logActivity(entry: Omit<import("./types").ActivityEntry, "id" | "at">) {
  setCmsState((prev) => ({
    ...prev,
    activity: [
      { ...entry, id: uid(), at: new Date().toISOString() },
      ...(prev.activity ?? []),
    ].slice(0, 40),
  }));
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function formatDate(value: string | undefined | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
