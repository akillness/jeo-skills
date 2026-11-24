/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { getMarkRange, type ChainedCommands, type Editor, type JSONContent } from "@tiptap/core";
import { breakRefusalAt } from "@mrnote/core/web/components/console/editor/native-document/breakPlacement.ts";
import type { Mark as PmMark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { inheritedBoldValue } from "@mrnote/core/web/components/console/editor/native-document/boldExtension.ts";
import { inheritedItalicValue } from "@mrnote/core/web/components/console/editor/native-document/italicExtension.ts";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isOverlayBlock } from "@mrnote/core/web/components/console/editor/native-document/paged/overlayOnlyChange.ts";
import { blankPageBodyBlocks, blankPageCopyAttrs, type BlankPageBlock } from "@mrnote/core/web/components/console/editor/native-document/trailingBlankPage.ts";
import { findOutermostTable } from "@mrnote/core/web/components/console/editor/native-document/tableStructureExtension.ts";
import { SYMBOL_CHAR_MARK, type OfficeSymbolInsertion } from "@mrnote/core/web/lib/office-symbols.ts";
import type { DocumentSmartArtProjection } from "@mrnote/core/web/lib/office-smartart/document-shapes-model.ts";
import { documentDefaultShapeStylePatch, documentWordArtInsertAttrs } from "@mrnote/core/web/lib/document-wordart-style-adapter.ts";
import type { OfficeWordArtRecipe } from "@mrnote/core/web/lib/office-wordart-style-catalog.ts";
import {
  documentShapeDefaultAttrs,
  documentShapeDefinition,
  type DocumentShapeAttrs,
  type DocumentShapePreset,
} from "@mrnote/core/web/lib/document-shapes.ts";
import { readOfficeDefaultShapeStyle } from "@mrnote/core/web/lib/office-default-shape-style.ts";
import { DEFAULT_DOCUMENT_CHART_SIZE } from "@mrnote/core/web/components/console/editor/extensions/documentChartHost.ts";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { buildMailtoHref } from "./DocumentHyperlinkDialog";
import {
  DELETION_MARK_NAME,
  FORMAT_REVISION_MARK_NAME,
  INSERTION_MARK_NAME,
} from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";
import type { DocumentHyperlinkRequest } from "./DocumentHyperlinkDialog";
import {
  documentDateTimeFormat,
  formatDocumentDateTime,
  type DocumentDateTimeLocale,
} from "@mrnote/core/web/components/console/editor/native-document/documentDateTime.ts";
import type { DocumentFieldType } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import {
  newQuickPartId,
  normalizeDocumentQuickPart,
  MAX_DOCUMENT_QUICK_PARTS,
  quickPartContentFromSelection,
  quickPartContentWithFreshNotes,
  quickPartInsertion,
  quickPartNotesForContent,
  type DocumentQuickPart,
} from "@mrnote/core/web/components/console/editor/native-document/documentQuickParts.ts";
import {
  collectLinkPlaces,
  findLinkPlaceByHref,
  normalizeLinkTitle,
  type LinkPlaceOption,
} from "@mrnote/core/web/components/console/editor/native-document/linkPlaces.ts";
import { pictureLinkAttrs } from "@mrnote/core/web/components/console/editor/native-document/pictureLink.ts";
import { insertDocumentShapeContent } from "@mrnote/core/web/components/console/editor/native-document/documentShapeInsertion.ts";
import { applyDocumentTableLayoutPolicy } from "@mrnote/core/web/components/console/editor/native-document/tableStructure.ts";
import type { DocumentTableConversionSettings } from "./DocumentTableConversionDialog";
import {
  convertParagraphsToTableRows,
  tableNodeFromConvertedRows,
  textTableSelectionParagraphs,
} from "./textTableConvert";

/**
 * Insert-tab buttons whose logic is more than one editor command. The ribbon
 * (and the dialogs it opens) and the AI's editor commands both call these;
 * nothing here reads the person's selection, a dialog's state or the DOM.
 */

