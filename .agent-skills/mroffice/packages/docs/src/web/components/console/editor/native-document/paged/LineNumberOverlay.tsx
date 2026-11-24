"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import { normalizeLineNumbers } from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { normalizeSectionLayouts, type SectionLayout } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import { editorViewDom } from "@mrnote/core/web/components/console/editor/native-document/editorViewDom.ts";
import { measurementRange } from "@mrnote/core/web/components/console/editor/native-document/paged/measurementRange.ts";
import { sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";

const TEXT_FLOW_BLOCK_SELECTORS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
];
const TEXT_FLOW_BLOCK_SELECTOR = TEXT_FLOW_BLOCK_SELECTORS.join(",");
const BREAK_SELECTOR = '[data-type="page-break"],[data-type="section-break"]';
const ATOMIC_FLOW_SELECTOR = [
  "table",
  "figure",
  "hr",
  "img",
  "canvas",
  "video",
  "svg",
  ".mrnote-text-box",
  '[data-document-shape="true"]',
  ".note-editor-image-resizable",
  '[contenteditable="false"]',
].join(",");
const EXCLUDED_NOTE_STORY_SELECTOR = [
  '[data-type="footnote-list"]',
  '[data-type="endnote-list"]',
  // The note list's node view wrapper (contenteditable="false", no height of
  // its own) stands AROUND the list: read as an object on the page, it had no
  // line to measure and every document with a footnote drew no line number
  // at all (live Word audit WUA 081).
  ".node-footnoteList",
].join(",");
const DEFAULT_AUTO_DISTANCE_PX = 24;
/** Word's Auto distance beside newspaper columns: 0.13 inch. */
const COLUMNS_AUTO_DISTANCE_PX = 0.13 * 96;
const TWIPS_PER_CSS_PIXEL = 15;
const LINE_TOP_TOLERANCE_PX = 1;
const MAX_RANGE_PROBES_PER_DOCUMENT = 10_000;
const MAX_LINE_FRAGMENTS_PER_DOCUMENT = 100_000;
const MAX_OBSERVED_LAYOUT_TARGETS = 10_000;

type DocumentViewMode = "print" | "web" | "outline" | "draft";

interface LineNumberConfig {
  countBy: number;
  start: number;
  /** null: Word's Auto (0.25" beside one column, 0.13" beside columns). */
  distancePx: number | null;
  restart: "continuous" | "newPage" | "newSection";
}

interface LineNumberMeasurement {
  editor: Editor;
  numbers: DocumentLineNumber[];
}

interface MeasuredLine {
  sheetTop: number;
  top: number;
  /** The newspaper column the line is in (0 on a one-column page). */
  column: number;
}

interface MeasuredBlockLine {
  bottom: number;
  top: number;
  /** Which column of the page the row is in (see ColumnOf). */
  column?: number;
}

/** The column a viewport x falls in (0 on a one-column page). */
type ColumnOf = (clientX: number) => number;
const ONE_COLUMN: ColumnOf = () => 0;

interface CharacterFragmentRect extends MeasuredBlockLine {
  height: number;
  left: number;
  spansRows: boolean;
  width: number;
}

interface MeasurementBudget {
  fragments: number;
  rangeProbes: number;
}

interface ImportedLineNumberStyle {
  basedOn: string | null;
  suppressLineNumbers: boolean | null;
}

interface LineNumberSuppressionResolver {
  available: boolean;
  resolve: (styleId: string | null) => boolean | null;
}

/** One section's lines on one sheet (a page holds several when continuous
 * section breaks stack them). */
interface SheetMeasurement {
  config: LineNumberConfig | null;
  lines: MeasuredLine[];
  sectionIndex: number;
  sheetIndex: number;
  /** Each column's number position, sheet-local px (left of its text, or
   * right of it in a right-to-left section). */
  columnSheetLefts: number[];
  /** The sheet's offset inside the overlay container. */
  offsetLeft: number;
  /** A right-to-left section's numbers stand right of the text, their left
   * edge at the position. */
  rightSide?: boolean;
}

/**
 * A section's newspaper columns on a sheet, sheet-local CSS px: Word's
 * `w:cols` (equal, or the stated widths and spaces), else the sheet's own
 * CSS columns, else the one text column.
 */
function sectionColumnBoxes(
  sheet: HTMLElement,
  layout: SectionLayout | null,
  paddingLeft: number,
): { left: number; width: number }[] {
  const style = getComputedStyle(sheet);
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const contentWidth = Math.max(0, sheet.offsetWidth - paddingLeft - paddingRight);
  const columns = layout?.columns;
  if (columns && columns.count > 1) {
    const items = columns.items;
    if (!columns.equalWidth && items && items.length === columns.count) {
      const boxes: { left: number; width: number }[] = [];
      let left = paddingLeft;
      for (const item of items) {
        const width = item.widthTwips / TWIPS_PER_CSS_PIXEL;
        boxes.push({ left, width });
        left += width + (item.spaceTwips ?? 0) / TWIPS_PER_CSS_PIXEL;
      }
      return boxes;
    }
    const gap = columns.spaceTwips / TWIPS_PER_CSS_PIXEL;
    const width = (contentWidth - gap * (columns.count - 1)) / columns.count;
    if (width > 0) {
      return Array.from({ length: columns.count }, (_, index) => ({
        left: paddingLeft + index * (width + gap),
        width,
      }));
    }
  }
  const cssCount = Number.parseInt(style.columnCount, 10);
  if (!layout && Number.isFinite(cssCount) && cssCount > 1) {
    const gap = Number.parseFloat(style.columnGap) || 0;
    const width = (contentWidth - gap * (cssCount - 1)) / cssCount;
    if (width > 0) {
      return Array.from({ length: cssCount }, (_, index) => ({
        left: paddingLeft + index * (width + gap),
        width,
      }));
    }
  }
  return [{ left: paddingLeft, width: contentWidth }];
}

