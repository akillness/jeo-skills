"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word list numbering that the browser's own list markers cannot draw.
 *
 * Three things share one counter walk here, in document order:
 *
 *   1. An ordered list carrying a nine-level `listDefinition` (Word's Define
 *      New Number Format / Multilevel List / List Style). Its markers are any
 *      `w:lvlText` ("(1)", "Article 1", "1.2.3."), in any number style per
 *      level, aligned left / centred / right at "Aligned at", followed by a tab,
 *      a space or nothing, with the level's own font formatting.
 *   2. A HEADING with bullets or numbering. Word keeps the heading's style and
 *      adds the marker ("Bullets" / "Numbering" on a Heading 1 paragraph); the
 *      schema keeps headings top-level blocks (list items hold paragraphs), so
 *      the numbering rides the heading's own attrs and the marker is painted
 *      here. The pagination ledger still sees an ordinary heading.
 *   3. "Continue from previous list" (Set Numbering Value): a list or numbered
 *      heading that joins the numbering of the one before it, live — adding an
 *      item above renumbers it, as joining a Word numbering instance does.
 *
 * Continuity follows Word's numbering INSTANCE (`w:numId`): entries that share
 * a `listChain` id continue each other; an unchained "continue" joins the most
 * recent ordered list. Markers are non-editable widgets at the start of the
 * item's first paragraph (or the heading), never text, so the document, copy
 * and export see only the model.
 *
 * Nothing here runs for a document without such lists: the walk returns the
 * empty set and existing gallery / imported lists render exactly as before.
 */

import { createBackgroundLane, type BackgroundLane } from "../../../../lib/background-work";
import { Extension, type CommandProps } from "@tiptap/core";
import type { Node as PmNode, ResolvedPos } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { bulletGlyph, normalizeBulletStyle } from "./bulletListStyle";
import { readDocumentNumberingMarkerFact } from "./documentNumberingLayout";
import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";
import {
  ListCounterState,
  bulletListDefinition,
  listMarkerText,
  normalizeDocumentListStyles,
  normalizeListDefinition,
  presetListDefinition,
  type DocumentListStyle,
  type ListDefinition,
  type ListLevelDefinition,
} from "./listLevelDefinition";
import { normalizeListStart, normalizeListStyleType } from "./listNumbering";
import { readNativeListIndent } from "./preciseIndent";
import { numberingSuffixTabStopTwips } from "./documentNumberingLayout";
import { wordDefaultTabStopTwips } from "./wordDocumentSettings";
import { editsStayInsideTextblocks, plainTextEdits } from "./textblockOnlyEdits";
import { fragmentCarries } from "./paged/fragmentRoles";

export type HeadingListKind = "bullet" | "ordered";

const CHAIN_ID = /^[A-Za-z0-9:_-]{1,64}$/;

/** A chain id (Word numbering instance), or null. */
export function normalizeListChain(value: unknown): string | null {
  return typeof value === "string" && CHAIN_ID.test(value) ? value : null;
}

export function normalizeHeadingListKind(value: unknown): HeadingListKind | null {
  return value === "bullet" || value === "ordered" ? value : null;
}

export function normalizeListLevel(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 8 ? n : 0;
}

/** The definition a numbered/bulleted heading draws with. */
export function headingListDefinition(
  attrs: Record<string, unknown>,
): ListDefinition | null {
  const kind = normalizeHeadingListKind(attrs.listKind);
  if (!kind) return null;
  const own = normalizeListDefinition(attrs.listDefinition);
  if (own) return own;
  if (kind === "bullet") {
    return bulletListDefinition(
      bulletGlyph(normalizeBulletStyle(attrs.listStyle)),
    );
  }
  return presetListDefinition(normalizeListStyleType(attrs.listStyle));
}

// ---------------------------------------------------------------------------
// Counter walk.
// ---------------------------------------------------------------------------

interface ChainEntry {
  state: ListCounterState;
  definition: ListDefinition | null;
}

/** What Set Numbering Value needs to know about the numbering (dialog probe). */
export interface ListNumberingProbe {
  /** Textblock position → the number its own level shows. */
  values: Map<number, number>;
  /** Root ordered list position → the value its first item shows. */
  firstValue: Map<number, number>;
  /** Root ordered list position → what it would start at if it continued. */
  continueValue: Map<number, number | null>;
  /**
   * Textblock position → the level of its numbering definition it is drawn
   * at (Word's `w:ilvl`), for the items a definition paints. The dialogs
   * edit that level; nesting depth alone is wrong for an imported list that
   * starts below level 1 or skips a level.
   */
  levels: Map<number, number>;
  /**
   * Textblock position → the marker text this walk draws before it (a
   * defined level's number or bullet, a numbered heading's number), when
   * the caller collects them (Word Count counts the labels as text).
   */
  labels?: Map<number, string>;
}

/**
 * The definition level an ordered list states for its own items (`listLevel`,
 * Word's `w:ilvl` of an imported list that does not start at level 1 or skips
 * a level), or null when its nesting says it.
 */
export function explicitOrderedListLevel(list: PmNode): number | null {
  const value = list.attrs.listLevel;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8
    ? value
    : null;
}

interface WalkContext {
  probe?: ListNumberingProbe;
  decorations: Decoration[];
  byChain: Map<string, ChainEntry>;
  lastList: ChainEntry | null;
  /** The last root fragment's entry, for a page-split continuation fragment. */
  lastRoot: ChainEntry | null;
  /** Whether that root fragment was painted by this walk. */
  lastRootLive: boolean;
  /** Word's default tab stop interval (Tabs > Default tab stops). */
  defaultTabStopTwips: number;
}

function pt(value: number): string {
  return `${Math.round(value * 100) / 100}pt`;
}

/**
 * The tab after a left-aligned number, for a number wider than the hanging
 * indent (Word moves the text to the next tab stop: "2nd.<tab>ordinal").
 * All positions in twips from the edge the definition measures from.
 */
interface MarkerTabStops {
  /** Where the number starts (the first line's start). */
  startTwips: number;
  /** The text indent (the hanging indent's own stop). */
  bodyTwips: number;
  /** The paragraph's own tab stops. */
  stopsTwips: number[];
  defaultTabStopTwips: number;
}

/** The paragraph's own stops, measured from the margin as the definition's
 * positions are (a wrapper's offset is already undone by the walk). */
function paragraphTabStopsTwips(block: PmNode): number[] {
  const raw = block.attrs.tabStops;
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const stop = entry as { pos?: unknown; align?: unknown };
    if (stop.align === "bar" || typeof stop.pos !== "number" || !Number.isFinite(stop.pos)) continue;
    out.push(stop.pos);
  }
  return out;
}

