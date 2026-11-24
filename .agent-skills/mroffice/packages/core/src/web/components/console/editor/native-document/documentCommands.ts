/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PX, ptToPx } from "../../../../lib/office-units";
import type { Editor, JSONContent } from "@tiptap/core";
import {
  MRNOTE_DOCUMENT_COMMAND_TYPE,
  isNativeDocumentCommand,
} from "./documentCommandShape";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { OfficePictureEffects } from "../../../../lib/office-picture-effects";
import { isSavableDocumentUrl } from "../../../../lib/document-url-rules";
import { Fragment } from "@tiptap/pm/model";
import {
  normalizeCellBackgroundColor,
  normalizeCellBorderStyle,
  normalizeCellMargin,
  normalizeCellTextAlign,
  normalizeCellTextDirection,
  normalizeCellVerticalAlign,
} from "./tableCellStyle";
import { parse as parseMarkdown } from "../../../../lib/markdown";
import { normalizeLatexMathDelimiters, withoutNextPrompt } from "../../../../__m__/m1419491850";
import {
  MRNOTE_BLOCK_ID_ATTR,
  MRNOTE_SOURCE_ATTR,
  setSelectedTextBlockTypePreservingAttrs,
} from "./blockIds";
import {
  isValidInlineImageSource,
  recordHasInvalidInlineImageSrc,
} from "../../../../lib/inline-image-source";
import { coveredCells, normalizeMerges } from "../../../../lib/spreadsheet/merge-cells";
import { hydrateSheetForEditing } from "../../../../lib/spreadsheet/blank-cell-formats";
import { nativeFontSizeAfterPatch } from "../../../../lib/spreadsheet/native-font-size";
import { themeColorsAfterPatch } from "../../../../lib/spreadsheet/theme-colors";
import {
  withSpreadsheetChartFlatPatch,
  type SpreadsheetChartLike,
} from "../../../../lib/spreadsheet/chart-v2-model";
import {
  FONT_SIZE_VALUES,
  HIGHLIGHT_COLOR_VALUES,
  TEXT_COLOR_VALUES,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeHighlightColor,
  normalizeTextColor,
} from "../extensions/TextStyling";
import {
  normalizeBorderPreset,
  normalizeLineHeight,
  normalizeLineHeightPt,
  normalizeLineHeightRule,
  normalizeShadingColor,
  normalizeSpacing,
  normalizeTextAlign,
  normalizeTextIndent,
} from "../extensions/DocumentFormatting";
import { normalizeIndentPt } from "./preciseIndent";
import {
  IMAGE_ALIGN_VALUES,
  IMAGE_BORDER_STYLES,
  IMAGE_FLOATS,
  normalizeImageRotation,
} from "./imageControls";
import {
  chartDataEditOrigins,
  chartFormatFollowingDataEdit,
  normalizeChartBlockAttrs,
  validateChartBlockAttrsV2,
  type ChartBlockAttrsV2,
} from "../extensions/chartBlockShared";
import { officeChartLegacyKind } from "../../../../lib/office-charts/catalog";
import { chartWithDisplayBlanksLeaf } from "../../../../lib/office-charts/chart-elements";
import { seedDocumentChartWorkbook } from "../extensions/documentChartWorkbook";
import {
  presentationChartBlockOnV2,
  presentationChartPatchOnV2,
} from "../../../../lib/presentation-chart-upgrade";
import { applyAttrPatch, isAttrPathKey, parseAttrPath, setAtAttrPath } from "../../../../lib/attr-path-patch";
import type { ScriptStep } from "@/lib/copilot-script";
import { presentationBlockSchema } from "../../../../lib/native-page-schemas";
import { applyPresentationButtonChanges } from "../../../../lib/presentation-button-changes";
import { latexForPdfFormulaTextEdit } from "../../../../lib/pdf/formula-latex";
import { isRenderablePdfFormulaLatex } from "../../../../lib/pdf/formula-render";
import { encodeManagedNativeNote } from "../../../../lib/pdf/native-note-roundtrip";
import {
  pdfMarkupColorToHex,
  proofingGeometryFromQuadPoints,
} from "../../../../lib/pdf/native-text-markup-writeback";
import {
  DEFAULT_BLANK_PAGE_HEIGHT,
  DEFAULT_BLANK_PAGE_WIDTH,
  movePageAfter,
  pageEditStateForSequence,
} from "../../../../lib/pdf/page-ops";
import { DEFAULT_NEW_BOX_FONT_SIZE } from "../../../../lib/pdf/text-box-create";
import {
  sanitizePdfTextBoxEditGeometry,
  sanitizePdfTextBoxRect,
} from "../../../../lib/pdf/text-box-rect";
import type { TextRun } from "../../../../lib/presentation-runs";
import { readNativeSmartArtGroup, updateNativeSmartArtText } from "../../../../lib/presentation-native-smartart";
import {
  assignTimelineStepIds,
  type TimelineStep,
} from "../../../../lib/presentation-anim-timeline";
import { buildOccupancyGrid } from "../../../../lib/presentation-table-merge";
import { applyTableClipboard } from "../../../../lib/presentation-table-clipboard";
import type {
  PresentationConnectorEnd,
  PresentationConnectorPreset,
  PresentationConnectorRoute,
} from "../../../../lib/presentation-shapes";
import type { PresentationCustomPath } from "../../../../lib/presentation-freeform";
import type { PresentationClickAction } from "../../../../lib/presentation-block-fx";
import type { PersistedPresentationMediaPlaybackSettings } from "../../../../lib/presentation-embed";
import { PAGE_BLOCK_NODE } from "./paged/pageBlockExtension";
import { isActiveAcrossSheets } from "./paged/crossSheetEditing";
import { TextSelection as PMTextSelection } from "@tiptap/pm/state";
import {
  patchPdfTextStyleRuns,
  reconcilePdfTextStyleRuns,
  type PdfTextStyleRun,
} from "../../../../lib/pdf/text-style-runs";
import {
  normalizePdfTextLineLayout,
  reconcilePdfTextLineLayout,
  type PdfTextLineLayout,
} from "../../../../lib/pdf/text-line-layout";
import { PRESENTATION_GEOMETRY_MAX_EMU } from "../../../../lib/presentation-geometry-limit";
export * from "./documentCommandsCore";
import { MAX_COMMAND_CELL_CHARS, applySpreadsheetCellPatch, applySpreadsheetPageCommandWithResult, isAIOutputNodeType, objectPatchWithinCommandBudget, operationContainsAIOutputContent, operationContainsInvalidInlineImageSource, safeDocumentImageSource, stringMatrixWithinBudget, validateNativeDocumentCommandForApply } from "./documentCommandsCore";
import type { DocumentConvertibleBlockType, NativeDocumentCommand, NativeDocumentCommandRejectionReason, NativeDocumentOperation, NativePageCommandRejectionReason, NativePageCommandResult, PresentationBlock, PresentationChartBlock, PresentationTableCell, SpreadsheetContent } from "./documentCommandsCore";

export { MRNOTE_DOCUMENT_COMMAND_TYPE, isNativeDocumentCommand };
export const MAX_DOCUMENT_TABLE_COMMAND_ROWS = 80;
export const MAX_DOCUMENT_TABLE_COMMAND_COLS = 30;
// Whole-page rewrites (translate/restructure) legitimately quote the whole
// document as the query - mirror the server's 200k cap (the page text the
// model sees, request-context.ts).
export const MAX_FIND_REPLACE_QUERY_CHARS = 200_000;
export const MAX_FIND_REPLACE_REPLACEMENT_CHARS = 200_000;
const MAX_FIND_REPLACE_MATCHES = 1_000;
const MAX_DOCUMENT_IMAGE_DIMENSION_PX = 20_000;
const MAX_DOCUMENT_IMAGE_DIMENSION_EMU = 20_000_000;
const MIN_DOCUMENT_IMAGE_RESIZE_SCALE = 0.05;
const MAX_DOCUMENT_IMAGE_RESIZE_SCALE = 10;
const DOCUMENT_FONT_SIZE_SET = new Set<string>(FONT_SIZE_VALUES);
export const DOCUMENT_TEXT_COLOR_SET = new Set<string>(TEXT_COLOR_VALUES);
export const DOCUMENT_HIGHLIGHT_COLOR_SET = new Set<string>(HIGHLIGHT_COLOR_VALUES);
const MARKDOWN_BLOCK_LEAK_RE =
  /(^|\n)\s{0,3}(#{1,6}\s+\S|[-*+]\s+\S|\d+[.)]\s+\S|>\s+\S|```|~~~|\|[^\n|]*\|)/;

type DocumentEditorCommands = {
  focus?: () => unknown;
  setContent?: (
    content: JSONContent,
    options?: { emitUpdate?: boolean },
  ) => unknown;
};

function getDocumentEditorCommands(
  editor: Editor,
): DocumentEditorCommands | null {
  try {
    return (
      (editor as { commands?: DocumentEditorCommands | null }).commands ?? null
    );
  } catch {
    return null;
  }
}

function focusDocumentEditor(editor: Editor): void {
  try {
    getDocumentEditorCommands(editor)?.focus?.();
  } catch {
    // Focusing is polish after the document mutation; failure must not turn a
    // successful content operation into a rejected AI edit.
  }
}

function restoreDocumentContent(editor: Editor, content: JSONContent): boolean {
  const commands = getDocumentEditorCommands(editor);
  if (typeof commands?.setContent !== "function") return false;
  try {
    commands.setContent(content, { emitUpdate: false });
    return true;
  } catch {
    return false;
  }
}

export interface AIOutputCommandPayload {
  content_markdown: string;
  action_type: string;
  action_log_id: string;
  model_id: string | null;
  sources: Array<{ type: string; id: string; title: string }>;
}

export interface EditableAnswerCommandPayload extends AIOutputCommandPayload {
  page_type?: string | null;
  placement?: "replace" | "insert_below";
  edit_instruction?: string | null;
}

export interface EditableAnswerCommandContext {
  page_type?: string | null;
  selected_text?: string | null;
  command_context?: Record<string, unknown> | null;
}

export interface ExecuteDocumentCommandContext {
  selectionRange?: { from: number; to: number } | null;
  /** Stable semantic anchor for commands such as insert_block_after. */
  blockId?: string | null;
}

export interface ExecuteDocumentCommandResult {
  ok: boolean;
  appliedOperations: number;
  rejectedOperations: number;
  rejectionReason?: NativeDocumentCommandRejectionReason;
}

export function isAIOutputInsertCommand(
  command: NativeDocumentCommand,
): boolean {
  return command.operations.some(operationContainsAIOutputContent);
}

const MAX_INSERTED_DOCUMENT_BLOCKS = 64;

/** The new structures an insert-next-to operation carries, in document order;
 * null when it carries none, both forms, or more than one command allows. */
export function insertedDocumentBlocks(
  operation: Extract<
    NativeDocumentOperation,
    { op: "insert_block_after" | "insert_block_before" }
  >,
): JSONContent[] | null {
  if (operation.node && operation.nodes) return null;
  const nodes = operation.nodes ?? (operation.node ? [operation.node] : []);
  return nodes.length > 0 &&
    nodes.length <= MAX_INSERTED_DOCUMENT_BLOCKS &&
    nodes.every(
      (node) =>
        Boolean(node) && typeof node === "object" && !Array.isArray(node),
    )
    ? nodes
    : null;
}

export function aiOutputMarkdownFromInsertCommand(
  command: NativeDocumentCommand | null | undefined,
): string | undefined {
  if (!command) return undefined;
  for (const operation of command.operations) {
    if (
      operation.op !== "insert_node" &&
      operation.op !== "insert_block_after" &&
      operation.op !== "insert_block_before"
    ) {
      continue;
    }
    const nodes =
      operation.op === "insert_node"
        ? [operation.node]
        : (insertedDocumentBlocks(operation) ?? []);
    for (const node of nodes) {
      const markdown = aiOutputMarkdownFromNode(node);
      if (markdown) return markdown;
    }
  }
  return undefined;
}

function aiOutputMarkdownFromNode(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const candidate = node as {
    attrs?: unknown;
    content_markdown?: unknown;
    markdown?: unknown;
    text?: unknown;
    type?: unknown;
  };
  if (!isAIOutputNodeType(candidate.type)) return undefined;
  const attrs =
    candidate.attrs && typeof candidate.attrs === "object"
      ? (candidate.attrs as {
          content_markdown?: unknown;
          markdown?: unknown;
          text?: unknown;
        })
      : {};
  for (const value of [
    attrs.content_markdown,
    attrs.markdown,
    attrs.text,
    candidate.content_markdown,
    candidate.markdown,
    candidate.text,
  ]) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

export function markdownToDocumentContent(markdown: string): JSONContent[] {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return [];
  }
  try {
    // An answer's \[ \] / \( \) formulas become equations, not bracketed source.
    const parsed = parseMarkdown(normalizeLatexMathDelimiters(withoutNextPrompt(trimmed))) as JSONContent;
    if (Array.isArray(parsed.content) && parsed.content.length > 0) {
      return parsed.content;
    }
  } catch {
    /* fall through to a plain paragraph */
  }
  return [
    {
      type: "paragraph",
      content: [{ type: "text", text: trimmed }],
    },
  ];
}

export function shouldUseStructuredGeneratedDocumentNodes(
  text: string,
  content: JSONContent[],
): boolean {
  if (!text.trim() || content.length === 0) return false;
  if (content.length > 1) return true;
  const first = content[0];
  if (!first || first.type !== "paragraph") return true;
  return MARKDOWN_BLOCK_LEAK_RE.test(text);
}

// Content-quality heuristics were removed from the apply path

// single authority and it flags-but-passes). Security gates remain in
// validateNativeDocumentCommandForApply below.

function safeDocumentLinkHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4_096) return null;
  const compact = trimmed.replace(/[\u0000-\u0020\u007f]+/g, "");
  if (compact !== trimmed) return null;
  const schemeMatch = compact.match(/^([a-z][a-z0-9+\-.]*):/i);
  if (!schemeMatch) return trimmed;
  const scheme = schemeMatch[1].toLowerCase();
  // The page's save refuses a web address with no host (WUA 024).
  return ["http", "https", "mailto", "tel", "sms", "ftp", "ftps", "file"].includes(
    scheme,
  ) && isSavableDocumentUrl(trimmed)
    ? trimmed
    : null;
}

export function normalizeDocumentFontSize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return DOCUMENT_FONT_SIZE_SET.has(normalized) ? normalized : null;
}

export function normalizeDocumentTextColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return DOCUMENT_TEXT_COLOR_SET.has(normalized) ? normalized : null;
}

export function normalizeDocumentHighlightColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return DOCUMENT_HIGHLIGHT_COLOR_SET.has(normalized) ? normalized : null;
}

export function boundedDocumentImageDimension(
  value: number,
  max: number,
): number | null {
  if (!Number.isFinite(value) || value < 1 || value > max) return null;
  return Math.round(value);
}

/**
 * Strip a single surrounding Markdown code fence (```lang … ```) from an AI
 * answer so the text inserted into a code page is clean source rather than
 * fenced Markdown. Leaves prose or multi-block answers untouched.
 */
export function stripCodeFences(text: string): string {
  const match = text.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : text;
}


const INLINE_PAYLOAD_NODE_TYPES = new Set(["text", "inlineMath", "hardBreak"]);

function insertPayloadHasBlockNode(
  content: string | JSONContent | JSONContent[],
): boolean {
  if (typeof content === "string") return false;
  const nodes = Array.isArray(content) ? content : [content];
  return nodes.some(
    (node) =>
      !!node &&
      typeof node === "object" &&
      typeof node.type === "string" &&
      !INLINE_PAYLOAD_NODE_TYPES.has(node.type),
  );
}

function operationContent(
  operation: Extract<
    NativeDocumentOperation,
    { op: "replace_selection" | "insert_text" }
  >,
): string | JSONContent | JSONContent[] {
  if (operation.content) {
    return operation.content;
  }
  if (MARKDOWN_BLOCK_LEAK_RE.test(operation.text)) {
    return markdownToDocumentContent(operation.text);
  }
  return operation.text;
}

function findReplaceWithinCommandBudget(
  operation: Extract<NativeDocumentOperation, { op: "replace_document_text" }>,
): boolean {
  return (
    typeof operation.query === "string" &&
    operation.query.trim().length > 0 &&
    operation.query.length <= MAX_FIND_REPLACE_QUERY_CHARS &&
    typeof operation.replacement === "string" &&
    operation.replacement.length <= MAX_FIND_REPLACE_REPLACEMENT_CHARS &&
    (operation.max_replacements === undefined ||
      (Number.isInteger(operation.max_replacements) &&
        operation.max_replacements > 0 &&
        operation.max_replacements <= MAX_FIND_REPLACE_MATCHES))
  );
}

function imageResizeWithinCommandBudget(
  operation: Extract<NativeDocumentOperation, { op: "resize_document_image" }>,
): boolean {
  const hasScale = operation.scale !== undefined;
  const hasDimension =
    operation.width !== undefined ||
    operation.height !== undefined ||
    operation.widthEmu !== undefined ||
    operation.heightEmu !== undefined;
  if (!hasScale && !hasDimension) return false;
  if (hasScale) {
    const scale = operation.scale;
    if (
      scale === undefined ||
      !Number.isFinite(scale) ||
      scale < MIN_DOCUMENT_IMAGE_RESIZE_SCALE ||
      scale > MAX_DOCUMENT_IMAGE_RESIZE_SCALE
    ) {
      return false;
    }
  }
  for (const [key, max] of [
    ["width", MAX_DOCUMENT_IMAGE_DIMENSION_PX],
    ["height", MAX_DOCUMENT_IMAGE_DIMENSION_PX],
    ["widthEmu", MAX_DOCUMENT_IMAGE_DIMENSION_EMU],
    ["heightEmu", MAX_DOCUMENT_IMAGE_DIMENSION_EMU],
  ] as const) {
    const value = operation[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 1 || value > max) return false;
  }
  return true;
}

