/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { noWrapSlots, sourceRowOf } from "./tableNoWrap";
import { docsContentWidths, readDocsParagraph } from "../../../../lib/text-engine/docs-lines";
import { wordSetsIdeographsAsLetters } from "./wordFarEastDefaults";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import {
  wordAdjacentFloorWidths,
  wordAutofitColumnWidths,
  wordMinContentFloorWidths,
  wordShareTableGrowth,
  type WordAutofitColumn,
  type WordAutofitTableWidth,
} from "../../../../lib/document-word-table-autofit";
import { nativeTableGridWidths } from "./nativeTableGridView";
import { isGridFillerCell } from "./tableGridFiller";
import { MRNOTE_BLOCK_ID_ATTR } from "./blockIds";
import { INLINE_PICTURE_NODE_NAME } from "./documentObjectNodes";
import { fontFaceNewsCount } from "../../../../lib/font-face-news";
import { textEngineEnabled } from "../../../../lib/text-engine/flags";
import { loadedFontsKey } from "./loadedFontsKey";
import {
  TABLE_BLOCK_CONTINUATION_ATTR,
  TABLE_BLOCK_CONTINUES_ATTR,
  TABLE_FRAGMENT_ID_ATTR,
  TABLE_REPEATED_HEADER_ATTR,
  TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_SOURCE_ROW_ATTR,
} from "./paged/tablePagination";
import { normalizeTableAlign, normalizeTableIndentPx } from "./tableAlignment";
import { tablePositioningAnchorOffsetPx } from "./tablePositioning";
import { paginationLayoutScale, withPaginationScaleReuse } from "./paged/paginationGeometry";
import { docsLayoutPerfLegacy } from "./paged/layoutPerfLegacy";
import { SHEET_STAMPS } from "./paged/sheetMeasureMemo";
import {
  readWordTableLayout,
  type WordTableLayout,
  wordCellHorizontalMargins,
  wordTableContentFit,
  wordTableTextOutdentPx,
} from "./wordTableLayout";

/**
 * Word's AutoFit to contents, as a view projection.
 *
 * Word sizes such a table's columns from their content on every layout and
 * never reads the stored grid. The editor keeps that grid in the document
 * (saves stay byte-exact) and projects the widths Word would use onto the
 * rendered table: each column's widest and narrowest content is measured in
 * the live DOM, across every page fragment of the table, and
 * `wordAutofitColumnWidths` turns them into widths.
 *
 * The page ledger runs `projectWordAutofitTables` before every measurement
 * pass, so pagination always measures rows at their final widths. The table
 * NodeView reapplies the latest widths when ProseMirror redraws a fragment.
 *
 * Content widths are measured again only when they can have changed: a
 * fragment's node or rendered DOM changed (any mutation inside the table,
 * including decoration-only projections), the document attributes changed,
 * font faces loaded, or the ledger reported an external layout change
 * (`invalidateWordAutofitMeasurements`). Typing elsewhere reuses them.
 *
 * Widths depend only on the table's content, never on how it is paginated:
 * a paragraph split across pages counts as one line of its combined width.
 */

export const WORD_AUTOFIT_MEASURE_ATTR = "data-word-autofit-measure";
export const WORD_AUTOFIT_DISPLAY_ATTR = "data-word-autofit-display";
/** On a rendered table drawn at `wordMinContentFloorFor`'s widths. */
export const WORD_MIN_CONTENT_FLOOR_ATTR = "data-word-min-content-floor";

export interface WordAutofitGeometry {
  /** Width of each grid column, in CSS px. */
  readonly widths: readonly number[];
  /** Half the used widths of the outer left and right borders. */
  readonly borderAllowancePx: number;
}

interface Fragment {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly wrapper: HTMLElement;
  readonly table: HTMLTableElement;
}

interface LogicalTable {
  readonly width: WordAutofitTableWidth;
  /** A table keeping its stored grid whose content may need a wider column
   * (`minContentFloorGrid`): the grid, in CSS px. */
  readonly floorGrid: readonly number[] | null;
  /** The tables standing next to it with no paragraph between (`adjacentTableRun`). */
  readonly run: readonly ProseMirrorNode[] | null;
  readonly keys: readonly string[];
  readonly fragments: readonly Fragment[];
}

const geometryByView = new WeakMap<EditorView, Map<string, WordAutofitGeometry>>();
/** The widths a table keeping its grid is drawn at (`wordMinContentFloorWidths`). */
const floorByView = new WeakMap<EditorView, Map<string, readonly number[]>>();
/** The width (CSS px, the grid's rule centres) a table keeping its grid is drawn
 * at when its narrowest contents need more than it asks (`wordShareTableGrowth`). */
const grownByView = new WeakMap<EditorView, Map<string, number>>();

function registry(view: EditorView): Map<string, WordAutofitGeometry> {
  let map = geometryByView.get(view);
  if (!map) {
    map = new Map();
    geometryByView.set(view, map);
  }
  return map;
}

function stringAttr(node: ProseMirrorNode, name: string): string | null {
  const value: unknown = node.attrs[name];
  return typeof value === "string" && value ? value : null;
}

/** Word's per-column content fit covers tables whose cells each own one
 * grid column; merged columns keep their stored grid. */
function eligibleTable(table: ProseMirrorNode): WordAutofitTableWidth | null {
  if (table.attrs.tablePositioning != null) return null;
  const width = wordTableContentFit(table);
  if (!width) return null;
  let spans = false;
  table.forEach((row) => {
    row.forEach((cell) => {
      if ((Number(cell.attrs.colspan) || 1) > 1) spans = true;
    });
  });
  return spans ? null : width;
}

/** The longest run Word keeps whole (no space; ideographs break anywhere). */
const UNBREAKABLE_RUN = /[^\s\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]+/g;
/** Narrower than any face draws a character at a text size a table holds. */
const NARROWEST_CHARACTER_PX = 4.5;
/** Share of the font size no lower-case letter or digit-free piece stays
 * under, and what capitals and digits take at least. */
const NARROW_LETTER_EM = 0.36;
const NARROW_CAPITAL_EM = 0.5;

/** The largest size (px) a block's runs state with a font size mark. */
function largestRunFontPx(block: ProseMirrorNode): number {
  let largest = 0;
  block.forEach((child) => {
    for (const mark of child.marks) {
      if (mark.type.name !== "fontSize") continue;
      const match = /^([0-9.]+)(px|pt)$/.exec(String(mark.attrs.size ?? ""));
      if (!match) continue;
      const px = Number(match[1]) * (match[2] === "pt" ? 4 / 3 : 1);
      if (px > largest) largest = px;
    }
  });
  return largest;
}

/** A lower bound of a piece's width at the block's size: enough to know an
 * ordinary table needs no measuring, not a measurement. */
function narrowestPieceWidth(run: string, fontPx: number): number {
  let width = 0;
  for (const character of run) {
    const capital = /[\p{Lu}\p{Nd}]/u.test(character);
    width += Math.max(NARROWEST_CHARACTER_PX, fontPx * (capital ? NARROW_CAPITAL_EM : NARROW_LETTER_EM));
  }
  return width;
}

/** Word's default left and right cell margin (0.08"), CSS px, for a cell that states none. */
const DEFAULT_CELL_SIDE_MARGIN_PX = 7.2;
/** The size a run with no stated size is guessed at (10 pt). */
const UNSTATED_FONT_PX = 40 / 3;
/** A piece guessed this near its cell's text width may not fit it in the face it is drawn in. */
const LIKELY_OVERFLOW_SHARE = 0.8;

/**
 * About what a piece takes in a narrow text face (Times-like advances by class of letter), in px.
 * A regular sans draws it up to a fifth wider and bold wider still, so a piece within a fifth of its
 * cell's text width may be one Word widens the column for: `narrowestPieceWidth` alone let those
 * through ("Corporation" at 10.5 pt Arial is 73 px, was guessed 57, and stood in a 1276-twip cell
 * with 70.7 px for its text: Word drew it whole and the column wider, we cut it after "Corporatio";
 * corpus R283-D06, 158 cells of one table). The table is then measured, and keeps its grid when
 * every piece does fit.
 */
