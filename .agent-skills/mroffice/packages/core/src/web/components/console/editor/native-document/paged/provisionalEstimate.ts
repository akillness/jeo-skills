/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where a long document's pages will fall, estimated from the stored blocks
 * alone, for the sheets it opens on (L3-DESIGN, step 4; `?textEngine=docs-layout`).
 *
 * The first ledger pass moves every block that opened on the wrong sheet, and
 * moving is the costly part of opening a long document: R286-D01 opened on 178
 * sheets for 126 pages and its first pass moved about 200 boundaries. Heights
 * here come from what the page states (sizes, line rules, spacing, row
 * heights, each section's text area and the room its bands take, footnotes,
 * Word's own last page turns) and each face's mean advance, with no font loaded
 * and no page: the sheets only have to be near, the ledger still lays out every page from the
 * content. No DOM, so it can run before anything is drawn, or in a worker.
 */

interface JsonNode {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown> | null;
  content?: unknown;
  marks?: unknown;
}

/** A body face's line at single spacing and its mean advance on English text,
 * in em (the served files' hhea and hmtx). A line's count is what a page
 * estimate turns on: 0.5 em overstated Calibri's text by a fifth. */
const FACES: Readonly<Record<string, readonly [lineEm: number, advanceEm: number]>> = {
  arial: [1.15, 0.449],
  helvetica: [1.15, 0.449],
  "arial narrow": [1.147, 0.369],
  calibri: [1.221, 0.413],
  cambria: [1.172, 0.431],
  "times new roman": [1.15, 0.403],
  verdana: [1.215, 0.517],
  tahoma: [1.207, 0.452],
  georgia: [1.136, 0.444],
  "courier new": [1.133, 0.6],
  aptos: [1.221, 0.434],
  "trebuchet ms": [1.161, 0.459],
  "century gothic": [1.226, 0.49],
  garamond: [1.125, 0.391],
  "book antiqua": [1.206, 0.445],
  "palatino linotype": [1.349, 0.445],
  "segoe ui": [1.33, 0.447],
  candara: [1.221, 0.426],
  corbel: [1.208, 0.415],
  constantia: [1.221, 0.437],
  century: [1.202, 0.467],
  "franklin gothic book": [1.134, 0.43],
  "gill sans mt": [1.16, 0.413],
};
const OTHER_FACE: readonly [number, number] = [1.2, 0.45];
const WIDE_CHARACTER_FROM = 0x2e80;
/** Lines end short of the measure by half a word, in characters. */
const LINE_END_WASTE_CHARACTERS = 2.5;
const DEFAULT_FONT_PX = 14.667;
const DEFAULT_CELL_MARGIN_PX = 9.6;
/** The border a row takes: half of a 1 px rule at each end. */
const ROW_BORDER_PX = 1;
/** How far down a sheet a turn of Word's is taken for the next page. */
const WORD_TURN_NEAR_TOP = 0.35;
/** The rule over a page's footnotes. */
const FOOTNOTE_SEPARATOR_PX = 16;
/** Text this long is cut between pages like a table is. */
const BREAKABLE_TEXT_PX = 120;
/** Word's A4 with one-inch margins, for a document that states no section. */
const DEFAULT_AREA = { heightPx: 931, widthPx: 602 };

interface TextArea {
  readonly heightPx: number;
  readonly widthPx: number;
}

const childrenOf = (node: JsonNode): JsonNode[] => (Array.isArray(node.content) ? (node.content as JsonNode[]) : []);
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const faceOf = (family: unknown): readonly [number, number] | undefined =>
  FACES[String(family ?? "").split(",")[0].replace(/["']/g, "").trim().toLowerCase()];

function runMark(marks: unknown, type: string): Record<string, unknown> | null {
  if (!Array.isArray(marks)) return null;
  for (const mark of marks as JsonNode[]) {
    if (mark?.type === type) return mark.attrs ?? null;
  }
  return null;
}

interface Defaults {
  readonly fontPx: number;
  readonly face: readonly [number, number];
  readonly lineHeight: number;
  readonly spaceAfterPx: number;
}

/** What a block leaves for the sheet to deal with besides its height. */
interface BlockMarks {
  /** Footnote ids it refers to. */
  readonly notes: readonly string[];
  /** Where Word's last layout turned the page in it (`sourcePageBreak`), as
   * the share of its text after that; null: nowhere. */
  readonly restAfterTurn: number | null;
}

function marksOf(block: JsonNode): BlockMarks {
  const notes: string[] = [];
  let characters = 0;
  let turnedAt: number | null = null;
  const visit = (node: JsonNode) => {
    if (node.type === "footnoteRef") notes.push(String(node.attrs?.noteId ?? ""));
    else if (node.type === "sourcePageBreak") turnedAt = characters;
    else if (typeof node.text === "string") characters += node.text.length;
    childrenOf(node).forEach(visit);
  };
  visit(block);
  return { notes, restAfterTurn: turnedAt === null ? null : (characters - turnedAt) / Math.max(1, characters) };
}

/** Each footnote's room at the foot of a page this wide. */
function noteHeights(attrs: Record<string, unknown> | null | undefined, widthPx: number, defaults: Defaults): Map<string, number> {
  const out = new Map<string, number>();
  const notes = attrs?.footnotes;
  if (!Array.isArray(notes)) return out;
  const style = (attrs?.footnoteTextStyle ?? {}) as Record<string, unknown>;
  const fontPx = num(style.fontSize) || (defaults.fontPx * 5) / 6;
  const face = faceOf(style.fontFamily) ?? defaults.face;
  for (const note of notes as Record<string, unknown>[]) {
    const lines = Math.max(1, Math.ceil((String(note.body ?? "").length * face[1] * fontPx) / Math.max(30, widthPx)));
    out.set(String(note.id ?? ""), lines * fontPx * face[0]);
  }
  return out;
}

/** A block's text: its length on one line, its largest size and line box. */
function measuredText(block: JsonNode, defaults: Defaults): { advancePx: number; fontPx: number; singlePx: number } {
  const markAttrs = block.attrs?.paragraphMarkMarks;
  const blockPx = num(block.attrs?.paragraphFontSize) || num(runMark(markAttrs, "fontSize")?.size) || defaults.fontPx;
  let advancePx = 0;
  let fontPx = 0;
  let singlePx = 0;
  const visit = (node: JsonNode) => {
    if (typeof node.text === "string") {
      const size = num(runMark(node.marks, "fontSize")?.size) || blockPx;
      const face = faceOf(runMark(node.marks, "fontFamily")?.family) ?? defaults.face;
      for (let index = 0; index < node.text.length; index += 1) {
        advancePx += size * (node.text.charCodeAt(index) >= WIDE_CHARACTER_FROM ? 1 : face[1]);
      }
      fontPx = Math.max(fontPx, size);
      singlePx = Math.max(singlePx, size * face[0]);
    }
    childrenOf(node).forEach(visit);
  };
  visit(block);
  if (singlePx === 0) singlePx = blockPx * defaults.face[0];
  return { advancePx, fontPx: fontPx || blockPx, singlePx };
}

/** A block in the flow: its spacing stays apart, the larger of two meets. */
interface FlowBlock {
  readonly beforePx: number;
  readonly heightPx: number;
  readonly afterPx: number;
}

function paragraphFlow(block: JsonNode, widthPx: number, defaults: Defaults): FlowBlock {
  const attrs = block.attrs ?? {};
  const { advancePx, fontPx, singlePx } = measuredText(block, defaults);
  const width = Math.max(60, widthPx - (num(attrs.indentLeftPt) * 4) / 3 - (num(attrs.indentRightPt) * 4) / 3);
  const lineWaste = LINE_END_WASTE_CHARACTERS * fontPx * defaults.face[1];
  const lines = Math.max(1, Math.ceil(advancePx / Math.max(30, width - lineWaste)));
  const statedPx = (num(attrs.lineHeightPt) * 4) / 3;
  const multiple = singlePx * (num(attrs.lineHeight) || defaults.lineHeight);
  const linePx = attrs.lineHeightRule === "exact" && statedPx > 0 ? statedPx : attrs.lineHeightRule === "atLeast" ? Math.max(multiple, statedPx) : multiple;
  return {
    beforePx: (num(attrs.spaceBefore) * 4) / 3,
    heightPx: lines * linePx,
    afterPx: attrs.spaceAfter === undefined || attrs.spaceAfter === null ? defaults.spaceAfterPx : (num(attrs.spaceAfter) * 4) / 3,
  };
}

function flowOf(block: JsonNode, widthPx: number, defaults: Defaults): FlowBlock {
  if (block.type === "paragraph" || block.type === "heading") return paragraphFlow(block, widthPx, defaults);
  return { beforePx: 0, heightPx: blockPx(block, widthPx, defaults), afterPx: 0 };
}

/** Blocks stacked: their heights and the spacing between them. */
function stackPx(blocks: readonly JsonNode[], widthPx: number, defaults: Defaults): number {
  let total = 0;
  let after = 0;
  blocks.forEach((block, index) => {
    const flow = flowOf(block, widthPx, defaults);
    total += (index === 0 ? flow.beforePx : Math.max(after, flow.beforePx)) + flow.heightPx;
    after = flow.afterPx;
  });
  return total + after;
}

function tablePx(table: JsonNode, widthPx: number, defaults: Defaults): number {
  let total = 2;
  for (const row of childrenOf(table)) {
    const cells = childrenOf(row);
    const columns = Math.max(1, cells.reduce((sum, cell) => sum + (num(cell.attrs?.colspan) || 1), 0));
    let rowPx = 0;
    for (const cell of cells) {
      const stated = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as unknown[]).reduce<number>((sum, value) => sum + num(value), 0) : 0;
      const margin = (cell.attrs?.cellMargin ?? {}) as Record<string, unknown>;
      const left = margin.left === undefined ? DEFAULT_CELL_MARGIN_PX : (num(margin.left) * 4) / 3;
      const right = margin.right === undefined ? DEFAULT_CELL_MARGIN_PX : (num(margin.right) * 4) / 3;
      const inner = Math.max(30, (stated || widthPx / columns) - left - right);
      rowPx = Math.max(rowPx, stackPx(childrenOf(cell), inner, defaults) + ((num(margin.top) + num(margin.bottom)) * 4) / 3);
    }
    total += Math.max(rowPx + ROW_BORDER_PX, num(row.attrs?.rowHeight));
  }
  return total;
}

function blockPx(block: JsonNode, widthPx: number, defaults: Defaults): number {
  const attrs = block.attrs ?? {};
  switch (block.type) {
    case "table":
      return tablePx(block, widthPx, defaults);
    case "pageBreak":
    case "sectionBreak":
      return 0;
    case "image":
    case "documentShape":
    case "textBox":
      // A drawing out of the flow takes none of it.
      return attrs.wrapMode === "inline" ? num(attrs.height) || num(attrs.heightEmu) / 9525 : 0;
    default: {
      const children = childrenOf(block);
      return children.length ? stackPx(children, widthPx, defaults) : 20;
    }
  }
}

type BandLine = Record<string, unknown>;

/** How far a band's paragraphs reach (a footer's first space before is not
 * in it: Word lifts the body for the footer's lines). */
function bandReachPx(blocks: unknown, fontFace: readonly [number, number]): number {
  if (!Array.isArray(blocks)) return 0;
  let total = 0;
  (blocks as BandLine[]).forEach((line, index) => {
    if (line.type !== "paragraph") return;
    const face = faceOf(line.lineFont) ?? fontFace;
    const lineHeightPt = num(line.lineHeightPt);
    const linePx = lineHeightPt > 0 ? (lineHeightPt * 4) / 3 : (num(line.lineSizePt) * 4 * face[0] * (num(line.lineHeight) || 1)) / 3;
    total += linePx + ((num(line.spaceAfterPt) + (index === 0 ? 0 : num(line.spaceBeforePt))) * 4) / 3;
  });
  return total;
}

function sectionAreas(attrs: Record<string, unknown> | null | undefined, defaults: Defaults): TextArea[] {
  const layouts = attrs?.sectionLayouts;
  if (!Array.isArray(layouts)) return [];
  const bands = Array.isArray(attrs?.sectionBands) ? (attrs.sectionBands as Record<string, unknown>[]) : [];
  let header: unknown = null;
  let footer: unknown = null;
  return (layouts as Record<string, Record<string, unknown>>[]).map((layout, index) => {
    const size = layout.pageSize ?? {};
    const margins = layout.pageMargins ?? {};
    // A section with no story of its own shows the one before it.
    header = bands[index]?.headerRich ?? header;
    footer = bands[index]?.footerRich ?? footer;
    // A band taller than its margin takes the room from the body.
    const topPx = Math.max(num(margins.topTwips) / 15, num(margins.headerTwips) / 15 + bandReachPx(header, defaults.face));
    const bottomPx = Math.max(num(margins.bottomTwips) / 15, num(margins.footerTwips) / 15 + bandReachPx(footer, defaults.face));
    return {
      heightPx: num(size.heightTwips) / 15 - topPx - bottomPx,
      widthPx: (num(size.widthTwips) - num(margins.leftTwips) - num(margins.rightTwips)) / 15,
    };
  });
}

const BREAKABLE = new Set(["table", "orderedList", "bulletList"]);

/**
 * Blocks per sheet, or null with nothing to go on. A block running over a
 * page stands on one sheet however many pages it takes.
 */
function defaultsOf(attrs: Record<string, unknown> | null | undefined): Defaults {
  return {
    fontPx: num(attrs?.defaultFontSize) || DEFAULT_FONT_PX,
    face: faceOf(attrs?.defaultFontFamily) ?? OTHER_FACE,
    lineHeight: num(attrs?.defaultLineHeight) || 1.15,
    spaceAfterPx: (num(attrs?.defaultParagraphSpaceAfter) * 4) / 3,
  };
}

/**
 * One block's height in a column of `widthPx`, as the page estimate weighs
 * it (its lines from its text and font size, an object's stated size), the
 * spacing around it left out: a rough guess for a block nothing else can
 * read without laying its page out.
 */
export function estimatedBlockHeightPx(block: JsonNode, widthPx: number, attrs: Record<string, unknown> | null | undefined): number {
  return flowOf(block, widthPx, defaultsOf(attrs)).heightPx;
}

/** The same with the spacing the page estimate gives above and below it. */
export function estimatedBlockFlow(block: JsonNode, widthPx: number, attrs: Record<string, unknown> | null | undefined): { beforePx: number; heightPx: number; afterPx: number } {
  const flow = flowOf(block, widthPx, defaultsOf(attrs));
  return { beforePx: flow.beforePx, heightPx: flow.heightPx, afterPx: flow.afterPx };
}

export function estimatedPageSizes(blocks: readonly JsonNode[], attrs: Record<string, unknown> | null | undefined): number[] | null {
  const defaults = defaultsOf(attrs);
  const areas = sectionAreas(attrs, defaults);
  const notes = noteHeights(attrs, (areas[0] ?? DEFAULT_AREA).widthPx, defaults);
  const sizes: number[] = [];
  let section = 0;
  let area = areas[0] ?? DEFAULT_AREA;
  let used = 0;
  let count = 0;
  let afterPx = 0;
  let notesPx = 0;
  const close = () => {
    if (count > 0) sizes.push(count);
    count = 0;
    used = 0;
    afterPx = 0;
    notesPx = 0;
  };
  for (const block of blocks) {
    const flow = flowOf(block, area.widthPx, defaults);
    const marks = marksOf(block);
    const noted = marks.notes.reduce((sum, id) => sum + (notes.get(id) ?? 0), 0);
    if (noted > 0 && notesPx === 0) notesPx = FOOTNOTE_SEPARATOR_PX;
    notesPx += noted;
    const height = flow.heightPx + noted + (noted > 0 && notesPx === noted + FOOTNOTE_SEPARATOR_PX ? FOOTNOTE_SEPARATOR_PX : 0);
    // Word drops a paragraph's space before where a page wraps onto it.
    const gap = count === 0 ? 0 : Math.max(afterPx, flow.beforePx);
    const breakable = BREAKABLE.has(String(block.type)) || height > BREAKABLE_TEXT_PX;
    if (marks.restAfterTurn !== null) {
      // Word turned the page here when it last laid the document out: what
      // the estimate had drifted by ends here. Well down a sheet, this block
      // opens the next one; just past the top of one, the turn was this one.
      if (used > area.heightPx * WORD_TURN_NEAR_TOP) close();
      used = height * marks.restAfterTurn;
    } else if (used + gap + height <= area.heightPx) {
      used += gap + height;
    } else if (breakable) {
      // The block runs over: it opens the next sheet, with what is left of it.
      const left = (used + gap + height) % area.heightPx;
      close();
      used = left;
    } else {
      close();
      used = height;
    }
    afterPx = flow.afterPx;
    count += 1;
    if (block.type === "pageBreak") close();
    if (block.type === "sectionBreak") {
      section += 1;
      area = areas[section] ?? area;
      if (block.attrs?.breakType !== "continuous") close();
    }
  }
  close();
  return sizes.length > 1 ? sizes : null;
}
