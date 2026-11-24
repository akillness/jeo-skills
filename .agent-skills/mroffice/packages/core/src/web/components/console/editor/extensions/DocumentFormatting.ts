"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeWordDocumentSettings } from "../native-document/wordDocumentSettings";
import { wordEastAsianTextInEastAsianLanguage, wordSetsIdeographsAsLetters } from "../native-document/wordFarEastDefaults";
import { readDocumentNumberingMarkerFact } from "../native-document/documentNumberingLayout";
import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";
import { isWordLineMultiple, pxToPtRounded } from "../../../../lib/office-units";
import { cssAbsoluteLengthPt } from "../../../../lib/css-absolute-length";
import { lineBreakOpportunities } from "../../../../lib/text-engine/line-break";
import { BULK_FILL_CHUNK_META, mappedThroughBulkFill, rebuildsAfterFill } from "../native-document/bulkFillTransaction";
import { Extension, type CommandProps } from "@tiptap/core";
import { normalizeWordHorizontalRule } from "../../../../lib/document-word-horizontal-rule";
import type { Node as PmNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  DocAttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  DEFAULT_TEXT_DIRECTION,
  normalizeDir,
  type TextDirection,
} from "../native-document/documentLayout";
import {
  normalizeTabStops,
  serializeTabStops,
  twipsToPx,
  type TabStop,
} from "../../../../lib/document-tabstops";
import {
  normalizeFirstLineIndentPt,
  normalizeIndentCharacterUnits,
  normalizeIndentPt,
  normalizeSideIndentPt,
  readNativeListIndent,
} from "../native-document/preciseIndent";
import {
  createEffectiveKerningThresholdResolver,
  normalizeFontSize,
} from "./TextStyling";
import {
  CONTEXTUAL_SPACING_BEFORE_ATTR,
  CONTEXTUAL_SPACING_AFTER_ATTR,
  contextualParagraphStyleIdentity,
} from "../native-document/contextualParagraphSpacingExtension";
import {listContinuationTypography} from "../native-document/listContinuationTypography";
import {
  PARAGRAPH_MARK_MARKS_ATTR,
  paragraphMarkTypingPlugin,
} from "../native-document/paragraphMarkTyping";
import { LIST_ITEM_SPLIT_BRIDGE_ATTR } from "../native-document/paged/containerSplitting";
import { listParagraphSpacingDecorations } from "../native-document/listParagraphSpacing";
import { PAGE_BLOCK_NODE } from "../native-document/paged/paginationProjectionKeys";
import { touchedRanges } from "../native-document/touchedTextblocks";
import { decorationMapping } from "../native-document/fastRangeMapping";
import { WORD_ZH_CN_NO_START_EXTRA, WORD_ZH_CN_NO_START_EXTRA_TEST, documentHangulWordRanges, documentKoreanWholeWordRanges, documentKinsokuAllowedBreaks, wordKinsokuList, documentHanSlashBoundaries, documentKinsokuNoStartBoundaries, documentSlashLetterBoundaries, documentSourceArrowBoundaries } from "../native-document/documentWordDelimiterBoundaries";
import { documentWordWrapOffInert, resolveDocumentOverflowPunctuation, resolveEffectiveDocumentWordWrap, wordPunctuationMayHang } from "../native-document/documentOverflowPunctuation";
import { documentOwnStyleFontSizePx, documentStyleFontSizePx, paragraphHoldsNoText } from "../native-document/documentStyleFontSize";
import { wordAutoTextAttributes } from "../native-document/wordAutoTextColor";
import { paragraphAttributeShows, paragraphBorderEdgeOnFragment } from "../native-document/paged/fragmentRoles";
import {
  DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  documentBorderLineCss,
  documentParagraphBordersHtmlAttributes,
  legacyPresetFromParagraphBorders,
  normalizeDocumentParagraphBorders,
  paragraphBordersFromLegacyPreset,
  parseDocumentParagraphBordersAttribute,
} from "../../../../lib/document-borders";
import {
  normalizeTocOutlineLevel,
  TOC_OUTLINE_LEVEL_ATTR,
  type TocOutlineLevelValue,
} from "../native-document/tableOfContents";
import { fragmentCarries } from "../native-document/paged/fragmentRoles";

/**
 * Paragraph alignment. "distribute" is the Word/WPS 分散对齐 — every line
 * (including the last) is stretched to the full column width. Rendered in CSS
 * as `text-align: justify; text-align-last: justify` (see the
 * `[data-text-align="distribute"]` rule in note-editor.css) and exported to
 * OOXML `<w:jc w:val="distribute"/>`.
 */
export type DocumentTextAlign =
  | "left"
  | "center"
  | "right"
  | "justify"
  | "distribute";

/** A "toc N" entry's style-chain right tab leader (`source.tocTabLeader`). */
function tocStyleTabLeader(source: unknown): "dot" | "hyphen" | "underscore" | null {
  const value = source && typeof source === "object" ? (source as { tocTabLeader?: unknown }).tocTabLeader : null;
  return value === "dot" || value === "hyphen" || value === "underscore" ? value : null;
}

/** Line-height presets surfaced in the toolbar (Word/WPS parity: 1 / 1.15 / 1.5 / 2). */
export const LINE_HEIGHT_VALUES = ["1", "1.15", "1.5", "2"] as const;
/** Paragraph before/after spacing presets, in points (Word/WPS parity: 0 / 6 / 12). */
export const PARAGRAPH_SPACING_VALUES = [0, 6, 12] as const;

export type LineHeightValue = (typeof LINE_HEIGHT_VALUES)[number];
export type ParagraphSpacingValue = (typeof PARAGRAPH_SPACING_VALUES)[number];

/**
 * Paragraph border presets (Word 段落边框): a full box, a bottom rule, or a
 * left accent bar. A preset whitelist — not arbitrary CSS — so imported or
 * forged markup can never smuggle layout-breaking border styles.
 */
export const PARAGRAPH_BORDER_PRESETS = ["box", "bottom", "left"] as const;
export type ParagraphBorderPreset = (typeof PARAGRAPH_BORDER_PRESETS)[number];

/**
 * Paragraph shading palette (Word 底纹). Light fills that keep text readable;
 * the swatch list is shared by the toolbar and the sanitizer accepts any
 * #rrggbb so imported documents keep their own fills.
 */
export const PARAGRAPH_SHADING_SWATCHES = [
  "#fef9c3",
  "#fee2e2",
  "#dbeafe",
  "#dcfce7",
  "#f3e8ff",
  "#f3f4f6",
] as const;

/**
 * Drop-cap mode (Word 首字下沉). "dropped" enlarges the paragraph's first
 * letter and floats it down ~3 lines (the classic typographic drop cap),
 * realized in CSS via the `::first-letter` pseudo-element (see note-editor.css).
 * "off"/absent renders a normal paragraph. The CSS lives in the stylesheet — the
 * attribute only toggles a `data-drop-cap` flag, so no user value reaches CSS.
 */
export const DROP_CAP_VALUES = ["dropped"] as const;
export type DropCapValue = (typeof DROP_CAP_VALUES)[number];
const DROP_CAP_SET = new Set<string>(DROP_CAP_VALUES);

/** Whitelisted drop-cap mode or null (the "off"/normal state). */
/** Word's Lines to drop (1..10); 3 is its default and the attribute's null. */
export function normalizeDropCapLines(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10 && number !== 3
    ? number
    : null;
}

/** Word's Distance from text, in points (0 is the null). */
export function normalizeDropCapDistancePt(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1584
    ? Math.round(number * 100) / 100
    : null;
}

/** The paragraph's drop cap as Word's Drop Cap menu names it. */
export type DropCapPosition = "dropped" | "margin";

export interface DropCapOptions {
  readonly position: DropCapPosition | null;
  readonly lines?: number | null;
  readonly distancePt?: number | null;
}

/** A paragraph's attrs read as Word's Position (None / Dropped / In margin). */
export function dropCapPositionOf(attrs: Record<string, unknown> | null | undefined): DropCapPosition | null {
  if (!attrs || !normalizeDropCap(attrs.dropCap)) return null;
  return attrs.dropCapPosition === "margin" ? "margin" : "dropped";
}

export function normalizeDropCap(value: unknown): DropCapValue | null {
  return typeof value === "string" && DROP_CAP_SET.has(value)
    ? (value as DropCapValue)
    : null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentFormatting: {
      setTextAlign: (align: DocumentTextAlign) => ReturnType;
      unsetTextAlign: () => ReturnType;
      /** Set the text direction (ltr/rtl) on the selected block(s). */
      setTextDirection: (dir: TextDirection) => ReturnType;
      /** Toggle the selected block(s) between left-to-right and right-to-left. */
      toggleTextDirection: () => ReturnType;
      setIndent: (level: number) => ReturnType;
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
      /** Precise LEFT indent in points (Word 段落 dialog; null/0 clears). */
      setIndentLeftPt: (value: string | number | null) => ReturnType;
      /** Precise RIGHT indent in points (null/0 clears). */
      setIndentRightPt: (value: string | number | null) => ReturnType;
      /**
       * Precise FIRST-LINE indent in points — POSITIVE = first-line indent,
       * NEGATIVE = hanging indent (悬挂缩进); null/0 clears.
       */
      setFirstLineIndentPt: (value: string | number | null) => ReturnType;
      /**
       * Apply the whole paragraph dialog at once (left / right / first-line in
       * points + the unitless line height + before/after spacing) in ONE undo
       * step. Each field is null → cleared. Used by the toolbar's paragraph dialog.
       */
      setParagraphIndents: (value: {
        indentLeftPt?: string | number | null;
        indentRightPt?: string | number | null;
        firstLineIndentPt?: string | number | null;
        /** Replaces the Tab indent level (the ruler folds it into the pt left). */
        indent?: number;
        /** Replaces the legacy em first line (folded into the pt first line). */
        textIndent?: null;
      }) => ReturnType;
      setLineHeight: (value: string | number | null) => ReturnType;
      /** Word absolute line height (fixed/exact or minimum/atLeast), in pt. */
      setAbsoluteLineHeight: (
        value: string | number,
        rule: "exact" | "atLeast",
      ) => ReturnType;
      unsetLineHeight: () => ReturnType;
      setSpaceBefore: (value: string | number | null) => ReturnType;
      setSpaceAfter: (value: string | number | null) => ReturnType;
      /** First-line indent in em (null clears; Chinese 首行缩进 = 2). */
      setTextIndent: (value: string | number | null) => ReturnType;
      /**
       * Record which left / right / hanging indents were stated in characters
       * (Word's w:leftChars and kin) beside the points they drew; null clears.
       */
      setIndentCharacterUnits: (value: unknown) => ReturnType;
      /** Paragraph border preset (box/bottom/left; null clears). */
      setParagraphBorder: (preset: ParagraphBorderPreset | null) => ReturnType;
      /** Exact per-edge paragraph borders; null clears direct borders. */
      setParagraphBorders: (borders: unknown) => ReturnType;
      /** Paragraph shading fill (#rrggbb; null clears). */
      setParagraphShading: (color: string | null) => ReturnType;
      /** Drop-cap mode (off | dropped); the first letter enlarges + drops. */
      setDropCap: (value: DropCapValue | null) => ReturnType;
      /**
       * Insert > Drop Cap > None / Dropped / In Margin / Options: the cap's
       * position (null is None, which forgets the options), Lines to drop
       * and Distance from text in points (null keeps Word's 3 lines / 0).
       */
      setDropCapOptions: (options: DropCapOptions) => ReturnType;
      /** Per-paragraph tab stops (制表位); null/[] clears them. */
      setTabStops: (value: unknown) => ReturnType;
      /** Keep-with-next pagination flag (与下段同页). */
      setKeepNext: (value: boolean | null) => ReturnType;
      /** Keep-lines-together pagination flag (段中不分页). */
      setKeepLines: (value: boolean | null) => ReturnType;
      /** Widow/orphan control pagination flag (孤行控制). */
      setWidowControl: (value: boolean) => ReturnType;
      /** Suppress spacing between adjacent paragraphs of the same style. */
      setContextualSpacing: (value: boolean | null) => ReturnType;
      /** Exclude selected paragraphs from section line numbering. */
      setSuppressLineNumbers: (value: boolean) => ReturnType;
      /** Disable automatic hyphenation for selected paragraphs. */
      setSuppressAutoHyphens: (value: boolean) => ReturnType;
      /** Use the current section's document-grid line pitch. */
      setSnapToGrid: (value: boolean | null) => ReturnType;
      /** Word raw toggle: false allows Latin words to break by character. */
      setWordWrap: (value: boolean | null) => ReturnType;
      /** Apply East Asian first/last-character line-breaking rules. */
      setKinsoku: (value: boolean | null) => ReturnType;
      /** Allow end punctuation to hang beyond paragraph text extents. */
      setOverflowPunctuation: (value: boolean | null) => ReturnType;
      /** Compress CJK punctuation when it begins a rendered line. */
      setTopLinePunctuation: (value: boolean | null) => ReturnType;
      /** Align mixed-size characters within each paragraph line. */
      setParagraphTextAlignment: (
        value: ParagraphTextAlignment | null,
      ) => ReturnType;
      /** Let Word adjust the paragraph's right indent against the document grid. */
      setAdjustRightIndent: (value: boolean | null) => ReturnType;
      /** Interpret left/right paragraph indents as inside/outside. */
      setMirrorIndents: (value: boolean | null) => ReturnType;
      /** Auto-space East Asian and Latin text regions. */
      setAutoSpaceDE: (value: boolean | null) => ReturnType;
      /** Auto-space East Asian text and numeric regions. */
      setAutoSpaceDN: (value: boolean | null) => ReturnType;
      /** Project Word Page break before to an adjacent real pageBreak atom. */
      setPageBreakBefore: (value: boolean) => ReturnType;
      /** Direct Word paragraph outline level; `none` excludes without restyling. */
      setTocOutlineLevel: (value: TocOutlineLevelValue) => ReturnType;
    };
  }
}

const TEXT_ALIGN_VALUES = new Set<DocumentTextAlign>([
  "left",
  "center",
  "right",
  "justify",
  "distribute",
]);
// Single objects that Home's alignment places as a whole: Word holds each in
// a paragraph of its own and aligns it by that paragraph.
const FLOW_OBJECT_TYPES = new Set<string>(["mathBlock", "chart", "documentMedia"]);
const MAX_INDENT_LEVEL = 7;
const LINE_HEIGHT_SET = new Set<string>(LINE_HEIGHT_VALUES);
// Paragraph spacing is clamped to Word's own before/after ceiling (1584pt) so a
// free numeric entry — or pasted/imported markup — can never inject an absurd
// margin, while still covering the full range Word's dialog allows. Exported so
// the toolbar's free spacing input shares the same bound.
export const MAX_PARAGRAPH_SPACING_PT = 1584;

interface DocumentFormattingOptions {
  types: string[];
}

export function normalizeTextAlign(value: unknown): DocumentTextAlign | null {
  return typeof value === "string" &&
    TEXT_ALIGN_VALUES.has(value as DocumentTextAlign)
    ? (value as DocumentTextAlign)
    : null;
}

function normalizeIndent(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(MAX_INDENT_LEVEL, Math.floor(numeric)));
}

/** TOC entry level 1..9 (Word TOC1..TOC9), or null when absent/out of range. */
/** The leaders a manual table's entry line may draw before its page number
 * (Word's w:ptab/w:tab w:leader values the editor draws). */
const TOC_ENTRY_LEADERS = ["dot", "hyphen", "underscore", "none"] as const;

export function normalizeTocEntryLeader(value: unknown): (typeof TOC_ENTRY_LEADERS)[number] | null {
  return typeof value === "string" && (TOC_ENTRY_LEADERS as readonly string[]).includes(value)
    ? (value as (typeof TOC_ENTRY_LEADERS)[number])
    : null;
}

function normalizeTocLevel(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return null;
  const level = Math.floor(numeric);
  return level >= 1 && level <= 9 ? level : null;
}

/**
 * Accepts the whitelisted unitless line-height presets only (1 / 1.15 / 1.5 /
 * 2). Numeric inputs are stringified so callers may pass `1.5` or `"1.5"`. All
 * four presets — including `1` — are stored and rendered: selecting `1` is an
 * intentional choice that emits `line-height: 1` to override an inherited
 * larger spacing. Anything outside the whitelist returns `null`; callers clear
 * an applied value with unsetLineHeight (leaving the document's natural line
 * height).
 */
export function normalizeLineHeight(value: unknown): LineHeightValue | null {
  if (value === null || value === undefined) return null;
  const normalized =
    typeof value === "number" ? String(value) : String(value).trim();
  if (LINE_HEIGHT_SET.has(normalized)) return normalized as LineHeightValue;
  // Imported documents may carry arbitrary (but sane) unitless line heights;
  // the strict numeric pattern leaves no room for CSS injection.
  // Word's whole Multiple range, 0.06 to 132 lines (office-units).
  if (!/^\d{1,3}(\.\d{1,6})?$/.test(normalized)) return null;
  const numeric = Number.parseFloat(normalized);
  if (!isWordLineMultiple(numeric)) return null;
  return normalized as LineHeightValue;
}

