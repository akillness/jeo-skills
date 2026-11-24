/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { firstLayoutHoldsFaces } from "./paged/coldFirstLayout";
import { isWordLineMultiple, ptToPx } from "../../../../lib/office-units";
import { createBackgroundLane, requestLaneFrame } from "../../../../lib/background-work";
import { deferWhileSurfaceGlides } from "./surfaceGlide";
import { editsStayInsideTextblocks, plainTextEdits } from "./textblockOnlyEdits";
import { msSinceTyping, TYPING_IDLE_MS } from "../../../../lib/typing-session";
import { touchedRanges } from "./touchedTextblocks";
import { decorationMapping, removeDecorationList } from "./fastRangeMapping";
import { LAYOUT_METRICS_FLUSH_EVENT, sourceFontPlanIsReady, writeDocumentLayoutStatus, DOCUMENT_AUTO_LINE_SPACING_PENDING } from "./documentLayoutStatus";
import { blockDomLocator, type BlockDomLocator } from "./blockDomLocator";
import { blockTextReader, type BlockTextReader } from "./blockTextReader";
import { OFFICE_FONT_ASSETS_EVENT } from "../../../office-ribbon/officeFontAssets";
import { editorFontFamilies, facesUsedBy, loadedFaceRanges } from "./paged/ledger/ledgerFontRanges";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measureOfficeFontBoundingBox, measureOfficeFontLineBox } from "../../../office-ribbon/officeFontLineBox";
import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";
import { normalizeOfficeFontFace, officeFontFaceFamily } from "../../../office-ribbon/officeFontFace";
import { normalizeEastAsianFontFamilies, wordDocumentEastAsianSingleLineFactor } from "../../../../lib/document-word-line-metrics";
import { documentFontScriptRanges, wordComplexScriptFallbackFace } from "../extensions/TextStyling";
import { documentFormatPreviewRanges } from "../extensions/InactiveSelectionHighlight";
import { documentDisplayFontAliasFamilies, documentDisplayFontEastAsianAliasFamilies, documentDisplayFontPluginKey, documentMissingFontSubstitutes, missingFontStackFrom } from "./documentDisplayFonts";
import {guardAutoLineIntermediates} from './documentAutoLineSafety';
import { wordDocumentOwnFontLineMetrics, wordDocumentOwnWindowsLineEm, wordFileLineMetrics, wordFontFileIsRecorded, wordFontIsEastAsian, wordFontIsRecordedLatin, wordFontLineAscent, wordFontShipsRegularOnly } from "./wordFontMetrics";
import { wordEastAsianMissingGlyphFace, wordMarkerFallbackFace } from "./wordEastAsianCoverage";
import { resolveFontScriptSlices } from "../../../office-ribbon/officeFontScriptSlots";
import { readDocumentNumberingMarkerFact, type DocumentNumberingMarkerFact } from "./documentNumberingLayout";
import { bulletStyleForGlyph, DEFAULT_BULLET_STYLE, isNativeListMarkerHost, LIST_MARKER_HOST_SELECTOR, normalizeBulletStyle } from "./bulletListStyle";
import { PAGE_BLOCK_NODE, PAGE_LEDGER_CONVERGED_EVENT, SPLIT_CONTINUES_ATTR } from "./paged/paginationProjectionKeys";
import { REBALANCE_META } from "./paged/pageRebalanceExtension";
import { DOCUMENT_FIELD_NODE_NAME } from "./documentFieldValues";
import { newFontFacesOf } from "../../../../lib/font-face-news";
import { cssFontFamilyList } from "../../../../lib/css-font-family";
import { officeFontMetricMatchesWidths, officeFontSubstitution } from "../../../../lib/office-fonts/substitutes";
import { projectionCoversHorizon, recordProjectedHorizon, sheetsWithinMeasureHorizon } from "./paged/measureHorizon";
import { measureLineMetrics } from "../../../../lib/text-engine/measure";
import { DOCS_ENGINE_TAB_BREAK_CLASS, engineBreakStrutOff } from "../../../../lib/text-engine/docs-lines";
import { pageEngineFont, textEngineOn } from "../../../../lib/text-engine/page-adapter";
import { textEngineEnabled } from "../../../../lib/text-engine/flags";
import { offLineGridAt, sectionsOffLineGrid } from "./sectionLineGrid";
import { fragmentCarries } from "./paged/fragmentRoles";
import { autoLinesKeptOn, noteDrawnAutoLines, retireSeededLines, seededAutoLinesFor } from "./engineLinesKept";

/** This projection's coverage record in measureHorizon. */
const AUTO_LINE_HORIZON_KEY = "auto-line-spacing";

/** Word auto spacing multiplies the font's single-line box, not its em square.
 * These decorations are a display projection: source values remain untouched. */
export const documentAutoLineSpacingKey = new PluginKey<DecorationSet>("documentAutoLineSpacing");
const MAX_METRICS = 256;
/** Size the face's line metrics are read at before being scaled to the run's
 * real size. Large enough that the engine's whole-pixel quantization of the
 * ascent/descent stays under 0.05 percent of the resulting advance. */
const SINGLE_LINE_REFERENCE_PX = 1000;
export const AUTO_LINE_INTERMEDIATES_ATTR = "data-document-auto-intermediates";

/**
 * A face's line box in em from its served file (lib/text-engine): `box` is
 * hhea ascender - descender (or the declared overrides), `lineGap` its line
 * gap. Null where the engine is off for Docs or cannot know the face (a
 * system font, an installed font that differs from the file); "pending"
 * while the file loads.
 */
function engineLineRatios(font: string): { box: number; lineGap: number } | "pending" | null {
  if (!textEngineOn("docs")) return null;
  const engineFont = pageEngineFont(font);
  if (!engineFont) return null;
  const metrics = measureLineMetrics({ ...engineFont, followLocalOnly: true });
  if (metrics === "pending") return "pending";
  if (metrics === "unsupported") return null;
  const size = engineFont.sizePx;
  return { box: (metrics.ascent + metrics.descent) / size, lineGap: metrics.lineGap / size };
}
const nonTextLayout = "img,svg,canvas,math,sup,sub,input,button,[contenteditable='false'],.ProseMirror-widget";
/** The view of a `documentField` atom (documentFieldValues renderHTML). */
const FIELD_VIEW_SELECTOR = 'span.mrnote-document-field[data-type="document-field"]';
/** The widget a formatting mark draws from (zero width, height and line
 * height) and the zero-size separator ProseMirror puts after a trailing one. */
const ZERO_LAYOUT_MARK_SELECTOR =
  'span.mrnote-formatting-mark[data-testid="document-formatting-mark"], img.ProseMirror-separator, ' +
  // The zero-height spacer that carries a line past a floating object
  // (floatBothSidesWrap.ts).
  'span[data-float-wrap-spacer="true"], ' +
  // The zero-height filler before a justified line's manual break
  // (justifiedLineBreaks.ts): it sits on a line of its own and adds no height.
  'span.mrnote-justified-break-filler';
/** The break the line engine draws before a tab or space that opens a line. */
const ENGINE_BREAK_SELECTOR = `br.${DOCS_ENGINE_TAB_BREAK_CLASS}`;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function isInDocxSource(state: EditorState, block: ProseMirrorNode, position?: number): boolean {
  const source = record(block.attrs.source);
  if (source?.adapter) return source.adapter === "docx";
  if (position === undefined || state.doc.nodeAt(position) !== block) return false;
  // Imported containers own the source receipt. An ordinary cell paragraph
  // can have direct Word spacing without its own source or paragraph style.
  // Read its nearest source owner; do not invent a paragraph source anchor.
  const $pos = state.doc.resolve(position);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const ancestor = record($pos.node(depth).attrs.source);
    if (ancestor?.adapter) return ancestor.adapter === "docx";
  }
  return false;
}

/** True for a fragment a page split cut from an earlier one. */
function isSplitContinuation(block: ProseMirrorNode): boolean {
  return !fragmentCarries("autoLineSpacingFact", block.attrs);
}

/** Per sheet node (a page move keeps every other sheet's). */
const sheetsWithoutLineSpacingSource = new WeakMap<ProseMirrorNode, boolean>();

/**
 * Nothing in this sheet, the sheet included, names a source or a Word style.
 * With the same said of every sheet before it (a fragment opening a sheet takes
 * its identity from those), `documentAutoLineMultiplier` answers null for every
 * block of it. A document without any was asked after every page move, block
 * by block, with a walk of the sheets per block.
 */
function sheetHoldsNoLineSpacingSource(sheet: ProseMirrorNode): boolean {
  const known = sheetsWithoutLineSpacingSource.get(sheet);
  if (known !== undefined) return known;
  let none = !record(sheet.attrs.source)?.adapter;
  if (none) {
    sheet.descendants((node) => {
      if (!none) return false;
      if (record(node.attrs.source)?.adapter || typeof node.attrs.docxStyleId === "string") {
        none = false;
        return false;
      }
      return !node.isTextblock;
    });
  }
  sheetsWithoutLineSpacingSource.set(sheet, none);
  return none;
}

/** The block immediately before `position` in reading order, inside the same
 * parent or — for a top-level block opening a sheet — at the end of the sheet
 * before it. Never guesses across a different container. */
function previousFlowBlock(
  doc: ProseMirrorNode,
  position: number,
): { node: ProseMirrorNode; pos: number } | null {
  const $pos = doc.resolve(position);
  const index = $pos.index();
  if (index > 0) {
    const previous = $pos.parent.child(index - 1);
    return { node: previous, pos: position - previous.nodeSize };
  }
  if ($pos.depth !== 1 || $pos.parent.type.name !== PAGE_BLOCK_NODE) return null;
  const pageIndex = $pos.index(0);
  if (pageIndex <= 0) return null;
  const page = doc.child(pageIndex - 1);
  if (page.type.name !== PAGE_BLOCK_NODE || page.childCount === 0) return null;
  const last = page.child(page.childCount - 1);
  return { node: last, pos: $pos.before(1) - page.nodeSize + 1 + page.content.size - last.nodeSize };
}

/**
 * The fragment whose attributes own this block's line spacing: itself, or the
 * head of the continuation chain it belongs to. The walk follows the chain one
 * fragment at a time and stops at the first fragment that is not a continuation
 * or is not the same node type, so it can never adopt a neighbouring block's
 * identity. A document with no page split returns the block itself, unchanged.
 */
function lineSpacingIdentityBlock(
  doc: ProseMirrorNode,
  block: ProseMirrorNode,
  position?: number,
): ProseMirrorNode {
  if (position === undefined || !isSplitContinuation(block)) return block;
  if (doc.nodeAt(position) !== block) return block;
  let current = { node: block, pos: position };
  for (let guard = 0; guard < 64 && isSplitContinuation(current.node); guard += 1) {
    const previous = previousFlowBlock(doc, current.pos);
    if (!previous || previous.node.type !== block.type) break;
    current = previous;
  }
  return isSplitContinuation(current.node) ? block : current.node;
}

/**
 * The floor an "At least" line spacing (`w:lineRule="atLeast"`) sets, in px,
 * or 0. Word's line is the tallest run's single line, never shorter than
 * the stated height (ECMA-376 17.3.1.33). The page drew such a paragraph at
 * a CSS approximation, max(stated, 1.2em of the paragraph's own size): an
 * 11pt Arial body at "at least 12pt" advanced 13.2pt a line where Word's
 * advance 12.65pt (R02-D05, two pages added over 23).
 */
export function documentAutoLineFloorPx(block: ProseMirrorNode): number {
  if (block.attrs.lineHeightRule !== "atLeast") return 0;
  const pt = Number(block.attrs.lineHeightPt);
  return Number.isFinite(pt) && pt > 0 && pt <= 1584 ? ptToPx(pt) : 0;
}

export function documentAutoLineMultiplier(state: EditorState, block: ProseMirrorNode, position?: number): number | null {
  const attrs = block.attrs, doc = state.doc.attrs;
  // A page split cuts one paragraph into fragments, and the block-id plugin
  // clears `source` on every fragment after the first: one native paragraph has
  // one claimant, or patchback cannot address it. The fragments are still ONE
  // paragraph, so Word's line box is resolved from the fragment that kept the
  // identity. Without this the tail falls back to the plain CSS line height and
  // paints ~30% shorter lines than its own head — and the ledger, which folds
  // the fragments back into one atom, then measures the split block shorter
  // than the whole, pulls it together, measures it tall again, and re-splits.
  const identity = lineSpacingIdentityBlock(state.doc, block, position);
  const source = record(identity.attrs.source), definitions = record(doc.styleDefinitions);
  if (source?.adapter !== "docx" &&
      !(typeof identity.attrs.docxStyleId === "string" && definitions?.version === 1) &&
      !isInDocxSource(state, identity, identity === block ? position : undefined)) return null;
  // "At least" is Word's single line of the tallest run with a floor
  // (documentAutoLineFloorPx); "exactly" is its own fixed box.
  const atLeast = documentAutoLineFloorPx(block) > 0;
  if (!block.isTextblock || (!atLeast && (attrs.lineHeightPt != null || attrs.lineHeightRule != null))) return null;
  // A right-to-left paragraph (w:bidi) takes the same single line: Word
  // reads it from the runs' faces whatever the direction (R14-D15: Calibri
  // 11pt lines of a bidi paragraph advance as the plain Latin ones do). One
  // whose runs name a face the page draws with a stand-in of other vertical
  // metrics keeps the CSS line it had: the stand-in's box is not Word's
  // (R30-D01: Traditional Arabic drawn in Noto Naskh Arabic, 1.70 em a line
  // where Word's is 1.49 em; projected, the document ran 69 pages for 56).
  if (attrs.dir === "rtl" && namesStandInFace(block)) return null;
  if (doc.writingMode && doc.writingMode !== "horizontal-tb") return null;
  // Grid consumes physical pitch slots and already has its own projection,
  // for the paragraphs that snap to it. One that does not (w:snapToGrid off)
  // takes Word's normal single line, as in a document without a grid; the
  // grid projection leaves it alone, so without this it kept the bare CSS
  // line box. In the 296-page book every body paragraph is off the grid: 宋体
  // 12pt advanced 12pt a line against Word's 15.6pt, 273 pages against 296.
  // So is one in a section laid out without the grid while another section
  // has it (`sectionsOffLineGrid`): the document's grid is the last
  // section's, and read for the whole document it left that section's lines
  // at the bare CSS box (corpus R49-D14: Calibri 11 pt a line apart, Word's
  // single line is 13.45 pt; 10 pages for 11).
  // A table cell's lines are on the grid only with Word's "Adjust line height
  // to grid height in the table" (w:adjustLineHeightInTable,
  // `wordTableLinesOnGrid`): without it Word sets them at their own single
  // line, as off the grid (docx-look/probes grid_probe.py grid2: Calibri 11 pt
  // cell rows 14.75 pt apart with snapToGrid on or off, body lines 15.6 pt on
  // the grid). Read as on the grid, the cell kept the bare CSS line box of one
  // em, 11.5 pt a row.
  // `window.__docsGridCellOwnLineOff = true` asks the older reading (cells on
  // the grid) for an A/B of one build.
  const cellOwnLineOff = typeof window !== "undefined" && (window as Window & { __docsGridCellOwnLineOff?: boolean }).__docsGridCellOwnLineOff === true;
  const cellOffGrid = !cellOwnLineOff && position !== undefined && doc.wordTableLinesOnGrid !== true && insideTableCell(state.doc, position);
  const onGrid = attrs.snapToGrid !== false && !cellOffGrid && !(position !== undefined && inSectionOffLineGrid(state.doc, position));
  if (onGrid && ((doc.docGridLinePitch && doc.manuscriptGrid !== "off") || (doc.manuscriptGrid && doc.manuscriptGrid !== "off"))) return null;
  if (Array.isArray(doc.sectionLayouts) && doc.sectionLayouts.some((value: unknown) => {
    const section = record(value), grid = record(section?.docGrid);
    return (onGrid && grid?.type && grid.type !== "default") || (section?.textDirection && section.textDirection !== "lrTb");
  })) return null;
  if (atLeast) return 1;
  const raw = attrs.lineHeight ?? doc.defaultLineHeight ?? "1";
  if ((typeof raw !== "string" && typeof raw !== "number") || raw === "") return null;
  const multiplier = Number(raw);
  return isWordLineMultiple(multiplier) ? multiplier : null;
}

/** How much smaller than the paragraph's own line its runs must be before
 * they, not it, set the paragraph's strut (px). */
const STRUT_RUN_TOLERANCE_PX = 0.5;

/** Whether the text block at `position` stands in a table cell. */
function insideTableCell(doc: ProseMirrorNode, position: number): boolean {
  if (position < 0 || position > doc.content.size) return false;
  const $pos = doc.resolve(position);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") return true;
  }
  return false;
}

const offLineGridRanges = new WeakMap<ProseMirrorNode, ReadonlyArray<[number, number]>>();

function inSectionOffLineGrid(doc: ProseMirrorNode, position: number): boolean {
  let ranges = offLineGridRanges.get(doc);
  if (!ranges) offLineGridRanges.set(doc, (ranges = sectionsOffLineGrid(doc)));
  return ranges.length > 0 && offLineGridAt(ranges, position);
}

/** Families that take Word's East Asian single-line pitch: the ones the
 * document's own font table declared, plus the alias families a verified
 * display-font plan paints them under. */
function eastAsianFontFamilies(state: EditorState): Set<string> {
  // A declared family whose recorded file is a Latin face is not one: the
  // importer's slot rule names every face a document puts in an East Asian
  // slot, and a Latin face there (Calibri as `w:eastAsia`) keeps its own box.
  const declared = (normalizeEastAsianFontFamilies(state.doc.attrs.eastAsianFontFamilies) ?? [])
    .filter(family => !wordFontIsRecordedLatin(family));
  const families = new Set(declared.map(family => family.toLowerCase()));
  const plan = documentDisplayFontPluginKey.getState(state)?.plan;
  if (families.size) for (const alias of documentDisplayFontAliasFamilies(plan, declared)) families.add(alias);
  // A face the page paints under `MRAI-Font-<sha>` keeps the East Asian
  // reading of the Word family it was bound for. A document authored here in
  // Noto Sans CJK SC (an East Asian face on record) binds its own subset,
  // whose sha no table knows: judged by the alias alone it was Latin, and
  // every line ran 1.448 em where Word (reading the font's code pages) runs
  // 1.3 x 1.448 em -- 23pt against Word's 30pt at 11pt, a page short on
  
  for (const alias of documentDisplayFontEastAsianAliasFamilies(plan, wordFontIsEastAsian)) families.add(alias);
  for (const alias of boundEastAsianFaceAliases(state.doc)) families.add(alias);
  return families;
}

const boundEastAsianAliasCache = new WeakMap<ProseMirrorNode, ReadonlySet<string>>();
/** The `MRAI-Font-<sha>` families of the faces the document's own marks bind
 * (a run carrying an asset paints under that family, NoteEditor) whose Word
 * family is an East Asian face on record. */
function boundEastAsianFaceAliases(doc: ProseMirrorNode): ReadonlySet<string> {
  const cached = boundEastAsianAliasCache.get(doc);
  if (cached) return cached;
  const aliases = new Set<string>();
  // Each page's (each top-level block's) faces kept by its node: a keystroke
  // makes a new document, and the walk of every run of it was 5 ms a key on a
  // 124-page report.
  doc.forEach((child) => {
    for (const alias of boundEastAsianFaceAliasesOf(child)) aliases.add(alias);
  });
  boundEastAsianAliasCache.set(doc, aliases);
  return aliases;
}

function boundEastAsianFaceAliasesOf(block: ProseMirrorNode): ReadonlySet<string> {
  const cached = boundEastAsianAliasCache.get(block);
  if (cached) return cached;
  const aliases = new Set<string>();
  const read = (node: ProseMirrorNode) => {
    for (const mark of node.marks) {
      if (!FACE_MARKS.has(mark.type.name)) continue;
      const face = normalizeOfficeFontFace(mark.attrs.face);
      if (!face?.asset) continue;
      if (wordFontIsEastAsian(face.family) || wordFontIsEastAsian(face.asset.family)) {
        aliases.add(officeFontFaceFamily(face).toLowerCase());
      }
    }
  };
  read(block);
  block.descendants((node) => { read(node); });
  boundEastAsianAliasCache.set(block, aliases);
  return aliases;
}
const FACE_MARKS = new Set(["fontFamily", "fontCjkFamily", "fontComplexFamily"]);

/** A run of the block names a face whose served stand-in is not
 * metric-compatible with it and is not drawn on Word's line box and widths
 * either (`substitutes.generated.json` wordLines). */
function namesStandInFace(block: ProseMirrorNode): boolean {
  let found = false;
  block.descendants((node) => {
    if (found) return false;
    for (const mark of node.marks) {
      if (!FACE_MARKS.has(mark.type.name)) continue;
      const family: unknown = mark.attrs.family;
      const substitution = typeof family === "string" ? officeFontSubstitution(family) : undefined;
      if (substitution && substitution.substitutes.length > 0 && !officeFontMetricMatchesWidths(substitution.metric) && !substitution.wordLines) {
        found = true;
        return false;
      }
    }
    return true;
  });
  return found;
}

