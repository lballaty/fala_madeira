// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useTheme.ts
// Description: Appearance (light/dark) theme hook. Owns the three-way user preference
//   (system | light | dark), resolves it against the OS `prefers-color-scheme` when set to
//   system, applies the result as the `data-theme` attribute on <html> (the selector the
//   Tailwind dark variant + semantic color tokens in src/index.css key off), and persists the
//   choice. Persistence uses localStorage directly — matching the codebase's other synchronous
//   UI prefs in useSettings (playback_speed, is_sound_enabled) and the platform web storage
//   adapter's own localStorage fallback — so the pre-paint bootstrap in index.html can read the
//   same key synchronously and avoid a flash. A media-query listener keeps `system` live when
//   the OS toggles. Wired into Settings → Appearance (System / Light / Dark).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useState } from 'react';

/** User-facing appearance preference. `system` tracks the OS `prefers-color-scheme`. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The concrete theme actually applied to the document (never `system`). */
export type ResolvedTheme = 'light' | 'dark';

// localStorage key shared with the inline pre-paint bootstrap in index.html. Changing it
// requires updating that bootstrap too (both resolve the same stored value).
const THEME_STORAGE_KEY = 'fm_theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Read the persisted preference, defaulting to `system`. SSR/test-safe. */
const readStoredPreference = (): ThemePreference => {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
};

/** Does the OS currently prefer dark? SSR/test-safe (assumes light when unavailable). */
const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(DARK_QUERY).matches;

/** Resolve a preference to the concrete theme to apply. */
const resolveTheme = (preference: ThemePreference): ResolvedTheme => {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
};

/** Apply the resolved theme to <html> (the selector src/index.css tokens key off). */
const applyTheme = (resolved: ResolvedTheme): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
};

export interface UseThemeResult {
  /** The user's chosen preference (system | light | dark). */
  preference: ThemePreference;
  /** The concrete theme currently applied (light | dark). */
  resolvedTheme: ResolvedTheme;
  /** Persist a new preference and apply it immediately. */
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Appearance theme controller. Returns the current preference + resolved theme and a setter.
 * Applies the resolved theme to <html data-theme> on mount and whenever the preference or (for
 * `system`) the OS setting changes. Persists the preference to localStorage under `fm_theme`.
 */
export const useTheme = (): UseThemeResult => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  // resolvedTheme is derived from `preference` + the live OS setting. Deriving it during render
  // (rather than storing it via setState in an effect) keeps it in sync without a redundant
  // render pass; the systemTick counter below only forces a re-derive when the OS flips.
  const [, forceReresolve] = useState(0);
  const resolvedTheme = resolveTheme(preference);

  // Side effect only: reflect the resolved theme onto <html data-theme>. Re-runs when the
  // resolved theme changes (preference change, or an OS flip that bumped systemTick).
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Keep `system` live: when the OS flips prefers-color-scheme and the user is on `system`,
  // bump the counter so resolvedTheme re-derives (and the effect above re-applies). No-op for
  // explicit light/dark preferences.
  useEffect(() => {
    if (preference !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => forceReresolve((n) => n + 1);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    }
    setPreferenceState(next);
  }, []);

  return { preference, resolvedTheme, setPreference };
};
