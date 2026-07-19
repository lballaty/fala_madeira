# EN-34 — Incremental Small-Batch Audio Hosting (Requirements)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-34-INCREMENTAL-AUDIO-HOSTING-REQUIREMENTS.md
**Description:** Requirements for hosting curated TTS audio in small batches over time (never stalling on provider limits, never silently forgotten), plus an inventory audit of what is already hosted. Approach **C** (both paths), delivered **A-first**. DRAFT for owner approval — no build until approved (AGENTS §3).
**Author:** claude-opus-runner (with owner)
**Created:** 2026-07-19
**Last Updated:** 2026-07-19
**Last Updated By:** claude-opus-runner

---

## 1. Purpose

Serve premium (server-hosted) TTS audio for curated phrases without depending on
a live per-play call to the rate-limited provider, by pre-hosting clips **steadily
over time in small batches**. This eliminates the onboarding/lesson `404 → 400 →
503 → device-speech` fallback chain observed on staging 2026-07-19, and does so in
a way that **cannot stall-and-be-forgotten** (the failure mode of the one-off warm).

## 2. Confirmed key model (not up for change)

- A hosted clip is keyed **purely by `(provider, voice/persona, exact phrase text)`**:
  `buildKey('default', resolveVoice(voiceType), text)` → `tts:default:<voice>:<FNV-1a(text)>`
  → object `default_<voice>_<hash>.pcm` (`src/lib/audioKey.ts`). **User-agnostic** —
  who triggered a synth is irrelevant; one object per (persona, phrase), reused by all.
- Only **curated/reusable** text is eligible. Free-chat / user-typed text is excluded
  by the `hostable` gate for privacy (`COORD-2 BLOCKING-1`). This mechanism only ever
  hosts curated corpus text (situation lines + onboarding greetings).

## 3. Root cause — why "incremental over time" never happened

Two incremental paths were designed; both are currently inactive:

1. **Runtime write-back** (`supabase/functions/ai-gateway/index.ts:266`,
   env `TTS_BUFFER_WRITEBACK`): would host a curated phrase the first time any user
   plays it. **Flag is OFF**, held behind the EN-8 Phase-3 **single-buffer
   multi-env contention** bug (the first Verpex cron to copy a clip deletes it from
   the shared buffer, so a second environment's cron misses it).
2. **Manual pregen warm** (`scripts/pregen-audio.mjs --level 0`): ran once, **stalled
   at 83/527** on the provider sustained rate-limit (EF-37), then was not resumed —
   exactly "stall then forget."

## 4. Goal / success criteria

- G1 — Curated audio coverage climbs monotonically over time with **no manual babysitting**.
- G2 — A single run **never** hammers the provider past its sustained limit; on 429/503
  it **stops cleanly and resumes next run**.
- G3 — Coverage progress is **observable**; **zero-progress stalls raise an alert** (never silently forgotten).
- G4 — **Priority-ordered**: onboarding greetings first, then month-1, then later months, then remainder.
- G5 — **Idempotent/resumable**: already-hosted clips are skipped (HEAD check); safe to run anytime.
- G6 — No product regressions; hosting is additive (client tiers already fall through gracefully).

## 5. Approach C, delivered A-first

### Phase A — Scheduled incremental pre-generation (near-term, no contention dependency)

Extend the existing operator CLI `scripts/pregen-audio.mjs` (already idempotent via
HEAD-skip, already throttled+retried, already emits a JSON summary) and schedule it:

- **A1 — Batch limit:** add `--max <N>` so each run hosts at most N *newly-synthesized*
  clips (skips don't count), then exits 0. (Today it walks the whole level.)
- **A2 — Priority ordering:** add a corpus order — onboarding greeting set → level/month
  ascending → remainder. `--corpus onboarding|level:<n>|all`. Enumerated from source
  (`linesForSituation` walk + the onboarding greeting set), keyed by `buildKey`.
- **A3 — Rate-limit-aware stop:** on a run of consecutive 429/503 (after the existing
  retry/backoff), **end the batch cleanly** (partial progress preserved by idempotency),
  log the reason, exit 0 so the schedule simply resumes next tick — never a hard fail loop.
- **A4 — Schedule host (NOT GitHub Actions — this project does not use it):** run the
  batch on one of the schedulers the project already operates. Two realistic hosts:
  - **(i) Supabase `pg_cron` → scheduled edge function (RECOMMENDED).** A Deno edge
    function does the per-tick work entirely inside the Supabase project that already
    owns the provider (`ai-gateway`) and the `tts-audio` bucket. It enumerates the
    speakable corpus **from the DB content tables** (situation lines already live in
    Supabase — no TS/bundle import needed) + the small onboarding greeting set, synths
    the next `N` un-hosted clips, and uploads with the service role. pg_cron is already
    used (`tts-audio-orphan-backstop`). Keeps everything server-side; no external runner
    or admin-password secret needed (service role in the function env).
  - **(ii) Verpex server cron (mirrors the existing `pull.php` `*/15`).** A companion
    PHP hosting script alongside `audio-sync/pull.php`: each tick it picks `N` un-hosted
    keys, calls `ai-gateway` tts over HTTP, and uploads to the bucket via the storage
    REST API. Fits the established Verpex-cron pattern but duplicates the corpus/keying
    logic in PHP (drift risk vs the TS `buildKey`).
  - The existing Node CLI `scripts/pregen-audio.mjs` stays as the **operator/manual**
    entry point (one-off batches, dry-run) — the scheduled path is (i) or (ii), not a
    machine running Node on cron.
- **A5 — Observability (G3):** each run writes a heartbeat + summary to `public.logs`
  (event `audio_pregen_run`: corpus, attempted, synthesized, uploaded, skipped, errors,
  stop_reason) per the observability contract; a **stall check** flags K consecutive
  zero-`uploaded` non-complete runs.
- **A6 — Inventory audit (the "what's actually hosted" revisit):** a read-only pass that
  lists the `tts-audio` bucket + Verpex `/audio` and diffs against the desired corpus →
  a coverage report (`hosted / total` per corpus tier). This is both the answer to the
  revisit and the resume-state signal for A.

### Phase B — Fix buffer contention + enable runtime write-back (follow-on, organic warm)

- **B1 — Contention fix:** make the buffer→Verpex copy multi-env safe (per-env buffer
  namespacing, or copy-without-delete + a separate GC pass) so no environment's cron
  starves another. Prereq for turning write-back on with >1 environment.
- **B2 — Enable `TTS_BUFFER_WRITEBACK`** (per-env, operator-gated flag flip) so curated
  phrases warm organically as users play them — keeping coverage fresh as content grows,
  with A as the deterministic backfill.

## 6. Dependencies

- **TB-13** — provider sustained rate-limit is the hard ceiling on throughput. A
  locale-pinned dedicated provider key is what lets batches complete at volume; without
  it, A still makes steady progress but slowly (small N, longer horizon).
- **EN-8 pipeline** — `tts-audio` bucket (migration 00012, live), Verpex pull cron,
  and (for B) the contention fix.

## 7. Consumers

- **EN-32** (onboarding 6 greeting clips) — the **first priority batch** of A
  (`--corpus onboarding`). Optionally a one-off manual stopgap run before the schedule lands.
- **EN-33** (month-1 content) — the next tranche (`--corpus level:0` / month-1).

## 8. Operator-gating & blast radius

- The `tts-audio` bucket is on the **SHARED prod+staging Supabase project** — hosting a
  clip makes it live for **prod and staging together** (staging-first is not separable
  for the bucket). This is acceptable (hosted audio is additive + curated), but must be
  stated at every run.
- All live steps are operator-gated: scheduling the workflow, deploying edge changes (B),
  flipping `TTS_BUFFER_WRITEBACK` (B), and the service-role bucket writes.

## 9. Testing / coverage (AGENTS §3 + edge-testing policy)

- Pure cores get vitest: batch selection + priority ordering (A2), the rate-limit-stop
  decision (A3), inventory diff (A6), and the write-back gating predicate (B2).
- The Deno/edge + cron/Actions glue gets a mandatory agentic `/code-review` (per the
  edge-testing-policy: no Deno harness), plus a dry-run (`--dry-run`) proof per corpus.

## 10. Open decisions for owner (approve or adjust)

1. **Schedule host** — Supabase `pg_cron` → scheduled edge function (recommended) vs Verpex server cron (PHP, mirrors `pull.php`)? (GitHub Actions is out — project does not use it.)
2. **Cadence + batch size** — e.g. `--max 15` every 30 min (tune to the provider limit / TB-13 status).
3. **Priority order** — onboarding → month-1 → month-N → remainder (confirm).
4. **Stall-alert threshold** — K consecutive zero-progress runs before alerting (e.g. K=3).
5. **Onboarding stopgap** — run a one-off manual 6-clip batch now, or wait for the schedule?
6. **TB-13** — provision the dedicated provider key now (unblocks volume) or accept slow trickle initially?

---

**Status:** DRAFT — awaiting owner approval. On approval this becomes the build spec;
decomposition into work packages (A1–A6, then B1–B2) follows.