export function likelyPieceWidth(run: string, fontPx: number): number {
  const size = fontPx > 0 ? fontPx : UNSTATED_FONT_PX;
  let em = 0;
  for (const character of run) {
    if (/[ijltfI.,:;'!|]/.test(character)) em += 0.28;
    else if (/[rsJ()[\]\-/]/.test(character)) em += 0.36;
    else if (/[MW]/.test(character)) em += 0.9;
    else if (/[mw]/.test(character) || /\p{Lu}/u.test(character)) em += 0.68;
    else em += 0.47;
  }
  return em * size;
}

/** Whether a piece may be too wide for a cell of `cellWidth` holding `sideMargins` of margin. */
export function pieceMayOverflowCell(run: string, fontPx: number, cellWidth: number, sideMargins: number): boolean {
  if (narrowestPieceWidth(run, fontPx) > cellWidth) return true;
  return likelyPieceWidth(run, fontPx) > Math.max(0, cellWidth - sideMargins) * LIKELY_OVERFLOW_SHARE;
}

/** The width a picture standing in the text is stored at, CSS px; 0 for a
 * floating one, which takes no room in its line. */
function inlinePictureWidth(node: ProseMirrorNode): number {
  if (node.type.name !== "image" && node.type.name !== INLINE_PICTURE_NODE_NAME) return 0;
  if (node.attrs.officeDrawingKind === "anchor") return 0;
  const width = Number(node.attrs.width);
  return Number.isFinite(width) && width > 0 ? width : 0;
}

const floorGridByNode = new WeakMap<ProseMirrorNode, readonly number[] | null>();

/**
 * The stored grid of a Word table that keeps it (not AutoFit to contents,
 * not fixed layout, not floating) when some cell holds a piece of text or a
 * picture that might not fit its column whole; null otherwise. Word widens
 * such a column to the piece (`wordMinContentFloorWidths`); the content here
 * is only a cheap guess at it, so an ordinary table is never measured.
 */
function minContentFloorGrid(table: ProseMirrorNode): readonly number[] | null {
  if (floorGridByNode.has(table)) return floorGridByNode.get(table) ?? null;
  let result: readonly number[] | null = null;
  const layout = readWordTableLayout(table.attrs);
  if (layout) {
    const grid = keptGrid(table);
    if (grid) {
      // A share of the text column draws the grid about that much narrower.
      const drawnShare = Math.min(1, (layout.preferredWidthPct ?? 5000) / 5000);
      let overflows = false;
      const noWrap = noWrapSlots(table);
      table.forEach((row, _offset, rowIndex) => {
        let column = 0;
        const sourceRow = noWrap ? sourceRowOf(table, rowIndex) : -1;
        row.forEach((cell) => {
          // A cell that does not wrap (Word's `w:noWrap`) holds its words as one piece.
          const unbroken = noWrap?.has(`${sourceRow}:${column}`) === true;
          const span = Number(cell.attrs.colspan) || 1;
          let width = 0;
          for (let index = column; index < column + span; index += 1) width += grid[index] ?? 0;
          width *= drawnShare;
          column += span;
          if (overflows) return;
          const margins = wordCellHorizontalMargins(table, cell);
          const sideMargins = (margins.left ?? DEFAULT_CELL_SIDE_MARGIN_PX) + (margins.right ?? DEFAULT_CELL_SIDE_MARGIN_PX);
          cell.descendants((node) => {
            if (inlinePictureWidth(node) > width) overflows = true;
            if (overflows || !node.isTextblock) return !overflows;
            node.forEach((child) => {
              if (inlinePictureWidth(child) > width) overflows = true;
            });
            const fontPx = largestRunFontPx(node);
            for (const run of unbroken ? [node.textContent] : node.textContent.match(UNBREAKABLE_RUN) ?? []) {
              if (pieceMayOverflowCell(run, fontPx, width, sideMargins)) {
                overflows = true;
                break;
              }
            }
            return false;
          });
        });
      });
      result = overflows ? grid : null;
    }
  }
  floorGridByNode.set(table, result);
  return result;
}

const overfullGridByNode = new WeakMap<ProseMirrorNode, readonly number[] | null>();
/** Below this, a grid and its table are the same width but for rounding. */
const OVERFULL_SCALE = 0.985;

/**
 * The grid of a table drawn narrower than its columns ask (a share of the text
 * column, the column itself, a stated width under them: Word 16.86 draws all
 * three alike, `wd/tc`): its widths depend on its narrowest contents even with
 * every word fitting (`wordMinContentFloorWidths`). The one thing here read from
 * the page, once per table node, and not remembered while the table is not laid out.
 */
function overfullShareGrid(view: EditorView, table: ProseMirrorNode, pos: number): readonly number[] | null {
  const known = overfullGridByNode.get(table);
  if (known !== undefined) return known;
  const grid = keptGrid(table);
  if (!grid) {
    overfullGridByNode.set(table, null);
    return null;
  }
  const dom = view.nodeDOM(pos);
  const element = dom instanceof HTMLElement ? tableElement(dom) : null;
  if (!element?.isConnected) return null;
  const drawn = element.getBoundingClientRect().width / layoutScale(element);
  if (!(drawn > 0)) return null;
  const total = grid.reduce((sum, width) => sum + width, 0);
  const result = total > 0 && drawn / total < OVERFULL_SCALE ? grid : null;
  overfullGridByNode.set(table, result);
  return result;
}

/** The stored grid of a Word table that keeps it, in CSS px. */
function keptGrid(table: ProseMirrorNode): readonly number[] | null {
  const layout = readWordTableLayout(table.attrs);
  const policy: unknown = table.attrs.tableLayoutPolicy;
  if (
    // A stated width past the text column keeps the grid too, and its long
    // words widen their columns all the same: tblW is a preference (ISO 29500
    // ST_TblLayoutType, AutoFit steps; corpus R282-D08, R282-D12). So does a
    // width that is a share of the column (R283-D20's masthead: tblW 10000 of
    // a 10470-twip column over dxa cells, "SECURITY_S" widening its column).
    layout && layout.contentFit === null && !layout.fixedLayout &&
    table.attrs.tablePositioning == null && (policy === null || policy === undefined)
  ) {
    try {
      return nativeTableGridWidths(table);
    } catch {
      return null;
    }
  }
  return null;
}

const tableRunsByParent = new WeakMap<ProseMirrorNode, Map<ProseMirrorNode, readonly ProseMirrorNode[]>>();

/**
 * The run of tables a table stands in with no paragraph between them, which
 * Word lays out as one table (`wordAdjacentFloorWidths`): all keeping their
 * grids. Null for a table with a paragraph on each side.
 */
function adjacentTableRun(parent: ProseMirrorNode | null, table: ProseMirrorNode): readonly ProseMirrorNode[] | null {
  if (!parent) return null;
  let runs = tableRunsByParent.get(parent);
  if (!runs) {
    runs = new Map();
    let run: ProseMirrorNode[] = [];
    const close = () => {
      if (run.length > 1) for (const member of run) runs!.set(member, run);
      run = [];
    };
    parent.forEach((child) => {
      if (child.type.name === "table" && keptGrid(child)) run.push(child);
      else close();
    });
    close();
    tableRunsByParent.set(parent, runs);
  }
  return runs.get(table) ?? null;
}

function tableElement(wrapper: HTMLElement): HTMLTableElement | null {
  if (wrapper instanceof HTMLTableElement) return wrapper;
  const table = wrapper.querySelector(":scope > table");
  return table instanceof HTMLTableElement ? table : null;
}

function collectLogicalTables(view: EditorView): LogicalTable[] {
  const groups = new Map<string, {
    width: WordAutofitTableWidth;
    floorGrid: readonly number[] | null;
    run: readonly ProseMirrorNode[] | null;
    keys: Set<string>;
    fragments: Fragment[];
  }>();
  const order: string[] = [];
  const pieceless = new Map<string, Array<Fragment & { blockId: string | null }>>();
  view.state.doc.descendants((node, pos, parent) => {
    if (node.type.name !== "table") return true;
    // A table nested in a cell is measured like a top-level one, so its own
    
    const width = eligibleTable(node);
    const run = width ? null : adjacentTableRun(parent, node);
    const floorGrid = width
      ? null
      : minContentFloorGrid(node) ??
        (run?.some((member) => minContentFloorGrid(member)) ? keptGrid(node) : null) ??
        overfullShareGrid(view, node, pos);
    const fragmentId = stringAttr(node, TABLE_FRAGMENT_ID_ATTR);
    if (!width && !floorGrid && !fragmentId) return true;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement) || !dom.isConnected) return true;
    const table = tableElement(dom);
    if (!table) return true;
    const blockId = stringAttr(node, MRNOTE_BLOCK_ID_ATTR);
    if (!width && !floorGrid) {
      // A piece of a split table with no word too wide of its own is still the
      // table: see below.
      const pieces = pieceless.get(fragmentId!) ?? [];
      pieces.push({ node, pos, wrapper: dom, table, blockId });
      pieceless.set(fragmentId!, pieces);
      return true;
    }
    const key = fragmentId ?? blockId ?? `pos:${pos}`;
    let group = groups.get(key);
    if (!group) {
      group = { width: width ?? { type: "auto" }, floorGrid, run, keys: new Set(), fragments: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.keys.add(key);
    if (blockId) group.keys.add(blockId);
    group.fragments.push({ node, pos, wrapper: dom, table });
    return true;
  });
  // A table whose columns keep a floor keeps it in every piece, and reads it from
  // every piece. Only the pieces holding a word too wide counted: the floor was
  // read from those rows alone, so it moved with the cuts (a cut moving the widest
  // word out of a piece took the floor away), and the others were drawn at the
  // grid. Every row then read another height and the plan put the cut pages back:
  // a 45-row table went to 12 pages and back to 3, for ever (corpus R282-D26).
  for (const [id, pieces] of pieceless) {
    const group = groups.get(id);
    if (!group?.floorGrid) continue;
    for (const { blockId, ...piece } of pieces) {
      group.fragments.push(piece);
      if (blockId) group.keys.add(blockId);
    }
    group.fragments.sort((a, b) => a.pos - b.pos);
  }
  return order.map((key) => {
    const group = groups.get(key)!;
    return { width: group.width, floorGrid: group.floorGrid, run: group.run, keys: [...group.keys], fragments: group.fragments };
  });
}







function layoutScale(element: HTMLElement): number {
  // The page's zoom, from the sheet's resolved (fractional) box. The
  // element's own offsetWidth is ROUNDED to an integer, so dividing its
  // client rect by rect/offsetWidth returned offsetWidth: a paragraph of
  // 109.31px measured 109px, its column came out 0.31px short and the text
  // Word keeps on one line wrapped (b-table probe, "Some longer text").
  return paginationLayoutScale(element).x;
}

/**
 * An element's drawn width, in document pixels. The first read of a table on a
 * sheet the browser has skipped (content-visibility) can answer 0, and the next
 * its width: a table's column read as 0 fell back to its narrowest content, and
 * a one-column table holding a table was drawn 2 px wide, 14,000 px tall
 * (R286-D01, through the print of every long document of such tables).
 */
function drawnWidth(element: HTMLElement): number {
  const scale = layoutScale(element);
  return (element.getBoundingClientRect().width || element.getBoundingClientRect().width) / scale;
}

function marginBoxWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    drawnWidth(element) +
    (Number.parseFloat(style.marginLeft) || 0) +
    (Number.parseFloat(style.marginRight) || 0)
  );
}

/**
 * A cell block's narrowest width in the min-content mode, its in-line
 * formulas read as Word breaks them: after a slash, inside its brackets too
 * (truth machine, Word 16.0.20527, corpus R287-D30: "100×(labor income tax/"
 * on one line of a 192pt AutoFit column and "personal income)" on the next).
 * KaTeX sets "\left( … \right)" as one unbreakable box, which made the
 * formula's whole 184pt the column's narrowest content: the table's other
 * columns gave it the room and "Variable" wrapped. The block is read with
 * its formulas out, and each formula as its widest piece between two
 * such breaks. `window.__docsFormulaPiecesOff = true`: as before (A/B).
 */
export function minContentWithFormulaPieces(element: HTMLElement): number {
  const formulas = [...element.querySelectorAll<HTMLElement>(".inline-math-preview .katex-html")];
  const off = (element.ownerDocument.defaultView as (Window & { __docsFormulaPiecesOff?: boolean }) | null)?.__docsFormulaPiecesOff === true;
  if (formulas.length === 0 || off) return marginBoxWidth(element);
  const scale = layoutScale(element);
  let widest = 0;
  for (const formula of formulas) {
    const leaves = [...formula.querySelectorAll<HTMLElement>("span")]
      .filter((span) => span.childElementCount === 0 && (span.textContent ?? "") !== "")
      .map((span) => ({ rect: span.getBoundingClientRect(), text: span.textContent ?? "" }))
      .filter(({ rect }) => rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);
    let from = Number.NaN;
    let to = Number.NaN;
    for (const leaf of leaves) {
      if (!Number.isFinite(from)) from = leaf.rect.left;
      to = Math.max(Number.isFinite(to) ? to : leaf.rect.right, leaf.rect.right);
      if (leaf.text.trim() === "/") {
        widest = Math.max(widest, (to - from) / scale);
        from = Number.NaN;
        to = Number.NaN;
      }
    }
    if (Number.isFinite(from)) widest = Math.max(widest, (to - from) / scale);
  }
  const hosts = formulas.map((formula) => formula.closest<HTMLElement>(".inline-math-wrapper") ?? formula);
  const kept = hosts.map((host) => host.style.getPropertyValue("display"));
  for (const host of hosts) host.style.setProperty("display", "none");
  try {
    return Math.max(marginBoxWidth(element), widest + (marginBoxWidth(element) - drawnWidth(element)));
  } finally {
    hosts.forEach((host, index) => {
      if (kept[index]) host.style.setProperty("display", kept[index]!);
      else host.style.removeProperty("display");
    });
  }
}

interface CellContent {
  min: number;
  max: number;
  /** The cell's margins from the model; null reads its rendered padding. */
  readonly marginLeft: number | null;
  readonly marginRight: number | null;
  readonly element: HTMLElement | null;
  /** Grid columns the cell spans. */
  readonly span: number;
  /** A grid filler (`w:gridBefore` / `w:gridAfter`): no Word cell stands there. */
  readonly filler?: boolean;
}