/**
 * Word's ABSOLUTE line spacing (lineRule="exact"/"atLeast") in points.
 * Accepts 4–300pt with two decimals max; the strict numeric clamp leaves no
 * room for CSS injection. `null` for unset/off-range values.
 */
export function normalizeLineHeightPt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(/pt$/i, ""));
  if (!Number.isFinite(raw)) return null;
  if (raw < 4 || raw > 300) return null;
  return Math.round(raw * 100) / 100;
}

/** The Word rule that produced `lineHeightPt` (closed two-value whitelist). */
/** Gallery paragraph styles other than Normal (Normal is the absence). */
const BUILTIN_PARAGRAPH_STYLE_IDS = new Set([
  "noSpacing",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "title",
  "subtitle",
  "quote",
  "intenseQuote",
  "listParagraph",
]);

/**
 * The block before the one at `pos` in reading order: its previous sibling,
 * or, for the first block of a sheet, the last block of the sheet before.
 */
export function blockBeforeAcrossSheets(
  doc: PmNode,
  pos: number,
): { node: PmNode; pos: number } | null {
  const $pos = doc.resolve(pos);
  const index = $pos.index();
  if (index > 0) {
    const node = $pos.parent.child(index - 1);
    return { node, pos: pos - node.nodeSize };
  }
  if ($pos.parent.type.name !== "pageBlock" || $pos.depth < 1) return null;
  const sheetPos = $pos.before();
  const $sheet = doc.resolve(sheetPos);
  const sheetIndex = $sheet.index();
  if (sheetIndex === 0) return null;
  const previousSheet = $sheet.parent.child(sheetIndex - 1);
  const node = previousSheet.lastChild;
  if (!node) return null;
  // sheetPos - 1 is the end of the previous sheet's content.
  return { node, pos: sheetPos - 1 - node.nodeSize };
}







function addSplitParagraphFragments(
  doc: PmNode,
  positions: Map<number, { attrs: Record<string, unknown>; type: string }>,
): void {
  const cut = (attrs: Record<string, unknown>) =>
    attrs.pageSplitContinues === true || attrs.pageSplitContinuation === true;
  if (![...positions.values()].some(({ attrs }) => cut(attrs))) return;
  const blocks: Array<{ pos: number; node: PmNode }> = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ pos, node });
    return false;
  });
  const index = new Map(blocks.map((block, at) => [block.pos, at]));
  const add = ({ pos, node }: { pos: number; node: PmNode }) => {
    if (!positions.has(pos)) {
      positions.set(pos, { attrs: node.attrs as Record<string, unknown>, type: node.type.name });
    }
  };
  for (const pos of [...positions.keys()]) {
    const at = index.get(pos);
    if (at === undefined) continue;
    for (let j = at; j > 0; j -= 1) {
      if (blocks[j]!.node.attrs.pageSplitContinuation !== true || blocks[j - 1]!.node.attrs.pageSplitContinues !== true) break;
      add(blocks[j - 1]!);
    }
    for (let j = at; j < blocks.length - 1; j += 1) {
      if (blocks[j]!.node.attrs.pageSplitContinues !== true || blocks[j + 1]!.node.attrs.pageSplitContinuation !== true) break;
      add(blocks[j + 1]!);
    }
  }
}

export function normalizeBuiltinParagraphStyleId(value: unknown): string | null {
  return typeof value === "string" && BUILTIN_PARAGRAPH_STYLE_IDS.has(value)
    ? value
    : null;
}

export function normalizeLineHeightRule(
  value: unknown,
): "exact" | "atLeast" | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned === "exact" || cleaned === "atLeast" ? cleaned : null;
}

/**
 * First-line indent in em units (Chinese typography: 首行缩进 2 字符 = 2em).
 * Accepts 0.1–8em with two decimals max; `0`/invalid return `null` so the
 * attribute stays unset.
 */
export function normalizeTextIndent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(/em$/i, ""));
  if (!Number.isFinite(raw)) return null;
  const indent = Math.round(Math.min(Math.max(raw, 0), 8) * 100) / 100;
  return indent > 0 ? indent : null;
}

const BORDER_PRESET_SET = new Set<string>(PARAGRAPH_BORDER_PRESETS);

/** Whitelisted border preset or null — never arbitrary CSS. */
export function normalizeBorderPreset(
  value: unknown,
): ParagraphBorderPreset | null {
  return typeof value === "string" && BORDER_PRESET_SET.has(value)
    ? (value as ParagraphBorderPreset)
    : null;
}

/**
 * A pagination flag (keep-with-next / keep-lines / widow-control). Stored as a
 * strict boolean — `true` only when explicitly set on — so the data-attribute
 * stays absent on every untouched paragraph (no round-trip drift). Accepts the
 * `"true"` string the data-attribute serializes to on re-parse.
 */
export function normalizePaginationFlag(value: unknown): boolean {
  return value === true || value === "true";
}

/** Explicit OOXML on/off value, preserving absence as inheritance (`null`). */
export function normalizeParagraphOnOff(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

export const PARAGRAPH_TEXT_ALIGNMENT_VALUES = [
  "auto",
  "top",
  "center",
  "baseline",
  "bottom",
] as const;
export type ParagraphTextAlignment =
  (typeof PARAGRAPH_TEXT_ALIGNMENT_VALUES)[number];
const PARAGRAPH_TEXT_ALIGNMENT_SET = new Set<string>(
  PARAGRAPH_TEXT_ALIGNMENT_VALUES,
);

export function normalizeParagraphTextAlignment(
  value: unknown,
): ParagraphTextAlignment | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PARAGRAPH_TEXT_ALIGNMENT_SET.has(normalized)
    ? (normalized as ParagraphTextAlignment)
    : null;
}

/**
 * Shading fill as a strict lowercase #rrggbb (or null). The tight pattern is
 * the whole CSS-injection defence: the value is later interpolated into an
 * inline `background-color` declaration and a DOCX `w:fill` attribute.
 */
export function normalizeShadingColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  const match = /^#?([0-9a-f]{6})$/.exec(raw);
  return match ? `#${match[1]}` : null;
}

/** The inline CSS each border preset renders as (single source of truth). */
export function borderPresetStyle(preset: ParagraphBorderPreset): string {
  const border =
    documentBorderLineCss(DEFAULT_DOCUMENT_PARAGRAPH_BORDER) ??
    "1px solid #000000";
  switch (preset) {
    case "box":
      return `border: ${border}; padding: 2px 8px`;
    case "bottom":
      return `border-bottom: ${border}; padding-bottom: 2px`;
    case "left":
      return `border-left: ${border}; padding-left: 8px`;
  }
}

/**
 * Normalizes paragraph before/after spacing to a non-negative integer number of
 * points. Strips an optional `pt` unit when parsing HTML and clamps to a safe
 * range. `0` is a meaningful explicit override (Word uses it to suppress an
 * inherited/web-theme paragraph gap); invalid inputs return `null`.
 */
/** Word's default tab stop, the step of Increase/Decrease Indent (0.5 in). */
const INDENT_STEP_PT = 36;

/** The document's default indent on a side (Normal's, mirrored on the doc
 * as `defaultIndentLeftPt` ...), in points; null when it states none. */
function documentDefaultIndent(
  props: CommandProps,
  name: "defaultIndentLeftPt" | "defaultIndentRightPt" | "defaultFirstLineIndentPt",
): number | null {
  const value = (props.state.doc.attrs as Record<string, unknown>)[name];
  return name === "defaultFirstLineIndentPt"
    ? normalizeFirstLineIndentPt(value)
    : normalizeIndentPt(value);
}

/** The indent a one-side command states: the normalized points, or, for a
 * requested 0 against a default indent on that side, an explicit 0 -- the
 * paragraph's own "none", Word's `w:left="0"` -- since an absent value
 * draws the default. Without a default, 0 stays absent. */
/**
 * A left or right indent a command states, signed: Word's Paragraph dialog
 * takes a negative Left or Right indent, which draws the lines into the
 * margin (`w:ind w:left="-536"`). Clamped at 0 it was dropped, the
 * paragraph's older indent level drew instead, and the save wrote that
 * (corpus R497-D49 WALK1, Indentation Left -26.8 pt).
 * `window.__docsSignedSideIndentCommandsOff = true` clamps at 0 as before.
 */
function sideIndentPt(value: unknown): number | null {
  const off =
    typeof window !== "undefined" &&
    (window as Window & { __docsSignedSideIndentCommandsOff?: boolean }).__docsSignedSideIndentCommandsOff === true;
  return off ? normalizeIndentPt(value) : normalizeSideIndentPt(value);
}

/**
 * A precise left indent a command states brings the paragraph's legacy
 * Tab level along, as the reading derives it from the same ``w:ind w:left``
 * (one level per 0.25 in, rounded, at most 7, none at or below the margin:
 * the API's ``docx_legacy_indent_level``). The precise indent draws; a level
 * left from before (an import's 2 beside 38 pt) said otherwise to every
 * comparison of the saved file (corpus R497-D49 WALK1). ``levelStated``: the
 * caller set the level itself. Off with the signed-indent switch.
 */
function withIndentLevelOfLeft<T extends Record<string, unknown>>(attrs: T, levelStated = false): T {
  const off =
    typeof window !== "undefined" &&
    (window as Window & { __docsSignedSideIndentCommandsOff?: boolean }).__docsSignedSideIndentCommandsOff === true;
  const left = attrs.indentLeftPt;
  // Only a paragraph that carries a level beside its precise indent (an
  // import's) has one to keep in step; a level of 0 stays 0.
  if (off || levelStated || typeof left !== "number" || !Number.isFinite(left) || normalizeIndent(attrs.indent) === 0) {
    return attrs;
  }
  // Python's round() (half to even), as the reading computes it.
  const steps = left / 18;
  const floor = Math.floor(steps);
  const diff = steps - floor;
  const rounded = Math.abs(diff - 0.5) < 1e-9 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(steps);
  const level = left <= 0 ? 0 : Math.min(7, Math.max(0, rounded));
  return normalizeIndent(attrs.indent) === level ? attrs : { ...attrs, indent: level };
}

function statedIndentPt(
  value: unknown,
  documentDefault: number | null,
  signed = false,
  side = false,
): number | null {
  const points = signed ? normalizeFirstLineIndentPt(value) : side ? sideIndentPt(value) : normalizeIndentPt(value);
  if (points !== null || documentDefault === null) return points;
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? value : Number.parseFloat(String(value).trim().replace(/pt$/i, ""));
  return raw === 0 ? 0 : null;
}

/** `margin-top: 32px` as the points a paragraph gap is stored in (24). */
function spacingFromCssLength(value: unknown): number | null {
  const points = cssAbsoluteLengthPt(value);
  return points === null ? null : normalizeSpacing(Math.round(points * 100) / 100);
}

export function normalizeSpacing(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(/pt$/i, ""));
  if (!Number.isFinite(raw)) return null;
  const points = Math.max(
    0,
    Math.min(MAX_PARAGRAPH_SPACING_PT, Math.round(raw * 20) / 20),
  );
  return points;
}

/** An imported heading is sized by its own style chain, never by this editor's
 * native heading scale: Word resolves a run that states no size through the
 * paragraph style and the document defaults, which is what the runs of such a
 * heading rely on. Ordinary paragraphs already inherit that size from the
 * page, so only headings need it said again, and blank paragraphs, whose
 * line has no run to carry it. Display only. */
/** `window.__docsBlankHeadingMarkOff = true` (A/B): a blank heading draws at
 * its style's size whatever its mark states, the older layout. */
function blankHeadingMarkOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsBlankHeadingMarkOff?: boolean }).__docsBlankHeadingMarkOff === true;
}

function documentHeadingStyleSizeDecorations(
  doc: PmNode,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const result: Decoration[] = [];
  doc.nodesBetween(from, to, (block, pos) => {
    if (!block.isTextblock) return;
    // A blank heading whose mark states its size is that mark's line, as a
    // blank paragraph's is (Windows Word, corpus R485-D72: an empty Heading 1
    // with a 3 pt mark before page 1's table stands 3.45 pt; at its style's
    // 12 pt, 13.8 pt).
    const markSized = paragraphHoldsNoText(block) && block.attrs.paragraphFontSize != null;
    const heading = block.type.name === "heading" && !(markSized && !blankHeadingMarkOff());
    // A blank paragraph has no run for an imported size mark: its line is its
    // style's size unless its mark states one (`paragraphFontSize`).
    const blank = block.type.name === "paragraph" && paragraphHoldsNoText(block) && block.attrs.paragraphFontSize == null;
    if (!heading && !blank) return;
    const size = heading ? documentStyleFontSizePx(doc.attrs, block) : documentOwnStyleFontSizePx(doc.attrs, block);
    if (size === null || !(size > 0)) return;
    result.push(
      Decoration.node(pos, pos + block.nodeSize, {
        "data-document-style-font-size": `${size}px`,
        style: `font-size:${size}px`,
      }),
    );
  });
  return result;
}

/** Han, Kana, Hangul, CJK punctuation and fullwidth forms. */
const EAST_ASIAN_TEXT = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]|[\u{20000}-\u{3134f}]/u;

const EAST_ASIAN_CHARACTER = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]|[\u{20000}-\u{3134f}]/u;

/** The maximal runs of East Asian characters (their punctuation included)
 * in a text block's text nodes, as document ranges. */
function eastAsianRunRanges(block: PmNode, contentFrom: number): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  block.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    let start = -1;
    let index = 0;
    for (const character of child.text) {
      const east = EAST_ASIAN_CHARACTER.test(character);
      if (east && start < 0) start = index;
      if (!east && start >= 0) {
        ranges.push({ from: contentFrom + offset + start, to: contentFrom + offset + index });
        start = -1;
      }
      index += character.length;
    }
    if (start >= 0) ranges.push({ from: contentFrom + offset + start, to: contentFrom + offset + index });
  });
  return ranges;
}

/**
 * Word's simplified-Chinese "cannot end a line" characters (Kinsoku,
 * `w:kinsoku`; zh-CN default list `$(£¥·‘“〈《「『【〔〖〝﹙﹛﹝＄（．［｛￡￥`) that
 * CSS `line-break: strict` does not already keep from a line's end: the
 * opening brackets it does. U+00B7 is also a cannot-start character, so the
 * interpunct stays with what follows it.
 */
const WORD_ZH_CN_NO_END_EXTRA = new Set([..."$£¥·‘“〝＄．￡￥"]);
const WORD_ZH_CN_NO_END_EXTRA_TEST = /[$£¥·‘“〝＄．￡￥]/u;

/** The ranges [character, cannot-begin character after it] in East Asian
 * text: Word moves the character before down with the mark rather than
 * start a line with it (corpus R14-D15: "永ˇ", "永‖", "永〃", "永～" open
 * the next line in Word 16 for Mac). Japanese and Korean text keeps its
 * own list. */
function kinsokuNoStartRanges(
  block: PmNode,
  contentFrom: number,
  documentLanguage: unknown,
): Array<{ from: number; to: number }> {
  const otherList = (language: unknown) => wordKinsokuList(language) !== "zh-CN";
  const ranges: Array<{ from: number; to: number }> = [];
  let previous: { character: string; from: number; to: number } | null = null;
  block.forEach((child, childOffset) => {
    if (!child.isText) {
      previous = null;
      return;
    }
    const proofing = child.marks.find((mark) => mark.type.name === "proofingLanguage")?.attrs;
    const language = proofing?.eastAsia ?? documentLanguage;
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      offset += character.length;
      const entry = { character, from, to: from + character.length };
      if (
        previous &&
        WORD_ZH_CN_NO_START_EXTRA.has(character) &&
        EAST_ASIAN_TEXT.test(previous.character) &&
        !otherList(language)
      ) {
        ranges.push({ from: previous.from, to: entry.to });
      }
      previous = entry;
    }
  });
  return ranges;
}

/** The ranges [cannot-end character, the character after it] in East Asian text. */
function kinsokuNoEndRanges(
  block: PmNode,
  contentFrom: number,
  documentLanguage: unknown = null,
): Array<{ from: number; to: number }> {
  const characters: Array<{ character: string; from: number; to: number } | null> = [];
  block.forEach((child, childOffset) => {
    if (!child.isText) {
      characters.push(null);
      return;
    }
    // Japanese, Korean and traditional-Chinese text keeps its own list
    // (R14-D15: "·" and "〖" end a line in Word under each of them).
    const proofing = child.marks.find((mark) => mark.type.name === "proofingLanguage")?.attrs;
    const simplifiedChinese = wordKinsokuList(proofing?.eastAsia ?? documentLanguage) === "zh-CN";
    let offset = 0;
    for (const character of child.text ?? "") {
      const from = contentFrom + childOffset + offset;
      characters.push(simplifiedChinese ? { character, from, to: from + character.length } : null);
      offset += character.length;
    }
  });
  const ranges: Array<{ from: number; to: number }> = [];
  characters.forEach((entry, index) => {
    const next = characters[index + 1];
    if (!entry || !next || !WORD_ZH_CN_NO_END_EXTRA.has(entry.character) || /\s/u.test(next.character)) return;
    const previous = characters[index - 1];
    if (!EAST_ASIAN_TEXT.test(next.character) && !(previous && EAST_ASIAN_TEXT.test(previous.character))) return;
    // The interpunct and the fullwidth full stop cannot start a line either:
    // the character before them goes with them.
    const bothEnds = (entry.character === "·" || entry.character === "．") && previous && !/\s/u.test(previous.character);
    ranges.push({ from: bothEnds ? previous.from : entry.from, to: next.to });
  });
  return ranges;
}