function markerTabStops(
  ctx: WalkContext,
  block: PmNode,
  level: ListLevelDefinition,
  geometry: { leftPt: number; firstLinePt: number },
): MarkerTabStops | null {
  if (level.suffix !== "tab" || level.align !== "left") return null;
  return {
    startTwips: Math.round((geometry.leftPt + geometry.firstLinePt) * 20),
    bodyTwips: Math.round(geometry.leftPt * 20),
    stopsTwips: paragraphTabStopsTwips(block),
    defaultTabStopTwips: ctx.defaultTabStopTwips,
  };
}

/**
 * Widen the marker box to Word's tab stop once the number is laid out: a
 * number that ends past the text indent sends the text to the next stop.
 * Measured in the marker's own layout pixels (a zoomed or scaled page
 * divides out), so the label's real font decides, as in Word.
 */
function fitMarkerTabWidthPt(
  span: HTMLElement,
  label: HTMLElement,
  tab: MarkerTabStops,
  tabWidthPt: number,
  styleKey = "",
): number | null {
  if (!span.isConnected) return null;
  // The label's width depends on its text and the face it is drawn in: its
  // own style and what it inherits from its paragraph. Measured once per
  // such context: a long numbered document has thousands of markers in a
  // few contexts, and each read laid the document out again (WebKit, the
  // 296-page book: ~137 s). Measured afresh once the fonts load.
  // The face as computed (a style read, no layout): a paragraph's own inline
  // style differs from paragraph to paragraph while its face rarely does.
  const face = getComputedStyle(label);
  const key = `${label.textContent ?? ""}\u0000${styleKey}\u0000${face.fontFamily}\u0000${face.fontSize}\u0000${face.fontWeight}\u0000${face.fontStyle}\u0000${face.letterSpacing}\u0000${face.fontKerning}\u0000${face.fontFeatureSettings}`;
  let widthPx = markerLabelWidths.get(key);
  if (widthPx === undefined) {
    const box = span.getBoundingClientRect();
    const scale = span.offsetWidth > 0 && box.width > 0 ? box.width / span.offsetWidth : 1;
    widthPx = label.getBoundingClientRect().width / scale;
    if (!(widthPx > 0) || !Number.isFinite(widthPx)) return null;
    if (markerLabelWidths.size > 5000) markerLabelWidths.clear();
    markerLabelWidths.set(key, widthPx);
  }
  const next = numberingSuffixTabStopTwips(
    tab.startTwips + widthPx * 15,
    tab.bodyTwips,
    tab.stopsTwips,
    tab.defaultTabStopTwips,
  );
  return Math.max(Math.max(0, tabWidthPt), (next - tab.startTwips) / 20);
}

type MarkerTabFit = { span: HTMLElement; label: HTMLElement; tab: MarkerTabStops; tabWidthPt: number; styleKey: string };

/** A marker label's width (layout px) by its text and drawing context. */
const markerLabelWidths = new Map<string, number>();

/**
 * Markers waiting to be fitted, measured together. A long numbered document
 * draws thousands of markers in one view update; fitting each in its own
 * microtask interleaved a read with a write per marker (a full layout each),
 * and reading `document.fonts.ready` per marker flushed the page's style each
 * time (a 296-page book spent 17 s there while it paginated). One batch reads
 * every marker, then writes; the label's width does not depend on any other
 * marker's minimum width, so the result is the same as fitting one by one.
 */
const pendingMarkerFits = new Map<HTMLElement, MarkerTabFit>();
/** Markers fitted before the document's fonts finished loading: fitted again then. */
const markerFitsAwaitingFonts = new Map<HTMLElement, MarkerTabFit>();
let markerFitQueued = false;
let markerFontsArmed = false;

/**
 * More markers than this in one view update are a document being filled or
 * paginated in bulk (a long document opening): they are fitted after the
 * browser has rendered a frame. Read before it, the first label laid the
 * whole document out (content-visibility had not yet skipped a sheet): about
 * 0.5 s of the first frame of the 298-page book. Afterwards the sheets far
 * from the viewport are skipped and a read lays out only its own sheet. A few
 * markers (typing in a list) are fitted at once, as before.
 */
const BULK_MARKER_FITS = 40;

function queueMarkerTabFit(fit: MarkerTabFit): void {
  pendingMarkerFits.set(fit.span, fit);
  if (markerFitQueued) return;
  markerFitQueued = true;
  // The widget is placed in the line after toDOM returns; by the time the
  // microtask runs the whole view update has placed every marker.
  queueMicrotask(() => {
    if (pendingMarkerFits.size <= BULK_MARKER_FITS || typeof requestAnimationFrame !== "function") {
      flushMarkerTabFits();
      return;
    }
    // A frame callback runs before that frame is rendered; the turns it
    // asks for come after.
    requestAnimationFrame(() => { void flushMarkerTabFitsInTurns(); });
  });
}

/**
 * Fit the markers waiting in `root` now, as part of a page-ledger pass's
 * write phase: their label widths are read (most from the cache: a style
 * read, no layout) before the pass writes anything, and their widths are
 * written with the pass's own writes, so the pass's measurement lays the
 * document out once. Fitted in their own task, each batch's first read laid
 * the document out a second time (WebKit, the 296-page book).
 */
export function flushMarkerTabFitsIn(root: Element): void {
  if (pendingMarkerFits.size === 0) return;
  const fits: MarkerTabFit[] = [];
  for (const [span, fit] of pendingMarkerFits) {
    if (!span.isConnected || !root.contains(span)) continue;
    pendingMarkerFits.delete(span);
    fits.push(fit);
  }
  if (fits.length === 0) return;
  fitMarkerBatch(fits, fits.map((fit) => fitMarkerTabWidthPt(fit.span, fit.label, fit.tab, fit.tabWidthPt, fit.styleKey)));
}

function flushMarkerTabFits(): void {
  markerFitQueued = false;
  const fits = Array.from(pendingMarkerFits.values());
  pendingMarkerFits.clear();
  fitMarkerBatch(fits, fits.map((fit) => fitMarkerTabWidthPt(fit.span, fit.label, fit.tab, fit.tabWidthPt, fit.styleKey)));
}

let markerLane: BackgroundLane | null = null;

/**
 * A bulk of markers (a long document opening) is fitted in turns of the
 * shared scheduler (lib/background-work): thousands of reads were one task
 * of hundreds of milliseconds while the person typed in another window. Each
 * turn reads its markers, then writes them, as one batch does: a label's
 * width does not depend on another marker's minimum width.
 */