function documentOperationRejectionReason(
  operation: NativeDocumentOperation,
): NativeDocumentCommandRejectionReason {
  if (operationContainsInvalidInlineImageSource(operation)) {
    return "invalid_image_source";
  }
  if (
    operation.op === "update_document_table_cells" &&
    Array.isArray(operation.values) &&
    operation.values.length > 0 &&
    !stringMatrixWithinBudget(operation.values, {
      maxRows: MAX_DOCUMENT_TABLE_COMMAND_ROWS,
      maxCols: MAX_DOCUMENT_TABLE_COMMAND_COLS,
      maxCellChars: MAX_COMMAND_CELL_CHARS,
    })
  ) {
    return "payload_too_large";
  }
  if (
    operation.op === "replace_document_text" &&
    !findReplaceWithinCommandBudget(operation)
  ) {
    return "payload_too_large";
  }
  if (
    operation.op === "resize_document_image" &&
    !imageResizeWithinCommandBudget(operation)
  ) {
    return "payload_too_large";
  }
  return "operation_failed";
}

/** `editor.isActive` for a node type, reading a selection that crosses
 * pages as the run of paragraphs it is. */
function selectionIsIn(editor: Editor, name: string): boolean {
  return isActiveAcrossSheets(editor.state, name) ?? editor.isActive(name);
}

function applyFormatSelection(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "format_selection" }>,
): boolean {
  type FormattingChain = ReturnType<Editor["chain"]> & {
    setParagraph: () => FormattingChain;
    setHeading: (attrs: { level: 1 | 2 | 3 }) => FormattingChain;
    toggleBlockquote: () => FormattingChain;
    toggleCodeBlock: () => FormattingChain;
    setMark: (mark: string) => FormattingChain;
    unsetMark: (
      mark: string,
      options?: Record<string, unknown>,
    ) => FormattingChain;
    setTextAlign: (
      align: "left" | "center" | "right" | "justify",
    ) => FormattingChain;
    setIndent: (indent: number) => FormattingChain;
    setFontSize: (size: string) => FormattingChain;
    unsetFontSize: () => FormattingChain;
    setTextColor: (color: string) => FormattingChain;
    unsetTextColor: () => FormattingChain;
    setHighlight: (color: string) => FormattingChain;
    unsetHighlight: () => FormattingChain;
    toggleBulletList: () => FormattingChain;
    toggleOrderedList: () => FormattingChain;
    toggleTaskList: () => FormattingChain;
    liftListItem: (typeOrName: string) => FormattingChain;
    clearNodes: () => FormattingChain;
    setLink: (attrs: { href: string }) => FormattingChain;
    unsetLink: () => FormattingChain;
  };
  
  // pageBlock+): an AllSelection/depth-0 selection has the DOC as its block
  // range parent, so list wrapping (findWrapping over `pageBlock+`) fails.
  // Re-seat the range between the first and last TEXT positions — inside
  // the page sheets — before formatting. A range spanning several sheets is
  // then handled by the range commands themselves: they run on the joined
  // text and the sheets are re-cut after them (paged/crossSheetEditing.ts),
  // so the list toggles below reach every selected paragraph, as in Word.
  {
    const { selection, doc } = editor.state;
    if (selection.$from.depth === 0 || selection.$to.depth === 0) {
      const from = PMTextSelection.atStart(doc).from;
      const to = PMTextSelection.atEnd(doc).to;
      editor.commands.setTextSelection({ from, to });
    }
  }
  const blockType = operation.block_type;
  let blockTypeResult = true;
  if (blockType === "paragraph") {
    blockTypeResult = setSelectedTextBlockTypePreservingAttrs(
      editor,
      "paragraph",
    );
  }
  if (blockType === "heading1") {
    blockTypeResult = setSelectedTextBlockTypePreservingAttrs(
      editor,
      "heading",
      { level: 1 },
    );
  }
  if (blockType === "heading2") {
    blockTypeResult = setSelectedTextBlockTypePreservingAttrs(
      editor,
      "heading",
      { level: 2 },
    );
  }
  if (blockType === "heading3") {
    blockTypeResult = setSelectedTextBlockTypePreservingAttrs(
      editor,
      "heading",
      { level: 3 },
    );
  }
  if (!blockTypeResult) return false;

  const chain = editor.chain().focus() as unknown as FormattingChain;
  if (blockType === "blockquote") chain.toggleBlockquote();
  if (blockType === "code_block") chain.toggleCodeBlock();

  for (const [mark, enabled] of Object.entries(operation.marks || {})) {
    if (enabled === true) {
      chain.setMark(mark);
    } else if (enabled === false) {
      chain.unsetMark(mark, { extendEmptyMarkRange: true });
    }
  }

  if (operation.text_align) chain.setTextAlign(operation.text_align);
  if (typeof operation.indent === "number") chain.setIndent(operation.indent);
  if (operation.list_type === null) {
    chain.clearNodes();
  } else if (operation.list_type === "bullet") {
    if (!selectionIsIn(editor, "bulletList")) chain.toggleBulletList();
  } else if (operation.list_type === "ordered") {
    if (!selectionIsIn(editor, "orderedList")) chain.toggleOrderedList();
  } else if (operation.list_type === "task") {
    if (!selectionIsIn(editor, "taskList")) chain.toggleTaskList();
  } else if (operation.list_type !== undefined) {
    return false;
  }
  if (operation.font_size === null) {
    chain.unsetFontSize();
  } else if (typeof operation.font_size === "string") {
    const fontSize = normalizeDocumentFontSize(operation.font_size);
    if (!fontSize) return false;
    chain.setFontSize(fontSize);
  }
  if (operation.text_color === null) {
    chain.unsetTextColor();
  } else if (typeof operation.text_color === "string") {
    const textColor = normalizeDocumentTextColor(operation.text_color);
    if (!textColor) return false;
    chain.setTextColor(textColor);
  }
  if (operation.highlight_color === null) {
    chain.unsetHighlight();
  } else if (typeof operation.highlight_color === "string") {
    const highlightColor = normalizeDocumentHighlightColor(
      operation.highlight_color,
    );
    if (!highlightColor) return false;
    chain.setHighlight(highlightColor);
  }
  if (operation.link_href === null) {
    chain.unsetLink();
  } else if (
    typeof operation.link_href === "string" &&
    operation.link_href.trim()
  ) {
    const href = safeDocumentLinkHref(operation.link_href);
    if (!href) return false;
    chain.setLink({ href });
  }
  return Boolean(chain.run());
}

function applyDocumentImageInsert(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "insert_document_image" }>,
  context?: ExecuteDocumentCommandContext,
): boolean {
  const src = safeDocumentImageSource(operation.src);
  if (!src) return false;
  const attrs: { src: string; alt?: string; title?: string } = { src };
  if (typeof operation.alt === "string" && operation.alt.trim()) {
    attrs.alt = operation.alt.trim().slice(0, 500);
  }
  if (typeof operation.title === "string" && operation.title.trim()) {
    attrs.title = operation.title.trim().slice(0, 500);
  }
  const node = { type: "image", attrs };
  if (operation.position === "end") {
    return editor
      .chain()
      .focus("end")
      .insertContentAt(editor.state.doc.content.size, node)
      .run();
  }
  if (operation.position === "after_selection") {
    const { to } = context?.selectionRange ?? editor.state.selection;
    return editor.chain().focus().insertContentAt(to, node).run();
  }
  if (context?.selectionRange) {
    return editor
      .chain()
      .focus()
      .insertContentAt(context.selectionRange, node)
      .run();
  }
  const imageChain = editor.chain().focus() as unknown as {
    setImage: (nextAttrs: typeof attrs) => { run: () => boolean };
  };
  return imageChain.setImage(attrs).run();
}

type DocumentTextMatch = { from: number; to: number };
type DocumentTextSegment = { from: number; offset: number; length: number };
type TopLevelDocumentNodeMatch = {
  index: number;
  node: ProseMirrorNode;
  pos: number;
};

function textOffsetToDocumentPosition(
  segments: DocumentTextSegment[],
  offset: number,
): number | null {
  for (const segment of segments) {
    const segmentEnd = segment.offset + segment.length;
    if (offset >= segment.offset && offset <= segmentEnd) {
      return segment.from + (offset - segment.offset);
    }
  }
  return null;
}

// Escape a literal string for safe interpolation into a RegExp. Find/replace
// treats the query LITERALLY, so every metacharacter must be neutralised.
function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTextBlockMatches(
  node: ProseMirrorNode,
  pos: number,
  needle: string,
  caseSensitive: boolean,
  matches: DocumentTextMatch[],
  limit: number,
): void {
  // Search each CONTIGUOUS run of text nodes independently. Inline ATOMS
  // (footnote / citation / inline-math / hardBreak) occupy a document position
  // but contribute no characters, so concatenating text across them would (a)
  // let a needle match ACROSS the atom and (b) leave a gap in the
  // offset->position map — either way the resulting insertText(from, to) would
  // span and silently DELETE the atom. Resetting the run at every non-text
  // child guarantees each match maps to an unbroken span of real text, so an
  // adjacent/intervening atom is never engulfed. Within a single run, segment
  // offsets and document positions advance in lockstep (no gaps), so the
  // offset->position mapping is exact.
  //
  // Matching uses a RegExp over the ORIGINAL (un-lowercased) run text rather
  // than indexOf over a lowercased copy: toLocaleLowerCase() is NOT
  // length-preserving (e.g. Turkish 'İ' U+0130 -> 'i' + combining dot), which
  // would shift every later index and mis-target the replacement. RegExp match
  // indices/lengths are always in original-string coordinates, so the case-
  // insensitive ('i') flag stays correct.
  const pattern = new RegExp(
    escapeRegExpLiteral(needle),
    caseSensitive ? "g" : "gi",
  );
  let runText = "";
  let runSegments: DocumentTextSegment[] = [];

  const flushRun = (): void => {
    if (runText.length > 0 && matches.length < limit) {
      pattern.lastIndex = 0;
      let match = pattern.exec(runText);
      while (match !== null && matches.length < limit) {
        const from = textOffsetToDocumentPosition(runSegments, match.index);
        const to = textOffsetToDocumentPosition(
          runSegments,
          match.index + match[0].length,
        );
        if (from !== null && to !== null) {
          matches.push({ from, to });
        }
        // Defensive: a zero-length match (needle is non-empty, so this should
        // not occur) would pin lastIndex and loop forever — force progress.
        if (pattern.lastIndex <= match.index) {
          pattern.lastIndex = match.index + 1;
        }
        match = pattern.exec(runText);
      }
    }
    runText = "";
    runSegments = [];
  };

  node.descendants((child, childPos) => {
    if (matches.length >= limit) return false;
    if (child.isText && child.text) {
      runSegments.push({
        from: pos + 1 + childPos,
        offset: runText.length,
        length: child.text.length,
      });
      runText += child.text;
      return false;
    }
    // A non-text inline node breaks the contiguous run: flush what we have (so a
    // match can never cross it) before moving on. Inline atoms are leaves, so we
    // do not descend.
    flushRun();
    return false;
  });
  flushRun();
}

function collectDocumentTextMatches(
  editor: Editor,
  query: string,
  caseSensitive: boolean,
  limit: number,
): DocumentTextMatch[] {
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  if (!needle || limit < 1) return [];
  const matches: DocumentTextMatch[] = [];
  const visit = (
    node: ProseMirrorNode,
    pos: number,
    isRoot = false,
  ): boolean => {
    if (matches.length >= limit) return false;
    if (!isRoot && node.isTextblock) {
      collectTextBlockMatches(node, pos, needle, caseSensitive, matches, limit);
      return matches.length < limit;
    }
    let offset = 0;
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      const childPos = isRoot ? offset : pos + 1 + offset;
      if (!visit(child, childPos)) {
        return false;
      }
      offset += child.nodeSize;
    }
    return true;
  };
  visit(editor.state.doc, 0, true);
  return matches;
}

function applyDocumentTextReplacement(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "replace_document_text" }>,
): boolean {
  if (!findReplaceWithinCommandBudget(operation)) return false;
  const query = operation.query.trim();
  const matchLimit =
    typeof operation.max_replacements === "number"
      ? operation.max_replacements
      : MAX_FIND_REPLACE_MATCHES + 1;
  const matches = collectDocumentTextMatches(
    editor,
    query,
    operation.case_sensitive === true,
    matchLimit,
  );
  if (!matches.length) return false;
  if (
    operation.max_replacements === undefined &&
    matches.length > MAX_FIND_REPLACE_MATCHES
  ) {
    return false;
  }
  const selectedMatches = matches;
  let transaction = editor.state.tr;
  for (const match of [...selectedMatches].reverse()) {
    transaction = transaction.insertText(
      operation.replacement,
      match.from,
      match.to,
    );
  }
  editor.view.dispatch(transaction.scrollIntoView());
  focusDocumentEditor(editor);
  return true;
}

function findDocumentNodeByBlockId(
  editor: Editor,
  blockId: string,
  nodeType?: string,
): { pos: number; node: ProseMirrorNode } | null {
  let found: { pos: number; node: ProseMirrorNode } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.block_id !== blockId) return true;
    if (nodeType && node.type.name !== nodeType) return false;
    found = { pos, node };
    return false;
  });
  return found;
}









function collectDocumentBlockFlow(
  doc: ProseMirrorNode,
): TopLevelDocumentNodeMatch[] {
  const flow: TopLevelDocumentNodeMatch[] = [];
  doc.forEach((child, offset) => {
    if (child.type.name !== PAGE_BLOCK_NODE) {
      flow.push({ index: flow.length, node: child, pos: offset });
      return;
    }
    let inner = offset + 1;
    child.forEach((block) => {
      flow.push({ index: flow.length, node: block, pos: inner });
      inner += block.nodeSize;
    });
  });
  return flow;
}

/**
 * Return a block insertion boundary INSIDE the first/last pageBlock.
 *
 * `doc.content.size` is outside the final page sheet now that the editor root
 * is `pageBlock+`. Passing that old flat-document position to Tiptap makes it
 * try to create a TextSelection on a pageBlock endpoint and can unwrap or
 * reject the inserted block. Storage is flat, but live commands must respect
 * the sheeted schema.
 */
function documentBlockFlowBoundary(
  doc: ProseMirrorNode,
  edge: "start" | "end",
): number {
  const flow = collectDocumentBlockFlow(doc);
  if (flow.length > 0) {
    const item = edge === "start" ? flow[0] : flow[flow.length - 1];
    return edge === "start" ? item.pos : item.pos + item.node.nodeSize;
  }

  let firstPageStart: number | null = null;
  let lastPageEnd: number | null = null;
  doc.forEach((child, offset) => {
    if (child.type.name !== PAGE_BLOCK_NODE) return;
    firstPageStart ??= offset + 1;
    lastPageEnd = offset + 1 + child.content.size;
  });
  if (edge === "start" && firstPageStart !== null) return firstPageStart;
  if (edge === "end" && lastPageEnd !== null) return lastPageEnd;
  return edge === "start" ? 0 : doc.content.size;
}

function findTopLevelDocumentNodeByBlockId(
  editor: Editor,
  blockId: string,
): TopLevelDocumentNodeMatch | null {
  return (
    collectDocumentBlockFlow(editor.state.doc).find(
      (entry) => entry.node.attrs?.block_id === blockId,
    ) ?? null
  );
}

/** A node as an edit sees it: everything but its identity (block id, import
 * source, native receipts), with keys in a stable order -- two nodes with the
 * same shape say the same thing. */
function documentNodeShape(node: unknown): string {
  if (Array.isArray(node)) return `[${node.map(documentNodeShape).join(",")}]`;
  if (!node || typeof node !== "object") return JSON.stringify(node ?? null);
  const record = node as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => key !== MRNOTE_BLOCK_ID_ATTR && !key.startsWith("native"))
    .filter((key) => !(key === MRNOTE_SOURCE_ATTR && record[key] !== null && typeof record[key] === "object"))
    .filter((key) => record[key] !== undefined && record[key] !== null)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${documentNodeShape(record[key])}`).join(",")}}`;
}

function isInlineDocumentNode(node: JSONContent | undefined): boolean {
  return !!node && (typeof node.text === "string" || node.type === "hardBreak" || node.type === "inlineMath");
}











export function withUnchangedDocumentIdentity(target: JSONContent, next: JSONContent): JSONContent {
  if (!target || !next || target.type !== next.type) return next;
  if (documentNodeShape(target) === documentNodeShape(next)) return target;
  const before = Array.isArray(target.content) ? target.content : [];
  const after = Array.isArray(next.content) ? next.content : [];
  if (after.length === 0 || after.some(isInlineDocumentNode) || before.some(isInlineDocumentNode)) {
    return next;
  }
  const used = new Set<number>();
  let cursor = 0;
  const content = after.map((child, index) => {
    const shape = documentNodeShape(child);
    for (let at = cursor; at < before.length; at += 1) {
      if (!used.has(at) && documentNodeShape(before[at]) === shape) {
        used.add(at);
        cursor = at + 1;
        return before[at];
      }
    }
    const placed = before[index];
    if (placed && !used.has(index) && placed.type === child.type) {
      used.add(index);
      const kept = withUnchangedDocumentIdentity(placed, child);
      if (kept === placed) return placed;
      const identity: Record<string, unknown> = {};
      for (const key of [MRNOTE_BLOCK_ID_ATTR, MRNOTE_SOURCE_ATTR]) {
        const value = (placed.attrs as Record<string, unknown> | undefined)?.[key];
        if (value !== undefined && value !== null) identity[key] = value;
      }
      return { ...kept, attrs: { ...(placed.attrs || {}), ...(kept.attrs || {}), ...identity } };
    }
    return child;
  });
  return { ...next, content };
}

const WORD_PARAGRAPH_BLOCKS = new Set(["paragraph", "heading"]);