/** Harness switch (`window.__docsKoreanWholeWordsHangOff = true`): a Korean
 * paragraph under w:wordWrap 0 charges its line-end space to the line (A/B). */
function koreanWholeWordsHangOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKoreanWholeWordsHangOff?: boolean }).__docsKoreanWholeWordsHangOff === true;
}

/** Harness switch (`window.__docsHangulHangOff = true`): a body paragraph
 * holding Hangul keeps break-spaces, as one holding Han or Kana does (A/B). */
function hangulHangOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsHangulHangOff?: boolean }).__docsHangulHangOff === true;
}

/** Harness switch (`window.__docsHanTrailingSpaceHangOff = true`): a body
 * paragraph holding Han or Kana keeps break-spaces, its line-end space
 * charged to the line (A/B). */
function hanTrailingSpaceHangOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsHanTrailingSpaceHangOff?: boolean }).__docsHanTrailingSpaceHangOff === true;
}

/** East Asian text other than Hangul: the text whose spaced boundaries
 * belong to the terminal punctuation and kinsoku rules. */
function holdsNonHangulEastAsianText(text: string): boolean {
  if (!EAST_ASIAN_TEXT.test(text)) return false;
  if (hangulHangOff()) return true;
  return EAST_ASIAN_TEXT.test(text.replace(/\p{Script=Hangul}/gu, ""));
}

/** Harness switch (`window.__docsKoreanWordWrapOff = true`): Latin words in
 * Korean text under w:wordWrap 0 are cut as in any other text (A/B). */
function koreanWordWrapOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsKoreanWordWrapOff?: boolean }).__docsKoreanWordWrapOff === true;
}

/** Kanji and kana that `word-break: keep-all` keeps together: not the
 * small kana, iteration marks and the prolonged sound mark (UAX #14 CJ/NS),
 * which Chromium may still break beside. */
const KEEP_ALL_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const KEEP_ALL_LOOSE = /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰ-ㇿ々〻ゝゞヽヾ・]/u;
const ASCII_ALPHANUMERIC = /^[0-9A-Za-z]$/;
/** Text Word sets as letters there (line-break.ts LATIN_SET_IDEOGRAPH), and Hangul. */
const SET_AS_LETTER_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3001-\u303f\uff00-\uffef]/u;
const HANGUL_TEXT = /\p{Script=Hangul}/u;

/**
 * The stretches of a paragraph whose ideographs Word sets as letters
 * (wordSetsIdeographsAsLetters) where the browser could break and Word does
 * not: every pair of characters with no break between them in the engine's
 * Latin rules (lineBreakOpportunities' ideographsAsLetters, the lines the
 * engine and the page ledger lay out) but past what `keep-all` already keeps
 * (two kanji or kana, two ASCII letters or digits) or a space. Chromium's
 * keep-all still broke after "〜", before "(" and after ":" in R398-D14's
 * "肥料(N-P-K):生産される大豆1kgあたり約0.12〜0.18ドル", which Word sets as one
 * word and breaks only after its hyphens. Consecutive pairs are one stretch;
 * a word wider than the line is still cut between the stretches
 * (overflow-wrap), where Word cuts it as it overflows.
 */
export function ideographWordKeepRanges(block: PmNode, contentFrom: number): { ranges: Array<{ from: number; to: number }>; joins: number[] } {
  const ranges: Array<{ from: number; to: number }> = [];
  const joins: number[] = [];
  let characters: Array<{ character: string; from: number; to: number; run: number }> = [];
  const flush = () => {
    if (characters.length > 1) {
      const opportunities = lineBreakOpportunities(characters.map((entry) => entry.character), { kinsoku: null, word: true, ideographsAsLetters: true });
      let open = -1;
      for (let index = 1; index <= characters.length; index += 1) {
        const before = characters[index - 1]!.character;
        const after = characters[index]?.character;
        const whole = after !== undefined && !opportunities[index] && !/\s/u.test(before) && !/\s/u.test(after);
        // Two ASCII letters or digits continue a stretch ("0.12") but open none.
        const alphanumeric = whole && ASCII_ALPHANUMERIC.test(before) && ASCII_ALPHANUMERIC.test(after!);
        const keep = whole && !alphanumeric &&
          !(KEEP_ALL_LETTER.test(before) && !KEEP_ALL_LOOSE.test(before) && KEEP_ALL_LETTER.test(after!) && !KEEP_ALL_LOOSE.test(after!));
        if (alphanumeric && open >= 0) continue;
        if (keep && open < 0) open = index - 1;
        // A nowrap stretch keeps a break out only inside one element: where
        // the pair crosses a run or the page's East Asian / Latin face
        // boxes (documentAutoLineSpacing), each side is a span of its own
        // and the browser broke between them all the same (R398-D14 "〜|0",
        // ":|窒"). A word joiner there keeps them together.
        if (keep && (characters[index - 1]!.run !== characters[index]!.run || EAST_ASIAN_CHARACTER.test(before) !== EAST_ASIAN_CHARACTER.test(after!))) {
          joins.push(characters[index]!.from);
        }
        if (!keep && open >= 0) {
          ranges.push({ from: characters[open]!.from, to: characters[index - 1]!.to });
          open = -1;
        }
      }
    }
    characters = [];
  };
  block.forEach((child, childOffset) => {
    if (!child.isText || !child.text) {
      flush();
      return;
    }
    let offset = 0;
    for (const character of child.text) {
      const from = contentFrom + childOffset + offset;
      characters.push({ character, from, to: from + character.length, run: childOffset });
      offset += character.length;
    }
  });
  flush();
  return { ranges, joins };
}

/** The word joiner a set-as-letter word is kept together by across two
 * spans (ideographWordKeepRanges' joins): no width, no break on either side
 * (UAX #14 WJ), which the engine's lines read the same way. It is the page's,
 * not the text's: a widget (contenteditable=false, ProseMirror-widget), which
 * the document's text, its copy, find and spelling (all read from the
 * document) and the page's DOM text walks (domTextCursor, the Copilot region
 * snapshot, the CJK spacing pass skip such hosts) never count, and hidden
 * from assistive technology as the line struts are. */
function ideographWordJoiner(): HTMLElement {
  const joiner = document.createElement("span");
  joiner.className = "docs-ideograph-word-joiner";
  joiner.setAttribute("aria-hidden", "true");
  // ProseMirror marks a widget so by property; stated here, every DOM (and
  // every text walk that skips such hosts) reads it alike.
  joiner.setAttribute("contenteditable", "false");
  joiner.textContent = "\u2060";
  return joiner;
}

/** Harness switch (`window.__docsIdeographWordsCssOff = true`): ideographs a
 * mode-13 document sets as letters break between characters in the browser,
 * as before (A/B). */
function ideographWordsCssOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsIdeographWordsCssOff?: boolean }).__docsIdeographWordsCssOff === true;
}