async function flushMarkerTabFitsInTurns(): Promise<void> {
  const lane = (markerLane ??= createBackgroundLane({ label: "docs-list-markers" }));
  while (pendingMarkerFits.size > 0) {
    await lane.turn();
    const fits: MarkerTabFit[] = [];
    const widths: Array<number | null> = [];
    for (const [span, fit] of pendingMarkerFits) {
      pendingMarkerFits.delete(span);
      fits.push(fit);
      widths.push(fitMarkerTabWidthPt(fit.span, fit.label, fit.tab, fit.tabWidthPt, fit.styleKey));
      if (lane.shouldYield()) break;
    }
    fitMarkerBatch(fits, widths);
  }
  lane.release();
  markerFitQueued = false;
}

/** Write a marker's width only when it changes: an unchanged write still
 * invalidates the page's style, and the next batch's first read then laid the
 * whole document out again (WebKit, the 296-page book: ~2.4 s per batch). */
function setMarkerMinWidth(span: HTMLElement, value: string): void {
  if (span.style.minWidth !== value) span.style.minWidth = value;
}

/** Markers drawn before their editor was in the page (a window built off
 * screen): fitted once they are. Dropped, they kept the hanging indent's
 * width and the text after the number stood against it (corpus R280-D16:
 * "(1)'vx.mat'" where Word tabs to the 420-twip default stop). */
const markerFitsAwaitingConnection = new Map<HTMLElement, { fit: MarkerTabFit; frames: number }>();
let markerConnectionWatch = false;
const MARKER_CONNECTION_FRAMES = 600;

function watchMarkerConnections(): void {
  if (markerConnectionWatch || typeof requestAnimationFrame !== "function") return;
  markerConnectionWatch = true;
  requestAnimationFrame(function check() {
    for (const [span, entry] of markerFitsAwaitingConnection) {
      if (span.isConnected) {
        markerFitsAwaitingConnection.delete(span);
        queueMarkerTabFit(entry.fit);
      } else if (++entry.frames > MARKER_CONNECTION_FRAMES) {
        markerFitsAwaitingConnection.delete(span);
      }
    }
    if (markerFitsAwaitingConnection.size > 0) requestAnimationFrame(check);
    else markerConnectionWatch = false;
  });
}

function fitMarkerBatch(fits: readonly MarkerTabFit[], widths: ReadonlyArray<number | null>): void {
  fits.forEach((fit, index) => {
    const widthPt = widths[index];
    if (widthPt !== null) setMarkerMinWidth(fit.span, pt(widthPt));
    if (fit.span.isConnected) markerFitsAwaitingFonts.set(fit.span, fit);
    else if (widthPt === null && !markerFitsAwaitingConnection.has(fit.span)) {
      markerFitsAwaitingConnection.set(fit.span, { fit, frames: 0 });
      watchMarkerConnections();
    }
  });
  if (markerFontsArmed || markerFitsAwaitingFonts.size === 0) return;
  const ready = typeof document !== "undefined" ? document.fonts?.ready : undefined;
  if (!ready) { markerFitsAwaitingFonts.clear(); return; }
  markerFontsArmed = true;
  void ready.then(async () => {
    markerFontsArmed = false;
    const waiting = Array.from(markerFitsAwaitingFonts.values());
    markerFitsAwaitingFonts.clear();
    // Widths measured in the fallback faces are void now.
    markerLabelWidths.clear();
    // Measured once more with the loaded faces; not re-armed by itself. In
    // turns of the shared scheduler as the first fit (2.3 s in one task for a
    // long book in WebKit); each turn reads its markers, then writes them.
    const lane = (markerLane ??= createBackgroundLane({ label: "docs-list-markers" }));
    let next = 0;
    while (next < waiting.length) {
      await lane.turn();
      const fits: MarkerTabFit[] = [];
      const widths: Array<number | null> = [];
      for (; next < waiting.length; ) {
        const fit = waiting[next++];
        if (!fit.span.isConnected) continue;
        fits.push(fit);
        widths.push(fitMarkerTabWidthPt(fit.span, fit.label, fit.tab, fit.tabWidthPt, fit.styleKey));
        if (lane.shouldYield()) break;
      }
      fits.forEach((fit, index) => {
        const widthPt = widths[index];
        if (widthPt !== null) setMarkerMinWidth(fit.span, pt(widthPt));
      });
    }
    lane.release();
  });
}

/** Harness switch (`window.__docsEmptyListNowrapOff = true`): an empty
 * numbered paragraph wraps as any other (A/B). */
function emptyListNowrapOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsEmptyListNowrapOff?: boolean }).__docsEmptyListNowrapOff === true;
}

function markerWidget(
  pos: number,
  text: string,
  level: ListLevelDefinition,
  tabWidthPt: number,
  key: string,
  tab: MarkerTabStops | null = null,
): Decoration {
  const style: string[] = [];
  if (level.suffix === "tab") style.push(`min-width:${pt(Math.max(0, tabWidthPt))}`);
  if (level.bold === true) style.push("font-weight:700");
  if (level.bold === false) style.push("font-weight:400");
  if (level.italic === true) style.push("font-style:italic");
  if (level.italic === false) style.push("font-style:normal");
  if (level.color) style.push(`color:${level.color}`);
  if (level.sizePt) style.push(`font-size:${pt(level.sizePt)}`);
  if (level.font) style.push(`font-family:${JSON.stringify(level.font)}`);
  const styleText = style.join(";");
  return Decoration.widget(
    pos,
    () => {
      const span = document.createElement("span");
      span.className = "docs-list-marker";
      span.setAttribute("contenteditable", "false");
      span.setAttribute("data-testid", "document-list-marker");
      span.setAttribute("data-suffix", level.suffix);
      span.setAttribute("data-align", level.align);
      if (styleText) span.setAttribute("style", styleText);
      // The level's own size and face, read by the auto line-box plugin
      // (a larger number raises its line, as in Word).
      if (level.sizePt) span.setAttribute("data-marker-size-pt", String(level.sizePt));
      if (level.font) span.setAttribute("data-marker-font", level.font);
      const label = document.createElement("span");
      label.className = "docs-list-marker__text";
      // textContent only: the marker is user-authored level text.
      label.textContent = text;
      span.appendChild(label);
      // The space after the number is no place to break the line: Word sets
      // the paragraph's first word on the number's line, a word longer than
      // the whole line included, which it then breaks at the margin (corpus
      // R55-D03 "2.4.2 BodyTextBodySpacePreserve...": one 290-character word
      // after the number, four lines in Word 16.86; the browser moved it under
      // the number and drew five). A plain paragraph moves such a word to the
      // next line (measured): only the label holds it. The word joiner
      // (U+2060, zero width) forbids the break after the space.
      if (level.suffix === "space") span.appendChild(document.createTextNode(" \u2060"));
      if (tab) {
        // Measured once placed, and again once the document's fonts load.
        queueMarkerTabFit({ span, label, tab, tabWidthPt, styleKey: styleText });
      }
      return span;
    },
    {
      side: -1,
      ignoreSelection: true,
      // Owns no line box (documentAutoLineSafety).
      listDefinitionMarker: true,
      // Everything the marker's DOM is made of, and nothing else: no
      // document position. With one, every edit or page break before a list
      // gave each later marker a new key, ProseMirror drew all of them again
      // and each was fitted to its tab stop again (a layout read per marker:
      // ~2 s of every page-ledger pass on a 296-page book, and it laid out
      // the off-screen pages). A marker whose tab context changes still gets
      // a new key, so its fit runs again.
      key: `docs-list-marker:${key}:${text}:${level.suffix}:${level.align}:${styleText}:${tabWidthPt}:${
        tab ? `${tab.startTwips},${tab.bodyTwips},${tab.stopsTwips.join("/")},${tab.defaultTabStopTwips}` : ""
      }`,
    },
  );
}