function preserveDocumentBlockAttrs(
  target: ProseMirrorNode,
  nextNode: JSONContent,
  extraAttrs?: Record<string, unknown>,
): JSONContent {
  const targetAttrs = target.attrs || {};
  const sameType = nextNode.type === target.type.name;
  if (sameType) nextNode = withUnchangedDocumentIdentity(target.toJSON() as JSONContent, nextNode);
  // A Word paragraph stays one as a heading or a paragraph (its style
  // changes); a list or table made of it is another structure.
  const samePackageNode =
    sameType || (WORD_PARAGRAPH_BLOCKS.has(target.type.name) && WORD_PARAGRAPH_BLOCKS.has(String(nextNode.type)));
  const base = {
    ...(sameType ? targetAttrs : {}),
    ...(nextNode.attrs || {}),
  } as Record<string, unknown>;
  // extraAttrs is a Copilot patch: a path key ("format.legend") writes one
  // leaf of a nested attribute instead of landing as a literal key.
  const patched = applyAttrPatch(base, extraAttrs || {}) ?? base;
  const attrs = {
    ...patched,
    [MRNOTE_BLOCK_ID_ATTR]: targetAttrs[MRNOTE_BLOCK_ID_ATTR],
    // A Mermaid block's `source` is its diagram text, not an import anchor:
    // keeping the target's dropped every Copilot edit of the diagram while
    // the apply still reported success. A block of another type is not the
    // imported block: it claims no import anchor (an empty numbered list
    
    [MRNOTE_SOURCE_ATTR]:
      nextNode.type === "mermaid"
        ? patched[MRNOTE_SOURCE_ATTR]
        : samePackageNode
          ? targetAttrs[MRNOTE_SOURCE_ATTR]
          : undefined,
  };
  if (!attrs[MRNOTE_SOURCE_ATTR]) {
    delete attrs[MRNOTE_SOURCE_ATTR];
  }
  return {
    ...nextNode,
    attrs,
  };
}

function textNodeForDocumentBlock(
  target: ProseMirrorNode,
  text: string,
): JSONContent {
  if (target.type.name === "blockquote") {
    return {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    };
  }
  return {
    type: target.type.name,
    content: text ? [{ type: "text", text }] : [],
  };
}

function replacementNodesForDocumentBlock(
  target: ProseMirrorNode,
  operation: Extract<NativeDocumentOperation, { op: "update_document_block" }>,
): JSONContent[] | null {
  if (operation.node) {
    return [
      preserveDocumentBlockAttrs(target, operation.node, operation.attrs),
    ];
  }
  if (operation.nodes && operation.nodes.length > 0) {
    return operation.nodes.map((node, index) =>
      index === 0
        ? preserveDocumentBlockAttrs(target, node, operation.attrs)
        : node,
    );
  }
  if (operation.content) {
    const content = Array.isArray(operation.content)
      ? operation.content
      : [operation.content];
    return [
      preserveDocumentBlockAttrs(
        target,
        {
          type: target.type.name,
          content,
        },
        operation.attrs,
      ),
    ];
  }
  if (typeof operation.text === "string" && operation.text.trim().length > 0) {
    const parsed = markdownToDocumentContent(operation.text);
    const first = parsed[0];
    const plainParagraph =
      parsed.length === 1 &&
      first?.type === "paragraph" &&
      !operation.text.trimStart().startsWith("#");
    // A heading's words stay a heading: "9. Results" is its words, not a
    // numbered list (a heading turned into one lost its level and number).
    const keepsHeading = target.type.name === "heading" && !(parsed.length === 1 && first?.type === "heading");
    const replacement =
      keepsHeading || (plainParagraph && target.type.name !== "paragraph")
        ? textNodeForDocumentBlock(target, operation.text)
        : parsed.length === 1 && first
          ? first
          : textNodeForDocumentBlock(target, operation.text);
    return [preserveDocumentBlockAttrs(target, replacement, operation.attrs)];
  }
  if (operation.attrs) {
    return [
      preserveDocumentBlockAttrs(
        target,
        target.toJSON() as JSONContent,
        operation.attrs,
      ),
    ];
  }
  return null;
}

function applyDocumentBlockUpdate(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "update_document_block" }>,
): boolean {
  const target = findDocumentNodeByBlockId(editor, operation.block_id);
  if (target === null) return false;
  const replacement = replacementNodesForDocumentBlock(target.node, operation);
  if (!replacement || replacement.length === 0) return false;
  // `preserveDocumentBlockAttrs` merges the target/patch attrs after command
  // carrier normalization. Canonicalize once more at the actual replacement
  // boundary so a chart update cannot reintroduce inactive or arbitrary attrs.
  const canonicalReplacement = canonicalDocumentNodesForApply(replacement);
  if (!canonicalReplacement || canonicalReplacement.length === 0) return false;
  try {
    return editor
      .chain()
      .focus()
      .insertContentAt(
        { from: target.pos, to: target.pos + target.node.nodeSize },
        canonicalReplacement,
      )
      .run();
  } catch {
    return false;
  }
}

function applyDocumentBlockDelete(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "delete_document_block" }>,
): boolean {
  const target = findDocumentNodeByBlockId(editor, operation.block_id);
  if (target === null) return false;
  return editor
    .chain()
    .focus()
    .deleteRange({ from: target.pos, to: target.pos + target.node.nodeSize })
    .run();
}

function applyDocumentBlockMove(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "move_document_block" }>,
): boolean {
  // Block-FLOW coordinates (pageBlock+): positions come from the flow
  // across page sheets, so every insert target sits INSIDE a sheet (a
  // depth-0 insert would refit into a phantom page). Limitation (v1,
  // documented): moving the SOLE block of a sheet leaves that sheet empty
  // mid-transaction, which the schema rejects — the move fails closed and
  // reports false; the rebalancer keeps sheets multi-block in practice.
  const flow = collectDocumentBlockFlow(editor.state.doc);
  const source =
    flow.find((entry) => entry.node.attrs?.block_id === operation.block_id) ??
    null;
  if (source === null) return false;
  let insertAt: number | null = null;
  if (operation.position === "start") {
    insertAt = flow.length > 0 ? flow[0].pos : 1;
  } else if (operation.position === "end") {
    const last = flow[flow.length - 1];
    insertAt = last.pos + last.node.nodeSize;
  } else if (operation.position === "up") {
    if (source.index === 0) return false;
    insertAt = flow[source.index - 1].pos;
  } else if (operation.position === "down") {
    if (source.index >= flow.length - 1) return false;
    const next = flow[source.index + 1];
    insertAt = next.pos + next.node.nodeSize;
  } else {
    const targetBlockId = operation.target_block_id;
    if (!targetBlockId || targetBlockId === operation.block_id) return false;
    const target = findTopLevelDocumentNodeByBlockId(editor, targetBlockId);
    if (target === null) return false;
    insertAt =
      operation.position === "before"
        ? target.pos
        : target.pos + target.node.nodeSize;
  }
  if (insertAt === null) return false;
  const sourceFrom = source.pos;
  const sourceTo = source.pos + source.node.nodeSize;
  if (insertAt >= sourceFrom && insertAt <= sourceTo) return false;
  const adjustedInsertAt =
    insertAt > sourceFrom ? insertAt - source.node.nodeSize : insertAt;
  try {
    const movedNode = editor.schema.nodeFromJSON(source.node.toJSON());
    const tr = editor.state.tr
      .delete(sourceFrom, sourceTo)
      .insert(adjustedInsertAt, movedNode)
      .scrollIntoView();
    editor.view.dispatch(tr);
    focusDocumentEditor(editor);
    return true;
  } catch {
    return false;
  }
}

/** EMU per CSS pixel at 96 dpi (914400 EMU per inch). */
const DOCUMENT_IMAGE_EMU_PER_PX = EMU_PER_PX;

/**
 * The size an image takes from a resize command (Format Picture > Size), as
 * one attrs patch whose pixel and EMU sizes agree. A side may be given in
 * pixels or EMU; a scale multiplies both. When only one side is given the
 * other follows the picture's aspect ratio, as Word's Lock aspect ratio does
 * for a picture by default; giving both sides sets both.
 */
export function imageResizePatchFromOperation(
  attrs: Record<string, unknown>,
  operation: Extract<NativeDocumentOperation, { op: "resize_document_image" }>,
): Record<string, number> | null {
  if (!imageResizeWithinCommandBudget(operation)) return null;
  const number = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;
  const currentWidth =
    number(attrs.width) ??
    (number(attrs.widthEmu) !== null
      ? (attrs.widthEmu as number) / DOCUMENT_IMAGE_EMU_PER_PX
      : null);
  const currentHeight =
    number(attrs.height) ??
    (number(attrs.heightEmu) !== null
      ? (attrs.heightEmu as number) / DOCUMENT_IMAGE_EMU_PER_PX
      : null);
  let width =
    operation.width ??
    (operation.widthEmu !== undefined
      ? operation.widthEmu / DOCUMENT_IMAGE_EMU_PER_PX
      : undefined);
  let height =
    operation.height ??
    (operation.heightEmu !== undefined
      ? operation.heightEmu / DOCUMENT_IMAGE_EMU_PER_PX
      : undefined);
  if (width === undefined && height === undefined) {
    if (operation.scale === undefined) return null;
    if (currentWidth !== null) width = currentWidth * operation.scale;
    if (currentHeight !== null) height = currentHeight * operation.scale;
  } else if (
    attrs.lockAspectRatio !== false &&
    currentWidth !== null &&
    currentHeight !== null
  ) {
    if (width === undefined && height !== undefined) {
      width = currentWidth * (height / currentHeight);
    } else if (height === undefined && width !== undefined) {
      height = currentHeight * (width / currentWidth);
    }
  }
  const patch: Record<string, number> = {};
  const set = (key: "width" | "height", px: number | undefined) => {
    if (px === undefined) return;
    const pixels = boundedDocumentImageDimension(
      px,
      MAX_DOCUMENT_IMAGE_DIMENSION_PX,
    );
    if (pixels === null) return;
    patch[key] = pixels;
    const emu = boundedDocumentImageDimension(
      px * DOCUMENT_IMAGE_EMU_PER_PX,
      MAX_DOCUMENT_IMAGE_DIMENSION_EMU,
    );
    const emuKey = key === "width" ? "widthEmu" : "heightEmu";
    if (emu !== null && (number(attrs[emuKey]) !== null || operation[emuKey] !== undefined)) {
      patch[emuKey] = emu;
    }
  };
  set("width", width);
  set("height", height);
  return Object.keys(patch).length > 0 ? patch : null;
}

function applyDocumentImageResize(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "resize_document_image" }>,
): boolean {
  const target = findDocumentNodeByBlockId(editor, operation.block_id, "image");
  if (target === null) return false;
  const patch = imageResizePatchFromOperation(
    (target.node.attrs || {}) as Record<string, unknown>,
    operation,
  );
  if (!patch) return false;
  return applyDocumentNodeAttrs(editor, {
    op: "update_document_node_attrs",
    block_id: operation.block_id,
    node_type: "image",
    patch,
  });
}

function attrsObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const attrs = value as Record<string, unknown>;
  return Object.keys(attrs).length > 0 ? { ...attrs } : undefined;
}

function paragraphFromCell(cell: JSONContent): JSONContent | undefined {
  const content = Array.isArray(cell.content) ? cell.content : [];
  return content.find((child) => child?.type === "paragraph");
}

function paragraphAttrsFromCell(
  cell: JSONContent,
): Record<string, unknown> | undefined {
  const paragraph = paragraphFromCell(cell);
  return attrsObject(paragraph?.attrs);
}

function textMarksFromCell(
  cell: JSONContent,
): JSONContent["marks"] | undefined {
  const paragraph = paragraphFromCell(cell);
  const content = Array.isArray(paragraph?.content) ? paragraph.content : [];
  const markedText = content.find(
    (child) =>
      child?.type === "text" &&
      typeof child.text === "string" &&
      Array.isArray(child.marks) &&
      child.marks.length > 0,
  );
  if (!Array.isArray(markedText?.marks) || markedText.marks.length === 0) {
    return undefined;
  }
  return markedText.marks.map((mark) => {
    const attrs = attrsObject(mark.attrs);
    return {
      ...mark,
      ...(attrs ? { attrs } : {}),
    };
  });
}

export function tableCellWithText(cell: JSONContent, value: string): JSONContent {
  const paragraphAttrs = paragraphAttrsFromCell(cell);
  const marks = textMarksFromCell(cell);
  return {
    ...cell,
    content: [
      {
        type: "paragraph",
        ...(paragraphAttrs ? { attrs: paragraphAttrs } : {}),
        content: value
          ? [
              {
                type: "text",
                text: value,
                ...(marks ? { marks } : {}),
              },
            ]
          : [],
      },
    ],
  };
}

function documentTableWithUpdatedCells(
  target: ProseMirrorNode,
  values: string[][],
  startRow = 0,
  startCol = 0,
): JSONContent | null {
  if (target.type.name !== "table") return null;
  const table = target.toJSON() as JSONContent;
  const rows = Array.isArray(table.content) ? table.content : [];
  if (startRow + values.length > rows.length) return null;
  let canPatchInPlace = true;
  const nextRows = rows.map((row, rowIndex) => {
    const nextValues = values[rowIndex - startRow];
    if (!nextValues) return row;
    const cells = Array.isArray(row.content) ? row.content : [];
    if (startCol + nextValues.length > cells.length) {
      canPatchInPlace = false;
      return row;
    }
    return {
      ...row,
      content: cells.map((cell, cellIndex) =>
        cellIndex >= startCol && cellIndex < startCol + nextValues.length
          ? tableCellWithText(cell, nextValues[cellIndex - startCol])
          : cell,
      ),
    };
  });
  if (!canPatchInPlace) return null;
  return {
    ...table,
    content: nextRows,
  };
}

function firstTextSelectionPositionInNode(
  node: ProseMirrorNode,
  absolutePos: number,
): number | null {
  if (node.isTextblock) return absolutePos + 1;
  let offset = 0;
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const found = firstTextSelectionPositionInNode(
      child,
      absolutePos + 1 + offset,
    );
    if (found !== null) return found;
    offset += child.nodeSize;
  }
  return null;
}

function documentTableSelectionPosition(
  target: { pos: number; node: ProseMirrorNode },
  rowIndex: number,
  colIndex: number,
): number | null {
  if (target.node.type.name !== "table") return null;
  let rowOffset = 0;
  let logicalRow = 0;
  for (let rowPos = 0; rowPos < target.node.childCount; rowPos += 1) {
    const row = target.node.child(rowPos);
    const absoluteRowPos = target.pos + 1 + rowOffset;
    rowOffset += row.nodeSize;
    if (row.type.name !== "tableRow") continue;
    if (logicalRow !== rowIndex) {
      logicalRow += 1;
      continue;
    }
    let cellOffset = 0;
    let logicalCol = 0;
    for (let cellPos = 0; cellPos < row.childCount; cellPos += 1) {
      const cell = row.child(cellPos);
      const absoluteCellPos = absoluteRowPos + 1 + cellOffset;
      cellOffset += cell.nodeSize;
      if (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader") {
        continue;
      }
      if (logicalCol === colIndex) {
        return firstTextSelectionPositionInNode(cell, absoluteCellPos);
      }
      logicalCol += 1;
    }
    return null;
  }
  return null;
}

function applyDocumentTableStructureEdit(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "edit_document_table" }>,
): boolean {
  const target = findDocumentNodeByBlockId(editor, operation.block_id, "table");
  if (target === null) return false;
  // No row or column named: after the last, as the Copilot's projection reads it.
  const position = documentTableSelectionPosition(
    target,
    operation.row_index ?? (operation.action === "add_row_after" ? Math.max(0, target.node.childCount - 1) : 0),
    operation.col_index ??
      (operation.action === "add_column_after" ? Math.max(0, (target.node.firstChild?.childCount ?? 1) - 1) : 0),
  );
  if (position === null) return false;

  type TableStructureChain = ReturnType<Editor["chain"]> & {
    setTextSelection: (position: number) => TableStructureChain;
    addRowAfter: () => TableStructureChain;
    addRowBefore: () => TableStructureChain;
    addColumnAfter: () => TableStructureChain;
    addColumnBefore: () => TableStructureChain;
    deleteRow: () => TableStructureChain;
    deleteColumn: () => TableStructureChain;
    toggleHeaderRow: () => TableStructureChain;
    deleteTable: () => TableStructureChain;
  };
  const chain = editor
    .chain()
    .focus()
    .setTextSelection(position) as unknown as TableStructureChain;
  if (operation.action === "add_row_after") chain.addRowAfter();
  else if (operation.action === "add_row_before") chain.addRowBefore();
  else if (operation.action === "add_column_after") chain.addColumnAfter();
  else if (operation.action === "add_column_before") chain.addColumnBefore();
  else if (operation.action === "delete_row") chain.deleteRow();
  else if (operation.action === "delete_column") chain.deleteColumn();
  else if (operation.action === "toggle_header_row") chain.toggleHeaderRow();
  else if (operation.action === "delete_table") chain.deleteTable();
  else return false;
  if (!chain.run()) return false;
  const values = Array.isArray(operation.values) ? operation.values : null;
  if (!values || !values.length) return true;
  // The new line's text came with the structure action: write it where the
  // line landed. A row action's values are one row; a column action's are one
  // value per row.
  const rowIndex = operation.row_index ?? 0;
  const colIndex = operation.col_index ?? 0;
  const fill =
    operation.action === "add_row_after"
      ? { start_row: rowIndex + 1, start_col: 0, values: [values[0] ?? []] }
      : operation.action === "add_row_before"
        ? { start_row: rowIndex, start_col: 0, values: [values[0] ?? []] }
        : operation.action === "add_column_after"
          ? { start_row: 0, start_col: colIndex + 1, values: values.map((row) => [row[0] ?? ""]) }
          : operation.action === "add_column_before"
            ? { start_row: 0, start_col: colIndex, values: values.map((row) => [row[0] ?? ""]) }
            : null;
  if (!fill || !fill.values.some((row) => row.length)) return true;
  return applyDocumentTableCellsUpdate(editor, {
    op: "update_document_table_cells",
    block_id: operation.block_id,
    ...fill,
  });
}

