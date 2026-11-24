/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Provisional pages for a document opened without a known layout.
 *
 * A long document hydrated as ONE sheet holding every block (a 296-page book:
 * 7,390 blocks) has to be laid out whole before the ledger can cut its first
 * page, and every later pass moves blocks out of that one giant sheet. Opened
 * instead as sheets of roughly a page each, the ledger composes the reader's
 * first pages from the first few sheets and goes on through the rest in the
 * background (ledgerScope, progressive initial settle), and a sheet nobody
 * has reached yet is never laid out (content-visibility on the sheets).
 *
 * The sizes are only an ESTIMATE of a page and never a layout decision: the
 * ledger lays out every page from the content, whatever sheet it stands on,
 * so the final pages are those of a document opened as one sheet. A short
 * document keeps the single sheet (nothing to gain, and the composition of a
 * small document stays exactly what it always was).
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { estimatedPageSizes } from "./provisionalEstimate";
import { coldFirstLayout } from "./coldFirstLayout";

/** Below this many top-level blocks a document opens as one sheet. */
export const PROVISIONAL_PAGES_MIN_BLOCKS = 160;

/** The fewest blocks a document opens on provisional sheets with: any
 * document of more than a page under the cold first layout (coldFirstLayout),
 * a long one otherwise. */
export function provisionalPagesMinBlocks(): number {
  return coldFirstLayout()?.minBlocks ?? PROVISIONAL_PAGES_MIN_BLOCKS;
}
/** Estimated lines a provisional sheet holds: under a typical page's 40-46,
 * so a sheet rarely holds more than one page (each sheet is laid out only
 * when the background reaches it or the reader scrolls to it). */
const LINES_PER_PROVISIONAL_PAGE = 34;
/** Characters of CJK text on one line of a typical A4/Letter text area;
 * other characters count half. */
const CJK_CHARS_PER_LINE = 38;

interface WeighableNode {
  type: string;
  text: string;
  children: WeighableNode[] | null;
  attrs: Record<string, unknown> | null;
}

const PICTURE_TYPES = new Set(["image", "imageRow", "chart", "textBox", "whiteboard", "shape", "smartArt", "diagram"]);

function textLines(text: string): number {
  let units = 0;
  for (let i = 0; i < text.length; i += 1) units += text.charCodeAt(i) > 0x2e7f ? 1 : 0.5;
  return Math.max(1, Math.ceil(units / CJK_CHARS_PER_LINE));
}

/** Word's In Front Of Text and Behind Text: the drawing takes no room in
 * the text's flow (every ink stroke drawn on a page is one). */
const OVERLAY_WRAP_MODES = new Set(["inFrontOfText", "behindText"]);

function weigh(node: WeighableNode): number {
  // A page of handwriting is thousands of overlay strokes on a few lines:
  // weighed as lines, they spread one page over dozens of sheets, and the
  // ledger then moved (and rebuilt) every stroke back onto the first.
  if (node.type === "documentShape" && OVERLAY_WRAP_MODES.has(String(node.attrs?.wrapMode ?? ""))) return 0;
  if (PICTURE_TYPES.has(node.type)) return 14;
  if (node.type === "mathBlock") return 3;
  if (node.type === "table") return Math.max(2, (node.children?.length ?? 1) * 2);
  if (node.type === "sectionBreak" || node.type === "pageBreak") return 0;
  if (node.children && node.children.length > 0 && !node.children.every((child) => child.children === null)) {
    // A container (list, quote, table of contents): its blocks.
    return node.children.reduce((sum, child) => sum + weigh(child), 0);
  }
  return textLines(node.text) + 0.5;
}

/** Whether a block ends its page whatever follows (Word's page and
 * next-page/odd/even section breaks): a provisional sheet ends there too,
 * so the ledger's pages and the sheets agree at every hard break. */
function endsPage(node: WeighableNode): boolean {
  if (node.type === "pageBreak") return true;
  if (node.type === "sectionBreak") return node.attrs?.breakType !== "continuous";
  return false;
}

/**
 * Block counts per provisional sheet, in order, or null when the document is
 * short enough to open as one sheet.
 */
export function provisionalPageSizes(blocks: readonly WeighableNode[]): number[] | null {
  if (blocks.length < provisionalPagesMinBlocks()) return null;
  const sizes = lineCountSizes(blocks);
  return sizes && sizes.length > 1 ? sizes : null;
}

/** Block counts per sheet by the line count, for any run of blocks. */
function lineCountSizes(blocks: readonly WeighableNode[]): number[] | null {
  if (!blocks.length) return null;
  const sizes: number[] = [];
  let count = 0;
  let lines = 0;
  for (const block of blocks) {
    const weight = weigh(block);
    if (count > 0 && lines + weight > LINES_PER_PROVISIONAL_PAGE) {
      sizes.push(count);
      count = 0;
      lines = 0;
    }
    count += 1;
    lines += weight;
    if (endsPage(block)) {
      sizes.push(count);
      count = 0;
      lines = 0;
    }
  }
  if (count > 0) sizes.push(count);
  return sizes;
}

