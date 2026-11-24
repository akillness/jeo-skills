"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createBackgroundLane, requestLaneFrame } from "../../../../lib/background-work";
import { newFontFacesOf } from "../../../../lib/font-face-news";
import { loadedFaceRanges, textDrawsCodePointIn } from "../native-document/paged/ledger/ledgerFontRanges";
import { followLinkHint } from "../native-document/pictureLink";
import { isMacPlatform } from "../../../../lib/mac-platform";
import { ptToPx } from "../../../../lib/office-units";
import { textHasEastAsian, wordSingleLineRatio } from "../native-document/noteTextStyle";
import { wordFontIsEastAsian } from "../native-document/wordFontMetrics";
import { useReferenceStyles } from "../native-document/useReferenceStyles";
import { documentPageNumberLabel, samePrintedPageLabels, withPrintedPageLabels } from "../native-document/documentPageNumbers";
import {
  referenceStyleCss,
  type ReferenceStyleId,
} from "../native-document/referenceStyles";
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "./reactNodeViewPosition";
import { useEditorSurfaceEditable } from "../useEditorSurfaceEditable";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { sameJsonValue } from "../../../../lib/same-json-value";
import { useTranslations } from "../../../../../host/next-intl";
import { headingStyleCss, normalizeHeadingStyles } from "../../../../lib/document-heading-styles";
import {
  HEADING_TOC_ANCHOR_ID_ATTR,
  collectHeadingsFromDoc,
  collectTocEntriesFromDoc,
  normalizeTocEntrySnapshot,
  normalizeTocHeadingLevel,
  resolveTocSourceLevel,
  sanitizeAnchorId,
  sanitizeTocEntryText,
  tocStyleLevelsOf,
  unlaidTocPageNumbers,
  type HeadingTraversalPolicy,
  type TocHeading,
  type TocLevelNormalizer,
} from "../native-document/tableOfContents";
import {
  normalizeTocSettings,
  tocEntryMaximumLevel,
  tocPageNumberOmittedLevels,
  tocSourceLevelResolver,
  type TocSettings,
} from "../native-document/referenceSettings";
import {
  PAGE_ROW_ATTR,
  PAGE_ROW_SLICE_ATTR,
  rowSliceStamp,
  rowSliceView,
} from "../native-document/paged/atomRowSlices";
import { updateRowSlicedNodeView } from "../native-document/paged/rowSliceNodeView";
import {
  TOC_CONTROL_TAB_ATTR,
  TocControlTab,
} from "../native-document/TocControlTab";
import { requestTocControl } from "../native-document/tocControlRequests";
import { generatedListLineGridPitch } from "../native-document/sectionLineGrid";
import { fragmentCarries } from "../native-document/paged/fragmentRoles";
import { officeFontSubstitution } from "../../../../lib/office-fonts/substitutes";

/**
 * Resolve the ProseMirror position of the heading that owns a given anchor id.
 *
 * The anchor ids are derived through the same pure helper the rendered list uses
 * (collectHeadings), so a click target always lines up with its entry label -
 * even for headings whose `anchor_id` attribute has not yet been back-filled.
 * Returns the position of the heading node, or null when no entry matches.
 */
/** The position of the heading a row (`anchorId`) of the TOC whose attrs are
 * `tocAttrs` names, by that TOC's own levels (the row click's own lookup). */
export function tocRowHeadingPos(
  doc: ProseMirrorNode,
  tocAttrs: unknown,
  anchorId: string,
): number | null {
  return findHeadingPos(doc, anchorId, tocSourceLevelResolver(normalizeTocSettings(tocAttrs)));
}

export function findHeadingPos(
  doc: ProseMirrorNode,
  anchorId: string,
  // The level normalizer MUST match the one `collectHeadings` was called with to
  // build the list (default = TOC 1–3; the outline pane passes the h1–h6
  // normalizer) — the by-index lookup below aligns the positions array with the
  // ids array, and both must filter the same level set or they desynchronize.
  normalizeLevel: TocLevelNormalizer = normalizeTocHeadingLevel,
  shouldDescend: HeadingTraversalPolicy = () => true,
): number | null {
  // Collect every eligible heading position in document order, then map them to
  // anchor ids via the SAME pure derivation the rendered list used
  // (collectHeadings). Matching by index guarantees the click target lines up
  // exactly with the entry label, even for de-duplicated or length-clamped ids.
  const positions: number[] = [];
  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  doc.descendants((node, pos) => {
    if (!shouldDescend(node.type.name)) return false;
    if (node.type.name !== "heading" && node.type.name !== "paragraph") {
      return true;
    }
    // A physical-page continuation is still the same logical heading.
    if (!fragmentCarries("headingEntry", node.attrs)) return true;
    if (
      resolveTocSourceLevel(node.type.name, node.attrs, normalizeLevel, styleLevelOf) !== null
    ) {
      positions.push(pos);
    }
    return true;
  });
  const ids = collectHeadingsFromDoc(doc, normalizeLevel, shouldDescend).map(
    (h) => h.id,
  );
  const index = ids.indexOf(anchorId);
  if (index >= 0 && index < positions.length) return positions[index];
  // A row Word cached names the heading by its `_Toc` bookmark, which an
  // imported heading keeps as its alias beside its own anchor id.
  let aliased: number | null = null;
  doc.descendants((node, pos) => {
    if (aliased !== null) return false;
    if (!shouldDescend(node.type.name)) return false;
    if (
      (node.type.name === "heading" || node.type.name === "paragraph") &&
      (node.attrs?.[HEADING_TOC_ANCHOR_ID_ATTR] === anchorId ||
        // A cached row's id is the alias as the snapshot slugs it
        // (`_Toc402299822` → `toc402299822`, normalizeTocEntrySnapshot).
        (typeof node.attrs?.[HEADING_TOC_ANCHOR_ID_ATTR] === "string" &&
          sanitizeAnchorId(node.attrs[HEADING_TOC_ANCHOR_ID_ATTR]) === anchorId))
    ) {
      aliased = pos;
      return false;
    }
    return true;
  });
  return aliased;
}

/** Compact, order-sensitive signature of a heading list for cheap equality. */
function tocSignature(headings: TocHeading[]): string {
  return headings
    .map((h) => [h.level, h.id, h.number ?? "", h.text, h.pageNumber ?? 1].join("|"))
    .join("\n");
}

/** What a leader is drawn with: Word draws its tab leader as the
 * character itself, repeated (the Leader list of the Tabs dialog). */
export const TOC_LEADER_CHARACTER: Record<string, string> = {
  dot: ".",
  middleDot: "\u00b7",
  hyphen: "-",
  underscore: "_",
  none: "",
};
export const TOC_LEADER_RUN = 400;

/** Narrowest leader that stays on the entry's last line (in ems); a shorter
 * gap sends the tab and the page number to a line of their own, as Word's
 * right tab does when the words reach the margin. */
const TOC_MIN_LEADER_EM = 0.6;

/** Word's right tab of a contents row (and of a table of figures' row) sits
 * half a point (10 twips) inside the text width (41 of 43 Word-written
 * tables in the round-trip corpus; the export writes the same stop). In CSS
 * px. The row still wraps at the text width, so the inset is also the room
 * a rounded width needs. */
export const TOC_RIGHT_TAB_INSET_PX = (0.5 * 96) / 72;

/**
 * Lay out every entry's leader: an entry is a paragraph (its words wrap at
 * the margins, as Word's TOC paragraph does) ending in a right tab at the
 * text width, so the leader runs from the end of its LAST line to the page
 * number at the right margin. The width is measured, row by row: all
 * leaders collapsed, all rows read, all widths written.
 */
/** `window.__docsRtlTocRowsOff = true` draws right-to-left rows left to right,
 * as before, for an A/B of one build. */
function rtlTocRowsOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsRtlTocRowsOff?: boolean }).__docsRtlTocRowsOff === true;
}

