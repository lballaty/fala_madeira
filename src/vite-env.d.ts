// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/vite-env.d.ts
// Description: Standard Vite ambient type reference. Types import.meta.env (DEV, VITE_* vars)
//   so modules like src/lib/logger.ts and src/lib/supabase.ts can use it without casts.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

/// <reference types="vite/client" />

// Injected by vite `define` from the root VERSION file (CalVer YYYY.MM.DD.N). Used by the
// in-app About surface (EN-4). Declared as a global so modules can read it without a cast.
declare const __APP_VERSION__: string;
