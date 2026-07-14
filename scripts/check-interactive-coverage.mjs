// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-interactive-coverage.mjs
// Description: Minimal orphan-control coverage gate scaffold. Fails if any control in the
//   inventory has no mapped test spec. This is the first enforcement step toward T-COV2.
// Author: Codex
// Created: 2026-07-11

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const inventoryPath = resolve(process.cwd(), 'tests/e2e/control-inventory.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const controls = Array.isArray(inventory.controls) ? inventory.controls : [];
const touchArtifactsDir = resolve(process.cwd(), 'artifacts/control-touches');
const DEPTH_ORDER = ['rendered', 'clicked', 'value-changed', 'outcome-asserted'];
const allowedDepths = new Set(DEPTH_ORDER);

const duplicateIds = [];
const seenIds = new Set();
const invalidSelectors = [];
const missingSpecFiles = [];
const uncovered = [];
const invalidClaims = [];
const renderedOnly = [];
const legacyClaims = [];
const unverifiableClaims = [];
const untouchedClaims = [];
const unknownTouchedControls = [];
const underTouchedClaims = [];
const specCache = new Map();
const controlIds = new Set();
const touchedBySpec = new Map();

for (const control of controls) {
  if (typeof control.id === 'string' && control.id.trim() !== '') {
    controlIds.add(control.id);
  }
}

if (existsSync(touchArtifactsDir)) {
  for (const entry of readdirSync(touchArtifactsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const payload = JSON.parse(readFileSync(resolve(touchArtifactsDir, entry.name), 'utf8'));
    const specPath = typeof payload.spec === 'string' ? payload.spec : '';
    if (!specPath) continue;

    let specTouches = touchedBySpec.get(specPath);
    if (!specTouches) {
      specTouches = new Map();
      touchedBySpec.set(specPath, specTouches);
    }

    for (const touch of Array.isArray(payload.touches) ? payload.touches : []) {
      const id = typeof touch?.id === 'string' ? touch.id : '';
      const depth = typeof touch?.depth === 'string' ? touch.depth : '';
      if (!id || !allowedDepths.has(depth)) continue;
      if (!controlIds.has(id)) {
        unknownTouchedControls.push(`${specPath}:${id}`);
        continue;
      }
      const current = specTouches.get(id);
      if (!current || DEPTH_ORDER.indexOf(depth) > DEPTH_ORDER.indexOf(current)) {
        specTouches.set(id, depth);
      }
    }
  }
}

function readSpec(specPath) {
  const absolute = resolve(process.cwd(), specPath);
  if (!specCache.has(absolute)) {
    specCache.set(absolute, readFileSync(absolute, 'utf8'));
  }
  return specCache.get(absolute);
}

function selectorNeedles(selector) {
  if (!selector || typeof selector !== 'object') {
    return [];
  }

  if (typeof selector.name === 'string' && selector.name.trim() !== '') {
    return [selector.name];
  }
  if (typeof selector.text === 'string' && selector.text.trim() !== '') {
    return [selector.text];
  }
  if (typeof selector.css === 'string') {
    const placeholderMatch = selector.css.match(/placeholder="([^"]+)"/);
    if (placeholderMatch) {
      return [placeholderMatch[1], selector.css];
    }
    return [selector.css];
  }
  return [];
}

function normalizeClaims(control) {
  if (!Array.isArray(control.covered_by) || control.covered_by.length === 0) {
    return [];
  }

  return control.covered_by
    .map((entry) => {
      if (typeof entry === 'string') {
        legacyClaims.push(control.id || '<missing-id>');
        return {
          spec: entry,
          depth: 'unknown',
          legacy: true,
        };
      }
      if (!entry || typeof entry !== 'object') {
        invalidClaims.push(`${control.id}:<invalid-claim>`);
        return null;
      }
      const spec = typeof entry.spec === 'string' ? entry.spec : '';
      const depth = typeof entry.depth === 'string' ? entry.depth : '';
      if (!spec) {
        invalidClaims.push(`${control.id}:<missing-spec>`);
        return null;
      }
      if (!allowedDepths.has(depth)) {
        invalidClaims.push(`${control.id}:${spec}:<invalid-depth:${depth || 'missing'}>`);
        return null;
      }
      return { spec, depth, legacy: false };
    })
    .filter(Boolean);
}

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

  const claims = normalizeClaims(control);
  if (claims.length === 0) {
    uncovered.push(control);
    continue;
  }

  let maxDepthIndex = -1;
  for (const claim of claims) {
    const specPath = claim.spec;
    const absolute = resolve(process.cwd(), specPath);
    if (claim.depth !== 'unknown') {
      maxDepthIndex = Math.max(maxDepthIndex, DEPTH_ORDER.indexOf(claim.depth));
    }
    if (typeof specPath !== 'string' || specPath.trim() === '') {
      missingSpecFiles.push(`${control.id}:<invalid-spec-path>`);
      continue;
    }
    if (!existsSync(absolute)) {
      missingSpecFiles.push(`${control.id}:${specPath}`);
      continue;
    }
    if (!claim.legacy) {
      const touched = touchedBySpec.get(specPath)?.get(control.id);
      if (touched) {
        if (DEPTH_ORDER.indexOf(touched) < DEPTH_ORDER.indexOf(claim.depth)) {
          underTouchedClaims.push(`${control.id}:${specPath}:${touched}->${claim.depth}`);
        }
        continue;
      }

      const needles = selectorNeedles(selector);
      if (needles.length === 0) {
        unverifiableClaims.push(`${control.id}:${specPath}`);
      } else {
        const specBody = readSpec(specPath);
        const touched = needles.some((needle) => specBody.includes(needle));
        if (!touched) {
          untouchedClaims.push(`${control.id}:${specPath}`);
        }
      }
    }
  }
  if (maxDepthIndex === 0) {
    renderedOnly.push(control.id);
  }
}