export interface DocumentLineNumber {
  key: string;
  left: number;
  /** Set in a right-to-left section: `left` is the number's left edge. */
  rightSide?: boolean;
  sheetIndex: number;
  sheetLeft: number;
  sheetTop: number;
  top: number;
  value: number;
}

interface LineNumberOverlayProps {
  editor: Editor | null;
  viewMode: DocumentViewMode;
}

function sameNumbers(
  previous: readonly DocumentLineNumber[],
  next: readonly DocumentLineNumber[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every(
      (item, index) =>
        item.key === next[index]?.key &&
        item.left === next[index]?.left &&
        item.rightSide === next[index]?.rightSide &&
        item.sheetIndex === next[index]?.sheetIndex &&
        item.sheetLeft === next[index]?.sheetLeft &&
        item.sheetTop === next[index]?.sheetTop &&
        item.top === next[index]?.top &&
        item.value === next[index]?.value,
    )
  );
}

function offsetInside(
  node: HTMLElement,
  container: HTMLElement,
): { left: number; top: number } | null {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = node;
  while (current && current !== container) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return current === container ? { left, top } : null;
}

function meaningfulRects(rects: DOMRect[], columnOf: ColumnOf = ONE_COLUMN): MeasuredBlockLine[] {
  return rects
    .filter(
      (rect) =>
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.height) &&
        rect.height > 0 &&
        rect.bottom > rect.top,
    )
    .sort((left, right) => left.top - right.top || left.left - right.left)
    .map((rect) => ({ top: rect.top, bottom: rect.bottom, column: columnOf(rect.left + rect.width / 2) }));
}

export function groupCharacterFragmentsIntoLines(
  fragments: readonly CharacterFragmentRect[],
  columnOf: ColumnOf = ONE_COLUMN,
): MeasuredBlockLine[] {
  // A paragraph that runs from one column into the next has rows at the same
  // height in both: rows are only ever joined within one column.
  const positive = fragments
    .filter(
      (rect) =>
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.bottom) &&
        Number.isFinite(rect.left) &&
        rect.height > 0 &&
        rect.bottom > rect.top,
    )
    .map((rect) => ({ ...rect, column: columnOf(rect.left + rect.width / 2) }))
    .sort((left, right) => left.column - right.column || left.top - right.top || left.left - right.left);
  if (positive.length === 0) return [];

  // Unlike whole-range fragments, every entry here is an authenticated glyph,
  // inline atom, or BR boundary. A tall glyph can be the only content on its
  // physical row, so no height-outlier filtering is allowed.
  interface RowAnchor extends MeasuredBlockLine {
    height: number;
    spansRows: boolean;
    column: number;
  }
  const lines: RowAnchor[] = [];
  for (const rect of positive) {
    const current = lines[lines.length - 1];
    const rowTolerance = current
      ? Math.max(4, Math.min(current.height, rect.height) * 0.6)
      : 0;
    // Authenticate one physical row by either a close top or a close glyph
    // bottom (the browser's nearest baseline proxy). A large inline glyph can
    // start well above normal text on the SAME baseline, while a drop cap can
    // overlap two or three FOLLOWING rows. Never compare against an accumulated
    // union box: that is what chain-merged six visible drop-cap rows into five.
    // A fragment shorter than the row whose middle stands inside it (a
    // field's mark, a lowered or raised run) is on that row: counted as one
    // of its own, it numbered a line Word does not (corpus R432-D06: "45 46"
    // and "50 51" on the lines of two citation fields, two numbers ahead of
    // Word from there on).
    const middle = (rect.top + rect.bottom) / 2;
    const insideRow =
      current !== undefined &&
      !rect.spansRows &&
      rect.height < current.height &&
      middle > current.top &&
      middle < current.bottom;
    if (
      current &&
      current.column === rect.column &&
      (Math.abs(rect.top - current.top) <= rowTolerance ||
        Math.abs(rect.bottom - current.bottom) <= rowTolerance ||
        insideRow)
    ) {
      // A drop-cap glyph is not the row's line box. Once any ordinary fragment
      // is available, use that fragment as the stable top/bottom anchor. For
      // ordinary mixed-size text, the tallest glyph owns the painted line box.
      if (
        (current.spansRows && !rect.spansRows) ||
        (current.spansRows === rect.spansRows && rect.height > current.height)
      ) {
        current.top = rect.top;
        current.bottom = rect.bottom;
        current.height = rect.height;
        current.spansRows = rect.spansRows;
      }
    } else {
      lines.push({
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        spansRows: rect.spansRows,
        column: rect.column,
      });
    }
  }
  return lines.map(({ top, bottom, column }) => ({ top, bottom, column }));
}