export function layoutTocLeaders(list: HTMLElement | null): void {
  if (!list) return;
  const rows = Array.from(list.querySelectorAll<HTMLElement>('.note-editor-toc__link[data-toc-tail="leader"]'));
  const leaders = rows.map((row) => row.querySelector<HTMLElement>(".note-editor-toc__leader"));
  // Read every row with the leaders as they stand, then write the widths
  // that changed. A leader follows its words in the line, so its width moves
  // neither the words' last line nor the page number's width; collapsing
  // every leader first invalidated the page for every layout of every copy
  // of the table (WebKit, the 296-page book: ~40 s of forced layout).
  const widths = rows.map((row, index) => {
    if (!leaders[index] || row.offsetWidth === 0) return null;
    const box = row.getBoundingClientRect();
    if (box.width === 0) return null;
    // The page may be zoomed: screen px over the row's own px. Its own width
    // is the computed one: offsetWidth is a whole pixel, and a 649.33px row
    // read as 649 shortened every leader by a quarter pixel.
    const style = getComputedStyle(row);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const ownWidth =
      style.boxSizing === "border-box"
        ? px(style.width)
        : px(style.width) +
          px(style.paddingLeft) +
          px(style.paddingRight) +
          px(style.borderLeftWidth) +
          px(style.borderRightWidth);
    const scale = box.width / (ownWidth > 0 ? ownWidth : row.offsetWidth);
    const contentLeft =
      box.left + (Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth)) * scale;
    const contentRight =
      box.right - (Number.parseFloat(style.paddingRight) + Number.parseFloat(style.borderRightWidth)) * scale;
    const label = row.querySelector<HTMLElement>(".note-editor-toc__entry-label");
    const rects = label ? label.getClientRects() : null;
    const lastLine = rects && rects.length > 0 ? rects[rects.length - 1] : null;
    const page = row.querySelector<HTMLElement>(".note-editor-toc__page-number");
    const pageWidth = page ? page.getBoundingClientRect().width : 0;
    const em = Number.parseFloat(style.fontSize) * scale;
    // A right-to-left row's words end on the left of their last line, and its
    // tab stop stands in from the left margin (nativeRowCss).
    if (style.direction === "rtl") {
      const rtlStop = contentLeft + TOC_RIGHT_TAB_INSET_PX * scale;
      let rtlWidth = (lastLine ? lastLine.left : contentRight) - rtlStop - pageWidth;
      if (rtlWidth < em * TOC_MIN_LEADER_EM) rtlWidth = contentRight - rtlStop - pageWidth;
      return Math.max(0, rtlWidth / scale);
    }
    const tabStop = contentRight - TOC_RIGHT_TAB_INSET_PX * scale;
    let width = tabStop - (lastLine ? lastLine.right : contentLeft) - pageWidth;
    if (width < em * TOC_MIN_LEADER_EM) width = tabStop - contentLeft - pageWidth;
    return Math.max(0, width / scale);
  });
  widths.forEach((width, index) => {
    const leader = leaders[index];
    if (!leader || width === null) return;
    const value = `${width}px`;
    if (leader.style.width !== value) leader.style.width = value;
  });
}

/**
 * A numbered heading's row is its number, a tab, its words: Word sets a left
 * tab stop past the number, at the first whole multiple of the row's
 * character width that leaves at least one character's room after it
 * ("2" -> 2, "2.1" -> 3, "2.1.1" -> 4 widths from the row's indent, measured
 * in Word 16.86). The number box takes that width.
 */
const TOC_WORD_LINE_ATTR = "data-toc-word-line";

/**
 * Each row of a table Word wrote (its heading, and the blank paragraph its
 * field ends in) set on Word's single line for its face, times the
 * document's line multiple, as the imported body's paragraphs are: CSS
 * `line-height: 1` is the font size, a line Word draws taller (Cambria
 * 12 pt: 14.06 pt, corpus R44-D15's 30 rows came out 61 pt short; R12-D12's
 * "Contents" in Calibri Light 16 pt at 1.08 is 20.95 pt in Word, 17.3 pt as
 * CSS drew it). A row whose look states its own line height keeps it; a face
 * not measurable yet is left to the CSS.
 */
/**
 * The Word line each row of a table was last laid out with, per editor, by
 * the row's heading. A row the ledger moves to another page is drawn by
 * another copy of the table, freshly: written from its first render, its
 * height is there before anything measures it. Laid out only after paint,
 * the copy on a page just reached was read at the bare CSS line (13.33 px
 * for 21.73 px) and its last row fitted the page before; there it measured
 * true, did not, and went back (the 296-page book's rows 266/267 and
 * 382/383, every page of the table once).
 */
const tocWordLineCache = new WeakMap<Element, Map<string, number>>();

export function tocWordLineHeightFor(editorRoot: Element | null | undefined, rowId: string): number | undefined {
  return editorRoot ? tocWordLineCache.get(editorRoot)?.get(rowId) : undefined;
}

/**
 * A row's Word single line, per em. East Asian text in a Latin-first row is
 * set in the row's East Asian face, so the line is the taller of the Latin
 * face's line and that face's (DocumentPageSetup's wordGridRunFaces rule for
 * body lines). Reading the East Asian 1.3x off the Latin face instead made
 * Calibri rows 1.587 em: on R25-D12's 15.6 pt grid each CJK row took two
 * pitches where Word gives one (宋体 10.5 pt, 1.2933 em).
 */
