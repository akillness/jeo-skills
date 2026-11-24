/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { loadedFontsKey } from "../loadedFontsKey";
import { trailingAutoLeadingCreditPx } from "./pageEdgeLeading";
import { paginationLayoutRect, paginationLayoutScale } from "./paginationGeometry";
import { COLUMN_REGIONS_ATTR, unequalColumnCount } from "./unequalColumnProjection";
import { measurementRange } from "./measurementRange";
import { clearPageEdgeMarks } from "./paginationProjectionKeys";

/**
 * The head fragment a text cut produces, rendered before it exists.
 *
 * A page-bottom row is kept when the fragment ending with it fits: its line
 * boxes, less the Auto leading its last line may hang below the page edge.
 * The next pass judges the materialised fragment by exactly that rule. The
 * row planner locates rows by their painted glyph boxes, which do not give
 * the line box edge: a fixed line height does not center the glyph box
 * (Chromium floors the leading above the text to whole pixels, WebKit
 * truncates the line height), and on a row mixing runs the line box is set
 * by the tallest inline box, not by the glyph the search probed. A row the
 * planner kept by its glyph could make a head that failed the fragment
 * rule; the ledger then moved the text back and alternated between the two
 * layouts until it stalled.
 *
 * So the planner confirms its row with the fragment itself: a copy of the
 * block, cut at the row start, laid out off-screen in the block's own
 * context (the editor root and every ancestor between, cloned without
 * their other children), measured like the ledger measures fragments.
 *
 * Cost. A node added anywhere under the editor makes the browser recheck
 * the editor's `:has()`-styled ancestors, which cost several milliseconds
 * per copy. The copies therefore live in one contained host at the end of
 * the document body, under shallow clones of the editor's own ancestors
 * (their classes and styles give the copy the same inherited context; their
 * transforms and animations are dropped, which only scale the picture). The
 * host is attached for the current task, with one context shell per
 * ancestor chain. A measured head is kept until something it depends on
 * changes: a mutation inside the block, its ancestors' attributes, the
 * editor's width or styles, the loaded fonts, or an external layout change
 * the ledger reports (`invalidateRenderedTextHeads`).
 */

export interface RenderedTextHead {
  /** Border-box height of the head, in layout px. */
  heightPx: number;
  /** Auto leading its last line may hang below the page edge. */
  creditPx: number;
}

export interface RenderedTextHeadProbe {
  /** The head that keeps the block's text before `offset` characters, or
   * null when that head cannot be laid out. */
  measure(offset: number, endOfPrevious?: boolean): RenderedTextHead | null;
  dispose(): void;
}

interface TextSegment {
  node: Text;
  start: number;
}

interface ContextShell {
  /** Where the copy goes: the clone of the block's parent. */
  slot: HTMLElement;
  /** Siblings that keep the copy an interior child of a sheet. */
  leading: HTMLElement | null;
  trailing: HTMLElement | null;
}

interface TaskHost {
  element: HTMLElement;
  /** Clone of the editor root's parent, inside the cloned ancestor chain. */
  context: HTMLElement;
  rootWidth: string;
  shells: Map<HTMLElement, ContextShell>;
}

/** Layout-neutral styles for the cloned ancestors: they lend the copy their
 * inherited context and matched rules, never their size or position. */
const NEUTRAL_ANCESTOR_STYLES: Readonly<Record<string, string>> = {
  display: "block",
  position: "static",
  width: "max-content",
  height: "auto",
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  margin: "0",
  overflow: "visible",
  transform: "none",
  translate: "none",
  rotate: "none",
  scale: "none",
  animation: "none",
  transition: "none",
  contain: "none",
  "content-visibility": "visible",
};

function neutralize(element: HTMLElement, styles: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(styles)) {
    element.style.setProperty(name, value, "important");
  }
}

/** A clone of an application element keeps what styles it and nothing that
 * identifies it to scripts, tests or assistive technology. */
function anonymize(element: HTMLElement): void {
  for (const name of element.getAttributeNames()) {
    if (name === "id" || name === "data-testid" || name === "role" || name === "tabindex" ||
        name === "draggable" || name.startsWith("aria-")) {
      element.removeAttribute(name);
    }
  }
}

interface CachedHeads {
  context: string;
  byOffset: Map<number, RenderedTextHead | null>;
}

/** The tails measured of one block's fragments as they stand (renderedTextTailHeightPx). */
interface CachedTails {
  context: string;
  parts: readonly HTMLElement[];
  cutPart: number;
  byOffset: Map<number, number | null>;
  /** A fragment of it changed since: never asked again. */
  dead: boolean;
}

interface RootState {
  task: TaskHost | null;
  generation: number;
  observer: MutationObserver | null;
  heads: WeakMap<HTMLElement, CachedHeads>;
  /** Under each fragment the tail reads from (the cut one and every one after). */
  tails: WeakMap<HTMLElement, CachedTails>;
}

const stateByRoot = new WeakMap<HTMLElement, RootState>();

function forgetMutated(state: RootState, root: HTMLElement, records: readonly MutationRecord[]): void {
  for (const record of records) {
    // A projection re-stamping the value already there (a layout pass
    // writing a frame's mode and style every transaction) changed nothing
    // the head was measured from.
    if (
      record.type === "attributes" &&
      record.target instanceof Element &&
      record.target.getAttribute(record.attributeName ?? "") === record.oldValue
    ) {
      continue;
    }
    for (let node: Node | null = record.target; node && node !== root; node = node.parentNode) {
      if (state.heads.has(node as HTMLElement)) state.heads.delete(node as HTMLElement);
      const tails = state.tails.get(node as HTMLElement);
      if (tails) {
        tails.dead = true;
        state.tails.delete(node as HTMLElement);
      }
    }
  }
}

