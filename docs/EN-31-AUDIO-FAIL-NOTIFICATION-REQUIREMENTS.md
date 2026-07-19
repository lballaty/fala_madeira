# EN-31 — "Audio couldn't play" user notification (Requirements)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-31-AUDIO-FAIL-NOTIFICATION-REQUIREMENTS.md
**Description:** Product-wide, honest notification when TTS audio fails to reach the user. The silent-failure core (GAP 1) and toast anti-spam (GAP 3) are BUILT + merged; this spec now scopes the remaining owner-decision UX (GAP 2 degradation indicator, popup/Retry/copy) for approval. Paired with EN-34 (hosting reduces failures; EN-31 surfaces the rest).
**Author:** claude-en23b (with owner)
**Created:** 2026-07-19
**Last Updated:** 2026-07-19
**Last Updated By:** claude-en31-spec

---

## 0. Status (reconciled 2026-07-19)

**PARTIALLY BUILT — remaining scope NEEDS APPROVAL (AGENTS §3).**

| Item | State |
|---|---|
| GAP 1 — silent device-speech failure now surfaces | ✅ **BUILT + merged to `develop`** (commit `7ac5e85`), with unit tests |
| GAP 3 — once-per-outage toast dedupe | ✅ **BUILT + merged to `develop`** (commit `7ac5e85`), with unit tests |
| GAP 2 — server→device degradation indicator | ⛔ **NOT built** — genuine product decision, needs approval |
| UX — popup/modal vs toast, Retry action, Settings link, final copy | ⛔ **NOT built** — needs approval |

Rationale for the built part landing ahead of this spec's approval: GAP 1 closes an **acknowledged OBSERVABILITY-doctrine gap** (a failure was logged but never surfaced to the user — "silence reported as success"), so it qualifies as a doctrine/bug fix rather than a new feature. GAP 3 is the small anti-spam guard bundled with it. The **product-shaping** choices (GAP 2 + the popup/Retry/copy UX) remain gated on owner approval below.

## 1. Purpose

When audio can't be played for any reason, the user must be told (owner: "a popup of some kind so they are not just unaware of what is wrong") — **product-wide**, not onboarding-scoped. This is **harden-the-existing**, not build-from-scratch.

## 2. Current state (verified in code, on `develop`)

All audio surfaces (lessons, quiz, tutor free-chat, vocab, onboarding first-win) route through `useSpeechPlayback.playSpeech` (`src/hooks/useSpeechPlayback.ts`).

- **Total-failure toast (pre-existing).** `playSpeech`'s `catch` fires `showToast(userMessage('TTS_FAILED', errorMessage(err), event.request_id), 'error')` — an error toast **carrying the correlation ref** (satisfies OBSERVABILITY §10 dual-surface: the same failure is `logger.error`'d and shown to the user with a quotable ref).
- **GAP 1 CLOSED (`7ac5e85`).** The last-resort device fallback `platform.audio.speak` (`src/platform/web/audio.web.ts`) previously resolved as soon as `synth.speak()` was queued, so an async `onerror` (no `pt-PT` voice, autoplay-gesture block, engine error) could only be *logged*, never surfaced → the user got silence with no toast. `speak()` now returns a promise that **resolves on `onend`, rejects on `onerror`**, with a **timeout backstop that resolves** (a timeout is ambiguous, not a definite failure) so the await can't hang. `onEnded` still fires on every path, preserving the caller's spinner-clear contract. A device failure now propagates to the existing toast.
- **GAP 3 CLOSED (`7ac5e85`).** A module-scoped `audioFailureNotified` latch dedupes the *toast* to **once per outage**; a successful play **re-arms** it (so recovery-then-new-outage notifies again — a strict once-per-session would hide later failures). Every failure is still **logged** individually; only the user-facing toast is deduped.
- **Coverage:** `src/hooks/__tests__/useSpeechPlayback.test.ts` and `src/platform/web/__tests__/audio.web.test.ts` assert: device `speak()` rejects on `onerror` → toast; timeout resolves (no false toast); dedupe suppresses repeat toasts; a success re-arms the latch.

## 3. Remaining requirements (the open scope)

### GAP 2 — server→device degradation is intentionally silent (product decision)
When server/premium TTS 503s but device speech succeeds, the user hears the lower-quality device voice with **no indication quality dropped** (ties EF-37 / TB-13). This is *not* a failure, so the error toast is the wrong surface. Decide whether to surface a **subtle, non-alarming "using device voice" indicator** or keep it silent.

### UX enhancements to the total-failure notification
The failure notification today is an error toast. Owner asked for "a popup." Decide the surface, whether it carries a **Retry** action and a **link to Settings › Voice Provider**, and the exact copy.

## 4. Proposed resolution (PROPOSED — owner confirm each)

> These are recommendations grounded in the current code and the calm/honest/non-manipulative product guardrails (CONTENT-ARCHITECTURE §12). The owner approves or amends; nothing here is built until then.

