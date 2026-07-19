# Changelog

**File:** `CHANGELOG.md`
**Description:** Release changelog for fala_madeira. Entries grouped by CalVer `YYYY.MM.DD.N`.
**Author:** Libor Ballaty <libor@arionetworks.com>
**Created:** 2026-07-14
**Last Updated:** 2026-07-18
**Last Updated By:** claude-orchestrator (2026.07.19.1 — TB-1 proficiency level + EN-23b admin audio panel fixes)

Versioning follows CalVer `YYYY.MM.DD.N` per the normative Versioning spec
(`~/.ai-dev-dotfiles/repo-specs/release-engineering/CLAUDE.md` §1). The `VERSION`
file is the sole source of truth; embedded literals are declared in
`.versionbump.yaml` and patched by `version-bump.py`.

---

## 2026.07.19.1

- ⚠️ **One-time action for existing accounts:** after this update your level starts **unset** — your original sign-up placement couldn't be carried over to the new setting. Please open **Settings → "Your level"** and pick your level once; it's saved from then on. New sign-ups keep their placement automatically. (TB-1)
- Fixed: **your level now reflects what you chose at sign-up.** Home used to show a fixed "Absolute Beginner" no matter what you picked during placement — it now shows your actual proficiency level. (TB-1)
- New: **you can change your level any time** from the new **Settings → "Your level"** control — no access key needed, and it persists. (This is separate from paid-content access, which is unchanged.) (TB-1)
- Fixed (admin): **audio clip preview playback now works** for any clip in the Audio management panel — it fetches the clip on demand instead of only replaying already-cached audio. (EN-23b)
- Fixed (admin): **the server-hosted-audio status now reads correctly** — a wiring bug made every clip show as "pending" regardless of its real state; the panel now reports the actual tier. (EN-23b)
- Improved (admin): **the Audio panel loads in pages** ("Load more") instead of fetching every clip at once, so it stays responsive at scale. (EN-23b)
- Improved (admin): **each audio clip now shows its file size.** (EN-23b)

## 2026.07.18.4

- Fixed: **new accounts no longer hit an error page right after signing up.** For a brand-new user, the Home screen could crash before the first lessons finished loading; it now shows a calm "Start your first lesson" prompt until your course content is ready. (This crash was present in the previous release too.)

## 2026.07.18.3

- Security: **a shared device now fully resets between users even if the previous person never signed out** — logging in as a different account clears the prior user's on-device data, and brand-new profiles start from clean defaults. (SEC-3)
- New: **admins can manage generated audio** — a panel to review the audio inventory, see quality signals (silence scoring), mark a clip bad, and queue it for regeneration. (EN-23)
- Improved: **audio you play is now kept on your device** — curated clips are saved to a durable, size-bounded store on play, so they load instantly and work offline, and survive logout/restart; turning off "Save audio on device" clears that saved store. (EN-8)
- Fixed: **the video player now shows an explicit "video unavailable" message** instead of a blank area when a clip can't load. (TB-16)
- Fixed: **study time now counts active practice, not wall-clock** — time only accrues while you're actually working, and a partial minute is saved on logout. (TB-17)
- Improved: **time-spent now reads in hours past 60 minutes** and is clearly labelled "Total time." (TB-21)
- Fixed: **the Tutor's free chat has a "New chat" control** to start over, and a dead Settings button in the tutor header was removed. (TB-22)
- Fixed: **the mute toggle shows a proper mute icon** (crossed-out speaker) instead of a bare X. (TB-23)

## 2026.07.18.2

