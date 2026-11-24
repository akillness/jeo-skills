/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import {
  normalizePositionalTab,
  normalizeTabStops,
  TAB_STOP_REACH_PX,
  WORD_DEFAULT_TAB_INTERVAL_TWIPS,
  wordTabAdvanceAt,
  wordTabAdvances,
  wordTabLeader,
  wordTabStopAfter,
  withHangingIndentStop,
  type PositionalTab,
} from "@mrnote/core/web/lib/document-tabstops.ts";

import { normalizeWordCompatibilityMode } from "@mrnote/core/web/components/console/editor/native-document/documentOverflowPunctuation.ts";
import { inlineTextWidthPx } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { BAND_RUN_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRunMark.ts";
import { measurementRange } from "@mrnote/core/web/components/console/editor/native-document/paged/measurementRange.ts";
import { SheetMeasureMemo, sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import { MEASURE_HORIZON_EVENT, sheetsWithinMeasureHorizon } from "@mrnote/core/web/components/console/editor/native-document/paged/measureHorizon.ts";
import { editorFontFamilies, facesUsedBy, loadedFaceRanges, textDrawsCodePointIn } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerFontRanges.ts";
import { afterFontsReady, newFontFacesOf } from "@mrnote/core/web/lib/font-face-news.ts";
import { clearLayoutPending, markLayoutPending, registerLayoutSettler } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutPending.ts";
import { REBALANCE_META as PAGINATION_MOVE_META } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";

/** The tabs' decorations, and how many edits from outside the document has had
 * (the pagination's own moves not counted). */
interface BandTabState {
  set: DecorationSet;
  edits: number;
  /** How many decorations the set holds, and whether the last change of the
   * document took some of them with it (see tabRestoreOff). */
  count: number;
  lost: boolean;
}

export const bandTabLayoutKey = new PluginKey<BandTabState>("bandTabLayout");

interface TabbedLine {
  /** Document positions of the line's tab characters. */
  tabs: number[];
  /** Word's absolute position tab each of them is, if it is one. */
  positional: (PositionalTab | null)[];
  /** [from, to) document ranges of the text around them (tabs + 1). */
  segments: Array<[number, number]>;
  stops: ReturnType<typeof normalizeTabStops>;
  contentStart: number;
  contentEnd: number;
  /** Document position of the text block itself. */
  blockPos: number;
  /** The paragraph's left and right indents, in px. */
  indentLeftPx: number;
  indentRightPx: number;
  /** Word 2010 compatibility: a tab may run past the right margin and the
   * text after it stays on the line (`source.wordTabOverMargin`). */
  overMargin: boolean;
  /** A paragraph with stops of its own in a table cell of a document in
   * compatibility mode 14 or earlier: its tabs run past the cell's right
   * edge the same way (tables/probes/tabedge; see `tabOverMarginLineOff`). */
  cellOverMargin: boolean;
}




















/**
 * Harness switch (`window.__docsOldModeTabCarryOff = true`): in a Word 2010
 * (or earlier) paragraph whose tabs may run past the edge, a tab whose next
 * word does not fit after its stop stays on its line, as before (A/B).
 */
export function oldModeTabCarryOff(win: Window | null | undefined): boolean {
  return (win as (Window & { __docsOldModeTabCarryOff?: boolean }) | null | undefined)?.__docsOldModeTabCarryOff === true;
}

export function tabOverMarginLineOff(win: Window | null | undefined): boolean {
  return (win as (Window & { __docsTabOverMarginLineOff?: boolean }) | null | undefined)?.__docsTabOverMarginLineOff === true;
}

















export function tabPastIndentOff(win: Window | null | undefined): boolean {
  return (win as (Window & { __docsTabPastIndentOff?: boolean }) | null | undefined)?.__docsTabPastIndentOff === true;
}

function indentPx(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value * PX_PER_PT : 0;
}

/** Text blocks found to hold no tab: a block keeps its node wherever the
 * pages move it, and a long book's every block built its text again on
 * every layout to look for one. */
const tablessBlocks = new WeakSet<PmNode>();

/**
 * Whether a line ends just before `pos`: a Shift+Enter, as the editor holds
 * it -- a hardBreak node, or (a Word import's w:br) a newline in the text,
 * which the paragraph's pre-wrap draws as a break. Only the node was read:
 * tables/probes/tabind15 Ta08 "Ta08 Alpha<Tab>Y08<Shift+Enter>Ta08b
 * Beta<Tab>Y08b", a right stop past the right indent, measured the text
 * after the first tab through the second line, took that tab to a line of
 * its own and drew Y08 at the margin (Word: on its line, at the stop).
 * `window.__docsTabNewlineBreakOff = true` reads only the node (A/B).
 */
function lineEndsBefore(doc: PmNode, pos: number): boolean {
  const before = doc.resolve(pos).nodeBefore;
  if (!before) return false;
  if (before.type.name === "hardBreak") return true;
  return before.isText && (before.text ?? "").endsWith("\n") && !tabNewlineBreakOff();
}

function tabNewlineBreakOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabNewlineBreakOff?: boolean }).__docsTabNewlineBreakOff === true;
}

const HOLDS_TAB = new SheetFact((node) => node.isText && (node.text ?? "").includes("\t"));

/** The document's tabbed lines as read for layout: their tabs and the text
 * each tab aligns (exported for tests). */
/** The tab widths of `view`'s tabbed lines as one pass reads them (tests). */
export function measureTabsForTest(view: EditorView): ReturnType<typeof measure> {
  return measure(view);
}

export function tabbedLinesForTest(doc: PmNode): Pick<TabbedLine, "tabs" | "segments" | "contentStart" | "contentEnd">[] {
  return tabbedLines(doc).map(({ tabs, segments, contentStart, contentEnd }) => ({ tabs, segments, contentStart, contentEnd }));
}

