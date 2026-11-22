// Reader for the compatibility table of docs/compatibility.md, which the install panel states as
// its WORKS WITH rows. As everywhere in build-data, nothing is typed by hand: the surface names,
// the statements and their order are the document's own.
import { readText, COMPAT_DOC } from './build-data-sources.mjs';

/** Markdown to plain text: links keep their label, inline code and emphasis lose their marks. */
const plain = (text) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The first table of docs/compatibility.md: one `surface | statement` row per line. */
export async function readCompatibility() {
  const rows = [];
  let inTable = false;
  for (const line of (await readText(COMPAT_DOC)).split('\n')) {
    if (!line.startsWith('|')) {
      if (inTable) break;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 2) continue;
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) {
      inTable = true;
      continue;
    }
    if (inTable) rows.push({ surface: plain(cells[0]), statement: plain(cells[1]) });
  }
  if (rows.length === 0) throw new Error(`build-data: ${COMPAT_DOC} has no compatibility table`);
  return rows;
}