import { normalizeDocumentUrl } from "@mrnote/core/web/components/console/editor/native-document/documentUrl.ts";
import { FOOTNOTES_ATTR, readFootnotes } from "@mrnote/core/web/components/console/editor/native-document/footnoteExtension.tsx";

export { normalizeDocumentUrl };

/**
 * Whether a manual page break sits right before a caret at the start of its
 * paragraph, or right after a caret at its end. Body blocks are read in
 * document order across the paged layout's page containers.
 */
export function pageBreaksBesideCaret(state: EditorState): { before: boolean; after: boolean } {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.depth < 1) {
    return { before: false, after: false };
  }
  const container = $from.node($from.depth - 1).type.name;
  if (container !== "doc" && container !== "pageBlock") {
    return { before: false, after: false };
  }
  const paragraphPos = $from.before($from.depth);
  const blocks: Array<{ pos: number; name: string }> = [];
  state.doc.descendants((node, pos, parent) => {
    if (node.type.name === "pageBlock") return true;
    if (parent && (parent.type.name === "doc" || parent.type.name === "pageBlock")) {
      blocks.push({ pos, name: node.type.name });
    }
    return false;
  });
  const index = blocks.findIndex((block) => block.pos === paragraphPos);
  if (index < 0) return { before: false, after: false };
  return {
    before: $from.parentOffset === 0 && blocks[index - 1]?.name === "pageBreak",
    after:
      $from.parentOffset === $from.parent.content.size &&
      blocks[index + 1]?.name === "pageBreak",
  };
}

/** The docx paragraph index a source anchor names: the paragraph's own (`#p[N]`) or an object's in it. */
function blankPageSourceParagraph(node: ProseMirrorNode, own: boolean): number | null {
  const source = node.attrs?.source as { sourceAnchor?: unknown; hostAnchor?: unknown } | null | undefined;
  if (!own && typeof source?.hostAnchor === "string") {
    const moved = /#p\[(\d+)\]$/.exec(source.hostAnchor);
    return moved ? Number(moved[1]) : null;
  }
  const anchor = source?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  const match = own ? /#p\[(\d+)\](?:\/seg\[\d+\])?$/.exec(anchor) : /#p\[(\d+)\]\/(?!seg\[)/.exec(anchor);
  return match ? Number(match[1]) : null;
}

/**
 * The paragraph at `index` with the floating objects anchored to it: the
 * drawings standing right before it (ink and shapes drawn on it) and the
 * imported ones standing right after it that name it as their paragraph.
 */
function blankPageAnchorGroup(blocks: readonly BlankPageBlock[], index: number): { first: number; last: number } {
  let first = index;
  while (first > 0 && isOverlayBlock(blocks[first - 1]!.node)) first -= 1;
  // A float standing before the paragraph that an imported source places in
  // the paragraph before is that paragraph's, not this one's.
  while (first < index) {
    const host = blankPageSourceParagraph(blocks[first]!.node, false);
    const before = first > 0 ? blankPageSourceParagraph(blocks[first - 1]!.node, true) : null;
    if (host === null || host !== before) break;
    first += 1;
  }
  const own = blankPageSourceParagraph(blocks[index]!.node, true);
  let last = index;
  if (own !== null) {
    while (
      last + 1 < blocks.length &&
      isOverlayBlock(blocks[last + 1]!.node) &&
      blankPageSourceParagraph(blocks[last + 1]!.node, false) === own
    ) {
      last += 1;
    }
  }
  return { first, last };
}





















