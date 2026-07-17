# EN-23 — Admin Audio-Management Panel — Requirements

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-23-ADMIN-AUDIO-PANEL-REQUIREMENTS.md
**Description:** Requirements spec for an in-app admin panel to inventory, preview, quality-review, and enqueue-for-regeneration the pre-generated TTS audio produced by EN-8. Folds in the previously-listed "what-is-where" audio panel follow-up. Owner-gated: no coding until this doc is owner-approved (AGENTS §3 requirements gate).
**Author:** Libor Ballaty
**Created:** 2026-07-16
**Last Updated:** 2026-07-17
**Last Updated By:** claude-en23 (owner approval + open-item decisions recorded)

---

## 1. Status

`APPROVED — BUILD (partial-block sequencing)` — owner approved 2026-07-17 with all §10 open items decided (see §10). Coding may proceed on the **EN-8-independent slice** per the sequencing decision below; the server-tier presence check + `pregen --from-queue` consumer remain gated until EN-8 lands on `develop` (see §9).

**★ Sequencing decision (owner 2026-07-17): build the EN-8-independent parts now on `develop`.** EN-8 is not yet on `develop` and its branch (`feat/en8-server-hosted-audio`) is being actively edited by another agent (`claude-en8-audiosave`, device-audio persistence redesign). Rather than branch off a moving base or wait, EN-23 builds the parts that do **not** depend on EN-8 directly on `develop`: the DB migration + tables, clip enumeration, verdict/enqueue reducers + persistence, automated signal derivation (incl. silence scoring), the admin **Audio** tab, and device-cache tier presence. The **server (hosted) tier-presence check** and the `pregen-audio.mjs --from-queue` consumer are **stubbed behind the EN-8 audio-config seam** (feature-detected: shown as "server tier unavailable — pending EN-8" until the config + hosted base exist on `develop`) and wired the moment EN-8 lands. No collision with the active EN-8 agent (disjoint files; EN-23 owns the new admin surface + migration).

## 2. Problem / motivation

EN-8 pre-generates TTS audio and hosts it on the server so the client no longer hits the provider per play (kills 503s, cuts cost). But pre-generated audio can be **wrong** — silent, truncated, wrong voice, mispronounced, or simply low quality — and today there is **no in-app way for an admin to see what audio exists, hear it, judge it, or get a bad clip re-made.** The only tooling is the operator-run CLI (`audit-audio.mjs` coverage check + `pregen-audio.mjs` generator), which reports presence but does not support quality review.

Owner request (2026-07-16): *"a way in admin to review the clips quality, add that to the queue … we should probably have that sooner than later."*

## 3. Decisions locked (owner, 2026-07-16)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Panel scope | **Review + act** — inventory/coverage + play/preview + quality verdict + act (enqueue for regeneration; delete/replace deferred). |
| D2 | Regeneration path | **Enqueue for CLI/batch** — the panel marks clips "needs regeneration"; the existing `pregen-audio.mjs` pipeline (operator-run, staging-first) consumes the queue. **No new runtime write-to-prod path** — respects the gated `TTS_BUFFER_WRITEBACK` / multi-env buffer-contention design. |
| D3 | Quality assessment | **Manual + automated checks** — admin listens and sets a verdict, and the panel surfaces automated per-clip signals (byte size, content-type, duration, silent/too-small flag, tier presence). |

## 4. Minimum viable panel (MVP — "what an admin needs to start")

The smallest coherent review→verdict→enqueue loop. This is the first shippable slice; §8 lists deferred capabilities.