/** A face the page leases is painted under `MRAI-Font-<sha>` and arrives after
 * the first frame. Until it is registered and loaded, a substitute paints in
 * its place — and `FontFaceSet.check` says "available" for a family with no
 * registered face at all, so absence must be read as "still coming" here.
 * Any other family is painted by what the page has, the same on every frame. */
export function leasedFaceArrived(doc: Document, family: string): boolean {
  const name = family.trim().replace(/^["']|["']$/g, "");
  if (!/^MRAI-Font-/i.test(name)) return true;
  const fonts = doc.fonts;
  if (!fonts) return true;
  let present = false, loaded = true;
  for (const face of fonts) {
    if (face.family.replace(/^["']|["']$/g, "").toLowerCase() !== name.toLowerCase()) continue;
    present = true;
    if (face.status !== "loaded") loaded = false;
  }
  return present && loaded;
}

/** Whether the page has its own face registered under this family name. */
function registeredFamily(doc: Document, family: string): boolean {
  const name = family.toLowerCase();
  const fonts = doc.fonts;
  if (!fonts) return false;
  if ((globalThis as { __docsRegisteredFamilyMemo?: boolean }).__docsRegisteredFamilyMemo === false) {
    return [...fonts].some(face => face.family.replace(/^["']|["']$/g, "").toLowerCase() === name);
  }
  // The page's family names, gathered once for as many faces as it holds:
  // asked for each run a pass reads, the walk over every face (a document's
  // page holds thousands) was 1.9 s of R286-D01's cold open. Kept for the
  // task that gathered them (a pass is one task) and while the count holds:
  // a warm print page swaps one document's faces for the next one's between
  // tasks, as many for as many. A face's status is not asked here.
  let known = registeredFamilyNames.get(doc);
  if (!known || known.size !== fonts.size) {
    const names = new Set<string>();
    for (const face of fonts) names.add(face.family.replace(/^["']|["']$/g, "").toLowerCase());
    const gathered = { size: fonts.size, names };
    known = gathered;
    registeredFamilyNames.set(doc, gathered);
    setTimeout(() => {
      if (registeredFamilyNames.get(doc) === gathered) registeredFamilyNames.delete(doc);
    }, 0);
  }
  return known.names.has(name);
}
const registeredFamilyNames = new WeakMap<Document, { size: number; names: Set<string> }>();

/**
 * Whether the family is a face of the page's own, whose ascent is not the one
 * recorded under its name. A served Office name is registered too, once its
 * stand-in is in use, but draws on Word's box, so the recorded ascent stands:
 * read as the page's own, no list line over Calibri or Aptos ever rose to its
 * marker (corpus R282-D25: Word 24.0pt a line at 10pt, here 23.4pt).
 */
export function faceOfThePage(doc: Document, family: string): boolean {
  if (!registeredFamily(doc, family)) return false;
  const substitution = officeFontSubstitution(family);
  return !(substitution && (substitution.wordLines === true || substitution.metric === "exact"));
}

function elementAt(view: EditorView, position: number, locate?: BlockDomLocator): Element | null {
  // A position is a boundary, not a character. Look toward the current run;
  // moving one position forward reaches the *next* run for one-character text.
  // Decoration wrappers also make domAtPos return an element plus child offset,
  // so resolve that child before reading inherited font properties.
  // `locate`: the block's own positions (blockDomLocator), view.domAtPos's
  // answers without walking every run before them.
  const anchor = locate ? locate(position, 1) : view.domAtPos(position, 1);
  let dom: Node | undefined = anchor.node;
  if (dom.nodeType !== 3) dom = dom.childNodes[anchor.offset];
  while (dom && dom.nodeType !== 3) dom = dom.firstChild ?? undefined;
  return dom?.parentElement ?? null;
}

/** An in-line picture: a replaced box on the line's baseline, as Word sets
 * one. Its own height raises its line; it adds no strut of its own. */
const INLINE_PICTURE_NODE = "inlineImage";
/** A chart "In Line with Text" is set on its line as a picture is (Windows
 * Word 16, corpus R440-D15: a 152.25 pt chart in a 1.15-line Times New Roman
 * 12 pt paragraph is a 154.3 pt line, the multiple's share of the single line
 * above it). `window.__docsChartLineOff = true` asks the older reading (the
 * chart's line kept the paragraph's strut), for an A/B of one build. */
const INLINE_CHART_NODE = "inlineChart";
function linePicture(name: string): boolean {
  return name === INLINE_PICTURE_NODE || (name === INLINE_CHART_NODE &&
    !(typeof window !== "undefined" && (window as Window & {__docsChartLineOff?: boolean}).__docsChartLineOff === true));
}
/** The share of a single line the multiple adds to a picture's line (Word 16:
 * 12.96pt of Calibri 11pt's 13.43pt line, 28.2pt of 24pt's 29.3pt). */
const PICTURE_LINE_MULTIPLE_SHARE = 0.964;
/** Word's rendered page-break mark (``w:lastRenderedPageBreak``): a
 * zero-size atom that takes no room in its line. */
const SOURCE_PAGE_BREAK_NODE = "sourcePageBreak";

/** The face a blank paragraph's mark names (`paragraphMarkMarks`), if any. */
function paragraphMarkFamily(block: ProseMirrorNode): string | null {
  const marks: unknown = block.attrs.paragraphMarkMarks;
  if (!Array.isArray(marks)) return null;
  for (const mark of marks) {
    const entry = mark as { type?: unknown; attrs?: { family?: unknown } } | null;
    const stated = entry?.type === "fontFamily" ? entry.attrs?.family : null;
    // The mark's family as the run marks state it: a quoted CSS family
    // (`"Courier New"`, corpus R91-D05) names that face as much as a bare
    // one; read quoted, it was refused and 1877 blank Courier New lines took
    // the Calibri default's 16.3px for Word's 15.1px (a page longer).
    const family = typeof stated === "string" ? officePrimaryFontFamily(stated) : null;
    if (family && /^[^"\\;{}]{1,64}$/.test(family)) return family;
  }
  return null;
}

/** The size the paragraph mark's own run states (`paragraphMarkMarks`), in
 * CSS px, or null when it states none. */
function paragraphMarkSizePx(block: ProseMirrorNode): number | null {
  const marks: unknown = block.attrs.paragraphMarkMarks;
  if (!Array.isArray(marks)) return null;
  for (const mark of marks) {
    const entry = mark as { type?: unknown; attrs?: { size?: unknown } } | null;
    if (entry?.type !== "fontSize" || typeof entry.attrs?.size !== "string") continue;
    const match = /^(\d+(?:\.\d+)?)px$/.exec(entry.attrs.size.trim());
    const px = match ? Number.parseFloat(match[1]) : Number.NaN;
    if (Number.isFinite(px) && px > 0 && px <= 2_200) return px;
  }
  return null;
}

/** The size a paragraph mark that holds no typing marks states: the
 * `paragraphFontSize` the projection writes on a paragraph whose closing line
 * break leaves the mark alone on the line after it (corpus R279-D29). */
function paragraphFontSizePx(block: ProseMirrorNode): number | null {
  const size: unknown = block.attrs.paragraphFontSize;
  const match = typeof size === "string" ? /^(\d+(?:\.\d+)?)px$/.exec(size.trim()) : null;
  const px = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(px) && px > 0 && px <= 2_200 ? px : null;
}

/**
 * A footnote or endnote reference: Word's reference mark is a superscript run
 * of its paragraph's text, and the raise adds nothing to the line (Word
 * 16.86, t-supline). Its view (a `sup` around a button with the live number)
 * is drawn with no line of its own (note-editor.css: line-height 0), so it
 * needs no leaf and does not cost its paragraph the leaf-only line boxes.
 * Rejected, the paragraph kept its own strut -- the document's Aptos under
 * Times New Roman runs -- and each of its lines stood 0.75 pt taller than
 * Word's 20.7 pt (corpus R347-D06: every paragraph with an endnote mark, a
 * line short per page by the foot). `window.__docsNoteRefLineOff = true`
 * asks the older reading, for an A/B of one build.
 */
const NOTE_REFERENCE_NODE = "footnoteRef";
const NOTE_REFERENCE_VIEW = "sup.mrnote-footnote-ref";
/** `window.__docsNativeMarkerStrutOff = true` (A/B): an imported list's own
 * marker keeps its zero line height over the marker strut, the older
 * drawing (the engine still counts the strut). */
function nativeMarkerStrutOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsNativeMarkerStrutOff?: boolean }).__docsNativeMarkerStrutOff === true;
}
/** `window.__docsMarkerStrutTallRunOff = true` (A/B): a list paragraph
 * holding a run Word stands taller than its first gets no marker strut, the
 * older reading. */
function markerStrutTallRunOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsMarkerStrutTallRunOff?: boolean }).__docsMarkerStrutTallRunOff === true;
}
/**
 * The face whose Word ascent a run stands to in a list line. Cambria Math in
 * a line of text stands as Cambria does: Windows Word sets Arial 11 at Auto
 * 1.2 15.18pt a line, 15.48pt with a Cambria Math "‐" in it (Cambria's
 * 0.950 em ascent and 0.222 em descent over Arial's 0.938 and 0.212), and
 * 16.08pt under a 12pt Symbol bullet, the bullet's ascent above Cambria's
 * (docx-look/probes/vsp13 m1). No Word file of Cambria Math is recorded.
 */
function markerLineFace(family: string): string {
  return !markerStrutTallRunOff() && family.toLowerCase() === "cambria math" ? "Cambria" : family;
}
/** `window.__docsWidgetItemShiftOff = true` (A/B): a list item whose number
 * the page draws itself gets no Word-baseline move, the older reading. */
function widgetItemShiftOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsWidgetItemShiftOff?: boolean }).__docsWidgetItemShiftOff === true;
}
function noteRefLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsNoteRefLineOff?: boolean}).__docsNoteRefLineOff === true;
}
/**
 * An equation among a paragraph's words (`<m:oMath>`, the inlineMath atom):
 * its view stands on the box Word gives it in a line (wordMathMetrics: its
 * struts, or KaTeX's own where the model does not know it) and needs no leaf.
 * Rejected, the paragraph kept its own strut -- the first face of its stack,
 * a Korean document's Malgun Gothic under its Times New Roman runs -- on
 * every line, not only the formula's: corpus R287-D30's table cells holding
 * "t-1" stood 14.56 pt a line where Word's stand 13.8 pt (Windows Word 16,
 * probes/vsp10 m1/m3: a line with a formula of a line's height is the text
 * line, the other lines of its paragraph untouched). Display-standing views
 * (`data-math-display`) keep the older reading.
 * `window.__docsMathLineOff = true` asks the older reading, for an A/B of
 * one build.
 */
const INLINE_MATH_NODE = "inlineMath";
const INLINE_MATH_VIEW = "span.inline-math-wrapper";
function mathLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsMathLineOff?: boolean}).__docsMathLineOff === true;
}
function lineFreeNode(name: string): boolean {
  return linePicture(name) || name === SOURCE_PAGE_BREAK_NODE || (name === NOTE_REFERENCE_NODE && !noteRefLineOff()) ||
    (name === INLINE_MATH_NODE && !mathLineOff());
}

function plainParagraph(block: ProseMirrorNode): boolean {
  if (!["paragraph", "heading"].includes(block.type.name) || block.content.size === 0) return false;
  let plain = true, words = false;
  block.forEach(child => {
    // A text-only field is a run of words (`fieldLeaf`).
    if (child.isText || child.type.name === DOCUMENT_FIELD_NODE_NAME) words = true;
    else if (child.type.name !== "hardBreak" && !lineFreeNode(child.type.name)) plain = false;
  });
  // A paragraph of nothing but pictures has no run to take its line from.
  return plain && words;
}

/** A paragraph whose line holds pictures and no words. */
function pictureOnlyParagraph(block: ProseMirrorNode): boolean {
  let pictures = false, other = false;
  block.forEach(child => {
    if (linePicture(child.type.name)) pictures = true;
    else if (child.type.name !== SOURCE_PAGE_BREAK_NODE) other = true;
  });
  return pictures && !other;
}

/**
 * A field whose view draws nothing but its result text: Word lays that
 * result out as the runs it is, so the field takes a line box of its own
 * face like any run (`fieldLeaf`), and does not cost its paragraph the
 * leaf-only line boxes. Before, the one paragraph fragment holding a field
 * kept the paragraph's strut and advanced 19.4px a line where its other
 * fragments advanced 16.2px: text moved across that seam changed height, and
 * a page-long cell paragraph was cut back and forth (corpus R03-D23).
 */
function textOnlyFieldView(element: Element): boolean {
  // The node's own DOM is the field span (renderHTML), or the React node
  // view's root holding that span and nothing else (DocumentFieldView).
  const only = element.children.length === 1 ? element.firstElementChild : null;
  const field = element.matches(FIELD_VIEW_SELECTOR) ? element : only?.matches(FIELD_VIEW_SELECTOR) ? only : null;
  return Boolean(field) && !field!.querySelector("*") && field!.textContent === element.textContent &&
    /\S/.test(field!.textContent ?? "");
}

function coversParagraph(block: ProseMirrorNode, position: number, leaves: readonly Decoration[]): boolean {
  if (!plainParagraph(block)) return false;
  const end = position + 1 + block.content.size;
  let covered = position + 1;
  // An in-line picture is its own box: it needs no leaf.
  const pictures: {from: number; to: number}[] = [];
  block.forEach((child, offset) => {
    // A rendered page-break mark takes no room: it needs no leaf either, nor
    // does a note reference (NOTE_REFERENCE_NODE).
    if (lineFreeNode(child.type.name)) {
      pictures.push({from: position + 1 + offset, to: position + 1 + offset + child.nodeSize});
    }
  });
  // Spaces no leaf took (a paragraph's closing space after a hyperlink, a
  // run of its own): a leaf-only line gives them no box, as Word gives a
  // space at a line's end none. Uncovered, they cost every line of the
  // paragraph its leaf-only box: corpus R367-D26's references, a space after
  // each URL, stood 14.2 pt a line for Word's 13.8, a page long by the end.
  const spacesOnly = (from: number, to: number) => !uncoveredSpacesOff() &&
    /^ +$/.test(block.textBetween(from - position - 1, to - position - 1, "", "\ufffc"));
  for (const leaf of [...leaves, ...pictures].sort((a, b) => a.from - b.from)) {
    if (leaf.to <= covered || leaf.from >= end) continue;
    if (leaf.from > covered && !spacesOnly(covered, leaf.from)) return false;
    covered = Math.max(covered, leaf.to);
    if (covered >= end) return true;
  }
  return covered < end && covered > position + 1 && spacesOnly(covered, end);
}

/** `window.__docsUncoveredSpacesOff = true` asks the older reading (a space
 * no leaf took costs its paragraph the leaf-only line boxes), for an A/B of
 * one build. */



function textBreakLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsTextBreakLineOff?: boolean }).__docsTextBreakLineOff === true;
}
function uncoveredSpacesOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsUncoveredSpacesOff?: boolean}).__docsUncoveredSpacesOff === true;
}

/** Only native decorations issued by the font resolver can complete coverage.
 * DOM class names alone are not a witness of independently measured text. */
function nativeLineCoverage(state: EditorState, from: number, to: number): Decoration[] {
  return documentDisplayFontPluginKey.getState(state)?.decorations.find(from, to,
    spec => spec.documentWordLineBox === true) ?? [];
}



function proofWalkOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsAutoLineProofWalkOff?: boolean}).__docsAutoLineProofWalkOff === true;
}

/**
 * Where each of a textblock's own text nodes starts in the document, and its
 * node's text length, read in one walk of the block's view: ProseMirror's
 * posAtDOM sums every sibling before a node at every level, so asked of each
 * text node of a paragraph it cost the square of its runs (R461-D71's code
 * listings, ~3,500 runs: 13 s of a print's layout). Null when the block has
 * no view to walk or the walk does not start where posAtDOM says; a node not
 * in the map is asked of posAtDOM.
 */
function textNodeStarts(view: EditorView, dom: HTMLElement, position: number): Map<Node, readonly [number, number]> | null {
  if (proofWalkOff()) return null;
  interface Desc { children?: Desc[]; size?: number; node?: ProseMirrorNode | null; mark?: unknown; nodeDOM?: Node }
  const desc = (dom as unknown as {pmViewDesc?: Desc}).pmViewDesc;
  if (!desc?.children || desc.node == null || !desc.node.isTextblock) return null;
  const starts = new Map<Node, readonly [number, number]>();
  const walk = (children: readonly Desc[], at: number) => {
    for (const child of children) {
      if (child.mark && child.children) walk(child.children, at);
      else if (child.node?.isText && child.nodeDOM) starts.set(child.nodeDOM, [at, child.node.text?.length ?? 0]);
      at += child.size ?? 0;
    }
  };
  walk(desc.children, position + 1);
  const first = starts.entries().next().value;
  if (first) {
    try {
      if (view.posAtDOM(first[0], 0) !== first[1][0]) return null;
    } catch { return null; }
  }
  return starts;
}

function sourceTextDOM(view: EditorView, dom: HTMLElement, position: number, block: ProseMirrorNode): boolean {
  if (!dom.matches("p,h1,h2,h3,h4,h5,h6")) return false;
  // A formatting mark is a zero-size inline box (see documentAutoLineSafety).
  // The engine's own line break (documentEngineLineBreaks) stands in the
  // wrappers, which take no line height here: it owns no line box either.
  const zeroLayoutMark = (element: Element) => element.matches(ZERO_LAYOUT_MARK_SELECTOR) ||
    (element.matches(ENGINE_BREAK_SELECTOR) && !engineBreakStrutOff());
  // A list level's own number (listDefinitionMarkers' widget) is the page's,
  // not the source's: its line height is zero and the strut of
  // `customMarkerLine` raises the line when the number is the larger, as Word
  // does. Rejected, its paragraph kept the paragraph's own strut -- the
  // document's Normal size, not the runs' -- and a 12pt list under a 14pt
  // Normal advanced 17.8pt a line instead of Word's 13.8pt (R02-D16).
  const listMarker = (element: Element) =>
    element.closest("span.docs-list-marker")?.parentElement === dom ||
    // A numbered heading's number (headingNumberingExtension), the same.
    element.closest("span.mrnote-heading-number--list")?.parentElement === dom;
  // An in-line picture's view (the image with its selection chrome, all of
  // it out of the line but the image): a replaced box on the baseline, the
  // height Word gives its line (R01-D02's logo line kept the paragraph's
  // Normal strut above the picture, 17.1pt where Word's line is 12.5pt).
  const inlinePicture = (element: Element) => {
    const view = element.closest<HTMLElement>('.note-editor-image-resizable[data-inline-picture="true"]');
    return Boolean(view && !view.hasAttribute("data-float-mode") && dom.contains(view));
  };
  // A drop-down, combo box or date control's button: a zero-height anchor
  // the content-control widget hangs from (documentAutoLineSafety's
  // `zeroLayoutContentControl`). It takes no room in the line, so the
  // control's text sets the line as Word's does (R01-D02's HIDE COLOR line
  // kept the paragraph's 17.9px Normal strut over its 12.3px text).
  const controlAnchor = (element: Element) => {
    const anchor = element.closest("span.mrnote-content-control-anchor");
    return anchor !== null && dom.contains(anchor);
  };
  // Word's rendered page-break mark (``w:lastRenderedPageBreak``): a
  // zero-size inline box. Rejected, a paragraph opening a page in Word kept
  // the paragraph's Normal strut for every line -- R10-D17's 9pt Verdana
  // paragraphs advanced 13.8pt a line where Word's advance 12pt.
  const pageBreakMark = (element: Element) => {
    const mark = element.closest('span[data-type="source-page-break"]');
    return mark !== null && mark.parentElement === dom && !mark.textContent;
  };
  // A note reference's view (NOTE_REFERENCE_NODE): its number is the page's,
  // drawn with no line of its own.
  const noteRef = (element: Element) => {
    if (noteRefLineOff()) return false;
    const ref = element.closest(NOTE_REFERENCE_VIEW);
    return ref !== null && ref.parentElement !== null && dom.contains(ref);
  };
  // An equation's view (INLINE_MATH_NODE): its box is its own, KaTeX's
  // glyphs and MathML inside it are no run of the paragraph's.
  const inlineFormula = (element: Element) => {
    if (mathLineOff()) return false;
    const formula = element.closest(INLINE_MATH_VIEW);
    return formula !== null && dom.contains(formula) && !formula.hasAttribute("data-math-display");
  };
  // This plugin's own strut (emptyLineStrut: a widget of the line height it
  // publishes, its one word joiner no source text): the line a break opens
  // at the paragraph's end, an empty line between two breaks. Rejected, every
  // paragraph that holds one kept its own strut on every line once it was
  // laid out again -- 87 of 87 in a table of Tw Cen MT 9 cells under a
  // Calibri 11 style (probes/tbl17/h5), each line 10.55 pt where Word's is
  // 9.8, a row 3 pt taller. Read before the widget was drawn, the same
  // paragraph passed: whether it held its strut depended on the pass.
  const ownStrut = (element: Element) => {
    if (strutProofOff()) return false;
    const strut = element.closest(AUTO_LINE_STRUT_SELECTOR);
    return strut !== null && dom.contains(strut);
  };
  // A superscript or subscript run (the subscript / superscript marks' own
  // <sub>, <sup>): its words are the paragraph's, mapped to the source below
  // like any run's, and they take no line box of their own -- the base
  // stylesheet sets the element on the baseline at line height 0 and moves
  // its glyphs by position, its leaf is its face's line, and the strut at the
  // line's top gives the line the run's full size (the script strut above),
  // as Word sets it. Rejected, every paragraph holding one kept its own strut
  // on every line beside its leaves: R484-D44's 12 pt Times New Roman
  // headings "... (X1)" under an 11 pt Normal stood 14.56 pt where Word's
  // stand 13.81, and the same headings without a subscript 13.81.
  const scriptRun = (element: Element) =>
    !scriptProofOff() && element.matches("sub, sup") && !element.matches(".mrnote-footnote-ref") && dom.contains(element);
  for (const element of dom.querySelectorAll(nonTextLayout)) {
    if (!zeroLayoutMark(element) && !listMarker(element) && !inlinePicture(element) &&
      !controlAnchor(element) && !pageBreakMark(element) && !textOnlyFieldView(element) && !noteRef(element) &&
      !inlineFormula(element) && !ownStrut(element) && !scriptRun(element)) return false;
  }
  // Never neutralize an authored inline line-height, or an unmapped label
  // supplied by a NodeView. This is a paragraph-source proof, not text matching
  // against unrelated content elsewhere in the document. The page's own
  // pieces (a picture's chrome, a control's anchor) are not authored.
  for (const span of dom.querySelectorAll<HTMLElement>("span")) {
    if (span.style.lineHeight && !span.classList.contains("document-auto-linebox") && !zeroLayoutMark(span) &&
      !inlinePicture(span) && !controlAnchor(span) && !inlineFormula(span)) return false;
  }
  const starts = textNodeStarts(view, dom, position);
  const walker = dom.ownerDocument.createTreeWalker(dom, 4 /* SHOW_TEXT */);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (!text.length) continue;
    if (text.parentElement && (listMarker(text.parentElement) || inlinePicture(text.parentElement) ||
      controlAnchor(text.parentElement) || noteRef(text.parentElement) || inlineFormula(text.parentElement) ||
      ownStrut(text.parentElement))) continue;
    // A field's result text is its view's, not the paragraph's: the field
    // carries its own leaf (`fieldLeaf`).
    if (text.parentElement && textOnlyFieldView(text.parentElement)) continue;
    try {
      const known = starts?.get(text);
      const from = known ? known[0] : view.posAtDOM(text, 0);
      const to = known ? known[0] + Math.min(text.length, known[1]) : view.posAtDOM(text, text.length);
      if (from < position + 1 || to > position + 1 + block.content.size || to - from !== text.length ||
          view.state.doc.textBetween(from, to, "", "") !== text.data) return false;
    } catch { return false; }
  }
  return true;
}