function applyDocumentTableCellsUpdate(
  editor: Editor,
  operation: Extract<
    NativeDocumentOperation,
    { op: "update_document_table_cells" }
  >,
): boolean {
  const values = Array.isArray(operation.values) ? operation.values : [];
  if (
    values.length > 0 &&
    !stringMatrixWithinBudget(values, {
      maxRows: MAX_DOCUMENT_TABLE_COMMAND_ROWS,
      maxCols: MAX_DOCUMENT_TABLE_COMMAND_COLS,
      maxCellChars: MAX_COMMAND_CELL_CHARS,
    })
  ) {
    return false;
  }
  const target = findDocumentNodeByBlockId(editor, operation.block_id, "table");
  if (target === null) return false;
  const startRow = operation.start_row ?? 0;
  const startCol = operation.start_col ?? 0;
  // Reject a non-integer / negative offset (mirrors the spreadsheet fill_cells
  // guard). Otherwise a negative offset matched no cell — the table came back
  // unchanged yet the op was reported APPLIED (edit silently dropped) — and a
  // fractional offset wrote an empty paragraph into the wrong (adjacent) cell.
  if (
    !Number.isInteger(startRow) ||
    startRow < 0 ||
    !Number.isInteger(startCol) ||
    startCol < 0
  ) {
    return false;
  }
  // Three shapes, applied in this order: cell text (values), cell formatting
  // (patch) on a rectangle, then a whole-table node when nothing else was
  // asked. A patch used to be impossible and a node was ignored whenever the
  // (possibly empty) values patched "successfully", so a formatting request
  // came back applied with the table unchanged.
  let replacement: JSONContent | null = null;
  if (values.length > 0) {
    replacement = documentTableWithUpdatedCells(target.node, values, startRow, startCol);
    if (!replacement) return false;
  }
  if (operation.patch && Object.keys(operation.patch).length > 0) {
    const { marks, ...attrsOnly } = operation.patch;
    const cellAttrs = normalizedTableCellAttrPatch(attrsOnly);
    const cellMarks = marks === undefined ? {} : normalizedCellMarkPatch(marks);
    if (cellAttrs === null || cellMarks === null) return false;
    replacement = documentTableWithPatchedCells(
      replacement ?? (target.node.toJSON() as JSONContent),
      cellAttrs,
      startRow,
      startCol,
      operation.row_count,
      operation.col_count,
      cellMarks,
    );
    if (!replacement) return false;
  }
  if (!replacement && operation.node) {
    replacement = preserveDocumentBlockAttrs(target.node, operation.node);
  }
  if (!replacement) return false;
  try {
    return editor
      .chain()
      .focus()
      .insertContentAt(
        { from: target.pos, to: target.pos + target.node.nodeSize },
        [replacement],
      )
      .run();
  } catch {
    return false;
  }
}

/**
 * The editor's own cell attribute set, normalised the way the ribbon does.
 * Returns null when a key is not a cell attribute or a value is invalid, so
 * a guessed name never "applies" as a silent no-op.
 */
function normalizedTableCellAttrPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === null) {
      out[key] = null;
      continue;
    }
    let value: unknown;
    if (key === "backgroundColor") value = normalizeCellBackgroundColor(raw);
    else if (key === "borderStyle") value = normalizeCellBorderStyle(raw);
    else if (key === "textAlign") value = normalizeCellTextAlign(raw);
    else if (key === "verticalAlign") value = normalizeCellVerticalAlign(raw);
    else if (key === "textDirection") value = normalizeCellTextDirection(raw);
    else if (key === "cellMargin") value = normalizeCellMargin(raw);
    else return null;
    if (value === null || value === undefined) return null;
    out[key] = value;
  }
  return out;
}

const IMAGE_SOURCE_AND_SIZE_KEYS = new Set([
  "src",
  "alt",
  "title",
  "width",
  "height",
  "widthEmu",
  "heightEmu",
]);

/**
 * Picture formatting through the image ribbon's own value sets
 * (imageControls.ts); the source and size keys pass as the route checked them.
 */
function normalizedImageAttrPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    // Identity keys are overridden below from the node itself.
    if (key === MRNOTE_BLOCK_ID_ATTR || key === MRNOTE_SOURCE_ATTR) continue;
    if (IMAGE_SOURCE_AND_SIZE_KEYS.has(key)) {
      out[key] = raw;
      continue;
    }
    if (raw === null) {
      out[key] = null;
      continue;
    }
    let value: unknown;
    if (key === "widthPercent") {
      value = Number.isInteger(raw) && (raw as number) >= 5 && (raw as number) <= 100 ? raw : null;
    } else if (key === "dataAlign") {
      value = (IMAGE_ALIGN_VALUES as readonly string[]).includes(String(raw)) ? raw : null;
    } else if (key === "dataFloat") {
      value = (IMAGE_FLOATS as readonly string[]).includes(String(raw)) ? raw : null;
    } else if (key === "pictureRotation") {
      value = typeof raw === "number" && Number.isFinite(raw) ? normalizeImageRotation(raw) : null;
    } else if (key === "pictureFlipHorizontal" || key === "pictureFlipVertical") {
      value = typeof raw === "boolean" ? raw : null;
    } else if (key === "pictureBorderWidth") {
      value =
        typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 12
          ? Math.round(raw * 4) / 4
          : null;
    } else if (key === "pictureBorderStyle") {
      value = (IMAGE_BORDER_STYLES as readonly string[]).includes(String(raw)) ? raw : null;
    } else if (key === "pictureBorderColor") {
      value = typeof raw === "string" && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
    } else return null;
    if (value === null || value === undefined) return null;
    out[key] = value;
  }
  return out;
}

const TYPED_DOCUMENT_ATTRS: Record<string, ReadonlySet<string>> = {
  table: new Set([
    "borderless",
    "tableStyleTotalRow",
    "tableStyleFirstColumn",
    "tableStyleLastColumn",
    "tableStyleBandedRows",
    "tableStyleBandedColumns",
  ]),
  tableCell: new Set([
    "backgroundColor",
    "borderStyle",
    "textAlign",
    "verticalAlign",
    "textDirection",
    "cellMargin",
  ]),
  paragraph: new Set([
    "textAlign",
    "dir",
    "indent",
    "lineHeight",
    "lineHeightPt",
    "lineHeightRule",
    "spaceBefore",
    "spaceAfter",
    "textIndent",
    "indentLeftPt",
    "indentRightPt",
    "firstLineIndentPt",
    "borderPreset",
    "shadingColor",
    "keepNext",
    "keepLines",
    "widowControl",
    "contextualSpacing",
  ]),
};
TYPED_DOCUMENT_ATTRS.tableHeader = TYPED_DOCUMENT_ATTRS.tableCell;
TYPED_DOCUMENT_ATTRS.heading = new Set([...TYPED_DOCUMENT_ATTRS.paragraph, "level"]);

function isTypedDocumentAttr(nodeType: string, key: string): boolean {
  return TYPED_DOCUMENT_ATTRS[nodeType]?.has(key) ?? false;
}

/** A scalar, or JSON small enough to be an attribute rather than a payload. */
function isBoundedAttrValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2000;
  try {
    return JSON.stringify(value).length <= 8000;
  } catch {
    return false;
  }
}

const PARAGRAPH_BOOLEAN_ATTRS = new Set([
  "keepNext",
  "keepLines",
  "widowControl",
  "contextualSpacing",
]);

/**
 * Paragraph and heading formatting through the ribbon's own normalisers
 * (DocumentFormatting.ts). Unknown keys and out-of-range values return null
 * so a guessed name never applies as a no-op; null clears an attribute.
 */
function normalizedParagraphAttrPatch(
  patch: Record<string, unknown>,
  heading: boolean,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === null) {
      out[key] = null;
      continue;
    }
    let value: unknown;
    if (key === "level" && heading) {
      value = Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= 6 ? raw : null;
    } else if (key === "textAlign") value = normalizeTextAlign(raw);
    else if (key === "dir") value = raw === "ltr" || raw === "rtl" ? raw : null;
    else if (key === "indent") {
      value = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 7 ? raw : null;
    } else if (key === "lineHeight") value = normalizeLineHeight(raw);
    else if (key === "lineHeightPt") value = normalizeLineHeightPt(raw);
    else if (key === "lineHeightRule") value = normalizeLineHeightRule(raw);
    else if (key === "spaceBefore" || key === "spaceAfter") value = normalizeSpacing(raw);
    else if (key === "textIndent") value = normalizeTextIndent(raw);
    else if (key === "indentLeftPt" || key === "indentRightPt" || key === "firstLineIndentPt") {
      value = normalizeIndentPt(raw);
    } else if (key === "borderPreset") value = normalizeBorderPreset(raw);
    else if (key === "shadingColor") value = normalizeShadingColor(raw);
    else if (PARAGRAPH_BOOLEAN_ATTRS.has(key)) value = typeof raw === "boolean" ? raw : null;
    else return null;
    if (value === null || value === undefined) return null;
    out[key] = value;
  }
  return out;
}

/** true adds a mark, null/false removes it, an object sets its attributes. */
type CellMarkPatch = Record<string, true | null | Record<string, unknown>>;
const PLAIN_CELL_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "superscript",
  "subscript",
  "doubleStrike",
  "smallCaps",
  "allCaps",
]);

/**
 * Text marks for every run in a rectangle of cells, through the editor's own
 * mark normalisers; an unknown mark or a malformed value refuses the patch.
 */
function normalizedCellMarkPatch(raw: unknown): CellMarkPatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: CellMarkPatch = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === false) {
      if (!PLAIN_CELL_MARKS.has(name) && !CELL_MARK_ATTRS[name]) return null;
      out[name] = null;
      continue;
    }
    if (PLAIN_CELL_MARKS.has(name)) {
      if (value !== true) return null;
      out[name] = true;
      continue;
    }
    const attr = CELL_MARK_ATTRS[name];
    if (!attr || !value || typeof value !== "object") return null;
    const normalized = attr.normalize((value as Record<string, unknown>)[attr.key]);
    if (normalized === null || normalized === undefined) return null;
    out[name] = { [attr.key]: normalized };
  }
  return Object.keys(out).length ? out : null;
}
const CELL_MARK_ATTRS: Record<string, { key: string; normalize: (value: unknown) => unknown }> = {
  fontSize: { key: "size", normalize: normalizeFontSize },
  fontFamily: { key: "family", normalize: normalizeFontFamily },
  textColor: { key: "color", normalize: normalizeTextColor },
  highlight: { key: "color", normalize: normalizeHighlightColor },
};

function withCellMarks(node: JSONContent, marks: CellMarkPatch): JSONContent {
  if (node.type === "text") {
    let next = (node.marks ?? []).filter((mark) => !(mark.type in marks));
    for (const [name, value] of Object.entries(marks)) {
      if (value === null) continue;
      next = [...next, value === true ? { type: name } : { type: name, attrs: value }];
    }
    return next.length ? { ...node, marks: next } : { ...node, marks: undefined };
  }
  return Array.isArray(node.content)
    ? { ...node, content: node.content.map((child) => withCellMarks(child, marks)) }
    : node;
}

const TABLE_STYLE_ATTR_KEYS = new Set([
  "borderless",
  "tableStyleTotalRow",
  "tableStyleFirstColumn",
  "tableStyleLastColumn",
  "tableStyleBandedRows",
  "tableStyleBandedColumns",
]);

function normalizedTableAttrPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    if (!TABLE_STYLE_ATTR_KEYS.has(key) || typeof raw !== "boolean") return null;
    out[key] = raw;
  }
  return out;
}

function documentTableWithPatchedCells(
  table: JSONContent,
  cellAttrs: Record<string, unknown>,
  startRow: number,
  startCol: number,
  rowCount?: number,
  colCount?: number,
  cellMarks: CellMarkPatch = {},
): JSONContent | null {
  if (table.type !== "table") return null;
  const rows = Array.isArray(table.content) ? table.content : [];
  if (startRow >= rows.length) return null;
  const endRow = rowCount === undefined ? rows.length : startRow + rowCount;
  let touched = 0;
  const nextRows = rows.map((row, rowIndex) => {
    if (rowIndex < startRow || rowIndex >= endRow) return row;
    const cells = Array.isArray(row.content) ? row.content : [];
    const endCol = colCount === undefined ? cells.length : startCol + colCount;
    return {
      ...row,
      content: cells.map((cell, cellIndex) => {
        if (cellIndex < startCol || cellIndex >= endCol) return cell;
        if (cell.type !== "tableCell" && cell.type !== "tableHeader") return cell;
        touched += 1;
        const attrs = { ...(cell.attrs || {}) };
        for (const [key, value] of Object.entries(cellAttrs)) {
          if (value === null) delete attrs[key];
          else attrs[key] = value;
        }
        const marked = Object.keys(cellMarks).length ? withCellMarks(cell, cellMarks) : cell;
        return { ...marked, attrs };
      }),
    };
  });
  if (touched === 0) return null;
  return { ...table, content: nextRows };
}

/**
 * A patch for one node type: the ribbon's own normalisers own the typed keys
 * and every other key must be one the node type declares (the editor's own
 * attribute normaliser reads it on render), never an invented one. Identity
 * keys are refused; null clears an attribute.
 */
function normalizedDocumentAttrPatch(
  nodeType: string,
  declared: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const typedKeys: Record<string, unknown> = {};
  const declaredOnly: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === MRNOTE_BLOCK_ID_ATTR || key === MRNOTE_SOURCE_ATTR) return null;
    if (isAttrPathKey(key)) {
      // One leaf of a declared nested attribute (a chart's format.legend):
      // the API checked the name against the vocabulary tree, the leaf is
      // bounded here and written by path when the node is updated.
      const path = parseAttrPath(key);
      if (!path || typeof path[0] !== "string" || !(path[0] in declared)) return null;
      if (path[0] === MRNOTE_BLOCK_ID_ATTR || path[0] === MRNOTE_SOURCE_ATTR) return null;
      if (!isBoundedAttrValue(value)) return null;
      declaredOnly[key] = value;
      continue;
    }
    if (isTypedDocumentAttr(nodeType, key)) typedKeys[key] = value;
    else if (key in declared && isBoundedAttrValue(value)) declaredOnly[key] = value;
    else return null;
  }
  let normalized: Record<string, unknown> | null = {};
  if (Object.keys(typedKeys).length) {
    normalized =
      nodeType === "table"
        ? normalizedTableAttrPatch(typedKeys)
        : nodeType === "paragraph" || nodeType === "heading"
          ? normalizedParagraphAttrPatch(typedKeys, nodeType === "heading")
          : nodeType === "tableCell" || nodeType === "tableHeader"
            ? normalizedTableCellAttrPatch(typedKeys)
            : typedKeys;
  }
  if (normalized === null) return null;
  return { ...declaredOnly, ...normalized };
}

/** Whether a patch path names a V2 chart's Show empty cells as
 * (`format.displayBlanksAs`, from `at` on: 0 on a Docs chart node, 1 under a
 * deck block's `chartV2`). */
function isDisplayBlanksPath(path: readonly (string | number)[] | null, at: number): boolean {
  return (
    path !== null &&
    path.length === at + 2 &&
    (at === 0 || path[0] === "chartV2") &&
    path[at] === "format" &&
    path[at + 1] === "displayBlanksAs"
  );
}

/**
 * A node's attributes with a normalised patch applied, or null when a path
 * cannot be written or the patched V2 chart no longer validates.
 */
function patchedDocumentNodeAttrs(
  node: ProseMirrorNode,
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const v2Chart =
    (node.type.name === "chart" || node.type.name === "inlineChart") &&
    node.attrs.schemaVersion === 2;
  // Show empty cells as goes through the one element intent, as the Hidden &
  // Empty Cells menu writes it (`chartWithDisplayBlanksLeaf`).
  const blanksKey = v2Chart
    ? Object.keys(patch).find((key) => isDisplayBlanksPath(parseAttrPath(key), 0))
    : undefined;
  const rest = blanksKey === undefined ? patch : { ...patch };
  if (blanksKey !== undefined) delete rest[blanksKey];
  let nextAttrs = applyAttrPatch({ ...node.attrs }, rest);
  if (!nextAttrs) return null;
  if (
    (node.type.name === "chart" || node.type.name === "inlineChart") &&
    nextAttrs.schemaVersion === 2
  ) {
    let completed = completedChartV2Attrs(nextAttrs);
    if (blanksKey !== undefined) {
      const { schemaVersion, chartType, chartSubtype, title, data, stylePreset, format } = completed;
      const leafed = chartWithDisplayBlanksLeaf(
        { schemaVersion, chartType, chartSubtype, title, data, stylePreset, format } as unknown as ChartBlockAttrsV2,
        patch[blanksKey],
      );
      if (!leafed) return null;
      completed = { ...completed, format: leafed.format };
    }
    const { schemaVersion, chartType, chartSubtype, title, axisTitleX, axisTitleY, data } =
      completed;
    const candidate = {
      schemaVersion,
      chartType,
      chartSubtype,
      title,
      axisTitleX,
      axisTitleY,
      data,
      stylePreset: completed.stylePreset,
      format: completed.format,
    };
    if (!validateChartBlockAttrsV2(candidate).valid) return null;
    nextAttrs = completed;
  }
  if (node.attrs[MRNOTE_BLOCK_ID_ATTR] !== undefined) {
    nextAttrs[MRNOTE_BLOCK_ID_ATTR] = node.attrs[MRNOTE_BLOCK_ID_ATTR];
  }
  if (node.attrs[MRNOTE_SOURCE_ATTR]) {
    nextAttrs[MRNOTE_SOURCE_ATTR] = node.attrs[MRNOTE_SOURCE_ATTR];
  } else {
    delete nextAttrs[MRNOTE_SOURCE_ATTR];
  }
  return nextAttrs;
}