function insertBodyBlankPage(tr: Transaction): boolean {
  const { $from } = tr.selection;
  const paragraph = $from.parent;
  const pageBreakType = tr.doc.type.schema.nodes.pageBreak;
  if (!pageBreakType || !paragraph.isTextblock) return false;
  const paragraphPos = $from.before($from.depth);
  const blocks = blankPageBodyBlocks(tr.doc);
  const index = blocks.findIndex((block) => block.pos === paragraphPos);
  if (index < 0) return false;
  const group = blankPageAnchorGroup(blocks, index);
  const offset = $from.parentOffset;
  const size = paragraph.content.size;
  const before = blocks[group.first - 1];
  const after = blocks[group.last + 1];
  const groupStart = blocks[group.first]!.pos;
  const groupEnd = blocks[group.last]!.pos + blocks[group.last]!.node.nodeSize;
  const blank = () => paragraph.type.create(blankPageCopyAttrs(paragraph));
  const pageBreak = () => pageBreakType.create();
  const caretInto = (blankPos: number) => tr.setSelection(TextSelection.create(tr.doc, blankPos + 1));
  if (offset === 0 && before?.node.type === pageBreakType) {
    tr.insert(groupStart, [blank(), pageBreak()]);
    return true;
  }
  if (offset === size && after?.node.type === pageBreakType) {
    const at = after.pos + after.node.nodeSize;
    tr.insert(at, [blank(), pageBreak()]);
    caretInto(at);
    return true;
  }
  if (offset === size && !after) {
    tr.insert(groupEnd, [pageBreak(), blank()]);
    caretInto(groupEnd + 1);
    return true;
  }
  if (offset === 0) {
    tr.insert(groupStart, [blank(), pageBreak(), blank(), pageBreak()]);
    caretInto(groupStart + 2 + 1);
    return true;
  }
  const tail = paragraph.type.create(blankPageCopyAttrs(paragraph), paragraph.content.cut(offset), paragraph.marks);
  tr.delete($from.pos, paragraphPos + paragraph.nodeSize - 1);
  const at = tr.mapping.map(groupEnd);
  tr.insert(at, [pageBreak(), blank(), pageBreak(), tail]);
  caretInto(at + 1);
  return true;
}

/**
 * Insert > Blank Page in a list item: Word splits the item at the caret and
 * each break ends the item before it, with a blank item of the list between
 * (1. head + break / 2. blank + break / 3. tail). In a table the two breaks
 * and an empty paragraph go before the table (the row holding the caret,
 * when it is not the first, is split off first), and the caret goes to the
 * end of the page before them, as Word leaves it.
 */
function insertContainedBlankPage(editor: Editor, chain: () => ChainedCommands): boolean {
  if (breakRefusalAt(editor.state) !== null) return editor.commands.setPageBreak();
  const inTable = findOutermostTable(editor.state) !== null;
  if (!chain().setPageBreak().run()) return false;
  const { state } = editor;
  const pageBreakType = state.schema.nodes.pageBreak;
  if (!pageBreakType) return true;
  if (inTable) {
    const table = findOutermostTable(state);
    if (!table) return true;
    const placed = state.doc.resolve(table.pos).nodeBefore;
    if (placed?.type !== pageBreakType) return true;
    const breakPos = table.pos - placed.nodeSize;
    const tr = state.tr.insert(table.pos, [pageBreakType.create(), state.schema.nodes.paragraph!.create()]);
    const $break = tr.doc.resolve(breakPos);
    const caret = Selection.findFrom($break, -1, true);
    if (caret) tr.setSelection(caret);
    editor.view.dispatch(tr);
    return true;
  }
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const item = $from.node(depth);
    if (item.type.name !== "listItem" && item.type.name !== "taskItem") continue;
    const itemPos = $from.before(depth);
    const textblock = $from.parent;
    const blankItem = item.type.create(blankPageCopyAttrs(item), [
      textblock.type.create(blankPageCopyAttrs(textblock)),
      pageBreakType.create(),
    ]);
    const tr = state.tr.insert(itemPos, blankItem);
    tr.setSelection(TextSelection.create(tr.doc, itemPos + 2));
    editor.view.dispatch(tr);
    return true;
  }
  return true;
}

/**
 * Insert > Blank Page (Word's Insert ▸ Pages ▸ Blank Page): a whole empty
 * page at the caret, the text after the caret starting on the page after it.
 * `chain` makes the chain on the caret.
 */
