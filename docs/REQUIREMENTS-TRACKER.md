# FalaMadeira — Requirements Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/REQUIREMENTS-TRACKER.md
**Description:** Requirements register for the full FalaMadeira product. Each requirement maps to its source (design target section), the plan step(s) that deliver it, and current status. Full-product scope (not MVP) per the 2026-07-09 directive. Keep in sync with docs/PRODUCT-DESIGN-TARGET.md and plans/plan-2026-07-08-production-readiness.yaml.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** design-enhancement session

Status legend: ✅ done · 🔵 in plan (not started) · 🟡 partial · ⬜ needs plan step · ❓ decision needed

## Foundation (already delivered this session)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| F1 | Build works; deps hygiene | fix-build, dependency-hygiene | ✅ |
| F2 | DB canonical (00003/00004 live), runner fixed, docs reconciled | fix-migration-runner…db-docs-reconcile | ✅ |
| F3 | Admin account seeded | seed-admin-account | ✅ |
| F4 | Gemini/delete-account edge functions, key server-side, voice limit | edge-fn-gemini, edge-fn-account-deletion | ✅ (chat/tts verified) |
| F5 | Gemini TTS reliability (validate+retry for OTHER defect) | edge-fn-gemini (troubleshoot) | ✅ |

## AI tutor & TTS/audio
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| T1 | Client calls edge functions (key out of bundle) | client-gemini-refactor | 🔵 |
| T2 | **TTS provider adapter pattern** (Browser/Azure/Google/ElevenLabs/OpenAI/Polly/Gemini) | NEW tts-provider-adapters | ⬜ |
| T3 | Server-side default + automatic fallback chain | NEW tts-provider-adapters | ⬜ |
| T4 | Per-user provider choice + bring-your-own-key | NEW tts-user-provider-choice | ⬜ |
| T5 | Native pt-PT default voice (authenticity) | NEW tts-provider-adapters | ⬜ |
| T6 | Audio cache bounded (LRU+size), key drops speed, adds provider/voice | perf-load-and-audio, efficiency-cost-controls | 🔵 |
| T7 | Configurable offline audio (on/off, size, clear, usage) | NEW offline-audio-controls | ⬜ |
| T8 | Offline download (lesson/month pre-cache) | NEW offline-download | ⬜ |
| T9 | Prompt hardening (level-lock, correction strategy, pt-PT enforce) | prompt-hardening | 🔵 |

## Learning modes (first-class Practice hub)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| M0 | **Practice hub** IA (choose a mode) | NEW practice-hub | ⬜ |
| M1 | Conversation mode | (existing) surfaced in hub | 🟡 |
| M2 | Listening — playback | (existing) | 🟡 |
| M3 | Listening — comprehension exercises | NEW mode-listening-comprehension | ⬜ |
| M4 | Speaking — pronunciation feedback/shadowing | NEW mode-pronunciation | ⬜ |
| M5 | Vocabulary flashcards + **SRS** | NEW mode-vocab-srs, quiz-persistence | ⬜/🔵 |
| M6 | Reading — graded texts, tap-to-translate | NEW mode-reading | ⬜ |
| M7 | Writing — composition + dictation w/ feedback | NEW mode-writing | ⬜ |
| M8 | Grammar drills | NEW mode-grammar-drills | ⬜ |
| M9 | Quiz — lesson-specific, adaptive | quiz-persistence (enhance) | 🔵 |
| M10 | SRS scheduler + "Review due" surfacing | NEW srs-engine | ⬜ |

## UX / design system
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| U1 | Dark mode | NEW dark-mode (was in config-and-dead-code scope) | ⬜ |
| U2 | Desktop responsive (sidebar + multi-column) | NEW responsive-desktop | ⬜ |
| U3 | Type scale tokens | (index.css) split-app-components/dark-mode | 🔵 |
| U4 | AA contrast fix (muted gray fails 4.5:1) | accessibility-pass | 🔵 |
| U5 | WCAG 2.2 AA (labels, keyboard, targets, pinch-zoom, reflow) | accessibility-pass | 🔵 |
| U6 | Onboarding first-run (60s first win) | NEW onboarding-flow | ⬜ |
| U7 | Home: progress ring + competence line | NEW home-progress | ⬜ |
| U8 | Home: Review-due card | srs-engine + home-progress | ⬜ |
| U9 | Skeleton loaders / calm loading states | NEW loading-states | ⬜ |
| U10 | Microinteractions (tasteful) | (within screens) | 🟡 |
| U11 | Revise mockup to reflect all target changes | NEW mockup-v2 | ⬜ |