/** Inherited Word punctuation defaults are independent of list layout gates. */
function documentOverflowPunctuationDecorations(
  doc: PmNode,
  continuationTypography: ReadonlyMap<PmNode, PmNode["attrs"]>,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const result: Decoration[] = [];
  doc.nodesBetween(from, to, (block, pos) => {
    if (
      !block.isTextblock ||
      !["paragraph", "heading"].includes(block.type.name)
    )
      return;
    const context = doc.resolve(pos);
    const displayAttrs = continuationTypography.get(block) ?? block.attrs;
    let sourceAdapter = (displayAttrs.source as { adapter?: unknown } | null)
      ?.adapter;
    let inTable = false;
    let owningTableAttrs: PmNode["attrs"] | undefined;
    for (let depth = context.depth; depth > 0; depth--) {
      const ancestor = context.node(depth);
      inTable ||= ["tableCell", "tableHeader"].includes(ancestor.type.name);
      if (ancestor.type.name === "table" && !owningTableAttrs)
        owningTableAttrs = ancestor.attrs;
      sourceAdapter ??= (ancestor.attrs.source as { adapter?: unknown } | null)
        ?.adapter;
    }
    // Explicit values already use the authored renderer below.
    const value = block.attrs.overflowPunct != null ? null : resolveDocumentOverflowPunctuation(
      doc.attrs,
      displayAttrs,
      sourceAdapter,
      inTable,
    );
    if (value !== null)
      result.push(
        Decoration.node(pos, pos + block.nodeSize, {
          "data-document-effective-overflow-punctuation": String(value),
          style: `hanging-punctuation:${value && wordPunctuationMayHang(doc.attrs.wordCompatibilityMode, displayAttrs.textAlign ?? doc.attrs.defaultTextAlign) ? "allow-end" : "none"}`,
        }),
      );
    // Word's simplified-Chinese "cannot end a line" characters the browser's
    // strict line breaking still ends a line with (the interpunct of a
    // transliterated name, an opening curly quote, a currency sign): the
    // character and the one after it are kept on one line, in East Asian
    // text, while the paragraph's line breaking rules are on (WUA 115).
    // East Asian text in a Western language takes none of Word's East Asian
    // line rules, as with them turned off (wordEastAsianTextInEastAsianLanguage,
    // R334-D24: "东西向（" ends a line).
    const kinsokuOn = (displayAttrs.kinsoku ?? doc.attrs.defaultKinsoku) !== false &&
      (!EAST_ASIAN_TEXT.test(block.textContent) || wordEastAsianTextInEastAsianLanguage(doc.attrs, block));
    if (
      kinsokuOn &&
      WORD_ZH_CN_NO_END_EXTRA_TEST.test(block.textContent)
    ) {
      for (const range of kinsokuNoEndRanges(block, pos + 1, doc.attrs.eastAsianLanguage)) {
        result.push(Decoration.inline(range.from, range.to, {
          "data-document-kinsoku-no-end": "eastAsia-zh-CN",
          style: "white-space:nowrap",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      }
    }
    if (
      kinsokuOn &&
      WORD_ZH_CN_NO_START_EXTRA_TEST.test(block.textContent)
    ) {
      for (const range of kinsokuNoStartRanges(block, pos + 1, doc.attrs.eastAsianLanguage)) {
        result.push(Decoration.inline(range.from, range.to, {
          "data-document-kinsoku-no-start": "eastAsia-zh-CN",
          style: "white-space:nowrap",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      }
    }
    // East Asian line breaking rules off (`w:kinsoku` 0): Word lets any East
    // Asian character, its punctuation included, open or end a line, and
    // still wraps Latin text between words (docx-look/probes kin_probe.py:
    // "，" and "。" open lines with kinsoku 0; the Latin paragraph breaks at
    // the same words either way). A paragraph-wide `line-break: anywhere` cut
    // Latin words mid-word at every line end (corpus R324-D01, a Norwegian
    // template's body style with kinsoku off: "quant|um", "Alumin|ium";
    // 37 of 44 corpus documents with kinsoku off hold no East Asian text).
    // Ideographs set as letters of a word (wordSetsIdeographsAsLetters: mode
    // 13 and earlier, defaults with no East Asian face): Word breaks such
    // text only where it breaks Latin text, and cuts a word wider than the
    // line where it overflows (docx-look probes/cjk1). The engine's lines
    // say so, but a correction cannot keep the browser from breaking between
    // kana: its lines broke there all the same (corpus R398-D14, "大豆1kgあたり
    // …(N-P-" / "K):生産される…" in Word). `window.__docsIdeographWordsCssOff
    // = true`: as before (A/B).
    // Hangul keeps its own class there (the engine breaks between its
    // syllables), which keep-all would not: such a paragraph is left as it was.
    const ideographWords = SET_AS_LETTER_TEXT.test(block.textContent) && !HANGUL_TEXT.test(block.textContent) &&
      wordSetsIdeographsAsLetters(doc.attrs) && !ideographWordsCssOff();
    if (ideographWords) {
      result.push(Decoration.node(pos, pos + block.nodeSize, {
        "data-document-ideograph-words": "true",
        style: "word-break:keep-all;overflow-wrap:break-word",
      }));
      // Two adjacent stretches are two spans (a break may lie between them).
      const keep = ideographWordKeepRanges(block, pos + 1);
      keep.ranges.forEach((range, index) => {
        result.push(Decoration.inline(range.from, range.to, {
          "data-document-ideograph-word-keep": index % 2 ? "b" : "a",
          style: "white-space:nowrap",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      });
      for (const at of keep.joins) {
        result.push(Decoration.widget(at, ideographWordJoiner, { side: -1, key: "docs-ideograph-word-joiner", ignoreSelection: true, marks: [] }));
      }
    }
    if (!kinsokuOn && !ideographWords && EAST_ASIAN_TEXT.test(block.textContent)) {
      for (const range of eastAsianRunRanges(block, pos + 1)) {
        result.push(Decoration.inline(range.from, range.to, {
          "data-document-kinsoku-off": "true",
          style: "line-break:anywhere",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      }
    }
    // The marks Word's list for the text's language lets start or end a line
    // where Chromium's line breaking does not (R14-D15's ladder).
    if (sourceAdapter === "docx" && kinsokuOn && !ideographWords) {
      for (const range of documentKinsokuAllowedBreaks(block, pos + 1, doc.attrs.eastAsianLanguage)) {
        result.push(Decoration.inline(range.from, range.to, {
          "data-document-kinsoku-allowed-break": "true",
          style: "line-break:anywhere",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      }
    }
    // Any Word table's cell, whether or not its style resolves word wrap: a
    // line-end space pushed words down all the same (corpus R280-D22: "22810
    // 86249, ...- ... 89310" on five lines for Word's three; R279-D28), and a
    // slash came away from the letter after it. East Asian text keeps the
    // rules of the wrap below.
    // A table nested in a Word table states no adapter of its own: its cells are
    // Word's too (corpus R283-D10: "AOP 045" and its trailing blanks on two lines,
    // a line more in 34 cells; R280-D15).
    const wordTableCell = inTable && sourceAdapter === "docx";
    // Word applies wordWrap off only from compatibility mode 14: earlier, and
    // with no mode stated, its words wrap whole (documentWordWrapOffInert).
    // The off the attribute draws as break-all is put back to word breaks,
    // and the paragraph takes every rule of a wrapped one below (corpus
    // R461-D71: its R code cut at the margin where Word wraps it at the
    // spaces, and the line engine, which wraps at words, never agreed with
    // the page -- 7 086 of 8 403 reads -- so each cut was probed on the DOM).
    const effectiveWordWrap = resolveEffectiveDocumentWordWrap(doc.attrs,displayAttrs,sourceAdapter,inTable,owningTableAttrs);
    const wordWrapInert = normalizeParagraphOnOff(block.attrs.wordWrap) === false && documentWordWrapOffInert(doc.attrs, sourceAdapter);
    if (wordWrapInert) {
      result.push(Decoration.node(pos, pos + block.nodeSize, {
        "data-document-word-wrap-inert": "true",
        style: "word-break:normal;overflow-wrap:break-word",
      }));
    }
    const wordsMayBreak = effectiveWordWrap === false;
    if (wordTableCell && !wordsMayBreak) {
      if (!EAST_ASIAN_TEXT.test(block.textContent)) {
        result.push(Decoration.node(pos, pos + block.nodeSize, {
          "data-document-native-whitespace": "preserve-hang",
          style: "white-space:pre-wrap",
        }));
      }
    }
    // "Allow Latin text to wrap in the middle of a word" (w:wordWrap 0, drawn
    // word-break: break-all by the attribute) cuts no Latin word in Korean
    // text: Word keeps the word whole there, and Hangul still breaks between
    // syllables as with break-all (documentKoreanWholeWordRanges). Under
    // break-all an AutoFit table read every such cell as one letter wide
    // (corpus R287-D30: "Variable" on two lines in a 33pt column, Word's
    // 127pt). `window.__docsKoreanWordWrapOff = true`: as before (A/B).
    if (sourceAdapter === "docx" && normalizeParagraphOnOff(block.attrs.wordWrap) === false && !wordWrapInert && !koreanWordWrapOff()) {
      const korean = documentKoreanWholeWordRanges(block, pos + 1, doc.attrs.eastAsianLanguage);
      const attrs = { "data-document-korean-whole-words": "true", style: "word-break:normal;overflow-wrap:break-word" };
      if (korean === "paragraph") {
        result.push(Decoration.node(pos, pos + block.nodeSize, attrs));
        // Its Latin words kept whole, its line-end space hangs as anywhere
        // else in Word (the preserve-hang rule above, which "Allow Latin
        // text to wrap" kept such a paragraph out of): under break-spaces the
        // space was charged to the line and the word before it went down
        // (corpus R287-D30, Table A2: "of own tax burden relative" fits
        // Word's 129 pt cell with its space hanging; ours took a fourth line
        // and the table's last row went to page 2). Paragraphs holding East
        // Asian text keep break-spaces, as there.
        // `window.__docsKoreanWholeWordsHangOff = true`: as before (A/B).
        if (!EAST_ASIAN_TEXT.test(block.textContent) && !koreanWholeWordsHangOff()) {
          result.push(Decoration.node(pos, pos + block.nodeSize, {
            "data-document-native-whitespace": "preserve-hang",
            style: "white-space:pre-wrap",
          }));
        }
      } else for (const range of korean) result.push(Decoration.inline(range.from, range.to, attrs, { inclusiveStart: false, inclusiveEnd: false }));
    }
    if (sourceAdapter === "docx" && !wordsMayBreak) {
      for (const boundary of documentSlashLetterBoundaries(block, pos + 1)) {
        result.push(Decoration.inline(boundary.from, boundary.to, {
          "data-document-slash-letter": "true",
          style: "white-space:nowrap",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      }
    }
    if(sourceAdapter==="docx" && effectiveWordWrap===true){
      for (const range of documentHangulWordRanges(block, pos + 1)) {
        result.push(Decoration.inline(range.from, range.to, {
          "data-document-hangul-word": "true",
          style: "word-break:keep-all",
        }, { inclusiveStart: false, inclusiveEnd: false }));
      }
      if (inTable && block.type.name === "paragraph" && block.content.size === 0) {
        // An in-line shape alone in its cell paragraph is that paragraph's
        // line, and stands after it as a block: the row took both lines (corpus
        // R281-D17: a rating row of circles 57pt tall, Word's 31pt).
        const next = doc.nodeAt(pos + block.nodeSize);
        if (next?.type.name === "documentShape" && next.attrs.wrapMode === "inline" && next.attrs.source?.adapter === "docx") {
          result.push(Decoration.node(pos, pos + block.nodeSize, { "data-document-inline-shape-host": "true" }));
        }
      }
      const whitespaceSource = owningTableAttrs?.source;
      const nativeTableFlow = inTable && whitespaceSource?.adapter === "docx" &&
          whitespaceSource.typographyFlow === 1 &&
          whitespaceSource.fontScriptFlow === 1 &&
          whitespaceSource.cellParagraphFlow === 1 &&
          /^word\/document\.xml#tbl\[\d+\]$/.test(whitespaceSource.sourceAnchor ?? "");
      if (nativeTableFlow) {
        // Word preserves spaces/tabs but hangs trailing spaces. ProseMirror's
        // default break-spaces reserves those spaces in the line budget and
        // can push a word that actually fits to the next line. pre-wrap keeps
        // source whitespace and hard breaks, without adding or deleting text.
        // Only cell flow has a verified whitespace witness. Body/list flow
        // also interacts with terminal punctuation and mixed-font boundaries;
        // its existing layout must not borrow the table-only proof.
        result.push(Decoration.node(pos, pos + block.nodeSize, {
          "data-document-native-whitespace": "preserve-hang",
          style: "white-space:pre-wrap",
        }));
      }
      const paragraphSource = displayAttrs.source;
      const nativeParagraphFlow = !inTable && paragraphSource?.adapter === "docx" &&
        paragraphSource.typographyFlow === 1 && paragraphSource.fontScriptFlow === 1 &&
        /^word\/document\.xml#p\[\d+\](?:\/seg\[\d+\])?$/.test(paragraphSource.sourceAnchor ?? "");
      // A paragraph of Han or Kana text hangs its line-end space too: Word
      // charges no line-end U+0020 to a Chinese line either (docx-look
      // pc3/probes/hz, modes 14 and 15: SimSun 12, nineteen ideographs, "ab"
      // and a space fill line 1 with the space past the margin; break-spaces
      // sent "ab" down). Under pre-wrap U+0020 hangs; an ideographic space
      // (U+3000), which Word hangs as well, still takes its width here.
      if (nativeParagraphFlow && (!holdsNonHangulEastAsianText(block.textContent) || !hanTrailingSpaceHangOff())) {
        // The same rule in the body for a paragraph with no East Asian text:
        // Word charges no line-end space to its line, so a word that fits
        // without the space after it stays (mrline/line.docx: Arial 11pt
        // "...tempor incididunt " ends line 1 in Word 16 for Mac, 572px of
        // a 576px column; break-spaces moved "incididunt" down). A paragraph
        // with Han/Kana text kept break-spaces before (its spaced boundaries
        // left to the terminal punctuation and kinsoku rules); it hangs the
        // space too now (below). Hangul did not keep it: Korean is set in spaced words, and Word hangs the
        // line-end space in Korean text as in Latin (Windows Word, docx-look
        // pc1/probes/ko: Malgun Gothic 10 pt, eight 30 pt words and seven
        // spaces in a column 1.5 pt wider than them stand on one line, left
        // or justified, modes 14 and 15) and in a Latin paragraph holding a
        // Korean name (pc1/probes/kr, corpus R480-D39: "... legtöbbször az
        // északi" fits Word's first line with "(김정은)" further on; with
        // break-spaces "északi" went down: a line more on 19 of its full
        // one-section pages, 59 pages for Word's 40; 41 now).
        result.push(Decoration.node(pos, pos + block.nodeSize, {
          "data-document-native-whitespace": "preserve-hang",
          style: "white-space:pre-wrap",
        }));
      }
      if (nativeTableFlow || nativeParagraphFlow) {
        for (const boundary of documentHanSlashBoundaries(block, pos + 1)) {
          result.push(Decoration.inline(boundary.from, boundary.to, {
            "data-document-han-slash-boundary": "true",
            style: "line-break:anywhere",
          }, { inclusiveStart: false, inclusiveEnd: false }));
        }
        for (const boundary of documentSourceArrowBoundaries(block, pos + 1)) {
          result.push(Decoration.inline(boundary.from, boundary.to, {
            "data-document-source-arrow-boundary": "eastAsia-zh-CN",
            style: "line-break:anywhere",
          }, { inclusiveStart: false, inclusiveEnd: false }));
        }
        // Word never starts a line with a zh-CN no-start character, even after
        // a space. The stylesheet keeps that single space unbreakable, so no
        // source text, glyph advance or line box changes.
        if (kinsokuOn) {
          for (const boundary of documentKinsokuNoStartBoundaries(block, pos + 1)) {
            result.push(Decoration.inline(boundary.from, boundary.to, {
              "data-document-kinsoku-no-start": "eastAsia-zh-CN",
            }, { inclusiveStart: false, inclusiveEnd: false }));
          }
        }
      }
      // This compatibility value is WebKit-specific. A no-op wrapper in other
      // engines only fragments otherwise continuous native text boxes.
      if(typeof CSS!=="undefined" && typeof CSS.supports==="function" &&
        !CSS.supports("line-break","after-white-space"))return false;
      // A text-only paragraph with no East Asian text states the property once
      // on the paragraph. Per-token wrappers split every run at each word,
      // and each split repeats the auto-line-height leaf and fraction span:
      // a 34-page English document carried 42,489 spans in WebKit against
      // 1,337 in Chromium, and the paragraph form brings it to 1,968 with the
      // same pages and block heights, breaking 10 more paragraphs where
      
      // A paragraph with a field or an equation in it is the same paragraph:
      // nothing inside a leaf has spaces to break at under this value. Per word,
      // R323-D11's long paragraph held 1,732 elements in WebKit against 251 in
      // Chromium, and every key repainted them all (WebKit timeline: 106 ms of
      // paint a key there, 16 ms in a short paragraph).
      const onlyLeaves=(()=>{let only=true;block.forEach((node)=>{if(!node.isText&&!node.isLeaf)only=false;});return only;})();
      if(onlyLeaves&&!EAST_ASIAN_TEXT.test(block.textContent)){
        if(/[\x21-\x7e]/.test(block.textContent))result.push(Decoration.node(pos,pos+block.nodeSize,{
          "data-document-word-level-wrap":"block",style:"line-break:after-white-space",
        }));
        return false;
      }
      block.forEach((node,offset)=>{
        if(!node.isText)return;
        // Restrict this projection to space-delimited ASCII tokens. Chinese
        // glyphs and punctuation retain the paragraph's kinsoku/hanging rules.
        for(const match of node.textContent.matchAll(/[\x21-\x7e]+/g)){
          const from=pos+1+offset+match.index;
          result.push(Decoration.inline(from,from+match[0].length,{
            "data-document-word-level-wrap":"true",style:"line-break:after-white-space",
          },{inclusiveStart:false,inclusiveEnd:false}));
        }
      });
    }
  });
  return result;
}

export function documentFormattingDecorations(state: EditorState): DecorationSet {
  const continuationTypography = listContinuationTypography(state.doc);
  return nativeListIndentDecorations(state, continuationTypography).add(state.doc, [
    ...documentOverflowPunctuationDecorations(state.doc, continuationTypography),
    ...documentHeadingStyleSizeDecorations(state.doc),
    ...listParagraphSpacingDecorations(state.doc),
    ...firstLineCharsUnitDecorations(state.doc),
  ]);
}

/** What `documentFormattingDecorations` draws for the top-level block
 * `node` at `pos` (a sheet's child, or the document's in an unpaged one).
 * A list run's spacing is drawn by the run's first list. */
function topLevelBlockFormattingDecorations(
  state: EditorState,
  continuationTypography: ReadonlyMap<PmNode, PmNode["attrs"]>,
  node: PmNode,
  pos: number,
): Decoration[] {
  const end = pos + node.nodeSize;
  return [
    ...nativeListIndentDecorationList(state, continuationTypography, { node, pos }),
    ...documentOverflowPunctuationDecorations(state.doc, continuationTypography, pos, end),
    ...documentHeadingStyleSizeDecorations(state.doc, pos, end),
    ...listParagraphSpacingDecorations(state.doc, pos, end),
    ...firstLineCharsUnitDecorations(state.doc, pos, end),
  ];
}

/** The document attributes the page ledger writes as it lays pages out. */
const LAYOUT_DOC_ATTRS = new Set(["pageBlockSizes", "pageBlockLayoutKey", "pageRegionLayoutReceipt"]);

function sameFormattingDocAttrs(before: PmNode, after: PmNode): boolean {
  if (before.attrs === after.attrs) return true;
  const keys = new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)]);
  for (const key of keys) {
    if (LAYOUT_DOC_ATTRS.has(key)) continue;
    if (before.attrs[key] !== after.attrs[key]) return false;
  }
  return true;
}

function knownFormattingStep(step: Step): boolean {
  return (
    step instanceof ReplaceStep ||
    step instanceof ReplaceAroundStep ||
    step instanceof AddMarkStep ||
    step instanceof RemoveMarkStep ||
    step instanceof AttrStep ||
    step instanceof DocAttrStep ||
    step instanceof AddNodeMarkStep ||
    step instanceof RemoveNodeMarkStep
  );
}

/** Whether two continuation typography maps give the same nodes the same
 * attributes (a list split across sheets, its tail typed as its head). */
function sameContinuationTypography(
  before: ReadonlyMap<PmNode, PmNode["attrs"]>,
  after: ReadonlyMap<PmNode, PmNode["attrs"]>,
): boolean {
  if (before.size !== after.size) return false;
  for (const [node, attrs] of after) {
    const previous = before.get(node);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(attrs)) return false;
  }
  return true;
}

const LIST_BLOCK_NAMES = new Set(["orderedList", "bulletList", "taskList"]);

/**
 * The top-level blocks whose decorations `tr` may have changed: the ones its
 * steps reached, their neighbours on both sides (a list reads the paragraph
 * beside it; a block moved to another sheet leaves new neighbours where it
 * was, and has new ones where it lands), and every list of a run of lists
 * one of these is in (list spacing is drawn for the whole run).
 */
function touchedTopLevelBlocks(tr: Transaction): Map<number, PmNode> {
  const doc = tr.doc;
  const touched = new Map<object, Set<number>>();
  const mark = (container: PmNode, index: number) => {
    let set = touched.get(container);
    if (!set) touched.set(container, (set = new Set()));
    set.add(index);
  };
  for (const [from, to] of touchedRanges(tr)) {
    doc.nodesBetween(from, to, (node, _pos, parent, index) => {
      if (parent === doc && node.type.name === PAGE_BLOCK_NODE) return true;
      if (parent) mark(parent, index);
      return false;
    });
  }
  const blocks = new Map<number, PmNode>();
  const visitContainer = (container: PmNode, start: number) => {
    const indices = touched.get(container);
    if (!indices) return;
    const wanted = new Set<number>();
    for (const index of indices) {
      let first = Math.max(0, index - 1);
      let last = Math.min(container.childCount - 1, index + 1);
      while (first > 0 && LIST_BLOCK_NAMES.has(container.child(first).type.name)) first -= 1;
      while (last < container.childCount - 1 && LIST_BLOCK_NAMES.has(container.child(last).type.name)) last += 1;
      for (let at = first; at <= last; at += 1) wanted.add(at);
    }
    container.forEach((child, offset, index) => {
      if (wanted.has(index)) blocks.set(start + offset, child);
    });
  };
  visitContainer(doc, 0);
  doc.forEach((sheet, offset) => {
    if (sheet.type.name === PAGE_BLOCK_NODE) visitContainer(sheet, offset + 1);
  });
  return blocks;
}

/**
 * The formatting decorations after `tr`. Those of a top-level block are its
 * own, its neighbours' and the document's: the set is mapped, and only the
 * blocks the transaction may have changed are drawn again (every page move
 * and keystroke drew the whole book's).
 */
function applyDocumentFormattingDecorations(
  tr: Transaction,
  previous: DecorationSet,
  state: EditorState,
): DecorationSet {
  if (!sameFormattingDocAttrs(tr.before, tr.doc) || !tr.steps.every(knownFormattingStep)) {
    return documentFormattingDecorations(state);
  }
  const continuationTypography = listContinuationTypography(tr.doc);
  if (!sameContinuationTypography(listContinuationTypography(tr.before), continuationTypography)) {
    return documentFormattingDecorations(state);
  }
  let next = previous.map(decorationMapping(tr), tr.doc);
  const blocks = touchedTopLevelBlocks(tr);
  if (blocks.size === 0) return next;
  const stale: Decoration[] = [];
  const added: Decoration[] = [];
  for (const [pos, node] of blocks) {
    const end = pos + node.nodeSize;
    for (const decoration of next.find(pos, end)) {
      if (decoration.from >= pos && decoration.to <= end) stale.push(decoration);
    }
    added.push(...topLevelBlockFormattingDecorations(state, continuationTypography, node, pos));
  }
  if (stale.length) next = next.remove(stale);
  return added.length ? next.add(tr.doc, added) : next;
}

/**
 * Word measures a first-line indent in characters (`w:firstLineChars`, the
 * editor's `textIndent` em) in the size of the paragraph's text, not of the
 * paragraph style: firstLineChars="200" before 20pt text indents 40pt
 * (Word 16, probe-indent: the 20pt paragraph starts 41.2pt in, glyph
 * bearing included; the 11pt one 22pt). CSS `em` is the paragraph
 * element's size, so the paragraph is told its first run's size.
 */
function firstLineCharsUnitDecorations(
  doc: PmNode,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (!normalizeTextIndent(node.attrs.textIndent)) return false;
    let size: string | null = null;
    for (let index = 0; index < node.childCount && size === null; index += 1) {
      const child = node.child(index);
      if (!child.isText || !child.text) continue;
      const mark = child.marks.find((item) => item.type.name === "fontSize");
      size = normalizeFontSize(mark?.attrs.size) ?? "";
    }
    if (size) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          style: `--docs-first-run-font-size: ${size}`,
        }),
      );
    }
    return false;
  });
  return decorations;
}

const nativeListIndentKey = new PluginKey<DecorationSet>("nativeListIndent");

/** True when every item of this list is led by an imported Word paragraph, so
 * that paragraph's own before/after is the whole inter-item gap. A single item
 * without that receipt (typed content, a node view) leaves the list on the
 * editor's default wrapper spacing.
 *
 * The verdict is read from the SOURCE only. Splitting an item before a nested
 * block makes pagination invent an empty schema bridge paragraph to lead the
 * tail item; it carries no source receipt, and reading it as "not imported"
 * would bring the wrapper margins back on the tail page AFTER the ledger had
 * measured that page without them — the page would then paint taller than it
 * was cut for. A bridge neither proves nor disproves ownership. */
function sourceOwnedListSpacing(
  list: PmNode,
  nativeCellFlow = false,
): boolean {
  let proven = false;
  for (let index = 0; index < list.childCount; index++) {
    const item = list.child(index);
    if (item.type.name !== "listItem") return false;
    let paragraph = item.firstChild;
    if (
      paragraph?.type.name === "paragraph" &&
      paragraph.attrs[LIST_ITEM_SPLIT_BRIDGE_ATTR] === true
    ) {
      const next = item.childCount > 1 ? item.child(1) : null;
      // A bridge-led item carries its real paragraph next, or only the nested
      // block the split happened before; that item is judged by the rest.
      if (next?.type.name !== "paragraph") continue;
      paragraph = next;
    }
    // In a native DOCX cell flow the table, not the paragraph, carries the
    // source receipt (see `readNativeListIndent`).
    const source = paragraph?.attrs.source as { adapter?: unknown } | null;
    if (
      paragraph?.type.name !== "paragraph" ||
      !(source?.adapter === "docx" || (nativeCellFlow && source == null))
    )
      return false;
    proven = true;
  }
  return proven;
}

/** Word's contextual spacing between the items of one imported list: each
 * item's paragraph stands in its own listItem, so the neighbour Word compares
 * it with is the next item's paragraph, not a sibling. Reuses the
 * contextual-spacing identity; an item holding a nested list keeps its edge.
 * The mark alone (note-editor.css zeroes the edge), so the paragraph's own
 * inline spacing survives the mark's removal. */
function contextualListItemSpacing(
  list: PmNode,
  index: number,
  outside: { before: PmNode | null; after: PmNode | null } = { before: null, after: null },
): Record<string, string> {
  const item = list.child(index);
  const paragraph = item.firstChild;
  const spacingAttrs: Record<string, string> = {};
  if (paragraph?.type.name !== "paragraph" || paragraph.attrs.contextualSpacing !== true) return spacingAttrs;
  const identity = contextualParagraphStyleIdentity(paragraph);
  if (!identity) return spacingAttrs;
  // The paragraph Word compares with is the one before / after in the story:
  // another item of this list, or across the list's edge the last item of
  // the list before it (a numbering jump starts a new list) or a paragraph.
  const previousItem = index > 0 ? list.child(index - 1) : null;
  const before =
    previousItem !== null
      ? previousItem.childCount === 1 ? previousItem.firstChild : null
      : outside.before;
  const nextItem = index + 1 < list.childCount ? list.child(index + 1) : null;
  const after =
    item.childCount !== 1 ? null : nextItem !== null ? nextItem.firstChild : outside.after;
  if (before && contextualParagraphStyleIdentity(before) === identity) {
    spacingAttrs[CONTEXTUAL_SPACING_BEFORE_ATTR] = "true";
  }
  if (after && contextualParagraphStyleIdentity(after) === identity) {
    spacingAttrs[CONTEXTUAL_SPACING_AFTER_ATTR] = "true";
  }
  return spacingAttrs;
}

const LIST_NODE_NAMES = new Set(["orderedList", "bulletList", "taskList"]);

/** The paragraphs just outside a list in its parent: the last item's (or the
 * paragraph) before it and the first item's (or the paragraph) after it. */
function listOutsideParagraphs(doc: PmNode, listPos: number): { before: PmNode | null; after: PmNode | null } {
  let resolved;
  try {
    resolved = doc.resolve(listPos);
  } catch {
    return { before: null, after: null };
  }
  const parent = resolved.parent;
  const index = resolved.index();
  const previous = index > 0 ? parent.child(index - 1) : null;
  const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
  const edge = (node: PmNode | null, last: boolean): PmNode | null => {
    if (!node) return null;
    if (node.isTextblock) return node;
    if (!LIST_NODE_NAMES.has(node.type.name) || node.childCount === 0) return null;
    const item = last ? node.lastChild! : node.firstChild!;
    if (last && item.childCount !== 1) return null;
    return item.firstChild?.isTextblock ? item.firstChild : null;
  };
  return { before: edge(previous, true), after: edge(next, false) };
}

/** Source numbering already resolved paragraph indents. Do not add HTML list
 * padding or the generic standalone-hanging paragraph pad a second time.
 * Unknown/mixed lists retain their original path, including custom counters. */
function nativeListIndentDecorations(
  state: EditorState,
  continuationTypography: ReadonlyMap<PmNode, PmNode["attrs"]>,
): DecorationSet {
  const result = nativeListIndentDecorationList(state, continuationTypography, null);
  return result.length ? DecorationSet.create(state.doc, result) : DecorationSet.empty;
}

/** The native list indent decorations of the document, or of one top-level
 * block (`root`), which the document walk reaches with the same context:
 * no parent indent, native, outside any table cell. */
function nativeListIndentDecorationList(
  state: EditorState,
  continuationTypography: ReadonlyMap<PmNode, PmNode["attrs"]>,
  root: { node: PmNode; pos: number } | null,
): Decoration[] {
  const doc = state.doc;
  const resolveTypography = createEffectiveKerningThresholdResolver(state);
  const defaultTabTwips = normalizeWordDocumentSettings(doc.attrs.wordSettings)?.defaultTabStopTwips;
  const defaultTabPt = typeof defaultTabTwips === "number" && defaultTabTwips > 0 ? defaultTabTwips / 20 : 36;
  if (
    doc.attrs.textDirection === "rtl" ||
    (doc.attrs.writingMode && doc.attrs.writingMode !== "horizontal-tb")
  )
    return [];
  const result: Decoration[] = [];
  const visit = (
    node: PmNode,
    pos: number,
    parentLeft: number,
    nativeContext: boolean,
    nativeCellFlow: boolean,
  ) => {
    if (node.isTextblock || node.isLeaf) return;
    if (
      node.attrs.dir === "rtl" ||
      (node.attrs.textDirection &&
        !["ltr", "lrTb"].includes(node.attrs.textDirection))
    )
      return;
    const list = ["orderedList", "bulletList", "taskList"].includes(
      node.type.name,
    );
    // Spacing ownership is independent of the marker geometry above: a Word
    // list item is a paragraph that carries its own before/after, so the HTML
    // wrapper must contribute nothing. Without this the editor's default
    // `li`/`ul` block margins collapse OVER a smaller authored gap (a 1.8 pt
    // "Compact" item became the 10 pt document default), which is invisible in
    // a short list and worth whole pages in a long one. Marker style and
    // absolute indents are deliberately not required here.
    if (
      ["orderedList", "bulletList"].includes(node.type.name) &&
      node.childCount &&
      sourceOwnedListSpacing(node, nativeCellFlow)
    ) {
      result.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "docs-source-list-spacing",
        }),
      );
      node.forEach((item, offset, index) => {
        result.push(
          Decoration.node(pos + 1 + offset, pos + 1 + offset + item.nodeSize, {
            class: "docs-source-list-spacing__item",
          }),
        );
        // A list Word's own definition draws (listDefinitionMarkers) takes
        // no native-indent path below, and its List Paragraph items sat a
        // whole paragraph space apart (R29-D09, R28-D22): the contextual
        // edge is the paragraphs', whatever paints the markers.
        const spacingAttrs = contextualListItemSpacing(node, index, listOutsideParagraphs(doc, pos));
        const paragraph = item.firstChild;
        if (paragraph && Object.keys(spacingAttrs).length)
          result.push(
            Decoration.node(pos + 2 + offset, pos + 2 + offset + paragraph.nodeSize, spacingAttrs),
          );
      });
    }
    if (
      nativeContext &&
      ((node.type.name === "orderedList" &&
        // A Word list definition paints its own markers and geometry
        // (listDefinitionMarkers.ts), never the browser's.
        node.attrs.listDefinition == null &&
        (!node.attrs.listStyleType ||
          node.attrs.listStyleType === "decimal")) ||
        (node.type.name === "bulletList" &&
          (!node.attrs.bulletStyle || node.attrs.bulletStyle === "disc"))) &&
      node.childCount
    ) {
      const indents = Array.from({ length: node.childCount }, (_, index) => {
        const item = node.child(index),
          paragraph = item.firstChild;
        if (
          item.type.name !== "listItem" ||
          paragraph?.type.name !== "paragraph" ||
          paragraph.attrs.pageSplitListItemBridge ||
          Array.from({ length: item.childCount - 1 }, (_, child) =>
            item.child(child + 1),
          ).some(
            (child) =>
              !["orderedList", "bulletList", "taskList"].includes(
                child.type.name,
              ),
          )
        )
          return null;
        return readNativeListIndent(
          continuationTypography.get(paragraph) ?? paragraph.attrs,
          parentLeft,
          nativeCellFlow,
          defaultTabPt,
        );
      });
      if (indents.every((indent) => indent !== null)) {
        result.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: "docs-native-list-indent",
          }),
        );
        node.forEach((item, offset, index) => {
          const indent = indents[index]!,
            itemPos = pos + 1 + offset,
            paragraph = item.firstChild!;
          const markerSize = resolveTypography(
            itemPos + 2,
            paragraph,
          ).fontSizePx;
          const continued =
            item.attrs.pageSplitItemContinuation === true ||
            !fragmentCarries("listLabel", paragraph.attrs);
          // The number is set in the marker run Word resolves for it (the
          // paragraph mark's face, bold and italic under the level's): Word
          // 16.86 draws a Georgia list's "1." in its Arial mark, a bold mark's
          // in bold (scratchpad bmark). Without the fact it keeps the item's.
          // Numbers only: a bulleted item keeps its own glyph and face.
          const fact = node.type.name === "orderedList" ? readDocumentNumberingMarkerFact(paragraph.attrs) : null;
          const markerFace = fact
            ? `;--docs-native-list-marker-font:${JSON.stringify(officePrimaryFontFamily(fact.markerRun.fonts.ascii))};--docs-native-list-marker-weight:${fact.markerRun.bold ? 700 : 400};--docs-native-list-marker-style:${fact.markerRun.italic ? "italic" : "normal"}`
            : "";
          result.push(
            Decoration.node(itemPos, itemPos + item.nodeSize, {
              class: `docs-native-list-indent__item${continued ? " docs-native-list-indent__item--continued" : ""}`,
              style: `--docs-native-list-left:${indent.relativeLeftPt}pt;--docs-native-list-hanging:${indent.hangingPt}pt;--docs-native-list-marker-slot:${indent.markerSlotPt}pt${markerSize !== null ? `;--docs-native-list-marker-size:${markerSize}px` : ""}${markerFace}`,
            }),
          );
          // List items wrap source-adjacent paragraphs in different parents.
          const spacingAttrs = contextualListItemSpacing(node, index, listOutsideParagraphs(doc, pos));
          result.push(
            Decoration.node(itemPos + 1, itemPos + 1 + paragraph.nodeSize, {
              class: `docs-native-list-indent__text${continued ? " docs-native-list-indent__continued" : " docs-native-list-indent__marker"}`,
              ...spacingAttrs,
            }),
          );
          item.forEach((child, childOffset) => {
            if (child !== paragraph)
              visit(
                child,
                itemPos + 1 + childOffset,
                indent.leftPt,
                true,
                nativeCellFlow,
              );
          });
        });
        return;
      }
    }
    // A Word cell's list the native pass above does not draw (a glyph of the
    // package's own, a lettered or outline numbering): its paragraphs still
    // carry Word's absolute indents, and the editor's wrapper padding stood
    // on top of them. The hanging indent, which Word spends on the marker and
    // the tab after it, pulled only the first line back, so every later line
    // began a hanging width right of Word's and was that much narrower. Word
    // 16.86 truth PDFs: corpus R280-D15 p6, a nested cell's "b)" item (w:ind
    // left 720 hanging 360) sets its marker 18pt and every line of its text
    // 36pt from the cell's text edge (143.76 and 161.76 against 125.64); here
    // the second line on began at 54pt and broke a word early (lines of 11,
    // 11, 13, 11 words against 11, 11, 12, 10). R281-D20 p2, a "●" item:
    // bullet at 18pt, "Original" and "Articles" both at 36pt.
    // The wrapper gives its padding up and the paragraph its first-line pull:
    // the marker (an inline box of zero net advance, note-editor.css) hangs
    // its own hanging width left of the paragraph's left indent.
    let sourceHangingList = false;
    if (
      nativeContext &&
      nativeCellFlow &&
      ["orderedList", "bulletList"].includes(node.type.name) &&
      node.attrs.listDefinition == null &&
      node.childCount
    ) {
      const hangings = Array.from({ length: node.childCount }, (_, index) => {
        const item = node.child(index),
          paragraph = item.firstChild;
        if (
          item.type.name !== "listItem" ||
          paragraph?.type.name !== "paragraph" ||
          paragraph.attrs.source != null ||
          paragraph.attrs.pageSplitListItemBridge ||
          Array.from({ length: item.childCount - 1 }, (_, child) => item.child(child + 1)).some(
            (child) => !["orderedList", "bulletList", "taskList"].includes(child.type.name),
          )
        )
          return null;
        const indent = readNativeListIndent(
          continuationTypography.get(paragraph) ?? paragraph.attrs,
          0,
          true,
          defaultTabPt,
        );
        return indent && indent.hangingPt > 0 ? indent.hangingPt : null;
      });
      if (hangings.every((hanging) => hanging !== null)) {
        sourceHangingList = true;
        result.push(
          Decoration.node(pos, pos + node.nodeSize, { class: "docs-source-list-hanging" }),
        );
        node.forEach((item, offset, index) => {
          result.push(
            Decoration.node(pos + 1 + offset, pos + 1 + offset + item.nodeSize, {
              class: "docs-source-list-hanging__item",
              style: `--docs-list-marker-hang:${hangings[index]}pt`,
            }),
          );
        });
      }
    }
    // A cell establishes its own text area. An ordinary/mixed list does not
    // establish a known native absolute-indent origin for its nested lists.
    const cell = ["tableCell", "tableHeader"].includes(node.type.name);
    // A DOCX table whose cell paragraphs ARE the package's own paragraphs
    // (`source.cellParagraphFlow`) vouches for them; any other table ends
    // that authority for everything inside it.
    const tableSource = node.attrs.source as {
      adapter?: unknown;
      cellParagraphFlow?: unknown;
    } | null | undefined;
    const childCellFlow =
      node.type.name === "table"
        ? // A table nested in such a cell states no flow of its own: it is the same
          // Word document (corpus R282-D25: its list items sat 10 pt apart).
          tableSource?.adapter === undefined
          ? nativeCellFlow
          : tableSource.adapter === "docx" && tableSource.cellParagraphFlow === 1
        : nativeCellFlow;
    node.forEach((child, offset) =>
      visit(
        child,
        pos + (node.type.name === "doc" ? 0 : 1) + offset,
        cell ? 0 : parentLeft,
        // The lists inside such a list stand on the same absolute indents.
        cell || sourceHangingList || (node.type.name === "listItem" && nativeContext)
          ? true
          : nativeContext && !list,
        childCellFlow,
      ),
    );
  };
  if (root) visit(root.node, root.pos, 0, true, false);
  else visit(doc, 0, 0, true, false);
  return result;
}

const DocumentFormatting = Extension.create<DocumentFormattingOptions>({
  name: "documentFormatting",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: nativeListIndentKey,
        state: {
          init: (_, state) => documentFormattingDecorations(state),
          apply: (tr, previous, _old, state) =>
            !tr.docChanged
              ? previous
              : tr.getMeta(BULK_FILL_CHUNK_META) === true
                ? mappedThroughBulkFill(previous.map(decorationMapping(tr), tr.doc))
                : rebuildsAfterFill(previous)
                  ? documentFormattingDecorations(state)
                  : applyDocumentFormattingDecorations(tr, previous, state),
        },
        props: { decorations: (state) => nativeListIndentKey.getState(state) },
      }),
      paragraphMarkTypingPlugin(),
    ];
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) =>
              normalizeTextAlign(
                element.getAttribute("data-text-align") ||
                  element.style.textAlign,
              ),
            renderHTML: (attrs) => {
              const align = normalizeTextAlign(attrs.textAlign);
              if (!align) return {};
              // Word reads an imported right-to-left paragraph's w:jc left /
              // right as its start / end edge (tdf104649: jc="left" in a
              // w:bidi paragraph stands at the right margin in Word).
              const source = attrs.source as { adapter?: unknown } | null | undefined;
              const logical =
                source?.adapter === "docx" &&
                normalizeDir(attrs.dir) === "rtl" &&
                (align === "left" || align === "right");
              return logical
                ? { "data-text-align": align, "data-text-align-logical": "true" }
                : { "data-text-align": align };
            },
          },
          // Per-paragraph text direction (RTL parity). Stored as the standard
          // `dir` attribute so the browser flows the text and folds the default
          // alignment for the block; only the whitelisted "ltr"/"rtl" values are
          // ever accepted, on both parse and render, so a forged value (or a
          // direction-changing override smuggled through imported markup) is
          // dropped. The default (ltr) renders nothing so legacy blocks and
          // newly-typed paragraphs stay attribute-free.
          dir: {
            default: null,
            // The `dir` attribute, else the standard CSS `direction` pasted
            // HTML may state the same base direction with.
            parseHTML: (element) =>
              normalizeDir(element.getAttribute("dir")) ?? normalizeDir(element.style.direction),
            renderHTML: (attrs) => {
              const dir = normalizeDir(attrs.dir);
              return dir && dir !== DEFAULT_TEXT_DIRECTION ? { dir } : {};
            },
          },
          indent: {
            default: 0,
            parseHTML: (element) =>
              normalizeIndent(element.getAttribute("data-indent")),
            renderHTML: (attrs) => {
              const indent = normalizeIndent(attrs.indent);
              return indent > 0 ? { "data-indent": String(indent) } : {};
            },
          },
          // Table-of-contents entry level (Word TOC1/TOC2/TOC3 → 1/2/3), set on
          // import so the editor renders the entry with Word-style hierarchy
          // indent, a dot leader, and a right-aligned page number (see the
          // `[data-toc-level]` rules in note-editor.css). Absent on ordinary
          // paragraphs, which render exactly as before.
          tocLevel: {
            default: null,
            parseHTML: (element) =>
              normalizeTocLevel(element.getAttribute("data-toc-level")),
            renderHTML: (attrs) => {
              const level = normalizeTocLevel(attrs.tocLevel);
              if (!level) return {};
              // A field TOC's entry draws the leader its own right tab
              // states (Word's TOC dialog writes it on every entry line):
              // the dots run from the words to the page number.
              const stops = attrs.tocEntryLeader ? null : (normalizeTabStops(attrs.tabStops) as TabStop[] | null);
              const right = stops?.filter((stop) => stop.align === "right").at(-1);
              // An entry stating no right tab takes its "toc N" style's
              // (the import's source.tocTabLeader; corpus R282-D01).
              const styled = !right && !attrs.tocEntryLeader ? tocStyleTabLeader(attrs.source) : null;
              const leader = right ? (right.leader !== "none" ? right.leader : null) : styled;
              return { "data-toc-level": String(level), ...(leader ? { "data-toc-tab-leader": leader } : {}) };
            },
          },
          // A manual table of contents' entry line (Word's manual gallery
          // blocks): the page number sits at the right margin, after this
          // leader ("none": a bare gap), as Word's right-aligned positional
          // or right tab puts it. Absent on every other paragraph.
          tocEntryLeader: {
            default: null,
            parseHTML: (element) =>
              normalizeTocEntryLeader(element.getAttribute("data-toc-entry-leader")),
            renderHTML: (attrs) => {
              const leader = normalizeTocEntryLeader(attrs.tocEntryLeader);
              return leader ? { "data-toc-entry-leader": leader } : {};
            },
          },
          [TOC_OUTLINE_LEVEL_ATTR]: {
            default: null,
            parseHTML: (element) =>
              normalizeTocOutlineLevel(
                element.getAttribute("data-toc-outline-level"),
              ),
            renderHTML: (attrs) => {
              const level = normalizeTocOutlineLevel(
                attrs[TOC_OUTLINE_LEVEL_ATTR],
              );
              return level !== null
                ? { "data-toc-outline-level": String(level) }
                : {};
            },
          },
          lineHeight: {
            default: null,
            parseHTML: (element) =>
              normalizeLineHeight(
                element.getAttribute("data-line-height") ||
                  element.style.lineHeight,
              ),
            renderHTML: (attrs) => {
              const lineHeight = normalizeLineHeight(attrs.lineHeight);
              return lineHeight
                ? {
                    "data-line-height": lineHeight,
                    // The multiple alone, for the stylesheet's placement of
                    // the text inside its line (--doc-line-factor).
                    style: `line-height: ${lineHeight}; --doc-line-factor: ${lineHeight}`,
                  }
                : {};
            },
          },
          // Word's ABSOLUTE line spacing (lineRule="exact"|"atLeast", stored in
          // points). A unitless ratio cannot express it; CSS line-box semantics
          // match atLeast exactly (short content fills to the value, taller
          // inline content still grows the box) and approximate exact the same
          // way. Mutually exclusive with `lineHeight` at the importer level.
          lineHeightPt: {
            default: null,
            // The private attribute, else a standard CSS line height in an
            // absolute unit (`line-height: 40px`), which no unitless ratio
            // can state.
            parseHTML: (element) =>
              normalizeLineHeightPt(element.getAttribute("data-line-height-pt")) ??
              (element.getAttribute("data-line-height")
                ? null
                : normalizeLineHeightPt(cssAbsoluteLengthPt(element.style.lineHeight))),
            renderHTML: (attrs) => {
              const points = normalizeLineHeightPt(
                (attrs as { lineHeightPt?: unknown }).lineHeightPt,
              );
              if (points === null) return {};
              const rule = normalizeLineHeightRule(
                (attrs as { lineHeightRule?: unknown }).lineHeightRule,
              );
              // Word's "At least" is a floor: a run taller than the value still
              // grows its line. An absolute `line-height` inherits as a length,
              // so every run would keep the floor and a 36pt run overlap its
              
              // stylesheet gives the paragraph AND each run
              // `max(floor, 1.2em)`, so the tallest run sets the line box.
              return rule === "atLeast"
                ? {
                    "data-line-height-pt": String(points),
                    style: `--doc-line-height-min: ${points}pt; line-height: max(${points}pt, 1.2em)`,
                  }
                : {
                    "data-line-height-pt": String(points),
                    style: `--doc-line-height-exact: ${points}pt; line-height: ${points}pt`,
                  };
            },
          },
          // Which Word rule produced lineHeightPt — carried so the DOCX export
          // round-trips the source rule instead of coercing every absolute
          // height to one kind.
          lineHeightRule: {
            default: null,
            parseHTML: (element) =>
              normalizeLineHeightRule(element.getAttribute("data-line-height-rule")) ??
              // A CSS line height in an absolute unit is a fixed one.
              (!element.getAttribute("data-line-height-pt") &&
              !element.getAttribute("data-line-height") &&
              cssAbsoluteLengthPt(element.style.lineHeight) !== null
                ? "exact"
                : null),
            renderHTML: (attrs) => {
              const rule = normalizeLineHeightRule(
                (attrs as { lineHeightRule?: unknown }).lineHeightRule,
              );
              return rule ? { "data-line-height-rule": rule } : {};
            },
          },
          // Word's empty paragraphs still have a paragraph-mark run. Its font
          // size determines the height of that otherwise content-less line, so
          // it cannot be represented by an inline mark. Importers set this only
          // on genuine layout blanks; if the user types into one, inheriting the
          // marker size matches Word's paragraph-mark semantics.
          paragraphFontSize: {
            default: null,
            parseHTML: (element) =>
              normalizeFontSize(
                element.getAttribute("data-paragraph-font-size") ||
                  // A style's size painted on a blank paragraph is no mark's.
                  (element.hasAttribute("data-document-style-font-size") ? null : element.style.fontSize),
              ),
            renderHTML: (attrs) => {
              const size = normalizeFontSize(attrs.paragraphFontSize);
              return size
                ? {
                    "data-paragraph-font-size": size,
                    style: `font-size: ${size}`,
                  }
                : {};
            },
          },
          // The marks text typed into an imported blank paragraph starts
          // with: its Word paragraph mark's formatting (paragraphMarkTyping).
          // Model-only; it describes this source paragraph's mark, so a split
          // never copies it to the new half.
          [PARAGRAPH_MARK_MARKS_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
          // The Word horizontal line a blank imported paragraph hosts. The
          // wordHorizontalRule decoration draws it while the paragraph stays
          // empty; splitting the paragraph never copies it to the new half.
          wordHorizontalRule: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => {
              const raw = element.getAttribute("data-word-horizontal-rule");
              if (!raw) return null;
              try {
                return normalizeWordHorizontalRule(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attrs) => {
              const rule = normalizeWordHorizontalRule(attrs.wordHorizontalRule);
              return rule
                ? { "data-word-horizontal-rule": JSON.stringify(rule) }
                : {};
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-space-before")
                ? normalizeSpacing(element.getAttribute("data-space-before"))
                : spacingFromCssLength(element.style.marginTop),
            renderHTML: (attrs) => {
              const points = normalizeSpacing(attrs.spaceBefore);
              if (points === null) return {};
              return paragraphAttributeShows("spaceBefore", attrs)
                ? { "data-space-before": String(points), style: `margin-top: ${points}pt` }
                : { "data-space-before": String(points) };
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-space-after")
                ? normalizeSpacing(element.getAttribute("data-space-after"))
                : spacingFromCssLength(element.style.marginBottom),
            renderHTML: (attrs) => {
              const points = normalizeSpacing(attrs.spaceAfter);
              if (points === null) return {};
              return paragraphAttributeShows("spaceAfter", attrs)
                ? {
                    "data-space-after": String(points),
                    style: `--doc-paragraph-space-after: ${points}pt; margin-bottom: ${points}pt`,
                  }
                : { "data-space-after": String(points) };
            },
          },
          textIndent: {
            default: null,
            parseHTML: (element) =>
              // A CSS indent in an absolute unit (24pt) is not a count of
              // characters: firstLineIndentPt reads that one.
              element.getAttribute("data-text-indent")
                ? normalizeTextIndent(element.getAttribute("data-text-indent"))
                : cssAbsoluteLengthPt(element.style.textIndent) !== null
                  ? null
                  : normalizeTextIndent(element.style.textIndent),
            renderHTML: (attrs) => {
              const indent = normalizeTextIndent(attrs.textIndent);
              if (!indent) return {};
              return paragraphAttributeShows("textIndent", attrs)
                ? {
                    "data-text-indent": String(indent),
                    // In the first run's size (firstLineCharsUnitDecorations).
                    style: `text-indent: calc(${indent} * var(--docs-first-run-font-size, 1em))`,
                  }
                : { "data-text-indent": String(indent) };
            },
          },
          // Precise LEFT/RIGHT indents in POINTS (Word/WPS 段落 dialog). Stored
          // and rendered separately from the coarse `indent` LEVEL so the dialog
          // can express an exact margin (and a hanging indent, below). They render
          // to inline `margin-left`/`margin-right` (pt) and export to OOXML
          // `<w:ind w:left/right>` (twips). `0`/absent renders nothing → an
          // untouched paragraph stays byte-for-byte unchanged.
          // NOTE on hanging indents + CSS: `indentLeftPt` owns `margin-left` and
          // `firstLineIndentPt` owns `text-indent`. They render DISTINCT CSS
          // properties so TipTap's style-merge never produces a conflicting
          // duplicate `margin-left`. `indentLeftPt` is Word's `w:ind@left`: where
          // the paragraph's body lines start. A hanging indent is
          // `text-indent: -Xpt` alone — the first line starts X to the left of
          
          // same size used to push the body right instead).
          indentLeftPt: {
            default: null,
            // The CSS fallback reads the LEADING edge: a right-to-left
            // paragraph renders its left indent as `margin-right` (below), so
            // reading `margin-left` there would take the RIGHT indent's value
            
            // 1"/1").
            parseHTML: (element) =>
              element.getAttribute("data-indent-left-pt") === "0"
                ? 0
                : normalizeSideIndentPt(
                    element.getAttribute("data-indent-left-pt") ||
                      (normalizeDir(element.getAttribute("dir")) === "rtl"
                        ? element.style.marginRight
                        : element.style.marginLeft),
                  ),
            renderHTML: (attrs) => {
              const pt = normalizeSideIndentPt(attrs.indentLeftPt);
              // An explicit 0 is the paragraph's own "no indent" against the
              // document's default one (an imported Word paragraph whose
              // w:ind sets 0, or whose style does not take Normal's): stated,
              // so the `[data-doc-default-indent]` rule passes it by.
              if (!pt) return attrs.indentLeftPt === 0 ? { "data-indent-left-pt": "0" } : {};
              // `w:ind@left` is the LEADING edge (ECMA-376 17.3.1.12 spells it
              // `start` in the strict namespace), so a right-to-left paragraph
              // (`w:bidi`, 17.3.1.6) indents from the RIGHT. The var keeps
              // naming the source value; only the physical side mirrors.
              const rtl = normalizeDir(attrs.dir) === "rtl";
              return {
                "data-indent-left-pt": String(pt),
                style: `--doc-paragraph-indent-left: ${pt}pt; ${
                  rtl ? "margin-right" : "margin-left"
                }: ${pt}pt`,
              };
            },
          },
          indentRightPt: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-indent-right-pt") === "0"
                ? 0
                : normalizeSideIndentPt(
                    element.getAttribute("data-indent-right-pt") ||
                      (normalizeDir(element.getAttribute("dir")) === "rtl"
                        ? element.style.marginLeft
                        : element.style.marginRight),
                  ),
            renderHTML: (attrs) => {
              const pt = normalizeSideIndentPt(attrs.indentRightPt);
              if (!pt) return attrs.indentRightPt === 0 ? { "data-indent-right-pt": "0" } : {};
              // `w:ind@right` is the TRAILING edge (`end`), mirrored under
              // `w:bidi` exactly as the leading one is.
              const rtl = normalizeDir(attrs.dir) === "rtl";
              return {
                "data-indent-right-pt": String(pt),
                style: `--doc-paragraph-indent-right: ${pt}pt; ${
                  rtl ? "margin-left" : "margin-right"
                }: ${pt}pt`,
              };
            },
          },
          // Precise FIRST-LINE indent in POINTS, SIGNED: positive = first-line
          // indent, negative = HANGING indent (悬挂缩进 — the first line starts to
          // the left of the body, used by references / definitions). Renders to
          // CSS `text-indent` (pt), which resolves against the inline direction
          // so a hanging first line moves toward the leading edge under RTL too.
          // Exports to OOXML `<w:ind w:firstLine>` / `<w:ind w:hanging>`.
          // Absent renders nothing; an explicit `0` only states itself (no
          // first line of its own against the document's default one).
          firstLineIndentPt: {
            default: null,
            parseHTML: (element) => {
              const stated = element.getAttribute("data-first-line-indent-pt");
              if (stated === "0") return 0;
              return stated || element.getAttribute("data-text-indent")
                ? normalizeFirstLineIndentPt(stated)
                : normalizeFirstLineIndentPt(cssAbsoluteLengthPt(element.style.textIndent));
            },
            renderHTML: (attrs) => {
              const pt = normalizeFirstLineIndentPt(attrs.firstLineIndentPt);
              if (!pt) {
                return attrs.firstLineIndentPt === 0 ? { "data-first-line-indent-pt": "0" } : {};
              }
              return paragraphAttributeShows("firstLineIndentPt", attrs)
                ? { "data-first-line-indent-pt": String(pt), style: `text-indent: ${pt}pt` }
                : { "data-first-line-indent-pt": String(pt) };
            },
          },
          // Which left / right / hanging indents were stated in characters
          // (Word's w:leftChars / w:rightChars / w:hangingChars, 字符), with
          // the points each drew. Geometry stays the points above; this keeps
          // the unit for the Paragraph dialog and the DOCX export, and reads
          // as absent once the points it recorded have changed.
          indentCharacterUnits: {
            default: null,
            parseHTML: (element) =>
              normalizeIndentCharacterUnits(
                element.getAttribute("data-indent-character-units"),
              ),
            renderHTML: (attrs) => {
              const units = normalizeIndentCharacterUnits(
                attrs.indentCharacterUnits,
              );
              return units
                ? { "data-indent-character-units": JSON.stringify(units) }
                : {};
            },
          },
          borderPreset: {
            default: null,
            parseHTML: (element) =>
              normalizeBorderPreset(element.getAttribute("data-border-preset")),
            renderHTML: (attrs) => {
              const preset = normalizeBorderPreset(attrs.borderPreset);
              return preset &&
                !normalizeDocumentParagraphBorders(attrs.paragraphBorders)
                ? {
                    "data-border-preset": preset,
                    style: borderPresetStyle(preset),
                  }
                : {};
            },
          },
          paragraphBorders: {
            default: null,
            parseHTML: (element) =>
              parseDocumentParagraphBordersAttribute(
                element.getAttribute("data-paragraph-borders"),
              ),
            renderHTML: (attrs) =>
              documentParagraphBordersHtmlAttributes(attrs.paragraphBorders, {
                externalLeft: !normalizeFirstLineIndentPt(attrs.firstLineIndentPt) &&
                  !normalizeTextIndent(attrs.textIndent) && attrs.contextualSpacing !== true,
                spaceAfterPt: paragraphAttributeShows("spaceAfter", attrs) ? normalizeSpacing(attrs.spaceAfter) : null,
                rtl: normalizeDir(attrs.dir) === "rtl",
                edgeOnFragment: (edge) => paragraphBorderEdgeOnFragment(edge, attrs),
              }),
          },
          shadingColor: {
            default: null,
            parseHTML: (element) =>
              normalizeShadingColor(
                element.getAttribute("data-shading-color") ||
                  element.style.backgroundColor,
              ),
            renderHTML: (attrs) => {
              const color = normalizeShadingColor(attrs.shadingColor);
              return color
                ? {
                    "data-shading-color": color,
                    style: `background-color: ${color}`,
                    // Word's Automatic text colour contrasts with the
                    // paragraph's shading (wordAutoTextColor).
                    ...wordAutoTextAttributes(color),
                  }
                : {};
            },
          },
          // Pagination flags (Word 换行和分页). Pure data attributes — they have
          // no on-screen CSS (Word applies them only at print/page-break time),
          // but they round-trip through the editor and export to OOXML keepNext /
          // keepLines / widowControl. Null inherits; explicit false survives
          // DOM and native-package round trips.
          keepNext: {
            default: null,
            parseHTML: (element) => normalizeParagraphOnOff(element.getAttribute("data-keep-next")),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.keepNext);
              return value === null ? {} : { "data-keep-next": String(value) };
            },
          },
          keepLines: {
            default: null,
            parseHTML: (element) => normalizeParagraphOnOff(element.getAttribute("data-keep-lines")),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.keepLines);
              return value === null ? {} : { "data-keep-lines": String(value) };
            },
          },
          widowControl: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-widow-control"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.widowControl);
              return value === null
                ? {}
                : { "data-widow-control": String(value) };
            },
          },
          // Word's "Don't add space between paragraphs of the same style".
          // Null inherits: on for an authored list paragraph (List Paragraph),
          // off elsewhere (listParagraphSpacing.ts); an explicit false turns
          // a list paragraph's inherited spacing off, as w:val="0" does.
          contextualSpacing: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-contextual-spacing"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.contextualSpacing);
              return value === null
                ? {}
                : { "data-contextual-spacing": String(value) };
            },
          },
          suppressLineNumbers: {
            default: false,
            parseHTML: (element) =>
              normalizePaginationFlag(
                element.getAttribute("data-suppress-line-numbers"),
              ),
            renderHTML: (attrs) =>
              normalizePaginationFlag(attrs.suppressLineNumbers)
                ? { "data-suppress-line-numbers": "true" }
                : {},
          },
          suppressAutoHyphens: {
            default: false,
            parseHTML: (element) =>
              normalizePaginationFlag(
                element.getAttribute("data-suppress-auto-hyphens"),
              ),
            renderHTML: (attrs) =>
              normalizePaginationFlag(attrs.suppressAutoHyphens)
                ? {
                    "data-suppress-auto-hyphens": "true",
                    style: "hyphens: none",
                  }
                : {},
          },
          snapToGrid: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-snap-to-grid"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.snapToGrid);
              return value === null
                ? {}
                : { "data-snap-to-grid": String(value) };
            },
          },
          wordWrap: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(element.getAttribute("data-word-wrap")),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.wordWrap);
              return value === null
                ? {}
                : {
                    "data-word-wrap": String(value),
                    // Word's "Allow Latin text to wrap in the middle of a
                    // word" (w:wordWrap off): a word that does not fit the
                    // rest of the line is cut there, not moved down whole.
                    // overflow-wrap alone breaks only a word longer than a
                    // whole line, so a word that would fit the next line was
                    // still moved there (WUA 113).
                    ...(value === false
                      ? { style: "overflow-wrap: anywhere; word-break: break-all" }
                      : {}),
                  };
            },
          },
          kinsoku: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(element.getAttribute("data-kinsoku")),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.kinsoku);
              return value === null
                ? {}
                : {
                    "data-kinsoku": String(value),
                    // Word's standard list unless the document asks for
                    // its strict rules (note-editor.css). Off, Latin words
                    // still wrap between words: only the East Asian runs
                    // break anywhere (`eastAsianRunRanges`, decorated).
                    style: `line-break: ${value ? "var(--doc-kinsoku-line-break, normal)" : "normal"}`,
                  };
            },
          },
          overflowPunct: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-overflow-punctuation"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.overflowPunct);
              return value === null
                ? {}
                : {
                    "data-overflow-punctuation": String(value),
                    style: `hanging-punctuation: ${value ? "allow-end" : "none"}`,
                  };
            },
          },
          topLinePunct: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-top-line-punctuation"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.topLinePunct);
              return value === null
                ? {}
                : {
                    "data-top-line-punctuation": String(value),
                    ...(value
                      ? { style: "text-spacing-trim: trim-start" }
                      : {}),
                  };
            },
          },
          textAlignment: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphTextAlignment(
                element.getAttribute("data-text-alignment"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphTextAlignment(
                attrs.textAlignment,
              );
              return value === null ? {} : { "data-text-alignment": value };
            },
          },
          adjustRightInd: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-adjust-right-indent"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.adjustRightInd);
              return value === null
                ? {}
                : { "data-adjust-right-indent": String(value) };
            },
          },
          mirrorIndents: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-mirror-indents"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.mirrorIndents);
              return value === null
                ? {}
                : { "data-mirror-indents": String(value) };
            },
          },
          autoSpaceDE: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-auto-space-de"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.autoSpaceDE);
              return value === null
                ? {}
                : { "data-auto-space-de": String(value) };
            },
          },
          autoSpaceDN: {
            default: null,
            parseHTML: (element) =>
              normalizeParagraphOnOff(
                element.getAttribute("data-auto-space-dn"),
              ),
            renderHTML: (attrs) => {
              const value = normalizeParagraphOnOff(attrs.autoSpaceDN);
              return value === null
                ? {}
                : { "data-auto-space-dn": String(value) };
            },
          },
          // Drop cap (首字下沉). A pure data attribute — the enlargement /
          // multi-line float is done entirely in CSS off `data-drop-cap`
          // (note-editor.css ::first-letter rule), so only the whitelisted
          // "dropped" value is ever emitted and an untouched paragraph stays
          // attribute-free (no round-trip drift). Exports to OOXML framePr.
          dropCap: {
            default: null,
            parseHTML: (element) =>
              normalizeDropCap(element.getAttribute("data-drop-cap")),
            renderHTML: (attrs) => {
              const mode = normalizeDropCap(attrs.dropCap);
              if (!mode) return {};
              // A Word cap frame the page keeps as its own paragraph (one
              // holding a word, corpus R73-D03 "Lliquam"): the WHOLE frame is
              // the cap, floated beside the next paragraph's first lines,
              // not its first letter (note-editor.css).
              const source = attrs.source as
                | { dropCapFrame?: unknown; dropCapLowerPt?: unknown }
                | null
                | undefined;
              if (!source || typeof source !== "object" || source.dropCapFrame !== 1) {
                return { "data-drop-cap": mode };
              }
              // The frame runs' own w:position: Word sets the frame's glyphs
              // that far down (or up) inside it.
              const lower = source.dropCapLowerPt;
              return typeof lower === "number" && Number.isFinite(lower) && lower !== 0 && Math.abs(lower) <= 1584
                ? {
                    "data-drop-cap": mode,
                    "data-drop-cap-frame": "true",
                    style: `--drop-cap-frame-lower: ${lower}pt`,
                  }
                : { "data-drop-cap": mode, "data-drop-cap-frame": "true" };
            },
          },
          // Insert > Drop Cap > Options (w:framePr w:lines / w:dropCap /
          // w:hSpace): Lines to drop (null = Word's 3), In margin, and the
          // Distance from text in points. Drawn by the ::first-letter rule in
          // note-editor.css through custom properties.
          dropCapLines: {
            default: null,
            parseHTML: (element) =>
              normalizeDropCapLines(element.getAttribute("data-drop-cap-lines")),
            renderHTML: (attrs) => {
              const lines = normalizeDropCap(attrs.dropCap)
                ? normalizeDropCapLines(attrs.dropCapLines)
                : null;
              return lines
                ? { "data-drop-cap-lines": String(lines), style: `--drop-cap-lines: ${lines}` }
                : {};
            },
          },
          dropCapPosition: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-drop-cap-position") === "margin" ? "margin" : null,
            renderHTML: (attrs) =>
              normalizeDropCap(attrs.dropCap) && attrs.dropCapPosition === "margin"
                ? { "data-drop-cap-position": "margin" }
                : {},
          },
          dropCapDistancePt: {
            default: null,
            parseHTML: (element) =>
              normalizeDropCapDistancePt(element.getAttribute("data-drop-cap-distance")),
            renderHTML: (attrs) => {
              const distance = normalizeDropCap(attrs.dropCap)
                ? normalizeDropCapDistancePt(attrs.dropCapDistancePt)
                : null;
              return distance
                ? {
                    "data-drop-cap-distance": String(distance),
                    style: `--drop-cap-distance: ${distance}pt`,
                  }
                : {};
            },
          },
          // The built-in gallery paragraph style the paragraph wears (Title,
          // Subtitle, Quote, No Spacing, ...). The gallery writes direct
          // formatting, so without this two Title/Normal neighbours had the
          // same (default) style identity and "Don't add space between
          
          // carry their identity in the node type; Normal is the absence.
          builtinStyleId: {
            default: null,
            parseHTML: (element) =>
              normalizeBuiltinParagraphStyleId(
                element.getAttribute("data-builtin-style"),
              ),
            renderHTML: (attrs) => {
              const id = normalizeBuiltinParagraphStyleId(attrs.builtinStyleId);
              return id ? { "data-builtin-style": id } : {};
            },
          },
          // Per-paragraph tab stops (Word/WPS 制表位). Stored as the NORMALIZED
          // model (sorted, de-duped, clamped); the attribute is the parsed
          // array, serialized into `data-tab-stops` (compact JSON) on render so
          // it survives an HTML round-trip. A paragraph with no stops keeps the
          // attribute ABSENT (null) so it stays byte-for-byte unchanged.
          //
          // RENDERING (best-effort, honest scope): the data model and DOCX
          // export carry every stop's position + alignment + leader exactly, so
          // a Tab character lands on the correct stop with the right alignment
          // when the document is opened in Word/WPS. In the contenteditable
          // canvas we set CSS `tab-size` to the FIRST stop's distance from the
          // line start (a LEFT-tab approximation), which is the robust subset
          // the browser can honor without a fragile per-Tab measurement plugin.
          // Center / right / decimal alignment and per-stop spacing beyond the
          // first stop render exactly only in exported Word — see the field
          // comment in the report. This never alters typing, selection, or undo.
          tabStops: {
            default: null,
            parseHTML: (element) =>
              normalizeTabStops(element.getAttribute("data-tab-stops")),
            renderHTML: (attrs) => {
              const serialized = serializeTabStops(attrs.tabStops);
              if (!serialized) return {};
              const stops = normalizeTabStops(attrs.tabStops) as TabStop[];
              // First real stop's px distance from line start drives the
              // browser's tab-size (a uniform LEFT-tab width). Word's exact
              // per-stop / aligned rendering lives in the export, not the
              // canvas. A bar tab is no stop at all: tabs pass it by.
              const firstStop = stops.find((stop) => stop.align !== "bar");
              const firstPx = firstStop ? twipsToPx(firstStop.pos) : 0;
              const declarations: string[] = [];
              if (firstPx > 0) declarations.push(`tab-size: ${firstPx}px`);
              // Word's Bar tab: a vertical rule through every line of the
              // paragraph at the stop's position, measured from the margin
              // on the paragraph's LEADING edge (the paragraph box starts at
              // its leading indent). A right-to-left paragraph (`w:bidi`)
              // measures every tab position from the RIGHT (ECMA-376
              // 17.3.1.37 `w:tab@pos` is relative to the leading edge), so
              // the rule is placed from the box's right edge there; anchored
              // left it stayed where the LTR paragraph drew it (WUA 245).
              // `calc(100% - x)` is the mirror of `x` for the 1px image
              // (its right edge lands x from the box's right edge).
              const barFromRight = normalizeDir(attrs.dir) === "rtl";
              const indentPx =
                ((normalizeSideIndentPt(attrs.indentLeftPt) ?? 0) * 96) / 72;
              const bars = stops
                .filter((stop) => stop.align === "bar")
                .map((stop) => Math.round((twipsToPx(stop.pos) - indentPx) * 100) / 100)
                .filter((x) => x >= 0);
              if (bars.length > 0) {
                declarations.push(
                  `background-image: ${bars.map(() => "linear-gradient(currentColor, currentColor)").join(", ")}`,
                  `background-size: ${bars.map(() => "1px 100%").join(", ")}`,
                  `background-position: ${bars
                    .map((x) => (barFromRight ? `calc(100% - ${x}px) 0` : `${x}px 0`))
                    .join(", ")}`,
                  "background-repeat: no-repeat",
                  "background-origin: border-box",
                );
              }
              return declarations.length > 0
                ? {
                    "data-tab-stops": serialized,
                    ...(bars.length > 0 ? { "data-bar-tabs": String(bars.length) } : {}),
                    style: declarations.join("; "),
                  }
                : { "data-tab-stops": serialized };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const textBlockTypes = new Set(this.options.types as string[]);

    const updateSelectedTextBlocks =
      (
        updateAttrs: (
          attrs: Record<string, unknown>,
          nodeType?: string,
        ) => Record<string, unknown>,
        includeFlowObjects = false,
      ) =>
      ({ editor, state, dispatch }: CommandProps) => {
        if (!editor.isEditable) return false;
        const { selection } = state;
        const positions = new Map<number, {attrs: Record<string, unknown>; type: string}>();
        const applicableTypes = includeFlowObjects
          ? new Set([...textBlockTypes, ...FLOW_OBJECT_TYPES])
          : textBlockTypes;

        // Every range of the selection: a block of selected table cells is
        // one range per cell, and `from`/`to` name the head cell only
        
        for (const range of selection.ranges) {
          state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
            if (applicableTypes.has(node.type.name)) {
              positions.set(pos, {attrs: node.attrs as Record<string, unknown>, type: node.type.name});
            }
          });
        }

        if (selection.empty) {
          for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
            const node = selection.$from.node(depth);
            if (applicableTypes.has(node.type.name)) {
              positions.set(
                selection.$from.before(depth),
                {attrs: node.attrs as Record<string, unknown>, type: node.type.name},
              );
              break;
            }
          }
        }
        addSplitParagraphFragments(state.doc, positions);

        if (positions.size === 0) {
          return false;
        }

        if (!dispatch) {
          return true;
        }

        let tr = state.tr;
        let changed = false;

        positions.forEach(({attrs: currentAttrs, type}, pos) => {
          const nextAttrs = updateAttrs({ ...currentAttrs }, type);
          const changedAttrs = Object.keys(nextAttrs).some(
            (key) => nextAttrs[key] !== currentAttrs[key],
          );
          if (!changedAttrs) return;
          tr = tr.setNodeMarkup(pos, undefined, nextAttrs);
          changed = true;
        });

        if (changed) {
          dispatch(tr.scrollIntoView());
        }

        // A valid target already at the requested value is a successful
        // no-op. Multi-option dialogs must not report failure merely because
        // another option in the same atomic chain was unchanged.
        return true;
      };

    return {
      setTextAlign: (align) => {
        const normalized = normalizeTextAlign(align);
        if (!normalized) return () => false;
        const defaultAlign =
          normalizeTextAlign(this.editor.state.doc.attrs.defaultTextAlign) ??
          "left";
        return updateSelectedTextBlocks((attrs, type) => {
          if (FLOW_OBJECT_TYPES.has(type ?? "")) {
            // A single object cannot stretch its contents to justify a line.
            // Store left explicitly: an equation's or a video's unset default
            // is centred.
            const value = normalized === "center" || normalized === "right" ? normalized : "left";
            return {...attrs, textAlign: value};
          }
          // The document default is dropped as redundant, except in a
          // right-to-left paragraph: there an unset alignment paints at the
          
          return {
            ...attrs,
            textAlign:
              normalized === defaultAlign && attrs.dir !== "rtl" ? null : normalized,
          };
        }, true);
      },
      unsetTextAlign: () =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          textAlign: null,
        })),
      setTextDirection: (dir) => {
        const normalized = normalizeDir(dir);
        if (!normalized) return () => false;
        return updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          // Store the default (ltr) as null so the attribute stays absent on
          // left-to-right blocks (matching the global-attribute renderHTML).
          dir: normalized === DEFAULT_TEXT_DIRECTION ? null : normalized,
        }));
      },
      toggleTextDirection: () =>
        updateSelectedTextBlocks((attrs) => {
          const current = normalizeDir(attrs.dir) ?? DEFAULT_TEXT_DIRECTION;
          const next = current === "rtl" ? "ltr" : "rtl";
          return {
            ...attrs,
            dir: next === DEFAULT_TEXT_DIRECTION ? null : next,
          };
        }),
      setIndent: (level) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          indent: normalizeIndent(level),
        })),
      // Home's Increase/Decrease Indent step a paragraph that has a precise
      // left indent (Layout, the Paragraph dialog, an import) by Word's
      // default tab stop, 0.5 in; the Tab level is the paragraph's only when
      // it has no precise indent. Stepping the level under a precise indent
      // moved nothing, and Outdent read the level's 0 as "already minimum"
      
      increaseIndent: () => (props) =>
        updateSelectedTextBlocks((attrs) => {
          // An unstated paragraph draws the document's default indent
          // (Normal's, mirrored on the doc); it steps from there.
          const precise =
            normalizeIndentPt(attrs.indentLeftPt) ??
            (attrs.indentLeftPt === 0 ? null : documentDefaultIndent(props, "defaultIndentLeftPt"));
          // A paragraph with no indent of either kind takes Word's step as
          // a precise indent too: Increase Indent and Tab move it 0.5 in, as
          // Word does, where the level moved it 18 px.
          if (precise !== null || normalizeIndent(attrs.indent) === 0) {
            return { ...attrs, indentLeftPt: (precise ?? 0) + INDENT_STEP_PT };
          }
          return { ...attrs, indent: normalizeIndent(normalizeIndent(attrs.indent) + 1) };
        })(props),
      decreaseIndent: () => (props) =>
        updateSelectedTextBlocks((attrs) => {
          const fallback = documentDefaultIndent(props, "defaultIndentLeftPt");
          const precise =
            normalizeIndentPt(attrs.indentLeftPt) ?? (attrs.indentLeftPt === 0 ? null : fallback);
          if (precise !== null) {
            const next = precise - INDENT_STEP_PT;
            // At the margin against a default indent: Word's own w:left="0".
            return { ...attrs, indentLeftPt: next > 0 ? next : fallback !== null ? 0 : null };
          }
          return { ...attrs, indent: normalizeIndent(normalizeIndent(attrs.indent) - 1) };
        })(props),
      setIndentLeftPt: (value) => (props) =>
        updateSelectedTextBlocks((attrs) =>
          withIndentLevelOfLeft({
            ...attrs,
            indentLeftPt: statedIndentPt(value, documentDefaultIndent(props, "defaultIndentLeftPt"), false, true),
          }),
        )(props),
      setIndentRightPt: (value) => (props) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          indentRightPt: statedIndentPt(value, documentDefaultIndent(props, "defaultIndentRightPt"), false, true),
        }))(props),
      setFirstLineIndentPt: (value) => (props) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          firstLineIndentPt: statedIndentPt(
            value,
            documentDefaultIndent(props, "defaultFirstLineIndentPt"),
            true,
          ),
          // One first line, two spellings: the points value replaces the
          // older indent in characters, which otherwise came back the moment
          
          textIndent: null,
        }))(props),
      setParagraphIndents: (value) =>
        updateSelectedTextBlocks((attrs) => withIndentLevelOfLeft({
          ...attrs,
          indentLeftPt: sideIndentPt(value?.indentLeftPt),
          indentRightPt: sideIndentPt(value?.indentRightPt),
          firstLineIndentPt: normalizeFirstLineIndentPt(
            value?.firstLineIndentPt,
          ),
          ...(value?.indent === undefined
            ? {}
            : { indent: normalizeIndent(value.indent) }),
          ...(value?.textIndent === undefined ? {} : { textIndent: null }),
        }, value?.indent !== undefined)),
      setLineHeight: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          lineHeight: normalizeLineHeight(value),
          lineHeightPt: null,
          lineHeightRule: null,
        })),
      setAbsoluteLineHeight: (value, rule) => {
        const points = normalizeLineHeightPt(value);
        const normalizedRule = normalizeLineHeightRule(rule);
        if (points === null || normalizedRule === null) return () => false;
        return updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          lineHeight: null,
          lineHeightPt: points,
          lineHeightRule: normalizedRule,
        }));
      },
      unsetLineHeight: () =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          lineHeight: null,
          lineHeightPt: null,
          lineHeightRule: null,
        })),
      // An explicit 0 is Word's w:spacing w:after="0": no space. Only null
      // clears the direct value back to the inherited one. Turning 0 into
      // null put the document default (12px) back under a field reading 0,
      
      setSpaceBefore: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          spaceBefore: normalizeSpacing(value),
        })),
      setSpaceAfter: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          spaceAfter: normalizeSpacing(value),
        })),
      setTextIndent: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          textIndent: normalizeTextIndent(value),
        })),
      setIndentCharacterUnits: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          indentCharacterUnits: normalizeIndentCharacterUnits(value),
        })),
      setParagraphBorder: (preset) =>
        updateSelectedTextBlocks((attrs) => {
          const normalized = normalizeBorderPreset(preset);
          return {
            ...attrs,
            borderPreset: normalized,
            paragraphBorders: normalized
              ? paragraphBordersFromLegacyPreset(normalized)
              : null,
          };
        }),
      setParagraphBorders: (borders) =>
        updateSelectedTextBlocks((attrs) => {
          const normalized = normalizeDocumentParagraphBorders(borders);
          return {
            ...attrs,
            paragraphBorders: normalized,
            borderPreset: legacyPresetFromParagraphBorders(normalized),
          };
        }),
      setParagraphShading: (color) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          shadingColor: normalizeShadingColor(color),
        })),
      setDropCap: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          dropCap: normalizeDropCap(value),
          // Turning the cap off forgets its options, as Word's None does.
          ...(normalizeDropCap(value)
            ? {}
            : { dropCapLines: null, dropCapPosition: null, dropCapDistancePt: null }),
        })),
      setDropCapOptions: (options) =>
        updateSelectedTextBlocks((attrs, type) => {
          // Word draws a drop cap only on a body paragraph (a heading's
          // first letter keeps its own size, as the stylesheet rule says).
          if (type !== "paragraph" || options.position === null) {
            return {
              ...attrs,
              dropCap: null,
              dropCapLines: null,
              dropCapPosition: null,
              dropCapDistancePt: null,
            };
          }
          return {
            ...attrs,
            dropCap: "dropped",
            dropCapPosition: options.position === "margin" ? "margin" : null,
            dropCapLines:
              options.lines === undefined
                ? normalizeDropCapLines(attrs.dropCapLines)
                : normalizeDropCapLines(options.lines),
            dropCapDistancePt:
              options.distancePt === undefined
                ? normalizeDropCapDistancePt(attrs.dropCapDistancePt)
                : normalizeDropCapDistancePt(options.distancePt),
          };
        }),
      setTabStops: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          // normalizeTabStops returns null for an empty/invalid set, which
          // clears the attribute — so passing [] or null removes all stops.
          tabStops: normalizeTabStops(value),
        })),
      setKeepNext: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          keepNext: normalizeParagraphOnOff(value),
        })),
      setKeepLines: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          keepLines: normalizeParagraphOnOff(value),
        })),
      setWidowControl: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          widowControl: normalizeParagraphOnOff(value),
        })),
      setContextualSpacing: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          contextualSpacing: normalizeParagraphOnOff(value),
        })),
      setSuppressLineNumbers: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          suppressLineNumbers: normalizePaginationFlag(value),
        })),
      setSuppressAutoHyphens: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          suppressAutoHyphens: normalizePaginationFlag(value),
        })),
      setSnapToGrid: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          snapToGrid: normalizeParagraphOnOff(value),
        })),
      setWordWrap: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          wordWrap: normalizeParagraphOnOff(value),
        })),
      setKinsoku: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          kinsoku: normalizeParagraphOnOff(value),
        })),
      setOverflowPunctuation: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          overflowPunct: normalizeParagraphOnOff(value),
        })),
      setTopLinePunctuation: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          topLinePunct: normalizeParagraphOnOff(value),
        })),
      setParagraphTextAlignment: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          textAlignment: normalizeParagraphTextAlignment(value),
        })),
      setAdjustRightIndent: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          adjustRightInd: normalizeParagraphOnOff(value),
        })),
      setMirrorIndents: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          mirrorIndents: normalizeParagraphOnOff(value),
        })),
      setAutoSpaceDE: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          autoSpaceDE: normalizeParagraphOnOff(value),
        })),
      setAutoSpaceDN: (value) =>
        updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          autoSpaceDN: normalizeParagraphOnOff(value),
        })),
      setPageBreakBefore:
        (value) =>
        ({ editor, state, dispatch }: CommandProps) => {
          if (!editor.isEditable) return false;
          const { selection } = state;
          const positions = new Set<number>();
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (!textBlockTypes.has(node.type.name)) return;
            const $pos = state.doc.resolve(pos);
            if ($pos.parent.type.name === "pageBlock") positions.add(pos);
          });
          if (selection.empty) {
            for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
              const node = selection.$from.node(depth);
              if (!textBlockTypes.has(node.type.name)) continue;
              const pos = selection.$from.before(depth);
              if (state.doc.resolve(pos).parent.type.name === "pageBlock") {
                positions.add(pos);
              }
              break;
            }
          }
          const pageBreakType = state.schema.nodes.pageBreak;
          if (positions.size === 0 || !pageBreakType) return false;
          if (!dispatch) return true;

          let tr = state.tr;
          let changed = false;
          for (const pos of [...positions].sort((a, b) => b - a)) {
            // The break the paragraph opens with may sit on the page before:
            // pagination moves the paragraph to the next sheet and leaves the
            
            // blank page per repeat).
            const previous = blockBeforeAcrossSheets(state.doc, pos);
            const hasPageBreak = previous?.node.type === pageBreakType;
            if (value && !hasPageBreak) {
              tr = tr.insert(pos, pageBreakType.create());
              changed = true;
            } else if (!value && hasPageBreak && previous) {
              const $previous = state.doc.resolve(previous.pos);
              if ($previous.parent.type.name === "pageBlock" && $previous.parent.childCount === 1) {
                const sheetPos = $previous.before();
                tr = tr.delete(sheetPos, sheetPos + $previous.parent.nodeSize);
              } else {
                tr = tr.delete(previous.pos, previous.pos + previous.node.nodeSize);
              }
              changed = true;
            }
          }
          if (changed) dispatch(tr.scrollIntoView());
          return true;
        },
      setTocOutlineLevel: (value) => {
        const normalized = normalizeTocOutlineLevel(value);
        if (normalized === null) return () => false;
        return updateSelectedTextBlocks((attrs) => ({
          ...attrs,
          [TOC_OUTLINE_LEVEL_ATTR]: normalized,
        }));
      },
    };
  },

  addKeyboardShortcuts() {
    const canIndentCurrentBlock = () =>
      !this.editor.isActive("codeBlock") &&
      !this.editor.isActive("table") &&
      !this.editor.isActive("bulletList") &&
      !this.editor.isActive("orderedList") &&
      !this.editor.isActive("taskList");

    // Alignment is Word's Ctrl/⌘+L, E, R, J (wordEditorShortcuts.ts); ⌘⇧E is
    // Word's Track Changes, not Center.
    return {
      Tab: () => {
        if (!canIndentCurrentBlock()) return false;
        const { state, view } = this.editor;
        const action = tabKeyAction(state, {
          startsLaterLine: () => caretStartsLaterLine(view),
          firstLineIndented: () => caretBlockFirstLineIndented(view),
        });
        if (action === "firstLineIndent") {
          return this.editor.commands.setFirstLineIndentPt(defaultTabStopPt(view));
        }
        if (action === "leftIndent") return this.editor.commands.increaseIndent();
        return this.editor.commands.command(({ tr }) => {
          tr.insertText("\t").scrollIntoView();
          return true;
        });
      },
      "Shift-Tab": () => {
        if (!canIndentCurrentBlock()) return false;
        const { selection } = this.editor.state;
        const block = selection.$from.parent;
        if (
          selection.empty &&
          block.isTextblock &&
          !blockHasLeftIndent(block.attrs) &&
          blockHasFirstLineIndent(block.attrs)
        ) {
          return this.editor.commands.setFirstLineIndentPt(null);
        }
        return this.editor.commands.decreaseIndent();
      },
    };
  },

  addExtensions() {
    return [DocumentIndentBackspace];
  },
});