function measuredBlockRects(
  block: HTMLElement,
  budget: MeasurementBudget,
  columnOf: ColumnOf = ONE_COLUMN,
): MeasuredBlockLine[] | null {
  const ownerDocument = block.ownerDocument;
  const nodeFilter = ownerDocument.defaultView?.NodeFilter;
  if (!nodeFilter) return null;
  const range = measurementRange(ownerDocument, "lineNumbers");
  const fragments: CharacterFragmentRect[] = [];
  const walker = ownerDocument.createTreeWalker(block, nodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const inert = node.parentElement?.closest?.('[contenteditable="false"]');
      return inert && block.contains(inert)
        ? nodeFilter.FILTER_REJECT
        : nodeFilter.FILTER_ACCEPT;
    },
  });
  let textNode = walker.nextNode() as Text | null;
  // The paragraph's own characters (an anchored object's labels are not).
  let ownText = 0;
  while (textNode) {
    ownText += textNode.data.length;
    budget.rangeProbes += 1;
    if (budget.rangeProbes > MAX_RANGE_PROBES_PER_DOCUMENT) return null;
    // Probe the Text leaf itself, never the surrounding block/mark element.
    // Browsers return one glyph fragment per physical row for a Text range;
    // this avoids the multi-row container rectangles that make whole-block
    // getClientRects skip alternate tracked-change rows.
    range.selectNodeContents(textNode);
    const spansRows = Boolean(
      textNode.parentElement?.closest('[data-drop-cap="dropped"]'),
    );
    for (const rect of Array.from(range.getClientRects())) {
      if (
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.left) &&
        rect.height > 0 &&
        rect.width > 0
      ) {
        budget.fragments += 1;
        if (budget.fragments > MAX_LINE_FRAGMENTS_PER_DOCUMENT) return null;
        fragments.push({
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          spansRows,
          top: rect.top,
          width: rect.width,
        });
      }
    }
    textNode = walker.nextNode() as Text | null;
  }

  // Inline atom NodeViews are excluded from the text walker so their internal
  // labels never masquerade as document lines. Their measured outer boxes may
  // still authenticate a physical row (for example an equation between text
  // runs), and the shared row grouper coalesces it with neighbouring glyphs.
  for (const atom of block.querySelectorAll<HTMLElement>(
    ':scope [contenteditable="false"]',
  )) {
    const parentAtom = atom.parentElement?.closest<HTMLElement>(
      '[contenteditable="false"]',
    );
    if (parentAtom && block.contains(parentAtom)) {
      continue;
    }
    // A floating object anchored in the paragraph is not on its lines.
    if (isOutOfFlow(atom, block)) continue;
    budget.rangeProbes += 1;
    if (budget.rangeProbes > MAX_RANGE_PROBES_PER_DOCUMENT) return null;
    for (const rect of Array.from(atom.getClientRects())) {
      if (
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.left) &&
        rect.height > 0 &&
        rect.width > 0
      ) {
        budget.fragments += 1;
        if (budget.fragments > MAX_LINE_FRAGMENTS_PER_DOCUMENT) return null;
        fragments.push({
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          spansRows: false,
          top: rect.top,
          width: rect.width,
        });
      }
    }
  }

  // A BR has no text character. Probe its real boundary rect so consecutive
  // hard breaks authenticate the otherwise-empty physical row between them.
  for (const boundary of block.querySelectorAll<HTMLBRElement>("br")) {
    budget.rangeProbes += 1;
    if (budget.rangeProbes > MAX_RANGE_PROBES_PER_DOCUMENT) return null;
    range.selectNode(boundary);
    const boundaryRects = Array.from(range.getClientRects());
    const rects =
      boundaryRects.length > 0
        ? boundaryRects
        : Array.from(boundary.getClientRects());
    for (const rect of rects) {
      if (
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.left) &&
        rect.height > 0
      ) {
        budget.fragments += 1;
        if (budget.fragments > MAX_LINE_FRAGMENTS_PER_DOCUMENT) return null;
        fragments.push({
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          spansRows: false,
          top: rect.top,
          width: rect.width,
        });
      }
    }
  }

  let rects = groupCharacterFragmentsIntoLines(fragments, columnOf);

  // Empty paragraphs still own a real editable line. Their DOM Range has no
  // fragments in WebKit, so use the measured block line box rather than
  // inventing a font-size/line-height estimate.
  if (rects.length === 0 && ownText === 0) {
    budget.rangeProbes += 1;
    if (budget.rangeProbes > MAX_RANGE_PROBES_PER_DOCUMENT) return null;
    rects = meaningfulRects(Array.from(block.getClientRects()), columnOf);
    budget.fragments += rects.length;
    if (budget.fragments > MAX_LINE_FRAGMENTS_PER_DOCUMENT) return null;
  }
  // A block that draws no line of its own (only a floating object, or
  // nothing laid out) adds no number; it never takes the whole document's
  // numbers away.
  if (rects.length === 0) return [];

  const unique: MeasuredBlockLine[] = [];
  for (const rect of rects) {
    const previous = unique[unique.length - 1];
    if (
      previous &&
      previous.column === rect.column &&
      Math.abs(previous.top - rect.top) <= LINE_TOP_TOLERANCE_PX
    ) {
      continue;
    }
    unique.push(rect);
  }
  return unique;
}

function rtlLineNumbersOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsRtlLineNumbersOff?: boolean }).__docsRtlLineNumbersOff === true;
}