1. **Access** — a new **Audio** tab inside the existing `AdminView` (`src/features/admin/AdminView.tsx`), gated by the existing `profile?.role === 'admin'` check. No new route; reuses the admin modal surface, alongside Review Queues / Content Studio / User Access.
2. **Scope selector** — choose **Level / Track / Situation** (default **Level 0**, the warm set). Drives the clip list via `contentRepository.listSituations({ level | trackId | situationId })` → `linesForSituation()` (already enumerates dialogue + phrase patterns + vocabulary + roleplay NPC nodes).
3. **Coverage + signals list** — one row per enumerated `(voice, text)` clip, showing:
   - text, voice, and the derived `buildKey`;
   - **tier presence**: device cache? server (hosted)? missing? (server presence via a HEAD/GET to the EN-8 server base per `buildKey`);
   - **automated quality signals**: byte size, content-type, duration, and a **suspicious flag** (too-small / zero-duration / wrong content-type) so a 500+-clip set is triageable without hearing every one.
   - **automated silence/loudness scoring (pulled forward from §8 — owner 2026-07-17):** decode the clip (Web Audio `decodeAudioData` on the PCM/blob) and compute a coarse **RMS/peak level** + **silent-ratio** (fraction of frames below a dB floor). Feeds two additional suspicious sub-flags — **silent** (near-zero RMS across the clip) and **leading/trailing-dead-air / truncated** (silent head or tail beyond a threshold) — so the suspicious triage is stronger than the byte/duration heuristic alone. Persisted as signal fields (see §5). Runs client-side in the panel; no server dependency (works on device-cache clips today, hosted clips once EN-8 lands).
4. **Preview** — play any clip inline (from device cache or the hosted server URL) to judge quality by ear.
5. **Verdict** — set **good / bad / re-record** per clip; **persisted** (survives reload; review is resumable across sessions).
6. **Enqueue** — flag bad/re-record clips into a **regeneration queue** that `pregen-audio.mjs` consumes. Panel does not itself write audio to storage.

**Success criterion for MVP:** an admin can, for Level 0, see coverage + signals, listen, mark verdicts, and enqueue every bad clip — and an operator run of `pregen-audio.mjs --from-queue` regenerates exactly those clips (staging first).

## 5. Data model (new — no audio-metadata store exists today)

Two small persisted stores are required. Proposed as Postgres tables so verdicts/queue are shared across admins and consumable by the CLI (service-role). Exact columns to be finalized at build; shape:

- **`public.tts_audio_review`** — one row per reviewed clip:
  `build_key (text, pk)`, `voice (text)`, `text (text)`, `situation_id (text)`, `level (smallint)`, `verdict (text: good|bad|re_record|unreviewed)`, `signal_bytes (int)`, `signal_content_type (text)`, `signal_duration_ms (int)`, `signal_suspicious (bool)`, `reviewed_by (uuid)`, `reviewed_at (timestamptz)`, `notes (text)`.
  Silence/loudness scoring fields (§4 automated signals): `signal_rms_dbfs (real)`, `signal_peak_dbfs (real)`, `signal_silent_ratio (real)`, `signal_silent (bool)`, `signal_dead_air_ms (int)` (leading+trailing), `signal_scored_at (timestamptz)`.
- **`public.tts_audio_regen_queue`** — clips flagged for (re)generation:
  `build_key (text)`, `voice (text)`, `text (text)`, `situation_id (text)`, `level (smallint)`, `reason (text)`, `enqueued_by (uuid)`, `enqueued_at (timestamptz)`, `status (text: pending|claimed|done|failed)`, `claimed_at`, `completed_at`. `pregen-audio.mjs` reads `status='pending'`, sets `claimed`→`done/failed`.

**Migration:** new numbered migration via `node apply-migrations.js` (psql fails on cloud); coordinate the number with the DB/EN-8 agent (EN-8 already used `00012`/`00013`). **RLS:** admin-only SELECT/INSERT/UPDATE (`public.is_admin()`), matching the EN-15 admin pattern; CLI uses the service-role path.

*(Alternative considered: store verdicts/queue as a JSON artifact rather than DB tables. Rejected for the shared/multi-admin + CLI-consumer case — a table is the natural join point and gives RLS + indexing for free. Open to a JSON MVP if the owner prefers zero schema churn — see §10.)*

## 6. Access, security, observability

- **Access:** admin-only, reusing `profile?.role === 'admin'`. No new auth surface.
- **RLS:** the two new tables are admin-scoped (see §5). Server-tier presence checks are unauthenticated GET/HEAD to the public hosted files (already public per bucket/Verpex static).
- **Observability (mandatory, per global contract):** every failure path (server-presence check fails, preview fetch fails, verdict/enqueue write fails, migration/RLS denial) routes through the canonical logger (`src/lib/logger.ts`) with `correlation_id`/`session_id`/`request_id`, and the admin-visible surface uses `userMessage(code, message, ref)` so the admin sees a code + support `Ref`. No bare console. No hardcoded server-base fallback — the server base comes from the EN-8 audio config; missing config fails loudly.