## Gamification & motivation (calm/honest)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| G1 | Streak-freeze / grace (non-punitive) | NEW streak-freeze | ⬜ |
| G2 | Encouraging quiz feedback tone | mode-quiz / content | 🔵 |
| G3 | No hearts/energy/paywalled-practice patterns | (design guardrail) | ✅ (by omission) |

## Content
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| C1 | Content standards + validator | content-standards | 🔵 |
| C2 | **Full 6-month curriculum (~168 lessons)** | curriculum-normalize-author (rescope up) | ❓ scope change |
| C3 | Real video per week (24 weeks) | video-curation | 🔵 |
| C4 | Cultural depth + grammar explanations | curriculum-normalize-author | 🔵 |

## Platform / security / ops
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| P1 | Engineering standards (reviewed + maintained) | engineering-standards, standards-compliance-review | 🔵 |
| P2 | Centralized logger/observability | centralized-logger, analytics-telemetry | 🔵 |
| P3 | UUID FK integrity | safety-hardening (00007) | 🔵 |
| P4 | Legal + first-run consent (GDPR/EU AI Act) | legal-pages, onboarding-flow | 🔵 |
| P5 | Payments deferred — free launch, architecture retained (no Stripe now) | payments-deferred | 🔵 (decided 2026-07-09) |
| P6 | Vertical-slice + Playwright + smoke testing | vertical-slice-* , post-deploy-smoke | 🔵 |
| P7 | Local from-device deploy pipeline (Verpex) | deploy-pipeline-entrypoint, verpex-deploy | 🔵 |
| P8 | PWA assets + offline caching | pwa-assets, offline-caching | 🔵 |

> Authoritative plan (2026-07-09): `plans/plan-2026-07-09-full-product.yaml` (55 steps) SUPERSEDES the 07-08 plan. Content-model-first, voice-first, cross-platform.
> Audit findings/defects: see `docs/AUDIT-FIX-TRACKER.md` (verification/reconciliation/drift/standards passes; open items A3/A5/A6 + verify A2/A4).

## Cross-platform delivery (iOS-first, then Android; minimize recoding)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| X1 | Stack retained: React 19 + TS + Vite 6 + Tailwind 4 + Supabase + PWA | (baseline) | ✅ |
| X2 | **Capacitor** wraps the web app → iOS (first) + Android (later) from one codebase | capacitor-setup | ⬜ |
| X3 | **Platform-adapter layer** (Speech/Audio/Storage/Notifications) — web + native impls behind interfaces; UI is platform-agnostic | platform-adapter-layer | ⬜ |
| X4 | STT adapter (Web Speech on web, native plugin on iOS/Android, cloud fallback) — iOS Safari Web Speech unreliable | stt-speech-adapter | ⬜ |
| X5 | iOS build + TestFlight | ios-build | ⬜ |
| X6 | No UI rewrite required for Android (proven via adapter layer) | (X3 outcome) | ⬜ |

## Content architecture & navigation (2026-07-09 reframe — see docs/CONTENT-ARCHITECTURE.md)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| A1 | Situation-as-atom content model (data-driven) | NEW content-model-schema | ⬜ |
| A2 | Content Packs (add curriculum as data, versioned) | NEW content-packs | ⬜ |
| A3 | Goal Tracks (Survival/Host/Social/Bureaucracy/Work) | NEW goal-tracks | ⬜ |
| A4 | Practical Levels 0–5 (+ CEFR background) | content-model-schema | ⬜ |
| A5 | **Structured Course path (month-by-month) retained** | NEW path-structured-course | ⬜ |
| A6 | Goal-Track path | NEW path-goal-track | ⬜ |
| A7 | Adaptive Guided daily-session path (app-as-tutor default) | NEW path-adaptive-guided | ⬜ |
| A8 | Free / self-directed navigation (no hard gating; soft prereqs) | NEW navigation-nonlinear | ⬜ |
| A9 | Placement question at onboarding sets start level | onboarding-flow | 🔵 |
| A10 | Daily session template (configurable segments) | path-adaptive-guided | ⬜ |
| A11 | Core loop Hear→Understand→Repeat→Vary→Respond→Use→Review | (engines) | ⬜ |
| A12 | Content Creation Studio (admin authoring/validate/publish) | NEW content-studio | ⬜ |
| A13 | Multi-voice speaker variety (teacher/local/older/younger/service/phone/noisy) | tts-provider-adapters | 🔵 |
| A14 | Seed the existing 56 lessons into Situations/Structured Course | NEW seed-content-migration | ⬜ |