/** The marker fact of a list item's opening paragraph, while the paragraph
 * still sits where the importer put it: first in its item, in a list of the
 * marker's kind, bullet style and nesting level. A page-split tail carries no
 * source and never qualifies. */
/** The list item `block` is the first paragraph of. */
function listItemHeadedBy(doc: ProseMirrorNode, position: number, block: ProseMirrorNode): {from: number; to: number} | null {
  if (block.type.name !== "paragraph") return null;
  const $pos = doc.resolve(position);
  if ($pos.depth < 1 || $pos.parent.type.name !== "listItem" || $pos.parent.firstChild !== block) return null;
  const from = $pos.before();
  return {from, to: from + $pos.parent.nodeSize};
}

function listMarkerFact(doc: ProseMirrorNode, position: number, block: ProseMirrorNode): DocumentNumberingMarkerFact | null {
  if (block.type.name !== "paragraph" || record(record(block.attrs.source)?.numberingLayout)) return null;
  const fact = readDocumentNumberingMarkerFact(block.attrs);
  if (!fact || !fragmentCarries("autoLineSpacingFact", block.attrs)) return null;
  const $pos = doc.resolve(position + 1);
  if ($pos.parent !== block || $pos.depth < 3) return null;
  const item = $pos.node($pos.depth - 1), list = $pos.node($pos.depth - 2);
  if (item.type.name !== "listItem" || item.firstChild !== block || item.attrs.pageSplitItemContinuation === true) return null;
  if (fact.format === "bullet"
    ? list.type.name !== "bulletList" ||
      (typeof list.attrs.bulletGlyph === "string" && list.attrs.bulletGlyph
        ? list.attrs.bulletGlyph !== fact.text
        : normalizeBulletStyle(list.attrs.bulletStyle) !== (bulletStyleForGlyph(fact.text) ?? DEFAULT_BULLET_STYLE))
    : list.type.name !== "orderedList" || (list.attrs.listStyleType != null && list.attrs.listStyleType !== "decimal")) return null;
  let lists = 0;
  for (let depth = $pos.depth - 2; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") break;
    if (name === "bulletList" || name === "orderedList" || name === "taskList") lists++;
  }
  return lists - 1 === fact.level ? fact : null;
}

/** A strut belongs to a paragraph whose own line box is neutralized. */
/** Documents an edit of plain text made: their measurement waits for the hand. */
const typedDocuments = new WeakSet<ProseMirrorNode>();

/** From this many decorations taken out together the set is built again
 * rather than searched (removeDecorations). */
const REBUILD_REMOVALS = 512;

/**
 * `set` without `removed` (each decoration equal to one of them), as
 * `set.remove(removed)`. DecorationSet.remove compares every decoration taken
 * out with every one its block holds: a code listing of 3,500 runs and 530
 * line breaks holds some 4,000, and a sheet of it laid out again took out a
 * thousand -- millions of comparisons a pass (R461-D71: 27 s of a print's
 * layout). Many taken out together, the set is built again from what stays.
 * `window.__docsAutoLineRebuildOff`: removed one by one, as before.
 */
export function removeDecorations(set: DecorationSet, doc: ProseMirrorNode, removed: readonly Decoration[]): DecorationSet {
  if (!removed.length) return set;
  const off = typeof window !== "undefined" && (window as Window & { __docsAutoLineRebuildOff?: boolean }).__docsAutoLineRebuildOff === true;
  if (off || removed.length < REBUILD_REMOVALS) return removeDecorationList(set, removed);
  const gone = new Map<string, Decoration[]>();
  for (const item of removed) {
    const key = `${item.from}:${item.to}`;
    const list = gone.get(key);
    if (list) list.push(item);
    else gone.set(key, [item]);
  }
  let taken = false;
  const kept = set.find().filter((item) => {
    const same = gone.get(`${item.from}:${item.to}`);
    // Decoration.eq (from, to and type equal) is what remove() matches by; it
    // is not in the declared type.
    if (same && same.some((other) => (other as Decoration & { eq(other: Decoration): boolean }).eq(item))) {
      taken = true;
      return false;
    }
    return true;
  });
  return taken ? DecorationSet.create(doc, kept) : set;
}

function withoutOrphanStruts(set: DecorationSet, within?: readonly (readonly [number, number])[]): DecorationSet {
  const isStrut = (spec: {autoLineMarkerStrut?: unknown}) => spec.autoLineMarkerStrut !== undefined;
  const isMarker = (spec: {autoLineIntermediates?: unknown}) => spec.autoLineIntermediates === true;
  const inAll = <T,>(read: (from?: number, to?: number) => T[]) =>
    within ? within.flatMap(([from, to]) => read(from, to)) : read();
  const struts = inAll((from, to) => set.find(from, to, isStrut));
  if (!struts.length) return set;
  const markers = new Set(inAll((from, to) => set.find(from, to, isMarker)).map(marker => `${marker.from}:${marker.to}`));
  const orphans = struts.filter(strut => !markers.has(`${strut.from}:${strut.to}`));
  return orphans.length ? removeDecorationList(set, orphans) : set;
}

/** A line box as the engine lays it out for one face and fixed line height. */
interface EngineLineBox { baselinePx: number; heightPx: number }
/** A text or break interval whose line box this projection controls. */
/** `face`: the face Word sets this run's characters in, when it is not the
 * element's own first family (East Asian text behind a Latin face, or a Han
 * character that face has no glyph for). */
interface ControlledRun { from: number; element: Element; box: EngineLineBox | null; remainder: number; face?: string; pixels?: number }

/** Faces the page itself appends behind a document's own (TextStyling's CJK
 * render fallbacks). East Asian text a document sets in no face of its own is
 * not given their line box: Word would use a face of its own choosing. A face
 * the document's font table lists is the document's, wherever it stands. */
const RENDER_FALLBACK_EAST_ASIAN_FACES = new Set([
  "noto sans sc", "noto serif sc", "noto sans cjk sc", "pingfang sc", "songti sc", "simsun", "microsoft yahei",
]);

const unquotedFamily = (token: string) => token.trim().replace(/^["']|["']$/g, "");
/** Any code point `isEastAsianFontCodePoint` can answer yes for. */
const MAYBE_EAST_ASIAN_TEXT = /[\u0e00-\u0e7f\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe1f\ufe30-\ufe6f\uff00-\uffef]|[\ud840-\ud8bf][\udc00-\udfff]/;
/** Word's Thai faces for a run naming no complex-script font (TextStyling's
 * withThaiScriptFallback puts one of them in the rendered stack). */
const THAI_FALLBACK_FACES = ["Angsana New", "Browallia New"];
/** Word's face for Hangul in a run whose faces are all Latin (no East Asian
 * face in its stack): Windows Word draws it in Batang, and the line takes
 * Batang's East Asian box -- 14.28 / 17.16 pt at 11 pt and 1 / 1.2 lines
 * under Calibri, Arial, Cambria or Times New Roman alike, with or without a
 * ko-KR language (docx-look/probes/hang hang1; corpus R345-D06, a Google
 * Docs export with w:eastAsia="Calibri": the Calibri line ran 1 pt a line
 * short, 15.5 pt by the end of a cell). */
const HANGUL_FALLBACK_FACE = "Batang";
const HANGUL_TEXT = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
/** Word's face for Hangul in a run whose East Asian face is Times New Roman
 * while its Latin face is another: Windows Word draws it in Malgun Gothic, and
 * the line takes Malgun Gothic's East Asian box -- 19.9 pt where the Verdana
 * 11.5 pt line is 13.9 pt. A run that names Times New Roman for both, another
 * Latin East Asian face (Calibri, Verdana, Arial, Tahoma, Georgia, Cambria) or
 * none is Batang's (docx-look/cjk17/probes jamo: modes 14 and 15 alike,
 * syllables and compatibility jamo alike, w:lang ko-KR or not). Corpus
 * R488-D87, an interview transcript in Verdana with w:eastAsia="Times New
 * Roman": 12 of Word's lines hold a jamo (ㅇ, ㄱ) and stand 6 pt taller, a
 * page by the end. */
const HANGUL_EAST_ASIA_TNR_FACE = "Malgun Gothic";
/** `window.__docsHangulMalgunLineOff = true` asks the older reading (that
 * Hangul measured as Batang), for an A/B of one build. */
function hangulMalgunLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsHangulMalgunLineOff?: boolean}).__docsHangulMalgunLineOff === true;
}
/** The face Word draws Hangul in under a run naming no East Asian face of
 * its own, from the element of the run's East Asian slot (`stackTokens`: its
 * face list) and the run's Latin face outside it. */
export function hangulLatinRunFace(element: Element, stackTokens: readonly string[], fontFamilyOf: (element: Element) => string): string {
  if (hangulMalgunLineOff()) return HANGUL_FALLBACK_FACE;
  const unquoted = (token: string | undefined) => (token ?? "").trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
  if (unquoted(stackTokens[0]) !== "times new roman") return HANGUL_FALLBACK_FACE;
  const slot = element.closest('[data-office-font-slot="eastAsia"]');
  const run = slot?.parentElement;
  if (!run) return HANGUL_FALLBACK_FACE;
  const latin = unquoted(fontFamilyOf(run).split(",")[0]);
  return latin && latin !== "times new roman" ? HANGUL_EAST_ASIA_TNR_FACE : HANGUL_FALLBACK_FACE;
}
/** `window.__docsHangulBatangLineOff = true` asks the older reading (Hangul
 * under a Latin run measured as that run's face), for an A/B of one build. */
function hangulBatangLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsHangulBatangLineOff?: boolean}).__docsHangulBatangLineOff === true;
}
/** Word's face for Han, kana and the other East Asian characters of a run
 * whose faces are all Latin (no East Asian face in its stack): Windows Word
 * draws them in SimSun, and the line takes SimSun's East Asian box -- 15.6 pt
 * at 12 pt single, 16.4 pt at 11 pt and 1.15 lines -- under Cambria, Calibri,
 * Times New Roman or Arial alike, with an en-US or a ja-JP language, in
 * compatibility mode 15 or without a compatibility setting (docx-look/probes/
 * cjkfb cjkfb1, cjkfb1n). Corpus R398-D14, a pandoc export whose every run is
 * Cambria (eastAsiaTheme="minorHAnsi"): each Japanese line ran 1.55 pt short
 * of Word's, a page short by the end. */
const HAN_FALLBACK_FACE = "SimSun";
const HAN_TEXT = /[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u31f0-\u31ff\u3200-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]|[\ud840-\ud8bf][\udc00-\udfff]/;
/** `window.__docsHanSimSunLineOff = true` asks the older reading (Han and
 * kana under a Latin run measured as that run's face), for an A/B of one build. */
function hanSimSunLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsHanSimSunLineOff?: boolean}).__docsHanSimSunLineOff === true;
}
/** The East Asian characters of those blocks SimSun has no glyph for and
 * Microsoft YaHei has (the cmaps of the two files Word ships): under an
 * all-Latin run Word draws them in Microsoft YaHei, and the line takes
 * YaHei's East Asian box -- 20.6 pt at 12 pt single where the SimSun line
 * is 15.6 pt (docx-look/cjk16/probes fb: 〜 ・ ｱｲｳ ｰ 〘 ゔ ㉐ 〻 ﹅ ￦ 〳 under
 * Cambria, every one in Microsoft YaHei). Corpus R398-D14: 69 of Word's 404
 * lines hold a wave dash (U+301C, "0.12〜0.18kg") and stand 20.64 pt apart. */
const HAN_SIMSUN_MISSING_TEXT = /[\u2e80\u2e82\u2e83\u2e85-\u2e87\u2e89\u2e8a\u2e8d-\u2e96\u2e98\u2e99\u2e9b-\u2ea6\u2ea8\u2ea9\u2eab-\u2ead\u2eaf-\u2eb2\u2eb4\u2eb5\u2eb8-\u2eba\u2ebc-\u2ec9\u2ecb-\u2ef3\u2f00-\u2fd5\u3004\u3018-\u301c\u301f\u3020\u302a-\u303d\u303f\u3094-\u3096\u3099\u309a\u309f\u30a0\u30f7-\u30fb\u30ff\u312a-\u312d\u31f0-\u31ff\u322a-\u3230\u3233-\u3238\u323a-\u3243\u3250-\u325f\u3280-\u3296\u3298\u329a-\u32a2\u32a9-\u32cf\u3385-\u3387\u33cb\u33cc\u33d4\u33d7\u33d9\u33da\u33de\u33df\ufe32\ufe45-\ufe48\uff5f-\uff9f\uffa1-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc\uffe6\uffe8-\uffee]/;
const HAN_SIMSUN_MISSING_FACE = "Microsoft YaHei";
/** `window.__docsHanYaHeiLineOff = true` asks the older reading (those
 * characters measured as SimSun), for an A/B of one build. */
function hanYaHeiLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsHanYaHeiLineOff?: boolean}).__docsHanYaHeiLineOff === true;
}
/** Hebrew and Arabic: Word sets them in its own face for the script when the
 * run's face has none (TextStyling `wordComplexScriptFallbackFace`: Times New
 * Roman, Arial or Courier New), and a line of them takes that face's box.
 * Corpus R458-D53: Urdu in Jameel Noori Nastaleeq, which Word lacks and sets
 * in its font table's altName Malgun Gothic -- Malgun Gothic has no Arabic,
 * so the Urdu is Arial and its lines Arial's 16.1 pt at 14 pt (Word's PDF);
 * measured as Malgun Gothic's East Asian 21 pt line they ran 28 pages to
 * Word's 18 (docx-look/probes/cjk15 a1, b1). */
const COMPLEX_FALLBACK_TEXT = /[\u0590-\u06ff\u0750-\u077f\u0870-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
/** `window.__docsComplexFallbackLineOff = true` asks the older reading
 * (Hebrew and Arabic measured as the run's own face), for an A/B of one build. */
function complexFallbackLineOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsComplexFallbackLineOff?: boolean}).__docsComplexFallbackLineOff === true;
}
/** Word's own faces for East Asian text under an all-Latin run: their box is
 * Word's file's, whatever the page paints the characters with. */
const LATIN_RUN_EAST_ASIAN_FALLBACK_FACES = new Set([HANGUL_FALLBACK_FACE.toLowerCase(), HAN_FALLBACK_FACE.toLowerCase()]);
/** Parts per (stack, text), relative to the range start. */
const autoLinePartCache = new Map<string, readonly {from: number; to: number; stack?: string}[]>();

/** WebKit truncates a fixed line-height to whole pixels (21.67px lays out as
 * 21px), while Chromium keeps it to 1/64px. The lost remainder, or 0 where the
 * engine kept the value. */
function truncatedLineRemainder(box: EngineLineBox, requestedPx: number): number {
  const remainder = requestedPx - box.heightPx;
  return Number.isInteger(box.heightPx) && remainder >= 1 / 64 && remainder < 1 ? remainder : 0;
}

/** The computed font properties the projection reads off an element. */
interface ElementFonts {
  fontSize: string;
  fontFamily: string;
  fontStyle: string;
  fontWeight: string;
  writingMode: string;
}

/** One block's published decorations, positions relative to the block. */
interface BlockDecoration {
  inline: boolean;
  from: number;
  to: number;
  attrs: Record<string, string>;
  spec: Record<string, unknown>;
  /** An empty line's strut (emptyLineStrut): its line height, in px. */
  strut?: number;
  /** A strut set at the line's top (a script run's full size). */
  strutTop?: boolean;
  strutBare?: boolean;
}

/**
 * The box an empty line between two line breaks stands on. The paragraph
 * has no strut of its own (the leaves own the line height) and a line that
 * holds only a break is an empty line box, zero tall: R21-D04's runs of blank
 * lines took no room at all, two or three lines a page, and the document came
 * out a page short of Word's. Word draws such a line at the height of the
 * break's font. A zero-width text in a box of that line height gives the line
 * that height, on the run's own baseline.
 */
/**
 * `bare`: the strut stands outside the runs' marks, on the paragraph's own
 * face. A paragraph whose mark states a size of its own draws its last line
 * (the one its closing line break leaves) at that size; a strut inside the
 * last run would carry the run's face onto that line, and its box of the
 * paragraph's small line height stands where the run's face centres it, not
 * on the mark's baseline (R279-D29: a 5 pt line for Word's 1.2 pt).
 */
/** The view of `emptyLineStrut`. */
const AUTO_LINE_STRUT_SELECTOR = "span.document-auto-line-strut";


function strutProofOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsStrutProofOff?: boolean}).__docsStrutProofOff === true;
}



function scriptProofOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsScriptProofOff?: boolean}).__docsScriptProofOff === true;
}
function emptyLineStrut(pos: number, pixels: number, top = false, bare = false): Decoration {
  return Decoration.widget(pos, (view) => {
    const element = view.dom.ownerDocument.createElement("span");
    element.className = "document-auto-linebox document-auto-line-strut";
    element.style.setProperty("--document-auto-line-height", `${pixels}px`);
    // At the line's top, a box of the line height reaches no further than
    // that height whatever its face (scriptRunStrut).
    if (top) element.style.verticalAlign = "top";
    element.setAttribute("aria-hidden", "true");
    // A word joiner, not a zero-width space: a strut inside a run must not
    // open a break there.
    element.textContent = top ? "\u2060" : "\u200b";
    return element;
  }, {
    side: -1,
    key: `document-auto-line-strut:${pixels}${top ? ":top" : ""}${bare ? ":bare" : ""}`,
    ignoreSelection: true,
    autoLineStrut: pixels,
    autoLineStrutTop: top,
    ...(bare ? {marks: [], autoLineStrutBare: true} : {}),
  });
}

/** Counts for probes (`window.__docsAutoLinesSeeded`). */
function noteSeededAutoLines(): void {
  if (typeof window === "undefined") return;
  const holder = window as Window & { __docsAutoLinesSeeded?: number };
  holder.__docsAutoLinesSeeded = (holder.__docsAutoLinesSeeded ?? 0) + 1;
}

function replayBlockDecoration(item: BlockDecoration, position: number): Decoration {
  if (item.strut !== undefined) return emptyLineStrut(position + item.from, item.strut, item.strutTop === true, item.strutBare === true);
  return item.inline
    ? Decoration.inline(position + item.from, position + item.to, item.attrs, item.spec)
    : Decoration.node(position + item.from, position + item.to, item.attrs, item.spec);
}