/** A cell block's narrowest and widest, and what they were read under. */
interface BlockWidths {
  readonly under: string;
  min?: number;
  max?: number;
}

/**
 * By block: its widths depend on its own content, the faces and the table's
 * look, not on the page it stands on. A row moved to another page keeps its
 * blocks, so a fragment built by the page ledger need not be measured: that
 * measurement (a style pass of the table in each mode) is the largest single
 * cost of laying out a long document of tables (R286-D01: 86 s of 545).
 */
const blockWidths = new WeakMap<ProseMirrorNode, BlockWidths>();
/** Moves on when a layout input outside the document changes. */
let blockWidthsEpoch = 0;
const docAttrsSerials = new WeakMap<object, number>();
let lastDocAttrsSerial = 0;

function docAttrsSerial(docAttrs: unknown): number {
  if (typeof docAttrs !== "object" || docAttrs === null) return 0;
  let serial = docAttrsSerials.get(docAttrs);
  if (serial === undefined) {
    serial = (lastDocAttrsSerial += 1);
    docAttrsSerials.set(docAttrs, serial);
  }
  return serial;
}

/** What a table's block widths depend on besides the block. */
function blockWidthsKey(table: LogicalTable, fonts: string, docAttrs: unknown): string {
  const attrs = table.fragments[0]?.node.attrs ?? {};
  const look = Object.entries(attrs).filter(([name]) => !/^(pageTable|source$|block_id$|mrnote)/.test(name));
  return `${blockWidthsEpoch}\u0002${docAttrsSerial(docAttrs)}\u0002${fonts}\u0002${JSON.stringify(look)}`;
}

/** Each block of a table, with the rows the table repeats left out. */
function forEachTableBlock(table: LogicalTable, visit: (block: ProseMirrorNode) => void): void {
  for (const fragment of table.fragments) {
    fragment.node.forEach((row) => {
      if (row.attrs[TABLE_REPEATED_HEADER_ATTR] === true) return;
      row.forEach((cell) => cell.forEach(visit));
    });
  }
}

function blocksRemembered(table: LogicalTable, under: string): boolean {
  let all = true;
  forEachTableBlock(table, (block) => {
    const known = blockWidths.get(block);
    if (known?.under !== under || known.min === undefined || known.max === undefined) all = false;
  });
  return all;
}

/**
 * One pass over every fragment in the current measurement mode. In `max`
 * mode each cell block is laid out at its max-content width, in `min` mode
 * at its min-content width. The result is keyed by source row and column.
 */
function readCellContent(
  view: EditorView,
  table: LogicalTable,
  mode: "min" | "max",
  cells: Map<string, CellContent>,
  /** The key of the widths to take from memory, or to keep there. */
  memory?: { readonly under: string; readonly read: boolean },
  /** A block's width with no measurement mode drawn (the text engine), or
   * null: the table is then read from the page. */
  widthOf?: (block: ProseMirrorNode, dom: HTMLElement) => number | null,
): boolean {
  let read = true;
  // A paragraph split across pages is one line of its parts' total width.
  const pendingParts = new Map<string, number>();
  for (const fragment of table.fragments) {
    let map: TableMap;
    try {
      map = TableMap.get(fragment.node);
    } catch {
      continue;
    }
    fragment.node.forEach((row, rowOffset, rowIndex) => {
      if (row.attrs[TABLE_REPEATED_HEADER_ATTR] === true) return;
      const sourceRowAttr: unknown = row.attrs[TABLE_SOURCE_ROW_ATTR];
      const sourceRow = typeof sourceRowAttr === "number" ? sourceRowAttr : rowIndex;
      row.forEach((cell, cellOffset) => {
        const cellStart = rowOffset + 1 + cellOffset;
        const sourceColAttr: unknown = cell.attrs[TABLE_SOURCE_CELL_COL_ATTR];
        const column = typeof sourceColAttr === "number"
          ? sourceColAttr
          : map.colCount(cellStart);
        const key = `${sourceRow}:${column}`;
        let entry = cells.get(key);
        if (!entry) {
          const margins = wordCellHorizontalMargins(fragment.node, cell);
          const cellDom = view.nodeDOM(fragment.pos + 1 + cellStart);
          entry = {
            min: 0,
            max: 0,
            marginLeft: margins.left,
            marginRight: margins.right,
            element: cellDom instanceof HTMLElement ? cellDom : null,
            span: Number(cell.attrs.colspan) || 1,
            filler: isGridFillerCell(cell),
          };
          cells.set(key, entry);
        }
        let blockPos = fragment.pos + 1 + cellStart + 1;
        cell.forEach((block) => {
          const dom = memory?.read ? null : view.nodeDOM(blockPos);
          blockPos += block.nodeSize;
          if (!memory?.read && !(dom instanceof HTMLElement)) return;
          const known = memory?.read ? blockWidths.get(block)?.[mode] : undefined;
          const engine = known === undefined && widthOf ? widthOf(block, dom as HTMLElement) : undefined;
          if (engine === null) read = false;
          const width = known ?? engine ?? (mode === "min" ? minContentWithFormulaPieces(dom as HTMLElement) : marginBoxWidth(dom as HTMLElement));
          // A block the engine could not say is not kept: its table is read
          // from the page, which keeps what it reads.
          if (memory && !memory.read && engine !== null) {
            const held = blockWidths.get(block);
            const record = held?.under === memory.under ? held : { under: memory.under };
            record[mode] = width;
            blockWidths.set(block, record);
          }
          if (mode === "min") {
            entry!.min = Math.max(entry!.min, width);
            return;
          }
          const run = (block.attrs[TABLE_BLOCK_CONTINUATION_ATTR] === true
            ? pendingParts.get(key) ?? 0
            : 0) + width;
          if (block.attrs[TABLE_BLOCK_CONTINUES_ATTR] === true) {
            pendingParts.set(key, run);
            return;
          }
          pendingParts.delete(key);
          entry!.max = Math.max(entry!.max, run);
        });
      });
    });
  }
  for (const [key, run] of pendingParts) {
    const entry = cells.get(key);
    if (entry) entry.max = Math.max(entry.max, run);
  }
  return read;
}

/** How far a block is laid out in the engine's widths: wide enough that no
 * line of a cell's paragraph wraps (max-content). */
const ENGINE_CONTENT_COLUMN_PX = 1_000_000;

/**
 * The browser's ceiling on the max-content width of a table whose width is a
 * share of its container: such a table would take any room it is given, and
 * Blink answers this constant (its table code's kTableMaxWidth) for it. Every
 * nested table of R286-D01 (817 in 163 tables) read exactly this in the `max`
 * measurement mode.
 */
const BROWSER_SHARE_TABLE_MAX_CONTENT_PX = 1_000_000;

/** One edge of a collapsed table border: a hidden border wins and draws
 * nothing, a missing one gives way, the wider of two otherwise. */
function collapsedEdgeWidth(cell: CSSStyleDeclaration, table: CSSStyleDeclaration, side: "Left" | "Right"): number {
  const cellStyle = cell[`border${side}Style`];
  const tableStyle = table[`border${side}Style`];
  if (cellStyle === "hidden" || tableStyle === "hidden") return 0;
  const cellWidth = cellStyle === "none" ? 0 : Number.parseFloat(cell[`border${side}Width`]) || 0;
  const tableWidth = tableStyle === "none" ? 0 : Number.parseFloat(table[`border${side}Width`]) || 0;
  return Math.max(cellWidth, tableWidth);
}

/**
 * The min- and max-content widths of a cell block that is a nested table laid
 * out fixed at a share of its cell (the Word importer's nested tables: R286-D01
 * has 788, in 133 of its 227 tables), as the measurement modes read them: its
 * content does not count, so the narrowest is its collapsed edge borders
 * (half of each, inside the table's box) and the widest the browser's ceiling.
 * Null for any other nested table, or a table whose rows' edges differ, or a
 * sheet drawn at another scale: that table is read from the page. A nested
 * table made every table holding one draw both measurement modes, each a style
 * and layout pass of the whole table.
 */
function shareTableContentWidths(dom: HTMLElement): { min: number; max: number } | null {
  const table = dom.firstElementChild;
  if (dom.childElementCount !== 1 || !(table instanceof HTMLTableElement)) return null;
  if (!table.style.width.includes("%")) return null;
  // Only at the page's own size: how a zoom scales the browser's ceiling is
  // not known, and such a sheet is read from the page as before.
  const scale = paginationLayoutScale(dom).x;
  if (!(Math.abs(scale - 1) <= 1e-4)) return null;
  const wrapper = getComputedStyle(dom);
  const tableStyle = getComputedStyle(table);
  const sides = (style: CSSStyleDeclaration, box: "margin" | "padding") =>
    (Number.parseFloat(style.getPropertyValue(`${box}-left`)) || 0) + (Number.parseFloat(style.getPropertyValue(`${box}-right`)) || 0);
  if (sides(wrapper, "margin") !== 0 || sides(wrapper, "padding") !== 0 ||
      (Number.parseFloat(wrapper.borderLeftWidth) || 0) + (Number.parseFloat(wrapper.borderRightWidth) || 0) !== 0) return null;
  if (wrapper.display !== "block" || tableStyle.tableLayout !== "fixed" || tableStyle.borderCollapse !== "collapse") return null;
  if (sides(tableStyle, "margin") !== 0) return null;
  let left: number | null = null;
  let right: number | null = null;
  for (const row of table.rows) {
    const cells = row.cells;
    if (cells.length === 0) continue;
    const rowLeft = collapsedEdgeWidth(getComputedStyle(cells[0]!), tableStyle, "Left");
    const rowRight = collapsedEdgeWidth(getComputedStyle(cells[cells.length - 1]!), tableStyle, "Right");
    if ((left !== null && rowLeft !== left) || (right !== null && rowRight !== right)) return null;
    left = rowLeft;
    right = rowRight;
  }
  if (left === null || right === null) return null;
  // In document pixels, as the page reads it (marginBoxWidth): the sheet's
  // scale, read from its rounded box, is a hair off 1 (0.99999984), and a
  // ceiling of a million came back 0.16 px wider.
  const widths = { min: (left + right) / 2 / scale, max: BROWSER_SHARE_TABLE_MAX_CONTENT_PX / scale };
  shareTablesSaid?.push({ dom, ...widths });
  return widths;
}

/** The nested tables the engine said this pass, while
 * `window.__docsNestedShareTablesCheck = true` (development: compared with the
 * measurement modes, checkShareTables). */
let shareTablesSaid: { dom: HTMLElement; min: number; max: number }[] | null = null;

function nestedShareTablesCheck(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNestedShareTablesCheck?: boolean }) | null;
  return win?.__docsNestedShareTablesCheck === true;
}

/** Reads each nested table the engine said in both measurement modes and
 * keeps the ones that differ in `window.__docsNestedShareTablesDiffs`
 * (`checked`/`differed` counted in __docsAutofitStats). */