/** Word's paragraph geometry for a listed paragraph: direct indents win. */
function textblockGeometry(
  block: PmNode,
  level: ListLevelDefinition,
): { owned: boolean; leftPt: number; firstLinePt: number; tabWidthPt: number } {
  const left = block.attrs.indentLeftPt;
  if (typeof left === "number" && Number.isFinite(left)) {
    const first = block.attrs.firstLineIndentPt;
    const firstLinePt =
      typeof first === "number" && Number.isFinite(first)
        ? first
        : level.alignAtPt - level.indentPt;
    return { owned: true, leftPt: left, firstLinePt, tabWidthPt: -firstLinePt };
  }
  return {
    owned: false,
    leftPt: level.indentPt,
    firstLinePt: level.alignAtPt - level.indentPt,
    tabWidthPt: level.indentPt - level.alignAtPt,
  };
}

/** The editor's own list wrapper padding (`ul, ol { padding-left: 1.5rem }`). */
const CSS_LIST_PADDING_PT = 18;

/**
 * Where the text area of a gallery list's items starts, measured from the
 * left edge the definitions measure from, for the lists nested in each item.
 * An imported Word list carries the paragraphs' absolute indents and is drawn
 * on them (DocumentFormatting's native list pass: no wrapper padding, each
 * item at its paragraph's `w:ind left`); any other list keeps the editor's
 * wrapper padding. Null entries: the list is not native (for its children).
 */
function listItemContainers(
  list: PmNode,
  containerPt: number,
  nativeContext: boolean,
): { containers: number[]; native: boolean } {
  const name = list.type.name;
  const eligible =
    nativeContext &&
    (name === "bulletList"
      ? !list.attrs.bulletStyle || list.attrs.bulletStyle === "disc"
      : name === "orderedList"
        ? list.attrs.listDefinition == null &&
          (!list.attrs.listStyleType || list.attrs.listStyleType === "decimal")
        : false);
  const native =
    eligible &&
    list.childCount > 0 &&
    Array.from({ length: list.childCount }, (_, index) => list.child(index)).every(
      (item) => {
        const first = item.firstChild;
        if (item.type.name !== "listItem" || first?.type.name !== "paragraph") return false;
        for (let index = 1; index < item.childCount; index += 1) {
          if (!["orderedList", "bulletList", "taskList"].includes(item.child(index).type.name))
            return false;
        }
        return readNativeListIndent(first.attrs, containerPt) !== null;
      },
    );
  const containers = Array.from({ length: list.childCount }, (_, index) => {
    const first = list.child(index).firstChild;
    if (native && first) {
      const indent = readNativeListIndent(first.attrs, containerPt);
      if (indent) return indent.leftPt;
    }
    return containerPt + CSS_LIST_PADDING_PT;
  });
  return { containers, native };
}

/**
 * A bullet level drawn inside a defined numbering (a Word definition whose
 * levels mix numbers and bullets). The glyph, its font and alignment are the
 * bullet list's own (Bullets gallery / Define New Bullet change them there);
 * position and "Follow number with" are the definition's level, as in Word.
 */
function bulletLevelEntry(
  list: PmNode,
  definition: ListDefinition,
  level: number,
): ListLevelDefinition {
  const base = definition.levels[level];
  const ownGlyph =
    typeof list.attrs.bulletGlyph === "string" && list.attrs.bulletGlyph
      ? list.attrs.bulletGlyph
      : null;
  const style = list.attrs.bulletStyle;
  const glyph =
    ownGlyph ??
    (base.format === "bullet" && (!style || style === "disc")
      ? base.text
      : bulletGlyph(normalizeBulletStyle(style)));
  const sameAsLevel = base.format === "bullet" && glyph === base.text;
  const font =
    typeof list.attrs.bulletFont === "string" && list.attrs.bulletFont
      ? list.attrs.bulletFont
      : sameAsLevel
        ? base.font
        : null;
  const align = list.attrs.bulletAlign;
  return {
    ...base,
    format: "bullet",
    text: glyph,
    font,
    align: align === "center" || align === "right" ? align : sameAsLevel ? base.align : "left",
    bold: sameAsLevel ? base.bold : null,
    italic: sameAsLevel ? base.italic : null,
    color: sameAsLevel ? base.color : null,
    sizePt: sameAsLevel ? base.sizePt : null,
  };
}

/**
 * One list wrapper of a defined numbering: its items are drawn at `level` of
 * `definition` and counted in `state` (Word's numbering instance). Ordered
 * items draw their number, bullet items (a bullet level of the same
 * definition) their glyph -- and still count, as Word counts every item of
 * an instance: a bullet item restarts the levels below it.
 *
 * `containerPt` is where the box this wrapper sits in starts, from the left
 * edge the definition's positions are measured from.
 */
