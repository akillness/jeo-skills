/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ChainedCommands, Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  normalizeDocumentParagraphBorders,
  paragraphBordersFromLegacyPreset,
  type DocumentParagraphBorders,
} from "@mrnote/core/web/lib/document-borders.ts";
import { normalizeTabStops, type TabStop } from "@mrnote/core/web/lib/document-tabstops.ts";
import {
  normalizeDropCap,
  normalizeLineHeight,
  normalizeLineHeightPt,
  normalizeLineHeightRule,
  normalizeParagraphOnOff,
  normalizeParagraphTextAlignment,
  normalizeShadingColor,
  type ParagraphTextAlignment,
} from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";
import { normalizeDocumentDefaultTextAlign } from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import {
  DOUBLE_STRIKE_MARK,
  KERNING_THRESHOLD_MARK,
  normalizeKerningThresholdMarkAuthority,
} from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import { OPEN_TYPE_FEATURES_MARK, TEXT_EFFECTS_MARK } from "@mrnote/core/web/components/console/editor/extensions/TextEffects.ts";
import { isBoldSelection } from "@mrnote/core/web/components/console/editor/native-document/boldExtension.ts";
import { resolveDir, type TextDirection } from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import { EAL_MARK_NAME } from "./eastAsianLayoutExtension";
import { HIDDEN_TEXT_MARK } from "./hiddenTextExtension";
import { paragraphKeepFlag } from "@mrnote/core/web/components/console/editor/native-document/paragraphPagination.ts";
import { readPreciseIndents } from "@mrnote/core/web/components/console/editor/native-document/preciseIndent.ts";

/**
 * Home > Format Painter (Word 格式刷): copy the formatting of one piece of text
 * onto another. The toolbar arms it with the selection and paints the next
 * selection; the AI's Copy Formatting command names both. Both capture and
 * paint through the two functions below.
 */







export const FORMAT_PAINTER_MARKS: ReadonlySet<string> = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  DOUBLE_STRIKE_MARK,
  HIDDEN_TEXT_MARK,
  "superscript",
  "subscript",
  "smallCaps",
  "allCaps",
  "characterStyle",
  "emphasisDots",
  EAL_MARK_NAME,
  "fontSize",
  "fontFamily",
  "fontCjkFamily",
  "textColor",
  "highlight",
  "charSpacing",
  "charScale",
  KERNING_THRESHOLD_MARK,
  "charShading",
  "charBorder",
  "textPosition",
  TEXT_EFFECTS_MARK,
  OPEN_TYPE_FEATURES_MARK,
]);

export type FormatPainterTextAlign = "left" | "center" | "right" | "justify" | "distribute";

export interface FormatPainterBlock {
  textAlign: FormatPainterTextAlign;
  textDirection: TextDirection;
  indent: number;
  indentLeftPt: number | null;
  indentRightPt: number | null;
  firstLineIndentPt: number | null;
  lineHeight: string | null;
  lineHeightPt: number | null;
  lineHeightRule: "exact" | "atLeast" | null;
  spaceBefore: number;
  spaceAfter: number;
  textIndentEm: number;
  paragraphBorders: DocumentParagraphBorders | null;
  shadingColor: string | null;
  dropCap: string | null;
  tabStops: ReadonlyArray<Readonly<TabStop>>;
  keepNext: boolean;
  keepLines: boolean;
  widowControl: boolean;
  /** The paragraph's own value; null inherits at the target. */
  contextualSpacing: boolean | null;
  suppressLineNumbers: boolean;
  suppressAutoHyphens: boolean;
  snapToGrid: boolean | null;
  wordWrap: boolean | null;
  kinsoku: boolean | null;
  overflowPunct: boolean | null;
  topLinePunct: boolean | null;
  textAlignment: ParagraphTextAlignment | null;
  adjustRightInd: boolean | null;
  mirrorIndents: boolean | null;
  autoSpaceDE: boolean | null;
  autoSpaceDN: boolean | null;
}

export type FormatPainterPayload = Readonly<{
  marks: ReadonlyArray<Readonly<{ type: string; attrs: Readonly<Record<string, unknown>> }>>;
  block: Readonly<FormatPainterBlock>;
  /** Armed-time range — the painter only fires once the selection moves. */
  origin: Readonly<{ from: number; to: number }>;
  




  paragraphFormat: boolean;
  




  effectiveBold: boolean;
}>;