function tabbedLines(doc: PmNode): TabbedLine[] {
  const lines: TabbedLine[] = [];
  const mode = normalizeWordCompatibilityMode(doc.attrs.wordCompatibilityMode);
  const oldMode = mode !== null && mode < 15;
  HOLDS_TAB.descendants(doc, (node, pos) => {
    if (!node.isTextblock) return true;
    // Code keeps its own tab width: Word's stops are a paragraph's.
    if (node.type.spec.code) return false;
    if (tablessBlocks.has(node)) return false;
    if (!node.textContent.includes("\t")) {
      tablessBlocks.add(node);
      return false;
    }
    const contentStart = pos + 1;
    const blockPos = pos;
    const tabs: number[] = [];
    const positional: (PositionalTab | null)[] = [];
    // Shift+Enter ends a line: the text after a tab runs only to it.
    const breaks: number[] = [];
    const newlines = !tabNewlineBreakOff();
    node.forEach((child, offset) => {
      if (child.type.name === "hardBreak") breaks.push(contentStart + offset);
      if (!child.isText) return;
      const text = child.text ?? "";
      if (newlines) {
        for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) {
          breaks.push(contentStart + offset + index);
        }
      }
      // Every tab of a positional tab's text node is one (the editor joins
      // two alike ones into one node), as the story reads it back.
      const ptab = normalizePositionalTab(
        child.marks.find((mark) => mark.type.name === BAND_RUN_MARK_NAME)?.attrs.ptab ?? null,
      );
      for (let index = text.indexOf("\t"); index >= 0; index = text.indexOf("\t", index + 1)) {
        tabs.push(contentStart + offset + index);
        positional.push(ptab);
      }
    });
    const contentEnd = contentStart + node.content.size;
    const segments: Array<[number, number]> = [];
    let from = contentStart;
    for (const tab of tabs) {
      segments.push([from, tab]);
      from = tab + 1;
    }
    segments.push([from, contentEnd]);
    // The text a tab aligns is the rest of its own line: a right stop on the
    // first line of "label<Tab>12<Shift+Enter>longer label<Tab>34" measured
    // "12" and the second line's label together, and drew no gap (WUA 142).
    for (const [index, [start, end]] of segments.entries()) {
      const cut = breaks.find((at) => at >= start && at < end);
      if (cut !== undefined) segments[index] = [start, cut];
    }
    const stops = withHangingIndentStop(normalizeTabStops(node.attrs.tabStops ?? null), node.attrs.indentLeftPt, node.attrs.firstLineIndentPt);
    let inCell = false;
    if (oldMode && (stops ?? []).some((stop) => stop.align !== "bar")) {
      const $pos = doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0 && !inCell; depth -= 1) {
        const name = $pos.node(depth).type.name;
        if (name === "tableCell" || name === "tableHeader") inCell = true;
      }
    }
    lines.push({
      tabs,
      positional,
      segments,
      stops,
      contentStart,
      contentEnd,
      blockPos,
      indentLeftPx: indentPx(node.attrs.indentLeftPt),
      indentRightPx: indentPx(node.attrs.indentRightPt),
      overMargin: (node.attrs.source as { wordTabOverMargin?: unknown } | null)?.wordTabOverMargin === 1,
      cellOverMargin: inCell,
    });
    return false;
  });
  return lines;
}

/** Whether any of the line's drawn text boxes reaches past the right edge:
 * tabs the browser lets hang there (pre-wrap white space) where Word wraps. */
/**
 * Whether a line's pen passes the paragraph's right edge. The tolerance a stop
 * is reached with is no part of this: a right stop 0.6 pt past the margin
 * (corpus R282-D16: 9072 twips in a 9060-twip column, mode 14) reads as at the
 * edge, the line is laid out as if it fitted, the browser breaks it by that
 * 0.6 pt, and four lines of a form take two each.
 */
export function tabRunsPastRightEdge(atPx: number, rightEdgePx: number): boolean {
  return atPx > rightEdgePx + 0.01;
}

function drawnPastRightEdge(
  view: EditorView,
  line: TabbedLine,
  origin: number,
  scale: number,
  rightEdgePx: number,
): boolean {
  try {
    const start = view.domAtPos(line.contentStart);
    const end = view.domAtPos(line.contentEnd);
    const range = measurementRange(view.dom.ownerDocument, "bandTabLayout");
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return Array.from(range.getClientRects()).some(
      (rect) => rect.width > 0 && (rect.right - origin) / scale > rightEdgePx,
    );
  } catch {
    return false;
  }
}

/** How many times a wrapped paragraph's tabs are measured again after a
 * change before the widths are taken as they stand. */
const MAX_SETTLE_PASSES = 4;

/** A computed `tab-size` that is a length, in px: the surface's is the
 * document's Default tab stops, a block's is what the browser draws its tabs
 * with (a paragraph with stops of its own states another). */
function nativeTabIntervalPx(style: CSSStyleDeclaration | null | undefined): number | null {
  if (!style) return null;
  const value = style.tabSize ?? "";
  if (!value.endsWith("px")) return null;
  const px = Number.parseFloat(value);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/** One tabbed line's tabs as measured: its keys (without the line's index)
 * and decorations, positions from the line's block. */
interface LineTabDecoration { node: boolean; from: number; to: number; attrs: Record<string, string> }
interface LineTabs { keys: readonly string[]; decorations: readonly LineTabDecoration[]; wrapped: boolean }
interface SheetTabs { at: string; lines: Map<PmNode, LineTabs> }
interface TabLinePlace { sheet: HTMLElement; page: PmNode; block: PmNode }

// A line's measurement reads its own page only (its block's box, its text's
// rects and the root's metrics, which `at` keys): on a page nothing changed
// in since, under the same page node, it measures what it measured (the page
// ledger's rule, sheetMeasureMemo). A font arriving forgets them all.
const tabMeasureMemos = new WeakMap<HTMLElement, SheetMeasureMemo<SheetTabs>>();

function tabMeasureMemo(root: HTMLElement): SheetMeasureMemo<SheetTabs> | null {
  let memo = tabMeasureMemos.get(root);
  if (!memo && typeof root.ownerDocument.defaultView?.MutationObserver === "function") {
    tabMeasureMemos.set(root, (memo = new SheetMeasureMemo<SheetTabs>(root)));
  }
  return memo ?? null;
}

function tabLinePlace(view: EditorView, root: HTMLElement, line: TabbedLine): TabLinePlace | null {
  const doc = view.state.doc;
  const block = doc.nodeAt(line.blockPos);
  const $at = doc.resolve(line.blockPos);
  if (!block || $at.depth < 1) return null;
  const page = $at.node(1);
  if (page.type.name !== "pageBlock") return null;
  const dom = view.nodeDOM(line.blockPos);
  const sheet = dom instanceof HTMLElement ? dom.closest("article[data-page-sheet]") : null;
  return sheet instanceof HTMLElement && sheet.parentElement === root ? { sheet, page, block } : null;
}

function keptLineTabs(memo: SheetMeasureMemo<SheetTabs>, place: TabLinePlace, at: string): LineTabs | undefined {
  const kept = memo.get(place.sheet, place.page);
  return kept && kept.at === at ? kept.lines.get(place.block) : undefined;
}

function keepLineTabs(memo: SheetMeasureMemo<SheetTabs>, place: TabLinePlace, at: string, tabs: LineTabs): void {
  let kept = memo.get(place.sheet, place.page);
  if (!kept || kept.at !== at) memo.set(place.sheet, place.page, (kept = { at, lines: new Map() }));
  kept.lines.set(place.block, tabs);
}



















export function tabRestoreOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabRestoreOff?: boolean }).__docsTabRestoreOff === true;
}



function tabRestoreByNodeOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabRestoreByNodeOff?: boolean }).__docsTabRestoreByNodeOff === true;
}

/** Each tabbed paragraph's tabs as last measured, by what decides them: its
 * own content and attributes, and its cell's attributes (the column width). */
const tabsByContent = new WeakMap<HTMLElement, Map<string, { at: string; tabs: LineTabs }>>();
const TABS_BY_CONTENT_MAX = 4000;
const contentKeys = new WeakMap<PmNode, string>();

function lineContentKey(doc: PmNode, line: TabbedLine): string | null {
  return contentKeyAt(doc, line.blockPos);
}

function contentKeyAt(doc: PmNode, blockPos: number): string | null {
  if (blockPos < 0 || blockPos >= doc.content.size) return null;
  const block = doc.nodeAt(blockPos);
  if (!block || !block.isTextblock) return null;
  let own = contentKeys.get(block);
  if (own === undefined) contentKeys.set(block, (own = JSON.stringify(block.toJSON())));
  const $at = doc.resolve(blockPos);
  const holder = $at.parent;
  const cell = holder.type.spec.tableRole === "cell" || holder.type.spec.tableRole === "header_cell" || /cell|header/i.test(holder.type.name)
    ? JSON.stringify(holder.attrs)
    : holder.type.name;
  return `${cell}|${own}`;
}