function rootState(root: HTMLElement): RootState {
  let state = stateByRoot.get(root);
  if (!state) {
    const created: RootState = { task: null, generation: 0, observer: null, heads: new WeakMap(), tails: new WeakMap() };
    if (typeof MutationObserver === "function") {
      created.observer = new MutationObserver((records) => forgetMutated(created, root, records));
      created.observer.observe(root, { attributes: true, attributeOldValue: true, characterData: true, childList: true, subtree: true });
    }
    stateByRoot.set(root, created);
    state = created;
  }
  if (state.observer) forgetMutated(state, root, state.observer.takeRecords());
  return state;
}

/**
 * Run a sheet-level probe in the contained task host: `fn` receives a
 * layout-neutral clone of the editor root — at the root's width, under the
 * cloned ancestor chain that gives it the root's inherited context — into
 * which it clones the sheets it measures. Nothing under the editor is
 * touched, so the document stays laid out and every read that follows in
 * the pass (fragment heights, the edge-margin probe, the selection
 * ProseMirror writes back) pays no full-document layout. A probe appended
 * beside the editor and removed again dirtied the editor's ancestors each
 * time; on a 157-page import each of the four or five reads that followed
 * then laid the whole document out (about 200 ms apiece, a keystroke's
 * worth of stall). Null when the root has no document body to host it.
 */
export function withRootMeasurementSlot<T>(root: HTMLElement, fn: (slot: HTMLElement) => T): T | null {
  const state = rootState(root);
  const task = taskHost(root, state);
  if (!task) return null;
  const shell = root.cloneNode(false) as HTMLElement;
  anonymize(shell);
  neutralize(shell, { ...NEUTRAL_ANCESTOR_STYLES, width: task.rootWidth, "min-width": task.rootWidth });
  task.context.append(shell);
  try {
    return fn(shell);
  } finally {
    shell.remove();
  }
}

/**
 * Forget every rendered head of the editor at `root`: a layout input outside
 * the document changed (surface geometry, view mode, fonts).
 */
export function invalidateRenderedTextHeads(root: HTMLElement): void {
  const state = stateByRoot.get(root);
  if (state) state.generation += 1;
}

/** The contained host for `root` in the current task. */
function taskHost(root: HTMLElement, state: RootState): TaskHost | null {
  const doc = root.ownerDocument;
  const body = doc.body;
  if (!body || !root.parentElement) return null;
  if (state.task?.element.parentElement === body) return state.task;
  const element = doc.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
  element.style.cssText = [
    "position:absolute",
    "left:-100000px",
    "top:0",
    "width:0",
    "height:0",
    "margin:0",
    "padding:0",
    "border:0",
    "overflow:visible",
    "visibility:hidden",
    "pointer-events:none",
    // A relayout boundary: what happens inside never lays out the editor.
    "contain:strict",
  ].map((declaration) => `${declaration}!important`).join(";");
  const lineage: HTMLElement[] = [];
  for (let ancestor: HTMLElement | null = root.parentElement; ancestor && ancestor !== body; ancestor = ancestor.parentElement) {
    lineage.unshift(ancestor);
  }
  let context: HTMLElement = element;
  for (const ancestor of lineage) {
    const copy = ancestor.cloneNode(false) as HTMLElement;
    anonymize(copy);
    neutralize(copy, NEUTRAL_ANCESTOR_STYLES);
    context.append(copy);
    context = copy;
  }
  const rootWidth = getComputedStyle(root).width;
  const task: TaskHost = {
    element,
    context,
    rootWidth: rootWidth.endsWith("px") && Number.parseFloat(rootWidth) > 0 ? rootWidth : `${root.clientWidth}px`,
    shells: new Map(),
  };
  body.append(element);
  state.task = task;
  queueMicrotask(() => {
    element.remove();
    if (state.task === task) state.task = null;
  });
  return task;
}

function contextShell(
  root: HTMLElement,
  task: TaskHost,
  ancestors: readonly HTMLElement[],
): ContextShell {
  const key = ancestors.at(-1) ?? root;
  const existing = task.shells.get(key);
  if (existing) return existing;
  const doc = root.ownerDocument;
  const shell = root.cloneNode(false) as HTMLElement;
  anonymize(shell);
  neutralize(shell, { ...NEUTRAL_ANCESTOR_STYLES, width: task.rootWidth, "min-width": task.rootWidth });
  let slot: HTMLElement = shell;
  for (const ancestor of ancestors) {
    const copy = ancestor.cloneNode(false) as HTMLElement;
    anonymize(copy);
    slot.append(copy);
    slot = copy;
  }
  // Keep the block an interior child of its sheet, as the edge rules see
  // most blocks (the same shape the page-edge margin probe uses).
  const interior = slot === shell || slot.matches("article[data-page-sheet]");
  const context: ContextShell = {
    slot,
    leading: interior ? doc.createElement("span") : null,
    trailing: interior ? doc.createElement("span") : null,
  };
  task.context.append(shell);
  task.shells.set(key, context);
  return context;
}

function attributeSignature(element: HTMLElement): string[] {
  return element.getAttributeNames()
    .filter((name) => name !== "id")
    .map((name) => `${name}=${element.getAttribute(name)}`);
}

/**
 * A copy of `block` that ends where its text node `source` (at `path` in it)
 * is cut at `offset`, as a page cut's head ends: what follows dropped, the
 * wrappers it leaves empty and trailing source page breaks too.
 *
 * Only the head is copied (its ancestors split as the cut leaves them): a
 * whole long paragraph copied for each candidate head, its tail then
 * deleted, cost a copy of every run per head measured (R461-D71, code
 * listings of 3,500 runs). `whole` copies it whole, as before
 * (`window.__docsRenderedHeadWholeCloneOn`).
 */