export function insertBlankPage(editor: Editor, chain: () => ChainedCommands): boolean {
  // Where the blank page goes is a caret in a paragraph, whatever the
  // selection is: a selected drawing (the lasso's, a stroke clicked) or a
  // place between blocks (after a page of ink) is the paragraph the drawing
  // is anchored to -- the one after it -- or, at the end, the last one. The
  // selection itself is never replaced: on an iPad a page of ink lost its
  
  if (!blankPageCaretInTextblock(editor)) return false;
  const { $from } = editor.state.selection;
  const holder = $from.depth > 0 ? $from.node($from.depth - 1).type.name : "doc";
  if (holder !== "doc" && holder !== "pageBlock") {
    return insertContainedBlankPage(editor, chain);
  }
  return chain()
    .command(({ tr }) => {
      // The chain may have put the caret back where the writer left it.
      if (!blankPageSelectionInTextblock(tr)) return false;
      return insertBodyBlankPage(tr);
    })
    .run();
}

/** A collapsed caret in a textblock for `tr`, moved there from any other selection; false when there is none. */
function blankPageSelectionInTextblock(tr: Transaction): boolean {
  const { selection } = tr;
  if (selection instanceof TextSelection && selection.$from.parent.isTextblock) {
    if (!selection.empty) tr.setSelection(TextSelection.create(tr.doc, selection.from));
    return true;
  }
  const $to = tr.doc.resolve(selection.to);
  const caret = Selection.findFrom($to, 1, true) ?? Selection.findFrom(tr.doc.resolve(selection.from), -1, true);
  if (!(caret instanceof TextSelection)) return false;
  tr.setSelection(TextSelection.create(tr.doc, caret.from));
  return true;
}

/** The editor's selection made a caret in a textblock (see {@link blankPageSelectionInTextblock}). */
function blankPageCaretInTextblock(editor: Editor): boolean {
  const { selection } = editor.state;
  if (selection instanceof TextSelection && selection.empty && selection.$from.parent.isTextblock) return true;
  const tr = editor.state.tr;
  if (!blankPageSelectionInTextblock(tr)) return false;
  editor.view.dispatch(tr.setMeta("addToHistory", false));
  return true;
}

/**
 * One character of Insert > Symbol at the chain's caret (`at`). A plain
 * character is ordinary text; a character picked from a symbol FONT is Word's
 * symbol character: the `symbolChar` identity mark plus the font, on exactly
 * that character. Returns the chain, not run.
 */
export function queueOfficeSymbol(
  chain: ChainedCommands,
  at: number,
  insertion: OfficeSymbolInsertion,
): ChainedCommands {
  if (insertion.font === null || insertion.charCode === null) {
    return chain.insertContent(insertion.char);
  }
  return chain.insertContent(insertion.char).command(({ tr, state }) => {
    const to = at + insertion.char.length;
    if (to > state.doc.content.size) return false;
    const fontMark = state.schema.marks.fontFamily;
    const symbolMark = state.schema.marks[SYMBOL_CHAR_MARK];
    if (!symbolMark) return false;
    if (fontMark) tr.addMark(at, to, fontMark.create({ family: insertion.font }));
    tr.addMark(at, to, symbolMark.create({ font: insertion.font, charCode: insertion.charCode }));
    return true;
  });
}

/**
 * OK of Insert > Date and Time: a static text snapshot, or (Update
 * automatically) Word's DATE/TIME field with the picture. Null when the
 * picture is not one the language offers. Returns the chain, not run.
 */
