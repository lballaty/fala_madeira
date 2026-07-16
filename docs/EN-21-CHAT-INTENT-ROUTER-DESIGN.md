# EN-21 — Chat intent picker + mode routing (design)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-21-CHAT-INTENT-ROUTER-DESIGN.md
**Description:** Design for a "what do you want to do?" chat opener that routes to the correct session mode, fixing three root-caused problems: (1) the chat defaults to a PT↔EN translation drill, (2) help/how-to questions are never interpreted, (3) modes are hidden. Reuse-first: builds on the EN-17 capability registry, EN-18 navigation, and EN-20 `openHelp`. Design-phase only — no coding until owner-approved (AGENTS §3).
**Author:** Lane A (with assistant)
**Created:** 2026-07-16
**Last Updated:** 2026-07-16
**Last Updated By:** Lane A (with assistant)

---

## 1. Scope & the problems it fixes (root-caused in EN-21 tracker entry)

- **P1 — accidental translation drill:** the base tutor system prompt bakes in a "FORMATTING & TRANSLATION RULE" (`_shared/gemini.ts:132-150`); with no lesson + no intent, every message gets it.
- **P2 — help never interpreted:** free chat is hardwired `isHelpMode=false` with zero intent detection (`useTutorSession.ts:414`); help mode is only an in-modal toggle.
- **P3 — hidden modes:** free chat / lesson practice / help / translate / simulator, no way to declare intent.

**In scope:** an intent opener + explicit session **modes** and the prompt split that makes each mode behave. **Out of scope:** chat performing actions ("do it for me" — owner said not intended); LLM provider abstraction (EN-19; this stays provider-neutral).

## 2. Principles (same modularity/reuse backbone as EN-17/18)

1. **Reuse the session starters we already have** — `openHelp()` (EN-20), `startAIPractice(lesson)` (lesson), the free-chat send path, the simulator entry, plus ONE new explicit translate mode. The picker just *routes* to them; it doesn't reimplement chat.
2. **One declarative intent registry**, mirroring the `APP_CAPABILITIES` pattern — intents are data, the picker renders them, nothing hard-codes a list twice.
3. **Modular prompt, not a forked prompt per mode.** Split `getSystemInstruction` into shared blocks (PT-PT enforcement, correction strategy — reused) + one small mode-specific block. The translation rule moves OUT of the default and into the `translate` mode only.
4. **Provider-neutral** (the mode is a plain parameter; composes with EN-19).

## 3. Core — Chat Intent Registry

A small declarative module (e.g. `src/features/tutor/chatIntents.ts`):

```ts
export type ChatMode = 'help' | 'conversation' | 'translate' | 'lesson' | 'simulator';

export interface ChatIntent {
  id: string;
  label: string;            // "Ask about the app"
  hint: string;             // one line under the label
  icon: LucideIcon;
  mode: ChatMode;
  start: (ctx: ChatStartCtx) => void;   // routes to the existing starter
}
```

Each intent's `start` calls an **existing** entry point:
| Intent | mode | Routes to (reuse) |
|---|---|---|
| Ask about the app | `help` | **EN-20 `openHelp()`** (App-Guide + EN-18 chips) |
| Have a conversation | `conversation` | free-chat session started with `mode:'conversation'` |
| Translate a word/phrase | `translate` | `mode:'translate'` session (single words may defer to **EN-10** vocab lookup) |
| Practice today's lesson | `lesson` | **`startAIPractice(lesson)`** |
| Role-play a situation | `simulator` | the existing **Situation Simulator** entry |

## 4. The prompt-mode split (the substantive change)

Today: `getSystemInstruction(tutor, isHelpMode, learner)` → App-Guide OR the full tutor prompt (translation rule baked in). Change to a **mode** and compose from shared blocks:

