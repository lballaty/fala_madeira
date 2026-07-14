# FalaMadeira AIDevOps Test Registration

This repo exposes its Playwright regression suites to AIDevOps through:

- `.aidevops/test-manifest.json`
- `scripts/run-e2e-aidevops.mjs`
- `scripts/run-e2e-regression.mjs`
- `artifacts/e2e/*.json`

## Intended suites

- `FalaMadeira E2E Smoke`
- `FalaMadeira E2E Regression`

## Seed in AIDevOps

After the repo is registered in AIDevOps, reseed the manifest:

`POST /api/repos/:id/tests/seed-manifest`

or use the repo-level manifest seed action from the AIDevOps UI/API.

## Current platform gap

The AIDevOps manifest seeder currently maps:

- `working_dir`
- `playwright_project`
- `spec_filter`

but not `config_file`.

FalaMadeira needs `playwright.config.ts`, so after seeding the suite, patch its config in
AIDevOps to include:

```json
{
  "working_dir": ".",
  "config_file": "playwright.config.ts",
  "project": "chromium"
}
```

Until manifest-side `config_file` support lands in AIDevOps, this patch is required for
platform-triggered execution.
