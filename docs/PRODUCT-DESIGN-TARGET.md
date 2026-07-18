# FalaMadeira — Product Design & Requirements Target

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/PRODUCT-DESIGN-TARGET.md
**Description:** Canonical target definition for the *complete* FalaMadeira product (not an MVP). Captures vision, UX principles, learning modes, curriculum scope, the TTS/audio architecture, AI-tutor architecture, design system, screen IA, gamification, onboarding, offline/PWA, and the data model. This is the source of truth the plan and trackers derive from. When code and this doc disagree, reconcile explicitly.
**Author:** Libor Ballaty
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** design-enhancement session

> Scope directive (2026-07-09): the owner is building the **full product**, not an MVP. Where earlier decisions narrowed scope for a faster launch (e.g. 3-month curriculum, free-only, defer SRS/reading/writing), this document supersedes them toward the comprehensive target. Launch sequencing may still stage delivery, but the *target* is the whole thing.

> Reframe (2026-07-09): the product is a **voice-first, situation-driven language operating system for living in Madeira**, not a linear course. Content, practice modes, and sequencing are separated so curriculum is **modular** (added as data "packs") and **non-linear** (user chooses track/level/situation/mode; nothing hard-gated). The month-by-month **Structured Course is retained as one path type** for learners who want strict structure, alongside Goal Tracks, an Adaptive Guided daily session (app-as-tutor default), and Free navigation. The authoritative design for this lives in **docs/CONTENT-ARCHITECTURE.md**; sections 4–5 below are summarized there and that doc governs on any conflict.

---

## 1. Vision & positioning

FalaMadeira teaches **European Portuguese with an authentic Madeiran-dialect focus** through AI-powered conversation and a structured, multi-modal curriculum. It fills a gap mainstream apps (Duolingo, Babbel) ignore: real Madeiran pronunciation, vocabulary, and culture.

**Identity:** *Calm, honest, culturally-rich micro-learning for European Portuguese* — Busuu's restraint and Babbel's structure, with enough warmth and habit to keep learners returning, and none of the manipulation. Positioned toward serious adult learners (expats, heritage learners, the culturally curious), not casual gamers.

## 2. Target users

- **Expats/relocators** to Madeira needing practical, dialect-correct conversation.
- **Heritage learners** reconnecting with family/cultural roots.
- **Serious language enthusiasts** who want European (not Brazilian) Portuguese and cultural depth.
- **Tourists** preparing for a trip (secondary).

## 3. Design principles (the characteristics we are building to)

1. **Calm & focused, not loud** — one primary action per screen, generous whitespace, gentle motion.
2. **Honest & non-manipulative** — streaks/XP celebrate, never punish; no hearts/energy that block practice; truthful scope; real consent; no dead/stub features.
3. **Micro-learning** — every practice unit completable in under 5 minutes, resumable.
4. **Progressive disclosure** — surface today's action; reveal complexity on demand.
5. **Thumb-first & reachable** — bottom nav on mobile, primary CTAs in the lower reach zone, 44–48px touch targets.
6. **Accessible by default (WCAG 2.2 AA)** — 4.5:1 text contrast, real labels, keyboard nav, no color-only signals, pinch-zoom enabled, reflow at 400%, screen-reader support.
7. **Progress made visible → competence** — show what the learner can now *do*, not just points.
8. **Grounded in learning science** — spaced repetition, AI targeting weak spots, comprehensible input.
9. **Warm & human** — Madeiran character, tutor personalities, encouraging tone, tasteful microinteractions.
10. **Forgiving & native-feeling PWA** — undo, non-destructive defaults, confirm-before-destroy, offline support, skeleton loaders, installable.

## 4. Learning modes (FIRST-CLASS — the "Practice" hub)

Learning modes become a **first-class information-architecture concept**: a dedicated **Practice hub** where the learner explicitly chooses how to practise, rather than modes being scattered/hidden. The full product includes ALL of the following:

