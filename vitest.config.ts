// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/vitest.config.ts
// Description: Vitest configuration for the unit + component test suite (plan step P6). Uses a
//   jsdom environment with globals so the pure-logic modules (content schema, srs, coach, paths,
//   practice helpers) and a handful of SETTLED leaf components can be exercised in isolation.
//   Deliberately STANDALONE (not extending vite.config.ts) so the heavy PWA/tailwind/react
//   plugin chain and the app-shell build config never load under test — and, critically, so the
//   suite never transitively parses App.tsx / HomeView.tsx (owned by a concurrent agent). The
//   React plugin is included only so the component tests can render JSX. Test discovery is scoped
//   to src/**/*.{test,spec}.{ts,tsx}. All network/DB boundaries (supabase, geminiService,
//   platform) are mocked per-test via vi.mock; the define block only stubs the Vite env reads in
//   src/lib/supabase.ts so importing it never throws at module load.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://localhost:54321'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
