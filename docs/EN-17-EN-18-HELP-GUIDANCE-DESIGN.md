# EN-17(a) + EN-18 — Help & Guidance: shared capability registry (design)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-17-EN-18-HELP-GUIDANCE-DESIGN.md
**Description:** Design for a single, reusable "app capability" registry that powers (EN-17a) content sync between the user manual and the chat help prompt, and (EN-18) in-app guidance (reactive "take me there" + proactive surfacing). One source, many thin consumers. Design-phase only — no coding until owner-approved (AGENTS §3).
**Author:** Libor Ballaty
**Created:** 2026-07-15
**Last Updated:** 2026-07-15
**Last Updated By:** Libor Ballaty

---

## 1. Scope

- **In:** the shared data model + the consumers for EN-17(a) (manual + chat-help *content*) and EN-18 (navigate + surface). EN-17a and EN-18 stay **separate features** that happen to reuse one core — not merged.
- **Out:** chat *performing* actions for the user ("do it for me") — explicitly not intended (owner). LLM provider abstraction — separate (EN-19); this design stays provider-neutral so it composes with EN-19 later.

## 2. Principles (modularity + reuse — the backbone)

1. **One source, many projections.** Author each capability ONCE; every consumer reads only the fields it needs. No duplicated feature descriptions anywhere.
2. **Stable IDs are the contract.** Everything references a capability by `id`. The `data-testid`s we already add for e2e (`goal-track-chooser`, `path-switcher`, …) double as the navigation-target control ids — one identifier, three uses (registry ↔ nav target ↔ test selector).
3. **Thin, decoupled consumers.** The manual doesn't know about navigation; the chat doesn't know about the manual; each depends only on the registry. Any consumer can be added/removed without touching the others.
4. **Generalize what exists; don't reinvent.** TB-11b's Home→goal-chooser (`focusGoalChooser` scroll+highlight) becomes a generic focus-by-control-id primitive reused by both reactive and proactive guidance.
5. **Provider-neutral.** Help content is not coupled to `gemini.ts`; whatever prompt-builder runs consumes it (composes with EN-19).

## 3. The core — App Capability Registry

A single pure-data module (fits the existing `src/content/` pattern), e.g. `src/content/appCapabilities.ts`:

```ts
export type AppArea = 'home' | 'learning' | 'practice' | 'tutor' | 'profile' | 'account';

export interface NavTarget {
  area: AppArea;          // which tab/screen
  controlId?: string;     // a data-testid to focus/scroll to (reuses the e2e selector)
}

export interface AppCapability {
  id: string;             // stable key, e.g. 'goal-track', 'offline-download'
  area: AppArea;
  title: string;          // "Goal track"
  short: string;          // ≤1 line — compact contexts (chat prompt, hints)
  long: string;           // prose — the manual
  keywords: string[];     // help matching/search
  target?: NavTarget;     // where the control lives (enables "take me there")
}

export const APP_CAPABILITIES: AppCapability[] = [ /* one entry per feature */ ];
```

Pure data, no client/edge-only imports → safe to project into either runtime. `short`/`long` split solves the manual-vs-prompt verbosity tension from one record.

## 4. Consumers (each thin + independent)

- **4a — Manual renderer (EN-17a, client).** `UserManualModal` maps `APP_CAPABILITIES` → sections rendering `long`, grouped by `area`. Replaces today's hand-written JSON-in-JSX. (Also fixes the literal-`**` render bug by using real markup.)
- **4b — Chat help projection (EN-17a, edge).** A build/generate step emits a compact artifact (`_shared/appHelp.generated.ts`) from `{title, short, target.area}` — the `getSystemInstruction` help branch reads that instead of a hardcoded literal. Compact by construction (uses `short`, not `long`). One source → generated edge artifact (avoids a fragile cross-runtime import; client/edge share no code today).
- **4c — Navigation service (EN-18 reactive, client).** `navigateToCapability(id)` reads `target` → switches tab + focuses the `controlId` (generalized from TB-11b's focus/scroll/highlight). Reused by the help chat's "Take me there" button.
- **4d — Contextual hints (EN-18 proactive, client).** Small, condition-gated hint components that reference a capability `id` and call `navigateToCapability`. E.g. the existing Home "recommended next step" and TB-11b deep-link become instances of this one pattern.

## 5. Reuse map (what one thing serves many)

| Asset | Reused by |
|---|---|
| `APP_CAPABILITIES` registry | manual (4a), chat help (4b), nav (4c), hints (4d) |
| `data-testid` control ids | e2e selectors, `NavTarget.controlId`, focus primitive |
| TB-11b focus/scroll/highlight | generalized `focusControl(id)` → reactive + proactive |
| `check-*-drift.mjs` family | new `check-help-drift.mjs` fits the existing pattern |

## 6. Cross-runtime & provider-neutrality

- Registry lives client-side (`src/content`); the edge gets a **generated** compact projection at build (drift-checked), NOT a runtime fetch (keeps the manual offline-capable and the prompt cheap).
- The projected help text feeds the prompt-builder generically — not embedded in `gemini.ts` logic — so an EN-19 LLM router would consume the same artifact unchanged.

## 7. Anti-rot guard

`scripts/check-help-drift.mjs` (mirrors `check-inventory-drift`/`check-schema-drift`): regenerate the edge artifact from the registry and fail CI if it differs from the committed one. Plus a `DOCUMENTATION-IMPACT` rule: a user-facing feature change is expected to add/update its `APP_CAPABILITIES` entry.

## 8. Staging (each phase independently shippable, all reuse the registry)

- **Phase 1 (EN-17a):** registry + manual renderer (4a) + chat-help generate step (4b) + drift check. Delivers content-sync; no navigation.
- **Phase 2 (EN-18 reactive):** `navigateToCapability` (4c) + "Take me there" from the help chat; refactor TB-11b to use it.
- **Phase 3 (EN-18 proactive):** contextual hints (4d) on the highest-friction spots; fold Home next-step / TB-11b into the shared pattern.

## 9. Testing

- Unit: registry integrity (unique ids; every `target.controlId` is a known selector); manual renderer maps areas; help projection is compact + covers each area; `navigateToCapability` resolves target.
- e2e: "Take me there" from help lands on + focuses the control; a proactive hint appears under its condition and navigates.
- Drift check green in preflight.

## 10. Coordination

- Edge touch (`_shared/gemini.ts` + generated artifact) is Lane B's EN-8/TB-13 territory — sequence/reserve; the chat half reaches users only on the next gemini deploy.
- Provider-neutral by design (EN-19).
- Shares nothing with Lane B's SEC-2 / audio files.

## 11. Open decisions for the owner

1. Registry format/location: typed TS in `src/content/appCapabilities.ts` (recommended) — OK?
2. Edge propagation: generate-step artifact (recommended) — OK?
3. Build only **Phase 1** now (content sync), or approve the staged 1→3 with Phase 1 first?
4. Manual: full re-render from the registry (fixes the `**` bug) vs minimal wiring — full re-render recommended.
5. Drift guard: add `check-help-drift.mjs` to preflight — OK?
