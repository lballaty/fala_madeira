// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/generate-icons.mjs
// Description: Generates PWA icons (192/512 PNG, apple-touch-icon 180x180, favicon 48x48)
//              from public/logo.svg using sharp. Re-runnable: node scripts/generate-icons.mjs
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const logoSvg = path.join(publicDir, 'logo.svg');

// Brand background color (rect fill in logo.svg / theme-color in index.html).
const BRAND_BG = '#0284c7';

// Render the SVG at high density so rasterized icons are crisp.
// logo.svg viewBox is 512x512; density 72 = 512px, so scale density with target size.
const renderSvg = (size) =>
  sharp(logoSvg, { density: Math.ceil((72 * size) / 512) * 4 })
    .resize(size, size);

async function generate() {
  // Standard transparent-background PWA icons.
  await renderSvg(192).png().toFile(path.join(publicDir, 'pwa-192x192.png'));
  await renderSvg(512).png().toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Apple touch icon must not be transparent: flatten onto the brand background
  // so the rounded-rect corners of the logo are filled (iOS applies its own mask).
  await renderSvg(180)
    .flatten({ background: BRAND_BG })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Maskable icon: flattened onto brand background so the platform mask
  // (circle/squircle) never reveals transparent corners.
  await renderSvg(512)
    .flatten({ background: BRAND_BG })
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // Favicon as 48x48 PNG (linked from index.html alongside the SVG icon).
  await renderSvg(48).png().toFile(path.join(publicDir, 'favicon-48x48.png'));

  console.log('Generated: pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png, apple-touch-icon.png, favicon-48x48.png');
}

generate().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
