# Coordination v2 — task-claim-first reservation (durable, tracker-bound, self-enforcing)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/COORDINATION-V2-TASK-CLAIM-REQUIREMENTS.md
**Description:** Requirements to redesign multi-agent coordination so a **durable, tracker-bound task claim** is the primary unit and **file locks are subordinate and ephemeral** (no file lock without an owning task claim). Enforcement is agent-facing self-remediation (agents follow the process automatically; the human is never prompted to approve routine coordination). Owner-directed 2026-07-16; awaiting approval before implementation (AGENTS §3). Implementation targets the aidevops platform (`queuectl`) + the global PreToolUse guard; fala_madeira is the reference adopter.
**Author:** Libor Ballaty
**Created:** 2026-07-16
**Last Updated:** 2026-07-16
**Last Updated By:** Libor Ballaty

---

## 1. Problem (evidence-based, 2026-07-16)

Coordination today works *when followed* but has structural gaps (measured against the live queue, 456 fala_madeira events Jul 9–16):

1. **File locks are standalone and ephemeral.** Every one of 221 `reserve_granted` events also locked files; **0 were pure task claims.** A lock is released in seconds–minutes, so there is no durable "who owns this work" signal.
2. **Task pickup only rides a file lock.** The `--working-on` label exists (221/221) but vanishes when the file lock releases, and only **51%** reference a tracker item id — so the queue can't answer "who is on EN-20 right now?" and can't be reconciled against the trackers.
3. **Claims die with the process/TTL.** Reservations are tied to a live PID + short TTL (an earlier release this session returned `ok:false` because the claim had already auto-expired across a shell change). **Nothing survives an agent/session switch**, so work started by one agent is not fluidly resumed by the next — the owner routinely jumps between agents.
4. **Enforcement is zero.** The wired PreToolUse `Edit|Write` hook only `echo`s a static reminder; it does not consult the queue or block. `QUEUE_HOOK_MODE=warn` exists but no hook consumes it. Compliance is 100% voluntary and leaves no trace when skipped.
5. **Latent split-brain.** `queuectl --help` documents the default queue as `~/AGENT-WORK-QUEUE.md` (a stale, near-empty file, inode 106319667). The live queue is `~/.codex/memories/AGENT-WORK-QUEUE.md` (→ `~/.ai-dev-dotfiles/.codex`, inode 124273019). A mis-configured invocation would silently fork the namespace.

## 2. The model (owner-approved shape, 2026-07-16)

Two tiers. The task claim is primary; the file lock is subordinate.

```
 TIER 1 — TASK CLAIM  (durable · tracker-bound · agent-agnostic continuity)
   • keyed to a TRACKER ITEM id (TB-/EN-/EF-/SEC-/QA-/CS-/CG-/… in one of the 3 trackers)
   • long-lived: survives long ANALYSIS with zero file writes; survives session/agent switches
   • single ACTIVE holder at a time (short lease + heartbeat) BUT any of the owner's agents
     may resume / renew / take over — takeover is explicit and logged (fragility mitigation)
   • verbs: claim-task · renew · resume · handoff · release · show
             │  a file lock may be taken ONLY while you hold the covering task claim
             ▼
 TIER 2 — FILE LOCK  (ephemeral · subordinate · burst-scoped)
   • reserve --files REQUIRES an active Tier-1 claim held by (or handed to) the caller
     → otherwise DENIED with an agent-facing instruction to claim first
   • released fast (reserve → edit → release), exactly as today
   • auto-released when the covering task claim ends
```

### Hard rules
- **R1 — No file lock without an owning task claim.** `reserve --files` is refused unless the caller holds an active task claim whose scope covers those paths.
- **R2 — A task claim must name a real tracker item.** The id is validated against the tracker docs on `claim-task` (net-new work files a tracker item first — this also satisfies the AGENTS §3 requirements gate). Investigation with no writes needs no claim.
- **R3 — Durability over liveness.** A task claim does NOT expire from mere inactivity within a long idle window (default 48h idle, renewable, warns before expiry). It is decoupled from PID/session.
- **R4 — Single active holder, open continuity.** At most one agent is the *active* holder at any instant (lease + heartbeat, default 15 min). Any of the owner's agents may `resume` an idle claim or `handoff`/take over an active one; every transfer is logged with a note. This is the fragility guard: continuity across agents, no silent double-ownership.

## 3. Enforcement (agent-facing, self-remediating — NOT a human gate)

Owner decision (2026-07-16): **agents must just follow the process automatically; the human is never asked to approve routine coordination.**