function sheetHasOnlyRepresentableFlow(sheet: HTMLElement, rightToLeftSections = false): boolean {
  // Newspaper columns and continuous sections stacked on one page are
  // numbered (each column on its own, each section by its own settings); a
  // sheet that scrolls over several pages, right-to-left text outside a
  // right-to-left section, or vertical text is not, and draws no guessed
  // numbers.
  if (sheet.hasAttribute("data-page-span")) return false;
  const sheetStyle = getComputedStyle(sheet);
  if (
    sheetStyle.writingMode.startsWith("vertical") ||
    (!rightToLeftSections && (sheetStyle.direction === "rtl" || sheet.querySelector('[dir="rtl"]')))
  ) {
    return false;
  }

  // A page break, or a section break onto another page, followed by more
  // text on this sheet would put another page's lines here.
  const boundaries = Array.from(sheet.querySelectorAll<HTMLElement>(BREAK_SELECTOR)).filter(
    (boundary) =>
      !isInsideExcludedNoteStory(boundary, sheet) &&
      !(boundary.matches('[data-type="section-break"]') &&
        boundary.getAttribute("data-break-type") === "continuous"),
  );
  if (boundaries.length === 0) return true;
  const content = Array.from(
    sheet.querySelectorAll<HTMLElement>(`${TEXT_FLOW_BLOCK_SELECTOR},${ATOMIC_FLOW_SELECTOR}`),
  ).filter((element) => !element.matches(BREAK_SELECTOR) && !isInsideExcludedNoteStory(element, sheet));
  return !boundaries.some((boundary) =>
    content.some(
      (element) =>
        !boundary.contains(element) &&
        (boundary.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ),
  );
}

/**
 * A floating object (a wrapped text box, shape or picture) is not a line:
 * Word counts a text box or figure as one line only when it is in line with
 * the text; with text wrapping around it, the lines of text are counted
 * (Microsoft Support, "Add or remove line numbers"). An element is out of
 * the flow when it, or a wrapper of it below `stop`, is a floating object.
 */
function isOutOfFlow(element: HTMLElement, stop: HTMLElement): boolean {
  // Read the object's own wrapping, never its CSS position: newspaper
  // columns place every block absolutely, and a table there is in line.
  for (let current: HTMLElement | null = element; current && current !== stop; current = current.parentElement) {
    if (
      current.hasAttribute("data-float-mode") ||
      current.hasAttribute("data-float-shadow") ||
      (current.hasAttribute("data-text-box") && current.hasAttribute("data-float-anchor"))
    ) {
      return true;
    }
  }
  return false;
}

function isInsideExcludedNoteStory(
  element: HTMLElement,
  sheet: HTMLElement,
): boolean {
  const story = element.closest<HTMLElement>(EXCLUDED_NOTE_STORY_SELECTOR);
  return Boolean(story && sheet.contains(story));
}

function measuredFlowTargets(sheet: HTMLElement): {
  atoms: HTMLElement[];
  textBlocks: HTMLElement[];
} {
  const textBlocks = Array.from(
    sheet.querySelectorAll<HTMLElement>(TEXT_FLOW_BLOCK_SELECTOR),
  ).filter((block) => {
    if (isInsideExcludedNoteStory(block, sheet)) return false;
    const atom = block.closest<HTMLElement>(ATOMIC_FLOW_SELECTOR);
    return !atom || atom === block || !sheet.contains(atom);
  });
  const textBlockSet = new Set(textBlocks);
  const atoms = Array.from(
    sheet.querySelectorAll<HTMLElement>(ATOMIC_FLOW_SELECTOR),
  ).filter((atom) => {
    if (atom.matches(BREAK_SELECTOR)) return false;
    if (isInsideExcludedNoteStory(atom, sheet)) return false;
    const owningTextBlock = atom.closest<HTMLElement>(TEXT_FLOW_BLOCK_SELECTOR);
    if (
      owningTextBlock &&
      owningTextBlock !== atom &&
      textBlockSet.has(owningTextBlock)
    ) {
      return false;
    }
    const parentAtom =
      atom.parentElement?.closest<HTMLElement>(ATOMIC_FLOW_SELECTOR);
    if (parentAtom && sheet.contains(parentAtom)) return false;
    return !isOutOfFlow(atom, sheet);
  });
  return { atoms, textBlocks };
}

function measuredAtomRect(
  atom: HTMLElement,
  budget: MeasurementBudget,
): MeasuredBlockLine | null {
  budget.rangeProbes += 1;
  if (budget.rangeProbes > MAX_RANGE_PROBES_PER_DOCUMENT) return null;
  const rect = atom.getBoundingClientRect();
  if (
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.height) ||
    rect.height <= 0
  ) {
    return null;
  }
  const lineHeight = Number.parseFloat(getComputedStyle(atom).lineHeight);
  const markerHeight = Math.min(
    rect.height,
    Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20,
  );
  budget.fragments += 1;
  if (budget.fragments > MAX_LINE_FRAGMENTS_PER_DOCUMENT) return null;
  return { top: rect.top, bottom: rect.top + markerHeight };
}

function importedStyleId(value: unknown): string | null {
  return typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f]/.test(value)
    ? value
    : null;
}