| Mode | Description | Current status | Target |
|---|---|---|---|
| **Conversation** | AI tutor role-play, lesson-linked + free chat; 5 drill mechanics (interruption, scenario-switch, misunderstanding, continuous-speech, escalation) | ✅ Strong | Keep; add mode entry in hub |
| **Listening — playback** | Hear phrases/vocab in authentic pt-PT | ✅ Basic | Keep |
| **Listening — comprehension** | Hear a dialogue, answer what was said/meant | ❌ Missing | Build |
| **Speaking — pronunciation** | Record-and-compare / shadowing with feedback/scoring | ❌ Missing | Build (uses STT + scoring) |
| **Vocabulary — flashcards + SRS** | Spaced-repetition review of words/phrases | ⚠️ Quiz once, no SRS | Build full SRS |
| **Reading** | Graded texts / cultural snippets with tap-to-translate | ⚠️ Patterns only | Build graded reading |
| **Writing** | Composition & dictation with AI feedback | ❌ Missing | Build |
| **Grammar drills** | Targeted pattern/conjugation practice | ⚠️ Implicit | Build explicit drills |
| **Quiz / recall** | Lesson-specific mixed testing | ✅ Basic | Enhance (lesson-specific, adaptive) |

**Spaced Repetition System (SRS):** an SM-2-style scheduler tracks per-item ease/interval, surfaces a calm **"Review due"** card on Home, and feeds the Vocabulary and Grammar modes. Backed by `srs_items` + `quiz_results` tables.

## 5. Curriculum & content scope (FULL — see docs/CONTENT-ARCHITECTURE.md for the model)

- **Modular, non-linear content:** the atom is a **Situation** (real Madeira scenario) bundled into **Packs** (add curriculum as data, not code), organized by **Goal Tracks** (Survival, Property Host, Social, Bureaucracy, Work) and **practical Levels 0–5** (CEFR mapped in background).
- **Structured Course retained:** the built-in **month-by-month 6-month course** (28 lessons/month ≈ 168 units, A1→B2: Foundations, Deepening, Past&Future/Fluency, Local Slang&Culture, Social Mastery, Full Immersion) remains a first-class **path type** for learners who want strict structure — delivered as an ordered path over the content, not the only way through.
- **Content standards** enforced by `docs/CONTENT-STANDARDS.md` + `scripts/validate-content.mjs` (European-Portuguese-only, prohibited Brazilian forms, Madeiran markers, per-lesson minimums, day uniqueness).
- **Per-lesson structure:** context → patterns → vocabulary (with pronunciation) → video → practice (multi-mode) → quiz.
- **Video:** ≥1 curated real video per week block (all 24 weeks); remove placeholder IDs.
- **Cultural depth:** Madeiran geography, traditions, festivals, food, history woven through.
- **Grammar:** explicit explanations per lesson where a new structure is introduced.

## 6. TTS / audio architecture (provider adapters)

**Adapter/connector pattern** — a `TtsProvider` interface with interchangeable connectors, so provider choice is config, not code:

- **Connectors:** Browser Web Speech API (free/local), Azure AI Speech (native pt-PT, recommended default), Google Cloud TTS (Chirp3-HD pt-PT), ElevenLabs (premium quality), OpenAI TTS, Amazon Polly, Gemini TTS (current, retry-hardened).
- **Selection criteria captured:** pt-PT authenticity, voice quality/naturalness, free tier, cost/1M chars, reliability. (See comparison table in session notes / tracker.)
- **Default (decided 2026-07-09): Azure AI Speech native pt-PT**, with **browser Web Speech API as the fallback**. Config-driven; **automatic fallback chain** (Azure → … → browser Web Speech API last resort). Needs an Azure Speech key (operator to provide).
- **Per-user override** — a Profile setting to pick a provider, including **bring-your-own-key** for users with their own Azure/ElevenLabs/etc. account.
- **Authenticity requirement:** default voices MUST be native European Portuguese (pt-PT), not generic multilingual — this is pedagogical, not cosmetic.
- **Gemini TTS reliability:** validated + retried (documented intermittent `finishReason=OTHER` empty-audio defect, rate-correlated; see `supabase/functions/_shared/gemini.ts`).

### Audio caching (on-device, configurable)

- IndexedDB cache (`FalaMadeiraAudioCache`) already stores generated phrases once. Enhancements:
  - **Bounded** — LRU eviction + size cap (currently unbounded).
  - **Key fix** — drop playback `speed` from the key (apply playbackRate on playback); include **provider + voice** in the key.
  - **Configurable in Settings:** offline audio on/off; cache size limit (e.g. 50/200 MB/Unlimited) with live usage readout; Clear cache.
  - **Offline download** — "Download this lesson/month for offline" pre-generates and stores all phrases so learners can practise with no signal.

## 7. AI tutor architecture