/** The match of a page-wide operation against one node. */
export function documentNodeMatches(
  node: { type: string; attrs?: Record<string, unknown>; text: string },
  match: Extract<NativeDocumentOperation, { op: "update_document_nodes_where" }>["match"],
): boolean {
  if (!match) return true;
  if (match.text_contains !== undefined) {
    if (!node.text.toLowerCase().includes(String(match.text_contains).toLowerCase())) {
      return false;
    }
  }
  if (match.level !== undefined && node.attrs?.level !== match.level) return false;
  if (match.attrs) {
    for (const [key, value] of Object.entries(match.attrs)) {
      if (JSON.stringify(node.attrs?.[key] ?? null) !== JSON.stringify(value ?? null)) {
        return false;
      }
    }
  }
  return true;
}

function applyDocumentNodesWhere(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "update_document_nodes_where" }>,
): boolean {
  const marks =
    operation.marks === undefined ? {} : normalizedCellMarkPatch(operation.marks);
  if (marks === null) return false;
  if (!operation.patch && !Object.keys(marks).length) return false;
  const limit = operation.limit ?? 500;
  const found: { pos: number; node: ProseMirrorNode }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (found.length >= limit) return false;
    if (
      node.type.name === operation.node_type &&
      documentNodeMatches(
        { type: node.type.name, attrs: node.attrs, text: node.textContent },
        operation.match,
      )
    ) {
      found.push({ pos, node });
    }
    return true;
  });
  if (!found.length) return false;
  let tr = editor.state.tr;
  for (const { pos, node } of found) {
    if (operation.patch) {
      const normalized = normalizedDocumentAttrPatch(
        operation.node_type,
        node.type.spec.attrs ?? {},
        operation.patch,
      );
      if (normalized === null) return false;
      const nextAttrs = patchedDocumentNodeAttrs(node, normalized);
      if (nextAttrs === null) return false;
      tr = tr.setNodeMarkup(pos, undefined, nextAttrs, node.marks);
    }
    for (const [name, value] of Object.entries(marks)) {
      const markType = editor.schema.marks[name];
      if (!markType) return false;
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      if (to <= from) continue;
      tr = tr.removeMark(from, to, markType);
      if (value !== null) {
        tr = tr.addMark(from, to, markType.create(value === true ? undefined : value));
      }
    }
  }
  editor.view.dispatch(tr);
  return true;
}

function plainBlockText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainBlockText).join("");
}

/** The paragraph-like units a block is made of, with their inline content. */
function documentBlockUnits(node: JSONContent): JSONContent[] {
  const inline = (content: JSONContent[] | undefined): JSONContent => ({
    type: "paragraph",
    ...(content?.length ? { content } : {}),
  });
  switch (node.type) {
    case "paragraph":
    case "heading":
      return [inline(node.content)];
    case "codeBlock":
      return plainBlockText(node)
        .split("\n")
        .map((line) => inline(line ? [{ type: "text", text: line }] : undefined));
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? []).flatMap((item) =>
        (item.content ?? []).length
          ? (item.content ?? []).flatMap((child) => documentBlockUnits(child))
          : [inline(undefined)],
      );
    case "blockquote":
    case "callout":
      return (node.content ?? []).flatMap((child) => documentBlockUnits(child));
    default:
      return [inline([{ type: "text", text: plainBlockText(node) }])];
  }
}

/**
 * A block as another block type, keeping its text: the pure form the preview
 * projects and the applier writes. Null when the block cannot be converted.
 */
export function convertedDocumentBlocks(
  node: JSONContent,
  to: DocumentConvertibleBlockType,
  level?: number,
): JSONContent[] | null {
  const convertible = new Set([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "codeBlock",
  ]);
  if (!node.type || !convertible.has(node.type)) return null;
  const units = documentBlockUnits(node);
  if (!units.length) return null;
  if (to === "paragraph") return units;
  if (to === "heading") {
    const headingLevel = level ?? (node.type === "heading" ? (node.attrs?.level ?? 2) : 2);
    return units.map((unit) => ({ ...unit, type: "heading", attrs: { level: headingLevel } }));
  }
  if (to === "codeBlock") {
    const text = units.map(plainBlockText).join("\n");
    return [{ type: "codeBlock", ...(text ? { content: [{ type: "text", text }] } : {}) }];
  }
  if (to === "blockquote") {
    const inner = node.type === "blockquote" ? (node.content ?? []) : units;
    return [{ type: "blockquote", content: inner }];
  }
  const itemType = to === "taskList" ? "taskItem" : "listItem";
  return [
    {
      type: to,
      content: units.map((unit) => ({
        type: itemType,
        ...(to === "taskList" ? { attrs: { checked: false } } : {}),
        content: [unit],
      })),
    },
  ];
}

function applyConvertDocumentBlock(
  editor: Editor,
  operation: Extract<NativeDocumentOperation, { op: "convert_document_block" }>,
): boolean {
  const target = findDocumentNodeByBlockId(editor, operation.block_id);
  if (target === null) return false;
  const converted = convertedDocumentBlocks(
    target.node.toJSON() as JSONContent,
    operation.to,
    operation.level,
  );
  if (!converted) return false;
  try {
    const nodes = converted.map((json, index) =>
      editor.schema.nodeFromJSON(
        index === 0
          ? {
              ...json,
              attrs: {
                ...(json.attrs ?? {}),
                [MRNOTE_BLOCK_ID_ATTR]: target.node.attrs[MRNOTE_BLOCK_ID_ATTR],
              },
            }
          : json,
      ),
    );
    const tr = editor.state.tr.replaceWith(
      target.pos,
      target.pos + target.node.nodeSize,
      Fragment.fromArray(nodes),
    );
    tr.doc.check();
    editor.view.dispatch(tr);
    return true;
  } catch {
    return false;
  }
}

function applyDocumentNodeAttrs(
  editor: Editor,
  operation: Extract<
    NativeDocumentOperation,
    { op: "update_document_node_attrs" }
  >,
): boolean {
  const nodeType = operation.node_type ?? "image";
  // A path descends from the selected table to a row or cell; without one the
  // selected block is the node itself (a paragraph, an image, a chart).
  const target = findDocumentNodeByBlockId(
    editor,
    operation.block_id,
    operation.path?.length ? "table" : nodeType,
  );
  if (target === null) return false;
  if (recordHasInvalidInlineImageSrc(operation.patch)) return false;
  // A table structure: walk the path to the row or cell, and only accept the
  // editor's own attribute names with ribbon-normalised values.
  let named: { pos: number; node: ProseMirrorNode } = target;
  let patch: Record<string, unknown> = operation.patch;
  if (nodeType === "image") {
    const normalized = normalizedImageAttrPatch(operation.patch);
    if (normalized === null) return false;
    patch = normalized;
  }
  if (nodeType !== "image") {
    for (const index of operation.path ?? []) {
      if (!Number.isInteger(index) || index < 0 || index >= named.node.childCount) {
        return false;
      }
      let childPos = named.pos + 1;
      for (let i = 0; i < index; i += 1) childPos += named.node.child(i).nodeSize;
      named = { pos: childPos, node: named.node.child(index) };
    }
    if (named.node.type.name !== nodeType) return false;
    const normalized = normalizedDocumentAttrPatch(
      nodeType,
      named.node.type.spec.attrs ?? {},
      operation.patch,
    );
    if (normalized === null) return false;
    patch = normalized;
  }
  const nextAttrs = patchedDocumentNodeAttrs(named.node, patch);
  if (nextAttrs === null) return false;
  const tr = editor.state.tr.setNodeMarkup(
    named.pos,
    undefined,
    nextAttrs,
    named.node.marks,
  );
  editor.view.dispatch(tr);
  return true;
}

const CHART_COMMAND_TECHNICAL_ATTRS = [
  MRNOTE_BLOCK_ID_ATTR,
  MRNOTE_SOURCE_ATTR,
  "sourcePageBreakBefore",
] as const;

function canonicalDocumentNodesForApply(
  nodes: JSONContent[],
): JSONContent[] | null {
  const canonical: JSONContent[] = [];
  for (const node of nodes) {
    const normalized = canonicalDocumentNodeForApply(node);
    if (normalized === null) return null;
    canonical.push(normalized);
  }
  return canonical;
}

/** A node as the apply writes it (a chart's attributes normalised, a chart
 * that does not validate refused): the Copilot's preview projects through
 * it, so what it shows is what 应用修改 writes. */
export function canonicalDocumentNodeForApply(node: JSONContent): JSONContent | null {
  const canonicalContent = node.content
    ? canonicalDocumentNodesForApply(node.content)
    : undefined;
  if (canonicalContent === null) return null;
  const canonicalNode = canonicalContent
    ? { ...node, content: canonicalContent }
    : { ...node };
  // A block chart and its In Line with Text spelling are one chart.
  if (node.type !== "chart" && node.type !== "inlineChart") return canonicalNode;
  const rawAttrs =
    node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)
      ? (node.attrs as Record<string, unknown>)
      : {};

  const normalized = normalizeChartBlockAttrs(rawAttrs);
  if (!normalized.validation.valid) return null;
  const attrs: Record<string, unknown> = { ...normalized.attrs };
  for (const key of CHART_COMMAND_TECHNICAL_ATTRS) {
    if (Object.prototype.hasOwnProperty.call(rawAttrs, key)) {
      attrs[key] = rawAttrs[key];
    }
  }
  return { ...canonicalNode, attrs };
}

function canonicalDocumentContentForApply(
  content: JSONContent | JSONContent[],
): JSONContent | JSONContent[] | null {
  return Array.isArray(content)
    ? canonicalDocumentNodesForApply(content)
    : canonicalDocumentNodeForApply(content);
}

function canonicalDocumentOperationForApply(
  operation: NativeDocumentOperation,
): NativeDocumentOperation | null {
  if (operation.op === "insert_node") {
    const node = canonicalDocumentNodeForApply(operation.node);
    return node ? { ...operation, node } : null;
  }
  if (
    operation.op === "insert_block_after" ||
    operation.op === "insert_block_before"
  ) {
    const inserted = insertedDocumentBlocks(operation);
    const nodes = inserted ? canonicalDocumentNodesForApply(inserted) : null;
    if (!nodes) return null;
    return operation.nodes
      ? { ...operation, nodes }
      : { ...operation, node: nodes[0] };
  }
  if (operation.op === "replace_selection" || operation.op === "insert_text") {
    if (operation.content === undefined) return operation;
    const content = canonicalDocumentContentForApply(operation.content);
    return content ? { ...operation, content } : null;
  }
  if (operation.op === "update_document_block") {
    const node = operation.node
      ? canonicalDocumentNodeForApply(operation.node)
      : undefined;
    if (node === null) return null;
    const nodes = operation.nodes
      ? canonicalDocumentNodesForApply(operation.nodes)
      : undefined;
    if (nodes === null) return null;
    const content = operation.content
      ? canonicalDocumentContentForApply(operation.content)
      : undefined;
    if (content === null) return null;
    return { ...operation, node, nodes, content };
  }
  if (operation.op === "update_document_table_cells" && operation.node) {
    const node = canonicalDocumentNodeForApply(operation.node);
    return node ? { ...operation, node } : null;
  }
  return operation;
}

/** Whether every node an operation carries is one this editor can build: a
 * node or mark type it does not have makes the insertion silently empty (an
 * AI's tracked insert written with an `insertion` mark saved its paragraph
 * with no words, AI70H H139 C05-ar-tr), so such an operation is refused
 * instead. */
const NODE_CARRYING_DOCUMENT_OPS: ReadonlySet<string> = new Set([
  "insert_node", "insert_block_after", "insert_block_before", "replace_selection", "insert_text",
  "update_document_block", "update_document_table_cells",
]);

function operationNodesFitSchema(editor: Editor, operation: NativeDocumentOperation): boolean {
  if (!NODE_CARRYING_DOCUMENT_OPS.has(operation.op)) return true;
  const record = operation as unknown as Record<string, unknown>;
  const carried: unknown[] = [];
  for (const key of ["node", "nodes", "content"] as const) {
    const value = record[key];
    if (Array.isArray(value)) carried.push(...value);
    else if (value && typeof value === "object") carried.push(value);
  }
  try {
    for (const json of carried) editor.schema.nodeFromJSON(json);
    return true;
  } catch {
    return false;
  }
}

function executeOperation(
  editor: Editor,
  operation: NativeDocumentOperation,
  context?: ExecuteDocumentCommandContext,
): boolean {
  if (!operationNodesFitSchema(editor, operation)) return false;
  if (operation.op === "insert_node") {
    if (operation.position === "end") {
      return editor
        .chain()
        .focus()
        .insertContentAt(
          documentBlockFlowBoundary(editor.state.doc, "end"),
          operation.node,
          { updateSelection: false },
        )
        .run();
    }
    return editor.chain().focus().insertContent(operation.node).run();
  }

  if (
    operation.op === "insert_block_after" ||
    operation.op === "insert_block_before"
  ) {
    const nodes = insertedDocumentBlocks(operation);
    if (!nodes) return false;
    const before = operation.op === "insert_block_before";
    const targetBlockId = operation.block_id || context?.blockId || null;
    if (before && !targetBlockId) return false;
    let insertAt = documentBlockFlowBoundary(editor.state.doc, "end");
    if (targetBlockId) {
      const target = findTopLevelDocumentNodeByBlockId(editor, targetBlockId);
      if (!target) return false;
      insertAt = before ? target.pos : target.pos + target.node.nodeSize;
    }
    return editor
      .chain()
      .focus()
      .insertContentAt(insertAt, nodes.length === 1 ? nodes[0] : nodes, {
        updateSelection: false,
      })
      .run();
  }

  if (operation.op === "replace_selection") {
    const content = operationContent(operation);
    if (context?.selectionRange) {
      return editor
        .chain()
        .focus()
        .insertContentAt(context.selectionRange, content)
        .run();
    }
    return editor.chain().focus().insertContent(content).run();
  }

  if (operation.op === "insert_document_image") {
    return applyDocumentImageInsert(editor, operation, context);
  }

  if (operation.op === "replace_document_text") {
    return applyDocumentTextReplacement(editor, operation);
  }

  if (operation.op === "format_selection") {
    return applyFormatSelection(editor, operation);
  }

  if (operation.op === "update_document_block") {
    return applyDocumentBlockUpdate(editor, operation);
  }

  if (operation.op === "delete_document_block") {
    return applyDocumentBlockDelete(editor, operation);
  }

  if (operation.op === "move_document_block") {
    return applyDocumentBlockMove(editor, operation);
  }

  if (operation.op === "resize_document_image") {
    return applyDocumentImageResize(editor, operation);
  }

  if (operation.op === "update_document_node_attrs") {
    return applyDocumentNodeAttrs(editor, operation);
  }

  if (operation.op === "update_document_table_cells") {
    return applyDocumentTableCellsUpdate(editor, operation);
  }

  if (operation.op === "edit_document_table") {
    return applyDocumentTableStructureEdit(editor, operation);
  }

  if (operation.op === "update_document_nodes_where") {
    return applyDocumentNodesWhere(editor, operation);
  }

  if (operation.op === "convert_document_block") {
    return applyConvertDocumentBlock(editor, operation);
  }

  if (operation.op !== "insert_text") {
    return false;
  }

  const content = operationContent(operation);
  if (operation.position === "start") {
    return editor.chain().focus("start").insertContentAt(0, content).run();
  }

  if (operation.position === "end") {
    // Block-level payloads (heading / list / table nodes from the markdown
    // conversion) must land at the TOP-LEVEL document end. focus("end") puts
    // the caret INSIDE the last block, where ProseMirror's fitter unwraps a
    // heading into that paragraph and clones its attrs (duplicate block_id)
    // onto the split remainder — observed live: "## 小节" applied as two
    // paragraphs sharing one block_id. Mirrors the image insert's end branch.
    if (insertPayloadHasBlockNode(content)) {
      return editor
        .chain()
        .focus()
        .insertContentAt(
          documentBlockFlowBoundary(editor.state.doc, "end"),
          content,
          { updateSelection: false },
        )
        .run();
    }
    return editor.chain().focus("end").insertContent(content).run();
  }

  if (operation.position === "after_selection") {
    const { to } = context?.selectionRange ?? editor.state.selection;
    return editor.chain().focus().insertContentAt(to, content).run();
  }

  return editor.chain().focus().insertContent(content).run();
}

export function executeDocumentCommand(
  editor: Editor,
  command: NativeDocumentCommand,
  context?: ExecuteDocumentCommandContext,
): boolean {
  return executeDocumentCommandWithResult(editor, command, context).ok;
}

