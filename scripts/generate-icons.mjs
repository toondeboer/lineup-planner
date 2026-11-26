// Generates the app icon, splash images and favicon in assets/ from the design tokens.
// Concept "Centre circle": the halfway line and centre circle, split into three arcs, one per
// rotation group.
//
// Run with `npm run icons` (Node 22.18+ or 23.6+, which load the TypeScript tokens directly).
// Uses the Playwright Chromium that the e2e tests already install.
import path from 'node:path';
import { chromium } from 'playwright';
import { black, green, white } from '../src/design/tokens/primitives.ts';

const out = (name) => path.resolve('assets', name);

/** Point on a circle, with 0° at the top, clockwise. */
function point(r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)].map((v) => v.toFixed(2));
}
function arc(r, from, to) {
  const [x0, y0] = point(r, from);
  const [x1, y1] = point(r, to);
  return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
}

/** The mark on a 100 × 100 grid, scaled around the centre. */
function mark(color, scale = 1) {
  // Placed so the halfway line crosses the opaque arc on the right and a gap on the left: where a
  // translucent line crossed a translucent arc, the overlap showed as a brighter patch.
  // The gaps are 33° wide so the round arc ends leave room for the line to pass through.
  const arcs = [
    [46.5, 133.5, 1],
    [166.5, 253.5, 0.75],
    [286.5, 373.5, 0.5],
  ];
  return `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    <line x1="12" y1="50" x2="88" y2="50" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
    ${arcs.map(([a, b, o]) => `<path d="${arc(24, a, b)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" opacity="${o}"/>`).join('')}
    <circle cx="50" cy="50" r="5" fill="${color}"/>
  </g>`;
}

function svg(size, { background, radius = 0, color, scale }) {
  const bg = background ? `<rect width="100" height="100" rx="${radius}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${bg}${mark(color, scale)}</svg>`;
}

const ANDROID_SCALE = 0.75; // keeps the mark inside the adaptive icon's 66/108 safe zone

const files = [
  // iOS light (and the default icon): opaque, full bleed, no rounded corners
  ['icon.png', 1024, { background: green[700], color: white }],
  // iOS dark: transparent; iOS draws its own dark background behind it
  ['icon-dark.png', 1024, { color: green[300] }],
  // iOS tinted: greyscale on black; iOS applies the user's tint
  ['icon-tinted.png', 1024, { background: black, color: white }],
  // Android adaptive icon: background colour is set in app.config.ts
  ['android-icon-foreground.png', 1024, { color: white, scale: ANDROID_SCALE }],
  ['android-icon-monochrome.png', 1024, { color: white, scale: ANDROID_SCALE }],
  // splash screens: the mark on the canvas colour (set in app.config.ts)
  ['splash-icon.png', 1024, { color: green[700] }],
  ['splash-icon-dark.png', 1024, { color: green[300] }],
  // browser tab
  ['favicon.png', 48, { background: green[700], radius: 22, color: white }],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, opts] of files) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opts)}</body></html>`);
  await page.locator('svg').screenshot({ path: out(name), omitBackground: true });
  console.log(`assets/${name} (${size}px)`);
}
await browser.close();