function walkDefinedList(
  ctx: WalkContext,
  list: PmNode,
  listPos: number,
  level: number,
  definition: ListDefinition,
  state: ListCounterState,
  containerPt: number,
): void {
  const bullets = list.type.name === "bulletList";
  ctx.decorations.push(
    Decoration.node(listPos, listPos + list.nodeSize, {
      "data-docs-list-defined": "true",
    }),
  );
  const safeLevel = Math.min(level, 8);
  const entry = bullets
    ? bulletLevelEntry(list, definition, safeLevel)
    : definition.levels[safeLevel];
  const noMarker = bullets && list.attrs.bulletPicture === "missing";
  list.forEach((item, offset) => {
    const itemPos = listPos + 1 + offset;
    if (item.type.name !== "listItem") return;
    const continuation = item.attrs.pageSplitItemContinuation === true;
    const first = item.firstChild;
    let childContainer = containerPt;
    if (first && first.isTextblock) {
      const geometry = textblockGeometry(first, entry);
      const paragraphPos = itemPos + 1;
      const paragraphStyle = [
        `text-indent:${continuation ? "0pt" : pt(geometry.firstLinePt)} !important`,
      ];
      if (!geometry.owned) {
        const inset = entry.indentPt - containerPt;
        ctx.decorations.push(
          Decoration.node(itemPos, itemPos + item.nodeSize, {
            style: inset >= 0 ? `padding-left:${pt(inset)}` : `margin-left:${pt(inset)}`,
          }),
        );
        childContainer = entry.indentPt;
      } else if (containerPt !== 0) {
        // The paragraph's own `w:ind left` is measured from the margin, and
        // this wrapper starts `containerPt` in from it.
        paragraphStyle.push(`margin-left:${pt(geometry.leftPt - containerPt)} !important`);
      }
      // An empty numbered paragraph is one line, its number however wide:
      // Word draws a number past a narrow cell's edge and the paragraph mark
      // on its line (corpus R379-D02: "1." to "41." in 23.5pt cells with
      // 7.2pt indents, rows 18.6pt). The browser broke the line after the
      // overflowing marker, before the paragraph-mark widget or any empty
      // inline, and the trailing <br> made a second line: rows 36.8pt, the
      // 41-row table two pages longer. `window.__docsEmptyListNowrapOff`: as
      // before (A/B).
      if (first.content.size === 0 && !noMarker && !emptyListNowrapOff()) paragraphStyle.push("white-space:nowrap !important");
      ctx.decorations.push(
        Decoration.node(paragraphPos, paragraphPos + first.nodeSize, {
          class: "docs-list-defined-text",
          style: paragraphStyle.join(";"),
        }),
      );
      if (!continuation) {
        const values = state.advance(definition, safeLevel);
        ctx.probe?.levels.set(paragraphPos, safeLevel);
        if (!bullets) ctx.probe?.values.set(paragraphPos, values[safeLevel]);
        if (!noMarker) {
          const text = bullets ? entry.text : listMarkerText(definition, safeLevel, values);
          ctx.probe?.labels?.set(paragraphPos, text);
          // A level that states no size draws its number in the size Word
          // gives it (the paragraph mark's, as the import read it): the
          // number took the paragraph's Normal size, 14pt over 12pt text,
          // and raised every numbered line (R02-D16).
          // A level that states no face, bold or italic draws its number as
          // the marker run Word resolves (level, paragraph mark, style
          // chain): corpus R94-D03's "1.10." under a bold Calibri 11 mark is
          // bold Calibri in Word 16.86, drawn here in the paragraph's Times.
          const fact = readDocumentNumberingMarkerFact(first.attrs);
          const markerEntry = fact
            ? {
                ...entry,
                ...(entry.sizePt ? {} : { sizePt: fact.markerRun.fontSizeHalfPoints / 2 }),
                ...(entry.font ? {} : { font: officePrimaryFontFamily(fact.markerRun.fonts.ascii) }),
                ...(typeof entry.bold === "boolean" ? {} : { bold: fact.markerRun.bold }),
                ...(typeof entry.italic === "boolean" ? {} : { italic: fact.markerRun.italic }),
              }
            : entry;
          ctx.decorations.push(
            markerWidget(
              paragraphPos + 1,
              text,
              markerEntry,
              geometry.tabWidthPt,
              "p",
              markerTabStops(ctx, first, entry, geometry),
            ),
          );
        }
      }
    }
    item.forEach((child, childOffset) => {
      const childPos = itemPos + 1 + childOffset;
      if (child.type.name === "bulletList") {
        walkDefinedList(ctx, child, childPos, level + 1, definition, state, childContainer);
        return;
      }
      if (child.type.name === "taskList") {
        visitListsBelow(ctx, child, childPos, level + 1, childContainer, false);
        return;
      }
      if (child.type.name !== "orderedList") return;
      const own = normalizeListDefinition(child.attrs.listDefinition);
      if (own) {
        // Another numbering instance nested here (a different `w:numId`).
        visitOrderedRoot(ctx, child, childPos, {
          level: level + 1,
          containerPt: childContainer,
        });
        return;
      }
      const childLevel = explicitOrderedListLevel(child) ?? level + 1;
      // A nested list that inherits the definition still has a Start at
      // of its own (Set Numbering Value on a level-2 item): it seeds that
      // level, as w:lvlOverride/w:startOverride does. It was ignored, so
      
      const childStart = normalizeListStart(child.attrs.start);
      if (childStart !== null && child.attrs.start !== child.type.spec.attrs?.start?.default)
        state.seedLevel(childLevel, childStart);
      walkDefinedList(ctx, child, childPos, childLevel, definition, state, childContainer);
    });
  });
}

/** Level-0 items of a gallery list, the ones its numbering instance counts. */
function countTopItems(list: PmNode): number {
  let count = 0;
  list.forEach((item) => {
    if (item.attrs.pageSplitItemContinuation !== true) count += 1;
  });
  return count;
}

function sourceFor(
  ctx: WalkContext,
  chain: string | null,
): ChainEntry | null {
  return chain ? (ctx.byChain.get(chain) ?? null) : ctx.lastList;
}









