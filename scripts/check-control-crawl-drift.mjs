// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-control-crawl-drift.mjs
// Description: Compares a runtime control-crawl artifact against the interactive-control
//   inventory and reports visible controls whose role/name pair is not represented there.
// Author: Codex
// Created: 2026-07-13

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const crawlPathArg = process.argv[2];
if (!crawlPathArg) {
  console.error('Usage: node scripts/check-control-crawl-drift.mjs <artifacts/control-crawl-*.json>');
  process.exit(1);
}

const repoRoot = process.cwd();
const inventory = JSON.parse(readFileSync(resolve(repoRoot, 'tests/e2e/control-inventory.json'), 'utf8'));
const crawl = JSON.parse(readFileSync(resolve(repoRoot, crawlPathArg), 'utf8'));

function normalize(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : '';
}

function inventoryNeedles(control) {
  const selector = control?.selector;
  if (!selector || typeof selector !== 'object') return [];

  const needles = [];
  const role = normalize(selector.role);
  const name = normalize(selector.name);
  const text = normalize(selector.text);
  if (role && name) needles.push(`${role}::${name}`);
  if (role && text) needles.push(`${role}::${text}`);
  if (name) needles.push(`*::${name}`);
  if (text) needles.push(`*::${text}`);

  if (typeof selector.css === 'string') {
    const placeholderMatch = selector.css.match(/placeholder="([^"]+)"/);
    if (placeholderMatch) {
      needles.push(`input::${normalize(placeholderMatch[1])}`);
      needles.push(`textarea::${normalize(placeholderMatch[1])}`);
      needles.push(`*::${normalize(placeholderMatch[1])}`);
    }
  }

  return needles;
}

const known = new Set();
for (const control of Array.isArray(inventory.controls) ? inventory.controls : []) {
  for (const needle of inventoryNeedles(control)) {
    known.add(needle);
  }
}

const unknown = [];
for (const surface of Array.isArray(crawl.surfaces) ? crawl.surfaces : []) {
  for (const control of Array.isArray(surface.controls) ? surface.controls : []) {
    const role = normalize(control.role || control.tag);
    const name = normalize(control.name || control.text);
    if (!role || !name) continue;

    const candidates = [
      `${role}::${name}`,
      `*::${name}`,
    ];
    const isKnown = candidates.some((candidate) => known.has(candidate));
    if (!isKnown) {
      unknown.push({
        surface: surface.surface || 'unknown',
        role,
        name,
      });
    }
  }
}

const deduped = [];
const seen = new Set();
for (const item of unknown) {
  const key = `${item.surface}::${item.role}::${item.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(item);
}

if (deduped.length > 0) {
  console.error('Control crawl drift detected. Visible controls missing from inventory:');
  for (const item of deduped) {
    console.error(`- ${item.surface}: ${item.role} :: ${item.name}`);
  }
  process.exit(1);
}

console.log('Control crawl drift check OK: all crawled visible controls matched an inventory needle.');