function checkShareTables(view: EditorView, said: readonly { dom: HTMLElement; min: number; max: number }[]): void {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNestedShareTablesDiffs?: unknown[] }) | null;
  if (!win) return;
  const diffs = (win.__docsNestedShareTablesDiffs ??= []);
  const outers = new Set<HTMLElement>();
  const outerOf = new Map<HTMLElement, HTMLElement>();
  for (const { dom } of said) {
    const outer = dom.parentElement?.closest("table");
    if (outer instanceof HTMLElement) { outers.add(outer); outerOf.set(dom, outer); }
  }
  const read = (mode: "min" | "max") => {
    for (const outer of outers) outer.setAttribute(WORD_AUTOFIT_MEASURE_ATTR, mode);
    try {
      return said.map(({ dom }) => (outerOf.has(dom) ? marginBoxWidth(dom) : Number.NaN));
    } finally {
      for (const outer of outers) outer.removeAttribute(WORD_AUTOFIT_MEASURE_ATTR);
    }
  };
  const max = read("max");
  const min = read("min");
  said.forEach((entry, index) => {
    autofitStats(view, "shareChecked");
    if (Math.abs(entry.min - min[index]!) <= 0.01 && Math.abs(entry.max - max[index]!) <= 0.01) return;
    autofitStats(view, "shareDiffered");
    if (diffs.length < 200) diffs.push({ engine: [entry.min, entry.max], page: [min[index], max[index]], html: entry.dom.outerHTML.slice(0, 300) });
  });
}

/**
 * A table's cell contents from the text engine, with no measurement mode
 * drawn (L3-DESIGN step 5): each paragraph's min- and max-content widths
 * (docsContentWidths) from its computed style, and a nested table's from its
 * box (shareTableContentWidths). The two modes laid every table out twice a
 * pass, the largest share of a long document's open (61.6 s of R286-D01's).
 * Null when any block is one the engine cannot say (a tab, an object, another
 * nested table, a face loading): that table is read from the page.
 */
function engineCellContent(
  view: EditorView,
  table: LogicalTable,
  /** Where the widths are kept for a later pass (blockWidths), as the page's
   * readings are: the engine read every paragraph of every such table again
   * on every pass (R286-D01: 668 tables measured, none remembered). */
  memory?: { readonly under: string; readonly read: false },
): Map<string, CellContent> | null {
  const widths = new Map<ProseMirrorNode, { min: number; max: number } | null>();
  const widthsOf = (block: ProseMirrorNode, dom: HTMLElement) => {
    if (!widths.has(block)) {
      if (!block.isTextblock) {
        widths.set(block, nestedShareTablesByEngine() ? shareTableContentWidths(dom) : null);
      } else {
        const paragraph = !dom.querySelector("table") ? readDocsParagraph(dom, { columnWidthPx: ENGINE_CONTENT_COLUMN_PX }) : null;
        widths.set(block, paragraph ? docsContentWidths(paragraph, ENGINE_CONTENT_COLUMN_PX, wordSetsIdeographsAsLetters(view.state.doc.attrs)) : null);
      }
    }
    return widths.get(block) ?? null;
  };
  const cells = new Map<string, CellContent>();
  const kept = engineWidthsKept() ? memory : undefined;
  const max = readCellContent(view, table, "max", cells, kept, (block, dom) => widthsOf(block, dom)?.max ?? null);
  if (!max) return null;
  const min = readCellContent(view, table, "min", cells, kept, (block, dom) => widthsOf(block, dom)?.min ?? null);
  return min ? cells : null;
}

/** Each logical table's cell contents, measured in both modes at once. */
function measureCellContent(
  view: EditorView,
  tables: readonly LogicalTable[],
  keyOf?: (table: LogicalTable) => string,
): Map<LogicalTable, Map<string, CellContent>> {
  const contents = new Map(tables.map((table) => [table, new Map<string, CellContent>()] as const));
  // With the docs-layout engine on, a table whose every block the engine
  // can say draws no measurement mode at all. A nested table's sheet scale is
  // read once a sheet.
  const checking = nestedShareTablesCheck(view);
  if (checking) shareTablesSaid = [];
  let pageTables: readonly LogicalTable[];
  try {
    pageTables = textEngineEnabled("docs-layout")
      ? withPaginationScaleReuse(() => tables.filter((table) => {
        const engine = engineCellContent(view, table, keyOf ? { under: keyOf(table), read: false } : undefined);
        if (engine) contents.set(table, engine);
        return !engine;
      }))
      : tables;
  } finally {
    const said = shareTablesSaid;
    shareTablesSaid = null;
    if (checking && said && said.length > 0) withPaginationScaleReuse(() => checkShareTables(view, said));
  }
  autofitStats(view, "byEngine", tables.length - pageTables.length);
  autofitStats(view, "byPage", pageTables.length);
  if (pageTables.length === 0) return contents;
  const elements = pageTables.flatMap((table) => table.fragments.map((fragment) => fragment.table));
  try {
    // Every block's width is divided by its sheet's zoom, which no
    // measurement mode changes: read once per sheet and pass, not once per
    // block (each a rect and a style of the sheet; the tables of OI29500
    // read it thousands of times a pass).
    withPaginationScaleReuse(() => {
      for (const element of elements) element.setAttribute(WORD_AUTOFIT_MEASURE_ATTR, "max");
      const memory = (table: LogicalTable) => (keyOf ? { under: keyOf(table), read: false } : undefined);
      for (const table of pageTables) readCellContent(view, table, "max", contents.get(table)!, memory(table));
      for (const element of elements) element.setAttribute(WORD_AUTOFIT_MEASURE_ATTR, "min");
      for (const table of pageTables) readCellContent(view, table, "min", contents.get(table)!, memory(table));
    });
  } finally {
    for (const element of elements) element.removeAttribute(WORD_AUTOFIT_MEASURE_ATTR);
  }
  return contents;
}

/**
 * What a unit of the stored grid draws at: a percentage preferred width scales
 * the grid to that share of the text column (the table view), and a grid past the
 * column or a stated width is drawn at that, while the words and pictures it must
 * hold stay their size. 1 for a table drawn at its grid.
 */
function floorGridScale(table: LogicalTable): number {
  const head = table.fragments[0];
  if (!head || !table.floorGrid) return 1;
  const total = table.floorGrid.reduce((sum, width) => sum + width, 0);
  const drawn = head.table.getBoundingClientRect().width / layoutScale(head.table);
  if (!(total > 0 && drawn > 0)) return 1;
  const scale = drawn / total;
  if (readWordTableLayout(head.node.attrs)?.preferredWidthPct !== undefined) return scale;
  return scale < OVERFULL_SCALE ? scale : 1;
}

/** The widths of a table keeping its grid, in units of the grid. Drawn narrower
 * than its columns ask, a table gives room from what each asks for itself, not
 * from the scaled grid (`wordMinContentFloorWidths`). */
function floorWidthsOf(
  grid: readonly number[],
  columns: readonly WordAutofitColumn[],
  scale: number,
  growTo?: number,
): number[] | null {
  const held = withFloorFitSlack(columns);
  if (scale > 0 && scale < 1) {
    const total = grid.reduce((sum, width) => sum + width, 0);
    return wordMinContentFloorWidths(grid, held, total * scale)?.map((width) => width / scale) ?? null;
  }
  return wordMinContentFloorWidths(grid, columnsInGridUnits(held, scale), undefined, growTo);
}

/** `window.__docsShareTableGrowOff`: a table keeps its share of the text column
 * (or, of no width of its own, ends where the column does) however much its
 * narrowest contents need (as before; A/B). */
function shareTableGrowthOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsShareTableGrowOff?: boolean }).__docsShareTableGrowOff === true;
}

/**
 * The room an in-flow table keeping its grid stands in, CSS px, from its own
 * left edge to the right margin: the text column less its indent (a negative
 * indent adds to it, `signed`; Word's room, tables/probes/pctmin), and for an
 * older Word table the cell margin it reaches past the column on each side.
 * Null for a table that is not in flow by its indent.
 */
function tableRoom(head: Fragment, layout: WordTableLayout, signed: boolean): { container: number; outset: number; room: number } | null {
  const container = drawnWidth(head.wrapper);
  if (!(container > 0)) return null;
  const align = normalizeTableAlign(head.node.attrs.tableAlign);
  const stated = align === null ? normalizeTableIndentPx(head.node.attrs.tableIndentPx) ?? 0 : 0;
  const indent = signed ? stated : Math.max(0, stated);
  let outset = 0;
  if (layout.textAligned && (align === null || align === "center")) {
    // An older Word table reaches one cell margin past the column on each side.
    const firstCell = head.node.firstChild?.firstChild;
    const lastCell = head.node.firstChild?.lastChild;
    outset = (firstCell ? wordCellHorizontalMargins(head.node, firstCell).left ?? 0 : 0) +
      (lastCell ? wordCellHorizontalMargins(head.node, lastCell).right ?? 0 : 0);
  }
  return { container, outset, room: container - indent + outset };
}

/**
 * How wide a table keeping its grid may grow when a word widens one of its
 * columns: the room it stands in, for a table that states no width of its own
 * (`w:tblW` auto over cells with widths; `wordMinContentFloorWidths`). Undefined
 * for a table with a stated width or share, which keeps it (or grows by
 * `shareTableGrowth`).
 */
function floorGrowRoom(table: LogicalTable): number | undefined {
  const head = table.fragments[0];
  if (!head) return undefined;
  const layout = readWordTableLayout(head.node.attrs);
  if (!layout || layout.contentFit !== null || layout.fixedLayout ||
      layout.preferredWidthPct !== undefined || layout.preferredWidthTwips !== undefined) return undefined;
  return tableRoom(head, layout, false)?.room;
}

/**
 * The width a table over cells with widths is drawn at because its columns'
 * narrowest contents need more than it is drawn at (`wordShareTableGrowth`),
 * CSS px; null when that holds them. The table is a share of the text column,
 * or of no width of its own over cells wider than the room it stands in (Word
 * draws both alike, tables/probes/pctmin M07/M08/N05; a table of no width whose
 * cells fit keeps them and widens a column by `floorGrowRoom`).
 */
function shareTableGrowth(table: LogicalTable, columns: readonly WordAutofitColumn[]): number | null {
  if (shareTableGrowthOff()) return null;
  const head = table.fragments[0];
  if (!head || !table.floorGrid) return null;
  const layout = readWordTableLayout(head.node.attrs);
  if (!layout || layout.contentFit !== null || layout.fixedLayout || layout.bidiVisual ||
      layout.preferredWidthTwips !== undefined) return null;
  // Measured for a left-aligned table in the body; a nested or aligned one keeps its share.
  if (normalizeTableAlign(head.node.attrs.tableAlign) !== null || head.table.parentElement?.closest("table")) return null;
  const room = tableRoom(head, layout, true);
  if (!room) return null;
  let share: number;
  if (layout.preferredWidthPct !== undefined) {
    share = (room.container * layout.preferredWidthPct) / 5000 + room.outset;
  } else {
    // Drawn as the view draws it: the grid, or the column from the indent when the grid is wider.
    const drawn = tableRoom(head, layout, false)?.room ?? 0;
    const grid = table.floorGrid.reduce((sum, width) => sum + width, 0);
    if (!(grid > drawn + 0.5)) return null;
    share = drawn;
  }
  const sumMin = withFloorFitSlack(columns).reduce((sum, column) => sum + column.minPx, 0);
  return wordShareTableGrowth(sumMin, share, room.room);
}

/** The width the table view draws a table at besides its grid's: its outer
 * rules' halves, which a native border box holds (set by the table view). */