function visitOrderedRoot(
  ctx: WalkContext,
  list: PmNode,
  pos: number,
  nested?: { level: number; containerPt: number },
): void {
  const definition = normalizeListDefinition(list.attrs.listDefinition);
  const chain = normalizeListChain(list.attrs.listChain);
  const splitContinuation = !fragmentCarries("listLabel", list.attrs);
  const wantsContinue = list.attrs.listContinue === true;
  const baseLevel = explicitOrderedListLevel(list) ?? nested?.level ?? 0;
  if (ctx.probe && !splitContinuation) {
    const candidate = sourceFor(ctx, chain) ?? ctx.lastList;
    ctx.probe.continueValue.set(
      pos,
      candidate ? candidate.state.nextOrdinalAt(candidate.definition, baseLevel) : null,
    );
  }
  let state: ListCounterState;
  let live = false;
  if (splitContinuation && !nested && ctx.lastRoot) {
    // A page-split fragment of the same list: its counters carry on.
    state = ctx.lastRoot.state;
    live = ctx.lastRootLive;
  } else if (splitContinuation && nested && chain && ctx.byChain.has(chain)) {
    state = ctx.byChain.get(chain)!.state;
    live = true;
  } else if (wantsContinue && (sourceFor(ctx, chain) ?? ctx.lastList)) {
    // A chained list whose instance has not appeared yet joins the previous
    // list, as its own "Continue from previous list" said.
    state = (sourceFor(ctx, chain) ?? ctx.lastList)!.state;
    live = true;
    // A deeper list broken in mid-count keeps the number it states, under the
    // shallower levels' counts (corpus R280-D14: "3.5", not "1.5").
    const stated = baseLevel > 0 ? normalizeListStart(list.attrs.start) : null;
    if (stated !== null) state.seedLevel(baseLevel, stated);
  } else {
    state = new ListCounterState();
    const start = normalizeListStart(list.attrs.start);
    if (start !== null) state.seedLevel(baseLevel, start);
    else if (!definition) state.seedTop(1);
  }
  const entry: ChainEntry = { state, definition };
  ctx.probe?.firstValue.set(pos, state.nextOrdinalAt(definition, baseLevel));
  if (definition) {
    walkDefinedList(ctx, list, pos, baseLevel, definition, state, nested?.containerPt ?? 0);
    live = true;
  } else {
    const first = state.nextTopOrdinal(null);
    if (live) {
      // A gallery list whose first number comes from the list it continues:
      // the browser's own marker / counter only needs the seed.
      ctx.decorations.push(
        Decoration.node(pos, pos + list.nodeSize, {
          start: String(first),
          style: `--ml-list-start:${first - 1}`,
          "data-docs-list-continued": "true",
        }),
      );
    }
    const count = countTopItems(list);
    if (count > 0) state.seedTop(first + count);
    // seedTop leaves the counter one below the next item.
    // Its levels are the browser's; a numbering nested in it is not.
    visitListsBelow(ctx, list, pos, baseLevel, nested?.containerPt ?? 0, !nested);
  }
  if (!nested) {
    ctx.lastRoot = entry;
    ctx.lastRootLive = live;
    ctx.lastList = entry;
  }
  if (chain) ctx.byChain.set(chain, entry);
}

/** Does this ordered list draw anything through this walk on its own? */
function orderedListNeedsWalk(list: PmNode): boolean {
  return (
    list.attrs.listDefinition != null ||
    list.attrs.listContinue === true ||
    normalizeListChain(list.attrs.listChain) !== null
  );
}













function visitListsBelow(
  ctx: WalkContext,
  list: PmNode,
  listPos: number,
  level: number,
  containerPt: number,
  nativeContext: boolean,
): void {
  const { containers, native } = listItemContainers(list, containerPt, nativeContext);
  list.forEach((item, offset, index) => {
    const itemPos = listPos + 1 + offset;
    const itemContainer = containers[index] ?? containerPt + CSS_LIST_PADDING_PT;
    const childLevel = Math.min(level + 1, 8);
    item.forEach((child, childOffset) => {
      const childPos = itemPos + 1 + childOffset;
      const name = child.type.name;
      if (name === "orderedList" && orderedListNeedsWalk(child)) {
        visitOrderedRoot(ctx, child, childPos, {
          level: childLevel,
          containerPt: itemContainer,
        });
      } else if (name === "orderedList" || name === "bulletList" || name === "taskList") {
        visitListsBelow(ctx, child, childPos, childLevel, itemContainer, native);
      }
    });
  });
}

/**
 * A heading Word numbers (imported, its number drawn by headingListNumbers)
 * that a body list of the same numbering continues: "4.1" clauses under
 * Heading 1 "4" are counted on from the heading, as Word counts one
 * numbering instance whatever the paragraphs' styles (ECMA-376 17.9.16). The
 * import states the chain and the heading's counts (`listNumbering.listChain`
 * / `levelValues`); the chain's counters take them here, nothing is drawn.
 */
function visitImportedHeadingCount(ctx: WalkContext, heading: PmNode): void {
  const source = heading.attrs.source as { listNumbering?: unknown } | null | undefined;
  const numbering = source?.listNumbering as
    | { listChain?: unknown; levelValues?: unknown; level?: unknown }
    | null
    | undefined;
  const chain = normalizeListChain(numbering?.listChain);
  const values = numbering?.levelValues;
  if (!chain || !Array.isArray(values) || values.length < 1 || values.length > 9) return;
  if (!values.every((value) => Number.isInteger(value))) return;
  const entry = ctx.byChain.get(chain) ?? { state: new ListCounterState(), definition: null };
  values.forEach((value: number, level: number) => entry.state.seedLevel(level, value + 1));
  ctx.byChain.set(chain, entry);
}

function visitHeading(ctx: WalkContext, heading: PmNode, pos: number): void {
  const kind = normalizeHeadingListKind(heading.attrs.listKind);
  const definition = headingListDefinition(heading.attrs);
  if (!kind || !definition) {
    visitImportedHeadingCount(ctx, heading);
    return;
  }
  const level = normalizeListLevel(heading.attrs.listLevel);
  const entryLevel = definition.levels[level];
  const chain = normalizeListChain(heading.attrs.listChain);
  let values: number[] = [0];
  if (kind === "ordered") {
    let state: ListCounterState;
    const source = heading.attrs.listContinue === true ? sourceFor(ctx, chain) : null;
    if (source) {
      state = source.state;
    } else {
      state = new ListCounterState();
      const start = normalizeListStart(heading.attrs.listStart);
      if (start !== null && level === 0) state.seedTop(start);
    }
    values = state.advance(definition, level);
    ctx.probe?.values.set(pos, values[level]);
    if (chain) ctx.byChain.set(chain, { state, definition });
  }
  ctx.probe?.levels.set(pos, level);
  const text = listMarkerText(definition, level, values);
  ctx.probe?.labels?.set(pos, text);
  const geometry = textblockGeometry(heading, entryLevel);
  if (!geometry.owned) {
    ctx.decorations.push(
      Decoration.node(pos, pos + heading.nodeSize, {
        "data-docs-list-heading": "true",
        style: `padding-left:${pt(entryLevel.indentPt)};text-indent:${pt(geometry.firstLinePt)} !important`,
      }),
    );
  } else {
    ctx.decorations.push(
      Decoration.node(pos, pos + heading.nodeSize, {
        "data-docs-list-heading": "true",
      }),
    );
  }
  ctx.decorations.push(
    markerWidget(
      pos + 1,
      text,
      entryLevel,
      geometry.tabWidthPt,
      "h",
      markerTabStops(ctx, heading, entryLevel, geometry),
    ),
  );
}

/** Does the document hold anything this walk paints? (cheap early exit) */
function needsWalk(doc: PmNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    const name = node.type.name;
    if (name === "orderedList") {
      if (orderedListNeedsWalk(node)) found = true;
      return !found;
    }
    if (name === "heading") {
      if (node.attrs.listKind != null) found = true;
      return false;
    }
    return !node.isTextblock;
  });
  return found;
}