type JsonLike = { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };

function fromJson(node: JsonLike): WeighableNode {
  const content = Array.isArray(node.content) ? (node.content as JsonLike[]) : null;
  let text = typeof node.text === "string" ? node.text : "";
  const children = content
    ? content.filter((child) => child && typeof child === "object" && child.type !== "text").map(fromJson)
    : null;
  if (content) {
    for (const child of content) {
      if (child && typeof child === "object" && typeof child.text === "string") text += child.text;
    }
  }
  return {
    type: typeof node.type === "string" ? node.type : "",
    text,
    // A textblock (only inline children) is a leaf for the weighing.
    children: children && children.length > 0 && content!.some((child) => isBlockJson(child)) ? children : null,
    attrs: node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : null,
  };
}

const INLINE_JSON_TYPES = new Set(["text", "inlineMath", "hardBreak", "image", "footnoteRef", "mention", "inlinePicture"]);

function isBlockJson(node: JsonLike): boolean {
  return Boolean(node && typeof node === "object" && typeof node.type === "string" && !INLINE_JSON_TYPES.has(node.type));
}

function fromPm(node: PmNode): WeighableNode {
  const children: WeighableNode[] | null = node.isTextblock || node.isLeaf
    ? null
    : (() => {
        const out: WeighableNode[] = [];
        node.forEach((child) => out.push(fromPm(child)));
        return out;
      })();
  return {
    type: node.type.name,
    text: node.isTextblock ? node.textContent : "",
    children,
    attrs: node.attrs as Record<string, unknown>,
  };
}

/** The sheets a long document opens on, under docs-layout, from the page
 * estimate: the reader's first pages and a little past them; the rest from
 * the line count. */
export const ESTIMATED_HEAD_SHEETS = 6;

/**
 * Where a long document's opening sheets come from: the page estimate
 * (provisionalEstimate) for all of them, for its head only, or none (the
 * line count). Harness switch `window.__provisionalPagesEstimated`: true
 * (all), false (none), "head".
 *
 * The head, in every mode: from line-count sheets the reader's first pages
 * came from windowed passes over sheets far from right, each moved again
 * as a CJK book's font subsets arrived (R286-D01's first screen with the
 * head 7 s under docs-layout against 42 s, 5-11 s in the default mode
 * against 29-44 s; its pages and its layout's end the same), while the
 * estimate's sheets past the reader's could cut a long table where they put
 * it. `false` gives the line count alone.
 */
function estimateChosen(): "all" | "head" | "none" {
  const value = typeof window === "undefined"
    ? undefined
    : (window as Window & { __provisionalPagesEstimated?: unknown }).__provisionalPagesEstimated;
  if (value === true) return "all";
  if (value === false) return "none";
  if (value === "head") return "head";
  return "head";
}

/** The estimate's first sheets, the line count's after them. */
function headEstimated(estimated: readonly number[], lineCount: (from: number) => number[] | null, total: number): number[] {
  const head = estimated.slice(0, ESTIMATED_HEAD_SHEETS);
  const taken = head.reduce((sum, size) => sum + size, 0);
  if (taken >= total) return [...estimated];
  const rest = lineCount(taken);
  return rest?.length ? [...head, ...rest] : [...head, total - taken];
}

/** Provisional sheet sizes of a flat stored (JSON) block list. */
export function provisionalPageSizesForJson(blocks: readonly unknown[], attrs?: Record<string, unknown> | null): number[] | null {
  if (blocks.length < provisionalPagesMinBlocks()) return null;
  const chosen = estimateChosen();
  const weighed = () => blocks.map((block) => fromJson((block ?? {}) as JsonLike));
  if (chosen !== "none") {
    const estimated = estimatedPageSizes(blocks as Parameters<typeof estimatedPageSizes>[0], attrs);
    if (estimated && chosen === "all") return estimated;
    if (estimated) {
      const all = weighed();
      const sizes = headEstimated(estimated, (from) => lineCountSizes(all.slice(from)), blocks.length);
      return sizes.length > 1 ? sizes : null;
    }
  }
  return provisionalPageSizes(weighed());
}

/** Provisional sheet sizes of a flat ProseMirror block list. */
export function provisionalPageSizesForNodes(blocks: readonly PmNode[], attrs?: Record<string, unknown> | null): number[] | null {
  if (blocks.length < provisionalPagesMinBlocks()) return null;
  const chosen = estimateChosen();
  if (chosen !== "none") {
    const estimated = estimatedPageSizes(blocks.map((block) => block.toJSON() as Parameters<typeof estimatedPageSizes>[0][number]), attrs);
    if (estimated && chosen === "all") return estimated;
    if (estimated) {
      const all = blocks.map(fromPm);
      const sizes = headEstimated(estimated, (from) => lineCountSizes(all.slice(from)), blocks.length);
      return sizes.length > 1 ? sizes : null;
    }
  }
  return provisionalPageSizes(blocks.map(fromPm));
}
