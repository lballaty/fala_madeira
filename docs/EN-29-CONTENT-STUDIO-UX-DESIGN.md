# EN-29 — Content Studio: "Add a Theme" UX Design (desktop-first)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-29-CONTENT-STUDIO-UX-DESIGN.md
**Description:** UX design for a user-friendly authoring flow to add a new **theme** (a Situation) to the curriculum, replacing the current opaque raw-JSON Content Studio. Desktop-only is acceptable. Design-phase only — this doc is the design for owner review before any build.
**Author:** claude-agent-c
**Created:** 2026-07-20
**Last Updated:** 2026-07-20
**Last Updated By:** claude-agent-c
**Status:** **DRAFT — design-phase only; no coding until owner-approved (AGENTS §3 requirements gate).** Owner reviews this design (and picks the open decisions) before any build.

---

## 1. Problem

The admin **Content Studio** exists (`src/features/admin/ContentStudio.tsx` + `useContentStudio.ts`, tab `studio` in `AdminView.tsx:45-85`) but is **unusable by anyone who isn't its author**:

- **Jargon with no explanation** — "content pack", "track", "situation", "enrichable field" are undefined in the UI (TESTER-FEEDBACK-TRACKER CS-1).
- **Raw JSON editing** — the nested structures (`phrase_patterns`, `vocabulary`, `dialogues`, `roleplay`, `mission`, `review_items`, `media`) are edited as opaque JSON textareas. One misplaced comma fails validation with no guidance.
- **No guided path** — nothing tells the author what a *complete, publishable* theme needs, or in what order.
- **No linkage** from the "user requested a theme" queue (`lesson_requests`) to authoring it (CS-2).

Owner ask (TESTER-FEEDBACK-TRACKER EN-29, 2026-07-18): "Content Studio needs to be more user-friendly. Design how to add a theme in a user-friendly way. May be desktop-only." This doc is that design.

## 2. What a "theme" actually is (shared vocabulary)

In this codebase a **theme = a Situation**: one self-contained practical scenario (e.g. "Calling a plumber", "Ordering a bica", "Guest arrives at 16:00"). Grounding:

- **Situation** — the atomic learnable unit (`src/content/schema.ts` `Situation`, lines ~221-245; DB `situations`, `00006_content_model.sql`).
- **Track** — a goal-oriented collection of Situations (e.g. Survival Madeira, Property Host, Social Integration) — `Track` type; DB `tracks`.
- **ContentPack** — a versioned, shippable bundle of tracks + situations (`draft|published|deprecated|archived`, checksum, `payload` JSONB) — DB `content_packs`.

So **"add a theme" = author one Situation**, attach it to one or more tracks, inside a (draft) pack. The UI should say **"theme"** to the author and map it to a Situation under the hood — the jargon stays out of the author's way.

A Situation carries up to ~9 nested structures; a *publishable* one must be **practiceable in ≥2 modes** (`schema.ts` validators ~586-604) — i.e. it must populate at least two of: phrase_patterns, vocabulary, dialogues, roleplay, mission, review_items, cultural_notes.

## 3. Current state (what we're replacing)

`ContentStudio.tsx:62-101` loop: pick pack → pick/add situation → edit scalar fields inline (id, title, summary, level, cefr, tracks CSV, goals) → edit nested arrays as **JSON textareas** → **Validate** (two-tier: schema + European-Portuguese scan) → **Publish** (upsert pack/situations/tracks, sha256 checksum, version bump). RLS: admin-only via `is_admin()` (`00006_*.sql:233-273`). Validation is real and good — the problem is purely the **authoring surface**, not the model or the validator.

## 4. Design goals & principles