if (uncovered.length > 0) {
  console.error('Interactive coverage check failed. Uncovered controls:');
  for (const control of uncovered) {
    console.error(`- ${control.screen}:${control.id}`);
  }
  process.exit(1);
}

if (invalidClaims.length > 0) {
  console.error('Interactive coverage check failed. Invalid covered_by claim entries:');
  for (const ref of invalidClaims) {
    console.error(`- ${ref}`);
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

if (unknownTouchedControls.length > 0) {
  console.error('Interactive coverage check failed. Touch artifacts referenced unknown control ids:');
  for (const ref of unknownTouchedControls) {
    console.error(`- ${ref}`);
  }
  process.exit(1);
}

const warningLines = [];
if (legacyClaims.length > 0) {
  warningLines.push(
    `legacy covered_by strings still present for ${new Set(legacyClaims).size} control(s); migrate to { spec, depth } claims.`,
  );
}
if (renderedOnly.length > 0) {
  warningLines.push(
    `${renderedOnly.length} control(s) are only marked at depth=rendered; prefer clicked/value-changed/outcome-asserted.`,
  );
}
if (untouchedClaims.length > 0) {
  warningLines.push(
    `${untouchedClaims.length} structured claim(s) could not be verified by selector-text grep; check claimed specs actually touch those controls.`,
  );
}
if (underTouchedClaims.length > 0) {
  warningLines.push(
    `${underTouchedClaims.length} structured claim(s) were touched at a LOWER depth than claimed; align inventory depth with observed interaction depth.`,
  );
}
if (unverifiableClaims.length > 0) {
  warningLines.push(
    `${unverifiableClaims.length} structured claim(s) use selectors with no grep-friendly text needle; prefer role/name, text, test id, or placeholder selectors.`,
  );
}

console.log(`Interactive coverage inventory OK: ${controls.length} controls mapped with valid ids, selectors, and spec references.`);
if (warningLines.length > 0) {
  console.warn('Interactive coverage warnings:');
  for (const line of warningLines) {
    console.warn(`- ${line}`);
  }
}
