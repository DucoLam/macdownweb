import { useSyncExternalStore } from 'react';
import { DEFAULT_PREFERENCES, type MacDownPreferences } from './defaults';

type Listener = () => void;

/** localStorage key of the persisted preferences (F-141). */
export const PREFS_STORAGE_KEY = 'macdown.preferences';

export interface PreferencesStoreOptions {
  /**
   * Where explicit changes are persisted (F-141). `null` (the default) keeps
   * the store in memory, as unit tests need.
   */
  storage?: Storage | null;
  /**
   * `?pref.` URL overrides (testing aid). They win over stored values at
   * start-up and are never persisted; an explicit `set` of the same key
   * replaces the override.
   */
  overrides?: Partial<MacDownPreferences>;
}

/** Keeps only known keys whose value has the default's type (a corrupt store must not break the app). */
export function sanitizePreferences(raw: unknown): Partial<MacDownPreferences> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in DEFAULT_PREFERENCES)) continue;
    const d = (DEFAULT_PREFERENCES as unknown as Record<string, unknown>)[k];
    if (k === 'toolbarItemIdentifiers') {
      if (v === null || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) out[k] = v;
    } else if (k === 'editorBaseFontInfo') {
      const f = v as { name?: unknown; size?: unknown } | null;
      if (f && typeof f.name === 'string' && typeof f.size === 'number' && f.size > 0) out[k] = { name: f.name, size: f.size };
    } else if (typeof v === typeof d) {
      out[k] = v;
    }
  }
  return out as Partial<MacDownPreferences>;
}

/**
 * Preferences store: defaults (spec §8, `loadDefaultPreferences` and
 * `loadDefaultUserDefaults`) < persisted explicit changes < URL overrides.
 * Only keys the user changed are written, so a missing key always takes the
 * current default (spec §8 intro).
 */
export class PreferencesStore {
  private state: MacDownPreferences;
  private listeners = new Set<Listener>();
  private stored: Partial<MacDownPreferences>;
  private overrides: Partial<MacDownPreferences>;
  private readonly storage: Storage | null;

  constructor(
    private readonly initial: Partial<MacDownPreferences> = {},
    options: PreferencesStoreOptions = {},
  ) {
    this.storage = options.storage ?? null;
    this.overrides = { ...(options.overrides ?? {}) };
    this.stored = this.read();
    this.state = this.compute();
  }

  private read(): Partial<MacDownPreferences> {
    if (!this.storage) return {};
    try {
      const raw = this.storage.getItem(PREFS_STORAGE_KEY);
      return raw ? sanitizePreferences(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    if (!this.storage) return;
    try {
      if (Object.keys(this.stored).length) this.storage.setItem(PREFS_STORAGE_KEY, JSON.stringify(this.stored));
      else this.storage.removeItem(PREFS_STORAGE_KEY);
    } catch {
      /* quota or privacy mode: keep working in memory */
    }
  }

  private compute(): MacDownPreferences {
    return { ...DEFAULT_PREFERENCES, ...this.initial, ...this.stored, ...this.overrides };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  get = (): MacDownPreferences => this.state;

  /** The persisted (explicitly changed) keys; testing aid. */
  persisted = (): Partial<MacDownPreferences> => ({ ...this.stored });

  /**
   * Applies a patch and persists it. A patch that changes nothing does not
   * notify, so a subscriber that writes back the value it was given (for
   * example the F-74 theme reset) cannot start a render cycle.
   */
  set = (patch: Partial<MacDownPreferences>): void => {
    const keys = Object.keys(patch) as (keyof MacDownPreferences)[];
    if (keys.every((k) => Object.is(this.state[k], patch[k]))) return;
    for (const k of keys) delete this.overrides[k];
    this.stored = { ...this.stored, ...patch };
    this.write();
    this.state = this.compute();
    this.notify();
  };

  /** Back to the defaults; forgets the persisted values and the URL overrides. */
  reset = (): void => {
    this.stored = {};
    this.overrides = {};
    this.write();
    this.state = this.compute();
    this.notify();
  };

  /** Another tab changed the stored preferences (`storage` event). */
  reload = (): void => {
    const next = this.read();
    if (JSON.stringify(next) === JSON.stringify(this.stored)) return;
    this.stored = next;
    this.state = this.compute();
    this.notify();
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/**
 * Parses `?pref.<key>=<value>` query parameters into preference overrides.
 * Testing aid. Values are parsed as JSON when possible (`true`, `3`,
 * `{"name":"Menlo","size":16}`), otherwise used as strings
 * (`?pref.htmlStyleName=Clearness`).
 */
export function parsePrefOverrides(search: string): Partial<MacDownPreferences> {
  const params = new URLSearchParams(search);
  const out: Record<string, unknown> = {};
  params.forEach((raw, name) => {
    if (!name.startsWith('pref.')) return;
    const key = name.slice(5);
    if (!(key in DEFAULT_PREFERENCES)) return;
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* keep as string */
    }
    out[key] = value;
  });
  return out as Partial<MacDownPreferences>;
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const preferences = new PreferencesStore(
  {},
  {
    storage: browserStorage(),
    overrides: typeof window !== 'undefined' ? parsePrefOverrides(window.location.search) : {},
  },
);

if (typeof window !== 'undefined') {
  // Testing hook: window.macdownPrefs.set({ editorShowWordCount: true })
  (window as unknown as { macdownPrefs: PreferencesStore }).macdownPrefs = preferences;
  window.addEventListener('storage', (e) => {
    if (e.key === PREFS_STORAGE_KEY || e.key === null) preferences.reload();
  });
}

export function usePreferences(store: PreferencesStore = preferences): MacDownPreferences {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