/**
 * Word's Tab in body text ("Set left- and first-indent with tabs and
 * backspaces", on by default; Microsoft's own description of the option):
 *  - the caret before the FIRST line of a paragraph that has text: the first
 *    line is indented to the next default tab stop; when the first line is
 *    indented already, the whole paragraph is (its left indent grows);
 *  - the caret before any OTHER line of the paragraph, a whole paragraph
 *    selected, or a selection over several paragraphs: the whole paragraph is
 *    indented;
 *  - anywhere else, and in a paragraph with nothing in it: a tab character,
 *    typed over a selection inside one paragraph.
 * The tail of a paragraph the page edge cut does not start a paragraph: a
 * tab is typed there.
 */
export type TabKeyAction = "firstLineIndent" | "leftIndent" | "tab";

export function tabKeyAction(
  state: EditorState,
  caret: {
    /** The caret stands before a line of its paragraph other than the first. */
    startsLaterLine: () => boolean;
    /** The caret's paragraph draws its first line indented (or hanging). */
    firstLineIndented: () => boolean;
  },
): TabKeyAction {
  const { $from, $to, empty } = state.selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return "leftIndent";
  const block = $from.parent;
  if (!empty) {
    return block.content.size > 0 && $from.parentOffset === 0 && $to.parentOffset === block.content.size
      ? "leftIndent"
      : "tab";
  }
  if (block.content.size === 0) return "tab";
  if ($from.parentOffset === 0) {
    if (!fragmentCarries("paragraphStart", block.attrs)) return "tab";
    return blockHasFirstLineIndent(block.attrs) || caret.firstLineIndented()
      ? "leftIndent"
      : "firstLineIndent";
  }
  return caret.startsLaterLine() ? "leftIndent" : "tab";
}

