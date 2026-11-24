/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The engine's line boxes as the page ledger reads them (L3-DESIGN, behind
 * the `docs` text engine flag).
 *
 * The engine's line pass lays a block out and notes its lines here, by node.
 * The first time the ledger measures that block it holds the engine's height
 * against the drawn box: a block within half a pixel is read from the engine
 * from then on, wherever it moves, with no read of the page; any other stays
 * the page's, and its kind is counted. So a kind of block the model is wrong
 * about falls back on its own, and `window.__docsLedgerEngine` says which.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { layoutDocsBlockLines, type DocsBlockLayout, type DocsLineRule } from "../../../../../../lib/text-engine/docs-block-layout";
import { docsEngineLineStarts, normalizeStarts, readDocsParagraph, type DocsTabStopsInput } from "../../../../../../lib/text-engine/docs-lines";
import { normalizeTabStops, withHangingIndentStop } from "../../../../../../lib/document-tabstops";
import { BAND_RUN_MARK_NAME } from "../bandRunMark";
import { blockFormulaBoxes } from "./ledgerEngineMath";
import { katexBox } from "../../../../../../lib/text-engine/katex-box";
import type { KinsokuList } from "../../../../../../lib/text-engine/kinsoku";
import { normalizeWordCompatibilityMode } from "../../documentOverflowPunctuation";
import { wordSetsIdeographsAsLetters, wordEastAsianLineRulesApply } from "../../wordFarEastDefaults";
import { textEngineAnswerEpoch, textEngineEpoch } from "../../../../../../lib/text-engine/measure";

const SAME_HEIGHT_PX = 0.5;

interface EngineBlock {
  /** The block's box: its lines and its padding and borders. */
  readonly heightPx: number;
  /** It has padding or borders (a bordered paragraph): its lines do not
   * start at its top, and the engine does not cut it. */
  readonly chromed: boolean;
  readonly lineCount: number;
  readonly kind: string;
  /** Each line's height, and where it starts in the block's content (null:
   * not at a character, the page says where). */
  readonly lines: readonly { readonly heightPx: number; readonly gridPx: number; readonly offset: number | null }[];
  /** "new": not held against the page yet. */
  state: "new" | "ok" | "page";
  /** What the agreement was read under. */
  sheetKey?: string | null;
  docAttrs?: unknown;
  epoch?: string;
}

export interface LedgerEngineStats {
  /** Heights the engine answered with no read of the page. */
  engine: number;
  /** Page cuts the engine's lines answered, and with the harness comparing
   * (`window.__docsLedgerEngineCompare`) how many the page agreed with. */
  cuts: number;
  cutsAgreed: number;
  cutsDiffered: number;
  /** Blocks found to agree with the page / to differ from it, by kind. */
  agreed: number;
  differed: Record<string, number>;
  /** Blocks measured with no engine lines noted. */
  unnoted: number;
}

const blocks = new WeakMap<PmNode, EngineBlock>();

function stats(win: Window | null | undefined): LedgerEngineStats | null {
  if (!win) return null;
  const holder = win as Window & { __docsLedgerEngine?: LedgerEngineStats };
  return (holder.__docsLedgerEngine ??= { engine: 0, cuts: 0, cutsAgreed: 0, cutsDiffered: 0, agreed: 0, differed: {}, unnoted: 0 });
}

/** The block's line rule as drawn: its own, else the multiple it inherits. */
export function docsBlockLineRule(node: PmNode, element: HTMLElement): DocsLineRule {
  const rule = node.attrs.lineHeightRule;
  const points = Number(node.attrs.lineHeightPt);
  if ((rule === "exact" || rule === "atLeast") && points > 0) return { kind: rule, px: (points * 4) / 3 };
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return { kind: "multiple", value: Number.parseFloat(style?.getPropertyValue("--doc-line-factor") ?? "") || 1 };
}

/** Where a row starts in an element's text: a text node and an offset in it. */
export interface EngineRowStart {
  readonly node: Text;
  readonly offset: number;
}

/**
 * The engine's rows of a paragraph's two pieces laid out as one (`copy`, the
 * off-screen copy the ledger reads a page seam from): where each row starts.
 * Null: the engine does not lay this paragraph out, the browser's own rows
 * are the answer. Undefined: it cannot say now (a face still loading, a float
 * beside the paragraph, automatic hyphenation), and nobody else can either.
 */
export type EngineJoinedRows = (
  view: EditorView,
  head: { readonly node: PmNode; readonly dom: HTMLElement },
  tail: { readonly node: PmNode; readonly dom: HTMLElement },
  copy: HTMLElement,
) => readonly EngineRowStart[] | null | undefined;

let joinedRowsReader: EngineJoinedRows | null = null;

/** The line-break plugin lends the ledger its reading (documentEngineLineBreaks). */
export function setEngineJoinedRows(reader: EngineJoinedRows | null): void {
  joinedRowsReader = reader;
}