export function executeDocumentCommandWithResult(
  editor: Editor,
  command: NativeDocumentCommand,
  context?: ExecuteDocumentCommandContext,
): ExecuteDocumentCommandResult {
  const validation = validateNativeDocumentCommandForApply(command);
  if (!validation.ok) {
    return {
      ok: false,
      appliedOperations: 0,
      rejectedOperations: isNativeDocumentCommand(command)
        ? Math.max(command.operations.length, 1)
        : 1,
      rejectionReason: validation.reason,
    };
  }
  const before = editor.getJSON();
  const rawFrom = command.command_context?.selection_from;
  const rawTo = command.command_context?.selection_to;
  const from =
    typeof rawFrom === "number"
      ? rawFrom
      : Number.parseInt(String(rawFrom ?? ""), 10);
  const to =
    typeof rawTo === "number"
      ? rawTo
      : Number.parseInt(String(rawTo ?? ""), 10);
  // Clamp the saved selection range to the *live* doc before handing it to
  // tiptap. The range echoed in command_context can be stale (e.g. the user
  // deleted earlier content after the AI proposed the edit), and an
  // out-of-range position makes insertContentAt -> doc.resolve throw a
  // RangeError outside tiptap's own try/catch. A clamped (possibly collapsed)
  // range applies at a valid in-range position instead of throwing/hanging.
  let selectionRange: { from: number; to: number } | undefined;
  if (Number.isFinite(from) && Number.isFinite(to)) {
    const maxPos = editor.state.doc.content.size;
    const clampedFrom = Math.max(0, Math.min(from, maxPos));
    const clampedTo = Math.max(clampedFrom, Math.min(to, maxPos));
    selectionRange = { from: clampedFrom, to: clampedTo };
  }
  const commandBlockId = command.command_context?.block_id;
  const blockId =
    context?.blockId ??
    (typeof commandBlockId === "string" && commandBlockId.trim()
      ? commandBlockId
      : null);
  const commandContext: ExecuteDocumentCommandContext = {
    ...context,
    selectionRange: context?.selectionRange ?? selectionRange,
    blockId,
  };
  let appliedOperations = 0;
  let rejectedOperations = 0;
  let rejectionReason: NativeDocumentCommandRejectionReason | undefined;
  try {
    for (const operation of command.operations) {
      const canonicalOperation = canonicalDocumentOperationForApply(operation);
      if (canonicalOperation === null) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        break;
      }
      const ok = executeOperation(editor, canonicalOperation, commandContext);
      if (ok) {
        appliedOperations += 1;
        continue;
      }
      rejectedOperations += 1;
      rejectionReason ||= documentOperationRejectionReason(operation);
      break;
    }
  } catch {
    // Any thrown error (e.g. a future op resolving an out-of-range position)
    // is treated like a rejected op: roll the editor back to `before` so a
    // multi-op command can never leave half-applied state on screen, and
    // return a terminal failed result so the AI card resolves instead of
    // hanging on "applying".
    restoreDocumentContent(editor, before);
    return {
      ok: false,
      appliedOperations: 0,
      rejectedOperations: 1,
      rejectionReason: "invalid_command",
    };
  }
  if (rejectedOperations > 0) {
    const restored = restoreDocumentContent(editor, before);
    return {
      ok: false,
      appliedOperations: 0,
      rejectedOperations,
      rejectionReason: restored ? rejectionReason : "invalid_command",
    };
  }
  return { ok: true, appliedOperations, rejectedOperations: 0 };
}