/** What the source paragraph is, as the caller reads it. */
export interface FormatPainterSource {
  /** The attributes of the paragraph (or heading) the selection starts in. */
  attrs: Record<string, unknown>;
  isHeading: boolean;
  /** The paragraph's effective alignment. */
  textAlign: FormatPainterTextAlign;
}

function finiteAtLeastZero(value: unknown, round: (value: number) => number): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, round(number)) : 0;
}

/** The source of the state's selection, read straight from the document. */
export function formatPainterSourceAt(editor: Editor): FormatPainterSource {
  const selected = editor.state.selection;
  // The paragraph the selection starts in, read from the selection itself:
  // the editor's attribute lookup takes the LAST paragraph the range
  // touches, so a selection of a whole paragraph ending at the start of the
  // next (its mark included, Word's way to pick a paragraph) painted the
  // next paragraph's alignment and spacing (live Word audit WUA 177).
  const $from = selected.$from;
  let start: ProseMirrorNode | null = null;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isTextblock) {
      start = node;
      break;
    }
  }
  const own = start && (start.type.name === "paragraph" || start.type.name === "heading") ? start : null;
  const isHeading = own ? own.type.name === "heading" : editor.isActive("heading");
  const attrs = (own ? { ...own.attrs } : editor.getAttributes(isHeading ? "heading" : "paragraph") ?? {}) as Record<
    string,
    unknown
  >;
  let align: unknown;
  if (selected instanceof NodeSelection && ["mathBlock", "chart"].includes(selected.node.type.name)) {
    align = selected.node.attrs.textAlign ?? (selected.node.type.name === "mathBlock" ? "center" : "left");
  } else if (selected.$from?.parent?.type.name === "imageRow") {
    align = selected.$from.parent.attrs.dataAlign;
  } else {
    align = attrs.textAlign ?? normalizeDocumentDefaultTextAlign(editor.state.doc.attrs.defaultTextAlign);
  }
  const textAlign: FormatPainterTextAlign =
    align === "center" || align === "right" || align === "justify" || align === "distribute" ? align : "left";
  return { attrs, isHeading, textAlign };
}