/** The engine's rows of a joined copy (EngineJoinedRows); null with no engine. */
export function engineJoinedRows(...args: Parameters<EngineJoinedRows>): ReturnType<EngineJoinedRows> {
  return joinedRowsReader ? joinedRowsReader(...args) : null;
}

/** What the engine's line pass laid this block out as. */
export function noteEngineBlockLines(
  node: PmNode,
  layout: DocsBlockLayout,
  rule: DocsLineRule,
  lineOffsets: readonly (number | null)[] = [],
  chrome: { readonly top: number; readonly bottom: number } = { top: 0, bottom: 0 },
): void {
  if (layout.status !== "ok") {
    blocks.delete(node);
    return;
  }
  const known = blocks.get(node);
  const chromePx = Math.max(0, chrome.top) + Math.max(0, chrome.bottom);
  const heightPx = layout.heightPx + chromePx;
  if (known?.state !== "new" && known && Math.abs(known.heightPx - heightPx) < 0.01) return;
  const span = layout.lines.length === 1 ? "one" : "many";
  blocks.set(node, {
    heightPx,
    chromed: chromePx > 0.01,
    lineCount: layout.lines.length,
    kind: `${node.type.name}:${rule.kind}:${span}`,
    lines: layout.lines.map((line, index) => ({ heightPx: line.heightPx, gridPx: line.gridPx ?? line.heightPx, offset: lineOffsets[index] ?? null })),
    state: "new",
  });
}

/**
 * The lines of a block cut from `whole` where one of its lines starts
 * (`offset`, in the whole's content): the whole's lines from there on, with
 * the tail's own padding and borders. Held against the page as any block's
 * lines are. False when the whole's lines do not start there.
 */
export function noteEngineTailLines(
  tail: PmNode,
  whole: PmNode,
  offset: number,
  rule: DocsLineRule,
  chrome: { readonly top: number; readonly bottom: number },
): boolean {
  const block = blocks.get(whole);
  if (!block) return false;
  const first = block.lines.findIndex((line) => line.offset === offset);
  if (first <= 0) return false;
  const lines = block.lines.slice(first).map((line) => ({ ...line, offset: line.offset === null ? null : line.offset - offset }));
  const chromePx = Math.max(0, chrome.top) + Math.max(0, chrome.bottom);
  blocks.set(tail, {
    heightPx: lines.reduce((sum, line) => sum + line.heightPx, 0) + chromePx,
    chromed: chromePx > 0.01,
    lineCount: lines.length,
    kind: `${tail.type.name}:${rule.kind}:${lines.length === 1 ? "one" : "many"}`,
    lines,
    state: "new",
  });
  return true;
}

/**
 * The lines of a block's head cut from `whole` where one of its lines starts
 * (`offset`, in the whole's content): the whole's lines before there, with
 * the head's own padding and borders. Held against the page as any block's
 * lines are. False when the whole's lines do not start there.
 */
export function noteEngineHeadLines(
  head: PmNode,
  whole: PmNode,
  offset: number,
  rule: DocsLineRule,
  chrome: { readonly top: number; readonly bottom: number },
): boolean {
  const block = blocks.get(whole);
  if (!block) return false;
  const end = block.lines.findIndex((line) => line.offset === offset);
  if (end <= 0) return false;
  const lines = block.lines.slice(0, end);
  const chromePx = Math.max(0, chrome.top) + Math.max(0, chrome.bottom);
  blocks.set(head, {
    heightPx: lines.reduce((sum, line) => sum + line.heightPx, 0) + chromePx,
    chromed: chromePx > 0.01,
    lineCount: lines.length,
    kind: `${head.type.name}:${rule.kind}:${lines.length === 1 ? "one" : "many"}`,
    lines,
    state: "new",
  });
  return true;
}

/**
 * The block's height for the ledger. `sheetKey` names what its width comes
 * from: an agreement holds while that, the document's attributes and the
 * faces stay as they were.
 */