export const NATIVE_GRID_USED_WIDTH_ATTR = "data-native-grid-used-width";
/** On a table drawn at the width it grew to (`wordShareTableGrowthFor`). */
export const WORD_SHARE_GROWN_ATTR = "data-word-share-grown";
/** Asks the table view to draw a table's width and columns again. */
export const NATIVE_GRID_RESYNC_EVENT = "mrai-native-grid-resync";

/**
 * Draws a table at the width it grew to (`wordShareTableGrowthFor`), or hands
 * one that no longer grows back to its view. Whether it changed.
 */
function applyShareGrowth(table: HTMLTableElement, widthPx: number | null): boolean {
  if (widthPx === null) {
    if (!table.hasAttribute(WORD_SHARE_GROWN_ATTR)) return false;
    table.removeAttribute(WORD_SHARE_GROWN_ATTR);
    table.dispatchEvent(new CustomEvent(NATIVE_GRID_RESYNC_EVENT));
    return true;
  }
  const before = table.style.width;
  const used = Number.parseFloat(table.getAttribute(NATIVE_GRID_USED_WIDTH_ATTR) ?? "") || 0;
  table.style.width = `${widthPx + used}px`;
  table.style.maxWidth = "none";
  table.setAttribute(WORD_SHARE_GROWN_ATTR, "true");
  return table.style.width !== before;
}

/**
 * A column widened to its narrowest content holds it by a hair more than the
 * page measured. The floor is the browser's own min-content width, snapped to
 * its 1/64 px layout unit, and so are the column share and the cell box made
 * from it; the text engine sums the same glyphs unsnapped and found the word a
 * fiftieth of a pixel wider than the box built for it, so it cut the word
 * the column was widened to hold (corpus R283-D20 "SECURITY_S" and R282-D08
 * "HUMANITARI", 22pt Arial Bold in a 184.17 px text box: Word and the browser
 * draw one line, the engine's margin was -0.02 px and it broke after
 * "SECURITY_"). Four layout units cover the snaps between the two.
 */
const FLOOR_FIT_SLACK_PX = 1 / 16;

function withFloorFitSlack(columns: readonly WordAutofitColumn[]): readonly WordAutofitColumn[] {
  return columns.map((column) => {
    if (!(column.minPx > 0)) return column;
    const minPx = column.minPx + FLOOR_FIT_SLACK_PX;
    return { ...column, minPx, maxPx: Math.max(column.maxPx, minPx) };
  });
}

/** Content columns in units of the stored grid (`floorGridScale`). */
function columnsInGridUnits(columns: readonly WordAutofitColumn[], scale: number): readonly WordAutofitColumn[] {
  if (scale === 1) return columns;
  return columns.map((column) => ({
    minPx: column.minPx / scale,
    maxPx: column.maxPx / scale,
    chromePx: (column.chromePx ?? 0) / scale,
  }));
}

/** Each grid column's narrowest and widest content box, margins included. */
function contentColumns(
  table: LogicalTable,
  cells: Map<string, CellContent>,
): WordAutofitColumn[] | null {
  const head = table.fragments[0];
  if (!head) return null;
  let columnCount = 0;
  try {
    columnCount = TableMap.get(head.node).width;
  } catch {
    return null;
  }
  if (columnCount <= 0) return null;
  const columns: { minPx: number; maxPx: number; chromePx: number }[] = Array.from(
    { length: columnCount },
    () => ({ minPx: 0, maxPx: 0, chromePx: 0 }),
  );
  // A table keeping its grid: a grid filler is no cell (Word draws the row
  // short there), and a merged cell over columns no cell of their own holds
  // shares what it asks by the grid (`enlargeColumns`).
  const grid = table.floorGrid && !autofitSpanGridOff() ? table.floorGrid : null;
  // Cells of one column first; a merged cell then enlarges the columns it
  // spans as far as its own content asks (ISO 29500 ST_TblLayoutType).
  const merged: { column: number; span: number; min: number; max: number; chrome: number }[] = [];
  for (const [key, entry] of cells) {
    const column = Number(key.slice(key.indexOf(":") + 1));
    const target = columns[column];
    if (!target) continue;
    if (grid && entry.filler) continue;
    const padding = (entry.marginLeft === null || entry.marginRight === null) && entry.element
      ? getComputedStyle(entry.element)
      : null;
    // The cell's own border sits inside its column in the collapsed model
    // (half on each side), so the content box was one border narrower than
    
    const lines = (usedBorderWidth(entry.element, "left") + usedBorderWidth(entry.element, "right")) / 2;
    const chrome = entry.marginLeft !== null && entry.marginRight !== null && !autofitMarginLinesOld()
      ? wordMarginChrome(entry.marginLeft + entry.marginRight, entry.element, lines)
      : (entry.marginLeft ?? (Number.parseFloat(padding?.paddingLeft ?? "") || 0)) +
        (entry.marginRight ?? (Number.parseFloat(padding?.paddingRight ?? "") || 0)) +
        lines;
    if (entry.span > 1) {
      merged.push({ column, span: entry.span, min: entry.min + chrome, max: entry.max + chrome, chrome });
      continue;
    }
    target.minPx = Math.max(target.minPx, entry.min + chrome);
    target.maxPx = Math.max(target.maxPx, entry.max + chrome);
    target.chromePx = Math.max(target.chromePx, chrome);
  }
  for (const cell of merged.sort((a, b) => a.span - b.span)) {
    const spanned = columns.slice(cell.column, cell.column + cell.span);
    const weights = grid?.slice(cell.column, cell.column + cell.span);
    enlargeColumns(spanned, "minPx", cell.min, weights);
    enlargeColumns(spanned, "maxPx", cell.max, weights);
  }
  return columns;
}

/** Columns a merged cell spans, grown in proportion to what they hold until
 * together they reach the cell's width. Where one of them holds nothing of its
 * own (no cell stands in that column alone) and the table keeps its grid
 * (`weights`), they grow in proportion to their grid widths: Word gives a
 * merged cell's narrowest content to its columns by their widths. Shared by
 * what they held, every pixel went to the one column a grid filler held, and
 * a 284-twip column under "References" (1560 twips over 1276 + 284) drew
 * 44 pt where Word draws 14.2, every other column narrower (R493-D22: three
 * cells a line longer, the last paragraph alone on a page Word does not have).
 * `window.__docsAutofitSpanGridOff` shares by what they held, as before. */
function enlargeColumns(
  columns: { minPx: number; maxPx: number }[],
  side: "minPx" | "maxPx",
  needed: number,
  weights?: readonly number[],
): void {
  const held = columns.reduce((sum, column) => sum + column[side], 0);
  if (!(needed > held) || !columns.length) return;
  const weightTotal = weights?.length === columns.length ? weights.reduce((sum, value) => sum + Math.max(0, value), 0) : 0;
  const byGrid = weightTotal > 0 && columns.some((column) => !(column[side] > 0));
  for (const [index, column] of columns.entries()) {
    column[side] += (needed - held) * (byGrid
      ? Math.max(0, weights![index]) / weightTotal
      : held > 0 ? column[side] / held : 1 / columns.length);
    column.maxPx = Math.max(column.maxPx, column.minPx);
  }
}

/** `window.__docsAutofitSpanGridOff = true`: a merged cell's columns grow by
 * what they hold and a grid filler counts as a cell, as before (A/B). */
function autofitSpanGridOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsAutofitSpanGridOff?: boolean }).__docsAutofitSpanGridOff === true;
}

/** `window.__docsAutofitMarginLinesOld = true`: a Word cell's column also
 * holds its two half lines beside its margins, as before (A/B). */
function autofitMarginLinesOld(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsAutofitMarginLinesOld?: boolean }).__docsAutofitMarginLinesOld === true;
}

/**
 * What a Word cell's column holds beside its text: its two margins, which
 * Word measures from the grid line, so the lines stand in them (ISO 29500
 * 17.4.42 tblCellMar; the table view draws the cell's padding as its margin
 * less half the used line, tableBorders.ts). Charged for its lines as well
 * every column of an AutoFit table asked half a point more than Word's, and
 * the one column whose word set its width took the others' share: R484-D95's
 * first column drew 61.12 pt where Word draws 60.48, and "who does a
 * thorough" kept "a thorough" on the line Word ends at "does" (Windows Word,
 * probes tbl23 a1: each column its longest word plus its two margins,
 * +-0.2 pt). Where the padding drawn and the lines need more than the margins
 * (a margin narrower than half its line), that is what the column holds.
 */
function wordMarginChrome(margins: number, cell: HTMLElement | null, lines: number): number {
  if (!cell) return margins;
  const box = usedCellBox(cell);
  return Math.max(margins, box.paddingLeft + box.paddingRight + lines);
}

/** A cell's used border widths, by what the stylesheet can see of the cell and
 * its table: every table a page pass touched asked in the middle of the view's
 * update, each asking a style pass of the whole page (28 s of a 30-page
 * document of tables opening). */
/** A cell's used border widths and the padding drawn inside them, CSS px. */
interface UsedCellBox {
  readonly left: number;
  readonly right: number;
  readonly paddingLeft: number;
  readonly paddingRight: number;
}

const usedBorders = new Map<string, UsedCellBox>();
const USED_BORDERS_KEPT = 512;

/** Attributes that name a place rather than say anything a border rule reads:
 * the same cell's row range changes with every pass that re-cuts its table. */
const PLACE_ATTRIBUTE = /^(?:id|data-block-id|data-page-table-fragment-|data-page-table-source-|colwidth|data-colwidth|data-row-height)/;

function attributesText(element: Element | null): string {
  if (!element) return "";
  let text = "";
  for (const { name, value } of Array.from(element.attributes)) {
    if (PLACE_ATTRIBUTE.test(name)) continue;
    // A table's or row's own width and margins are the page's; only its custom
    // properties reach its cells' borders.
    const said = name === "style" && element.tagName !== "TD" && element.tagName !== "TH"
      ? (value.match(/--[^;]+/g) ?? []).join(";")
      : value;
    text += `${name}=${said}\u0001`;
  }
  return text;
}

function readUsedBorders(cell: HTMLElement): UsedCellBox {
  const style = getComputedStyle(cell);
  const width = (line: string, value: string) => (line === "none" || line === "hidden" ? 0 : Number.parseFloat(value) || 0);
  return {
    left: width(style.borderLeftStyle, style.borderLeftWidth),
    right: width(style.borderRightStyle, style.borderRightWidth),
    paddingLeft: Number.parseFloat(style.paddingLeft) || 0,
    paddingRight: Number.parseFloat(style.paddingRight) || 0,
  };
}

function usedCellBox(cell: HTMLElement): UsedCellBox {
  // Out of the document a cell has no style to read, which says nothing of
  // the same cell in the page.
  if (!cell.isConnected) return readUsedBorders(cell);
  const row = cell.parentElement;
  const key = `${cell.tagName}\u0002${(cell as HTMLTableCellElement).cellIndex}\u0002${attributesText(cell)}\u0002${attributesText(row)}\u0002${attributesText(cell.closest("table"))}`;
  let borders = usedBorders.get(key);
  if (!borders) {
    borders = readUsedBorders(cell);
    if (usedBorders.size >= USED_BORDERS_KEPT) usedBorders.clear();
    usedBorders.set(key, borders);
  }
  return borders;
}