1. **Surface for total failure — keep the toast, don't add a blocking modal.** *Recommendation:* interpret "popup" as the existing non-blocking error toast, **not** a modal. A modal that interrupts on a failed audio play is hostile on a voice-first app where plays are frequent; the toast already carries the ref and is deduped once-per-outage. If the owner wants stronger emphasis, scope any modal to **first failure of a session only**. **PROPOSED: enhanced toast (below), no modal.**
2. **Copy (honest, non-alarming, ref included).** *Proposed strings:*
   - Total failure: **"Couldn't play the audio — check your connection or try again. (Ref: {requestId})"**
   - Unsupported device (no speech synthesis): **"This device can't play spoken audio. (Ref: {requestId})"**
   These replace the raw `errorMessage(err)` passthrough with a stable, user-facing message while keeping the `{requestId}` for support.
3. **Retry action.** *Recommendation:* add a **Retry** button to the failure toast that re-invokes the last `playSpeech(text)`. Cheap, directly addresses transient provider/network blips, and avoids the user re-hunting the speaker control. **PROPOSED: yes.**
4. **Settings link.** *Recommendation:* when the failure is provider/voice-related (not a plain network drop), add a secondary **"Voice settings"** link to Settings › Voice Provider. **PROPOSED: yes, conditional on failure class.**
5. **GAP 2 degradation indicator.** *Recommendation:* show a **subtle, once-per-session, non-error indicator** (e.g. a small "device voice" pill/icon near the audio control), distinct from the error toast — never a toast, since degradation is expected graceful behavior, not an error. **PROPOSED: subtle indicator, once per session.** (Owner may choose "keep silent" — lowest effort, but leaves the EF-37/TB-13 "why does it sound different?" question unanswered.)
6. **Dedupe policy.** Already built as once-per-outage with re-arm on success (GAP 3). *Recommendation:* keep as-is; only add per-surface granularity if testing shows cross-surface confusion. **RESOLVED.**

## 5. Acceptance criteria

- **AC-1 (built, regression-guard):** a device `speak()` `onerror` produces exactly one error toast carrying a `{requestId}`; a backstop timeout produces **no** toast.
- **AC-2 (built, regression-guard):** during a sustained outage, repeated plays produce exactly one toast until a successful play re-arms the latch.
- **AC-3 (new, if WP-C approved):** the total-failure toast shows the approved stable copy (not a raw error string) and, when present, a working **Retry** that re-triggers the last play; a provider/voice-class failure also shows the **Voice settings** link.
- **AC-4 (new, if WP-D approved):** when server TTS degrades to device voice, the degradation indicator appears at most **once per session** and **no error toast** fires.
- **AC-5 (no regression):** the happy path (audio plays) shows neither toast nor indicator; the spinner-clear contract (`onEnded`/`isAudioPlaying=false`) holds on every path.

## 6. Work packages (decomposition)

| WP | Scope | Files (indicative) | Depends on | State |
|---|---|---|---|---|
| **WP-A** | GAP 1 — `speak()` resolve-on-`onend`/reject-on-`onerror` + timeout backstop | `src/platform/web/audio.web.ts`, `src/platform/types.ts` | — | ✅ done (`7ac5e85`) |
| **WP-B** | GAP 3 — module-scoped once-per-outage toast dedupe + re-arm | `src/hooks/useSpeechPlayback.ts` | — | ✅ done (`7ac5e85`) |
| **WP-C** | Enhanced failure toast: stable copy + Retry (Settings deep-link split to WP-F) | `useSpeechPlayback.ts`, `components/Toast.tsx`, `hooks/useToast.ts`, `config.ts` | approved 2026-07-19 | ✅ done (`9ccebfe`, `feat/en31`) |
| **WP-D** | GAP 2 degradation notice — once-per-session calm `info` toast (interim; pill upgrade → WP-G) | `geminiService.ts` (`onDegraded`), `useSpeechPlayback.ts`, toast infra | approved 2026-07-19 | ✅ done (`9ccebfe`, `feat/en31`) |
| **WP-E** | Tests: stable/unsupported copy, Retry re-invoke, degrade once/session, degrade≠error latch, toast action dismiss + timer-clear | `__tests__/useSpeechPlayback.test.ts`, new `__tests__/useToast.test.ts` | WP-C, WP-D | ✅ done (`9ccebfe`, +12 tests) |
| **WP-F** | Voice-settings deep-link action on the failure toast | `useSpeechPlayback.ts` deps + **`App.tsx`** nav wiring | **DEFERRED** — App.tsx locked by active TB-1a | ⛔ blocked |
| **WP-G** | Upgrade WP-D surface: interim `info` toast → subtle pill near the audio control | audio-control component + **`App.tsx`** render wiring | **DEFERRED** — App.tsx locked by active TB-1a | ⛔ blocked |

WP-C/D/E shipped together on `feat/en31` (`9ccebfe`), App.tsx untouched. WP-F/WP-G were split out and deferred because both require editing `App.tsx`, which is under an active TB-1a lock — building into it now would collide with that agent's in-flight work. Both become unblocked once TB-1a lands.

## 7. Relationship to EN-34

EN-34 hosts curated audio so fewer plays reach the failing/throttled provider; EN-31 guarantees the **remaining** failures are visible and the **degradation** is honest. Ship WP-C/WP-D sequenced with EN-34 for a complete audio-reliability story.

---

**Status:** WP-A/WP-B on `develop` (`7ac5e85`); WP-C/WP-D/WP-E **BUILT + owner-approved** on `feat/en31` (`9ccebfe`, unmerged — orchestrator to land). WP-F (Settings deep-link) + WP-G (pill upgrade) **DEFERRED** — both need `App.tsx`, currently locked by active TB-1a. Paired with EN-34.