function blockHasLeftIndent(attrs: Record<string, unknown>): boolean {
  return normalizeIndent(attrs.indent) > 0 || normalizeIndentPt(attrs.indentLeftPt) !== null;
}

/** A first-line indent the paragraph states itself, in points or characters
 * (a hanging indent is one too: its first line is already set). */
function blockHasFirstLineIndent(attrs: Record<string, unknown>): boolean {
  return (
    normalizeFirstLineIndentPt(attrs.firstLineIndentPt) !== null ||
    normalizeTextIndent(attrs.textIndent) !== null
  );
}

/** The first line as drawn: a style's first-line indent is not on the block. */
function caretBlockFirstLineIndented(view: EditorView): boolean {
  const { $from } = view.state.selection;
  if ($from.depth < 1) return false;
  const dom = view.nodeDOM($from.before());
  const win = view.dom.ownerDocument.defaultView;
  if (!(dom instanceof HTMLElement) || !win) return false;
  const indent = Number.parseFloat(win.getComputedStyle(dom).textIndent);
  return Number.isFinite(indent) && Math.abs(indent) > 0.5;
}

/**
 * Whether the caret stands before a line of its paragraph that is not the
 * first: after a manual line break, or where the paragraph wraps. A wrap
 * point is both the end of one line and the start of the next, and the
 * browser shows the caret at one of them (End leaves it at the end, Home and
 * a click on the line's first character at the start), so it is asked.
 */