function usedBorderWidth(cell: Element | null | undefined, side: "left" | "right"): number {
  if (!(cell instanceof HTMLElement)) return 0;
  return usedCellBox(cell)[side];
}

/** The table's widths in its current container, from its content columns. */
function geometryFor(
  table: LogicalTable,
  columns: readonly WordAutofitColumn[],
): WordAutofitGeometry | null {
  const head = table.fragments[0];
  if (!head || columns.length === 0) return null;
  const firstRow = head.table.rows[0];
  const outerLeft = usedBorderWidth(firstRow?.cells[0], "left");
  const outerRight = usedBorderWidth(firstRow?.cells[firstRow.cells.length - 1], "right");
  const borderAllowancePx = (outerLeft + outerRight) / 2;
  const container = drawnWidth(head.wrapper);
  // A table not laid out has no column yet: read again once it has.
  if (!(container > 0)) return null;
  const aligned = normalizeTableAlign(head.node.attrs.tableAlign) !== null;
  const indent = aligned ? 0 : normalizeTableIndentPx(head.node.attrs.tableIndentPx) ?? 0;
  const layout = readWordTableLayout(head.node.attrs);
  // A share of the text column is a share of the whole column: the indent
  // moves the table and takes nothing from it (Word 16.86 fixture c3, mode
  // 15: tblW pct 2500 with no cell widths under tblInd 1440 in a 9026-twip
  // column draws 2256 + 2251 twips, half the column; half of what the indent
  // leaves is 3793). An AutoFit table with no share still fills what is left.
  let available = table.width.type === "pct" ? container : container - indent;
  if (layout?.textAligned && !aligned) {
    // The table reaches one cell margin past the text column on each side.
    const firstCell = head.node.firstChild?.firstChild;
    const lastCell = head.node.firstChild?.lastChild;
    const firstMargins = firstCell ? wordCellHorizontalMargins(head.node, firstCell) : null;
    const lastMargins = lastCell ? wordCellHorizontalMargins(head.node, lastCell) : null;
    available += (firstMargins?.left ?? 0) + (lastMargins?.right ?? 0);
  } else {
    const spaced = spacedTableChromePx(head, columns.length);
    if (spaced !== null) {
      // Cells standing apart (w:tblCellSpacing): the table's frame is the
      // text column, and the spacing between and around the cells and the
      // table's own border come out of it before the columns share the rest
      // (Word 16.86, corpus R287-D30: an AutoFit table with 15-twip spacing
      // in a 451.3pt column, its frame 72-523.4pt, its cells 123.4 / 131.3 /
      // 190.0pt; the columns took the whole column and the frame stood 6.7pt
      // past the right margin).
      available -= spaced;
      const widths = wordAutofitColumnWidths(columns, available, table.width);
      if (widths.length !== columns.length || widths.some((width) => !(width > 0))) return null;
      return { widths, borderAllowancePx: spaced };
    }
    available -= borderAllowancePx;
  }
  const widths = wordAutofitColumnWidths(columns, available, table.width);
  if (widths.length !== columns.length || widths.some((width) => !(width > 0))) return null;
  return { widths, borderAllowancePx };
}

/** The width a table with cell spacing draws besides its columns (separate
 * borders): the spacing before, between and after its cells and its own
 * left and right border. Null for a table without spacing, or
 * `window.__docsSpacedTableFrameOff = true` (A/B: the columns take it all). */
function spacedTableChromePx(head: LogicalTable["fragments"][number], columnCount: number): number | null {
  const spacing = Number(head.node.attrs.tableCellSpacingPx ?? 0);
  if (!(Number.isFinite(spacing) && spacing > 0)) return null;
  if (typeof window !== "undefined" && (window as Window & { __docsSpacedTableFrameOff?: boolean }).__docsSpacedTableFrameOff === true) return null;
  const style = getComputedStyle(head.table);
  if (style.borderCollapse !== "separate") return null;
  const gap = Number.parseFloat(style.borderSpacing) || 0;
  const border = (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0);
  return gap * (columnCount + 1) + border;
}

interface MeasuredTable {
  readonly nodes: readonly ProseMirrorNode[];
  readonly elements: readonly HTMLTableElement[];
  readonly docAttrs: unknown;
  readonly fonts: string;
  readonly columns: readonly WordAutofitColumn[];
  /** The widths projected from the columns, and what they were read in. */
  readonly projected?: ProjectedFrame;
  /** `floorGridScale` of a table keeping its grid, as last read. */
  readonly floorScale?: number;
}

/**
 * The geometry a top-level table was given and what decided it besides its
 * columns: its fragments' wrappers and the sheets around them, as they were
 * (the column the table fills is the sheet's: its section's page and
 * columns, less the floats beside it). The same on the next pass, with the columns kept and no change
 * inside the table, the geometry is the same, and so are the widths written:
 * every pass read every table's borders and box again (R286-D01: 1,118
 * tables on 121 sheets, most of them sheets the browser had skipped, laid
 * out and styled for the read), and wrote them back unchanged.
 */
interface ProjectedFrame {
  readonly geometry: WordAutofitGeometry;
  readonly wrappers: readonly HTMLElement[];
  readonly sheets: readonly (Element | null)[];
  readonly frameKey: string;
}

/** On unless `window.__docsEngineWidthsKept = false` (development A/B): the
 * widths the engine says for a table's blocks are kept for the next pass, as
 * the page's readings are (blockWidths). */
function engineWidthsKept(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsEngineWidthsKept?: boolean }).__docsEngineWidthsKept !== false;
}

/** On unless `window.__docsNestedShareTables = false` (development A/B): a
 * nested table laid out fixed at a share of its cell is said by the engine
 * (shareTableContentWidths), not read in both measurement modes. */
function nestedShareTablesByEngine(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsNestedShareTables?: boolean }).__docsNestedShareTables !== false;
}

/** On unless `window.__docsTableFrameStamps = true` (development A/B): the
 * stamps a page pass writes on a sheet are no part of its tables' frame. */
function sheetStampsKeepColumn(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsTableFrameStamps?: boolean }).__docsTableFrameStamps !== true;
}

/** The floats on a sheet a table's box may stand beside: the floated objects
 * and the text-wrap shadows (floatBothSidesWrap). */
const SHEET_FLOATS = "[data-float-mode], [data-float-wrap-shadow]";

/**
 * What decides the column a sheet's tables fill, besides their own content:
 * the sheet's attributes (its section's page, margins and columns) and the
 * floats on it, which narrow a table's box standing beside them. Each sheet
 * once a projection (`known`).
 */
function sheetFrameKey(sheet: Element | null, known: Map<Element, string>): string {
  if (!sheet) return "";
  let key = known.get(sheet);
  if (key !== undefined) return key;
  key = "";
  const stampsKeep = sheetStampsKeepColumn();
  for (const name of sheet.getAttributeNames()) {
    // A sheet going dormant or waking (paged/sheetDormancy) keeps its column.
    if (name === "data-page-dormant") continue;
    // So do the page numbers and spans a page pass stamps on the sheet: a
    // pass that moved the blocks of every later page (a line more on page 64)
    // stamped every later sheet anew, and every table on them was read again
    // (R286-D01: 110 of its tables a pass, each read a style recalc; in WebKit
    // every dormant sheet holding one woken). The parity stays: a mirrored
    // margin moves the column.
    if (stampsKeep && SHEET_STAMPS.has(name) && !name.includes("parity") && name !== "data-page-oversize") continue;
    key += ` ${name}=${sheet.getAttribute(name) ?? ""}`;
  }
  for (const float of Array.from(sheet.querySelectorAll(SHEET_FLOATS))) {
    key += `|${float.getAttribute("data-float-mode") ?? ""}:${float.getAttribute("style") ?? ""}:${float.getAttribute("class") ?? ""}`;
  }
  known.set(sheet, key);
  return key;
}

/** The frame key of a table's fragments: their sheets', and their wrappers'
 * own attributes (outside the table, so no change the table's observer sees). */
function frameKeyOf(table: LogicalTable, sheets: readonly (Element | null)[], known: Map<Element, string>): string {
  const wrappers = table.fragments.map((fragment) =>
    fragment.wrapper === fragment.table
      ? ""
      : fragment.wrapper.getAttributeNames().map((name) => `${name}=${fragment.wrapper.getAttribute(name) ?? ""}`).join(" "));
  return `${sheets.map((sheet) => sheetFrameKey(sheet, known)).join("\u0002")}\u0003${wrappers.join("\u0002")}`;
}

function sameProjectedFrame(
  frame: ProjectedFrame | undefined,
  table: LogicalTable,
  sheets: readonly (Element | null)[],
  known: Map<Element, string>,
): boolean {
  return Boolean(frame) &&
    frame!.wrappers.length === table.fragments.length &&
    table.fragments.every((fragment, index) => fragment.wrapper === frame!.wrappers[index] && sheets[index] === frame!.sheets[index]) &&
    frameKeyOf(table, sheets, known) === frame!.frameKey;
}

interface MeasurementState {
  /** Content columns by logical table key, from the last projection. */
  readonly measured: Map<string, MeasuredTable>;
  /** Rendered tables whose DOM changed since they were measured. */
  readonly dirty: Set<Element>;
  readonly observer: MutationObserver | null;
}

const measurementByView = new WeakMap<EditorView, MeasurementState>();

const OBSERVED_TABLE_CHANGES: MutationObserverInit = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
};

function markDirty(dirty: Set<Element>, records: readonly MutationRecord[]): void {
  for (const record of records) {
    const target = record.target;
    const element = target instanceof Element ? target : target.parentElement;
    // A nested table's content is its outer tables' content too.
    let table = element?.closest("table") ?? null;
    while (table) {
      dirty.add(table);
      table = table.parentElement?.closest("table") ?? null;
    }
  }
}

function measurementState(view: EditorView): MeasurementState {
  let state = measurementByView.get(view);
  if (!state) {
    const dirty = new Set<Element>();
    state = {
      measured: new Map(),
      dirty,
      observer: typeof MutationObserver === "function"
        ? new MutationObserver((records) => markDirty(dirty, records))
        : null,
    };
    measurementByView.set(view, state);
  }
  return state;
}

function measuredFragmentsMatch(
  measured: MeasuredTable,
  table: LogicalTable,
  dirty: ReadonlySet<Element>,
): boolean {
  return measured.nodes.length === table.fragments.length &&
    table.fragments.every((fragment, index) =>
      fragment.node === measured.nodes[index] &&
      fragment.table === measured.elements[index] &&
      !dirty.has(fragment.table));
}

/**
 * Forget every measured content width: the ledger calls this when a layout
 * input outside the document changed (fonts, surface geometry, view mode).
 */
export function invalidateWordAutofitMeasurements(view: EditorView): void {
  measurementByView.get(view)?.measured.clear();
  blockWidthsEpoch += 1;
}

/** Put the projected widths on one rendered fragment. */
export function applyWordAutofitGeometry(
  table: HTMLTableElement,
  colgroup: Element | null,
  geometry: WordAutofitGeometry,
): void {
  const total = geometry.widths.reduce((sum, width) => sum + width, 0);
  table.setAttribute(WORD_AUTOFIT_DISPLAY_ATTR, "true");
  table.style.width = `${total + geometry.borderAllowancePx}px`;
  table.style.minWidth = "0px";
  table.style.maxWidth = "none";
  const columns = colgroup ? Array.from(colgroup.children) : [];
  geometry.widths.forEach((width, index) => {
    const column = columns[index];
    if (column instanceof HTMLElement) {
      column.style.width = `${width}px`;
      column.style.removeProperty("min-width");
    }
  });
}

