# Session Handoff — 2026-07-09 → 2026-07-11 (v1.0.0 build + launch + live-testing)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/SESSION-HANDOFF-2026-07-11.md
**Description:** Superset handoff for the full-product build sessions: plan execution (56/56 steps), v1.0.0 launch to https://falamadeira.searchingfool.com, and the post-launch live-testing bug queue. Read this + the files in §1 to resume without chat history.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-11
**Last Updated:** 2026-07-11
**Last Updated By:** session handoff

## 0. Stream status
- **Plan `plans/plan-2026-07-09-full-product.yaml` (amended): ALL 56 steps succeeded, 0 failed, 0 blocked** — state in `plans/.plan-state.yaml` (per-step notes = the build log).
- **v1.0.0 is LIVE** at https://falamadeira.searchingfool.com (tag v1.0.0; deployed via `npm run deploy`, Verpex creds in gitignored `.env.deploy` — host s3142.fra1.stableserver.net, user gomadeir, key ~/.ssh/id_ed25519_photomanager, path /home/gomadeir/falamadeira.searchingfool.com).
- Content: pack v1.3.0 — 187 situations (168-day course, 28/month × 6 + 19 track-only), all enriched; DB=JSON=bundled checksums reconciled.
- **Active work: the live-testing bug queue** in `docs/REQUIREMENTS-TRACKER.md` (LT1–LT5 + FE1–FE3 + owner's T-COV1/T-COV2 test-coverage mandate, commit 662541b).

## 1. Read first (absolute paths)
1. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/AGENTS.md`
2. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/REQUIREMENTS-TRACKER.md` (LT/FE/T-COV queues — the active worklist)
3. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/plans/.plan-state.yaml`
4. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TEST-VERTICAL-SLICES.md` (G1–G6 evidence gaps)

## 2. Repo state (at handoff)
- Branch `main`, in sync with origin (no ahead/behind). Nothing staged.
- Untracked scratch (operator rm list): `_valpack.mjs`, `tests/e2e/_debug-tutor.spec.ts`, `tests/e2e/_probe-coach.spec.ts`, `tests/e2e/zzprobe-coach.spec.ts`; plus earlier list: `src/platform/web/probe.ts`, `src/features/tutor/UpgradeModal.tsx`, `inspect-fk-columns.js`, `check2.mjs`.
- Key commits: `3c667d3` v1.0.0 release · `e23c2af` PWA size fix · `caa5402` onboarding deadlock fix · `1f915a0` dead videos + FE tracker · `494d196` focus-trap fix (typing restored) · `662541b` owner's T-COV mandate.

## 3. Live-testing findings (2026-07-11, all deployed fixes verified by gates, NOT yet re-verified by owner in browser)
- **FIXED+deployed:** onboarding "Setting up…" deadlock (dual useOnboarding instances → single shared instance); dead d1/d15 videos in legacy `src/data/lessons.ts`; **useFocusTrap** (stable onClose ref + module-level trap stack — was stealing focus on every re-render, breaking text entry in correction/suggest-video/vocab-lookup/quiz forms).
- **OPEN (LT queue):** LT1/LT2/LT5 need owner confirmation post-fix + e2e that TYPES into each form; LT3 audio first-play ~5.7s (works, no spinner — fix = icon loading state + **Azure Speech key**: `supabase secrets set AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=… --project-ref gxlrmdfqcqimwwplrdgd`, no redeploy); LT4 lesson-gen 14.7s + 1.5s sleep + second round-trip (staged progress, drop sleep, parallelize).

## 4. Diagnostic methodology that worked (reuse it)
- Auth as admin via node: creds from `.admin-temp-credentials.txt`, `signInWithPassword`, then `sb.functions.invoke(...)` or direct `fetch` w/ JWT to get raw status+body. DB probes via pg direct (`db.gxlrmdfqcqimwwplrdgd.supabase.co:5432`, password in `.env.local`, parse file directly — dotenv v17 stdout gotcha).
- Verify claims against LIVE (two-pass): functions list, information_schema, pg_policies, checksum compare DB↔JSON↔bundled .ts.
- ALWAYS capture exit codes explicitly (`cmd; echo EXIT=$?`) — grep for "built in" masked a real PWA build failure once (and an `&&` chain masked a tsc failure).
- Gates: `bash scripts/preflight.sh` (the ship gate) · `npm run verify:security` · `node scripts/validate-content.mjs` · `npm test -- --run` (154) · `npx playwright test` (14 e2e; @smoke=6; `BASE_URL=https://falamadeira.searchingfool.com` for prod).

## 5. Empirically verified vs inferred
- **Verified live:** site 200s + MIME/SPA; 6/6 prod smoke; RLS probes; no secrets in bundles; gemini v5 + delete-account ACTIVE; tts action returns audio (gemini provider, 5.7s); chat action works with client payload shape; video_suggestions insert works with client shape (bug was client-side, since fixed); all 25 video URLs oEmbed-200.
- **Inferred/not yet verified:** the focus-trap fix resolves ALL four forms (high confidence, owner must confirm in browser); quiz "no sound" is the same TTS latency (not separately traced).

## 6. Priority next steps
1. Owner confirms in browser (hard refresh — SW caches!): forms accept text, submissions land, onboarding flows.
2. **T-COV1/T-COV2** (owner mandate, commit 662541b): e2e must exercise every button/field/link — start with the four forms (type + submit + assert row), quiz, audio icons. Un-pre-seed onboarding in one e2e to cover the flow that deadlocked.
3. LT3/LT4 latency UX + Azure key (owner sets key; then verify provider=azure in tts response).
4. Operator hygiene: Supabase Auth Site URL config; rotate admin password + delete creds file; rotate dev Gemini key; the 8-file rm list (§2).
5. FE1–FE3 (user-replaceable videos, video audit incl. embeddability, single video source of truth — LessonDetailModal still reads legacy `lesson.video_url`).
6. Deferred code items: sync-queue unit tests; useEntryAudio unmount cleanup; 2 settings toasts w/o Ref; M1 unlock-key server-side decision; L1 delete-account per-table error checks; useIsOnline dedup in SimulatorView.

## 7. Governance (non-negotiable)
Work on main; path-form commits; verify staged set; NO Co-Authored-By trailers. Deploy ONLY via `npm run deploy` from this device to the scoped Verpex dir. `Edit(**/package.json)` denied — npm CLI only. No bulk deletes. Errors through `src/lib/logger.ts` w/ correlation IDs. Content changes must pass `scripts/validate-content.mjs`; ship gate is `scripts/preflight.sh` exit 0.
