# Agent Permission Audit Report

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/permission-audit-20260709.md
**Description:** Read-only audit of agent session tool usage vs. current permission allowlists, with classified recommendations. No settings were modified by this audit.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** /permission-audit skill run

---

**Generated:** 2026-07-09
**Project:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira
**Audit scope:** Last 5 sessions per agent (only 3 Claude sessions exist for this project slug; 0 Codex sessions)

---

## Session Summary

| Agent | Sessions analyzed | Date range | Permission mode |
|-------|-------------------|------------|-----------------|
| Claude Code | 3 | 2026-07-09 – 2026-07-09 | bypassPermissions (recorded on user records) |
| Codex | 0 (none found under this project cwd) | — | — |
| Gemini | — | — | Not supported in v1 |

**Allowlist sources loaded (ALLOWED_SET = 330 rules):**

| Source | Rules |
|---|---|
| `~/.claude/settings.json` (global) | 313 |
| `.claude/settings.local.json` (repo-local, created 2026-07-09) | 17 |
| `.claude/settings.json` (repo-level) | not present |

> Note: the repo-local file was created mid-session today; the session transcripts predate it, so some historical prompts it now covers still appear as "unmatched" below only if outside its patterns. Also relevant to today's prompting symptom: settings files created after session start are not loaded until `/permissions` (or `/hooks`) is opened or the session restarts — that reload was performed today.

---

## Tool Use Inventory

### Claude Code — all tool names used

| Tool | Invocation count | Already in allowlist |
|------|-----------------|----------------------|
| Bash | 14 | partial (per-command rules) |
| TaskCreate | 6 | no (harness-internal; no permission needed) |
| Read | 5 | yes |
| Edit | 5 | yes (repo-local, as of today) |
| Agent | 4 | no rule (prompts per agent policy) |
| Write | 3 | yes (repo-local, as of today) |
| Skill | 2 | yes |
| ToolSearch | 1 | no rule needed (metadata-only) |
| TaskUpdate | 1 | no rule needed (harness-internal) |
| AskUserQuestion | 1 | yes |

### Codex — all commands used

No Codex sessions found with cwd under this project. Nothing to report.

---

## Audit Findings — Commands Not in Current Allowlist

Compound commands were split on `&&`/`;`/`||`; each segment was matched against ALLOWED_SET with prefix semantics.

| # | Agent | Command / Tool | Example invocation (truncated) | Session count | Classification |
|---|-------|----------------|-------------------------------|---------------|----------------|
| 1 | claude-code | Bash | `git -C /Users/liborballaty/.../fala_madeira ls-files plans/ \| cat` | 1 | ALLOW-DIRECT (read-only git) |
| 2 | claude-code | Bash | `! grep -rq 'GEMINI_API_KEY' src/ vite.config.ts` | 1 | ALLOW-DIRECT (read-only grep, negated form) |

Everything else executed in the analyzed sessions matched existing global or repo-local allow rules (git status/diff/log, npm run build/lint, npm install/uninstall, npx tsc, node scripts/*, queuectl, test/ls/wc/cat-class inspection commands covered globally).

---

## Recommendations

### ALLOW-DIRECT — Suggest adding unconditionally

| Command pattern | Suggested permission entry | Rationale |
|-----------------|---------------------------|-----------|
| `git -C <this repo> <read-only subcommand>` | `"Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira status*)"`, same for `log`, `diff`, `ls-files`, `show`, `branch`, `tag` | The global standard mandates `git -C <path>` over `cd && git`, but the global allowlist matches plain `git status*` forms only — every `-C` form prompts. Prefix rules can't wildcard mid-pattern, so one entry per read-only subcommand with the literal repo path is the precise fix. |
| `! grep …` (negated validation greps) | `"Bash(! grep*)"` | Plan-step validations use `! grep -rq` (assert-absent). `grep` is read-only; the leading `!` only inverts the exit code. The existing `grep` allow rule does not match the `! `-prefixed string. |

### ALLOW-SCOPED — Suggest adding with narrow pattern

Nothing new needed this audit — `npm install/uninstall`, `npm run <script>`, `npx <tool>`, and `node scripts/*` are already covered by the repo-local rules added 2026-07-09.

### NEEDS-WRAPPER — Suggest script wrapper

None observed in the analyzed sessions. (`git push` and deploy commands will appear in the upcoming `web-deploy-pipeline`/`docs-sync-and-release` plan steps; when they do, consider a `tools/safe-push.sh` wrapper per the skill template — but note this repo intentionally works on `main`, so the template's main-branch block would need adjusting for this repo's policy.)

### CONTEXT-DEPENDENT — Keep as approval-required

| Command | Why context-dependent | Condition that would make it safe |
|---------|-----------------------|-----------------------------------|
| `node apply-migrations.js <sql>` | Executes SQL against the live Supabase DB | Keep prompting — each migration should be consciously approved (the execute-plan run surfaces these explicitly anyway) |
| `supabase functions deploy` | Publishes code to a live backend | Keep prompting per deploy |
| `python3 -c '…'` / ad-hoc one-liners | Arbitrary code | Leave as-is; used rarely (deny-rule workarounds for config files) |

### NEVER-ALLOW — Flag for awareness

| Command | Risk | Recommendation |
|---------|------|----------------|
| (none observed) | — | The global settings already deny `find -delete`, `find -exec rm`, `unlink`, and hand-edits of `package.json`/`requirements.txt`; those denies correctly remain active even in bypass/accept-edits modes. |

---

## Proposed Permission Block (for human review only — do not apply without discussion)

### Repo `.claude/settings.local.json` additions

```json
{
  "permissions": {
    "allow": [
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira status*)",
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira log*)",
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira diff*)",
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira ls-files*)",
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira show*)",
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira branch*)",
      "Bash(git -C /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira tag*)",
      "Bash(! grep*)"
    ]
  }
}
```

No global-settings additions proposed: the two findings are repo-shaped (literal repo path; plan-validation grep idiom), so repo-local is the right scope.

---

## Gemini Note

Gemini CLI stores conversation history as flat files without structured tool invocation records. Automated analysis is not supported in this version.

---

## Next Steps

1. The Edit-prompt symptom reported today is addressed: `Edit`/`Write` allow rules exist in `.claude/settings.local.json` and were activated via the `/permissions` reload. If prompts persist, the session-mode toggle (shift+tab → accept edits) is the immediate override.
2. Review the two ALLOW-DIRECT proposals above (git `-C` read-only forms, negated grep); apply via the `update-config` skill if approved.
3. Re-run `/permission-audit` after the plan's deploy phase (Phase H) — that phase introduces `git push`, `supabase functions deploy`, and Verpex upload commands that deserve a fresh classification pass.