```
getSystemInstruction(tutor, mode, learner):
  shared = PT_PT_ENFORCEMENT + CORRECTION_STRATEGY   // reused across language modes
  help        -> APP_GUIDE (from EN-17 appHelp.generated) ; no shared language blocks
  conversation-> shared + CONVERSATION block (natural back-and-forth, level-aware, gentle recast) ; NO translation formatting
  translate   -> shared + the TRANSLATION FORMATTING block (moved here from the default)
  lesson      -> shared + the existing lesson-guide block (unchanged behavior)
```

This is the fix for P1 (conversation stops emitting the translation drill) and P2 (help is a first-class mode reachable from the opener, not a buried toggle). `isHelpMode` becomes `mode==='help'` (thin back-compat shim so nothing else breaks). **Edge file** (`_shared/gemini.ts`) — Lane B EN-8/TB-13 territory → reserve + coordinate; reaches users on the next gemini deploy.

## 5. Components (thin, reuse)

- **`ChatIntentPicker`** — shown when the chat opens with no active session (and via a "New / What do you want to do?" affordance). Renders `CHAT_INTENTS`; a tap calls `intent.start`. Replaces the current two-button welcome (`TutorChatView.tsx:84-143`) with the fuller, clearer set.
- **`TutorChatView`** — gains the picker as its empty state; existing transcript rendering unchanged. A persistent "new chat / change intent" control re-opens the picker (also fixes the "persisted transcript skips the welcome" trap).
- **Mode plumbing** — `geminiService.startChat(tutor, { mode })` (extends today's `isHelpMode` bool); `useTutorSession` carries `mode` in state. Small, additive.

## 6. Reuse map

| Asset | Reused by EN-21 |
|---|---|
| EN-20 `openHelp()` | the "Ask about the app" intent |
| `startAIPractice(lesson)` | the "Practice today's lesson" intent |
| Simulator entry | the "Role-play" intent |
| EN-17 `appHelp.generated` | the help mode's content |
| EN-18 `navigateToCapability` + chips | help answers' "Take me there" |
| EN-10 vocab lookup | single-word translate |
| Shared prompt blocks (PT-PT, correction) | conversation/translate/lesson modes |

## 7. Staging (each shippable)

- **Phase 1 — the split + modes (edge + client plumbing):** `getSystemInstruction(mode)`; `startChat({mode})`; keep current entry points but pass the right mode (free chat → `conversation`, so the translation drill stops). Coordinate the edge deploy with Lane B.
- **Phase 2 — the intent picker UI:** `ChatIntentPicker` as the chat empty state + a "new chat" affordance; wire each intent to its starter. Gives mobile parity for help (EN-20 follow-up).
- **Phase 3 — explicit translate mode + single-word → EN-10** and polish (labels, "Tutor" tab clarity).

## 8. Testing

- Unit: intent registry integrity; `getSystemInstruction(mode)` returns the right block per mode (esp. `conversation` has NO translation formatting; `translate` does; `help` = App-Guide).
- e2e: opening chat shows the picker; "Ask about the app" → help greeting + a how-to question yields an app answer (+ take-me-there); "Have a conversation" does NOT return the Português/Pronunciation/English block; "Translate" does.
- Drift/gate green.

## 9. Coordination

- Edge `_shared/gemini.ts` prompt split is Lane B's EN-8/TB-13 file — reserve + sequence; chat behavior change reaches users only on the next gemini deploy.
- Provider-neutral (EN-19). No audio-stack / SEC-2 overlap.

## 10. Open decisions for the owner

1. Intent set — the five in §3, or add/rename any (e.g. a "Pronounce this" mode)?
2. Should the picker appear **every** time the chat opens, or only when there's no active session (with a "new chat" button to re-summon it)? (Recommend the latter — don't nag returning users mid-conversation.)
3. Single-word translate → route to the EN-10 vocab lookup modal, or keep it inside the chat as a `translate` turn? (Recommend: inline chat, with EN-10 as the offline/fast path.)
4. Confirm the prompt split is acceptable given it changes default free-chat behavior (no more auto-translation formatting) — this is the core fix.
