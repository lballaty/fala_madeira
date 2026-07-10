// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/eslint.config.js
// Description: ESLint flat config for the FalaMadeira app source (src/**/*.{ts,tsx}).
//   Layers: @eslint/js recommended -> typescript-eslint recommended (non-type-checked,
//   kept fast on purpose) -> react-hooks recommended -> jsx-a11y recommended ->
//   eslint-config-prettier last to disable stylistic rules that Prettier owns.
//   Deliberately out of scope: supabase/functions (Deno, owned by its own tooling),
//   scripts (node .mjs utilities), dist, ios, docs, and other non-app trees.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'ios/**',
      'node_modules/**',
      'supabase/**', // Deno edge functions — separate runtime, owned by its own tooling
      'scripts/**', // node .mjs utility scripts — not part of the app lint surface
      'docs/**',
      'plans/**',
      'projects/**',
      'public/**',
      'graphify-out/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    rules: {
      // This project does not use React Compiler (no babel-plugin-react-compiler in
      // vite.config.ts), so "could not preserve manual memoization" findings are
      // hypothetical. Re-enable if/when the compiler is adopted.
      'react-hooks/preserve-manual-memoization': 'off',
      // Re-enabled to error by the accessibility-pass plan step (AGENTS.md §3) now that
      // the HomeView "Continue Learning" clickable div was converted to a real <button>.
      // These enforce keyboard operability on interactive elements going forward.
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
    },
  },
);