export function buildListDefinitionDecorations(
  doc: PmNode,
  probe?: ListNumberingProbe,
): DecorationSet {
  if (!probe && !needsWalk(doc)) return DecorationSet.empty;
  const ctx: WalkContext = {
    probe,
    decorations: [],
    byChain: new Map(),
    lastList: null,
    lastRoot: null,
    lastRootLive: false,
    defaultTabStopTwips: wordDefaultTabStopTwips(doc.attrs?.wordSettings),
  };
  const headingNumberingOn = doc.attrs?.headingNumbering === true;
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === "orderedList") {
      visitOrderedRoot(ctx, node, pos);
      return false;
    }
    if (name === "bulletList" || name === "taskList") {
      // Not drawn here itself, but an ordered list nested in it is a
      
      visitListsBelow(ctx, node, pos, 0, 0, true);
      return false;
    }
    if (name === "heading") {
      // The document-wide outline numbering (References > heading numbering)
      // owns every heading's number when it is on.
      if (!headingNumberingOn && fragmentCarries("listLabel", node.attrs))
        visitHeading(ctx, node, pos);
      return false;
    }
    return !node.isTextblock;
  });
  if (probe) return DecorationSet.empty;
  return ctx.decorations.length
    ? DecorationSet.create(doc, ctx.decorations)
    : DecorationSet.empty;
}

/**
 * Walk the document's numbering once for a dialog (no decorations); `labels`,
 * when given, collects the marker text each numbered textblock draws.
 */
export function probeListNumbering(
  doc: PmNode,
  labels?: Map<number, string>,
): ListNumberingProbe {
  const probe: ListNumberingProbe = {
    values: new Map(),
    firstValue: new Map(),
    continueValue: new Map(),
    levels: new Map(),
    ...(labels ? { labels } : {}),
  };
  buildListDefinitionDecorations(doc, probe);
  return probe;
}

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------








export function toggleListAroundHeadings(
  { state, tr, dispatch, commands }: CommandProps,
  kind: HeadingListKind,
  toggleRun: () => boolean,
): boolean {
  const { from, to } = state.selection;
  const blocks: Array<{ pos: number; node: PmNode }> = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ pos, node });
    return false;
  });
  const headings = blocks.filter(({ node }) => node.type.name === "heading");
  if (headings.length === 0 || headings.length === blocks.length) return false;
  if (!dispatch) return true;
  // Runs of non-heading blocks, then everything from the back so earlier
  // positions stay valid while later ones move.
  const runs: Array<{ from: number; to: number }> = [];
  for (const block of blocks) {
    if (block.node.type.name === "heading") continue;
    const last = runs[runs.length - 1];
    const end = block.pos + block.node.nodeSize;
    if (last && last.to === block.pos) last.to = end;
    else runs.push({ from: block.pos, to: end });
  }
  const steps: Array<{ at: number; run: () => void }> = [
    ...headings.map((heading) => ({
      at: heading.pos,
      run: () => setHeadingListAttrs(tr, [heading], kind, null),
    })),
    ...runs.map((run) => ({
      at: run.from,
      run: () => {
        commands.setTextSelection({ from: run.from + 1, to: run.to - 1 });
        toggleRun();
      },
    })),
  ].sort((left, right) => right.at - left.at);
  for (const step of steps) step.run();
  tr.setSelection(
    TextSelection.between(tr.doc.resolve(tr.mapping.map(from)), tr.doc.resolve(tr.mapping.map(to))),
  );
  return true;
}

/** Every textblock the selection touches, when ALL of them are headings. */
export function selectedHeadings(
  state: EditorState,
): Array<{ pos: number; node: PmNode }> | null {
  const { from, to } = state.selection;
  const headings: Array<{ pos: number; node: PmNode }> = [];
  let other = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (other) return false;
    if (node.isTextblock) {
      if (node.type.name === "heading") headings.push({ pos, node });
      else other = true;
      return false;
    }
    return true;
  });
  return !other && headings.length ? headings : null;
}

const HEADING_LIST_CLEARED = {
  listKind: null,
  listLevel: 0,
  listStyle: null,
  listDefinition: null,
  listStart: null,
  listContinue: false,
  listChain: null,
};

/** The chain Home > Numbering gives headings: one per number style. */
export function headingToolbarChain(style: string): string {
  return `headings-${style}`;
}

function setHeadingListAttrs(
  tr: Transaction,
  headings: Array<{ pos: number; node: PmNode }>,
  kind: HeadingListKind | null,
  style: string | null,
): void {
  for (const { pos, node } of headings) {
    if (!kind) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...HEADING_LIST_CLEARED });
      continue;
    }
    const listStyle =
      kind === "bullet"
        ? normalizeBulletStyle(style ?? node.attrs.listStyle)
        : normalizeListStyleType(style ?? node.attrs.listStyle);
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listKind: kind,
      listLevel: normalizeListLevel(node.attrs.listLevel),
      listStyle,
      listDefinition:
        kind === node.attrs.listKind && style === null
          ? node.attrs.listDefinition
          : null,
      // Word's Numbering button on successive headings keeps counting them:
      // they share one numbering instance, whatever lies between.
      listContinue: kind === "ordered",
      listStart: null,
      listChain: kind === "ordered" ? headingToolbarChain(listStyle) : null,
    });
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    listDefinitionMarkers: {
      /**
       * Home > Bullets / Numbering on headings: Word keeps the heading and
       * adds (or, when every selected heading already has it, removes) the
       * marker. Returns false unless the selection is headings only.
       */
      toggleHeadingList: (kind: HeadingListKind) => ReturnType;
      /** Change the bullet glyph / number style of the listed headings. */
      setHeadingListStyle: (kind: HeadingListKind, style: string) => ReturnType;
      /** Set a nine-level definition on the listed heading(s). */
      setHeadingListDefinition: (definition: ListDefinition | null) => ReturnType;
      /** Replace the document's list styles (Define New List Style). */
      setDocumentListStyles: (styles: DocumentListStyle[]) => ReturnType;
    };
  }
}

export function headingListAtSelection(
  state: EditorState,
): { pos: number; node: PmNode } | null {
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "heading" && normalizeHeadingListKind(node.attrs.listKind))
      return { pos: depth === 0 ? 0 : $from.before(depth), node };
  }
  return null;
}

