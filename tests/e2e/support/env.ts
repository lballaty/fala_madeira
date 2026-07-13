// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/env.ts
// Description: Test-side environment loader for the regression e2e suite. Parses .env.local
//   DIRECTLY (never via a shelled node -e — dotenv v17 prints a stdout tip that corrupts
//   captured values, AGENTS.md §5) to get the live Supabase URL + anon key, and resolves the
//   admin credentials from environment overrides or the git-ignored temp credentials file.
//   These feed global-setup (admin session mint + throwaway fake-email test user creation) and
//   the per-test Supabase evidence clients.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { readFileSync, existsSync } from 'node:fs';
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

export interface SessionInfo {
  userId: string;
  email: string;
  password: string;
  access_token: string;
  refresh_token: string;
}

export const E2E_AUTH_DIR = resolve(REPO_ROOT, 'tests/e2e/.auth');
export const ADMIN_STORAGE_STATE_PATH = resolve(E2E_AUTH_DIR, 'admin.json');
export const ADMIN_SESSION_INFO_PATH = resolve(E2E_AUTH_DIR, 'admin-session.json');
export const TEST_USER_STORAGE_STATE_PATH = resolve(E2E_AUTH_DIR, 'test-user.json');
export const TEST_USER_SESSION_INFO_PATH = resolve(E2E_AUTH_DIR, 'test-user-session.json');

/**
 * Deterministically strong-enough disposable credentials for one e2e run. The email is fake
 * (no inbox dependency) and unique per run so the suite can create + later destroy its own
 * user without colliding with prior runs.
 */
export function makeTestUserCreds(seed = Date.now()): { email: string; password: string } {
  return {
    email: `falamadeira-e2e-${seed}@example.test`,
    password: `FmE2E!${seed}`,
  };
}

function readAdminCredsFile(): { email: string; password: string } | null {
  const path = resolve(REPO_ROOT, '.admin-temp-credentials.txt');
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const email = raw.match(/email:\s*(\S+)/)?.[1] ?? '';
  const password = raw.match(/temp_password:\s*(\S+)/)?.[1] ?? '';
  if (!email || !password) return null;
  return { email, password };
}

export function readAdminCreds(): { email: string; password: string } {
  const envEmail = envLocal.E2E_ADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL;
  const envPassword = envLocal.E2E_ADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }
  const fileCreds = readAdminCredsFile();
  if (fileCreds) return fileCreds;
  throw new Error(
    'Missing admin credentials for e2e. Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD in .env.local ' +
      'or provide .admin-temp-credentials.txt with email/temp_password lines.',
  );
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
