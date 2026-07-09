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
