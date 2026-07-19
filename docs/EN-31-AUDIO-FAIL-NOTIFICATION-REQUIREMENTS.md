# EN-31 — "Audio couldn't play" user notification (Requirements)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-31-AUDIO-FAIL-NOTIFICATION-REQUIREMENTS.md
**Description:** Product-wide, honest notification when TTS audio fails to reach the user — hardening the existing toast and closing the SILENT device-speech failure gap. Paired with EN-34 (hosting reduces failures; EN-31 surfaces the rest). DRAFT — no build until owner-approved (AGENTS §3).
**Author:** claude-en23b (with owner)
**Created:** 2026-07-19
**Last Updated:** 2026-07-19
**Last Updated By:** claude-en23b

---

## 1. Purpose
When audio can't be played for any reason, the user must be told (owner: "a popup of some kind so they are not just unaware of what is wrong") — product-wide, not onboarding-scoped. This is **harden-the-existing**, not build-from-scratch.

## 2. Current state (verified in code)
- All audio surfaces route through `useSpeechPlayback.playSpeech` (`src/hooks/useSpeechPlayback.ts`), whose `catch` (≈line 42-44) already fires `showToast(userMessage('TTS_FAILED', …, event.request_id), 'error')` — an error toast carrying the correlation ref (satisfies OBSERVABILITY §10 dual-surface). So the happy-path failure notification exists.

## 3. Gaps to close
- **GAP 1 (the real "unaware" case) — silent device-speech failure = NO toast.** The toast only fires when `geminiService.playSpeech` throws. The last-resort device fallback `platform.audio.speak` (`src/platform/web/audio.web.ts:159-190`) **resolves immediately on `synth.speak()`**; Web-Speech `onerror` fires asynchronously *after* resolution → logged (SYSTEM_HEALTH) but cannot reject → user gets **silence + no toast** (no pt-PT voice, autoplay-gesture block, engine error). **Fix:** make `speak()` return a promise that resolves on `onend` and **rejects on `onerror`** (with a timeout backstop), preserving the `onEnded` spinner-clear contract, so the failure reaches the existing toast.
- **GAP 2 (product decision) — degradation is intentionally silent.** When server TTS 503s but device speech works, the user hears the device voice with no indication quality dropped (ties EF-37/TB-13). **Decide:** a subtle "using device voice" indicator (distinct from the error toast) vs. keep silent.
- **GAP 3 (UX) — dedupe the toast.** A session-long outage risks a toast per play. Set a once-per-session/surface dedupe (the 300ms ref debounce governs play frequency, not toast spam).

## 4. Decisions for owner
1. **Trigger set** — total-failure only, or also the GAP-2 degradation indicator?
2. **Surface** — toast (existing) vs. modal ("popup" per owner) for total failure.
3. **Copy** — honest, non-alarming; include the correlation ref for support.
4. **Actions** — Retry button + link to Settings › Voice Provider?
5. **Dedupe policy** — once per session, or per surface, per outage.

## 5. Testing (AGENTS §3)
Unit tests per failure mode: device `speak()` rejects → toast; unsupported/no-voice → toast; graceful degradation → no *error* toast (optional indicator only); dedupe suppresses repeats. No product regression to the happy path.

## 6. Relationship to EN-34
EN-34 hosts curated audio so fewer plays reach the failing provider; EN-31 guarantees the *remaining* failures are visible. Ship sequenced with EN-34 for a complete reliability story.

---

**Status:** DRAFT — awaiting owner approval (AGENTS §3). Paired with EN-34; own approval + work-package decomposition follow.