## 7. Reuse (build on existing, do not duplicate)

- Admin shell + gate: `src/features/admin/AdminView.tsx`, `src/App.tsx` (role gate at :315/:527).
- Key + tiers: `audioCache.buildKey(...)`, `synthesizeCached` tier path (`src/services/geminiService.ts`), EN-8 server-base config.
- Enumeration: `linesForSituation()` (`src/lib/audio-download.ts`), `contentRepository.listSituations/listTracks` (`src/content/repository.ts`).
- CLI pipeline: `scripts/audit-audio.mjs` (coverage logic to mirror), `scripts/pregen-audio.mjs` (extend with a `--from-queue` consumer).
- Observability: `src/lib/logger.ts` (`logger.*`, `userMessage`), `public.logs` (migrations `00001`/`00010`).

## 8. Deferred (post-MVP, tracked here so nothing is buried)

- Bulk verdicts / bulk enqueue; keyboard-driven rapid review.
- Delete/replace a hosted clip directly from the panel (write-to-storage — gated with the EN-8 buffer-contention design).
- ~~Automated silence/loudness scoring (waveform analysis) beyond byte/duration heuristics.~~ **PULLED FORWARD into MVP (owner 2026-07-17) — see §4/§5.** (A deeper waveform pass — e.g. per-phoneme clipping, spectral checks — remains deferred beyond the coarse RMS/peak/silent-ratio MVP scoring.)
- Version/diff view when a clip is re-generated (compare old vs new).
- Provider/voice A–B comparison; per-clip playback-speed QA.
- Live "generation status" tail (ties EN-12 admin log viewer over `public.logs`).

## 9. Dependencies & coordination

- **BLOCKED-BY EN-8 landing on `develop`** (EN-8 Phase 2): the server-tier lookup config, hosted files, and the `audit-audio.mjs`/`pregen-audio.mjs` scripts currently live on `feat/en8-server-hosted-audio`, not `develop`. EN-23 builds on them.
- **Ties EN-12** (admin log viewer) — shares the admin surface + observability pivot; the deferred "generation status tail" would reuse EN-12.
- **DB coordination** — migration numbering with the DB/EN-8 agent.
- **Governance** — regeneration is operator-run, staging-first; the panel never writes audio to prod storage directly (D2). `pregen-audio.mjs --from-queue` runs under the same approval gate as the rest of EN-8.

## 10. Open items for owner — RESOLVED (owner 2026-07-17)

1. **Verdict/queue store** → **Postgres tables** (§5). `tts_audio_review` + `tts_audio_regen_queue` with admin RLS; CLI consumes via service-role. JSON-artifact alternative rejected.
2. **Default scope** → **Level 0** confirmed as the landing scope for the first release.
3. **Verdict vocabulary** → **good / bad / re-record** (three-state), with the free-text `notes` field capturing the "why". Finer reason taxonomy deferred to §8.
4. **MVP boundary** → **§4 as-is, plus automated silence/loudness scoring pulled forward** from §8 (see §4 signal list + §5 signal fields). All other §8 items remain deferred.
5. **Sequencing** (added at approval) → **build the EN-8-independent slice now on `develop`**; server-tier presence + `pregen --from-queue` gated behind EN-8 landing (see §1, §9).

## 11. Test plan (on approval)

- Unit: enumeration→row mapping (scope filter → expected clips incl. roleplay nodes); automated-signal derivation (small/zero-duration/wrong-type → suspicious); verdict + enqueue reducers.
- Integration: verdict/enqueue persist and reload; `pregen-audio.mjs --from-queue` consumes `status='pending'` and transitions rows.
- e2e (admin flow): open Admin → Audio tab → Level 0 → list renders with signals → play a clip → mark bad → assert it appears in the regen queue. Full regression gate before staging (AGENTS §3).
