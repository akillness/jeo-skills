/**
 * netlify-build.mjs
 *
 * Tiny "build" step for the static site: copies just the runtime files
 * (HTML / CSS / JS / referenced PNG + OGG assets) into `dist/` so that
 * Netlify ships a clean publish directory and not the 4 MB of design
 * reference PNGs, the prompt notes, the local .DS_Store entries, the
 * tooling scripts, and the editor's .webp duplicates that nothing on
 * the page actually loads.
 *
 * No external dependencies — runs on Node ≥ 16's built-in `fs.cpSync`.
 */

import { rmSync, mkdirSync, cpSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

// Audio clips actually fetched at runtime by src/ui/Audio.js. Anything
// else at root (including the orphaned `placement.ogg`) is skipped.
const AUDIO_FILES = [
    'menu_select_lightbulb.ogg',
    'new-placement.ogg',
    'waterPlacement.ogg',
    'brick-stone.ogg',
    'fence-woodenDecorations.ogg',
    'small-vegetations.ogg',
    'large-vegetations.ogg',
];

const ENTRIES = [
    'index.html',
    'styles.css',
    'src',
    'assets',
    ...AUDIO_FILES,
];

console.log('Building dist/ …');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

let skipped = 0;
for (const entry of ENTRIES) {
    const src = join(ROOT, entry);
    if (!existsSync(src)) {
        console.warn(`  ! skipped (missing): ${entry}`);
        skipped++;
        continue;
    }
    const dst = join(DIST, entry);
    cpSync(src, dst, {
        recursive: true,
        // Filter out OS junk + the unused .webp duplicates living next
        // to the .png assets in `assets/newAsset/`.
        filter: (s) => {
            const name = s.split('/').pop();
            if (name === '.DS_Store') return false;
            if (name.endsWith('.webp')) return false;
            return true;
        },
    });
    const sz = sizeOf(src);
    console.log(`  ✓ ${entry.padEnd(34)} ${formatBytes(sz)}`);
}

const total = sizeOf(DIST);
console.log(`Built dist/ — ${formatBytes(total)} ready to publish.`);
if (skipped) process.exitCode = 1;

function sizeOf(p) {
    const st = statSync(p);
    if (st.isFile()) return st.size;
    let total = 0;
    for (const child of readdirSync(p)) {
        total += sizeOf(join(p, child));
    }
    return total;
}

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
