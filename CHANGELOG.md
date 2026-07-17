# Changelog

**File:** `CHANGELOG.md`
**Description:** Release changelog for fala_madeira. Entries grouped by CalVer `YYYY.MM.DD.N`.
**Author:** Libor Ballaty <libor@arionetworks.com>
**Created:** 2026-07-14
**Last Updated:** 2026-07-15
**Last Updated By:** claude-opus-4-8 (release 2026.07.15.5 — SEC-2 + EN-10)

Versioning follows CalVer `YYYY.MM.DD.N` per the normative Versioning spec
(`~/.ai-dev-dotfiles/repo-specs/release-engineering/CLAUDE.md` §1). The `VERSION`
file is the sole source of truth; embedded literals are declared in
`.versionbump.yaml` and patched by `version-bump.py`.

---

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