export function engineBlockHeightPx(
  node: PmNode,
  win: Window | null | undefined,
  sheetKey: string | null,
  docAttrs: unknown,
  readPage: () => number,
  /** What a box this tall costs on the page (the line grid's slots), given
   * its lines' heights; the page's own height is charged the same way. */
  charge: (heightPx: number, lineHeightsPx: readonly number[]) => number = (heightPx) => heightPx,
): number {
  const block = blocks.get(node);
  const count = stats(win);
  if (!block) {
    if (count) count.unnoted += 1;
    return readPage();
  }
  if (block.state === "page") return readPage();
  const epoch = textEngineEpoch();
  const charged = () => charge(block.heightPx, block.lines.map((line) => line.gridPx));
  if (block.state === "ok" && block.sheetKey === sheetKey && block.docAttrs === docAttrs && block.epoch === epoch) {
    if (count) count.engine += 1;
    return charged();
  }
  const drawn = readPage();
  if (Math.abs(drawn - charged()) <= SAME_HEIGHT_PX) {
    block.state = "ok";
    block.sheetKey = sheetKey;
    block.docAttrs = docAttrs;
    block.epoch = epoch;
    if (count) count.agreed += 1;
    // Agreed, it is the engine's from this reading on, as it is on every
    // later one: the browser draws Word's exact lines rounded to 1/64 px
    // (13.7988 pt as 18.40625 px), and a block first read in a pass -- a
    // fragment a cut just made -- was charged so while the blocks around it
    // were charged exact. Corpus R441-D03 p6: the last paragraph's head was
    // charged 2 x 18.406 and its third line (18.398) missed the 18.389 px
    // left; Word sets three lines there. `window.__docsLedgerAgreedDrawn =
    // true` charges the drawn height on that first reading, as before (A/B).
    if (!agreedDrawn(win)) return charged();
  } else {
    block.state = "page";
    if (count) count.differed[block.kind] = (count.differed[block.kind] ?? 0) + 1;
    noteDifference(win, node, block, drawn, charged());
  }
  return drawn;
}

/** Harness switch (`window.__docsLedgerEngineSamples = []`): the first
 * blocks the page disagreed with, to read why. */
function noteDifference(win: Window | null | undefined, node: PmNode, block: EngineBlock, drawn: number, charged: number): void {
  const samples = (win as (Window & { __docsLedgerEngineSamples?: unknown[] }) | null | undefined)?.__docsLedgerEngineSamples;
  if (!Array.isArray(samples) || samples.length >= 300) return;
  samples.push({
    kind: block.kind,
    engine: Math.round(charged * 100) / 100,
    box: Math.round(block.heightPx * 100) / 100,
    drawn: Math.round(drawn * 100) / 100,
    lines: block.lines.map((line) => Math.round(line.heightPx * 100) / 100),
    text: node.textContent.slice(0, 48),
    attrs: { lineHeight: node.attrs.lineHeight ?? null, rule: node.attrs.lineHeightRule ?? null },
  });
}

function agreedDrawn(win: Window | null | undefined): boolean {
  return (win as (Window & { __docsLedgerAgreedDrawn?: boolean }) | null | undefined)?.__docsLedgerAgreedDrawn === true;
}

/** The block's line count, when its height agreed with the page. */
export function engineBlockLineCount(node: PmNode): number | null {
  const block = blocks.get(node);
  return block?.state === "ok" ? block.lineCount : null;
}

export interface EngineTextCutContext {
  /** An estimate's lines may cut it (the engine's reading of a paragraph it
   * only estimates, on a sheet the page will check). */
  readonly estimate?: boolean;
  readonly footCreditPx?: number;
  readonly rowsBefore?: number;
  readonly rowsAfter?: number;
}

/** Where a block is cut by its lines. */
export interface EngineTextCut {
  /** Where the tail starts in the block's content. */
  readonly contentOffset: number;
  /** The head's height: the top of the tail's first line. */
  readonly rowTop: number;
}

/**
 * The cut of a block whose lines agreed with the page, as the page's own
 * search finds it: as many lines as fit `availablePx`, the last one's Auto
 * leading allowed past the foot, then Word's widow and orphan floors, which
 * count the paragraph's lines in its other fragments too. `null`: no cut fits.
 * `undefined`: the engine does not know, ask the page.
 */
export function engineTextCut(
  node: PmNode,
  availablePx: number,
  minLines: number,
  context: EngineTextCutContext = {},
): EngineTextCut | null | undefined {
  const block = blocks.get(node);
  if (block?.state !== "ok" || block.lineCount < 2 || block.chromed) return undefined;
  const credit = context.footCreditPx ?? 0;
  const rowsBefore = context.rowsBefore ?? 0;
  const rowsAfter = context.rowsAfter ?? 0;
  const lines = block.lines;
  let kept = 0;
  let head = 0;
  while (kept < lines.length && head + lines[kept].heightPx - credit <= availablePx + 1e-6) {
    head += lines[kept].heightPx;
    kept += 1;
  }
  kept = Math.min(kept, lines.length - Math.max(1, minLines - rowsAfter));
  if (kept < 1 || kept + rowsBefore < minLines) return null;
  const offset = lines[kept].offset;
  if (offset === null) return undefined;
  let rowTop = 0;
  for (let index = 0; index < kept; index += 1) rowTop += lines[index].heightPx;
  return { contentOffset: offset, rowTop };
}

/** The harness asks that every engine cut be checked against the page's. */
export function engineCutCompare(win: Window | null | undefined): boolean {
  return Boolean((win as (Window & { __docsLedgerEngineCompare?: boolean }) | null | undefined)?.__docsLedgerEngineCompare);
}