export function clearWordAutofitGeometry(table: HTMLTableElement): void {
  if (!table.hasAttribute(WORD_AUTOFIT_DISPLAY_ATTR)) return;
  table.removeAttribute(WORD_AUTOFIT_DISPLAY_ATTR);
  table.style.removeProperty("min-width");
  table.style.removeProperty("max-width");
}

/**
 * The left margin that places a Word table where Word does: in Word 2010
 * compatibility the first column starts one left cell margin before the
 * indent (half its used outer border further out); otherwise the table's
 * border edge is at the indent.
 */
export function wordTableDisplayMarginLeftPx(
  node: ProseMirrorNode,
  table: HTMLTableElement,
): number | null {
  if (readWordTableLayout(node.attrs)?.textAligned !== true) return null;
  if (normalizeTableAlign(node.attrs.tableAlign) !== null) return null;
  // A floating table positioned by an ALIGNMENT preset is placed by its own
  // frame position. One positioned by a plain distance from the margin or
  // column anchor (`w:tblpX`) starts from the very origin an in-flow table
  // starts from, so it keeps Word's legacy text-aligned outdent and simply
  // adds that distance.
  const anchorOffset = tablePositioningAnchorOffsetPx(node.attrs.tablePositioning);
  if (node.attrs.tablePositioning != null && anchorOffset === null) return null;
  const indent =
    (normalizeTableIndentPx(node.attrs.tableIndentPx) ?? 0) + (anchorOffset ?? 0);
  const firstCell = table.rows[0]?.cells[0];
  const spacing = Number(node.attrs.tableCellSpacingPx ?? 0);
  if (Number.isFinite(spacing) && spacing > 0) {
    // With cell spacing the cells stand apart (separate borders): the first
    // cell's text is its margin, its whole left border, the doubled spacing
    // and the table's own border from the table edge (Word 16 b-table: the
    // spaced table's frame sits 14.2pt left of the text margin).
    const tableBorder = Number.parseFloat(getComputedStyle(table).borderLeftWidth) || 0;
    const gap = Number.parseFloat(getComputedStyle(table).borderSpacing) || Math.round(2 * spacing);
    return indent - wordTableTextOutdentPx(node) - usedBorderWidth(firstCell, "left") -
      gap - tableBorder;
  }
  return indent - wordTableTextOutdentPx(node) - usedBorderWidth(firstCell, "left") / 2;
}

function findFragmentHeadBlockId(view: EditorView, fragmentId: string): string | null {
  let blockId: string | null = null;
  view.state.doc.descendants((node) => {
    if (blockId !== null) return false;
    if (node.type.name !== "table") return true;
    if (stringAttr(node, TABLE_FRAGMENT_ID_ATTR) === fragmentId) {
      blockId = stringAttr(node, MRNOTE_BLOCK_ID_ATTR);
    }
    return false;
  });
  return blockId;
}

/**
 * The column widths (CSS px, the stored grid's total) a table that keeps its
 * grid is drawn at because a column's unbreakable content is wider than it,
 * or null when the grid stands.
 */
export function wordMinContentFloorFor(
  view: EditorView | null | undefined,
  node: ProseMirrorNode,
): readonly number[] | null {
  if (!view) return null;
  const map = floorByView.get(view);
  if (!map || map.size === 0) return null;
  const fragmentId = stringAttr(node, TABLE_FRAGMENT_ID_ATTR);
  const blockId = stringAttr(node, MRNOTE_BLOCK_ID_ATTR);
  const direct = (fragmentId && map.get(fragmentId)) || (blockId && map.get(blockId));
  if (direct) return direct;
  if (!fragmentId) return null;
  const headBlockId = findFragmentHeadBlockId(view, fragmentId);
  return (headBlockId && map.get(headBlockId)) || null;
}

/**
 * The width (CSS px, between the grid's outer rule centres) a table keeping its
 * grid is drawn at because its columns' narrowest contents need more room than
 * its share of the text column or its cells give (`wordShareTableGrowth`), or
 * null when it is drawn as it asks.
 */
export function wordShareTableGrowthFor(
  view: EditorView | null | undefined,
  node: ProseMirrorNode,
): number | null {
  if (!view) return null;
  const map = grownByView.get(view);
  if (!map || map.size === 0) return null;
  const fragmentId = stringAttr(node, TABLE_FRAGMENT_ID_ATTR);
  const blockId = stringAttr(node, MRNOTE_BLOCK_ID_ATTR);
  const direct = (fragmentId && map.get(fragmentId)) || (blockId && map.get(blockId));
  if (direct) return direct;
  if (!fragmentId) return null;
  const headBlockId = findFragmentHeadBlockId(view, fragmentId);
  return (headBlockId && map.get(headBlockId)) || null;
}

/** The latest projected widths for a rendered table node, if it has any. */
export function wordAutofitGeometryFor(
  view: EditorView | null | undefined,
  node: ProseMirrorNode,
): WordAutofitGeometry | null {
  if (!view || !eligibleTable(node)) return null;
  const map = geometryByView.get(view);
  if (!map || map.size === 0) return null;
  const fragmentId = stringAttr(node, TABLE_FRAGMENT_ID_ATTR);
  const blockId = stringAttr(node, MRNOTE_BLOCK_ID_ATTR);
  const direct = (fragmentId && map.get(fragmentId)) || (blockId && map.get(blockId));
  if (direct) return direct;
  // A fresh continuation fragment: its head still carries the table's key.
  if (!fragmentId) return null;
  const headBlockId = findFragmentHeadBlockId(view, fragmentId);
  return (headBlockId && map.get(headBlockId)) || null;
}

function loadingFontsKey(document: Document): string {
  return `loading:${fontFaceNewsCount(document) ?? 0}:${document.fonts?.size ?? 0}`;
}

/**
 * Whether an element is on a sheet past `throughSheet` (the last sheet the
 * page ledger measures this pass): one its progressive layout has yet to
 * reach. Null when the pass measures every sheet.
 */
function sheetsPast(view: EditorView, throughSheet: number | null | undefined): ((element: Element) => boolean) | null {
  if (typeof throughSheet !== "number" || !Number.isFinite(throughSheet)) return null;
  const index = new Map<Element, number>();
  let at = 0;
  for (const child of Array.from(view.dom.children)) {
    if (!child.matches("article[data-page-sheet]")) continue;
    index.set(child, at);
    at += 1;
  }
  return (element) => {
    const sheet = element.closest("article[data-page-sheet]");
    const position = sheet ? index.get(sheet) : undefined;
    return position !== undefined && position > throughSheet;
  };
}

/** Why a table is measured again (the harness's counts, autofitStats). */
function staleReason(
  measured: MeasuredTable | undefined,
  table: LogicalTable,
  fonts: string | null,
  docAttrs: unknown,
  dirty: ReadonlySet<Element>,
): string {
  if (!measured) return "stale:new";
  if (measured.fonts !== fonts) return "stale:fonts";
  if (measured.docAttrs !== docAttrs) return "stale:docAttrs";
  if (measured.nodes.length !== table.fragments.length) return "stale:fragments";
  if (table.fragments.some((fragment, index) => fragment.node !== measured.nodes[index])) return "stale:node";
  if (table.fragments.some((fragment, index) => fragment.table !== measured.elements[index])) return "stale:element";
  if (table.fragments.some((fragment) => dirty.has(fragment.table))) return "stale:dirty";
  return "stale:other";
}

/** Counts for a harness that asked for the page ledger's trace
 * (`window.__pageLedgerTrace`): tables measured, geometries read and kept. */
function autofitStats(view: EditorView, kind: string, count = 1): void {
  const win = view.dom.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[]; __docsAutofitStats?: Record<string, number> }) | null;
  if (!win || !Array.isArray(win.__pageLedgerTrace)) return;
  const stats = (win.__docsAutofitStats ??= {});
  stats[kind] = (stats[kind] ?? 0) + count;
}

/**
 * Measure every content-fit Word table whose content may have changed and
 * project the widths of all of them. Returns true when any rendered width
 * changed.
 */
export interface WordAutofitProjectionOptions {
  /**
   * The last sheet the page ledger measures this pass (its progressive
   * horizon). A table measured before whose page lies past it keeps its
   * widths until a pass reaches its page. Absent or null: every sheet.
   */
  readonly measureThroughSheet?: number | null;
}

/** The widest each column of a table keeping its grid has read, for as long as
 * the table's words and the faces stay. */
const floorColumnsByView = new WeakMap<EditorView, Map<string, { words: string; fonts: string; columns: readonly WordAutofitColumn[] }>>();

/**
 * A column's narrowest width is the widest word of all its rows. What is read is
 * the rows of the pieces laid out now, so a table's reading moved as it was cut:
 * lower when a piece went unread, and its columns were drawn at another share
 * (18.654%, 18.655%, the grid's 20%). Every row then read another height and the
 * plan put the cut pages back: a 45-row table went 12 pages, back to 3, for ever
 * (corpus R282-D26, 4 pages for Word's 25). No reading is more than a part of
 * the truth, so the widest so far stands.
 */
function widestColumnsYet(
  view: EditorView,
  table: LogicalTable,
  columns: readonly WordAutofitColumn[],
  fonts: string,
): readonly WordAutofitColumn[] {
  let seen = floorColumnsByView.get(view);
  if (!seen) floorColumnsByView.set(view, (seen = new Map()));
  let words = "";
  for (const fragment of table.fragments) {
    fragment.node.forEach((row) => {
      if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] !== true) words += row.textContent;
    });
  }
  const key = table.keys[0];
  const known = seen.get(key);
  const widest = known && known.words === words && known.fonts === fonts && known.columns.length === columns.length
    ? columns.map((column, index) => ({
        ...column,
        minPx: Math.max(column.minPx, known.columns[index].minPx),
        maxPx: Math.max(column.maxPx, known.columns[index].maxPx),
      }))
    : columns;
  seen.set(key, { words, fonts, columns: widest });
  return widest;
}