export function copyTextHead(block: HTMLElement, source: Text, offset: number, path: readonly number[], whole = false): HTMLElement | null {
  const doc = block.ownerDocument;
  const range = measurementRange(doc, "renderedTextHead");
  const at = Math.max(0, Math.min(source.length, offset));
  let copy: HTMLElement;
  if (whole) {
    copy = block.cloneNode(true) as HTMLElement;
  } else {
    range.setStart(block, 0);
    range.setEnd(source, at);
    copy = block.cloneNode(false) as HTMLElement;
    copy.append(range.cloneContents());
  }
  copy.removeAttribute("id");
  clearPageEdgeMarks(copy);
  copy.setAttribute("data-page-split-continues", "true");
  const text = nodeAtPath(copy, path);
  if (text?.nodeType !== Node.TEXT_NODE) return null;
  range.setStart(text, Math.min((text as Text).length, at));
  range.setEnd(copy, copy.childNodes.length);
  range.deleteContents();
  pruneEmptyTail(copy, text);
  dropTrailingSourcePageBreaks(copy);
  return copy;
}

function wholeCloneOn(doc: Document): boolean {
  return (doc.defaultView as (Window & { __docsRenderedHeadWholeCloneOn?: boolean }) | null)?.__docsRenderedHeadWholeCloneOn === true;
}

export function childPath(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current) as number);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeAtPath(root: Node, path: readonly number[]): Node | null {
  let current: Node | null = root;
  for (const index of path) {
    current = current?.childNodes[index] ?? null;
  }
  return current;
}

/** Drop what a cut at a run's first character leaves behind: inline
 * wrappers with nothing in them. ProseMirror renders no such wrapper. */
function pruneEmptyTail(block: HTMLElement, from: Node): void {
  let current: Node | null = from;
  while (current && current !== block) {
    const parent: Node | null = current.parentNode;
    const empty = current.nodeType === Node.TEXT_NODE
      ? (current as Text).length === 0
      : current.nodeType === Node.ELEMENT_NODE &&
        current.childNodes.length === 0 &&
        (current as Element).matches("span, a, strong, em, b, i, u, s, sub, sup, mark, code, small");
    if (!empty) return;
    parent?.removeChild(current);
    current = parent;
  }
}

/** The cut leaves a source page break that starts the cut row with the
 * tail (`planTextHeadOnce`): so does the copy, with the separator image
 * ProseMirror paints before that inline atom. */
function dropTrailingSourcePageBreaks(block: HTMLElement): void {
  for (;;) {
    let last: Node | null = block.lastChild;
    while (last && last.nodeType === Node.ELEMENT_NODE && last.lastChild &&
      !(last as Element).matches('[data-type="source-page-break"]')) {
      last = last.lastChild;
    }
    if (!last || last === block) return;
    const element = last.nodeType === Node.ELEMENT_NODE ? (last as Element) : null;
    const removable = element
      ? element.matches('[data-type="source-page-break"], img.ProseMirror-separator')
      : last.nodeType === Node.TEXT_NODE && (last as Text).length === 0;
    if (!removable) return;
    const parent = last.parentNode;
    parent?.removeChild(last);
    if (parent && parent !== block) pruneEmptyTail(block, parent);
  }
}

/** Two drawn boxes stand on different rows: they share less than half the
 * shorter one's height. (Two sizes on one row share a baseline and a raised
 * or lowered one still stands mostly inside its row's text; rows set tighter
 * than their glyph boxes overlap by the little the boxes run over.) */
export function boxesOnDifferentRows(
  a: { readonly top: number; readonly bottom: number },
  b: { readonly top: number; readonly bottom: number },
): boolean {
  const shorter = Math.min(a.bottom - a.top, b.bottom - b.top);
  if (!(shorter > 0)) return false;
  const shared = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return shared < shorter / 2;
}

/**
 * An element inside a paragraph that draws nothing: the editor's own widgets
 * (a formatting mark, a filler) and Word's rendered page break kept from the
 * source (`data-type="source-page-break"`, zero size). An imported paragraph
 * cut where Word cut it ends with that marker, and read as "something drawn"
 * it sent every seam of an imported document the old way.
 */
function drawsNothing(element: HTMLElement): boolean {
  if (element.getAttribute("contenteditable") !== "false" || (element.textContent ?? "").trim()) return false;
  return element.classList.contains("ProseMirror-widget") || element.getAttribute("data-type") === "source-page-break";
}

/** A footnote or endnote reference: a small in-line mark that goes with the
 * word before it. Rows are read from the text round it. */
function isNoteReference(element: HTMLElement): boolean {
  const type = element.getAttribute("data-type");
  return type === "footnote-ref" || type === "endnote-ref";
}

/** What ends the head's part of a joined copy, or opens the tail's. */
type SeamLeaf = { kind: "text"; node: Text; at: number } | { kind: "break" } | { kind: "box" };

/** The last (`end` "last") or first drawn thing among `nodes`: a character
 * that is no space, a line break, or a box (a picture, an in-line object). */
function seamLeaf(nodes: readonly Node[], end: "first" | "last"): SeamLeaf | null {
  const ordered = end === "last" ? [...nodes].reverse() : nodes;
  for (const node of ordered) {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data;
      const at = end === "last" ? data.search(/\S\s*$/) : data.search(/\S/);
      if (at >= 0) return { kind: "text", node: node as Text, at };
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as HTMLElement;
    if (element.localName === "br") {
      if (element.classList.contains("ProseMirror-trailingBreak")) continue;
      return { kind: "break" };
    }
    if (element.localName === "img") {
      if (element.classList.contains("ProseMirror-separator")) continue;
      return { kind: "box" };
    }
    if (element.getAttribute("contenteditable") === "false") {
      // What draws nothing takes no room, and a note reference goes with
      // the word before it; anything else is an object.
      if (drawsNothing(element) || isNoteReference(element)) continue;
      return { kind: "box" };
    }
    const inner = seamLeaf(Array.from(element.childNodes), end);
    if (inner) return inner;
  }
  return null;
}