function tocRowSingleLineRatio(doc: Document, family: string, eastAsianText: boolean): number | null {
  if (!eastAsianText) return wordSingleLineRatio(doc, family, false);
  const eastAsianFace = family
    .split(",")
    .map((token) => token.trim().replace(/^["']|["']$/g, ""))
    .find((token) => token && wordFontIsEastAsian(token));
  if (!eastAsianFace) return wordSingleLineRatio(doc, family, true);
  const latin = wordSingleLineRatio(doc, family, false);
  const eastAsian = wordSingleLineRatio(doc, eastAsianFace, true);
  if (!latin || !eastAsian) return null;
  return Math.max(latin, eastAsian);
}

/** A row's "At least" line height, px (a native row's `lineHeightRule`). */
const TOC_LINE_AT_LEAST_VAR = "--toc-line-at-least";

export function layoutTocWordLines(list: HTMLElement | null): void {
  const root = list?.parentElement;
  if (!list || !root) return;
  const editorRoot = list.closest(".ProseMirror");
  let cache = editorRoot ? tocWordLineCache.get(editorRoot) : undefined;
  if (editorRoot && !cache) tocWordLineCache.set(editorRoot, (cache = new Map()));
  const lines = [
    ...Array.from(root.querySelectorAll<HTMLElement>(":scope > .note-editor-toc__heading")),
    ...Array.from(list.querySelectorAll<HTMLElement>(".note-editor-toc__item")),
    ...Array.from(root.querySelectorAll<HTMLElement>(":scope > .note-editor-toc__field-end")),
  ];
  const doc = list.ownerDocument;
  // Writes after all reads, and only the lines whose height changed. What a
  // line's Word line is read from (its size, faces, the document's multiple
  // and grid) does not depend on the line height written here, so a line
  // laid out before is read as it stands: clearing every row's height to
  // read it invalidated the whole table on every layout of every copy, even
  // when no row changed (OI29500's long table, at each font arriving).
  const set = lines.filter((line) => line.hasAttribute(TOC_WORD_LINE_ATTR) || !line.style.lineHeight);
  const heights = set.map((line) => {
    const style = getComputedStyle(line);
    const size = Number.parseFloat(style.fontSize);
    const multiple = Number.parseFloat(style.getPropertyValue("--doc-default-line-height"));
    if (!(size > 0) || !(multiple > 0) || multiple > 10) return null;
    const ratio = tocRowSingleLineRatio(doc, style.fontFamily, textHasEastAsian(line.textContent ?? ""));
    if (!ratio || !(ratio > 0)) return null;
    // On a document line grid a row takes whole grid lines, as the body's
    // paragraphs do (DocumentPageSetup's grid projection: its natural line,
    // at least one pitch, rounded up to whole pitches). Word 16.86, corpus
    // R38-D26 (grid 18 pt): its 12 pt TOC 1 rows stand 24.15 pt apart, one
    // 18 pt line and 6 pt before; set on the font's line they were 16.8 pt.
    // The title keeps its line (Word sets R38-D26's within 0.5 pt of it).
    const pitch = tocGridPitchPx(line);
    if (pitch > 0 && !line.classList.contains("note-editor-toc__heading")) {
      return Math.max(1, Math.ceil(Math.max(pitch, ratio * size) / pitch - 0.000_001)) * pitch;
    }
    const floor = Number.parseFloat(style.getPropertyValue(TOC_LINE_AT_LEAST_VAR)) || 0;
    return Math.max(ratio * size * multiple, floor);
  });
  set.forEach((line, index) => {
    const height = heights[index];
    // Not measurable now (a face still loading): it keeps the line it had.
    if (height === null) return;
    const value = `${height}px`;
    if (line.style.lineHeight !== value) line.style.lineHeight = value;
    if (!line.hasAttribute(TOC_WORD_LINE_ATTR)) line.setAttribute(TOC_WORD_LINE_ATTR, "");
    const rowId = line.getAttribute(TOC_ROW_ID_ATTR);
    if (cache && rowId) cache.set(rowId, height);
  });
}

/** The heading a row of the table stands for (tocWordLineCache). */
const TOC_ROW_ID_ATTR = "data-toc-row-id";

/** The document line grid's pitch (px) a TOC row is laid on, or 0 for none. */
/** The grid pitch (px) the rows of a table of contents are set on when the
 * body is off the grid (generatedListLineGridPitch). */
const TOC_GRID_PITCH_ATTR = "data-toc-grid-pitch";

function tocGridPitchPx(line: HTMLElement): number {
  if (line.closest('[data-snap-to-grid="false"]')) return 0;
  if (!line.closest('[data-doc-grid="lines"]')) {
    // The body is off the grid but the table's own rows are on it
    // (generatedListLineGridPitch).
    const own = Number.parseFloat(line.closest(".note-editor-toc")?.getAttribute(TOC_GRID_PITCH_ATTR) ?? "");
    return Number.isFinite(own) && own > 0 ? own : 0;
  }
  const pitch = Number.parseFloat(getComputedStyle(line).getPropertyValue("--doc-grid-pitch"));
  return Number.isFinite(pitch) && pitch > 0 ? pitch : 0;
}

export function layoutTocNumbers(list: HTMLElement | null): void {
  if (!list) return;
  const numbers = Array.from(list.querySelectorAll<HTMLElement>(".note-editor-toc__number"));
  if (numbers.length === 0) return;
  for (const number of numbers) number.style.width = "";
  const widths = numbers.map((number) => {
    const natural = number.offsetWidth;
    const em = Number.parseFloat(getComputedStyle(number).fontSize);
    if (!(em > 0)) return null;
    return (Math.floor((natural + em) / em) + 1) * em;
  });
  widths.forEach((width, index) => {
    if (width !== null) numbers[index].style.width = `${width}px`;
  });
}

function tocLevelOmitsPageNumber(settings: TocSettings, level: number): boolean {
  const omitted = tocPageNumberOmittedLevels(settings);
  return omitted !== null && level >= omitted[0] && level <= omitted[1];
}

type TocEntryContentProps = {
  heading: TocHeading;
  settings: TocSettings;
  fallback: string;
  /** The number the heading's page prints (its section's Start at / format). */
  pageLabel: string;
  /** Present while the document is editable: a table of contents is text in
   * Word, and what is typed into an entry stays until the whole table is
   * updated ("Update page numbers only" keeps it). Stable across renders. */
  onEditEntry?: (anchorId: string, text: string) => void;
  /** Each keystroke in the entry: its leader is laid out again. Stable. */
  onTextInput?: () => void;
};

/**
 * One entry's text, leader and page number. The table renders every entry on
 * each of its updates; while a long document is laid out it updates on every
 * pass, and the 298-page book's table rendered an entry 58,000 times in 305
 * commits. An entry whose heading, look and page number are what they were is
 * not rendered again (its handlers are stable: they reach the table's latest).
 */
const TocEntryContent = memo(TocEntryContentImpl, (previous, next) =>
  previous.pageLabel === next.pageLabel &&
  previous.fallback === next.fallback &&
  Boolean(previous.onEditEntry) === Boolean(next.onEditEntry) &&
  previous.onTextInput === next.onTextInput &&
  sameJsonValue(previous.heading, next.heading) &&
  sameJsonValue(previous.settings, next.settings));

function TocEntryContentImpl({
  heading,
  settings,
  fallback,
  pageLabel,
  onEditEntry,
  onTextInput,
}: TocEntryContentProps) {
  const onEditText = onEditEntry ? (text: string) => onEditEntry(heading.id, text) : undefined;
  return (
    <>
      {heading.number ? (
        <span className="note-editor-toc__number" data-testid="document-toc-number">
          {heading.number}
        </span>
      ) : null}
      <span
        className="note-editor-toc__entry-label"
        data-toc-entry-text=""
        contentEditable={onEditText ? "plaintext-only" : undefined}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={onTextInput}
        onKeyDown={
          onEditText
            ? (event) => {
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  if (event.key === "Escape") {
                    event.currentTarget.textContent = heading.text || fallback;
                  }
                  event.currentTarget.blur();
                }
              }
            : undefined
        }
        onBlur={
          onEditText
            ? (event) => {
                const typed = sanitizeTocEntryText(event.currentTarget.textContent ?? "");
                if (typed !== (heading.text || fallback)) onEditText(typed);
              }
            : undefined
        }
      >
        {heading.runs
          ? heading.runs.map((run, index) => (
              <span
                key={index}
                style={{
                  fontStyle: run.italic ? "italic" : undefined,
                  fontWeight: run.bold ? 700 : undefined,
                  textDecoration: run.underline ? "underline" : undefined,
                }}
              >
                {run.text}
              </span>
            ))
          : heading.text || fallback}
      </span>
      {settings.showPageNumbers && !heading.noPage && !tocLevelOmitsPageNumber(settings, heading.level) ? (
        // The tab and the page number travel together: they never part
        // across a line.
        <span className="note-editor-toc__tail">
          {settings.rightAlignPageNumbers ? (
            <span
              className="note-editor-toc__leader"
              data-leader={settings.tabLeader}
              aria-hidden
            >
              {(TOC_LEADER_CHARACTER[settings.tabLeader] ?? "").repeat(TOC_LEADER_RUN)}
            </span>
          ) : (
            <span className="note-editor-toc__separator" aria-hidden>
              {" "}
            </span>
          )}
          <span
            className="note-editor-toc__page-number"
            data-testid="document-toc-page-number"
          >
            {pageLabel}
          </span>
        </span>
      ) : null}
    </>
  );
}

/** Paragraph spacing and line height of a native paragraph's attrs. */
export function nativeParagraphCss(attrs: Record<string, unknown> | undefined): CSSProperties {
  const css: CSSProperties = {};
  if (!attrs) return css;
  const points = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1584 ? `${value}pt` : null;
  const before = points(attrs.spaceBefore);
  const after = points(attrs.spaceAfter);
  if (before) css.marginTop = before;
  if (after) css.marginBottom = after;
  if (typeof attrs.lineHeight === "string" && /^\d+(\.\d+)?(pt|px)$/.test(attrs.lineHeight)) {
    css.lineHeight = attrs.lineHeight;
  } else if (typeof attrs.lineHeight === "string" && /^\d+(\.\d+)?$/.test(attrs.lineHeight)) {
    // A multiple ("1.15") is Word's: of the font's single line, not of its
    // size. Handed to layoutTocWordLines, which sets that height; as CSS
    // line-height it drew a row 2.75 pt short (corpus R11-D21: Calibri 11 pt
    // at 1.15 is 15.4 pt in Word, 12.65 pt here), three more rows a page.
    (css as Record<string, string>)["--doc-default-line-height"] = attrs.lineHeight;
  }
  // "Exactly" and "At least" rows state points. Unread, an At least row stood
  // on the document's default multiple (corpus R283-D02: TOC 2 at least 10 pt
  // over 10 pt Arial, 14.4 pt apart in Word, 20 pt here, the table a page over).
  const statedPt = attrs.lineHeightPt;
  if (typeof statedPt === "number" && Number.isFinite(statedPt) && statedPt > 0) {
    if (attrs.lineHeightRule === "exact") css.lineHeight = `${statedPt}pt`;
    else if (attrs.lineHeightRule === "atLeast") {
      (css as Record<string, string>)["--doc-default-line-height"] = "1";
      (css as Record<string, string>)[TOC_LINE_AT_LEAST_VAR] = `${ptToPx(statedPt)}px`;
    }
  }
  return css;
}

/**
 * A native row's left indent and its words' toggles, as Word draws the row:
 * the TOC N paragraph style's indent and its bold, italic, All Caps and
 * Small Caps (corpus R11-D12: TOC 1 bold capitals, TOC 2 small capitals
 * indented 10 pt, TOC 3 italic at 20 pt), which the import resolved onto the
 * row and its runs. The row's font, size and colour stay the table's: its
 * runs wear the Hyperlink character style, which Word does not show in a
 * table of contents (black, not the style's blue).
 */
function nativeRowCss(node: Record<string, unknown>, attrs: Record<string, unknown>): CSSProperties {
  const css: CSSProperties = {};
  const indent = attrs.indentLeftPt;
  const start =
    typeof indent === "number" && Number.isFinite(indent) && indent >= -1584 && indent <= 1584 ? `${indent}pt` : "0pt";
  // A right-to-left row (w:bidi, corpus R297-D05's TOC 1/2) runs from the
  // right margin, its tab, leader and page number to its left: Windows Word
  // draws "تمهيد: لماذا هذا الدليل؟" from 523.5 pt, the dots to 88.6 and "5"
  // at 79 (the right tab at 8 900 twips from the right). Its start indent is
  // the right one; its end indent leaves the tab and the number where they
  // are, as on the left of a left-to-right row.
  if (attrs.dir === "rtl" && !rtlTocRowsOff()) {
    css.direction = "rtl";
    css.paddingRight = start;
    css.paddingLeft = "0pt";
  } else css.paddingLeft = start;
  // The tab after an entry's number goes to the row's first left tab stop,
  // as Word sets it, not to the document's default interval (corpus
  // R281-D02: "1<tab>LIST OF ABBREVIATIONS" under a stop at 480 twips drew
  // its words at 36 pt, Word's at 24 pt). A stop is measured from the
  // margin, the row's tab stops from its indent.
  const stop = nativeRowFirstLeftTabPt(attrs.tabStops);
  const indentPt = typeof indent === "number" && Number.isFinite(indent) ? indent : 0;
  if (stop !== null && stop - indentPt > 0.5) {
    (css as Record<string, string>)["--toc-row-tab-size"] = `${Math.round((stop - indentPt) * 100) / 100}pt`;
  }
  const content = Array.isArray(node.content) ? (node.content as Record<string, unknown>[]) : [];
  const run = content.find((item) => item && item.type === "text");
  const marks = Array.isArray(run?.marks) ? (run?.marks as Record<string, unknown>[]) : [];
  for (const mark of marks) {
    const value = ((mark?.attrs ?? {}) as Record<string, unknown>).value;
    if (value === false) continue;
    switch (mark?.type) {
      case "bold":
        css.fontWeight = 700;
        break;
      case "italic":
        css.fontStyle = "italic";
        break;
      case "allCaps":
        css.textTransform = "uppercase";
        break;
      case "smallCaps":
        css.fontVariantCaps = "small-caps";
        break;
      default:
        break;
    }
  }
  return css;
}

/** The first left (start) tab stop a native paragraph states, in pt from
 * the margin, or null. Its positions are twips. */
function nativeRowFirstLeftTabPt(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;
  let best: number | null = null;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { pos, align } = entry as { pos?: unknown; align?: unknown };
    if (typeof pos !== "number" || !Number.isFinite(pos) || pos <= 0 || pos > 31680) continue;
    if (align !== undefined && align !== null && align !== "left" && align !== "start") continue;
    if (best === null || pos < best) best = pos;
  }
  return best === null ? null : best / 20;
}

/** The character look of a native paragraph's first run. */
function nativeRunCss(node: Record<string, unknown> | undefined): CSSProperties {
  const css: CSSProperties = {};
  const content = Array.isArray(node?.content) ? (node?.content as Record<string, unknown>[]) : [];
  const run = content.find((item) => item && item.type === "text");
  const marks = Array.isArray(run?.marks) ? (run?.marks as Record<string, unknown>[]) : [];
  for (const mark of marks) {
    const attrs = (mark?.attrs ?? {}) as Record<string, unknown>;
    switch (mark?.type) {
      case "fontFamily":
        if (typeof attrs.family === "string" && attrs.family.length < 200) css.fontFamily = attrs.family;
        break;
      case "fontSize":
        if (typeof attrs.size === "string" && /^\d+(\.\d+)?(px|pt)$/.test(attrs.size)) css.fontSize = attrs.size;
        break;
      case "textColor":
        if (typeof attrs.color === "string" && /^#[0-9a-f]{3,8}$/i.test(attrs.color)) css.color = attrs.color;
        break;
      case "bold":
        // A run's direct "not bold" (`value: false`) is no bold.
        css.fontWeight = attrs.value === false ? 400 : 700;
        break;
      case "italic":
        css.fontStyle = "italic";
        break;
      default:
        break;
    }
  }
  return css;
}

/**
 * The size a native row's words are set in, as Word draws (and so spaces)
 * the row: the TOC N style's size, or the size the row's runs state (Word
 * 16.86: corpus R05-D05's "toc 1" rows are Arial 9 pt, 16.4 pt apart with
 * 6 pt between, where the table's Normal 10 pt set them 17.5 pt apart;
 * R53-D04's rows are Arial 12 pt over a 10 pt Normal). A run of spaces or
 * tabs before the words (R05-D05's leading tab in Calibri 11 pt) and the
 * page number do not count. The family is the row's when it is drawn with
 * Word's own metrics (an Office face or its metric twin): corpus R94-D03's
 * rows state Calibri 10 pt (the theme's minor font) over a Times New Roman
 * Normal, and Word draws them in Calibri, 12.2 pt apart; set in the table's
 * Times they stood 11.5 pt apart and the three pages of contents held more
 * rows than Word's. A family drawn only by a look-alike stays the table's:
 * a family Word's machine lacks (R01-D03's "Khmer UI") is drawn by Word on
 * the table's metrics (its rows stand Calibri 11 pt apart).
 */
function nativeRowFontSizeCss(node: Record<string, unknown>): CSSProperties {
  const content = Array.isArray(node.content) ? (node.content as Record<string, unknown>[]) : [];
  const words = content.find((item) => {
    if (!item || item.type !== "text" || typeof item.text !== "string" || !item.text.trim()) return false;
    const marks = Array.isArray(item.marks) ? (item.marks as Record<string, unknown>[]) : [];
    return !marks.some((mark) => mark?.type === "tocEntryPage");
  });
  if (!words) return {};
  const look = nativeRunCss({ content: [words] });
  const metric = look.fontFamily ? officeFontSubstitution(look.fontFamily)?.metric : undefined;
  return {
    ...(look.fontSize ? { fontSize: look.fontSize } : {}),
    ...(look.fontFamily && (metric === "exact" || metric === "cloned" || metric === "near") ? { fontFamily: look.fontFamily } : {}),
  };
}

/**
 * The row look of an imported table of figures (its "Table of Figures"
 * paragraphs, kept in the atom's source): the first row's spacing and its
 * words' size, set on Word's single line by layoutTocWordLines as a table of
 * contents row is. Null for a list this editor inserted. Word 16.86, corpus
 * R27-D13: Calibri 10 pt rows at 1.15 with 10 pt before and after stand
 * 24.15 pt apart; set on the CSS line they were 21.5 pt apart and the 37
 * rows ended 29 pt early, taking the next chapter's picture up a page.
 */
/**
 * The field's end in a paragraph of its own, holding nothing: Word draws it
 * as one more (blank) line under the rows (corpus R44-D15's table of
 * contents; R27-D13's table of figures, whose blank end line stands 23.7 pt
 * under its last row in Word 16.86).
 */
function nativeFieldEndCss(native: readonly unknown[]): CSSProperties | null {
  const last = native[native.length - 1] as Record<string, unknown> | null;
  const lastAttrs = (last?.attrs ?? {}) as Record<string, unknown>;
  const lastField = ((lastAttrs.source ?? {}) as { tocField?: { role?: unknown } }).tocField;
  return last &&
    last.type === "paragraph" &&
    lastField?.role === "end" &&
    !(Array.isArray(last.content) && last.content.length > 0)
    ? nativeParagraphCss(lastAttrs)
    : null;
}

/** The blank end line of an imported table of figures, or null. */
export function nativeGeneratedListFieldEndCss(source: unknown): CSSProperties | null {
  if (!source || typeof source !== "object") return null;
  const native = (source as { tocNative?: unknown }).tocNative;
  return Array.isArray(native) && native.length > 0 ? nativeFieldEndCss(native) : null;
}

export function nativeGeneratedListRowCss(source: unknown): CSSProperties | null {
  if (!source || typeof source !== "object") return null;
  const native = (source as { tocNative?: unknown }).tocNative;
  if (!Array.isArray(native)) return null;
  const row = native
    .slice(0, 400)
    .find(
      (node): node is Record<string, unknown> =>
        !!node &&
        typeof node === "object" &&
        (node as Record<string, unknown>).type === "paragraph" &&
        nativeRowLinkTarget(node as Record<string, unknown>) !== null,
    );
  if (!row) return null;
  return { ...nativeParagraphCss((row.attrs ?? {}) as Record<string, unknown>), ...nativeRowFontSizeCss(row) };
}

interface TocNativeLook {
  /** The "TOC Heading" paragraph the table was imported with. */
  readonly title: CSSProperties | null;
  /** Each level's paragraph spacing, from its first imported row. */
  readonly levels: ReadonlyMap<number, CSSProperties>;
  /** The blank paragraph the field ends in, when it has one of its own. */
  readonly fieldEnd: CSSProperties | null;
  /**
   * A table Word cached without a single entry: the lines of its result as
   * Word draws them, blank (corpus R46-D30: the field's begin paragraph, a
   * row holding a space and its end paragraph are three blank lines in Word
   * 16.86, never a "no entries" message). Null when the table has entries.
   */
  readonly blankLines: readonly CSSProperties[] | null;
  /**
   * Each cached row's own look, in row order, while the rows are still the
   * ones Word wrote (the node's entries are the import's): Word draws a row
   * in its own paragraph's style, whatever level its link names (corpus
   * R33-D24: "3.4.1" in the 0 pt "Índice 3" style links to a level-2
   * heading; drawn with the level-2 rows' 12 pt before it stood 11.6 pt low,
   * and every row after it). Null otherwise; the level's look is used.
   */
  readonly rows: readonly CSSProperties[] | null;
}

/** A blank line's font: its words', else its paragraph mark's (Word sizes
 * an empty paragraph by its mark). */
function nativeBlankLineCss(node: Record<string, unknown>, attrs: Record<string, unknown>): CSSProperties {
  const css: CSSProperties = { ...nativeParagraphCss(attrs) };
  const words = nativeRunCss(node);
  const markMarks = Array.isArray(attrs.paragraphMarkMarks)
    ? (attrs.paragraphMarkMarks as Record<string, unknown>[])
    : [];
  const mark = nativeRunCss({ content: [{ type: "text", marks: markMarks }] });
  const family = words.fontFamily ?? mark.fontFamily;
  const size = words.fontSize ?? mark.fontSize;
  if (family) css.fontFamily = family;
  if (size) css.fontSize = size;
  return css;
}

/**
 * The look of a table Word wrote (an imported field result): Word paints its
 * rows in the document's TOC N styles and its title in "TOC Heading", which
 * the import resolved onto the native paragraphs the node's source keeps.
 * The rows take those paragraphs' spacing (their runs wear the hyperlink's
 * character style, which Word does not show in a table of contents); the
 * title takes its paragraph and its words' look. Null for a table this
 * editor inserted.
 */
/** The `#bookmark` a native row's words link to, if any. */
function nativeRowLinkTarget(node: Record<string, unknown>): string | null {
  const content = Array.isArray(node.content) ? (node.content as Record<string, unknown>[]) : [];
  for (const item of content) {
    const marks = Array.isArray(item?.marks) ? (item.marks as Record<string, unknown>[]) : [];
    for (const mark of marks) {
      const href = (mark?.attrs as Record<string, unknown> | undefined)?.href;
      if (mark?.type === "link" && typeof href === "string" && href.startsWith("#")) return href.slice(1);
    }
  }
  return null;
}

function nativeTocLook(
  source: unknown,
  entries: unknown = null,
): TocNativeLook | null {
  if (!source || typeof source !== "object") return null;
  const native = (source as { tocNative?: unknown }).tocNative;
  if (!Array.isArray(native) || native.length === 0) return null;
  // A row written in a plain paragraph (no TOC N style, so no tocLevel) is
  // still a row: its link names the entry, and so the entry's level (corpus
  // R44-D15, rows in Normal with 6 pt after). Read as a title, the first row
  // lent its look to nothing and every row fell back to the template look.
  const levelById = new Map<string, number>();
  for (const entry of Array.isArray(entries) ? entries.slice(0, 2000) : []) {
    const { id, level } = (entry ?? {}) as { id?: unknown; level?: unknown };
    if (typeof id === "string" && typeof level === "number" && !levelById.has(id)) levelById.set(id, level);
  }
  let title: CSSProperties | null = null;
  const levels = new Map<number, CSSProperties>();
  const rowLooks: CSSProperties[] = [];
  let sawBegin = false;
  for (const raw of native.slice(0, 400)) {
    if (!raw || typeof raw !== "object") continue;
    const node = raw as Record<string, unknown>;
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    const target = nativeRowLinkTarget(node);
    const role = ((attrs.source ?? {}) as { tocField?: { role?: unknown } }).tocField?.role;
    if (role === "begin") sawBegin = true;
    if (sawBegin && node.type === "paragraph" && Array.isArray(node.content) && node.content.length > 0) {
      rowLooks.push({ ...nativeParagraphCss(attrs), ...nativeRowCss(node, attrs), ...nativeRowFontSizeCss(node) });
    }
    const level = attrs.tocLevel ?? (target === null ? undefined : levelById.get(target));
    if (typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 9) {
      if (!levels.has(level)) {
        levels.set(level, { ...nativeParagraphCss(attrs), ...nativeRowCss(node, attrs), ...nativeRowFontSizeCss(node) });
      }
    } else if (levels.size === 0 && title === null) {
      // The title is set on Word's single line times its multiple by
      // layoutTocWordLines, as the rows are (corpus R12-D12: "Contents" in
      // Calibri Light 16 pt at 1.08 is 20.95 pt in Word; CSS drew 17.3 pt).
      // Its weight is its words' as the import resolved them (a bold run
      // states it): the editor's own title rule is Heading 1's bold, which
      // Word's TOC Heading need not be (corpus R455-D85 / R360-D25: Word
      // draws "Table of contents" in its regular weight; the title read into
      // the table drew bold).
      const paragraph = nativeParagraphCss(attrs);
      title = { fontWeight: 400, ...paragraph, ...nativeRunCss(node) };
    }
  }
  const fieldEnd = nativeFieldEndCss(native);
  // No entry at all (an array, not a table to build from the headings): the
  // field result's own lines, from its begin paragraph on (a "TOC Heading"
  // title above it is the title).
  let blankLines: CSSProperties[] | null = null;
  if (Array.isArray(entries) && entries.length === 0) {
    const nodes = native.slice(0, 400) as (Record<string, unknown> | null)[];
    const begin = nodes.findIndex((node) => {
      const field = (((node?.attrs ?? {}) as Record<string, unknown>).source ?? {}) as {
        tocField?: { role?: unknown };
      };
      return field.tocField?.role === "begin";
    });
    if (begin >= 0) {
      blankLines = nodes
        .slice(begin)
        .filter((node): node is Record<string, unknown> => !!node && node.type === "paragraph")
        .map((node) => nativeBlankLineCss(node, (node.attrs ?? {}) as Record<string, unknown>));
    }
  }
  const cached = (source as { tocCachedEntries?: unknown }).tocCachedEntries;
  const untouched =
    Array.isArray(entries) &&
    Array.isArray(cached) &&
    entries.length === rowLooks.length &&
    JSON.stringify(entries) === JSON.stringify(cached);
  return {
    title,
    levels,
    fieldEnd,
    blankLines: blankLines && blankLines.length > 0 ? blankLines : null,
    rows: untouched && rowLooks.length > 0 ? rowLooks : null,
  };
}

type TocSnapshot = {
  doc: ProseMirrorNode;
  headings: TocHeading[];
};

/**
 * A live table's entries, read once per document for every copy of it. A
 * table the pages cut is drawn by one node view per page, and each read the
 * whole document for the same list after every keystroke.
 */
const liveEntriesByDoc = new WeakMap<ProseMirrorNode, Map<string, TocHeading[]>>();

function liveTocEntries(
  doc: ProseMirrorNode,
  levelKey: string,
  normalizeLevel: TocLevelNormalizer,
): TocHeading[] {
  let byLevels = liveEntriesByDoc.get(doc);
  if (!byLevels) {
    byLevels = new Map();
    liveEntriesByDoc.set(doc, byLevels);
  }
  let entries = byLevels.get(levelKey);
  if (!entries) {
    entries = collectTocEntriesFromDoc(doc, normalizeLevel);
    byLevels.set(levelKey, entries);
  }
  return entries;
}

/** How long the edits pause before an unlaid table's page numbers are checked. */
const TOC_PAGE_REFRESH_AFTER_EDITS_MS = 600;

function TableOfContentsView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, node } = props;
  const settings = normalizeTocSettings(node.attrs);
  // Word's Modify Style on TOC 1..9 (doc.attrs.referenceStyles).
  const referenceStyles = useReferenceStyles(editor);
  // The \o range and TOC Options' style mapping (\t) decide which headings
  // the table lists and at which level; the links resolve with the same.
  const maximumLevel = tocEntryMaximumLevel(settings);
  const levelKey = `${settings.levels}|${JSON.stringify(settings.styleLevels)}`;
  const normalizeConfiguredLevel = useMemo(
    () => tocSourceLevelResolver(settings),
    // The resolver depends only on the range and the mapping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [levelKey],
  );
  const cachedHeadings = useMemo(
    () => normalizeTocEntrySnapshot(node.attrs.cachedEntries),
    [node.attrs.cachedEntries],
  );
  const [renderSnapshot, setRenderSnapshot] = useState<TocSnapshot>(() => {
    const doc = editor.state.doc;
    return {
      doc,
      headings: liveTocEntries(doc, levelKey, normalizeConfiguredLevel),
    };
  });
  // The newest document the drawn rows were checked against (see refresh).
  const checkedDocRef = useRef<ProseMirrorNode>(renderSnapshot.doc);
  const drawnSnapshotRef = useRef(renderSnapshot);
  if (drawnSnapshotRef.current !== renderSnapshot) {
    drawnSnapshotRef.current = renderSnapshot;
    checkedDocRef.current = renderSnapshot.doc;
  }
  const allHeadings = (cachedHeadings ?? renderSnapshot.headings).filter(
    (heading) => heading.level <= maximumLevel,
  );
  // A table longer than its page flows on, entry by entry, as Word's does:
  // the page ledger repeats this node on every page the table reaches and
  // gives each copy its rows (atomRowSlices). The title opens the table, so
  // only the copy holding the first entry draws it.
  const slice = rowSliceView(allHeadings, node.attrs);
  const opensTable = slice.position === "whole" || slice.position === "head";
  // An imported table keeps the look Word gave it; one this editor inserted
  // takes the document's Normal (rows) and Heading 1 (title).
  const nativeLook = useMemo(
    () => nativeTocLook(node.attrs.source, node.attrs.cachedEntries),
    [node.attrs.source, node.attrs.cachedEntries],
  );
  // Each cached row's own look while the rows are Word's (by the row, not
  // its level).
  const rowLookByHeading = useMemo(() => {
    const rows = nativeLook?.rows;
    if (!rows || !cachedHeadings || cachedHeadings.length !== rows.length) return null;
    return new Map(cachedHeadings.map((heading, index) => [heading, rows[index]] as const));
  }, [nativeLook, cachedHeadings]);
  const headingStylesAttr = editor.state.doc.attrs?.headingStyles;
  const titleStyle = useMemo<CSSProperties | undefined>(() => {
    if (nativeLook?.title) return nativeLook.title;
    const css = headingStyleCss(normalizeHeadingStyles(headingStylesAttr), 1);
    if (Object.keys(css).length === 0) return undefined;
    return Object.fromEntries(
      Object.entries(css).map(([property, value]) => [
        property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
        value,
      ]),
    ) as CSSProperties;
  }, [nativeLook, headingStylesAttr]);
  const leadersOn = settings.showPageNumbers && settings.rightAlignPageNumbers;
  const tocGridPitchTwips = generatedListLineGridPitch(editor.state.doc.attrs as Record<string, unknown>);
  const listRef = useRef<HTMLUListElement | null>(null);
  const wordLines = nativeLook !== null;
  let editorRoot: Element | null = null;
  try {
    editorRoot = editor.view.dom;
  } catch {
    editorRoot = null;
  }
  const cachedWordLine = (rowId: string) => (wordLines ? tocWordLineHeightFor(editorRoot, rowId) : undefined);
  const layoutRows = useCallback(() => {
    const list = listRef.current;
    // An imported table's lines are Word's single lines, as its body's are.
    if (wordLines) layoutTocWordLines(list);
    // The numbers' tab stops first: they move the words the leaders follow.
    layoutTocNumbers(list);
    if (leadersOn) layoutTocLeaders(list);
  }, [leadersOn, wordLines]);
  // A render lays the rows out before paint when what they show changed
  // (their words, numbers, page numbers or look) ... A render that changed
  // none of it laid every copy of a long table out again, each a forced
  // layout of the whole document (WebKit, the 296-page book).
  const laidOutAs = useRef<string | null>(null);
  const rowsSignature = `${leadersOn}|${wordLines}|${tocSignature(allHeadings)}`;
  useLayoutEffect(() => {
    if (laidOutAs.current === rowsSignature && listRef.current?.isConnected) return;
    laidOutAs.current = rowsSignature;
    layoutRows();
  });
  // ... and so does a change of the width the rows wrap in, or of the fonts.
  const hasRows = allHeadings.length > 0;
  useEffect(() => {
    const list = listRef.current;
    if (!hasRows || !list) return;
    const relayout = () => layoutRows();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(relayout);
    observer?.observe(list);
    const fonts = typeof document === "undefined" ? null : document.fonts;
    // Any window's face arriving relaid every row out in that event (0.7-1.6 s
    // in WebKit for a long book's table): background work now
    // (lib/background-work), in the next frame unless the person is working
    // in another window.
    const lane = createBackgroundLane({ label: "docs-toc-rows", owner: () => list.closest(".wm-window") ?? list });
    let cancelFrame: (() => void) | null = null;
    const relayoutForFonts = (event: Event) => {
      if (cancelFrame) return;
      // A face is used only for the characters of its unicode-range: a subset
      // for characters none of these rows draws (a Chinese book fetches
      // hundreds while it lays out) changes no row, and laying every copy of
      // the table out again for each was a forced layout of the whole book
      // apiece in WebKit (~5 s of the 296-page book's opening).
      const faces = newFontFacesOf(event) ??
        (event as Event & { fontfaces?: ReadonlyArray<{ unicodeRange?: string }> }).fontfaces;
      const ranges = loadedFaceRanges(faces);
      // The title and field end around the list are laid out with its rows.
      if (ranges && !textDrawsCodePointIn((list.parentElement ?? list).textContent ?? "", ranges)) return;
      cancelFrame = requestLaneFrame(lane, () => {
        cancelFrame = null;
        layoutRows();
      });
    };
    fonts?.addEventListener?.("loadingdone", relayoutForFonts);
    // A sheet the browser skipped has no boxes to lay the rows out by, and its
    // coming back resizes nothing: the leaders stayed collapsed on a table first
    // laid out out of view (corpus R283-D06, every row's number against its words).
    const sheet = list.closest("article[data-page-sheet]");
    const relayoutWhenDrawn = (event: Event) => {
      if (!(event as Event & { skipped?: boolean }).skipped) layoutRows();
    };
    sheet?.addEventListener("contentvisibilityautostatechange", relayoutWhenDrawn);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", relayoutForFonts);
      sheet?.removeEventListener("contentvisibilityautostatechange", relayoutWhenDrawn);
      cancelFrame?.();
      lane.dispose();
    };
  }, [layoutRows, hasRows]);
  // A row Word wrote holds the number it printed: 4 there is the page that prints 4
  // (corpus R283-D06: pages after a numbered-apart cover showed 2 for 4), where a
  // live row's is the sheet, which prints its own label.
  const rowsAsWritten = cachedHeadings !== null && (node.attrs.source as { adapter?: unknown } | null)?.adapter === "docx";
  const pageLabelOf = (heading: { pageText?: string; pageNumber?: number }) =>
    heading.pageText ??
    (rowsAsWritten ? String(heading.pageNumber ?? 1) : documentPageNumberLabel(renderSnapshot.doc, heading.pageNumber ?? 1));
  const relayoutLeaders = layoutRows;
  const relayoutLeadersRef = useRef(relayoutLeaders);
  relayoutLeadersRef.current = relayoutLeaders;
  const stableRelayoutLeaders = useCallback(() => relayoutLeadersRef.current(), []);

  // Every rendered link is authorized by the exact immutable document that
  // produced its position lookup. Legacy nodes also refresh their live heading
  // list; authored caches retain their labels until an explicit TOC update.
  useEffect(() => {
    const refresh = () => {
      const doc = editor.state.doc;
      const next =
        cachedHeadings === null
          ? liveTocEntries(doc, levelKey, normalizeConfiguredLevel)
          : null;
      setRenderSnapshot((prev) => {
        const sameHeadings =
          next === null || tocSignature(prev.headings) === tocSignature(next);
        if (prev.doc === doc && sameHeadings) return prev;
        // A keystroke elsewhere in the document leaves the rows as drawn:
        // the same entries, printing the same page labels. The table is not
        // drawn again (each render lays every row out before paint, which
        // read every row's width on every keystroke of a 296-page book);
        // the document it was checked against is the one its links resolve
        // in from now on.
        const rows = cachedHeadings ?? prev.headings;
        if (
          sameHeadings &&
          prev.doc.attrs?.wordSpacingAddsUp === doc.attrs?.wordSpacingAddsUp &&
          samePrintedPageLabels(prev.doc, doc, new Set(rows.map((heading) => heading.pageNumber ?? 1)))
        ) {
          checkedDocRef.current = doc;
          return prev;
        }
        return {
          doc,
          headings: next === null || sameHeadings ? prev.headings : next,
        };
      });
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [cachedHeadings, editor, levelKey, normalizeConfiguredLevel]);

  // A table written where nothing was laid out (the AI's headless host) says
  // page 1 on every row: once this editor has paginated, its page numbers are
  // refreshed once, the way "Update page numbers only" would.
  const updateAttributes = props.updateAttributes;
  useEffect(() => {
    if (cachedHeadings === null) return;
    if (cachedHeadings.some((heading) => (heading.pageNumber ?? 1) !== 1)) return;
    let mounted = true;
    let queued = false;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshPages = () => {
      queued = false;
      if (typingTimer !== null) clearTimeout(typingTimer);
      typingTimer = null;
      // Read-only while the page is still opening (or shared to read): the
      // check runs again once the window may write.
      if (!mounted || editor.isDestroyed || !editor.isEditable) return;
      const refreshed = unlaidTocPageNumbers(
        node.attrs.cachedEntries,
        collectHeadingsFromDoc(editor.state.doc, normalizeConfiguredLevel),
      );
      if (refreshed) updateAttributes({ cachedEntries: withPrintedPageLabels(editor.state.doc, refreshed) });
    };
    // Never from inside a view update: a copy the page ledger adds for the
    // table's next page is rendered (and its effects run) while ProseMirror
    // is still updating the view, where no transaction may be dispatched.
    const scheduleRefresh = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(refreshPages);
    };
    // Neither the pagination that lays the headings out on their pages nor
    // the window's own setEditable(value, false) emits "update" (Docs AI
    
    // after mount and every row still read 1). Listen for the changes that
    // do arrive: a document transaction, and the contenteditable flip.
    // An edit's check waits until the edits pause: it reads every heading
    // of the document, which on a long book was a whole-document walk on
    // every keystroke (and a table the pages cut walked once per copy).
    const scheduleAfterEdits = () => {
      if (queued) return;
      if (typingTimer !== null) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        typingTimer = null;
        scheduleRefresh();
      }, TOC_PAGE_REFRESH_AFTER_EDITS_MS);
    };
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) scheduleAfterEdits();
    };
    const observer = new MutationObserver(scheduleRefresh);
    if (!editor.isDestroyed) {
      observer.observe(editor.view.dom, { attributes: true, attributeFilter: ["contenteditable"] });
    }
    scheduleRefresh();
    editor.on("update", scheduleAfterEdits);
    editor.on("transaction", onTransaction);
    return () => {
      mounted = false;
      if (typingTimer !== null) clearTimeout(typingTimer);
      observer.disconnect();
      editor.off("update", scheduleAfterEdits);
      editor.off("transaction", onTransaction);
    };
  }, [cachedHeadings, editor, node.attrs.cachedEntries, normalizeConfiguredLevel, updateAttributes]);

  // Typing in an entry (Word: the table of contents is ordinary text until
  // it is updated). The table then keeps its own entries (`cachedEntries`),
  // this one with the typed text; "Update page numbers only" leaves it,
  // "Update entire table" rebuilds it from the headings.
  // Followed, not read once: a reopened page becomes writable after the
  // table first draws (setEditable emits no update), and an entry drawn
  // while the page was still read-only stayed plain text, so a click picked
  // the whole table and the first key typed over it (live Word audit WUA 178).
  const editable = useEditorSurfaceEditable(editor);
  // Word shows the table's tab while the selection is in it: the table
  // selected, or one of its entries being typed into.
  const [entryFocused, setEntryFocused] = useState(false);
  const tabActive = editable && (props.selected || entryFocused);
  const handleEntryEdit = useCallback(
    (anchorId: string, text: string) => {
      const current = (cachedHeadings ?? renderSnapshot.headings).map((heading) =>
        heading.id === anchorId ? { ...heading, text: text.slice(0, 500) } : heading,
      );
      props.updateAttributes({ cachedEntries: current });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cachedHeadings, renderSnapshot.headings, props.updateAttributes],
  );

  const handleEntryEditRef = useRef(handleEntryEdit);
  handleEntryEditRef.current = handleEntryEdit;
  const stableEntryEdit = useCallback((anchorId: string, text: string) => handleEntryEditRef.current(anchorId, text), []);

  const handleEntryClick = useCallback(
    (anchorId: string) => {
      if (editor.state.doc !== checkedDocRef.current) return;
      const pos = findHeadingPos(
        editor.state.doc,
        anchorId,
        normalizeConfiguredLevel,
      );
      if (pos === null) return;
      // Place the caret at the start of the heading's text and scroll it into
      // view. setTextSelection + scrollIntoView mirrors how the rest of the
      // editor focuses a target block.
      editor
        .chain()
        .focus()
        .setTextSelection(pos + 1)
        .scrollIntoView()
        .run();
    },
    [editor, normalizeConfiguredLevel],
  );

  // The blank paragraph holding the section's end opens no page of its own in
  // Word, though it does not fit (measured in Word: a next-page section whose empty
  // last paragraph falls past the foot prints no page for it; one with words does). Drawn, it sent the last row of a full table of contents to a page alone.
  const endsItsSection = (() => {
    try {
      const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
      if (typeof pos !== "number") return false;
      const after = editor.state.doc.resolve(pos + props.node.nodeSize).nodeAfter;
      return after?.type.name === "sectionBreak" && after.attrs?.breakType !== "continuous";
    } catch {
      return false;
    }
  })();

  return (
    <NodeViewWrapper
      className="note-editor-toc"
      data-testid="document-toc"
      data-show-page-numbers={settings.showPageNumbers ? "true" : "false"}
      data-right-align-page-numbers={
        settings.rightAlignPageNumbers ? "true" : "false"
      }
      data-tab-leader={settings.tabLeader}
      data-toc-format={settings.format}
      {...(tocGridPitchTwips !== null ? { [TOC_GRID_PITCH_ATTR]: String(tocGridPitchTwips / 15) } : {})}
      aria-label={settings.title ?? t("toc.title")}
      contentEditable={false}
      onFocusCapture={(event: { target: EventTarget | null }) => {
        if (event.target instanceof HTMLElement && event.target.closest("[data-toc-entry-text]")) {
          setEntryFocused(true);
        }
      }}
      onBlurCapture={(event: { target: EventTarget | null }) => {
        if (event.target instanceof HTMLElement && event.target.closest("[data-toc-entry-text]")) {
          setEntryFocused(false);
        }
      }}
      {...{ [PAGE_ROW_SLICE_ATTR]: rowSliceStamp(slice.position) }}
    >
      {editable && opensTable ? (
        <TocControlTab editor={editor} getPos={props.getPos} active={tabActive} />
      ) : null}
      {settings.title !== null && opensTable ? (
        // Word's gallery block: the title is a "TOC Heading" paragraph
        // (Heading 1's look) above the field result.
        <p
          className="note-editor-toc__heading"
          data-testid="document-toc-heading"
          contentEditable={false}
          style={titleStyle}
        >
          {settings.title}
        </p>
      ) : null}
      {allHeadings.length === 0 && nativeLook?.blankLines && opensTable ? (
        <ul
          ref={listRef}
          className="note-editor-toc__list"
          data-testid="document-toc-blank-lines"
          data-spacing-adds-up={renderSnapshot.doc.attrs?.wordSpacingAddsUp === true ? "true" : undefined}
        >
          {nativeLook.blankLines.map((style, index) => (
            <li key={index} className="note-editor-toc__item" style={style}>
              {"\u200b"}
            </li>
          ))}
        </ul>
      ) : allHeadings.length === 0 ? (
        opensTable ? (
          <p className="note-editor-toc__empty" data-testid="document-toc-empty">
            {t("toc.empty")}
          </p>
        ) : null
      ) : (
        <ul
          ref={listRef}
          className="note-editor-toc__list"
          data-testid="document-toc-list"
          data-spacing-adds-up={renderSnapshot.doc.attrs?.wordSpacingAddsUp === true ? "true" : undefined}
        >
          {slice.rows.map(({ row: heading, index }) => heading.kind === "text" ? (
            // A line typed between the rows (no entry): its words at its own
            // indent, no link and no page, as Word prints it.
            <li
              key={heading.id}
              className="note-editor-toc__item note-editor-toc__item--text"
              data-level={heading.level}
              data-toc-text-row=""
              {...{ [PAGE_ROW_ATTR]: index }}
              style={{
                ...(nativeLook?.levels.get(heading.level) ?? {}),
                ...(heading.indentLeftPt !== undefined ? { paddingLeft: `${heading.indentLeftPt}pt`, textIndent: 0 } : {}),
              }}
            >
              <span className="note-editor-toc__text-row">{heading.text}</span>
            </li>
          ) : (
            <li
              key={heading.id}
              className={`note-editor-toc__item note-editor-toc__item--level-${heading.level}`}
              data-level={heading.level}
              {...{ [PAGE_ROW_ATTR]: index }}
              {...{ [TOC_ROW_ID_ATTR]: heading.id }}
              {...(cachedWordLine(heading.id) !== undefined ? { [TOC_WORD_LINE_ATTR]: "" } : {})}
              data-modified-style={
                referenceStyles?.[`TOC${heading.level}` as ReferenceStyleId]
                  ? "true"
                  : undefined
              }
              data-align={
                referenceStyles?.[`TOC${heading.level}` as ReferenceStyleId]
                  ?.textAlign ?? undefined
              }
              style={{
                ...(rowLookByHeading?.get(heading) ?? nativeLook?.levels.get(heading.level)),
                ...referenceStyleCss(
                  referenceStyles?.[`TOC${heading.level}` as ReferenceStyleId],
                ),
                // The Word line this row was last laid out with, from the
                // first paint (tocWordLineCache); layoutTocWordLines confirms it.
                ...(cachedWordLine(heading.id) !== undefined ? { lineHeight: `${cachedWordLine(heading.id)}px` } : {}),
              }}
            >
              {settings.hyperlinks && !editable ? (
                <button
                  type="button"
                  className="note-editor-toc__link"
                  data-testid="document-toc-link"
                  data-anchor-id={heading.id}
                  data-toc-tail={leadersOn ? "leader" : undefined}
                  onClick={() => handleEntryClick(heading.id)}
                >
                  <TocEntryContent
                    heading={heading}
                    settings={settings}
                    fallback={t("toc.untitled")}
                    pageLabel={pageLabelOf(heading)}
                  />
                </button>
              ) : (
                // While editing, an entry is text: a click places the caret
                // in it and Ctrl/Cmd+Click follows the link, as in Word.
                <span
                  className="note-editor-toc__link"
                  data-testid={settings.hyperlinks ? "document-toc-link" : "document-toc-label"}
                  data-anchor-id={heading.id}
                  data-toc-tail={leadersOn ? "leader" : undefined}
                  title={
                    settings.hyperlinks
                      ? followLinkHint(t("editor.imageLinkHint"), isMacPlatform())
                      : undefined
                  }
                  onClick={
                    settings.hyperlinks
                      ? (event) => {
                          if (!event.metaKey && !event.ctrlKey) return;
                          event.preventDefault();
                          handleEntryClick(heading.id);
                        }
                      : undefined
                  }
                >
                  <TocEntryContent
                    heading={heading}
                    settings={settings}
                    fallback={t("toc.untitled")}
                    pageLabel={pageLabelOf(heading)}
                    onEditEntry={editable ? stableEntryEdit : undefined}
                    onTextInput={stableRelayoutLeaders}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {nativeLook?.fieldEnd && allHeadings.length > 0 && (slice.position === "whole" || slice.position === "tail") && !endsItsSection ? (
        <p className="note-editor-toc__field-end" aria-hidden style={nativeLook.fieldEnd}>
          {"\u200b"}
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}

const TableOfContents = Node.create<{
  /** Says a table of contents asked for in a table cell went after the table (referencesButtons). */
  onPlacedAfterTable?: () => void;
}>({
  name: "tableOfContents",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onPlacedAfterTable: undefined };
  },

  addAttributes() {
    return {
      levels: {
        default: "1-3",
        parseHTML: (element: HTMLElement) =>
          normalizeTocSettings({
            levels: element.getAttribute("data-toc-levels"),
          }).levels,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-levels": normalizeTocSettings(attrs).levels,
        }),
      },
      hyperlinks: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-toc-hyperlinks") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-hyperlinks": normalizeTocSettings(attrs).hyperlinks
            ? "true"
            : "false",
        }),
      },
      showPageNumbers: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-toc-show-page-numbers") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-show-page-numbers": normalizeTocSettings(attrs)
            .showPageNumbers
            ? "true"
            : "false",
        }),
      },
      rightAlignPageNumbers: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-toc-right-align-page-numbers") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-right-align-page-numbers": normalizeTocSettings(attrs)
            .rightAlignPageNumbers
            ? "true"
            : "false",
        }),
      },
      tabLeader: {
        default: "dot",
        parseHTML: (element: HTMLElement) =>
          normalizeTocSettings({
            tabLeader: element.getAttribute("data-toc-tab-leader"),
          }).tabLeader,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-tab-leader": normalizeTocSettings(attrs).tabLeader,
        }),
      },
      format: {
        default: "template",
        parseHTML: (element: HTMLElement) =>
          normalizeTocSettings({
            format: element.getAttribute("data-toc-format"),
          }).format,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-format": normalizeTocSettings(attrs).format,
        }),
      },
      title: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeTocSettings({
            title: element.getAttribute("data-toc-title"),
          }).title,
        renderHTML: (attrs: Record<string, unknown>) => {
          const title = normalizeTocSettings(attrs).title;
          return title === null ? {} : { "data-toc-title": title };
        },
      },
      useOutlineLevels: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-toc-outline-levels") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-outline-levels": normalizeTocSettings(attrs).useOutlineLevels
            ? "true"
            : "false",
        }),
      },
      entryFields: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-toc-entry-fields") === "true",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-toc-entry-fields": normalizeTocSettings(attrs).entryFields
            ? "true"
            : "false",
        }),
      },
      styleLevels: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          const serialized = element.getAttribute("data-toc-style-levels");
          if (serialized === null || serialized.length > 20_000) return [];
          try {
            return normalizeTocSettings({ styleLevels: JSON.parse(serialized) })
              .styleLevels;
          } catch {
            return [];
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const levels = normalizeTocSettings(attrs).styleLevels;
          return levels.length === 0
            ? {}
            : { "data-toc-style-levels": JSON.stringify(levels) };
        },
      },
      preservedSwitches: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          normalizeTocSettings({
            preservedSwitches: element.getAttribute("data-toc-switches"),
          }).preservedSwitches,
        renderHTML: (attrs: Record<string, unknown>) => {
          const switches = normalizeTocSettings(attrs).preservedSwitches;
          return switches ? { "data-toc-switches": switches } : {};
        },
      },
      cachedEntries: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const serialized = element.getAttribute("data-toc-entries");
          if (serialized === null || serialized.length > 1_000_000) return null;
          try {
            return normalizeTocEntrySnapshot(JSON.parse(serialized));
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const entries = normalizeTocEntrySnapshot(attrs.cachedEntries);
          return entries === null
            ? {}
            : { "data-toc-entries": JSON.stringify(entries) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="table-of-contents"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "table-of-contents" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(TableOfContentsView, {
      // A copy whose row range the page ledger changed draws its rows at
      // once: the ledger reads them in the same frame.
      update: updateRowSlicedNodeView,
      // An entry being typed into owns its keys and pointer: ProseMirror
      // must not read them as edits of the document around the table.
      // The content-control tab's buttons and menu own theirs too.
      stopEvent: ({ event }) =>
        event.target instanceof HTMLElement &&
        (event.target.closest("[data-toc-entry-text][contenteditable]") !== null ||
          event.target.closest(`[${TOC_CONTROL_TAB_ATTR}]`) !== null),
    });
  },

  addKeyboardShortcuts() {
    return {
      // Word's F9 (Update Field) on a table of contents opens its Update
      // Table dialog.
      F9: ({ editor }) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection)) return false;
        if (selection.node.type.name !== this.name) return false;
        if (!editor.isEditable) return false;
        requestTocControl(editor, { action: "update" });
        return true;
      },
    };
  },
});

export default TableOfContents;