export function projectWordAutofitTables(view: EditorView, options: WordAutofitProjectionOptions = {}): boolean {
  const tables = collectLogicalTables(view);
  const map = registry(view);
  let floors = floorByView.get(view);
  if (!floors) {
    floors = new Map();
    floorByView.set(view, floors);
  }
  let grown = grownByView.get(view);
  if (!grown) {
    grown = new Map();
    grownByView.set(view, grown);
  }
  const state = measurementState(view);
  if (state.observer) markDirty(state.dirty, state.observer.takeRecords());
  if (tables.length === 0) {
    map.clear();
    floors.clear();
    grown.clear();
    state.measured.clear();
    state.dirty.clear();
    state.observer?.disconnect();
    return false;
  }
  const legacy = docsLayoutPerfLegacy();
  const sheetKeys = new Map<Element, string>();
  const loaded = loadedFontsKey(view.dom.ownerDocument);
  // While faces are loading every measurement is provisional: it is kept
  // only until the next face arrives (the key moves on with it) and never
  // past the end of the loading, whose key differs. Measuring every table
  // again on every pass while a long document's faces came in was most of
  // the projection's cost (R286-D01: 11,668 table measurements, 71 passes).
  const fonts = loaded ?? (legacy ? null : loadingFontsKey(view.dom.ownerDocument));
  const docAttrs: unknown = view.state.doc.attrs;
  const columnsByTable = new Map<LogicalTable, readonly WordAutofitColumn[] | null>();
  const kept = new Map<LogicalTable, MeasuredTable>();
  const deferred = new Map<LogicalTable, MeasuredTable>();
  const after = legacy ? null : sheetsPast(view, options.measureThroughSheet);
  const stale: LogicalTable[] = [];
  for (const table of tables) {
    const measured = state.measured.get(table.keys[0]);
    if (
      state.observer &&
      fonts !== null &&
      measured?.fonts === fonts &&
      measured.docAttrs === docAttrs &&
      measuredFragmentsMatch(measured, table, state.dirty)
    ) {
      columnsByTable.set(table, measured.columns);
      kept.set(table, measured);
    } else if (
      after && measured && state.observer &&
      (table.floorGrid !== null || measured.projected !== undefined) &&
      table.fragments.every((fragment) => after(fragment.wrapper))
    ) {
      // A table on a page the progressive layout has not reached keeps the
      // widths it was last given (its table view draws them as it redraws)
      // and is measured by the pass whose horizon reaches its page, as the
      // line metrics of such a page are (documentAutoLineSpacing).
      columnsByTable.set(table, measured.columns);
      deferred.set(table, measured);
    } else {
      stale.push(table);
      autofitStats(view, staleReason(measured, table, fonts, docAttrs, state.dirty));
    }
  }
  if (stale.length > 0) {
    const keyOf = !legacy && fonts !== null && textEngineEnabled("docs-layout")
      ? (table: LogicalTable) => blockWidthsKey(table, fonts, docAttrs)
      : undefined;
    const remembered = keyOf ? stale.filter((table) => blocksRemembered(table, keyOf(table))) : [];
    for (const table of remembered) {
      const cells = new Map<string, CellContent>();
      const memory = { under: keyOf!(table), read: true };
      readCellContent(view, table, "max", cells, memory);
      readCellContent(view, table, "min", cells, memory);
      columnsByTable.set(table, contentColumns(table, cells));
    }
    const unread = stale.filter((table) => !remembered.includes(table));
    autofitStats(view, "measured", unread.length);
    autofitStats(view, "remembered", remembered.length);
    if (unread.length > 0) {
      const contents = measureCellContent(view, unread, keyOf);
      for (const table of unread) columnsByTable.set(table, contentColumns(table, contents.get(table)!));
    }
    for (const table of stale) {
      const columns = columnsByTable.get(table);
      if (table.floorGrid && columns && fonts !== null) columnsByTable.set(table, widestColumnsYet(view, table, columns, fonts));
    }
  }
  // Tables with no paragraph between them, as Word's one table: read before
  // any width below is written.
  const floorScaleOf = (table: LogicalTable) =>
    kept.get(table)?.floorScale ?? deferred.get(table)?.floorScale ?? floorGridScale(table);
  const runs = new Map<readonly ProseMirrorNode[], LogicalTable[]>();
  for (const table of tables) {
    if (table.run && table.floorGrid && columnsByTable.get(table)) {
      runs.set(table.run, [...(runs.get(table.run) ?? []), table]);
    }
  }
  const sharedFloors = new Map<LogicalTable, readonly number[]>();
  for (const members of runs.values()) {
    const widths = wordAdjacentFloorWidths(members.map((table) => ({
      grid: table.floorGrid!,
      columns: columnsInGridUnits(withFloorFitSlack(columnsByTable.get(table)!), floorScaleOf(table)),
    })));
    members.forEach((table, index) => {
      if (widths?.[index]) sharedFloors.set(table, widths[index]);
    });
  }
  const measuredNext = new Map<string, MeasuredTable>();
  const next = new Map<string, WordAutofitGeometry>();
  const nextFloors = new Map<string, readonly number[]>();
  const nextGrown = new Map<string, number>();
  let changed = false;
  const remember = (table: LogicalTable, columns: readonly WordAutofitColumn[], projected?: ProjectedFrame, floorScale?: number) => {
    measuredNext.set(table.keys[0], {
      nodes: table.fragments.map((fragment) => fragment.node),
      elements: table.fragments.map((fragment) => fragment.table),
      docAttrs,
      fonts: fonts!,
      columns,
      projected,
      floorScale,
    });
  };
  // Read every table's geometry, then write every table's widths: reading
  // the next table after writing the last one made each read a forced style
  // recalc and layout of the page (a long document's tables, every ledger
  // pass). A table nested in a cell is sized by the cell around it, so the
  // tables are taken outermost first, one nesting level at a time, each
  // level reading after the levels around it were written.
  const levels: LogicalTable[][] = [];
  const depths = new Map<LogicalTable, number>();
  for (const table of tables) {
    let depth = 0;
    for (let at = table.fragments[0]?.table.parentElement?.closest("table"); at; at = at.parentElement?.closest("table")) depth += 1;
    depths.set(table, depth);
    (levels[depth] ??= []).push(table);
  }
  for (const level of legacy ? [tables] : levels) {
    if (!level) continue;
    const writes: Array<() => void> = [];
    // The earlier order (development A/B): each table written as it is read.
    const defer = (write: () => void) => (legacy ? write() : void writes.push(write));
    for (const table of level) {
      const columns = columnsByTable.get(table);
      const held = deferred.get(table);
      if (held) {
        // Still to be measured: the record stays as it was, stale.
        measuredNext.set(table.keys[0], held);
        if (table.floorGrid) {
          const widened = columns && !sharedFloors.has(table) ? shareTableGrowth(table, columns) : null;
          const floored = sharedFloors.get(table) ?? (columns
            ? widened !== null
              ? wordAutofitColumnWidths(withFloorFitSlack(columns), widened)
              : floorWidthsOf(table.floorGrid, columns, held.floorScale ?? 1, floorGrowRoom(table))
            : null);
          if (floored) for (const key of table.keys) nextFloors.set(key, floored);
          if (widened !== null) for (const key of table.keys) nextGrown.set(key, widened);
        } else if (held.projected) {
          for (const key of table.keys) next.set(key, held.projected.geometry);
        }
        autofitStats(view, "deferred");
        continue;
      }
      if (table.floorGrid) {
        if (!columns) continue;
        const floorScale = kept.get(table)?.floorScale ?? floorGridScale(table);
        // Kept once it measured something: a table not laid out yet reads zero.
        if (fonts !== null && columns.some((column) => column.minPx > 0)) remember(table, columns, undefined, floorScale);
        const widened = sharedFloors.has(table) ? null : shareTableGrowth(table, columns);
        const floored = sharedFloors.get(table) ?? (widened !== null
          ? wordAutofitColumnWidths(withFloorFitSlack(columns), widened)
          : floorWidthsOf(table.floorGrid, columns, floorScale, floorGrowRoom(table)));
        if (floored) for (const key of table.keys) nextFloors.set(key, floored);
        if (widened !== null) for (const key of table.keys) nextGrown.set(key, widened);
        const shown = floored ?? table.floorGrid;
        const total = shown.reduce((sum, width) => sum + width, 0);
        defer(() => {
          for (const fragment of table.fragments) {
            if (applyShareGrowth(fragment.table, widened)) changed = true;
            // Drawn by the table view as shares of the grid's total (its
            // native grid display), so only the shares change.
            if (!floored && fragment.table.getAttribute(WORD_MIN_CONTENT_FLOOR_ATTR) !== "true") continue;
            const colgroup = fragment.table.querySelector(":scope > colgroup");
            const shares = shown.map((width) => `${(width / total) * 100}%`);
            Array.from(colgroup?.children ?? []).forEach((column, index) => {
              if (!(column instanceof HTMLElement) || shares[index] === undefined) return;
              if (column.style.width !== shares[index]) {
                column.style.width = shares[index];
                changed = true;
              }
            });
            if (floored) fragment.table.setAttribute(WORD_MIN_CONTENT_FLOOR_ATTR, "true");
            else fragment.table.removeAttribute(WORD_MIN_CONTENT_FLOOR_ATTR);
            state.observer?.observe(fragment.table, OBSERVED_TABLE_CHANGES);
          }
          if (!floored) for (const fragment of table.fragments) state.observer?.observe(fragment.table, OBSERVED_TABLE_CHANGES);
        });
        continue;
      }
      if (!columns) continue;
      // A nested table's column is its outer cell, which the level above
      // may just have written: read again every pass.
      const sheets = depths.get(table) === 0 && !legacy
        ? table.fragments.map((fragment) => fragment.wrapper.closest("article[data-page-sheet]"))
        : null;
      const previous = kept.get(table)?.projected;
      if (sheets && previous && sameProjectedFrame(previous, table, sheets, sheetKeys)) {
        if (fonts !== null) remember(table, columns, previous);
        for (const key of table.keys) next.set(key, previous.geometry);
        autofitStats(view, "kept");
        continue;
      }
      const geometry = geometryFor(table, columns);
      if (!geometry) continue;
      autofitStats(view, "read");
      // Only a projected measurement is kept: an unrendered table measures
      // zero and must be measured again once it lays out.
      if (fonts !== null) {
        remember(table, columns, sheets
          ? { geometry, wrappers: table.fragments.map((fragment) => fragment.wrapper), sheets, frameKey: frameKeyOf(table, sheets, sheetKeys) }
          : undefined);
      }
      for (const key of table.keys) next.set(key, geometry);
      // Its borders and spacing, which the widths written below do not change.
      const margins = table.fragments.map((fragment) => wordTableDisplayMarginLeftPx(fragment.node, fragment.table));
      defer(() => {
        table.fragments.forEach((fragment, index) => {
          const colgroup = fragment.table.querySelector(":scope > colgroup");
          const before = fragment.table.style.width + "|" + Array.from(colgroup?.children ?? [])
            .map((column) => (column as HTMLElement).style.width).join(",");
          applyWordAutofitGeometry(fragment.table, colgroup, geometry);
          const margin = margins[index];
          if (margin !== null && margin !== undefined) fragment.table.style.marginLeft = `${margin}px`;
          const after = fragment.table.style.width + "|" + Array.from(colgroup?.children ?? [])
            .map((column) => (column as HTMLElement).style.width).join(",");
          if (before !== after) changed = true;
          state.observer?.observe(fragment.table, OBSERVED_TABLE_CHANGES);
        });
      });
    }
    for (const write of writes) write();
  }
  // The measurement and the widths just written are not content changes.
  state.observer?.takeRecords();
  // A deferred table that changed stays changed until it is measured.
  const stillDirty = [...deferred.keys()].flatMap((table) =>
    table.fragments.map((fragment) => fragment.table).filter((element) => state.dirty.has(element)));
  state.dirty.clear();
  for (const element of stillDirty) state.dirty.add(element);
  state.measured.clear();
  for (const [key, measured] of measuredNext) state.measured.set(key, measured);
  map.clear();
  for (const [key, geometry] of next) map.set(key, geometry);
  floors.clear();
  for (const [key, widths] of nextFloors) floors.set(key, widths);
  grown.clear();
  for (const [key, width] of nextGrown) grown.set(key, width);
  return changed;
}
