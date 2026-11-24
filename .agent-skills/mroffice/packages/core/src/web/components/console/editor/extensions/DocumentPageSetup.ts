/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { firstLayoutHoldsFaces } from "../native-document/paged/coldFirstLayout";
import { editsStayInsideTextblocks } from "../native-document/textblockOnlyEdits";
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import { PX_PER_PT } from "../../../../lib/office-units";
import officeLatinAverages from "../../../../lib/office-fonts/office-latin-averages.json";
import { createBackgroundLane, requestLaneFrame } from "../../../../lib/background-work";
import { normalizeWordCompatibilityMode, wordPunctuationCompresses } from "../native-document/documentOverflowPunctuation";
import { wordOmitsEastAsianAutoSpace } from "../native-document/wordFarEastDefaults";
import {
  documentTerminalPunctuation,
  documentTerminalPunctuationApplies,
  firstTerminalPunctuationRect,
  sameTerminalLine,
  type TerminalGlyphBox,
  type TerminalPunctuationSpec,
} from "../native-document/documentTerminalPunctuation";
import { wordAutoSpaceLineEdges } from "../native-document/wordAutoSpaceLineEdges";
import { clientRectInPaginationLayout, paginationTransformScale } from "../native-document/paged/paginationGeometry";
import { measurementRange } from "../native-document/paged/measurementRange";
import { documentNumberingMarker, type DocumentNumberingMarkerResult } from "../native-document/documentNumberingMarker";
import { documentStyleFontSizePx, paragraphHoldsNoText } from "../native-document/documentStyleFontSize";
import { documentLineGridPitch, offLineGridAt, sectionsOffLineGrid } from "../native-document/sectionLineGrid";
import { WORD_ZH_CN_NO_START_EXTRA, wordKinsokuList } from "../native-document/documentWordDelimiterBoundaries";
import { TABLE_REPEATED_HEADER_ATTR } from "../native-document/paged/tablePagination";
import { bandOverflowByIndexOnly, bandOverflowForSection, bandOverflowSectionsOf } from "../native-document/paged/bandOverflowSections";
import { footnotesAllowProgressiveLayout, sheetedDocHasFootnoteRefs } from "../native-document/paged/footnoteRefs";
import { documentDisplayFontPluginKey } from "../native-document/documentDisplayFonts";
import { projectionFontReach } from "../native-document/projectionFontNews";
import { DOCS_ENGINE_BASE_SPACING_ATTR, DOCS_ENGINE_BASE_WORD_SPACING_ATTR, DOCS_ENGINE_LINE_ATTR } from "../../../../lib/text-engine/docs-lines";
import { measureOfficeGlyphAdvances, measureOfficeGlyphBaselineOffsets, type measureOfficeGlyphBaselineOffset, type OfficeGlyphAdvanceOptions, type OfficeGlyphBaselineOptions } from "../../../office-ribbon/officeFontLineBox";
import { INLINE_FORMULA_TYPESET_EVENT, LAYOUT_METRICS_FLUSH_EVENT, sourceFontPlanIsReady, writeDocumentLayoutStatus, DOCUMENT_AUTO_LINE_SPACING_PENDING, DOCUMENT_WORD_CJK_SPACING_PENDING, measureOutsideEditorObservation } from "../native-document/documentLayoutStatus";
import Document from "@tiptap/extension-document";
import { PAGE_REGION_RECEIPT, normalizePaginationProjectionReceipt } from "../native-document/paged/paginationProjectionReceipt";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { normalizeDocumentTableStyleVisualCatalog } from "../../../../lib/document-table-design-authority";
import { normalizeOfficeThemePaletteId } from "../../../../lib/office-color-palette";
import {
  normalizeEastAsianFontFamilies,
  WORD_EAST_ASIAN_SINGLE_LINE_FACTOR,
  wordDocumentEastAsianSingleLineFactor,
} from "../../../../lib/document-word-line-metrics";
import {
  wordFontIsEastAsian,
  wordFontIsRecordedLatin,
  wordDocumentGridFontLineMetrics,
} from "../native-document/wordFontMetrics";
import { normalizeOfficeWordThemeColors } from "../../../../lib/office-table-style-word";
import { normalizeDocumentDesign } from "../../../../lib/document-design";
import {
  normalizeHandwritingDocument,
  type HandwritingDocumentSetting,
} from "../../../../lib/handwriting-paper";
import {
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAGE_ORIENTATION,
  DEFAULT_PAGE_SIZE,
  normalizeCustomPageMargins,
  normalizeCustomPageSize,
  normalizeLineNumbers,
  normalizeInkPaper,
  normalizePageBackgroundColor,
  normalizePageBackgroundFill,
  type InkPaper,
  normalizePageBorder,
  normalizePageMargins,
  normalizePageOrientation,
  normalizePageSize,
  pageMarginsSelectionFromSectionTwips,
  pageSizeSelectionFromSectionTwips,
  type CustomPageMarginsInches,
  type CustomPageSizeInches,
  type LineNumbers,
  type PageBorder,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "../native-document/pageSetup";
import { trustReadOnlyDocumentMutation } from "../native-document/readOnlyTransactionAuthority";
import {
  normalizeDocumentProtection,
  toggleDocumentProtection,
  type DocumentProtection,
  type DocumentProtectionMode,
} from "../native-document/documentProtection";
import { normalizeTrackRevisions } from "../native-document/trackChangesMode";
import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_COLUMN_SEPARATOR,
  DEFAULT_MANUSCRIPT_GRID,
  DEFAULT_WRITING_MODE,
  normalizeColumns,
  normalizeManuscriptGrid,
  normalizeWritingMode,
  resolveColumnSeparator,
  type ColumnCount,
  type ManuscriptGrid,
  type WritingMode,
} from "../native-document/documentLayout";
import {
  normalizeBandRichBlocks,
  normalizeDifferentFirstPage,
  normalizeDifferentOddEven,
  normalizeSectionBands,
  type SectionBandEntry,
  sanitizeHeaderFooterText,
  updateBandRichPageNumbers,
  type BandRichBlock,
  type PageNumberStoryAlignment,
} from "../native-document/headerFooter";
import {
  DEFAULT_PAGE_NUMBER_FORMAT,
  normalizePageNumberFormat,
  normalizePageNumberStart,
  normalizePageNumberStartSection,
  type PageNumberFormat,
} from "../native-document/pageNumberFormat";
import {
  normalizeDocumentMetadataOrNull,
  type DocumentMetadata,
} from "../native-document/documentMetadata";
import { normalizeCustomProperties, type CustomProperty } from "../native-document/documentCustomProperties";
import {
  normalizeAutoHyphenation,
  normalizeHyphenationOptions,
  type HyphenationOptions,
} from "../native-document/documentHyphenation";
import {
  normalizeDocumentWatermark,
  type DocumentWatermark,
} from "../native-document/watermark";
import {
  documentDefaultEastAsianFontFamily,
  normalizeCharacterStyle,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeTextColor,
} from "./TextStyling";
import {
  normalizeLineHeight,
  normalizeSpacing,
  normalizeTextAlign,
  type DocumentTextAlign,
} from "./DocumentFormatting";
import {
  normalizeFirstLineIndentPt,
  normalizeIndentPt,
} from "../native-document/preciseIndent";
import {
  sanitizeNoteNumFmt,
  sanitizeNoteNumStart,
  sanitizeNotePosition,
  sanitizeNoteRestart,
} from "../native-document/footnotes";
import { sanitizeNoteTextStyle } from "../native-document/noteTextStyle";
import {
  mergeWordDocumentSettings,
  normalizeWordDocumentSettings,
  type WordMultiplePages,
} from "../native-document/wordDocumentSettings";
import {
  materializedLineNumbers,
  normalizeSectionLayouts,
  SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR,
  SECTION_UNEQUAL_COLUMN_TRACKS_ATTR,
  sectionLayoutColumnsCss,
  sectionLayoutSheetCss,
  sectionLayoutBandCss,
  sectionLayoutColumnTracksToken,
  updateSectionLayout as updateSectionLayoutAtSelection,
  type SectionLayout,
  type SectionLayoutPatch,
} from "../native-document/sectionLayouts";
import {
  planSectionLayoutRepair,
  reportSectionLayoutStructureFailure,
} from "../native-document/sectionLayoutRepair";
import { COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META } from "../native-document/collaborationDocumentAttrs";
import { closeHistory } from "@tiptap/pm/history";
import {
  clearSectionStoryEditableContent,
  materializeSectionStoryRef,
  normalizeSectionStoryGraph,
  removeOpaqueSectionStoryPageNumbers,
  resolveEffectiveSectionStoryRef,
  sectionStorySlot,
  sectionStoryNativeCommit,
  setSectionStoryEditableContent,
  setSectionStoryEvenAndOddHeaders,
  setSectionStoryLinkedToPrevious,
  setSectionStoryTitlePage,
  type SectionStoryGraph,
  type SectionStoryKind,
  type SectionStoryVariant,
} from "../native-document/sectionStoryGraph";
import { PAGE_BLOCK_NODE } from "../native-document/paged/pageBlockExtension";
import { projectionCoversHorizon, recordProjectedHorizon, sheetsWithinMeasureHorizon } from "../native-document/paged/measureHorizon";
import { SheetMeasureMemo, querySheetsAll, sheetOfQueried, sheetsOf } from "../native-document/paged/sheetMeasureMemo";
import { deferWhileSurfaceGlides } from "../native-document/surfaceGlide";

/** One entry of the document's named-style palette (Word 样式库). */
// The Heading 1..6 contract lives in one module shared with the offline DOCX
// serializer and the heading renderer, so preview and export cannot drift.
import {
  HEADING_STYLE_LEVELS,
  normalizeHeadingStyles,
  type HeadingStyleDefinition,
  type HeadingStyleMap,
} from "../../../../lib/document-heading-styles";
import {
  normalizeReferenceStyles,
  type ReferenceStyleMap,
} from "../native-document/referenceStyles";
import {
  normalizeDocumentQuickParts,
  type DocumentQuickPart,
} from "../native-document/documentQuickParts";

/** This projection's coverage record in measureHorizon (its default key). */
const WORD_CJK_HORIZON_KEY = "cjk-spacing";

export {
  HEADING_STYLE_LEVELS,
  normalizeHeadingStyles,
  type HeadingStyleDefinition,
  type HeadingStyleMap,
};

export interface NamedStyleDefinition {
  /**
   * Stable OOXML identity for this definition. The human name is editable and
   * the palette can be reordered, so neither is safe as a paragraph reference.
   * Older documents omit this field and receive a deterministic id during
   * hydration/persistence (see {@link ensureStableNamedStyleIds}).
   */
  styleId?: string;
  name: string;
  fontFamily?: string;
  fontSize?: string;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /**
   * The id of a companion CHARACTER style this paragraph style is LINKED to
   * (Word's `<w:link>` — a "linked" style pairs a paragraph style with a
   * character style of the same family so the gallery can apply either the whole
   * paragraph or just a run). Validated against the editor's character-style
   * gallery ({@link normalizeCharacterStyle}); omitted when absent/unknown so a
   * palette with no link is byte-for-byte unchanged. Applying the named style also
   * applies this character style's run formatting (see `namedStyleApplyOps`), and
   * DOCX export emits `<w:link w:val="…"/>` on the paragraph style definition.
   */
  linkedCharacterStyleId?: string;
  /**
   * Paragraph-level depth (the style's own `w:pPr`): alignment, spacing
   * before/after in points, unitless line height, and left/right/first-line
   * indents in points (a NEGATIVE first-line indent is Word's hanging indent).
   * Captured by the DOCX importer off the style definition and written back as
   * `<w:pPr>` on the exported `<w:style>`; each field re-validates through the
   * same normalizers the paragraph attrs use.
   */
  textAlign?: DocumentTextAlign;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineHeight?: string;
  indentLeftPt?: number;
  indentRightPt?: number;
  firstLineIndentPt?: number;
  /**
   * Word's Create New Style from Formatting properties. `styleType`: a
   * character style formats runs only; a linked style is a paragraph style
   * that formats only the selected runs when applied to part of a paragraph
   * (omitted = paragraph). `basedOn`: the palette style this one inherits
   * from (omitted = Normal). `nextStyleId`: the style Enter gives the next
   * paragraph ("Normal" or a palette id; omitted = this style itself).
   * `quickStyle: false`: not in the Styles gallery. `autoUpdate`: Word's
   * "Automatically update" (`w:autoRedefine`).
   */
  styleType?: NamedStyleType;
  basedOn?: string;
  nextStyleId?: string;
  quickStyle?: false;
  autoUpdate?: true;
}

export type NamedStyleType = "paragraph" | "character" | "linked";

const MAX_NAMED_STYLES = 24;
const MAX_STYLE_DEFINITIONS = 512;
const MAX_COMPRESSED_STYLE_PART_CHARS = 2_000_000;
const MAX_STYLE_DEFINITIONS_JSON_CHARS = 5_000_000;
const STYLE_ID_RE = /^[^\u0000-\u001f]{1,128}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const COMPRESSED_XML_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Closed transport envelope for the native Word style graph.
 *
 * The API owns the deep OOXML property whitelist.  The editor validates the
 * stable graph identity and bounded opaque-part envelope, then keeps the
 * nested semantic object intact so autosave cannot flatten or discard theme
 * references and unknown OOXML children captured by the importer.
 */
export type DocxStyleDefinitions = Record<string, unknown>;

/** Closed validator shared by named-style definitions and paragraph refs. */
export function normalizeNamedStyleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return STYLE_ID_RE.test(normalized) ? normalized : null;
}

export function normalizeStyleDefinitions(
  value: unknown,
): DocxStyleDefinitions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || !Array.isArray(source.styles)) return null;
  if (source.styles.length > MAX_STYLE_DEFINITIONS) return null;
  const ids = new Set<string>();
  for (const rawStyle of source.styles) {
    if (!rawStyle || typeof rawStyle !== "object" || Array.isArray(rawStyle)) {
      return null;
    }
    const styleId = (rawStyle as Record<string, unknown>).styleId;
    if (
      typeof styleId !== "string" ||
      !STYLE_ID_RE.test(styleId) ||
      ids.has(styleId)
    ) {
      return null;
    }
    ids.add(styleId);
  }
  if (
    typeof source.sourceModelSha256 !== "string" ||
    !SHA256_RE.test(source.sourceModelSha256)
  ) {
    return null;
  }
  const raw = source.rawParts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rawParts = raw as Record<string, unknown>;
  if (
    rawParts.codec !== "zlib-base64" ||
    typeof rawParts.stylesXml !== "string" ||
    rawParts.stylesXml.length > MAX_COMPRESSED_STYLE_PART_CHARS ||
    !COMPRESSED_XML_RE.test(rawParts.stylesXml) ||
    typeof rawParts.stylesSha256 !== "string" ||
    !SHA256_RE.test(rawParts.stylesSha256)
  ) {
    return null;
  }
  const hasEffectsXml = rawParts.stylesWithEffectsXml !== undefined;
  const hasEffectsDigest = rawParts.stylesWithEffectsSha256 !== undefined;
  if (hasEffectsXml !== hasEffectsDigest) return null;
  if (
    hasEffectsXml &&
    (typeof rawParts.stylesWithEffectsXml !== "string" ||
      rawParts.stylesWithEffectsXml.length > MAX_COMPRESSED_STYLE_PART_CHARS ||
      !COMPRESSED_XML_RE.test(rawParts.stylesWithEffectsXml) ||
      typeof rawParts.stylesWithEffectsSha256 !== "string" ||
      !SHA256_RE.test(rawParts.stylesWithEffectsSha256))
  ) {
    return null;
  }
  try {
    const serialized = JSON.stringify(source);
    if (serialized.length > MAX_STYLE_DEFINITIONS_JSON_CHARS) return null;
    return JSON.parse(serialized) as DocxStyleDefinitions;
  } catch {
    return null;
  }
}

/**
 * Derive durable node decorations for structural page sheets from the ordered
 * section model. Direct DOM writes are intentionally not used here:
 * ProseMirror's DOM observer reverts foreign attributes on a node DOM during
 * its next redraw (the same failure mode documented by PageSpanExtension).
 */
/** Word's section vertical alignment (Layout > Page Setup > Layout >
 * Vertical alignment, `w:vAlign`): where the text sits between the top and
 * bottom margins of each page of the section. */
const SECTION_VALIGN_ATTR = "data-section-valign";
const VALIGN_BREAK_SELECTOR = '[data-type="section-break"], [data-type="page-break"]';
const VALIGN_BREAK_NODES = new Set(["sectionBreak", "pageBreak"]);
export const sectionVerticalOffsetsKey = new PluginKey<SectionLayoutPluginState>(
  "sectionLayoutDecorations",
);

interface SectionLayoutPluginState {
  decorations: DecorationSet;
  /** Page index -> how far the page's text moves down (CSS px). */
  offsets: ReadonlyMap<number, number>;
}

/** A paragraph's own space after (`--doc-paragraph-space-after`), CSS px. */
function authoredSpaceAfterPx(style: CSSStyleDeclaration): number {
  const raw = style.getPropertyValue("--doc-paragraph-space-after").trim();
  const match = /^(-?\d+(?:\.\d+)?)(pt|px)$/.exec(raw);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  return match[2] === "pt" ? (value * 96) / 72 : value;
}

/**
 * How far each vertically aligned sheet's text moves down: the room left
 * under its last flow block, all of it (bottom) or half of it (centre).
 * Measured in layout pixels (offsetTop / offsetHeight ignore the page's
 * zoom transform and the move itself, which is a `translate`).
 */
export function measureSectionVerticalOffsets(root: ParentNode): Map<number, number> {
  const out = new Map<number, number>();
  const sheets = sheetsOf(root);
  sheets.forEach((sheet, pageIndex) => {
    const alignment = sheet.getAttribute(SECTION_VALIGN_ATTR);
    if (alignment !== "center" && alignment !== "bottom" && alignment !== "both") return;
    const style = getComputedStyle(sheet);
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    let contentBottom = paddingTop;
    let flowBlocks = 0;
    for (const child of Array.from(sheet.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const childStyle = getComputedStyle(child);
      if (childStyle.position === "absolute" || childStyle.position === "fixed") continue;
      if (child.classList.contains("ProseMirror-widget")) continue;
      // A section or page break mark is no paragraph of the page: it takes
      // no share of the room, and the last paragraph, not the mark, ends on
      // the bottom margin (vboth.docx: D's last line on the margin).
      if (child.matches(VALIGN_BREAK_SELECTOR)) continue;
      flowBlocks += 1;
      // The paragraph's own space after counts even where the sheet drops
      // the margin of its last block: Word 16 for Mac ends a bottom-aligned
      // page's text at the space after's bottom, on the document's last page
      // too (wp-fix-a/vsa.docx: 24 pt after lifts the line 24 pt; vboth.docx
      // p2's last line sits where p1's does).
      const bottom =
        child.offsetTop +
        child.offsetHeight +
        Math.max(Number.parseFloat(childStyle.marginBottom) || 0, authoredSpaceAfterPx(childStyle));
      contentBottom = Math.max(contentBottom, bottom);
    }
    const room = sheet.offsetHeight - paddingBottom - contentBottom;
    if (!(room > 0.5)) return;
    // Justified: the room goes between the paragraphs in equal parts, the
    // last line ending on the bottom margin (Word 16 for Mac,
    // wp-fix-a/vboth.docx); a lone paragraph stays at the top.
    const value =
      alignment === "center" ? room / 2 : alignment === "bottom" ? room : flowBlocks > 1 ? room / (flowBlocks - 1) : 0;
    if (!(value > 0)) return;
    out.set(pageIndex, Math.round(value * 100) / 100);
  });
  return out;
}





function sectionLayoutsWhileArriving(): boolean {
  return (globalThis as { __docsSectionLayoutsArriving?: boolean }).__docsSectionLayoutsArriving !== false;
}

export function buildSectionLayoutDecorations(
  doc: ProseMirrorNode,
  verticalOffsets: ReadonlyMap<number, number> = new Map(),
): DecorationSet {
  const layouts = normalizeSectionLayouts(doc.attrs.sectionLayouts);
  if (!layouts) return DecorationSet.empty;

  const pages: Array<{
    pos: number;
    nodeSize: number;
    sectionBreaks: number;
    /** A section break with more of the page after it: the page holds
     * more than one section. */
    innerBreak: boolean;
  }> = [];
  doc.forEach((node, offset) => {
    if (node.type.name !== PAGE_BLOCK_NODE) return;
    let sectionBreaks = 0;
    node.descendants((child) => {
      if (child.type.name === "sectionBreak") sectionBreaks += 1;
      return true;
    });
    let innerBreak = false;
    node.forEach((child, _offset, index) => {
      if (child.type.name === "sectionBreak" && index < node.childCount - 1) innerBreak = true;
    });
    pages.push({ pos: offset, nodeSize: node.nodeSize, sectionBreaks, innerBreak });
  });
  const sections = pages.reduce((total, page) => total + page.sectionBreaks, 1);
  // A long document comes in a run of pages at a time, its section layouts
  // with the first: until its last break has arrived, the pages it holds
  // name fewer sections than the layouts list. Their sections are known
  // (a page's is the breaks before it), but no sheet of the document had its
  // layout until the last of them came: R286-D01 opened 36 s without its
  // pages' width, margins and height, then every sheet took them at once and
  // the ledger laid all 117 out again from the first (3.3-3.8 s, Chromium).
  
  const arriving = sections < layouts.length && sectionLayoutsWhileArriving();
  if (pages.length === 0 || (layouts.length !== sections && !arriving)) {
    return DecorationSet.empty;
  }

  let sectionIndex = 0;
  const decorations: Decoration[] = [];
  const wordSettings = normalizeWordDocumentSettings(doc.attrs.wordSettings);
  for (const [pageIndex, page] of pages.entries()) {
    const layout = layouts[sectionIndex];
    if (!layout) return DecorationSet.empty;
    // Centre and bottom move a single-column page's text down; justified
    // (`both`) spreads its blocks over the page.
    const verticalAlignment =
      (layout.verticalAlignment === "center" ||
        layout.verticalAlignment === "bottom" ||
        layout.verticalAlignment === "both") &&
      layout.columns.count <= 1 &&
      // A page holding several sections (a continuous break, or one the
      // paginator has still to cut) is not one section's page to align.
      !page.innerBreak
        ? layout.verticalAlignment
        : null;
    const css = sectionLayoutColumnsCss(layout);
    const unequalTracks = sectionLayoutColumnTracksToken(layout);
    // The padding reads the sheet's own band overflow (stampSheetBandOverflow):
    // named by its page index, the decoration of every later sheet changed
    // when a page was added or taken away before it, and ProseMirror drew
    // every one of them again.
    const sheet = sectionLayoutSheetCss(layout, wordSettings, pageIndex, "self");
    const style = [
      `width: ${sheet.width}`,
      `min-height: ${sheet.minHeight}`,
      `padding-top: ${sheet.paddingTop}`,
      `padding-right: ${sheet.paddingRight}`,
      `padding-bottom: ${sheet.paddingBottom}`,
      `padding-left: ${sheet.paddingLeft}`,
      `margin-left: auto`,
      `margin-right: auto`,
      `--page-height-px: ${sheet.pageHeight}`,
      `--page-margin-top: ${sheet.marginTop}`,
      `--page-margin-right: ${sheet.marginRight}`,
      `--page-margin-bottom: ${sheet.marginBottom}`,
      `--page-margin-left: ${sheet.marginLeft}`,
      ...Object.entries(sectionLayoutBandCss(layout, wordSettings, pageIndex)).map(([key, value]) => `${key}: ${value}`),
      css.columnCount ? `column-count: ${css.columnCount}` : "",
      css.columnGap ? `column-gap: ${css.columnGap}` : "",
      css.columnRule ? `column-rule: ${css.columnRule}` : "",
      verticalAlignment
        ? `${verticalAlignment === "both" ? "--section-valign-step" : "--section-valign-offset"}: ${verticalOffsets.get(pageIndex) ?? 0}px`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    decorations.push(
      Decoration.node(page.pos, page.pos + page.nodeSize, {
        "data-section-layout-index": String(sectionIndex),
        ...(verticalAlignment ? { [SECTION_VALIGN_ATTR]: verticalAlignment } : {}),
        ...(unequalTracks
          ? { [SECTION_UNEQUAL_COLUMN_TRACKS_ATTR]: unequalTracks }
          : {}),
        ...(unequalTracks && layout.columns.separator
          ? { [SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR]: "true" }
          : {}),
        ...(style ? { style: `${style};` } : {}),
      }),
    );
    if (verticalAlignment === "both") {
      // Each paragraph moves down by the gaps above it (a break mark counts
      // as none).
      const pageNode = doc.nodeAt(page.pos);
      let childPos = page.pos + 1;
      let flowIndex = 0;
      pageNode?.forEach((child) => {
        decorations.push(
          Decoration.node(childPos, childPos + child.nodeSize, {
            style: `--section-valign-index: ${flowIndex}`,
          }),
        );
        if (!VALIGN_BREAK_NODES.has(child.type.name)) flowIndex += 1;
        childPos += child.nodeSize;
      });
    }
    sectionIndex += page.sectionBreaks;
  }
  return DecorationSet.create(doc, decorations);
}

const stampedBandOverflow = new WeakMap<HTMLElement, string>();
const NO_BAND_OVERFLOW = "0px|0px";

/**
 * Give each sheet its own header and footer band overflow as
 * `--sheet-band-extra-{top,bottom}-self`, the values the editor publishes
 * per page index (`--sheet-band-extra-top-<index>` on an ancestor). Written
 * only where a sheet's value changed: a page added near the start moves the
 * later pages' indexes, but their overflow, nearly always the same, writes
 * nothing.
 */
/**
 * A document with footnotes laid out a window at a time
 * (`__docsFootnoteProgressive`) takes each page's band overflow by its section
 * (bandOverflowSections): a pass that moved pages between sections left pages
 * the next window planned with another section's band (R286-D01: pages 64-80
 * planned at 1019 px for 1004, a table row cut there kept when the room read
 * right again; laid out whole, the next pass plans them again).
 * `window.__docsNotesBandBySection = false` reads the index's value as before.
 */
function notesBandBySection(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsNotesBandBySection?: boolean }) | null;
  if (win?.__docsNotesBandBySection === false) return false;
  return sheetedDocHasFootnoteRefs(view.state.doc) && footnotesAllowProgressiveLayout(view.state.doc, win);
}

export function stampSheetBandOverflow(view: EditorView): void {
  const root = view.dom;
  if (!root.isConnected) return;
  const sheets = sheetsOf(root);
  if (sheets.length === 0) return;
  // Read from the inline style that carries them (no style is computed on a
  // keystroke for this); none means no page's band overflows.
  let host: HTMLElement | null = root;
  while (host && !(host.getAttribute("style") ?? "").includes("--sheet-band-extra-")) host = host.parentElement;
  const published = (name: string) => host?.style.getPropertyValue(name).trim() || "0px";
  // A page a pass moved to another section takes its section's overflow,
  // not the one its index had under the old cut (bandOverflowSections).
  const sections = host && (!bandOverflowByIndexOnly() || notesBandBySection(view)) ? bandOverflowSectionsOf(root) : null;
  const sectionFallback = new Map<string, string>();
  const writes: Array<() => void> = [];
  sheets.forEach((sheet, index) => {
    // No page's band overflows: no name to build for each sheet of a long book.
    if (!host && stampedBandOverflow.get(sheet) === NO_BAND_OVERFLOW) return;
    const sectionAttr = sections ? sheet.getAttribute("data-section-layout-index") : null;
    const section = sectionAttr === null ? Number.NaN : Number(sectionAttr);
    const valueOf = (edge: "top" | "bottom") => {
      if (!host) return "0px";
      if (!sections || !Number.isInteger(section) || sections[index] === section) return published(`--sheet-band-extra-${edge}-${index}`);
      const key = `${edge}:${section}`;
      let value = sectionFallback.get(key);
      if (value === undefined) {
        value = bandOverflowForSection(index, section, sections, (at) => published(`--sheet-band-extra-${edge}-${at}`));
        sectionFallback.set(key, value);
      }
      return value;
    };
    const top = valueOf("top");
    const bottom = valueOf("bottom");
    const signature = `${top}|${bottom}`;
    if (stampedBandOverflow.get(sheet) === signature) return;
    writes.push(() => {
      if (sheet.style.getPropertyValue("--sheet-band-extra-top-self") !== top) sheet.style.setProperty("--sheet-band-extra-top-self", top);
      if (sheet.style.getPropertyValue("--sheet-band-extra-bottom-self") !== bottom) sheet.style.setProperty("--sheet-band-extra-bottom-self", bottom);
      stampedBandOverflow.set(sheet, signature);
    });
  });
  if (writes.length > 0) measureOutsideEditorObservation(view, () => writes.forEach((write) => write()));
}

function sameOffsets(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - value) > 0.5) return false;
  }
  return true;
}

function sectionLayoutDecorationPlugin(): Plugin<SectionLayoutPluginState> {
  return new Plugin<SectionLayoutPluginState>({
    key: sectionVerticalOffsetsKey,
    state: {
      init: (_config, state: EditorState) => ({
        decorations: buildSectionLayoutDecorations(state.doc),
        offsets: new Map(),
      }),
      apply(
        tr: Transaction,
        value: SectionLayoutPluginState,
        _oldState: EditorState,
        newState: EditorState,
      ) {
        const measured = tr.getMeta(sectionVerticalOffsetsKey) as
          | ReadonlyMap<number, number>
          | undefined;
        const offsets = measured ?? value.offsets;
        // A page's section decorations are about its breaks: text typed inside
        // a paragraph moves them and changes none.
        if (!measured && tr.docChanged && editsStayInsideTextblocks([tr])) {
          return { decorations: value.decorations.map(tr.mapping, tr.doc), offsets };
        }
        return tr.docChanged || measured
          ? { decorations: buildSectionLayoutDecorations(newState.doc, offsets), offsets }
          : value;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(editorView) {
      let frame: number | null = null;
      const measure = () => {
        frame = null;
        if (editorView.isDestroyed) return;
        const current = sectionVerticalOffsetsKey.getState(editorView.state)?.offsets ?? new Map();
        const root = editorView.dom;
        if (!root.querySelector(`:scope > article[data-page-sheet][${SECTION_VALIGN_ATTR}]`)) {
          if (current.size) editorView.dispatch(editorView.state.tr.setMeta(sectionVerticalOffsetsKey, new Map()).setMeta("addToHistory", false));
          return;
        }
        const next = measureSectionVerticalOffsets(root);
        if (sameOffsets(current, next)) return;
        editorView.dispatch(
          editorView.state.tr.setMeta(sectionVerticalOffsetsKey, next).setMeta("addToHistory", false),
        );
      };
      const schedule = () => {
        if (frame !== null || typeof window === "undefined") return;
        frame = window.requestAnimationFrame(measure);
      };
      schedule();
      // The editor publishes each page's band overflow on an ancestor and
      // nudges the pages when it changes.
      const restamp = () => stampSheetBandOverflow(editorView);
      stampSheetBandOverflow(editorView);
      window.addEventListener("mrn-page-rebalance", restamp);
      return {
        update: () => {
          stampSheetBandOverflow(editorView);
          schedule();
        },
        destroy: () => {
          window.removeEventListener("mrn-page-rebalance", restamp);
          if (frame !== null) window.cancelAnimationFrame(frame);
        },
      };
    },
  });
}

/** The doc-level band attrs a first sectioned edit materializes into
 * per-section entries (and then clears — sectionBands becomes the single
 * source of truth for band content; the variant flags stay doc-level). */
const SECTION_BAND_TEXT_KEYS = [
  "headerText",
  "footerText",
  "firstPageHeader",
  "firstPageFooter",
  "evenPageHeader",
  "evenPageFooter",
] as const;
const SECTION_BAND_RICH_KEYS = [
  "headerRich",
  "footerRich",
  "firstPageHeaderRich",
  "firstPageFooterRich",
  "evenPageHeaderRich",
  "evenPageFooterRich",
] as const;

const SECTION_STORY_LINK_KEYS = {
  header: {
    default: "headerLinkedToPrevious",
    first: "firstPageHeaderLinkedToPrevious",
    even: "evenPageHeaderLinkedToPrevious",
  },
  footer: {
    default: "footerLinkedToPrevious",
    first: "firstPageFooterLinkedToPrevious",
    even: "evenPageFooterLinkedToPrevious",
  },
} as const;

const SECTION_STORY_TEXT_KEYS = {
  header: {
    default: "headerText",
    first: "firstPageHeader",
    even: "evenPageHeader",
  },
  footer: {
    default: "footerText",
    first: "firstPageFooter",
    even: "evenPageFooter",
  },
} as const;

const SECTION_STORY_RICH_KEYS = {
  header: {
    default: "headerRich",
    first: "firstPageHeaderRich",
    even: "evenPageHeaderRich",
  },
  footer: {
    default: "footerRich",
    first: "firstPageFooterRich",
    even: "evenPageFooterRich",
  },
} as const;

type SectionBandEntries = NonNullable<ReturnType<typeof normalizeSectionBands>>;

































function resolveSectionBandsForWrite(
  editor: { readonly state: EditorState },
  options: {
    readonly pageScoped?: boolean;
    readonly seedBesideGraph?: boolean;
  } = {},
): {
  readonly bands: SectionBandEntries;
  readonly materialized: boolean;
} | null {
  const current = normalizeSectionBands(editor.state.doc.attrs.sectionBands);
  const graphPresent =
    editor.state.doc.attrs.sectionStoryGraph !== null &&
    editor.state.doc.attrs.sectionStoryGraph !== undefined;
  if (current) return { bands: current, materialized: false };

  let breaks = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "sectionBreak") breaks += 1;
    return true;
  });
  if (graphPresent) {
    return options.seedBesideGraph
      ? {
          bands: Array.from(
            { length: breaks + 1 },
            () => ({}),
          ) as SectionBandEntries,
          // Nothing was lifted out of the doc-level attrs, so there is nothing
          // to clear: the graph already owns every story.
          materialized: false,
        }
      : null;
  }
  // breaks === 0 is legal: a sectionless document is ONE section, and its
  // single page-scoped entry keeps typing-overflow pages clean instead of
  // inheriting the band.
  const attrs = editor.state.doc.attrs as Record<string, unknown>;
  const seed: Record<string, unknown> = {};
  for (const key of SECTION_BAND_TEXT_KEYS) {
    const value = sanitizeHeaderFooterText(attrs[key]);
    if (value) seed[key] = value;
  }
  for (const key of SECTION_BAND_RICH_KEYS) {
    const blocks = normalizeBandRichBlocks(attrs[key]);
    if (blocks) seed[key] = blocks;
  }
  if (attrs.differentFirstPage === true) seed.differentFirstPage = true;
  if (attrs.differentOddEven === true) seed.differentOddEven = true;
  // NATIVE materialization defaults to page-scoped: a band the author TYPES
  // belongs to its section's FIRST page only, so pages born from typing
  // overflow never inherit it.
  //
  // A page NUMBER is the opposite kind of object — a running element Word
  // renders on every page of the section — and `pageScoped` exports through
  // Word's different-first-page machinery (the default/even footer parts stay
  // empty), so a page-scoped page number would print on page 1 alone. The
  // Page Number commands therefore opt out.
  if (options.pageScoped !== false) seed.pageScoped = true;
  return {
    bands: Array.from({ length: breaks + 1 }, () => ({
      ...seed,
    })) as SectionBandEntries,
    materialized: true,
  };
}

/**
 * A document with no imported header/footer parts, given one band entry per
 * section. Bands lifted from the document's one header: every later section
 * was showing it, i.e. was linked to the one before (Word's default for a new
 * section). `materialized`: the document-level bands are to be cleared.
 */
function seedLinkedNativeSectionBands(
  editor: { readonly state: EditorState },
  sectionCount: number,
): { readonly bands: SectionBandEntries; readonly materialized: boolean } | null {
  const resolved = resolveSectionBandsForWrite(editor, { pageScoped: false });
  if (!resolved) return null;
  const counted = sectionBandsForCount(resolved.bands, sectionCount);
  if (!counted) return null;
  return {
    bands: resolved.materialized
      ? (counted.map((entry, index) =>
          index === 0
            ? entry
            : {
                ...entry,
                headerLinkedToPrevious: true,
                footerLinkedToPrevious: true,
                firstPageHeaderLinkedToPrevious: true,
                firstPageFooterLinkedToPrevious: true,
                evenPageHeaderLinkedToPrevious: true,
                evenPageFooterLinkedToPrevious: true,
              },
        ) as SectionBandEntries)
      : counted,
    materialized: resolved.materialized,
  };
}

function clearDocumentLevelBands(tr: { setDocAttribute(key: string, value: unknown): unknown }): void {
  for (const key of SECTION_BAND_TEXT_KEYS) tr.setDocAttribute(key, "");
  for (const key of SECTION_BAND_RICH_KEYS) tr.setDocAttribute(key, null);
}

/**
 * The rich blocks a band variant currently holds, falling back to the flattened
 * text story when only that is present. Editing page numbers must never discard
 * authored band text, so a plain-text band is lifted into equivalent paragraph
 * blocks before the PAGE field building block is added or removed.
 */
function bandVariantRichBlocks(
  entry: SectionBandEntries[number] | undefined,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): BandRichBlock[] {
  const record = (entry ?? {}) as Record<string, unknown>;
  const rich = normalizeBandRichBlocks(
    record[SECTION_STORY_RICH_KEYS[kind][variant]],
  );
  if (rich) return rich;
  const text = sanitizeHeaderFooterText(
    record[SECTION_STORY_TEXT_KEYS[kind][variant]],
  );
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => ({ type: "paragraph" as const, runs: [{ text: line }] }));
}

function projectNativeStoryIntoSectionBands(
  entries: NonNullable<ReturnType<typeof normalizeSectionBands>>,
  graph: NonNullable<ReturnType<typeof normalizeSectionStoryGraph>>,
  storyId: string,
  content:
    | { mode: "text"; text: string }
    | { mode: "rich"; blocks: BandRichBlock[] }
    | { mode: "empty" }
    | { mode: "removePageNumbers" },
): NonNullable<ReturnType<typeof normalizeSectionBands>> {
  return entries.map((entry, sectionIndex) => {
    const next: Record<string, unknown> = { ...entry };
    for (const kind of ["header", "footer"] as const) {
      for (const variant of ["default", "first", "even"] as const) {
        if (
          resolveEffectiveSectionStoryRef(
            graph,
            sectionIndex,
            kind,
            variant,
          )?.storyId !== storyId
        ) {
          continue;
        }
        const textKey = SECTION_STORY_TEXT_KEYS[kind][variant];
        const richKey = SECTION_STORY_RICH_KEYS[kind][variant];
        if (content.mode === "removePageNumbers") {
          // Word's Remove Page Numbers: the page-number building block's
          // lines go (`updateBandRichPageNumbers`), every other line and
          // field stays. Only the rich band knows those lines: the band's
          // flattened text copy is dropped beside it, or left as the blank
          // tombstone of a story nothing is left in.
          const currentRich = next[richKey];
          if (Array.isArray(currentRich)) {
            const stripped = updateBandRichPageNumbers(
              currentRich as BandRichBlock[],
              null,
            );
            if (stripped?.length) {
              next[richKey] = stripped;
              delete next[textKey];
            } else {
              delete next[richKey];
              next[textKey] = "";
            }
          }
        } else if (content.mode === "rich") {
          next[richKey] = content.blocks;
          delete next[textKey];
        } else {
          next[textKey] = content.mode === "text" ? content.text : "";
          delete next[richKey];
        }
        if (graph.sections[sectionIndex][sectionStorySlot(kind, variant)]) {
          delete next[SECTION_STORY_LINK_KEYS[kind][variant]];
        }
      }
    }
    return next;
  }) as NonNullable<ReturnType<typeof normalizeSectionBands>>;
}

/** Whether the band a native story paints holds a line of Word's page-number
 * building block (`pageNumberBlock`, read on import from the "Page Numbers"
 * gallery's content control). */
function nativeStoryBandHoldsPageNumberBlock(
  entries: NonNullable<ReturnType<typeof normalizeSectionBands>>,
  graph: NonNullable<ReturnType<typeof normalizeSectionStoryGraph>>,
  storyId: string,
): boolean {
  return entries.some((entry, sectionIndex) =>
    (["header", "footer"] as const).some((kind) =>
      (["default", "first", "even"] as const).some((variant) => {
        if (
          resolveEffectiveSectionStoryRef(graph, sectionIndex, kind, variant)
            ?.storyId !== storyId
        ) {
          return false;
        }
        const rich = (entry as Record<string, unknown>)[
          SECTION_STORY_RICH_KEYS[kind][variant]
        ];
        return (
          Array.isArray(rich) &&
          rich.some(
            (block: unknown) =>
              typeof block === "object" &&
              block !== null &&
              (block as { type?: unknown }).type === "paragraph" &&
              (block as { pageNumberBlock?: unknown }).pageNumberBlock === true,
          )
        );
      }),
    ),
  );
}

function editableBlocksForNativeStory(
  graph: NonNullable<ReturnType<typeof normalizeSectionStoryGraph>>,
  storyId: string,
): BandRichBlock[] | null {
  const stories = new Map(graph.stories.map((story) => [story.storyId, story]));
  const seen = new Set<string>();
  let story = stories.get(storyId);
  while (story?.content.mode === "sourceClone") {
    if (seen.has(story.storyId)) return null;
    seen.add(story.storyId);
    story = stories.get(story.content.sourceStoryId);
  }
  return story?.content.mode === "editable" ? story.content.blocks : null;
}

function updateSectionBandBoolean(
  entries: NonNullable<ReturnType<typeof normalizeSectionBands>>,
  sectionIndex: number,
  key:
    | "differentFirstPage"
    | "differentOddEven"
    | (typeof SECTION_STORY_LINK_KEYS)[SectionStoryKind][SectionStoryVariant],
  enabled: boolean,
): NonNullable<ReturnType<typeof normalizeSectionBands>> {
  return entries.map((entry, index) => {
    if (index !== sectionIndex) return entry;
    const next: Record<string, unknown> = { ...entry };
    if (enabled) next[key] = true;
    else delete next[key];
    return next;
  }) as NonNullable<ReturnType<typeof normalizeSectionBands>>;
}

/**
 * Named-style spacing: negatives are off-range source noise and drop the
 * field entirely (the paragraph-attr twin clamps to 0 instead, which is right
 * for live typing but would let a forged palette entry materialize as "0pt").
 */
function normalizeStyleSpacing(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(
          String(value ?? "")
            .trim()
            .replace(/pt$/i, ""),
        );
  if (Number.isFinite(raw) && raw < 0) return null;
  return normalizeSpacing(value);
}

/**
 * Word docGrid line pitch (twips). 20 (1pt) … 2880 (144pt) covers every
 * practical line grid; anything else — including the absent default — is
 * `null` so pagination stays unquantized. PURE whitelist clamp.
 */
export function normalizeDocGridLinePitch(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded >= 20 && rounded <= 2880 ? rounded : null;
}

/**
 * A document's semantic single spacing uses the font's own metrics. CSS
 * `line-height: 1` instead forces a one-em box and clips that leading, so the
 * document default accepts the safe keyword `normal` in addition to the
 * numeric paragraph-spacing whitelist.
 */
/**
 * A document that came from Word (it carries the source styles part or
 * section layouts) paints no space before or after a paragraph unless its
 * styles declare some (ECMA-376 §17.3.1.33: an absent `w:spacing` attribute
 * is 0). The importer keeps an undeclared value null so the stored document
 * stays byte-stable with its styles part; the editor's own note default
 * (12px after) must not stand in for Word's 0.
 */
/**
 * The section bands sized to the document's sections. A section break typed,
 * pasted or made by editing a later page's header adds a section, but nothing
 * adds a band entry for it, so a per-section command found one entry for two
 * sections and refused with no sign (Different First Page could not be
 * ticked from a second section's header). Missing entries are empty bands,
 * which is what a section without its own header text is; more entries than
 * sections is a document this command must not touch.
 */
function sectionBandsForCount(
  bands: SectionBandEntry[] | null,
  sectionCount: number,
): SectionBandEntry[] | null | false {
  if (!bands) return null;
  if (bands.length > sectionCount) return false;
  if (bands.length === sectionCount) return bands;
  return [
    ...bands,
    ...Array.from({ length: sectionCount - bands.length }, () => ({}) as SectionBandEntry),
  ];
}

/**
 * Whether section `sectionIndex` has its own first-page header and footer
 * (w:titlePg), read as Different First Page reads and writes it.
 */
export function sectionDifferentFirstPageAt(doc: ProseMirrorNode, sectionIndex: number): boolean {
  let sectionCount = 1;
  doc.descendants((node) => {
    if (node.type.name === "sectionBreak") sectionCount += 1;
    return true;
  });
  const attrs = doc.attrs as Record<string, unknown>;
  const graph =
    attrs.sectionStoryGraph !== null && attrs.sectionStoryGraph !== undefined
      ? normalizeSectionStoryGraph(attrs.sectionStoryGraph, sectionCount)
      : null;
  if (graph) return graph.sections[sectionIndex]?.titlePage === true;
  const bands = sectionBandsForCount(normalizeSectionBands(attrs.sectionBands), sectionCount);
  if (bands) return bands[sectionIndex]?.differentFirstPage === true;
  return attrs.differentFirstPage === true;
}

/**
 * Whether the document came from Word, so an undeclared docDefaults spacing
 * means Word's 0 rather than the note stylesheet's gap. Word's styles part
 * says so. Section layouts alone do not: a native document gains them the
 * first time Page Setup or a paper size is applied, and reading that as
 * "from Word" removed every paragraph gap of the document at once. A package
 * imported without its styles part still carries the docDefaults typography
 * the importer read beside its sections.
 */
export function isWordSourcedDocument(attrs: Record<string, unknown> | null | undefined): boolean {
  if (!attrs) return false;
  if (attrs.styleDefinitions != null) return true;
  const layouts = attrs.sectionLayouts;
  if (!Array.isArray(layouts) || layouts.length === 0) return false;
  return (
    attrs.defaultFontFamily != null ||
    attrs.defaultFontSize != null ||
    attrs.defaultLineHeight != null ||
    attrs.docGridLinePitch != null ||
    attrs.referenceStyles != null
  );
}

export function documentDefaultParagraphSpacing(
  attrs: Record<string, unknown> | null | undefined,
): { before: number | null; after: number | null } {
  const before = normalizeSpacing(attrs?.defaultParagraphSpaceBefore);
  const after = normalizeSpacing(attrs?.defaultParagraphSpaceAfter);
  if (!isWordSourcedDocument(attrs)) return { before, after };
  return { before: before ?? 0, after: after ?? 0 };
}

export function normalizeDefaultLineHeight(value: unknown): string | null {
  if (typeof value === "string" && value.trim().toLowerCase() === "normal") {
    return "normal";
  }
  return normalizeLineHeight(value);
}

export type DocumentDefaultTextAlign =
  | "left"
  | "center"
  | "right"
  | "justify";

export function normalizeDocumentDefaultTextAlign(
  value: unknown,
): DocumentDefaultTextAlign | null {
  return value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "justify"
    ? value
    : null;
}

export type DocumentCharacterSpacingControl =
  | "doNotCompress"
  | "compressPunctuation"
  | "compressPunctuationAndJapaneseKana";

export function normalizeDocumentCharacterSpacingControl(
  value: unknown,
): DocumentCharacterSpacingControl | null {
  return value === "doNotCompress" ||
    value === "compressPunctuation" ||
    value === "compressPunctuationAndJapaneseKana"
    ? value
    : null;
}

const DOCUMENT_LANGUAGE_TAG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,5}$/u;

export function normalizeDocumentEastAsianLanguage(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 64 &&
    DOCUMENT_LANGUAGE_TAG_RE.test(value)
    ? value
    : null;
}

export function normalizeDoNotUseEastAsianBreakRules(
  value: unknown,
): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Resolve Word's grid-compression compatibility switch for rendering only.
 * The persisted raw attrs remain independent and unchanged for round-trip.
 * Exact section layouts are authoritative; malformed present authority fails
 * closed, while legacy manuscript-grid fields are consulted only when the
 * section model is absent.
 */
export function effectiveDocumentCharacterSpacingControl(
  value: unknown,
): DocumentCharacterSpacingControl | null {
  const attrs =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const spacing = normalizeDocumentCharacterSpacingControl(
    attrs.characterSpacingControl,
  );
  if (
    (spacing !== "compressPunctuation" &&
      spacing !== "compressPunctuationAndJapaneseKana") ||
    normalizeDoNotUseEastAsianBreakRules(attrs.doNotUseEastAsianBreakRules) !==
      true
  ) {
    return spacing;
  }

  const hasSectionAuthority =
    Object.prototype.hasOwnProperty.call(attrs, "sectionLayouts") &&
    attrs.sectionLayouts !== null &&
    attrs.sectionLayouts !== undefined;
  if (hasSectionAuthority) {
    const layouts = normalizeSectionLayouts(attrs.sectionLayouts);
    if (layouts === null) return "doNotCompress";
    return layouts.some(
      (layout) =>
        layout.docGrid?.type === "linesAndChars" ||
        layout.docGrid?.type === "snapToChars",
    )
      ? "doNotCompress"
      : spacing;
  }

  const legacyGrid = normalizeManuscriptGrid(attrs.manuscriptGrid);
  return legacyGrid === "grid"
    ? "doNotCompress"
    : spacing;
}

/** "space" is an inter-word space Word shrinks (`WordSpaceCompression`). */
export type WordCjkPunctuationRole = "open" | "close" | "center" | "space";

export interface WordCjkMeasuredGlyph {
  character: string;
  from: number;
  to: number;
  widthPx: number;
  fontSizePx: number;
  /** The run's own East Asian language, when the page states one. */
  language?: string | null;
}

export interface WordCjkPunctuationAdjustment {
  index: number;
  from: number;
  to: number;
  role: WordCjkPunctuationRole;
  trimPx: number;
}

export interface WordCjkPunctuationLinePlan {
  startIndex: number;
  endIndex: number;
  trimPx: number;
  finalLine: boolean;
  adjustments: WordCjkPunctuationAdjustment[];
}

export interface WordCjkPunctuationCompressionPlan {
  lines: WordCjkPunctuationLinePlan[];
}

const WORD_CJK_OPEN_PUNCTUATION = new Set(
  Array.from("（［｛｟〈《「『【〔〖〘〚〝"),
);
const WORD_CJK_CLOSE_PUNCTUATION = new Set(
  Array.from("）］｝｠〉》」』】〕〗〙〛〞〟、。，．！？：；"),
);
const WORD_CJK_CENTER_PUNCTUATION = new Set(["・"]);
const WORD_CJK_LINE_TRIM_EM = 0.5;
/** The narrowest a shrunk inter-word space gets, in ems of its run. */
const WORD_SPACE_MIN_EM = 0.25;
const WORD_CJK_TERMINAL_CLOSE_TRIM_EM = 1;
const WORD_CJK_FIT_EPSILON_PX = 0.01;
/** How far past its half width a pull may run and still be the stop's alone
 * (planWordCjkPunctuationCompression): Word took 7.6 px so and 8.6 px on the
 * commas; this side of 8.6 the lines measured here run up to half a pixel
 * wider than Word's. */
const WORD_CJK_HALF_STOP_TOLERANCE_PX = 0.5;
// Canvas advances are stable across wrapped/justified DOM lines, but the text
// engines quantize their final line-fit decision to a slightly different
// subpixel boundary. Reserve one quarter-pixel so the planned last glyph is
// admitted consistently in Chromium and WebKit without spending another CJK
// half-cell or changing the paragraph's authored width.
const WORD_CJK_RENDER_FIT_SAFETY_PX = 0.25;

/** Curly quotation marks set at full width (an East Asian face draws them a
 * whole em: SimSun's “ is 1em) compress as marks do: Word fits
 * "让新闻界成为传播的“扩音" on a line one cell short by halving the “
 * (R01-D13). Set in a Latin face they are a letter's width and stay. */
function wordCjkQuoteRole(
  glyph: WordCjkMeasuredGlyph,
): WordCjkPunctuationRole | null {
  if (glyph.widthPx < glyph.fontSizePx * 0.75) return null;
  if (glyph.character === "\u201c" || glyph.character === "\u2018") return "open";
  if (glyph.character === "\u201d" || glyph.character === "\u2019") return "close";
  return null;
}

function wordCjkPunctuationRole(
  character: string,
): WordCjkPunctuationRole | null {
  if (WORD_CJK_OPEN_PUNCTUATION.has(character)) return "open";
  if (WORD_CJK_CLOSE_PUNCTUATION.has(character)) return "close";
  if (WORD_CJK_CENTER_PUNCTUATION.has(character)) return "center";
  return null;
}

/** Brackets Word sets against each other at half width in any language. */
const WORD_CJK_PAIR_BRACKETS = new Set(
  Array.from("（［｛｟〈《「『【〔〖〘〚〝）］｝｠〉》」』】〕〗〙〛〞〟"),
);
/** Marks Word pairs only under a Japanese or Chinese language. */
const WORD_CJK_PAIR_MARKS = new Set(Array.from("、。，．：；・"));

function wordCjkPairCompressible(
  character: string,
  language: string | null,
): boolean {
  if (WORD_CJK_PAIR_BRACKETS.has(character)) return true;
  const japanese = language !== null && /^ja(?:-|$)/iu.test(language);
  const chinese = language !== null && /^zh(?:-|$)/iu.test(language);
  if (WORD_CJK_PAIR_MARKS.has(character)) return japanese || chinese;
  return character === "！" && chinese;
}

export interface WordCjkFixedTrim {
  role: WordCjkPunctuationRole;
  trimPx: number;
}

/**
 * The half-em Word always takes out between two adjacent punctuation marks
 * when it compresses punctuation, whether or not the line needs the room.
 *
 * Word 16, compressPunctuation (R06-D17 and a ladder of every pair in MS
 * Mincho and SimSun, Japanese, Chinese and en-US runs): of two adjacent
 * marks the first advances a half-em -- 。）、（）「」」：（ ・（ -- and of two
 * opening brackets the second loses its leading half; an opening bracket
 * before a closing one keeps both. Brackets pair in any language; the
 * comma, full stop, colon, semicolon and middle dot only under a Japanese or
 * Chinese language (en-US keeps 、（ at full width); the exclamation mark
 * only under Chinese; the question mark never. It is part of Word's
 * kerning: a run that is not kerned (no w:kern, or a threshold above its
 * size -- R36-D14, sz 21 under kern 22) keeps every pair at full width. A
 * line then compresses its marks to fit (`planWordCjkPunctuationCompression`).
 */
export function wordCjkPairCompression(
  glyphs: ReadonlyArray<
    WordCjkMeasuredGlyph & { language?: string | null; kerning?: boolean }
  >,
  documentLanguage: string | null,
): Map<number, WordCjkFixedTrim> {
  const trims = new Map<number, WordCjkFixedTrim>();
  const languageOf = (glyph: { language?: string | null }) =>
    glyph.language ?? documentLanguage;
  for (let index = 0; index + 1 < glyphs.length; index += 1) {
    const first = glyphs[index];
    const second = glyphs[index + 1];
    if (
      first.kerning !== true ||
      second.kerning !== true ||
      !wordCjkPairCompressible(first.character, languageOf(first)) ||
      !wordCjkPairCompressible(second.character, languageOf(second))
    ) {
      continue;
    }
    const firstRole = wordCjkPunctuationRole(first.character);
    const secondRole = wordCjkPunctuationRole(second.character);
    if (firstRole === "close" || firstRole === "center") {
      if (!trims.has(index)) {
        trims.set(index, {
          role: firstRole,
          trimPx: first.fontSizePx * WORD_CJK_LINE_TRIM_EM,
        });
      }
    } else if (firstRole === "open" && secondRole === "open") {
      trims.set(index + 1, {
        role: "open",
        trimPx: second.fontSizePx * WORD_CJK_LINE_TRIM_EM,
      });
    }
  }
  return trims;
}

function wordCjkLineBreakAllowed(
  glyphs: readonly WordCjkMeasuredGlyph[],
  startIndex: number,
  endIndex: number,
  documentLanguage: string | null = null,
): boolean {
  if (endIndex <= startIndex || endIndex > glyphs.length) return false;
  if (WORD_CJK_OPEN_PUNCTUATION.has(glyphs[endIndex - 1].character)) {
    return false;
  }
  if (endIndex === glyphs.length) return true;
  if (WORD_CJK_CLOSE_PUNCTUATION.has(glyphs[endIndex].character)) return false;
  // The marks the projection keeps on the line of the character before them
  // (DocumentFormatting's no-start pairs), as the page draws them.
  if (
    WORD_ZH_CN_NO_START_EXTRA.has(glyphs[endIndex].character) &&
    WORD_CJK_EAST_ASIAN_RE.test(glyphs[endIndex - 1].character) &&
    wordKinsokuList(glyphs[endIndex].language ?? documentLanguage) === "zh-CN"
  ) {
    return false;
  }
  const leftScript = wordCjkSpacingScript(glyphs[endIndex - 1].character);
  const rightScript = wordCjkSpacingScript(glyphs[endIndex].character);
  const leftWord = leftScript === "latin" || leftScript === "number";
  const rightWord = rightScript === "latin" || rightScript === "number";
  return !(leftWord && rightWord);
}

function distributeWordCjkTrim(
  candidates: ReadonlyArray<
    WordCjkPunctuationAdjustment & { capacityPx: number }
  >,
  totalPx: number,
): WordCjkPunctuationAdjustment[] {
  const allocations = new Map<number, number>();
  const remaining = candidates.map((candidate) => ({
    ...candidate,
    allocatedPx: 0,
  }));
  let unallocated = totalPx;
  while (unallocated > WORD_CJK_FIT_EPSILON_PX && remaining.length > 0) {
    const share = unallocated / remaining.length;
    let spent = 0;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index];
      const available = candidate.capacityPx - candidate.allocatedPx;
      const amount = Math.min(share, available);
      candidate.allocatedPx += amount;
      allocations.set(
        candidate.index,
        (allocations.get(candidate.index) ?? 0) + amount,
      );
      spent += amount;
      if (candidate.capacityPx - candidate.allocatedPx <= 0.001) {
        remaining.splice(index, 1);
      }
    }
    if (spent <= 0.001) break;
    unallocated -= spent;
  }
  return candidates
    .map((candidate) => ({
      index: candidate.index,
      from: candidate.from,
      to: candidate.to,
      role: candidate.role,
      trimPx: allocations.get(candidate.index) ?? 0,
    }))
    .filter((candidate) => candidate.trimPx > 0.001);
}

/**
 * Word's inter-word space compression: with punctuation compression on, in
 * compatibility mode 14 and earlier (or none), the one word that crosses the
 * right margin stays on the line when the line's spaces can shrink to take
 * it, each to no less than a quarter em of its run; the spaces shrink evenly
 * and the line then ends. Mode 15 never does this (Word 16.86, measured on
 * SimSun/Arial/Times/Calibri probes and R13-D13's notes: "W. G. Lambert,
 * 'The" ends a 415.6pt line whose ten spaces are set at 0.257em).
 *
 * `excludeEastAsianNeighbours` is "Balance SBCS characters and DBCS
 * characters": a space beside an East Asian character keeps its width ("和
 * W." in the same line), and a font whose space is a quarter em or less
 * (Times New Roman, Calibri) never shrinks. Without it Word also shrinks the
 * spaces of narrower faces by a smaller, not yet measured, amount; those are
 * left at their width (the line wraps where it did before).
 */
export interface WordSpaceCompression {
  excludeEastAsianNeighbours: boolean;
}

/** Whether a document's lines take Word's inter-word space compression. */
export function wordSpaceCompressionFor(
  attrs: Record<string, unknown>,
  compressionEnabled: boolean,
): WordSpaceCompression | null {
  if (!compressionEnabled) return null;
  const mode = normalizeWordCompatibilityMode(attrs.wordCompatibilityMode);
  if (mode !== null && mode >= 15) return null;
  return { excludeEastAsianNeighbours: attrs.wordBalanceSbcsDbcs === true };
}

/**
 * Plan Word's discretionary CJK punctuation compression from measured glyph
 * advances. The rules are the ones Word applies in its own PDFs (SimSun 10.5pt
 * on a 415.2pt measure, 1191 all-ideograph lines across five documents):
 *
 * - A line takes ordinary characters while the overflow can be paid by
 *   compressing its punctuation, but only up to one half-em in total (forty
 *   cells on a 39.54-cell measure are admitted; forty-one never are, even
 *   with thirteen marks on the line).
 * - Once the break falls on a forbidden position (a close mark cannot start a
 *   line, an open mark cannot end one), the forbidden characters are pulled
 *   in, and that pull may compress every mark on the line by up to a half-em
 *   each; "见《地区隐私说明》。" ends a forty-two cell line with its six
 *   marks at 0.41em apiece.
 * - A pulled close mark that still does not fit hangs: compressed to its half
 *   width in place, or wholly past the margin, whichever is the smaller step
 *   that lets the in-line marks stay within their half-em.
 */
export function planWordCjkPunctuationCompression(
  glyphs: readonly WordCjkMeasuredGlyph[],
  widths: { firstLineWidthPx: number; lineWidthPx: number },
  /** Trims Word takes whatever the line needs (`wordCjkPairCompression`). */
  fixedTrims: ReadonlyMap<number, WordCjkFixedTrim> = new Map(),
  spaceCompression: WordSpaceCompression | null = null,
  /** The document's East Asian language (Word's line breaking list). */
  documentLanguage: string | null = null,
): WordCjkPunctuationCompressionPlan {
  if (
    glyphs.length === 0 ||
    !Number.isFinite(widths.firstLineWidthPx) ||
    !Number.isFinite(widths.lineWidthPx) ||
    widths.firstLineWidthPx <= 0 ||
    widths.lineWidthPx <= 0
  ) {
    return { lines: [] };
  }

  const fixedTrimPx = (index: number) => fixedTrims.get(index)?.trimPx ?? 0;
  /** What a mark can give a line: a half-em, a paired mark's included. Word
   * spreads a line's fit over its marks evenly whether or not they are
   * already half width: R06-D17 sets "。（" at 3.52pt and the lone "、" at
   * 8.78pt to admit "ニ" (10.5pt, 1.73pt from each). */
  const markCapacityAt = (index: number): number =>
    wordCjkPunctuationRole(glyphs[index].character) ?? wordCjkQuoteRole(glyphs[index])
      ? glyphs[index].fontSizePx * WORD_CJK_LINE_TRIM_EM
      : 0;
  const spaceCapacityAt = (index: number): number => {
    const glyph = glyphs[index];
    if (!spaceCompression || glyph.character !== " ") return 0;
    if (
      spaceCompression.excludeEastAsianNeighbours &&
      [glyphs[index - 1], glyphs[index + 1]].some(
        (neighbour) =>
          neighbour !== undefined &&
          WORD_CJK_EAST_ASIAN_RE.test(neighbour.character),
      )
    ) {
      return 0;
    }
    return Math.max(0, glyph.widthPx - glyph.fontSizePx * WORD_SPACE_MIN_EM);
  };
  const widthPrefix = [0];
  const punctuationCapacityPrefix = [0];
  const spaceCapacityPrefix = [0];
  glyphs.forEach((glyph, index) => {
    spaceCapacityPrefix.push(
      spaceCapacityPrefix[spaceCapacityPrefix.length - 1] +
        spaceCapacityAt(index),
    );
    widthPrefix.push(
      widthPrefix[widthPrefix.length - 1] +
        Math.max(0, glyph.widthPx - fixedTrimPx(index)),
    );
    punctuationCapacityPrefix.push(
      punctuationCapacityPrefix[punctuationCapacityPrefix.length - 1] +
        markCapacityAt(index),
    );
  });

  // White space at a line end hangs past the margin, in Word and in the
  // engines' pre-wrap layout alike: a paragraph that ends "。 " wraps on
  // the width of the mark, not of the space after it.
  const contentEndOf = (startIndex: number, endIndex: number): number => {
    let contentEnd = endIndex;
    while (
      contentEnd > startIndex + 1 &&
      /\s/u.test(glyphs[contentEnd - 1].character)
    ) {
      contentEnd -= 1;
    }
    return contentEnd;
  };
  const naturalTrimPx = (
    startIndex: number,
    endIndex: number,
    lineWidthPx: number,
  ): number =>
    Math.max(
      0,
      widthPrefix[contentEndOf(startIndex, endIndex)] -
        widthPrefix[startIndex] -
        lineWidthPx,
    );
  const markCapacityPx = (startIndex: number, contentEnd: number): number =>
    punctuationCapacityPrefix[contentEnd] -
    punctuationCapacityPrefix[startIndex];
  const lineFontSizePx = (startIndex: number, endIndex: number): number => {
    let size = 1;
    for (let index = startIndex; index < endIndex; index += 1) {
      size = Math.max(size, glyphs[index].fontSizePx);
    }
    return size;
  };
  /** The ordinary budget: one half-em per line, and never more than the marks hold. */
  const allowancePx = (startIndex: number, endIndex: number): number => {
    const contentEnd = contentEndOf(startIndex, endIndex);
    return Math.min(
      lineFontSizePx(startIndex, contentEnd) * WORD_CJK_LINE_TRIM_EM,
      markCapacityPx(startIndex, contentEnd),
    );
  };
  /** The pull budget: a half-em per mark, and a whole em for a hanging close mark. */
  const pullCapacityPx = (startIndex: number, endIndex: number): number => {
    const contentEnd = contentEndOf(startIndex, endIndex);
    const terminal = glyphs[contentEnd - 1];
    return (
      markCapacityPx(startIndex, contentEnd) +
      (wordCjkPunctuationRole(terminal.character) === "close"
        ? terminal.fontSizePx *
          (WORD_CJK_TERMINAL_CLOSE_TRIM_EM - WORD_CJK_LINE_TRIM_EM)
        : 0)
    );
  };
  const pulledByKinsoku = (previousEnd: number, endIndex: number): boolean => {
    if (endIndex - previousEnd < 2) return false;
    for (let index = previousEnd + 1; index < endIndex; index += 1) {
      if (
        !WORD_CJK_CLOSE_PUNCTUATION.has(glyphs[index].character) &&
        !WORD_CJK_OPEN_PUNCTUATION.has(glyphs[index - 1].character)
      ) {
        return false;
      }
    }
    return true;
  };

  interface Admission {
    endIndex: number;
    requiredTrimPx: number;
    /** What the line is over its width before any mark gives room. */
    overflowPx?: number;
    /** The crossing word, which ends here, was taken by shrinking the
     * line's spaces. */
    spacesWordEnd?: number;
  }
  const admit = (
    startIndex: number,
    previous: Admission | null,
    endIndex: number,
    lineWidthPx: number,
  ): Admission | null => {
    const previousEnd = previous?.endIndex ?? startIndex;
    if (previous && contentEndOf(startIndex, endIndex) <= previousEnd) {
      // Only white space was added: it hangs, and the line stands as admitted.
      return { ...previous, endIndex };
    }
    // A line whose spaces took the crossing word ends with it.
    if (previous?.spacesWordEnd !== undefined) {
      return endIndex <= previous.spacesWordEnd ? { ...previous, endIndex } : null;
    }
    const trimPx = naturalTrimPx(startIndex, endIndex, lineWidthPx);
    if (
      spaceCompression &&
      trimPx > 0 &&
      previousEnd > startIndex &&
      // East Asian text crossing the margin takes the punctuation rules.
      !WORD_CJK_EAST_ASIAN_RE.test(glyphs[endIndex - 1].character) &&
      naturalTrimPx(startIndex, previousEnd, lineWidthPx) <= 0
    ) {
      // The word runs to the next space or East Asian character, whatever
      // break the coarse rule above allows inside it ("'The").
      let wordEnd = endIndex;
      while (
        wordEnd < glyphs.length &&
        !/\s/u.test(glyphs[wordEnd].character) &&
        !WORD_CJK_EAST_ASIAN_RE.test(glyphs[wordEnd].character) &&
        !WORD_CJK_EAST_ASIAN_RE.test(glyphs[wordEnd - 1].character)
      ) {
        wordEnd += 1;
      }
      const wordTrimPx = naturalTrimPx(startIndex, wordEnd, lineWidthPx);
      const spaceCapacityPx =
        spaceCapacityPrefix[contentEndOf(startIndex, wordEnd)] -
        spaceCapacityPrefix[startIndex];
      if (wordTrimPx <= spaceCapacityPx + WORD_CJK_RENDER_FIT_SAFETY_PX) {
        return {
          endIndex,
          requiredTrimPx: Math.min(
            spaceCapacityPx,
            wordTrimPx + WORD_CJK_RENDER_FIT_SAFETY_PX,
          ),
          spacesWordEnd: wordEnd,
        };
      }
    }
    let capacityPx: number;
    if (pulledByKinsoku(previousEnd, endIndex)) {
      // The head of the group is admitted like any character; the rest is
      // pulled in because the line may not end between them.
      const headTrimPx = naturalTrimPx(startIndex, previousEnd + 1, lineWidthPx);
      if (
        headTrimPx >
        allowancePx(startIndex, previousEnd + 1) + WORD_CJK_RENDER_FIT_SAFETY_PX
      ) {
        return null;
      }
      capacityPx = pullCapacityPx(startIndex, endIndex);
    } else {
      capacityPx = allowancePx(startIndex, endIndex);
    }
    if (trimPx > capacityPx + WORD_CJK_RENDER_FIT_SAFETY_PX) return null;
    return {
      endIndex,
      overflowPx: trimPx,
      requiredTrimPx:
        trimPx > 0
          ? Math.min(capacityPx, trimPx + WORD_CJK_RENDER_FIT_SAFETY_PX)
          : 0,
    };
  };

  const linePlan = (
    startIndex: number,
    admission: Admission,
  ): WordCjkPunctuationLinePlan => {
    const { endIndex, requiredTrimPx } = admission;
    const contentEnd = contentEndOf(startIndex, endIndex);
    if (admission.spacesWordEnd !== undefined) {
      const spaces: Array<WordCjkPunctuationAdjustment & { capacityPx: number }> = [];
      for (let index = startIndex; index < contentEnd; index += 1) {
        const capacityPx = spaceCapacityAt(index);
        if (capacityPx <= 0.001) continue;
        spaces.push({
          index,
          from: glyphs[index].from,
          to: glyphs[index].to,
          role: "space",
          trimPx: 0,
          capacityPx,
        });
      }
      const adjustments = distributeWordCjkTrim(spaces, requiredTrimPx);
      // The space after the crossing word hangs past the margin in Word; the
      // editor's break-spaces would charge it to the line and move the word
      // down after all, so its advance goes too (not at the paragraph's end,
      // where the projection hangs white space itself).
      const paragraphEnds = glyphs
        .slice(contentEnd)
        .every((glyph) => /\s/u.test(glyph.character));
      for (let index = contentEnd; !paragraphEnds && index < endIndex; index += 1) {
        if (glyphs[index].character !== " ") continue;
        adjustments.push({
          index,
          from: glyphs[index].from,
          to: glyphs[index].to,
          role: "space",
          trimPx: glyphs[index].widthPx,
        });
      }
      for (let index = startIndex; index < contentEnd; index += 1) {
        const fixed = fixedTrims.get(index);
        if (fixed) {
          adjustments.push({
            index,
            from: glyphs[index].from,
            to: glyphs[index].to,
            role: fixed.role,
            trimPx: fixed.trimPx,
          });
        }
      }
      adjustments.sort((left, right) => left.index - right.index);
      return {
        startIndex,
        endIndex,
        trimPx: adjustments.reduce((sum, adjustment) => sum + adjustment.trimPx, 0),
        finalLine: endIndex === glyphs.length,
        adjustments,
      };
    }
    const terminal = glyphs[contentEnd - 1];
    const terminalHangs =
      wordCjkPunctuationRole(terminal.character) === "close";
    const inline: Array<WordCjkPunctuationAdjustment & { capacityPx: number }> =
      [];
    for (let index = startIndex; index < contentEnd; index += 1) {
      const glyph = glyphs[index];
      const role = wordCjkPunctuationRole(glyph.character) ?? wordCjkQuoteRole(glyph);
      if (!role || (terminalHangs && index === contentEnd - 1)) continue;
      const capacityPx = markCapacityAt(index);
      if (capacityPx <= 0.001) continue;
      inline.push({
        index,
        from: glyph.from,
        to: glyph.to,
        role,
        trimPx: 0,
        capacityPx,
      });
    }
    const inlineCapacityPx = inline.reduce(
      (sum, candidate) => sum + candidate.capacityPx,
      0,
    );
    // Word compresses the line's in-line marks evenly; a close mark ending
    // the line steps to its half width, then wholly past the margin, only
    // when the in-line marks cannot pay the rest within their half-em each.
    // A pull its half width alone pays is paid by it, the in-line marks left
    // whole: Word for Mac 16.9, Songti SC 12 pt justified, compressPunctuation,
    // a line "…群，…时，G = Z(G)。" pulling its stop, the overflow stepped by
    // 4.3 px (the book's own paragraph, a run of "i" before it): up to the half-em the
    // stop stands half past the margin with both commas at 16 px; past it the
    // commas take it all (8.6, 12.8, 16 px), then half the stop and the commas
    // the rest (21.4, 24), then the whole stop and the commas the rest (30.2,
    // 32). Compressing the commas instead broke the book's page 62 two ways
    // (7.86 px of commas against the stop's 8, read one opening each way).
    let terminalTrimPx = 0;
    const terminalFixedPx = fixedTrimPx(contentEnd - 1);
    const halfStepPx = Math.max(0, WORD_CJK_LINE_TRIM_EM * terminal.fontSizePx - terminalFixedPx);
    // Compared without the render safety, and with half a pixel of the
    // line's own measure: a formula drawn here 0.5 px wider than in Word put
    // page 62's 7.6 px pull at 8.1 and back onto the commas.
    if (
      terminalHangs && requiredTrimPx > 0 && halfStepPx > 0 &&
      requiredTrimPx - WORD_CJK_RENDER_FIT_SAFETY_PX <= halfStepPx + WORD_CJK_HALF_STOP_TOLERANCE_PX
    ) {
      terminalTrimPx = halfStepPx;
    } else if (terminalHangs && requiredTrimPx > inlineCapacityPx + WORD_CJK_FIT_EPSILON_PX) {
      // The steps count from the mark's full width; what it always gives is
      // already out of the line's width.
      const steps = [WORD_CJK_LINE_TRIM_EM, WORD_CJK_TERMINAL_CLOSE_TRIM_EM];
      const extra = (step: number) =>
        Math.max(0, step * terminal.fontSizePx - terminalFixedPx);
      terminalTrimPx = extra(steps[steps.length - 1]);
      for (const step of steps) {
        if (requiredTrimPx - extra(step) <= inlineCapacityPx + WORD_CJK_FIT_EPSILON_PX) {
          terminalTrimPx = extra(step);
          break;
        }
      }
    }
    const adjustments = distributeWordCjkTrim(
      inline,
      Math.max(0, requiredTrimPx - terminalTrimPx),
    );
    // A line admitted within the render safety of its marks' half-em (Word
    // takes it) is drawn as admitted: the marks give what it is over and the
    // safety, a hair past their half-em. Held to the half-em, the page drew
    // it up to a quarter pixel too wide, the browser and the engine broke it
    // a character early, and every later line of the paragraph stood a
    // character off the plan, its marks trimmed on the wrong lines; cut
    // across a page, the head's last line lost its trim and the page split
    
    // four marks held at 7 px in all).
    const overflowPx = admission.overflowPx ?? 0;
    const shortPx =
      overflowPx + WORD_CJK_RENDER_FIT_SAFETY_PX -
      adjustments.reduce((sum, adjustment) => sum + adjustment.trimPx, 0) -
      terminalTrimPx;
    if (overflowPx > 0 && shortPx > WORD_CJK_FIT_EPSILON_PX && shortPx <= 2 * WORD_CJK_RENDER_FIT_SAFETY_PX + WORD_CJK_FIT_EPSILON_PX) {
      if (adjustments.length) {
        for (const adjustment of adjustments) adjustment.trimPx += shortPx / adjustments.length;
      } else if (terminalTrimPx > 0) {
        terminalTrimPx += shortPx;
      }
    }
    if (terminalTrimPx > 0) {
      adjustments.push({
        index: contentEnd - 1,
        from: terminal.from,
        to: terminal.to,
        role: "close",
        trimPx: terminalTrimPx,
      });
    }
    for (let index = startIndex; index < contentEnd; index += 1) {
      const fixed = fixedTrims.get(index);
      if (!fixed) continue;
      const existing = adjustments.find((adjustment) => adjustment.index === index);
      if (existing) existing.trimPx += fixed.trimPx;
      else {
        adjustments.push({
          index,
          from: glyphs[index].from,
          to: glyphs[index].to,
          role: fixed.role,
          trimPx: fixed.trimPx,
        });
      }
    }
    adjustments.sort((left, right) => left.index - right.index);
    return {
      startIndex,
      endIndex,
      trimPx: adjustments.reduce(
        (sum, adjustment) => sum + adjustment.trimPx,
        0,
      ),
      finalLine: endIndex === glyphs.length,
      adjustments,
    };
  };

  const lines: WordCjkPunctuationLinePlan[] = [];
  let startIndex = 0;
  while (startIndex < glyphs.length) {
    const lineWidthPx =
      lines.length === 0 ? widths.firstLineWidthPx : widths.lineWidthPx;
    let accepted: Admission | null = null;
    for (
      let endIndex = startIndex + 1;
      endIndex <= glyphs.length;
      endIndex += 1
    ) {
      if (!wordCjkLineBreakAllowed(glyphs, startIndex, endIndex, documentLanguage)) continue;
      const admission = admit(startIndex, accepted, endIndex, lineWidthPx);
      if (!admission) break;
      accepted = admission;
    }
    const line = accepted
      ? linePlan(startIndex, accepted)
      : {
          startIndex,
          endIndex: startIndex + 1,
          trimPx: 0,
          finalLine: startIndex + 1 === glyphs.length,
          adjustments: [],
        };
    lines.push(line);
    startIndex = line.endIndex;
  }
  return { lines };
}

interface WordCjkSpacingProjectionState {
  decorations: DecorationSet;
  signature: string;
}

interface WordCjkSpacingProjectionMeta {
  decorations: DecorationSet;
  signature: string;
}

/** Stands for an inline object among a paragraph's glyphs (U+FFFC, what it is). */
const WORD_CJK_OBJECT_CHARACTER = "\ufffc";

interface WordCjkDomGlyph extends WordCjkMeasuredGlyph {
  /** An inline object: a width in the line, nothing to space. */
  object?: true;
  autoSpaceBeforePx: number;
  autoSpaceAfterPx: number;
  baseLetterSpacingPx: number;
  fontAdvanceCorrectionPx: number;
  /** The computed face the glyph is painted with. */
  font: string;
  /** Set from the batched face probes before the terminal rules read lines. */
  baselineOffsetPx: number;
  /** The run's own East Asian language, when the page states one. */
  language: string | null;
  /** Word kerns the run (its w:kern threshold is at or below its size). */
  kerning: boolean;
}

export interface WordCjkDomTextStyle {
  font: string;
  fontSizePx: number;
  letterSpacingPx: number;
  wordSpacingPx: number;
  direction: CanvasDirection;
  eastAsianCellMetrics: boolean;
  /** Whether the glyph itself is drawn in a SimSun cell face: a curly quote,
   * dash or ellipsis takes the font of its own slot (MS-OI29500 rFonts), the
   * East Asian one only under w:hint="eastAsia". Without the hint Word draws
   * it in the run's Latin font at that font's width (Word 16.86, corpus
   * R74-D15's EA6e: "“" 4.4 pt in Calibri beside SimSun text). */
  drawnInEastAsianCells: boolean;
  





  asciiInEastAsianCells: boolean;
  /** What the engine's own emboldening adds to each glyph of a run that
   * documentSyntheticBoldWordAdvance sets at Word's bold advance: its
   * letter-spacing already takes it back, so it is not the face's advance. */
  syntheticBoldEnginePx: number;
  cacheKey: string;
}

interface WordCjkMeasuredAdvance {
  widthPx: number;
  fontAdvanceCorrectionPx: number;
}

const wordCjkSpacingProjectionKey =
  new PluginKey<WordCjkSpacingProjectionState>("wordCjkSpacingProjection");

/** Whether `transaction` is this projection publishing its decorations
 * (and nothing else: it is dispatched on its own). */
export function isWordCjkSpacingProjectionTransaction(transaction: { getMeta(key: PluginKey | string): unknown }): boolean {
  return transaction.getMeta(wordCjkSpacingProjectionKey) !== undefined;
}
/** Word's automatic space between East Asian text and Latin letters or
 * digits (w:autoSpaceDE / w:autoSpaceDN): a quarter em. Word 16, MS Mincho
 * and SimSun at 10.5-12pt beside Times New Roman and Century: 字→A and
 * 字→1 open 0.243-0.25em, z→漢 and 5→漢 0.246-0.25em (R06-D17's "Web" ends
 * 2.62pt before 上 at 10.5pt). An eighth gave every such boundary half
 * Word's space and let lines take a character Word wraps. */
const WORD_CJK_AUTO_SPACE_EM = 0.25;
const CSS_PX_PER_PT = PX_PER_PT;
/**
 * The automatic space Windows Word opens after the character before the
 * boundary is that character's: its size times half its face's average
 * advance (OS/2 xAvgCharWidth). After an ideograph in SimSun or MS Mincho
 * (average half an em) a quarter em; after a Latin letter or digit, half
 * its own face's average: Times New Roman 0.20 em, Arial and Georgia 0.22,
 * Verdana 0.25, Calibri 0.26, Segoe UI 0.27, Courier New 0.30, Cambria 0.31
 * (docx-look/probes/cjk6, Windows Word 16, 10.5 and 21 pt; "H"42 before
 * 中21 opens 4.2 pt, "H"21 before 中42 2.16, 中 then "H" 0.25 em of 中's
 * size either way). A face the table does not hold keeps the quarter em.
 * `window.__docsLatinAutoSpaceWidthOff = true` asks the older reading (a
 * quarter of the smaller size, either way), for an A/B of one build.
 */
function wordCjkAutoSpaceWidthOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsLatinAutoSpaceWidthOff?: boolean }).__docsLatinAutoSpaceWidthOff === true;
}
const latinAutoSpaceEms = new Map<string, number>();
export function wordAutoSpaceAfterLatinEm(font: string): number {
  let em = latinAutoSpaceEms.get(font);
  if (em !== undefined) return em;
  em = WORD_CJK_AUTO_SPACE_EM;
  // The families of a canvas font shorthand stand after its size.
  const families = /\d(?:\.\d+)?px(?:\s*\/\s*\S+)?\s+(.+)$/u.exec(font)?.[1] ?? "";
  for (const token of families.split(",")) {
    const family = token.trim().replace(/^["']|["']$/gu, "");
    // A letter set in an East Asian face (SimSun's average is half an em)
    // keeps the quarter em; the faces after it are not its own.
    if (wordFontIsEastAsian(family)) break;
    const average = (officeLatinAverages.faces as Record<string, number | undefined>)[family.toLowerCase()];
    if (average) { em = average / 2; break; }
  }
  if (latinAutoSpaceEms.size >= 500) latinAutoSpaceEms.clear();
  latinAutoSpaceEms.set(font, em);
  return em;
}
/**
 * Under "Balance SBCS characters and DBCS characters"
 * (w:compat/w:balanceSingleByteDoubleByteWidth, WPS writes it) Windows Word
 * opens a quarter em of the letter's size after a Latin letter or digit too,
 * whatever its face: Times New Roman, Arial and Calibri at 9, 20 and 30 pt
 * all 0.25 em, where the same package without the option opens 0.195, 0.217
 * and 0.254 em (docx-look/probes/cjk16 a/b/c, R347-D02's settings; its header
 * cell's "4的" 2.34 pt at 9 pt, the face's 1.8 pt wrapped 打 a line early).
 * `window.__docsBalancedAutoSpaceOff = true` asks the older reading (the
 * face's half average), for an A/B of one build.
 */
function wordBalancedAutoSpaceOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsBalancedAutoSpaceOff?: boolean }).__docsBalancedAutoSpaceOff === true;
}
/** The automatic space after the character before a boundary, in ems of its
 * size: a quarter after an East Asian character or in a balanced document,
 * else half the Latin face's average advance. */
export function wordAutoSpaceAfterEm(
  leftIsEastAsian: boolean,
  font: string,
  documentAttrs: { readonly [key: string]: unknown },
): number {
  if (leftIsEastAsian || (documentAttrs.wordBalanceSbcsDbcs === true && !wordBalancedAutoSpaceOff())) return WORD_CJK_AUTO_SPACE_EM;
  return wordAutoSpaceAfterLatinEm(font);
}
/** The characters of one paragraph this reads. */
const MAX_WORD_CJK_SPACING_GLYPHS = 50_000;
/** The spacing marks of a document: what its passes carry and the editor draws.
 * It counts marks, not characters: counting characters gave up every paragraph's
 * spacing as a long Chinese document came past 50,000 of them, its text set again
 * wider and narrower as the reader went on (a 272-page book holds 5,000 marks). */
const MAX_WORD_CJK_SPACING_MARKS = 400_000;
const WORD_CJK_EAST_ASIAN_RE =
  /[\u1100-\u11ff\u2e80-\u2fff\u3000-\u30ff\u3130-\u318f\u31a0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u;
/** A character Word sets in a run's Latin face (not East Asian, not space). */
const WORD_GRID_NON_EAST_ASIAN_RE = new RegExp(
  `[^\\s${WORD_CJK_EAST_ASIAN_RE.source.slice(1, -1)}]`,
  "u",
);

/**
 * Whether the document draws East Asian text: found at the first text that
 * has some. It was a regular expression over `doc.textContent`, the whole
 * document joined into one string on every transaction (twice per typed key
 * in a long document).
 */

/** Whether a block of the document carries a source numbering layout. A
 * document without one was walked whole on every keystroke to find out. */
const HOLDS_NUMBERING_LAYOUT = new SheetFact((block) => Boolean(block.attrs.source?.numberingLayout));
const HOLDS_EAST_ASIAN_TEXT = new SheetFact((node) => {
  const text = node.isText
    ? node.text
    : node.isLeaf && node.type.spec.leafText
      ? node.type.spec.leafText(node)
      : null;
  return Boolean(text && WORD_CJK_EAST_ASIAN_RE.test(text));
});

function documentHasNumberingLayout(doc: ProseMirrorNode): boolean {
  return HOLDS_NUMBERING_LAYOUT.inDoc(doc);
}

function documentHasEastAsianText(doc: ProseMirrorNode): boolean {
  return HOLDS_EAST_ASIAN_TEXT.inDoc(doc);
}

const WORD_CJK_AUTO_SPACE_EAST_ASIAN_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
const WORD_CJK_LATIN_RE = /\p{Script=Latin}/u;
const WORD_CJK_NUMBER_RE = /\p{Number}/u;
const WORD_EAST_ASIAN_HALF_WIDTH_ASCII_RE = /^[\u0020-\u007e]$/u;
const WORD_EAST_ASIAN_FULL_WIDTH_PUNCTUATION = new Set(Array.from("‘’“”—…"));
const WORD_EAST_ASIAN_HALF_WIDTH_FONT_FAMILIES = new Set(["simsun", "宋体"]);
const WORD_CJK_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6";
export const WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR =
  DOCUMENT_WORD_CJK_SPACING_PENDING;
export const WORD_GRID_RUN_LINE_HEIGHT_PROPERTY =
  "--docs-word-grid-run-line-height";

type WordCjkSpacingScript = "eastAsian" | "latin" | "number" | "other";

function wordCjkSpacingScript(character: string): WordCjkSpacingScript {
  if (WORD_CJK_EAST_ASIAN_RE.test(character)) return "eastAsian";
  if (WORD_CJK_LATIN_RE.test(character)) return "latin";
  if (WORD_CJK_NUMBER_RE.test(character)) return "number";
  return "other";
}

/** Fullwidth letters and digits and halfwidth katakana (Ｆ, ２, ｶ): East
 * Asian characters to Word, whatever script Unicode files the letter or digit
 * under. Fullwidth punctuation (（, ）, ：, ；) is punctuation, not East Asian
 * text: no automatic space opens beside it (R13-D13: "尼十二27）" had a quarter
 * em between 27 and its closing bracket). */
const WORD_CJK_WIDTH_FORMS_RE = /[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a\uff66-\uff9d]/u;

function wordCjkAutoSpacingScript(character: string): WordCjkSpacingScript {
  // Word adds no automatic space between 現行の and ＦＦＪ (R06-D17): a
  // fullwidth letter is set as an East Asian character, not as Latin text.
  if (
    WORD_CJK_AUTO_SPACE_EAST_ASIAN_RE.test(character) ||
    WORD_CJK_WIDTH_FORMS_RE.test(character)
  ) {
    return "eastAsian";
  }
  if (WORD_CJK_LATIN_RE.test(character)) return "latin";
  if (WORD_CJK_NUMBER_RE.test(character)) return "number";
  return "other";
}

function wordCjkSpacingNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wordCjkCanvasFont(style: CSSStyleDeclaration): string {
  if (style.font.trim()) return style.font;
  return [
    style.fontStyle && style.fontStyle !== "normal" ? style.fontStyle : "",
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ]
    .filter(Boolean)
    .join(" ");
}

function wordCjkPrimaryFontFamily(value: string): string {
  return value
    .split(",", 1)[0]
    .trim()
    .replace(/^["']|["']$/gu, "")
    .toLowerCase();
}

export function wordCjkDomTextStyle(parent: HTMLElement): WordCjkDomTextStyle {
  const style = getComputedStyle(parent);
  const fontSizePx = Math.max(1, wordCjkSpacingNumber(style.fontSize));
  const font = wordCjkCanvasFont(style);
  const charSpacingElement = parent.closest<HTMLElement>("[data-char-spacing]");
  const charSpacingPt = charSpacingElement
    ? Number(charSpacingElement.dataset.charSpacing)
    : Number.NaN;
  const projectedElement = parent.closest<HTMLElement>(
    "[data-docs-word-cjk-spacing]",
  );
  const projectedBaseLetterSpacing = projectedElement
    ? Number(projectedElement.dataset.docsWordCjkBaseLetterSpacing)
    : Number.NaN;
  const engineAdvance = style.getPropertyValue("--document-synthetic-bold-engine-advance").trim();
  const syntheticBoldEnginePx = engineAdvance ? wordCjkSpacingNumber(engineAdvance) : 0;
  // A synthetic-bold run's letter-spacing is its character spacing plus
  // Word's bold advance, net of the engine's.
  // A section's character grid adds to the run's own spacing.
  const gridSpace = style.getPropertyValue("--doc-grid-char-space").trim();
  const gridSpacePx = gridSpace ? wordCjkSpacingNumber(gridSpace) * CSS_PX_PER_PT : 0;
  // The text engine's line correction (documentEngineLineBreaks) is spacing
  // of its own, spread over the line the run was drawn on: under it the run's
  // spacing is the one the correction states. Read as the run's, each pass
  // took the correction of the layout before it for the run's own spacing,
  // so a line's punctuation trim, and the engine's break that rests on it,
  // came out one way and then the other on alternate passes: a click that
  // brought a face, a keystroke and its Undo laid the document out anew
  
  const engineCorrected = parent.closest<HTMLElement>(`[${DOCS_ENGINE_LINE_ATTR}]`);
  const engineBaseLetterSpacing = engineCorrected?.getAttribute(DOCS_ENGINE_BASE_SPACING_ATTR);
  const engineBaseWordSpacing = engineCorrected?.getAttribute(DOCS_ENGINE_BASE_WORD_SPACING_ATTR);
  const letterSpacingPx = Number.isFinite(charSpacingPt) && !engineAdvance
    ? charSpacingPt * CSS_PX_PER_PT + gridSpacePx
    : Number.isFinite(projectedBaseLetterSpacing)
      ? projectedBaseLetterSpacing
      : engineBaseLetterSpacing != null
        ? wordCjkSpacingNumber(engineBaseLetterSpacing)
        : style.letterSpacing === "normal"
          ? 0
          : wordCjkSpacingNumber(style.letterSpacing);
  const wordSpacingPx = engineBaseWordSpacing != null
    ? wordCjkSpacingNumber(engineBaseWordSpacing)
    : style.wordSpacing === "normal"
      ? 0
      : wordCjkSpacingNumber(style.wordSpacing);
  const direction: CanvasDirection = style.direction === "rtl" ? "rtl" : "ltr";
  const authoredFontElement = parent.closest<HTMLElement>(
    "[data-cjk-font-family], [data-font-family]",
  );
  const authoredFontFamily =
    authoredFontElement?.dataset.cjkFontFamily ??
    authoredFontElement?.dataset.fontFamily ??
    style.fontFamily;
  const eastAsianCellMetrics = WORD_EAST_ASIAN_HALF_WIDTH_FONT_FAMILIES.has(
    wordCjkPrimaryFontFamily(authoredFontFamily),
  );
  const drawnInEastAsianCells =
    eastAsianCellMetrics &&
    WORD_EAST_ASIAN_HALF_WIDTH_FONT_FAMILIES.has(wordCjkPrimaryFontFamily(style.fontFamily));
  const slotElement = parent.closest<HTMLElement>("[data-office-font-slot]");
  const latinFontElement = parent.closest<HTMLElement>("[data-font-family]");
  const asciiInEastAsianCells =
    eastAsianCellMetrics &&
    (slotElement?.dataset.officeFontSlot === "eastAsia" ||
      WORD_EAST_ASIAN_HALF_WIDTH_FONT_FAMILIES.has(
        wordCjkPrimaryFontFamily(latinFontElement?.dataset.fontFamily ?? style.fontFamily),
      ));
  return {
    font,
    fontSizePx,
    letterSpacingPx,
    wordSpacingPx,
    direction,
    eastAsianCellMetrics,
    drawnInEastAsianCells,
    asciiInEastAsianCells,
    syntheticBoldEnginePx,
    cacheKey: [
      font,
      syntheticBoldEnginePx.toFixed(4),
      letterSpacingPx.toFixed(3),
      wordSpacingPx.toFixed(3),
      direction,
      eastAsianCellMetrics ? "eastAsianCells" : "natural",
      drawnInEastAsianCells ? "drawnCells" : "drawnNatural",
      asciiInEastAsianCells ? "asciiCells" : "asciiNatural",
    ].join("|"),
  };
}

function wordCjkCanvasMeasurementContext(): CanvasRenderingContext2D | null {
  try {
    return document.createElement("canvas").getContext("2d");
  } catch {
    return null;
  }
}

interface WordGridRunLineHeightSpec {
  from: number;
  to: number;
  lineHeightPx: number;
  slots: number;
}

/** A face Word has no record of: the editor's natural-leading guess. */
const WORD_GRID_UNRECORDED_LATIN_LINE = 1.2;

/**
 * Word's single line per em of the faces a grid-snapped run is set in.
 *
 * Under a line grid Word gives a line as many whole pitches as its single
 * line needs, and the single line is a fact of the FONT
 * (lib/document-word-line-metrics): an East Asian face advances 1.3x its box,
 * any other face its box plus line gap. Word 16, 18pt grid (R06-D17 and a
 * size ladder of the same package): ＭＳ 明朝 text takes one slot up to
 * 13.5pt and two from 14pt (14 x 1.3 = 18.2pt); Century takes one up to 14pt
 * and two from 15pt (15 x 1.2021 = 18.03pt). A run of Japanese text in a
 * Latin-first run is set in the run's East Asian face, so the line takes the
 * taller of the two. A face not on record keeps the 1.2 estimate.
 */
function wordGridRunFaces(doc: ProseMirrorNode): {
  ratio: (node: ProseMirrorNode) => number;
  /** The single line of a paragraph mark in `family`. */
  markRatio: (family: unknown) => number;
} {
  const declared = new Set(
    (normalizeEastAsianFontFamilies(doc.attrs.eastAsianFontFamilies) ?? [])
      .filter((family) => !wordFontIsRecordedLatin(family))
      .map((family) => family.toLowerCase()),
  );
  const unquoted = (family: string) =>
    family.trim().replace(/^["']|["']$/gu, "");
  const isEastAsian = (family: string) =>
    declared.has(unquoted(family).toLowerCase()) || wordFontIsEastAsian(family);
  const defaults =
    typeof doc.attrs.defaultFontFamily === "string"
      ? doc.attrs.defaultFontFamily
          .split(",")
          .map(unquoted)
          .filter(Boolean)
      : [];
  const defaultLatin = defaults[0] ?? null;
  const defaultEastAsian = defaults.find(isEastAsian) ?? null;
  // The defaults' eastAsia slot where their first face is an East Asian face
  // of the ascii slot: a run naming no face sets its East Asian text in it.
  const defaultSlot = (documentDefaultEastAsianFontFamily(doc) ?? "")
    .split(",").map(unquoted).filter(Boolean)[0] ?? null;
  const ratios = new Map<string, number>();
  const faceRatio = (family: string | null, eastAsianText: boolean) => {
    if (!family) {
      return eastAsianText
        ? WORD_EAST_ASIAN_SINGLE_LINE_FACTOR
        : WORD_GRID_UNRECORDED_LATIN_LINE;
    }
    const key = family.toLowerCase();
    const known = ratios.get(key);
    if (known !== undefined) return known;
    const eastAsian = isEastAsian(family);
    const metrics = wordDocumentGridFontLineMetrics(family);
    const ratio = metrics
      ? eastAsian
        ? metrics.box * wordDocumentEastAsianSingleLineFactor(family)
        : metrics.box + metrics.lineGap
      : eastAsian
        ? WORD_EAST_ASIAN_SINGLE_LINE_FACTOR
        : WORD_GRID_UNRECORDED_LATIN_LINE;
    ratios.set(key, ratio);
    return ratio;
  };
  const markFamily = (node: ProseMirrorNode, name: string) => {
    const family = node.marks.find((mark) => mark.type.name === name)?.attrs
      .family;
    return typeof family === "string" && unquoted(family)
      ? unquoted(family.split(",", 1)[0])
      : null;
  };
  return {
    markRatio(family) {
      return faceRatio(
        typeof family === "string" && unquoted(family)
          ? unquoted(family.split(",", 1)[0])
          : defaultLatin,
        false,
      );
    },
    ratio(node) {
      const text = node.text ?? "";
      const latin = markFamily(node, "fontFamily") ?? defaultLatin;
      const eastAsianText = WORD_CJK_EAST_ASIAN_RE.test(text);
      const otherText = WORD_GRID_NON_EAST_ASIAN_RE.test(text);
      let ratio = otherText || !eastAsianText ? faceRatio(latin, false) : 0;
      if (eastAsianText) {
        // East Asian characters are drawn from the run's w:eastAsia face
        // whatever its w:ascii/w:hAnsi face is (Word 16.86, measured: 华文新魏
        // with Songti SC as the hAnsi face, with or without w:hint, prints in
        // STXinwei on one 16.3pt slot; Songti SC would take two -- the book's
        // 184 华文新魏 paragraphs, each line two slots here). The Latin face
        // stands in only for a run that names no East Asian face.
        // A run naming only a Latin face inherits the defaults' eastAsia
        // slot (documentFontScriptRanges draws it there), not the first East
        // Asian face of the defaults' stack: under a theme whose Latin face is
        // itself East Asian (themeFontLang en-JP: 等线, then the eastAsia
        // slot's 游明朝) corpus R315-D15's Times New Roman runs of Japanese
        // stood one 17.4 pt pitch a line on DengXian's line where Word sets
        // two on Yu Mincho's. `window.__docsGridEastAsianSlotOff = true` asks
        // the older reading, for an A/B of one build.
        const eastAsian =
          markFamily(node, "fontCjkFamily") ??
          (defaultSlot && !markFamily(node, "fontFamily") ? defaultSlot : null) ??
          (latin && isEastAsian(latin) ? latin : (gridEastAsianSlotOff() ? null : defaultSlot) ?? defaultEastAsian);
        ratio = Math.max(ratio, faceRatio(eastAsian, true));
      }
      return ratio;
    },
  };
}

function gridCellLinesOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsGridCellLinesOff?: boolean }).__docsGridCellLinesOff === true;
}

function gridEastAsianSlotOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsGridEastAsianSlotOff?: boolean }).__docsGridEastAsianSlotOff === true;
}

/** Inline nodes that leave a grid paragraph's line to its words. */
const WORD_GRID_LINE_NEUTRAL_NODES = new Set(["inlineMath", "sourcePageBreak", "bookmarkPoint"]);

interface WordGridBlockLineHeightSpec {
  /** The textblock's position. */
  pos: number;
  lineHeightPx: number;
  slots: number;
  /** Word's single line of the block's text (px), where its line is whole
   * slots of it: the slots' room above and below it is padding. */
  naturalPx?: number;
}

interface GridBlockSpec {
  readonly block: { readonly lineHeightPx: number; readonly slots: number; readonly naturalPx?: number } | null;
  readonly runs: ReadonlyArray<{ readonly from: number; readonly to: number; readonly lineHeightPx: number; readonly slots: number }>;
  /** Word's single line of a block every line of which is one slot (no
   * multiple over it): the slot's room above and below it is padding. */
  readonly oneSlotNaturalPx?: number;
}

/** A grid block whose lines are one slot each, and Word's single line of its
 * text: the room under the text in the slot the page's foot may take
 * (`data-docs-word-grid-natural`, pageEdgeLeading). */
interface WordGridOneSlotNaturalSpec {
  pos: number;
  naturalPx: number;
  pitchPx: number;
}

/** `window.__docsGridOneSlotFootOff = true` (A/B): a one-slot grid line hangs
 * nothing past the page's foot, the older reading. */
function gridOneSlotFootOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsGridOneSlotFootOff?: boolean }).__docsGridOneSlotFootOff === true;
}

const gridBlockSpecs = new WeakMap<ProseMirrorNode, { sig: string; attrs: unknown; spec: GridBlockSpec }>();

function wordGridRunLineHeightSpecs(doc: ProseMirrorNode): {
  runs: WordGridRunLineHeightSpec[];
  blocks: WordGridBlockLineHeightSpec[];
  naturals: WordGridOneSlotNaturalSpec[];
} {
  const pitchTwips = documentLineGridPitch(doc.attrs);
  const pitchPx = pitchTwips === null ? NaN : pitchTwips / 15;
  const active = Number.isFinite(pitchPx) && pitchPx > 0;
  const runs: WordGridRunLineHeightSpec[] = [];
  const blocks: WordGridBlockLineHeightSpec[] = [];
  const naturals: WordGridOneSlotNaturalSpec[] = [];
  if (!active) return { runs, blocks, naturals };
  // A section with no grid of its own sets its lines unsnapped (Word).
  const offGrid = sectionsOffLineGrid(doc);
  const faces = wordGridRunFaces(doc);
  const slotsOf = (node: ProseMirrorNode, block: ProseMirrorNode): number | null => {
    const fontSizeMark = node.marks.find(
      (mark) => mark.type.name === "fontSize",
    );
    const markedPx = wordCjkSpacingNumber(
      String(fontSizeMark?.attrs.size ?? ""),
    );
    // A run with no size of its own takes its paragraph style's: 12pt Songti SC
    // from Normal stands on two pitches of a 16.3pt grid as a stated 12pt does
    // (a 272-page book's first two chapters, 24 pages short of Word's).
    const fontSizePx = markedPx > 0
      ? markedPx
      : documentStyleFontSizePx(doc.attrs, block) ??
        wordCjkSpacingNumber(String(doc.attrs.defaultFontSize ?? ""));
    if (!(fontSizePx > 0)) return null;
    const singleLinePx = fontSizePx * faces.ratio(node);
    const naturalLineHeightPx = Math.max(pitchPx, singleLinePx);
    const slots = Math.max(1, Math.ceil(naturalLineHeightPx / pitchPx - 0.000_001));
    naturalOfRun.set(node, singleLinePx);
    // On one pitch an inherited size has nothing to say: the line is the grid's.
    return markedPx > 0 || slots > 1 ? slots : null;
  };
  // Word's single line of each run read by slotsOf, for the block's padding.
  const naturalOfRun = new Map<ProseMirrorNode, number>();
  // A multiple on the grid multiplies the pitch; a run taller than the pitch
  // takes whole slots; the line is the larger of the two (Word 16 for Mac,
  // probes g-grid-*: 10.5 pt at 1.5 on 15.6 pt is 23.4 pt, 14 pt, two slots,
  // is 31.2 pt at any multiple up to 2).
  const quantized = (slots: number, factor: number) =>
    Math.round(Math.max(slots, factor) * pitchPx * 1_000) / 1_000;
  const defaultFactor = doc.attrs.defaultLineHeight;
  const factorOf = (block: ProseMirrorNode): number => {
    const value = Number(block.attrs.lineHeight ?? defaultFactor);
    return Number.isFinite(value) && value > 1 ? value : 1;
  };
  /** One text block's grid line heights, positions from its own start. */
  const gridSpecOfBlock = (block: ProseMirrorNode, ownFactor?: number): GridBlockSpec => {
    const out: { block: GridBlockSpec["block"]; runs: Array<{ from: number; to: number; lineHeightPx: number; slots: number }>; oneSlotNaturalPx?: number } = { block: null, runs: [] };
    const factor = ownFactor ?? factorOf(block);
    if (paragraphHoldsNoText(block)) {
      // A line with no text is the paragraph mark's, in the mark's own face
      // and size, in whole slots as text is (R283-D16: 12 pt Segoe UI on a
      // 15.6 pt grid, two slots; probe g-gridmark).
      const marks = Array.isArray(block.attrs.paragraphMarkMarks)
        ? (block.attrs.paragraphMarkMarks as Array<{ type?: unknown; attrs?: Record<string, unknown> }>)
        : [];
      const sizePx = wordCjkSpacingNumber(
        String(marks.find((mark) => mark.type === "fontSize")?.attrs?.size ?? block.attrs.paragraphFontSize ?? ""),
      );
      if (sizePx > 0) {
        const family = marks.find((mark) => mark.type === "fontFamily")?.attrs?.family;
        const slots = Math.max(
          1,
          Math.ceil(Math.max(pitchPx, sizePx * faces.markRatio(family)) / pitchPx - 0.000_001),
        );
        if (slots > 1) out.block = { lineHeightPx: quantized(slots, factor), slots };
      }
      return out;
    }
    const children: Array<{ pos: number; size: number; slots: number | null; naturalPx: number | null }> = [];
    let textOnly = true;
    block.forEach((child, offset) => {
      if (!child.isText) {
        // A formula or a marker takes its own box in the line and asks no
        // pitch of it: its words still say the paragraph's line (a line of
        // words beside a formula stood 48px on two 21.7px pitches, the run's
        // box over the strut, and the page plan never settled).
        if (!WORD_GRID_LINE_NEUTRAL_NODES.has(child.type.name)) textOnly = false;
        return;
      }
      // White space draws nothing and asks nothing of the line (Word 16.86, a line
      // of a tab or a space in a face two pitches tall stands on one: the tab
      // before a proof's ∎).
      if (/^[\t ]+$/u.test(child.text ?? "")) return;
      const slots = slotsOf(child, block);
      children.push({
        pos: 1 + offset,
        size: child.nodeSize,
        slots,
        naturalPx: naturalOfRun.get(child) ?? null,
      });
    });
    // Every run of the paragraph needs the same several pitches (a 14pt
    // title on an 18pt grid): the paragraph's own line box is that height.
    // Left to the runs, the line box was the run's box over the paragraph's
    // pitch-high strut, whose baselines differ by the two sizes' half
    // leading: R06-D17's two titles stood 36.8pt for Word's 36 and pushed
    // the page's last line onto the next.
    const uniform = children[0]?.slots ?? null;
    if (
      textOnly &&
      uniform !== null &&
      uniform > 1 &&
      children.every((child) => child.slots === uniform)
    ) {
      // Word centres the text in its slots; where the line is whole slots
      // (no multiple above them), the room under the tallest run's single
      // line is padding the page's foot may take (pageEdgeLeading).
      const naturals = children.map((child) => child.naturalPx);
      // Measured for Auto lines only: an exact or at-least rule sets its own box.
      const naturalPx = factor <= uniform && (block.attrs.lineHeightRule === null || block.attrs.lineHeightRule === undefined) &&
        naturals.every((value) => value !== null && value > 0)
        ? Math.round(Math.max(...(naturals as number[])) * 1_000) / 1_000
        : undefined;
      out.block = { lineHeightPx: quantized(uniform, factor), slots: uniform, ...(naturalPx !== undefined ? { naturalPx } : {}) };
      return out;
    }
    // Every line one slot, no multiple over it: Word centres the text in the
    // slot as in several, and keeps the page's last line while its text fits
    // (Windows Word, docx-look/probes/vsp8, a 16.3 pt grid on A4 with 72 pt
    // margins: 10 pt Palatino Linotype, its single line 13.49 pt, stays 1.38
    // pt past the foot and goes on 1.68 pt past, Auto or at least 14 pt
    // alike; 12 pt, 16.19 pt, goes on 0.08 pt past). Corpus R404-D02: page 1's
    // 40th line went to page 2, a page more over the document.
    if (
      textOnly &&
      factor <= 1 &&
      children.length > 0 &&
      children.every((child) => (child.slots === null || child.slots === 1) && child.naturalPx !== null && child.naturalPx > 0)
    ) {
      const naturalPx = Math.max(...children.map((child) => child.naturalPx as number));
      if (naturalPx < pitchPx) out.oneSlotNaturalPx = Math.round(naturalPx * 1_000) / 1_000;
    }
    for (const child of children) {
      if (child.slots === null) continue;
      const lineHeightPx = quantized(child.slots, factor);
      const previous = out.runs.at(-1);
      if (
        previous &&
        previous.to === child.pos &&
        previous.lineHeightPx === lineHeightPx &&
        previous.slots === child.slots
      ) {
        previous.to = child.pos + child.size;
      } else {
        out.runs.push({
          from: child.pos,
          to: child.pos + child.size,
          lineHeightPx,
          slots: child.slots,
        });
      }
    }
    return out;
  };
  // "At least" on the grid: the line is the larger of the floor and the
  // whole pitches its tallest text needs (Word, probe al and corpus R355-D02:
  // 10.5pt Microsoft YaHei at least 20pt on a 15.6pt grid stands on two
  // slots, 31.2pt; the stylesheet's round(up, 1.2em, pitch) read one, 20.8pt).
  // Table cells too where the document puts table lines on the grid
  // (w:adjustLineHeightInTable; R355-D02's rows, two slots and the space
  // after). `window.__docsGridAtLeastSlotsOff = true` leaves both to the
  // stylesheet, for an A/B of one build.
  const atLeastSlots = !(typeof window !== "undefined" &&
    (window as Window & { __docsGridAtLeastSlotsOff?: boolean }).__docsGridAtLeastSlotsOff === true);
  const cellsOnGrid = atLeastSlots && doc.attrs.wordTableLinesOnGrid === true;
  // `wholeLine`: a cell's paragraph, which the stylesheet's "at least" grid
  // rule does not reach, takes its one-slot line here too.
  const atLeastSpecOfBlock = (block: ProseMirrorNode, wholeLine = false): GridBlockSpec | null => {
    const floorPt = Number(block.attrs.lineHeightPt);
    const floorPx = Number.isFinite(floorPt) && floorPt > 0 ? floorPt * 4 / 3 : 0;
    const spec = gridSpecOfBlock(block, 1);
    const line = (slots: number) => Math.round(Math.max(floorPx, slots * pitchPx) * 1_000) / 1_000;
    if (spec.block) return { block: { lineHeightPx: line(spec.block.slots), slots: spec.block.slots }, runs: [] };
    const base = wholeLine ? { lineHeightPx: line(1), slots: 1 } : null;
    if (spec.runs.some((run) => run.slots > 1)) {
      return { block: base, runs: spec.runs.filter((run) => run.slots > 1).map((run) => ({ ...run, lineHeightPx: line(run.slots) })) };
    }
    if (base) return { block: base, runs: [] };
    // A floor within the pitch leaves the line one slot, its text centred in
    // it by its own single line, not the floor (probes/vsp8: at least 14 pt
    // of a 13.49 pt line hangs 1.4 pt past the foot, as Auto does).
    if (spec.oneSlotNaturalPx !== undefined && floorPx <= pitchPx + 0.001) return { block: null, runs: [], oneSlotNaturalPx: spec.oneSlotNaturalPx };
    return null;
  };
  // A block's specs stand while it, the grid and the document's faces do:
  // each pass of a long book read every block's runs again.
  const signature = `${pitchPx}|${String(defaultFactor)}|${atLeastSlots}`;
  const docAttrs = doc.attrs;
  doc.descendants((block, blockPos, parent) => {
    // A table cell's paragraphs are left to the table: not walked into,
    // rather than each textblock resolving its ancestors (a resolve scans
    // every sheet before it: 1.5 s of a 272-page book's opening). Only a
    // document with its table lines on the grid has their "at least" lines
    // to read.
    if (block.type.name === "tableCell" || block.type.name === "tableHeader") return cellsOnGrid;
    if (!block.isTextblock) return true;
    const inCell = parent?.type.name === "tableCell" || parent?.type.name === "tableHeader";
    const atLeast = atLeastSlots && block.attrs.lineHeightRule === "atLeast";
    // An Auto line in a cell stands on the grid too where the document puts
    // table lines on it (w:adjustLineHeightInTable): Windows Word sets
    // corpus R470-D77's 12 pt Times New Roman cells at 1.5 lines 23.4 pt a
    // row on a 15.6 pt grid, 1.5 pitches, and its 10.5 pt single cells 15.6
    // pt; left to the stylesheet they stood at 1.5 x and 1 x their own
    // single line (20.7 / 12.1 pt), the document a page short (an "at
    // least" cell line likewise, below). `window.__docsGridCellLinesOff
    // = true` asks the older reading, for an A/B of one build.
    const cellAuto = inCell && !atLeast && cellsOnGrid && !gridCellLinesOff() &&
      (block.attrs.lineHeightRule === null || block.attrs.lineHeightRule === undefined);
    if (
      block.attrs.snapToGrid === false ||
      (offGrid.length > 0 && offLineGridAt(offGrid, blockPos)) ||
      (inCell && !atLeast && !cellAuto) ||
      (!atLeast && block.attrs.lineHeightRule !== null &&
        block.attrs.lineHeightRule !== undefined)
    ) {
      return false;
    }
    if (atLeast) {
      // A cell's "at least" line on the grid is the larger of its floor and
      // one pitch even where its text takes one slot (R468-D62: Normal at
      // least 13 pt, 10 pt Times New Roman cells 15.6 pt a line in Word,
      // 13 pt here; 29 pages for 33).
      const spec = atLeastSpecOfBlock(block, inCell && !gridCellLinesOff());
      if (spec?.block) blocks.push({ pos: blockPos, lineHeightPx: spec.block.lineHeightPx, slots: spec.block.slots });
      if (!inCell && spec?.oneSlotNaturalPx !== undefined && !gridOneSlotFootOff()) naturals.push({ pos: blockPos, naturalPx: spec.oneSlotNaturalPx, pitchPx });
      for (const run of spec?.runs ?? []) runs.push({ from: blockPos + run.from, to: blockPos + run.to, lineHeightPx: run.lineHeightPx, slots: run.slots });
      return false;
    }
    let known = gridBlockSpecs.get(block);
    if (!known || known.sig !== signature || known.attrs !== docAttrs) {
      known = { sig: signature, attrs: docAttrs, spec: gridSpecOfBlock(block) };
      gridBlockSpecs.set(block, known);
    }
    const { spec } = known;
    if (cellAuto && !spec.block) {
      // The paragraph's own line, the pitch times its multiple (a body
      // paragraph's comes from the stylesheet, which a cell's does not take).
      blocks.push({ pos: blockPos, lineHeightPx: quantized(1, factorOf(block)), slots: 1 });
    }
    if (spec.block) blocks.push({ pos: blockPos, lineHeightPx: spec.block.lineHeightPx, slots: spec.block.slots, ...(spec.block.naturalPx !== undefined ? { naturalPx: spec.block.naturalPx } : {}) });
    else if (!inCell && spec.oneSlotNaturalPx !== undefined && spec.runs.every((run) => run.slots === 1) && !gridOneSlotFootOff()) naturals.push({ pos: blockPos, naturalPx: spec.oneSlotNaturalPx, pitchPx });
    for (const run of spec.runs) runs.push({ from: blockPos + run.from, to: blockPos + run.to, lineHeightPx: run.lineHeightPx, slots: run.slots });
    return false;
  });
  return { runs, blocks, naturals };
}

function wordCjkBlockContentWidth(element: HTMLElement): {
  firstLineWidthPx: number;
  lineWidthPx: number;
} | null {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  // Initial pagination uses visibility:hidden to hide provisional pages while
  // preserving their geometry. Rejecting that state delays CJK spacing until
  // pagination finishes, then changes line widths and starts a second reflow.
  // display:none/zero-width boxes still have no usable measurement.
  if (
    rect.width <= 0 ||
    style.display === "none" ||
    (style.writingMode && style.writingMode !== "horizontal-tb")
  ) {
    return null;
  }
  const horizontalInsets =
    wordCjkSpacingNumber(style.paddingLeft) +
    wordCjkSpacingNumber(style.paddingRight) +
    wordCjkSpacingNumber(style.borderLeftWidth) +
    wordCjkSpacingNumber(style.borderRightWidth);
  const lineWidthPx = Math.max(1, rect.width - horizontalInsets);
  const textIndentPx = wordCjkSpacingNumber(style.textIndent);
  return {
    lineWidthPx,
    firstLineWidthPx: Math.max(1, lineWidthPx - textIndentPx),
  };
}

type WordCjkDomEligibility =
  | { status: "eligible"; repeatedHeader: boolean }
  | { status: "unsupported" }
  | { status: "pending" };

/** A modal dialog hides the whole editor (and its ancestors) from assistive
 * technology while the document still paints underneath; only a hidden or
 * read-only element inside the document excludes its text. */
const insideDocument = (view: EditorView, match: Element | null | undefined): boolean =>
  !!match && !match.contains(view.dom);

/** A formatting mark (the paragraph mark, a cell end) is a zero-size inline
 * box with no text of its own, and the separator image ProseMirror puts
 * after a trailing one is zero-size too: neither changes a line. Word's
 * layout never depends on Show/Hide ¶, so they do not exclude a paragraph
 * from CJK spacing (they did: with marks shown — the East Asian default —
 * no paragraph got CJK/Latin spacing or punctuation compression, and lines
 * re-wrapped when ¶ was toggled). */
const LAYOUT_NEUTRAL_MARK =
  'span.mrnote-formatting-mark[data-testid="document-formatting-mark"], img.ProseMirror-separator, ' +
  // The break ProseMirror adds after a trailing mark ends no line of text.
  'span.mrnote-formatting-mark[data-testid="document-formatting-mark"] ~ br.ProseMirror-trailingBreak';

/** An inline object of a paragraph, one box in its line (a formula, a page
 * break Word left, a bookmark, a field): a node of the paragraph that is not its
 * text. Word spaces and compresses the words around it as any others. */
const WORD_CJK_INLINE_OBJECT = '[contenteditable="false"]';

function insideWordCjkInlineObject(node: Element, block: Element): boolean {
  const object = node.closest(WORD_CJK_INLINE_OBJECT);
  return object !== null && object !== block && block.contains(object);
}

/** A paragraph's own text: the text of its PM node, no object's. */
export function wordCjkOwnText(element: Element): string {
  if (!element.querySelector(WORD_CJK_INLINE_OBJECT)) return element.textContent ?? "";
  return wordCjkInlineItems(element)
    .map((item) => (item.nodeType === Node.TEXT_NODE ? (item as Text).data : ""))
    .join("");
}

/** The paragraph's text nodes in order, and its inline objects whole. */
function wordCjkInlineItems(element: Element, into: (Text | HTMLElement)[] = []): (Text | HTMLElement)[] {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) into.push(child as Text);
    else if (child.nodeType === Node.ELEMENT_NODE) {
      if ((child as Element).matches(WORD_CJK_INLINE_OBJECT)) into.push(child as HTMLElement);
      else wordCjkInlineItems(child as Element, into);
    }
  }
  return into;
}

/** Where each of a paragraph's text characters stands past the objects before
 * it (each object a node of the paragraph, however it draws): null when the
 * paragraph holds none. */
function wordCjkObjectOffsets(node: ProseMirrorNode): { textIndex: number; size: number }[] | null {
  let offsets: { textIndex: number; size: number }[] | null = null;
  let textIndex = 0;
  node.forEach((child) => {
    if (child.isText) textIndex += child.text?.length ?? 0;
    else (offsets ??= []).push({ textIndex, size: child.nodeSize });
  });
  return offsets;
}

/** The page-split fragments of the paragraph `element` belongs to: its
 * head on an earlier sheet and its continuations on later ones (each its own
 * block), `element` included. */
export function wordCjkSplitFragments(element: HTMLElement): HTMLElement[] {
  const fragments = [element];
  const sheetOf = (node: HTMLElement) => node.closest<HTMLElement>("article[data-page-sheet]");
  const blocks = (sheet: Element | null) =>
    sheet ? Array.from(sheet.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-block-id")) : [];
  let current: HTMLElement | null = element;
  for (let guard = 0; current?.hasAttribute("data-page-split-continuation") && guard < 64; guard += 1) {
    const before: HTMLElement | undefined = blocks(sheetOf(current)?.previousElementSibling ?? null).at(-1);
    if (!before || !before.hasAttribute("data-page-split-continues")) break;
    fragments.unshift(before);
    current = before;
  }
  current = element;
  for (let guard = 0; current?.hasAttribute("data-page-split-continues") && guard < 64; guard += 1) {
    const after: HTMLElement | undefined = blocks(sheetOf(current)?.nextElementSibling ?? null)[0];
    if (!after || !after.hasAttribute("data-page-split-continuation")) break;
    fragments.push(after);
    current = after;
  }
  return fragments;
}

function wordCjkDomEligibility(view: EditorView, element: HTMLElement): WordCjkDomEligibility {
  // A paragraph cut across sheets is one paragraph: its fragments are
  // compressed only if all of them can be. A continuation without the
  // equations its head holds was compressed while the whole paragraph was
  // not, so the cut paragraph measured shorter than the whole one and the
  // page plan cut and merged it for ever (cycleHeld on a long book, a
  // paragraph whose last line wrapped only whole).
  const fragments =
    element.hasAttribute("data-page-split-continuation") || element.hasAttribute("data-page-split-continues")
      ? wordCjkSplitFragments(element)
      : [element];
  // What stands inside an inline object (a formula's own svg, its aria-hidden
  // copy) is the object's: the line sees one box.
  const foreign = (selector: string) =>
    fragments.some((fragment) =>
      Array.from(fragment.querySelectorAll(selector)).some(
        (node) => !node.matches(LAYOUT_NEUTRAL_MARK) && !insideWordCjkInlineObject(node, fragment),
      ),
    );
  if (foreign("br, img, svg, canvas, video, audio, .ProseMirror-widget") ||
      insideDocument(view, element.closest('[aria-hidden="true"]')) ||
      foreign('[aria-hidden="true"]'))
    return { status: "unsupported" };
  let readonly = element.closest('[contenteditable="false"]');
  // The editor root (or an ancestor) is contenteditable="false" while the
  // document is read-only or before write authority resolves; that is the
  // whole surface, not an inline non-editable node view. Spacing decisions
  // must not depend on editability, or a document paginated before the
  // collaboration handshake wraps wider than the same document afterwards.
  if (!insideDocument(view, readonly)) readonly = null;
  if (!readonly) return { status: "eligible", repeatedHeader: false };
  if (foreign('[contenteditable="false"]')) return { status: "unsupported" };
  if (!readonly.matches('tr[data-page-table-repeated-header="true"]') ||
      insideDocument(view, readonly.parentElement?.closest('[contenteditable="false"], [aria-hidden="true"]')))
    return { status: "unsupported" };
  try {
    const position = view.state.doc.resolve(view.posAtDOM(element, 0));
    if (!position.parent.isTextblock || position.parent.textContent !== element.textContent)
      return { status: "pending" };
    for (let index = 0; index < position.parent.childCount; index++)
      if (!position.parent.child(index).isText) return { status: "unsupported" };
    for (let depth = position.depth; depth > 0; depth--) {
      const ancestor = position.node(depth);
      if (ancestor.type.name !== "tableRow") continue;
      return ancestor.attrs[TABLE_REPEATED_HEADER_ATTR] === true &&
        view.nodeDOM(position.before(depth)) === readonly
        ? { status: "eligible", repeatedHeader: true }
        : { status: "unsupported" };
    }
  } catch { return { status: "pending" }; }
  return { status: "unsupported" };
}

type WordCjkDomGlyphRead =
  | { status: "ready"; glyphs: WordCjkDomGlyph[] }
  | { status: "unsupported" }
  | { status: "pending" };

/** Where each computed face's advances are read from, per document. */
interface WordCjkAdvanceSources {
  /** Whether a canvas measures the face the page paints for this font. */
  canvasFaces: Map<string, boolean>;
  /** Advances, as laid out, for fonts the canvas does not resolve. */
  domAdvances: Map<string, number>;
}

/** Characters whose advances tell faces apart: Latin letters and a digit,
 * which any Latin-capable face draws itself. An ideograph is one em in almost
 * every face, and could fall through to a web font subset the page never
 * asked for. */
const WORD_CJK_FACE_PROBE_CHARACTERS = ["M", "W", "i", "l", "0"] as const;
/** Chromium lays inline boxes out in 1/64px units: a canvas that measures the
 * page's face differs from its box by less than one. Another face differs by
 * whole pixels (SimSun's "M" is 7px at 14px, Songti SC's 11.86px). */
const WORD_CJK_LAYOUT_UNIT_PX = 1 / 64;

// A canvas measures ASCII whitespace as a space.
const wordCjkAdvanceKey = (font: string, character: string): string =>
  `${font}\u0000${/^[\t\n\f\r]$/u.test(character) ? " " : character}`;

/**
 * Decide, once per computed face, whether a canvas measures what the page
 * paints, and read the advances of the faces it does not from the layout.
 * WebKit's canvas does not see faces the user installed: it measured Songti
 * SC's proportional Latin where the page paints SimSun's half-width letters,
 * and every Latin letter got a correction the page did not need.
 */
function readWordCjkDomAdvances(
  elements: HTMLElement | readonly HTMLElement[],
  canvas: CanvasRenderingContext2D,
  textStyleOf: (parent: HTMLElement) => WordCjkDomTextStyle,
  sources: WordCjkAdvanceSources,
): void {
  const blocks: readonly HTMLElement[] = Array.isArray(elements) ? elements : [elements as HTMLElement];
  if (blocks.length === 0) return;
  const ownerDocument = blocks[0]!.ownerDocument;
  const needed = new Map<string, Set<string>>();
  for (const element of blocks) {
    for (const node of wordCjkInlineItems(element)) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const { font } = textStyleOf(parent);
      if (!font || sources.canvasFaces.get(font) === true) continue;
      let characters = needed.get(font);
      if (!characters) needed.set(font, (characters = new Set()));
      for (const character of (node as Text).data) characters.add(character);
    }
  }
  const unclassified = [...needed.keys()].filter((font) => !sources.canvasFaces.has(font));
  if (unclassified.length) {
    const probe = WORD_CJK_FACE_PROBE_CHARACTERS;
    const laidOut = measureOfficeGlyphAdvances(
      ownerDocument,
      unclassified.flatMap((font) => probe.map((character) => ({ font, character }))),
    );
    unclassified.forEach((font, index) => {
      const widths = laidOut.slice(index * probe.length, (index + 1) * probe.length);
      // Nothing laid out (a hidden frame): the canvas stays the reader, and
      // the face is decided on a later pass.
      if (widths.some((width) => width === undefined)) {
        needed.delete(font);
        return;
      }
      canvas.font = font;
      const faithful = probe.every((character, at) =>
        Math.abs(canvas.measureText(character).width - widths[at]!) <= WORD_CJK_LAYOUT_UNIT_PX);
      sources.canvasFaces.set(font, faithful);
      if (faithful) needed.delete(font);
      else probe.forEach((character, at) => sources.domAdvances.set(wordCjkAdvanceKey(font, character), widths[at]!));
    });
  }
  const requests = new Map<string, OfficeGlyphAdvanceOptions>();
  for (const [font, characters] of needed) {
    for (const character of characters) {
      const key = wordCjkAdvanceKey(font, character);
      if (!sources.domAdvances.has(key)) requests.set(key, { font, character: key.slice(font.length + 1) });
    }
  }
  if (requests.size === 0) return;
  const keys = [...requests.keys()];
  measureOfficeGlyphAdvances(ownerDocument, [...requests.values()]).forEach((width, index) => {
    if (width !== undefined) sources.domAdvances.set(keys[index], width);
  });
}

function wordCjkDomGlyphs(
  view: EditorView,
  element: HTMLElement,
  eligibility: Extract<WordCjkDomEligibility, { status: "eligible" }>,
  advanceSources: WordCjkAdvanceSources,
  /** The pass's computed run styles (read once a pass), and whether this
   * block's DOM advances were read already in the pass's batch. */
  pass?: { textStyles: WeakMap<HTMLElement, WordCjkDomTextStyle>; advancesRead: boolean },
): WordCjkDomGlyphRead {
  const glyphs: WordCjkDomGlyph[] = [];
  const textStyleCache = pass?.textStyles ?? new WeakMap<HTMLElement, WordCjkDomTextStyle>();
  const textStyleOf = (parent: HTMLElement): WordCjkDomTextStyle => {
    let textStyle = textStyleCache.get(parent);
    if (!textStyle) {
      textStyle = wordCjkDomTextStyle(parent);
      textStyleCache.set(parent, textStyle);
    }
    return textStyle;
  };
  const advanceCache = new Map<string, WordCjkMeasuredAdvance>();
  // A run's East Asian language: its own w:lang (proofing language), else
  // the language its font hint was resolved under (which already follows
  // the style chain); the document's default is applied by the caller.
  const languageCache = new WeakMap<HTMLElement, string | null>();
  const languageOf = (parent: HTMLElement): string | null => {
    const known = languageCache.get(parent);
    if (known !== undefined) return known;
    let language: string | null = null;
    for (
      let current: HTMLElement | null = parent;
      current && current !== element;
      current = current.parentElement
    ) {
      const value =
        current.getAttribute("data-proofing-language-east-asia") ||
        current.getAttribute("data-office-font-hint-language");
      if (value) {
        language = normalizeDocumentEastAsianLanguage(value);
        break;
      }
    }
    languageCache.set(parent, language);
    return language;
  };
  const kerningOf = (parent: HTMLElement): boolean =>
    parent.closest("[data-docs-effective-kerning]")?.getAttribute(
      "data-docs-effective-kerning",
    ) === "on";
  const canvasContext = wordCjkCanvasMeasurementContext();
  if (canvasContext && !pass?.advancesRead) readWordCjkDomAdvances(element, canvasContext, textStyleOf, advanceSources);
  let activeCanvasStyle = "";
  let blockContentFrom: number;
  try {
    blockContentFrom = view.posAtDOM(element, 0);
  } catch {
    return { status: "pending" };
  }
  let textOffsetInBlock = 0;
  // Past the paragraph's objects (a formula, a marker) a character stands that
  // much further on in the document.
  const items = wordCjkInlineItems(element);
  let objectOffsets: { textIndex: number; size: number }[] | null = null;
  if (items.some((item) => item.nodeType !== Node.TEXT_NODE)) {
    const block = view.state.doc.resolve(blockContentFrom).parent;
    if (!block.isTextblock || block.textContent !== wordCjkOwnText(element)) return { status: "pending" };
    objectOffsets = wordCjkObjectOffsets(block);
  }
  let objectAt = 0;
  let objectsSize = 0;
  const positionOf = (textIndex: number): number => {
    while (objectOffsets && objectAt < objectOffsets.length && objectOffsets[objectAt].textIndex <= textIndex) {
      objectsSize += objectOffsets[objectAt].size;
      objectAt += 1;
    }
    return blockContentFrom + textIndex + objectsSize;
  };
  for (const item of items) {
    if (item.nodeType !== Node.TEXT_NODE) {
      // One box in the line, read as drawn; a marker draws nothing.
      const box = (item as HTMLElement).getBoundingClientRect();
      if (box.width > 0) {
        const style = textStyleOf(item.parentElement ?? element);
        const at = positionOf(textOffsetInBlock);
        glyphs.push({
          character: WORD_CJK_OBJECT_CHARACTER,
          from: at,
          to: at,
          widthPx: box.width,
          fontSizePx: style.fontSizePx,
          autoSpaceBeforePx: 0,
          autoSpaceAfterPx: 0,
          baseLetterSpacingPx: 0,
          fontAdvanceCorrectionPx: 0,
          font: style.font,
          baselineOffsetPx: Number.NaN,
          language: null,
          kerning: false,
          object: true,
        });
      }
      continue;
    }
    const textNode = item as Text;
    const parent = textNode.parentElement;
    if (!parent) return { status: "pending" };
    const value = textNode.data;
    if (eligibility.repeatedHeader) {
      // A repeated header is real, non-editable PM text, not a decorative
      // widget. Verify both ends before assigning source-relative glyphs.
      try {
        if (view.posAtDOM(textNode, 0) !== blockContentFrom + textOffsetInBlock ||
            view.posAtDOM(textNode, value.length) !== blockContentFrom + textOffsetInBlock + value.length)
          return { status: "pending" };
      } catch { return { status: "pending" }; }
    }
    for (let offset = 0; offset < value.length;) {
      const point = value.codePointAt(offset);
      const length = point !== undefined && point > 0xffff ? 2 : 1;
      const character = value.slice(offset, offset + length);
      const textStyle = textStyleOf(parent);
      let advance: WordCjkMeasuredAdvance | null = null;
      if (canvasContext && textStyle.font) {
        const cacheKey = `${textStyle.cacheKey}\u0000${character}`;
        const cached = advanceCache.get(cacheKey);
        if (cached !== undefined) {
          advance = cached;
        } else {
          let measured = advanceSources.canvasFaces.get(textStyle.font) === false
            ? advanceSources.domAdvances.get(wordCjkAdvanceKey(textStyle.font, character))
            : undefined;
          if (measured === undefined) {
            if (activeCanvasStyle !== textStyle.cacheKey) {
              canvasContext.font = textStyle.font;
              canvasContext.direction = textStyle.direction;
              activeCanvasStyle = textStyle.cacheKey;
            }
            measured = canvasContext.measureText(character).width;
          }
          measured -= textStyle.syntheticBoldEnginePx;
          if (Number.isFinite(measured)) {
            const normalizedFontAdvance = textStyle.eastAsianCellMetrics
              ? WORD_EAST_ASIAN_HALF_WIDTH_ASCII_RE.test(character)
                ? textStyle.asciiInEastAsianCells ? textStyle.fontSizePx * 0.5 : measured
                : WORD_CJK_EAST_ASIAN_RE.test(character) ||
                    wordCjkPunctuationRole(character) !== null ||
                    (WORD_EAST_ASIAN_FULL_WIDTH_PUNCTUATION.has(character) && textStyle.drawnInEastAsianCells)
                  ? textStyle.fontSizePx
                  : measured
              : measured;
            advance = {
              widthPx: Math.max(
                0,
                normalizedFontAdvance +
                  textStyle.syntheticBoldEnginePx +
                  textStyle.letterSpacingPx +
                  (/\s/u.test(character) ? textStyle.wordSpacingPx : 0),
              ),
              fontAdvanceCorrectionPx: normalizedFontAdvance - measured,
            };
            advanceCache.set(cacheKey, advance);
          }
        }
      }
      if (advance === null) {
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + length);
        if (typeof range.getBoundingClientRect !== "function") return { status: "pending" };
        const box = range.getBoundingClientRect();
        const measured = box.width - textStyle.syntheticBoldEnginePx;
        if (!Number.isFinite(measured) || box.height <= 0) return { status: "pending" };
        const normalizedFontAdvance = textStyle.eastAsianCellMetrics
          ? WORD_EAST_ASIAN_HALF_WIDTH_ASCII_RE.test(character)
            ? textStyle.asciiInEastAsianCells ? textStyle.fontSizePx * 0.5 : measured
            : WORD_CJK_EAST_ASIAN_RE.test(character) ||
                wordCjkPunctuationRole(character) !== null ||
                (WORD_EAST_ASIAN_FULL_WIDTH_PUNCTUATION.has(character) && textStyle.drawnInEastAsianCells)
              ? textStyle.fontSizePx
              : measured
          : measured;
        advance = {
          widthPx: Math.max(0, normalizedFontAdvance + textStyle.syntheticBoldEnginePx),
          fontAdvanceCorrectionPx: normalizedFontAdvance - measured,
        };
      }
      const from = objectOffsets ? positionOf(textOffsetInBlock + offset) : blockContentFrom + textOffsetInBlock + offset;
      const to = from + length;
      if (to <= from) return { status: "pending" };
      glyphs.push({
        character,
        from,
        to,
        widthPx: advance.widthPx,
        fontSizePx: textStyle.fontSizePx,
        autoSpaceBeforePx: 0,
        autoSpaceAfterPx: 0,
        baseLetterSpacingPx: textStyle.letterSpacingPx,
        fontAdvanceCorrectionPx: advance.fontAdvanceCorrectionPx,
        font: textStyle.font,
        baselineOffsetPx: Number.NaN,
        language: languageOf(parent),
        kerning: kerningOf(parent),
      });
      if (glyphs.length > MAX_WORD_CJK_SPACING_GLYPHS) return { status: "unsupported" };
      offset += length;
    }
    textOffsetInBlock += value.length;
  }
  return { status: "ready", glyphs };
}

/** Harness switch (`window.__docsAutoSpaceEdgesOff = true`): an automatic
 * space keeps its width at the start or end of a line (A/B). */
function wordAutoSpaceEdgesOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsAutoSpaceEdgesOff?: boolean }).__docsAutoSpaceEdgesOff === true;
}

/** The decoration attribute naming the line edge whose automatic space a
 * glyph's spacing leaves out. */
const WORD_AUTO_SPACE_EDGE_ATTR = "data-docs-word-cjk-edge";

/**
 * Takes the automatic East Asian/Latin space off a glyph at the start or the
 * end of a line where Word sets none and the break cannot move for it
 * (wordAutoSpaceLineEdges), on the lines the engine laid out now. Changes the
 * block's spacing specs in place. Settled when the page already draws the
 * decided edges; otherwise the owner measures again on the new lines.
 */
function applyWordAutoSpaceLineEdges(
  view: EditorView,
  element: HTMLElement,
  glyphs: readonly WordCjkDomGlyph[],
  specs: WordCjkSpacingSpec[],
): { complete: boolean; settled: boolean } {
  const done = { complete: true, settled: true };
  // A line the model cannot add up (an object, a tab, a hard break) or a
  // right-to-left / vertical paragraph is left as it is.
  if (glyphs.some((glyph) => glyph.object || glyph.character === "\n" || glyph.character === "\t") ||
      glyphs.some((glyph) => !Number.isFinite(glyph.baselineOffsetPx))) return done;
  const style = getComputedStyle(element);
  if (style.direction !== "ltr" || (style.writingMode && style.writingMode !== "horizontal-tb")) return done;
  const scale = paginationTransformScale(element);
  if (!scale) return { complete: false, settled: true };
  const boxes = Array.from(element.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (boxes.length === 0) return { complete: false, settled: true };
  if (boxes.length !== 1) return done;
  const box = clientRectInPaginationLayout(boxes[0], scale);
  const lineWidthPx = box.right - box.left -
    wordCjkSpacingNumber(style.paddingLeft) - wordCjkSpacingNumber(style.paddingRight) -
    wordCjkSpacingNumber(style.borderLeftWidth) - wordCjkSpacingNumber(style.borderRightWidth);
  const firstLineWidthPx = lineWidthPx - wordCjkSpacingNumber(style.textIndent);
  const before = getComputedStyle(element, "::before").content;
  // A marker or widget before the paragraph's text stands on its first line.
  // One after the text (the formatting marks' pilcrow or end-of-cell mark,
  // children of every paragraph, drawn or not) does not: read as opaque, it
  // kept every first line from deciding (corpus R347-D02's header cell: "2"
  // opening line 2 kept its gap; `window.__docsAutoSpaceTrailingWidgetOff`
  // reads every child widget as before, for an A/B of one build).
  const firstText = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node as Text).data.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  }).nextNode();
  const trailingWidgetsOff = (window as Window & { __docsAutoSpaceTrailingWidgetOff?: boolean }).__docsAutoSpaceTrailingWidgetOff === true;
  const firstLineOpaque = (!!before && before !== "none" && before !== "normal") ||
    Array.from(element.querySelectorAll(":scope > .docs-list-marker, :scope > .ProseMirror-widget")).some((widget) =>
      trailingWidgetsOff || !firstText ||
      (widget.compareDocumentPosition(firstText) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  const doc = element.ownerDocument;
  const rects = new Map<number, TerminalGlyphBox | null>();
  const rect = (index: number): TerminalGlyphBox | null => {
    if (rects.has(index)) return rects.get(index)!;
    const glyph = glyphs[index];
    let result: TerminalGlyphBox | null = null;
    try {
      const start = view.domAtPos(glyph.from, 1), end = view.domAtPos(glyph.to, -1);
      const range = measurementRange(doc, "wordAutoSpaceEdges");
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const client = firstTerminalPunctuationRect(range.getClientRects());
      const layout = client ? clientRectInPaginationLayout(client, scale) : null;
      result = layout ? { ...layout, baseline: layout.top + glyph.baselineOffsetPx } : null;
    } catch {
      result = null;
    }
    rects.set(index, result);
    return result;
  };
  const breaksBefore = (index: number): boolean | null => {
    const previous = rect(index - 1), here = rect(index);
    if (!previous || !here) return null;
    return !sameTerminalLine(previous, here) && here.baseline > previous.baseline;
  };
  const lineStart = (index: number): number | null => {
    const here = rect(index);
    if (!here) return null;
    // Lines hold consecutive glyphs: the first one on this line.
    let low = 0, high = index;
    while (low < high) {
      const middle = (low + high) >> 1;
      const box = rect(middle);
      if (!box) return null;
      if (sameTerminalLine(box, here)) high = middle;
      else low = middle + 1;
    }
    return low;
  };
  const specAt = new Map(specs.map((spec) => [spec.from, spec]));
  const advancesPx = glyphs.map((glyph) => {
    const spec = specAt.get(glyph.from);
    if (!spec || spec.to !== glyph.to) return glyph.widthPx;
    return glyph.widthPx - glyph.autoSpaceBeforePx - glyph.autoSpaceAfterPx - glyph.fontAdvanceCorrectionPx +
      spec.marginStartPx + spec.marginEndPx +
      (spec.overrideLetterSpacing ? spec.letterSpacingPx - glyph.baseLetterSpacingPx : 0);
  });
  const decided = wordAutoSpaceLineEdges({
    glyphs: glyphs.map((glyph) => ({
      character: glyph.character,
      autoSpaceBeforePx: glyph.autoSpaceBeforePx,
      autoSpaceAfterPx: glyph.autoSpaceAfterPx,
    })),
    lines: { breaksBefore, lineStart },
    advancesPx,
    firstLineWidthPx,
    lineWidthPx,
    firstLineOpaque,
    breakWithinWords: style.wordBreak === "break-all" || style.lineBreak === "anywhere",
  });
  let settled = true;
  glyphs.forEach((glyph, index) => {
    if (!(glyph.autoSpaceBeforePx > 0) && !(glyph.autoSpaceAfterPx > 0)) return;
    const spec = specAt.get(glyph.from);
    if (!spec || spec.to !== glyph.to) return;
    const sides: string[] = [];
    if (decided.starts.has(index)) {
      spec.marginStartPx -= glyph.autoSpaceBeforePx;
      sides.push("start");
    }
    if (decided.ends.has(index)) {
      spec.marginEndPx -= glyph.autoSpaceAfterPx;
      sides.push("end");
    }
    if (sides.length) spec.edge = sides.join(" ");
    // What the page draws now: the edge attribute on the glyph's spacing.
    const at = view.domAtPos(glyph.from, 1);
    let node: Node | undefined = at.node;
    if (node.nodeType !== 3) node = node.childNodes[at.offset];
    while (node && node.nodeType !== 3) node = node.firstChild ?? undefined;
    const drawn = node?.parentElement?.closest(`[${WORD_AUTO_SPACE_EDGE_ATTR}]`)?.getAttribute(WORD_AUTO_SPACE_EDGE_ATTR) ?? "";
    if (drawn !== (spec.edge ?? "")) settled = false;
  });
  return { complete: decided.complete, settled };
}

function applyWordCjkAutoSpacing(
  element: HTMLElement,
  glyphs: WordCjkDomGlyph[],
  documentAttrs: { readonly [key: string]: unknown },
): void {
  // Defaults naming no East Asian face: Word spaces no boundary at all
  // (wordOmitsEastAsianAutoSpace, R398-D14).
  if (wordOmitsEastAsianAutoSpace(documentAttrs)) return;
  const autoSpaceLatin = element.dataset.autoSpaceDe !== "false";
  const autoSpaceNumber = element.dataset.autoSpaceDn !== "false";
  for (let index = 0; index + 1 < glyphs.length; index += 1) {
    const left = glyphs[index];
    const right = glyphs[index + 1];
    const leftScript = wordCjkAutoSpacingScript(left.character);
    const rightScript = wordCjkAutoSpacingScript(right.character);
    const boundary =
      leftScript === "eastAsian"
        ? rightScript
        : rightScript === "eastAsian"
          ? leftScript
          : "other";
    const enabled =
      (boundary === "latin" && autoSpaceLatin) ||
      (boundary === "number" && autoSpaceNumber);
    if (!enabled) continue;
    const spacingPx = wordCjkAutoSpaceWidthOff()
      ? Math.min(left.fontSizePx, right.fontSizePx) * WORD_CJK_AUTO_SPACE_EM
      : left.fontSizePx * wordAutoSpaceAfterEm(leftScript === "eastAsian", left.font, documentAttrs);
    if (leftScript === "eastAsian") {
      right.autoSpaceBeforePx += spacingPx;
    } else {
      left.autoSpaceAfterPx += spacingPx;
    }
  }
  for (const glyph of glyphs) {
    glyph.widthPx += glyph.autoSpaceBeforePx + glyph.autoSpaceAfterPx;
  }
}

interface WordCjkSpacingSpec {
  from: number;
  to: number;
  marginStartPx: number;
  marginEndPx: number;
  letterSpacingPx: number;
  baseLetterSpacingPx: number;
  overrideLetterSpacing: boolean;
  /** Paragraph-final white space: hangs past the line end (pre-wrap). */
  hang?: boolean;
  /** The automatic space this glyph opens or closes its line with, taken off
   * (wordAutoSpaceLineEdges): "start", "end" or "start end". */
  edge?: string;
  punctuationRole: WordCjkPunctuationRole | null;
}

/** A textblock can move between physical sheets without changing its text or
 * font metrics. Keep relative character offsets, never old document positions
 * or DOM nodes. A split/edit gets a new immutable PM node; font loading clears
 * the cache, and current width/style/section inputs still bind every hit. */
interface WordCjkKeptBlock {
  key: string;
  glyphCount: number;
  specs: readonly WordCjkSpacingSpec[];
  terminalSpecs: readonly TerminalPunctuationSpec[];
}

interface WordCjkKeptSheet {
  /** Weakly: a page drawn again leaves its old sheet behind, and this record,
   * kept by the page's node, held that sheet's whole DOM (a hollow book's
   * hundreds of thousands of detached nodes). */
  readonly sheet: WeakRef<Element>;
  readonly epoch: number;
  readonly blocks: readonly WordCjkKeptSheetBlock[];
  /** Set for a sheet every block of which a pass within the horizon read
   * and kept: the layout it was read at (see sheetLayoutKey). */
  readonly measuredAt?: string;
}

interface KeptNumberingMarker {
  readonly block: ProseMirrorNode;
  readonly list: ProseMirrorNode | null;
  readonly epoch: number;
  readonly layout: string;
  readonly contentFrom: number;
  readonly marker: DocumentNumberingMarkerResult;
}

/** A kept marker moved with its paragraph: every position `delta` on. */
export function shiftedNumberingMarker(marker: DocumentNumberingMarkerResult, delta: number): DocumentNumberingMarkerResult {
  if (delta === 0) return marker;
  const move = (paint: DocumentNumberingMarkerResult["paragraph"]) =>
    paint ? { ...paint, from: paint.from + delta, to: paint.to + delta } : paint;
  let signature = marker.signature;
  const tail = /^numbering-tail:(-?\d+)$/.exec(signature);
  const head = /^numbering:(-?\d+):(-?\d+):/.exec(signature);
  if (tail) signature = `numbering-tail:${Number(tail[1]) + delta}`;
  else if (head) signature = `numbering:${Number(head[1]) + delta}:${Number(head[2]) + delta}:${signature.slice(head[0].length)}`;
  return { ...marker, paragraph: move(marker.paragraph), listItem: move(marker.listItem), signature };
}

interface WordCjkKeptSheetBlock {
  readonly node: ProseMirrorNode;
  /** Its content's start, from the sheet's position. */
  readonly offset: number;
  readonly entry: WordCjkKeptBlock | undefined;
}

export class WordCjkSpacingProjectionCache implements WordCjkAdvanceSources {
  private rootLayoutKey = "";
  numberingMetrics = new Map<string, ReturnType<typeof measureOfficeGlyphBaselineOffset>>();
  /** A list paragraph's numbering marker as last drawn, with what it was drawn
   * from: its paragraph and list nodes, its sheet's DOM epoch and the layout. */
  numberingMarkers = new WeakMap<HTMLElement, KeptNumberingMarker>();
  /** Box-top-to-baseline distance per computed face; null when unmeasurable. */
  glyphBaselines = new Map<string, number | null>();
  canvasFaces = new Map<string, boolean>();
  domAdvances = new Map<string, number>();
  blocks = new WeakMap<ProseMirrorNode, WordCjkKeptBlock>();
  /** A sheet outside the measure horizon, by its node (a new node whenever
   * anything on it changes): the blocks whose kept spacing it drew, in
   * order, each with the cache entry it drew (or that it had none), and the
   * sheet element with its DOM epoch then. */
  sheets = new WeakMap<ProseMirrorNode, WordCjkKeptSheet>();
  /** Bumped for a sheet element whenever its DOM content changes without
   * its node changing (a formula typeset in place of its placeholder, a
   * node view drawn again): what the kept path reads of a block's text. */
  private sheetEpochs = new WeakMap<Element, number>();
  private observer: MutationObserver | null = null;
  private observedRoot: Element | null = null;
  /** Sheets with no DOM change at all (attributes included) since a pass
   * within the horizon read every block of them, with the layout then. */
  private unchangedSheets: SheetMeasureMemo<string> | null = null;

  /** Watch `root`'s sheets for DOM content changes (once per root). */
  watchSheets(root: Element): void {
    if (this.observedRoot === root || typeof MutationObserver === "undefined") return;
    this.observer?.disconnect();
    this.observedRoot = root;
    this.observer = new MutationObserver((records) => this.noteMutations(records));
    this.observer.observe(root, { subtree: true, childList: true, characterData: true });
    this.unchangedSheets?.disconnect();
    this.unchangedSheets = root instanceof HTMLElement ? new SheetMeasureMemo<string>(root) : null;
  }

  /** Whether `sheet`, holding `node`, is as a pass within the horizon read it
   * at `layout`, nothing in it changed since. */
  sheetUnchangedSince(sheet: HTMLElement, node: ProseMirrorNode, layout: string): boolean {
    return this.unchangedSheets?.get(sheet, node) === layout;
  }

  noteSheetRead(sheet: HTMLElement, node: ProseMirrorNode, layout: string): void {
    this.unchangedSheets?.set(sheet, node, layout);
  }

  private noteMutations(records: readonly MutationRecord[]): void {
    let last: Element | null = null;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const sheet = target?.closest("article[data-page-sheet]") ?? null;
      if (!sheet || sheet === last) continue;
      last = sheet;
      this.sheetEpochs.set(sheet, (this.sheetEpochs.get(sheet) ?? 0) + 1);
    }
  }

  /** The DOM epoch of `sheet`, with every change made so far counted. */
  sheetEpoch(sheet: Element): number {
    if (this.observer) this.noteMutations(this.observer.takeRecords());
    return this.sheetEpochs.get(sheet) ?? 0;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedRoot = null;
    this.unchangedSheets?.disconnect();
    this.unchangedSheets = null;
  }

  clear(): void {
    this.blocks = new WeakMap();
    this.numberingMarkers = new WeakMap();
    this.sheets = new WeakMap();
    this.unchangedSheets?.clear();
    this.numberingMetrics.clear();
    this.glyphBaselines.clear();
    this.canvasFaces.clear();
    this.domAdvances.clear();
  }

  bindRootLayout(key: string): void {
    if (key !== this.rootLayoutKey) {
      this.clear();
      this.rootLayoutKey = key;
    }
  }
}

/**
 * Development counters of the East Asian spacing projection, kept only when
 * a harness creates `window.__docsCjkStats = {}` before the page runs: per
 * pass, how many blocks were drawn from a sheet's record, drawn from their
 * kept spacing, or read afresh, and of those read whether the block was read
 * before (its node, element or text) and why it was read again -- its kept
 * spacing under another key (which part of the key changed) or none kept.
 * They tell a first read of a long document from work done again.
 */
interface WordCjkProjectionStats {
  calls: number;
  ms: number;
  sheetsReplayed: number;
  blocksReplayed: number;
  blocksKept: number;
  blocksRead: number;
  readMs: number;
  firstReads: number;
  readAgain: number;
  keyChanged: number;
  keyParts: Record<string, number>;
  noEntryAgain: number;
  /** Read for the first time as this node and element, but a block of the
   * same text was read before (a document loaded anew, or repeated text). */
  sameTextAgain: number;
}

const wordCjkReadNodes = new WeakSet<ProseMirrorNode>();
const wordCjkReadElements = new WeakSet<HTMLElement>();
const wordCjkReadTexts = new Set<string>();

function wordCjkProjectionStats(view: EditorView): WordCjkProjectionStats | null {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsCjkStats?: Partial<WordCjkProjectionStats> }) | null;
  const stats = win?.__docsCjkStats;
  if (!stats || typeof stats !== "object") return null;
  for (const field of ["calls", "ms", "sheetsReplayed", "blocksReplayed", "blocksKept", "blocksRead", "readMs", "firstReads", "readAgain", "keyChanged", "noEntryAgain", "sameTextAgain"] as const) {
    if (typeof stats[field] !== "number") stats[field] = 0;
  }
  if (!stats.keyParts || typeof stats.keyParts !== "object") stats.keyParts = {};
  return stats as WordCjkProjectionStats;
}

/** Which parts of a block's spacing key (blockCacheKey) differ: development. */
function wordCjkKeyPartsChanged(before: string, now: string): string[] {
  let a: unknown[];
  let b: unknown[];
  try {
    a = JSON.parse(before) as unknown[];
    b = JSON.parse(now) as unknown[];
  } catch {
    return ["unreadable"];
  }
  const names = ["width", "compression", "language", "spaceCompression", "autoSpaceDe", "autoSpaceDn", "pendingMath"];
  const parts = new Set<string>();
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (JSON.stringify(a[index]) === JSON.stringify(b[index])) continue;
    parts.add(index < names.length ? names[index]! : index < names.length + 9 ? "font" : "viewport");
  }
  return [...parts];
}

export function wordCjkSpacingProjection(
  view: EditorView,
  cache?: WordCjkSpacingProjectionCache,
  /** `reuseSheets: false` draws every kept block from its own reads (a check
   * of the per-sheet records against the reads they stand for). */
  options: { readonly reuseSheets?: boolean } = {},
): {
  decorations: DecorationSet;
  signature: string;
  complete: boolean;
  continuationReflow: boolean;
  markerReflow?: boolean;
  /** A paragraph's hanging/boundary decisions wait for the layout the
   * published first change produces. */
  terminalReflow?: boolean;
} {
  recordProjectedHorizon(view.dom, WORD_CJK_HORIZON_KEY);
  const cjkStats = wordCjkProjectionStats(view);
  if (cjkStats) cjkStats.calls += 1;
  cache?.watchSheets(view.dom);
  cache?.bindRootLayout(JSON.stringify(Object.fromEntries(
    Object.entries(view.state.doc.attrs).filter(([key]) =>
      key !== "pageBlockSizes" && key !== "pageBlockLayoutKey" && key !== PAGE_REGION_RECEIPT,
    ),
  )));
  const markerDecorations: Decoration[] = [];
  const markerSignatures: string[] = [];
  let markersComplete = true;
  let markerReflow = false;
  const fontPlan = documentDisplayFontPluginKey.getState(view.state)?.plan;
  const measurementCache=cache?.numberingMetrics??new Map<string,ReturnType<typeof measureOfficeGlyphBaselineOffset>>();
  const deferredMeasurements=new Map<string,OfficeGlyphBaselineOptions>();
  const markerInputs:Array<{element:HTMLElement;block:ProseMirrorNode;marker:ReturnType<typeof documentNumberingMarker>}>=[];
  // Sheet by sheet, each unchanged sheet's matches kept (querySheetsAll):
  // both walks matched every element of a long book on every keystroke.
  // A marker is drawn from its paragraph's own layout (its label against the
  // paragraph's first glyph) and its list: one whose paragraph and list nodes,
  // sheet DOM and layout are as when it was drawn is drawn again, moved with
  // its paragraph. Every list paragraph of a long document was measured again
  // on every keystroke (15-22 ms a key: the book, R286-D01).
  const markerLayout = `${(view.dom as HTMLElement).clientWidth}|${window.devicePixelRatio}|${window.visualViewport?.scale}|${window.innerWidth}|${window.innerHeight}`;
  const keptMarkers = new Map<HTMLElement, Omit<KeptNumberingMarker, "marker">>();
  for (const element of querySheetsAll(view.dom as HTMLElement, "ol > li > p")) {
    let block: ProseMirrorNode;
    let contentFrom: number;
    let list: ProseMirrorNode | null = null;
    try {
      contentFrom = view.posAtDOM(element, 0);
      const $from = view.state.doc.resolve(contentFrom);
      block = $from.parent;
      list = $from.depth >= 2 ? $from.node($from.depth - 2) : null;
    }
    catch { continue; }
    const sheet = cache ? (sheetOfQueried(element) as HTMLElement | null) : null;
    const epoch = sheet && cache ? cache.sheetEpoch(sheet) : -1;
    const kept = cache?.numberingMarkers.get(element);
    if (kept && epoch >= 0 && kept.block === block && kept.list === list && kept.epoch === epoch && kept.layout === markerLayout) {
      markerInputs.push({ element, block, marker: shiftedNumberingMarker(kept.marker, contentFrom - kept.contentFrom) });
      continue;
    }
    const marker = documentNumberingMarker({ view, element, block, fontPlan,
      measurementCache,deferredMeasurements });
    markerInputs.push({element,block,marker});
    if (epoch >= 0) keptMarkers.set(element, { block, list, epoch, layout: markerLayout, contentFrom });
  }
  // Keep the existing exact font/glyph/line-height keys. Read all missing
  // probes after one bounded attachment, before publishing any marker state.
  const requests=[...deferredMeasurements];
  const measurements=measureOfficeGlyphBaselineOffsets(view.dom.ownerDocument,requests.map(([,options])=>options));
  measurements.forEach((value,index)=>{if(value)measurementCache.set(requests[index][0],value);});
  for(const input of markerInputs){
    const {element,block}=input;
    const marker=input.marker.complete?input.marker:documentNumberingMarker({view,element,block,fontPlan,measurementCache,deferredMeasurements});
    const keep = keptMarkers.get(element);
    if (keep && marker.complete && cache) cache.numberingMarkers.set(element, { ...keep, marker });
    markersComplete &&= marker.complete;
    if (marker.measurement && Math.abs(
      Number.parseFloat(getComputedStyle(element).textIndent) - marker.measurement.firstLineIndentPx,
    ) > 0.001) markerReflow = true;
    for (const paint of [marker.paragraph, marker.listItem])
      if (paint) markerDecorations.push(Decoration.node(paint.from, paint.to, paint.attrs));
    if (marker.signature !== "none") markerSignatures.push(marker.signature);
  }
  const markerSignature = markerSignatures.join("|");
  const { decorations: gridRunDecorations, signature: gridRunSignature } = wordGridDecorations(view.state.doc);
  const effectiveSpacing = effectiveDocumentCharacterSpacingControl(
    view.state.doc.attrs,
  );
  const compressionEnabled =
    effectiveSpacing === "compressPunctuation" ||
    effectiveSpacing === "compressPunctuationAndJapaneseKana";
  const documentEastAsianLanguage = normalizeDocumentEastAsianLanguage(
    view.state.doc.attrs.eastAsianLanguage,
  );
  const spaceCompression = wordSpaceCompressionFor(
    view.state.doc.attrs,
    compressionEnabled,
  );
  if (!documentHasEastAsianText(view.state.doc)) {
    return {
      decorations: DecorationSet.create(view.state.doc, [...gridRunDecorations, ...markerDecorations]),
      signature: [gridRunSignature, markerSignature].filter(Boolean).join("|") || "none",
      complete: markersComplete,
      continuationReflow: markerDecorations.length > 0,
      markerReflow,
    };
  }

  const decorationSpecs: WordCjkSpacingSpec[] = [];
  const terminalSpecs: TerminalPunctuationSpec[] = [];
  const terminalBlocks: Array<{
    element: HTMLElement;
    glyphs: WordCjkDomGlyph[];
    specs: WordCjkSpacingSpec[];
    cacheNode: ProseMirrorNode | null;
    cacheKey: string;
    blockContentFrom: number;
  }> = [];
  let spacingMarks = 0;
  let complete = markersComplete;
  const advanceSources: WordCjkAdvanceSources = cache ?? { canvasFaces: new Map(), domAdvances: new Map() };
  const blocks = querySheetsAll(view.dom as HTMLElement, WORD_CJK_BLOCK_SELECTOR);
  // A long document laid out progressively: only the sheets the page ledger
  // measures now are read (measureHorizon). A block on another sheet keeps
  // the spacing projected for it before, read from the cache without its
  // geometry (reading it would lay out a sheet nobody has reached yet, on
  // every pass); one never projected waits for the pass that reaches it.
  const withinSheets = sheetsWithinMeasureHorizon(view.dom);
  const projects = (element: HTMLElement) =>
    !withinSheets || withinSheets.has(sheetOfQueried(element) ?? element);
  // Every block's width and computed font are read before any block is
  // spaced: read between one block's spacing writes and the next, each read
  // laid the page out again (seconds per projection on a long book).
  const reuseSheets = options.reuseSheets !== false;
  // A sheet within the horizon read whole by an earlier pass and unchanged
  // since (no DOM change, attributes included, at the same widths and
  // viewport) draws what it kept, as a sheet outside the horizon does: every
  // pass read the width and font of every block of every sheet the horizon
  // spans (twenty to forty on the 296-page book), most of them untouched.
  const sheetLayout = `${(view.dom as HTMLElement).clientWidth}|${window.devicePixelRatio}|${window.visualViewport?.scale}|${window.innerWidth}|${window.innerHeight}`;
  const readWhole = new Map<HTMLElement, { node: ProseMirrorNode; from: number; blocks: Array<{ node: ProseMirrorNode; offset: number; entry?: WordCjkKeptBlock; awaitsTerminal?: boolean }>; whole: boolean }>();
  const readingSheet = (element: HTMLElement) => {
    const article = sheetOfQueried(element) as HTMLElement | null;
    return article ? readWhole.get(article) : undefined;
  };
  const wholeRecords = new Map<Element, { sheet: { node: ProseMirrorNode; from: number }; record: WordCjkKeptSheet } | null>();
  const wholeRecordOf = (article: Element | null) => {
    if (!article || !cache || !reuseSheets || !(article instanceof HTMLElement)) return null;
    let found = wholeRecords.get(article);
    if (found !== undefined) return found;
    found = null;
    try {
      const from = view.posAtDOM(article, 0) - 1;
      const node = from >= 0 ? view.state.doc.nodeAt(from) : null;
      const record = node?.type.name === PAGE_BLOCK_NODE ? cache.sheets.get(node) : undefined;
      if (
        node && record && record.measuredAt === sheetLayout && record.sheet.deref() === article &&
        record.epoch === cache.sheetEpoch(article) && cache.sheetUnchangedSince(article, node, sheetLayout) &&
        record.blocks.every((block) => cache.blocks.get(block.node) === block.entry)
      ) found = { sheet: { node, from }, record };
    } catch {
      found = null;
    }
    wholeRecords.set(article, found);
    return found;
  };
  const prefetchedWidths = new Map<HTMLElement, ReturnType<typeof wordCjkBlockContentWidth>>();
  const prefetchedStyles = new Map<HTMLElement, string[]>();
  // The key a block's kept spacing is drawn under: its text block (when the
  // element still shows that block's words), width, computed font and the
  // document's spacing settings and viewport.
  const blockCacheKey = (
    element: HTMLElement,
    blockText: string,
    widths: NonNullable<ReturnType<typeof wordCjkBlockContentWidth>>,
    blockContentFrom: number,
    fontKey: string[],
  ): { cacheNode: ProseMirrorNode; cacheKey: string } | null => {
    const resolved = view.state.doc.resolve(blockContentFrom);
    if (!resolved.parent.isTextblock || resolved.parent.textContent !== blockText) return null;
    return {
      cacheNode: resolved.parent,
      cacheKey: JSON.stringify([
        widths, compressionEnabled, documentEastAsianLanguage, spaceCompression,
        element.dataset.autoSpaceDe, element.dataset.autoSpaceDn,
        // A formula yet to be typeset stands in the line at another width, and
        // at another again once its box is known: read at the width of its
        // source, a line that needs its punctuation compressed was kept without
        // (a book's paragraphs a row longer than they print, until scrolled to).
        Array.from(element.querySelectorAll<HTMLElement>("[data-math-pending]"), (formula) =>
          formula.style.getPropertyValue("--math-placeholder-width")),
        ...fontKey,
        window.devicePixelRatio,
        window.visualViewport?.scale, window.innerWidth, window.innerHeight,
      ]),
    };
  };
  // A block of a changed sheet whose kept spacing still holds (its node,
  // width and font unchanged: every other block of the sheet a keystroke
  // edits) needs none of its characters' advances read.
  const keptBeforeRead = new Set<HTMLElement>();
  for (const element of blocks) {
    if (!projects(element)) continue;
    // A sheet drawn whole from its record needs none of its blocks' text: read
    // first, every block of every sheet within the horizon was read again at
    // every key (5.6 ms a key on the book).
    if (wholeRecordOf(sheetOfQueried(element))) continue;
    const ownText = wordCjkOwnText(element);
    if (!WORD_CJK_EAST_ASIAN_RE.test(ownText)) continue;
    prefetchedWidths.set(element, wordCjkBlockContentWidth(element));
    const style = getComputedStyle(element);
    const fontKey = [
      style.font, style.fontFamily, style.fontSize, style.fontWeight,
      style.fontStyle, style.letterSpacing, style.wordSpacing,
      style.direction, style.writingMode,
    ];
    prefetchedStyles.set(element, fontKey);
    const widths = prefetchedWidths.get(element);
    if (cache && widths) {
      try {
        const keyed = blockCacheKey(element, ownText, widths, view.posAtDOM(element, 0), fontKey);
        if (keyed && cache.blocks.get(keyed.cacheNode)?.key === keyed.cacheKey) keptBeforeRead.add(element);
      } catch {
        // Read as before: the block takes the fresh-measure path below.
      }
    }
  }
  // The DOM advances every block to be read still needs, laid out in one
  // batch: each block measured its own new characters, a layout of the
  // measuring box apiece (0.75 s of one background step's flush on the
  // 298-page book). A block then finds its characters read already.
  // One computed style per run for the whole pass: the batch below and each
  // block's own glyph read share it (each read them again: ~0.65 s of style
  // lookups in two minutes of the 298-page book's background layout).
  const batchStyles = new WeakMap<HTMLElement, WordCjkDomTextStyle>();
  const advanceTargets = [...prefetchedWidths.keys()].filter((element) => !keptBeforeRead.has(element));
  const advanceCanvas = advanceTargets.length > 1 ? wordCjkCanvasMeasurementContext() : null;
  if (advanceCanvas) {
    readWordCjkDomAdvances(advanceTargets, advanceCanvas, (parent) => {
      let textStyle = batchStyles.get(parent);
      if (!textStyle) batchStyles.set(parent, (textStyle = wordCjkDomTextStyle(parent)));
      return textStyle;
    }, advanceSources);
  }
  // A sheet outside the horizon whose node is the one it was when its kept
  // spacing was last drawn, each block still holding the cache entry it drew,
  // draws that again from the sheet's record: no text, position or node of
  // any of its blocks is read (every pass read them for the whole book).
  let recording: {
    article: Element;
    epoch: number;
    sheet: ProseMirrorNode;
    sheetFrom: number;
    blocks: WordCjkKeptSheetBlock[];
  } | null = null;
  const finishRecording = () => {
    if (recording && cache) {
      cache.sheets.set(recording.sheet, { sheet: new WeakRef(recording.article), epoch: recording.epoch, blocks: recording.blocks });
    }
    recording = null;
  };
  const replayed = new Set<Element>();
  // The sheets in order, once: asked of the view and the document, each sheet's
  // place is a walk of the sheets before it, for every sheet, after every key.
  let sheetPlaces: Map<Element, { node: ProseMirrorNode; from: number }> | null = null;
  const placeOfSheet = (article: Element) => {
    if (!sheetPlaces) {
      sheetPlaces = new Map();
      const articles = sheetsOf(view.dom);
      if (articles.length === view.state.doc.childCount) {
        const places = sheetPlaces;
        view.state.doc.forEach((node, from, index) => {
          if (node.type.name === PAGE_BLOCK_NODE) places.set(articles[index], { node, from });
        });
      }
    }
    return sheetPlaces.get(article);
  };
  const sheetOf = (article: Element): { node: ProseMirrorNode; from: number } | null => {
    const place = placeOfSheet(article);
    if (place) return place;
    try {
      const from = view.posAtDOM(article, 0) - 1;
      const node = from >= 0 ? view.state.doc.nodeAt(from) : null;
      return node?.type.name === PAGE_BLOCK_NODE ? { node, from } : null;
    } catch {
      return null;
    }
  };
  for (const element of blocks) {
    const article = sheetOfQueried(element);
    const inHorizon = !withinSheets || withinSheets.has(article ?? element);
    if (recording && recording.article !== article) finishRecording();
    if (inHorizon && cache && reuseSheets && article instanceof HTMLElement && !readWhole.has(article)) {
      if (replayed.has(article)) continue;
      const kept = wholeRecordOf(article);
      if (kept) {
        replayed.add(article);
        if (cjkStats) {
          cjkStats.sheetsReplayed += 1;
          cjkStats.blocksReplayed += kept.record.blocks.length;
        }
        for (const block of kept.record.blocks) {
          const entry = block.entry;
          if (!entry) continue;
          const keptFrom = kept.sheet.from + block.offset;
          spacingMarks += entry.specs.length;
          if (spacingMarks > MAX_WORD_CJK_SPACING_MARKS) {
            return {
              decorations: DecorationSet.create(view.state.doc, [...gridRunDecorations, ...markerDecorations]),
              signature: [gridRunSignature, markerSignature, "overflow"].filter(Boolean).join("|"),
              complete: markersComplete,
              continuationReflow: markerDecorations.length > 0,
              markerReflow,
            };
          }
          decorationSpecs.push(...entry.specs.map((spec) => ({
            ...spec, from: spec.from + keptFrom, to: spec.to + keptFrom,
          })));
          terminalSpecs.push(...entry.terminalSpecs.map((spec) => ({
            ...spec, from: spec.from + keptFrom, to: spec.to + keptFrom,
          })));
        }
        continue;
      }
      const sheet = sheetOf(article);
      if (sheet) readWhole.set(article, { node: sheet.node, from: sheet.from, blocks: [], whole: true });
    }
    if (!inHorizon && cache && article && !recording) {
      if (replayed.has(article)) continue;
      const sheet = sheetOf(article);
      const record = sheet ? cache.sheets.get(sheet.node) : undefined;
      const epoch = cache.sheetEpoch(article);
      if (
        reuseSheets && sheet && record &&
        record.sheet.deref() === article && record.epoch === epoch &&
        record.blocks.every((block) => cache.blocks.get(block.node) === block.entry)
      ) {
        replayed.add(article);
        if (cjkStats) {
          cjkStats.sheetsReplayed += 1;
          cjkStats.blocksReplayed += record.blocks.length;
        }
        for (const block of record.blocks) {
          const kept = block.entry;
          if (!kept) continue;
          const outsideFrom = sheet.from + block.offset;
          spacingMarks += kept.specs.length;
          if (spacingMarks > MAX_WORD_CJK_SPACING_MARKS) {
            return {
              decorations: DecorationSet.create(view.state.doc, [...gridRunDecorations, ...markerDecorations]),
              signature: [gridRunSignature, markerSignature, "overflow"].filter(Boolean).join("|"),
              complete: markersComplete,
              continuationReflow: markerDecorations.length > 0,
              markerReflow,
            };
          }
          decorationSpecs.push(...kept.specs.map((spec) => ({
            ...spec, from: spec.from + outsideFrom, to: spec.to + outsideFrom,
          })));
          terminalSpecs.push(...kept.terminalSpecs.map((spec) => ({
            ...spec, from: spec.from + outsideFrom, to: spec.to + outsideFrom,
          })));
        }
        continue;
      }
      if (sheet) recording = { article, epoch, sheet: sheet.node, sheetFrom: sheet.from, blocks: [] };
    }
    const blockText = wordCjkOwnText(element);
    if (!WORD_CJK_EAST_ASIAN_RE.test(blockText)) continue;
    if (!inHorizon) {
      if (!cache) continue;
      let outsideFrom = 0;
      let outsideNode: ProseMirrorNode | null = null;
      try {
        outsideFrom = view.posAtDOM(element, 0);
        const resolved = view.state.doc.resolve(outsideFrom);
        if (resolved.parent.isTextblock && resolved.parent.textContent === blockText) outsideNode = resolved.parent;
      } catch {
        outsideNode = null;
      }
      const kept = outsideNode ? cache.blocks.get(outsideNode) : undefined;
      if (outsideNode && recording) {
        recording.blocks.push({ node: outsideNode, offset: outsideFrom - recording.sheetFrom, entry: kept });
      }
      if (!kept) continue;
      spacingMarks += kept.specs.length;
      if (spacingMarks > MAX_WORD_CJK_SPACING_MARKS) {
        return {
          decorations: DecorationSet.create(view.state.doc, [...gridRunDecorations, ...markerDecorations]),
          signature: [gridRunSignature, markerSignature, "overflow"].filter(Boolean).join("|"),
          complete: markersComplete,
          continuationReflow: markerDecorations.length > 0,
          markerReflow,
        };
      }
      decorationSpecs.push(...kept.specs.map((spec) => ({
        ...spec, from: spec.from + outsideFrom, to: spec.to + outsideFrom,
      })));
      terminalSpecs.push(...kept.terminalSpecs.map((spec) => ({
        ...spec, from: spec.from + outsideFrom, to: spec.to + outsideFrom,
      })));
      continue;
    }
    // From compatibility mode 15 Word compresses only a justified or
    // distributed paragraph's punctuation (wordPunctuationCompresses).
    const blockCompresses =
      compressionEnabled &&
      wordPunctuationCompresses(
        view.state.doc.attrs.wordCompatibilityMode,
        element.getAttribute("data-text-align") ?? getComputedStyle(element).textAlign,
      );
    const hasCompressiblePunctuation =
      blockCompresses &&
      Array.from(blockText).some(
        (character) =>
          wordCjkPunctuationRole(character) !== null || /[\u2018\u2019\u201c\u201d]/u.test(character),
      );
    const hasAutoSpaceBoundary = /[A-Za-z0-9]/u.test(blockText) && !wordOmitsEastAsianAutoSpace(view.state.doc.attrs);
    const hasHangingPunctuation = /[、。，：；]/u.test(blockText);
    if (!hasCompressiblePunctuation && !hasAutoSpaceBoundary && !hasHangingPunctuation) continue;
    const eligibility = wordCjkDomEligibility(view, element);
    // Static unsupported content is not waiting for layout. Do not project
    // it, or repeatedly advertise pending work that no retry can resolve.
    if (eligibility.status === "unsupported") continue;
    if (eligibility.status === "pending") {
      complete = false;
      const reading = readingSheet(element);
      if (reading) reading.whole = false;
      continue;
    }
    const widths = prefetchedWidths.has(element) ? prefetchedWidths.get(element) ?? null : wordCjkBlockContentWidth(element);
    let cacheNode: ProseMirrorNode | null = null;
    let blockContentFrom = 0;
    let cacheKey = "";
    if (cache && widths) {
      try {
        blockContentFrom = view.posAtDOM(element, 0);
        const keyed = blockCacheKey(element, blockText, widths, blockContentFrom, prefetchedStyles.get(element) ?? (() => {
          const style = getComputedStyle(element);
          return [
            style.font, style.fontFamily, style.fontSize, style.fontWeight,
            style.fontStyle, style.letterSpacing, style.wordSpacing,
            style.direction, style.writingMode,
          ];
        })());
        if (keyed) ({ cacheNode, cacheKey } = keyed);
      } catch {
        // A transitioning NodeView must take the existing fresh-measure path.
        cacheNode = null;
      }
    }
    const cached = cacheNode ? cache?.blocks.get(cacheNode) : undefined;
    const reading = readingSheet(element);
    if (cached?.key === cacheKey) {
      if (cjkStats) cjkStats.blocksKept += 1;
      if (reading && cacheNode) reading.blocks.push({ node: cacheNode, offset: blockContentFrom - reading.from, entry: cached });
      spacingMarks += cached.specs.length;
      if (spacingMarks <= MAX_WORD_CJK_SPACING_MARKS) {
        decorationSpecs.push(...cached.specs.map((spec) => ({
          ...spec, from: spec.from + blockContentFrom, to: spec.to + blockContentFrom,
        })));
        terminalSpecs.push(...cached.terminalSpecs.map((spec) => ({
          ...spec, from: spec.from + blockContentFrom, to: spec.to + blockContentFrom,
        })));
        continue;
      }
      return {
        decorations: DecorationSet.create(view.state.doc, [...gridRunDecorations, ...markerDecorations]),
        signature: [gridRunSignature, markerSignature, "overflow"].filter(Boolean).join("|"),
        complete: markersComplete,
        continuationReflow: markerDecorations.length > 0,
        markerReflow,
      };
    }
    const readStarted = cjkStats ? performance.now() : 0;
    const read = wordCjkDomGlyphs(view, element, eligibility, advanceSources, {
      textStyles: batchStyles,
      advancesRead: advanceCanvas !== null && prefetchedWidths.has(element) && !keptBeforeRead.has(element),
    });
    if (cjkStats) {
      cjkStats.readMs += performance.now() - readStarted;
      cjkStats.blocksRead += 1;
      const before = (cacheNode !== null && wordCjkReadNodes.has(cacheNode)) || wordCjkReadElements.has(element);
      if (!before && wordCjkReadTexts.has(blockText)) cjkStats.sameTextAgain += 1;
      if (!before) cjkStats.firstReads += 1;
      else {
        cjkStats.readAgain += 1;
        if (cached) {
          cjkStats.keyChanged += 1;
          for (const part of wordCjkKeyPartsChanged(cached.key, cacheKey)) cjkStats.keyParts[part] = (cjkStats.keyParts[part] ?? 0) + 1;
        } else cjkStats.noEntryAgain += 1;
      }
      if (cacheNode) wordCjkReadNodes.add(cacheNode);
      wordCjkReadElements.add(element);
      wordCjkReadTexts.add(blockText);
    }
    if (read.status === "unsupported") continue;
    if (!widths || read.status === "pending" || read.glyphs.length === 0) {
      complete = false;
      if (reading) reading.whole = false;
      continue;
    }
    if (reading) {
      if (cacheNode) reading.blocks.push({ node: cacheNode, offset: blockContentFrom - reading.from, awaitsTerminal: true });
      else reading.whole = false;
    }
    const glyphs = read.glyphs;
    if (spacingMarks > MAX_WORD_CJK_SPACING_MARKS) {
      return {
        decorations: DecorationSet.create(view.state.doc, [...gridRunDecorations, ...markerDecorations]),
        signature: [gridRunSignature, markerSignature, "overflow"].filter(Boolean).join("|"),
        complete: markersComplete,
        continuationReflow: markerDecorations.length > 0,
        markerReflow,
      };
    }
    applyWordCjkAutoSpacing(element, glyphs, view.state.doc.attrs);
    const punctuationAdjustments = blockCompresses
      ? planWordCjkPunctuationCompression(
          glyphs,
          widths,
          wordCjkPairCompression(glyphs, documentEastAsianLanguage),
          spaceCompression,
          documentEastAsianLanguage,
        ).lines.flatMap((line) => line.adjustments)
      : [];
    const punctuationByIndex = new Map(
      punctuationAdjustments.map((adjustment) => [
        adjustment.index,
        adjustment,
      ]),
    );
    const specStart = decorationSpecs.length;
    // White space that ends the paragraph hangs past the margin in Word: a
    // paragraph that ends "。 " wraps on the width of the mark, yet the space
    // is still drawn and the insertion point moves past it as it is typed.
    // The editor keeps break-spaces, where a trailing space is charged to
    // its line and cannot break away from the mark before it, so such a
    // space is set pre-wrap: its preserved white space hangs at the line end
    // (CSS Text 3), keeping its advance for the caret without taking line
    // width. Cancelling its advance instead (letter spacing) made a space
    // typed at the end of a line invisible until the next character came.
    let trailingWhiteSpaceFrom = glyphs.length;
    while (trailingWhiteSpaceFrom > 0 && /^\s$/u.test(glyphs[trailingWhiteSpaceFrom - 1].character)) {
      trailingWhiteSpaceFrom -= 1;
    }
    glyphs.forEach((glyph, index) => {
      if (glyph.object) return;
      const punctuation = punctuationByIndex.get(index);
      const trailingWhiteSpace = index >= trailingWhiteSpaceFrom;
      const paintedAdvancePx = glyph.widthPx - glyph.fontAdvanceCorrectionPx;
      let marginStartPx = glyph.autoSpaceBeforePx;
      let marginEndPx = trailingWhiteSpace ? 0 : glyph.autoSpaceAfterPx + glyph.fontAdvanceCorrectionPx;
      let letterSpacingPx = glyph.baseLetterSpacingPx;
      let overrideLetterSpacing = false;
      const hang = trailingWhiteSpace && paintedAdvancePx > 0.001;
      if (punctuation?.role === "open") {
        marginStartPx -= punctuation.trimPx;
      } else if (punctuation?.role === "close" || punctuation?.role === "space") {
        // A close mark's visible ink occupies the logical-start half of its
        // cell. Reducing only this one-character advance keeps that ink fixed
        // while allowing the following character (or the line end) to use the
        // trailing side-bearing. A negative end margin is not considered by
        // Chromium's terminal kinsoku fit and strands the final mark.
        letterSpacingPx -= punctuation.trimPx;
        overrideLetterSpacing = true;
      } else if (punctuation?.role === "center") {
        marginStartPx -= punctuation.trimPx / 2;
        marginEndPx -= punctuation.trimPx / 2;
      }
      if (
        Math.abs(marginStartPx) < 0.001 &&
        Math.abs(marginEndPx) < 0.001 &&
        !overrideLetterSpacing &&
        !hang
      ) {
        return;
      }
      decorationSpecs.push({
        from: glyph.from,
        to: glyph.to,
        marginStartPx,
        marginEndPx,
        letterSpacingPx,
        baseLetterSpacingPx: glyph.baseLetterSpacingPx,
        overrideLetterSpacing,
        ...(hang ? { hang } : {}),
        punctuationRole: punctuation?.role ?? null,
      });
    });
    spacingMarks += decorationSpecs.length - specStart;
    terminalBlocks.push({
      element,
      glyphs,
      specs: decorationSpecs.slice(specStart),
      cacheNode,
      cacheKey,
      blockContentFrom,
    });
  }

  finishRecording();

  
  // source-relative cache and readiness publication. No new scheduler. Its
  // rules compare lines across faces, so every face they read is probed in one
  // attachment first: the box of a glyph, fallback glyphs included, is its
  // computed primary face's box, whatever character is drawn.
  const baselines = cache?.glyphBaselines ?? new Map<string, number | null>();
  const candidates = terminalBlocks.map((block) =>
    documentTerminalPunctuationApplies(view, block.element),
  );
  // Blocks whose automatic spaces may stand at a line edge read their lines
  // by the same baselines.
  const edgeCandidates = terminalBlocks.map((block) =>
    !wordAutoSpaceEdgesOff() &&
    block.glyphs.some((glyph) => glyph.autoSpaceBeforePx > 0 || glyph.autoSpaceAfterPx > 0),
  );
  const faces = [...new Set(terminalBlocks.flatMap((block, index) =>
    candidates[index] || edgeCandidates[index] ? block.glyphs.map((glyph) => glyph.font) : [],
  ))].filter((font) => !baselines.has(font));
  measureOfficeGlyphBaselineOffsets(
    view.dom.ownerDocument,
    faces.map((font) => ({ font, character: "H" })),
  ).forEach((measured, index) => {
    baselines.set(faces[index], measured?.glyphBaselineOffsetPx ?? null);
  });
  let terminalReflow = false;
  const freshlyKept = new Set<ProseMirrorNode>();
  terminalBlocks.forEach((block, index) => {
    let terminal = { specs: [] as readonly TerminalPunctuationSpec[], complete: true, settled: true };
    if (candidates[index] || edgeCandidates[index]) {
      for (const glyph of block.glyphs) glyph.baselineOffsetPx = baselines.get(glyph.font) ?? Number.NaN;
    }
    if (candidates[index]) {
      terminal = documentTerminalPunctuation({ view, element: block.element, glyphs: block.glyphs });
    }
    const edges = edgeCandidates[index] ? applyWordAutoSpaceLineEdges(view, block.element, block.glyphs, block.specs) : { complete: true, settled: true };
    complete &&= terminal.complete && edges.complete;
    terminalReflow ||= !terminal.settled || !edges.settled;
    terminalSpecs.push(...terminal.specs);
    const { cacheNode, blockContentFrom } = block;
    if (cacheNode && cache && terminal.complete && terminal.settled && edges.complete && edges.settled) {
      freshlyKept.add(cacheNode);
      cache.blocks.set(cacheNode, {
        key: block.cacheKey,
        glyphCount: block.glyphs.length,
        specs: block.specs.map((spec) => ({
          ...spec, from: spec.from - blockContentFrom, to: spec.to - blockContentFrom,
        })),
        terminalSpecs: terminal.specs.map((spec) => ({
          ...spec, from: spec.from - blockContentFrom, to: spec.to - blockContentFrom,
        })),
      });
    }
  });

  // The sheets read whole are kept as their blocks now stand in the cache.
  if (cache) {
    for (const [article, reading] of readWhole) {
      if (!reading.whole) continue;
      const blocks: WordCjkKeptSheetBlock[] = [];
      let whole = true;
      for (const block of reading.blocks) {
        const entry = cache.blocks.get(block.node);
        if (block.awaitsTerminal ? !freshlyKept.has(block.node) : entry !== block.entry) { whole = false; break; }
        blocks.push({ node: block.node, offset: block.offset, entry });
      }
      if (!whole) continue;
      cache.sheets.set(reading.node, { sheet: new WeakRef(article), epoch: cache.sheetEpoch(article), blocks, measuredAt: sheetLayout });
      cache.noteSheetRead(article, reading.node, sheetLayout);
    }
  }

  decorationSpecs.sort(
    (left, right) => left.from - right.from || left.to - right.to,
  );
  const spacingSignature = decorationSpecs
    .map(
      (spec) =>
        `${spec.from}:${spec.to}:${spec.marginStartPx.toFixed(3)}:${spec.marginEndPx.toFixed(3)}:${spec.overrideLetterSpacing ? spec.letterSpacingPx.toFixed(3) : "-"}:${spec.punctuationRole ?? "auto"}${spec.hang ? ":hang" : ""}${spec.edge ? `:edge ${spec.edge}` : ""}`,
    )
    .join("|");
  const spacingDecorations = decorationSpecs.map((spec) => {
    const style = [
      Math.abs(spec.marginStartPx) >= 0.001
        ? `margin-inline-start:${spec.marginStartPx.toFixed(3)}px`
        : "",
      Math.abs(spec.marginEndPx) >= 0.001
        ? `margin-inline-end:${spec.marginEndPx.toFixed(3)}px`
        : "",
      spec.overrideLetterSpacing
        ? `letter-spacing:${spec.letterSpacingPx.toFixed(3)}px`
        : "",
      spec.hang ? "white-space:pre-wrap" : "",
    ]
      .filter(Boolean)
      .join(";");
    return Decoration.inline(
      spec.from,
      spec.to,
      {
        class: spec.punctuationRole
          ? `docs-word-cjk-spacing docs-word-cjk-spacing--${spec.punctuationRole}`
          : "docs-word-cjk-spacing docs-word-cjk-spacing--auto",
        "data-docs-word-cjk-spacing": spec.punctuationRole ?? "auto",
        ...(spec.edge ? { [WORD_AUTO_SPACE_EDGE_ATTR]: spec.edge } : {}),
        ...(spec.overrideLetterSpacing
          ? {
              "data-docs-word-cjk-base-letter-spacing":
                spec.baseLetterSpacingPx.toFixed(6),
            }
          : {}),
        style,
      },
      {
        inclusiveStart: false,
        inclusiveEnd: false,
        // Position-free, like the grid-run key above.
        key: "docs-word-cjk-spacing",
      },
    );
  });
  // Built when asked for: a pass whose signature is the published one (most
  // passes while typing, the spacing of every other page unchanged) drops
  // it, and building the set of every page's spacing cost ~0.3 s of 24 keys
  // on the 296-page book.
  const decorationDoc = view.state.doc;
  let decorations: DecorationSet | null = null;
  const builtDecorations = () => decorations ??= DecorationSet.create(decorationDoc, [
    ...gridRunDecorations,
    ...markerDecorations,
    ...spacingDecorations,
    ...terminalSpecs.map((spec) => Decoration.inline(spec.from, spec.to, spec.attributes, {
      inclusiveStart: false,
      inclusiveEnd: false,
      key: "docs-terminal-punctuation",
    })),
  ]);
  const terminalSignature = terminalSpecs
    .map((spec) => `terminal:${spec.from}:${spec.to}:${spec.letterSpacingPx}:${spec.attributes.style}`).join("|");
  const signature = [gridRunSignature, spacingSignature, terminalSignature, markerSignature]
    .filter(Boolean)
    .join("|");
  return {
    get decorations() { return builtDecorations(); },
    signature: signature || "none",
    complete,
    continuationReflow: spacingSignature.length > 0 || terminalSpecs.length > 0 || markerDecorations.length > 0,
    markerReflow,
    terminalReflow,
  };
}

/** The keys of the Word line-grid decorations (wordGridDecorations). */
const WORD_GRID_DECORATION_KEYS = new Set(["docs-word-grid-block", "docs-word-grid-natural", "docs-word-grid-run"]);

/**
 * The Word line-grid decorations of a document: a block's whole-slot line
 * height, a one-slot block's single line (the page foot's credit,
 * pageEdgeLeading) and a run's slots. Read from the document alone.
 */
function wordGridDecorations(doc: ProseMirrorNode): { decorations: Decoration[]; signature: string } {
  const gridSpecs = wordGridRunLineHeightSpecs(doc);
  const gridRunSpecs = gridSpecs.runs;
  const gridRunSignature = [
    ...gridRunSpecs.map(
      (spec) =>
        `grid:${spec.from}:${spec.to}:${spec.lineHeightPx.toFixed(3)}:${spec.slots}`,
    ),
    ...gridSpecs.blocks.map(
      (spec) => `gridBlock:${spec.pos}:${spec.lineHeightPx.toFixed(3)}:${spec.slots}:${spec.naturalPx ?? ""}`,
    ),
    ...gridSpecs.naturals.map((spec) => `gridNatural:${spec.pos}:${spec.naturalPx}`),
  ].join("|");
  const gridBlockDecorations = gridSpecs.blocks.map((spec) =>
    Decoration.node(
      spec.pos,
      spec.pos + (doc.nodeAt(spec.pos)?.nodeSize ?? 0),
      {
        "data-docs-word-grid-block-slots": String(spec.slots),
        ...(spec.naturalPx !== undefined ? { "data-docs-word-grid-natural": String(spec.naturalPx) } : {}),
        style: `line-height:${spec.lineHeightPx}px !important`,
      },
      { key: "docs-word-grid-block" },
    ),
  );
  // A one-slot block's single line, for the page's foot only (no paint).
  const gridNaturalDecorations = gridSpecs.naturals.map((spec) =>
    Decoration.node(
      spec.pos,
      spec.pos + (doc.nodeAt(spec.pos)?.nodeSize ?? 0),
      { "data-docs-word-grid-natural": String(spec.naturalPx), "data-docs-word-grid-pitch": String(Math.round(spec.pitchPx * 1_000) / 1_000) },
      { key: "docs-word-grid-natural" },
    ),
  );
  const decorations = [...gridBlockDecorations, ...gridNaturalDecorations, ...gridRunSpecs.map((spec) =>
    Decoration.inline(
      spec.from,
      spec.to,
      {
        class: "docs-word-grid-run",
        "data-docs-word-grid-run-slots": String(spec.slots),
        style: `${WORD_GRID_RUN_LINE_HEIGHT_PROPERTY}:${spec.lineHeightPx}px`,
      },
      {
        inclusiveStart: false,
        inclusiveEnd: false,
        // ProseMirror compares decoration specs to decide whether a node
        // must be redrawn. A key with document positions changes for every
        // decoration after an edit, redrawing all of them on each keystroke.
        key: "docs-word-grid-run",
      },
    ),
  )];
  return { decorations, signature: gridRunSignature };
}

/** `window.__docsGridDecoRebuildOff = true` (A/B): a block split or joined
 * waits for the next measurement to get its grid decorations back. */
function gridDecoRebuildOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsGridDecoRebuildOff?: boolean }).__docsGridDecoRebuildOff === true;
}

/**
 * A decoration set mapped through an edit that dropped a grid decoration
 * (the page ledger splits a paragraph across a page seam, or joins its
 * pieces: each piece is a new node and a node decoration does not follow
 * it) gets the document's grid decorations back from the new document in
 * the same transaction. Waiting for the next measurement, the pieces read
 * no grid line for a pass: no foot credit for the one-slot line, the
 * stylesheet's line for a whole-slot one. The ledger planned the cut with
 * the credit, read the cut pieces without it and cut a row higher, then
 * read them with it again: corpus R404-D02's page 1 cut its last paragraph
 * at 509 and 406 characters, back and forth, while anyone typed.
 */
function withGridDecorationsRebuilt(set: DecorationSet, doc: ProseMirrorNode): DecorationSet {
  const stale = set.find(undefined, undefined, (spec) => WORD_GRID_DECORATION_KEYS.has((spec as { key?: string })?.key ?? ""));
  return set.remove(stale).add(doc, wordGridDecorations(doc).decorations);
}

function wordCjkSpacingProjectionPlugin(waitForSourceFontPlan = false): Plugin<WordCjkSpacingProjectionState> {
  return new Plugin<WordCjkSpacingProjectionState>({
    key: wordCjkSpacingProjectionKey,
    state: {
      init: () => ({
        decorations: DecorationSet.empty,
        signature: "",
      }),
      apply: (tr, current) => {
        const meta = tr.getMeta(wordCjkSpacingProjectionKey) as
          WordCjkSpacingProjectionMeta | undefined;
        if (meta) {
          return meta;
        }
        if (!tr.docChanged) return current;
        let removed = false;
        let gridRemoved = false;
        const mapped = current.decorations.map(tr.mapping, tr.doc, {
          onRemove: (spec) => {
            removed = true;
            if (WORD_GRID_DECORATION_KEYS.has((spec as { key?: string })?.key ?? "")) gridRemoved = true;
          },
        });
        const decorations = gridRemoved && !gridDecoRebuildOff() ? withGridDecorationsRebuilt(mapped, tr.doc) : mapped;
        return {
          decorations,
          // Equal text can be replaced with new nodes by content hydration.
          // Mapping may drop its inline decorations even though the measured
          // spacing signature stays identical. Reapply that projection before
          // advertising settled geometry to pagination/capture consumers.
          signature: removed ? "" : current.signature,
        };
      },
    },
    props: {
      decorations: (state) =>
        wordCjkSpacingProjectionKey.getState(state)?.decorations ??
        DecorationSet.empty,
    },
    view: (view) => {
      const spacingCache = new WordCjkSpacingProjectionCache();
      let destroyed = false;
      let composing = false;
      // A pending measurement frame (its cancel). The measurement reads the
      // whole document's glyphs and restarts whenever any window loads a
      // face: background work (lib/background-work), it waits while the
      // person works in another window and runs in the frame as before while
      // nothing else goes on or the input is in this window.
      let frame: (() => void) | null = null;
      const measureLane = createBackgroundLane({
        label: "docs-cjk-spacing",
        owner: () => view.dom.closest(".wm-window") ?? view.dom,
      });
      let pendingMeasure: (() => void) | null = null;
      const onMetricsFlush = () => {
        // Waiting on the Auto line spacing projection (which flushes in the
        // same event, ahead of or behind this listener): take the frame now
        // that it may have cleared, then measure in this same frame. So does
        // a horizon the ledger moved on to sheets this projection has not
        // measured. Anything else has nothing new to measure: scheduled on
        // every flush, the whole projection ran again in each pass of every
        // keystroke (20-30 ms on the 296-page book) to publish what it had.
        if (!frame && (waitingForAutoLineSpacing ||
            !projectionCoversHorizon(view.dom, sheetsWithinMeasureHorizon(view.dom), WORD_CJK_HORIZON_KEY))) schedule();
        if (!frame || !pendingMeasure) return;
        frame();
        frame = null;
        const measure = pendingMeasure;
        pendingMeasure = null;
        measure();
      };
      let projectionRetryFrames = 0;
      // Signatures published while paragraphs still had deferred decisions.
      // A repeat is a cycle: publish it and stop measuring again.
      const terminalChain = new Set<string>();
      let retryAfterInitialPagination = false;
      let retriedAfterInitialPagination = false;
      let initialProjectionPublished = false;
      let waitingForAutoLineSpacing = false;
      const fontPlanReady = () => sourceFontPlanIsReady(view.state.doc, view.dom, waitForSourceFontPlan);
      const holdForSourceFonts = () => {
        if (fontPlanReady()) return false;
        writeDocumentLayoutStatus(view.dom, WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR, null, view);
        return true;
      };
      const MAX_TRANSIENT_PROJECTION_RETRY_FRAMES = 2;
      const INITIAL_PAGINATION_SETTLING_ATTR =
        "data-pagination-initial-settling";
      // The observer supplies the logical width after DOM construction.
      // Reading it synchronously here lays out the entire unsplit import
      // before the remaining editor and collaboration plugins can initialize.
      let observedWidth = 0;
      const publishInitialProjection = (projection: {
        signature: string;
        complete: boolean;
        continuationReflow: boolean;
      }) => {
        if (
          initialProjectionPublished ||
          !projection.continuationReflow ||
          (!projection.complete && !retriedAfterInitialPagination)
        ) {
          return;
        }
        initialProjectionPublished = true;
        view.dom.dispatchEvent(
          new CustomEvent("mrn-page-rebalance", {
            bubbles: true,
            detail: { reason: "word-cjk-spacing-projection" },
          }),
        );
      };
      const schedule = () => {
        if (destroyed || holdForSourceFonts()) return;
        // The first layout waits for the document's faces: measured once
        // they are in, at the ledger's flush (coldFirstLayout).
        if (!frame && firstLayoutHoldsFaces(view.dom, schedule, "cjk-spacing")) return;
        // Deferred measurement of one block must not suspend typography for
        // later document moves. Delete/insert page transfers can drop mapped
        // inline decorations, so rebuild the already measurable blocks before
        // the pager reads their new heights. Retry work remains frame-bounded;
        // the settle observer still revisits the unresolved blocks at the end.
        if (documentHasNumberingLayout(view.state.doc) || documentHasEastAsianText(view.state.doc)) {
          writeDocumentLayoutStatus(view.dom, WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR, "true", view);
        } else {
          writeDocumentLayoutStatus(view.dom, WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR, null, view);
        }
        if (composing || frame) return;
        if (view.dom.hasAttribute(DOCUMENT_AUTO_LINE_SPACING_PENDING)) {
          waitingForAutoLineSpacing = true;
          return;
        }
        waitingForAutoLineSpacing = false;
        // The page ledger may ask for the measurement NOW (`mrn-layout-metrics-flush`):
        // Word composes the line boxes a page depends on before it paints the
        // page, so a projection still waiting for its frame runs synchronously
        // in the frame of the keystroke instead of a frame later.
        const measure = () => {
          frame = null;
          if (destroyed || composing || holdForSourceFonts()) return;
          if (view.dom.hasAttribute(DOCUMENT_AUTO_LINE_SPACING_PENDING)) {
            waitingForAutoLineSpacing = true;
            return;
          }
          // Glyph boxes read while the window glides are drawn, not laid-out,
          // pixels: a pass then dropped a hanging space and nothing measured
          // again once the glide ended (surfaceGlide.ts). The pending flag
          // stays up until the pass after it.
          if (deferWhileSurfaceGlides(view.dom, schedule)) return;
          const projectionStarted = performance.now();
          const projection = wordCjkSpacingProjection(view, spacingCache);
          const projectionStats = wordCjkProjectionStats(view);
          if (projectionStats) projectionStats.ms += performance.now() - projectionStarted;
          if (
            !projection.complete &&
            projectionRetryFrames < MAX_TRANSIENT_PROJECTION_RETRY_FRAMES
          ) {
            projectionRetryFrames += 1;
            schedule();
            return;
          }
          if (
            !projection.complete &&
            !retriedAfterInitialPagination &&
            view.dom.hasAttribute(INITIAL_PAGINATION_SETTLING_ATTR)
          ) {
            retryAfterInitialPagination = true;
          }
          projectionRetryFrames = 0;
          const current = wordCjkSpacingProjectionKey.getState(view.state);
          if (current?.signature === projection.signature) {
            terminalChain.clear();
            writeDocumentLayoutStatus(view.dom, WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR, null, view);
            publishInitialProjection(projection);
            return;
          }
          view.dispatch(
            view.state.tr
              .setMeta(wordCjkSpacingProjectionKey, {
                decorations: projection.decorations,
                signature: projection.signature,
              } satisfies WordCjkSpacingProjectionMeta)
              .setMeta("addToHistory", false),
          );
          // Source numbering tabs can change the first line's capacity.
          // Keep paging held until hanging punctuation has measured the
          // applied indent, rather than caching a pre-marker line ending.
          // The decorations just dispatched change line boxes (grid run
          // slots, CJK spacing) without a document change; the paginator
          // measures those boxes, so every published projection announces
          // itself — not only the initial one, and also when a marker
          // reflow schedules another projection frame.
          view.dom.dispatchEvent(
            new CustomEvent("mrn-page-rebalance", {
              bubbles: true,
              detail: { reason: "word-cjk-spacing-projection" },
            }),
          );
          if (projection.markerReflow) { schedule(); return; }
          if (projection.terminalReflow && !terminalChain.has(projection.signature)) {
            terminalChain.add(projection.signature);
            schedule();
            return;
          }
          terminalChain.clear();
          writeDocumentLayoutStatus(view.dom, WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR, null, view);
          publishInitialProjection(projection);
        };
        pendingMeasure = measure;
        frame = requestLaneFrame(measureLane, () => {
          pendingMeasure = null;
          if (firstLayoutHoldsFaces(view.dom, () => { frame = null; schedule(); }, "cjk-spacing")) return;
          measure();
        });
      };
      const onSourceFontPlan = (event: Event) => {
        if (!waitForSourceFontPlan || event.target !== view.dom ||
            !(event instanceof CustomEvent) || event.detail?.reason !== "document-display-fonts") return;
        if (holdForSourceFonts()) return;
        spacingCache.clear();
        projectionRetryFrames = 0;
        retryAfterInitialPagination = false;
        retriedAfterInitialPagination = false;
        initialProjectionPublished = false;
        // Set the real measurement pending flag synchronously, before the
        // pager's window-level handler schedules its next measurement frame.
        schedule();
      };
      view.dom.addEventListener("mrn-page-rebalance", onSourceFontPlan);
      const onCompositionStart = () => {
        composing = true;
        frame?.();
        frame = null;
      };
      const onCompositionEnd = () => {
        composing = false;
        schedule();
      };
      view.dom.addEventListener("compositionstart", onCompositionStart);
      view.dom.addEventListener("compositionend", onCompositionEnd);
      view.dom.addEventListener(LAYOUT_METRICS_FLUSH_EVENT, onMetricsFlush);
      // A formula typeset where its placeholder stood changes its line's
      // widths with no change to the document: the line's punctuation is
      // planned again (its block's cache key names the placeholder width).
      const onFormulaTypeset = () => schedule();
      view.dom.addEventListener(INLINE_FORMULA_TYPESET_EVENT, onFormulaTypeset);
      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver((entries) => {
              const width = entries[0]?.contentRect.width;
              if (
                typeof width !== "number" ||
                !Number.isFinite(width) ||
                Math.abs(width - observedWidth) < 0.25
              ) {
                return;
              }
              observedWidth = width;
              schedule();
            });
      resizeObserver?.observe(view.dom);
      const settleObserver = new MutationObserver(() => {
        if (waitingForAutoLineSpacing && !view.dom.hasAttribute(DOCUMENT_AUTO_LINE_SPACING_PENDING)) schedule();
        if (
          !retryAfterInitialPagination ||
          view.dom.hasAttribute(INITIAL_PAGINATION_SETTLING_ATTR)
        ) {
          return;
        }
        retryAfterInitialPagination = false;
        retriedAfterInitialPagination = true;
        projectionRetryFrames = 0;
        schedule();
      });
      settleObserver.observe(view.dom, {
        attributes: true,
        attributeFilter: [INITIAL_PAGINATION_SETTLING_ATTR, DOCUMENT_AUTO_LINE_SPACING_PENDING],
      });
      const fonts = document.fonts;
      const onFontsReady = (event?: Event) => {
        // A face no page text draws with (the ribbon's font list, drawn when
        // the caret is first placed) changes no advance read here.
        if (projectionFontReach(view, "cjk-spacing", event) === "none") return;
        spacingCache.clear();
        schedule();
      };
      fonts?.addEventListener?.("loadingdone", onFontsReady);
      // Reading FontFaceSet.ready can synchronously force document layout.
      // The initial scheduled pass already starts with an empty font cache;
      // loadingdone above invalidates it for any fonts that arrive later.
      schedule();
      return {
        update: (_view, previousState) => {
          if (view.state.doc !== previousState.doc) schedule();
        },
        destroy: () => {
          destroyed = true;
          writeDocumentLayoutStatus(view.dom, WORD_CJK_SPACING_MEASUREMENT_PENDING_ATTR, null, view);
          frame?.();
          measureLane.dispose();
          spacingCache.dispose();
          resizeObserver?.disconnect();
          settleObserver.disconnect();
          fonts?.removeEventListener?.("loadingdone", onFontsReady);
          view.dom.removeEventListener("mrn-page-rebalance", onSourceFontPlan);
          view.dom.removeEventListener("compositionstart", onCompositionStart);
          view.dom.removeEventListener("compositionend", onCompositionEnd);
          view.dom.removeEventListener(LAYOUT_METRICS_FLUSH_EVENT, onMetricsFlush);
          view.dom.removeEventListener(INLINE_FORMULA_TYPESET_EVENT, onFormulaTypeset);
        },
      };
    },
  });
}

export function normalizeDocumentDefaultKinsoku(
  value: unknown,
): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Whitelist-sanitize a named-styles palette: every field re-validates through
 * the same TextStyling normalizers the marks use, names clamp to 64 chars,
 * duplicates (by name) collapse to the last definition, and the list caps at
 * 24 entries. Anything malformed drops silently.
 */
export function sanitizeNamedStyles(value: unknown): NamedStyleDefinition[] {
  if (!Array.isArray(value)) return [];
  const byName = new Map<string, NamedStyleDefinition>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const name =
      typeof entry.name === "string" ? entry.name.trim().slice(0, 64) : "";
    if (!name) continue;
    const definition: NamedStyleDefinition = { name };
    const styleId = normalizeNamedStyleId(entry.styleId);
    if (styleId) definition.styleId = styleId;
    const family = normalizeFontFamily(entry.fontFamily);
    if (family) definition.fontFamily = family;
    const size = normalizeFontSize(entry.fontSize);
    if (size) definition.fontSize = size;
    const color = normalizeTextColor(entry.textColor);
    if (color) definition.textColor = color;
    // On, or explicitly off: a style based on a bold style turns bold off by
    // saying so (Word writes w:b w:val="0"; live Word audit WUA 183).
    if (typeof entry.bold === "boolean") definition.bold = entry.bold;
    if (typeof entry.italic === "boolean") definition.italic = entry.italic;
    if (typeof entry.underline === "boolean") definition.underline = entry.underline;
    // The linked character style (Word `<w:link>`). Validate against the editor's
    // character-style gallery so an unknown / forged id is dropped; OMIT when
    // absent/null so a palette with no link stays byte-for-byte unchanged.
    const linked = normalizeCharacterStyle(entry.linkedCharacterStyleId);
    if (linked) definition.linkedCharacterStyleId = linked;
    // Paragraph-level style depth (w:pPr): each field funnels through the SAME
    // normalizer its paragraph-attr twin uses; anything off-range is omitted so
    // an untouched palette stays byte-for-byte identical. Spacing differs from
    // the paragraph-attr twin in ONE way: a negative source value is style
    // noise and is OMITTED (the attr path clamps to 0 for live typing), so a
    // forged palette entry cannot smuggle a field in as "0pt".
    const align = normalizeTextAlign(entry.textAlign);
    if (align) definition.textAlign = align;
    const spaceBefore = normalizeStyleSpacing(entry.spaceBeforePt);
    if (spaceBefore !== null) definition.spaceBeforePt = spaceBefore;
    const spaceAfter = normalizeStyleSpacing(entry.spaceAfterPt);
    if (spaceAfter !== null) definition.spaceAfterPt = spaceAfter;
    const lineHeight = normalizeLineHeight(entry.lineHeight);
    if (lineHeight) definition.lineHeight = lineHeight;
    const indentLeft = normalizeIndentPt(entry.indentLeftPt);
    if (indentLeft !== null) definition.indentLeftPt = indentLeft;
    const indentRight = normalizeIndentPt(entry.indentRightPt);
    if (indentRight !== null) definition.indentRightPt = indentRight;
    const firstLine = normalizeFirstLineIndentPt(entry.firstLineIndentPt);
    if (firstLine !== null) definition.firstLineIndentPt = firstLine;
    if (entry.styleType === "character" || entry.styleType === "linked") {
      definition.styleType = entry.styleType;
    }
    const basedOn = normalizeNamedStyleId(entry.basedOn);
    if (basedOn && basedOn !== "Normal") definition.basedOn = basedOn;
    const next = normalizeNamedStyleId(entry.nextStyleId);
    if (next) definition.nextStyleId = next;
    if (entry.quickStyle === false) definition.quickStyle = false;
    if (entry.autoUpdate === true) definition.autoUpdate = true;
    byName.set(name, definition);
    if (byName.size >= MAX_NAMED_STYLES) break;
  }
  return [...byName.values()];
}

/**
 * Deterministic local identity for a legacy/user-created named style.
 *
 * This intentionally avoids array positions: moving a gallery entry must not
 * rename its OOXML definition. Two independent 32-bit mixes keep the sync path
 * cheap while the collision loop below guarantees uniqueness inside the
 * bounded 24-entry palette.
 */
function authoredNamedStyleId(name: string, salt: number): string {
  const source = `${name}\u0000${salt}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const unit = source.charCodeAt(index);
    first = Math.imul(first ^ unit, 0x01000193) >>> 0;
    second = Math.imul(second ^ unit, 0x85ebca6b) >>> 0;
    second = (second ^ (second >>> 13)) >>> 0;
  }
  const hex = (value: number) => value.toString(16).padStart(8, "0");
  return `MrStyle${hex(first)}${hex(second)}`;
}

/**
 * Preserve valid source ids and backfill every legacy entry with a stable id.
 * Duplicate/forged ids are never allowed to alias two definitions: the later
 * entry receives its own deterministic id instead of silently stealing refs.
 */
export function ensureStableNamedStyleIds(
  value: unknown,
): NamedStyleDefinition[] {
  const styles = sanitizeNamedStyles(value);
  const occupied = new Set<string>();
  const stable = styles.map((style) => {
    let styleId = normalizeNamedStyleId(style.styleId);
    if (!styleId || occupied.has(styleId)) {
      let salt = 0;
      do {
        styleId = authoredNamedStyleId(style.name, salt);
        salt += 1;
      } while (occupied.has(styleId));
    }
    occupied.add(styleId);
    return { ...style, styleId };
  });
  return repairNamedStyleReferences(stable);
}

/**
 * Keep "Style based on" and "Style for following paragraph" pointing at real
 * palette styles: a based-on style that is missing, is a character style
 * under a paragraph style (or the reverse), or closes a cycle falls back to
 * Normal; a following style that is missing or a character style falls back
 * to the style itself. A character style has no following style.
 */
function repairNamedStyleReferences(
  styles: NamedStyleDefinition[],
): NamedStyleDefinition[] {
  const byId = new Map(styles.map((style) => [style.styleId!, style]));
  const isCharacter = (style: NamedStyleDefinition | undefined) =>
    style?.styleType === "character";
  const repaired = styles.map((style) => {
    const next: NamedStyleDefinition = { ...style };
    if (next.basedOn !== undefined) {
      const parent = byId.get(next.basedOn);
      if (
        !parent ||
        next.basedOn === next.styleId ||
        isCharacter(parent) !== isCharacter(next)
      ) {
        delete next.basedOn;
      }
    }
    if (next.nextStyleId !== undefined) {
      const following = byId.get(next.nextStyleId);
      if (
        isCharacter(next) ||
        next.nextStyleId === next.styleId ||
        (next.nextStyleId !== "Normal" && (!following || isCharacter(following)))
      ) {
        delete next.nextStyleId;
      }
    }
    return next;
  });
  const repairedById = new Map(repaired.map((style) => [style.styleId!, style]));
  for (const style of repaired) {
    const seen = new Set<string>([style.styleId!]);
    let cursor = style.basedOn;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        delete style.basedOn;
        break;
      }
      seen.add(cursor);
      cursor = repairedById.get(cursor)?.basedOn;
    }
  }
  return repaired;
}

/**
 * Sanitize every top-level document attribute owned by this extension before a
 * runtime `setContent` hydration re-applies it. TipTap keeps these attrs when an
 * editor is constructed from JSON, but its runtime setContent path rebuilds the
 * doc with schema defaults; a single normalized restore transaction prevents
 * imported A4/custom geometry (and sibling page settings) from reverting.
 */
export function normalizeHydratedDocumentPageAttrs(
  value: unknown,
): Record<string, unknown> {
  const attrs =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const hasTableStyleVisualCatalog = Object.prototype.hasOwnProperty.call(
    attrs,
    "tableStyleVisualCatalog",
  );
  const tableStyleVisualCatalog = normalizeDocumentTableStyleVisualCatalog(
    attrs.tableStyleVisualCatalog,
  );
  if (
    hasTableStyleVisualCatalog &&
    attrs.tableStyleVisualCatalog !== null &&
    attrs.tableStyleVisualCatalog !== undefined &&
    tableStyleVisualCatalog === null
  ) {
    // A present catalog is source authority. Silently laundering a malformed
    // or future payload to null would let the next autosave discard imported
    // Word style visuals while preserving a misleading editable receipt.
    throw new Error("invalid_table_style_visual_catalog");
  }
  const sectionLayouts = normalizeSectionLayouts(attrs.sectionLayouts);
  const firstSectionLayout = sectionLayouts?.[0] ?? null;
  const firstSectionPageSize = firstSectionLayout
    ? pageSizeSelectionFromSectionTwips(
        firstSectionLayout.pageSize.widthTwips,
        firstSectionLayout.pageSize.heightTwips,
        firstSectionLayout.pageSize.orientation,
      )
    : null;
  const firstSectionPageMargins = firstSectionLayout
    ? pageMarginsSelectionFromSectionTwips(
        firstSectionLayout.pageMargins.topTwips,
        firstSectionLayout.pageMargins.rightTwips,
        firstSectionLayout.pageMargins.bottomTwips,
        firstSectionLayout.pageMargins.leftTwips,
      )
    : null;
  const firstSectionGrid = firstSectionLayout?.docGrid;
  // The document's grid mode is its body section's (the last one, the body
  // w:sectPr), as the import reads it (projection.py
  // _document_manuscript_grid): reading the FIRST section put a document
  // whose body has no grid on one (R18-D14), and its next save stated that
  // grid on every section. Word's "Snap to characters" grid is a line grid
  // with a character pitch (no cells): only one MRAI wrote as manuscript
  // paper (稿纸) is drawn as cells -- its writer states w:charSpace="0", and
  // the import states that 0 for a marked file Word re-saved without it
  // (_doc_grid_is_manuscript_paper).
  const bodySectionGrid = sectionLayouts?.[sectionLayouts.length - 1]?.docGrid;
  const bodySectionGridMode =
    bodySectionGrid?.type === "lines" ||
    bodySectionGrid?.type === "linesAndChars"
      ? "lines"
      : bodySectionGrid?.type === "snapToChars"
        ? bodySectionGrid.charSpace === 0
          ? "grid"
          : "lines"
        : null;
  let sectionStoryGraph = null;
  if (
    attrs.sectionStoryGraph !== null &&
    attrs.sectionStoryGraph !== undefined
  ) {
    sectionStoryGraph = sectionLayouts
      ? normalizeSectionStoryGraph(
          attrs.sectionStoryGraph,
          sectionLayouts.length,
        )
      : null;
    if (sectionStoryGraph === null) {
      // A present graph is native custody state, not optional decoration.
      // Turning an invalid/future graph into null would let the next autosave
      // overwrite it as a legacy document and silently discard story identity.
      throw new Error("invalid_section_story_graph");
    }
  }
  return {
    tableStyleVisualCatalog,
    documentThemeColors: normalizeOfficeWordThemeColors(
      attrs.documentThemeColors,
    ),
    documentDesign: normalizeDocumentDesign(attrs.documentDesign),
    [PAGE_REGION_RECEIPT]: normalizePaginationProjectionReceipt(attrs[PAGE_REGION_RECEIPT]),
    headerText: sanitizeHeaderFooterText(attrs.headerText),
    footerText: sanitizeHeaderFooterText(attrs.footerText),
    showPageNumbers: attrs.showPageNumbers === true,
    pageNumberFormat:
      normalizePageNumberFormat(attrs.pageNumberFormat) ??
      DEFAULT_PAGE_NUMBER_FORMAT,
    pageNumberStart: normalizePageNumberStart(attrs.pageNumberStart),
    pageNumberStartSection: normalizePageNumberStartSection(
      attrs.pageNumberStartSection,
    ),
    documentMetadata: normalizeDocumentMetadataOrNull(attrs.documentMetadata),
    customProperties: normalizeCustomProperties(attrs.customProperties),
    differentFirstPage: normalizeDifferentFirstPage(attrs.differentFirstPage),
    firstPageHeader: sanitizeHeaderFooterText(attrs.firstPageHeader),
    firstPageFooter: sanitizeHeaderFooterText(attrs.firstPageFooter),
    differentOddEven: normalizeDifferentOddEven(attrs.differentOddEven),
    evenPageHeader: sanitizeHeaderFooterText(attrs.evenPageHeader),
    evenPageFooter: sanitizeHeaderFooterText(attrs.evenPageFooter),
    // RICH bands (letterhead pictures / mini tables). Included here so a
    // reload can never launder them back to null (the docGridLinePitch
    // lesson: attrs missing from this list get wiped by the FIRST autosave).
    headerRich: normalizeBandRichBlocks(attrs.headerRich),
    footerRich: normalizeBandRichBlocks(attrs.footerRich),
    firstPageHeaderRich: normalizeBandRichBlocks(attrs.firstPageHeaderRich),
    firstPageFooterRich: normalizeBandRichBlocks(attrs.firstPageFooterRich),
    evenPageHeaderRich: normalizeBandRichBlocks(attrs.evenPageHeaderRich),
    evenPageFooterRich: normalizeBandRichBlocks(attrs.evenPageFooterRich),
    sectionBands: normalizeSectionBands(attrs.sectionBands),
    // Exact ordered Word section geometry/columns/numbering. Like sectionBands,
    // this fidelity payload is not painted directly by the global page-setup
    // controls, but it must survive setContent/getJSON/autosave unchanged.
    sectionLayouts,
    sectionStoryGraph,
    autoHyphenation: normalizeAutoHyphenation(attrs.autoHyphenation),
    hyphenationOptions: normalizeHyphenationOptions(attrs.hyphenationOptions),
    // Word settings.xml page/tab settings (mirror margins, gutter position,
    // default tab stops). Listed so a reload never launders them to null.
    wordSettings: normalizeWordDocumentSettings(attrs.wordSettings),
    // Once native section geometry exists, it is the only page authority.
    // Mirror section zero into the legacy globals because older toolbar,
    // print and scratch-export consumers still read them.  Hydrating the
    // legacy Letter defaults independently created a contradictory document:
    // the sheet used A4 while the toolbar and a later save reported Letter.
    pageSize:
      firstSectionPageSize?.pageSize ??
      normalizePageSize(attrs.pageSize) ??
      DEFAULT_PAGE_SIZE,
    pageMargins:
      firstSectionPageMargins?.pageMargins ??
      normalizePageMargins(attrs.pageMargins) ??
      DEFAULT_PAGE_MARGINS,
    pageOrientation:
      firstSectionLayout?.pageSize.orientation ??
      normalizePageOrientation(attrs.pageOrientation) ??
      DEFAULT_PAGE_ORIENTATION,
    documentProtection: normalizeDocumentProtection(attrs.documentProtection),
    // Word's Track Changes > For Everyone (`w:trackRevisions`): a document
    // setting saved with it and shared with every co-author.
    trackRevisions: normalizeTrackRevisions(attrs.trackRevisions),
    customPageSize: firstSectionLayout
      ? (firstSectionPageSize?.customPageSize ?? null)
      : normalizeCustomPageSize(attrs.customPageSize),
    customPageMargins: firstSectionLayout
      ? (firstSectionPageMargins?.customPageMargins ?? null)
      : normalizeCustomPageMargins(attrs.customPageMargins),
    columns: normalizeColumns(attrs.columns) ?? DEFAULT_COLUMN_COUNT,
    columnSeparator: resolveColumnSeparator(attrs.columnSeparator),
    writingMode:
      normalizeWritingMode(attrs.writingMode) ?? DEFAULT_WRITING_MODE,
    manuscriptGrid:
      bodySectionGridMode ??
      normalizeManuscriptGrid(attrs.manuscriptGrid) ??
      DEFAULT_MANUSCRIPT_GRID,
    // Word docGrid line pitch — omitting this from the hydration list once
    // LAUNDERED the attr: restore left it null, and the next autosave
    // persisted null over the projected value, silently disabling grid
    // accounting (and changing pagination between the first and later opens).
    docGridLinePitch:
      normalizeDocGridLinePitch(firstSectionGrid?.linePitch) ??
      normalizeDocGridLinePitch(attrs.docGridLinePitch),
    // Word note numbering (w:footnotePr / w:endnotePr — numFmt + numStart per
    // stream). Registered by the footnote extension (FootnoteStore), but the
    // restoreFootnotes command's call signature carries only the store + mode,
    // so these four ride THIS whole-attrs restore. Omitting them here would
    // repeat the docGridLinePitch laundering: an imported upperRoman endnote
    // format would silently revert to the default on the first autosave after
    // a reload. Editors without the footnote extension drop them harmlessly
    // (an unregistered doc attr is ignored by the schema).
    footnoteNumFmt: sanitizeNoteNumFmt(attrs.footnoteNumFmt),
    endnoteNumFmt: sanitizeNoteNumFmt(attrs.endnoteNumFmt),
    footnoteNumStart: sanitizeNoteNumStart(attrs.footnoteNumStart),
    endnoteNumStart: sanitizeNoteNumStart(attrs.endnoteNumStart),
    footnotePosition: sanitizeNotePosition("footnote", attrs.footnotePosition),
    endnotePosition: sanitizeNotePosition("endnote", attrs.endnotePosition),
    footnoteNumRestart: sanitizeNoteRestart(
      "footnote",
      attrs.footnoteNumRestart,
    ),
    endnoteNumRestart: sanitizeNoteRestart("endnote", attrs.endnoteNumRestart),
    // The document's "footnote text" style rides the same whole-attrs restore.
    footnoteTextStyle: sanitizeNoteTextStyle(attrs.footnoteTextStyle),
    endnoteTextStyle: sanitizeNoteTextStyle(attrs.endnoteTextStyle),
    designColorSet: normalizeOfficeThemePaletteId(attrs.designColorSet),
    defaultFontFamily: normalizeFontFamily(attrs.defaultFontFamily),
    defaultEastAsianFontFamily: normalizeFontFamily(attrs.defaultEastAsianFontFamily),
    defaultFontSize: normalizeFontSize(attrs.defaultFontSize),
    defaultTextColor: normalizeTextColor(attrs.defaultTextColor),
    defaultLineHeight: normalizeDefaultLineHeight(attrs.defaultLineHeight),
    defaultTextAlign: normalizeDocumentDefaultTextAlign(
      attrs.defaultTextAlign,
    ),
    characterSpacingControl: normalizeDocumentCharacterSpacingControl(
      attrs.characterSpacingControl,
    ),
    doNotUseEastAsianBreakRules: normalizeDoNotUseEastAsianBreakRules(
      attrs.doNotUseEastAsianBreakRules,
    ),
    defaultKinsoku: normalizeDocumentDefaultKinsoku(attrs.defaultKinsoku),
    wordCompatibilityMode: normalizeWordCompatibilityMode(attrs.wordCompatibilityMode),
    wordTableLinesOnGrid: attrs.wordTableLinesOnGrid === true ? true : null,
    wordSpacingAddsUp: attrs.wordSpacingAddsUp === true ? true : null,
    eastAsianLanguage: normalizeDocumentEastAsianLanguage(attrs.eastAsianLanguage),
    wordStrictKinsoku: attrs.wordStrictKinsoku === true ? true : null,
    wordBalanceSbcsDbcs: attrs.wordBalanceSbcsDbcs === true ? true : null,
    wordBalancedSpaces: attrs.wordBalancedSpaces === true ? true : null,
    wordDoNotBreakWrappedTables: attrs.wordDoNotBreakWrappedTables === true ? true : null,
    defaultParagraphSpaceBefore: normalizeSpacing(
      attrs.defaultParagraphSpaceBefore,
    ),
    defaultParagraphSpaceAfter: normalizeSpacing(
      attrs.defaultParagraphSpaceAfter,
    ),
    defaultIndentLeftPt: normalizeIndentPt(attrs.defaultIndentLeftPt),
    defaultIndentRightPt: normalizeIndentPt(attrs.defaultIndentRightPt),
    defaultFirstLineIndentPt: normalizeFirstLineIndentPt(
      attrs.defaultFirstLineIndentPt,
    ),
    namedStyles: ensureStableNamedStyleIds(attrs.namedStyles),
    headingStyles: normalizeHeadingStyles(attrs.headingStyles),
    referenceStyles: normalizeReferenceStyles(attrs.referenceStyles),
    quickParts: normalizeDocumentQuickParts(attrs.quickParts),
    eastAsianFontFamilies: normalizeEastAsianFontFamilies(
      attrs.eastAsianFontFamilies,
    ),
    styleDefinitions: normalizeStyleDefinitions(attrs.styleDefinitions),
    watermark: normalizeDocumentWatermark(attrs.watermark),
    pageBorder: normalizePageBorder(attrs.pageBorder),
    lineNumbers: normalizeLineNumbers(attrs.lineNumbers),
    pageBackgroundColor: normalizePageBackgroundColor(
      attrs.pageBackgroundColor,
    ),
    // The pen's paper and the handwriting document's cover and paper: listed
    // so a hydration restore keeps them.
    inkPaper: normalizeInkPaper(attrs.inkPaper),
    handwritingDocument: normalizeHandwritingDocument(attrs.handwritingDocument),
    encryptWithPassword: attrs.encryptWithPassword === true,
  };
}

/**
 * Store native section geometry and its legacy first-section projection in
 * the same transaction. Multi-section layout remains authoritative; the
 * mirror only keeps older single-page consumers from inventing Letter state.
 */
function setSectionLayoutsWithLegacyMirror(
  tr: Transaction,
  layouts: readonly SectionLayout[],
): void {
  tr.setDocAttribute("sectionLayouts", layouts);
  // The section entries own the page border from here on (a legacy document-
  // wide box was materialized into every entry by this same write), and the
  // renderer and DOCX exporter both ignore the legacy box beside them. Retire
  // it in the same step so nothing can repaint a border the menu removed.
  if (tr.doc.attrs.pageBorder != null) tr.setDocAttribute("pageBorder", null);
  const first = layouts[0];
  if (!first) return;
  const size = pageSizeSelectionFromSectionTwips(
    first.pageSize.widthTwips,
    first.pageSize.heightTwips,
    first.pageSize.orientation,
  );
  const margins = pageMarginsSelectionFromSectionTwips(
    first.pageMargins.topTwips,
    first.pageMargins.rightTwips,
    first.pageMargins.bottomTwips,
    first.pageMargins.leftTwips,
  );
  if (!size || !margins) return;
  tr.setDocAttribute("pageSize", size.pageSize);
  tr.setDocAttribute("customPageSize", size.customPageSize);
  tr.setDocAttribute("pageMargins", margins.pageMargins);
  tr.setDocAttribute("customPageMargins", margins.customPageMargins);
  tr.setDocAttribute("pageOrientation", first.pageSize.orientation);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentPageSetup: {
      /** Set the page size (whitelisted) on the top-level document node. */
      setPageSize: (size: PageSize) => ReturnType;
      /** Set the margin preset (whitelisted) on the top-level document node. */
      setPageMargins: (margins: PageMargins) => ReturnType;
      /**
       * Set the page orientation (portrait / landscape) on the top-level document
       * node. Landscape swaps the page width↔height (independent of the size
       * preset); the default portrait renders no extra attribute.
       */
      setPageOrientation: (orientation: PageOrientation) => ReturnType;
      /**
       * Toggle the document's read-only protection (Word/WPS 限制编辑). Stored on
       * the top-level `doc` node; NoteEditor mirrors it to `editor.setEditable`.
       */
      toggleDocumentProtection: () => ReturnType;
      /** Restrict Editing's "Allow only this type of editing" (null: none). */
      setDocumentProtectionMode: (mode: DocumentProtectionMode | null) => ReturnType;
      /**
       * Set a CUSTOM page size (width/height in inches, clamped) and flip the
       * size to `custom`. Passing null/invalid clears it back to the preset.
       */
      setCustomPageSize: (value: unknown) => ReturnType;
      /**
       * Set CUSTOM per-side margins (top/right/bottom/left in inches, clamped)
       * and flip the margins to `custom`. Null/invalid clears back to preset.
       */
      setCustomPageMargins: (value: unknown) => ReturnType;
      /** Set the multi-column count (1/2/3, whitelisted) on the doc node. */
      setColumns: (columns: ColumnCount) => ReturnType;
      /**
       * Toggle the between-columns vertical rule (Word "Line between" 分栏分隔线)
       * on the doc node. Stored as a boolean; off (the default) renders no
       * `data-*` attr so the document round-trips byte-for-byte.
       */
      setColumnSeparator: (enabled: boolean) => ReturnType;
      /** Set the document-wide writing mode (horizontal-tb / vertical-rl 竖排). */
      setWritingMode: (mode: WritingMode) => ReturnType;
      /** Set the document-wide manuscript grid (off / grid / lines 稿纸). */
      setManuscriptGrid: (mode: ManuscriptGrid) => ReturnType;
      /** Set the document-level header text (sanitized) on the doc node. */
      setDocumentHeader: (text: string) => ReturnType;
      /** Set the document-level footer text (sanitized) on the doc node. */
      setDocumentFooter: (text: string) => ReturnType;
      /** Replace one document-level rich header/footer story.  The rich story
       * is authoritative, so the matching flattened fallback is cleared. */
      setDocumentBandRich: (
        kind: "header" | "footer",
        variant: "normal" | "first" | "even",
        blocks: unknown,
      ) => ReturnType;
      /**
       * Set ONE section's band text (sectioned imports; on-page band
       * editing). `variant` follows the sheet resolution order the chrome
       * paints (first > even > normal); the entry key is derived from
       * (kind, variant). Out-of-range indexes are rejected — sections are
       * import-defined, the editor never grows the array here.
       */
      /** Duplicate section N's band entry into [N, N+1] after a NEW
       * boundary split its section (per-page band isolation). */
      splitSectionBandEntry: (sectionIndex: number) => ReturnType;
      setSectionBand: (
        sectionIndex: number,
        kind: "header" | "footer",
        variant: "normal" | "first" | "even",
        text: string,
      ) => ReturnType;
      /** Replace one section/variant's rich story.  Editing a linked story
       * breaks only that variant's Link-to-Previous relationship. */
      setSectionBandRich: (
        sectionIndex: number,
        kind: "header" | "footer",
        variant: "normal" | "first" | "even",
        blocks: unknown,
      ) => ReturnType;
      /** Insert/reposition, or remove with null, native PAGE/NUMPAGES fields. */
      setSectionPageNumberStory: (
        sectionIndex: number,
        kind: SectionStoryKind,
        variant: SectionStoryVariant,
        alignment: PageNumberStoryAlignment | null,
        includePageCount?: boolean,
      ) => ReturnType;
      /** Toggle this section's native first-page story projection (`w:titlePg`). */
      setSectionDifferentFirstPage: (
        sectionIndex: number,
        enabled: boolean,
      ) => ReturnType;
      /** Link/unlink one authenticated native story to the previous section. */
      setSectionStoryLinkedToPrevious: (
        sectionIndex: number,
        kind: SectionStoryKind,
        variant: SectionStoryVariant,
        linked: boolean,
      ) => ReturnType;
      /** Update one section's native header/footer distance (`w:pgMar`). */
      setSectionHeaderFooterDistance: (
        sectionIndex: number,
        kind: SectionStoryKind,
        distanceTwips: number,
      ) => ReturnType;
      /** Replace the complete layout containing the selection (legacy API). */
      updateSectionLayout: {
        (layout: unknown): ReturnType;
        /** Deep-patch one explicit zero-based section without touching siblings. */
        (sectionIndex: number, patch: SectionLayoutPatch): ReturnType;
      };
      /** Toggle Word/WPS document-level automatic hyphenation. */
      setAutoHyphenation: (enabled: boolean) => ReturnType;
      /**
       * Patch Word's settings.xml page/tab settings (Multiple pages, Gutter
       * position, Default tab stops). A `null` key resets it to Word's default;
       * an invalid value rejects the whole patch.
       */
      setWordSettings: (patch: {
        multiplePages?: WordMultiplePages | null;
        gutterAtTop?: boolean | null;
        defaultTabStopTwips?: number | null;
      }) => ReturnType;
      /** Toggle the exported footer's centered PAGE-number field. */
      setDocumentPageNumbers: (enabled: boolean) => ReturnType;
      /**
       * Set the page-number NUMBERING STYLE (1/2/3, i/ii/iii, I/II/III, a/b/c,
       * A/B/C) — Word/WPS "Format Page Numbers" → `<w:pgNumType w:fmt=…>`.
       */
      setPageNumberFormat: (format: PageNumberFormat) => ReturnType;
      /**
       * Set the page-number "Start at N" value (Word `<w:pgNumType w:start=…>`),
       * clamped to a sane range. Passing null/invalid clears it back to start-at-1.
       */
      setPageNumberStart: (value: unknown) => ReturnType;
      /**
       * Set (or clear, with an all-empty bag) the document properties / metadata
       * (Title/Author/Subject/Keywords/Company, docProps/core.xml + app.xml).
       */
      setDocumentMetadata: (value: unknown) => ReturnType;
      /** Set Layout > Hyphenation > Hyphenation Options (documentHyphenation). */
      setHyphenationOptions: (value: unknown) => ReturnType;
      /** Set File > Properties > Custom (documentCustomProperties). */
      setDocumentCustomProperties: (value: unknown) => ReturnType;
      /** Toggle the different-first-page header/footer (Word w:titlePg). */
      setDifferentFirstPage: (enabled: boolean) => ReturnType;
      /** Set the first-page header text (sanitized) on the doc node. */
      setFirstPageHeader: (text: string) => ReturnType;
      /** Set the first-page footer text (sanitized) on the doc node. */
      setFirstPageFooter: (text: string) => ReturnType;
      /** Toggle the different odd/even-page header/footer (w:evenAndOddHeaders). */
      setDifferentOddEven: (enabled: boolean) => ReturnType;
      /** Set the even-page header text (sanitized) on the doc node. */
      setEvenPageHeader: (text: string) => ReturnType;
      /** Set the even-page footer text (sanitized) on the doc node. */
      setEvenPageFooter: (text: string) => ReturnType;
      /** Set (or clear, with null/empty text) the document-level watermark. */
      setDocumentWatermark: (value: unknown) => ReturnType;
      /** Set (or clear, with null) the document-level page border. */
      setPageBorder: (value: unknown) => ReturnType;
      /**
       * Set (or clear, with null/invalid) the document-level page background
       * color (Word/WPS «设计 → 页面颜色» / `<w:background w:color>`).
       */
      setPageBackgroundColor: (value: unknown) => ReturnType;
      /** Set (or clear, with null) the pen's paper: ruled, grid or dot (Draw ▸ Background). */
      setInkPaper: (value: unknown) => ReturnType;
      /** Word's Encrypt with Password on (true) or removed (false). */
      setDocumentEncryptWithPassword: (on: boolean) => ReturnType;
      /** Set (or clear, with null) the handwriting document's cover and paper (lib/handwriting-paper). */
      setHandwritingDocument: (value: unknown) => ReturnType;
      /** Set (or clear, with null) the document-level line numbering. */
      setLineNumbers: (value: unknown) => ReturnType;
      /** Replace the document's named-style palette (sanitized, capped). */
      setNamedStyles: (styles: unknown) => ReturnType;
      /** Redefine the built-in Heading 1..6 styles, or clear with null. */
      setHeadingStyles: (styles: unknown) => ReturnType;
      /** Word's modified TOC 1..9 / Table of Figures styles (referenceStyles.ts). */
      setReferenceStyles: (styles: unknown) => ReturnType;
      /** Word's building blocks saved in this document (documentQuickParts.ts). */
      setQuickParts: (parts: unknown) => ReturnType;
      /** Replace the stable imported OOXML style graph, or clear it. */
      setStyleDefinitions: (styles: unknown) => ReturnType;
      /** Re-apply the document's base typography after a setContent
       * hydration (setContent drops top-level doc attrs). */
      restoreDocumentTypography: (family: unknown, size: unknown) => ReturnType;
      /** Re-apply every sanitized page/document attr after runtime setContent. */
      restoreDocumentPageSetup: (attrs: unknown) => ReturnType;
      /**
       * Apply the explicit repair of a section-layout chain whose length no
       * longer matches the section breaks (sectionLayoutRepair.ts), as ONE
       * undoable step. `expectedLayouts` is the chain the author confirmed;
       * the command refuses if the document changed since it was shown.
       */
      repairSectionLayoutStructure: (expectedLayouts: unknown) => ReturnType;
    };
  }
}

/**
 * Replacement for the StarterKit `Document` top node that carries page-setup
 * attributes (`pageSize` / `pageMargins`), the optional multi-column count
 * (`columns`), plus the optional document-level header/footer text
 * (`headerText` / `footerText`). They are persisted on the doc node's `attrs`
 * (so they survive getJSON/setContent round-trips) and parsed back from the
 * wrapper `data-*` attributes on an HTML round-trip.
 *
 * Page size/margins are funneled through the pageSetup whitelists on parse AND
 * render; header/footer text is funneled through sanitizeHeaderFooterText on
 * parse AND render, so a malicious page or stray import can never store an
 * off-whitelist value or markup that downstream CSS / the DOM would trust.
 * NoteEditor reads the resolved values and paints the on-screen "page" geometry
 * (size + margins) and the header/footer bands accordingly; the DOCX exporter
 * reads the same values for the header/footer parts.
 *
 * StarterKit's `document: false` must be set so this replaces the default top
 * node rather than colliding with it.
 */
/**
 * A page-setup write on a document whose section chain and page-setup
 * entries no longer line up (a section with no entry, an entry with no
 * section). Word has no such state: the chain is repaired in the same step
 * -- a section without an entry takes a copy of the one before it, an entry
 * no section owns is dropped -- and the write goes on. Nothing of the text is
 * touched. It used to refuse every page-setup command until the author
 * confirmed a repair dialog.
 */
function withRepairedSectionChain<T>(
  tr: Transaction,
  dispatch: unknown,
  compute: () => T | null,
): T | null {
  const first = compute();
  if (first || !dispatch) return first;
  const plan = planSectionLayoutRepair(tr.doc);
  if (!plan) return null;
  setSectionLayoutsWithLegacyMirror(tr, plan.layouts);
  if (plan.mutation) {
    tr.setMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META, plan.mutation);
  }
  return compute();
}

const DocumentPageSetup = Document.extend<{ waitForSourceFontPlan: boolean }>({
  addOptions() { return { waitForSourceFontPlan: false }; },
  
  // pages, PERIOD. The "no page" state is not expressible in the schema —
  // ProseMirror's replace fitting wraps stray blocks into a pageBlock and
  // createAndFill/fillBefore synthesize pageBlock(paragraph) for an empty
  // doc, so deleting everything yields Word's blank page by construction
  // (no repair plugin needed). pageBlock is referenced by NAME (it carries
  // no group), so it can never appear anywhere else in the schema. Storage
  // stays FLAT: hydration wraps (wrapBlocksIntoPages), every serialization
  // boundary unwraps (flattenPageBlocks).
  content: "pageBlock+",
  addAttributes() {
    return {
      [PAGE_REGION_RECEIPT]: { default: null, rendered: false },
      tableStyleVisualCatalog: {
        default: null,
        // This bounded catalog is native page JSON authority, not authored
        // HTML.  Keep it off the live DOM so a large source styles.xml cannot
        // become a mutation/attribute surface or a stylesheet-less export.
        rendered: false,
      },
      // An imported document's theme colours, which table styles reference
      // (w:themeFill/w:themeColor). Derived source evidence the importer
      // writes; page JSON only.
      documentThemeColors: { default: null, rendered: false },
      // The Design tab's choices (lib/document-design.ts): the document
      // theme's schemes, the style set and Paragraph Spacing. Page JSON only;
      // what they mean is resolved from the shared Office catalog.
      documentDesign: { default: null, rendered: false },
      headerText: {
        default: "",
        parseHTML: (element) =>
          sanitizeHeaderFooterText(element.getAttribute("data-header-text")),
        renderHTML: (attributes) => {
          const text = sanitizeHeaderFooterText(
            (attributes as { headerText?: unknown }).headerText,
          );
          return text ? { "data-header-text": text } : {};
        },
      },
      footerText: {
        default: "",
        parseHTML: (element) =>
          sanitizeHeaderFooterText(element.getAttribute("data-footer-text")),
        renderHTML: (attributes) => {
          const text = sanitizeHeaderFooterText(
            (attributes as { footerText?: unknown }).footerText,
          );
          return text ? { "data-footer-text": text } : {};
        },
      },
      // Centered page-number field in the exported footer (Word 插入页码). The
      // on-screen editor is unpaginated, so NoteEditor renders a band hint
      // rather than a live number; the truth lives in the DOCX export.
      showPageNumbers: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-show-page-numbers") === "true",
        renderHTML: (attributes) =>
          (attributes as { showPageNumbers?: unknown }).showPageNumbers === true
            ? { "data-show-page-numbers": "true" }
            : {},
      },
      // Page-number NUMBERING STYLE (Word "Format Page Numbers" /
      // `<w:pgNumType w:fmt=…>`): 1/2/3 (decimal, default), i/ii/iii (lowerRoman),
      // I/II/III (upperRoman), a/b/c (lowerLetter), A/B/C (upperLetter),
      // Word's `- 1 -` numberInDash form, or one of Word's East Asian styles
      // (PAGE_NUMBER_FORMATS in pageNumberFormat.ts). Funneled through the closed whitelist
      // on parse AND render; the default "decimal" renders NO `data-*` attribute
      // so a document using the default format is byte-for-byte unchanged.
      pageNumberFormat: {
        default: DEFAULT_PAGE_NUMBER_FORMAT,
        parseHTML: (element) =>
          normalizePageNumberFormat(
            element.getAttribute("data-page-number-format"),
          ) ?? DEFAULT_PAGE_NUMBER_FORMAT,
        renderHTML: (attributes) => {
          const format = normalizePageNumberFormat(
            (attributes as { pageNumberFormat?: unknown }).pageNumberFormat,
          );
          return format && format !== DEFAULT_PAGE_NUMBER_FORMAT
            ? { "data-page-number-format": format }
            : {};
        },
      },
      // Page-number "Start at N" (Word `<w:pgNumType w:start=…>`): the value the
      // FIRST page numbers from. Clamped on parse AND render; the default start
      // (1) renders NO `data-*` attribute so a document numbering from 1 is
      // byte-for-byte unchanged. Only meaningful when showPageNumbers is on.
      pageNumberStart: {
        default: null as number | null,
        parseHTML: (element) =>
          normalizePageNumberStart(
            element.getAttribute("data-page-number-start"),
          ),
        renderHTML: (attributes) => {
          const start = normalizePageNumberStart(
            (attributes as { pageNumberStart?: unknown }).pageNumberStart,
          );
          // Omit the attribute for the default start of 1 (byte-for-byte unchanged).
          return start !== null && start !== 1
            ? { "data-page-number-start": String(start) }
            : {};
        },
      },
      // Imported DOCX files can introduce the PAGE footer only in a later
      // section (cover/front matter remains unnumbered). This zero-based section
      // ordinal affects preview display only; DOCX export already attaches the
      // footer reference to the final body sectPr rather than earlier breaks.
      pageNumberStartSection: {
        default: null as number | null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-page-number-start-section");
          return raw === null
            ? null
            : normalizePageNumberStartSection(Number(raw));
        },
        renderHTML: (attributes) => {
          const section = normalizePageNumberStartSection(
            (attributes as { pageNumberStartSection?: unknown })
              .pageNumberStartSection,
          );
          return section !== null && section > 0
            ? { "data-page-number-start-section": String(section) }
            : {};
        },
      },
      // Document properties / metadata (Word "File → Properties"): Title, Author,
      // Subject, Keywords, Company. Funneled through normalizeDocumentMetadataOrNull
      // on parse AND render: every field is sanitized (single line, control-byte-
      // free, clamped) and an all-empty bag collapses to `null`. Persisted as JSON
      // in a data attribute so it survives HTML round-trips like the other doc
      // attrs. `null` (the default) renders no extra attribute, so a metadata-free
      // document is byte-for-byte unchanged.
      documentMetadata: {
        default: null as DocumentMetadata | null,
        parseHTML: (element) => {
          try {
            return normalizeDocumentMetadataOrNull(
              JSON.parse(
                element.getAttribute("data-document-metadata") || "null",
              ),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const metadata = normalizeDocumentMetadataOrNull(
            (attributes as { documentMetadata?: unknown }).documentMetadata,
          );
          return metadata
            ? { "data-document-metadata": JSON.stringify(metadata) }
            : {};
        },
      },
      // Layout > Hyphenation > Hyphenation Options: only what the document
      // states (zone, consecutive limit, capitals off); null is Word's defaults.
      hyphenationOptions: {
        default: null as HyphenationOptions | null,
        parseHTML: (element) => {
          try {
            return normalizeHyphenationOptions(
              JSON.parse(element.getAttribute("data-hyphenation-options") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const options = normalizeHyphenationOptions(
            (attributes as { hyphenationOptions?: unknown }).hyphenationOptions,
          );
          return options ? { "data-hyphenation-options": JSON.stringify(options) } : {};
        },
      },
      // File > Properties > Custom (docProps/custom.xml): null leaves the
      // file's own part as it is; a list is what the file takes.
      customProperties: {
        default: null as CustomProperty[] | null,
        parseHTML: (element) => {
          try {
            return normalizeCustomProperties(
              JSON.parse(element.getAttribute("data-custom-properties") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const entries = normalizeCustomProperties(
            (attributes as { customProperties?: unknown }).customProperties,
          );
          return entries ? { "data-custom-properties": JSON.stringify(entries) } : {};
        },
      },
      // Different-first-page header/footer (Word 不同的首页 / w:titlePg). When
      // ON, page 1 shows the first-page header/footer (which may be empty —
      // Word's bare cover page) and pages 2+ show the normal header/footer.
      // OFF (the default) leaves no extra attribute, so a document without the
      // feature is byte-for-byte unchanged. The first-page text is funneled
      // through sanitizeHeaderFooterText on parse AND render like the normal
      // header/footer, so neither markup nor control bytes can be stored.
      differentFirstPage: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-different-first-page") === "true",
        renderHTML: (attributes) =>
          (attributes as { differentFirstPage?: unknown })
            .differentFirstPage === true
            ? { "data-different-first-page": "true" }
            : {},
      },
      firstPageHeader: {
        default: "",
        parseHTML: (element) =>
          sanitizeHeaderFooterText(
            element.getAttribute("data-first-page-header"),
          ),
        renderHTML: (attributes) => {
          const text = sanitizeHeaderFooterText(
            (attributes as { firstPageHeader?: unknown }).firstPageHeader,
          );
          return text ? { "data-first-page-header": text } : {};
        },
      },
      firstPageFooter: {
        default: "",
        parseHTML: (element) =>
          sanitizeHeaderFooterText(
            element.getAttribute("data-first-page-footer"),
          ),
        renderHTML: (attributes) => {
          const text = sanitizeHeaderFooterText(
            (attributes as { firstPageFooter?: unknown }).firstPageFooter,
          );
          return text ? { "data-first-page-footer": text } : {};
        },
      },
      // Different odd/even-page header/footer (Word 奇偶页不同 /
      // w:evenAndOddHeaders). When ON, even-numbered pages show the even-page
      // header/footer and odd pages show the normal one. OFF (the default) leaves
      // no extra attribute, so a document without the feature is byte-for-byte
      // unchanged. Composes with differentFirstPage (both may be on). The
      // even-page text is funneled through sanitizeHeaderFooterText on parse AND
      // render like the normal header/footer.
      differentOddEven: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-different-odd-even") === "true",
        renderHTML: (attributes) =>
          (attributes as { differentOddEven?: unknown }).differentOddEven ===
          true
            ? { "data-different-odd-even": "true" }
            : {},
      },
      evenPageHeader: {
        default: "",
        parseHTML: (element) =>
          sanitizeHeaderFooterText(
            element.getAttribute("data-even-page-header"),
          ),
        renderHTML: (attributes) => {
          const text = sanitizeHeaderFooterText(
            (attributes as { evenPageHeader?: unknown }).evenPageHeader,
          );
          return text ? { "data-even-page-header": text } : {};
        },
      },
      evenPageFooter: {
        default: "",
        parseHTML: (element) =>
          sanitizeHeaderFooterText(
            element.getAttribute("data-even-page-footer"),
          ),
        renderHTML: (attributes) => {
          const text = sanitizeHeaderFooterText(
            (attributes as { evenPageFooter?: unknown }).evenPageFooter,
          );
          return text ? { "data-even-page-footer": text } : {};
        },
      },
      // RICH bands (letterhead pictures / mini tables): persisted as JSON in
      // the doc attrs only (no data attribute round-trip — the payloads are
      // large data URIs). Every read passes normalizeBandRichBlocks, so a
      // forged persisted value cannot reach the renderer unvalidated.
      headerRich: { default: null, rendered: false },
      footerRich: { default: null, rendered: false },
      firstPageHeaderRich: { default: null, rendered: false },
      firstPageFooterRich: { default: null, rendered: false },
      evenPageHeaderRich: { default: null, rendered: false },
      evenPageFooterRich: { default: null, rendered: false },
      // Per-section bands (Word renders each section's own header/footer).
      sectionBands: { default: null, rendered: false },
      // Ordered per-section Word layout fidelity model. JSON-only: the native
      // editor's global page-setup controls remain the display fallback.
      sectionLayouts: { default: null, rendered: false },
      // Exact Word section/header-footer relationship identity. JSON-only and
      // intentionally independent from the legacy materialized sectionBands.
      sectionStoryGraph: { default: null, rendered: false },
      // Word's settings.xml Multiple pages / Gutter position / Default tab
      // stops (wordDocumentSettings.ts). JSON-only; null = Word's defaults.
      wordSettings: { default: null, rendered: false },
      // Word/WPS automatic hyphenation is a document setting, not printable
      // text. The default false emits no HTML attribute and no DOCX setting.
      autoHyphenation: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-auto-hyphenation") === "true",
        renderHTML: (attributes) =>
          normalizeAutoHyphenation(
            (attributes as { autoHyphenation?: unknown }).autoHyphenation,
          )
            ? { "data-auto-hyphenation": "true" }
            : {},
      },
      pageSize: {
        default: DEFAULT_PAGE_SIZE,
        parseHTML: (element) =>
          normalizePageSize(element.getAttribute("data-page-size")) ??
          DEFAULT_PAGE_SIZE,
        renderHTML: (attributes) => {
          const size =
            normalizePageSize(
              (attributes as { pageSize?: unknown }).pageSize,
            ) ?? DEFAULT_PAGE_SIZE;
          return { "data-page-size": size };
        },
      },
      pageMargins: {
        default: DEFAULT_PAGE_MARGINS,
        parseHTML: (element) =>
          normalizePageMargins(element.getAttribute("data-page-margins")) ??
          DEFAULT_PAGE_MARGINS,
        renderHTML: (attributes) => {
          const margins =
            normalizePageMargins(
              (attributes as { pageMargins?: unknown }).pageMargins,
            ) ?? DEFAULT_PAGE_MARGINS;
          return { "data-page-margins": margins };
        },
      },
      // Page orientation (Word/WPS 纸张方向 — the Layout ribbon's most-used
      // command). Funneled through normalizePageOrientation on parse AND render;
      // the only non-default value is "landscape" (swaps width↔height). The
      // default "portrait" renders NO `data-*` attribute, so a portrait document
      // is byte-for-byte unchanged — the attr is only persisted when landscape.
      // NoteEditor reads the resolved value and the surface/export swap the
      // dimensions; the DOCX exporter also emits `w:orient="landscape"` on
      // `<w:pgSz>` for round-trip fidelity.
      pageOrientation: {
        default: DEFAULT_PAGE_ORIENTATION,
        parseHTML: (element) =>
          normalizePageOrientation(
            element.getAttribute("data-page-orientation"),
          ) ?? DEFAULT_PAGE_ORIENTATION,
        renderHTML: (attributes) => {
          const orientation = normalizePageOrientation(
            (attributes as { pageOrientation?: unknown }).pageOrientation,
          );
          return orientation && orientation !== DEFAULT_PAGE_ORIENTATION
            ? { "data-page-orientation": orientation }
            : {};
        },
      },
      // Document protection (Word/WPS 限制编辑 → read-only): when present the
      // editor renders non-editable; the toolbar lock toggles it. null (the
      // default, unprotected) renders NO attribute so an editable document is
      // byte-for-byte unchanged. Persisted as JSON like the other doc attrs and
      // funneled through normalizeDocumentProtection on parse + render so a
      // forged value can never store a malformed lock. The DOCX exporter emits
      // <w:documentProtection> in settings.xml for round-trip fidelity.
      documentProtection: {
        default: null as DocumentProtection | null,
        parseHTML: (element) => {
          try {
            return normalizeDocumentProtection(
              JSON.parse(
                element.getAttribute("data-document-protection") || "null",
              ),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const prot = normalizeDocumentProtection(
            (attributes as { documentProtection?: unknown }).documentProtection,
          );
          return prot
            ? { "data-document-protection": JSON.stringify(prot) }
            : {};
        },
      },
      // Word's Track Changes > For Everyone (`<w:trackRevisions/>` in
      // settings.xml, trackChangesMode.ts): ON tracks every co-author's edits
      // and is saved with the document. The default false renders nothing.
      trackRevisions: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-track-revisions") === "true",
        renderHTML: (attributes) =>
          normalizeTrackRevisions(
            (attributes as { trackRevisions?: unknown }).trackRevisions,
          )
            ? { "data-track-revisions": "true" }
            : {},
      },
      // Custom page size (width/height in INCHES). null (the default) = use the
      // `pageSize` preset, and the rendered HTML carries no extra attribute so a
      // preset-only document is byte-for-byte unchanged. Funneled through
      // normalizeCustomPageSize on parse AND render: both dimensions are clamped
      // to a sane inch range, so a malicious page or stray import can never
      // store an absurd or injected value. Persisted as JSON in a data attribute
      // so it survives HTML round-trips like the other doc attrs.
      customPageSize: {
        default: null as CustomPageSizeInches | null,
        parseHTML: (element) => {
          try {
            return normalizeCustomPageSize(
              JSON.parse(
                element.getAttribute("data-custom-page-size") || "null",
              ),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const custom = normalizeCustomPageSize(
            (attributes as { customPageSize?: unknown }).customPageSize,
          );
          return custom
            ? { "data-custom-page-size": JSON.stringify(custom) }
            : {};
        },
      },
      // Custom per-side margins (top/right/bottom/left in INCHES). null (the
      // default) = use the `pageMargins` preset; byte-for-byte unchanged when
      // absent. Funneled through normalizeCustomPageMargins on parse AND render
      // (every side clamped), so nothing injected/absurd can be stored.
      customPageMargins: {
        default: null as CustomPageMarginsInches | null,
        parseHTML: (element) => {
          try {
            return normalizeCustomPageMargins(
              JSON.parse(
                element.getAttribute("data-custom-page-margins") || "null",
              ),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const custom = normalizeCustomPageMargins(
            (attributes as { customPageMargins?: unknown }).customPageMargins,
          );
          return custom
            ? { "data-custom-page-margins": JSON.stringify(custom) }
            : {};
        },
      },
      columns: {
        default: DEFAULT_COLUMN_COUNT,
        parseHTML: (element) =>
          normalizeColumns(element.getAttribute("data-columns")) ??
          DEFAULT_COLUMN_COUNT,
        renderHTML: (attributes) => {
          const columns =
            normalizeColumns((attributes as { columns?: unknown }).columns) ??
            DEFAULT_COLUMN_COUNT;
          return { "data-columns": String(columns) };
        },
      },
      // Between-columns vertical rule (Word "Line between" 分栏分隔线). Funneled
      // through resolveColumnSeparator on parse AND render; the only non-default
      // value is `true`. The default `false` renders NO `data-*` attribute, so a
      // document without the rule is byte-for-byte unchanged — the attr is only
      // persisted when on. NoteEditor reads the resolved value and paints a CSS
      // `column-rule` (only when genuinely multi-column); the DOCX exporter adds
      // `w:sep="1"` to the body sectPr's `<w:cols>`.
      columnSeparator: {
        default: DEFAULT_COLUMN_SEPARATOR,
        parseHTML: (element) =>
          resolveColumnSeparator(element.getAttribute("data-column-separator")),
        renderHTML: (attributes) => {
          const on = resolveColumnSeparator(
            (attributes as { columnSeparator?: unknown }).columnSeparator,
          );
          return on ? { "data-column-separator": "true" } : {};
        },
      },
      // Document-wide writing mode (Word/WPS 文字方向 / 竖排). Funneled through
      // normalizeWritingMode on parse AND render; the only non-default value is
      // "vertical-rl" (top-to-bottom, right-to-left columns). The default
      // "horizontal-tb" renders NO `data-*` attribute, so a horizontal document
      // is byte-for-byte unchanged — the attr is only persisted when vertical.
      // NoteEditor reads the resolved value and flips the editing surface to
      // `writing-mode: vertical-rl`; the DOCX exporter emits `<w:textDirection
      // w:val="tbRl"/>` in the body sectPr.
      writingMode: {
        default: DEFAULT_WRITING_MODE,
        parseHTML: (element) =>
          normalizeWritingMode(element.getAttribute("data-writing-mode")) ??
          DEFAULT_WRITING_MODE,
        renderHTML: (attributes) => {
          const mode = normalizeWritingMode(
            (attributes as { writingMode?: unknown }).writingMode,
          );
          return mode && mode !== DEFAULT_WRITING_MODE
            ? { "data-writing-mode": mode }
            : {};
        },
      },
      // Document-wide manuscript grid (WPS Writer / Word 稿纸 / squared paper).
      // Funneled through normalizeManuscriptGrid on parse AND render; the only
      // non-default values are "grid" (full character cells) and "lines" (baseline
      // rules only). The default "off" renders NO `data-*` attribute, so a document
      // without a manuscript grid is byte-for-byte unchanged — the attr is only
      // persisted when a grid is enabled. NoteEditor reads the resolved value and
      // paints a repeating character-cell background on the editing surface; the
      // DOCX exporter emits `<w:docGrid w:type="lines" .../>` in the body sectPr.
      manuscriptGrid: {
        default: DEFAULT_MANUSCRIPT_GRID,
        parseHTML: (element) =>
          normalizeManuscriptGrid(
            element.getAttribute("data-manuscript-grid"),
          ) ?? DEFAULT_MANUSCRIPT_GRID,
        renderHTML: (attributes) => {
          const mode = normalizeManuscriptGrid(
            (attributes as { manuscriptGrid?: unknown }).manuscriptGrid,
          );
          return mode && mode !== DEFAULT_MANUSCRIPT_GRID
            ? { "data-manuscript-grid": mode }
            : {};
        },
      },
      // Word `<w:docGrid w:linePitch>` in twips (only meaningful when the
      // document declares a lines/chars grid). The paged layout engine snaps
      // per-line consumption UP to whole pitch slots — Word's snap-to-grid —
      // when this is present; absent (null) leaves pagination unquantized and
      // pre-existing documents byte-for-byte unchanged.
      docGridLinePitch: {
        default: null,
        parseHTML: (element) =>
          normalizeDocGridLinePitch(
            element.getAttribute("data-doc-grid-line-pitch"),
          ),
        renderHTML: (attributes) => {
          const pitch = normalizeDocGridLinePitch(
            (attributes as { docGridLinePitch?: unknown }).docGridLinePitch,
          );
          return pitch ? { "data-doc-grid-line-pitch": String(pitch) } : {};
        },
      },
      // Document-wide base typography (e.g. an imported DOCX's Normal-style
      // font). Funneled through the same TextStyling sanitizers on parse AND
      // render; NoteEditor paints them on the page surface so runs without
      // explicit marks inherit the document's own base font.
      designColorSet: {
        default: null,
        parseHTML: (element) =>
          normalizeOfficeThemePaletteId(
            element.getAttribute("data-design-color-set"),
          ),
        renderHTML: (attributes) => {
          const colorSet = normalizeOfficeThemePaletteId(
            (attributes as { designColorSet?: unknown }).designColorSet,
          );
          return colorSet ? { "data-design-color-set": colorSet } : {};
        },
      },
      defaultFontFamily: {
        default: null,
        parseHTML: (element) =>
          normalizeFontFamily(element.getAttribute("data-default-font-family")),
        renderHTML: (attributes) => {
          const family = normalizeFontFamily(
            (attributes as { defaultFontFamily?: unknown }).defaultFontFamily,
          );
          return family ? { "data-default-font-family": family } : {};
        },
      },
      // The defaults' eastAsia face where their ascii face is an East Asian
      // one too (宋体 over ＭＳ 明朝): Word sets the defaults' East Asian
      // text in it (`documentDefaultEastAsianFontFamily`). Read-only source
      // evidence: no command writes it.
      defaultEastAsianFontFamily: {
        default: null,
        parseHTML: (element) =>
          normalizeFontFamily(element.getAttribute("data-default-east-asian-font-family")),
        renderHTML: (attributes) => {
          const family = normalizeFontFamily(
            (attributes as { defaultEastAsianFontFamily?: unknown }).defaultEastAsianFontFamily,
          );
          return family ? { "data-default-east-asian-font-family": family } : {};
        },
      },
      defaultFontSize: {
        default: null,
        parseHTML: (element) =>
          normalizeFontSize(element.getAttribute("data-default-font-size")),
        renderHTML: (attributes) => {
          const size = normalizeFontSize(
            (attributes as { defaultFontSize?: unknown }).defaultFontSize,
          );
          return size ? { "data-default-font-size": size } : {};
        },
      },
      defaultTextColor: {
        default: null,
        parseHTML: (element) =>
          normalizeTextColor(element.getAttribute("data-default-text-color")),
        renderHTML: (attributes) => {
          const color = normalizeTextColor(
            (attributes as { defaultTextColor?: unknown }).defaultTextColor,
          );
          return color ? { "data-default-text-color": color } : {};
        },
      },
      // Word's Normal/docDefaults paragraph metrics. These are document
      // defaults (not toolbar formatting on every paragraph), so imported
      // content can keep Word's single-line/zero-gap flow while native notes
      // continue to use the roomier app prose defaults. Explicit zero spacing
      // is preserved because it is semantically different from an unset attr.
      defaultLineHeight: {
        default: null,
        parseHTML: (element) =>
          normalizeDefaultLineHeight(
            element.getAttribute("data-default-line-height"),
          ),
        renderHTML: (attributes) => {
          const lineHeight = normalizeDefaultLineHeight(
            (attributes as { defaultLineHeight?: unknown }).defaultLineHeight,
          );
          return lineHeight ? { "data-default-line-height": lineHeight } : {};
        },
      },
      defaultTextAlign: {
        default: null,
        parseHTML: (element) =>
          normalizeDocumentDefaultTextAlign(
            element.getAttribute("data-default-text-align"),
          ),
        renderHTML: (attributes) => {
          const align = normalizeDocumentDefaultTextAlign(
            (attributes as { defaultTextAlign?: unknown }).defaultTextAlign,
          );
          return align ? { "data-default-text-align": align } : {};
        },
      },
      characterSpacingControl: {
        default: null,
        parseHTML: (element) =>
          normalizeDocumentCharacterSpacingControl(
            element.getAttribute("data-character-spacing-control"),
          ),
        renderHTML: (attributes) => {
          const control = normalizeDocumentCharacterSpacingControl(
            (attributes as { characterSpacingControl?: unknown })
              .characterSpacingControl,
          );
          return control ? { "data-character-spacing-control": control } : {};
        },
      },
      // Raw Word compatibility setting. It is intentionally JSON-only: the
      // live and preview surfaces receive the separately resolved effective
      // spacing token from NoteEditor.
      doNotUseEastAsianBreakRules: { default: null, rendered: false },
      // The source's Word compatibility mode (15 = Word 2013 and later):
      // read-only layout evidence for rules that differ by mode, JSON-only.
      wordCompatibilityMode: { default: null, rendered: false },
      // Word's "Adjust line height to grid height in the table"
      // (w:compat/w:adjustLineHeightInTable): table lines take the document
      // grid's pitch too. Read-only layout evidence, JSON-only.
      wordTableLinesOnGrid: { default: null, rendered: false },
      // Word's "Don't use HTML paragraph auto spacing"
      // (w:compat/w:doNotUseHTMLParagraphAutoSpacing): a paragraph's space
      // after and the next one's space before add up instead of overlapping.
      // Read-only layout evidence, JSON-only.
      wordSpacingAddsUp: { default: null, rendered: false },
      // The East Asian proofing language a run takes with none of its own
      // (w:lang/@w:eastAsia of Normal or the document defaults): it decides
      // which punctuation pairs Word compresses. Read-only, JSON-only.
      eastAsianLanguage: { default: null, rendered: false },
      // Word's strict line-start/end rules (w:strictFirstAndLastChars): small
      // kana and the prolonged sound mark may not start a line. Read-only,
      // JSON-only; without it Word's standard list lets them.
      wordStrictKinsoku: { default: null, rendered: false },
      wordBalanceSbcsDbcs: { default: null, rendered: false },
      // The spaces that option sets at half an East Asian cell, with East
      // Asian layout on (balancedSpaces.ts). Read-only layout evidence.
      wordBalancedSpaces: { default: null, rendered: false },
      // Word's "Don't break wrapped tables across pages" (w:compat), read
      // before mode 15: a floating table stays whole on its page
      // (tablePageFrame). Read-only layout evidence.
      wordDoNotBreakWrappedTables: { default: null, rendered: false },
      defaultKinsoku: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("data-default-kinsoku");
          return value === "true" ? true : value === "false" ? false : null;
        },
        renderHTML: (attributes) => {
          const value = normalizeDocumentDefaultKinsoku(
            (attributes as { defaultKinsoku?: unknown }).defaultKinsoku,
          );
          return value === null
            ? {}
            : { "data-default-kinsoku": String(value) };
        },
      },
      defaultParagraphSpaceBefore: {
        default: null,
        parseHTML: (element) =>
          normalizeSpacing(
            element.getAttribute("data-default-paragraph-space-before"),
          ),
        renderHTML: (attributes) => {
          const points = normalizeSpacing(
            (attributes as { defaultParagraphSpaceBefore?: unknown })
              .defaultParagraphSpaceBefore,
          );
          return points !== null
            ? { "data-default-paragraph-space-before": String(points) }
            : {};
        },
      },
      defaultParagraphSpaceAfter: {
        default: null,
        parseHTML: (element) =>
          normalizeSpacing(
            element.getAttribute("data-default-paragraph-space-after"),
          ),
        renderHTML: (attributes) => {
          const points = normalizeSpacing(
            (attributes as { defaultParagraphSpaceAfter?: unknown })
              .defaultParagraphSpaceAfter,
          );
          return points !== null
            ? { "data-default-paragraph-space-after": String(points) }
            : {};
        },
      },
      // The Normal style's indents (Paragraph dialog > Set As Default on a
      // document written in MRAI): points, a negative first line hangs.
      // Paragraphs that state no indent of their own draw these; the DOCX
      // exporter writes them as Normal's `w:ind`. Null: Word's zero.
      defaultIndentLeftPt: {
        default: null,
        parseHTML: (element) =>
          normalizeIndentPt(element.getAttribute("data-default-indent-left-pt")),
        renderHTML: (attributes) => {
          const points = normalizeIndentPt(
            (attributes as { defaultIndentLeftPt?: unknown }).defaultIndentLeftPt,
          );
          return points !== null
            ? { "data-default-indent-left-pt": String(points) }
            : {};
        },
      },
      defaultIndentRightPt: {
        default: null,
        parseHTML: (element) =>
          normalizeIndentPt(element.getAttribute("data-default-indent-right-pt")),
        renderHTML: (attributes) => {
          const points = normalizeIndentPt(
            (attributes as { defaultIndentRightPt?: unknown }).defaultIndentRightPt,
          );
          return points !== null
            ? { "data-default-indent-right-pt": String(points) }
            : {};
        },
      },
      defaultFirstLineIndentPt: {
        default: null,
        parseHTML: (element) =>
          normalizeFirstLineIndentPt(
            element.getAttribute("data-default-first-line-indent-pt"),
          ),
        renderHTML: (attributes) => {
          const points = normalizeFirstLineIndentPt(
            (attributes as { defaultFirstLineIndentPt?: unknown })
              .defaultFirstLineIndentPt,
          );
          return points !== null
            ? { "data-default-first-line-indent-pt": String(points) }
            : {};
        },
      },
      // Named-style palette (Word 样式库). Sanitized on parse AND render via
      // sanitizeNamedStyles; persisted as JSON in a data attribute so the
      // palette survives HTML round-trips like the other doc attrs.
      namedStyles: {
        default: [],
        parseHTML: (element) => {
          try {
            return ensureStableNamedStyleIds(
              JSON.parse(element.getAttribute("data-named-styles") || "[]"),
            );
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => {
          const styles = ensureStableNamedStyleIds(
            (attributes as { namedStyles?: unknown }).namedStyles,
          );
          return styles.length
            ? { "data-named-styles": JSON.stringify(styles) }
            : {};
        },
      },
      // The document's own definition of Word's built-in Heading 1..6 styles.
      // Sanitized on parse AND render so a stray import or a hostile page can
      // never store an off-range size, a non-colour, or an extra property.
      // The document's modified TOC 1..9 and Table of Figures styles (Word's
      // Modify Style from the Table of Contents / Table of Figures dialogs).
      // Word's building blocks saved in this document (Create New Building
      // Block > Save in: this document).
      quickParts: {
        default: null as DocumentQuickPart[] | null,
        parseHTML: (element: HTMLElement) => {
          try {
            return normalizeDocumentQuickParts(
              JSON.parse(element.getAttribute("data-quick-parts") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const parts = normalizeDocumentQuickParts(attributes.quickParts);
          return parts ? { "data-quick-parts": JSON.stringify(parts) } : {};
        },
      },
      referenceStyles: {
        default: null as ReferenceStyleMap | null,
        parseHTML: (element: HTMLElement) => {
          try {
            return normalizeReferenceStyles(
              JSON.parse(element.getAttribute("data-reference-styles") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const styles = normalizeReferenceStyles(attributes.referenceStyles);
          return styles
            ? { "data-reference-styles": JSON.stringify(styles) }
            : {};
        },
      },
      headingStyles: {
        default: null as HeadingStyleMap | null,
        parseHTML: (element: HTMLElement) => {
          try {
            return normalizeHeadingStyles(
              JSON.parse(element.getAttribute("data-heading-styles") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const styles = normalizeHeadingStyles(attributes.headingStyles);
          return styles
            ? { "data-heading-styles": JSON.stringify(styles) }
            : {};
        },
      },
      // The document's own Word font-table families whose `w:sig/@w:csb0`
      // declares an East Asian code page. Word gives exactly those faces the
      // 1.3x single-line pitch, so the editor's auto line-spacing projection
      // needs the source declaration, not a guess from the family name or from
      // the script of the text. Read-only source evidence: no command writes
      // it, and it is sanitized on parse AND render like the other doc attrs.
      eastAsianFontFamilies: {
        default: null as string[] | null,
        parseHTML: (element) => {
          try {
            return normalizeEastAsianFontFamilies(
              JSON.parse(
                element.getAttribute("data-east-asian-font-families") || "null",
              ),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const families = normalizeEastAsianFontFamilies(
            (attributes as { eastAsianFontFamilies?: unknown })
              .eastAsianFontFamilies,
          );
          return families
            ? { "data-east-asian-font-families": JSON.stringify(families) }
            : {};
        },
      },
      // Stable OOXML style graph + compressed source styles parts.  This is a
      // fidelity payload, not the small visual namedStyles palette.
      styleDefinitions: {
        default: null as DocxStyleDefinitions | null,
        // JSON/autosave only. A raw styles part can be several megabytes; never
        // mirror that opaque payload into a DOM attribute or HTML clipboard.
        // Server DOCX export is the only supported package egress path.
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      // Document-level text watermark (Word 水印). Funneled through
      // normalizeWatermark on parse AND render: the text is sanitized (single
      // line, no control bytes, clamped), the color re-validated through the
      // strict #rrggbb gate, and the opacity clamped — so a malicious page or
      // stray import can never store markup, injected CSS, or an unbounded
      // value. Persisted as JSON in a data attribute so it survives HTML
      // round-trips like the other doc attrs. `null` (the default) = no
      // watermark, and the rendered HTML carries no extra attribute, so a
      // document without a watermark is byte-for-byte unchanged.
      watermark: {
        default: null as DocumentWatermark | null,
        parseHTML: (element) => {
          try {
            return normalizeDocumentWatermark(
              JSON.parse(element.getAttribute("data-watermark") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const watermark = normalizeDocumentWatermark(
            (attributes as { watermark?: unknown }).watermark,
          );
          return watermark
            ? { "data-watermark": JSON.stringify(watermark) }
            : {};
        },
      },
      // Document-level page border (Word 页面边框 / `<w:pgBorders>`). Funneled
      // through normalizePageBorder on parse AND render: the preset, style, width
      // and color are each re-validated through a closed whitelist/clamp, so a
      // malicious page or stray import can never store an off-whitelist value,
      // markup, or an unbounded width. Persisted as JSON in a data attribute so
      // it survives HTML round-trips like the other doc attrs. `null` (the
      // default) = no border, and the rendered HTML carries no extra attribute,
      // so a document without a page border is byte-for-byte unchanged.
      pageBorder: {
        default: null as PageBorder | null,
        parseHTML: (element) => {
          try {
            return normalizePageBorder(
              JSON.parse(element.getAttribute("data-page-border") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const border = normalizePageBorder(
            (attributes as { pageBorder?: unknown }).pageBorder,
          );
          return border ? { "data-page-border": JSON.stringify(border) } : {};
        },
      },
      // Document-level line numbering (Word 行号 / `<w:lnNumType>`). Funneled
      // through normalizeLineNumbers on parse AND render: the count-by step,
      // restart mode and distance are each re-validated/clamped, so a forged
      // config cannot store an off-whitelist mode or an unbounded value.
      // Persisted as JSON in a data attribute so it survives HTML round-trips.
      // `null` (the default) = off, and the rendered HTML carries no extra
      // attribute, so a document without line numbering is byte-for-byte
      // unchanged.
      lineNumbers: {
        default: null as LineNumbers | null,
        parseHTML: (element) => {
          try {
            return normalizeLineNumbers(
              JSON.parse(element.getAttribute("data-line-numbers") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const lineNumbers = normalizeLineNumbers(
            (attributes as { lineNumbers?: unknown }).lineNumbers,
          );
          return lineNumbers
            ? { "data-line-numbers": JSON.stringify(lineNumbers) }
            : {};
        },
      },
      // Document-level page background color (Word/WPS 页面颜色 /
      // `<w:background w:color>`). Funneled through normalizePageBackgroundColor
      // on parse AND render: any non-6-hex value resolves to null, so a forged
      // attr cannot inject CSS through the surface fill. Persisted as a bare hex
      // string in a data attribute so it survives HTML round-trips. `null` (the
      // default) = no fill, and the rendered HTML carries no extra attribute, so
      // a document without a page color is byte-for-byte unchanged.
      pageBackgroundColor: {
        default: null as string | null,
        parseHTML: (element) =>
          normalizePageBackgroundColor(
            element.getAttribute("data-page-background-color"),
          ),
        renderHTML: (attributes) => {
          const color = normalizePageBackgroundColor(
            (attributes as { pageBackgroundColor?: unknown })
              .pageBackgroundColor,
          );
          return color ? { "data-page-background-color": color } : {};
        },
      },
      // The page's Fill Effects gradient (Design > Page Color > Fill Effects,
      // `w:background/v:background/v:fill`): the shared gradient model it is
      // painted with over the page colour, and the v:fill attributes the full
      // export writes back. Read-only layout evidence of the import; `null`
      // (the default) = none, and the HTML carries nothing for it.
      pageBackgroundFill: {
        default: null as unknown,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      // The paper a document is written on with the pen (Draw ▸ Background:
      // "rule", "grid", "dot"), drawn on the editor's pages only, never
      // printed or exported (Word has no such page). `null` = plain paper.
      inkPaper: {
        default: null as InkPaper | null,
        parseHTML: (element) => normalizeInkPaper(element.getAttribute("data-ink-paper")),
        renderHTML: (attributes) => {
          const paper = normalizeInkPaper((attributes as { inkPaper?: unknown }).inkPaper);
          return paper ? { "data-ink-paper": paper } : {};
        },
      },
      // Word's File > Info > Protect Document > Encrypt with Password: the
      // document is saved encrypted (ECMA-376 Agile Encryption). Only that
      // it is; the password itself is never part of the document
      // (lib/office/office-encryption keeps it for the open session).
      encryptWithPassword: {
        default: false,
        parseHTML: () => false,
        renderHTML: () => ({}),
      },
      // A handwriting document (手写文档, lib/handwriting-paper): its cover
      // (the notebook cover it was made with, drawn as the first page) and
      // the paper every page is drawn on, in the page's own size. `null` =
      // an ordinary document.
      handwritingDocument: {
        default: null as HandwritingDocumentSetting | null,
        parseHTML: (element) => {
          try {
            return normalizeHandwritingDocument(
              JSON.parse(element.getAttribute("data-handwriting-document") || "null"),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const setting = normalizeHandwritingDocument(
            (attributes as { handwritingDocument?: unknown }).handwritingDocument,
          );
          return setting ? { "data-handwriting-document": JSON.stringify(setting) } : {};
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [sectionLayoutDecorationPlugin(), wordCjkSpacingProjectionPlugin(this.options.waitForSourceFontPlan)];
  },

  addCommands() {
    return {
      restoreDocumentPageSetup:
        (attrs: unknown) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            for (const [name, value] of Object.entries(
              normalizeHydratedDocumentPageAttrs(attrs),
            )) {
              tr.setDocAttribute(name, value);
            }
            trustReadOnlyDocumentMutation(tr, "hydration-restore");
          }
          return true;
        },
      // Page-setup attributes live on the top-level `doc` node. TipTap's
      // `updateAttributes` walks descendants via nodesBetween() and never
      // visits the doc node itself, so we set the attribute directly through
      // ProseMirror's DocAttrStep (`tr.setDocAttribute`).
      setPageSize:
        (size: PageSize) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizePageSize(size);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("pageSize", next);
          }
          return true;
        },
      setPageMargins:
        (margins: PageMargins) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizePageMargins(margins);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("pageMargins", next);
          }
          return true;
        },
      // The page orientation also lives on the top-level `doc` node, so it is set
      // through the same DocAttrStep and re-validated against the whitelist here
      // (an off-whitelist value is rejected, returning false). Setting the default
      // "portrait" is permitted (toggling back) and renders no `data-*` attribute,
      // so the document round-trips byte-for-byte.
      setPageOrientation:
        (orientation: PageOrientation) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizePageOrientation(orientation);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("pageOrientation", next);
          }
          return true;
        },
      // Read-only protection lives on the top-level `doc` node, toggled through
      // the same DocAttrStep. The pure toggleDocumentProtection flips the lock;
      // null (unlocked) clears the attr so an editable doc stays byte-clean.
      setDocumentProtectionMode:
        (mode: DocumentProtectionMode | null) =>
        ({ tr, dispatch }) => {
          // A password lock (a protected Word file) is never changed here.
          if (normalizeDocumentProtection(tr.doc.attrs.documentProtection)?.credentials) return false;
          const next = mode === null ? null : normalizeDocumentProtection({ enabled: true, mode });
          if (mode !== null && next?.mode !== mode) return false;
          if (dispatch) tr.setDocAttribute("documentProtection", next);
          return true;
        },
      toggleDocumentProtection:
        () =>
        ({ tr, dispatch }) => {
          const current = normalizeDocumentProtection(
            tr.doc.attrs.documentProtection,
          );
          if (current?.mode === "trackedChanges") return false;
          if (dispatch) {
            const next = toggleDocumentProtection(current);
            tr.setDocAttribute("documentProtection", next);
          }
          return true;
        },
      // Custom size/margins ALSO live on the top-level `doc` node, set through
      // the same DocAttrStep and re-validated here. A valid value stores the
      // clamped custom dims AND flips the matching preset attr to `custom` (so
      // the surface + export read the custom path). A null/invalid value clears
      // the custom attr back to null; the preset (already `custom` or a real
      // preset) keeps describing the page. Always returns true so clearing is
      // permitted.
      setCustomPageSize:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const custom = normalizeCustomPageSize(value);
          if (dispatch) {
            tr.setDocAttribute("customPageSize", custom);
            if (custom) {
              tr.setDocAttribute("pageSize", "custom");
            }
          }
          return true;
        },
      setCustomPageMargins:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const custom = normalizeCustomPageMargins(value);
          if (dispatch) {
            tr.setDocAttribute("customPageMargins", custom);
            if (custom) {
              tr.setDocAttribute("pageMargins", "custom");
            }
          }
          return true;
        },
      // The multi-column count also lives on the top-level `doc` node, so it is
      // set through the same DocAttrStep and re-validated against the whitelist
      // here (an off-whitelist count is rejected, returning false).
      setColumns:
        (columns: ColumnCount) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizeColumns(columns);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("columns", next);
          }
          return true;
        },
      // The between-columns rule (分栏分隔线) also lives on the top-level `doc`
      // node, set through the same DocAttrStep and coerced to a clean boolean
      // here. Setting the default `false` is permitted (untoggling) and renders
      // no `data-*` attribute, so the document round-trips byte-for-byte.
      setColumnSeparator:
        (enabled: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "columnSeparator",
              resolveColumnSeparator(enabled),
            );
          }
          return true;
        },
      // The writing mode also lives on the top-level `doc` node, so it is set
      // through the same DocAttrStep and re-validated against the whitelist here
      // (an off-whitelist mode is rejected, returning false). Setting the default
      // "horizontal-tb" is permitted (untoggling back to horizontal) and renders
      // no `data-*` attribute, so the document round-trips byte-for-byte.
      setWritingMode:
        (mode: WritingMode) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizeWritingMode(mode);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("writingMode", next);
          }
          return true;
        },
      // The manuscript grid (稿纸) also lives on the top-level `doc` node, so it is
      // set through the same DocAttrStep and re-validated against the whitelist
      // here (an off-whitelist mode is rejected, returning false). Setting the
      // default "off" is permitted (untoggling back to no grid) and renders no
      // `data-*` attribute, so the document round-trips byte-for-byte.
      setManuscriptGrid:
        (mode: ManuscriptGrid) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizeManuscriptGrid(mode);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("manuscriptGrid", next);
          }
          return true;
        },
      // Header/footer text also lives on the top-level `doc` node, so it is set
      // through the same DocAttrStep. The value is sanitized here (single line,
      // no control chars, clamped) before it is stored; an empty string clears
      // the band. Always returns true so clearing (setting "") is permitted.
      setDocumentHeader:
        (text: string) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("headerText", sanitizeHeaderFooterText(text));
          }
          return true;
        },
      setDocumentFooter:
        (text: string) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("footerText", sanitizeHeaderFooterText(text));
          }
          return true;
        },
      setDocumentBandRich:
        (
          kind: "header" | "footer",
          variant: "normal" | "first" | "even",
          blocks: unknown,
        ) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const key = (
            {
              header: {
                normal: "headerRich",
                first: "firstPageHeaderRich",
                even: "evenPageHeaderRich",
              },
              footer: {
                normal: "footerRich",
                first: "firstPageFooterRich",
                even: "evenPageFooterRich",
              },
            } as const
          )[kind]?.[variant];
          if (!key) return false;
          const textKey = (
            {
              header: {
                normal: "headerText",
                first: "firstPageHeader",
                even: "evenPageHeader",
              },
              footer: {
                normal: "footerText",
                first: "firstPageFooter",
                even: "evenPageFooter",
              },
            } as const
          )[kind]?.[variant];
          if (!textKey) return false;
          const normalized = normalizeBandRichBlocks(blocks);
          if (dispatch) {
            tr.setDocAttribute(key, normalized);
            tr.setDocAttribute(textKey, "");
          }
          return true;
        },
      splitSectionBandEntry:
        (sectionIndex: number) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const current = normalizeSectionBands(
            editor.state.doc.attrs.sectionBands,
          );
          if (
            !current ||
            !Number.isInteger(sectionIndex) ||
            sectionIndex < 0 ||
            sectionIndex >= current.length
          ) {
            return false;
          }
          let sectionCount = 1;
          editor.state.doc.descendants((node) => {
            if (node.type.name === "sectionBreak") sectionCount += 1;
            return true;
          });
          // The section-story boundary sync already split the entry in the
          // transaction that inserted the boundary.
          if (current.length === sectionCount) return true;
          if (dispatch) {
            // A new boundary split section N into [N, N+1]: both halves
            // start as copies of the original entry so nothing visibly
            // changes until the follow-up band write edits ONE of them.
            const next = [
              ...current.slice(0, sectionIndex + 1),
              { ...current[sectionIndex] },
              ...current.slice(sectionIndex + 1),
            ];
            tr.setDocAttribute("sectionBands", next);
          }
          return true;
        },
      setSectionBand:
        (
          sectionIndex: number,
          kind: "header" | "footer",
          variant: "normal" | "first" | "even",
          text: string,
        ) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          // Shared with setSectionPageNumberStory: resolve (materializing on a
          // first sectioned edit) the per-section band array this write edits.
          // Beside a story graph the entries may be seeded empty: that branch
          // projects the story it writes back into them.
          const resolvedBands = resolveSectionBandsForWrite(editor, { seedBesideGraph: true });
          if (!resolvedBands) return false;
          const current = resolvedBands.bands;
          const materialized = resolvedBands.materialized;
          const graphPresent =
            editor.state.doc.attrs.sectionStoryGraph !== null &&
            editor.state.doc.attrs.sectionStoryGraph !== undefined;
          if (
            !Number.isInteger(sectionIndex) ||
            sectionIndex < 0 ||
            sectionIndex >= current.length
          ) {
            return false;
          }
          const key = (
            {
              header: {
                normal: "headerText",
                first: "firstPageHeader",
                even: "evenPageHeader",
              },
              footer: {
                normal: "footerText",
                first: "firstPageFooter",
                even: "evenPageFooter",
              },
            } as const
          )[kind]?.[variant];
          if (!key) return false;
          const richKey = (
            {
              header: {
                normal: "headerRich",
                first: "firstPageHeaderRich",
                even: "evenPageHeaderRich",
              },
              footer: {
                normal: "footerRich",
                first: "firstPageFooterRich",
                even: "evenPageFooterRich",
              },
            } as const
          )[kind][variant];
          const linkKey = (
            {
              header: {
                normal: "headerLinkedToPrevious",
                first: "firstPageHeaderLinkedToPrevious",
                even: "evenPageHeaderLinkedToPrevious",
              },
              footer: {
                normal: "footerLinkedToPrevious",
                first: "firstPageFooterLinkedToPrevious",
                even: "evenPageFooterLinkedToPrevious",
              },
            } as const
          )[kind][variant];
          if (graphPresent) {
            const graph = normalizeSectionStoryGraph(
              editor.state.doc.attrs.sectionStoryGraph,
              current.length,
            );
            const storyVariant: SectionStoryVariant =
              variant === "normal" ? "default" : variant;
            const sanitized = sanitizeHeaderFooterText(text);
            const blocks: BandRichBlock[] = sanitized
              ? sanitized.split("\n").map((line) => ({
                  type: "paragraph",
                  runs: [{ text: line }],
                }))
              : [];
            if (!graph) return false;
            const effectiveRef = resolveEffectiveSectionStoryRef(
              graph,
              sectionIndex,
              kind,
              storyVariant,
            );
            const preparedGraph = sanitized
              ? storyVariant === "default" && effectiveRef
                ? graph
                : materializeSectionStoryRef(
                    graph,
                    sectionIndex,
                    kind,
                    storyVariant,
                    blocks,
                  )
              : graph;
            const targetRef = preparedGraph
              ? resolveEffectiveSectionStoryRef(
                  preparedGraph,
                  sectionIndex,
                  kind,
                  storyVariant,
                )
              : null;
            // Whether Word's part is blank is read against the band it paints,
            // as the rich write reads it: its text slots alone said a header
            // whose words are all tracked insertions, beside a drawn line, was
            // an empty part, and the plain text replaced the whole part --
            // which the save refuses (corpus R455-D41 / R456-D20 E26).
            const shownBlocks = normalizeBandRichBlocks(current[sectionIndex]?.[richKey]) ?? undefined;
            const nextGraph =
              preparedGraph && targetRef
                ? sanitized
                  ? setSectionStoryEditableContent(
                      preparedGraph,
                      sectionIndex,
                      kind,
                      storyVariant,
                      blocks,
                      shownBlocks,
                    )
                  : clearSectionStoryEditableContent(
                      preparedGraph,
                      sectionIndex,
                      kind,
                      storyVariant,
                    )
                : null;
            if (
              !preparedGraph ||
              !targetRef ||
              !nextGraph ||
              JSON.stringify(graph) === JSON.stringify(nextGraph)
            ) {
              return false;
            }
            const nextBands = projectNativeStoryIntoSectionBands(
              current,
              preparedGraph,
              targetRef.storyId,
              sanitized ? { mode: "text", text: sanitized } : { mode: "empty" },
            );
            if (dispatch) {
              tr.setDocAttribute("sectionStoryGraph", nextGraph);
              tr.setDocAttribute("sectionBands", nextBands);
            }
            return true;
          }
          if (dispatch) {
            const next = current.map((entry, index) => {
              if (index !== sectionIndex) return entry;
              const edited: Record<string, unknown> = {
                ...entry,
                [key]: sanitizeHeaderFooterText(text) ?? "",
              };
              // A plain edit intentionally replaces the rich override for this
              // one story.  Retaining it would make the user's new text appear
              // saved while the renderer/exporter continued to show the old
              // picture/table story.
              delete edited[richKey];
              // Word breaks Link to Previous when a linked story is edited.
              delete edited[linkKey];
              return edited;
            });
            tr.setDocAttribute("sectionBands", next);
            if (materialized) {
              // sectionBands is now the single source of truth for band
              // text/rich content — clear the doc-level copies in the SAME
              // transaction. Without this, clearing every section later
              // (normalizeSectionBands returns null for an all-empty array)
              // would resurrect the stale doc-level bands through the
              // uniform CSS path. The variant FLAGS deliberately stay on
              // the doc attrs: they seeded each entry and keep gating the
              // uniform fallback (and undo restores everything atomically).
              for (const textKey of SECTION_BAND_TEXT_KEYS) {
                tr.setDocAttribute(textKey, "");
              }
              for (const richKey of SECTION_BAND_RICH_KEYS) {
                tr.setDocAttribute(richKey, null);
              }
            }
          }
          return true;
        },
      setSectionBandRich:
        (
          sectionIndex: number,
          kind: "header" | "footer",
          variant: "normal" | "first" | "even",
          blocks: unknown,
        ) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          // A .docx whose bands all read empty imports its story graph with no
          // sectionBands; the graph branch below writes the story and projects
          // it back into seeded entries, so it must not decline for that.
          const storyGraphAttr = editor.state.doc.attrs.sectionStoryGraph;
          const current =
            storyGraphAttr !== null && storyGraphAttr !== undefined
              ? (resolveSectionBandsForWrite(editor, { seedBesideGraph: true })?.bands ?? null)
              : normalizeSectionBands(editor.state.doc.attrs.sectionBands);
          if (
            !current ||
            !Number.isInteger(sectionIndex) ||
            sectionIndex < 0 ||
            sectionIndex >= current.length
          ) {
            return false;
          }
          const key = (
            {
              header: {
                normal: "headerRich",
                first: "firstPageHeaderRich",
                even: "evenPageHeaderRich",
              },
              footer: {
                normal: "footerRich",
                first: "firstPageFooterRich",
                even: "evenPageFooterRich",
              },
            } as const
          )[kind]?.[variant];
          const textKey = (
            {
              header: {
                normal: "headerText",
                first: "firstPageHeader",
                even: "evenPageHeader",
              },
              footer: {
                normal: "footerText",
                first: "firstPageFooter",
                even: "evenPageFooter",
              },
            } as const
          )[kind]?.[variant];
          const linkKey = (
            {
              header: {
                normal: "headerLinkedToPrevious",
                first: "firstPageHeaderLinkedToPrevious",
                even: "evenPageHeaderLinkedToPrevious",
              },
              footer: {
                normal: "footerLinkedToPrevious",
                first: "firstPageFooterLinkedToPrevious",
                even: "evenPageFooterLinkedToPrevious",
              },
            } as const
          )[kind]?.[variant];
          if (!key || !textKey || !linkKey) return false;
          const clearRequested = Array.isArray(blocks) && blocks.length === 0;
          const normalized = normalizeBandRichBlocks(blocks);
          const graphPresent =
            editor.state.doc.attrs.sectionStoryGraph !== null &&
            editor.state.doc.attrs.sectionStoryGraph !== undefined;
          if (graphPresent) {
            const graph = normalizeSectionStoryGraph(
              editor.state.doc.attrs.sectionStoryGraph,
              current.length,
            );
            const storyVariant: SectionStoryVariant =
              variant === "normal" ? "default" : variant;
            if (!graph || (!normalized && !clearRequested)) return false;
            const richBlocks = normalized ?? [];
            const effectiveRef = resolveEffectiveSectionStoryRef(
              graph,
              sectionIndex,
              kind,
              storyVariant,
            );
            const preparedGraph =
              richBlocks.length > 0
                ? storyVariant === "default" && effectiveRef
                  ? graph
                  : materializeSectionStoryRef(
                      graph,
                      sectionIndex,
                      kind,
                      storyVariant,
                      richBlocks,
                    )
                : graph;
            const targetRef = preparedGraph
              ? resolveEffectiveSectionStoryRef(
                  preparedGraph,
                  sectionIndex,
                  kind,
                  storyVariant,
                )
              : null;
            const shownBlocks = normalizeBandRichBlocks(current[sectionIndex]?.[key]) ?? undefined;
            // Word's own part edited in the story editor paints the band its
            // edits write (Word's content named, typed runs placed), so the
            // next edit opens from exactly what the save will hold.
            const nativeCommit =
              preparedGraph && richBlocks.length > 0
                ? sectionStoryNativeCommit(
                    preparedGraph,
                    current.length,
                    sectionIndex,
                    kind,
                    storyVariant,
                    richBlocks,
                    shownBlocks,
                  )
                : null;
            if (nativeCommit && !nativeCommit.ok) return false;
            const paintBlocks = nativeCommit?.ok ? nativeCommit.paint : richBlocks;
            const nextGraph =
              preparedGraph && targetRef
                ? richBlocks.length > 0
                  ? setSectionStoryEditableContent(
                      preparedGraph,
                      sectionIndex,
                      kind,
                      storyVariant,
                      richBlocks,
                      shownBlocks,
                    )
                  : clearSectionStoryEditableContent(
                      preparedGraph,
                      sectionIndex,
                      kind,
                      storyVariant,
                    )
                : null;
            if (
              !preparedGraph ||
              !targetRef ||
              !nextGraph ||
              JSON.stringify(graph) === JSON.stringify(nextGraph)
            ) {
              return false;
            }
            const nextBands = projectNativeStoryIntoSectionBands(
              current,
              preparedGraph,
              targetRef.storyId,
              richBlocks.length > 0
                ? { mode: "rich", blocks: paintBlocks }
                : { mode: "empty" },
            );
            if (dispatch) {
              tr.setDocAttribute("sectionStoryGraph", nextGraph);
              tr.setDocAttribute("sectionBands", nextBands);
            }
            return true;
          }
          if (dispatch) {
            const next = current.map((entry, index) => {
              if (index !== sectionIndex) return entry;
              const edited: Record<string, unknown> = { ...entry };
              if (normalized) {
                edited[key] = normalized as BandRichBlock[];
                delete edited[textKey];
              } else {
                delete edited[key];
                // Explicit blank tombstone for this transaction. The save
                // bridge compares the previous snapshot so even if hydration
                // later collapses all-empty sectionBands to null, source DOCX
                // patchback still clears the native story.
                edited[textKey] = "";
              }
              // Rich is the authoritative story; remove a stale flattened
              // fallback and detach this variant from the previous section.
              delete edited[linkKey];
              return edited;
            });
            tr.setDocAttribute("sectionBands", next);
          }
          return true;
        },
      setSectionPageNumberStory:
        (
          sectionIndex: number,
          kind: SectionStoryKind,
          variant: SectionStoryVariant,
          alignment: PageNumberStoryAlignment | null,
          includePageCount = false,
        ) =>
        ({ editor, tr, dispatch }) => {
          if (
            !editor.isEditable ||
            !Number.isInteger(sectionIndex) ||
            sectionIndex < 0 ||
            (kind !== "header" && kind !== "footer") ||
            !(["default", "first", "even"] as const).includes(variant) ||
            (alignment !== null &&
              !(["left", "center", "right"] as const).includes(alignment)) ||
            typeof includePageCount !== "boolean"
          ) {
            return false;
          }
          let sectionCount = 1;
          editor.state.doc.descendants((node) => {
            if (node.type.name === "sectionBreak") sectionCount += 1;
            return true;
          });
          if (sectionIndex >= sectionCount) return false;
          const attrs = editor.state.doc.attrs as Record<string, unknown>;
          // Word's Page Number gallery works on a brand-new document, so this
          // command must too: resolve (materializing when the document has
          // never carried one) the per-section band array, exactly as
          // setSectionBand does. Requiring a pre-existing sectionStoryGraph AND
          // sectionBands is what left every Page Number control permanently
          // disabled on a native/freshly imported document.
          const resolvedBands = resolveSectionBandsForWrite(editor, {
            pageScoped: false,
            // An imported .docx with header/footer parts carries the story graph
            // but no sectionBands; the graph path below projects its result
            // through projectNativeStoryIntoSectionBands, so empty seeds are
            // safe and the Page Number gallery stays usable after an import.
            seedBesideGraph: true,
          });
          if (!resolvedBands) return false;
          const bands = resolvedBands.bands;
          if (bands.length !== sectionCount) return false;
          const graph = normalizeSectionStoryGraph(
            attrs.sectionStoryGraph,
            sectionCount,
          );
          if (!graph) {
            // NO native story graph (an MRAI-authored document, or an imported
            // one with no header/footer parts). The band entry itself is the
            // story: add/move/remove the closed PAGE (+ NUMPAGES) field
            // building block in its rich blocks. `bandVariantRichBlocks` lifts
            // a plain-text band into paragraphs first so authored band text
            // survives. Export reads the same `*Rich` blocks, so the field
            // reaches DOCX as a real `PAGE` instruction.
            const richKey = SECTION_STORY_RICH_KEYS[kind][variant];
            const textKey = SECTION_STORY_TEXT_KEYS[kind][variant];
            const linkKey = SECTION_STORY_LINK_KEYS[kind][variant];
            const currentBlocks = bandVariantRichBlocks(
              bands[sectionIndex],
              kind,
              variant,
            );
            const nextBlocks = updateBandRichPageNumbers(
              currentBlocks,
              alignment === null ? null : { alignment, includePageCount },
            );
            if (
              !nextBlocks ||
              JSON.stringify(currentBlocks) === JSON.stringify(nextBlocks)
            ) {
              return false;
            }
            if (dispatch) {
              const nextBands = bands.map((entry, index) => {
                if (index !== sectionIndex) return entry;
                const edited: Record<string, unknown> = { ...entry };
                if (nextBlocks.length > 0) {
                  edited[richKey] = nextBlocks;
                  // A page number is a RUNNING element: Word renders it on
                  // every page of the section. `pageScoped` exports through
                  // Word's different-first-page machinery (default/even footer
                  // parts left empty), which would print the number on the
                  // section's first page alone, so adding one takes this
                  // section's band off the page-scoped native shortcut.
                  delete edited.pageScoped;
                  // Rich is the authoritative story once it exists; a stale
                  // flattened copy would keep painting the pre-field text.
                  delete edited[textKey];
                } else {
                  delete edited[richKey];
                  // Explicit blank tombstone so source-DOCX patchback still
                  // clears the story even if hydration later collapses an
                  // all-empty sectionBands to null.
                  edited[textKey] = "";
                }
                // Word breaks Link to Previous when a linked story is edited.
                delete edited[linkKey];
                return edited;
              }) as SectionBandEntries;
              tr.setDocAttribute("sectionBands", nextBands);
              if (resolvedBands.materialized) {
                // sectionBands is now the single source of truth for band
                // content — clear the doc-level copies in the SAME transaction
                // so clearing every section later cannot resurrect them
                // through the uniform CSS path. The variant FLAGS stay on the
                // doc attrs: they seeded each entry and keep gating the
                // uniform fallback.
                for (const key of SECTION_BAND_TEXT_KEYS) {
                  tr.setDocAttribute(key, "");
                }
                for (const key of SECTION_BAND_RICH_KEYS) {
                  tr.setDocAttribute(key, null);
                }
              }
            }
            return true;
          }

          const effectiveRef = resolveEffectiveSectionStoryRef(
            graph,
            sectionIndex,
            kind,
            variant,
          );
          const preparedGraph =
            alignment === null
              ? graph
              : variant === "default" && effectiveRef
                ? graph
                : materializeSectionStoryRef(
                    graph,
                    sectionIndex,
                    kind,
                    variant,
                    // A document without any story of this kind starts
                    // Word's "Page Number → Bottom of Page" from nothing.
                    updateBandRichPageNumbers([], { alignment, includePageCount }),
                  );
          const targetRef = preparedGraph
            ? resolveEffectiveSectionStoryRef(
                preparedGraph,
                sectionIndex,
                kind,
                variant,
              )
            : null;
          const targetStory =
            preparedGraph && targetRef
              ? preparedGraph.stories.find(
                  (story) => story.storyId === targetRef.storyId,
                )
              : null;
          if (
            alignment === null &&
            preparedGraph &&
            targetRef &&
            targetStory?.content.mode === "opaque"
          ) {
            // Word's Remove Page Numbers takes away the page-number building
            // block and nothing else: a story whose page number is a bare
            // PAGE field (in a line of words, a table cell, a frame) keeps
            // it, and there is nothing to remove.
            if (
              !nativeStoryBandHoldsPageNumberBlock(
                bands,
                preparedGraph,
                targetRef.storyId,
              )
            ) {
              return false;
            }
            const nextGraph = removeOpaqueSectionStoryPageNumbers(
              preparedGraph,
              sectionIndex,
              kind,
              variant,
              "removeBlocks",
            );
            if (!nextGraph) return false;
            const nextBands = projectNativeStoryIntoSectionBands(
              bands,
              preparedGraph,
              targetRef.storyId,
              { mode: "removePageNumbers" },
            );
            if (dispatch) {
              tr.setDocAttribute("sectionStoryGraph", nextGraph);
              tr.setDocAttribute("sectionBands", nextBands);
            }
            return true;
          }
          // A story materialized fresh for this edit already holds the page
          // numbers; the change is measured against the nothing it replaced.
          const bornFresh =
            targetRef !== null &&
            !graph.stories.some((story) => story.storyId === targetRef.storyId) &&
            preparedGraph?.stories.find((story) => story.storyId === targetRef.storyId)
              ?.content.mode === "editable";
          const currentBlocks = bornFresh
            ? []
            : preparedGraph && targetRef
              ? editableBlocksForNativeStory(preparedGraph, targetRef.storyId)
              : null;
          if (!preparedGraph || !targetRef || !currentBlocks) return false;
          const nextBlocks = updateBandRichPageNumbers(
            currentBlocks,
            alignment === null ? null : { alignment, includePageCount },
          );
          if (
            !nextBlocks ||
            JSON.stringify(currentBlocks) === JSON.stringify(nextBlocks)
          ) {
            return false;
          }
          const nextGraph =
            nextBlocks.length > 0
              ? setSectionStoryEditableContent(
                  preparedGraph,
                  sectionIndex,
                  kind,
                  variant,
                  nextBlocks,
                )
              : clearSectionStoryEditableContent(
                  preparedGraph,
                  sectionIndex,
                  kind,
                  variant,
                );
          if (!nextGraph) return false;
          const nextBands = projectNativeStoryIntoSectionBands(
            bands,
            preparedGraph,
            targetRef.storyId,
            nextBlocks.length > 0
              ? { mode: "rich", blocks: nextBlocks }
              : { mode: "empty" },
          );
          if (dispatch) {
            tr.setDocAttribute("sectionStoryGraph", nextGraph);
            tr.setDocAttribute("sectionBands", nextBands);
          }
          return true;
        },
      setSectionDifferentFirstPage:
        (sectionIndex: number, enabled: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (
            !editor.isEditable ||
            !Number.isInteger(sectionIndex) ||
            typeof enabled !== "boolean"
          ) {
            return false;
          }
          let sectionCount = 1;
          editor.state.doc.descendants((node) => {
            if (node.type.name === "sectionBreak") sectionCount += 1;
            return true;
          });
          if (sectionIndex < 0 || sectionIndex >= sectionCount) return false;

          const attrs = editor.state.doc.attrs as Record<string, unknown>;
          const graphPresent =
            attrs.sectionStoryGraph !== null &&
            attrs.sectionStoryGraph !== undefined;
          const graph = graphPresent
            ? normalizeSectionStoryGraph(attrs.sectionStoryGraph, sectionCount)
            : null;
          if (graphPresent && !graph) return false;
          let bands = sectionBandsForCount(
            normalizeSectionBands(attrs.sectionBands),
            sectionCount,
          );
          if (bands === false) return false;
          // Different First Page is a section's own setting, offered in every
          // section of Word whether its header is linked or not. A document
          // of several sections still painting its one header gets per-section
          // bands first, every later section linked to the one before (what
          // it was showing), as Link to Previous seeds them.
          let seededFromDocument = false;
          if (!graph && !bands && sectionCount > 1) {
            const seeded = seedLinkedNativeSectionBands(editor, sectionCount);
            if (!seeded) return false;
            bands = seeded.bands;
            seededFromDocument = seeded.materialized;
          }
          if (!graph && !bands && (sectionCount !== 1 || sectionIndex !== 0)) {
            return false;
          }

          const current = graph
            ? graph.sections[sectionIndex].titlePage
            : bands
              ? bands[sectionIndex]?.differentFirstPage === true
              : attrs.differentFirstPage === true;
          if (current === enabled) return false;
          let nextGraph = graph
            ? setSectionStoryTitlePage(graph, sectionIndex, enabled)
            : null;
          if (graph && !nextGraph) return false;

          let nextBands = bands;
          if (enabled && nextGraph) {
            for (const kind of ["header", "footer"] as const) {
              const activeGraph: SectionStoryGraph = nextGraph;
              const materialized: SectionStoryGraph | null =
                resolveEffectiveSectionStoryRef(
                activeGraph,
                sectionIndex,
                kind,
                "first",
              )
                ? activeGraph
                : materializeSectionStoryRef(
                    activeGraph,
                    sectionIndex,
                    kind,
                    "first",
                  );
              if (!materialized) continue;
              nextGraph = materialized;
              const ref = resolveEffectiveSectionStoryRef(
                materialized,
                sectionIndex,
                kind,
                "first",
              );
              const blocks = ref
                ? editableBlocksForNativeStory(materialized, ref.storyId)
                : null;
              if (nextBands && ref && blocks) {
                nextBands = projectNativeStoryIntoSectionBands(
                  nextBands,
                  materialized,
                  ref.storyId,
                  { mode: "rich", blocks },
                );
              }
            }
          }

          if (dispatch) {
            if (nextGraph) tr.setDocAttribute("sectionStoryGraph", nextGraph);
            if (nextBands) {
              tr.setDocAttribute(
                "sectionBands",
                updateSectionBandBoolean(
                  nextBands,
                  sectionIndex,
                  "differentFirstPage",
                  enabled,
                ),
              );
            } else if (!graph) {
              tr.setDocAttribute("differentFirstPage", enabled);
            }
            if (seededFromDocument) clearDocumentLevelBands(tr);
          }
          return true;
        },
      setSectionStoryLinkedToPrevious:
        (
          sectionIndex: number,
          kind: SectionStoryKind,
          variant: SectionStoryVariant,
          linked: boolean,
        ) =>
        ({ editor, tr, dispatch }) => {
          if (
            !editor.isEditable ||
            !Number.isInteger(sectionIndex) ||
            sectionIndex <= 0 ||
            typeof linked !== "boolean"
          ) {
            return false;
          }
          let sectionCount = 1;
          editor.state.doc.descendants((node) => {
            if (node.type.name === "sectionBreak") sectionCount += 1;
            return true;
          });
          if (sectionIndex >= sectionCount) return false;
          const attrs = editor.state.doc.attrs as Record<string, unknown>;
          if (
            attrs.sectionStoryGraph === null ||
            attrs.sectionStoryGraph === undefined
          ) {
            // A document with no imported header/footer parts keeps its
            // painted bands per section. Word ("Link to previous", Microsoft
            // Support): linking shows the previous section's header or footer
            // of the same type again; unlinking keeps the current content as
            // this section's own.
            const linkKey = SECTION_STORY_LINK_KEYS[kind]?.[variant];
            const textKey = SECTION_STORY_TEXT_KEYS[kind]?.[variant];
            const richKey = SECTION_STORY_RICH_KEYS[kind]?.[variant];
            if (!linkKey || !textKey || !richKey) return false;
            const resolved = seedLinkedNativeSectionBands(editor, sectionCount);
            if (!resolved) return false;
            const bands = resolved.bands;
            const own = bands[sectionIndex] as Record<string, unknown>;
            if ((own[linkKey] === true) === linked) return false;
            if (dispatch) {
              const previous = bands[sectionIndex - 1] as Record<string, unknown>;
              const next = bands.map((entry, index) => {
                if (index !== sectionIndex) return entry;
                const edited: Record<string, unknown> = { ...entry };
                if (linked) {
                  for (const key of [textKey, richKey]) {
                    if (previous[key] === undefined) delete edited[key];
                    else edited[key] = previous[key];
                  }
                  edited[linkKey] = true;
                } else {
                  delete edited[linkKey];
                }
                return edited as SectionBandEntries[number];
              });
              tr.setDocAttribute("sectionBands", next);
              if (resolved.materialized) clearDocumentLevelBands(tr);
            }
            return true;
          }
          const graph = normalizeSectionStoryGraph(
            attrs.sectionStoryGraph,
            sectionCount,
          );
          if (!graph) return false;
          const nextGraph = setSectionStoryLinkedToPrevious(
            graph,
            sectionIndex,
            kind,
            variant,
            linked,
          );
          if (!nextGraph) return false;
          const linkKey = SECTION_STORY_LINK_KEYS[kind]?.[variant];
          if (!linkKey) return false;
          const bands = sectionBandsForCount(
            normalizeSectionBands(attrs.sectionBands),
            sectionCount,
          );
          if (bands === false) return false;
          const currentlyLinked =
            graph.sections[sectionIndex][sectionStorySlot(kind, variant)] ===
            null;
          if (currentlyLinked === linked) return false;

          if (dispatch) {
            tr.setDocAttribute("sectionStoryGraph", nextGraph);
            if (bands) {
              tr.setDocAttribute(
                "sectionBands",
                updateSectionBandBoolean(bands, sectionIndex, linkKey, linked),
              );
            }
          }
          return true;
        },
      setSectionHeaderFooterDistance:
        (sectionIndex: number, kind: SectionStoryKind, distanceTwips: number) =>
        ({ editor, tr, dispatch }) => {
          if (
            !editor.isEditable ||
            !Number.isInteger(sectionIndex) ||
            (kind !== "header" && kind !== "footer") ||
            !Number.isInteger(distanceTwips) ||
            distanceTwips < 0 ||
            distanceTwips > 31_680
          ) {
            return false;
          }
          const update = withRepairedSectionChain(tr, dispatch, () =>
            updateSectionLayoutAtSelection(
              { doc: tr.doc, selection: tr.selection },
              sectionIndex,
              {
                pageMargins: {
                  [kind === "header" ? "headerTwips" : "footerTwips"]:
                    distanceTwips,
                },
              },
            ),
          );
          if (!update) {
            if (dispatch) reportSectionLayoutStructureFailure(editor, tr.doc);
            return false;
          }
          const current = normalizeSectionLayouts(
            editor.state.doc.attrs.sectionLayouts,
          )?.[sectionIndex]?.pageMargins[
            kind === "header" ? "headerTwips" : "footerTwips"
          ];
          if (current === distanceTwips) return false;
          if (dispatch) {
            setSectionLayoutsWithLegacyMirror(tr, update.layouts);
          }
          return true;
        },
      updateSectionLayout:
        (layoutOrSectionIndex: unknown, patch?: SectionLayoutPatch) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const update = withRepairedSectionChain(tr, dispatch, () => {
            const state = { doc: tr.doc, selection: tr.selection };
            return typeof layoutOrSectionIndex === "number"
              ? patch === undefined
                ? null
                : updateSectionLayoutAtSelection(
                    state,
                    layoutOrSectionIndex,
                    patch,
                  )
              : updateSectionLayoutAtSelection(state, layoutOrSectionIndex);
          });
          if (!update) {
            // A mismatched section chain refuses every page-setup write; say
            // so instead of letting the menu click do nothing.
            if (dispatch) reportSectionLayoutStructureFailure(editor, tr.doc);
            return false;
          }
          if (dispatch) {
            setSectionLayoutsWithLegacyMirror(tr, update.layouts);
          }
          return true;
        },
      repairSectionLayoutStructure:
        (expectedLayouts: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const plan = planSectionLayoutRepair(tr.doc);
          if (
            !plan ||
            JSON.stringify(plan.layouts) !== JSON.stringify(expectedLayouts)
          ) {
            return false;
          }
          if (dispatch) {
            setSectionLayoutsWithLegacyMirror(tr, plan.layouts);
            if (plan.mutation) {
              tr.setMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META, plan.mutation);
            }
            closeHistory(tr);
          }
          return true;
        },
      setWordSettings:
        (patch) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = mergeWordDocumentSettings(tr.doc.attrs.wordSettings, patch);
          if (next === undefined) return false;
          if (
            JSON.stringify(next) ===
            JSON.stringify(normalizeWordDocumentSettings(tr.doc.attrs.wordSettings))
          ) {
            return true;
          }
          if (dispatch) tr.setDocAttribute("wordSettings", next);
          return true;
        },
      setAutoHyphenation:
        (enabled: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("autoHyphenation", enabled === true);
          }
          return true;
        },
      setDocumentPageNumbers:
        (enabled: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("showPageNumbers", enabled === true);
          }
          return true;
        },
      // Page-number format/start also live on the top-level `doc` node, set
      // through the same DocAttrStep and re-validated here. An off-whitelist
      // format is rejected (returns false); the start is clamped (a null/invalid
      // value resets it to the default start of 1). Setting the default "decimal"
      // format is permitted (untoggling back) and renders no `data-*` attribute.
      setPageNumberFormat:
        (format: PageNumberFormat) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const next = normalizePageNumberFormat(format);
          if (!next) return false;
          if (dispatch) {
            tr.setDocAttribute("pageNumberFormat", next);
          }
          return true;
        },
      setPageNumberStart:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            // null (invalid/empty) → reset to start-at-1 (the default).
            tr.setDocAttribute(
              "pageNumberStart",
              normalizePageNumberStart(value),
            );
          }
          return true;
        },
      // The document metadata bag also lives on the top-level `doc` node, so it is
      // set through the same DocAttrStep. The value is normalized here (every
      // field sanitized) before storage; an all-empty result clears the metadata.
      // Always returns true so clearing (passing an empty bag/null) is permitted.
      setDocumentMetadata:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "documentMetadata",
              normalizeDocumentMetadataOrNull(value),
            );
          }
          return true;
        },
      // Word's defaults (no option stated) store null.
      setHyphenationOptions:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) tr.setDocAttribute("hyphenationOptions", normalizeHyphenationOptions(value));
          return true;
        },
      // A malformed list changes nothing: the dialog only ever passes one the
      // normalizer accepts.
      setDocumentCustomProperties:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const entries = normalizeCustomProperties(value);
          if (!entries) return false;
          if (dispatch) tr.setDocAttribute("customProperties", entries);
          return true;
        },
      // Different-first-page also lives on the top-level `doc` node, so it is
      // set through the same DocAttrStep. The boolean is coerced strictly; the
      // first-page text is sanitized before storage (an empty string clears the
      // first-page band but keeps the toggle ON — Word's bare cover page).
      setDifferentFirstPage:
        (enabled: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "differentFirstPage",
              normalizeDifferentFirstPage(enabled),
            );
          }
          return true;
        },
      setFirstPageHeader:
        (text: string) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "firstPageHeader",
              sanitizeHeaderFooterText(text),
            );
          }
          return true;
        },
      setFirstPageFooter:
        (text: string) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "firstPageFooter",
              sanitizeHeaderFooterText(text),
            );
          }
          return true;
        },
      // Different odd/even-page header/footer (w:evenAndOddHeaders) lives on the
      // top-level `doc` node, set through the same DocAttrStep. The boolean is
      // coerced strictly; the even-page text is sanitized before storage (empty
      // clears the even band but keeps the toggle ON, mirroring first-page).
      setDifferentOddEven:
        (enabled: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || typeof enabled !== "boolean") return false;
          let sectionCount = 1;
          editor.state.doc.descendants((node) => {
            if (node.type.name === "sectionBreak") sectionCount += 1;
            return true;
          });
          const attrs = editor.state.doc.attrs as Record<string, unknown>;
          const graphPresent =
            attrs.sectionStoryGraph !== null &&
            attrs.sectionStoryGraph !== undefined;
          const graph = graphPresent
            ? normalizeSectionStoryGraph(attrs.sectionStoryGraph, sectionCount)
            : null;
          if (graphPresent && !graph) return false;
          let nextGraph = graph
            ? setSectionStoryEvenAndOddHeaders(graph, enabled)
            : null;
          if (graph && !nextGraph) return false;
          const bands = sectionBandsForCount(
            normalizeSectionBands(attrs.sectionBands),
            sectionCount,
          );
          if (bands === false) return false;
          let nextBands = bands;
          if (enabled && nextGraph) {
            for (let index = 0; index < sectionCount; index += 1) {
              for (const kind of ["header", "footer"] as const) {
                const activeGraph: SectionStoryGraph = nextGraph;
                const materialized: SectionStoryGraph | null =
                  resolveEffectiveSectionStoryRef(
                    activeGraph,
                    index,
                    kind,
                    "even",
                  )
                  ? activeGraph
                  : materializeSectionStoryRef(
                      activeGraph,
                      index,
                      kind,
                      "even",
                    );
                if (!materialized) continue;
                nextGraph = materialized;
                const ref = resolveEffectiveSectionStoryRef(
                  materialized,
                  index,
                  kind,
                  "even",
                );
                const blocks = ref
                  ? editableBlocksForNativeStory(materialized, ref.storyId)
                  : null;
                if (nextBands && ref && blocks) {
                  nextBands = projectNativeStoryIntoSectionBands(
                    nextBands,
                    materialized,
                    ref.storyId,
                    { mode: "rich", blocks },
                  );
                }
              }
            }
          }
          if (dispatch) {
            tr.setDocAttribute(
              "differentOddEven",
              normalizeDifferentOddEven(enabled),
            );
            if (nextGraph) tr.setDocAttribute("sectionStoryGraph", nextGraph);
            if (nextBands) {
              tr.setDocAttribute(
                "sectionBands",
                nextBands.map((entry) => {
                  const next: Record<string, unknown> = { ...entry };
                  if (enabled) next.differentOddEven = true;
                  else delete next.differentOddEven;
                  return next;
                }),
              );
            }
          }
          return true;
        },
      setEvenPageHeader:
        (text: string) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "evenPageHeader",
              sanitizeHeaderFooterText(text),
            );
          }
          return true;
        },
      setEvenPageFooter:
        (text: string) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "evenPageFooter",
              sanitizeHeaderFooterText(text),
            );
          }
          return true;
        },
      // The watermark config also lives on the top-level `doc` node, so it is
      // set through the same DocAttrStep. The value is normalized here (text
      // sanitized, color/opacity validated) before it is stored; a null/empty
      // result clears the watermark. Always returns true so clearing (passing
      // null or empty text) is permitted.
      setDocumentWatermark:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("watermark", normalizeDocumentWatermark(value));
          }
          return true;
        },
      // The page border + line numbering also live on the top-level `doc` node,
      // so they are set through the same DocAttrStep. Each value is normalized
      // here (whitelisted/clamped) before storage; a null/empty result clears
      // the feature. Always returns true so clearing (passing null) is permitted.
      setPageBorder:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("pageBorder", normalizePageBorder(value));
          }
          return true;
        },
      // The page background color also lives on the top-level `doc` node, set
      // through the same DocAttrStep. The value is whitelisted here (6-hex or
      // null) before storage; a null/invalid result clears the fill. Always
      // returns true so clearing (passing null) is permitted.
      setInkPaper:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) tr.setDocAttribute("inkPaper", normalizeInkPaper(value));
          return true;
        },
      setDocumentEncryptWithPassword:
        (on: boolean) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) tr.setDocAttribute("encryptWithPassword", on === true);
          return true;
        },
      setHandwritingDocument:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) tr.setDocAttribute("handwritingDocument", normalizeHandwritingDocument(value));
          return true;
        },
      setPageBackgroundColor:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "pageBackgroundColor",
              normalizePageBackgroundColor(value),
            );
            // A colour picked in Page Color replaces the page's fill effect, as
            // Word replaces it.
            if (normalizePageBackgroundFill(tr.doc.attrs.pageBackgroundFill)) {
              tr.setDocAttribute("pageBackgroundFill", null);
            }
          }
          return true;
        },
      setLineNumbers:
        (value: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            const lineNumbers = normalizeLineNumbers(value);
            tr.setDocAttribute("lineNumbers", lineNumbers);
            // Line numbering is a section property (w:sectPr/w:lnNumType):
            // once the document has native sections they own it, and the
            // page draws and exports theirs. Written only to the document's
            // legacy setting, Continuous was saved and checked but no number
            // was drawn (WUA 081). Every section takes it, as one section
            // takes it in a document of one.
            const layouts = normalizeSectionLayouts(tr.doc.attrs.sectionLayouts);
            if (layouts) {
              const sectionValue = materializedLineNumbers({ lineNumbers });
              tr.setDocAttribute(
                "sectionLayouts",
                layouts.map((layout) => {
                  const next: SectionLayout = { ...layout };
                  if (sectionValue) next.lineNumbers = sectionValue;
                  else delete next.lineNumbers;
                  return next;
                }),
              );
            }
          }
          return true;
        },
      setNamedStyles:
        (styles: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "namedStyles",
              ensureStableNamedStyleIds(styles),
            );
          }
          return true;
        },
      setQuickParts:
        (parts: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("quickParts", normalizeDocumentQuickParts(parts));
          }
          return true;
        },
      setReferenceStyles:
        (styles: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("referenceStyles", normalizeReferenceStyles(styles));
          }
          return true;
        },
      setHeadingStyles:
        (styles: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute("headingStyles", normalizeHeadingStyles(styles));
          }
          return true;
        },
      setStyleDefinitions:
        (styles: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(
              "styleDefinitions",
              normalizeStyleDefinitions(styles),
            );
          }
          return true;
        },
      restoreDocumentTypography:
        (family: unknown, size: unknown) =>
        ({ tr, dispatch }) => {
          const normalizedFamily = normalizeFontFamily(family);
          const normalizedSize = normalizeFontSize(size);
          if (!normalizedFamily && !normalizedSize) return true;
          if (dispatch) {
            if (normalizedFamily) {
              tr.setDocAttribute("defaultFontFamily", normalizedFamily);
            }
            if (normalizedSize) {
              tr.setDocAttribute("defaultFontSize", normalizedSize);
            }
            trustReadOnlyDocumentMutation(tr, "hydration-restore");
          }
          return true;
        },
    };
  },
});

export default DocumentPageSetup;
