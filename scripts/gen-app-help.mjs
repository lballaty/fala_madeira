// File: scripts/gen-app-help.mjs
// Description: Generator (EN-17a, consumer 4b) — projects the App Capability Registry
//   (src/content/appCapabilities.ts) into a compact, deterministic edge artifact
//   (supabase/functions/_shared/appHelp.generated.ts) that the chat-help system prompt reads.
//   One source, one generated projection: the edge fn never hand-maintains a feature list again.
//   The projection uses `short` (not `long`) so the system prompt stays lean, and groups by app
//   area. The registry is TypeScript; to read it without a TS runtime dependency in the edge (and
//   to avoid a fragile cross-runtime import) we load it via a `tsx` child process that prints the
//   registry as JSON, then format deterministically here. Idempotent: re-running produces byte-
//   identical output (scripts/check-help-drift.mjs asserts this). Run: node scripts/gen-app-help.mjs
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REGISTRY = resolve(ROOT, 'src/content/appCapabilities.ts');
const OUT = resolve(ROOT, 'supabase/functions/_shared/appHelp.generated.ts');

/**
 * Load APP_CAPABILITIES + APP_AREA_LABELS from the TS registry by running a tiny extractor under
 * tsx (dev dependency) and reading the JSON it prints. No TS is imported into this mjs directly.
 */
export function loadRegistry() {
  const extractor = [
    `import { APP_CAPABILITIES, APP_AREA_LABELS } from ${JSON.stringify(REGISTRY)};`,
    `process.stdout.write(JSON.stringify({ caps: APP_CAPABILITIES, labels: APP_AREA_LABELS }));`,
  ].join('\n');
  const raw = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-'],
    { input: extractor, cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(raw);
}

/** Build the compact, deterministic edge artifact source. */
export function renderArtifact({ caps, labels }) {
  // Group by area in first-appearance order (stable, matches the manual's section order).
  const order = [];
  const byArea = new Map();
  for (const c of caps) {
    if (!byArea.has(c.area)) {
      byArea.set(c.area, []);
      order.push(c.area);
    }
    byArea.get(c.area).push(c);
  }

  const sections = order.map((area) => ({
    area,
    label: labels[area],
    items: byArea.get(area).map((c) => ({
      title: c.title,
      short: c.short,
    })),
  }));

  const header = [
    '// File: supabase/functions/_shared/appHelp.generated.ts',
    '// DO NOT EDIT — generated from src/content/appCapabilities.ts by scripts/gen-app-help.mjs.',
    "// Run `node scripts/gen-app-help.mjs` to regenerate; scripts/check-help-drift.mjs guards drift.",
    '// This is the compact chat-help projection (EN-17a): per app area, each capability\'s title +',
    '// one-line summary. The gemini isHelpMode branch builds its "APP STRUCTURE" section from this.',
    '',
    '/** One app area with its capabilities, projected for the chat-help system prompt. */',
    'export interface AppHelpSection {',
    '  area: string;',
    '  label: string;',
    '  items: { title: string; short: string }[];',
    '}',
    '',
  ].join('\n');

  const body = `export const APP_HELP_SECTIONS: AppHelpSection[] = ${JSON.stringify(sections, null, 2)};\n`;

  // A ready-to-embed plain-text block so the prompt builder stays trivial + provider-neutral.
  const text = sections
    .map((s) => `${s.label}:\n${s.items.map((i) => `- ${i.title}: ${i.short}`).join('\n')}`)
    .join('\n\n');
  const textConst = `\nexport const APP_HELP_TEXT = ${JSON.stringify(text)};\n`;

  return `${header}\n${body}${textConst}`;
}

export function generate() {
  const registry = loadRegistry();
  return renderArtifact(registry);
}

// When run directly, write the artifact to disk.
if (import.meta.url === `file://${process.argv[1]}`) {
  const content = generate();
  const dir = dirname(OUT);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUT, content, 'utf8');
  console.log(`Generated ${OUT.replace(ROOT + '/', '')} (${content.length} bytes).`);
}