/**
 * The decorations each text block's last measurement produced, kept with the
 * block node while nothing it was measured from has changed.
 *
 * A pass measured every source paragraph of the document after every change,
 * and again on every caret move while any paragraph holds an inline object
 * it cannot rule out (a bookmark point, a field, a list marker: 69 of the
 * stress document's 394 paragraphs, always), though a keystroke changes one
 * paragraph. A block's result is a function of its node (its text, marks and
 * attributes), the computed fonts of its elements and their ancestors, the
 * text and structure of its DOM, its script ranges, the font owner's native
 * line coverage, its list marker, and the font measurements. The signature
 * holds every one of these that can change without the others: the
 * attributes and nesting of each element of the block's subtree and of its
 * ancestors up to the editor root (what selects the rules that give the
 * computed fonts), its text, and the model inputs. The rest is the cache's context:
 * the document's attributes, the root's own classes and style, the East Asian
 * faces, and the font measurements, which the view clears together with this
 * cache. A block measured while one of its faces was still on its way is not
 * kept, as the font measurements are not.
 */
/** How many changed nodes may wait for a pass before the detached ones go. */
const PRUNE_CHANGED_AT = 2048;
const PRUNE_IDLE_MS = 2000;

/** Published projections the plugin state withdrew decorations from (and
 * what it mapped them into): no longer a record of what was measured. */
const withdrawnProjections = new WeakSet<DecorationSet>();

/** On unless `window.__docsFractionNodeKept = false` (development A/B): an
 * empty paragraph's own fraction box stays through an edit that left the
 * paragraph as it was. */
function fractionNodeKept(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsFractionNodeKept?: boolean }).__docsFractionNodeKept !== false;
}

/** A projection's decorations, compared by everything they draw. */
function projectionDetail(items: readonly Decoration[]): string {
  return items
    .map((item) => JSON.stringify([item.from, item.to, (item as Decoration & { inline: boolean }).inline,
      (item as unknown as { type: { attrs?: unknown } }).type.attrs ?? null, item.spec]))
    .sort()
    .join("\n");
}

/** A pass's result. `patch`: a pass that measured only some sheets, with the
 * decorations it took out of the published projection and put in. */
interface AutoLineProjection {
  set: DecorationSet;
  patch?: { removed: readonly Decoration[]; added: readonly Decoration[] };
  /** Only the sheets that changed were read: a whole pass is owed. */
  scoped?: boolean;
}

export class AutoLineBlockCache {
  private entries = new WeakMap<ProseMirrorNode, { model: string; dom: string; decorations: BlockDecoration[]; unsafe: boolean; stale?: boolean }>();
  private context = "";
  // The DOM nodes changed since the last pass. A block none of them is in
  // or above has the DOM half of its signature as it was stored: writing it
  // out again for every block of the document cost as much as measuring.
  private observer: MutationObserver | null = null;
  private root: Element | null = null;
  private readonly changed = new Set<Node>();
  private pruneAt = PRUNE_CHANGED_AT;
  private pruneTimer: ReturnType<typeof setTimeout> | null = null;
  // The changed nodes and every node above them, up to the root.
  private readonly touched = new Set<Node>();
  private everything = true;
  // Whether the published projection may be patched by the next pass (see
  // `reusable`): not before a pass has projected the whole document since
  // the cache was last cleared or lost track of the DOM.
  private whole = false;
  // The blocks whose last measurement found DOM it could not rule out.
  private readonly unsafeBlocks = new Set<ProseMirrorNode>();
  // Changes noted and clears made so far (`mark`).
  private notes = 0;

  /** Whether the changes of the DOM are recorded (`observe`). */
  get observing(): boolean {
    return this.observer !== null;
  }

  /** A count of the DOM changes noted and the clears made so far: a pass
   * measured in slices is still the document's while it is what it was when
   * the pass began. */
  mark(): number {
    if (this.observer) this.note(this.observer.takeRecords());
    return this.notes;
  }

  /** Record the changes of `root`'s subtree from now on. */
  observe(root: Element): void {
    if (typeof MutationObserver === "undefined") return;
    this.root = root;
    this.observer = new MutationObserver((records) => this.note(records));
    this.observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.everything = true;
    this.whole = false;
    if (this.pruneTimer !== null) clearTimeout(this.pruneTimer);
    this.pruneTimer = null;
  }

  private note(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (record.target === this.root) {
        // The root's own attributes: its classes and style are the cache's
        // context; the rest are status flags. A sheet put in is new DOM.
        if (record.type === "childList") for (const node of record.addedNodes) { this.changed.add(node); this.notes += 1; }
        continue;
      }
      // A sheet going dormant or waking (paged/sheetDormancy) changes none
      // of its lines.
      if (record.type === "attributes" && record.attributeName === "data-page-dormant") continue;
      this.changed.add(record.target);
      this.notes += 1;
    }
    if (this.changed.size > this.pruneAt) this.pruneDetached();
    // No pass may come for a long time (a settled document, a reader scrolling
    // past hollow pages): what left the document does not wait for one.
    if (this.pruneTimer === null && this.changed.size > 0) {
      this.pruneTimer = setTimeout(() => {
        this.pruneTimer = null;
        this.pruneDetached();
      }, PRUNE_IDLE_MS);
    }
  }

  /**
   * Forget the changed nodes no longer in the document. Nothing in the page
   * is in or under them, so they decide no block's signature, and held here
   * they kept every sheet the page ledger replaced alive with its whole DOM
   * until the next pass: on a 296-page book laid out in the background,
   * about a million detached nodes and over a gigabyte of the tab.
   */
  private pruneDetached(): void {
    for (const node of this.changed) if (!node.isConnected) this.changed.delete(node);
    // The connected ones stay: prune again once as many more have come.
    this.pruneAt = Math.max(PRUNE_CHANGED_AT, this.changed.size * 2);
  }

  /** Start a pass: take the changes not yet delivered. */
  beginPass(): void {
    if (this.observer) this.note(this.observer.takeRecords());
    else this.everything = true;
    this.pruneDetached();
    for (const node of this.changed) {
      for (let at: Node | null = node; at && at !== this.root && !this.touched.has(at); at = at.parentNode) this.touched.add(at);
    }
  }

  /** The sheets anything changed in since the last pass; null when a change
   * stands in no sheet. */
  changedSheets(): Set<Element> | null {
    if (!this.observer) return null;
    this.note(this.observer.takeRecords());
    this.pruneDetached();
    const sheets = new Set<Element>();
    for (const node of this.changed) {
      const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
      const sheet = element?.closest("article[data-page-sheet]");
      if (!sheet || sheet.parentNode !== this.root) return null;
      sheets.add(sheet);
    }
    return sheets;
  }

  /** Whether something in or above `element` changed since the last pass. */
  domChanged(element: Element): boolean {
    if (this.everything || this.touched.has(element)) return true;
    for (let above = element.parentElement; above && above !== this.root; above = above.parentElement) {
      if (this.changed.has(above)) return true;
    }
    return false;
  }

  /**
   * End a pass. A pass that projected only some sheets (`within`) keeps the
   * changes it did not look at: the pass that reaches their sheet measures
   * the blocks under them again, as a whole pass marks them stale.
   */
  endPass(within?: ReadonlySet<Element>): void {
    if (within) {
      for (const node of this.changed) {
        const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
        const sheet = element?.closest("article[data-page-sheet]");
        if (!sheet || within.has(sheet) || !node.isConnected) this.changed.delete(node);
      }
    } else {
      this.changed.clear();
      this.whole = this.observer !== null;
    }
    this.touched.clear();
    this.everything = this.observer === null;
  }

  /**
   * Whether `published` is what the last passes projected, so that a pass
   * may measure the sheets it is asked for and keep the rest of it: a block
   * outside them would replay exactly what it published. Not after the cache
   * was cleared, nor once the plugin state withdrew some of it.
   */
  reusable(published: DecorationSet): boolean {
    return this.whole && !this.everything && !withdrawnProjections.has(published);
  }

  /** Whether a block not in `measured` was last found unsafe. */
  unsafeOutside(measured: ReadonlySet<ProseMirrorNode>): boolean {
    for (const block of this.unsafeBlocks) if (!measured.has(block)) return true;
    return false;
  }

  clear(): void {
    this.entries = new WeakMap();
    this.unsafeBlocks.clear();
    this.whole = false;
    // The view clears the font measurements with this cache.
    this.notes += 1;
  }

  /** Drop everything when the context the entries were measured in changed. */
  enter(context: string): void {
    if (context !== this.context) {
      this.context = context;
      this.clear();
    }
  }

  get(block: ProseMirrorNode) {
    return this.entries.get(block);
  }

  set(block: ProseMirrorNode, model: string, dom: string, decorations: BlockDecoration[], unsafe: boolean): void {
    const entry = { model, dom, decorations, unsafe };
    this.entries.set(block, entry);
    // What a kept layout takes of it, while this stays its measurement.
    if (!unsafe && autoLinesKeptOn()) {
      // Read at the time: a clear puts a new map in place.
      noteDrawnAutoLines(block, model, decorations, () => this.entries.get(block) === entry && !(entry as { stale?: boolean }).stale);
    }
    if (unsafe) this.unsafeBlocks.add(block);
    else this.unsafeBlocks.delete(block);
  }

  /** The block changed while no pass measured it: its stored line boxes are
   * kept until a pass does, and that pass measures it again. */
  markStale(block: ProseMirrorNode): void {
    const entry = this.entries.get(block);
    if (entry) entry.stale = true;
  }
}

// What the projection itself writes, which changes no font it reads: its
// classes, custom properties and markers, and the face a fraction span
// restates from its run. They are left out of a block's signature, or every
// publication would invalidate it. ProseMirror merges inline decorations
// without a node name into one wrapper span, so a wrapper of the projection's
// may carry another plugin's attributes too: those stay.
const OWN_CLASSES = new Set(["document-auto-linebox", "document-auto-line-fraction"]);
const OWN_ATTRIBUTES = new Set([AUTO_LINE_INTERMEDIATES_ATTR, "data-document-auto-line-fraction", "data-document-list-marker-strut"]);

const OWN_STYLE = /--(?:document-auto-line-height|document-auto-line-natural|document-auto-line-multiple|document-auto-line-fraction|document-list-marker-strut-height|document-list-marker-strut-shift|docs-list-marker-line-height|doc-word-line-shift)\s*:[^;]*;?/g;
const FRACTION_FACE = /(?:^|;)\s*font-(?:family|size)\s*:[^;]*/g;
/** A marker that rises less than this above its text's Word ascent rises
 * not at all: the two sizes differ only by the rounding of a computed size. */
const MARKER_RISE_EPSILON_PX = 1 / 64;

/** An element's attributes without the projection's own; null for a span
 * that carries nothing but the projection's own (it inherits its run's face
 * and is seen through). */
function signatureElement(element: Element): string | null {
  let key = element.nodeName;
  let foreign = false;
  for (const name of element.getAttributeNames()) {
    if (OWN_ATTRIBUTES.has(name)) continue;
    let value = element.getAttribute(name) ?? "";
    if (name === "class") value = value.split(/\s+/).filter((token) => token && !OWN_CLASSES.has(token)).join(" ");
    else if (name === "style") {
      value = value.replace(OWN_STYLE, "");
      if (element.classList.contains("document-auto-line-fraction")) value = value.replace(FRACTION_FACE, "");
      value = value.replace(/^[\s;]+|[\s;]+$/g, "");
    }
    if ((name === "class" || name === "style") && value === "") continue;
    key += ` ${name}=${value}`;
    foreign = true;
  }
  const own = element.nodeName === "SPAN" &&
    (element.classList.contains("document-auto-linebox") || element.classList.contains("document-auto-line-fraction"));
  return own && !foreign ? null : key;
}

/** The elements under `element` with their nesting (which decides what
 * each inherits). */
function signatureSubtree(element: Element, parts: string[]): void {
  for (const child of element.children) {
    const key = signatureElement(child);
    if (key !== null) parts.push(`<${key}`);
    signatureSubtree(child, parts);
    if (key !== null) parts.push(">");
  }
}

const docAttrIds = new WeakMap<object, number>();
let nextDocAttrId = 1;

/**
 * A pass that may be measured in slices. A whole pass walked every paragraph
 * of the document in one task: R286-D01 reopened in Safari held the main
 * thread 5.8 s with it (docs-auto-line-spacing maxSlice), and the fill that
 * makes the page editable waited its turn behind it.
 */
interface AutoLineRun {
  /** Measures on until `stop` says so (asked before each paragraph, once
   * this step measured one): the projection once every paragraph was, null
   * while some are left. Without `stop`, everything left. */
  step(stop?: () => boolean): AutoLineProjection | null;
  /** Something the measurements read changed since the run began: what it
   * would publish is not the document's. */
  disturbed(): boolean;
}

function finishedRun(result: AutoLineProjection): AutoLineRun {
  return { step: () => result, disturbed: () => false };
}

/** The context the block cache's entries hold for (`AutoLineBlockCache.enter`). */
function blockCacheContext(view: EditorView, eastAsianKey: string): string {
  const attrs = view.state.doc.attrs;
  let attrsId = docAttrIds.get(attrs);
  if (attrsId === undefined) docAttrIds.set(attrs, (attrsId = nextDocAttrId++));
  // ProseMirror's own state classes (focus, a hidden selection) select no font.
  const rootClasses = [...view.dom.classList].filter((name) => !name.startsWith("ProseMirror-")).sort().join(" ");
  return `${attrsId}\u0001${eastAsianKey}\u0001${rootClasses}\u0001${view.dom.getAttribute("style") ?? ""}`;
}

