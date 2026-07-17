# EN-18 — Vocabulary practice as an objective reinforcement quiz

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-18-VOCAB-REINFORCEMENT-QUIZ-REQUIREMENTS.md
**Description:** Requirements for redesigning vocabulary practice from self-graded flashcards into an objective, quiz-style reinforcement loop (comprehension + production), sourced from what the learner has worked on, focusable by theme. Owner-designed 2026-07-15; awaiting approval before any coding (AGENTS §3).
**Author:** Libor Ballaty
**Created:** 2026-07-15
**Last Updated:** 2026-07-15
**Last Updated By:** Libor Ballaty

---

## 1. Problem

Today vocabulary review is self-graded flashcards: the learner flips a card and rates themselves
Again/Hard/Good/Easy. Owner critique (2026-07-15): this makes the learner "judge and jury," and
the app has **no objective signal** of whether they actually knew the word — there is **no input
field and no listening/speaking step**, so the only input to the reinforcement schedule is a
subjective self-rating. It should instead **observe performance** and reinforce accordingly:
words gotten wrong return sooner, words gotten right return less often. The scheduling engine for
that already exists (SM-2, `src/lib/srs.ts`); the missing spine is objective grading + the right
sourcing.

## 2. The reinforcement loop (approved design)

```
 SOURCE (progress-aware; grows as lessons are done)
   • pool = vocabulary from THEMES the learner has WORKED ON
     ("worked on" = started the lesson/theme — touched it AND played some audio back)
   • grows automatically as they progress; when large → learner picks a THEMATIC focus
     (by theme, e.g. "At the market", grouped by category daily/social/travel/work —
      NOT by lesson/month number)
             │  due + near-due first (SM-2 order)
             ▼
 CARD:   «mercado»  [▶ play]         (PT word + audio; no answer shown yet)
             ▼
 STEP 1 — COMPREHENSION  (written + heard understanding)
   read and/or play → TYPE the meaning → fuzzy/accent-tolerant check (EN-10 vocabSearch)
   → comprehension = PASS / FAIL, then reveal EN + example
             ▼
 STEP 2 — PRODUCTION  (can they say it?)   [skipped if no mic / opted out]
   "Now say it" [🎤] → pt-PT speech recognition ("say it back" engine)
   → production = PASS / FAIL
             ▼
 SCORE (the app decides — not the user):
   with mic:  both PASS → SUCCESS · one PASS → PARTIAL · neither → FAILURE
   no mic:    comprehension only → PASS or FAIL (no PARTIAL)
             ▼
 FEEDBACK  ("✓ meaning · ✗ pronunciation — back in ~3 days")
             ▼
 SCHEDULE  SM-2: SUCCESS → returns much later · PARTIAL → medium · FAILURE → soon
             ▼
   more due this session? → yes → next CARD ; no → SESSION SUMMARY
```

## 3. Decisions (owner, 2026-07-15)

- **Theme granularity:** the **finer themes already in the app** = the individual **situations**
  (each has a title + its own `vocabulary`), grouped for the focus picker by category
  (`daily/social/travel/work`) and/or goal-track — **not** by month/lesson number. There are many.
- **"Worked on":** a theme enters the pool once the learner has **started** it — opened the
  lesson/theme **and played some of it back** (not necessarily completed).
- **Which lessons count (owner 2026-07-16):** INCLUDE all lessons — **including grammar lessons**
  (they DO introduce new vocabulary). EXCLUDE **drills, stress-tests and review situations** (they
  reinforce, not introduce — the 0-word "Week N Stress Test" / "Grand Stress Test" entries). Live
  content shape: 6 months × 28 daily lessons; every 7th day is a Stress Test (0 words) → filter
  those out; ~19 goal-track situations sit outside the month calendar.
- **Two-dimension evaluation:** COMPREHENSION (typed meaning) + PRODUCTION (spoken). Both → success,
  one → partial, neither → failure.
- **No mic / declines mic:** comprehension (typed) only → **PASS/FAIL, no PARTIAL**.
- **Self-grade buttons are replaced** by the derived SUCCESS/PARTIAL/FAILURE (objective). A manual
  self-rate remains only as a fallback when neither typing nor speaking is possible (e.g. offline).
- **Reinforcement:** unchanged engine — SM-2 maps success/partial/failure → next-review interval.

## 4. How it's accomplished (reuse existing building blocks)

| Capability | Reuse |
|---|---|
| PT word + audio | TTS pipeline (pt-PT; TB-13 steering deployed) |
| Typed-meaning check | **EN-10 `vocabSearch`** (fuzzy, bidirectional, accent/typo-tolerant) |
| Spoken-answer check | **pt-PT speech recognition** (first-win "say it back"; `firstWinRecognitionLanguage: 'pt-PT'`) |
| Return-timing / reinforcement | **SM-2** (`src/lib/srs.ts`, `useDueItems.applyGrade`) |
| Progress-aware sourcing | `user_situation_progress` (started/completed) + `mastery_items` |
| Theme focus picker | situations grouped by `course.category` / goal-track (extends EN-16's scope selector) |

## 5. Interface changes (from today)

- Add a **text input** for the typed meaning (Step 1) + a **Check** action.
- Add a **record/🎤 step** for production (Step 2), skippable → comprehension-only PASS/FAIL.
- Replace the Again/Hard/Good/Easy self-grade row with **objective feedback** (what passed/failed +
  when it returns); keep a minimal self-rate only as the no-input fallback.
- **Focus picker** by theme/category (supersedes EN-16's lesson/track/all selector; keep "all" as the
  default when the learner hasn't narrowed).

## 6. Scoring → SM-2 grade mapping (to finalise in build)

- SUCCESS → a "good/easy" grade (long interval); PARTIAL → a "hard" grade (short pass interval);
  FAILURE → "again" (reset, returns soon). Exact grade values tuned against `config.srs`.

## 7. Open items to resolve at build time (not blockers)

- Comprehension direction: PT→meaning (recognition) confirmed as the primary; consider adding
  meaning→PT (production-by-typing) later.
- "Played some of it back" signal: define the exact event that marks a theme "started" (first audio
  play within the situation) and where it's recorded.
- Speech-recognition scoring threshold (how close counts as PASS) + graceful handling of no-speech.
- Offline behaviour: comprehension-only + queue grades (SEC-2 sync queue already carries mastery).

## 8. Coverage (owed on build)

Unit: sourcing (progress-aware pool), score→grade mapping, no-mic PASS/FAIL path. E2E: type-answer
flow grades + schedules; theme focus picker changes the pool. (Speech step is hard to e2e — unit the
scoring, manual-verify the mic.)

## 9. Status

**SPEC — NEEDS OWNER APPROVAL before any coding** (AGENTS §3). Supersedes the earlier standalone
grade-button tweak (EN-16 note); EN-16's scope selector folds into the theme focus picker here.