function importedSuppressLineNumbers(value: unknown): {
  valid: boolean;
  value: boolean | null;
} {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, value: null };
  }
  const paragraphProperties = value as Record<string, unknown>;
  if (!("suppressLineNumbers" in paragraphProperties)) {
    return { valid: true, value: null };
  }
  return typeof paragraphProperties.suppressLineNumbers === "boolean"
    ? { valid: true, value: paragraphProperties.suppressLineNumbers }
    : { valid: false, value: null };
}

/**
 * Resolve Word's paragraph-style cascade for w:suppressLineNumbers. Imported
 * style definitions are custody data, so an unknown id, cycle, duplicate, or
 * malformed toggle fails the complete preview closed instead of guessing.
 */
function createLineNumberSuppressionResolver(
  value: unknown,
): LineNumberSuppressionResolver | null {
  if (value === null || value === undefined) {
    return { available: false, resolve: () => false };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const definitions = value as Record<string, unknown>;
  if (
    definitions.version !== 1 ||
    !Array.isArray(definitions.styles) ||
    definitions.styles.length > 512
  ) {
    return null;
  }

  const styles = new Map<string, ImportedLineNumberStyle>();
  const allStyleIds = new Set<string>();
  let defaultParagraphStyleId: string | null = null;
  for (const rawStyle of definitions.styles) {
    if (!rawStyle || typeof rawStyle !== "object" || Array.isArray(rawStyle)) {
      return null;
    }
    const style = rawStyle as Record<string, unknown>;
    const styleId = importedStyleId(style.styleId);
    const styleType = style.type;
    const isDefault = style.default;
    const basedOn =
      style.basedOn === null || style.basedOn === undefined
        ? null
        : importedStyleId(style.basedOn);
    const suppression = importedSuppressLineNumbers(style.pPr);
    if (
      !styleId ||
      allStyleIds.has(styleId) ||
      typeof styleType !== "string" ||
      (isDefault !== null &&
        isDefault !== undefined &&
        typeof isDefault !== "boolean") ||
      (style.basedOn !== null &&
        style.basedOn !== undefined &&
        basedOn === null) ||
      !suppression.valid
    ) {
      return null;
    }
    allStyleIds.add(styleId);
    if (styleType !== "paragraph") continue;
    if (isDefault === true) {
      if (defaultParagraphStyleId !== null) return null;
      defaultParagraphStyleId = styleId;
    }
    styles.set(styleId, {
      basedOn,
      suppressLineNumbers: suppression.value,
    });
  }

  const rawDefaults = definitions.docDefaults;
  if (
    rawDefaults !== null &&
    rawDefaults !== undefined &&
    (!rawDefaults ||
      typeof rawDefaults !== "object" ||
      Array.isArray(rawDefaults))
  ) {
    return null;
  }
  const defaultSuppression = importedSuppressLineNumbers(
    rawDefaults && typeof rawDefaults === "object"
      ? (rawDefaults as Record<string, unknown>).pPr
      : null,
  );
  if (!defaultSuppression.valid) return null;

  const cache = new Map<string, boolean>();
  const resolveStyle = (
    styleId: string,
    visiting: Set<string>,
  ): boolean | null => {
    const cached = cache.get(styleId);
    if (cached !== undefined) return cached;
    const style = styles.get(styleId);
    if (!style || visiting.has(styleId)) return null;
    if (style.suppressLineNumbers !== null) {
      cache.set(styleId, style.suppressLineNumbers);
      return style.suppressLineNumbers;
    }
    if (!style.basedOn) {
      const resolved = defaultSuppression.value ?? false;
      cache.set(styleId, resolved);
      return resolved;
    }
    const nextVisiting = new Set(visiting);
    nextVisiting.add(styleId);
    const resolved = resolveStyle(style.basedOn, nextVisiting);
    if (resolved !== null) cache.set(styleId, resolved);
    return resolved;
  };

  return {
    available: true,
    resolve: (styleId) => {
      const effectiveStyleId = styleId ?? defaultParagraphStyleId;
      return effectiveStyleId === null
        ? (defaultSuppression.value ?? false)
        : resolveStyle(effectiveStyleId, new Set());
    },
  };
}

function blockSuppressesLineNumbers(
  block: HTMLElement,
  resolver: LineNumberSuppressionResolver,
): boolean | null {
  const direct = block.getAttribute("data-suppress-line-numbers");
  if (direct !== null) {
    if (direct === "true") return true;
    if (direct === "false") return false;
    return null;
  }
  const rawStyleId = block.getAttribute("data-docx-style-id");
  const styleId = rawStyleId === null ? null : importedStyleId(rawStyleId);
  if (rawStyleId !== null && styleId === null) return null;
  if (styleId !== null && !resolver.available) return null;
  return resolver.resolve(styleId);
}

function sectionLineNumberConfig(
  lineNumbers: NonNullable<SectionLayout["lineNumbers"]>,
): LineNumberConfig {
  const distanceTwips = lineNumbers.distanceTwips ?? 0;
  return {
    countBy: lineNumbers.countBy ?? 1,
    // OOXML w:start is the number of lines skipped before numbering begins,
    // not the first visible label. A stored start="3" therefore paints 4.
    start: (lineNumbers.start ?? 0) + 1,
    distancePx: distanceTwips > 0 ? distanceTwips / TWIPS_PER_CSS_PIXEL : null,
    // Native lnNumType omission restarts on each physical page.
    restart: lineNumbers.restart ?? "newPage",
  };
}

function globalLineNumberConfig(value: unknown): LineNumberConfig | null {
  const lineNumbers = normalizeLineNumbers(value);
  if (!lineNumbers) return null;
  return {
    countBy: lineNumbers.countBy,
    start: 1,
    distancePx: lineNumbers.distancePt > 0 ? (lineNumbers.distancePt * 96) / 72 : null,
    restart: lineNumbers.restart,
  };
}

function documentLineNumberConfiguration(attrs: Record<string, unknown>): {
  sectionLayouts: SectionLayout[] | null;
  globalConfig: LineNumberConfig | null;
} | null {
  const rawSectionLayouts = attrs.sectionLayouts;
  const sectionLayouts = normalizeSectionLayouts(rawSectionLayouts);
  if (rawSectionLayouts != null && !sectionLayouts) return null;
  // Native section settings own numbering even when a legacy global setting
  // remains. With no numbered section, there is no geometry to project.
  if (sectionLayouts) {
    return sectionLayouts.some((section) => section.lineNumbers)
      ? { sectionLayouts, globalConfig: null }
      : null;
  }
  const globalConfig = globalLineNumberConfig(attrs.lineNumbers);
  return globalConfig ? { sectionLayouts: null, globalConfig } : null;
}






export function measureDocumentLineNumbers(
  root: HTMLElement,
  overlayContainer: HTMLElement,
  attrs: Record<string, unknown>,
): DocumentLineNumber[] {
  if (
    overlayContainer.classList.contains("note-editor-content-vertical") ||
    overlayContainer.classList.contains("note-editor-content-manuscript")
  ) {
    return [];
  }

  const configuration = documentLineNumberConfiguration(attrs);
  if (!configuration) return [];
  const { sectionLayouts, globalConfig } = configuration;

  const sheets = sheetsOf(root);
  if (sheets.length === 0) return [];

  const breakCount = sheets.reduce(
    (total, sheet) =>
      total + sheet.querySelectorAll('[data-type="section-break"]').length,
    0,
  );
  if (sectionLayouts && sectionLayouts.length !== breakCount + 1) return [];

  const suppressionResolver = createLineNumberSuppressionResolver(
    attrs.styleDefinitions,
  );
  if (!suppressionResolver) return [];

  const measurements: SheetMeasurement[] = [];
  const budget: MeasurementBudget = { fragments: 0, rangeProbes: 0 };
  let previousEndSection = -1;
  let inferredGlobalSection = 0;
  const budgetSpent = () =>
    budget.rangeProbes > MAX_RANGE_PROBES_PER_DOCUMENT ||
    budget.fragments > MAX_LINE_FRAGMENTS_PER_DOCUMENT;
  // A sheet whose lines cannot be told apart (one scrolling over several
  // pages, right-to-left or vertical text, a page break with more text after
  // it on the same sheet) draws no numbers; every other sheet keeps its own
  // (R280-D18: one such sheet took all 900 numbers off a 35-page document).
  // Only a spent measuring budget stops the sheets after it, and the sheets
  // before it keep theirs.
  sheetLoop: for (const [sheetIndex, sheet] of sheets.entries()) {
    let firstSection = inferredGlobalSection;
    if (sectionLayouts) {
      const rawIndex = sheet.dataset.sectionLayoutIndex;
      if (!rawIndex || !/^\d+$/.test(rawIndex)) return [];
      firstSection = Number(rawIndex);
      if (
        !Number.isSafeInteger(firstSection) ||
        firstSection < 0 ||
        firstSection >= sectionLayouts.length ||
        firstSection < previousEndSection ||
        firstSection > previousEndSection + 1 ||
        (previousEndSection < 0 && firstSection !== 0)
      ) {
        return [];
      }
    }
    // Continuous section breaks stack sections on this sheet: each block
    // belongs to the section the breaks before it have reached.
    const sectionBreaks = Array.from(
      sheet.querySelectorAll<HTMLElement>('[data-type="section-break"]'),
    ).filter((boundary) => !isInsideExcludedNoteStory(boundary, sheet));
    const lastSection = firstSection + sectionBreaks.length;
    if (sectionLayouts) {
      if (lastSection >= sectionLayouts.length) return [];
      previousEndSection = lastSection;
    } else {
      inferredGlobalSection = lastSection;
    }
    const sectionOf = (element: HTMLElement): number =>
      firstSection +
      sectionBreaks.filter(
        (boundary) =>
          boundary !== element &&
          !boundary.contains(element) &&
          (boundary.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ).length;
    const configFor = (section: number): LineNumberConfig | null => {
      if (!sectionLayouts) return globalConfig;
      const lineNumbers = sectionLayouts[section]?.lineNumbers;
      return lineNumbers ? sectionLineNumberConfig(lineNumbers) : null;
    };
    const sections = Array.from(
      { length: lastSection - firstSection + 1 },
      (_, offset) => firstSection + offset,
    );
    // A section without Line Numbers draws none, whatever its flow (Word
    // numbers a section's lines independently of the others): its columns
    // or continuous breaks must not take the numbers off every other
    // section (b-sect2.docx: S3 numbered, S2/S5 in columns).
    if (sections.every((section) => !configFor(section))) {
      for (const section of sections) {
        measurements.push({ config: null, lines: [], sectionIndex: section, sheetIndex, columnSheetLefts: [], offsetLeft: 0 });
      }
      continue;
    }
    const rightToLeftSections = !rtlLineNumbersOff() &&
      sections.every((section) => sectionLayouts?.[section]?.rightToLeft === true);
    if (!sheetHasOnlyRepresentableFlow(sheet, rightToLeftSections)) continue;
    const offset = offsetInside(sheet, overlayContainer);
    if (!offset) continue;

    const sheetRect = sheet.getBoundingClientRect();
    const scaleY =
      sheet.offsetHeight > 0 && sheetRect.height > 0
        ? sheetRect.height / sheet.offsetHeight
        : 1;
    const scaleX =
      sheet.offsetWidth > 0 && sheetRect.width > 0
        ? sheetRect.width / sheet.offsetWidth
        : 1;
    if (!Number.isFinite(scaleY) || scaleY <= 0 || !Number.isFinite(scaleX) || scaleX <= 0) continue;

    const style = getComputedStyle(sheet);
    const inlinePaddingLeft = Number.parseFloat(sheet.style.paddingLeft);
    const paddingLeft = Number.isFinite(inlinePaddingLeft)
      ? inlinePaddingLeft
      : Number.parseFloat(style.paddingLeft) || 0;

    // Each section's columns, and which of them a viewport x falls in.
    const parts = new Map<number, { config: LineNumberConfig | null; columns: { left: number; width: number }[]; lines: MeasuredLine[] }>();
    for (const section of sections) {
      parts.set(section, {
        config: configFor(section),
        columns: sectionColumnBoxes(sheet, sectionLayouts?.[section] ?? null, paddingLeft),
        lines: [],
      });
    }
    const columnOfIn = (columns: { left: number; width: number }[]): ColumnOf =>
      columns.length <= 1
        ? ONE_COLUMN
        : (clientX: number) => {
            const x = (clientX - sheetRect.left) / scaleX;
            let column = 0;
            for (let index = 1; index < columns.length; index += 1) {
              // A column starts where the gap before it is half crossed.
              const previous = columns[index - 1];
              const boundary = (previous.left + previous.width + columns[index].left) / 2;
              if (x >= boundary) column = index;
            }
            return column;
          };
    const addLine = (section: number, rect: MeasuredBlockLine) => {
      const part = parts.get(section);
      if (!part) return;
      const sheetTop = (rect.top - sheetRect.top + (rect.bottom - rect.top) / 2) / scaleY;
      part.lines.push({ sheetTop, top: offset.top + sheetTop, column: rect.column ?? 0 });
    };

    const flowTargets = measuredFlowTargets(sheet);
    for (const block of flowTargets.textBlocks) {
      const section = sectionOf(block);
      const part = parts.get(section);
      if (!part?.config) continue;
      const suppressed = blockSuppressesLineNumbers(block, suppressionResolver);
      if (suppressed === null) continue sheetLoop;
      if (suppressed) continue;
      const rects = measuredBlockRects(block, budget, columnOfIn(part.columns));
      if (!rects) {
        if (budgetSpent()) break sheetLoop;
        continue sheetLoop;
      }
      for (const rect of rects) addLine(section, rect);
    }
    for (const atom of flowTargets.atoms) {
      const section = sectionOf(atom);
      const part = parts.get(section);
      if (!part?.config) continue;
      // An object drawn with no height (an empty widget) holds no line.
      const atomRect = atom.getBoundingClientRect();
      if (Number.isFinite(atomRect.height) && atomRect.height <= 0) continue;
      const rect = measuredAtomRect(atom, budget);
      if (!rect) {
        if (budgetSpent()) break sheetLoop;
        continue;
      }
      addLine(section, { ...rect, column: columnOfIn(part.columns)(atomRect.left + atomRect.width / 2) });
    }
    for (const section of sections) {
      const part = parts.get(section)!;
      // Word numbers a section's columns in reading order: the first column
      // top to bottom, then the next.
      part.lines.sort((left, right) => left.column - right.column || left.top - right.top);
      const distance =
        part.config?.distancePx ??
        (part.columns.length > 1 ? COLUMNS_AUTO_DISTANCE_PX : DEFAULT_AUTO_DISTANCE_PX);
      // A right-to-left section (w:bidi) numbers its lines beside the text's
      // right edge, each number's left edge the distance past it (corpus
      // R404-D02: Word's 1, 38 and 125 all start at 536.26 pt, the text
      // ending at 523.5, distance 12.75 pt). `window.__docsRtlLineNumbersOff
      // = true` asks the older reading, for an A/B of one build.
      const rightSide = sectionLayouts?.[section]?.rightToLeft === true && !rtlLineNumbersOff();
      measurements.push({
        config: part.config,
        lines: part.lines,
        sectionIndex: section,
        sheetIndex,
        columnSheetLefts: part.columns.map((column) =>
          rightSide ? column.left + column.width + distance : column.left - distance),
        offsetLeft: offset.left,
        ...(rightSide ? { rightSide } : {}),
      });
    }
  }

  const output: DocumentLineNumber[] = [];
  let lastPhysicalNextNumber: number | undefined;
  let lastNumberedSheet = -1;
  const bySection = new Map<number, { nextNumber: number }>();

  measurements.forEach((measurement, partIndex) => {
    const { config } = measurement;
    if (!config) {
      return;
    }

    let sequence: { nextNumber: number };
    if (config.restart === "newPage") {
      // A page starts again; a section that starts lower on the same page
      // goes on from the lines above it.
      sequence = {
        nextNumber:
          measurement.sheetIndex === lastNumberedSheet && lastPhysicalNextNumber !== undefined
            ? lastPhysicalNextNumber
            : config.start,
      };
    } else if (config.restart === "newSection") {
      sequence = bySection.get(measurement.sectionIndex) ?? {
        nextNumber: config.start,
      };
    } else {
      sequence = {
        nextNumber: lastPhysicalNextNumber ?? config.start,
      };
    }

    measurement.lines.forEach((line, lineIndex) => {
      const value = sequence.nextNumber;
      if (value % config.countBy === 0) {
        const sheetLeft =
          measurement.columnSheetLefts[line.column] ?? measurement.columnSheetLefts[0] ?? 0;
        output.push({
          key: `${partIndex}:${lineIndex}:${value}`,
          left: measurement.offsetLeft + sheetLeft,
          ...(measurement.rightSide ? { rightSide: true } : {}),
          sheetIndex: measurement.sheetIndex,
          sheetLeft,
          sheetTop: line.sheetTop,
          top: line.top,
          value,
        });
      }
      sequence.nextNumber += 1;
    });

    if (config.restart === "newSection") {
      bySection.set(measurement.sectionIndex, sequence);
    }
    lastPhysicalNextNumber = sequence.nextNumber;
    lastNumberedSheet = measurement.sheetIndex;
  });
  return output;
}

export default function LineNumberOverlay({
  editor,
  viewMode,
}: LineNumberOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [measurement, setMeasurement] = useState<LineNumberMeasurement | null>(
    null,
  );
  const numbers =
    viewMode === "print" && measurement?.editor === editor
      ? measurement.numbers
      : [];

  useEffect(() => {
    if (!editor || editor.isDestroyed || viewMode !== "print") {
      return;
    }

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    const observedElements = new Set<Element>();
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    const measure = () => {
      frame = 0;
      const root = editorViewDom(editor);
      const container = hostRef.current?.parentElement;
      if (!root || !container || !root.isConnected) {
        setMeasurement((previous) =>
          previous?.editor === editor && previous.numbers.length === 0
            ? previous
            : { editor, numbers: [] },
        );
        return;
      }

      if (!documentLineNumberConfiguration(editor.state.doc.attrs)) {
        resizeObserver?.disconnect();
        observedElements.clear();
        setMeasurement((previous) =>
          previous?.editor === editor && previous.numbers.length === 0
            ? previous
            : { editor, numbers: [] },
        );
        return;
      }

      const layoutTargets = root.querySelectorAll<HTMLElement>(
        [
          ":scope > article[data-page-sheet]",
          ...TEXT_FLOW_BLOCK_SELECTORS.map(
            (selector) => `:scope > article[data-page-sheet] ${selector}`,
          ),
          ...ATOMIC_FLOW_SELECTOR.split(",").map(
            (selector) => `:scope > article[data-page-sheet] ${selector}`,
          ),
        ].join(","),
      );
      if (layoutTargets.length > MAX_OBSERVED_LAYOUT_TARGETS) {
        setMeasurement((previous) =>
          previous?.editor === editor && previous.numbers.length === 0
            ? previous
            : { editor, numbers: [] },
        );
        return;
      }
      const nextObserved = new Set<Element>([root, ...layoutTargets]);
      for (const element of observedElements) {
        if (!nextObserved.has(element)) {
          resizeObserver?.unobserve(element);
          observedElements.delete(element);
        }
      }
      for (const element of nextObserved) {
        if (!observedElements.has(element)) {
          resizeObserver?.observe(element);
          observedElements.add(element);
        }
      }

      const next = measureDocumentLineNumbers(
        root,
        container,
        editor.state.doc.attrs as Record<string, unknown>,
      );
      setMeasurement((previous) =>
        previous?.editor === editor && sameNumbers(previous.numbers, next)
          ? previous
          : { editor, numbers: next },
      );
    };

    resizeObserver = new ResizeObserver(schedule);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(editor.view.dom, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    editor.on("update", schedule);
    window.addEventListener("resize", schedule);
    document.fonts?.addEventListener?.("loadingdone", schedule);
    schedule();

    return () => {
      editor.off("update", schedule);
      window.removeEventListener("resize", schedule);
      document.fonts?.removeEventListener?.("loadingdone", schedule);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [editor, viewMode]);

  if (viewMode !== "print") return null;
  return (
    <div
      ref={hostRef}
      className="document-line-number-overlay"
      data-testid="document-line-number-overlay"
      contentEditable={false}
      aria-hidden="true"
    >
      {numbers.map((number) => (
        <span
          key={number.key}
          className="document-line-number-overlay__number"
          data-testid="document-line-number"
          data-line-number-sheet-index={number.sheetIndex}
          data-line-number-sheet-left={number.sheetLeft}
          data-line-number-sheet-top={number.sheetTop}
          data-line-number-value={number.value}
          data-line-number-side={number.rightSide ? "right" : undefined}
          style={{ left: number.left, top: number.top }}
        >
          {number.value}
        </span>
      ))}
    </div>
  );
}