export function queueDateTime(
  chain: ChainedCommands,
  choice: {
    now: Date;
    picture: string;
    locale: DocumentDateTimeLocale;
    fullWidth: boolean;
    updateAutomatically: boolean;
  },
): ChainedCommands | null {
  const format = documentDateTimeFormat(choice.locale, choice.picture);
  if (!format) return null;
  const cachedValue = formatDocumentDateTime(choice.now, choice.picture, {
    locale: choice.locale,
    fullWidth: choice.fullWidth,
  });
  if (!cachedValue) return null;
  if (!choice.updateAutomatically) return chain.insertContent(cachedValue);
  return chain.insertDocumentField(
    format.fieldType,
    {
      format: choice.picture,
      options: { locale: choice.locale, fullWidth: choice.fullWidth },
      updatePolicy: "on-open",
      cachedValue,
    },
  );
}

/** What the document's own properties say a new AUTHOR/FILENAME/TITLE shows. */
export interface DocumentFieldInsertContext {
  author?: string;
  filename?: string;
  title?: string;
}

/**
 * Insert > Quick Parts > Field for the fields that need no picker: the field
 * atom with its options. `labels` are the localized placeholder results of a
 * new TOC or INDEX field. Returns the chain, not run.
 */
export function queueDocumentField(
  chain: ChainedCommands,
  fieldType: DocumentFieldType,
  context: DocumentFieldInsertContext,
  labels: { tableOfContents: string; index: string },
  operands: { seqIdentifier?: string; ifExpression?: string } = {},
): ChainedCommands {
  if (fieldType === "SEQ") {
    return chain.insertDocumentField("SEQ", {
      options: { identifier: operands.seqIdentifier ?? "Figure" },
      cachedValue: "1",
    });
  }
  if (fieldType === "IF") {
    return chain.insertDocumentField("IF", {
      options: { expression: operands.ifExpression ?? "" },
      cachedValue: "",
    });
  }
  return chain.insertDocumentField(fieldType, {
    context,
    ...(fieldType === "TOC"
      ? { options: { levels: "1-3", hyperlinks: true }, cachedValue: labels.tableOfContents }
      : {}),
    ...(fieldType === "INDEX" ? { cachedValue: labels.index } : {}),
  });
}

/**
 * Insert one of the document's Quick Parts (Building Blocks) at the caret,
 * with Word's options: content only, in its own paragraph, or on its own page.
 * `chain` makes a fresh chain on the caret.
 */
export function insertDocumentQuickPart(
  editor: Editor,
  chain: () => ChainedCommands,
  part: Pick<DocumentQuickPart, "content" | "behavior" | "notes">,
): boolean {
  // Every footnote / endnote reference in the part gets a note of its own,
  // from the document's store or the part's saved copy (OFL-037).
  const store = readFootnotes(editor.state.doc);
  const fresh = quickPartContentWithFreshNotes(part, store);
  const { content, atBlockBoundary } = quickPartInsertion(
    { ...part, content: fresh.content },
    (type) => Boolean(editor.schema.nodes[type]?.isInline),
  );
  if (content.length === 0) return false;
  const withNotes = (commands: ChainedCommands): ChainedCommands => {
    if (fresh.notes.length === 0) return commands;
    const next = [...store, ...fresh.notes.map((note) => ({ id: note.id, body: note.body, ...(note.rich ? { rich: note.rich } : {}) }))];
    return commands.command(({ tr }) => {
      tr.setDocAttribute(FOOTNOTES_ATTR, next);
      return true;
    });
  };
  if (!atBlockBoundary) return withNotes(chain().insertContent(content as never)).run();
  const { selection } = editor.state;
  const { $to } = selection;
  const depth = $to.depth > 0 ? $to.depth : 1;
  // A selected block object (a shape, a picture) is its own block: the part
  // goes right after it. `$to.after($to.depth)` of a node selection is the
  
  const after =
    selection instanceof NodeSelection && selection.node.isBlock ? selection.to : $to.after(depth);
  return withNotes(chain().insertContentAt(after, content as never)).run();
}

