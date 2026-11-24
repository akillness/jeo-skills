/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A header/footer story as a ProseMirror document, and back.
 *
 * Word edits a header or footer as a paragraph flow with the whole ribbon at
 * hand: alignment, tabs (the Header style's own centre and right stops),
 * fonts, fields, pictures, tables. The persisted band model
 * ({@link BandRichBlock}, `headerFooter.ts`) is what the importers write and
 * the exporters read, and stays the store; this module is the bridge that
 * lets a real editor instance work on it.
 *
 * `bandRichToPmDoc` turns the story into the same node/mark vocabulary the
 * document editor uses (paragraph attrs `textAlign` / `spaceBefore` /
 * `spaceAfter` / `docxStyleId` / `tabStops` / line inputs, marks `bold` /
 * `italic` / `underline` / `fontSize` / `fontFamily` / `fontCjkFamily` /
 * `textColor`, PAGE and NUMPAGES as `documentField` atoms, tables as table
 * nodes). What the editor has no node for -- anchored frames, WordArt,
 * shapes, charts, band pictures -- rides on its paragraph as an opaque
 * `bandPassthrough` attr and comes back untouched, so editing a caption never
 * drops a logo. `pmDocToBandRich` is the inverse; a paragraph the editor
 * created from nothing gets the plain shape Word gives a typed header line.
 */

import { ptToPxRounded, pxToPtRounded } from "@mrnote/core/web/lib/office-units.ts";
import {
  BAND_NUMPAGES_TOKEN,
  BAND_PAGE_TOKEN,
  normalizeBandRichBlocks,
  normalizeBandRichLine,
  normalizeBandRichList,
  normalizeBandRichTextFrame,
  normalizeBandRichMarkRun,
  isBandCharStyleId,
  normalizeBandRunFont,
  isBandFieldToken,
  isBandDatePicture,
  bandFieldCachedText,
  isNativeBandAnchorId,
  isNativeBandFieldId,
  isNativeFieldNumberFormat,
  normalizeNativeNewField,
  type BandRichBlock,
  type BandRichLine,
  type BandRichList,
  type BandRichParagraph,
  type BandRichRun,
  type BandRichTable,
  type BandRichTableCell,
  type BandRunFont,
  type NativeFieldNumberFormat,
  type NativeNewField,
} from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { createDocumentFieldAttrs } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { normalizeCellBackgroundColor } from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import { officePrimaryFontFamily } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { normalizePositionalTab } from "@mrnote/core/web/lib/document-tabstops.ts";
import { sameBandList } from "@mrnote/core/web/components/console/editor/native-document/paged/bandListMarkers.ts";
import {
  normalizeListDefinition,
  presetListDefinition,
  type ListDefinition,
  type ListLevelFormat,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { normalizeListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import { DEFAULT_BULLET_STYLE } from "@mrnote/core/web/components/console/editor/native-document/bulletListStyle.ts";

export type PmJson = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmJson[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

/** The paragraph-level extras the editor cannot draw, kept by index. */
type BandPassthrough = Pick<
  BandRichParagraph,
  "images" | "frames" | "wordArt" | "shapes" | "charts"
>;

const PASSTHROUGH_KEYS = ["images", "frames", "wordArt", "shapes", "charts"] as const;

export type BandStoryAlign = "left" | "center" | "right" | "justify";

function ptToPx(points: number): string {
  return `${ptToPxRounded(points, 4)}px`;
}

function pxToPt(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  if (!match) return null;
  const points = pxToPtRounded(Number(match[1]));
  return Number.isFinite(points) && points > 0 ? points : null;
}

function runMarks(run: BandRichRun): PmJson["marks"] {
  const marks: NonNullable<PmJson["marks"]> = [];
  if (run.bold) marks.push({ type: "bold" });
  if (run.italic) marks.push({ type: "italic" });
  if (run.underline) marks.push({ type: "underline" });
  if (typeof run.sizePt === "number" && run.sizePt > 0) {
    marks.push({ type: "fontSize", attrs: { size: ptToPx(run.sizePt) } });
  }
  if (typeof run.color === "string" && run.color) {
    marks.push({ type: "textColor", attrs: { color: run.color } });
  }
  if (run.font?.ascii) {
    marks.push({ type: "fontFamily", attrs: { family: run.font.ascii } });
  }
  if (run.font?.eastAsia) {
    marks.push({ type: "fontCjkFamily", attrs: { family: run.font.eastAsia } });
  }
  if (run.font || run.nativeTextId || run.nativeAtom || run.nativeFrom || run.frame !== undefined || run.ptab || run.charStyleId) {
    // Word's own slot identity (with the facts of the run it stands in), the
    // face slots the editor has no mark for (complex script, hint, language,
    // charset), the text box that draws the run, the slot whose run
    // properties text MRAI wrote keeps and -- for Word's content that is not
    // a text slot -- its atom id with the formatting it keeps, travel on the
    // run.
    marks.push({
      type: "bandRun",
      attrs: {
        ptab: run.ptab ? { ...run.ptab } : null,
        nativeTextId: run.nativeTextId ?? null,
        nativeRunGroup: run.nativeRunGroup ?? null,
        nativeWrapped: run.nativeWrapped ?? null,
        nativeFrom: run.nativeFrom ?? null,
        charStyleId: run.charStyleId ?? null,
        font: run.font ? { ...run.font } : null,
        nativeAtom: run.nativeAtom
          ? {
              id: run.nativeAtom,
              marks: marks.map((mark) => ({ ...mark })),
              ...(run.nativeAnchor ? { anchor: run.nativeAnchor } : {}),
              ...(run.nativeField ? { field: run.nativeField } : {}),
              ...(run.nativeField && run.nativeFieldFormat ? { format: run.nativeFieldFormat } : {}),
              ...(run.nativeField && run.nativeFieldCode ? { code: run.nativeFieldCode } : {}),
            }
          : null,
        frame: run.frame ?? null,
      },
    });
  }
  if (run.revision) {
    // A tracked change of Word's line is the editor's own tracked text, so
    // the story shows and keeps it as the body does.
    const timestamp = run.revision.date ? Date.parse(run.revision.date) : NaN;
    marks.push({
      type: run.revision.kind === "ins" ? "trackInsertion" : "trackDeletion",
      attrs: {
        author: run.revision.author ?? null,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
      },
    });
  }
  return marks;
}

/**
 * The document field a page-number field's number format is shown with in
 * the story (the editor's PAGE formats; Word's ArabicDash shows as Arabic
 * there and is painted "- 1 -" by the band).
 */
export function bandFieldDisplayFormat(format: NativeFieldNumberFormat | "none" | undefined): string {
  switch (format) {
    case "roman":
      return "roman";
    case "ROMAN":
      return "Roman";
    case "alphabetic":
      return "alphabetic";
    case "ALPHABETIC":
      return "Alphabetic";
    default:
      return "Arabic";
  }
}

/**
 * A field the story inserts into Word's own part (SECTIONPAGES, STYLEREF,
 * DOCPROPERTY) as the editor holds it: a document field atom showing the
 * result it will be written with (`text`), the field itself kept in its
 * options (`bandField` / `bandArg` / `bandFormat`). The atom is the editor's
 * STYLEREF so it draws its cached result; read back it is the band's field.
 */
export function bandNewFieldNode(field: NativeNewField, text: string, marks?: PmJson["marks"]): PmJson | null {
  const attrs = createDocumentFieldAttrs("STYLEREF", {
    options: {
      level: 1,
      bandField: field.type,
      ...(field.arg ? { bandArg: field.arg } : {}),
      ...(field.format ? { bandFormat: field.format } : {}),
    },
    cachedValue: text,
  });
  if (!attrs) return null;
  return { type: "documentField", attrs: attrs as unknown as Record<string, unknown>, ...(marks?.length ? { marks } : {}) };
}

/** The band field a document field atom is, when the story inserted it. */
export function bandNewFieldOf(attrs: Record<string, unknown> | undefined): NativeNewField | null {
  const options = attrs?.options as Record<string, unknown> | undefined;
  if (!options || typeof options.bandField !== "string") return null;
  return normalizeNativeNewField({
    type: options.bandField,
    ...(typeof options.bandArg === "string" ? { arg: options.bandArg } : {}),
    ...(typeof options.bandFormat === "string" ? { format: options.bandFormat } : {}),
  });
}

function runToInline(run: BandRichRun): PmJson[] {
  const marks = runMarks(run);
  if (run.nativeNewField) {
    const node = bandNewFieldNode(run.nativeNewField, run.text ?? "", marks);
    return node ? [node] : [];
  }
  if (run.token && run.datePicture && (run.token === "DATE" || run.token === "TIME")) {
    // Insert Date and Time's format: the body's date field atom with its
    // picture, as the dialog inserts it.
    const attrs = createDocumentFieldAttrs(run.token, {
      format: run.datePicture,
      updatePolicy: "on-open",
      cachedValue: bandFieldCachedText(run.token, new Date(), run.datePicture),
    });
    if (attrs) {
      return [{ type: "documentField", attrs: attrs as unknown as Record<string, unknown>, ...(marks?.length ? { marks } : {}) }];
    }
  }
  if (run.token) {
    const shownFormat = run.nativeFieldFormat ?? run.fieldFormat;
    const attrs =
      createDocumentFieldAttrs(run.token, {
        ...(shownFormat ? { format: bandFieldDisplayFormat(shownFormat) } : {}),
        // A field of a story MRAI writes keeps its exact format (ArabicDash
        // shows as Arabic in the story) for the band and the export.
        ...(run.fieldFormat
          ? { options: { bandFormat: run.fieldFormat } }
          : run.nativeFieldFormat === "ArabicDash"
            ? { options: { bandFormat: "ArabicDash" } }
            : {}),
      }) ??
      { fieldType: run.token };
    return [
      {
        type: "documentField",
        attrs: attrs as Record<string, unknown>,
        ...(marks?.length ? { marks } : {}),
      },
    ];
  }
  const text = typeof run.text === "string" ? run.text : "";
  if (!text) return [];
  return [{ type: "text", text, ...(marks?.length ? { marks } : {}) }];
}

function paragraphAttrs(paragraph: BandRichParagraph): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (paragraph.nativeParagraphId) attrs.nativeParagraphId = paragraph.nativeParagraphId;
  if (paragraph.nativeRemovable) attrs.nativeRemovable = paragraph.nativeRemovable;
  if (paragraph.nativeFrom) attrs.nativeParagraphFrom = paragraph.nativeFrom;
  if (paragraph.pageNumberBlock) attrs.pageNumberBlock = true;
  if (paragraph.textFrame) attrs.bandTextFrame = { ...paragraph.textFrame };
  if (paragraph.markRun) attrs.bandMarkRun = { ...paragraph.markRun };
  if (paragraph.align) attrs.textAlign = paragraph.align;
  if (typeof paragraph.spaceBeforePt === "number") attrs.spaceBefore = paragraph.spaceBeforePt;
  if (typeof paragraph.spaceAfterPt === "number") attrs.spaceAfter = paragraph.spaceAfterPt;
  if (paragraph.docxStyleId) attrs.docxStyleId = paragraph.docxStyleId;
  if (paragraph.contextualSpacing) attrs.contextualSpacing = true;
  if (paragraph.tabStops?.length) attrs.tabStops = paragraph.tabStops.map((stop) => ({ ...stop }));
  if (paragraph.indentLeftPt !== undefined) attrs.indentLeftPt = paragraph.indentLeftPt;
  if (paragraph.indentRightPt !== undefined) attrs.indentRightPt = paragraph.indentRightPt;
  if (paragraph.firstLineIndentPt !== undefined) attrs.firstLineIndentPt = paragraph.firstLineIndentPt;
  if (paragraph.paragraphBorders) attrs.paragraphBorders = paragraph.paragraphBorders;
  for (const key of ["lineHeight", "lineHeightPt", "lineHeightRule", "lineSizePt", "lineFont"] as const) {
    if (paragraph[key] !== undefined) attrs[key] = paragraph[key];
  }
  const passthrough: Partial<BandPassthrough> = {};
  for (const key of PASSTHROUGH_KEYS) {
    if (paragraph[key]?.length) passthrough[key] = paragraph[key] as never;
  }
  if (Object.keys(passthrough).length) attrs.bandPassthrough = passthrough;
  return attrs;
}

function paragraphToPm(paragraph: BandRichParagraph): PmJson {
  const content = paragraph.runs.flatMap(runToInline);
  const attrs = paragraphAttrs(paragraph);
  return {
    type: "paragraph",
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  };
}

function cellParagraphs(cell: BandRichTableCell): BandRichParagraph[] {
  if (cell.paragraphs?.length) return cell.paragraphs;
  const runs = cell.runs ?? (cell.text ? [{ text: cell.text }] : []);
  return [{ type: "paragraph", runs, ...(cell.align ? { align: cell.align } : {}) }];
}

/** The list node a band list line is an item of, as the document editor
 * holds it: a bullet list with its gallery glyph (or Define New Bullet's own
 * character), an ordered list with its scheme and first number. */
/** The definition a line with Word's own level text is drawn with in the
 * story editor: the scheme's, that level's text and format replaced. */
function bandLevelTextDefinition(list: BandRichList): ListDefinition | null {
  if (!list.levelText) return null;
  const preset = presetListDefinition(normalizeListStyleType(list.style));
  const levels = preset.levels.map((level, index) =>
    index === list.level ? { ...level, text: list.levelText!, format: list.format as ListLevelFormat } : level,
  );
  return normalizeListDefinition({ ...preset, levels });
}

/** The level text a story list's definition states, when it is the line's
 * scheme with only that level's text and format changed; else null. */
function levelTextOfDefinition(
  raw: unknown,
  style: unknown,
  level: number,
): { levelText: string; format: string } | null {
  const definition = normalizeListDefinition(raw);
  if (!definition) return null;
  const preset = presetListDefinition(normalizeListStyleType(style));
  const own = definition.levels[level];
  if (!own) return null;
  const rebuilt = normalizeListDefinition({
    ...preset,
    levels: preset.levels.map((entry, index) => (index === level ? { ...entry, text: own.text, format: own.format } : entry)),
  });
  return rebuilt && JSON.stringify(rebuilt) === JSON.stringify(definition)
    ? { levelText: own.text, format: own.format }
    : null;
}

function listNodeOf(list: BandRichList, continuesChain = false): PmJson {
  if (list.kind === "bullet") {
    const attrs: Record<string, unknown> = {};
    if (list.glyph) {
      attrs.bulletGlyph = list.glyph;
      if (list.font) attrs.bulletFont = list.font;
    } else if (list.style) {
      attrs.bulletStyle = list.style;
    }
    return { type: "bulletList", ...(Object.keys(attrs).length ? { attrs } : {}), content: [] };
  }
  const attrs: Record<string, unknown> = {};
  if (list.style) attrs.listStyleType = list.style;
  if (list.start !== undefined) attrs.start = list.start;
  const definition = bandLevelTextDefinition(list);
  if (definition) attrs.listDefinition = definition;
  // A Word count shared by several lists: the editor's numbering instance,
  // continued by every later list of it that does not start it again.
  if (list.chain) {
    attrs.listChain = list.chain;
    if (continuesChain) attrs.listContinue = true;
  }
  return { type: "orderedList", ...(Object.keys(attrs).length ? { attrs } : {}), content: [] };
}

/** The key of a chained line's count at its level. */
function chainLevelKey(list: BandRichList): string | null {
  return list.kind === "ordered" && list.chain ? `${list.chain}@${list.level}` : null;
}

/**
 * A container's lines as document nodes: plain lines as paragraphs, and each
 * run of list lines as the nested list nodes the document editor draws and
 * edits (Bullets, Numbering, Tab / Shift+Tab, Enter all act on them as in the
 * body). A line at level L continues the list open at L when it is the same
 * list and starts a new one otherwise; it nests under the item before it,
 * never deeper than one level below it (a list item holds its nested list).
 */
function linesToPm(paragraphs: readonly BandRichParagraph[]): PmJson[] {
  const out: PmJson[] = [];
  const open: { list: BandRichList; node: PmJson; item: PmJson | null }[] = [];
  const chained = new Set<string>();
  for (const paragraph of paragraphs) {
    const list = paragraph.list;
    if (!list) {
      open.length = 0;
      out.push(paragraphToPm(paragraph));
      continue;
    }
    const level = Math.min(list.level, open.length);
    open.length = Math.min(open.length, level + 1);
    let entry = open[level];
    const chainKey = chainLevelKey(list);
    if (!entry || !sameBandList(entry.list, list)) {
      const node = listNodeOf(list, chainKey !== null && chained.has(chainKey) && !list.restart);
      const parentItem = level > 0 ? open[level - 1]?.item : null;
      if (parentItem) (parentItem.content ??= []).push(node);
      else out.push(node);
      entry = { list, node, item: null };
      open[level] = entry;
    }
    if (chainKey) chained.add(chainKey);
    open.length = level + 1;
    const line = { ...paragraph };
    delete line.list;
    const item: PmJson = { type: "listItem", content: [paragraphToPm(line)] };
    entry.node.content!.push(item);
    entry.item = item;
  }
  return out;
}

function tableToPm(table: BandRichTable): PmJson {
  const byPosition = new Map<string, BandRichTableCell>();
  for (const cell of table.cells) byPosition.set(`${cell.row}:${cell.col}`, cell);
  const rows: PmJson[] = [];
  for (let row = 0; row < table.rows; row += 1) {
    const cells: PmJson[] = [];
    for (let col = 0; col < table.cols; col += 1) {
      const cell = byPosition.get(`${row}:${col}`);
      if (!cell) continue;
      const attrs: Record<string, unknown> = {};
      if (cell.colspan && cell.colspan > 1) attrs.colspan = cell.colspan;
      if (cell.rowspan && cell.rowspan > 1) attrs.rowspan = cell.rowspan;
      if (cell.verticalAlign) attrs.verticalAlign = cell.verticalAlign;
      if (cell.cellMargin) attrs.cellMargins = cell.cellMargin;
      if (cell.shading) attrs.backgroundColor = cell.shading;
      const paragraphs = linesToPm(cellParagraphs(cell));
      cells.push({
        type: "tableCell",
        ...(Object.keys(attrs).length ? { attrs } : {}),
        content: paragraphs.length ? paragraphs : [{ type: "paragraph" }],
      });
    }
    rows.push({ type: "tableRow", content: cells });
  }
  const attrs: Record<string, unknown> = {
    bandTable: {
      columnWidthsPx: table.columnWidthsPx,
      nativeColumnWidthsTwips: table.nativeColumnWidthsTwips,
      columnWidthsPct: table.columnWidthsPct,
      tableAlign: table.tableAlign,
      bidiVisual: table.bidiVisual,
      tableIndentTwips: table.tableIndentTwips,
      floatPosition: table.floatPosition,
      // The table's own borders and rows' heights, and each cell's borders by
      // its place in the grid: the band editor draws the grid, the save
      // writes them back as the table stated them.
      borders: table.borders,
      rowHeights: table.rowHeights,
      cellBorders: Object.fromEntries(
        table.cells.filter((cell) => cell.borders).map((cell) => [`${cell.row}:${cell.col}`, cell.borders]),
      ),
    },
  };
  return { type: "table", attrs, content: rows };
}

/** The story as a document the band editor can open. An empty story is one
 * empty paragraph -- Word's "[Type here]" line. */
export function bandRichToPmDoc(blocks: readonly BandRichBlock[] | null | undefined): PmJson {
  const content: PmJson[] = [];
  let lines: BandRichParagraph[] = [];
  for (const block of blocks ?? []) {
    if (block.type === "paragraph") {
      lines.push(block);
      continue;
    }
    content.push(...linesToPm(lines), tableToPm(block));
    lines = [];
  }
  content.push(...linesToPm(lines));
  // The document schema's doc is `pageBlock+`; the story is one block.
  return {
    type: "doc",
    content: [{ type: "pageBlock", content: content.length ? content : [{ type: "paragraph" }] }],
  };
}

// ---------------------------------------------------------------------------
// Back to the band model
// ---------------------------------------------------------------------------

function markAttr(node: PmJson, type: string, key: string): unknown {
  const mark = node.marks?.find((candidate) => candidate.type === type);
  return mark ? mark.attrs?.[key] : undefined;
}

function hasMark(node: PmJson, type: string): boolean {
  return Boolean(node.marks?.some((candidate) => candidate.type === type));
}

/** The marks a band run carries (`inlineFormatting` reads exactly these). */
const BAND_RUN_MARKS = new Set([
  // A tracked change is written back as Word's w:ins / w:del (`revision`).
  "trackInsertion",
  "trackDeletion",
  "bold",
  "italic",
  "underline",
  "fontSize",
  "textColor",
  "fontFamily",
  "fontCjkFamily",
  "bandRun",
]);

function runFromInline(node: PmJson, unsupported?: string[]): BandRichRun | BandRichRun[] | null {
  if (node.type === "documentField") {
    const fieldType = node.attrs?.fieldType;
    const newField = bandNewFieldOf(node.attrs);
    if (newField) {
      const cached = typeof node.attrs?.cachedValue === "string" ? node.attrs.cachedValue : "";
      return { text: cached || `[${newField.arg ?? newField.type}]`, nativeNewField: newField, ...inlineFormatting(node) };
    }
    if (!isBandFieldToken(fieldType)) {
      unsupported?.push(`documentField:${String(fieldType)}`);
      return null;
    }
    const formatting = inlineFormatting(node);
    const bandFormat = (node.attrs?.options as { bandFormat?: unknown } | undefined)?.bandFormat;
    if (
      (fieldType === "PAGE" || fieldType === "NUMPAGES") &&
      !formatting.nativeField &&
      !formatting.nativeAtom &&
      isNativeFieldNumberFormat(bandFormat) &&
      bandFormat !== "Arabic"
    ) {
      return { token: fieldType, ...formatting, fieldFormat: bandFormat };
    }
    const picture = node.attrs?.format;
    if (
      (fieldType === "DATE" || fieldType === "TIME") &&
      !formatting.nativeField &&
      !formatting.nativeAtom &&
      isBandDatePicture(picture) &&
      picture !== (fieldType === "DATE" ? "M/d/yyyy" : "h:mm am/pm")
    ) {
      return { token: fieldType, ...formatting, datePicture: picture };
    }
    return { token: fieldType, ...formatting };
  }
  if (node.type === "text") {
    const text = typeof node.text === "string" ? node.text : "";
    if (!text) return null;
    // A mark the band cannot hold (strikethrough, a hyperlink, ...) is named,
    // as a foreign block is, so the story editor refuses the commit with a
    
    for (const mark of node.marks ?? []) {
      if (!BAND_RUN_MARKS.has(mark.type)) unsupported?.push(`mark:${mark.type}`);
    }
    const format = inlineFormatting(node);
    const ptab = normalizePositionalTab(markAttr(node, "bandRun", "ptab"));
    if (!ptab || format.nativeTextId || format.nativeFrom) return { text, ...format };
    // Word's absolute position tab is one tab character of its own run. The
    // editor joins two alike ones into one text node, and text typed between
    // them joins it too: every tab of the node is one, the rest plain text.
    return text
      .split(/(\t)/)
      .filter(Boolean)
      .map((piece) => (piece === "\t" ? { text: piece, ...format, ptab: { ...ptab } } : { text: piece, ...format }));
  }
  if (node.type === "hardBreak") return { text: "\n" };
  unsupported?.push(node.type);
  return null;
}

/** The single family a band run may name, from a mark's family or stack. */
function bandFontName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const primary = officePrimaryFontFamily(value);
  return normalizeBandRunFont({ ascii: primary })?.ascii ?? null;
}

/** Word's revision date (`w:date`, whole seconds) for an editor timestamp. */
function revisionDate(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function inlineRevision(node: PmJson): BandRichRun["revision"] {
  for (const type of ["trackInsertion", "trackDeletion"] as const) {
    const mark = node.marks?.find((candidate) => candidate.type === type);
    if (!mark) continue;
    const author = mark.attrs?.author;
    const date = revisionDate(mark.attrs?.timestamp);
    return {
      kind: type === "trackInsertion" ? "ins" : "del",
      ...(typeof author === "string" && author ? { author: author.slice(0, 255) } : {}),
      ...(date ? { date } : {}),
    };
  }
  return undefined;
}

function inlineFormatting(node: PmJson): Omit<BandRichRun, "text" | "token"> {
  const out: Omit<BandRichRun, "text" | "token"> = {};
  const revision = inlineRevision(node);
  if (revision) out.revision = revision;
  if (hasMark(node, "bold")) out.bold = true;
  if (hasMark(node, "italic")) out.italic = true;
  if (hasMark(node, "underline")) out.underline = true;
  const sizePt = pxToPt(markAttr(node, "fontSize", "size"));
  if (sizePt !== null) out.sizePt = sizePt;
  const color = markAttr(node, "textColor", "color");
  if (typeof color === "string" && color) out.color = color;
  const kept = markAttr(node, "bandRun", "font");
  const font: BandRunFont =
    kept && typeof kept === "object" && !Array.isArray(kept) ? { ...(kept as BandRunFont) } : {};
  // The ribbon's font picker writes a CSS font stack ('Georgia, "Times New
  // Roman", serif'); a band run names ONE family, as Word's rFonts does. The
  // stack went into the band as it was, the band's validator refused the
  // whole band for it, and every word of the header was gone when the
  // header closed. The run takes the stack's first family; a name the band
  // cannot hold leaves the run its words without a font.
  const ascii = bandFontName(markAttr(node, "fontFamily", "family"));
  const eastAsia = bandFontName(markAttr(node, "fontCjkFamily", "family"));
  if (ascii) font.ascii = ascii;
  else delete font.ascii;
  if (eastAsia) font.eastAsia = eastAsia;
  else delete font.eastAsia;
  if (font.ascii || font.eastAsia || font.cs) out.font = font;
  const charStyleId = markAttr(node, "bandRun", "charStyleId");
  if (isBandCharStyleId(charStyleId)) out.charStyleId = charStyleId;
  const nativeTextId = markAttr(node, "bandRun", "nativeTextId");
  if (typeof nativeTextId === "string" && nativeTextId) {
    out.nativeTextId = nativeTextId;
    const group = markAttr(node, "bandRun", "nativeRunGroup");
    if (typeof group === "string" && group) out.nativeRunGroup = group;
    const wrapped = markAttr(node, "bandRun", "nativeWrapped");
    if (wrapped === "box" || wrapped === "link") out.nativeWrapped = wrapped;
  }
  const atom = markAttr(node, "bandRun", "nativeAtom") as
    | { id?: unknown; anchor?: unknown; field?: unknown }
    | null
    | undefined;
  if (atom && typeof atom.id === "string" && !out.nativeTextId) {
    out.nativeAtom = atom.id;
    if (isNativeBandAnchorId(atom.anchor)) out.nativeAnchor = atom.anchor;
    if (isNativeBandFieldId(atom.field)) {
      out.nativeField = atom.field;
      const format = (atom as { format?: unknown }).format;
      if (format === "none" || isNativeFieldNumberFormat(format)) out.nativeFieldFormat = format;
      const code = (atom as { code?: unknown }).code;
      if (code && typeof code === "object" && !Array.isArray(code)) {
        out.nativeFieldCode = code as Record<string, unknown>;
      }
    }
  }
  const origin = markAttr(node, "bandRun", "nativeFrom");
  if (typeof origin === "string" && origin && !out.nativeTextId && !out.nativeAtom) out.nativeFrom = origin;
  const frame = markAttr(node, "bandRun", "frame");
  if (typeof frame === "number" && Number.isInteger(frame) && frame >= 0) out.frame = frame;
  return out;
}

/** Adjacent runs with the same formatting are one run, as the model keeps them. */
function mergeRuns(runs: BandRichRun[]): BandRichRun[] {
  const out: BandRichRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (
      last &&
      !last.token &&
      !run.token &&
      // A positional tab stays the one tab character it is.
      !last.ptab &&
      !run.ptab &&
      typeof last.text === "string" &&
      typeof run.text === "string"
    ) {
      const lastFormat = { ...last, text: undefined };
      const runFormat = { ...run, text: undefined };
      if (JSON.stringify(lastFormat) === JSON.stringify(runFormat)) {
        last.text = last.text + run.text;
        continue;
      }
    }
    out.push({ ...run });
  }
  return out;
}

/** The ribbon writes a line-spacing multiple as text ("1.5", the editor's
 * paragraph value); the band keeps it as the number it is, or drops it. */
function storyLineMultiple(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : value;
}

/**
 * The Word line inputs of one story line (a paragraph node's attrs), as the
 * band keeps them once the story is saved: the painted band sets the line
 * from exactly these, and so does the story editor (`bandLineLayout.ts`).
 */
export function bandLineFromParagraphAttrs(attrs: Record<string, unknown>): BandRichLine {
  return normalizeBandRichLine({
    lineHeight: storyLineMultiple(attrs.lineHeight),
    lineHeightPt: attrs.lineHeightPt,
    lineHeightRule: attrs.lineHeightRule,
    lineSizePt: attrs.lineSizePt,
    lineFont: attrs.lineFont,
  });
}

function paragraphFromPm(node: PmJson, unsupported?: string[]): BandRichParagraph {
  const attrs = node.attrs ?? {};
  const runs = mergeRuns(
    (node.content ?? []).flatMap((child) => runFromInline(child, unsupported) ?? []),
  );
  const paragraph: BandRichParagraph = { type: "paragraph", runs };
  if (typeof attrs.nativeParagraphId === "string" && attrs.nativeParagraphId) {
    paragraph.nativeParagraphId = attrs.nativeParagraphId;
    if (typeof attrs.nativeRemovable === "string" && attrs.nativeRemovable) {
      paragraph.nativeRemovable = attrs.nativeRemovable;
    }
  } else if (typeof attrs.nativeParagraphFrom === "string" && attrs.nativeParagraphFrom) {
    paragraph.nativeFrom = attrs.nativeParagraphFrom;
  }
  if (attrs.pageNumberBlock === true) paragraph.pageNumberBlock = true;
  const textFrame = normalizeBandRichTextFrame(attrs.bandTextFrame);
  if (textFrame) paragraph.textFrame = textFrame;
  const markRun = normalizeBandRichMarkRun(attrs.bandMarkRun);
  if (markRun) paragraph.markRun = markRun;
  const align = attrs.textAlign;
  if (align === "center" || align === "right" || align === "justify") paragraph.align = align;
  if (typeof attrs.spaceBefore === "number") paragraph.spaceBeforePt = attrs.spaceBefore;
  if (typeof attrs.spaceAfter === "number") paragraph.spaceAfterPt = attrs.spaceAfter;
  if (typeof attrs.docxStyleId === "string" && attrs.docxStyleId) paragraph.docxStyleId = attrs.docxStyleId;
  if (attrs.contextualSpacing === true) paragraph.contextualSpacing = true;
  if (Array.isArray(attrs.tabStops) && attrs.tabStops.length) {
    paragraph.tabStops = attrs.tabStops as BandRichParagraph["tabStops"];
  }
  for (const key of ["indentLeftPt", "indentRightPt", "firstLineIndentPt"] as const) {
    if (typeof attrs[key] === "number") paragraph[key] = attrs[key] as number;
  }
  if (attrs.paragraphBorders && typeof attrs.paragraphBorders === "object") {
    paragraph.paragraphBorders = attrs.paragraphBorders as BandRichParagraph["paragraphBorders"];
  }
  for (const key of ["lineHeight", "lineHeightPt", "lineHeightRule", "lineSizePt", "lineFont"] as const) {
    const value = key === "lineHeight" ? storyLineMultiple(attrs.lineHeight) : attrs[key];
    if (value !== undefined && value !== null) {
      (paragraph as unknown as Record<string, unknown>)[key] = value;
    }
  }
  const passthrough = attrs.bandPassthrough;
  if (passthrough && typeof passthrough === "object") {
    for (const key of PASSTHROUGH_KEYS) {
      const value = (passthrough as Partial<BandPassthrough>)[key];
      if (Array.isArray(value) && value.length) (paragraph as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return paragraph;
}

function tableFromPm(node: PmJson, unsupported?: string[]): BandRichTable | null {
  const rows = (node.content ?? []).filter((row) => row.type === "tableRow");
  const cells: BandRichTableCell[] = [];
  let cols = 0;
  // Grid slots a cell of an earlier row still covers (its rowspan): a cell of
  // this row sits at the first column they leave free. Counting from 0 put a
  // vertically merged table's second-row cell in the merged column, and the
  
  const covered = new Set<string>();
  rows.forEach((row, rowIndex) => {
    let col = 0;
    for (const cell of row.content ?? []) {
      if (cell.type !== "tableCell" && cell.type !== "tableHeader") continue;
      while (covered.has(`${rowIndex}:${col}`)) col += 1;
      const paragraphs = (cell.content ?? []).flatMap((child) => linesOfNode(child, unsupported));
      const entry: BandRichTableCell = {
        row: rowIndex,
        col,
        text: paragraphs
          .map((paragraph) => paragraph.runs.map((run) => run.text ?? "").join(""))
          .join("\n"),
        paragraphs,
      };
      const colspan = cell.attrs?.colspan;
      const rowspan = cell.attrs?.rowspan;
      if (typeof colspan === "number" && colspan > 1) entry.colspan = colspan;
      if (typeof rowspan === "number" && rowspan > 1) entry.rowspan = rowspan;
      const verticalAlign = cell.attrs?.verticalAlign;
      if (verticalAlign === "top" || verticalAlign === "center" || verticalAlign === "bottom") {
        entry.verticalAlign = verticalAlign;
      }
      if (cell.attrs?.cellMargins && typeof cell.attrs.cellMargins === "object") {
        entry.cellMargin = cell.attrs.cellMargins as BandRichTableCell["cellMargin"];
      }
      // The cell's shading, as the body's cells keep it: dropped here, a header
      
      const shading = normalizeCellBackgroundColor(cell.attrs?.backgroundColor);
      if (shading) entry.shading = shading;
      cells.push(entry);
      const across = typeof colspan === "number" && colspan > 1 ? colspan : 1;
      const down = typeof rowspan === "number" && rowspan > 1 ? rowspan : 1;
      for (let r = 0; r < down; r += 1) {
        for (let c = 0; c < across; c += 1) {
          if (r || c) covered.add(`${rowIndex + r}:${col + c}`);
        }
      }
      col += across;
    }
    while (covered.has(`${rowIndex}:${col}`)) col += 1;
    cols = Math.max(cols, col);
  });
  if (!rows.length || !cols) return null;
  const table: BandRichTable = { type: "table", rows: rows.length, cols, cells };
  const kept = node.attrs?.bandTable;
  if (kept && typeof kept === "object") {
    const extras = kept as Partial<BandRichTable>;
    if (extras.columnWidthsPx) table.columnWidthsPx = extras.columnWidthsPx;
    if (extras.nativeColumnWidthsTwips) table.nativeColumnWidthsTwips = extras.nativeColumnWidthsTwips;
    if (extras.columnWidthsPct) table.columnWidthsPct = extras.columnWidthsPct;
    if (extras.tableAlign) table.tableAlign = extras.tableAlign;
    if (extras.floatPosition) table.floatPosition = extras.floatPosition;
    if (extras.bidiVisual === true) table.bidiVisual = true;
    if (typeof extras.tableIndentTwips === "number" && extras.tableIndentTwips) table.tableIndentTwips = extras.tableIndentTwips;
    if (extras.borders) table.borders = extras.borders;
    // Heights are the rows'; a row added or removed in the band leaves them
    // to the rows the table now has.
    if (extras.rowHeights && extras.rowHeights.length === table.rows) table.rowHeights = extras.rowHeights;
    const cellBorders = (kept as { cellBorders?: Record<string, BandRichTableCell["borders"]> }).cellBorders;
    if (cellBorders && typeof cellBorders === "object") {
      for (const cell of table.cells) {
        const borders = cellBorders[`${cell.row}:${cell.col}`];
        if (borders) cell.borders = borders;
      }
    }
  }
  return table;
}

const BAND_LIST_NODE_TYPES: ReadonlySet<string> = new Set(["bulletList", "orderedList"]);

/** What a list node says about its items' markers, as a band line keeps it.
 * A setting the band cannot hold (a Define New Number Format definition, a
 * picture bullet, a bullet alignment, Continue Numbering, a document list
 * style) is named in `unsupported`, so the edit is refused instead of the
 * marker changing on save. */
function listOfNode(node: PmJson, level: number, unsupported?: string[]): BandRichList {
  const attrs = node.attrs ?? {};
  const present = (key: string) => attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== false;
  const candidate: BandRichList = { kind: node.type === "bulletList" ? "bullet" : "ordered", level };
  if (node.type === "bulletList") {
    if (typeof attrs.bulletGlyph === "string" && attrs.bulletGlyph) {
      candidate.glyph = attrs.bulletGlyph;
      if (typeof attrs.bulletFont === "string" && attrs.bulletFont) candidate.font = attrs.bulletFont;
    } else if (typeof attrs.bulletStyle === "string" && attrs.bulletStyle !== DEFAULT_BULLET_STYLE) {
      // The editor's default glyph is Word's bullet library at the level
      // (a nested list draws the circle, then the square), stated by absence.
      candidate.style = attrs.bulletStyle;
    }
    for (const key of ["bulletPicture", "bulletAlign"]) if (present(key)) unsupported?.push(`list:${key}`);
  } else {
    if (typeof attrs.listStyleType === "string") candidate.style = attrs.listStyleType;
    const start = typeof attrs.start === "string" ? Number(attrs.start) : attrs.start;
    if (typeof start === "number") candidate.start = start;
    // A chained list that does not continue its count starts it again; the
    // first line of a count needs no mark (see dropFirstRestarts).
    const levelText = present("listDefinition")
      ? levelTextOfDefinition(attrs.listDefinition, attrs.listStyleType, Math.min(level, 8))
      : null;
    if (levelText) {
      candidate.levelText = levelText.levelText;
      candidate.format = levelText.format;
    }
    for (const key of ["listDefinition", "listStyleId"]) {
      if (key === "listDefinition" && levelText) continue;
      if (present(key)) unsupported?.push(`list:${key}`);
    }
    if (typeof attrs.listChain === "string" && attrs.listChain) {
      candidate.chain = attrs.listChain;
      if (attrs.listContinue !== true) candidate.restart = true;
    } else if (present("listContinue")) {
      unsupported?.push("list:listContinue");
    }
  }
  const list = normalizeBandRichList(candidate);
  if (list) return list;
  unsupported?.push("list");
  return { kind: candidate.kind, level: Math.min(level, 8) };
}

/**
 * The lines of a list node: each item is one line carrying its list (a
 * second paragraph of an item joins it after a line break, as the export
 * writes such an item in the body), and a nested list's items follow at the
 * next level.
 */
function withoutRestart(list: BandRichList): BandRichList {
  if (!list.restart) return list;
  const rest = { ...list };
  delete rest.restart;
  return rest;
}

function listLines(node: PmJson, level: number, unsupported?: string[]): BandRichParagraph[] {
  const list = listOfNode(node, level, unsupported);
  const out: BandRichParagraph[] = [];
  let firstItem = true;
  for (const item of node.content ?? []) {
    if (item.type !== "listItem") {
      out.push(...linesOfForeignBlock(item, unsupported));
      continue;
    }
    let line: BandRichParagraph | null = null;
    // Only a list's first item starts its count again.
    const itemList = firstItem ? list : withoutRestart(list);
    firstItem = false;
    for (const child of item.content ?? []) {
      if (child.type === "paragraph" || child.type === "heading") {
        const paragraph = paragraphFromPm(child, unsupported);
        if (!line) {
          line = { ...paragraph, list: { ...itemList } };
          out.push(line);
        } else if (out[out.length - 1] === line) {
          line.runs = mergeRuns([...line.runs, { text: "\n" }, ...paragraph.runs]);
        } else {
          // Text after a nested list inside one item has no line of its own
          // in Word's list model.
          unsupported?.push("listItem:continuation");
          out.push(paragraph);
        }
        continue;
      }
      if (BAND_LIST_NODE_TYPES.has(child.type)) {
        if (!line) {
          line = { type: "paragraph", runs: [], list: { ...itemList } };
          out.push(line);
        }
        out.push(...listLines(child, level + 1, unsupported));
        continue;
      }
      out.push(...linesOfForeignBlock(child, unsupported));
    }
    if (!line) out.push({ type: "paragraph", runs: [], list: { ...itemList } });
  }
  return out;
}

/** A count's first line at its level starts it anyway: no restart mark, as
 * the import writes it (a restart marks a line after earlier ones). */
function dropFirstRestarts(lines: readonly BandRichParagraph[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    const list = line.list;
    const key = list ? chainLevelKey(list) : null;
    if (!list || !key) continue;
    if (list.restart && !seen.has(key)) delete list.restart;
    seen.add(key);
  }
}

/** A container's child node as band lines: a line, a list's lines, or the
 * lines of a block the band has no place for. */
function linesOfNode(node: PmJson, unsupported?: string[]): BandRichParagraph[] {
  if (node.type === "paragraph" || node.type === "heading") return [paragraphFromPm(node, unsupported)];
  if (BAND_LIST_NODE_TYPES.has(node.type)) return listLines(node, 0, unsupported);
  return linesOfForeignBlock(node, unsupported);
}

/** The lines of a block the band has no place for (a task list, a quote, a
 * code block, a rule), named in `unsupported`: its words are still read,
 * never dropped, and the caller refuses the edit by that name. */
function linesOfForeignBlock(node: PmJson, unsupported?: string[]): BandRichParagraph[] {
  unsupported?.push(node.type);
  const content = node.content ?? [];
  if (!content.length) return [];
  if (content.every((child) => !child.content)) return [paragraphFromPm(node, unsupported)];
  return content.flatMap((child) =>
    child.type === "paragraph" || child.type === "heading"
      ? [paragraphFromPm(child, unsupported)]
      : linesOfForeignBlock(child, unsupported),
  );
}

/** A run longer than the band model holds, as runs that hold it all: the
 * first keeps the run's identity, the rest keep the slot whose run
 * properties they share (`nativeFrom`). */
function splitLongRuns(runs: BandRichRun[]): BandRichRun[] {
  return runs.flatMap((run) => {
    if (run.token || typeof run.text !== "string" || run.text.length <= BAND_RUN_TEXT_LIMIT) return [run];
    const characters = Array.from(run.text);
    if (characters.length <= BAND_RUN_TEXT_LIMIT) return [run];
    const pieces: BandRichRun[] = [];
    const origin = run.nativeTextId ?? run.nativeFrom;
    for (let index = 0; index < characters.length; index += BAND_RUN_TEXT_LIMIT) {
      const text = characters.slice(index, index + BAND_RUN_TEXT_LIMIT).join("");
      if (!index) {
        pieces.push({ ...run, text });
        continue;
      }
      const rest: BandRichRun = { ...run, text };
      delete rest.nativeTextId;
      delete rest.nativeRunGroup;
      delete rest.nativeWrapped;
      delete rest.nativeFrom;
      if (origin) rest.nativeFrom = origin;
      pieces.push(rest);
    }
    return pieces;
  });
}

const BAND_RUN_TEXT_LIMIT = 500;

/**
 * The band model of what the editor holds. A story that is one empty
 * paragraph is an empty story (Word's "[Type here]" line saves nothing).
 * The result is run through the model's own normalizer, so the editor can
 * never persist a shape the exporters would not accept.
 *
 * Nothing the band model cannot hold is dropped silently: every node it has
 * no place for (a list, a quote, a code block, a rule, an inline object) is
 * named in `unsupported` -- the words inside it are still read as lines --
 * and the caller refuses the edit by that name. In a
 * story of Word's own part, text longer than one band run holds goes on in
 * further runs instead of being cut.
 */
export function pmDocToBandRich(doc: PmJson, unsupported?: string[]): BandRichBlock[] {
  const blocks: BandRichBlock[] = [];
  const nodes = (doc.content ?? []).flatMap((node) =>
    node.type === "pageBlock" ? (node.content ?? []) : [node],
  );
  for (const node of nodes) {
    if (node.type === "table") {
      const table = tableFromPm(node, unsupported);
      if (table) blocks.push(table);
      continue;
    }
    blocks.push(...linesOfNode(node, unsupported));
  }
  dropFirstRestarts(blocks.filter((block): block is BandRichParagraph => block.type === "paragraph"));
  const paragraphs = blocks.flatMap((block) =>
    block.type === "paragraph" ? [block] : block.cells.flatMap((cell) => cell.paragraphs ?? []),
  );
  // Word's own part keeps its empty lines: they are its paragraphs.
  const native = paragraphs.some((paragraph) => paragraph.nativeParagraphId);
  if (native) {
    for (const paragraph of paragraphs) paragraph.runs = splitLongRuns(paragraph.runs);
  }
  const meaningful = native || blocks.some(
    (block) =>
      block.type === "table" ||
      block.runs.length > 0 ||
      block.list !== undefined ||
      PASSTHROUGH_KEYS.some((key) => (block[key]?.length ?? 0) > 0),
  );
  if (!meaningful) return [];
  return normalizeBandRichBlocks(blocks, true) ?? [];
}

/** The plain text a story shows, with Word's field tokens, for the legacy
 * plain-text band attrs and the accessibility name of the band. */
export function bandStoryPlainText(doc: PmJson): string {
  const lines: string[] = [];
  const visit = (node: PmJson): void => {
    if (node.type === "paragraph" || node.type === "heading") {
      lines.push(
        (node.content ?? [])
          .map((child) =>
            child.type === "documentField"
              ? child.attrs?.fieldType === "PAGE"
                ? BAND_PAGE_TOKEN
                : child.attrs?.fieldType === "NUMPAGES"
                  ? BAND_NUMPAGES_TOKEN
                  : ""
              : (child.text ?? ""),
          )
          .join(""),
      );
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return lines.join("\n").trim();
}

/** A plain band line ("Draft {PAGE} of {NUMPAGES}") as runs with field tokens. */
export function bandRichRunsFromTokenText(line: string): BandRichRun[] {
  const runs: BandRichRun[] = [];
  const pattern = new RegExp(`(${BAND_PAGE_TOKEN.replace(/[{}]/g, "\\$&")}|${BAND_NUMPAGES_TOKEN.replace(/[{}]/g, "\\$&")})`, "g");
  for (const part of line.split(pattern)) {
    if (!part) continue;
    if (part === BAND_PAGE_TOKEN) runs.push({ token: "PAGE" });
    else if (part === BAND_NUMPAGES_TOKEN) runs.push({ token: "NUMPAGES" });
    else runs.push({ text: part });
  }
  return runs;
}