function projectionRun(view: EditorView, cache: Map<string, number>, lineBoxes: Map<string, EngineLineBox | null>, unsafeDOM?:()=>void, faceStillLoading?:(font: string)=>void, blocks?: AutoLineBlockCache, whole = false): AutoLineRun {
  const doc = view.dom.ownerDocument, win = doc.defaultView;
  if (!win) return finishedRun({set: DecorationSet.empty});
  // A long document laid out progressively: only the sheets the page ledger
  // measures now are projected (measureHorizon), as the CJK spacing does.
  let withinSheets: ReadonlySet<Element> | null = blocks ? sheetsWithinMeasureHorizon(view.dom) : null;
  recordProjectedHorizon(view.dom, AUTO_LINE_HORIZON_KEY);
  // A face the page has asked for but not yet received is painted by a
  // substitute, and a probe run now measures that substitute. The number is
  // right for this frame and wrong for every frame after the face arrives, so
  // it must not be remembered: a reopened document once kept the substitute's
  // 1.15 line box for a face whose own box is 1.45, and paginated a fifth
  // shorter than the same document had been saved.
  let facesStillLoading = 0;
  /** The boxes of faces still on their way, this pass's (see `height`). */
  const loadingFaceBoxes = new Map<string, number | null>();
  const settled = (font: string, family: string): boolean => {
    if (leasedFaceArrived(doc, family)) return true;
    facesStillLoading += 1;
    faceStillLoading?.(font);
    return false;
  };
  const decorations: Decoration[] = [];
  // The signatures of a block's ancestors up to the root, each element's once
  // a pass: every block of a sheet (of a table cell) wrote out the same sheet
  // (cell, row, table) again (R286-D01: 5.5 s of signatures in an open).
  const ancestorSignatures = new Map<Element, string | null>();
  const ancestorSignature = (element: Element | null): string | null => {
    if (!element || element === view.dom) return null;
    let known = ancestorSignatures.get(element);
    if (known === undefined) {
      const above = ancestorSignature(element.parentElement);
      const own = signatureElement(element) ?? "";
      known = above === null ? own : `${own}\u0001${above}`;
      ancestorSignatures.set(element, known);
    }
    return known;
  };
  // The font properties of each element this pass reads, read once: a run's
  // element was asked for its computed style four or five times over (its
  // line height, its parts, its font, the shift, the marker strut), some
  // 6,600 reads a pass on a 16-sheet document. Nothing in the editor changes
  // while a pass runs (the probes it measures with live outside it), so the
  // first reading of an element is the reading of every later one.
  const fonts = new Map<Element, ElementFonts>(), pseudoFonts = new Map<Element, ElementFonts>();
  const fontsOf = (element: Element, pseudo?: "::before"): ElementFonts => {
    const known = (pseudo ? pseudoFonts : fonts).get(element);
    if (known) return known;
    const css = win.getComputedStyle(element, pseudo);
    const read: ElementFonts = {fontSize: css.fontSize, fontFamily: css.fontFamily,
      fontStyle: css.fontStyle, fontWeight: css.fontWeight, writingMode: css.writingMode};
    (pseudo ? pseudoFonts : fonts).set(element, read);
    return read;
  };
  const eastAsian = eastAsianFontFamilies(view.state);
  const eastAsianKey = [...eastAsian].sort().join("|");
  const cacheContext = blocks ? blockCacheContext(view, eastAsianKey) : "";
  if (blocks) blocks.enter(cacheContext);
  // A long document whose projection the earlier passes made: the blocks of
  // the sheets within the horizon are measured, and every other block keeps
  // what it published (which is what a whole pass would replay for it). A
  // pass walked all 7,000 blocks of the 296-page book, rebuilt every one's
  // decorations and the set of them all, after every keystroke.
  const published = blocks ? documentAutoLineSpacingKey.getState(view.state) : undefined;
  // A document with no horizon (its footnotes keep it out of the progressive
  // pass) still changes a few sheets a step: only those are read, and a whole
  // pass follows when the ledger has settled (L3-DESIGN).
  let scoped = false;
  if (blocks && !withinSheets && !whole && published && blocks.reusable(published) && textEngineEnabled("docs-layout")) {
    withinSheets = blocks.changedSheets();
    scoped = withinSheets !== null;
  }
  let sheetRanges: [number, number][] | null = null;
  if (blocks && withinSheets && published && blocks.reusable(published) &&
      [...withinSheets].every((sheet) => sheet.parentNode === view.dom)) {
    const ranges: [number, number][] = [];
    view.state.doc.forEach((node, offset) => {
      const dom = view.nodeDOM(offset);
      if (dom instanceof win.Element && withinSheets.has(dom)) ranges.push([offset, offset + node.nodeSize]);
    });
    sheetRanges = ranges;
  }
  const scripts = new Map<number, {from: number; to: number}[]>();
  // Only the sheets within the horizon, when the pass measures only them:
  // reading every block's script ranges of the document and dropping all
  // but theirs was a walk of the whole book on each pass.
  const scriptRanges = sheetRanges
    ? sheetRanges.flatMap(([from, to]) => documentFontScriptRanges(view.state, from, to))
    : documentFontScriptRanges(view.state);
  // Characters wearing a Live Preview are a run of their own, as the press
  // makes them one: read as the run they stand in, its whole text took their
  // hovered size, and WebKit laid the rest of the line out at 72 pt, four lines
  // tall, the page breaking under it until the words were gone from the sheet.
  const previewed = documentFormatPreviewRanges(view.state);
  const asRuns = (range: {from: number; to: number}) => {
    if (previewed.length === 0) return [range];
    const cuts = [...new Set([range.from, range.to, ...previewed.flatMap(({from, to}) => [from, to])
      .filter((at) => at > range.from && at < range.to)])].sort((left, right) => left - right);
    return cuts.slice(1).map((to, index) => ({...range, from: cuts[index]!, to}));
  };
  for (const range of scriptRanges) {
    if (sheetRanges && !sheetRanges.some(([from, to]) => range.from > from && range.from < to)) continue;
    const key = view.state.doc.resolve(range.from).start() - 1;
    const entries = scripts.get(key) ?? [];
    entries.push(...asRuns(range));
    scripts.set(key, entries);
  }
  // East Asian is a property of the face: Word reads it from the font itself
  // when the document's table does not list the face. The document's own
  // East Asian faces (eastAsianKey) decide `autoLineParts`: part of its key.
  const isEastAsianFace = (family: string) => eastAsian.has(family.toLowerCase()) || wordFontIsEastAsian(family);
  // `stack`: the face list to read the line box from, when the characters are
  // set in a face behind the element's first one (`autoLineParts`).
  const height = (element: Element, multiplier: number, stack?: string): number | null => {
    const computed = fontsOf(element);
    if (!computed.fontSize || !computed.fontFamily || (computed.writingMode && computed.writingMode !== "horizontal-tb")) return null;
    const css = {fontSize: computed.fontSize, fontFamily: stack ?? computed.fontFamily,
      fontStyle: computed.fontStyle, fontWeight: computed.fontWeight};
    const sizePx = Number.parseFloat(css.fontSize);
    if (!Number.isFinite(sizePx) || sizePx <= 0) return null;
    // Explicit longhands avoid an empty computed shorthand in WebKit.
    let face = `${css.fontStyle || "normal"} ${css.fontWeight || "400"}`;
    const family = officePrimaryFontFamily(css.fontFamily);
    // Word's fallback faces for East Asian text under a Latin run are Word's
    // own files (Batang, SimSun), whatever the page paints the text with:
    // their box, East Asian.
    const hangulFallback = stack !== undefined && LATIN_RUN_EAST_ASIAN_FALLBACK_FACES.has(family.toLowerCase());
    const eastAsianFace = hangulFallback || isEastAsianFace(family);
    // Word has only the regular face of SimSun and its kind. It sets a bold
    // or italic run in that face, emboldened or slanted, so the run's line box
    // is the regular face's, as on an exact line (documentDisplayFonts). The
    // page may paint the bold with another face: SimSun's bold here is Noto
    // Serif SC Bold, 1.44em tall where SimSun is 1em. Every bold heading of
    // the 296-page book stood 1.87em instead of Word's 1.3em.
    if (face !== "normal 400" && eastAsianFace && wordFontShipsRegularOnly(family)) face = "normal 400";
    // The East Asian decision is part of the line box: the same face advances
    // 1.3x its bounding box under it and its normal box otherwise. It keys the
    // cache with the face, so a decision that changed with the font plan can
    // never reuse a ratio measured under the other one.
    const key = `${stack === undefined ? "" : "word|"}${eastAsianFace ? "ea" : "latin"}|${face} ${css.fontFamily}`;
    let ratio = cache.get(key);
    if (ratio === undefined) {
      // A regular Word face the page has not registered is painted by a
      // substitute, whose ascent and descent are not the ones Word reads.
      // A face the page bound from the recorded Word file is registered under
      // its own hash: that IS the file Word measured, so its metrics stand.
      // A face the Word model chose for these characters (`stack`) is Word's
      // own whatever the page paints them with: its recorded box stands.
      // So is an Office name the page serves through a stand-in of its style
      // only (`metric: "style"`): the stand-in's own ascent and descent are
      // not Word's, and Word's file is the one recorded. Cambria Math drawn in
      // STIX Two Math stood 1.25 em a line where Word's is 1.1724 em (corpus
      // R279-D09: 9 pt equations at 1.15 lines, 12.9 pt here for Word's
      // 12.13 pt, every equation 0.8 pt and its paragraph after low).
      const standIn = officeFontSubstitution(family);
      const styleStandIn = face === "normal 400" && standIn?.metric === "style" && standIn.wordLines !== true;
      const recorded = styleStandIn || hangulFallback
        ? wordFileLineMetrics(family)
        : stack !== undefined || (face === "normal 400" &&
          (!registeredFamily(doc, family) || wordFontFileIsRecorded(family)))
          ? wordDocumentOwnFontLineMetrics(family) : null;
      // Word derives the advance from the face's design metrics, in fractional
      // points. Both browser probes quantize a face's ascent/descent to whole
      // pixels at the size they are asked for, so read them once at a large
      // reference size and scale: for 12pt Aptos that is the difference between
      // 20px and Word's 19.52pt advance.
      const font = `${face} ${SINGLE_LINE_REFERENCE_PX}px ${css.fontFamily}`;
      // Word's single line: an East Asian face advances 1.3x its own font
      // bounding box (hhea ascender-descender, lineGap excluded); every other
      // face advances by that box PLUS lineGap, which is the CSS `normal` box.
      // With the text engine on (flag `docs`), the face's box comes from
      // the served file itself: the same in every browser, unquantized.
      // Windows Word's line where its file of this style differs from the
      // Mac one the stand-in's overrides state (word-windows-lines.ts): Book
      // Antiqua 10 pt 12.43 pt a line, its served box 12.06 (R421-D02).
      const windowsLine = recorded || eastAsianFace ? undefined
        : wordDocumentOwnWindowsLineEm(family, Number.parseInt(css.fontWeight || "400", 10) || 400, /italic|oblique/.test(css.fontStyle || ""));
      const fromFile = recorded || windowsLine !== undefined ? null : engineLineRatios(font);
      const boundingBox = eastAsianFace && !recorded && !fromFile
        ? measureOfficeFontBoundingBox(doc, font)
        : undefined;
      if (windowsLine !== undefined) {
        ratio = windowsLine;
      } else if (recorded) {
        ratio = eastAsianFace
          ? recorded.box * wordDocumentEastAsianSingleLineFactor(family)
          : recorded.box + recorded.lineGap;
      } else if (fromFile === "pending") {
        // The face is still loading in the engine: measure as before for now,
        // and keep nothing (the engine's answer replaces it).
        // Once a pass for a font: nothing is kept for good, and a probe per
        // run dirtied the style of the page before the next run's style was
        // read (R286-D01: 330 s of an open, the first page shown at 403 s).
        facesStillLoading += 1;
        let result = loadingFaceBoxes.get(key);
        if (result === undefined) {
          result = (eastAsianFace ? measureOfficeFontBoundingBox(doc, font) : measureOfficeFontLineBox(doc, {font, lineHeight: "normal", measureHeight: true})?.heightPx) ?? null;
          loadingFaceBoxes.set(key, result);
        }
        if (!result || !Number.isFinite(result)) return null;
        return (eastAsianFace ? result * wordDocumentEastAsianSingleLineFactor(family) : result) / SINGLE_LINE_REFERENCE_PX * sizePx * multiplier;
      } else if (fromFile) {
        ratio = eastAsianFace ? fromFile.box * wordDocumentEastAsianSingleLineFactor(family) : fromFile.box + fromFile.lineGap;
      } else if (boundingBox !== undefined) {
        ratio = boundingBox * wordDocumentEastAsianSingleLineFactor(family) / SINGLE_LINE_REFERENCE_PX;
      } else {
        const result = measureOfficeFontLineBox(doc, {font, lineHeight: "normal", measureHeight: true});
        if (!result?.heightPx || !Number.isFinite(result.heightPx)) return null;
        ratio = result.heightPx / SINGLE_LINE_REFERENCE_PX;
      }
      if (settled(font, family)) {
        if (cache.size >= MAX_METRICS) cache.delete(cache.keys().next().value!);
        cache.set(key, ratio);
      }
    }
    return ratio * sizePx * multiplier;
  };
  /**
   * The parts of one script range Word sets in different faces.
   *
   * East Asian text on a run whose first face is Latin (the run names no East
   * Asian face; the paragraph's default stack does, further on) is set in the
   * first East Asian face the document names in that stack, and takes that
   * face's line box: Word 16 lays 第一号内容 under a Cambria/ＭＳ 明朝 default
   * 16.4pt apart at 11pt and 1.15, where the Cambria line is 14.9pt. A Han
   * character that face has no glyph for is drawn from the face Word falls
   * back to, whose line box the line then takes (`wordEastAsianCoverage.ts`).
   * A part without `stack` is measured from the element's own stack.
   */
  const autoLineParts = (from: number, to: number, element: Element, read?: (from: number, to: number) => string): {from: number; to: number; stack?: string}[] => {
    const whole = [{from, to}];
    const text = read ? read(from, to) : view.state.doc.textBetween(from, to, "", "");
    const complexText = COMPLEX_FALLBACK_TEXT.test(text) && !complexFallbackLineOff();
    if (!text || text.length !== to - from || (!MAYBE_EAST_ASIAN_TEXT.test(text) && !complexText)) return whole;
    const stackOfElement = fontsOf(element).fontFamily;
    // Word's own East Asian faces for a family it lacks (documentDisplayFonts):
    // SimSun there is the face Word sets the text in, not the page's fallback.
    const wordEastAsian = new Set((element.closest("[data-document-word-east-asian]")
      ?.getAttribute("data-document-word-east-asian") ?? "").toLowerCase().split(",").filter(Boolean));
    // The A/B switches of the Latin-run fallbacks are part of the key: a part
    // list read under one never answers the other.
    const fallbackSwitches = `${hangulBatangLineOff() ? 1 : 0}${hanSimSunLineOff() ? 1 : 0}${hanYaHeiLineOff() ? 1 : 0}${complexText ? 1 : 0}${hangulMalgunLineOff() ? 1 : 0}`;
    // The Latin face of the run around an East Asian slot decides Hangul's
    // face under a Times New Roman slot (hangulLatinRunFace).
    const slotRun = element.closest('[data-office-font-slot="eastAsia"]')?.parentElement;
    const runLatin = slotRun ? fontsOf(slotRun).fontFamily.split(",")[0] : "";
    const cacheKey = `${eastAsianKey}\u0000${[...wordEastAsian].join(",")}\u0000${stackOfElement}\u0000${runLatin}\u0000${fallbackSwitches}\u0000${text}`;
    const cached = autoLinePartCache.get(cacheKey);
    if (cached) return cached.map((part) => ({...part, from: from + part.from, to: from + part.to}));
    const tokens = stackOfElement.split(",").map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) return whole;
    const own = isEastAsianFace(unquotedFamily(tokens[0]));
    const index = own ? 0 : tokens.findIndex((token, at) => {
      if (at === 0) return false;
      const name = unquotedFamily(token), key = name.toLowerCase();
      return eastAsian.has(key) || wordEastAsian.has(key) || (wordFontIsEastAsian(name) && !RENDER_FALLBACK_EAST_ASIAN_FACES.has(key));
    });
    // Thai in a run that names no complex-script face: Word sets it in
    // Angsana New / Browallia New, and the line takes that face's box
    // (thai.docx: 26.9 / 25.7pt pitches where the Latin line is 24.7pt).
    const thaiFace = THAI_FALLBACK_FACES.find((face) =>
      tokens.some((token) => unquotedFamily(token).toLowerCase() === face.toLowerCase()),
    );
    const hangulFace = index < 0 && HANGUL_TEXT.test(text) && !hangulBatangLineOff()
      ? hangulLatinRunFace(element, tokens, (run) => fontsOf(run).fontFamily) : null;
    const hanFace = index < 0 && HAN_TEXT.test(text) && !hanSimSunLineOff() ? HAN_FALLBACK_FACE : null;
    const complexFace = complexText ? wordComplexScriptFallbackFace(stackOfElement) : null;
    if (index < 0 && !thaiFace && !hangulFace && !hanFace && !complexFace) return whole;
    const eastAsianFace = index >= 0 ? unquotedFamily(tokens[index]) : "";
    const eastAsianStack = own || index < 0 ? undefined : tokens.slice(index).join(", ");
    const parts: {from: number; to: number; stack?: string}[] = [];
    const push = (start: number, end: number, stack: string | undefined) => {
      const last = parts.at(-1);
      if (last && last.to === start && last.stack === stack) last.to = end;
      else if (end > start) parts.push({from: start, to: end, ...(stack === undefined ? {} : {stack})});
    };
    const slices = resolveFontScriptSlices([{text, primary: "primary", eastAsia: "eastAsia", complexScript: "cs"}]);
    for (const slice of slices) {
      if (slice.slot === "cs") {
        const sliceText = text.slice(slice.from, slice.to);
        push(from + slice.from, from + slice.to, thaiFace && /[\u0e00-\u0e7f]/.test(sliceText) ? `"${thaiFace}"`
          : complexFace && COMPLEX_FALLBACK_TEXT.test(sliceText) ? `"${complexFace}"` : undefined);
        continue;
      }
      if (slice.slot === "eastAsia" && !eastAsianFace && (hangulFace || hanFace)) {
        let offset = slice.from;
        for (const char of text.slice(slice.from, slice.to)) {
          const face = hangulFace && HANGUL_TEXT.test(char) ? hangulFace
            : hanFace && HAN_TEXT.test(char)
              ? HAN_SIMSUN_MISSING_TEXT.test(char) && !hanYaHeiLineOff() ? HAN_SIMSUN_MISSING_FACE : hanFace
              : null;
          push(from + offset, from + offset + char.length, face ? `"${face}"` : undefined);
          offset += char.length;
        }
        continue;
      }
      if (slice.slot !== "eastAsia" || !eastAsianFace) {
        push(from + slice.from, from + slice.to, undefined);
        continue;
      }
      let offset = slice.from;
      for (const char of text.slice(slice.from, slice.to)) {
        const fallback = wordEastAsianMissingGlyphFace(eastAsianFace, char.codePointAt(0)!);
        push(from + offset, from + offset + char.length, fallback ? `"${fallback}"` : eastAsianStack);
        offset += char.length;
      }
    }
    if (!parts.length) return whole;
    if (autoLinePartCache.size >= MAX_METRICS * 4) autoLinePartCache.delete(autoLinePartCache.keys().next().value!);
    autoLinePartCache.set(cacheKey, parts.map((part) => ({...part, from: part.from - from, to: part.to - from})));
    return parts;
  };
  // The shorthand an engine lays this element's own line box out with.
  const elementFont = (element: Element, pseudo?: "::before") => {
    const css = fontsOf(element, pseudo);
    return {shorthand: `${css.fontStyle || "normal"} ${css.fontWeight || "400"} ${css.fontSize} ${css.fontFamily}`,
      family: css.fontFamily, size: css.fontSize};
  };
  const engineLineBox = (font: string, pixels: number): EngineLineBox | null => {
    const key = `${font}|${pixels}`;
    let box = lineBoxes.get(key);
    if (box === undefined) {
      const measured = measureOfficeFontLineBox(doc, {font, lineHeight: `${pixels}px`, measureHeight: true});
      box = measured && Number.isFinite(measured.baselinePx) && Number.isFinite(measured.heightPx) && measured.heightPx! > 0
        ? {baselinePx: measured.baselinePx, heightPx: measured.heightPx!} : null;
      if (settled(font, officePrimaryFontFamily(font.slice(font.indexOf("px ") + 3)))) {
        if (lineBoxes.size >= MAX_METRICS) lineBoxes.delete(lineBoxes.keys().next().value!);
        lineBoxes.set(key, box);
      }
    }
    return box;
  };
  // `natural`: the run's single line before an "At least" floor raised it,
  // which a bordered or emphasized run grows from (note-editor.css).
  const attrs = (pixels: number, natural?: number | null) => ({class: "document-auto-linebox",
    style: `--document-auto-line-height:${pixels}px${natural != null && natural < pixels ? `;--document-auto-line-natural:${natural}px` : ""}`});
  // A second box of the same face and line height, lowered by the remainder
  // the engine dropped, restores the full height below the line; it paints
  // back on the shared baseline. It must be its own element to nest, and
  // ProseMirror wraps it AROUND the leaf, outside the face the leaf declares:
  // it carries that face itself, or it would measure the one the run inherits.
  const fraction = (from: number, to: number, pixels: number, remainder: number, font: {family: string; size: string}) =>
    Decoration.inline(from, to, {
      nodeName: "span",
      class: "document-auto-line-fraction",
      style: `font-family:${cssFontFamilyList(font.family)};font-size:${font.size};--document-auto-line-height:${pixels}px;--document-auto-line-fraction:${remainder}px`,
    }, {inclusiveEnd: true, autoLineFraction: remainder});
  // Word lays a list paragraph's first line out with its marker among the
  // runs: the line rises to the marker's ascent, while the marker's descent
  // adds nothing, and the auto multiplier does not scale that rise. An empty
  // inline box on the paragraph reaches that ascent above the first line's
  // baseline and stays inside its descent. Being no atomic inline, it adds no
  // wrap opportunity. The run opening the paragraph is on the first line; it
  // must rise at least as high as every run, in Word and in this engine.
  const markerStrut = (block: ProseMirrorNode, position: number, blockDOM: HTMLElement, runs: readonly ControlledRun[]): Decoration | null => {
    const fact = listMarkerFact(view.state.doc, position, block);
    if (!runs.length) return null;
    // A list whose definition the page draws itself (a custom level's own
    // size and face: listDefinitionMarkers' widget) raises its line the same
    // way (Word 16 for Mac, b-list P5: a 16pt bold Arial number over 11pt
    // Arial text at 1.15 advances 25.6px; the widget drew none of it).
    let markerFamily: string;
    let markerSizePx: number;
    let markerText = "";
    if (fact) {
      markerFamily = fact.markerRun.fonts.ascii;
      markerSizePx = fact.markerRun.fontSizeHalfPoints * 2 / 3;
      markerText = fact.text;
    } else {
      const widget = blockDOM.querySelector<HTMLElement>(":scope > .docs-list-marker");
      if (!widget) return null;
      const css = fontsOf(widget);
      markerFamily = officePrimaryFontFamily(css.fontFamily);
      markerSizePx = Number.parseFloat(css.fontSize);
      markerText = widget.textContent ?? "";
      if (!(markerSizePx > 0)) return null;
    }
    // A number the marker's face cannot draw (a Korean counting number
    // under Cambria) is set in Word's fallback face, and the line rises to
    // that East Asian face's ascent; its descent, like any marker's, adds
    // nothing (Word 16 for Mac, wp-fix-a/hangul-probe.docx: a koreanCounting
    // number over 11pt Cambria at single spacing is 16.56pt a line, Malgun
    // Gothic's 1.288em ascent over Cambria's 0.222em descent; fmts.docx at
    // 1.15 is 18.5pt, the same line plus Cambria's own 0.15 line).
    const fallback = wordMarkerFallbackFace(markerFamily, markerText);
    if (fallback) markerFamily = fallback;
    const markerEastAsian = fallback !== null || isEastAsianFace(markerFamily);
    // Word's ascent for an East Asian marker face the document names is not
    // established; a fallback face's is its own recorded box.
    if (markerEastAsian && !fallback) return null;
    const markerEm = wordFontLineAscent(markerFamily, markerEastAsian);
    if (markerEm === null) return null;
    const profiles: {from: number; word: number; ascent: number; descent: number}[] = [];
    for (const run of runs) {
      const css = fontsOf(run.element);
      const family = run.face ?? officePrimaryFontFamily(css.fontFamily), sizePx = Number.parseFloat(css.fontSize);
      // A face the page serves itself has no Word ascent on record -- unless
      // Word reads it as another face whose ascent is (Cambria Math, read as
      // Cambria): the page serving Cambria Math refused R491-D05's strut.
      const lineFace = markerLineFace(family);
      if (`${css.fontStyle || "normal"} ${css.fontWeight || "400"}` !== "normal 400" ||
        (lineFace === family && faceOfThePage(doc, family) && !wordFontFileIsRecorded(family)) || !run.box || !(sizePx > 0)) return null;
      const em = wordFontLineAscent(lineFace, isEastAsianFace(family));
      if (em === null) return null;
      profiles.push({from: run.from, word: em * sizePx, ascent: run.box.baselinePx,
        descent: run.box.heightPx - run.box.baselinePx + run.remainder});
    }
    const first = profiles.find(profile => profile.from === position + 1);
    if (!first) return null;
    // A run in a face Word stands taller than the first (a Cambria Math
    // hyphen in Arial text) is in the line too: the marker raises the line
    // only by what it reaches above the tallest of them, from that run's top
    // (Windows Word, docx-look/probes/vsp13 m1: Arial 11 at Auto 1.2 under a
    // 12pt Symbol bullet advances 15.90pt a line, 16.08pt with a Cambria
    // Math "‐" in it, which alone stands 15.48pt; corpus R491-D05's
    // "WST8/1‐methoxy" item stood 15.37pt, no strut, beside Word's 15.8).
    const tall = !markerStrutTallRunOff();
    if (!tall && profiles.some(profile => profile.word > first.word || profile.ascent > first.ascent)) return null;
    const top = tall ? profiles.reduce((most, profile) => Math.max(most, profile.word), first.word) : first.word;
    const rise = markerEm * markerSizePx - top;
    if (!(rise > MARKER_RISE_EPSILON_PX)) return null;
    const descent = first.descent;
    const ascent = (tall ? profiles.reduce((most, profile) => Math.max(most, profile.ascent), first.ascent) : first.ascent) + rise;
    // A 1/64px shorter box keeps its bottom inside the text's descent after
    // the engine quantizes (or, in WebKit, truncates) the line height.
    const lineHeight = ascent + descent - 1 / 64;
    // The empty box inherits the paragraph's face. A paragraph that paints a
    // gallery marker on its first line hangs the box on that marker instead
    // (note-editor.css), which is laid out in the marker's own face; so does
    // an imported list's own marker (docs-native-list-indent), whose zero
    // line height used to win over the strut: a Symbol bullet over 12pt Times
    // stood at Times' 13.8pt where Word sets 14.65pt (corpus R371-D01).
    const native = isNativeListMarkerHost(blockDOM);
    const probe = engineLineBox(elementFont(blockDOM,
      native || blockDOM.matches(LIST_MARKER_HOST_SELECTOR) ? "::before" : undefined).shorthand, lineHeight);
    if (!probe || probe.heightPx - ascent > descent) return null;
    const shift = ascent - probe.baselinePx;
    return Decoration.node(position, position + block.nodeSize, {
      "data-document-list-marker-strut": "true",
      ...(native && nativeMarkerStrutOff() ? {"data-document-list-marker-strut-native-off": "true"} : {}),
      style: `--document-list-marker-strut-height:${lineHeight}px;--document-list-marker-strut-shift:${shift}px`,
    }, {autoLineMarkerStrut: `${lineHeight}:${shift}`});
  };
  // A custom level's own number (listDefinitionMarkers' widget, e.g. 16pt
  // bold Arial over 11pt Arial text) where the paragraph keeps its strut:
  // Word raises the line to the number's Word ascent and adds none of its
  // descent (b-list P5 at 1.15: 25.6px a line; the number inherited the
  // text's 19.4px line height and the line came out 21.39px). The number's
  // line gets the same empty strut box as a Word-numbering marker.
  const customMarkerLine = (block: ProseMirrorNode, position: number, blockDOM: HTMLElement, runs: readonly ControlledRun[], base: number): Decoration | null => {
    const widget = blockDOM.querySelector<HTMLElement>(":scope > .docs-list-marker");
    if (!widget || !runs.length) return null;
    // The level's own size and face when it states them, else as drawn.
    const css = fontsOf(widget);
    const statedPt = Number.parseFloat(widget.getAttribute("data-marker-size-pt") ?? "");
    const statedFamily = widget.getAttribute("data-marker-font") ?? officePrimaryFontFamily(css.fontFamily);
    const fallback = wordMarkerFallbackFace(statedFamily, widget.textContent ?? "");
    const markerFamily = fallback ?? statedFamily;
    const markerSizePx = statedPt > 0 ? ptToPx(statedPt) : Number.parseFloat(css.fontSize);
    if (!(markerSizePx > 0) || (!fallback && isEastAsianFace(markerFamily))) return null;
    const markerEm = wordFontLineAscent(markerFamily, fallback !== null);
    const first = runs.find(run => run.from === position + 1) ?? runs[0];
    const textCss = fontsOf(first.element);
    const textFamily = first.face ?? officePrimaryFontFamily(textCss.fontFamily), textSizePx = Number.parseFloat(textCss.fontSize);
    const textEm = wordFontLineAscent(textFamily, isEastAsianFace(textFamily));
    if (markerEm === null || textEm === null || !(textSizePx > 0)) return null;
    const rise = markerEm * markerSizePx - textEm * textSizePx;
    // A computed size is rounded (10pt reads back 13.3333px against the
    // marker's 13.33333...px): a number in the text's own face and size rose
    // by 4e-5px, and the line took the paragraph style's whole strut (corpus
    // R436-D25: Times 10pt references under an 11pt Calibri List Paragraph,
    // every first line 17.89px where Word sets 15.33px, a page more).
    // The paragraph's own line (its strut) keeps the text's descent; an
    // empty box on the paragraph reaches the number's ascent above the
    // baseline, as the Word-numbering strut does, and the number itself
    // takes no line height (its glyphs stay on the baseline), a fallback
    // face's number included.
    if (!(rise > MARKER_RISE_EPSILON_PX)) return null;
    const strut = engineLineBox(elementFont(blockDOM).shorthand, base);
    if (!strut) return null;
    const descent = strut.heightPx - strut.baselinePx;
    const ascent = strut.baselinePx + rise;
    const lineHeight = ascent + descent - 1 / 64;
    const probe = engineLineBox(elementFont(blockDOM).shorthand, lineHeight);
    if (!probe || probe.heightPx - ascent > descent) return null;
    const shift = ascent - probe.baselinePx;
    return Decoration.node(position, position + block.nodeSize, {
      "data-document-list-marker-strut": "true",
      style: `--document-list-marker-strut-height:${lineHeight}px;--document-list-marker-strut-shift:${shift}px;--docs-list-marker-line-height:0px`,
    }, {autoLineCustomMarker: `${lineHeight}:${shift}`});
  };
  // A run whose face Word's metrics are not recorded for (a Mac system face
  // such as Hiragino Sans, sizes mixed on one line): the text still stands
  // where a single line puts it, with the multiple's whole extra below
  // (Word 16.86, 3.0 multiple, header and body rows of a table: each row's
  // first baseline 8.88pt below its top at 1.0 and at 3.0). The tallest
  // run sets the line; the move is that run's own baseline in its single
  // line less its baseline in the multiplied one. The paragraph-level
  // stand-in (note-editor.css, from the paragraph's own font) moved a 9pt
  // cell line by an 11pt line's extra, and a 3.0 header row's words rose
  // above the row's top.
  const multipleLineShift = (runs: readonly ControlledRun[], multiplier: number): number | null => {
    let tallest: ControlledRun | null = null;
    for (const run of runs) {
      if (run.box && run.pixels && run.pixels > 0 && (!tallest || run.pixels > (tallest.pixels ?? 0))) tallest = run;
    }
    if (!tallest?.box || !tallest.pixels || !(multiplier > 0)) return null;
    const single = engineLineBox(elementFont(tallest.element).shorthand, tallest.pixels / multiplier);
    return single ? single.baselinePx - tallest.box.baselinePx : null;
  };
  // The paragraph mark's face as the page draws it: a family Windows Word
  // lacks is Word's pick for it (documentDisplayFonts), as the mark's runs
  // are. Named alone, the browser measured its own fallback for it (corpus
  // R379-D02: an empty paragraph marked "INSIGHTSPerpetua", which Word sets
  // in Cambria, 14.0 pt; 16.8 pt here). `window.__docsMarkLackedFaceOff =
  // true`: the bare name, as before (A/B).
  const missingSubstitutes = documentMissingFontSubstitutes(view.state) ?? {};
  const markStack = (family: string | null): string | undefined => {
    if (!family) return undefined;
    if (typeof window !== "undefined" && (window as Window & { __docsMarkLackedFaceOff?: boolean }).__docsMarkLackedFaceOff === true) return `"${family}"`;
    return missingFontStackFrom(missingSubstitutes, family) ?? `"${family}"`;
  };
  blocks?.beginPass();
  const measured = new Set<ProseMirrorNode>();
  const visit = (block: ProseMirrorNode, position: number): boolean | void => {
    if (!block.isTextblock) return;
    measured.add(block);
    const multiplier = documentAutoLineMultiplier(view.state, block, position);
    if (multiplier === null) return false;
    const floorPx = documentAutoLineFloorPx(block);
    const lineHeightOf = (element: Element, stack?: string): number | null => {
      const pixels = height(element, multiplier, stack);
      return pixels === null ? null : Math.max(pixels, floorPx);
    };
    const naturalOf = (element: Element, stack?: string): number | null =>
      floorPx > 0 ? height(element, 1, stack) : null;
    // The line that holds the paragraph mark and no words is the mark's: its
    // own size and face, when the mark states a size (Word, corpus R279-D29:
    // "ABSTRACT" and a line break, the mark 1 pt -- the line after the break
    // 1.2 pt, not the break's 13 pt; R279-D17: a paragraph of one 12 pt space
    // and a 2 pt mark stands 2.3 pt).
    const markLineOf = (element: Element, closingBreak = false): number | null => {
      const size = paragraphMarkSizePx(block) ?? (closingBreak ? paragraphFontSizePx(block) : null);
      if (size === null) return null;
      const own = Number.parseFloat(fontsOf(element).fontSize);
      const family = paragraphMarkFamily(block);
      const pixels = height(element, multiplier, markStack(family));
      return pixels === null || !(own > 0) ? null : Math.max(pixels * size / own, floorPx);
    };
    const blockDOM = view.nodeDOM(position);
    if (!(blockDOM instanceof win.HTMLElement)) return false;
    const locate = blockDomLocator(view, blockDOM, position, block.content.size);
    if (blockDOM.closest('[data-text-direction]:not([data-text-direction="lrTb"])')) return false;
    // A block on a sheet past the horizon keeps the line boxes projected for
    // it before, and one never projected has none yet. A block that changed
    // meanwhile is measured again by the pass whose horizon reaches it.
    // Measuring them all forced the style of every sheet nobody has reached:
    // 1.4 s of reads on the 296-page book before its first page showed.
    if (withinSheets && blocks && !withinSheets.has(blockDOM.closest("article[data-page-sheet]") ?? blockDOM)) {
      const entry = blocks.get(block);
      if (entry) {
        if (blocks.domChanged(blockDOM)) blocks.markStale(block);
        for (const item of entry.decorations) decorations.push(replayBlockDecoration(item, position));
        if (entry.unsafe) unsafeDOM?.();
      } else {
        // An edited block is a new node: it keeps the boxes published for it
        // (mapped through the edit) until the pass that measures it.
        const end = position + block.nodeSize;
        const published = documentAutoLineSpacingKey.getState(view.state)?.find(position, end) ?? [];
        decorations.push(...published.filter((item) => item.from >= position && item.to <= end));
      }
      return false;
    }
    const native = nativeLineCoverage(view.state, position + 1, position + block.nodeSize - 1);
    // The block's signature in two halves: what the model says (computed
    // every pass: a list's numbering moves without touching this block's
    // DOM), and what its DOM says (written out only when something in or
    // above the block changed since the last pass).
    let modelKey: string | null = null, domKey: string | null = null;
    if (blocks) {
      const model: string[] = [String(multiplier)];
      for (const range of scripts.get(position) ?? []) model.push(`s${range.from - position}-${range.to - position}`);
      for (const item of native) model.push(`n${item.from - position}-${item.to - position}`);
      const fact = listMarkerFact(view.state.doc, position, block);
      model.push(fact ? JSON.stringify(fact) : "");
      modelKey = model.join("\u0001");
      const entry = blocks.get(block);
      // A block of a restored layout draws the boxes kept with it while its
      // model reads as it did (engineLinesKept): no reading of its DOM.
      const kept = entry ? null : seededAutoLinesFor(block, modelKey);
      if (kept) {
        for (const item of kept) decorations.push(replayBlockDecoration(item, position));
        noteSeededAutoLines();
        return false;
      }
      if (entry && !blocks.domChanged(blockDOM)) {
        domKey = entry.dom;
      } else {
        const dom: string[] = [signatureElement(blockDOM) ?? ""];
        const chain = ancestorSignature(blockDOM.parentElement);
        if (chain !== null) dom.push(chain);
        signatureSubtree(blockDOM, dom);
        dom.push(blockDOM.textContent ?? "");
        domKey = dom.join("\u0001");
      }
      const known = entry && !entry.stale && entry.model === modelKey && entry.dom === domKey ? entry : undefined;
      if (known) {
        for (const item of known.decorations) decorations.push(replayBlockDecoration(item, position));
        if (known.unsafe) unsafeDOM?.();
        return false;
      }
    }
    const firstDecoration = decorations.length, loadingBefore = facesStillLoading;
    let blockUnsafe = false;
    // A blank paragraph's one line is its paragraph mark's (ECMA-376
    // 17.3.1.29): Word sets it in the mark's face, not the style's (corpus
    // R52-D20: 52 rows of Arial-marked blank cells under a Calibri style,
    // 13.2 pt a row in Word and 14 pt here, the last two rows on a page 2).
    const markFamily = block.content.size === 0 ? paragraphMarkFamily(block) : null;
    const base = lineHeightOf(blockDOM, markStack(markFamily));
    const baseDecoration = decorations.length;
    if (base !== null) {
      decorations.push(Decoration.node(position, position + block.nodeSize, attrs(base), {autoLinePixels: base}));
      // The multiple itself, which a bordered or emphasized run's line is
      // worked out with (note-editor.css): the paragraph may take it from the
      // document's default and state none of its own.
      if (multiplier !== 1) {
        decorations.push(Decoration.node(position, position + block.nodeSize,
          {style: `--document-auto-line-multiple:${multiplier}`}, {autoLineMultiple: multiplier}));
      }
      // An empty paragraph's own box is its only line, and no leaf can nest
      // inside it; the same empty inline box, lowered by the remainder the
      // engine dropped, restores it from the paragraph itself.
      const box = block.content.size === 0 ? engineLineBox(elementFont(blockDOM).shorthand, base) : null;
      const remainder = box ? truncatedLineRemainder(box, base) : 0;
      if (remainder > 0) decorations.push(Decoration.node(position, position + block.nodeSize,
        {"data-document-auto-line-fraction": "true", style: `--document-auto-line-fraction:${remainder}px`},
        {autoLineFraction: remainder}));
    }
    const leaves: Decoration[] = [];
    const runs: ControlledRun[] = [];
    // A run of nothing but spaces sets no line height in Word: a 12pt Times
    // New Roman space between 9pt Candara words leaves the 9pt pitch as it is
    // (Word 16.86, space-height probe: 24pt spaces on every line of a 9pt
    // paragraph, 12.6pt pitch with and without; corpus R28-D09). Its leaf is
    // a zero line box, and it is no run the line's ascent is taken from --
    // unless the paragraph holds nothing else.
    const blockHasWords = /[^ ]/.test(block.textContent);
    // A line of nothing but spaces (between two line breaks) is a line Word
    // draws at its runs' height: only spaces that share a line with words set
    // no height. The paragraph's text up to the break before and from the
    // break after, line breaks read as "\n" and every other leaf as content.
    const blockFrom = position + 1, blockTo = position + block.nodeSize - 1;
    // Any other leaf (a tab, a field, a picture) is content on the line.
    const leafText = (leaf: ProseMirrorNode) => (leaf.type.name === "hardBreak" ? "\n" : "\u0001");
    // The block's text, read once for all its runs (blockTextReader).
    let reader: BlockTextReader | null = null;
    const textOf = (from: number, to: number, leaf?: (leaf: ProseMirrorNode) => string): string => {
      if (autoLineBlockTextOff() || from < blockFrom || to > blockTo) return view.state.doc.textBetween(from, to, "", leaf ?? "");
      reader ??= blockTextReader(block, blockFrom);
      return leaf ? reader.between(from, to, leaf) : reader.plain(from, to);
    };
    const aloneOnItsLine = (from: number, to: number) => {
      const before = textOf(blockFrom, from, leafText);
      const after = textOf(to, blockTo, leafText);
      return `${before.slice(before.lastIndexOf("\n") + 1)}${after.split("\n")[0]}`.trim() === "";
    };
    // Spaces alone on the paragraph's last line share it with the mark only:
    // the mark sets that line (markLineOf), they set nothing.
    const aloneOnMarkLine = (from: number, to: number) =>
      aloneOnItsLine(from, to) && !textOf(to, blockTo, leafText).includes("\n");
    let markLineStrut: number | null = null;
    for (const range of scripts.get(position) ?? []) {
      const element = elementAt(view, range.from, locate);
      if (!element || element.closest('[data-document-word-line-metrics="native-control"]')) continue;
      for (let part of autoLineParts(range.from, range.to, element, textOf)) {
        // A line break kept as text ("\n": a source <w:br/> read into the
        // paragraph's text) that ends a line holding anything else sets no
        // height on it, as a hardBreak's does: Word sets a line by the rest of
        // it, the break's face only on a line of nothing else (Windows Word,
        // modes 12 and 15, docx-look/print9/probes br: Consolas 11 lines
        // 12.84 pt apart between bare and 24 pt break runs alike; an empty
        // line between two breaks 27.0 pt = 12.84 + the break's Cambria 12).
        // Corpus R461-D71: pandoc's bare <w:r><w:br/></w:r> runs, in the
        // Cambria 12 of the defaults, set every line of its Consolas 11 code
        // 2 px taller than Word's and than the ledger's engine lines, so no
        // page cut of the code could take the engine's lines.
        if (!textBreakLineOff() && part.from > blockFrom &&
          /^\n+$/.test(textOf(part.from, part.to)) &&
          textOf(part.from - 1, part.from, leafText) !== "\n") {
          leaves.push(Decoration.inline(part.from, part.from + 1,
            {class: "document-auto-linebox", style: "--document-auto-line-height:0px;vertical-align:top"},
            {autoLinePixels: 0, autoLineLeaf: true, autoLineEastAsian: false}));
          // The breaks after it end lines of nothing else: their own face.
          if (part.to - part.from === 1) continue;
          part = {...part, from: part.from + 1};
        }
        const spaces = /^ +$/.test(textOf(part.from, part.to));
        const markLine = spaces && !blockHasWords && aloneOnMarkLine(part.from, part.to) ? markLineOf(element) : null;
        if (markLine !== null) markLineStrut = markLine;
        if (spaces && ((blockHasWords && !aloneOnItsLine(part.from, part.to)) || markLine !== null)) {
          // Aligned to the line's top, a zero box cannot reach above it.
          leaves.push(Decoration.inline(part.from, part.to,
            {class: "document-auto-linebox", style: "--document-auto-line-height:0px;vertical-align:top"},
            {autoLinePixels: 0, autoLineLeaf: true, autoLineEastAsian: false}));
          continue;
        }
        const lined = lineHeightOf(element, part.stack);
        if (lined === null) continue;
        // A raised or lowered run (w:position) moves its glyphs, not a box of
        // the whole line: Word grows the line only where the moved glyphs
        // pass its edge. A leaf of the line's height moved 2 pt grew every
        // line it stood on by 2 pt (corpus R283-D02: "CaCO3" with a
        // Subscript style lowered -4 half-points, under an At least 14 pt
        // line, 2.7 px a line taller than Word's). The leaf keeps its face's
        // own line; a strut at the line's top keeps the line's height.
        const positioned = element.closest("[data-text-position]");
        const faceLine = positioned && blockDOM.contains(positioned) ? height(element, 1, part.stack) : null;
        const pixels = faceLine !== null && faceLine > 0 && faceLine < lined ? faceLine : lined;
        if (pixels !== lined) leaves.push(emptyLineStrut(part.from, lined, true));
        const face = part.stack ? officePrimaryFontFamily(part.stack) : undefined;
        // Inclusive: text typed at a run's end is that run's until the pause reads it.
        leaves.push(Decoration.inline(part.from, part.to, attrs(pixels, naturalOf(element, part.stack)), {inclusiveEnd: true, autoLinePixels: pixels, autoLineLeaf: true,
          autoLineEastAsian: isEastAsianFace(face ?? officePrimaryFontFamily(fontsOf(element).fontFamily))}));
        const font = elementFont(element), box = engineLineBox(font.shorthand, pixels);
        const remainder = box ? truncatedLineRemainder(box, pixels) : 0;
        if (remainder > 0) leaves.push(fraction(part.from, part.to, pixels, remainder, font));
        runs.push({from: part.from, element, box, remainder, pixels, ...(face ? {face} : {})});
        // A superscript or subscript run is set in a smaller face, but Word
        // gives its line the run's own size, the raise adding nothing (Word
        // 16.86, t-supline: a 12 pt superscript beside 11 pt Arial stands
        // 13.8 pt, a 24 pt one beside 12 pt text 27.7 pt; corpus R279-D17's
        // ORCID lines 1-2 pt short). A strut of that size at the line's top
        // gives the line the height without moving the raised words.
        const script = element.closest("sup, sub");
        if (script && blockDOM.contains(script) && script.parentElement) {
          const own = Number.parseFloat(fontsOf(element).fontSize);
          const nominal = Number.parseFloat(fontsOf(script.parentElement).fontSize);
          // The face's own line is what scales with the size, not an "At
          // least" floor the leaf was raised to: scaled too, a 10 pt floor
          // under an 8 pt superscript stood 12 pt (R283-D04's affiliations,
          // 2-3 pt a line taller than Word's, a page short by the end).
          const face = height(element, multiplier, part.stack);
          if (own > 0 && nominal > own + 0.01 && face !== null) {
            leaves.push(emptyLineStrut(part.from, Math.max(face * nominal / own, floorPx), true));
          }
        }
      }
    }
    // Word's line is its runs' (the tallest run on it): the paragraph's own
    // face (its style's or the document's default) sets no line of a
    // paragraph whose words are all in smaller runs. Left at the paragraph's
    // box, the block's strut held every line to it (corpus R03-D23: Verdana
    // and Symbol 10 pt bullets in a Times New Roman 12 pt document stood
    // 13.8 pt a line where Word's are 12.25 pt, a page in 16 by the end).
    if (base !== null && blockHasWords && block.content.size > 0) {
      let smallest = Infinity;
      for (const run of runs) if (run.pixels && run.pixels > 0) smallest = Math.min(smallest, run.pixels);
      // A real difference only: runs in the paragraph's own face measure its
      // box within rounding, and a hair under it on each of sixty lines let a
      // balanced two-column section end a line higher than Word's (R53-D14).
      if (Number.isFinite(smallest) && smallest < base - STRUT_RUN_TOLERANCE_PX) {
        decorations[baseDecoration] = Decoration.node(position, position + block.nodeSize, attrs(smallest), {autoLinePixels: smallest});
      }
    }
    // Word sets a line's baseline its largest Word ascent (the face's
    // ascender plus its line gap) below the line top and puts all of an auto
    // multiple's extra under the text; the engine centres its own ascent and
    // descent in the leaf's line box. The paragraph is moved by the
    // difference (note-editor.css --doc-line-shift). One size and style
    // only: a larger run need not be on every line.
    // wp-fix-a/base.docx, Calibri 11pt, first baseline below the margin:
    // Word 14.08px at single and 1.15; this engine 13.00 / 13.66 before.
    // A list number raises the first line (marker struts): not one face.
    // A paragraph heading a list item has its move made on the item, marker
    // and all (note-editor.css --doc-list-item-shift).
    // A number the page draws itself (listDefinitionMarkers' widget) is in
    // the paragraph, so the item's move carries it as the marker it is:
    // left out, an item's text stood where the engine centres it, its glyphs
    // ~1 pt under Word's while the item below stood right (corpus R491-D05,
    // "1. G6PD test used"; Arial 11 at Auto 1.2, 1.44 px). A paragraph
    // outside an item keeps the halved-extra shift (its own number line).
    const headedItem = listItemHeadedBy(view.state.doc, position, block);
    const widget = blockDOM.querySelector(":scope > .docs-list-marker") !== null;
    if (base !== null && runs.length && !block.attrs.dropCap &&
        (!widget || (headedItem !== null && !widgetItemShiftOff())) &&
        (headedItem !== null || !listMarkerFact(view.state.doc, position, block))) {
      // Faces of one size and style may mix (East Asian text and Latin words
      // in one paragraph): Word's line takes the largest Word ascent of its
      // runs, the engine's the lowest baseline its boxes centre, so the move
      // is the difference of the two maxima. That is exact for every line
      // holding the faces that set them; a line holding neither is off by
      // the difference of differences, not by the whole move.
      // (wp-ea/zh-default.docx: 等线 text with Calibri words, 10.5pt.)
      let shift: number | null = null;
      let signature: string | null = null;
      let wordAscent = -Infinity, engineBaseline = -Infinity;
      for (const run of runs) {
        const css = fontsOf(run.element);
        const family = run.face ?? officePrimaryFontFamily(css.fontFamily), sizePx = Number.parseFloat(css.fontSize);
        const own = `${sizePx}|${css.fontStyle}|${css.fontWeight}`;
        if (signature !== null && own !== signature) { wordAscent = Number.NaN; break; }
        signature = own;
        // Word's ascent comes from Word's own file; the engine's baseline
        // from the face actually drawn (a served stand-in included).
        if (!run.box || !(sizePx > 0)) { wordAscent = Number.NaN; break; }
        const em = wordFontLineAscent(family, isEastAsianFace(family));
        if (em === null) { wordAscent = Number.NaN; break; }
        wordAscent = Math.max(wordAscent, em * sizePx);
        engineBaseline = Math.max(engineBaseline, run.box.baselinePx);
      }
      if (Number.isFinite(wordAscent) && Number.isFinite(engineBaseline)) shift = wordAscent - engineBaseline;
      if (shift === null && multiplier !== 1) shift = multipleLineShift(runs, multiplier);
      if (shift !== null && Number.isFinite(shift) && Math.abs(shift) < base) {
        const rounded = Math.round(shift * 64) / 64;
        decorations.push(headedItem
          ? Decoration.node(headedItem.from, headedItem.to, {style: `--doc-list-item-shift:${rounded}px`}, {autoLineItemShift: rounded})
          : Decoration.node(position, position + block.nodeSize,
            {style: `--doc-word-line-shift:${rounded}px`}, {autoLineWordShift: rounded}));
      }
    }
    block.descendants((node, offset) => {
      if (node.type.name === DOCUMENT_FIELD_NODE_NAME) {
        // fieldLeaf: the result text's own line box, from the face it is
        // drawn in (the run style the marks around it give).
        const from = position + 1 + offset;
        const element = view.nodeDOM(from);
        if (!(element instanceof win.HTMLElement) || !textOnlyFieldView(element) ||
            element.closest('[data-document-word-line-metrics="native-control"]')) return;
        const pixels = lineHeightOf(element);
        if (pixels === null) return;
        leaves.push(Decoration.node(from, from + node.nodeSize, attrs(pixels), {autoLinePixels: pixels, autoLineLeaf: true}));
        return;
      }
      if (linePicture(node.type.name)) {
        // A line raised by an in-line picture takes the multiple's extra of
        // the paragraph's own line, not of the picture: Word 16 sets a 150pt
        // picture in an 11pt Calibri paragraph 3.1pt further down at 1.25
        // lines, 6.2pt at 1.5, 12.96pt a whole line more at 2.0 (24pt text:
        // 28.2pt), whatever the picture's height. Here the picture's box set
        // the line alone and the multiple was lost.
        const styles: string[] = [];
        const spec: Record<string, unknown> = {};
        if (base !== null && multiplier > 1) {
          const extra = (multiplier - 1) * PICTURE_LINE_MULTIPLE_SHARE * (base / multiplier);
          if (extra > 0.01) {
            // On top of the room the picture's effects take (a margin here
            // took its place: a framed picture stood on the line above).
            styles.push(`--picture-line-extra:${Math.round(extra * 1000) / 1000}px`);
            spec.autoLinePictureExtra = extra;
          }
        }
        // A line of nothing but pictures is as tall as its pictures: Word 16
        // sets a 100pt picture alone in an 11pt Calibri single-spaced
        // paragraph 99.8pt tall, with no descent of the paragraph's font
        // below it. On the baseline the box left the strut's descent under
        // the picture, 3.8pt a picture (fixture picsp).
        if (pictureOnlyParagraph(block)) {
          styles.push("vertical-align:bottom");
          spec.autoLinePictureOnly = true;
        }
        if (styles.length) {
          const from = position + 1 + offset;
          leaves.push(Decoration.node(from, from + node.nodeSize, {style: styles.join(";")}, spec));
        }
        return;
      }
      if (node.type.name !== "hardBreak") return;
      const from = position + 1 + offset;
      const element = view.nodeDOM(from);
      if (!(element instanceof win.HTMLElement) || element.closest('[data-document-word-line-metrics="native-control"]')) return;
      const pixels = lineHeightOf(element);
      if (pixels === null) return;
      const before = from > blockFrom ? view.state.doc.resolve(from).nodeBefore : null;
      if (from !== blockFrom && before && before.type.name !== "hardBreak") {
        // A break that ends a line holding anything else sets no height on
        // it: "x" and a 24 pt break stand at x's 13.8 pt in Word (16.86,
        // t-brtail D, modes 14 and 15). Aligned to the line's top, a zero
        // box cannot reach above it.
        leaves.push(Decoration.node(from, from + node.nodeSize,
          {class: "document-auto-linebox", style: "--document-auto-line-height:0px;vertical-align:top"},
          {autoLinePixels: 0, autoLineLeaf: true}));
        return;
      }
      leaves.push(Decoration.node(from, from + node.nodeSize, attrs(pixels), {autoLinePixels: pixels, autoLineLeaf: true}));
      // A break right after another (or opening the paragraph) ends a line
      // that holds nothing else: it stands on the break's strut.
      leaves.push(emptyLineStrut(from, pixels));
      runs.push({from, element, box: engineLineBox(elementFont(element).shorthand, pixels), remainder: 0});
    });
    // A line break that ends the paragraph opens a last line holding only
    // the paragraph mark; Word draws it at the mark's height (markLineOf),
    // the break's when the mark states no size of its own (R87-D17: each
    // table-of-contents line ends in a w:br, a blank line under every entry
    // in Word, none here -- the line ProseMirror's trailing <br> opens has
    // no leaf to stand on). A head the paginator cut there ends at the break
    // (note-editor.css hides its trailing <br>), so it gets none.
    const lastLeaf = block.lastChild;
    if (
      lastLeaf && block.attrs[SPLIT_CONTINUES_ATTR] !== true &&
      (lastLeaf.type.name === "hardBreak" || (lastLeaf.isText && (lastLeaf.text ?? "").endsWith("\n")))
    ) {
      const element = lastLeaf.isText ? elementAt(view, blockTo - 1, locate) : view.nodeDOM(blockTo - lastLeaf.nodeSize);
      if (element instanceof win.HTMLElement && !element.closest('[data-document-word-line-metrics="native-control"]')) {
        const markLine = markLineOf(element, true);
        const pixels = markLine ?? lineHeightOf(element);
        // The mark's line stands on the mark's face (emptyLineStrut `bare`)
        // when the paragraph draws in it (paragraphFontSize).
        const bare = markLine !== null && paragraphMarkSizePx(block) === null && paragraphFontSizePx(block) !== null;
        if (pixels !== null && pixels > 0) leaves.push(emptyLineStrut(blockTo, pixels, false, bare));
      }
    } else if (markLineStrut !== null) {
      leaves.push(emptyLineStrut(blockTo, markLineStrut));
    }
    decorations.push(...leaves);
    if (base !== null) {
      const custom = customMarkerLine(block, position, blockDOM, runs, base);
      if (custom) decorations.push(custom);
    }
    if (base !== null && coversParagraph(block, position, [...leaves, ...native])) {
      // Every source text/BR interval is independently controlled by either this
      // publication or the current font resolver. The paragraph and its
      // intermediate wrappers must not add another inherited line strut.
      if(sourceTextDOM(view,blockDOM,position,block)){
        decorations.push(Decoration.node(position, position + block.nodeSize,
          {[AUTO_LINE_INTERMEDIATES_ATTR]: "true"}, {autoLineIntermediates: true}));
        const strut = native.length ? null : markerStrut(block, position, blockDOM, runs);
        if (strut) decorations.push(strut);
      }
      else blockUnsafe = true;
    }
    if (blockUnsafe) unsafeDOM?.();
    if (blocks && modelKey !== null && domKey !== null && facesStillLoading === loadingBefore) {
      blocks.set(block, modelKey, domKey, decorations.slice(firstDecoration).map((item) => {
        const kind = item as Decoration & { inline: boolean; type: { attrs: Record<string, string> } };
        if (typeof item.spec.autoLineStrut === "number") return { inline: false, from: item.from - position, to: item.to - position, attrs: {}, spec: item.spec, strut: item.spec.autoLineStrut, ...(item.spec.autoLineStrutTop === true ? {strutTop: true} : {}), ...(item.spec.autoLineStrutBare === true ? {strutBare: true} : {}) };
        return { inline: kind.inline, from: item.from - position, to: item.to - position, attrs: kind.type.attrs, spec: item.spec };
      }), blockUnsafe);
    }
    return false;
  };
  if (sheetRanges && blocks && withinSheets && published) {
    const removed: Decoration[] = [];
    for (const [from, to] of sheetRanges) {
      view.state.doc.nodesBetween(from, to, (block, position) => {
        if (!block.isTextblock) return;
        // A block the whole pass would leave as published stays so.
        const blockDOM = view.nodeDOM(position);
        if (blockDOM instanceof win.HTMLElement && !withinSheets.has(blockDOM.closest("article[data-page-sheet]") ?? blockDOM)) return false;
        const end = position + block.nodeSize;
        const before = published.find(position, end).filter((item) =>
          (item.from >= position && item.to <= end) ||
          (item.spec.autoLineItemShift !== undefined && item.from === position - 1));
        const first = decorations.length;
        const result = visit(block, position);
        // A block that drew again exactly what it had published (the kept
        // measurement replayed: every block of a measured sheet but the one
        // typed in) is left out of the patch, taken out and put back: the
        // patch of each keystroke held every block of 20-40 sheets.
        if (!sameDecorations(before, decorations, first)) removed.push(...before);
        else decorations.length = first;
        return result;
      });
    }
    if (blocks.unsafeOutside(measured)) unsafeDOM?.();
    blocks.endPass(withinSheets);
    // remove() and add() clear the entries they take from the array given.
    const doc = view.state.doc;
    let set: DecorationSet | null = null;
    return finishedRun({
      get set() { return (set ??= removeDecorations(published, doc, removed).add(doc, decorations.slice())); },
      patch: {removed, added: decorations},
      scoped,
    });
  }
  // The walk of every block, resumable at a block's start: a step stops
  // before a paragraph once it measured one and `stop` says so, and the next
  // step walks on from there (nodesBetween passes over the blocks before it
  // and enters only the ancestors of that paragraph, which measure nothing).
  // It is the document's while nothing it reads changed (`disturbed`), which
  // only the DOM changes the cache records can tell: without them, one step.
  const walked = view.state.doc, sliceable = blocks?.observing === true;
  const publishedAtStart = documentAutoLineSpacingKey.getState(view.state);
  const fontsAtStart = documentDisplayFontPluginKey.getState(view.state);
  const markAtStart = blocks?.mark() ?? 0;
  let resumeAt = 0, result: AutoLineProjection | null = null;
  return {
    step(stop) {
      if (result) return result;
      let measuredNow = 0, stopped = false;
      walked.nodesBetween(resumeAt, walked.content.size, (block, position) => {
        if (stopped) return false;
        if (block.isTextblock) {
          if (stop && sliceable && measuredNow > 0 && stop()) {
            stopped = true;
            resumeAt = position;
            return false;
          }
          measuredNow += 1;
        }
        return visit(block, position);
      });
      if (stopped) return null;
      blocks?.endPass();
      result = {set: DecorationSet.create(walked, decorations)};
      return result;
    },
    disturbed() {
      if (result) return false;
      return view.state.doc !== walked ||
        documentAutoLineSpacingKey.getState(view.state) !== publishedAtStart ||
        documentDisplayFontPluginKey.getState(view.state) !== fontsAtStart ||
        (blocks !== undefined && (blocks.mark() !== markAtStart ||
          // The root's classes and style (the faces follow the document).
          blockCacheContext(view, eastAsianKey) !== cacheContext));
    },
  };
}

