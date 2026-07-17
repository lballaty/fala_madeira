# FalaMadeira — Madeiran Portuguese for Real Life

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/README.md
**Description:** Project overview for FalaMadeira — a modular, non-linear, voice-first European-Portuguese learning app focused on living in Madeira. Web PWA + iOS (Capacitor) from one codebase.
**Author:** Libor Ballaty
**Created:** 2026-07-11
**Last Updated:** 2026-07-11
**Last Updated By:** v1.0.0 release

**Live:** https://falamadeira.searchingfool.com

A language operating system for living in Madeira: correct European Portuguese, trained against how it's actually spoken locally. Voice-first (listen/speak by default), non-linear (nothing is ever locked), and content-as-data (curriculum grows by publishing packs, not code releases).

## What's inside (v1.0.0)

- **187 fully-enriched situations** — a complete 168-day / 6-month Structured Course (28 days × 6 months) plus 19 goal-track situations, each with phrase patterns, vocabulary, multi-speaker dialogues, branching roleplay (L1–L5), real-world missions, cultural notes, and SRS review items. 24 weekly curated EU-PT videos (all verified).
- **Four learning paths over one content base** — Structured Course (month-by-month), Goal Tracks (Survival / Host / Social / Bureaucracy / Work), Adaptive Guided (~30-min composed daily session), and Free navigation.
- **8 practice engines** — Listening, Speaking & Pronunciation, Pattern Builder, Situation Simulator (AI roleplay), Missions, Vocabulary (SM-2 SRS with 4-dimension weakness steering), Phrase Library, Culture.
- **The Coach** — deterministic, offline-capable focus recommendations ("why this?" explainable), after-session recaps, weekly insight; AI error-analysis as online enhancement.
- **AI tutor** — level-locked European-Portuguese conversation, scenario generator, translation — all via JWT-verified Supabase edge functions (no client-side keys).
- **Offline-first PWA** — bundled content pack, audio download per track/level, offline write queue with sync-on-reconnect; installable; iOS app via Capacitor (same code).

## Stack

React 19 · TypeScript · Vite 6 · Tailwind 4 · Supabase (Postgres + RLS + Edge Functions) · Gemini (tutor/content) · vite-plugin-pwa/Workbox · Capacitor 8 (iOS) · Vitest (154 unit) · Playwright (14 e2e slices).

## Development

```bash
npm install
npm run dev           # local dev server
npm run lint          # tsc --noEmit
npm run lint:eslint   # eslint
npm test -- --run     # vitest (unit + component)
npm run test:e2e      # playwright e2e (hits live Supabase; needs admin creds file)
bash scripts/preflight.sh   # the full pre-ship gate
```

## Deploy

Web ships from this device only (never CI): `npm run deploy` → `scripts/ship.sh` (preflight → rsync to the scoped Verpex directory; `-- --dry-run` supported). iOS: `npx cap sync ios && npx cap open ios` (Xcode signing required). See `AGENTS.md` §5–6 for operating facts and guardrails.

## Canonical docs

- `AGENTS.md` — repo principles, workflow contract, operating facts (read first)
- `docs/CONTENT-ARCHITECTURE.md` — the governing content/UX model
- `docs/ENGINEERING-STANDARDS.md` — architecture/security/coding standard + compliance checklist
- `docs/CONTENT-STANDARDS.md` — European-Portuguese content rules + validator
- `plans/plan-2026-07-09-full-product.yaml` + `plans/.plan-state.yaml` — the executed build plan and its state