/**
 * Whether a paragraph cut across a page still breaks its rows where it is
 * cut: `head` and `tail` are its two pieces, and their text laid out as one
 * block (off-screen, in the head's own context) starts a row with the tail's
 * first character. False: the joined text sets the two sides of the cut on
 * one row (the head's last row has room for what opens the tail, or a word
 * was joined across the cut), so the cut has to be made again. Null when it
 * cannot be told (no editor root, columns, a box or nothing at the cut,
 * right-to-left or vertical text): the caller decides as it did without.
 *
 * Nothing under the editor is touched (see the cost note above).
 */
export function joinedTextBreaksAtSeam(head: HTMLElement, tail: HTMLElement, engineRows?: JoinedEngineRows): boolean | null {
  return withJoinedCopy(head, tail, ({ doc, copy, headNodes, tailNodes }) => {
    const before = seamLeaf(headNodes, "last");
    const after = seamLeaf(tailNodes, "first");
    if (!before || !after) return null;
    // A line break ends its row whatever follows it.
    if (before.kind === "break" || after.kind === "break") return true;
    if (before.kind !== "text" || after.kind !== "text") return null;
    // Where the text engine breaks the paragraph's rows, its rows are the
    // answer: the browser's own breaker differs from them by a hair on a
    // line drawn corrected, and a seam read by it was cut again for a word
    // the engine then sent back.
    const rows = engineRows?.(copy);
    if (rows === undefined && engineRows) return null;
    if (rows) return rows.some((row) => row.node === after.node && row.offset === after.at);
    const last = characterBox(doc, before.node, before.at);
    const first = characterBox(doc, after.node, after.at);
    if (!last || !first) return null;
    return boxesOnDifferentRows(last, first);
  });
}

/** The drawn box of one character (its own line box: blockSplitting's note
 * on why a block's rects are not read whole). */
function characterBox(doc: Document, node: Text, at: number): DOMRect | null {
  const range = measurementRange(doc, "joinedTextSeam");
  range.setStart(node, at);
  range.setEnd(node, at + 1);
  return Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0) ?? null;
}

/** The text engine's rows of a joined copy, when it lays the paragraph out
 * (ledgerEngineLines.EngineJoinedRows, bound to the two pieces): null when it
 * does not, undefined when it cannot say. */
export type JoinedEngineRows = (copy: HTMLElement) => ReadonlyArray<{ readonly node: Text; readonly offset: number }> | null | undefined;

interface JoinedCopy {
  doc: Document;
  /** The copy itself: the head's block holding both pieces' content. */
  copy: HTMLElement;
  /** The copy's children that came from the head, and from the tail. */
  headNodes: Node[];
  tailNodes: Node[];
}

/**
 * Run `read` on a copy of `head` with the tail's content appended, laid out
 * off-screen in the head's own context (as a rendered head is: the cost note
 * above), and take the copy away again. Null when there is nowhere to lay it
 * out as the page does (no editor root, columns, right-to-left or vertical
 * text).
 */
/** A page whose blocks stand narrower than its sheet: stacked column regions,
 * unequal columns, or the sheet's own CSS columns. */
function pageHasColumns(sheet: HTMLElement): boolean {
  if (sheet.hasAttribute(COLUMN_REGIONS_ATTR)) return true;
  const unequal = unequalColumnCount(sheet);
  if (unequal !== null && unequal > 1) return true;
  const columns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
  return Number.isFinite(columns) && columns > 1;
}

/** `window.__docsJoinedColumnsOff = true`: a seam on a page of columns is not
 * read (the copy gives up there, as before), for an A/B of one build. */
function joinedColumnsOff(doc: Document): boolean {
  return (doc.defaultView as (Window & { __docsJoinedColumnsOff?: boolean }) | null)?.__docsJoinedColumnsOff === true;
}

/** A right-to-left paragraph is read in the copy like any other: its rows
 * are found by their tops and its characters in document order, neither of
 * which its direction changes (the copy is the head's own clone, its `dir`
 * and style with it). Given up there before, every key typed near the seam
 * of a right-to-left paragraph cut the head's last row away and put it back
 * a pass later (corpus R491-D06: Arabic, justified, 12 of 32 keys).
 * `window.__docsJoinedRtlOff = true` gives up as before. */
function joinedRtlOff(doc: Document): boolean {
  return (doc.defaultView as (Window & { __docsJoinedRtlOff?: boolean }) | null)?.__docsJoinedRtlOff === true;
}