/** Whether `drawn` (from `first` on) are the very decorations `published`
 * holds for a block: the same places, kinds, attributes and specs (the kept
 * entry's own objects). Anything else counts as a change. */
function sameDecorations(published: readonly Decoration[], drawn: readonly Decoration[], first: number): boolean {
  if (drawn.length - first !== published.length) return false;
  const type = (item: Decoration) => (item as unknown as { type: { attrs?: unknown } }).type.attrs;
  const inline = (item: Decoration) => (item as Decoration & { inline: boolean }).inline;
  const remaining = [...published];
  for (let index = first; index < drawn.length; index++) {
    const item = drawn[index];
    const at = remaining.findIndex((old) =>
      old.from === item.from && old.to === item.to && inline(old) === inline(item) &&
      type(old) === type(item) && old.spec === item.spec);
    if (at < 0) return false;
    remaining.splice(at, 1);
  }
  return true;
}

/** The signature a published patch leaves: no whole pass's is equal to it. */
const PATCHED_SIGNATURE = "\u0000patched";



/** `window.__docsAutoLineBlockTextOff = true`: each run's text read with doc.textBetween (A/B). */
function autoLineBlockTextOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsAutoLineBlockTextOff?: boolean }).__docsAutoLineBlockTextOff === true;
}

function autoLineCarryMoved(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsAutoLineCarryMoved?: boolean }).__docsAutoLineCarryMoved === true;
}

