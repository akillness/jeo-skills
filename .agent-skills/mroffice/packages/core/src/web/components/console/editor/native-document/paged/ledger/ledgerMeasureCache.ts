/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Page-by-page reuse of the ledger's measurements.
 *
 * A ledger pass reads every fragment of every sheet: its border-box height,
 * repeated table header clones, Word's page-bottom Auto-leading credit, its
 * authored margins, and (for the blocks at a sheet's edges) the off-screen
 * margin probe. A keystroke changes one sheet; every other sheet measures
 * exactly as it did the pass before, so its numbers are kept here and only
 * the sheets that changed are read again.
 *
 * What changed is observed, not guessed: a MutationObserver on the editor
 * root marks the sheet every mutation lands in and drops the edge probe of
 * the top-level block it lands in.
 *
 *   - A sheet with any mutation inside it (text, nodes, a decoration, an
 *     attribute or style that changed value) is measured again WHOLE. Blocks
 *     of one sheet affect each other's layout (floats, newspaper and unequal
 *     columns, sibling and page-edge rules); blocks of different sheets never
 *     do.
 *   - A sheet-edge margin is probed again only when its own block changed:
 *     the probe already measures the block outside any page context.
 *   - A picture or a video finishing loading resizes its block without a
 *     mutation, so media load events mark their sheet too.
 *   - Anything that lays out every sheet (fonts, the editor width or zoom,
 *     the page geometry variables, the root's own attributes or style)
 *     clears the cache: the ledger already treats those as a full re-layout.
 *
 * Entries are keyed by the live DOM element and checked against the node and
 * the sheet it rendered in, so a block ProseMirror re-created or moved to
 * another sheet is simply measured as new.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { isDocumentLayoutStatusAttribute } from "../../documentLayoutStatus";
import type { LedgerCut } from "./ledgerTypes";
import { noteFacesAfterMeasure } from "./ledgerFaceScan";
import type { ColumnLineBreak } from "../unequalColumnProjection";

/** Everything the ledger reads off one fragment. */
export interface LedgerFragmentMeasure {
  heightPx: number;
  repeatedHeaderPx: number;
  creditPx: number;
  hidden: boolean;
  outOfFlow: boolean;
  /** Authored margins of the fragment (edge probe or computed style,
   * collapsed through its first/last child chain). */
  marginBeforePx: number;
  marginAfterPx: number;
  /** In a stacked column region: charged by its region, not by its own
   * box (see `ColumnRegionCharge`); `regionTied` keeps it with the next. */
  regionCharged?: boolean;
  regionTied?: boolean;
  /** In a stacked column region: the region's column count and the block's
   * line pitch, for the page planner's own column layout of the section. */
  regionColumns?: number;
  linePitchPx?: number;
  /** In a stacked column region, a list balanced by its lines: the lines
   * either side of a cut in it (`ColumnRegionCharge.minSplitLines`). */
  regionMinSplitLines?: number;
  /** In a stacked column region: its height in each of the region's columns
   * (unequal columns wrap the same text into different heights). */
  regionHeightsPx?: readonly number[];
  /** In a balanced column region, a list of uneven lines: where it can be
   * cut (`ColumnRegionCharge.breaksPx`), px from this fragment's top. */
  regionBreaksPx?: readonly ColumnLineBreak[];
}

export interface LedgerEdgeMargins {
  before: number;
  after: number;
}

interface FragmentEntry {
  node: PmNode;
  sheet: HTMLElement;
  measure: LedgerFragmentMeasure;
  /** The element's drawn height when it was measured (its border box, as
   * the browser lays it out): what `drawnHeightChanged` holds it against. */
  drawnPx: number;
}

/** A drawn block whose height moved by less than this did not change. */
const DRAWN_HEIGHT_TOLERANCE_PX = 0.5;

interface EdgeEntry {
  node: PmNode;
  /** The block's own probed margins and those of the elements whose margins
   * collapse through its edges (all measured by the same probe). */
  entries: Array<[HTMLElement, LedgerEdgeMargins]>;
}

interface OracleEntry {
  parts: ReadonlyArray<readonly [HTMLElement, PmNode]>;
  answers: Map<string, LedgerCut | null>;
}

/** Split answers kept per block: a block's request varies with what stands
 * above it on its page, so only the latest few are worth keeping. */
const ORACLE_ANSWERS_PER_BLOCK = 8;

const MEDIA_EVENTS = ["load", "error", "loadedmetadata"] as const;

/**
 * Stamps the page-span projection (pageSpanExtension) writes on a sheet after
 * every transaction: its physical parity, the parity filler before it, its
 * page-number labels. They feed the page bands and the mirrored-indent rule,
 * not the body's lines, so they leave a sheet's measurements standing. When
 * a sheet overran its foot for a frame, every later sheet's parity flipped
 * and the whole document was measured again in the frame of the key.
 */
const SHEET_STAMP_ATTRIBUTES = new Set([
  "data-page-physical-parity",
  "data-page-parity-before",
  "data-page-number-first-label",
  "data-page-number-last-label",
  "data-page-number-visible",
  // The paper ending a block that cannot be cut moves nothing inside it.
  "data-page-oversize",
  // A dormant sheet (sheetDormancy): its content leaves the render tree and
  // comes back as it was; a read of it wakes it first.
  "data-page-dormant",
]);
/**
 * Attributes that only paint (the caret's colour, the native selection's
 * highlight) on whatever element carries them: they move no block, so a
 * paragraph or sheet that took one is not measured again.
 */
const PAINT_ONLY_ATTRIBUTES = new Set([
  "data-document-parked-caret",
  "data-native-selection-hidden",
  "data-object-line-caret",
  "data-object-line-caret-composing",
]);
/** Mirrored indents swap a paragraph's margins with the page's parity. */
const MIRROR_INDENT_SELECTOR = '[data-mirror-indents="true"]';

/** The object whose own drawing `node` is in: the outermost non-editable
 * subtree of a sheet a node view renders (not the sheet's text), or null. */
/** A table's own structure: a read-only row (a repeated header, a row's
 * piece cut across pages) is laid out by its text, which the projections and
 * the pass already read; it is no drawing that arrives in its own time. Taken
 * for one, the line boxes the Auto line spacing projection set in a cut row's
 * cells after each pass restarted the ledger and lifted its cycle stop
 * (ec0ad3e4: 1,409 times in 90 s). A chart or picture in such a row is still
 * an object of its own. */
const TABLE_STRUCTURE = new Set(["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "COLGROUP", "COL"]);

function objectDrawingOf(node: Node, root: HTMLElement, known?: Map<Element, Element | null>): Element | null {
  const start = node instanceof Element ? node : node.parentElement;
  const path: Element[] = [];
  let element = start;
  // The outermost such ancestor: what stands above is known when any of the
  // path was walked for another record of this batch (thousands of them, when
  // a pass moves a table's rows, each walking to the root).
  let object: Element | null | undefined;
  while (element && element !== root) {
    const seen = known?.get(element);
    if (seen !== undefined) {
      object = seen;
      break;
    }
    path.push(element);
    element = element.parentElement;
  }
  if (object === undefined) {
    if (element !== root) return null;
    object = null;
  }
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const step = path[index];
    if (object === null && step.getAttribute("contenteditable") === "false" && !TABLE_STRUCTURE.has(step.tagName)) object = step;
    known?.set(step, object);
  }
  return object;
}

export class LedgerMeasureCache {
  private fragments = new WeakMap<HTMLElement, FragmentEntry>();
  private edges = new WeakMap<HTMLElement, EdgeEntry>();
  private oracle = new WeakMap<HTMLElement, OracleEntry>();
  private dirtySheets = new WeakSet<HTMLElement>();
  /** Sheets a pass measured whole (and nothing changed in since). */
  private settledSheets = new WeakSet<HTMLElement>();
  /** The look at the faces right after each sheet was last measured whole
   * (ledgerFaceScan). */
  private settledLooks = new WeakMap<HTMLElement, number>();
  /** Each drawn object's height when its drawing last changed (see record). */
  private objectHeights = new WeakMap<Element, number>();
  private readonly objectsPlaced = new Set<Element>();
  private objectsPlacedFrame = 0;
  /** The page node each sheet's measurement projections last ran for. */
  private projected = new WeakMap<HTMLElement, PmNode>();
  /** Sheets changed since their projections last ran. Unlike `dirtySheets`
   * (cleared once a pass has measured a sheet), only a projection clears
   * this: a change made after a sheet was projected in a pass (a table's
   * content-fit widths, applied after the column tracks) is measured by that
   * pass and still projected again by the next one. */
  private projectionStale = new WeakSet<HTMLElement>();
  /** The document attrs those projections ran under. */
  private projectedDocAttrs: unknown = null;
  /** Why a sheet is dirty (development trace): the mutation that marked it. */
  private dirtyWhy = new WeakMap<HTMLElement, string>();
  private observer: MutationObserver | null = null;
  private readonly onMedia: (event: Event) => void;

  constructor(
    private readonly root: HTMLElement,
    /** A resized media element: the layout changed without a transaction. */
    private readonly onMediaResize?: () => void,
    /** Sheets a pass had measured that changed since by something other
     * than a pass (a decoration a projection put back in its own frame, a
     * node view's text drawn late): `drawnHeightChanged` tells whether
     * the change moved a block. */
    private readonly onMeasuredSheetChanged?: (sheets: readonly HTMLElement[]) => void,
  ) {
    const Observer = root.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer((records) => this.record(records));
      this.observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
      });
    }
    this.onMedia = (event) => {
      if (!(event.target instanceof Element)) return;
      if (this.mark(event.target)) this.onMediaResize?.();
    };
    for (const type of MEDIA_EVENTS) root.addEventListener(type, this.onMedia, true);
  }

  /** Why the measurements were last forgotten (development trace). */
  lastClear: string | null = null;

  /** Forget every measurement: a layout input outside the sheets changed. */
  clear(reason = "unknown"): void {
    this.lastClear = reason;
    this.fragments = new WeakMap();
    this.edges = new WeakMap();
    this.oracle = new WeakMap();
    this.dirtySheets = new WeakSet();
    this.settledSheets = new WeakSet();
    this.dirtyWhy = new WeakMap();
    this.projected = new WeakMap();
    this.projectionStale = new WeakSet();
    this.projectedDocAttrs = null;
  }

  /** Why `fragment()` would miss for this fragment (development trace). */
  explainMiss(dom: HTMLElement, node: PmNode, sheet: HTMLElement): string {
    if (this.dirtySheets.has(sheet)) return `dirty:${this.dirtyWhy.get(sheet) ?? "?"}`;
    const entry = this.fragments.get(dom);
    if (!entry) return `no-entry${this.lastClear ? `:cleared:${this.lastClear}` : ""}`;
    if (entry.node !== node) return "node-changed";
    if (entry.sheet !== sheet) return "sheet-changed";
    return "hit";
  }

  /** Take the mutations still queued (the measurement projections of this
   * pass wrote attributes a moment ago) before any entry is trusted. */
  flush(): void {
    const pending = this.observer?.takeRecords();
    if (pending?.length) this.record(pending);
  }

  /** Take the mutations of the ledger's own pass (its dispatch, its
   * measuring): the sheets they changed are marked, but an object they
   * resized is the pass's own doing, not a drawing that arrived after it.
   * Read as one, a table row's read-only piece re-cut by every pass (1212 px,
   * then 1045.75) set the pass budget back and lifted the cycle stop each
   * time (ec0ad3e4: never settled). */
  flushOwn(): void {
    const pending = this.observer?.takeRecords();
    if (pending?.length) this.record(pending, true);
  }

  /** The kept measurement of a fragment, when its sheet is unchanged and the
   * element still renders `node` in `sheet`. */
  fragment(dom: HTMLElement, node: PmNode, sheet: HTMLElement): LedgerFragmentMeasure | null {
    if (this.dirtySheets.has(sheet)) return null;
    const entry = this.fragments.get(dom);
    return entry && entry.node === node && entry.sheet === sheet ? entry.measure : null;
  }

  storeFragment(dom: HTMLElement, node: PmNode, sheet: HTMLElement, measure: LedgerFragmentMeasure): void {
    this.fragments.set(dom, { node, sheet, measure, drawnPx: dom.getBoundingClientRect().height });
  }

  /**
   * Whether a block of `sheet` is now drawn taller or shorter than when a
   * pass measured it. Only the sheet's own blocks with a measurement of
   * this sheet count: a block a pass has not read yet is read by the pass
   * that comes for it anyway.
   */
  drawnHeightChanged(sheet: HTMLElement): boolean {
    for (const child of Array.from(sheet.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const entry = this.fragments.get(child);
      if (!entry || entry.sheet !== sheet) continue;
      if (Math.abs(child.getBoundingClientRect().height - entry.drawnPx) > DRAWN_HEIGHT_TOLERANCE_PX) return true;
    }
    return false;
  }

  /** The kept sheet-edge probe of a block (its own margins and its collapse
   * chains'), when nothing in the block changed since it was probed. */
  edgeProbe(dom: HTMLElement, node: PmNode): ReadonlyArray<[HTMLElement, LedgerEdgeMargins]> | null {
    const entry = this.edges.get(dom);
    return entry && entry.node === node ? entry.entries : null;
  }

  storeEdgeProbe(dom: HTMLElement, node: PmNode, entries: Array<[HTMLElement, LedgerEdgeMargins]>): void {
    this.edges.set(dom, { node, entries });
  }

  /** A split answer given before for this block's exact fragments and
   * request (`undefined` when there is none). The caller asks only while
   * every sheet the block stands in is unchanged: the answer is a
   * measurement of those fragments' own lines, rows or items. */
  oracleAnswer(parts: ReadonlyArray<readonly [HTMLElement, PmNode]>, key: string): LedgerCut | null | undefined {
    const entry = parts[0] ? this.oracle.get(parts[0][0]) : undefined;
    if (!entry || !sameParts(entry.parts, parts)) return undefined;
    return entry.answers.get(key);
  }

  storeOracleAnswer(parts: ReadonlyArray<readonly [HTMLElement, PmNode]>, key: string, answer: LedgerCut | null): void {
    if (!parts[0]) return;
    let entry = this.oracle.get(parts[0][0]);
    if (!entry || !sameParts(entry.parts, parts)) {
      entry = { parts, answers: new Map() };
      this.oracle.set(parts[0][0], entry);
    }
    entry.answers.delete(key);
    entry.answers.set(key, answer);
    while (entry.answers.size > ORACLE_ANSWERS_PER_BLOCK) {
      const oldest = entry.answers.keys().next().value;
      if (oldest === undefined) break;
      entry.answers.delete(oldest);
    }
  }

  /**
   * Run a measurement whose scratch DOM (a probe appended to a sheet and
   * removed again, like the footnote zone) leaves every sheet as it was: its
   * own mutations mark no sheet dirty. Recording them marked every sheet
   * holding a note as changed on every pass, so those sheets were measured
   * again whole each time.
   */
  unrecorded<T>(measure: () => T): T {
    this.flush();
    try {
      return measure();
    } finally {
      this.observer?.takeRecords();
    }
  }

  /** The sheets this pass measured whole now match their entries. */
  settle(sheets: readonly HTMLElement[]): void {
    let look: number | null = null;
    for (const sheet of sheets) {
      // A sheet measured before and unchanged since keeps the look of that
      // measurement: this pass took its entries, it laid nothing out anew.
      if (!this.settledSheets.has(sheet) || this.dirtySheets.has(sheet) || !this.settledLooks.has(sheet)) {
        look ??= noteFacesAfterMeasure(sheet.ownerDocument);
        this.settledLooks.set(sheet, look);
      }
      this.dirtySheets.delete(sheet);
      this.dirtyWhy.delete(sheet);
      this.settledSheets.add(sheet);
    }
  }

  /** Whether a pass measured `sheet` whole and nothing changed in it since
   * (a sheet a progressive pass has not reached yet is not). */
  isMeasured(sheet: HTMLElement): boolean {
    return this.settledSheets.has(sheet) && !this.dirtySheets.has(sheet);
  }

  /** A sheet whose shape changed without a mutation (a font its glyphs use
   * arrived): measured again whole next time. */
  markSheet(sheet: HTMLElement): void {
    this.dirtySheets.add(sheet);
    this.projectionStale.add(sheet);
    this.dirtyWhy.set(sheet, "font");
    for (const child of Array.from(sheet.children)) {
      if (child instanceof HTMLElement) this.edges.delete(child);
    }
  }

  /**
   * Whether a sheet's measurement projections (exact column tracks, pictures
   * fitted to the page box) must run again before it is measured: anything in
   * it changed since they last ran (a mutation, its page node, the document
   * attrs), or they never ran since the measurements were last forgotten.
   * A sheet they would leave exactly as it is keeps its projection: they are
   * a function of the sheet's own DOM and node plus the inputs that clear
   * this cache (fonts, width, zoom, page geometry).
   */
  needsProjection(sheet: HTMLElement, page: PmNode, docAttrs: unknown): boolean {
    if (docAttrs !== this.projectedDocAttrs) {
      this.projected = new WeakMap();
      this.projectedDocAttrs = docAttrs;
    }
    return this.projectionStale.has(sheet) || this.projected.get(sheet) !== page;
  }

  /** The projections of `sheet` ran for `page`. Call after `flush()` has
   * taken the projections' own writes, so that only later changes make the
   * sheet stale again. */
  markProjected(sheet: HTMLElement, page: PmNode): void {
    this.projected.set(sheet, page);
    this.projectionStale.delete(sheet);
  }

  /** The look at the faces right after `sheet` was last measured whole
   * (noteFacesAfterMeasure); undefined for one never measured. */
  settledLook(sheet: HTMLElement): number | undefined {
    return this.settledLooks.get(sheet);
  }

  /** Whether a pass has ever measured this element whole. */
  wasSettled(sheet: HTMLElement): boolean {
    return this.settledSheets.has(sheet);
  }

  /** Whether `sheet` changed since it was last measured. */
  isDirty(sheet: HTMLElement): boolean {
    return this.dirtySheets.has(sheet);
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const type of MEDIA_EVENTS) this.root.removeEventListener(type, this.onMedia, true);
    if (this.objectsPlacedFrame) this.root.ownerDocument.defaultView?.cancelAnimationFrame(this.objectsPlacedFrame);
    this.objectsPlacedFrame = 0;
    this.objectsPlaced.clear();
  }

  /**
   * An object just placed: its height read with the frame, once for all the
   * objects a batch placed. Read here, each page coming into view forced a
   * layout inside the mutation records (a fifth of a long book's scrolling).
   */
  private noteObjectPlaced(object: Element): void {
    this.objectsPlaced.add(object);
    if (this.objectsPlacedFrame !== 0) return;
    const win = this.root.ownerDocument.defaultView;
    this.objectsPlacedFrame = win?.requestAnimationFrame(() => {
      this.objectsPlacedFrame = 0;
      const placed = [...this.objectsPlaced];
      this.objectsPlaced.clear();
      for (const element of placed) {
        if (element.isConnected) this.objectHeights.set(element, element.getBoundingClientRect().height);
      }
    }) ?? 0;
  }

  private record(records: readonly MutationRecord[], own = false): void {
    // An attribute written several times in one batch changed by what it
    // was before the first write: cleared and set back (a floating box's
    // style, every layout pass) it changed nothing. Its first record decides;
    // the later ones are the same change.
    const seen = new Map<Node, Set<string>>();
    // An object drawn after it was placed (a Mermaid diagram's SVG, a chart
    // or a formula rendered in its own time) changes its sheet without a
    // transaction, and so without a pass: the page stayed one sheet with the
    // grown diagram running past its foot until the next key (WUA 074).
    let objectRedrawn = false;
    const drawings = new Map<Element, Element | null>();
    const marked = new Set<Node>();
    // Sheets a pass had measured, changed by something other than a pass.
    const measuredChanged = own || !this.onMeasuredSheetChanged ? null : new Set<HTMLElement>();
    const noteMeasured = (sheet: HTMLElement | null) => {
      if (sheet && measuredChanged && this.settledSheets.has(sheet)) measuredChanged.add(sheet);
    };
    // An object placed in this batch is drawn at its height from the start:
    // what changes inside it later at that height is no drawing. Counted as
    // one (no height known for a new element), every pass that placed a
    // table's read-only rows again restarted the ledger once a projection
    // touched their text, a cycle stop included (ec0ad3e4: stopped and set
    // going again 1,149 times in 90 s). An object drawn into later (WUA 074)
    // was placed before its drawing, so its height does change.
    for (const record of records) {
      if (record.type !== "childList") continue;
      for (const added of Array.from(record.addedNodes)) {
        if (!(added instanceof Element)) continue;
        const inner = added.getAttribute("contenteditable") === "false"
          ? [added, ...Array.from(added.querySelectorAll('[contenteditable="false"]'))]
          : Array.from(added.querySelectorAll('[contenteditable="false"]'));
        for (const element of inner) {
          const object = objectDrawingOf(element, this.root, drawings);
          if (!object || !added.contains(object) || this.objectHeights.has(object) || this.objectsPlaced.has(object)) continue;
          this.noteObjectPlaced(object);
        }
      }
    }
    for (const record of records) {
      if (!objectRedrawn && record.type === "childList") {
        // Only a drawing that changed the object's height moves the page: a
        // node view that redraws at the same size (or a pass of this ledger
        // touching it) starts no pass.
        const object = objectDrawingOf(record.target, this.root, drawings);
        if (object && !this.objectsPlaced.has(object)) {
          const height = object.getBoundingClientRect().height;
          if (this.objectHeights.get(object) !== height) {
            this.objectHeights.set(object, height);
            const sheet = this.mark(record.target, "object-drawn");
            if (sheet) objectRedrawn = true;
            noteMeasured(sheet);
          }
        }
      }
      if (record.type === "attributes") {
        const target = record.target as Element;
        const name = record.attributeName ?? "";
        const names = seen.get(target);
        if (names?.has(name)) continue;
        if (names) names.add(name);
        else seen.set(target, new Set([name]));
        // A write of the value already there changed nothing.
        if (target.getAttribute(name) === record.oldValue) continue;
        if (PAINT_ONLY_ATTRIBUTES.has(name)) continue;
        if (target === this.root) {
          if (isDocumentLayoutStatusAttribute(name) && name !== "data-document-display-fonts") continue;
          // ProseMirror's own classes (focused, hidden selection) come and go
          // with every focus change and lay nothing out; clearing on them
          // measured the whole document again after each one.
          if (name === "class" && sameLayoutClasses(record.oldValue, target.getAttribute("class"))) continue;
          // The editor turning editable once its pages have settled sets both
          // on the root. Nothing lays out differently (the only style they
          // bring, line-break: after-white-space, does nothing to the
          // break-spaces text: every block of a mixed document measured the
          // same either way), yet clearing on them left the first key after
          // opening a document to measure every page of it again.
          if (name === "contenteditable" || name === "tabindex") continue;
          this.clear(`root:${name}`);
          continue;
        }
        // The probe clones the sheet element itself: a sheet attribute that
        // changed invalidates the probes of the blocks it holds.
        if (target.parentElement === this.root) {
          if (
            SHEET_STAMP_ATTRIBUTES.has(name) &&
            !(name === "data-page-physical-parity" && target.querySelector(MIRROR_INDENT_SELECTOR))
          ) {
            continue;
          }
          for (const child of Array.from(target.children)) {
            if (child instanceof HTMLElement) this.edges.delete(child);
          }
        }
      }
      // Blocks added to or removed from a sheet: the sheet is the target.
      // A pass that moves a long table writes hundreds of thousands of records,
      // most of them on a target already marked.
      if (marked.has(record.target)) continue;
      marked.add(record.target);
      const target = record.target as Element;
      noteMeasured(this.mark(record.target, `${record.type}:${target.nodeName}${record.attributeName ? ":" + record.attributeName : ""}`));
    }
    if (objectRedrawn && !own) this.onMediaResize?.();
    if (measuredChanged?.size) this.onMeasuredSheetChanged?.([...measuredChanged]);
  }

  /** Mark the sheet (and top-level block) `node` sits in. The sheet, when it
   * sits inside a sheet of this editor. */
  private mark(node: Node, why = "media"): HTMLElement | null {
    let element: Element | null = node instanceof Element ? node : node.parentElement;
    let sheet: Element | null = null;
    let block: Element | null = null;
    while (element && element !== this.root) {
      block = sheet;
      sheet = element;
      element = element.parentElement;
    }
    // Detached (a removed subtree's own records) or the root itself.
    if (element !== this.root || !(sheet instanceof HTMLElement)) return null;
    this.dirtySheets.add(sheet);
    this.projectionStale.add(sheet);
    if (!this.dirtyWhy.has(sheet)) this.dirtyWhy.set(sheet, why);
    // Whatever changed inside a block may change the margins its edges push.
    if (block instanceof HTMLElement) this.edges.delete(block);
    return sheet;
  }
}

/** The class lists agree once ProseMirror's own state classes are set aside. */
function sameLayoutClasses(before: string | null, after: string | null): boolean {
  const layout = (value: string | null) =>
    (value ?? "").split(/\s+/).filter((name) => name !== "" && !name.startsWith("ProseMirror-")).sort().join(" ");
  return layout(before) === layout(after);
}

function sameParts(
  a: ReadonlyArray<readonly [HTMLElement, PmNode]>,
  b: ReadonlyArray<readonly [HTMLElement, PmNode]>,
): boolean {
  return a.length === b.length && a.every(([dom, node], index) => b[index][0] === dom && b[index][1] === node);
}