export function countEngineCut(win: Window | null | undefined, comparison?: boolean): void {
  const count = stats(win);
  if (!count) return;
  count.cuts += 1;
  if (comparison === true) count.cutsAgreed += 1;
  else if (comparison === false) count.cutsDiffered += 1;
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/;

/** A block the engine lays out with no page drawn (readDocsParagraph's
 * column mode): its box (lines and padding/borders) and its lines' heights. */
export interface UnlaidEngineBlock {
  readonly heightPx: number;
  readonly lineHeightsPx: readonly number[];
  /** Its lines are an estimate (a tab taken at the default interval): a
   * plan may go past it, the page still checks it. */
  readonly approximate?: boolean;
  /** Read with a formula box of the engine's (not a typeset one): trusted as
   * the document's formulas agreed with the page (ledgerAtoms calibration). */
  readonly engineFormula?: boolean;
  /** Where each line starts (its first piece's text node and offset; null
   * where a line opens with no text), for a cut at a line. */
  /** Weakly: this is kept by the block's node, and a page drawn hollow lets go
   * of its text (one Text held here held its whole sheet). */
  readonly lineStarts?: readonly ({ readonly node: WeakRef<Text>; readonly offset: number } | null)[];
  /** The same starts as content offsets in the block, once read while its
   * text was drawn (freezeEngineLineStarts): a cut needs no DOM then (a page
   * drawn hollow has none). */
  lineOffsets?: readonly (number | null)[];
  /** It has padding or borders: its lines do not start at its top. */
  readonly chromed?: boolean;
}


/**
 * The engine's box of a paragraph or heading on a page the ledger has not
 * laid out (L3-DESIGN step 4): read from its computed style and the column
 * it stands in, with no layout of its page. Null where the engine cannot
 * say (a list item, a table cell, a tab, an object, a face still loading):
 * the ledger keeps what it knew, as before. Kept by node and column.
 */
export function unlaidEngineBlock(
  node: PmNode,
  element: HTMLElement,
  columnWidthPx: number,
  docAttrs: Record<string, unknown>,
  /** Inside a list or a table cell (unlaidEngineList, unlaidEngineTable):
   * its width is already the item's or the cell's. */
  inside: false | "list" | "cell" = false,
  /** In a list: the room its boxes take on each side of the column. */
  around?: { readonly left: number; readonly right: number },
  /** Read its formulas with the engine's boxes even where a typeset one is
   * kept (the calibration holding the engine to the page). */
  engineFormulas = false,
  /** Read from a probe element (a hollow sheet's block drawn for the
   * reading alone): neither taken from nor kept in the node's reading. */
  probe = false,
): UnlaidEngineBlock | null {
  if (node.type.name !== "paragraph" && node.type.name !== "heading") return null;
  const epoch = textEngineEpoch();
  const answerEpoch = textEngineAnswerEpoch();
  const kept = probe ? undefined : unlaid.get(node);
  const aroundKey = `${around ? `${around.left}|${around.right}` : ""}${engineFormulas ? "#engine" : ""}`;
  // A reading the engine gave stands until the faces declared change (a
  // CJK book's subsets arriving one by one moved the epoch dozens of times
  // in its first minute, and every pass read every block again); one it
  // could not give is asked again whenever a face loads.
  if (kept && kept.columnWidthPx === columnWidthPx && kept.docAttrs === docAttrs && kept.around === aroundKey &&
      (kept.block ? kept.answerEpoch === answerEpoch : kept.epoch === epoch)) return kept.block;
  let block: UnlaidEngineBlock | null = null;
  const outside = inside === "cell" ? "table table" : inside === "list" ? "table" : "li, table";
  if (element.closest(outside) || (inside === "cell" && element.closest("li"))) unlaidReasons.set(node, "inside a list or table");
  else {
    const formulaBox = blockFormulaBoxes(node, engineFormulas);
    const paragraph = readDocsParagraph(element, { columnWidthPx, approximateTabs: true, approximateFonts: true, ...paragraphTabStops(node, inside, around), ...(formulaBox ? { formulaBox } : {}), ...(probe ? { undecorated: true } : {}) });
    if (paragraph.unsupported) unlaidReasons.set(node, paragraph.unsupported);
    else if (paragraph.pending) unlaidReasons.set(node, "face loading");
    // An empty paragraph is one line of its own font (its mark's), as Word
    // draws it: laid out on the paragraph's strut.
    if (!paragraph.unsupported && !paragraph.pending && (paragraph.pieces.length > 0 || paragraph.strut)) {
      const eastAsian = CJK.test(node.textContent);
      const lineRules = eastAsian && wordEastAsianLineRulesApply(docAttrs, node);
      const kinsoku: KinsokuList | null = lineRules ? "zh-CN" : null;
      const rules = { compatibilityMode: normalizeWordCompatibilityMode(docAttrs.wordCompatibilityMode), kinsoku, ideographsAsLetters: eastAsian && wordSetsIdeographsAsLetters(docAttrs), ...(eastAsian && !lineRules ? { eastAsianLineRules: false } : {}) };
      const starts = normalizeStarts(paragraph, docsEngineLineStarts(paragraph, rules));
      const rule = docsBlockLineRule(node, element);
      const layout = layoutDocsBlockLines(paragraph, starts, rule, paragraph.pieces.length === 0 ? paragraph.strut?.font ?? null : null);
      if (layout.status !== "ok") unlaidReasons.set(node, layout.status === "pending" ? "face loading" : `lines: ${layout.reason}`);
      if (layout.status === "ok") {
        const chrome = paragraph.chrome ?? { top: 0, bottom: 0 };
        block = {
          heightPx: layout.heightPx + Math.max(0, chrome.top) + Math.max(0, chrome.bottom),
          lineHeightsPx: layout.lines.map((line) => line.gridPx ?? line.heightPx),
          ...(paragraph.flags.includes("approximate") ? { approximate: true } : {}),
          ...(paragraph.flags.includes("engine-formula") ? { engineFormula: true } : {}),
          lineStarts: layout.lines.map((line) => {
            const piece = paragraph.pieces[line.start];
            return piece?.node && piece.offset !== undefined ? { node: new WeakRef(piece.node), offset: piece.offset } : null;
          }),
          chromed: Math.max(0, chrome.top) + Math.max(0, chrome.bottom) > 0.01,
        };
      }
    }
  }
  // A face loading moves the epoch: a block it left pending is asked again.
  if (!probe) unlaid.set(node, { columnWidthPx, docAttrs, epoch, answerEpoch, around: aroundKey, block });
  return block;
}

const unlaid = new WeakMap<PmNode, { columnWidthPx: number; docAttrs: unknown; epoch: string; answerEpoch: string; around: string; block: UnlaidEngineBlock | null }>();
const unlaidReasons = new WeakMap<PmNode, string>();

/** Turn the block's line starts into content offsets now, while its text is
 * drawn, once: a later cut at a line reads no DOM. */
export function freezeEngineLineStarts(node: PmNode, offsetOf: (start: { node: Text; offset: number }) => number | null): void {
  const block = unlaid.get(node)?.block;
  if (!block?.lineStarts || block.lineOffsets) return;
  block.lineOffsets = block.lineStarts.map((start) => {
    const text = start?.node.deref();
    if (!start || !text?.isConnected) return null;
    try {
      return offsetOf({ node: text, offset: start.offset });
    } catch {
      return null;
    }
  });
}
const unlaidTableRows = new WeakMap<PmNode, { rowHeightsPx: readonly number[]; chromePx: number }>();

/** The rows of a table unlaidEngineTable last read: each one's height and
 * the table's own frame, px (a plan cutting it with no layout). */
export function unlaidEngineTableRows(node: PmNode): { rowHeightsPx: readonly number[]; chromePx: number } | null {
  return unlaidTableRows.get(node) ?? null;
}

/** Why the engine last could not read this block with no layout (harness
 * traces: what stops a plan). */
export function unlaidEngineReason(node: PmNode): string | null {
  return unlaidReasons.get(node) ?? null;
}

/** A body or list paragraph's own stops, for its tabs to reach them, from the
 * column (a list's boxes `around` it). In a cell they stay an estimate, and a
 * positional tab is laid out by the page. */
function paragraphTabStops(
  node: PmNode, inside: false | "list" | "cell", around?: { readonly left: number; readonly right: number },
): { tabStops?: DocsTabStopsInput } {
  if (inside === "cell" || (inside === "list" && !around) || !node.textContent.includes("\t")) return {};
  let positional = false;
  node.forEach((child) => {
    if (child.marks.some((mark) => mark.type.name === BAND_RUN_MARK_NAME && mark.attrs.ptab)) positional = true;
  });
  if (positional) return {};
  const source = node.attrs.source as { wordTabOverMargin?: unknown } | null | undefined;
  return {
    tabStops: {
      stops: withHangingIndentStop(normalizeTabStops(node.attrs.tabStops ?? null), node.attrs.indentLeftPt, node.attrs.firstLineIndentPt),
      overMargin: source?.wordTabOverMargin === 1,
      ...(around ? { aroundLeftPx: around.left, aroundRightPx: around.right } : {}),
    },
  };
}

const LIST_NODES = new Set(["orderedList", "bulletList", "listItem"]);

function cssPx(value: string): number | null {
  if (value === "0px" || value === "0") return 0;
  return value.endsWith("px") ? Number.parseFloat(value) : null;
}

/**
 * A whole list's box on a page the ledger has not laid out: each of its
 * paragraphs laid out by the engine at the width its items leave
 * (unlaidEngineBlock), stacked with their margins collapsed as CSS collapses
 * them through lists and items that have no padding, border or margin of
 * their own above or below. The first paragraph's space before and the last
 * one's space after are the list's own margins (the ledger reads those).
 * Null for a list holding anything but paragraphs and lists, or whose boxes
 * the engine cannot say.
 */
export function unlaidEngineList(
  node: PmNode,
  element: HTMLElement,
  columnWidthPx: number,
  docAttrs: Record<string, unknown>,
  domAt: (offset: number) => Node | null,
  charge: (dom: HTMLElement, block: UnlaidEngineBlock) => number,
  /** Told when a paragraph of it is an estimate. */
  onApproximate?: () => void,
  /** Read from a probe element (unlaidEngineBlock's `probe`): its
   * paragraphs' readings are not kept as theirs. */
  probe = false,
): number | null {
  if (node.type.name !== "orderedList" && node.type.name !== "bulletList") return null;
  const view = element.ownerDocument.defaultView;
  if (!view) return null;
  const insets = new Map<Element, { left: number; right: number } | null>();
  // An ancestor's own horizontal room, and whether it adds nothing above or
  // below (margins collapse through it).
  const insetOf = (box: Element): { left: number; right: number } | null => {
    if (insets.has(box)) return insets.get(box)!;
    const css = view.getComputedStyle(box);
    const sides = [css.marginLeft, css.marginRight, css.paddingLeft, css.paddingRight, css.borderLeftWidth, css.borderRightWidth].map(cssPx);
    const flat = box === element
      ? [css.paddingTop, css.paddingBottom, css.borderTopWidth, css.borderBottomWidth]
      : [css.marginTop, css.marginBottom, css.paddingTop, css.paddingBottom, css.borderTopWidth, css.borderBottomWidth];
    const [marginLeft, marginRight, paddingLeft, paddingRight, borderLeft, borderRight] = sides as number[];
    const inset = sides.some((side) => side === null) || flat.some((side) => cssPx(side) !== 0)
      ? null
      : { left: marginLeft + paddingLeft + borderLeft, right: marginRight + paddingRight + borderRight };
    insets.set(box, inset);
    return inset;
  };
  let total = 0;
  let previousAfter: number | null = null;
  let failed = false;
  node.descendants((child, offset) => {
    if (failed) return false;
    if (LIST_NODES.has(child.type.name)) return true;
    if (child.type.name !== "paragraph" && child.type.name !== "heading" && child.type.name !== "mathBlock") {
      failed = true;
      return false;
    }
    const dom = domAt(offset);
    if (!(dom instanceof HTMLElement) || !element.contains(dom)) {
      failed = true;
      return false;
    }
    let width = columnWidthPx;
    const around = { left: 0, right: 0 };
    for (let box: Element | null = dom.parentElement; box; box = box.parentElement) {
      const inset = insetOf(box);
      if (inset === null) {
        failed = true;
        return false;
      }
      width -= inset.left + inset.right;
      around.left += inset.left;
      around.right += inset.right;
      if (box === element) break;
    }
    // A display equation in an item: Word's box for its formula.
    const mathPx = child.type.name === "mathBlock" ? unlaidEngineMathBlock(child, dom) : null;
    const block = child.type.name === "mathBlock"
      ? (mathPx === null ? null : { heightPx: mathPx, lineHeightsPx: [mathPx] })
      : unlaidEngineBlock(child, dom, width, docAttrs, "list", around, false, probe);
    if (!block) {
      unlaidReasons.set(node, `item: ${unlaidReasons.get(child) ?? child.type.name}`);
      failed = true;
      return false;
    }
    if ("approximate" in block && block.approximate) onApproximate?.();
    const css = view.getComputedStyle(dom);
    const before = cssPx(css.marginTop);
    const after = cssPx(css.marginBottom);
    if (before === null || after === null) {
      failed = true;
      return false;
    }
    if (previousAfter !== null) total += Math.max(previousAfter, before);
    total += charge(dom, block);
    previousAfter = after;
    return false;
  });
  return failed || previousAfter === null ? null : total;
}

/**
 * A whole table's height on a page the ledger has not laid out, for its
 * plan only (the ledger reads the table's page again, see engineSheets):
 * each row the tallest of its cells -- their paragraphs laid out by the
 * engine at the cell's width (its columns' stated widths less its padding and
 * borders), with their margins inside the cell -- or its stated height when
 * taller. Null for a table whose geometry the page alone states: a column
 * without a stated px width, a merged row, a nested table, anything in a cell
 * but paragraphs.
 */
export function unlaidEngineTable(
  node: PmNode,
  element: HTMLElement,
  docAttrs: Record<string, unknown>,
  domAt: (offset: number) => Node | null,
): number | null {
  if (node.type.name !== "table") return null;
  const view = element.ownerDocument.defaultView;
  const table = element.matches("table") ? element : element.querySelector<HTMLTableElement>(":scope > table, :scope > * > table");
  if (!view || !table || table.querySelector("table")) return null;
  const cols = Array.from(table.querySelectorAll<HTMLElement>(":scope > colgroup > col"));
  const widths = cols.map((col) => cssPx(col.style.width));
  if (widths.length === 0 || widths.some((width) => width === null || !(width > 0))) return null;
  const tableCss = view.getComputedStyle(table);
  const tableTop = cssPx(tableCss.borderTopWidth);
  const tableBottom = cssPx(tableCss.borderBottomWidth);
  if (tableTop === null || tableBottom === null) return null;
  let total = tableTop + tableBottom;
  let failed = false;
  const rowHeights: number[] = [];
  node.forEach((row, rowOffset) => {
    if (failed) return;
    let column = 0;
    let rowPx = 0;
    let rowPadTop = 0;
    let rowPadBottom = 0;
    row.forEach((cell, cellOffset) => {
      if (failed) return;
      const span = Number(cell.attrs.colspan) || 1;
      if ((Number(cell.attrs.rowspan) || 1) !== 1) {
        failed = true;
        return;
      }
      const cellDom = domAt(rowOffset + 1 + cellOffset);
      if (!(cellDom instanceof HTMLElement)) {
        failed = true;
        return;
      }
      const css = view.getComputedStyle(cellDom);
      const box = [css.paddingLeft, css.paddingRight, css.borderLeftWidth, css.borderRightWidth, css.paddingTop, css.paddingBottom, css.borderTopWidth, css.borderBottomWidth].map(cssPx);
      if (box.some((side) => side === null)) {
        failed = true;
        return;
      }
      const [pl, pr, bl, br, pt, pb, bt, bb] = box as number[];
      rowPadTop = Math.max(rowPadTop, pt);
      rowPadBottom = Math.max(rowPadBottom, pb);
      const spanWidths = widths.slice(column, column + span) as number[];
      column += span;
      if (spanWidths.length !== span) {
        failed = true;
        return;
      }
      const width = spanWidths.reduce((sum, w) => sum + w, 0) - pl - pr - (bl + br) / 2;
      let content = 0;
      let previousAfter: number | null = null;
      cell.forEach((block, blockOffset) => {
        if (failed) return;
        const dom = domAt(rowOffset + 1 + cellOffset + 1 + blockOffset);
        const laid = dom instanceof HTMLElement ? unlaidEngineBlock(block, dom, width, docAttrs, "cell") : null;
        const blockCss = dom instanceof HTMLElement ? view.getComputedStyle(dom) : null;
        const before = blockCss ? cssPx(blockCss.marginTop) : null;
        const after = blockCss ? cssPx(blockCss.marginBottom) : null;
        if (!laid || before === null || after === null) {
          failed = true;
          return;
        }
        content += (previousAfter === null ? before : Math.max(previousAfter, before)) + laid.heightPx;
        previousAfter = after;
      });
      if (failed) return;
      rowPx = Math.max(rowPx, content + (previousAfter ?? 0) + pt + pb + (bt + bb) / 2);
    });
    if (failed) return;
    // The row's declared height (px, as the page ledger reads it): its exact
    // height, or the floor of an at-least one. Word adds the cells' margins
    // to it, both to an at-least floor and the bottom one to an exact height
    // (tableBorders atLeastRowRuleDecorations).
    const declared = Number(row.attrs.rowHeight);
    const stated = declared > 0 ? declared : null;
    const rowHeight = stated !== null && row.attrs.rowHeightRule === "exact"
      ? stated + rowPadBottom
      : Math.max(rowPx, stated !== null && row.attrs.rowHeightRule === "atLeast" ? stated + rowPadTop + rowPadBottom : stated ?? 0);
    rowHeights.push(rowHeight);
    total += rowHeight;
  });
  if (failed) return null;
  unlaidTableRows.set(node, { rowHeightsPx: rowHeights, chromePx: tableTop + tableBottom });
  return total;
}

/**
 * A display equation's height with no layout (the book of 1,946 of them
 * stopped every one-pass plan at the first one past the horizon): its
 * preview is the box Word gives the formula, set from the formula alone
 * (wordMathMetrics `applyWordDisplayMathBox`: ascent + descent, in em of the
 * preview's font size), or the typeset placeholder's stated height while it
 * waits to be typeset -- the same box. The wrapper adds nothing but its
 * margins (the ledger reads those). Null for an equation KaTeX sizes itself
 * (a construct Word's model does not know) or one being edited.
 */
/**
 * A display equation Word's metrics do not box (wordDisplayMathExtents has no
 * answer for its construct), estimated from KaTeX's own build: its natural
 * box (`.katex-display` has no margin here), at least a line of its
 * line-height (1.2em), at the preview's font size. An estimate the page
 * checks: KaTeX's metrics are TeX's, and what Word does with such a formula
 * is not known here.
 */
export function unlaidEngineKatexMathBlock(node: PmNode, element: HTMLElement): number | null {
  if (node.type.name !== "mathBlock") return null;
  const view = element.ownerDocument.defaultView;
  const preview = element.querySelector<HTMLElement>(":scope > .math-block-preview");
  if (!view || !preview || element.children.length !== 1) return null;
  const latex = String(node.attrs.latex ?? "");
  if (!latex.trim()) return null;
  const box = katexBox(latex, true);
  const fontPx = cssPx(view.getComputedStyle(preview).fontSize);
  if (!box || fontPx === null || !(fontPx > 0)) return null;
  return Math.max(1.2, box.heightEm + box.depthEm) * fontPx;
}

export function unlaidEngineMathBlock(node: PmNode, element: HTMLElement): number | null {
  if (node.type.name !== "mathBlock") return null;
  const view = element.ownerDocument.defaultView;
  const preview = element.querySelector<HTMLElement>(":scope > .math-block-preview");
  if (!view || !preview || element.children.length !== 1) return null;
  const placeholder = preview.getAttribute("data-math-layout-ready") === "block"
    ? cssPx(preview.style.getPropertyValue("--math-placeholder-height").trim())
    : null;
  if (placeholder !== null && placeholder > 0) return placeholder;
  if (!preview.hasAttribute("data-word-math-box")) return null;
  const em = (name: string): number | null => {
    const value = preview.style.getPropertyValue(name).trim();
    return value.endsWith("em") ? Number.parseFloat(value) : null;
  };
  const ascent = em("--word-math-ascent");
  const descent = em("--word-math-descent");
  const fontPx = cssPx(view.getComputedStyle(preview).fontSize);
  if (ascent === null || descent === null || fontPx === null || !(fontPx > 0)) return null;
  return (ascent + descent) * fontPx;
}

/**
 * A block picture's height with no layout, for the plan only (its page is
 * still checked): the image node view draws a picture of a stated px size
 * (`data-picture-fixed-size`) at that size, and its frame adds only its own
 * padding and borders. Null for a picture sized by CSS or holding anything
 * besides its image and its absolutely placed chrome (a caption).
 */
export function unlaidEnginePicture(node: PmNode, element: HTMLElement): number | null {
  if (node.type.name !== "image" || node.isInline) return null;
  const view = element.ownerDocument.defaultView;
  const frame = element.matches(".note-editor-image-resizable") ? element : element.querySelector<HTMLElement>(":scope > .note-editor-image-resizable");
  if (!view || !frame || frame.getAttribute("data-picture-fixed-size") !== "true") return null;
  const img = frame.querySelector<HTMLElement>(":scope > img");
  const height = img ? cssPx(img.style.height) : null;
  if (!img || height === null || !(height > 0)) return null;
  for (const child of Array.from(frame.children)) {
    if (child === img) continue;
    const position = view.getComputedStyle(child).position;
    if (position !== "absolute" && position !== "fixed") return null;
  }
  const outer = [frame, ...(frame === element ? [] : [element])];
  let total = height;
  for (const box of outer) {
    const css = view.getComputedStyle(box);
    const sides = [css.paddingTop, css.paddingBottom, css.borderTopWidth, css.borderBottomWidth].map(cssPx);
    if (sides.some((side) => side === null)) return null;
    total += (sides as number[]).reduce((sum, side) => sum + side, 0);
  }
  return total;
}

/**
 * engineTextCut for a paragraph the engine laid out with no layout of its
 * page (unlaidEngineBlock): as many of its lines as fit `availablePx`, the
 * last one's Auto leading allowed past the foot, then Word's widow and
 * orphan floors. `offsetOf` gives a line start's offset in the block's
 * content (EditorView.posAtDOM, which lays nothing out). `undefined`: the
 * engine does not know (an estimate, a bordered block, nothing laid out).
 */
export function unlaidEngineTextCut(
  node: PmNode,
  availablePx: number,
  minLines: number,
  context: EngineTextCutContext,
  offsetOf: (start: { node: Text; offset: number }) => number | null,
): EngineTextCut | null | undefined {
  const block = unlaid.get(node)?.block;
  if (!block || (block.approximate && !context.estimate) || block.chromed || !block.lineStarts || block.lineHeightsPx.length < 2) return undefined;
  const credit = context.footCreditPx ?? 0;
  const rowsBefore = context.rowsBefore ?? 0;
  const rowsAfter = context.rowsAfter ?? 0;
  const lines = block.lineHeightsPx;
  let kept = 0;
  let head = 0;
  while (kept < lines.length && head + lines[kept] - credit <= availablePx + 1e-6) {
    head += lines[kept];
    kept += 1;
  }
  kept = Math.min(kept, lines.length - Math.max(1, minLines - rowsAfter));
  if (kept < 1 || kept + rowsBefore < minLines) return null;
  const frozen = block.lineOffsets?.[kept];
  const start = block.lineStarts[kept];
  const startText = start?.node.deref();
  const contentOffset = frozen !== undefined ? frozen : start && startText ? offsetOf({ node: startText, offset: start.offset }) : null;
  if (contentOffset === null || contentOffset === undefined) return undefined;
  let rowTop = 0;
  for (let index = 0; index < kept; index += 1) rowTop += lines[index];
  return { contentOffset, rowTop };
}