## Voice-first modules/engines (reframe of "learning modes")
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| E1 | Listening Engine (speeds, multi-voice, noise, transcript, dictation) | mode-listening-comprehension (expand) | ⬜ |
| E2 | Speaking Coach (repeat/shadow/response-speed) | mode-pronunciation (expand) | ⬜ |
| E3 | Pronunciation Trainer (record-compare, rhythm/stress) | mode-pronunciation | ⬜ |
| E4 | Pattern Builder (substitution drills) | NEW mode-pattern-builder | ⬜ |
| E5 | Situation Simulator (branching roleplay L1–L5) | NEW mode-situation-simulator | ⬜ |
| E6 | Real-World Missions (prep→do→after-action) | NEW mode-missions | ⬜ |
| E7 | Cultural Context Layer | NEW cultural-layer | ⬜ |
| E8 | Adaptive Review — 4-dimension (hear/say/retrieve/avoid) | srs-engine (expand) | ⬜ |
| E9 | AI roles: partner/coach/scenario-gen/error-analyst/context-explainer | prompt-hardening (expand) | 🔵 |
| E10 | Phrase Library (smart, searchable) | NEW phrase-library | ⬜ |

## Feedback & Focus loop (the Coach)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| FB1 | Micro feedback: every exercise emits a graded result + immediate forgiving feedback | (per engine) | ⬜ |
| FB2 | Results capture: quiz/pronunciation/listening/roleplay stored per-item | quiz-persistence, pronunciation/listening/simulator modes | 🔵 |
| FB3 | Coach/Insights engine: aggregate signals → ranked focus (severity × goal × urgency × recency/avoidance) | NEW coach-insights-engine | ⬜ |
| FB4 | Home "Focus" card (top 1–3, one-tap action) | home-progress (expand) | ⬜ |
| FB5 | After-session recap (strengths/shaky/review added) | coach-insights-engine | ⬜ |
| FB6 | Weekly insight (progress + next focus) | coach-insights-engine | ⬜ |
| FB7 | Explainable "why this suggestion?" | coach-insights-engine | ⬜ |
| FB8 | Suggestions feed the Adaptive Guided path (closed loop) | path-adaptive-guided | ⬜ |
| FB9 | Deterministic offline scoring/prioritization + AI narrative online w/ fallback | coach-insights-engine, stability-async-hardening | ⬜ |
| FB10 | Positive/competence-framed tone (no scolding) | (design guardrail) | ⬜ |

## Reliability / resilience / offline (SW design)
| ID | Requirement | Plan step | Status |
|---|---|---|---|
| R1 | Content packs + audio cached per track/level | offline-download (expand) | 🔵 |
| R2 | Offline practice (listen/shadow/pattern/vocab/review/read) | offline-caching, offline-download | 🔵 |
| R3 | Offline write queue + sync on reconnect (conflict-safe) | NEW offline-sync-queue | ⬜ |
| R4 | Graceful degradation for online-only AI features | stability-async-hardening | 🔵 |
| R5 | Pack integrity (checksum) + content versioning | content-packs | ⬜ |

## Decisions resolved (2026-07-09)
- **C2:** Full 6-month curriculum (~168 lessons) — CONFIRMED.
- **P5:** No payments this build (free launch); premium architecture retained — CONFIRMED.
- **TTS default:** Azure AI Speech pt-PT default + browser Web Speech fallback — CONFIRMED (needs Azure Speech key from owner).

## Open items
- Azure Speech key needed before tts-provider-adapters can use Azure as live default (browser fallback works meanwhile).
- Owner has additional design insight to provide (pending) before further build.

## Live-testing bug queue (owner-found 2026-07-11, post-v1.0.0 deploy)

