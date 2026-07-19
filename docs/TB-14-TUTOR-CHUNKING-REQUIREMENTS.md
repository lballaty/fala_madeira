# TB-14 — Tutor per-phrase Portuguese read-aloud (PT/EN-mix "chunking") — Findings + Requirements

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TB-14-TUTOR-CHUNKING-REQUIREMENTS.md
**Description:** Investigation findings (what exists, in which commits, what "regressed", root cause) plus a proposed fix / requirements for the tutor's PT/EN-mixed content read-aloud. INVESTIGATION deliverable — **no build until owner approval (AGENTS §3)**.
**Author:** agent-b (with owner)
**Created:** 2026-07-20
**Last Updated:** 2026-07-20
**Last Updated By:** agent-b

---

## 0. Status

**INVESTIGATION COMPLETE — requirements DRAFTED, NEEDS OWNER APPROVAL before any build.**

Headline: **the requested feature was NEVER BUILT — this is a missing feature, not a regression.** Confirmed against current `develop` (`dd60c97`), re-confirming the prior 2026-07-18 investigation recorded in the tracker.

## 1. Owner report / intent

Owner (2026-07-16, re-raised since): the tutor chat should let the user **tap an individual Portuguese phrase and hear only that phrase** — today the read-aloud "reads the English too" (and the phonetic pronunciation guide). Owner framed it as having "worked on this a few times" (i.e. perceived it as regressed).

Desired end state (per the TB-14 tracker + TB-5 Option A): **per-PHRASE click-to-play that speaks ONLY the Portuguese**, with the English/phonetic shown as text but not spoken by default.

## 2. Findings — what was built, in which commits, what "regressed"

### 2.1 It was never built (git evidence)
- **Pickaxe on the only chunking symbol** — `git log --all -S "playMessageInChunks" -- src/features/tutor` returns exactly two commits: `0411111` (the earliest autonomous checkpoint that first introduced it) and `4b6ef9b` (TB-23 — a mute-icon change, unrelated). **No commit ever added or removed a Portuguese-segmentation / per-phrase-play feature.**
- **No feature commits** — `git log --all --grep="TB-14" -i | grep -E "feat|fix"` → none. The only TB-14 commits are `tracker(TB-14): …` docs (`fe156a8`, and TB-5 addendum `d9d4084`). Same for `feat/fix(TB-5)`.
- The whole-message read-aloud behavior has existed since the earliest builds (`f65b216`/`0411111`); no later change (gemini→ai-gateway rename, EN-8, EN-20, TB-15/23) removed a segmentation feature **because none ever existed**.
- **Conclusion:** the "built a few times, regressed" perception comes from the feature being **discussed/tracked repeatedly (TB-5, TB-14) without code ever landing** — plus the fact that whole-message read-aloud (which reads English + phonetics) has always been the behavior. Behavior is identical on prod and develop.

### 2.2 What actually exists today (current behavior)
Two whole-message read-aloud paths, **neither of which extracts Portuguese**:
1. **Chat view** — `src/features/tutor/TutorChatView.tsx` renders each model message as ONE Markdown bubble with ONE play button → `onClick={() => playSpeech(msg.text)}` — speaks the **entire** message (PT + phonetic guide + English) in a single `geminiService.playSpeech` call.
2. **Practice modal auto-play** — `src/features/tutor/useTutorSession.ts` `playMessageInChunks(text, index)` (lines ~282-315) splits the message by **sentence boundary** only (`text.split(/(?<=[.!?])\s+/)`) and plays each sentence sequentially with a 600ms pause. This is **audio PACING only** — the comment even says *"Split by sentences or chunks for better pacing."* It still speaks every sentence, i.e. the Portuguese AND its phonetic guide AND the English translation.

### 2.3 Root cause (why per-phrase PT-only isn't achievable with what's there)
- **The tutor response is label-delimited Markdown prose that no code ever parses.** The tutor prompt (`useTutorSession.ts:358`) asks the model to "provide the Portuguese, a phonetic pronunciation guide, and the English translation," and the practice send (line ~390) appends a hint to "separate Portuguese/English clearly." A real captured turn (tracker TB-14, 2026-07-16) is a **long interleaved wall**: narrative Portuguese → `English:` → more PT → `English:` → an English objectives list → a `Português:/Pronunciation:/English:` pattern block → a "Nota do João" note. So there IS a **soft, model-produced label structure** (`Português:`/`English:`/`Pronunciation:`), but: (a) the Portuguese is **scattered throughout**, not one block; and (b) **nothing on the client consumes those labels** to isolate PT — both read-aloud paths take the raw `msg.text`.
- The labels are **model-dependent, not a guaranteed contract** — they usually appear (prompted) but aren't enforced/validated, so a pure client regex on them is workable-but-fragile. No segmentation/extraction of any kind was ever built, so playback necessarily speaks the whole mixed-language wall.