- The PreToolUse `Edit|Write` guard consults the queue. On a claim-required path with no covering claim held by the caller, it returns a **machine-readable instruction to the agent** (`permissionDecisionReason`): *"Write refused: no active task claim covers `<path>`. Run `queuectl claim-task --tracker <id>` (or `resume`), then `reserve --files <path>`, then retry."* The **agent self-remediates and retries** — no prompt reaches the owner.
- **Rollout = warn → block** (owner decision): first ship a warn phase (the guard injects the same instruction as guidance but allows the write) to prove non-disruptive, then flip `QUEUE_HOOK_MODE` to `block` (deny + instruct). Same message both phases; only allow-vs-deny differs.
- **Claim-required path policy (repo-declared, defaulted):** require a claim for `src/**`, canonical `docs/**`, `supabase/migrations/**`, `config`/settings, and `tests/**`. **Exempt:** `scripts/_tmp-*`, `*.local`, `.llm_sessions/**`, and a brand-new file the caller created this session. A repo may strengthen to `all_writes`.
- The guard **never** escalates to the human for coordination. (Product/requirements approval — AGENTS §3 — is a separate, human decision and is unaffected.)

## 4. Durability & agent-switch continuity (the owner's core pain)

- Task claims persist in the shared queue state independent of any PID/session, so a claim made by `claude-A` is visible to and resumable by `codex-B` or a fresh session.
- `queuectl show` becomes a real board: active task claims (tracker id, current holder, lease age, last heartbeat, covered paths), with idle/stale ones flagged.
- `resume`/`handoff` carry a free-text note so the next agent picks up mid-flight (what's done, next exact action) — complements, does not replace, the tracker item's own status prose.
- Idle-expiry warns before reaping; a reaped claim is recorded (not silently dropped) so nothing is lost on an agent switch.

## 5. Split-brain fix (bundled, cheap, high-safety)

- Correct `queuectl`'s runtime/`--help` default so the documented default IS the live queue.
- Make `~/AGENT-WORK-QUEUE.md` a symlink to the live queue (or remove it) so a mis-configured call cannot fork the namespace.

## 6. Where it's built (platform, not a one-off)

- **`aidevops/tools/queuectl.py`** — the task-claim tier (verbs, lease/heartbeat, tracker-id validation, R1 subordination, durability, resume/handoff), plus the split-brain fix. This is a **platform capability** (per the release-standardization decision; fala_madeira is the reference adopter).
- **Global PreToolUse guard** — a new hook script consuming `QUEUE_HOOK_MODE`, wired via `/sync-config` (reserve `settings.base.json`; deterministic render). Replaces the echo reminder.
- **Doctrine** — fold the two-tier model into `AGENTS.md §7` + `docs/MULTI-AGENT-WORKFLOW.md` once implemented.

## 7. Open decisions — RESOLVED by owner (2026-07-16)

- **Enforcement:** warn-first → then block; **agent-facing self-remediation, never a human approval prompt.**
- **Claim ownership:** agent-agnostic **continuity** with a **single active holder** (lease + heartbeat) and explicit logged takeover (hardened against the fragility the owner flagged).

## 8. Acceptance criteria (owed on build)

- `reserve --files` on a claim-required path **fails** without a covering task claim, and **succeeds** with one (unit + integration on `queuectl`).
- A task claim **survives** a simulated session/PID change and is **resumable** by a different agent id; takeover is logged; two agents cannot both be active holders simultaneously.
- The PreToolUse guard, in `warn`, allows + instructs; in `block`, denies + instructs; **neither surfaces a prompt to the human** (verify via hook JSON output — `permissionDecision`/`additionalContext`, no human interrupt).
- A raw `queuectl` invocation with no `--queue` hits the live queue (split-brain closed).
- Claim-required path policy honors the exemptions (scratch/session/self-created-new files never blocked).

## 9. Phasing (execute end-to-end after approval, no further check-ins)

1. **queuectl task-claim tier + split-brain fix** (aidevops) — behavior additive; bare `reserve` still works (warn phase).
2. **PreToolUse guard in `warn`** (global via `/sync-config`) — real queue check + agent-facing instruction; soak.
3. **Doctrine update** (AGENTS §7 + MULTI-AGENT-WORKFLOW) — document the two-tier model + verbs.
4. **Flip to `block`** once the warn soak shows agents self-remediate cleanly and nothing legitimate is being blocked.

## 10. Status

**SPEC — NEEDS OWNER APPROVAL before implementation** (AGENTS §3). Decisions in §7 are locked; §8 is the test contract. On approval, execute §9 phases 1→4 autonomously (per owner: agents follow the process without stopping to ask).