| ID | Finding | Diagnosis so far | Status |
|---|---|---|---|
| LT1 | Suggest-a-video form "doesn't work at all" | Backend PROVEN working (direct insert into video_suggestions with the exact client shape succeeded + cleaned up). Bug is client-side in SuggestVideoModal/useLessonModals submit wiring — prime suspects: the validateUrl/validation layer or the a11y form refactor. | ⬜ open |
| LT2 | Vocabulary lookup modal doesn't work | Not yet investigated (session context exhausted). Same class as LT1 — VocabLookupModal → geminiService.translateWord → edge `translate` action. Test the edge action directly first (pattern: the node auth+invoke probe used for chat/tts), then the modal wiring. | ⬜ open |
| LT3 | Phrase audio icons appear dead | Chain verified WORKING — but first-play TTS latency is ~5.7s with no loading indicator. Fix: spinner on the icon + set Azure Speech key (sub-second TTS; adapter chain flips automatically). Cached replays are instant. | ⬜ open |
| LT4 | "Tutor is preparing your lesson" very slow | Verified: generate-lesson 14.7s + 1.5s hardcoded sleep + second AI round-trip = 20-30s with only a spinner. Fix: staged progress copy, drop the sleep, parallelize, consider streaming. | ⬜ open |
| LT5 | Report-correction form also doesn't work | ROOT CAUSE IDENTIFIED (owner detail: "they don't allow entering or copying in text"): NESTED FOCUS TRAPS. The accessibility-pass added useFocusTrap to all 15 dialogs; LessonDetailModal (parent, trapped) opens Correction/SuggestVideo/VocabLookup as CHILD dialogs (also trapped) — the parent's trap sees focus land in the child (outside its container) and forcibly reclaims it, so child inputs can never hold focus -> no typing, no paste. FIX: make useFocusTrap stack-aware — only the TOPMOST trap is active (module-level trap stack: push on mount, pop on unmount; a trap only enforces when it is top-of-stack). One fix repairs LT1+LT2+LT5 simultaneously. Then e2e: type-into-and-submit each of the three forms (S4). | ⬜ open — diagnosed |
| LT6 | **Tutor switching broken in production** — `profiles.selected_tutor_id` column DOES NOT EXIST in the live DB; every "Choose Your Tutor" pick 400s (PGRST204), the error is swallowed and the modal sticks open. Found by e2e run 2026-07-13 (docs/E2E-LIVE-RUN-TRACKER.md EF-10), verified by direct PATCH probe + live column list. FIX: migration 00009 (authored by test agent; **applied live by runner 2026-07-13** — column + 't1' default verified). | e2e run 2: tutor switch persists + restores end-to-end | ✅ fixed+verified |
| LT7 | **Admin Review "Requests" queue permanently empty** — live `lesson_requests` SELECT RLS is `auth.uid() = user_id` with NO `OR is_admin()` (corrections/tickets/videos all have it). Admin can never see users' theme requests. Verified via pg_policy + admin REST probe (E2E-LIVE-RUN-TRACKER EF-3). FIX: migration 00009 (**applied live by runner 2026-07-13** — policy now `(auth.uid() = user_id) OR is_admin()`, verified via pg_policy + run-2 UI). | e2e run 2: seeded request visible in Admin Review | ✅ fixed+verified |
| LT8 | **Latent race: admin mount can clobber global voice limit** — `useSettings.ts:289-300` write-back effect fires when `profile` loads; if before the run-once `fetchGlobalSettings` resolves, it upserts the localStorage/default value (30) over the DB value (5). Did NOT fire in the observed run (`updated_at` untouched) but structurally possible. FIX: dirty-flag so write-back only fires after user interaction or after the fetched value applied. (E2E-LIVE-RUN-TRACKER PF-3) | Found by code triage 2026-07-13 | ⬜ open |
| LT9 | **Offline practice grades silently dropped (4 engines)** — VocabularyView, missionsStore, simulator/progress, speaking/attempts all resolve identity via NETWORK `supabase.auth.getUser()`; when offline (or auth endpoint unreachable) they mount "signed out" and drop every grade/attempt/progress write — the offline sync-queue is never engaged. Found by e2e user/30 + Lane B instrumented probe (E2E-LIVE-RUN-TRACKER EF-29). FIX applied commit 869dc7c — FIVE sites (the four engines + useAuth boot; the fifth also made an offline PWA reload land on the AuthScreen). All → local `auth.getSession()`. Probe-verified enqueue + reconnect drain + offline-reload session retention; user/30 passes solo. | e2e + instrumented probes 2026-07-13 | ✅ fixed+verified |

## Future enhancements (owner-requested, post-v1.0.0)

| ID | Requirement | Notes | Status |
|---|---|---|---|
| FE1 | **User-replaceable lesson videos** — wherever a video appears, let the learner swap in a YouTube video of their own choosing (per-user override, stored per situation/lesson; validated via oEmbed before accepting; original curated video restorable). Reduces reliance on our curation buildout. Requested 2026-07-11. Suggested shape: `user_video_overrides` table (user_id, situation_id, url) w/ owner RLS + a small "replace video" affordance on the VideoPlayer; admin/community promotion path later via the existing video_suggestions flow. | Owner: "if the user can put their own then we don't have to rely only on our buildout" | ⬜ |
| FE2 | **Recurring video-link audit** — periodically re-verify every video URL (oEmbed 200 AND embeddable — note oEmbed 200 does not guarantee embedding is allowed) across BOTH the content pack media[] and the legacy lessons video_url; replace or drop dead links. First audit found S2_YmG_l-p4 dead in legacy data after the pack was already fixed (surfaces the dual-source risk — see FE3). Candidate: extend scripts/validate-content.mjs with a --check-videos flag + a scheduled run. | Found live by owner on lesson d1, 2026-07-11 | ⬜ |
| FE3 | **Single video source of truth** — LessonDetailModal renders legacy `lesson.video_url` while SituationPicker renders pack `media[]`; converge the Learning tab onto the situation pack so video fixes land once. | Root cause of the d1 dead video | ⬜ |
