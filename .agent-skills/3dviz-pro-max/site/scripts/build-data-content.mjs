// Content readers: the study cards, the palette tokens and the install instructions.
import { readdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readText, fromRepo, readStyleRecord, LOOKS, INSTALL_DOC } from './build-data-sources.mjs';

/**
 * Chapter order on the page (the Daylight design's order), keyed by the `## ` headings of
 * examples/README.md. That document is the source of every card's chapter, title and blurb;
 * a heading it grows that is not listed here stops the build.
 */
export const CHAPTERS = [
  'Crafted worlds, characters, architecture, and props',
  'Lighting studies',
  'Anatomy and physiology',
  'Mathematics',
  'Physics and mechanisms',
];

const EXAMPLES_README = 'examples/README.md';
/** `- [The Living Heart](heart/) — registered heart anatomy, …` */
const CARD_LINE = /^-\s+\[([^\]]+)\]\(([^/)]+)\/\)\s+—\s+(\S.*?)\s*$/;
const CLIPS_DIR = fileURLToPath(new URL('../public/media/clips/', import.meta.url));

/** Every `- [Title](id/) — blurb` line of the README, tagged with the heading it sits under. */
export function parseReadmeCards(markdown) {
  const cards = [];
  let heading = null;
  for (const line of markdown.split('\n')) {
    const head = line.match(/^##\s+(\S.*?)\s*$/);
    if (head) {
      heading = head[1];
      continue;
    }
    const card = line.match(CARD_LINE);
    if (!card) continue;
    cards.push({ chapter: heading, title: card[1], id: card[2], blurb: card[3] });
  }
  return cards;
}

/** Study ids whose hover clip is on disk in both encodings; the list is never typed by hand. */
async function recordedClipIds() {
  let names = [];
  try {
    names = await readdir(CLIPS_DIR);
  } catch {
    return new Set();
  }
  const stems = (extension) =>
    new Set(names.filter((name) => name.endsWith(extension)).map((name) => name.slice(0, -extension.length)));
  const webm = stems('.webm');
  return new Set([...stems('.mp4')].filter((id) => webm.has(id)));
}

/** README cards against the catalog: every id exactly once, every heading a known chapter. */
export function checkAgainstCatalog(cards, catalogIds) {
  const headings = [...new Set(cards.map((card) => card.chapter))];
  for (const heading of headings) {
    if (!CHAPTERS.includes(heading)) {
      throw new Error(`build-data: ${EXAMPLES_README} heading "${heading}" is not an authored chapter`);
    }
  }
  for (const chapter of CHAPTERS) {
    if (!headings.includes(chapter)) {
      throw new Error(`build-data: ${EXAMPLES_README} has no "## ${chapter}" heading`);
    }
  }
  const seen = new Set();
  for (const card of cards) {
    if (!catalogIds.has(card.id)) {
      throw new Error(`build-data: ${EXAMPLES_README} lists "${card.id}", which the catalog does not know`);
    }
    if (seen.has(card.id)) throw new Error(`build-data: ${EXAMPLES_README} lists "${card.id}" twice`);
    seen.add(card.id);
  }
  for (const id of catalogIds) {
    if (!seen.has(id)) throw new Error(`build-data: ${EXAMPLES_README} has no line for study "${id}"`);
  }
}

/**
 * One card per study: chapter, title and blurb from examples/README.md, id and accent from
 * examples/shared/catalog.js (plain ESM, so it imports directly). Cards keep README order inside
 * their chapter, and the chapters keep the order above.
 */
export async function readExamples() {
  const catalog = await import(pathToFileURL(fromRepo('examples/shared/catalog.js')).href);
  const studies = new Map([
    ...Object.entries(catalog.artScience ?? {}),
    ...Object.entries(catalog.breadth ?? {}),
  ]);
  if (studies.size === 0) throw new Error('build-data: examples/shared/catalog.js exports no studies');

  const cards = parseReadmeCards(await readText(EXAMPLES_README));
  checkAgainstCatalog(cards, new Set(studies.keys()));
  const clips = await recordedClipIds();

  return cards
    .map((card) => {
      const study = studies.get(card.id);
      if (!study?.accent) throw new Error(`build-data: study ${card.id} has no accent in the catalog`);
      return {
        id: card.id,
        title: card.title,
        blurb: card.blurb,
        chapter: card.chapter,
        accent: study.accent,
        href: `/examples/${card.id}/`,
        thumb: `media/examples/${card.id}.jpg`,
        clip: clips.has(card.id) ? `media/clips/${card.id}` : null,
      };
    })
    .sort((a, b) => CHAPTERS.indexOf(a.chapter) - CHAPTERS.indexOf(b.chapter));
}

/** Palette token names in the order their hexes first appear in the lantern-festival record. */
const PALETTE_TOKENS = ['lantern', 'night', 'dusk', 'plum', 'rim', 'glow', 'ember', 'cream', 'bark'];
const PALETTE_RECORD = 'knowledge.style-lantern-festival-riverside';

/** The hero's dusk sky wears the skill's own named look, read out of the style record itself. */
export async function readPalette() {
  const record = await readStyleRecord(PALETTE_RECORD);
  if (!record) throw new Error(`build-data: ${LOOKS} has no record ${PALETTE_RECORD}`);
  const seen = [];
  for (const hex of JSON.stringify(record).match(/#[0-9a-fA-F]{6}/g) ?? []) {
    const lower = hex.toLowerCase();
    if (!seen.includes(lower)) seen.push(lower);
  }
  if (seen.length < PALETTE_TOKENS.length - 1) {
    throw new Error(`build-data: ${PALETTE_RECORD} yields only ${seen.length} colours`);
  }
  if (seen.length > PALETTE_TOKENS.length) {
    throw new Error(`build-data: ${PALETTE_RECORD} yields ${seen.length} colours, more than named tokens`);
  }
  return {
    record: PALETTE_RECORD,
    colors: Object.fromEntries(seen.map((hex, index) => [PALETTE_TOKENS[index], hex])),
  };
}

const INSTALL_TABS = [
  { id: 'claude-code', label: 'Claude Code', heading: 'Claude Code' },
  { id: 'codex', label: 'Codex', heading: 'Codex' },
];

/** Body of one `## <heading>` section, up to the next `## ` heading. */
function sectionBody(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) throw new Error(`build-data: ${INSTALL_DOC} has no "## ${heading}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return end === -1 ? rest : rest.slice(0, end);
}

function splitBlocks(bodyLines) {
  const steps = [];
  const commands = [];
  // `blocks` keeps prose and fenced code in document order so the page can interleave them.
  const blocks = [];
  let paragraph = [];
  let fence = null;
  for (const line of bodyLines) {
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      if (fence) {
        const text = fence.code.join('\n');
        if (fence.lang === 'sh') commands.push(text);
        if (fence.lang === 'sh' || fence.lang === 'text') blocks.push({ kind: 'code', lang: fence.lang, text });
        fence = null;
      } else {
        fence = { lang: fenceMatch[1], code: [] };
      }
      continue;
    }
    if (fence) {
      fence.code.push(line);
      continue;
    }
    if (line.trim() === '') {
      if (paragraph.length) {
        const text = paragraph.join(' ').trim();
        steps.push(text);
        blocks.push({ kind: 'p', text });
      }
      paragraph = [];
    } else paragraph.push(line.trim());
  }
  if (paragraph.length) {
    const text = paragraph.join(' ').trim();
    steps.push(text);
    blocks.push({ kind: 'p', text });
  }
  return { steps, commands, blocks };
}

/** Install tabs, copied verbatim out of docs/installation.md. */
export async function readInstall() {
  const markdown = await readText(INSTALL_DOC);
  const tabs = INSTALL_TABS.map(({ id, label, heading }) => {
    const { steps, commands, blocks } = splitBlocks(sectionBody(markdown, heading));
    if (steps.length === 0) throw new Error(`build-data: "## ${heading}" in ${INSTALL_DOC} has no prose`);
    return { id, label, intro: steps[0], steps: steps.slice(1), commands, blocks: blocks.slice(1) };
  });
  if (tabs.every((tab) => tab.commands.length === 0)) {
    throw new Error(`build-data: no shell command found in any install section of ${INSTALL_DOC}`);
  }
  return tabs;
}