/** The node Insert > Chart puts in the document for a chart's attributes. */
export function documentChartInsertContent(attrs: ChartBlockAttrsV2): JSONContent {
  return {
    type: "chart",
    attrs: {
      ...attrs,
      documentChart: { version: 1, size: { ...DEFAULT_DOCUMENT_CHART_SIZE } },
      // V2 data is authoritative. Never persist a plausible V1 shadow
      // beside it; import/export and the contextual tabs read `data`.
      categories: null,
      series: null,
    },
  } as JSONContent;
}

/**
 * Insert > SmartArt: one layout of the shared Office catalog as the
 * document's own shape group, In Line with Text (Word inserts a SmartArt
 * graphic as a character of its line). Never truncated into a different
 * diagram: a layout that does not fit says why.
 *
 * The projection is laid out by the engine host (`document.insert`; the AI's
 * command host calls `lib/office-smartart/document-insert` directly); this is
 * only the placement every caller gives it.
 */
export function documentSmartArtInsertAttrsFrom(
  projection: DocumentSmartArtProjection,
):
  | { ok: true; attrs: DocumentShapeAttrs }
  | { ok: false; reason: string; memberCount: number } {
  if (!projection.ok) return projection;
  const diagram = {
    ...projection.attrs,
    wrapMode: "inline" as const,
    xEmu: 0,
    yEmu: 0,
  };
  delete diagram.relativeHeight;
  return { ok: true, attrs: diagram };
}

/**
 * Insert > WordArt: a selection becomes the WordArt text (the text box
 * replaces it); a bare caret gets the sample text. Returns the command that
 * inserts the same shape node the Shape Format tab edits.
 */
export function wordArtInsertion(state: EditorState, recipe: OfficeWordArtRecipe, sampleText: string) {
  const selection = state.selection;
  const selected = selection.empty ? "" : state.doc.textBetween(selection.from, selection.to, "\n");
  const text = selected.trim() || sampleText;
  return insertDocumentShapeContent(documentWordArtInsertAttrs(recipe, text), {
    replaceSelection: selected.trim() !== "",
  });
}

export type HyperlinkResult = "applied" | "place_missing" | "invalid_email" | "invalid_address";

/**
 * OK of Insert > Link on `range`: a web address, an e-mail (mailto:) or a
 * place in this document (a heading or bookmark). A selection gains the link
 * (a changed Text to display replaces it, keeping its first character's
 * formatting); an empty range inserts the display text, the place's name or
 * the address as linked text. The ScreenTip is the link's title.
 */
/**
 * The href the dialog's target resolves to (a place's href, a mailto:, a web
 * address), and the place itself for its label; or why it cannot be a link.
 */
export function resolveHyperlinkTarget(
  editor: Editor,
  request: DocumentHyperlinkRequest,
):
  | { readonly ok: true; readonly href: string; readonly place: LinkPlaceOption | null }
  | { readonly ok: false; readonly reason: Exclude<HyperlinkResult, "applied"> } {
  const target = request.target;
  const place =
    target.kind === "place"
      ? findLinkPlaceByHref(collectLinkPlaces(editor.getJSON()), target.href)
      : null;
  if (target.kind === "place" && !place) return { ok: false, reason: "place_missing" };
  const mailto =
    target.kind === "email"
      ? buildMailtoHref(target.address, target.subject, target.headers)
      : null;
  if (target.kind === "email" && !mailto) return { ok: false, reason: "invalid_email" };
  const href = place
    ? place.href
    : normalizeDocumentUrl(mailto ?? (target.kind === "web" ? target.address : ""), "link");
  if (!href) return { ok: false, reason: "invalid_address" };
  return { ok: true, href, place };
}

/**
 * OK of Insert > Link with a picture selected: the picture carries the link
 * (Word: Ctrl+Click follows it); its ScreenTip is the tooltip.
 */