function withJoinedCopy<T>(head: HTMLElement, tail: HTMLElement, read: (copy: JoinedCopy) => T | null): T | null {
  const doc = head.ownerDocument;
  const root = head.closest<HTMLElement>(".ProseMirror");
  if (!doc || !root?.isConnected || !root.parentElement || root === head || !root.contains(tail)) return null;
  const style = getComputedStyle(head);
  if ((style.direction === "rtl" && joinedRtlOff(doc)) || /^(vertical|sideways)/.test(style.writingMode)) return null;
  const sheet = head.closest<HTMLElement>("article[data-page-sheet]");
  // A column's width is not the page's, where the shell lays the copy out:
  // on a page of columns the copy is laid out at the width its two pieces
  // stand at, in one column. Given up there before, every edit near a seam
  // on a two-column page was read "cannot tell", and the seam was cut away
  // and put back on each key (corpus R482-D01, its page 1). Pieces standing
  // at two widths say nothing of one row: those still give up.
  let columnWidth: string | null = null;
  if (sheet && pageHasColumns(sheet)) {
    if (joinedColumnsOff(doc)) return null;
    const headWidth = Number.parseFloat(style.width);
    const tailWidth = Number.parseFloat(getComputedStyle(tail).width);
    if (!(headWidth > 0) || !(Math.abs(headWidth - tailWidth) <= 0.5)) return null;
    columnWidth = style.width;
  }
  const ancestors: HTMLElement[] = [];
  for (let element = head.parentElement; element !== root; element = element.parentElement) {
    if (!element) return null;
    ancestors.unshift(element);
  }
  const task = taskHost(root, rootState(root));
  if (!task) return null;
  const copy = head.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  clearPageEdgeMarks(copy);
  const headNodes = Array.from(copy.childNodes);
  const tailNodes = Array.from(tail.childNodes, (child) => child.cloneNode(true));
  copy.append(...tailNodes);
  const context = contextShell(root, task, ancestors);
  if (columnWidth !== null) {
    // One column at the pieces' width: the clone keeps its own box sizing,
    // and no ancestor's columns or the projector's placement move it.
    for (const [name, value] of [["width", columnWidth], ["min-width", "0"], ["max-width", "none"], ["position", "static"],
      ["left", "auto"], ["top", "auto"], ["transform", "none"]] as const) copy.style.setProperty(name, value, "important");
    for (let element: HTMLElement | null = context.slot; element && element !== task.context; element = element.parentElement) {
      element.style.setProperty("column-count", "auto", "important");
      element.style.setProperty("column-width", "auto", "important");
    }
  }
  context.slot.replaceChildren(
    ...[context.leading, copy, context.trailing].filter((node): node is HTMLElement => node !== null),
  );
  try {
    return read({ doc, copy, headNodes, tailNodes });
  } finally {
    context.slot.replaceChildren();
  }
}

/**
 * The height of the tail a text cut would leave, laid out before it exists.
 *
 * `parts` are the block's fragments as they stand, in order; the cut falls
 * at (`node`, `offset`) inside `parts[cutPart]`. The tail is what follows it
 * there and every fragment after, as one continuation block: laid out
 * off-screen in the last fragment's context and measured as the ledger
 * measures a fragment.
 *
 * The plan charged the next page `total - head`: the fragments' own heights,
 * less the head's. Wrong whenever joining re-flows the rows: a head that
 * ran a row over its page by one typed character ends in a stub row, which
 * the tail's first row takes up, and the arithmetic charged the stub a row
 * of its own. The page after was planned a row short, every page after that
 * moved with it, and the next pass put them all back (one key in a row
 * above a seam: six passes over fifteen pages).
 *
 * Null where it cannot be laid out so (see withJoinedCopy's reasons).
 */
export function renderedTextTailHeightPx(
  parts: readonly HTMLElement[],
  cutPart: number,
  node: Node,
  offset: number,
  /** Where the cut stands in its fragment (its document position less the
   * fragment's): with it, a tail measured before of the very same fragments
   * in the same context is not laid out again (renderedTailMemoOff). */
  cutKey?: number,
): number | null {
  if (cutKey === undefined || renderedTailMemoOff(parts[cutPart]?.ownerDocument ?? null)) {
    return layOutTextTail(parts, cutPart, node, offset);
  }
  const root = parts[parts.length - 1]?.closest<HTMLElement>(".ProseMirror");
  const cut = parts[cutPart];
  if (!root || !cut) return layOutTextTail(parts, cutPart, node, offset);
  const state = rootState(root);
  const task = taskHost(root, state);
  const fonts = loadedFontsKey(root.ownerDocument);
  if (!task || fonts === null) return layOutTextTail(parts, cutPart, node, offset);
  const ancestors: string[][] = [];
  for (let element = parts[parts.length - 1]!.parentElement; element && element !== root; element = element.parentElement) {
    ancestors.push([element.tagName, ...attributeSignature(element)]);
  }
  const context = JSON.stringify([state.generation, fonts, task.rootWidth, root.className, root.style.cssText, ancestors]);
  let cached = state.tails.get(cut);
  if (cached && (cached.dead || cached.context !== context || cached.cutPart !== cutPart || cached.parts.length !== parts.length ||
      cached.parts.some((part, index) => part !== parts[index]))) cached = undefined;
  if (cached?.byOffset.has(cutKey)) return cached.byOffset.get(cutKey)!;
  const height = layOutTextTail(parts, cutPart, node, offset);
  if (!cached) {
    cached = { context, parts: parts.slice(), cutPart, byOffset: new Map(), dead: false };
    for (const part of parts.slice(cutPart)) state.tails.set(part, cached);
  }
  cached.byOffset.set(cutKey, height);
  return height;
}











function renderedTailMemoOff(doc: Document | null): boolean {
  return (doc?.defaultView as (Window & { __docsRenderedTailMemoOff?: boolean }) | null)?.__docsRenderedTailMemoOff === true;
}

function layOutTextTail(parts: readonly HTMLElement[], cutPart: number, node: Node, offset: number): number | null {
  const cut = parts[cutPart];
  const last = parts[parts.length - 1];
  if (!cut || !last) return null;
  const doc = cut.ownerDocument;
  const root = last.closest<HTMLElement>(".ProseMirror");
  if (!doc || !root?.isConnected || !root.parentElement || root === last || !cut.contains(node)) return null;
  for (const part of [cut, last]) {
    const style = getComputedStyle(part);
    if ((style.direction === "rtl" && joinedRtlOff(doc)) || /^(vertical|sideways)/.test(style.writingMode)) return null;
    const sheet = part.closest<HTMLElement>("article[data-page-sheet]");
    if (!sheet) continue;
    if (sheet.hasAttribute(COLUMN_REGIONS_ATTR)) return null;
    const unequal = unequalColumnCount(sheet);
    if (unequal !== null && unequal > 1) return null;
    const columns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
    if (Number.isFinite(columns) && columns > 1) return null;
  }
  const ancestors: HTMLElement[] = [];
  for (let element = last.parentElement; element !== root; element = element.parentElement) {
    if (!element) return null;
    ancestors.unshift(element);
  }
  const task = taskHost(root, rootState(root));
  if (!task) return null;
  const copy = last.cloneNode(false) as HTMLElement;
  copy.removeAttribute("id");
  clearPageEdgeMarks(copy);
  // A tail opens its page as a continuation, whatever fragment lent the shell.
  copy.setAttribute("data-page-split-continuation", "true");
  const range = measurementRange(doc, "renderedTextTail");
  try {
    range.setStart(node, offset);
    range.setEnd(cut, cut.childNodes.length);
  } catch {
    return null;
  }
  copy.append(range.cloneContents());
  for (const part of parts.slice(cutPart + 1)) copy.append(...Array.from(part.childNodes, (child) => child.cloneNode(true)));
  const context = contextShell(root, task, ancestors);
  context.slot.replaceChildren(
    ...[context.leading, copy, context.trailing].filter((element): element is HTMLElement => element !== null),
  );
  try {
    const heightPx = paginationLayoutRect(copy, paginationLayoutScale(context.slot)).height;
    return Number.isFinite(heightPx) && heightPx > 0 ? heightPx : null;
  } finally {
    context.slot.replaceChildren();
  }
}