function caretStartsLaterLine(view: EditorView): boolean {
  const { $from } = view.state.selection;
  if ($from.parentOffset === 0 || $from.parentOffset >= $from.parent.content.size) return false;
  if ($from.nodeBefore?.type.name === "hardBreak") return true;
  try {
    // Where the character before the caret starts and where the one after
    // it ends: on two lines at a wrap point. (The wrap point itself is not
    // asked for: WebKit answers with the end of the upper line for both of
    // its sides.)
    const before = view.coordsAtPos($from.pos - 1, 1);
    const after = view.coordsAtPos($from.pos + 1, -1);
    // Nothing laid out (a view without layout), or both on one line.
    if (before.bottom - before.top <= 0 || after.top < before.bottom - 1) return false;
  } catch {
    return false;
  }
  return !caretShownAtLineEnd(view);
}

function caretShownAtLineEnd(view: EditorView): boolean {
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection || !selection.isCollapsed || typeof selection.modify !== "function") return false;
  const { anchorNode, anchorOffset } = selection;
  if (!anchorNode || !view.dom.contains(anchorNode)) return false;
  try {
    // From the start of a line this goes nowhere; from the end of one it
    // takes the line. Put back at once: nothing reads the selection between.
    selection.modify("extend", "backward", "lineboundary");
    const atLineEnd = !selection.isCollapsed;
    if (atLineEnd) selection.collapse(anchorNode, anchorOffset);
    return atLineEnd;
  } catch {
    return false;
  }
}