/**
 * The line boxes of the text blocks a page-ledger move took out and put back.
 * The ledger re-cuts a table across pages by replacing its fragments: every
 * paragraph of the rows that moved came out of the mapping without its
 * decorations, was drawn without them, and got them back from the next pass,
 * which marked its sheet changed and laid the pages out once more (R286-D01
 * on the local stack: 1,692 of 1,695 line-box withdrawals, all of them gone
 * from this plugin's state, nearly all in table cells; four passes of an
 * opening, 0.5-2.7 s each, began with them). A slice keeps its nodes, so the
 * moved paragraph is the very node it was: its decorations are put back at
 * its new place, as a pass would replay them from the block cache (keyed by
 * the node). A block that changed is a new node and waits for the pass.
 */
function carryMovedBlockDecorations(
  transaction: Transaction,
  previous: DecorationSet,
  mapped: DecorationSet,
  oldDoc: ProseMirrorNode,
): { set: DecorationSet; blocks: ReadonlySet<ProseMirrorNode> } {
  const kept = new Set(mapped.find().map((item) => item.spec));
  // The decorations the mapping dropped, by the text block they stood in.
  const lost = new Map<ProseMirrorNode, { offset: number; item: Decoration }[]>();
  for (const item of previous.find()) {
    if (kept.has(item.spec)) continue;
    const $at = oldDoc.resolve(item.from);
    const after = $at.nodeAfter;
    const onBlock = after !== null && after.isTextblock && item.to === item.from + after.nodeSize;
    const block = onBlock ? after : $at.parent.isTextblock && $at.depth > 0 ? $at.parent : null;
    if (!block) continue;
    const start = onBlock ? item.from : $at.before();
    const entries = lost.get(block) ?? [];
    entries.push({ offset: item.from - start, item });
    lost.set(block, entries);
  }
  const placed = new Set<ProseMirrorNode>();
  if (lost.size === 0) return { set: mapped, blocks: placed };
  // Where the steps put content, in the new document.
  const doc = transaction.doc;
  const ranges: [number, number][] = [];
  transaction.mapping.maps.forEach((map, index) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const rest = transaction.mapping.slice(index + 1);
      ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
  });
  const carried: Decoration[] = [];
  for (const [from, to] of ranges) {
    if (to <= from) continue;
    doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, position) => {
      if (!node.isTextblock) return true;
      const entries = lost.get(node);
      if (entries && !placed.has(node)) {
        placed.add(node);
        for (const { offset, item } of entries) {
          const at = position + offset;
          carried.push((item as unknown as { copy(from: number, to: number): Decoration }).copy(at, at + (item.to - item.from)));
        }
      }
      return false;
    });
  }
  return { set: carried.length ? mapped.add(doc, carried) : mapped, blocks: placed };
}



const AUTO_LINE_SLICE_MS = 50;
/** A pass disturbed this many times in a row is measured at once. */
const AUTO_LINE_RESTARTS = 3;

function autoLineNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}



function autoLineSliced(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsAutoLineWhole?: boolean }).__docsAutoLineWhole !== true;
}

interface AutoLineRunRecord { steps: number; restarts: number; ms: number; finish: boolean; sliced: boolean }

/** A harness that sets `window.__docsAutoLineRuns = []` gets a record of each
 * pass: how many steps and restarts it took, and its span from first step to
 * publication. */
function noteAutoLineRun(record: AutoLineRunRecord): void {
  if (typeof window === "undefined") return;
  const runs = (window as Window & { __docsAutoLineRuns?: AutoLineRunRecord[] }).__docsAutoLineRuns;
  if (Array.isArray(runs) && runs.length < 2000) runs.push(record);
}