/** The text nodes under `nodes`, in order; null when anything but text is
 * drawn there (a picture, a line break, an in-line object, a widget with
 * text): the rows are then not read character by character. */
function plainTextNodes(nodes: readonly Node[]): Text[] | null {
  const texts: Text[] = [];
  const visit = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      texts.push(node as Text);
      return true;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return true;
    const element = node as HTMLElement;
    if (element.localName === "br") return element.classList.contains("ProseMirror-trailingBreak");
    if (element.localName === "img") return element.classList.contains("ProseMirror-separator");
    // (A note reference stays in the copy and takes its room there; its
    // own digits are not text a row is read from.)
    if (element.getAttribute("contenteditable") === "false") return drawsNothing(element) || isNoteReference(element);
    for (const child of Array.from(element.childNodes)) if (!visit(child)) return false;
    return true;
  };
  for (const node of nodes) if (!visit(node)) return null;
  return texts;
}

/** Why the last joinedTextRebreak read nothing (a development trace; see
 * seamRebreakCut). */
export let joinedTextRebreakWhy: string | null = null;
function rebreakWhy(why: string): null {
  joinedTextRebreakWhy = why;
  return null;
}

/** Where a stale page seam of a paragraph belongs (joinedTextRebreak). */
export interface JoinedTextRebreak {
  /** The piece the new cut falls in, and where: a text node of that piece
   * (the page's own, not the copy's) and the offset of the first character
   * that goes to the next page. */
  side: "head" | "tail";
  node: Text;
  offset: number;
  /** The rows the joined text has from the cut on, counted as far as asked. */
  rowsAfter: number;
}

/**
 * Where a paragraph cut across a page is cut once its two pieces are laid
 * out as one: the page keeps the rows the head has now, and the cut is the
 * start of the joined text's next row. In the tail when the head's last row
 * has room for what opens it (the row takes it); in the head when a word
 * joined across the cut no longer fits that row (it goes on whole).
 *
 * Read in one go, off-screen: the cut made before the head's last row and
 * taken back a pass later (how a stale seam was cut again) drew the row on
 * the next page for that pass, and every page after it moved and came back.
 *
 * `rows` is how many rows after the cut are counted (the paragraph's widow
 * floor). Null when it cannot be read so (see withJoinedCopy; anything but
 * plain text in the two pieces), when the head's own last row cannot be
 * found, or when the joined text ends on the head's rows (nothing to cut).
 */