type PresentationSlide = {
  id: string;
  title: string;
  blocks: PresentationBlock[];
  notes?: string;
  /** Hide / skip this slide in a slideshow (kept in the deck). See `presentation-slide-visibility`. */
  hidden?: boolean;
  [key: string]: unknown;
};
type PresentationContent = {
  type: "mrnote.presentation.v1";
  slides: PresentationSlide[];
};
type PdfAnnotation = {
  id: string;
  text: string;
  quote?: string;
  page?: number;
  createdAt: string;
  color?: string;
  rect?: [number, number, number, number];
  managedMarkup?: {
    subtype: "Highlight" | "Underline" | "StrikeOut" | "Squiggly";
    rect: [number, number, number, number];
    quadPoints: number[];
    quote?: string;
  };
};
type PdfFormField = {
  id: string;
  value: string | boolean | string[];
  label?: string;
  page?: number;
  updatedAt?: string;
};
type PdfPageTransform = {
  page: number;
  rotation: 0 | 90 | 180 | 270;
  updatedAt?: string;
};
type PdfInsertedPage = {
  id: string;
  afterPage: number;
  width?: number;
  height?: number;
  createdAt?: string;
};
type PdfPageMove = {
  page: number;
  afterPage: number;
  updatedAt?: string;
};
type PdfTextBoxEditModel = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  kind?: "text" | "formula";
  latex?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  fontFamily?: string;
  sourceFontName?: string;
  /** The Office family a box someone made is set in (its font menu). */
  officeFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  runs?: PdfTextStyleRun[];
  lineLayout?: PdfTextLineLayout[];
  created?: boolean;
  originX?: number;
  originY?: number;
  originWidth?: number;
  originHeight?: number;
};
type PdfTextBoxContextTarget = Partial<PdfTextBoxEditModel> & {
  id?: string;
  edited?: boolean;
};
type PdfImageOverlayModel = {
  id: string;
  page: number;
  dataItemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type PdfInkStrokeModel = {
  id: string;
  page: number;
  color: string;
  width: number;
  points: number[];
};
type PdfContent = {
  type: "mrnote.pdf.v1";
  dataItemId?: string | null;
  data_item_id?: string | null;
  annotations: PdfAnnotation[];
  formFields?: PdfFormField[];
  form_fields?: PdfFormField[];
  pageTransforms?: PdfPageTransform[];
  page_transforms?: PdfPageTransform[];
  deletedPages?: number[];
  deleted_pages?: number[];
  insertedPages?: PdfInsertedPage[];
  inserted_pages?: PdfInsertedPage[];
  pageMoves?: PdfPageMove[];
  page_moves?: PdfPageMove[];
  textBoxEdits?: PdfTextBoxEditModel[];
  text_box_edits?: PdfTextBoxEditModel[];
  imageOverlays?: PdfImageOverlayModel[];
  image_overlays?: PdfImageOverlayModel[];
  inkStrokes?: PdfInkStrokeModel[];
  ink_strokes?: PdfInkStrokeModel[];
  source?: Record<string, unknown>;
};

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function integerPageIndex(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function unitFraction(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

function sanitizePdfTextBoxEditModel(
  edit: PdfTextBoxEditModel,
): PdfTextBoxEditModel | null {
  if (!edit || typeof edit !== "object") return null;
  const id = typeof edit.id === "string" ? edit.id.trim() : "";
  const page = integerPageIndex(edit.page);
  const geometry = sanitizePdfTextBoxEditGeometry(edit);
  if (!id || page === undefined || !geometry) return null;

  const kind =
    edit.kind ?? (typeof edit.latex === "string" ? "formula" : undefined);
  const next: PdfTextBoxEditModel = {
    ...edit,
    id,
    page,
    ...geometry,
    kind,
  };
  if (geometry.originX === undefined) {
    delete next.originX;
    delete next.originY;
    delete next.originWidth;
    delete next.originHeight;
  }
  if (kind === "text") {
    delete next.latex;
  } else if (kind !== "formula") {
    delete next.kind;
  }
  return next;
}

function sanitizePdfTextBoxEditModels(
  edits: readonly PdfTextBoxEditModel[] | undefined,
): PdfTextBoxEditModel[] {
  if (!Array.isArray(edits)) return [];
  return edits
    .map(sanitizePdfTextBoxEditModel)
    .filter((item): item is PdfTextBoxEditModel => Boolean(item));
}

type PdfTextBoxRectFieldSource = {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
};

function finiteGeometryValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function positiveGeometryValue(value: unknown): number | undefined {
  const numeric = finiteGeometryValue(value);
  return numeric !== undefined && numeric > 0 ? numeric : undefined;
}

function sanitizePdfTextBoxRectFromFields(
  primary: PdfTextBoxRectFieldSource,
  fallback?: PdfTextBoxRectFieldSource,
) {
  return sanitizePdfTextBoxRect({
    x: finiteGeometryValue(primary.x) ?? finiteGeometryValue(fallback?.x),
    y: finiteGeometryValue(primary.y) ?? finiteGeometryValue(fallback?.y),
    width:
      positiveGeometryValue(primary.width) ??
      positiveGeometryValue(fallback?.width),
    height:
      positiveGeometryValue(primary.height) ??
      positiveGeometryValue(fallback?.height),
  });
}

function pdfTextBoxContextTargets(
  command: NativeDocumentCommand,
): PdfTextBoxContextTarget[] {
  const value = command.command_context?.pdf_text_boxes;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is PdfTextBoxContextTarget =>
      Boolean(item) && typeof item === "object",
  );
}

function pageIndexFromCommandContext(
  command: NativeDocumentCommand,
): number | undefined {
  const pageIndex = integerPageIndex(command.command_context?.page_index);
  if (pageIndex !== undefined) return pageIndex;
  const pageNumber = command.command_context?.page;
  return typeof pageNumber === "number" &&
    Number.isInteger(pageNumber) &&
    pageNumber >= 1
    ? pageNumber - 1
    : undefined;
}

function findPdfTextBoxContextTarget(
  command: NativeDocumentCommand,
  id: string,
  page: number,
): PdfTextBoxContextTarget | undefined {
  const candidates = pdfTextBoxContextTargets(command).filter(
    (box) => box.id === id,
  );
  if (candidates.length === 0) return undefined;
  return (
    candidates.find((box) => integerPageIndex(box.page) === page) ??
    candidates.find((box) => integerPageIndex(box.page) === undefined) ??
    (candidates.length === 1 ? candidates[0] : undefined)
  );
}

function inferPdfTextBoxPage(
  command: NativeDocumentCommand,
  id: string,
): number | undefined {
  const contextPage = pageIndexFromCommandContext(command);
  const candidates = pdfTextBoxContextTargets(command).filter(
    (box) => box.id === id,
  );
  const onContextPage = candidates.find(
    (box) =>
      contextPage !== undefined && integerPageIndex(box.page) === contextPage,
  );
  if (onContextPage) return contextPage;
  const firstTargetPage = candidates
    .map((box) => integerPageIndex(box.page))
    .find((page): page is number => page !== undefined);
  return firstTargetPage ?? contextPage;
}

export function applySpreadsheetPageCommand(
  content: SpreadsheetContent,
  command: NativeDocumentCommand,
): SpreadsheetContent {
  return applySpreadsheetPageCommandWithResult(content, command).content;
}

/**
 * Merge an `update_slide_block` PATCH into an existing block. A patch is a
 * PARTIAL update, so unspecified top-level fields are preserved — but two
 * nested cases need special handling, otherwise a "make it bold" / "swap the
 * image" patch silently destroys unrelated authored data:
 *
 *   - `style` is a nested object ({fontSize,color,bold,italic,underline,align}).
 *     A shallow spread would REPLACE the whole style object, so a partial
 *     `{style:{bold:true}}` would wipe a previously-authored fontSize/color/
 *     align. We deep-merge field-by-field instead, mirroring
 *     applySpreadsheetCellPatch; a field set to null/""/false clears it.
 *   - changing an image block's `src` makes the OLD image's source-relative
 *     `cropRect` (0..1 fractions of the source) and its stale `width`/`height`
 *     meaningless — keeping them shows a corrupted crop / wrong aspect of the
 *     NEW image. So when `src` changes and the patch does not itself supply
 *     those fields, we drop them.
 */
const PRESENTATION_BLOCK_IDENTITY_KEYS = new Set(["id", "type", "source", "custody", "package"]);

/**
 * A V2 chart's attributes after path writes, with what a path cannot say
 * filled in: a series/slice/axis style created by position gets that
 * position as its index, a category series created by name gets zero
 * values for every category. Anything else stays for the validator.
 */
function completedChartV2Attrs(chart: Record<string, unknown>): Record<string, unknown> {
  const next = { ...chart };
  const format =
    next.format && typeof next.format === "object" && !Array.isArray(next.format)
      ? { ...(next.format as Record<string, unknown>) }
      : null;
  if (format) {
    for (const [key, indexKey] of [
      ["seriesStyles", "seriesIndex"],
      ["sliceStyles", "pointIndex"],
    ] as const) {
      const list = format[key];
      if (!Array.isArray(list)) continue;
      format[key] = list.map((item, index) => {
        const style = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
        return style && style[indexKey] === undefined ? { ...style, [indexKey]: index } : item;
      });
    }
    if (Array.isArray(format.axisStyles)) {
      format.axisStyles = format.axisStyles.map((item, index) =>
        item && typeof item === "object" && (item as Record<string, unknown>).axis === undefined
          ? { ...(item as Record<string, unknown>), axis: index === 0 ? "category" : "value" }
          : item,
      );
    }
    next.format = format;
  }
  const data = next.data as Record<string, unknown> | undefined;
  if (data && data.kind === "category" && Array.isArray(data.series)) {
    const categories = Array.isArray(data.categories) ? data.categories : [];
    next.data = {
      ...data,
      series: data.series.map((item) =>
        item && typeof item === "object" && (item as Record<string, unknown>).values === undefined
          ? { ...(item as Record<string, unknown>), values: categories.map(() => 0) }
          : item,
      ),
    };
  }
  return next;
}

/**
 * The block with a patch applied, or null when a path key cannot be written
 * or the block no longer validates afterwards (a V2 chart that lost a series
 * alignment, a table cell with a bad colour).
 */
function mergePresentationBlockPatch(
  block: PresentationBlock,
  patch: Record<string, unknown>,
): PresentationBlock | null {
  const blockRec = block as Record<string, unknown>;
  const pathEntries = Object.entries(patch).filter(([key]) => isAttrPathKey(key));
  let plainPatch: Record<string, unknown> | null = Object.fromEntries(
    Object.entries(patch).filter(([key]) => !isAttrPathKey(key)),
  );
  if (blockRec.type === "chart") {
    // One chart model: a patch naming the chart the pre-V2 way (a grid, a
    // kind, a title, a switch, a paint record) is read into `chartV2` here,
    // on the way in, and none of those keys is stored beside it.
    plainPatch = presentationChartPatchOnV2(block as PresentationChartBlock, plainPatch);
    if (plainPatch === null) return null;
  }
  patch = plainPatch;
  const next: Record<string, unknown> = {
    ...blockRec,
    ...patch,
    id: blockRec.id,
    type: blockRec.type,
  };
  if (
    patch.style !== undefined &&
    patch.style !== null &&
    typeof patch.style === "object"
  ) {
    const base =
      blockRec.style && typeof blockRec.style === "object"
        ? (blockRec.style as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(
      patch.style as Record<string, unknown>,
    )) {
      if (value === null || value === "" || value === false) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    if (Object.keys(merged).length > 0) {
      next.style = merged;
    } else {
      delete next.style;
    }
  }
  if (
    blockRec.type === "image" &&
    typeof patch.src === "string" &&
    patch.src !== blockRec.src
  ) {
    // cropRect is always source-relative (0..1 fractions of the source image) →
    // meaningless for the new src, drop it.
    if (!("cropRect" in patch)) delete next.cropRect;
    // width/height: only drop them for an INLINE image, where they are a
    // source-aspect hint the new image invalidates. For a POSITIONED image
    // (left/top set) width/height are the on-slide LAYOUT box (EMU) — dropping
    // them would collapse the user's authored geometry to the default box.
    const positioned =
      blockRec.left !== undefined || blockRec.top !== undefined;
    if (!positioned) {
      if (!("width" in patch)) delete next.width;
      if (!("height" in patch)) delete next.height;
    }
  }
  if (!pathEntries.length)
    return (
      blockRec.type === "chart"
        ? presentationChartBlockOnV2(next as PresentationChartBlock)
        : next
    ) as PresentationBlock;
  // Path keys write one leaf each ("rows[0][1].fill", "chartV2.format.legend");
  // the whole block is validated afterwards so a leaf the vocabulary allowed
  // but the structure cannot take (a fifth series value on four categories)
  // is refused instead of stored.
  let written: unknown = next;
  // Show empty cells as goes through the one element intent, as the Hidden &
  // Empty Cells menu writes it (`chartWithDisplayBlanksLeaf`).
  const blanksEntry =
    blockRec.type === "chart"
      ? pathEntries.find(([key]) => isDisplayBlanksPath(parseAttrPath(key), 1))
      : undefined;
  for (const [key, value] of pathEntries) {
    if (blanksEntry && key === blanksEntry[0]) continue;
    const path = parseAttrPath(key);
    if (!path || PRESENTATION_BLOCK_IDENTITY_KEYS.has(String(path[0]))) return null;
    written = setAtAttrPath(written, path, value);
    if (written === null) return null;
  }
  const patched = written as Record<string, unknown>;
  if (blanksEntry && (!patched.chartV2 || typeof patched.chartV2 !== "object")) return null;
  if (blockRec.type === "chart" && (patched.chartV2 !== blockRec.chartV2 || blanksEntry)) {
    let chart = completedChartV2Attrs(
      patched.chartV2 as Record<string, unknown>,
    ) as unknown as ChartBlockAttrsV2;
    // A data edit by path (a category merged away, a series removed) moves
    // the format with each series and category, as Select Data and the
    // chart's sheet do (presentationChartAttrsWithData): a slice's paint
    // stays with its slice and leaves with it. Kept by position, the fifth
    // slice's colour pointed past four categories and every "merge 其他 into
    // 西部" was refused as having no previewable structure (AI70H H35 C12).
    // A patch that also writes the format says where it goes itself.
    const beforeChart = blockRec.chartV2 as ChartBlockAttrsV2 | undefined;
    if (
      beforeChart?.data &&
      chart.format &&
      JSON.stringify(chart.data) !== JSON.stringify(beforeChart.data) &&
      !pathEntries.some(([key]) => {
        const path = parseAttrPath(key);
        return path?.[0] === "chartV2" && path[1] === "format";
      })
    ) {
      const origins = chartDataEditOrigins(beforeChart.data, chart.data);
      if (origins)
        chart = {
          ...chart,
          format: chartFormatFollowingDataEdit(chart.format, origins.series, origins.categories),
        };
    }
    if (blanksEntry) {
      const leafed = chartWithDisplayBlanksLeaf(chart, blanksEntry[1]);
      if (!leafed) return null;
      chart = leafed;
    }
    if (!validateChartBlockAttrsV2(chart).valid) return null;
    patched.chartV2 = chart;
    // The block's labels follow the attrs, and a workbook that no longer
    // reads as the chart's data is seeded anew from it: the save refuses a
    // title or a workbook that disagrees with the chart.
    patched.title = chart.title;
    patched.chartType = officeChartLegacyKind(chart.chartType, chart.chartSubtype);
    const before = (blockRec.chartV2 as ChartBlockAttrsV2 | undefined)?.data;
    if (patched.chartWorkbook !== undefined && JSON.stringify(chart.data) !== JSON.stringify(before))
      patched.chartWorkbook = seedDocumentChartWorkbook(chart) ?? undefined;
  }
  const onModel =
    blockRec.type === "chart"
      ? (presentationChartBlockOnV2(patched as PresentationChartBlock) as Record<string, unknown>)
      : patched;
  return presentationBlockSchema.safeParse(onModel).success ? (onModel as PresentationBlock) : null;
}

export function applyPresentationPageCommandWithResult(
  content: PresentationContent,
  command: NativeDocumentCommand,
  options?: {
    /** A native host may supply its existing identity/package-aware clone.
     * This is local authoring code, never a model-provided callback. */
    duplicateSlide?: (
      slides: readonly PresentationSlide[],
      index: number,
      draft: PresentationSlide,
      newSlideId: string,
    ) => PresentationSlide[] | null;
  },
): NativePageCommandResult<PresentationContent> {
  const next: PresentationContent = {
    ...content,
    slides: content.slides.map((slide) => ({
      ...slide,
      blocks: [...slide.blocks],
    })),
  };
  let appliedOperations = 0;
  let rejectedOperations = 0;
  let rejectionReason: NativePageCommandRejectionReason | undefined;

  for (const operation of command.operations) {
    if (operation.op === "update_slide_table_cells") {
      const slide = operation.slide_id
        ? next.slides.find((item) => item.id === operation.slide_id)
        : next.slides.find((item) =>
            item.blocks.some((block) => block.id === operation.block_id),
          );
      const block = slide?.blocks.find(
        (item) => item.id === operation.block_id,
      );
      const values = operation.values,
        row = operation.start_row ?? 0,
        col = operation.start_col ?? 0;
      const width = Array.isArray(values?.[0]) ? values[0].length : 0;
      const grid =
        block?.type === "table" ? buildOccupancyGrid(block.rows) : null;
      if (
        !slide ||
        !block ||
        block.type !== "table" ||
        block.locked ||
        !grid ||
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 0 ||
        col < 0 ||
        !Array.isArray(values) ||
        !values.length ||
        !width ||
        values.length > 80 ||
        width > 30 ||
        values.length * width > 1000 ||
        values.some(
          (line, r) =>
            !Array.isArray(line) ||
            line.length !== width ||
            line.some(
              (value, c) =>
                value !== null &&
                (typeof value !== "string" ||
                  value.length > 2000 ||
                  !grid[row + r]?.[col + c]?.isAnchor),
            ),
        )
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const expected = values.reduce(
        (sum, line) => sum + line.filter((value) => value !== null).length,
        0,
      );
      const result = applyTableClipboard(
        block.rows,
        {
          kind: "mrai.presentation-table.cells.v1",
          mode: "text",
          width,
          height: values.length,
          cells: values.map((line) =>
            line.map((value) => (value === null ? null : { text: value })),
          ),
        },
        { row, col },
      );
      if (!expected || result.applied !== expected) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const rows = result.rows.map((line, r) =>
        line.map((cell, c) => {
          if (cell.text === block.rows[r][c].text) return block.rows[r][c];
          const edited = { ...cell };
          // Match native whole-cell typing: retire superseded character runs,
          // retain cell formatting, spans and authenticated source metadata.
          delete edited.runs;
          return edited;
        }),
      ) as PresentationTableCell[][];
      slide.blocks = slide.blocks.map((item) =>
        item === block ? { ...block, rows } : item,
      );
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "update_slide_smartart_text") {
      const slide = operation.slide_id
        ? next.slides.find((item) => item.id === operation.slide_id)
        : next.slides.find((item) =>
            item.blocks.some((block) => block.id === operation.block_id),
          );
      const group =
        slide &&
        readNativeSmartArtGroup(
          slide.blocks,
          slide.blocks.find((block) => block.id === operation.block_id),
        );
      const updates = operation.updates;
      if (
        !slide ||
        !group ||
        !Array.isArray(updates) ||
        !updates.length ||
        updates.length > 20 ||
        new Set(updates.map((update) => update?.point_id)).size !==
          updates.length ||
        updates.some(
          (update) =>
            !update ||
            !group.outline.some((point) => point.id === update.point_id) ||
            typeof update.text !== "string" ||
            update.text.length > 2000 ||
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(
              update.text,
            ) ||
            Array.from(update.text).some(
              (char) => char.length === 1 && /[\ud800-\udfff]/u.test(char),
            ),
        )
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      let blocks = slide.blocks;
      let valid = true;
      for (const update of updates) {
        const live = readNativeSmartArtGroup(
          blocks,
          blocks.find((block) => block.id === operation.block_id),
        );
        if (!live) {
          valid = false;
          break;
        }
        if (
          live.outline.find((point) => point.id === update.point_id)?.text ===
          update.text
        )
          continue;
        const changed = updateNativeSmartArtText(
          blocks,
          live,
          update.point_id,
          update.text,
        );
        if (!changed) {
          valid = false;
          break;
        }
        blocks = changed;
      }
      if (!valid) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      slide.blocks = blocks;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "apply_slide_effect") {
      const slide = next.slides.find((item) => item.id === operation.slide_id);
      if (!slide || !objectPatchWithinCommandBudget(operation.animations)) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (operation.transition === "none") {
        delete slide.transition;
        delete slide.transitionDurationMs;
        delete slide.transitionDirection;
      } else if (operation.transition) {
        slide.transition = operation.transition;
        slide.transitionDurationMs = 700;
      }
      if (operation.animations) {
        // Steps the assistant writes get an identity like every other new
        // step, so a collaborator's concurrent timing edit on another object
        // merges per step instead of the whole list being overwritten.
        // The records were validated as steps by the command schema.
        slide.animationSequence = assignTimelineStepIds(
          operation.animations.map((item) => ({ ...item })) as unknown as TimelineStep[],
          slide.id,
        );
      }
      appliedOperations += 1;
      continue;
    }
    if (
      operation.op === "apply_slide_changes" ||
      operation.op === "apply_deck_changes"
    ) {
      // What the editor's own buttons changed beyond the circled slide (a
      // new slide, the theme, the slide order), pressed on the server for a
      // Copilot request and replayed here exactly as its preview did.
      const changed =
        objectPatchWithinCommandBudget(
          (operation.op === "apply_slide_changes"
            ? operation.slide
            : operation.set) ?? {},
        ) &&
        !recordHasInvalidInlineImageSrc(
          (operation.op === "apply_slide_changes"
            ? operation.slide
            : operation.set) ?? {},
        )
          ? applyPresentationButtonChanges(next, operation)
          : null;
      if (!changed) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const { slides, ...deck } = changed.content;
      for (const key of Object.keys(next))
        if (key !== "slides" && !(key in deck))
          delete (next as Record<string, unknown>)[key];
      Object.assign(next, deck);
      next.slides = slides.map((slide) => ({
        ...slide,
        blocks: [...slide.blocks],
      }));
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "replace_current_slide") {
      const index = next.slides.findIndex(
        (item) => item.id === operation.slide_id,
      );
      if (
        index < 0 ||
        !objectPatchWithinCommandBudget(operation.patch) ||
        recordHasInvalidInlineImageSrc(operation.patch)
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const current = next.slides[index];
      next.slides[index] = {
        ...current,
        ...operation.patch,
        id: current.id,
        blocks: Array.isArray(operation.patch.blocks)
          ? (operation.patch.blocks as PresentationBlock[]).map((block) => ({
              ...block,
            }))
          : current.blocks,
      } as PresentationSlide;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "duplicate_slide") {
      const index = next.slides.findIndex(
        (item) => item.id === operation.slide_id,
      );
      if (
        index < 0 ||
        !operation.new_slide_id ||
        next.slides.some((item) => item.id === operation.new_slide_id) ||
        !objectPatchWithinCommandBudget(operation.patch) ||
        recordHasInvalidInlineImageSrc(operation.patch)
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const source = next.slides[index];
      if (options?.duplicateSlide) {
        const duplicated = options.duplicateSlide(
          next.slides,
          index,
          { ...source, ...operation.patch, id: source.id } as PresentationSlide,
          operation.new_slide_id,
        );
        if (!duplicated) {
          rejectedOperations += 1;
          rejectionReason ||= "invalid_command";
          continue;
        }
        next.slides = duplicated;
        appliedOperations += 1;
        continue;
      }
      const requestedBlocks = Array.isArray(operation.patch.blocks)
        ? (operation.patch.blocks as PresentationBlock[])
        : source.blocks;
      const duplicate = {
        ...source,
        ...operation.patch,
        id: operation.new_slide_id,
        title:
          typeof operation.patch.title === "string"
            ? operation.patch.title
            : source.title,
        blocks: requestedBlocks.map((block) => ({
          ...block,
          id: createId("block"),
        })),
      } as PresentationSlide;
      next.slides = [
        ...next.slides.slice(0, index + 1),
        duplicate,
        ...next.slides.slice(index + 1),
      ];
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "delete_slide") {
      const targetIndex = next.slides.findIndex(
        (slide) => slide.id === operation.slide_id,
      );
      if (targetIndex < 0) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (next.slides.length <= 1) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      next.slides = next.slides.filter((_, index) => index !== targetIndex);
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "delete_slide_block") {
      if (!operation.block_id) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const slide =
        (operation.slide_id
          ? next.slides.find(
              (item) =>
                item.id === operation.slide_id &&
                item.blocks.some((block) => block.id === operation.block_id),
            )
          : undefined) ||
        next.slides.find((item) =>
          item.blocks.some((block) => block.id === operation.block_id),
        );
      if (!slide) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const beforeCount = slide.blocks.length;
      slide.blocks = slide.blocks.filter(
        (block) => block.id !== operation.block_id,
      );
      if (slide.blocks.length === beforeCount) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "update_slide_block") {
      const patch = operation.block || operation.patch;
      if (recordHasInvalidInlineImageSrc(patch)) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_image_source";
        continue;
      }
      if (!objectPatchWithinCommandBudget(patch)) {
        rejectedOperations += 1;
        rejectionReason ||= "payload_too_large";
        continue;
      }
      const slide =
        next.slides.find((item) => item.id === operation.slide_id) ||
        next.slides.find((item) =>
          item.blocks.some((block) => block.id === operation.block_id),
        ) ||
        next.slides[0];
      if (!slide) continue;
      let didApply = false;
      let invalidPatch = false;
      slide.blocks = slide.blocks.map((block) => {
        if (block.id !== operation.block_id) return block;
        didApply = true;
        if (operation.block) {
          const replacementType = operation.block.type || block.type;
          if (replacementType === block.type) {
            // SAME-type full replacement: preserve the block's layout/geometry
            // metadata (left/top/size/rotation/source/...) by spreading the old
            // block underneath the new content. A chart's content is read
            // onto the one model on the way in, like a patch's.
            const content =
              block.type === "chart"
                ? presentationChartPatchOnV2(
                    block as PresentationChartBlock,
                    operation.block as Record<string, unknown>,
                  )
                : (operation.block as Record<string, unknown>);
            if (content === null) {
              invalidPatch = true;
              return block;
            }
            return {
              ...block,
              ...content,
              id: operation.block.id || block.id,
              type: replacementType,
            } as PresentationBlock;
          }
          // TYPE CHANGE: build from the new block alone so the old block's
          // type-specific fields (e.g. an image's src/cropRect/width/height) do
          // not orphan onto a block of a different kind, which would pollute
          // exporters and round-trips.
          return {
            ...operation.block,
            id: operation.block.id || block.id,
            type: replacementType,
          } as PresentationBlock;
        }
        const merged = mergePresentationBlockPatch(
          block,
          (operation.patch || {}) as Record<string, unknown>,
        );
        if (merged === null) {
          invalidPatch = true;
          return block;
        }
        return merged;
      });
      if (invalidPatch) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
      } else if (didApply) appliedOperations += 1;
      continue;
    }
    if (operation.op !== "append_slide_block") continue;
    const slide =
      next.slides.find((item) => item.id === operation.slide_id) ||
      next.slides[0];
    if (!slide) continue;
    if (operation.block) {
      if (recordHasInvalidInlineImageSrc(operation.block)) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_image_source";
        continue;
      }
      if (!objectPatchWithinCommandBudget(operation.block)) {
        rejectedOperations += 1;
        rejectionReason ||= "payload_too_large";
        continue;
      }
      const appended = {
        ...operation.block,
        id: operation.block.id || createId("block"),
      } as PresentationBlock;
      // One chart model: a chart sent the pre-V2 way (a grid, a kind and
      // switches) is its V2 reading from the moment it lands.
      const onModel =
        appended.type === "chart"
          ? presentationChartBlockOnV2(appended as PresentationChartBlock)
          : appended;
      if (onModel.type === "chart" && (onModel as PresentationChartBlock).chartV2 === undefined) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      slide.blocks.push(onModel);
      appliedOperations += 1;
      continue;
    }
    if (operation.text) {
      slide.blocks.push({
        id: createId("block"),
        type: "text",
        text: operation.text,
      });
      appliedOperations += 1;
    }
  }

  return {
    content: next,
    appliedOperations,
    rejectedOperations,
    rejectionReason,
  };
}

export function applyPresentationPageCommand(
  content: PresentationContent,
  command: NativeDocumentCommand,
): PresentationContent {
  return applyPresentationPageCommandWithResult(content, command).content;
}

export function applyPdfPageCommandWithResult(
  content: PdfContent,
  command: NativeDocumentCommand,
): NativePageCommandResult<PdfContent> {
  const next: PdfContent = {
    ...content,
    annotations: [...content.annotations],
    formFields: [...(content.formFields || content.form_fields || [])],
    pageTransforms: [
      ...(content.pageTransforms || content.page_transforms || []),
    ],
    deletedPages: [...(content.deletedPages || content.deleted_pages || [])],
    insertedPages: [...(content.insertedPages || content.inserted_pages || [])],
    pageMoves: [...(content.pageMoves || content.page_moves || [])],
    textBoxEdits: sanitizePdfTextBoxEditModels(
      content.textBoxEdits || content.text_box_edits,
    ),
    imageOverlays: [...(content.imageOverlays || content.image_overlays || [])],
    inkStrokes: [...(content.inkStrokes || content.ink_strokes || [])],
  };
  let appliedOperations = 0;

  for (const operation of command.operations) {
    if (operation.op === "add_pdf_markup") {
      if (
        !operation.id.trim() ||
        !operation.quote.trim() ||
        operation.rect.length !== 4 ||
        operation.quad_points.length < 8 ||
        operation.quad_points.length % 8 !== 0
      ) {
        continue;
      }
      next.annotations.unshift(
        encodeManagedNativeNote({
          id: operation.id,
          text: operation.text || "",
          quote: operation.quote,
          page: operation.page,
          rect: [...operation.rect],
          color: operation.color,
          createdAt: new Date().toISOString(),
          managedMarkup: {
            subtype: operation.subtype,
            rect: [...operation.rect],
            quadPoints: [...operation.quad_points],
            quote: operation.quote,
          },
        }),
      );
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "add_pdf_proofing") {
      // The proofing tools' row (upsertManagedProofing): the caret, and for
      // replace the struck-out lines, with the words to put in as its text.
      const managedProofing = operation.id.trim() && operation.text.trim()
        ? proofingGeometryFromQuadPoints(
            operation.kind,
            operation.quad_points,
            operation.insert_at ?? "after",
            operation.quote || undefined,
          )
        : null;
      if (!managedProofing) continue;
      next.annotations.unshift(
        encodeManagedNativeNote({
          id: operation.id,
          text: operation.text.trim(),
          ...(managedProofing.quote ? { quote: managedProofing.quote } : {}),
          page: operation.page,
          rect: managedProofing.rect,
          color: pdfMarkupColorToHex(operation.color, "#E85D75"),
          createdAt: new Date().toISOString(),
          managedProofing,
        }),
      );
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "add_pdf_annotation") {
      if (!operation.text.trim()) continue;
      // The content this command is applied to has already been through
      // serializeManagedNativeNotes, so every note in it carries its native-note
      // directive. A note appended here has to carry one too: without it the
      // backend takes the historical append-only path instead of the idempotent
      // /NM one, and the next save — which does encode it — writes a SECOND
      // annotation for the same note into the PDF.
      const rect =
        Array.isArray(operation.rect) &&
        operation.rect.length === 4 &&
        operation.rect.every((value) => Number.isFinite(value)) &&
        operation.rect[2] > operation.rect[0] &&
        operation.rect[3] > operation.rect[1]
          ? ([...operation.rect] as [number, number, number, number])
          : undefined;
      next.annotations.unshift(
        encodeManagedNativeNote({
          id: createId("annotation"),
          text: operation.text,
          quote: operation.quote,
          page: operation.page,
          ...(rect ? { rect } : {}),
          createdAt: new Date().toISOString(),
        }),
      );
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "update_pdf_form_field") {
      const fieldId = operation.field_id.trim();
      if (!fieldId) continue;
      const now = new Date().toISOString();
      const fields = next.formFields || [];
      const existingIndex = fields.findIndex((field) => field.id === fieldId);
      const updatedField = {
        ...(existingIndex >= 0 ? fields[existingIndex] : { id: fieldId }),
        value: operation.value,
        updatedAt: now,
      };
      next.formFields =
        existingIndex >= 0
          ? fields.map((field, index) =>
              index === existingIndex ? updatedField : field,
            )
          : [updatedField, ...fields];
      delete next.form_fields;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "rotate_pdf_page") {
      const page = operation.page ?? 1;
      const degrees = operation.degrees;
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        ![0, 90, 180, 270].includes(degrees)
      ) {
        continue;
      }
      const now = new Date().toISOString();
      const transforms = next.pageTransforms || [];
      const existingIndex = transforms.findIndex((item) => item.page === page);
      const updatedTransform: PdfPageTransform = {
        ...(existingIndex >= 0 ? transforms[existingIndex] : { page }),
        page,
        rotation: degrees,
        updatedAt: now,
      };
      next.pageTransforms =
        existingIndex >= 0
          ? transforms.map((item, index) =>
              index === existingIndex ? updatedTransform : item,
            )
          : [updatedTransform, ...transforms];
      delete next.page_transforms;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "delete_pdf_page") {
      const page = operation.page ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > 10_000) {
        continue;
      }
      const deleted = new Set(next.deletedPages || []);
      deleted.add(page);
      next.deletedPages = Array.from(deleted).sort((a, b) => a - b);
      delete next.deleted_pages;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "insert_pdf_page") {
      const afterPage = operation.after_page ?? 0;
      if (!Number.isInteger(afterPage) || afterPage < 0 || afterPage > 10_000) {
        continue;
      }
      const insertedPage: PdfInsertedPage = {
        id: createId("inserted-page"),
        afterPage,
        createdAt: new Date().toISOString(),
      };
      if (
        typeof operation.width === "number" &&
        Number.isFinite(operation.width) &&
        operation.width > 0
      ) {
        insertedPage.width = Math.min(operation.width, 5_000);
      }
      if (
        typeof operation.height === "number" &&
        Number.isFinite(operation.height) &&
        operation.height > 0
      ) {
        insertedPage.height = Math.min(operation.height, 5_000);
      }
      next.insertedPages = [...(next.insertedPages || []), insertedPage];
      delete next.inserted_pages;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "move_pdf_page") {
      const page = operation.page ?? 1;
      const afterPage = operation.after_page;
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        page > 10_000 ||
        !Number.isInteger(afterPage) ||
        afterPage < 0 ||
        afterPage > 10_000 ||
        afterPage === page
      ) {
        continue;
      }
      const now = new Date().toISOString();
      const moves = next.pageMoves || [];
      const pageCount = operation.page_count;
      if (
        typeof pageCount === "number" &&
        Number.isInteger(pageCount) &&
        pageCount >= 1 &&
        pageCount <= 10_000
      ) {
        // Moves are relative and replayed from the source order: replacing
        // one page's entry in place changes what the other entries mean.
        // The list is rewritten as the canonical moves for the order this
        // move leaves (one entry a page), which replays the same here, in
        // the reader and on the server.
        const moved = movePageAfter(
          {
            rotations: {},
            deletedPages: (next.deletedPages || []).filter(
              (deleted): deleted is number => Number.isInteger(deleted),
            ),
            pageMoves: moves.map((move) => ({ page: move.page, afterPage: move.afterPage })),
            insertedPages: [],
          },
          page,
          afterPage,
          Array.from({ length: pageCount }, (_unused, index) => index + 1),
        );
        const kept = new Map(moves.map((move) => [`${move.page}:${move.afterPage}`, move]));
        next.pageMoves = moved.pageMoves.map(
          (move) => kept.get(`${move.page}:${move.afterPage}`) ?? { ...move, updatedAt: now },
        );
        delete next.page_moves;
        appliedOperations += 1;
        continue;
      }
      const updatedMove: PdfPageMove = {
        page,
        afterPage,
        updatedAt: now,
      };
      const existingIndex = moves.findIndex((move) => move.page === page);
      next.pageMoves =
        existingIndex >= 0
          ? moves.map((move, index) =>
              index === existingIndex ? updatedMove : move,
            )
          : [...moves, updatedMove];
      delete next.page_moves;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "reorder_pdf_pages") {
      const pageCount = operation.page_count;
      if (
        !Number.isInteger(pageCount) ||
        pageCount < 1 ||
        pageCount > 10_000 ||
        !Array.isArray(operation.sequence)
      ) {
        continue;
      }
      const inserted = next.insertedPages || [];
      const moves = next.pageMoves || [];
      const reordered = pageEditStateForSequence(
        {
          rotations: {},
          deletedPages: (next.deletedPages || []).filter(
            (deleted): deleted is number => Number.isInteger(deleted),
          ),
          pageMoves: moves.map((move) => ({ page: move.page, afterPage: move.afterPage })),
          insertedPages: inserted.map((page) => ({
            id: page.id,
            afterPage: page.afterPage,
            width: page.width ?? DEFAULT_BLANK_PAGE_WIDTH,
            height: page.height ?? DEFAULT_BLANK_PAGE_HEIGHT,
          })),
        },
        Array.from({ length: pageCount }, (_unused, index) => index + 1),
        operation.sequence.map((slot) =>
          "inserted_id" in slot
            ? { kind: "inserted" as const, id: String(slot.inserted_id) }
            : { kind: "original" as const, page: Number(slot.page) },
        ),
      );
      if (!reordered) continue;
      const now = new Date().toISOString();
      const kept = new Map(moves.map((move) => [`${move.page}:${move.afterPage}`, move]));
      next.pageMoves = reordered.pageMoves.map(
        (move) => kept.get(`${move.page}:${move.afterPage}`) ?? { ...move, updatedAt: now },
      );
      const byId = new Map(inserted.map((page) => [page.id, page]));
      next.insertedPages = reordered.insertedPages.flatMap((page) => {
        const stored = byId.get(page.id);
        return stored ? [{ ...stored, afterPage: page.afterPage }] : [];
      });
      delete next.page_moves;
      delete next.inserted_pages;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "delete_pdf_inserted_page") {
      const inserted = next.insertedPages || [];
      if (!inserted.some((page) => page.id === operation.id)) continue;
      next.insertedPages = inserted.filter((page) => page.id !== operation.id);
      delete next.inserted_pages;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "rotate_pdf_inserted_page") {
      const inserted = next.insertedPages || [];
      if (
        ![90, 180, 270].includes(operation.degrees) ||
        !inserted.some((page) => page.id === operation.id)
      ) {
        continue;
      }
      if (operation.degrees !== 180) {
        next.insertedPages = inserted.map((page) =>
          page.id === operation.id
            ? {
                ...page,
                width: page.height ?? DEFAULT_BLANK_PAGE_HEIGHT,
                height: page.width ?? DEFAULT_BLANK_PAGE_WIDTH,
              }
            : page,
        );
        delete next.inserted_pages;
      }
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "set_pdf_text_box") {
      const id = (operation.id || "").trim();
      if (!id) continue;
      const givenText = typeof operation.text === "string" ? operation.text : "";
      const hasExplicitPage = operation.page !== undefined;
      if (
        hasExplicitPage &&
        (typeof operation.page !== "number" ||
          !Number.isInteger(operation.page) ||
          operation.page < 0)
      ) {
        continue;
      }
      const page =
        typeof operation.page === "number" &&
        Number.isInteger(operation.page) &&
        operation.page >= 0
          ? (operation.page as number)
          : (inferPdfTextBoxPage(command, id) ?? 0);
      const contextTarget = findPdfTextBoxContextTarget(command, id, page);
      const contextGeometry = contextTarget
        ? sanitizePdfTextBoxEditGeometry(contextTarget)
        : null;
      const edits = sanitizePdfTextBoxEditModels(
        next.textBoxEdits || next.text_box_edits,
      );
      const existingIndex = edits.findIndex(
        (edit) => edit.id === id && (edit.page ?? 0) === page,
      );
      // A change of look alone (`keepText`) leaves the box the words it has:
      // the command was answered from a context that carries only the first
      // of a long box's words.
      const text =
        operation.keepText === true &&
        existingIndex >= 0 &&
        typeof edits[existingIndex].text === "string"
          ? edits[existingIndex].text
          : givenText;
      const align =
        operation.align === "left" ||
        operation.align === "center" ||
        operation.align === "right"
          ? operation.align
          : undefined;
      const kind =
        operation.kind === "formula" || operation.kind === "text"
          ? operation.kind
          : undefined;
      const color =
        typeof operation.color === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(operation.color)
          ? operation.color
          : undefined;
      const backgroundColor =
        typeof operation.backgroundColor === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(operation.backgroundColor)
          ? operation.backgroundColor
          : undefined;
      const shortString = (value: unknown, max = 400): string | undefined =>
        typeof value === "string" && value.trim()
          ? value.trim().slice(0, max)
          : undefined;
      const boundedString = (
        value: unknown,
        max = 20_000,
      ): string | undefined =>
        typeof value === "string" ? value.slice(0, max) : undefined;
      const fontFamily = shortString(operation.fontFamily);
      const sourceFontName = shortString(operation.sourceFontName, 200);
      // Present on a command that sets the box's face: a family's name, or
      // null for a face of the box's own five.
      const setsOfficeFamily = "officeFamily" in operation;
      const officeFamily = shortString(operation.officeFamily, 200);
      const latex = boundedString(operation.latex);
      const previousEdit =
        existingIndex >= 0 ? edits[existingIndex] : undefined;
      const previousEditLatex =
        typeof previousEdit?.latex === "string"
          ? previousEdit.latex
          : undefined;
      const contextTargetLatex =
        typeof contextTarget?.latex === "string"
          ? contextTarget.latex
          : undefined;
      const previousDeclaredFormula =
        previousEdit?.kind === "formula" || contextTarget?.kind === "formula";
      const previousKind =
        previousEdit?.kind === "text"
          ? "text"
          : previousEdit?.kind === "formula" &&
              previousEditLatex &&
              isRenderablePdfFormulaLatex(previousEditLatex)
            ? "formula"
            : contextTarget?.kind === "text"
              ? "text"
              : contextTarget?.kind === "formula" &&
                  contextTargetLatex &&
                  isRenderablePdfFormulaLatex(contextTargetLatex)
                ? "formula"
                : undefined;
      const previousText =
        typeof previousEdit?.text === "string"
          ? previousEdit.text
          : typeof contextTarget?.text === "string"
            ? contextTarget.text
            : "";
      const shouldAttemptFormula =
        kind === "formula" ||
        (kind === undefined &&
          (latex !== undefined
            ? isRenderablePdfFormulaLatex(latex)
            : previousDeclaredFormula || previousKind === "formula"));
      const candidateLatex =
        kind === "text" || !shouldAttemptFormula
          ? undefined
          : (latex ??
            latexForPdfFormulaTextEdit({
              currentLatex: previousEditLatex ?? contextTargetLatex,
              previousText,
              nextText: text,
            }));
      const nextLatex =
        candidateLatex && isRenderablePdfFormulaLatex(candidateLatex)
          ? candidateLatex
          : undefined;
      const formulaKind =
        kind === "text"
          ? "text"
          : nextLatex
            ? "formula"
            : kind === "formula" ||
                latex !== undefined ||
                previousDeclaredFormula ||
                previousKind === "formula"
              ? "text"
              : previousKind;
      const boolField = (
        key: "bold" | "italic" | "underline",
      ): boolean | undefined =>
        typeof operation[key] === "boolean" ? operation[key] : undefined;
      const bold = boolField("bold");
      const italic = boolField("italic");
      const underline = boolField("underline");
      const sourceRuns = previousEdit?.runs ?? contextTarget?.runs;
      const sourceLineLayout =
        previousEdit?.lineLayout ?? contextTarget?.lineLayout;
      let nextRuns =
        formulaKind !== "formula"
          ? reconcilePdfTextStyleRuns(sourceRuns, previousText, text)
          : undefined;
      const runPatch: Partial<
        Omit<PdfTextStyleRun, "text" | "displayFontFamily">
      > = {};
      if (fontFamily !== undefined) runPatch.fontFamily = fontFamily;
      if (sourceFontName !== undefined) {
        runPatch.sourceFontName = sourceFontName;
      }
      if (setsOfficeFamily) runPatch.officeFamily = officeFamily;
      const runFontSize = unitFraction(operation.fontSize);
      if (runFontSize !== undefined) runPatch.fontSize = runFontSize;
      if (color !== undefined) runPatch.color = color;
      if (bold !== undefined) runPatch.bold = bold;
      if (italic !== undefined) runPatch.italic = italic;
      if (nextRuns && Object.keys(runPatch).length > 0) {
        nextRuns = patchPdfTextStyleRuns(nextRuns, text, runPatch);
      }
      if (existingIndex >= 0) {
        const prev = edits[existingIndex];
        const rect = sanitizePdfTextBoxRectFromFields(operation, prev);
        if (!rect) continue;
        const origin =
          sanitizePdfTextBoxRect({
            x: prev.originX,
            y: prev.originY,
            width: prev.originWidth,
            height: prev.originHeight,
          }) ??
          (contextGeometry
            ? {
                x: contextGeometry.originX ?? contextGeometry.x,
                y: contextGeometry.originY ?? contextGeometry.y,
                width: contextGeometry.originWidth ?? contextGeometry.width,
                height: contextGeometry.originHeight ?? contextGeometry.height,
              }
            : rect);
        edits[existingIndex] = {
          ...prev,
          text,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fontSize: unitFraction(operation.fontSize) ?? prev.fontSize,
          color: color ?? prev.color,
          backgroundColor: backgroundColor ?? prev.backgroundColor,
          align: align ?? prev.align,
          kind: formulaKind ?? prev.kind,
          latex: formulaKind === "text" ? undefined : (nextLatex ?? prev.latex),
          fontFamily:
            fontFamily ?? prev.fontFamily ?? contextTarget?.fontFamily,
          sourceFontName:
            sourceFontName ??
            prev.sourceFontName ??
            contextTarget?.sourceFontName,
          officeFamily: setsOfficeFamily ? officeFamily : prev.officeFamily,
          bold: bold ?? prev.bold ?? contextTarget?.bold,
          italic: italic ?? prev.italic ?? contextTarget?.italic,
          underline: underline ?? prev.underline,
          runs: nextRuns,
          lineLayout:
            formulaKind === "formula"
              ? undefined
              : reconcilePdfTextLineLayout(
                  sourceLineLayout,
                  previousText,
                  text,
                ),
          originX: origin.x,
          originY: origin.y,
          originWidth: origin.width,
          originHeight: origin.height,
        };
      } else {
        const rect = sanitizePdfTextBoxRectFromFields(operation, contextTarget);
        // Creating a brand-new user box requires explicit geometry. Editing an
        // extracted box by id can seed the edit from command_context.pdf_text_boxes.
        if (!rect) continue;
        const origin = contextGeometry
          ? {
              x: contextGeometry.originX ?? contextGeometry.x,
              y: contextGeometry.originY ?? contextGeometry.y,
              width: contextGeometry.originWidth ?? contextGeometry.width,
              height: contextGeometry.originHeight ?? contextGeometry.height,
            }
          : rect;
        edits.push({
          id,
          page,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          text,
          fontSize:
            unitFraction(operation.fontSize) ??
            unitFraction(contextTarget?.fontSize) ??
            DEFAULT_NEW_BOX_FONT_SIZE,
          kind: formulaKind,
          latex: nextLatex,
          color: color ?? contextTarget?.color,
          backgroundColor,
          align,
          fontFamily: fontFamily ?? contextTarget?.fontFamily,
          sourceFontName: sourceFontName ?? contextTarget?.sourceFontName,
          ...(officeFamily !== undefined ? { officeFamily } : {}),
          bold: bold ?? contextTarget?.bold,
          italic: italic ?? contextTarget?.italic,
          underline,
          runs: contextTarget ? nextRuns : undefined,
          lineLayout:
            contextTarget && formulaKind !== "formula"
              ? reconcilePdfTextLineLayout(
                  normalizePdfTextLineLayout(
                    contextTarget.lineLayout,
                    previousText,
                  ),
                  previousText,
                  text,
                )
              : undefined,
          created: contextTarget ? Boolean(contextTarget.created) : true,
          originX: origin.x,
          originY: origin.y,
          originWidth: origin.width,
          originHeight: origin.height,
        });
      }
      next.textBoxEdits = edits;
      delete next.text_box_edits;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "set_pdf_image_overlay") {
      const id = (operation.id || "").trim();
      if (!id) continue;
      const page = Number.isInteger(operation.page)
        ? (operation.page as number)
        : 0;
      const overlays = [...(next.imageOverlays || next.image_overlays || [])];
      const existingIndex = overlays.findIndex(
        (o) => o.id === id && (o.page ?? 0) === page,
      );
      const inFraction = (value: unknown): number | undefined =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1
          ? value
          : undefined;
      if (existingIndex >= 0) {
        const prev = overlays[existingIndex];
        overlays[existingIndex] = {
          ...prev,
          dataItemId:
            typeof operation.dataItemId === "string" && operation.dataItemId
              ? operation.dataItemId
              : prev.dataItemId,
          x: inFraction(operation.x) ?? prev.x,
          y: inFraction(operation.y) ?? prev.y,
          width: inFraction(operation.width) ?? prev.width,
          height: inFraction(operation.height) ?? prev.height,
        };
      } else {
        const x = inFraction(operation.x);
        const y = inFraction(operation.y);
        const width = inFraction(operation.width);
        const height = inFraction(operation.height);
        // Creating a new overlay requires a data item + explicit geometry.
        if (
          !operation.dataItemId ||
          x === undefined ||
          y === undefined ||
          width === undefined ||
          height === undefined
        ) {
          continue;
        }
        overlays.push({
          id,
          page,
          dataItemId: operation.dataItemId,
          x,
          y,
          width,
          height,
        });
      }
      next.imageOverlays = overlays;
      delete next.image_overlays;
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "add_pdf_ink_stroke") {
      const id = (operation.id || "").trim();
      const points = Array.isArray(operation.points)
        ? operation.points.filter((n): n is number => typeof n === "number")
        : [];
      // A stroke needs an id and at least two points (4 numbers).
      if (!id || points.length < 4) continue;
      const page = Number.isInteger(operation.page)
        ? (operation.page as number)
        : 0;
      const color =
        typeof operation.color === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(operation.color)
          ? operation.color
          : "#dc2626";
      const width =
        typeof operation.width === "number" &&
        operation.width > 0 &&
        operation.width <= 100
          ? operation.width
          : 2;
      const strokes = [...(next.inkStrokes || next.ink_strokes || [])];
      const existingIndex = strokes.findIndex(
        (s) => s.id === id && (s.page ?? 0) === page,
      );
      const stroke = { id, page, color, width, points };
      if (existingIndex >= 0) strokes[existingIndex] = stroke;
      else strokes.push(stroke);
      next.inkStrokes = strokes;
      delete next.ink_strokes;
      appliedOperations += 1;
    }
  }

  return { content: next, appliedOperations };
}

export function applyPdfPageCommand(
  content: PdfContent,
  command: NativeDocumentCommand,
): PdfContent {
  return applyPdfPageCommandWithResult(content, command).content;
}