export const DocumentAutoLineSpacing = Extension.create<{ waitForSourceFontPlan: boolean }>({
  name: "documentAutoLineSpacing",
  // Native font state must be applied before revalidating combined coverage.
  priority: 99,
  addOptions() { return { waitForSourceFontPlan: false }; },
  addProseMirrorPlugins() {
    const waitForSourceFontPlan = this.options.waitForSourceFontPlan;
    let currentView:EditorView|undefined,checkingDecorations=false,inspectionRecursed=false;
    return [new Plugin<DecorationSet>({
      key: documentAutoLineSpacingKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, previous, oldState, newState) {
          const supplied = transaction.getMeta(documentAutoLineSpacingKey) as DecorationSet | undefined;
          if (supplied) return supplied;
          if (!transaction.docChanged && !transaction.getMeta(documentDisplayFontPluginKey)) return previous;
          // An edit of anyone's hand: what a restored layout drew no longer
          // stands for the blocks around it (engineLinesKept).
          if (transaction.docChanged && transaction.getMeta("addToHistory") !== false) retireSeededLines();
          let mapped = transaction.docChanged ? previous.map(decorationMapping(transaction), transaction.doc) : previous;
          // The blocks a ledger move carried with their line boxes: the very
          // nodes they were, wherever the inverse mapping puts their place.
          let carriedBlocks: ReadonlySet<ProseMirrorNode> | null = null;
          if (transaction.docChanged && transaction.getMeta(REBALANCE_META) && autoLineCarryMoved()) {
            const carried = carryMovedBlockDecorations(transaction, previous, mapped, oldState.doc);
            mapped = carried.set;
            carriedBlocks = carried.blocks;
          }
          const formerBlock = (block: ProseMirrorNode | null, at: number): ProseMirrorNode | null =>
            block && carriedBlocks?.has(block) ? block : oldState.doc.nodeAt(at);
          // Text typed inside a paragraph, with the document's attributes and
          // fonts as they were, can only have changed the paragraph it is in:
          // every other block is the very node it was, in the same place in
          // its list. Asking each of them again was O(document) a key.
          const onlyInside = transaction.docChanged && !transaction.getMeta(documentDisplayFontPluginKey) &&
            oldState.doc.attrs === newState.doc.attrs && editsStayInsideTextblocks([transaction]);
          // Text typed among text keeps what its paragraph drew until the hand
          // pauses: taken away and measured again, each key redrew the paragraph
          // twice (a typed line box is the run's it was typed in; the pause
          // reads it again).
          const reached = onlyInside ? touchedRanges(transaction) : null;
          if (reached && plainTextEdits(transaction) && reached.every(([from]) => {
            const $from = transaction.doc.resolve(from);
            if (!$from.parent.isTextblock || $from.depth < 1) return false;
            const start = $from.before(), end = $from.after();
            if (!mapped.find(start, end, spec => spec.autoLineIntermediates === true).length) return true;
            return coversParagraph($from.parent, start, [
              ...mapped.find(start + 1, end - 1, spec => spec.autoLineLeaf === true),
              ...nativeLineCoverage(newState, start + 1, end - 1),
            ]);
          })) {
            typedDocuments.add(newState.doc);
            return mapped;
          }
          const entries = reached
            ? [...new Set(reached.flatMap(([from, to]) => mapped.find(from, to)))]
            : mapped.find();
          // Retain eligibility during pure mapped moves only while the same
          // complete source coverage still exists. New/uncovered text, objects
          // and changed source authority lose the marker before DOM rendering.
          // Whether a block the edit left as it was (the very node, which
          // the projection's block cache knows) lost a decoration: then the
          // published set is no longer what its measurements drew.
          let keptBlockWithdrawn = false;
          const stale = entries.filter(item => {
            const withdraw = (block: ProseMirrorNode | null, previousBlock: ProseMirrorNode | null) => {
              if (block && block === previousBlock) keptBlockWithdrawn = true;
              return true;
            };
            if (item.spec.autoLineMarkerStrut !== undefined) {
              const block = transaction.doc.nodeAt(item.from);
              const previousBlock = transaction.docChanged
                ? formerBlock(block, transaction.mapping.invert().map(item.from, 1)) : block;
              // A rise was measured for these runs and fonts, in this list.
              const stale = Boolean(transaction.getMeta(documentDisplayFontPluginKey)) ||
                oldState.doc.attrs !== newState.doc.attrs || !block || !previousBlock || !block.eq(previousBlock) ||
                item.to !== item.from + block.nodeSize || listMarkerFact(transaction.doc, item.from, block) === null;
              return stale && withdraw(block, previousBlock);
            }
            if (item.spec.autoLineIntermediates !== true) return false;
            const block = transaction.doc.nodeAt(item.from);
            const autoLeaves = mapped.find(item.from + 1, item.to - 1, spec => spec.autoLineLeaf === true);
            // Mapping proves location, not that a previously measured font is
            // still current. Preserve auto witnesses only for unchanged blocks.
            const previousBlock = transaction.docChanged
              ? formerBlock(block, transaction.mapping.invert().map(item.from, 1)) : block;
            if (autoLeaves.length && (transaction.getMeta(documentDisplayFontPluginKey) ||
                oldState.doc.attrs !== newState.doc.attrs ||
                !block || !previousBlock || !block.eq(previousBlock))) return withdraw(block, previousBlock);
            const stale = !block || item.to !== item.from + block.nodeSize ||
              documentAutoLineMultiplier(newState, block, item.from) === null ||
              !coversParagraph(block, item.from, [
                ...autoLeaves,
                ...nativeLineCoverage(newState, item.from + 1, item.to - 1),
              ]);
            return stale && withdraw(block, previousBlock);
          });
          // A fraction box states the face and size it was measured with
          // (it wraps the leaf INSIDE the run's own face, so its font-family
          // wins over the run's). Mapped through an edit of its paragraph --
          // a new face or size above all -- it went on drawing the old one:
          // a font picked for text in a text box showed in Live Preview,
          // was written to the run, and the text kept its old face until
          
          // paragraph's change and is measured again.
          if (transaction.docChanged) {
            const fontsChanged = Boolean(transaction.getMeta(documentDisplayFontPluginKey)) || oldState.doc.attrs !== newState.doc.attrs;
            const inverse = transaction.mapping.invert();
            const isFraction = (spec: {autoLineFraction?: unknown}) => spec.autoLineFraction !== undefined;
            const fractions = reached
              ? [...new Set(reached.flatMap(([from, to]) => {
                  const $from = transaction.doc.resolve(from);
                  // The whole paragraph's: a fraction box goes with any change of it.
                  return $from.parent.isTextblock && $from.depth >= 1
                    ? mapped.find($from.before(), $from.after(), isFraction)
                    : mapped.find(from, to, isFraction);
                }))]
              : mapped.find(undefined, undefined, isFraction);
            for (const item of fractions) {
              // An empty paragraph's fraction stands on the paragraph itself (a
              // node decoration from its start to its end): resolved at its
              // start, its "parent" was the page around it, never a text block,
              // so every structural pass and every key typed next to it took
              // it away and the next measurement put it back (WebKit only:
              // Chromium truncates no line height). On a questionnaire of
              // hundreds of empty paragraphs, thousands of paragraph restyles a
              
              const own = fractionNodeKept() ? transaction.doc.nodeAt(item.from) : null;
              const onBlock = own !== null && own.isTextblock && item.to === item.from + own.nodeSize;
              const $at = transaction.doc.resolve(item.from);
              const block = onBlock ? own : $at.parent;
              if (!onBlock && (!block.isTextblock || $at.depth < 1)) { stale.push(item); continue; }
              const start = onBlock ? item.from : $at.before();
              const previousBlock = formerBlock(block, inverse.map(start, 1));
              if (fontsChanged || !previousBlock || !block.eq(previousBlock)) {
                if (previousBlock && block === previousBlock) keptBlockWithdrawn = true;
                stale.push(item);
              }
            }
          }
          // remove() (removeDecorationList's old arm) clears the entries it
          // finds in the array it is given.
          const revoked = stale.filter(item => item.spec.autoLineIntermediates === true).map(item => [item.from, item.to] as const);
          const withdrawn = keptBlockWithdrawn || withdrawnProjections.has(previous);
          const next = removeDecorationList(mapped, stale);
          const result = revoked.length ? withoutOrphanStruts(next, reached ? revoked : undefined) : next;
          if (withdrawn) withdrawnProjections.add(result);
          return result;
        },
      },
      props: {decorations: state => {
        const current=documentAutoLineSpacingKey.getState(state)??DecorationSet.empty;
        // A foreign provider may itself inspect other decoration props. Refuse
        // eligibility on that recursive path instead of recursing indefinitely.
        if(checkingDecorations){
          inspectionRecursed=true;
          return withoutOrphanStruts(current.remove(current.find(undefined,undefined,spec=>spec.autoLineIntermediates===true)));
        }
        checkingDecorations=true;inspectionRecursed=false;
        try{
          const providers=state.plugins.filter(plugin=>plugin!==documentAutoLineSpacingKey.get(state)&&plugin.props.decorations).map(plugin=>({
            read:(next:EditorState)=>plugin.props.decorations!.call(plugin,next),
            nativeLineOwner:plugin===documentDisplayFontPluginKey.get(state),
          }));
          if(currentView?.props.decorations)providers.push({read:next=>currentView!.props.decorations!.call(currentView!,next),nativeLineOwner:false});
          const guarded=guardAutoLineIntermediates(state,current,providers);
          const result=inspectionRecursed?guarded.remove(guarded.find(undefined,undefined,spec=>spec.autoLineIntermediates===true)):guarded;
          return result===current?current:withoutOrphanStruts(result);
        }finally{checkingDecorations=false;}
      }},
      view(view) {
        currentView=view;
        const win = view.dom.ownerDocument.defaultView;
        const cache = new Map<string, number>();
        const lineBoxes = new Map<string, EngineLineBox | null>();
        const blocks = new AutoLineBlockCache();
        blocks.observe(view.dom);
        // A pending measurement frame (its cancel): background work
        // (lib/background-work), held while the person works in another
        // window, in the frame as before otherwise.
        let typingTimer: ReturnType<typeof setTimeout> | null = null;
        let frame: (() => void) | null = null, destroyed = false, applying = false, signature = "",hadUnsafeDOM=false;
        const measureLane = createBackgroundLane({
          label: "docs-auto-line-spacing",
          owner: () => view.dom.closest(".wm-window") ?? view.dom,
        });
        let pendingMeasure: (() => void) | null = null;
        const onMetricsFlush = () => {
          // The ledger moved its horizon on to sheets this projection has not
          // measured: they are measured now, before the ledger reads them.
          if ((frame === null || !pendingMeasure) &&
              !projectionCoversHorizon(view.dom, sheetsWithinMeasureHorizon(view.dom), AUTO_LINE_HORIZON_KEY)) schedule();
          if (frame === null || !pendingMeasure) return;
          frame();
          frame = null;
          const measure = pendingMeasure;
          pendingMeasure = null;
          measure();
        };
        let topDecorations=view.props.decorations;
        let externalLayout = true, heldForSourceFonts = false, awaitingFonts = false;
        // A pass read only the sheets that changed: the whole document is read
        // once the ledger has settled, for what no sheet's DOM shows.
        let wholePassOwed = false, wholePassNext = false;
        // The pass measured in slices (`measure`): what it found unsafe, when
        // it began, its steps, its restarts, and whether it is a whole pass.
        let run: AutoLineRun | null = null, runUnsafe = false, runStarted = 0, runSteps = 0, runRestarts = 0, runWhole = false;
        const holdForSourceFonts = () => {
          if (sourceFontPlanIsReady(view.state.doc, view.dom, waitForSourceFontPlan)) return false;
          heldForSourceFonts = true;
          return true;
        };
        let inspectedDocument: ProseMirrorNode | null = null, hasSourceParagraphs = false;
        const hasProjectionWork = () => {
          if (inspectedDocument !== view.state.doc) {
            inspectedDocument = view.state.doc;
            hasSourceParagraphs = false;
            let sourcelessSoFar = true;
            view.state.doc.descendants((block, position, parent) => {
              if (hasSourceParagraphs) return false;
              if (parent === view.state.doc) {
                // A sheet nothing changed in, with no source to find, is not walked again.
                sourcelessSoFar = sourcelessSoFar && block.type.name === PAGE_BLOCK_NODE && sheetHoldsNoLineSpacingSource(block);
                if (sourcelessSoFar) return false;
              }
              if (block.isTextblock && documentAutoLineMultiplier(view.state, block, position) !== null) hasSourceParagraphs = true;
              return !block.isTextblock;
            });
          }
          // A source removal still needs one publication to clear old boxes.
          return hasSourceParagraphs || Boolean(documentAutoLineSpacingKey.getState(view.state)?.find().length);
        };
        const schedule = () => {
          if (!win || destroyed || holdForSourceFonts() || frame !== null || !hasProjectionWork()) return;
          // The first layout waits for the document's faces: measured once
          // they are in, at the ledger's flush (coldFirstLayout).
          if (firstLayoutHoldsFaces(view.dom, schedule, "auto-line-spacing")) return;
          writeDocumentLayoutStatus(view.dom, DOCUMENT_AUTO_LINE_SPACING_PENDING, "true", view);
          // Flushable: the page ledger asks for the measurement in the frame
          // of the keystroke (`mrn-layout-metrics-flush`), so the page it
          // composes already has these line boxes.
          // `finish`: measure everything left now (the ledger's flush, which
          // composes with these line boxes in the same frame).
          const measure = (finish = false) => {
            frame = null;
            // Line boxes read while the window glides are drawn, not laid-out,
            // pixels (surfaceGlide.ts): measure once it has arrived, the
            // pending flag held meanwhile.
            if (!destroyed && !view.isDestroyed && deferWhileSurfaceGlides(view.dom, schedule)) return;
            let more = false;
            try {
              if (destroyed || view.isDestroyed || holdForSourceFonts()) { run = null; return; }
              if (run?.disturbed()) {
                // What the earlier slices read is not the document's now: the
                // pass begins again (the blocks they measured are kept, so
                // mostly replayed), unless a hand typing holds it for the pause.
                run = null;
                runRestarts += 1;
                if (typedDocuments.has(view.state.doc) && msSinceTyping() < TYPING_IDLE_MS) {
                  if (typingTimer === null) {
                    typingTimer = setTimeout(() => { typingTimer = null; if (!destroyed) schedule(); }, TYPING_IDLE_MS - msSinceTyping());
                  }
                  return;
                }
              }
              if (!run) {
                runUnsafe = false;
                substitutes.clear();
                runStarted = autoLineNow();
                runSteps = 0;
                run = projectionRun(view, cache, lineBoxes,()=>{runUnsafe=true;},font=>{substitutes.add(font);}, blocks, wholePassNext || runWhole);
                runWhole = wholePassNext || runWhole;
                wholePassNext = false;
              }
              // A pass that keeps being disturbed is measured at once, as before.
              const sliced = !finish && runRestarts < AUTO_LINE_RESTARTS && autoLineSliced();
              const stepStart = autoLineNow();
              runSteps += 1;
              const projected = run.step(sliced ? () => autoLineNow() - stepStart >= AUTO_LINE_SLICE_MS : undefined);
              if (!projected) { more = true; return; }
              noteAutoLineRun({steps: runSteps, restarts: runRestarts, ms: autoLineNow() - runStarted, finish, sliced});
              run = null;
              runRestarts = 0;
              runWhole = false;
              const unsafe = runUnsafe;
              // A walk of the whole document asked for while it was measured
              // in slices: it was that whole pass.
              if (projected.scoped !== true) wholePassNext = false;
              wholePassOwed = projected.scoped === true;
              hadUnsafeDOM=unsafe;
              if (substitutes.size) awaitFaces();
              if (projected.patch) {
                // The sheets measured drew what they had published: nothing to publish.
                if (projectionDetail(projected.patch.removed) === projectionDetail(projected.patch.added)) { externalLayout = false; return; }
                // A later whole pass compares with what it publishes.
                signature = PATCHED_SIGNATURE;
              }
              // Everything a decoration draws: a pass whose boxes moved by
              // a shift alone published nothing, and kept the shift it had.
              const key = (set: DecorationSet) => projectionDetail(set.find());
              const next = projected.patch ? PATCHED_SIGNATURE : key(projected.set), published = projected.patch ? "" : key(documentAutoLineSpacingKey.getState(view.state) ?? DecorationSet.empty);
              // A measurement that publishes nothing has still answered the
              // external change it was asked about (fonts, a new plan): the
              // flag must not stay up for the next keystroke's projection,
              // which the paginator would then take for a layout change of
              // the whole document (every page measured again, no page kept).
              if (next === signature && next === published) { externalLayout = false; return; }
              if (signature === "" && next === "" && published === "") { signature = next; externalLayout = false; return; }
              signature = next;
              // Repositioning derived ranges must not invalidate the pager's
              // cycle history or cancel its in-flight typeset measurement.
              const reason = externalLayout ? "document-auto-line-spacing" : "document-auto-line-spacing-projection";
              externalLayout = false;
              applying = true;
              try { view.dispatch(view.state.tr.setMeta(documentAutoLineSpacingKey, projected.set).setMeta("addToHistory", false)); }
              finally { applying = false; }
              view.dom.dispatchEvent(new CustomEvent("mrn-page-rebalance", {bubbles: true, detail: {reason}}));
            } finally {
              
              
              if (more && !destroyed) request();
              else writeDocumentLayoutStatus(view.dom, DOCUMENT_AUTO_LINE_SPACING_PENDING, null, view);
            }
          };
          const request = () => {
            pendingMeasure = () => measure(true);
            frame = requestLaneFrame(measureLane, () => {
              pendingMeasure = null;
              if (firstLayoutHoldsFaces(view.dom, () => { frame = null; schedule(); }, "auto-line-spacing")) return;
              measure();
            }, win);
          };
          request();
        };
        const fontsChanged = () => { externalLayout = true; cache.clear(); lineBoxes.clear(); blocks.clear(); schedule(); };
        // A font subset (unicode-range) arriving changes the lines that draw
        // its glyphs, which the paginator marks for itself from the same
        // event: the boxes are measured again, and what they publish is a
        // projection, not a layout change of the whole document. A face
        // without a range restriction, or a load naming no faces, is one.
        const onFontsLoaded = (event?: Event) => {
          // The faces that arrived: WebKit's event names every face the set
          // holds (lib/font-face-news).
          const faces = newFontFacesOf(event) ??
            (event as (Event & { fontfaces?: ReadonlyArray<{ family?: string; unicodeRange?: string }> }) | undefined)?.fontfaces;
          // A face of a family the document does not draw with changes no line.
          const used = faces && faces.length > 0 ? facesUsedBy(faces, editorFontFamilies(view.dom)) : null;
          if (used && used.length === 0) return;
          // Faces arrive one at a time while a document opens (a subset per
          // script, a weight per heading): measuring the whole document again
          // for each one ran the projection three or four times in a row,
          // 300-840 ms each in Chromium. The faces still loading are waited
          // for, and the document is measured once, as the widest of the
          // changes asked.
          pendingFontChange = !loadedFaceRanges(used ?? faces) ? "layout" : (pendingFontChange ?? "ranges");
          flushFontChange();
        };
        let pendingFontChange: "ranges" | "layout" | null = null;
        let awaitingFontBatch = false;
        // The `ready` promise the last wait was on.
        let awaitedReady: Promise<FontFaceSet> | null = null;
        const flushFontChange = () => {
          const fontSet = view.dom.ownerDocument.fonts;
          if (fontSet?.status === "loading" && fontSet.ready) {
            if (awaitingFontBatch) return;
            awaitingFontBatch = true;
            // An engine can leave `ready` settled while the set still reports
            // loading (a subset still on its way: documentFontCharacters).
            // Waiting on that settled promise again came straight back, a
            // loop of microtasks that held the page's main thread for good
            
            // are waited for, or the next look is a moment later.
            const ready = fontSet.ready;
            let wait: Promise<unknown> = ready;
            if (ready === awaitedReady) {
              const loading = [...fontSet].filter((face) => face.status === "loading");
              const timer = view.dom.ownerDocument.defaultView ?? globalThis;
              wait = loading.length > 0
                ? Promise.allSettled(loading.map((face) => face.loaded))
                : new Promise<void>((resolve) => { timer.setTimeout(resolve, 100); });
            }
            awaitedReady = ready;
            void wait.then(() => {
              awaitingFontBatch = false;
              if (!destroyed) flushFontChange();
            }, () => {
              awaitingFontBatch = false;
            });
            return;
          }
          const change = pendingFontChange;
          pendingFontChange = null;
          if (change === "layout") fontsChanged();
          else if (change === "ranges") { cache.clear(); lineBoxes.clear(); blocks.clear(); schedule(); }
        };
        // Fonts a projection measured through a substitute because the page had
        // not received them. Their line boxes were never cached; once any of
        // them can be checked, the projection runs again with the real face.
        // `fonts.ready` settles after every load the page started, including a
        // leased asset registered by another plugin, so the wait does not
        // depend on the font set's events reaching this one.
        const substitutes = new Set<string>();
        const awaitFaces = () => {
          const doc = view.dom.ownerDocument, fonts = doc.fonts;
          if (awaitingFonts || !fonts?.ready) return;
          awaitingFonts = true;
          void fonts.ready.then(() => {
            awaitingFonts = false;
            if (destroyed || !substitutes.size) return;
            let arrived = false;
            for (const font of substitutes) {
              if (leasedFaceArrived(doc, officePrimaryFontFamily(font.slice(font.indexOf("px ") + 3)))) arrived = true;
            }
            // A face not even registered yet is announced by the asset event,
            // which arms this wait again; resolving now would only spin.
            if (arrived) fontsChanged();
          }, () => { awaitingFonts = false; });
        };
        const onFontAssets = () => { if (substitutes.size) awaitFaces(); };
        const onSourceFontPlan = (event: Event) => {
          if (!waitForSourceFontPlan || event.target !== view.dom ||
              !(event instanceof CustomEvent) || event.detail?.reason !== "document-display-fonts") return;
          if (holdForSourceFonts() || !heldForSourceFonts) return;
          heldForSourceFonts = false;
          fontsChanged();
        };
        view.dom.addEventListener("mrn-page-rebalance", onSourceFontPlan);
        view.dom.addEventListener(LAYOUT_METRICS_FLUSH_EVENT, onMetricsFlush);
        const onLedgerConverged = () => {
          if (!wholePassOwed) return;
          wholePassNext = true;
          schedule();
        };
        view.dom.addEventListener(PAGE_LEDGER_CONVERGED_EVENT, onLedgerConverged);
        const fonts = view.dom.ownerDocument.fonts;
        fonts?.addEventListener("loadingdone", onFontsLoaded);
        view.dom.ownerDocument.addEventListener(OFFICE_FONT_ASSETS_EVENT, onFontAssets);
        schedule();
        return {
          update(current, previous) {
            if (applying) return;
            const topDecorationsChanged=current.props.decorations!==topDecorations;
            topDecorations=current.props.decorations;
            const planChanged = documentDisplayFontPluginKey.getState(current.state)?.plan !== documentDisplayFontPluginKey.getState(previous)?.plan;
            // A new plan repaints bound faces under different alias families,
            // so a cached per-font-stack ratio no longer describes the same
            // face, nor the same East Asian decision.
            if (planChanged) { externalLayout = true; cache.clear(); lineBoxes.clear(); blocks.clear(); }
            // A measured pass made while a widget/style was present has no
            // stored DOM witness. Revisit it on a later decoration change;
            // ordinary safe metadata/selection updates do not schedule work.
            const mayRestore=hadUnsafeDOM&&(topDecorationsChanged||!current.state.selection.eq(previous.selection)||current.state.plugins.some(plugin=>
              plugin!==documentAutoLineSpacingKey.get(current.state)&&Boolean(plugin.props.decorations)&&plugin.getState(current.state)!==plugin.getState(previous)));
            // A pass owed to a widget that stood in the way (mayRestore) waits for the
            // pause like the rest: a key moves the selection, so it was asked for at
            // every key (real Safari: a whole pass and a redraw for 30 of 30).
            if (!planChanged && current.state.doc !== previous.doc && typedDocuments.has(current.state.doc)) {
              const sinceTyping = msSinceTyping();
              if (sinceTyping < TYPING_IDLE_MS) {
                if (typingTimer === null) {
                  typingTimer = setTimeout(() => {
                    typingTimer = null;
                    if (!destroyed) schedule();
                  }, TYPING_IDLE_MS - sinceTyping);
                }
                return;
              }
            }
            if (current.state.doc !== previous.doc || planChanged || mayRestore) schedule();
          },
          destroy() {
            if(currentView===view)currentView=undefined;
            destroyed = true;
            if (typingTimer !== null) clearTimeout(typingTimer);
            frame?.();
            run = null;
            measureLane.dispose();
            writeDocumentLayoutStatus(view.dom, DOCUMENT_AUTO_LINE_SPACING_PENDING, null, view);
            fonts?.removeEventListener("loadingdone", onFontsLoaded);
            view.dom.ownerDocument.removeEventListener(OFFICE_FONT_ASSETS_EVENT, onFontAssets);
            view.dom.removeEventListener("mrn-page-rebalance", onSourceFontPlan);
            view.dom.removeEventListener(LAYOUT_METRICS_FLUSH_EVENT, onMetricsFlush);
            view.dom.removeEventListener(PAGE_LEDGER_CONVERGED_EVENT, onLedgerConverged);
            cache.clear();
            lineBoxes.clear();
            blocks.clear();
            blocks.disconnect();
          },
        };
      },
    })];
  },
});