- Internal: made `src/config.ts` import-safe when `import.meta.env` is absent (Playwright's Node collection context) — an unguarded `VITE_AUDIO_VERPEX_BASE` read (from the EN-8 server-audio tier) crashed the entire e2e suite at load (0 tests collected). No app-facing change. (EN-8 follow-up)

## 2026.07.18.1

- Improved: **admin User Access now finds people by a partial email** — type any part of an address (no need to remember the whole thing) and pick from the matches, or leave the box blank to **browse all users**. A single match jumps straight to the grant form. (EN-26)

## 2026.07.17.2

- Improved: **vocabulary practice is now an objective quiz, not self-graded flashcards.** For each word you hear it and **type what it means**, then **say it** (Portuguese speech check); the app decides right/partial/wrong and schedules the word to come back sooner or later accordingly — no more rating yourself. Words are drawn from the situations you've actually worked on and can be narrowed by theme (daily / social / travel / work). Without a microphone it falls back to a typed-only pass/fail. (EN-18)
- Internal: cleared an accessibility lint finding on the vocabulary answer field (focus is now set programmatically on mount rather than via `autoFocus`), unblocking a fully green preflight. (Audit A9)

## 2026.07.17.1

- Improved: **all admin functions are now reached from a single "Admin" entry in the navigation** — one surface with Review Queues, Content Studio, User Access, and a new **Config** tab. The separate, confusing "Admin Mode" toggle has been removed. (EN-25)
- New: **admins can set a per-user daily voice limit** from the User Access panel (blank = fall back to the global default), and the global voice-limit control now lives in the admin **Config** tab. (EN-25 / EN-11)

## 2026.07.16.3

- Fixed: **the daily voice-limit setting now persists reliably.** An admin-set limit could be silently reset by a stale value on the device; it now only changes on an explicit admin edit and reads the server value authoritatively. (TB-8)
- Internal: renamed the AI/voice backend function for clarity (no user-facing change) and hardened the automated test suite. Also includes the TB-15 free-chat fix and the sidebar Help entry from 2026.07.16.2.

## 2026.07.16.2

- Fixed: **the Tutor's free chat sends reliably again.** Typing a message and hitting send could silently do nothing after you'd opened and closed guided practice or the in-app help — the shared chat session was being dropped. It now re-establishes the session on send (and shows an error instead of failing silently). (TB-15)
- New: **a persistent "Help" entry in the sidebar** opens the in-app App-Guide chat from anywhere, so guidance is no longer buried inside the Tutor tab. (EN-20)

## 2026.07.16.1

- New: **an admin can grant a learner full access.** A "User Access" panel in admin mode looks up a user by email and sets their subscription tier (or level); admins and "unlimited" accounts now see all training content automatically, instead of unlocking level-by-level. (EN-15)
- Improved: **vocabulary review — set the content scope and see how many words** it covers, so the review no longer feels sparse or generic. (EN-16)
- Improved: **the User Manual and the in-app help assistant now stay in sync from one source**, so both reflect the current app — and the manual is more complete (learning paths, the Situation Simulator, offline downloads, vocabulary lookup, where Sign Out lives, read-aloud opt-in, and more). (EN-17)
- New: **in-app guidance** — help answers and contextual hints include a "Take me there" that navigates you straight to the right control and highlights it, instead of just describing where to tap. (EN-18)

## 2026.07.15.5

- Security: **users are now properly isolated on a shared device.** Learning-path selection is scoped per user, logout clears device-cached preferences/lessons/offline data, and the offline write queue never replays one user's pending writes under another's session — so logging out and back in as a different account no longer shows the previous user's settings. (Server data was already isolated by row-level security; this closes the client-side gap.) (SEC-2)
- Improved: **vocabulary lookup checks your course vocabulary first** — bidirectional Portuguese↔English, diacritic-insensitive and fuzzy, with an AI translation + Madeiran context only when a word isn't already in your content. (EN-10)

## 2026.07.15.4

- Fixed: the **Goal track is now selectable, not just switched** — choosing "Goal track" in Settings reveals a goal chooser so you can pick which goal to pursue, instead of silently switching to a default. (TB-11)
- Fixed: **Goal track no longer masquerades as the Structured Course on Home** when you haven't picked a goal yet. Home now shows an honest "Choose your goal" prompt that takes you straight to the goal chooser (scrolled into view and highlighted); once you pick a goal, Home reflects it by name. (TB-11b)

## 2026.07.15.2

- New: **Sign Out is now in the navigation sidebar** (always available), not only at the bottom of the Profile tab. (EN-9)
- New: **audio buttons show immediate feedback** — a spinner while a clip loads and a disabled state that prevents double-taps (lesson pronunciation first; more controls to follow). (EN-1)
- Changed: the **AI tutor no longer reads every message aloud by default** — it's now opt-in via the Mute/Unmute control, and per-message play buttons give audio on demand. (TB-5)
- Fixed: the **daily voice limit now shows the configured value** (was showing the default 5) and is **visible to all users**, not only admins. (TB-8)
- Improved: **offline audio** now shows an honest notice when the browser can't save audio (private mode / storage blocked), instead of silently losing it. (TB-9)
- Improved: **more resilient offline downloads** — per-clip retry/backoff and per-situation download units (phase 1). (EN-7)

## 2026.07.14.3

- **Fix (TB-7): returning users no longer restart onboarding on every login.** The
  onboarding gate now also honors the DB consent signal
  (`profiles.has_accepted_terms && has_accepted_ai_usage`) — the terminal
  onboarding step — so a returning user skips the entire first-run flow on any
  device, and Terms are never re-asked once accepted. A heal effect writes the
  local mirror so it never recurs on that device. First step toward the broader
  session-continuity requirement (DF11 / docs/USER-WORKFLOWS-AND-STORIES.md).

## 2026.07.14.2

First release cut through the staged deploy pipeline. Ships accumulated
`develop` work to testers.

- **Observability:** centralized logging (`logger.ts` → `log-sink` edge fn →
  `public.logs`) with correlation/trace IDs; window error + unhandledrejection
  capture; edge functions persist errors at catch choke points; TTS falls back
  to on-device speech synthesis. CORS allow-headers include `traceparent`.
- **Release/infra:** staged two-target deploy (`deploy-verpex.sh --target
  staging|production` + enforced `--approve` gate); Model B worktree fleet
  (`setup-worktree.sh` + per-role `claude-w` profiles); branch-discipline guard.
- **Fixes:** TB-6 onboarding "say it back" now genuinely listens; first-words
  speaker button (TB-2); EF-34/35/36 test/guard corrections.
- **UX:** in-app About with per-version release notes (EN-4); Madeira island
  SVG (onboarding + Home); tap-to-reveal `TranslatableText` primitive.
- **Data:** migrations `00009`/`00011` (tutor column + admin request
  visibility; profiles consent + activity columns).

**Caching / privacy note:** audio phrases are cached on-device (LRU) to reduce
latency and TTS cost; this happens regardless of the offline toggle. Formal
data-security / GDPR / EU AI Act notices are tracked in COMP-1.

## 2026.07.14.1

- Adopt CalVer versioning: add `VERSION`, `.versionbump.yaml` (declares the
  `package.json` version literal), and this changelog. Aligns `package.json`
  version to the `VERSION` source of truth (was `1.0.0`). Part of the global
  versioning rollout (TODO #122 §1).