- All Gemini access via **authenticated Supabase Edge Functions** (`ai-gateway`, `delete-account`); API key server-side only (never in bundle).
- Actions: chat (history-based), generate-lesson, translate, tts. JWT-verified; **server-side voice-limit enforcement**.
- **Prompt hardening (target):** level-locking to the learner's unlocked level + known vocabulary; explicit correction strategy (recast + brief note); pt-PT/Madeiran enforcement with prohibited Brazilian forms; content-safety boundaries.
- Structured error envelopes with correlation IDs (centralized error-handling standard).

## 8. Design system

- **Base:** iOS aesthetic — SF Pro, `#007AFF` accent, rounded white cards, subtle shadows, blur, safe-area, framer-motion transitions.
- **Dark mode** — full support, respects system preference.
- **Responsive** — mobile: bottom tab bar; **desktop: persistent sidebar + multi-column** (no more 384px-locked column on large screens).
- **Type scale** — consistent tokens (replace ad-hoc `[10px]`/`text-xs` sprawl).
- **Contrast fix** — current muted gray `#8E8E93` on white is ~3.5:1 (fails AA); darken to meet 4.5:1.
- **Touch targets** — ≥44px with padded hit areas.
- **Microinteractions** — instant, tasteful feedback; skeleton loaders for perceived speed.

## 9. Screen / information architecture

- **Home** — greeting, streak/XP, **month-progress ring + competence line** ("you can now order food, ask directions"), today's lesson CTA, **"Review due" (SRS) card**, recent activity.
- **Learning** — 6-month curriculum; month selector; day list with completion/lock states; lesson detail sheet (video, goals, grammar, patterns w/ audio, vocab, → Practice hub, → Quiz).
- **Practice** (NEW hub) — pick a mode: Conversation / Listening / Pronunciation / Vocabulary(SRS) / Reading / Writing / Grammar / Quiz.
- **Tutor** — conversation (lesson-linked & free), tutor selection, Help mode.
- **Profile** — account, audio (speed, **voice provider**, offline-audio controls), tutor, **My submissions** (correction/request/ticket status), legal (Terms/Privacy/AI-use), install, change password, delete account.
- **Onboarding (NEW)** — gentle first-run: a light placement question + one 60-second successful exchange (win in the first session). No feature-tour walls.

## 10. Gamification & motivation (calm, honest)

- Streaks + XP that **celebrate**; **streak-freeze/grace** so a missed day isn't punitive.
- Visible progress framed as **competence** (what you can do), not just points.
- Small wins, encouraging quiz feedback tone (never scolding).
- **No** hearts/energy/paywalled-practice dark patterns.

## 11. Monetization (target)

- **Decision 2026-07-09: free launch, NO payments in this build.** The premium-tier *architecture* is retained (`subscription_tier`, voice limits, server-side entitlement seams) so Stripe can be added later without rework, but no Stripe integration ships now. Premium perks reserved for later: unlimited voice, premium TTS voices, offline downloads, advanced modes.

## 12. Offline / PWA

- Installable PWA; real icon set; Workbox runtime caching (app shell precache, network-first Supabase reads with offline fallback).
- **Offline practice:** bundled lesson data + downloaded audio → lessons, vocab, and listening work offline; AI chat/pronunciation-scoring remain online (stated clearly in UI).

## 13. Data model additions (beyond current 8 tables)

- `quiz_results` — per-attempt score/misses (foundation for adaptivity).
- `srs_items` — per-item ease/interval/next-review (SM-2).
- Profile additions — `tts_provider`, `tts_byo_key_ref` (secure), `offline_audio_enabled`, `cache_limit_mb`, `streak_freezes`.
- `writing_submissions` / `pronunciation_attempts` (for the new modes, with feedback).
- FK integrity: migrate `video_suggestions`/`lesson_corrections` TEXT ids → UUID FKs.

## 14. Non-goals / boundaries

- Not a certification/exam product. Not replacing immersion. Not teaching grammar theory in isolation (grammar serves conversation). Not Brazilian Portuguese.

## 15. Accessibility & compliance

- WCAG 2.2 AA target. GDPR (SearchingFool, Czech Republic controller; contact support@searchingfool.com). EU AI Act transparency (AI interaction + synthetic voice disclosure). Legal pages + first-run consent wired to signup.

## 16. Traceability

Every requirement here maps to a plan step and tracker row. See `docs/REQUIREMENTS-TRACKER.md` and `plans/plan-2026-07-08-production-readiness.yaml`. The intended-UI mockup is `docs/ui-mockup/intended-ui-v1.html` (to be revised to add the Practice hub, onboarding, review-due card, progress ring, AA contrast, streak-freeze).