export function joinedTextRebreak(head: HTMLElement, tail: HTMLElement, rows: number, engineRows?: JoinedEngineRows): JoinedTextRebreak | null {
  joinedTextRebreakWhy = null;
  const headTexts = plainTextNodes(Array.from(head.childNodes));
  const tailTexts = plainTextNodes(Array.from(tail.childNodes));
  if (!headTexts || !tailTexts) return rebreakWhy("plain-text");
  const doc = head.ownerDocument;
  // The head's own last row, on the page: where it starts.
  const ownLast = lastCharacter(headTexts);
  if (!ownLast) return rebreakWhy("no-last-char");
  const ownLastBox = characterBox(doc, ownLast.node, ownLast.at);
  if (!ownLastBox) return rebreakWhy("no-last-box");
  const headLength = headTexts.reduce((sum, text) => sum + text.length, 0);
  const rowStart = firstCharacter(doc, headTexts, 0, headLength, (box) => !boxesOnDifferentRows(box, ownLastBox));
  if (rowStart === null) return rebreakWhy("no-row-start");
  return withJoinedCopy(head, tail, ({ copy, headNodes, tailNodes }) => {
    const copyHead = plainTextNodes(headNodes);
    const copyTail = plainTextNodes(tailNodes);
    if (!copyHead || !copyTail || copyHead.length !== headTexts.length || copyTail.length !== tailTexts.length) return rebreakWhy("copy-pieces");
    const all = [...copyHead, ...copyTail];
    const total = all.reduce((sum, text) => sum + text.length, 0);
    // A paragraph whose text ends in a line break has one row more than its
    // characters show: the last, holding only the paragraph mark (Word's
    // widow floor counts it; no row start or character box says it is
    // there). Uncounted, a tail of such rows (R488-D02: "questions." then a
    // break, an empty row and the mark's row on the next page) read as one
    // row under the floor of two, the seam was cut the old way, before the
    // head's last row, and the next pass took the row back: a twitch at every
    // key typed in that row. `window.__docsSeamRebreakMarkRowOff` counts
    // characters only, as before.
    const markRow = endsInLineBreak(all) && !seamRebreakMarkRowOff(head) ? 1 : 0;
    const ownText = (index: number, at: number): JoinedTextRebreak | null => {
      const place = characterAt(all, index);
      if (!place) return rebreakWhy("char-at");
      // A row a note reference starts is cut before the reference, which no
      // text offset says: not read so.
      if (place.at === 0 && referenceStartsRow(copy.ownerDocument, place.node)) return rebreakWhy("reference-row");
      const nodeIndex = all.indexOf(place.node);
      const side = nodeIndex < copyHead.length ? "head" : "tail";
      const own = side === "head" ? headTexts[nodeIndex] : tailTexts[nodeIndex - copyHead.length];
      if (!own || own.length !== place.node.length) return rebreakWhy("own-node");
      return { side, node: own, offset: place.at, rowsAfter: at };
    };
    // The text engine's rows, where it breaks this paragraph (see
    // joinedTextBreaksAtSeam): the row after the one the head's last row
    // starts, and the rows from there on.
    const engine = engineRows?.(copy);
    if (engine === undefined && engineRows) return rebreakWhy("engine-undefined");
    if (engine) {
      const starts: number[] = [];
      for (const row of engine) {
        const nodeIndex = all.indexOf(row.node);
        if (nodeIndex < 0) return rebreakWhy("engine-node");
        starts.push(all.slice(0, nodeIndex).reduce((sum, text) => sum + text.length, 0) + row.offset);
      }
      // A hard line break always starts a row after it, the empty one
      // between two breaks too, which the engine reports no start for (no
      // character opens it): R488-D02's paragraph ends "questions." <w:br/>
      // <w:br/> <w:tab/> " ", rows starting at 383, (406) and 407 -- read as
      // one row after the seam, under the floor of two the page's own cut
      // counts (41 px, two rows), so the seam was cut a row higher and the
      // next pass cut it back at every key typed in the row above it.
      // (The break closing the text is the mark row's, counted below.)
      // `window.__docsSeamRebreakBreakRowsOff` reads the engine's starts only.
      if (!seamRebreakBreakRowsOff(head)) {
        let offset = 0;
        for (const text of all) {
          for (let at = text.data.indexOf("\n"); at >= 0; at = text.data.indexOf("\n", at + 1)) {
            const next = offset + at + 1;
            if (next < total && !starts.includes(next)) starts.push(next);
          }
          offset += text.length;
        }
      }
      starts.sort((a, b) => a - b);
      // The head's rows above its last are the engine's too, or it is not read so.
      const own = starts.indexOf(rowStart);
      if (own < 0 || own + 1 >= starts.length) return rebreakWhy(`engine-own-row ${rowStart} in ${starts.join(",")} of ${total}`);
      return ownText(starts[own + 1], Math.min(rows, starts.length - (own + 1) + markRow));
    }
    const start = characterAt(all, rowStart);
    const startBox = start ? nextBox(doc, all, rowStart, total) : null;
    if (!startBox) return rebreakWhy("browser-start-box");
    // The first character past the row the head's last row starts.
    const cut = firstCharacter(doc, all, rowStart, total, (box) => boxesOnDifferentRows(startBox.box, box));
    if (cut === null) return rebreakWhy("browser-cut");
    // Rows from the cut on, as far as the floor asks.
    let counted = 1;
    let from = cut;
    while (counted < rows) {
      const rowBox = nextBox(doc, all, from, total);
      if (!rowBox) break;
      const next = firstCharacter(doc, all, rowBox.index, total, (box) => boxesOnDifferentRows(rowBox.box, box));
      if (next === null) break;
      counted += 1;
      from = next;
    }
    return ownText(cut, Math.min(rows, counted + markRow));
  });
}

/** The joined text's last character is a line break (see markRow above). */
function endsInLineBreak(texts: readonly Text[]): boolean {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    if (texts[index].data.length) return texts[index].data.endsWith("\n");
  }
  return false;
}

function seamRebreakBreakRowsOff(element: HTMLElement): boolean {
  return (element.ownerDocument.defaultView as (Window & { __docsSeamRebreakBreakRowsOff?: boolean }) | null)?.__docsSeamRebreakBreakRowsOff === true;
}

function seamRebreakMarkRowOff(element: HTMLElement): boolean {
  return (element.ownerDocument.defaultView as (Window & { __docsSeamRebreakMarkRowOff?: boolean }) | null)?.__docsSeamRebreakMarkRowOff === true;
}

/** Whether a note reference right before `text` stands on the row `text`'s
 * first drawn character is on (the reference wrapped to that row). */
function referenceStartsRow(doc: Document, text: Text): boolean {
  let before: Node | null = text;
  // The node before in document order, out of the wrappers `text` opens.
  while (before && !before.previousSibling) before = before.parentNode;
  before = before?.previousSibling ?? null;
  while (before && before.nodeType === Node.ELEMENT_NODE && drawsNothing(before as HTMLElement)) before = before.previousSibling;
  if (!before || before.nodeType !== Node.ELEMENT_NODE || !isNoteReference(before as HTMLElement)) return false;
  const first = text.data.search(/\S/);
  const box = first >= 0 ? characterBox(doc, text, first) : null;
  const reference = (before as HTMLElement).getBoundingClientRect();
  if (!box || !(reference.height > 0)) return false;
  return !boxesOnDifferentRows(reference, box);
}

/** The last character that is no space, with its node. */
function lastCharacter(texts: readonly Text[]): { node: Text; at: number } | null {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const at = texts[index].data.search(/\S\s*$/);
    if (at >= 0) return { node: texts[index], at };
  }
  return null;
}

/** The node and offset of character `index` of `texts` read as one string. */
function characterAt(texts: readonly Text[], index: number): { node: Text; at: number } | null {
  let rest = index;
  for (const text of texts) {
    if (rest < text.length) return { node: text, at: rest };
    rest -= text.length;
  }
  return null;
}

/** The box of the first drawn character at or after `index` (a space the
 * row end swallowed has none), with its index. */
