# EN-23b — Admin Audio Panel Fixes (W1–W4) — Requirements

**File:** `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-23b-AUDIO-PANEL-FIXES-REQUIREMENTS.md`
**Description:** Requirements for the panel-bug fixes on the admin Audio management tab (EN-23 follow-up). Scope is the four defects that are **fixable without EN-8 activation** (W1–W4). Server-presence truth (W5) and the regen-fulfilment loop (W6) remain EN-8-dependent and are OUT OF SCOPE here.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-19
**Last Updated:** 2026-07-19
**Last Updated By:** claude-en23b (owner APPROVED build W1–W4; claims verified against live code)

## 1. Context & problem

The admin Audio tab (`AdminView` → Audio; `src/features/admin/audio/AudioPanel.tsx` + `useAudioReview.ts`) shipped as the EN-23 MVP. Owner testing (2026-07-18) found five defects. Investigation showed **four are panel bugs independent of EN-8** (the server-hosted audio tier that is inert-until-activation); the fifth (real "present on server") genuinely needs EN-8 infra and is deferred.

**Root-cause headline:** `audioServerTier.ts` reads `config.audio.serverBase`, **a config key that does not exist** — EN-8 shipped `config.audio.verpexBase` + `config.audio.supabaseAudioBucket` (`src/config.ts:58-59`). So `isServerTierAvailable()` is permanently `false` and the panel shows "pending EN-8" **even after EN-8 is activated**. A secondary bug: the presence probe uses the raw build key instead of `keyToServerPath()` (`src/lib/audioKey.ts:50`), so it would 404 even for hosted clips.

## 2. In scope (W1–W4)

- **W1 — Fix the server-tier wiring.** `audioServerTier.ts` must read the real config (`verpexBase` + `supabaseAudioBucket`), build the object name with `keyToServerPath(buildKey)`, and probe the tier the same way runtime playback does (mirror `geminiService.fetchServerTier`, `geminiService.ts:451-464`). "Pending EN-8" must only appear when the tier is genuinely unconfigured, never as a hardwired false.
- **W2 — Make the play button work.** `getPlaybackUrl` (`useAudioReview.ts:227-231`) must fall through to `synthesizeCached(clip.text, {voiceType})` on a device-cache miss so an admin can preview any clip (provider fallback works today; cheaper/offline once EN-8 is active). Relax the `disabled` gate (`AudioPanel.tsx:164`) accordingly, with a loading state during fetch.
- **W3 — Stop loading everything at once.** The per-clip enumeration + probe loop (`useAudioReview.ts:118-158`) must be paginated/lazy (bounded batch, e.g. 25–50 per page, with "load more" or windowed render) so a scope does not trigger N sequential awaits + N network probes on every load.
- **W4 — Show file size for every listed clip.** Size must display whether or not the clip was previously scored on this device — derived from the fetched blob's `byteLength` (W2 path) or a server `Content-Length` (W1 path).

## 3. Out of scope (deferred, EN-8-dependent — track under EN-8/EN-23b)

- **W5** — true present/missing/unknown-per-tier indicator (needs the Verpex `/audio` dir and/or the `tts-audio` Supabase bucket actually populated).
- **W6** — `pregen --from-queue` to fulfil enqueued regenerations.
- Bulk actions, in-panel delete/replace-in-storage, waveform view, version/diff (already deferred in EN-23 MVP).

## 4. Acceptance criteria

1. With EN-8 **not** activated, the panel no longer claims a broken server state as "pending EN-8" where the real issue was the config-key bug; the server column reflects the actual tier availability (unconfigured vs. configured).
2. Clicking play on any listed clip plays audio (provider fallback when nothing is cached), with a visible loading state; failures route through the centralized logger with a user-visible message + correlation id (no silent dead button).
3. Opening a scope renders the first page quickly and does **not** issue N sequential network probes for the whole set; additional clips load on demand.
4. Every listed clip shows a file size (once fetched/known) regardless of prior device scoring.
5. No regression to the existing EN-23 verdict / notes / enqueue-for-regen round-trip (admin/13 spec stays green).

## 5. Testing requirements (per AGENTS §3 — every change ships coverage)

- **Unit/component (vitest):** `audioServerTier` resolves the correct URL from `verpexBase`/`supabaseAudioBucket` + `keyToServerPath` (W1); `getPlaybackUrl` falls through to `synthesizeCached` on cache miss (W2, mocked); pagination bounds the batch (W3); size derivation from bytes (W4).
- **E2E (Playwright, admin/13 or a new admin spec):** the Audio tab renders a bounded first page; play produces audio (or the mocked provider path); size is shown; verdict/enqueue still round-trip. Extend rather than duplicate `tests/e2e/admin/13-admin-audio-panel.spec.ts`.
- Full gate (e2e regression + preflight) green before the cut.

## 6. Observability (mandatory)

Every new error path (server probe failure, playback fetch failure, synthesize failure) routes through `src/lib/logger` with correlation ids and a structured code + user-visible message. No bare console, no hardcoded fallback that masks misconfiguration (a genuinely-unconfigured tier fails loudly/honestly, not silently).

## 7. Release

Ships in the next cut (CalVer `2026.07.19.x`) via the standard staging→approve→production flow. Coordinates with EN-8 activation only for W5/W6 (out of scope here).

## 8. Approval

**Status:** **W1-W4 SHIPPED 2026.07.19.1** (merged to develop, gated GREEN `9ed902b`); **W5/W6 deferred to EN-34**. _History:_ owner approved build W1–W4 on 2026-07-19 (requirements/approval gate, AGENTS §3). All four claims (W1 phantom `config.audio.serverBase` + raw-key probe, W2 null-on-cache-miss play, W3 N-sequential enumerate/probe loop, W4 size-only-when-scored) were verified against live code (`audioServerTier.ts:18-38`, `config.ts:58-59`, `useAudioReview.ts:118-158,227-231`) before approval. Build proceeds on `feat/en23b-audio-panel-fixes` in an isolated worktree; incremental commits per work-package; full gate (CI=1 e2e regression + ship dry-run) before any cut.