/** Word's default tab stop for this document, in points: the surface's own
 * `tab-size` when it states a length, else 0.5 in. */
function defaultTabStopPt(view: EditorView): number {
  const win = view.dom.ownerDocument.defaultView;
  const value = win?.getComputedStyle(view.dom).tabSize ?? "";
  const px = value.endsWith("px") ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(px) && px > 0 ? pxToPtRounded(px) : INDENT_STEP_PT;
}

/**
 * The same Word option's Backspace: at the start of a paragraph Tab indented,
 * Backspace takes one indent step back (the paragraph's indent, then the
 * first line's) before it joins the line above. Above
 * the page wrapper's page-start Backspace (priority 100), which would
 * otherwise delete into the previous page first.
 */
const DocumentIndentBackspace = Extension.create({
  name: "documentIndentBackspace",
  priority: 105,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        if (!editor.isEditable || editor.view.composing) return false;
        const { selection } = editor.state;
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }
        const { $from } = selection;
        const block = $from.parent;
        if (!block.isTextblock || $from.parentOffset > 0) return false;
        if (!fragmentCarries("paragraphStart", block.attrs)) return false;
        const left = blockHasLeftIndent(block.attrs);
        // A first-line indent Tab (or the dialog) gave; a hanging one is
        // not taken back by Backspace.
        const firstLine =
          (normalizeFirstLineIndentPt(block.attrs.firstLineIndentPt) ?? 0) > 0 ||
          normalizeTextIndent(block.attrs.textIndent) !== null;
        if (!left && !firstLine) return false;
        if (
          ["codeBlock", "table", "bulletList", "orderedList", "taskList"].some(
            (name) => editor.isActive(name),
          )
        ) {
          return false;
        }
        // The whole paragraph's indent goes first, a stop at a time, then
        // the first line's.
        if (left) return editor.commands.decreaseIndent();
        return editor.commands.setFirstLineIndentPt(null);
      },
    };
  },
});

export default DocumentFormatting;