/** Capture the selection's formatting; null when it cannot be painted. */
export function captureFormatPainterPayload(
  state: EditorState,
  view: EditorView | undefined,
  source: FormatPainterSource,
): FormatPainterPayload | null {
  const $from = state.selection.$from;
  const sourceMarks = state.selection.empty
    ? $from.marks()
    : ($from.marksAcross(state.selection.$to) ?? $from.marks());
  const capturedMarks: Array<{ type: string; attrs: Readonly<Record<string, unknown>> }> = [];
  for (const mark of sourceMarks) {
    if (!FORMAT_PAINTER_MARKS.has(mark.type.name)) continue;
    if (mark.type.name === KERNING_THRESHOLD_MARK) {
      const authority = normalizeKerningThresholdMarkAuthority(mark.attrs);
      if (!authority) return null;
      // Format Painter owns direct formatting only. The target's own style
      // graph remains the fallback when this direct threshold is cleared.
      if (authority.provenance !== "direct") continue;
      capturedMarks.push(
        Object.freeze({
          type: mark.type.name,
          attrs: Object.freeze({
            halfPoints: authority.halfPoints,
            provenance: "direct",
            inheritedHalfPoints: null,
          }),
        }),
      );
      continue;
    }
    capturedMarks.push(Object.freeze({ type: mark.type.name, attrs: Object.freeze({ ...mark.attrs }) }));
  }
  const marks = Object.freeze(capturedMarks);
  const { attrs } = source;
  const precise = readPreciseIndents(attrs);
  const spacingNode = { type: source.isHeading ? "heading" : "paragraph", attrs };
  const bool = (value: unknown) => (typeof value === "boolean" ? value : null);
  const block: FormatPainterBlock = Object.freeze({
    textAlign: source.textAlign,
    textDirection: resolveDir(attrs.dir),
    indent: finiteAtLeastZero(attrs.indent, Math.floor),
    indentLeftPt: precise.left,
    indentRightPt: precise.right,
    firstLineIndentPt: precise.firstLine,
    lineHeight: normalizeLineHeight(attrs.lineHeight),
    lineHeightPt: normalizeLineHeightPt(attrs.lineHeightPt),
    lineHeightRule: normalizeLineHeightRule(attrs.lineHeightRule),
    spaceBefore: finiteAtLeastZero(attrs.spaceBefore, Math.round),
    spaceAfter: finiteAtLeastZero(attrs.spaceAfter, Math.round),
    textIndentEm: finiteAtLeastZero(attrs.textIndent, (value) => value),
    paragraphBorders:
      normalizeDocumentParagraphBorders(attrs.paragraphBorders) ??
      paragraphBordersFromLegacyPreset(attrs.borderPreset),
    shadingColor: normalizeShadingColor(attrs.shadingColor),
    dropCap: normalizeDropCap(attrs.dropCap),
    tabStops: Object.freeze((normalizeTabStops(attrs.tabStops) ?? []).map((stop) => Object.freeze({ ...stop }))),
    keepNext: paragraphKeepFlag(spacingNode, "keepNext"),
    keepLines: paragraphKeepFlag(spacingNode, "keepLines"),
    // Word's default is ON; only an explicit false turns widow control off.
    widowControl: attrs.widowControl !== false,
    // Format Painter owns direct formatting: a list item's inherited
    // spacing must not become an explicit "on" on the target.
    contextualSpacing: normalizeParagraphOnOff(attrs.contextualSpacing),
    suppressLineNumbers: attrs.suppressLineNumbers === true,
    suppressAutoHyphens: attrs.suppressAutoHyphens === true,
    snapToGrid: bool(attrs.snapToGrid),
    wordWrap: bool(attrs.wordWrap),
    kinsoku: bool(attrs.kinsoku),
    overflowPunct: bool(attrs.overflowPunct),
    topLinePunct: bool(attrs.topLinePunct),
    textAlignment: normalizeParagraphTextAlignment(attrs.textAlignment),
    adjustRightInd: bool(attrs.adjustRightInd),
    mirrorIndents: bool(attrs.mirrorIndents),
    autoSpaceDE: bool(attrs.autoSpaceDE),
    autoSpaceDN: bool(attrs.autoSpaceDN),
  });
  const $to = state.selection.$to;
  const paragraphFormat =
    state.selection.empty || !$from.sameParent($to) || $to.parentOffset >= $to.parent.content.size;
  const effectiveBold = !marks.some((mark) => mark.type === "bold") && isBoldSelection(state, view);
  return Object.freeze({
    marks,
    block,
    origin: Object.freeze({ from: state.selection.from, to: state.selection.to }),
    paragraphFormat,
    effectiveBold,
  });
}

type LooseChain = ChainedCommands & { [name: string]: (...args: never[]) => LooseChain };

