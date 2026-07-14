// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/crawl-interactive-controls.mjs
// Description: Runtime control-crawl scaffold for CS-1. Uses the existing e2e auth states to
//   open the live app, visit the major user/admin surfaces, and snapshot visible interactive
//   controls into an artifact the runner can diff against the inventory.
// Author: Codex
// Created: 2026-07-13

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
const artifactsDir = resolve(repoRoot, 'artifacts');
const outPath = resolve(artifactsDir, `control-crawl-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const userStorageState = resolve(repoRoot, 'tests/e2e/.auth/test-user.json');
const adminStorageState = resolve(repoRoot, 'tests/e2e/.auth/admin.json');

mkdirSync(artifactsDir, { recursive: true });

function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

async function collectVisibleControls(page) {
  return page.evaluate(() => {
    const interactiveSelector = [
      'button',
      'a[href]',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="tab"]',
      '[role="combobox"]',
      '[role="slider"]',
      '[role="spinbutton"]',
    ].join(',');

    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const roleOf = (el) => el.getAttribute('role') || el.tagName.toLowerCase();
    const nameOf = (el) =>
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.innerText ||
      el.textContent ||
      '';

    return Array.from(document.querySelectorAll(interactiveSelector))
      .filter((el) => isVisible(el))
      .map((el) => ({
        role: roleOf(el),
        name: nameOf(el).replace(/\s+/g, ' ').trim(),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
      }))
      .filter((entry) => entry.name || entry.text);
  });
}

async function clickFirst(page, name) {
  const button = page.getByRole('button', { name, exact: true }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return true;
  }
  return false;
}

async function crawlUserSurface(page) {
  const snapshots = [];

  await page.goto(baseUrl);
  await page.getByRole('heading', { name: /Olá,/i }).waitFor({ timeout: 30_000 });

  snapshots.push({ surface: 'home', controls: await collectVisibleControls(page) });

  if (await clickFirst(page, 'Learning')) {
    await page.getByRole('heading', { name: 'Learning Plan' }).waitFor();
    snapshots.push({ surface: 'learning', controls: await collectVisibleControls(page) });
  }

  if (await clickFirst(page, 'Practice')) {
    await page.getByRole('heading', { name: 'Practice' }).waitFor();
    snapshots.push({ surface: 'practice', controls: await collectVisibleControls(page) });
  }

  if (await clickFirst(page, 'Tutor')) {
    await page.getByText(/Tutor/i).first().waitFor();
    snapshots.push({ surface: 'tutor', controls: await collectVisibleControls(page) });
  }

  if (await clickFirst(page, 'Profile')) {
    await page.getByRole('heading', { name: 'Profile' }).waitFor();
    snapshots.push({ surface: 'profile', controls: await collectVisibleControls(page) });
  }

  return snapshots;
}

async function crawlAdminSurface(page) {
  const snapshots = [];

  await page.goto(baseUrl);
  await page.getByRole('heading', { name: /Olá,/i }).waitFor({ timeout: 30_000 });
  if (!(await clickFirst(page, 'Admin'))) {
    return snapshots;
  }

  await page.getByRole('heading', { name: 'Admin' }).waitFor();
  snapshots.push({ surface: 'admin.review_queues', controls: await collectVisibleControls(page) });

  const contentStudioTab = page.getByRole('button', { name: /Content Studio/i }).first();
  if (await contentStudioTab.isVisible().catch(() => false)) {
    await contentStudioTab.click();
    await page.getByText(/Select a pack to author or edit its situations/i).waitFor();
    snapshots.push({ surface: 'admin.content_studio', controls: await collectVisibleControls(page) });
  }

  return snapshots;
}

const browser = await chromium.launch({ headless: true });
try {
  const userContext = await browser.newContext({ storageState: userStorageState });
  const userPage = await userContext.newPage();
  const userSnapshots = await crawlUserSurface(userPage);
  await userContext.close();

  const adminContext = await browser.newContext({ storageState: adminStorageState });
  const adminPage = await adminContext.newPage();
  const adminSnapshots = await crawlAdminSurface(adminPage);
  await adminContext.close();

  const payload = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    surfaces: [...userSnapshots, ...adminSnapshots].map((entry) => ({
      surface: entry.surface,
      controls: entry.controls.map((control) => ({
        role: normalizeText(control.role),
        name: normalizeText(control.name),
        text: normalizeText(control.text),
        tag: normalizeText(control.tag),
        type: normalizeText(control.type),
      })),
    })),
  };

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote control crawl artifact: ${outPath}`);
} finally {
  await browser.close();
}