## 3. Root-cause summary (one line)
Per-phrase Portuguese-only read-aloud requires the tutor turn to be **parsed into its Portuguese phrases** (isolating them from the interleaved `English:`/`Pronunciation:`/notes); the labels exist but are never parsed and no per-phrase play control was ever built, so both read-aloud paths speak the entire mixed-language message.

## 4. Proposed fix (PROPOSED — owner confirms; nothing built yet)

**Primary (the established tracker design): client-side per-phrase renderer reusing existing components, folded into the EN-21 shared renderer.** Edge-independent.

- **WP-1 — Parse the tutor turn into phrases (client).** Parse the model message's Portuguese spans — the narrative PT sentences **and** the `**Português:**` block lines — treating `English:` / `Pronunciation:` / objectives / notes as **non-spoken** reveal/subtext. Pure, unit-tested parser with a plain-text fallback (if no PT is confidently found, fall back to the current whole-message render+play so a turn never breaks).
- **WP-2 — Per-phrase play control (reuse, don't invent).** Render each PT phrase with an inline **`src/components/AudioButton.tsx`** (EN-1 — loading/playing state) that speaks **only that phrase** (`playSpeech(pt)` — the EN-31-hardened path), and show the phrase via **`src/components/TranslatableText.tsx`** (tap-to-reveal EN) — the same pairing already used in `LessonDetailModal`. No auto-spoken English/phonetic.
- **WP-3 — Fold into EN-21 (mode-aware shared renderer).** Build the message renderer ONCE in EN-21: `conversation` mode → the PT turns are the phrases; `translate`/`lesson` → the `Português` section. Do not create a second parallel renderer. Retire/repurpose `playMessageInChunks` (its sentence-pacing is subsumed).
- **Optional robustness upgrade (owner decision):** if the label parse proves too fragile across model outputs, tighten the tutor prompt and/or have the `ai-gateway` tutor action emit **structured segments** (`[{ pt, phonetic?, en?, kind }]`, validated server-side, plain-text fallback). This removes the model-label dependency but adds a server change; not required for a first cut.
- **Ties:** EN-21 (shared renderer — primary), EN-1 (`AudioButton` state), TB-5 (bilingual-read model), TB-13 (accent/voice consistency), EF-37 (server-TTS 503 window).

## 5. Scope & ownership
- Owns `src/features/tutor/**` + the tutor content-segmentation pipeline (the `ai-gateway` tutor action's output contract). Disjoint from Agent A / Agent C.
- Coordinates with **EN-21** on the shared renderer (do not build a second parallel renderer).

## 6. Acceptance criteria (PROPOSED)
- **AC-1:** a tutor model message renders each Portuguese phrase as an independently tappable unit; tapping speaks **only** that phrase's Portuguese (no English, no phonetic) — verified by asserting `playSpeech` is called with the `pt` text only.
- **AC-2:** phonetic + English are visible as text but never spoken by the per-phrase play.
- **AC-3:** a malformed/plain model turn falls back to the current whole-message render+play (no chat breakage).
- **AC-4:** no regression to send/receive, inactivity re-prompt, or the EN-31 failure toast/degradation notice.

## 7. Testing (AGENTS §3)
- Pure unit tests for the segment parser (structured→segments; malformed→fallback).
- Renderer tests: per-phrase button calls `playSpeech(pt)` with PT only; note segments have no button.
- e2e: tutor chat renders phrases + a phrase tap triggers a single PT play (mock the edge TTS deterministically, as EN-23b/EN-31 specs do).

## 8. Open decisions for owner
1. Primary = client-side label/phrase parse (WP-1/2, edge-independent, reuse AudioButton + TranslatableText). Confirm — and whether to add the structured-output robustness upgrade now or defer until the parse proves fragile.
2. Keep a "play whole message" option alongside per-phrase, or per-phrase only?
3. Build on the EN-21 shared renderer now, or ship a tutor-local renderer first and converge later? (Tracker leans EN-21-now to avoid a second renderer.)
4. Phonetic guide: show always, on-demand (tap-to-reveal), or drop it?

---

**Status:** DRAFT — findings complete; requirements + fix proposal awaiting owner approval (AGENTS §3). No code to be written until approved. Investigation confirmed the never-built root cause on `develop @ dd60c97` (2026-07-20).