export const ListDefinitionMarkers = Extension.create({
  name: "listDefinitionMarkers",

  addGlobalAttributes() {
    const json = (key: string, dataName: string) => ({
      default: null,
      parseHTML: (element: HTMLElement) => {
        const raw = element.getAttribute(dataName);
        if (!raw) return null;
        return key === "listDefinition" ? normalizeListDefinition(raw) : raw;
      },
      renderHTML: (attributes: Record<string, unknown>) => {
        const value = attributes[key];
        if (value === null || value === undefined) return {};
        return {
          [dataName]: typeof value === "string" ? value : JSON.stringify(value),
        };
      },
    });
    return [
      {
        // Word list styles (Define New List Style) are part of the document,
        // like its paragraph styles: saved with it, exported as numbering
        // styles, read back on import.
        types: ["doc"],
        attributes: {
          listStyles: {
            default: [],
            parseHTML: (element) =>
              normalizeDocumentListStyles(element.getAttribute("data-list-styles")),
            renderHTML: (attributes) => {
              const styles = normalizeDocumentListStyles(attributes.listStyles);
              return styles.length
                ? { "data-list-styles": JSON.stringify(styles) }
                : {};
            },
          },
        },
      },
      {
        types: ["heading"],
        attributes: {
          listKind: {
            default: null,
            parseHTML: (element) =>
              normalizeHeadingListKind(element.getAttribute("data-list-kind")),
            renderHTML: (attributes) =>
              normalizeHeadingListKind(attributes.listKind)
                ? { "data-list-kind": attributes.listKind }
                : {},
          },
          listLevel: {
            default: 0,
            parseHTML: (element) =>
              normalizeListLevel(element.getAttribute("data-list-level")),
            renderHTML: (attributes) =>
              normalizeHeadingListKind(attributes.listKind) &&
              normalizeListLevel(attributes.listLevel) > 0
                ? { "data-list-level": String(attributes.listLevel) }
                : {},
          },
          listStyle: json("listStyle", "data-heading-list-style"),
          listDefinition: json("listDefinition", "data-heading-list-definition"),
          listStart: {
            default: null,
            parseHTML: (element) =>
              normalizeListStart(element.getAttribute("data-list-start")),
            renderHTML: (attributes) => {
              const start = normalizeListStart(attributes.listStart);
              return start === null ? {} : { "data-list-start": String(start) };
            },
          },
          listContinue: {
            default: false,
            parseHTML: (element) =>
              element.getAttribute("data-list-continue") === "true",
            renderHTML: (attributes) =>
              attributes.listContinue === true
                ? { "data-list-continue": "true" }
                : {},
          },
          listChain: {
            default: null,
            parseHTML: (element) =>
              normalizeListChain(element.getAttribute("data-list-chain")),
            renderHTML: (attributes) => {
              const chain = normalizeListChain(attributes.listChain);
              return chain ? { "data-list-chain": chain } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleHeadingList:
        (kind: HeadingListKind) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const headings = selectedHeadings(state);
          if (!headings) return false;
          const allHave = headings.every(
            ({ node }) => node.attrs.listKind === kind,
          );
          if (dispatch) setHeadingListAttrs(tr, headings, allHave ? null : kind, null);
          return true;
        },
      setHeadingListStyle:
        (kind: HeadingListKind, style: string) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const headings = selectedHeadings(state);
          if (!headings) return false;
          if (dispatch) {
            setHeadingListAttrs(tr, headings, kind, style);
            // An outline scheme (1, 1.1 / 1, a, i) on headings of more than
            // one level numbers each at its own level, as Define New
            // Multilevel List does (setHeadingListDefinition): before, the
            // Numbering Library's outline numbered chapters and sections in
            
            const levels = headings.map(({ node }) => Number(node.attrs.level) || 1);
            if (
              kind === "ordered" &&
              (style === "decimal-outline" || style === "multi-level") &&
              new Set(levels).size > 1
            ) {
              const shallowest = Math.min(...levels);
              headings.forEach(({ pos }, index) => {
                const current = tr.doc.nodeAt(pos);
                if (!current) return;
                tr.setNodeMarkup(pos, undefined, {
                  ...current.attrs,
                  listLevel: normalizeListLevel(levels[index] - shallowest),
                });
              });
            }
          }
          return true;
        },
      setDocumentListStyles:
        (styles: DocumentListStyle[]) =>
        ({ tr, dispatch, editor }: CommandProps) => {
          if (!editor.isEditable) return false;
          if (dispatch)
            tr.setDocAttribute("listStyles", normalizeDocumentListStyles(styles));
          return true;
        },
      setHeadingListDefinition:
        (definition: ListDefinition | null) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const headings = selectedHeadings(state);
          if (!headings) return false;
          const normalized = definition ? normalizeListDefinition(definition) : null;
          if (definition && !normalized) return false;
          // A multilevel list on headings of more than one level numbers each
          // heading at its own outline level, as Word's "Link level to style"
          // does (Heading 1 -> 1, Heading 2 -> 1.1); the shallowest heading
          // chosen is the list's first level. Headings of one level keep theirs.
          // Before, every heading took level 1: chapters and their sections
          
          const headingLevels = headings.map(({ node }) => Number(node.attrs.level) || 1);
          const shallowest = Math.min(...headingLevels);
          const linkLevels = normalized !== null && new Set(headingLevels).size > 1;
          if (dispatch) {
            headings.forEach(({ pos, node }, index) => {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                listKind:
                  normalized?.levels[0].format === "bullet"
                    ? "bullet"
                    : (normalizeHeadingListKind(node.attrs.listKind) ?? "ordered"),
                listDefinition: normalized,
                ...(linkLevels ? { listLevel: normalizeListLevel(headingLevels[index] - shallowest) } : {}),
              });
            });
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("listDefinitionMarkers");
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => buildListDefinitionDecorations(state.doc),
          apply: (tr, previous, _old, next) => {
            if (!tr.docChanged) return previous;
            // The walk reads lists and headings only: an edit inside a text
            // block that is neither a heading nor in a list changes no
            // number, and every keystroke of a long book walked it whole.
            // Inside a list item or a heading too, typing (text for text, no
            // inline node in or out, the block holding text before and after)
            // changes no number: the walk reads the lists' and the headings'
            // attributes and structure, not their text.
            if (editsStayInsideTextblocks([tr], (block, $at) => block.type.name === "heading" || inList($at)) || plainTextEdits(tr)) {
              return previous.map(tr.mapping, tr.doc);
            }
            return buildListDefinitionDecorations(next.doc);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

/** Whether a position lies in a list. */
function inList($at: ResolvedPos): boolean {
  for (let depth = $at.depth; depth > 0; depth -= 1) {
    const name = $at.node(depth).type.name;
    if (name === "orderedList" || name === "bulletList" || name === "taskList" || name === "listItem" || name === "taskItem") return true;
  }
  return false;
}

export default ListDefinitionMarkers;