/** A tab decoration of the line at `blockPos`, carrying what it is relative to
 * its block (restoreDroppedTabs). */
function tabDecoration(blockPos: number, item: LineTabDecoration): Decoration {
  const from = blockPos + item.from, to = blockPos + item.to;
  const spec = { bandTab: item };
  return item.node ? Decoration.node(from, to, item.attrs, spec) : Decoration.inline(from, to, item.attrs, spec);
}

/**
 * The decorations a change of the document took away, put back in the same
 * transaction on the paragraphs of the same content in cells of the same
 * attributes: the ledger re-cutting a table (its pieces built anew) is read by
 * the ledger's next pass before a frame could measure the tabs again, and R417
 * page 40's header row, measured five lines without them, went round: re-cut
 * on the tall row, tabs back, re-cut on the short one, 52 and 53 pages every
 * few seconds (nd14/t-old). Null when nothing could be put back.
 */
function restoreDroppedTabs(before: DecorationSet, tr: Transaction, mapped: DecorationSet): DecorationSet | null {
  const old = tr.before;
  const byKey = new Map<string, LineTabDecoration[]>();
  const keyOfBlock = new Map<number, string | null>();
  // By the paragraph itself first: a block the pagination moved to another
  // sheet is the same node there. By content alone, paragraphs of one content
  // were never put back (the first of them took it), and a document of many
  // paragraphs holding only a tab had them measured with unsized tabs a line
  // taller after every move, the page start beside them going and coming back
  // on each key (corpus R484-D04, pages 6, 10 and 13).
  const byNode = tabRestoreByNodeOff() ? null : new Map<PmNode, LineTabDecoration[]>();
  for (const decoration of before.find()) {
    const item = (decoration.spec as { bandTab?: LineTabDecoration } | undefined)?.bandTab;
    if (!item) continue;
    const blockPos = decoration.from - item.from;
    if (byNode) {
      const node = old.nodeAt(blockPos);
      if (node) {
        const items = byNode.get(node);
        if (items) items.push(item);
        else byNode.set(node, [item]);
      }
    }
    let key = keyOfBlock.get(blockPos);
    if (key === undefined) {
      key = contentKeyAt(old, blockPos);
      keyOfBlock.set(blockPos, key);
      // The first paragraph of a content takes it.
      if (key !== null && byKey.has(key)) {
        key = null;
        keyOfBlock.set(blockPos, null);
      } else if (key !== null) byKey.set(key, []);
    }
    if (key !== null) byKey.get(key)!.push(item);
  }
  if (byKey.size === 0 && !byNode?.size) return null;
  const added: Decoration[] = [];
  const seen = new Set<number>();
  for (const line of tabbedLines(tr.doc)) {
    if (seen.has(line.blockPos)) continue;
    seen.add(line.blockPos);
    const block = tr.doc.nodeAt(line.blockPos);
    if (!block || mapped.find(line.blockPos, line.blockPos + block.nodeSize).length > 0) continue;
    const key = byNode?.has(block) ? null : contentKeyAt(tr.doc, line.blockPos);
    const items = byNode?.get(block) ?? (key !== null ? byKey.get(key) : undefined);
    if (!items) continue;
    for (const item of items) added.push(tabDecoration(line.blockPos, item));
  }
  return added.length ? mapped.add(tr.doc, added) : null;
}

function rememberTabsByContent(root: HTMLElement, key: string | null, at: string, tabs: LineTabs): void {
  if (!key) return;
  let byKey = tabsByContent.get(root);
  if (!byKey) tabsByContent.set(root, (byKey = new Map()));
  if (byKey.size >= TABS_BY_CONTENT_MAX && !byKey.has(key)) byKey.clear();
  byKey.set(key, { at, tabs });
}

function rememberedTabsByContent(root: HTMLElement, key: string | null, at: string): LineTabs | undefined {
  if (!key) return undefined;
  const kept = tabsByContent.get(root)?.get(key);
  return kept && kept.at === at ? kept.tabs : undefined;
}













export const BAND_TAB_LAYOUT_REASON = "band-tab-layout";

function tabLedgerNudgeOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabLedgerNudgeOff?: boolean }).__docsTabLedgerNudgeOff === true;
}

/**
 * The measurements a paragraph's tabs have had since the layout's inputs last
 * changed, by its node. Tabs sized for one line can make that line wrap, and
 * sized for the lines it wraps into make it fit one again: no widths hold
 * (R350-D07's interlinear glosses, eight left stops, 21 px and 43 px in turn).
 * Stopped by the count of passes, a paragraph stood on whichever of the two the
 * count ran out on, and one opening laid the book out on 159 sheets, the next
 * on 160. Once a paragraph comes back to widths it had, it takes, of those it
 * went round, the narrowest: the one its text stands on the fewest lines with
 * (Word, whose tabs are laid out with the line, sets such a gloss on one).
 */
interface TabRound { times: number; widthPx: number; widths: number[]; shape: string; tabs: LineTabs }
















function tabRoundsByWidthOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabRoundsByWidthOff?: boolean }).__docsTabRoundsByWidthOff === true;
}



function tabKeptWholeParagraphOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabKeptWholeParagraphOff?: boolean }).__docsTabKeptWholeParagraphOff === true;
}
export type TabRounds = WeakMap<PmNode, TabRound[]>;

/** A line's tab widths, and what else its keys say (each tab's place and leader). */
function tabWidthsOf(tabs: LineTabs): { widths: number[]; shape: string } {
  const widths: number[] = [];
  const shape: string[] = [];
  for (const item of tabs.keys) {
    const [index, advance, leader] = item.split(":");
    const px = Number.parseFloat(advance ?? "");
    if (Number.isFinite(px)) {
      widths.push(px);
      shape.push(`${index}:${leader}`);
    } else shape.push(item);
  }
  return { widths, shape: shape.join(",") };
}

/** The width a reading was taken at (its `col=` key), or null. */
function widthKeyOf(tabs: LineTabs): string | null {
  return tabs.keys.find((key) => key.startsWith("col=")) ?? null;
}

export function settledRound(rounds: TabRounds | null, block: PmNode | null | undefined, tabs: LineTabs): LineTabs {
  if (!rounds || !block) return tabs;
  let seen = rounds.get(block);
  if (!seen) rounds.set(block, (seen = []));
  const { widths, shape } = tabWidthsOf(tabs);
  // Within a stop's reach of each other, two readings are one width: the half
  // pixels a justified line's spacing reads a tab at are neither a new width
  // nor one that did not come back.
  const entry = seen.find((candidate) =>
    candidate.shape === shape &&
    candidate.widths.length === widths.length &&
    candidate.widths.every((width, index) => Math.abs(width - widths[index]) <= TAB_STOP_REACH_PX));
  if (entry) entry.times += 1;
  else seen.push({ times: 1, widthPx: widths.reduce((sum, width) => sum + width, 0), widths, shape, tabs });
  // Round: widths it had come back, or the paragraph measured on one line and
  // on two in turn (the count of passes can run out before the widths come
  // back: R350-D07, one gloss one line on one opening and two on the next).
  // (A count of widths is no round: taken by one, the narrowest of a justified
  // paragraph's readings moved a Greek paragraph's first line, R282-D25.)
  // Only readings at this one's width (`tabRoundsByWidthOff`).
  const width = widthKeyOf(tabs);
  const same = width === null ? seen : seen.filter((candidate) => widthKeyOf(candidate.tabs) === width);
  let flipped = false;
  if (!entry && same.length >= 2) {
    flipped = same.some((candidate) => candidate.tabs.wrapped) && same.some((candidate) => !candidate.tabs.wrapped);
  }
  if ((!entry && !flipped) || same.length < 2) return tabs;
  let narrowest: TabRound | null = null;
  for (const candidate of same) {
    if (!narrowest || candidate.widthPx < narrowest.widthPx - 0.01 ||
      (Math.abs(candidate.widthPx - narrowest.widthPx) <= 0.01 && candidate.tabs.keys.join(",") < narrowest.tabs.keys.join(","))) {
      narrowest = candidate;
    }
  }
  // Settled: nothing more to read again for it.
  return narrowest ? { ...narrowest.tabs, wrapped: false } : tabs;
}

