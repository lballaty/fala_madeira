// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/env.ts
// Description: Test-side environment loader for the vertical-slice e2e suite. Parses
//   .env.local DIRECTLY (never via a shelled node -e — dotenv v17 prints a stdout tip that
//   corrupts captured values, AGENTS.md §5) to get the live Supabase URL + anon key, and
//   reads the admin credentials from the git-ignored .admin-temp-credentials.txt. These feed
//   global-setup (session mint) and the per-test Supabase evidence client. The service-role
//   key is NOT used here — evidence queries run as the authed admin user (anon key + session),
//   which is the realistic RLS-scoped read path per docs/TEST-VERTICAL-SLICES.md §4.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright always runs from the repo root (where playwright.config.ts lives), so cwd is the
// repo root. The repo is `"type": "module"` — __dirname is unavailable in ESM — so anchor on cwd.
const REPO_ROOT = process.cwd();

/** Parse a KEY="value" / KEY=value .env file into a map (quotes stripped). No dotenv dep. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const envLocal = parseEnvFile(resolve(REPO_ROOT, '.env.local'));

export const SUPABASE_URL = envLocal.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = envLocal.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_REF = (SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? '';

/** supabase-js default localStorage session key (no custom storageKey in src/lib/supabase.ts). */
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;

/** Read the admin credentials from the git-ignored temp file. */
export function readAdminCreds(): { email: string; password: string } {
  const path = resolve(REPO_ROOT, '.admin-temp-credentials.txt');
  const raw = readFileSync(path, 'utf8');
  const email = raw.match(/email:\s*(\S+)/)?.[1] ?? '';
  const password = raw.match(/temp_password:\s*(\S+)/)?.[1] ?? '';
  if (!email || !password) {
    throw new Error(
      `Could not parse admin credentials from ${path} (need "email:" and "temp_password:" lines).`,
    );
  }
  return { email, password };
}

export function assertEnv(): void {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
  if (missing.length) {
    throw new Error(
      `Missing required env from .env.local: ${missing.join(', ')}. ` +
        `The e2e suite drives the LIVE Supabase project and cannot run without these.`,
    );
  }
}

export const REPO_ROOT_DIR = REPO_ROOT;