- **G1 — Guided, not raw.** Replace JSON textareas with structured forms + repeatable rows. The author never sees JSON unless they open an "advanced / raw" escape hatch.
- **G2 — Explain the domain inline.** First-run explainer + contextual helper text: "A *theme* is one real-life situation you want learners to handle."
- **G3 — Guardrails while typing, not just at publish.** Surface the European-Portuguese hard-errors (Brazilian words → e.g. `ônibus`→`autocarro`) and register warnings (`você`) inline as the author writes — cite `docs/CONTENT-STANDARDS.md` + `scripts/validate-content.mjs` markers. Turn the existing validator into live field-level feedback.
- **G4 — Show completeness.** A live checklist: "Practiceable in 2 of N modes ✓", required fields, level chosen, ≥1 dialogue with voice types. The author always knows what's left to publish.
- **G5 — Make audio visible.** Every phrase/dialogue line needs a `voice_type` → audio. Show "this theme will need audio for X lines across Y voices — auto-generated after publish (EN-8/EN-34), or upload your own." No silent audio debt.
- **G6 — Desktop-first (acceptable).** Authoring is an admin power-task; the sidebar already hides on mobile (`Sidebar.tsx` `hidden md:flex`). Optimize for a wide two-pane layout; a mobile author is out of scope.
- **G7 — Reuse the model + validator + publish path unchanged.** This is a UX layer over the existing `useContentStudio` publish/validate — not a new content model.

## 5. The "Add a Theme" flow (wizard)

A left rail of steps + a main editing pane + a right-hand live **"Ready to publish?"** checklist. Steps are non-linear (jump around) but publish is gated on the checklist.

1. **Name the theme** — title, one-line summary, **practical level L0–L5** (with plain-language descriptions: L0 Tourist survival … L5 Integrated resident), which **track(s)** it belongs to (multi-select from existing tracks or "new track"), learner-facing goals. (CEFR is auto-suggested from level, editable.)
2. **Key phrases** — a guided **Pattern Builder**: type a base phrase, mark `{slots}`, add variants. No JSON — a row-per-pattern editor. (Feeds the Pattern Builder practice mode.)
3. **Vocabulary** — repeatable rows: word · translation · pronunciation · register (tu/você/o senhor picker). Live EP check per row.
4. **A dialogue** — a scripted exchange: add lines, each with a **speaker + voice type** (teacher/local/older/younger/service/phone/noisy dropdown — required). Guidance: short natural turns, not textbook paragraphs.
5. **Bring it to life (optional but encouraged)** — roleplay branch (scenario + a few nodes), a mission (prep phrases + likely responses), cultural notes. Each optional block that's filled counts toward the ≥2-mode requirement.
6. **Review & validate** — run the existing two-tier validator; show errors (block) and warnings (author judgment) **mapped back to the field** that caused them, not as a JSON blob. Show the audio plan (lines × voices).
7. **Publish** — choose target pack (existing draft or "new draft pack"), confirm, then the existing publish path upserts + checksums + versions. Post-publish: offer "queue audio generation" (EN-34/pregen).

## 6. Wireframe (desktop, two-pane)

```
┌─ Content Studio ─────────────────────────────────────────────────────────┐
│  Themes  ·  + Add a theme            [ pack: Survival Madeira (draft) ▼ ]  │
├──────────────┬───────────────────────────────────────┬────────────────────┤
│ STEPS        │  Key phrases                            │ Ready to publish?  │
│              │                                         │                    │
│ ● Name       │  Base:  Podia [ajudar-me] com ___       │ ✓ Title            │
│ ● Key phrases│    slots: [ajudar-me] [+ add slot]      │ ✓ Level (L1)       │
│ ○ Vocabulary │    variants: + add                      │ ✓ Track ×1         │
│ ○ Dialogue   │  ─────────────────────────────────     │ ✓ Phrases (3)      │
│ ○ Bring alive│  Base:  Quanto custa ___ ?              │ ✓ Vocabulary (5)   │
│ ○ Review     │    [+ add pattern]                      │ ⚠ Dialogue: add a  │
│ ○ Publish    │                                         │   voice type       │
│              │  ⚠ "você" is Brazilian-leaning here —   │ ✓ 2+ practice modes│
│              │     prefer "tu" (informal) / "o senhor" │ ──────────────     │
│              │     (formal).  [use tu] [keep]          │ Audio: 8 lines /   │
│              │                                         │ 3 voices → auto    │
│              │  [ Advanced: edit raw JSON ⌄ ]          │ [ Publish (gated) ]│
└──────────────┴───────────────────────────────────────┴────────────────────┘
```