export function applyPictureHyperlink(
  editor: Editor,
  picture: { readonly pos: number; readonly node: ProseMirrorNode },
  request: DocumentHyperlinkRequest,
): HyperlinkResult {
  const resolved = resolveHyperlinkTarget(editor, request);
  if (!resolved.ok) return resolved.reason;
  const attrs = pictureLinkAttrs(resolved.href, normalizeLinkTitle(request.screenTip));
  if (!attrs.linkHref) return "invalid_address";
  const tr = editor.state.tr.setNodeMarkup(picture.pos, undefined, {
    ...picture.node.attrs,
    ...attrs,
  });
  tr.setSelection(NodeSelection.create(tr.doc, picture.pos));
  editor.view.dispatch(tr);
  return "applied";
}

export function applyHyperlink(
  editor: Editor,
  range: { from: number; to: number },
  request: DocumentHyperlinkRequest,
): HyperlinkResult {
  const resolved = resolveHyperlinkTarget(editor, request);
  if (!resolved.ok) return resolved.reason;
  const { href, place } = resolved;
  const linkMark = editor.state.schema.marks.link;
  const title = normalizeLinkTitle(request.screenTip);
  const linkAttrs = title ? { href, title } : { href };
  const { from, to } = range;
  const display = request.text.replace(/[\r\n\t]+/g, " ");
  if (from < to && linkMark) {
    const doc = editor.state.doc;
    const original = doc.textBetween(from, to);
    let tr = editor.state.tr;
    let end = to;
    // The field shows the selection with its tabs and breaks as spaces;
    // Text to display left as it was is not an edit, so the selection
    // keeps its own characters and formatting and only gains the link.
    const displayEdited =
      request.text !== original && display !== original.replace(/[\r\n\t]+/g, " ");
    if (display.trim() !== "" && displayEdited) {
      const marks = (doc.nodeAt(from)?.marks ?? []).filter((mark) => mark.type !== linkMark);
      tr = tr.replaceWith(from, to, editor.state.schema.text(display, [...marks, linkMark.create(linkAttrs)]));
      end = from + display.length;
    } else {
      tr = tr.removeMark(from, to, linkMark).addMark(from, to, linkMark.create(linkAttrs));
    }
    tr = replaceCharacterStyleWithLink(tr, from, end);
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.setTextSelection(end);
    return "applied";
  }
  // Nothing selected: the link is new text — the Text to display, or the
  // place's name, or the address itself (Word) — typed in the formatting
  // at the insertion point, as typing there would be (24 pt bold stays
  
  const caretState = editor.state;
  const inherited = (
    (caretState.selection.empty && caretState.selection.from === from
      ? caretState.storedMarks
      : null) ?? caretState.doc.resolve(from).marks()
  ).filter((mark) => !LINK_INSERTION_DROPPED_MARKS.has(mark.type.name));
  editor.commands.setTextSelection(from);
  const text = display.trim() || place?.label || href;
  if (linkMark) {
    editor
      .chain()
      .insertContent({
        type: "text",
        text,
        marks: [
          ...inherited.map((mark) => mark.toJSON() as { type: string; attrs?: Record<string, unknown> }),
          { type: "link", attrs: linkAttrs },
        ],
      })
      .run();
  } else {
    editor.commands.setLink({ href });
  }
  return "applied";
}









function replaceCharacterStyleWithLink(tr: Transaction, from: number, to: number): Transaction {
  const characterStyle = tr.doc.type.schema.marks.characterStyle;
  if (!characterStyle || from >= to) return tr;
  const removals: { from: number; to: number; mark: PmMark }[] = [];
  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isText || !parent) return;
    const style = node.marks.find((mark) => mark.type === characterStyle);
    if (!style) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    removals.push({ from: start, to: end, mark: style });
    const without = node.marks.filter((mark) => mark !== style);
    for (const [name, inherited] of [
      ["bold", inheritedBoldValue],
      ["italic", inheritedItalicValue],
    ] as const) {
      const bare = node.marks.find((mark) => mark.type.name === name && mark.attrs.value === undefined);
      if (
        bare &&
        inherited(tr.doc.attrs, parent, node.marks) === true &&
        inherited(tr.doc.attrs, parent, without) !== true
      ) {
        removals.push({ from: start, to: end, mark: bare });
      }
    }
  });
  let next = tr;
  for (const removal of removals) next = next.removeMark(removal.from, removal.to, removal.mark);
  return next;
}

