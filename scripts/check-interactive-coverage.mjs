// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-interactive-coverage.mjs
// Description: Minimal orphan-control coverage gate scaffold. Fails if any control in the
//   inventory has no mapped test spec. This is the first enforcement step toward T-COV2.
// Author: Codex
// Created: 2026-07-11

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inventoryPath = resolve(process.cwd(), 'tests/e2e/control-inventory.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const controls = Array.isArray(inventory.controls) ? inventory.controls : [];

const uncovered = controls.filter((control) => !Array.isArray(control.covered_by) || control.covered_by.length === 0);
const duplicateIds = [];
const seenIds = new Set();
const invalidSelectors = [];
const missingSpecFiles = [];

for (const control of controls) {
  if (typeof control.id !== 'string' || control.id.trim() === '') {
    duplicateIds.push('<missing-id>');
  } else if (seenIds.has(control.id)) {
    duplicateIds.push(control.id);
  } else {
    seenIds.add(control.id);
  }

  const selector = control.selector;
  if (!selector || typeof selector !== 'object' || Object.keys(selector).length === 0) {
    invalidSelectors.push(control.id || '<missing-id>');
  }

  if (Array.isArray(control.covered_by)) {
    for (const specPath of control.covered_by) {
      if (typeof specPath !== 'string' || specPath.trim() === '') {
        missingSpecFiles.push(`${control.id}:<invalid-spec-path>`);
        continue;
      }
      const absolute = resolve(process.cwd(), specPath);
      if (!existsSync(absolute)) {
        missingSpecFiles.push(`${control.id}:${specPath}`);
      }
    }
  }
}

if (uncovered.length > 0) {
  console.error('Interactive coverage check failed. Uncovered controls:');
  for (const control of uncovered) {
    console.error(`- ${control.screen}:${control.id}`);
  }
  process.exit(1);
}

if (duplicateIds.length > 0) {
  console.error('Interactive coverage check failed. Duplicate or missing control ids:');
  for (const id of duplicateIds) {
    console.error(`- ${id}`);
  }
  process.exit(1);
}

if (invalidSelectors.length > 0) {
  console.error('Interactive coverage check failed. Controls with missing/invalid selectors:');
  for (const id of invalidSelectors) {
    console.error(`- ${id}`);
  }
  process.exit(1);
}

if (missingSpecFiles.length > 0) {
  console.error('Interactive coverage check failed. Missing spec files referenced by covered_by:');
  for (const ref of missingSpecFiles) {
    console.error(`- ${ref}`);
  }
  process.exit(1);
}

console.log(`Interactive coverage inventory OK: ${controls.length} controls mapped with valid ids, selectors, and spec references.`);