The right rail is the live checklist (G4); the inline amber box is a guardrail (G3); "Advanced: edit raw JSON" is the escape hatch for power users (keeps the current capability, hidden by default).

## 7. Guardrails inline (from the existing validator)

Surface `scripts/validate-content.mjs` / `schema.ts` results **at the field**:
- **Hard errors (block publish):** Brazilian lexicon (`BR_ERROR_MARKERS`: ônibus→autocarro, trem→comboio, banheiro→casa de banho, …), gerund periphrasis (`estou fazendo`→`estou a fazer`), schema violations (bad level/CEFR, duplicate ids, broken refs).
- **Warnings (author judgment):** register markers (`você`), <2 practice modes populated, missing voice types.
Each rendered as an inline chip with a one-tap fix suggestion where deterministic.

## 8. Audio integration (make the debt visible — G5)

Every dialogue line, phrase pattern, and roleplay node carries a `voice_type` → an audio asset. On Review, compute "N speakable lines across M voice types" (reuse the shared `linesForSituation` enumerator that feeds pregen). After publish, offer to enqueue generation via the EN-34 incremental hosting path (`pregen-audio.mjs` / `audio-warm`); until hosted, the client falls through tiers gracefully. Never publish a theme that silently has no audio plan.

## 9. Theme-request → author pipeline (CS-2)

Close the loop: from the admin **Requests** queue (`lesson_requests`), an "Author this theme" action deep-links into the Add-a-Theme flow **prefilled** with the requester's title/summary. This turns user demand directly into authored content and gives the "request a theme" feature a real fulfilment path.

## 10. Desktop-only posture (rationale)

Authoring is a low-frequency, high-density admin task; the app already hides the sidebar/admin nav on mobile (`Sidebar.tsx` `hidden md:flex`; mobile uses the bottom tab bar). A wide two-pane editor + live checklist needs horizontal space. **Recommendation: desktop-only** (show a "please use a larger screen to author" notice on mobile). Confirm as decision D1.

## 11. Open decisions (owner)

- **D1 — Desktop-only?** (Recommended yes.) Or a reduced mobile view?
- **D2 — Scope of v1:** minimum = steps 1–4 + Review + Publish (phrases + vocab + one dialogue = the ≥2-mode floor); roleplay/mission/cultural-notes builders as v2? Recommendation: yes, ship the floor first.
- **D3 — Keep the raw-JSON escape hatch?** (Recommended yes — power-user fallback, avoids regressing current capability.)
- **D4 — AI-assist:** offer "draft this theme with AI" (reuse `generate-content.mjs` behind the form) as a starting point the author edits? In/out for v1?
- **D5 — Pack management:** how much pack lifecycle (create/rename/version/publish) surfaces in v1 vs staying CLI/advanced.

## 12. Reuse map & non-goals

| Need | Reuse |
|---|---|
| Validate (schema + EP) | `src/content/schema.ts` validators + `scripts/validate-content.mjs` markers |
| Publish (upsert + checksum + version) | existing `useContentStudio` publish path |
| Content model | `Situation`/`Track`/`ContentPack` (`schema.ts`, `00006_*.sql`) — unchanged |
| Audio plan | shared `linesForSituation` enumerator + EN-34/pregen |
| Admin gate + desktop layout | `is_admin()` RLS, `AdminView` tab, `Sidebar` md-breakpoint |
| Request→author | `lesson_requests` queue |

**Non-goals:** new content model or DB changes (this is a UX layer); mobile authoring; changing the validator's rules; bulk import.
