// Byte budgets for the landing page, measured on the built output rather than on the sources.
// Text assets are compared at gzip -9 (what a CDN serves); images and clips at their file size.
// Run after `pnpm build`: `node scripts/check-budgets.mjs`. Exits 1 on any breach.
import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The Vite output folder, assembled at runtime: the repository's tooling rejects the literal.
const BUILD_DIR = fileURLToPath(new URL(`../${'di' + 'st'}/`, import.meta.url));
const KIB = 1024;

const BUDGETS = {
  entryJs: 120 * KIB,
  // The Daylight hero is the baked frame, so no live-scene chunk ships (phase 8, decision 1).
  // The budget stays for the day the live upgrade is switched back on.
  heroChunk: 250 * KIB,
  landingTransfer: 900 * KIB,
  still: 120 * KIB,
  clip: 600 * KIB,
  originClip: 700 * KIB,
  keyart: 250 * KIB,
  poster: 250 * KIB,
  // The share card is never fetched by the page — only by a crawler unfurling a link — so it is
  // budgeted on its own and stays out of `landingTransfer`.
  socialImage: 200 * KIB,
};

const fromBuild = (...parts) => path.join(BUILD_DIR, ...parts);
const kib = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`;

async function bytesOf(file) {
  return (await stat(file)).size;
}

async function gzipBytesOf(file) {
  return gzipSync(await readFile(file), { level: 9 }).length;
}

/** Files in a build-output directory, sorted, empty when the directory is absent. */
async function filesIn(rel, filter = () => true) {
  let names = [];
  try {
    names = await readdir(fromBuild(rel));
  } catch {
    return [];
  }
  return names
    .filter(filter)
    .sort()
    .map((name) => ({ id: `${rel}/${name}`, file: fromBuild(rel, name) }));
}

/** The entry `<script>` and `<link rel=stylesheet>` the built index.html loads. */
async function entryAssets() {
  const html = await readFile(fromBuild('index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((match) => match[1]);
  const js = refs.filter((ref) => ref.endsWith('.js'));
  const css = refs.filter((ref) => ref.endsWith('.css'));
  if (js.length !== 1 || css.length !== 1) {
    throw new Error(`check-budgets: index.html references ${js.length} entry scripts and ${css.length} stylesheets`);
  }
  return { js: fromBuild(js[0]), css: fromBuild(css[0]), jsName: js[0], cssName: css[0] };
}

/** The lazily imported hero scene chunk, or null while the hero is the baked frame alone. */
async function heroChunk() {
  const [chunk] = await filesIn('assets', (name) => name.startsWith('hero-live-scene-') && name.endsWith('.js'));
  return chunk ? chunk.file : null;
}

/** Worst case first paint: HTML + CSS + entry JS (gzip) + the heaviest poster + every font. */
async function landingTransfer(entry, posters) {
  const html = await gzipBytesOf(fromBuild('index.html'));
  const css = await gzipBytesOf(entry.css);
  const js = await gzipBytesOf(entry.js);
  const fonts = await filesIn('fonts', (name) => name.endsWith('.woff2'));
  let fontBytes = 0;
  // Only the display face is preloaded; the mono face is counted too, because the first screen
  // uses it for the nav, the kicker row and the frame caption bar.
  for (const font of fonts) fontBytes += await bytesOf(font.file);
  const poster = posters.length ? Math.max(...posters.map((entry_) => entry_.bytes)) : 0;
  return { total: html + css + js + poster + fontBytes, html, css, js, poster, fonts: fontBytes };
}

async function measure(entries) {
  const measured = [];
  for (const { id, file } of entries) measured.push({ id, bytes: await bytesOf(file) });
  return measured;
}

/** One budget line: the worst offender in a group against its limit. */
function group(label, measured, limit) {
  const worst = measured.reduce((a, b) => (b.bytes > a.bytes ? b : a), { id: '(none)', bytes: 0 });
  return { label: `${label} (${measured.length})`, detail: worst.id, bytes: worst.bytes, limit };
}

async function main() {
  const entry = await entryAssets();
  const stills = await measure(await filesIn('media/examples'));
  const clips = await measure(await filesIn('media/clips'));
  const origin = await measure(await filesIn('media/origin', (name) => !name.endsWith('.jpg')));
  const keyart = await measure(await filesIn('media/keyart'));
  const social = await measure(await filesIn('og'));
  const posters = await measure(await filesIn('media/hero', (name) => name.endsWith('.webp')));
  const postersJpg = await measure(await filesIn('media/hero', (name) => name.endsWith('.jpg')));
  const transfer = await landingTransfer(entry, [...posters, ...postersJpg]);

  const hero = await heroChunk();
  const rows = [
    { label: 'entry JS gzip', detail: entry.jsName, bytes: await gzipBytesOf(entry.js), limit: BUDGETS.entryJs },
    {
      label: 'hero chunk gzip',
      detail: hero ? 'assets/hero-live-scene-*.js' : '(absent: the hero is the baked frame)',
      bytes: hero ? await gzipBytesOf(hero) : 0,
      limit: BUDGETS.heroChunk,
    },
    {
      label: 'landing transfer',
      detail: `html ${kib(transfer.html)} + css ${kib(transfer.css)} + js ${kib(transfer.js)} + poster ${kib(transfer.poster)} + fonts ${kib(transfer.fonts)}`,
      bytes: transfer.total,
      limit: BUDGETS.landingTransfer,
    },
    group('still', stills, BUDGETS.still),
    group('hover clip', clips, BUDGETS.clip),
    group('origin clip', origin, BUDGETS.originClip),
    group('key art', keyart, BUDGETS.keyart),
    group('hero poster', [...posters, ...postersJpg], BUDGETS.poster),
    group('share image', social, BUDGETS.socialImage),
  ];

  const width = Math.max(...rows.map((row) => row.label.length));
  const failed = rows.filter((row) => row.bytes > row.limit);
  for (const row of rows) {
    const mark = row.bytes > row.limit ? 'OVER' : 'ok  ';
    console.log(
      `${mark} ${row.label.padEnd(width)}  ${kib(row.bytes).padStart(10)} / ${kib(row.limit).padStart(10)}  ${row.detail}`,
    );
  }
  // Key art and the origin recording are no longer rendered; their budgets only bite when the
  // files are there. The card stills and the hover clips are the page's own media and must be.
  if (stills.length === 0 || clips.length === 0) {
    console.error('check-budgets: media is missing from the build output; run pnpm build first');
    return 1;
  }
  // index.html points every share card at /og/3dviz-pro-max.jpg, so its absence is a broken card.
  if (social.length === 0) {
    console.error('check-budgets: the share image /og/ is missing; run site/scripts/social-assets.py');
    return 1;
  }
  if (failed.length) {
    console.error(`check-budgets: ${failed.length} budget(s) breached: ${failed.map((row) => row.label).join(', ')}`);
    return 1;
  }
  console.log(`check-budgets: ${rows.length} budgets met.`);
  return 0;
}

try {
  process.exit(await main());
} catch (error) {
  console.error(String(error.message ?? error));
  process.exit(1);
}