/** Queue the paint of `payload` onto the chain's selection (one Undo step). */
export function queueFormatPainterPayload(
  chain: ChainedCommands,
  schema: Schema,
  payload: Pick<FormatPainterPayload, "marks" | "block" | "paragraphFormat" | "effectiveBold">,
): ChainedCommands {
  // The editor's own paragraph commands, typed loosely here.
  const chainable = chain as LooseChain;
  chainable.command(({ tr }) => {
    closeHistory(tr);
    return true;
  });
  // Replace only visual formatting. Semantic marks such as links, comments,
  // citations and tracked-change custody must survive a paint.
  for (const markName of FORMAT_PAINTER_MARKS) {
    if (markName === KERNING_THRESHOLD_MARK) continue;
    if (schema.marks[markName]) chainable.unsetMark(markName);
  }
  for (const mark of payload.marks) {
    if (mark.type === KERNING_THRESHOLD_MARK) continue;
    chainable.setMark(mark.type, mark.attrs);
  }
  if (payload.effectiveBold) chainable.setBold();
  const paintedKerning = payload.marks.find((mark) => mark.type === KERNING_THRESHOLD_MARK);
  chainable.unsetKerningThreshold();
  if (paintedKerning) {
    const halfPoints = normalizeKerningThresholdMarkAuthority(paintedKerning.attrs)?.halfPoints;
    if (halfPoints !== undefined) chainable.setKerningThreshold(halfPoints as never);
  }
  const block = payload.block;
  const queue = (name: string, ...args: unknown[]) => {
    (chainable[name] as (...values: unknown[]) => unknown)(...args);
  };
  
  // of a paragraph — paints character formatting only; every paragraph
  // property (alignment, indents, line and paragraph spacing, borders,
  // shading, tabs, pagination and East Asian typography) needs the mark.
  if (payload.paragraphFormat) {
    queue("setTextAlign", block.textAlign);
    queue("setTextDirection", block.textDirection);
    queue("setIndent", block.indent);
    queue("setParagraphIndents", {
      indentLeftPt: block.indentLeftPt,
      indentRightPt: block.indentRightPt,
      firstLineIndentPt: block.firstLineIndentPt,
    });
    if (block.lineHeightPt !== null && block.lineHeightRule !== null) {
      queue("setAbsoluteLineHeight", block.lineHeightPt, block.lineHeightRule);
    } else {
      queue("setLineHeight", block.lineHeight);
    }
    queue("setSpaceBefore", block.spaceBefore);
    queue("setSpaceAfter", block.spaceAfter);
    queue("setTextIndent", block.textIndentEm);
    queue("setParagraphBorders", block.paragraphBorders);
    queue("setParagraphShading", block.shadingColor);
    queue("setDropCap", block.dropCap === "dropped" ? "dropped" : null);
    queue("setTabStops", block.tabStops.map((stop) => ({ ...stop })));
    queue("setKeepNext", block.keepNext);
    queue("setKeepLines", block.keepLines);
    queue("setWidowControl", block.widowControl);
    queue("setContextualSpacing", block.contextualSpacing);
    queue("setSuppressLineNumbers", block.suppressLineNumbers);
    queue("setSuppressAutoHyphens", block.suppressAutoHyphens);
    queue("setSnapToGrid", block.snapToGrid);
    queue("setWordWrap", block.wordWrap);
    queue("setKinsoku", block.kinsoku);
    queue("setOverflowPunctuation", block.overflowPunct);
    queue("setTopLinePunctuation", block.topLinePunct);
    queue("setParagraphTextAlignment", block.textAlignment);
    queue("setAdjustRightIndent", block.adjustRightInd);
    queue("setMirrorIndents", block.mirrorIndents);
    queue("setAutoSpaceDE", block.autoSpaceDE);
    queue("setAutoSpaceDN", block.autoSpaceDN);
  }
  return chainable;
}


/**
 * The word a click with the armed Format Painter paints. Microsoft Support
 * ("Use the Format Painter") documents painting over a selection with the
 * brush; Word also paints the whole word under a single click (observed in
 * Word 16.86, not documented). A word is what the browser's word segmenter
 * takes it to be (Chinese words included), else a run of letters, digits and
 * apostrophes. Null on a space, punctuation or outside text.
 */
export function formatPainterWordRange(
  doc: ProseMirrorNodeLike,
  pos: number,
): { from: number; to: number } | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const text = parent.textBetween(0, parent.content.size, "￼", "￼");
  const offset = Math.min($pos.parentOffset, text.length);
  const start = $pos.start();
  const isWordLike = (segment: string) => /[\p{L}\p{N}]/u.test(segment);
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: "word" },
    ) => { segment(input: string): Iterable<{ segment: string; index: number }> };
  }).Segmenter;
  if (Segmenter) {
    for (const { segment, index } of new Segmenter(undefined, { granularity: "word" }).segment(text)) {
      const end = index + segment.length;
      if (offset >= index && offset <= end && isWordLike(segment)) {
        // The caret between two words belongs to the one it touches first.
        if (offset === end && end < text.length && isWordLike(text.slice(end, end + 1))) continue;
        return { from: start + index, to: start + end };
      }
      if (index > offset) break;
    }
    return null;
  }
  const word = /^[\p{L}\p{N}\p{M}'’_-]$/u;
  let from = offset;
  let to = offset;
  while (from > 0 && word.test(text[from - 1])) from -= 1;
  while (to < text.length && word.test(text[to])) to += 1;
  return from < to ? { from: start + from, to: start + to } : null;
}

type ProseMirrorNodeLike = EditorState["doc"];