function nextBox(doc: Document, texts: readonly Text[], index: number, end: number): { box: DOMRect; index: number } | null {
  for (let at = index; at < end && at < index + 64; at += 1) {
    const place = characterAt(texts, at);
    if (!place) return null;
    const box = characterBox(doc, place.node, place.at);
    if (box) return { box, index: at };
  }
  return null;
}

/**
 * The first drawn character in `[from, end)` whose box `past` holds for,
 * where `past` is false for a run of characters and then true to the end
 * (rows come one after another): by bisection. Null when it holds for none.
 */
function firstCharacter(doc: Document, texts: readonly Text[], from: number, end: number, past: (box: DOMRect) => boolean): number | null {
  let lo = from;
  let hi = end;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const drawn = nextBox(doc, texts, mid, end);
    // Nothing drawn from here on: the answer, if any, is before.
    if (!drawn) hi = mid;
    else if (past(drawn.box)) hi = mid;
    else lo = drawn.index + 1;
  }
  if (lo >= end) return null;
  const drawn = nextBox(doc, texts, lo, end);
  return drawn && past(drawn.box) ? drawn.index : null;
}

/**
 * A probe for `block`'s heads, or null when the block's fragments are not
 * measured as plain border boxes (no editor root, multi-column sheets).
 */
export function createRenderedTextHeadProbe(
  block: HTMLElement,
  segments: readonly TextSegment[],
): RenderedTextHeadProbe | null {
  const doc = block.ownerDocument;
  const root = block.closest<HTMLElement>(".ProseMirror");
  if (!doc || !root?.isConnected || !root.parentElement || root === block) return null;
  const sheet = block.closest<HTMLElement>("article[data-page-sheet]");
  if (sheet) {
    // A page of stacked column regions (continuous sections) places each
    // block at its own track's width; the probe's shell lays the head out at
    // the page's width, where 40 lines of a 192px column fit in 14, so a
    // column cut kept all but one line per pass (b-sect2.docx S5).
    if (sheet.hasAttribute(COLUMN_REGIONS_ATTR)) return null;
    const unequal = unequalColumnCount(sheet);
    if (unequal !== null && unequal > 1) return null;
    const columns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
    if (Number.isFinite(columns) && columns > 1) return null;
  }
  const ancestors: HTMLElement[] = [];
  for (let element = block.parentElement; element !== root; element = element.parentElement) {
    if (!element) return null;
    ancestors.unshift(element);
  }
  if (segments.length === 0) return null;
  // Where each text node stands, read when a head is cut in it. Read for
  // every node up front, each an index among its parent's children, it cost
  // the square of a paragraph's runs per probe (R461-D71's code listings,
  // 3,500 runs). A node no longer in the block makes no head.
  const paths = new Map<number, number[] | null>();
  const pathOf = (index: number): number[] | null => {
    if (!paths.has(index)) paths.set(index, childPath(block, segments[index].node));
    return paths.get(index) ?? null;
  };
  if (pathOf(0) === null || pathOf(segments.length - 1) === null) return null;

  let placed: ContextShell | null = null;
  let contextKey: string | null | undefined;

  const segmentIndexAt = (offset: number): number => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].start <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  // `endOfPrevious`: the head ends right after the character before
  // `offset`, in that character's own text node, so what stands between it
  // and the next text (an in-line picture's row) goes with the tail.
  const layOut = (task: TaskHost, offset: number, endOfPrevious: boolean): RenderedTextHead | null => {
    const index = segmentIndexAt(endOfPrevious ? offset - 1 : offset);
    const path = pathOf(index);
    if (!path) return null;
    const source = segments[index].node;
    const copy = copyTextHead(block, source, offset - segments[index].start, path, wholeCloneOn(doc));
    if (!copy) return null;
    const context = contextShell(root, task, ancestors);
    context.slot.replaceChildren(
      ...[context.leading, copy, context.trailing].filter((node): node is HTMLElement => node !== null),
    );
    placed = context;
    // The copy sits in the measurement slot, so it is drawn at the slot's
    // scale: read it from the slot, which a layout pass reads once
    // (withPaginationScaleReuse), not from each new copy (a forced layout
    // and a computed style per candidate cut, a quarter of a typed key's
    // pagination in a long document).
    const scale = paginationLayoutScale(context.slot);
    const heightPx = paginationLayoutRect(copy, scale).height;
    if (!Number.isFinite(heightPx) || !(heightPx > 0)) return null;
    return { heightPx, creditPx: trailingAutoLeadingCreditPx(copy) };
  };

  return {
    measure(offset, endOfPrevious = false) {
      if (endOfPrevious && offset <= 0) return null;
      const key = endOfPrevious ? -offset - 0.5 : offset;
      const state = rootState(root);
      const task = taskHost(root, state);
      if (!task) return null;
      if (contextKey === undefined) {
        const fonts = loadedFontsKey(doc);
        contextKey = fonts === null
          ? null
          : JSON.stringify([
              state.generation,
              fonts,
              task.rootWidth,
              root.className,
              root.style.cssText,
              ancestors.map((ancestor) => [ancestor.tagName, attributeSignature(ancestor)]),
            ]);
      }
      let cached = contextKey === null ? undefined : state.heads.get(block);
      if (cached && cached.context !== contextKey) cached = undefined;
      if (cached?.byOffset.has(key)) return cached.byOffset.get(key)!;
      const head = layOut(task, offset, endOfPrevious);
      if (contextKey !== null) {
        if (!cached) {
          cached = { context: contextKey, byOffset: new Map() };
          state.heads.set(block, cached);
        }
        cached.byOffset.set(key, head);
      }
      return head;
    },
    dispose() {
      const context = placed as ContextShell | null;
      context?.slot.replaceChildren();
      placed = null;
    },
  };
}