/** Off with `window.__docsTabsUnjustifiedOff = true`: tabs read where a
 * justified line draws them, as before. */
function tabsUnjustifiedOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTabsUnjustifiedOff?: boolean }).__docsTabsUnjustifiedOff === true;
}

/**
 * Lay the justified paragraphs among `lines` out unjustified while their tabs
 * are read, by a rule in the document's head (no mutation inside the editor:
 * its observers see nothing). Returns the rule's element to remove, or null.
 *
 * Word sets a line's tabs before it justifies the line: where a tab stands is
 * the width of the text before it, not that text stretched. Read off a
 * justified line, a tab's place moved with the stretch of the spaces before it,
 * the stretch with the line's slack, and the slack with the tab's own width: a
 * paragraph whose first line held one word more or less with each width had no
 * widths that held (R282-D25: " <Tab><Tab>Ο προϋπολογισμός...", 47 px and 63 px
 * in turn, two lines and three), and the count of settling passes chose
 * between them, so one opening laid the page out on two lines and the next on
 * three. Read unjustified, the widths depend on the text alone. The browser
 * breaks the line before it justifies it, so the breaks are the ones these
 * widths give.
 */
function unjustifyTabbedBlocks(view: EditorView, lines: readonly TabbedLine[]): HTMLStyleElement | null {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  if (!win || tabsUnjustifiedOff()) return null;
  const selectors = new Set<string>();
  for (const line of lines) {
    const block = view.nodeDOM(line.blockPos);
    if (!(block instanceof HTMLElement)) continue;
    const id = block.getAttribute("data-block-id");
    if (!id) continue;
    const align = win.getComputedStyle(block).textAlign;
    if (align !== "justify") continue;
    const escaped = typeof win.CSS?.escape === "function" ? win.CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    selectors.add(`[data-block-id="${escaped}"]`);
  }
  if (!selectors.size) return null;
  const style = doc.createElement("style");
  style.setAttribute("data-band-tabs-unjustified", "");
  style.textContent = `${[...selectors].join(",")} { text-align: start !important; text-align-last: start !important; }`;
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

function measure(view: EditorView, rounds: TabRounds | null = null): { set: DecorationSet; key: string; wrapped: boolean; deferred: boolean; firstRead: boolean } | null {
  const root = view.dom as HTMLElement;
  const width = root.offsetWidth;
  if (!width) return null;
  const scale = root.getBoundingClientRect().width / width || 1;
  const rootStyle = root.ownerDocument.defaultView?.getComputedStyle(root);
  const paddingLeft = Number.parseFloat(rootStyle?.paddingLeft ?? "0") || 0;
  const paddingRight = Number.parseFloat(rootStyle?.paddingRight ?? "0") || 0;
  const rootOrigin = root.getBoundingClientRect().left + paddingLeft * scale;
  // The story's text column, margin to margin: where a positional tab set
  // relative to the margins measures from.
  const rootColumnPx = Math.max(0, root.clientWidth - paddingLeft - paddingRight);
  // Word's Default tab stops for this document.
  const defaultIntervalPx = nativeTabIntervalPx(rootStyle);
  const defaultIntervalTwips =
    defaultIntervalPx !== null ? defaultIntervalPx * 15 : WORD_DEFAULT_TAB_INTERVAL_TWIPS;
  const decorations: Decoration[] = [];
  const keys: string[] = [];
  let wrapped = false;
  // Each line's tabs as measured, kept per page (see tabMeasureMemo): a
  // keystroke measured every tabbed line of the document again (a long
  // book's contents rows: a layout of every page, ~1 s under load).
  const memo = tabMeasureMemo(root);
  const memoAt = `${width}|${scale}|${paddingLeft}|${paddingRight}|${defaultIntervalPx}`;
  const measureLine = (line: TabbedLine): LineTabs => {
    const lineKeys: string[] = [];
    const lineDecorations: LineTabDecoration[] = [];
    let lineWrapped = false;
    const done = (): LineTabs => ({ keys: lineKeys, decorations: lineDecorations, wrapped: lineWrapped });
    // Word 2010: the paragraph's tabs may run past its right edge, and from
    // the first that does its line is kept whole (`tabOverMarginLineOff`);
    // switched off, the whole paragraph is one line, as before.
    const lineOff = tabOverMarginLineOff(view.dom.ownerDocument.defaultView);
    const overMarginLine = line.overMargin || (!lineOff && line.cellOverMargin);
    // Word 2013 and later: a stop past the right indent but inside the
    // column is where its tab goes (`tabPastIndentOff`).
    const reachColumn = !overMarginLine && !tabPastIndentOff(view.dom.ownerDocument.defaultView);
    // The paragraph's own containing block: its box plus the margins its
    // indents render as. On a page that is the sheet's text column; in a
    // table it is the cell. The story's root serves when the block has no
    // element of its own (a measurement before the view drew it).
    let origin = rootOrigin;
    let columnPx = rootColumnPx;
    // The interval the browser draws this block's tabs with, and where the
    // block's own text edge stands from the column's: it counts its tab
    // stops from there.
    let blockIntervalPx: number | null = null;
    let textEdgePx = 0;
    const blockDom = view.nodeDOM(line.blockPos);
    if (blockDom instanceof HTMLElement && blockDom.ownerDocument.defaultView) {
      const rect = blockDom.getBoundingClientRect();
      const style = blockDom.ownerDocument.defaultView.getComputedStyle(blockDom);
      blockIntervalPx = nativeTabIntervalPx(style);
      // A right-to-left paragraph lays its tabs out from the right margin,
      // which the pen below (left to right, Word's LTR rule) does not model;
      // its segment widths read off bidi-reordered client rects moved with
      // every tab width installed, so each keystroke re-sized every tab of
      // every RTL line in the document and paginated those pages again.
      // Such a line keeps the browser's uniform tab until RTL stops are
      // modelled.
      if (style.direction === "rtl") return done();
      const marginLeft = Number.parseFloat(style.marginLeft) || 0;
      const marginRight = Number.parseFloat(style.marginRight) || 0;
      if (rect.width > 0) {
        origin = rect.left - marginLeft * scale;
        columnPx = rect.width / scale + marginLeft + marginRight;
      }
      textEdgePx =
        marginLeft +
        (Number.parseFloat(style.borderLeftWidth) || 0) +
        (Number.parseFloat(style.paddingLeft) || 0);
    }
    // The width the line was read at: readings at another width (the page
    // before its columns were projected) are no round of this one.
    if (!tabRoundsByWidthOff()) lineKeys.push(`col=${Math.round(columnPx * 4) / 4}`);
    const customStops = (line.stops ?? []).some((stop) => stop.align !== "bar");
    if (
      !customStops &&
      !line.positional.some(Boolean) &&
      defaultIntervalPx !== null &&
      blockIntervalPx !== null &&
      Math.abs(blockIntervalPx - defaultIntervalPx) < 0.01
    ) {
      // Word's default stops count from the column's edge. The browser's
      // count from the block's text edge: the same stops when that edge
      // stands on one, and then its own tab is Word's on every line.
      const off = ((textEdgePx % defaultIntervalPx) + defaultIntervalPx) % defaultIntervalPx;
      // ... unless a tab runs past the right edge: the browser lets it hang
      // there, where Word (2013 and later) takes it to the next line, to that
      // line's first stop (corpus R37-D22: 22 default tabs, ten to a line).
      const rightEdgePx = columnPx - line.indentRightPx + TAB_STOP_REACH_PX;
      const hangs = !overMarginLine && drawnPastRightEdge(view, line, origin, scale, rightEdgePx);
      if (!hangs && (off <= TAB_STOP_REACH_PX || defaultIntervalPx - off <= TAB_STOP_REACH_PX)) return done();
    }
    // The text between two tabs as drawn, all of it even where it has
    // wrapped: coordinates of its two ends would measure the gap between two
    // lines, and a tab sized from that keeps the text wrapped for good.
    const segmentWidth = ([from, to]: [number, number]) => {
      if (from >= to) return 0;
      try {
        const start = view.domAtPos(from);
        const end = view.domAtPos(to);
        const range = measurementRange(root.ownerDocument, "bandTabLayout");
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        const width = inlineTextWidthPx(Array.from(range.getClientRects()), scale);
        if (width !== null) return width;
      } catch {
        // No DOM range for these positions: measure their coordinates.
      }
      return Math.max(0, (view.coordsAtPos(to, -1).left - view.coordsAtPos(from, 1).left) / scale);
    };
    // The text right after a tab up to its first break (a space or a soft
    // hyphen; a picture counts whole): Word breaks a line before a tab, not
    // after it, so a tab and that word move to the next line together.
    const firstWordWidth = ([from, to]: [number, number]): number => {
      let end = to;
      view.state.doc.nodesBetween(from, to, (node, pos) => {
        if (end !== to || !node.isText || !node.text) return end === to;
        const start = Math.max(from, pos);
        const text = node.text.slice(start - pos, to - pos);
        const at = text.search(/[ \u00ad]/);
        if (at >= 0) end = start + at;
        return false;
      });
      return segmentWidth([from, end]);
    };
    // A decimal stop aligns the text's first decimal point on the stop, so
    // the width up to it is measured too (DB: Word parity audit, decimal
    // tab drew as a right tab).
    const hasDecimalStop = (line.stops ?? []).some((stop) => stop.align === "decimal");
    const decimalAt = ([from, to]: [number, number]): number | null => {
      let found: number | null = null;
      view.state.doc.nodesBetween(from, to, (node, pos) => {
        if (found !== null || !node.isText || !node.text) return found === null;
        const start = Math.max(from, pos);
        const offset = node.text.slice(start - pos, to - pos).indexOf(".");
        if (offset >= 0) found = start + offset;
        return false;
      });
      return found;
    };
    const segments = line.segments.map((range) => {
      const widthPx = segmentWidth(range);
      if (!hasDecimalStop) return { widthPx };
      const point = decimalAt(range);
      return point === null ? { widthPx } : { widthPx, decimalPx: segmentWidth([range[0], point]) };
    });
    const first = view.coordsAtPos(line.contentStart, 1);
    const startPx = (first.left - origin) / scale;
    const column = { widthPx: columnPx, indentLeftPx: line.indentLeftPx, indentRightPx: line.indentRightPx };
    // Drawn on more than one line: the last character starts at or below
    // the first one's foot.
    const last = line.contentEnd > line.contentStart ? view.coordsAtPos(line.contentEnd, -1) : first;
    // Word 2010 compatibility (and earlier): a tab whose stop lies past the
    // paragraph's right edge still goes to it, and the text after it stays
    // on that line, running past the margin (Word 16.86, corpus R36-D15 in
    // compatibility mode 12: a left stop at 9500 twips in a 9026-twip
    // column puts the rest of the paragraph on one line). Laid out as one
    // line, and the paragraph does not wrap.
    let overMargin = false;
    let oneLine: number[] | null = null;
    if (overMarginLine && lineOff) {
      oneLine = wordTabAdvances({
        segments,
        stops: line.stops,
        startPx,
        defaultIntervalTwips,
        positional: line.positional,
        line: column,
        stopsEndAtRightEdge: !overMarginLine,
        stopsReachColumn: reachColumn,
      });
      const rightEdge = columnPx - line.indentRightPx;
      let at = startPx + segments[0].widthPx;
      for (const [index, advance] of oneLine.entries()) {
        at += advance;
        if (tabRunsPastRightEdge(at, rightEdge)) overMargin = true;
        at += segments[index + 1].widthPx;
      }
    }
    // The middle of the last character's box below the first one's foot.
    // Its top alone is not enough: with Word's line metrics the lines can
    // stand closer than the font's own box is tall (Calibri 11 pt: an 18 px
    // box every 15 px at this zoom), so a second line's box starts above the
    // first one's foot and a wrapped paragraph read as one line (corpus
    // R49-D14 TA12f: the tab never went to the next line).
    const wraps = !overMargin && (last.top + last.bottom) / 2 >= first.bottom - 1;
    if (wraps) lineWrapped = true;
    const advances = wraps
      ? null
      : (overMargin ? oneLine : null) ??
        wordTabAdvances({
          segments,
          stops: line.stops,
          startPx,
          defaultIntervalTwips,
          positional: line.positional,
          line: column,
          stopsEndAtRightEdge: !overMarginLine,
          stopsReachColumn: reachColumn,
        });
    if (overMargin) {
      lineKeys.push("over-margin");
      lineDecorations.push(
        // An attribute, not an inline style: the paragraph's style attribute
        // is rewritten by the page's own line metrics after this is drawn.
        { node: true, from: 0, to: line.contentEnd + 1 - line.blockPos, attrs: { "data-tab-over-margin": "true" } },
      );
    }
    let pen = startPx + segments[0].widthPx;
    // The first tab whose next stop lies past the right edge (Word 2010):
    // from it on the line runs on, kept whole by the page.
    let overFrom: number | null = null;
    let overTo = line.contentEnd;
    // Where the kept line starts, and each tab as laid out (decorated once
    // the kept line is known: a tab before the one past the edge on that
    // line is kept too).
    const keptLines: [number, number][] = [];
    const laidTabs: { tab: number; pen: number; advance: number; leader: ReturnType<typeof wordTabLeader> }[] = [];
    let movedTo: number | null = null;
    for (const [index, tab] of line.tabs.entries()) {
      // A tab after the Shift+Enter that ended the kept line stands on a
      // line of its own again.
      if (overFrom !== null && tab >= overTo) overFrom = null;
      // On a wrapped paragraph the pen is where this tab stands now, on its
      // own line: where the text before it ends. The tab's own box is not
      // that place: a tab the browser drew too wide (its uniform width, or
      // a width from a pass before) stands at the start of the next line,
      // and a pen read there took it to the line's first stop again -- the
      // tab after a right stop's text went back to that stop, repeated its
      // leader and pushed the rest onto a second line for good (WUA 171).
      // (A tab right after the one before, nothing between them, stands
      // where that one ends: read off the page, its place moved with where
      // the browser had drawn it -- at the end of the first line or at the
      // start of the next, by the widths the pass before gave -- and the two
      // widths it went to in turn each put it at the other place (R282-D25's
      // second tab, 47.5 px and 96 px).)
      const followsTab = !tabsUnjustifiedOff() && index > 0 && segments[index]!.widthPx === 0 &&
        tab !== line.contentStart && !lineEndsBefore(view.state.doc, tab);
      if (wraps && overFrom === null && !followsTab) {
        const startsLine =
          tab === line.contentStart || lineEndsBefore(view.state.doc, tab);
        pen = (view.coordsAtPos(tab, startsLine ? 1 : -1).left - origin) / scale;
      }
      let advance = advances
        ? (advances[index] ?? 0)
        : wordTabAdvanceAt({
            penPx: pen,
            next: segments[index + 1],
            stops: line.stops,
            defaultIntervalTwips,
            positional: line.positional[index],
            line: column,
            stopsEndAtRightEdge: !overMarginLine,
            stopsReachColumn: reachColumn,
          });
      if (overFrom === null && !line.positional[index] && ((overMarginLine && !lineOff) || reachColumn)) {
        const stop = wordTabStopAfter(line.stops, pen);
        const stopPx = stop ? stop.pos / 15 : 0;
        // Past the edge by more than a twip: a stop set AT the margin is no
        // stop past it (the column reads in 1/64 px).
        const pastEdge = stop !== null && stopPx > columnPx - line.indentRightPx + 1 / 15;
        // The tab's line runs to the next Shift+Enter or the paragraph's end.
        let to = line.contentEnd;
        let last = line.segments.length - 1;
        for (let next = index + 1; next < line.segments.length; next += 1) {
          const natural = next < line.tabs.length ? line.tabs[next] : line.contentEnd;
          if (line.segments[next][1] < natural) {
            to = line.segments[next][1];
            last = next;
            break;
          }
        }
        let keep = pastEdge && overMarginLine;
        if (pastEdge && !overMarginLine && stopPx <= columnPx + 1 / 15) {
          // Word 2013 and later: kept whole only when its text ends inside
          // the column (tabind15; past it Word wraps at the column's edge).
          let end = pen + advance + segments[index + 1].widthPx;
          for (let next = index + 1; next < last; next += 1) {
            end += wordTabAdvanceAt({
              penPx: end,
              next: segments[next + 1],
              stops: line.stops,
              defaultIntervalTwips,
              positional: line.positional[next],
              line: column,
              stopsEndAtRightEdge: true,
              stopsReachColumn: true,
            }) + segments[next + 1].widthPx;
          }
          keep = end <= columnPx + TAB_STOP_REACH_PX;
        }
        if (keep) {
          overFrom = index;
          // The tab's line: from where the line it stands on starts (the
          // browser would break that line short of the stop: "Kc01 Alpha<Tab>"
          // went down as "Kc01" / "Alpha<Tab>...", tables/nd10 b4) to the
          // next Shift+Enter or the paragraph's end. The text before the tab
          // is laid out as Word lays it: where its line starts is read off
          // the page.
          let from = tab;
          if (tab > line.contentStart) {
            from = tab - 1;
            const ref = view.coordsAtPos(tab, -1);
            const sameLine = (box: { top: number; bottom: number }) =>
              Math.min(box.bottom, ref.bottom) - Math.max(box.top, ref.top) >
              0.5 * Math.min(box.bottom - box.top, ref.bottom - ref.top);
            for (let at = tab - 1; at > line.contentStart; at -= 1) {
              if (lineEndsBefore(view.state.doc, at)) break;
              if (!sameLine(view.coordsAtPos(at - 1, 1))) break;
              from = at - 1;
            }
          }
          overTo = to;
          keptLines.push([from, to]);
          lineKeys.push(`over:${index}:${from - line.blockPos}:${to - line.blockPos}`);
          // The editor's overflow-wrap lets Chromium break between two spans
          // that do not wrap (the character before the tab, the tab): on this
          // paragraph a word is never broken for overflowing, as Word's are
          // not past such a tab (tables/nd10, a Chromium probe: only with
          // overflow-wrap and word-break normal do the spans hold).
          lineDecorations.push({
            node: true,
            from: 0,
            to: line.contentEnd + 1 - line.blockPos,
            attrs: {
              "data-tab-over-margin-line": to === line.contentEnd ? "end" : "true",
              // The kept line is the whole paragraph: no break anywhere in it.
              // A list number before it is an inline-block, and Chromium
              // breaks after an inline-block by the paragraph's white-space,
              // not the kept span's: the number stood on a line of its own
              // and the kept line went under it (corpus R470-D37 page 1,
              // "2." / "Date and hour:<Tab>__ __", one line in Windows Word;
              // look25/probes/markerbreak: only a paragraph that does not
              // wrap, or an inline number, holds them).
              ...(from === line.contentStart && to === line.contentEnd && !tabKeptWholeParagraphOff()
                ? { "data-tab-over-margin-whole": "true" }
                : {}),
            },
          });
          lineDecorations.push({
            node: false,
            from: from - line.blockPos,
            to: to - line.blockPos,
            attrs: { "data-tab-over-margin": "true" },
          });
        }
      }
      if (
        wraps &&
        // Word 2010 and earlier carry such a tab to the next line all the
        // same: only a stop past the edge keeps its line whole (the branch
        // above). R417-D03 page 40, mode 14, a cell 80 pt wide: "2nd most
        // worst shock<Tab>2" on a stop at 79.2 pt is three lines in Word --
        // the words, the tab alone at the stop, the "2" -- and was two here,
        // the whole row 32 pt short (`oldModeTabCarryOff`).
        (!overMarginLine || !oldModeTabCarryOff(view.dom.ownerDocument.defaultView)) &&
        overFrom === null &&
        !line.positional[index] &&
        pen > line.indentLeftPx + TAB_STOP_REACH_PX &&
        (pen + advance > columnPx - line.indentRightPx + TAB_STOP_REACH_PX ||
          pen + advance + firstWordWidth(line.segments[index + 1]) >
            columnPx - line.indentRightPx + TAB_STOP_REACH_PX)
      ) {
        // No stop is left on this line, or the word after the tab does not
        // fit after its stop: Word starts the next line with the tab, which
        // reaches that line's first stop (Word 16.86, corpus R49-D14 TA12d:
        // a picture after a stop 0.6 pt short of the margin takes the tab to
        // the next line). A box that wide does not fit what is left here, so
        // it is drawn there.
        movedTo = line.indentLeftPx;
        advance = wordTabAdvanceAt({
          penPx: line.indentLeftPx,
          next: segments[index + 1],
          stops: line.stops,
          defaultIntervalTwips,
          positional: null,
          line: column,
          stopsEndAtRightEdge: !overMarginLine,
          stopsReachColumn: reachColumn,
        });
      }
      const leader = wordTabLeader(line.stops, pen, line.positional[index]);
      // Keyed by the tab's place in its line, not its document position: an
      // edit above shifts every later position while the tabs themselves
      // are laid out exactly as before, and the mapped decorations already
      // hold them, so nothing is dispatched.
      lineKeys.push(`${index}:${advance}:${leader}`);
      laidTabs.push({ tab, pen, advance, leader });
      // A tab Word starts the next line with ends from that line's start.
      pen = (movedTo !== null && !tabsUnjustifiedOff() ? movedTo : pen) + advance + segments[index + 1].widthPx;
      movedTo = null;
    }
    for (const { tab, pen: at, advance, leader } of laidTabs) {
      if (keptLines.some(([from, to]) => tab >= from && tab < to)) {
        // On the kept line a tab is no box: Chromium breaks before an
        // inline-block whatever the spans around it say, and the tab took a
        // line of its own (build t10, tables/nd10/te-cell-14-new-b1.json; a
        // word joiner before it did not hold it either). Drawn as the tab
        // character it is, with its tab size the distance from the block's
        // text edge to where it ends, it goes there and nothing breaks
        // before it. A tab that advances less than half a character goes on
        // to the next multiple of its size (Chromium, scratch probe: 1 px
        // short of a 19 px size went 19 px further): such a one, and one
        // that ends where it starts (a right stop whose text is wider than
        // the room), is drawn with no size and its advance as padding.
        const size = at + advance - textEdgePx;
        const small = advance < 8 || size < 8;
        lineDecorations.push({
          node: false,
          from: tab - line.blockPos,
          to: tab + 1 - line.blockPos,
          attrs: {
            class: "sheet-band-story-tab",
            style: small ? `white-space:pre;tab-size:0;padding-right:${Math.max(0, advance)}px` : `white-space:pre;tab-size:${size}px`,
            ...(leader !== "none" ? { "data-leader": leader } : {}),
          },
        });
        continue;
      }
      lineDecorations.push({
        node: false,
        from: tab - line.blockPos,
        to: tab + 1 - line.blockPos,
        attrs: {
          class: "sheet-band-story-tab",
          // The tab character fills its box (its one stop is the box's far
          // edge), so the caret after it is drawn after the gap. Zero wide,
          // the caret stood before the gap it had just typed.
          style: `display:inline-block;width:${advance}px;tab-size:${advance}px;white-space:pre`,
          ...(leader !== "none" ? { "data-leader": leader } : {}),
        },
      });
    }
    return done();
  };
  // A line on a sheet outside the ledger's measure horizon (not laid out
  // yet, or left unread as it stands) that has no kept measurement keeps the
  // tabs it has and is measured when the horizon reaches it: measuring it
  // laid that far page out.
  const horizon = sheetsWithinMeasureHorizon(root);
  const installed = horizon ? bandTabLayoutKey.getState(view.state)?.set ?? DecorationSet.empty : null;
  let deferred = false;
  let firstRead = false;
  const restore = !tabRestoreOff();
  const lines = tabbedLines(view.state.doc);
  // Taken off before anything paints (the rule is removed below, in this task).
  let unjustified: HTMLStyleElement | null | undefined;
  try {
    for (const [lineIndex, line] of lines.entries()) {
      const place = memo ? tabLinePlace(view, root, line) : null;
      let result = place ? keptLineTabs(memo!, place, memoAt) : undefined;
      if (!result && horizon && place && !horizon.has(place.sheet)) {
        deferred = true;
        keys.push(`${lineIndex}:deferred`);
        const kept = installed!.find(line.contentStart, line.contentEnd);
        const remembered = kept.length || !restore ? undefined : rememberedTabsByContent(root, lineContentKey(view.state.doc, line), memoAt);
        if (remembered) {
          for (const item of remembered.decorations) decorations.push(tabDecoration(line.blockPos, item));
        } else decorations.push(...kept);
        continue;
      }
      if (!result) {
        const block = place?.block ?? view.state.doc.nodeAt(line.blockPos);
        // A paragraph read for the first time (a page the horizon just reached):
        // its settling has passes of its own to come.
        if (rounds && block && !rounds.has(block)) firstRead = true;
        if (unjustified === undefined) unjustified = unjustifyTabbedBlocks(view, lines);
        result = settledRound(rounds, block, measureLine(line));
        if (place) keepLineTabs(memo!, place, memoAt, result);
        if (restore) rememberTabsByContent(root, lineContentKey(view.state.doc, line), memoAt, result);
      }
      for (const key of result.keys) keys.push(`${lineIndex}:${key}`);
      for (const item of result.decorations) decorations.push(tabDecoration(line.blockPos, item));
      if (result.wrapped) wrapped = true;
    }
  } finally {
    unjustified?.remove();
  }
  return { set: DecorationSet.create(view.state.doc, decorations), key: keys.join("|"), wrapped, deferred, firstRead };
}

export const BandTabLayout = Extension.create({
  name: "bandTabLayout",
  addProseMirrorPlugins() {
    return [
      new Plugin<BandTabState>({
        key: bandTabLayoutKey,
        state: {
          init: () => ({ set: DecorationSet.empty, edits: 0, count: 0, lost: false }),
          apply(tr, state) {
            const next = tr.getMeta(bandTabLayoutKey) as DecorationSet | undefined;
            // The pagination moving blocks between sheets (its own steps) is no
            // edit: it changes no paragraph's text, stops or width.
            const edits = tr.docChanged && tr.getMeta(PAGINATION_MOVE_META) !== true ? state.edits + 1 : state.edits;
            if (next) return { set: next, edits, count: next.find().length, lost: false };
            if (!tr.docChanged) return state;
            let set = state.set.map(tr.mapping, tr.doc);
            // A change that replaced decorated text took its decorations with
            // it (a table piece the pagination built anew): put back where the
            // same paragraph stands, and measured again.
            let count = state.count > 0 ? set.find().length : 0;
            if (count < state.count && !tabRestoreOff()) {
              const restored = restoreDroppedTabs(state.set, tr, set);
              if (restored) {
                set = restored;
                count = set.find().length;
              }
            }
            return { set, edits, count, lost: state.lost || count < state.count };
          },
        },
        props: {
          decorations: (state) => bandTabLayoutKey.getState(state)?.set,
        },
        view(editorView) {
          const win = editorView.dom.ownerDocument.defaultView;
          let frame: number | null = null;
          let destroyed = false;
          let installed = "";
          // Passes since the last change from outside (an edit, a resize, a
          // font): a wrapped paragraph's tabs settle over a few.
          let settlePasses = 0;
          let ownDispatchAt = Number.NEGATIVE_INFINITY;
          const now = () => win?.performance?.now() ?? 0;
          // After a face arrives the tabs are measured from no sizing at all:
          // the next sizes depend on where the text stood, and measured over
          // the sizes taken in the fallback a tabbed line could settle where
          // a document opened with its faces in never does (a CJK index's
          
          // with nothing painted between.
          let fromClearSlate = false;
          // What each paragraph's tabs measured since the inputs last changed.
          let rounds: TabRounds = new WeakMap();
          // The last measure left lines outside the horizon for later.
          let lastDeferred = false;
          // Until the tabs measured after a face arrived have settled, Print
          // waits (layoutPending, printReadiness).
          const run = () => {
            try {
              measureNow();
            } finally {
              if (frame === null) clearLayoutPending(editorView.dom, "band-tabs");
            }
          };
          const measureNow = () => {
            frame = null;
            if (destroyed) return;
            if (fromClearSlate) {
              fromClearSlate = false;
              if (bandTabLayoutKey.getState(editorView.state)?.set !== DecorationSet.empty) {
                editorView.dispatch(
                  editorView.state.tr.setMeta(bandTabLayoutKey, DecorationSet.empty).setMeta("addToHistory", false),
                );
              }
              installed = "";
            }
            let next: ReturnType<typeof measure> = null;
            try {
              next = measure(editorView, rounds);
            } catch {
              // A DOM that cannot be measured (not laid out) keeps the
              // uniform tab width; nothing else depends on this.
              return;
            }
            lastDeferred = Boolean(next?.deferred);
            // Decorations a change of the document took away are put back
            // even where the measurement reads as it did.
            const restoring = bandTabLayoutKey.getState(editorView.state)?.lost === true && !tabRestoreOff();
            if (!next || (next.key === installed && !restoring)) return;
            installed = next.key;
            ownDispatchAt = now();
            editorView.dispatch(
              editorView.state.tr.setMeta(bandTabLayoutKey, next.set).setMeta("addToHistory", false),
            );
            // The pages' editor: its ledger reads the sheets the tabs changed.
            const root = editorView.dom;
            if (!tabLedgerNudgeOff() && root instanceof HTMLElement && win && sheetsOf(root).length > 0) {
              root.dispatchEvent(new win.CustomEvent("mrn-page-rebalance", { bubbles: true, detail: { reason: BAND_TAB_LAYOUT_REASON } }));
            }
            // A tab just sized on a wrapped paragraph moved what follows it:
            // read the tabs again where they stand now.
            if (next.wrapped) {
              if (next.firstRead) settlePasses = 0;
              settleAgain();
            }
          };
          const settleAgain = () => {
            if (settlePasses >= MAX_SETTLE_PASSES) return;
            settlePasses += 1;
            settle();
          };
          const settle = () => {
            if (frame !== null || !win) return;
            frame = win.requestAnimationFrame(run);
          };
          const schedule = () => {
            settlePasses = 0;
            settle();
          };
          schedule();
          // Print lays the tabs out now, from scratch, with the faces that
          // are in, before it copies the pages (layoutPending.settleLayoutNow):
          // the settling below, run to its end in one go.
          const unregisterSettler = registerLayoutSettler(editorView.dom, "band-tabs", () => {
            if (destroyed) return;
            if (frame !== null) win?.cancelAnimationFrame(frame);
            frame = null;
            if (editorView.dom instanceof HTMLElement) tabMeasureMemos.get(editorView.dom)?.clear();
            fromClearSlate = true;
            settlePasses = 0;
            for (let pass = 0; pass <= MAX_SETTLE_PASSES; pass += 1) {
              measureNow();
              // A wrapped line asked for another look: taken now, not next frame.
              if (frame === null) break;
              win?.cancelAnimationFrame(frame);
              frame = null;
            }
            clearLayoutPending(editorView.dom, "band-tabs");
          });
          const fonts = editorView.dom.ownerDocument.fonts;
          // A face arriving changes text widths with no DOM change: every
          // kept measurement is forgotten.
          const fontsChanged = () => {
            if (editorView.dom instanceof HTMLElement) tabMeasureMemos.get(editorView.dom)?.clear();
            rounds = new WeakMap();
            fromClearSlate = true;
            markLayoutPending(editorView.dom, "band-tabs");
            schedule();
          };
          // Read once for every caller of this task, a microtask later: a
          // read of `fonts.ready` lays the page out in Blink (font-face-news).
          const cancelFontsReady = afterFontsReady(editorView.dom.ownerDocument, fontsChanged);
          // A face that arrives later (an Office font asset loaded for this
          // run) changes the text's width without resizing the story. A
          // subset of some characters changes only the sheets drawing them
          // (the page ledger's rule): a Chinese book fetches subsets all the
          // while it opens, and each measured every tabbed line again (1.2 s
          // of a 271-page book's reopening).
          const facesLoaded = (event: Event) => {
            const root = editorView.dom;
            const memo = root instanceof HTMLElement ? tabMeasureMemos.get(root) : undefined;
            const faces = newFontFacesOf(event) ??
              (event as Event & { fontfaces?: ReadonlyArray<{ family?: string; unicodeRange?: string }> }).fontfaces;
            const used = faces && faces.length > 0 && root instanceof HTMLElement ? facesUsedBy(faces, editorFontFamilies(root)) : null;
            if (used && used.length === 0) return;
            const ranges = loadedFaceRanges(used ?? faces);
            if (!memo || !ranges) { fontsChanged(); return; }
            let touched = false;
            for (const sheet of sheetsOf(root)) {
              if (!textDrawsCodePointIn(sheet.textContent ?? "", ranges)) continue;
              memo.forget(sheet);
              touched = true;
            }
            if (!touched) return;
            markLayoutPending(root, "band-tabs");
            schedule();
          };
          fonts?.addEventListener?.("loadingdone", facesLoaded);
          // The horizon reached sheets a measure left for later.
          const horizonWidened = () => {
            if (lastDeferred) schedule();
          };
          editorView.dom.addEventListener(MEASURE_HORIZON_EVENT, horizonWidened);
          // The story's size changing right after the tabs were sized is that
          // sizing (a line more, a line less): part of settling, not a new
          // layout to start over on, or a paragraph whose tabs never hold
          // would be measured for ever.
          // Only a new width is a new layout: the story growing or shrinking by
          // the sheets the pages took or gave back is the pages settling.
          let observedWidth: number | null = null;
          const resized = (entries: readonly ResizeObserverEntry[]) => {
            const width = entries[entries.length - 1]?.contentRect.width ?? null;
            const widthChanged = width !== null && observedWidth !== null && Math.abs(width - observedWidth) > 0.5;
            if (width !== null) observedWidth = width;
            if (widthChanged) rounds = new WeakMap();
            if (widthChanged && now() - ownDispatchAt >= 250) schedule();
            else settleAgain();
          };
          const observer = win && "ResizeObserver" in win ? new win.ResizeObserver(resized) : null;
          observer?.observe(editorView.dom);
          return {
            update(view, previous) {
              if (view.state.doc.eq(previous.doc)) return;
              // A block moved to another sheet is read again, within the passes
              // its settling has left: a page break moved by these very tabs
              // started the count over, and tabs whose widths make their line
              // wrap, and unwrapped come out wider again, were measured for as
              // long as the pages kept moving with them (R350-D07: interlinear
              // glosses one line, then two, then one, every few frames; 157 to
              // 160 sheets, never settled, a tab burning a core).
              const state = bandTabLayoutKey.getState(view.state);
              if (state?.edits !== bandTabLayoutKey.getState(previous)?.edits) schedule();
              // Decorations the change took away: measured again now, however
              // many passes the settling has had.
              else if (state?.lost && !bandTabLayoutKey.getState(previous)?.lost && !tabRestoreOff()) schedule();
              else settleAgain();
            },
            destroy() {
              destroyed = true;
              if (frame !== null) win?.cancelAnimationFrame(frame);
              clearLayoutPending(editorView.dom, "band-tabs");
              unregisterSettler();
              observer?.disconnect();
              cancelFontsReady();
              fonts?.removeEventListener?.("loadingdone", facesLoaded);
              editorView.dom.removeEventListener(MEASURE_HORIZON_EVENT, horizonWidened);
            },
          };
        },
      }),
    ];
  },
});
