# EN-34 — Incremental Small-Batch Audio Hosting (Requirements)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-34-INCREMENTAL-AUDIO-HOSTING-REQUIREMENTS.md
**Description:** Requirements for hosting curated TTS audio in small batches over time (never stalling on provider limits, never silently forgotten), plus an inventory audit of what is already hosted. Approach **C** (both paths), delivered **A-first**.
**Status:** **AUTONOMOUS HALF BUILT & MERGED INERT to develop `d4eb62f` 2026-07-19** — all 13 code/test/docs steps complete behind inert flags (vitest 577/577, tsc 0, e2e 135/0/3, ship dry-run PASS). Live activation remains operator-gated + staging-first. Per-step commits + operator sequence: `docs/TESTER-FEEDBACK-TRACKER.md` (EN-34).
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

> **This IS EN-8's unfinished Phase 3 (prod activation), pulled forward under this
> item.** EN-34 formally absorbs it so it isn't double-tracked; the EN-8 tracker entry
> now points here. EN-8's remaining role is the shared pipeline (bucket, Verpex cron,
> client fallback tiers) that Phase A drives.

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

## 7. Consumers & sibling reconciliation (owner directive 2026-07-19)

- **EN-32 (onboarding 6 clips) — ABSORBED into EN-34** as its first work package. One owner
  builds `--corpus onboarding` + the 6-clip corpus capture **once, here** (no parallel build in
  the EN-32 track). The immediate manual stopgap = "run EN-34's Phase-A `pregen --corpus onboarding`
  entry" (operator-gated; hits the shared prod bucket). EN-32's tracker entry now points here.
- **EN-33 (month-1 content)** — the next tranche (`--corpus level:0` / month-1), gated on TB-13.
- **EN-31 (audio-fail user notification) — PAIRED with EN-34** for a complete reliability story:
  EN-34 *reduces* audio failures by hosting; EN-31 *surfaces* the ones that remain (the silent
  device-speech `onerror`-after-resolve gap, `audio.web.ts:159-190`). EN-31 gets its own short
  requirements (`docs/EN-31-AUDIO-FAIL-NOTIFICATION-REQUIREMENTS.md`) + owner approval before build;
  sequenced alongside EN-34.
- **Out of scope / separate tracks:** TB-30 (double-consent — onboarding UX, orthogonal),
  TB-13 (dedicated provider key — the volume unblock for EN-33).

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

## 10. Decisions (locked 2026-07-19) + remaining defaults

1. **Schedule host — LOCKED:** Supabase `pg_cron` → scheduled edge function (`audio-warm`). Serverless, always-on, inside the project that owns the provider + bucket; no external Node runner.
2. **Versioning — LOCKED (new decision):** build **versioned filenames NOW** so a regenerated clip actually replaces the old one across every cache layer. See §11.
3. **Contention fix — LOCKED:** **symlink** (staging `/audio` → prod `/audio`, prod the sole puller) instead of an rsync sync — fewest ongoing failure modes (no sync process to silently drift), same-origin, always consistent. Two one-time **operator** checks: (i) host follows the symlink (`curl -I` a known object → 200), (ii) the web-deploy exclude is `--exclude 'audio'` (no slash) so `--delete` can't remove the link. See §11.
4. **Defaults (adjust on approval):** cadence `--max 15` newly-synthesized clips per tick, every 30 min; priority onboarding → `level:0`/month-1 → month-N → remainder; stall alert at **K=3** consecutive zero-`uploaded` non-complete runs.
5. **Operator/ops (decide at activation):** onboarding one-off stopgap batch — operator's call; **TB-13** dedicated locale-pinned provider key — ops, unblocks volume (without it, steady but slow trickle).

## 11. Admin Audio panel integration + versioning — the regenerate loop (delivers EN-23b W5/W6)

The EN-23 admin Audio tab already lets an admin **rate** a clip (`good`/`bad`/`re_record` → `tts_audio_review`) and **Enqueue for regeneration** (→ `tts_audio_regen_queue`, `pending`). Nothing consumes that queue today — EN-34 is the consumer, and this is EN-23b's deferred **W5/W6**.

- **Two work sources per warm tick:** (1) **drain the regen queue FIRST** (a known-bad clip outranks a new one), then (2) warm new un-hosted clips in priority order. Each regen row → re-synthesize `(text, voice)` → host at **generation + 1** → upsert the hosted manifest → mark the row `done`.
- **Generation model:** a per-key `generation` integer (default 1 = the current unversioned objects, so the ~83 already-hosted clips need no re-host). Regeneration bumps it. Object name: gen 1 → legacy `…​.pcm`; gen ≥ 2 → `…​.v<gen>.pcm`. Source of truth = a `tts_audio_hosted` manifest table (`build_key`, `generation`, `object_name`, `hosted_at`, tiers).
- **Cache-bust is the whole point of versioning:** the client resolves a key's current generation from the manifest and folds it into **both** the server URL **and** the device/pinned cache key — so device cache, pinned store, service worker, Verpex, and the bucket all miss the stale bytes and fetch the fresh render. Without this, identical filename + skip-if-exists + stale caches would serve the old bad clip forever.
- **Why re-synth helps:** most bad clips are transient provider defects (empty/silent/truncated `finishReason=OTHER`); a fresh render fixes them. Persistently-bad output needs a voice/param/text change (alters the key) — future scope.
- **Panel feedback (W5):** with the manifest + a real tier, the panel shows true present/missing per tier **and the current generation**, so the admin sees the re-record land.

**Alignment refinements (folded in 2026-07-19 after the panel↔hosting review):**
- **A — Presence & preview follow the CURRENT generation.** The panel's server-tier badge (W5) and the admin Play must resolve a clip via the manifest's current `object_name`/generation — never a fixed legacy name — or right after a re-record the panel would HEAD the stale `…pcm` (show "missing") and preview the old clip.
- **B — ONE enumeration source, panel ↔ warm fn.** The panel (`linesForSituation`) and the `audio-warm` fn must enumerate the corpus from the same definition, or "what the panel shows" drifts from "what gets hosted" (the COORD-1 risk — the app may render from the bundled content pack while the edge reads DB tables). Pin a single enumeration contract; verify parity during build.
- **C — Re-score the new generation on the panel's next preview.** The quality scorer (`scoreClip`) is Web-Audio/browser-only, so the Deno warm fn cannot re-score; the panel re-scores when the admin previews the regenerated clip (reuses existing code) so the admin can see whether the re-record is actually good.

---

**Status:** **AUTONOMOUS HALF BUILT & MERGED INERT to develop `d4eb62f` 2026-07-19.** APPROVED to build 2026-07-19 (owner); decisions locked (schedule host = pg_cron→edge; versioning = build now; contention = symlink); refinements A/B/C folded (§11); **EN-32 absorbed, EN-31 paired** (§7). All 13 steps of `plans/plan-2026-07-19-en34-incremental-audio-hosting.yaml` built + gated green (vitest 577/577, tsc 0, e2e 135/0/3, ship dry-run PASS), merged behind inert flags. Live activation (migrations apply, edge deploy, Verpex symlink/cron, `TTS_BUFFER_WRITEBACK` flip, bucket writes) remains operator-gated + staging-first (the `tts-audio` bucket is shared prod+staging). Per-step commits + operator activation sequence: the tracker (EN-34).
