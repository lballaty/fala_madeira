# FalaMadeira — Content & Curriculum Architecture (Modular)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/CONTENT-ARCHITECTURE.md
**Description:** The modular, non-linear content architecture for FalaMadeira as a voice-first "language operating system for living in Madeira." Defines the separation of content / modes / sequencing, the Situation-as-atom model, tracks & practical levels, content packs (add curriculum as data, not code), the guided-vs-free navigation model, the adaptive weakness model, and offline/resilience. Derived from the owner's full-version vision (2026-07-09). Companion to docs/PRODUCT-DESIGN-TARGET.md.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** design-refinement session

## 0. Product framing (the north star)

> A Madeiran Portuguese fluency system that teaches people to understand, speak, and function socially in Madeira, using real local situations, voice-first practice, adaptive repetition, and cultural context.

Positioning: **"Madeiran Portuguese for Real Life"** — correct European Portuguese as the base, trained against how Portuguese is *actually spoken* in Madeira. Not a course, not a phrasebook, not a Duolingo clone. Promise: *in ~90 days you can handle common Madeira life situations in Portuguese.* Not exaggerated dialect gimmickry.

## 1. The three separations (why this is modular)

Our earlier lesson model fused three concerns. We split them so each grows independently:

1. **Content = data** (what is taught) — Situations & Packs, addable without code.
2. **Modes = engines** (how it's practiced) — lenses that render parts of a Situation.
3. **Sequencing = policy** (what order) — free navigation + an optional guided path.

Consequence: adding curriculum is publishing a validated data Pack; adding a way to practice is adding one engine; changing pedagogy is changing the path policy. None forces the others to change.

## 2. Content model

### 2.1 Situation (the atomic unit)
A self-contained, practical scenario (e.g. "Calling a plumber", "Ordering a bica", "Guest arrival at 16:00").

```
Situation
  id, title, summary
  tracks[]              # many-to-many (a situation can serve several tracks)
  level                 # practical 0-5 (see §4); cefr (background)
  soft_prerequisites[]  # recommendation hints ONLY, never hard locks
  phrase_patterns[]     # base phrase + substitution slots + variants  -> Pattern Builder
  vocabulary[]          # word/phrase, translation, pronunciation, register
  dialogues[]           # multi-speaker scripts; each line has speaker + voice_type -> Listening Engine
  cultural_notes[]      # social code / register / indirectness            -> Cultural Layer
  roleplay              # branching script with difficulty L1-L5           -> Situation Simulator
  mission               # real-world assignment: prep + fallback phrases + likely responses -> Missions
  review_items[]        # derived recall/pronunciation/listening items      -> Adaptive Review
  media[]               # optional real audio/video refs
```

Design rules:
- A Situation must be practiceable by **multiple modes** from its own data (that is the test of a good situation).
- Content is **European Portuguese**; dialogues carry Madeiran spoken realism (reductions, rhythm) via `voice_type` + phrasing, validated by `docs/CONTENT-STANDARDS.md`.

### 2.2 Track (goal-oriented collection)
An ordered, curated set of Situations for a life-goal. A Situation may appear in several tracks.
- **A — Survival Madeira** (arrivals/visitors)
- **B — Property Owner / Rental Host** (the strongest niche: cleaners, tradespeople, guests, bills, repairs)
- **C — Social Integration** (neighbors, festivals, humor, invitations)
- **D — Bureaucracy / Services** (Finanças, Câmara, health center, banks, utilities)
- **E — Work / Business Madeira** (introductions, scheduling, scope, escalation)
- Tracks are themselves data — new tracks (e.g. "Healthcare", "Parents/School") ship as content, not code.

### 2.3 Pack (the shippable modular unit)
A versioned bundle of Situations (+ optional Tracks) validated against the content schema and published to the DB (and bundled as defaults for offline). **Adding/expanding curriculum = publishing a Pack.** Authored via the Content Creation Studio (admin) or proposed via community/human feedback. The existing 56 lessons become the seed Pack, re-tagged into Situations/Tracks.

## 3. Modes = engines (lenses over content)

| Engine (module) | Consumes | Core |
|---|---|---|
| **Listening Engine** | dialogues (multi-voice, speeds, noise) | slow/normal/natural, multiple speakers, transcript reveal, word-replay, dictation, "what did you hear?" |
| **Speaking Coach** | phrase_patterns, dialogues | repeat-after-me, shadowing, response-speed |
| **Pronunciation Trainer** | target audio | record-and-compare, rhythm/stress feedback, difficult-sound drills |
| **Pattern Builder** | phrase_patterns + slots | substitution drills (tomorrow→today→Friday→after lunch) |
| **Situation Simulator** | roleplay | branching conversation, difficulty L1 (guided) → L5 (messy real-life) |
| **Real-World Missions** | mission | prep → do-it-for-real → after-action review |
| **Cultural Context Layer** | cultural_notes | social code, register, indirectness explainers |
| **Adaptive Review** | review_items + mastery | targets weaknesses (see §5) |
| (supporting) Reading / Writing / Grammar | texts/patterns | secondary to the voice-first core |

Adding an engine is isolated code; it automatically works on all existing content that carries the data it consumes.

## 4. Practical levels (product-facing) + CEFR (background)

- **L0 Tourist survival** · **L1 Daily function** · **L2 House & service management** · **L3 Local conversation** · **L4 Problem solving** · **L5 Integrated resident.**
- CEFR (A1–B2) maps in the background for content tagging; the product speaks in practical capability ("you can deal with cleaners, repairs, guests").

## 5. Sequencing: multiple path types over one content base (tool AND tutor)

Sequencing is a **policy layer** independent of content and modes. The SAME Situations/Packs can be delivered through several **path types**, and the user chooses which suits them. **No path is forced; none hard-gates access.**

**Path types (all first-class):**
1. **Structured Course (month-by-month)** — the built-in, strictly ordered calendar curriculum (the original 6-month / ~168-lesson path) for learners who want a fixed, linear, app-driven progression. Retained as a first-class option, NOT removed. Built as an ordered `LearningPath` over course units (the seed content), with day/month structure and progress.
2. **Goal Track** — pick a life-goal (Survival / Host / Social / Bureaucracy / Work); the app orders that track's Situations by level and recommends next.
3. **Adaptive Guided (daily session)** — the default tutor posture: a `LearningPath` policy composes the ~30-min daily session over the Situation it recommends from placement + track + weaknesses + SRS-due. "Start today's session" and the app leads.
4. **Free / self-directed** — pick any track, level, situation, or mode; jump ahead; drill one mode.

A new user chooses at onboarding: *"Follow the structured course"* or *"Learn by goal / just start talking."* They can switch path type anytime; progress and mastery are shared across path types because they all operate on the same content and mastery model.

**Soft prerequisites only** — they influence recommendations/ordering within a path, never lock content. A placement question sets a sensible starting point; advanced learners jump to Track B / Level 3 or a later month at will.

**Postures:** *Tutor* (Structured Course or Adaptive Guided lead the way) vs *Tool* (Free / Goal-Track self-direction). Same content, same progress, different amount of hand-holding.

**Daily session template (voice-first, ~30 min; optional 40-min deep mode):**
```
Daily Speaking Session
  3 min  listening warmup      (Listening Engine)
  5 min  shadowing             (Speaking Coach)
  7 min  phrase pattern drill  (Pattern Builder)
  10 min roleplay              (Situation Simulator)
  5 min  review                (Adaptive Review)
  2 min  real-world mission    (Missions)
```
The template is **configurable data** (durations/segments), so the methodology can evolve without code.

**The core loop every content unit runs through:** `Hear → Understand → Repeat → Vary → Respond → Use → Review`.

## 6. Adaptive weakness model

Track per-item mastery across four dimensions, not just time:
- **hear** (recognizes it at natural speed) · **say** (pronunciation/fluency) · **retrieve** (recall speed) · **avoid** (situations skipped/abandoned).
Review and recommendations target the weakest dimension: *review what the learner cannot hear, cannot say, or cannot retrieve quickly.* SM-2 scheduling is the substrate; the dimension model steers selection.

## 7. AI roles (specific, not "chat in Portuguese")

Conversation partner · Speaking coach (pronunciation/phrasing/speed) · Scenario generator (turn the user's real need — "tell the cleaner guests arrive at 16:00" — into phrase + audio + variants + roleplay + WhatsApp-ready message) · Error analyst (recurring tense/gender/word-order/register issues) · Local-context explainer. All via the authenticated edge functions.

## 8. Content authoring & growth (Content Creation Studio)

- Admin studio to create/edit Situations, Tracks, Packs against the schema; validate with `scripts/validate-content.mjs`; publish (versioned) to DB.
- Community / human-feedback layer can propose situations, corrections, and (later) native-speaker audio.
- **Speaker/voice data** requirement: clear teacher, natural local, older, younger, service-worker style, phone-audio, noisy café/market — realized via TTS provider voices now (Azure pt-PT default + variety) and real recordings later.

## 9. Data model (additions/changes)

New/changed tables (data-driven content):
- `situations` (JSONB payload per §2.1 + tracks[], level, cefr, pack_id, version)
- `tracks` (id, name, goal, ordered situation refs)
- `content_packs` (id, version, status, checksum) — enables modular publish + offline sync
- `user_track_selection`, `user_situation_progress` (per-situation, per-mode progress; non-linear)
- `mastery_items` (item, dimension: hear|say|retrieve|avoid, ease, interval, next_review)
- `missions_log`, `pronunciation_attempts`, `writing_submissions`
- Keep existing profiles/logs/etc. The legacy `lessons` table maps into `situations` (seed Pack).

## 10. Reliability / resilience / offline (SW design)

- **Content packs + audio cache per selected track/level.** "Download track/level for offline" pre-generates multi-voice audio into the bounded IndexedDB cache.
- **Offline-capable:** listening, shadowing, pattern drills, vocabulary/review, reading work offline from cached packs+audio. **Online-only (clearly labeled):** free roleplay, pronunciation scoring, scenario generation, error analysis.
- **Offline write queue:** progress, mastery updates, mission completions queue locally and sync on reconnect (last-write-wins with per-item timestamps; conflict-safe for counters via server-side increments).
- **Resilience:** all AI/network calls go through the centralized logger with retry/backoff + graceful degradation (never a silent failure); pack integrity checked via checksum; app-shell precached (PWA).
- **Content versioning:** packs are versioned so a device can detect and pull updates without breaking in-progress state.

## 11. Build sequence (working backwards)

1. **Content model** — situations/tracks/levels/packs schema + validator (foundation).
2. **Audio-first lesson engine** — listening + shadowing + transcript + pattern variation.
3. **Speaking capture** — record/compare/track repetitions (pronunciation).
4. **Situation Simulator** — branching roleplays (L1–L5).
5. **Adaptive memory** — 4-dimension weakness model + review.
6. **AI personalization** — scenario generation from the user's real needs; error analyst.
7. **Local speaker/content network** — authentic voices, regional variants, cultural notes; Content Studio.
8. **Community / human correction** — optional tutor/native review layer.

## 12. Guardrails against drift

- Every new capability must serve one of: **understand · speak · use · belong**. If it doesn't, it's out.
- Voice-first: default flows are listen/speak, not read/tap.
- Never hard-gate sequence; always offer the guided default.
- Madeira realism without dialect gimmickry.
- Content is data; growth is packs, not releases.