/**
 * Marks a new link's text does not take from the insertion point: the link
 * it replaces, and revision marks (tracking stamps the new text itself).
 */
const LINK_INSERTION_DROPPED_MARKS: ReadonlySet<string> = new Set([
  "link",
  INSERTION_MARK_NAME,
  DELETION_MARK_NAME,
  FORMAT_REVISION_MARK_NAME,
]);

/** The whole link at a caret inside one (Edit Hyperlink acts on all of it). */
export function linkRangeAt(state: EditorState): { from: number; to: number } | null {
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const range = getMarkRange(state.selection.$from, linkType);
  return range && range.from < range.to ? range : null;
}

/**
 * OK of Convert Text to Table on the paragraphs of `range`: the real
 * paragraphs become the cells (every character, run and line break kept),
 * split at the separator, laid out with the AutoFit choice.
 */
export function convertTextToTable(
  editor: Editor,
  range: { from: number; to: number },
  settings: DocumentTableConversionSettings,
  autoFitWindowWidth: number | undefined,
  chain: ChainedCommands,
): boolean {
  const { from, to } = range;
  if (from < 0 || to <= from || to > editor.state.doc.content.size || !settings.layoutPolicy) {
    return false;
  }
  const paragraphs = textTableSelectionParagraphs(editor.state.doc, from, to);
  const rows = paragraphs ? convertParagraphsToTableRows(paragraphs, settings.separator) : null;
  if (!rows) return false;
  const tableNode = applyDocumentTableLayoutPolicy(
    tableNodeFromConvertedRows(rows, { withHeaderRow: false }),
    settings.layoutPolicy,
    autoFitWindowWidth,
  );
  return chain
    .setTextSelection({ from, to })
    .deleteSelection()
    .insertContent(tableNode as JSONContent)
    .run();
}


/** Insert > Shapes: a preset shape in the person's default shape style
 *  (Word's Set as Default Shape; the Office default when none is set). */
export function documentShapeInsertAttrs(preset: DocumentShapePreset): DocumentShapeAttrs {
  const style = readOfficeDefaultShapeStyle("document");
  return {
    ...documentShapeDefaultAttrs(preset),
    // A line takes the default shape's outline but not its WordArt: a line
    // carries no text, and the save refused a line holding WordArt paint for
    // the whole page (Set as Default Shape on a WordArt shape, then a line).
    ...documentDefaultShapeStylePatch(
      style && documentShapeDefinition(preset).lineLike ? { ...style, textPaint: undefined } : style,
    ),
  };
}

/**
 * Insert > Quick Parts > Save Selection to Quick Part Gallery: the selection's
 * content becomes a named building block stored with the document.
 */
export function saveQuickPartFromSelection(
  editor: Editor,
  existing: readonly DocumentQuickPart[],
  value: Pick<DocumentQuickPart, "name" | "gallery" | "category" | "description" | "behavior">,
): boolean {
  if (!value.name.trim()) return false;
  // A full gallery refuses: the store keeps 100 parts and dropped the 101st
  // while this answered "saved" (OFL-036).
  if (existing.length >= MAX_DOCUMENT_QUICK_PARTS) return false;
  const content = quickPartContentFromSelection(editor);
  if (content.length === 0) return false;
  // The notes the content refers to travel with the part (OFL-037).
  const notes = quickPartNotesForContent(editor, content);
  const part = normalizeDocumentQuickPart({ id: newQuickPartId(), ...value, content, ...(notes.length ? { notes } : {}) });
  if (!part) return false;
  return editor.commands.setQuickParts([
    ...existing,
    part,
  ]);
}

/** Whether another part can still be saved with the document. */
export function quickPartGalleryHasRoom(existing: readonly DocumentQuickPart[]): boolean {
  return existing.length < MAX_DOCUMENT_QUICK_PARTS;
}
