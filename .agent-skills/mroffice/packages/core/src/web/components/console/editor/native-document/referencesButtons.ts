/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * References tab button logic shared by the document toolbar and the
 * editor-command catalog: the generated blocks (table of contents, table of
 * figures, index, table of authorities, bibliography) are built, rewritten,
 * updated and removed here; the toolbar keeps its dialogs and remembered
 * selections and calls these for the write.
 */

import { SheetFact } from "../../../../lib/editor/sheet-facts";
import type { Command, Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import {
  collectAuthorityEntries,
  formatAuthorityEntriesPreview,
  normalizeAuthorityEntryAttributes,
  type AuthorityEntryAttributes,
} from "./authorityEntryExtension";
import { getBookmarks } from "./bookmarkExtension";
import {
  DEFAULT_CAPTION_ATTRIBUTES,
  NEW_CAPTION_SEPARATOR,
  builtinCaptionListLabel,
  captionsForListLabel,
  isCaptionBuiltinKind,
  generatedCaptionListEntries,
  normalizeCaptionListLabel,
  updateGeneratedCaptionListEntries,
  type CaptionAttributes,
  type CaptionListLabel,
} from "./captions";
import { collectAllCaptions } from "./fieldCaptions";
import {
  sectionNotePropertiesFor,
  sectionNotePropertyKeys,
  type NoteNumFmt,
  type NotePosition,
  type NoteRestart,
  type NoteStream,
} from "./footnotes";
import { documentNoteSettings } from "./noteSectionSettings";
import {
  normalizeSectionLayouts,
  sectionBreakBoundaries,
  type SectionLayoutPatch,
} from "./sectionLayouts";
import { BIBLIOGRAPHY_NODE_NAME, hasBibliographyNode } from "./citationExtension";
import {
  liveCrossRefDisplay,
  normalizeCrossRefTargetType,
  type CrossRefInsertOptions,
} from "./crossReferenceExtension";
import type { CrossRefPositionWords } from "./crossReferenceModes";
import type { AuthorityCategoryNumber, AuthorityTableSettings } from "./documentAuthoritySettings";
import {
  createDocumentFieldAttrs,
  normalizeDocumentFieldAttrs,
  type DocumentFieldOptions,
} from "./documentFieldValues";
import type { IndexSettings } from "./documentIndexSettings";
import { withPrintedPageLabels } from "./documentPageNumbers";
import {
  collectIndexEntries,
  composeIndexTerm,
  formatIndexEntriesPreview,
  normalizeIndexEntryAttributes,
  type IndexEntryAttributes,
} from "./indexEntryExtension";
import {
  normalizeGeneratedListSettings,
  normalizeNativeNoteSettings,
  normalizeTocSettings,
  tocSettingsFromInstruction,
  tocSourceLevelResolver,
} from "./referenceSettings";
import {
  collectHeadingsFromDoc,
  collectTocEntriesFromDoc,
  updateTocEntrySnapshot,
  type TocUpdateMode,
} from "./tableOfContents";
import { markGeneratedListEntries } from "./generatedListEntries";

export interface ReferenceAtomSelectionTarget {
  readonly doc: ProseMirrorNode;
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

export function selectedReferenceAtomTarget(
  editor: Editor,
  nodeTypeName: string,
): ReferenceAtomSelectionTarget | null {
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  if (selection.node.type.name !== nodeTypeName) return null;
  return { doc, node: selection.node, pos: selection.from };
}

/**
 * Resolve the exact selected TOC atom. References commands never guess from a
 * nearby text caret: update/remove authority belongs only to a live
 * NodeSelection of the tableOfContents node.
 */
export function selectedTableOfContentsTarget(editor: Editor): ReferenceAtomSelectionTarget | null {
  return selectedReferenceAtomTarget(editor, "tableOfContents");
}

const firstTableOfContentsByDoc = new WeakMap<ProseMirrorNode, { node: ProseMirrorNode; pos: number } | null>();

/**
 * The document's first TOC, which Word's References > Update Table and Remove
 * Table of Contents act on when the selection is not on a TOC. Cached per
 * immutable doc, since the ribbon asks on every render.
 */
/** The document's first Manual Table (a content control of Word's "Table of
 * Contents" gallery), which the gallery replaces as Word does. */
export function firstManualTableOfContentsTarget(
  doc: ProseMirrorNode,
): ReferenceAtomSelectionTarget | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "blockContentControl" && node.attrs.docPartGallery === "Table of Contents") {
      found = { node, pos };
      return false;
    }
    return !node.isTextblock;
  });
  const hit = found as { node: ProseMirrorNode; pos: number } | null;
  return hit ? { doc, node: hit.node, pos: hit.pos } : null;
}

const HOLDS_TABLE_OF_CONTENTS = new SheetFact((node) => node.type.name === "tableOfContents");

export function firstTableOfContentsTarget(doc: ProseMirrorNode): ReferenceAtomSelectionTarget | null {
  let found = firstTableOfContentsByDoc.get(doc);
  if (found === undefined) {
    found = null;
    HOLDS_TABLE_OF_CONTENTS.descendants(doc, (node, pos) => {
      if (found) return false;
      if (node.type.name === "tableOfContents") {
        found = { node, pos };
        return false;
      }
      return !node.isTextblock;
    });
    firstTableOfContentsByDoc.set(doc, found);
  }
  return found ? { doc, node: found.node, pos: found.pos } : null;
}








export function captionListLabelMatches(
  actual: CaptionListLabel,
  expected: CaptionListLabel,
): boolean {
  if (actual === expected) return true;
  return (
    expected !== "none" &&
    isCaptionBuiltinKind(expected) &&
    actual === builtinCaptionListLabel(expected)
  );
}

export function selectedCaptionListTarget(
  editor: Editor,
  expectedKind?: CaptionListLabel,
): ReferenceAtomSelectionTarget | null {
  const target = selectedReferenceAtomTarget(editor, "listOfFigures");
  if (!target) return null;
  const kind = normalizeCaptionListLabel(target.node.attrs?.kind);
  return expectedKind && !captionListLabelMatches(kind, expectedKind) ? null : target;
}

export function selectedCaptionTarget(editor: Editor): ReferenceAtomSelectionTarget | null {
  return selectedReferenceAtomTarget(editor, "caption");
}

export function selectedBibliographyTarget(editor: Editor): ReferenceAtomSelectionTarget | null {
  return selectedReferenceAtomTarget(editor, BIBLIOGRAPHY_NODE_NAME);
}

export function selectedDocumentIndexTarget(editor: Editor): ReferenceAtomSelectionTarget | null {
  const target = selectedReferenceAtomTarget(editor, "documentField");
  return target?.node.attrs?.fieldType === "INDEX" ? target : null;
}

export function selectedAuthorityTableTarget(editor: Editor): ReferenceAtomSelectionTarget | null {
  const target = selectedReferenceAtomTarget(editor, "documentField");
  return target?.node.attrs?.fieldType === "TOA" ? target : null;
}

/**
 * The first node the selection holds that `matches`: the selected node
 * itself, or one inside the selected range (an INDEX field inside the
 * paragraph a command names).
 */
export function referenceAtomInSelection(
  editor: Editor,
  matches: (node: ProseMirrorNode) => boolean,
): ReferenceAtomSelectionTarget | null {
  const { doc, selection } = editor.state;
  if (selection instanceof NodeSelection) {
    return matches(selection.node) ? { doc, node: selection.node, pos: selection.from } : null;
  }
  let found: ReferenceAtomSelectionTarget | null = null;
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (found) return false;
    if (matches(node)) {
      found = { doc, node, pos };
      return false;
    }
    return true;
  });
  return found;
}

/** Rewrite a generated block in place and leave it selected, one step. */
export function rewriteReferenceAtom(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  attrs: Record<string, unknown>,
  scroll = false,
): void {
  // Entries read before the block is laid out with them: their page numbers
  // are settled once it is (generatedListEntries).
  markGeneratedListEntries(attrs.cachedEntries ?? null);
  let transaction = editor.state.tr.setNodeMarkup(
    target.pos,
    undefined,
    { ...target.node.attrs, ...attrs },
    target.node.marks,
  );
  transaction = transaction.setSelection(NodeSelection.create(transaction.doc, target.pos));
  editor.view.dispatch(scroll ? transaction.scrollIntoView() : transaction);
}

/** Remove a generated block (Remove Table of Contents, Remove Index ...). */
export function removeReferenceAtom(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  scroll = false,
): void {
  const transaction = editor.state.tr.delete(target.pos, target.pos + target.node.nodeSize);
  editor.view.dispatch(scroll ? transaction.scrollIntoView() : transaction);
}

// ---- Table of contents -------------------------------------------------

/** TOC Options' style mapping (\t) as well as the \o range. */
export function tableOfContentsEntries(doc: ProseMirrorNode, settingsInput: unknown) {
  return withPrintedPageLabels(
    doc,
    collectTocEntriesFromDoc(doc, tocSourceLevelResolver(normalizeTocSettings(settingsInput))),
  );
}

/** A new table of contents with the given settings and today's entries. */
export function tableOfContentsNode(doc: ProseMirrorNode, settingsInput: unknown) {
  const settings = normalizeTocSettings(settingsInput);
  return {
    type: "tableOfContents",
    attrs: { ...settings, cachedEntries: markGeneratedListEntries(tableOfContentsEntries(doc, settings)) },
  };
}

/**
 * The position right after the outermost table holding `pos` (a top-level
 * block boundary), or null when `pos` is in no table.
 */
export function positionAfterOutermostTable(doc: ProseMirrorNode, pos: number): number | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    if (resolved.node(depth).type.name === "table") return resolved.after(depth);
  }
  return null;
}

/**
 * Insert a table of contents at the insertion point -- or, with the caret in
 * a table cell, right after that table, at the top level. Word can hold a
 * table of contents in a cell (its TOC field in the cell's paragraphs), but
 * the page and its DOCX save cannot yet: one put there was refused on save
 * and came back from a full export as loose paragraphs (FIXQUEUE 177; real
 * support is 182). Never a silent move: `onPlacedAfterTable` runs when the
 * table of contents went after the table, for the caller to say so.
 */
export function insertTableOfContentsCommand(
  content: JSONContent | JSONContent[],
  onPlacedAfterTable?: () => void,
): Command {
  const atom = (Array.isArray(content) ? content : [content]).some((item) => item?.type === "tableOfContents");
  return ({ tr, commands }) => {
    // A Manual Table is paragraphs, which a cell holds as they are.
    const after = atom ? positionAfterOutermostTable(tr.doc, tr.selection.from) : null;
    if (after === null) return commands.insertContent(content);
    const inserted = commands.insertContentAt(after, content);
    if (inserted) onPlacedAfterTable?.();
    return inserted;
  };
}

/**
 * The editor's notice that a table of contents went after the table the
 * caret was in (the `tableOfContents` extension's `onPlacedAfterTable`
 * option; the document editor configures it with a localized toast).
 */
export function tableOfContentsPlacedAfterTableNotice(editor: Editor): () => void {
  return () => {
    const extension = editor.extensionManager.extensions.find((item) => item.name === "tableOfContents");
    const notify = (extension?.options as { onPlacedAfterTable?: () => void } | undefined)?.onPlacedAfterTable;
    notify?.();
  };
}

/**
 * The settings a TOC field's own code spells -- its outline range, `\u`,
 * `\t` styles, `\n` levels -- for a field the import kept as a field,
 * whether it read it as a TOC or carried an instruction it could not map
 * as written. Null for any other field, a table of figures among them.
 */
function tocFieldSettings(node: ProseMirrorNode): Record<string, unknown> | null {
  const { fieldType, instruction, options } = node.attrs as {
    fieldType?: unknown;
    instruction?: unknown;
    options?: unknown;
  };
  if (fieldType !== "TOC" && fieldType !== "NATIVE") return null;
  const parsed = typeof instruction === "string" ? tocSettingsFromInstruction(instruction) : null;
  if (!parsed) return null;
  const known = options && typeof options === "object" ? (options as Record<string, unknown>) : {};
  return { ...(known.tabLeader ? { tabLeader: known.tabLeader } : {}), ...parsed };
}

/**
 * Update Table on a TOC field nothing ever updated (the "Right-click to
 * update" placeholder a generator such as pandoc or python-docx writes):
 * Word builds the table from the headings with the field's own switches, as
 * F9 does. The field becomes a table of contents block; a paragraph that
 * held only the field is replaced by it. False when the document has none.
 */
export function buildTableOfContentsFromField(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state } = editor;
  let field: { node: ProseMirrorNode; pos: number } | null = null;
  state.doc.descendants((node, pos) => {
    if (field) return false;
    if (node.type.name === "documentField" && tocFieldSettings(node) !== null) {
      field = { node, pos };
      return false;
    }
    return true;
  });
  const found = field as { node: ProseMirrorNode; pos: number } | null;
  if (!found) return false;
  const tableType = state.schema.nodes.tableOfContents;
  if (!tableType) return false;
  const table = state.schema.nodeFromJSON(tableOfContentsNode(state.doc, tocFieldSettings(found.node)));
  const $field = state.doc.resolve(found.pos);
  const holder = $field.parent;
  const holderStart = $field.before($field.depth);
  let transaction = state.tr;
  if (holder.isTextblock && holder.childCount === 1) {
    transaction = transaction.replaceWith(holderStart, holderStart + holder.nodeSize, table);
  } else {
    transaction = transaction
      .delete(found.pos, found.pos + found.node.nodeSize)
      .insert(holderStart, table);
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

/** Table of Contents dialog OK on an existing table. */
export function rewriteTableOfContents(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  settingsInput: unknown,
): void {
  const settings = normalizeTocSettings(settingsInput);
  rewriteReferenceAtom(
    editor,
    target,
    { ...settings, cachedEntries: tableOfContentsEntries(editor.state.doc, settings) },
    true,
  );
}

/** Update Table: page numbers only, or the entire table. */
export function updateTableOfContents(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  mode: TocUpdateMode,
): void {
  const settings = normalizeTocSettings(target.node.attrs);
  // A page-number refresh keeps every row the table has, so it reads the page
  // of every heading; only a rebuilt table drops the headings that are empty.
  const pagesOnly = mode === "pageNumbers" && Array.isArray(target.node.attrs.cachedEntries);
  const cachedEntries = withPrintedPageLabels(
    editor.state.doc,
    updateTocEntrySnapshot(
      target.node.attrs.cachedEntries,
      pagesOnly
        ? collectHeadingsFromDoc(editor.state.doc, tocSourceLevelResolver(settings))
        : tableOfContentsEntries(editor.state.doc, settings),
      mode,
    ),
  );
  rewriteReferenceAtom(editor, target, { ...settings, cachedEntries }, true);
}

// ---- Table of figures ----------------------------------------------------

export function captionListEntries(doc: ProseMirrorNode, kind: CaptionListLabel, includeLabel = true) {
  return generatedCaptionListEntries(captionsForListLabel(collectAllCaptions(doc), kind), { includeLabel });
}

/** A new table of figures (or of tables, equations ...) with today's entries. */
export function captionListNode(doc: ProseMirrorNode, kind: CaptionListLabel, settingsInput?: unknown) {
  const settings = settingsInput === undefined ? null : normalizeGeneratedListSettings(settingsInput);
  return {
    type: "listOfFigures",
    attrs: {
      kind,
      ...(settings ?? {}),
      cachedEntries: markGeneratedListEntries(captionListEntries(doc, kind, settings ? settings.includeLabel : true)),
    },
  };
}

/** Table of Figures dialog OK on an existing table. */
export function rewriteCaptionList(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  kind: CaptionListLabel,
  settingsInput: unknown,
): void {
  const settings = normalizeGeneratedListSettings(settingsInput);
  rewriteReferenceAtom(
    editor,
    target,
    { kind, ...settings, cachedEntries: captionListEntries(editor.state.doc, kind, settings.includeLabel) },
    true,
  );
}

/** Update Table on a table of figures. */
export function updateCaptionList(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  kind: CaptionListLabel,
  mode: TocUpdateMode,
): void {
  const cachedEntries = updateGeneratedCaptionListEntries(
    target.node.attrs.cachedEntries,
    captionListEntries(editor.state.doc, kind, normalizeGeneratedListSettings(target.node.attrs).includeLabel),
    mode,
  );
  rewriteReferenceAtom(editor, target, { kind, cachedEntries }, true);
}

// ---- Index and table of authorities (fields) ------------------------------

export interface GeneratedFieldWords {
  title: string;
  empty: string;
}

/** The INDEX field's cached preview until it is updated on open. */
export function indexCachedValue(editor: Editor, words: GeneratedFieldWords): string {
  const preview = formatIndexEntriesPreview(collectIndexEntries(editor.getJSON()), words.empty);
  return `${words.title}: ${preview}`.slice(0, 256);
}

/** The TOA field's cached preview for one category. */
export function authorityCachedValue(
  editor: Editor,
  category: AuthorityCategoryNumber,
  words: GeneratedFieldWords,
): string {
  const preview = formatAuthorityEntriesPreview(collectAuthorityEntries(editor.getJSON(), category), words.empty);
  return `${words.title}: ${preview}`.slice(0, 256);
}

/**
 * Rewrite an INDEX / TOA field with new options and a fresh preview, keeping
 * its update policy unless one is given.
 */
export function rewriteDocumentField(
  editor: Editor,
  target: { node: ProseMirrorNode; pos: number },
  fieldType: "INDEX" | "TOA",
  // The dialog's settings, or the field's own stored options on Update.
  options: Readonly<IndexSettings> | Readonly<AuthorityTableSettings> | Readonly<DocumentFieldOptions>,
  cachedValue: string,
): boolean {
  const current = normalizeDocumentFieldAttrs(target.node.attrs);
  const attrs = createDocumentFieldAttrs(fieldType, {
    options: { ...options },
    cachedValue,
    updatePolicy: current?.updatePolicy ?? "on-open",
  });
  if (!attrs) return false;
  rewriteReferenceAtom(editor, target, attrs as unknown as Record<string, unknown>);
  return true;
}

// ---- Bibliography ----------------------------------------------------------

/**
 * Insert Bibliography is offered while the document has none. As in Word, it
 * does not wait for a source: the field then reads "There are no sources in
 * the current document."
 */
export function canInsertBibliography(doc: ProseMirrorNode): boolean {
  return !hasBibliographyNode(doc);
}

export const BIBLIOGRAPHY_CONTENT = { type: BIBLIOGRAPHY_NODE_NAME } as const;

// ---- Cross-reference -------------------------------------------------------

/**
 * The Cross-reference dialog's Insert: the field's cached result (what Word
 * shows until F9 and what the DOCX field result carries) is its text for the
 * chosen "Insert reference to", read at the caret.
 */
export function insertCrossReference(
  editor: Editor,
  targetAnchorId: string,
  label: string,
  targetType: string | undefined,
  hyperlink: boolean | undefined,
  options: CrossRefInsertOptions,
  words: CrossRefPositionWords,
): boolean {
  let cached = label;
  try {
    cached =
      liveCrossRefDisplay(
        editor.state.doc,
        editor.state.selection.from,
        {
          targetType,
          targetAnchorId,
          referenceTo: options.referenceTo,
          includePosition: options.includePosition,
        },
        words,
      ) ?? label;
  } catch {
    cached = label;
  }
  try {
    return editor.commands.addCrossReference(
      targetAnchorId,
      cached,
      // The command reads an unknown kind as a heading, as this does.
      targetType === undefined ? undefined : normalizeCrossRefTargetType(targetType),
      hyperlink,
      options,
    );
  } catch {
    return false;
  }
}

// ---- Captions and notes ----------------------------------------------------

/**
 * Insert Caption's defaults for the selected object: a table is captioned
 * above as "Table", anything else below as "Figure". A new caption starts
 * with Word's plain "Figure 1 text" shape (see NEW_CAPTION_SEPARATOR).
 */
/**
 * Word's Caption dialog opens on the label used last (for the whole session,
 * across documents); a selected table still offers Table.
 */
let lastCaptionLabel: Pick<CaptionAttributes, "kind" | "labelName"> | null = null;

export function rememberCaptionLabel(
  label: Pick<CaptionAttributes, "kind" | "labelName">,
): void {
  lastCaptionLabel = { kind: label.kind, labelName: label.labelName };
}

export function captionDefaultsFor(selectedObject: ProseMirrorNode | null): CaptionAttributes {
  const table = selectedObject?.type.name === "table";
  return {
    ...DEFAULT_CAPTION_ATTRIBUTES,
    separator: NEW_CAPTION_SEPARATOR,
    kind: table ? "table" : (lastCaptionLabel?.kind ?? "figure"),
    labelName: table ? null : (lastCaptionLabel?.labelName ?? null),
    position: table ? "above" : "below",
  };
}

type NoteNumberingChain = {
  setNoteNumbering: (
    stream: NoteStream,
    numFmt: NoteNumFmt,
    start: number,
    position?: NotePosition,
    restart?: NoteRestart,
  ) => NoteNumberingChain;
  updateSectionLayout: (
    sectionIndex: number,
    patch: SectionLayoutPatch,
  ) => NoteNumberingChain;
  run: () => boolean;
};

/**
 * Footnote and Endnote > Apply changes to. Word lists Whole document, This
 * section once the document has more than one section, and Selected sections
 * when the selection runs across a section break.
 */
export const NOTE_APPLY_SCOPES = [
  "wholeDocument",
  "thisSection",
  "selectedSections",
] as const;
export type NoteApplyScope = (typeof NOTE_APPLY_SCOPES)[number];

export interface NoteApplyScopeContext {
  /** The choices the dialog lists, in Word's order. */
  options: NoteApplyScope[];
  /** Sections This section / Selected sections write (zero-based). */
  sectionIndexes: number[];
  /** The section the dialog seeds from: the one holding the insertion point. */
  sectionIndex: number;
}

/** What Apply changes to can offer for the current selection. */
export function noteApplyScopeContext(
  state: Pick<EditorState, "doc" | "selection">,
): NoteApplyScopeContext {
  const boundaries = sectionBreakBoundaries(state.doc);
  const sectionAt = (position: number) =>
    boundaries.filter((boundary) => position >= boundary.to).length;
  const { from, to, head } = state.selection;
  const first = sectionAt(from);
  const last = sectionAt(to);
  const sectionIndexes = Array.from(
    { length: last - first + 1 },
    (_, offset) => first + offset,
  );
  const options: NoteApplyScope[] =
    boundaries.length === 0
      ? ["wholeDocument"]
      : last > first
        ? ["wholeDocument", "selectedSections"]
        : ["wholeDocument", "thisSection"];
  return { options, sectionIndexes, sectionIndex: sectionAt(head) };
}















export function applyNoteSettings(
  chain: unknown,
  value: {
    stream: NoteStream;
    numFmt: unknown;
    start: number;
    position: unknown;
    restart: unknown;
    scope?: NoteApplyScope;
    sectionIndexes?: readonly number[];
  },
  state?: Pick<EditorState, "doc" | "selection">,
): boolean {
  const settings = normalizeNativeNoteSettings(value);
  const stream = settings.stream;
  const key = stream === "endnote" ? "endnotePr" : "footnotePr";
  let next = chain as NoteNumberingChain;
  const layouts = state
    ? normalizeSectionLayouts(state.doc.attrs.sectionLayouts)
    : null;
  const scope = value.scope ?? "wholeDocument";
  if (scope === "wholeDocument" || !state) {
    next = next.setNoteNumbering(
      stream,
      settings.numFmt,
      settings.start,
      settings.position,
      settings.restart,
    );
    layouts?.forEach((layout, index) => {
      if (layout[key]) {
        next = next.updateSectionLayout(index, {
          [key]: null,
        } as SectionLayoutPatch);
      }
    });
    return next.run();
  }
  const sectionIndexes = [...new Set(value.sectionIndexes ?? [])].filter(
    (index) => Number.isInteger(index) && index >= 0,
  );
  if (sectionIndexes.length === 0) return false;
  const documentSettings = documentNoteSettings(
    state.doc.attrs as Record<string, unknown>,
  )[stream];
  if (stream === "endnote") {
    // Word writes Location to settings.xml from This section as well.
    next = next.setNoteNumbering(
      "endnote",
      documentSettings.numFmt ?? "decimal",
      documentSettings.start ?? 1,
      settings.position,
      documentSettings.restart ?? "continuous",
    );
  }
  const own = sectionNotePropertiesFor(stream, settings, documentSettings);
  const patch: Record<string, unknown> = {};
  for (const field of sectionNotePropertyKeys(stream)) {
    patch[field] = own?.[field] ?? null;
  }
  for (const index of sectionIndexes) {
    next = next.updateSectionLayout(index, {
      [key]: patch,
    } as SectionLayoutPatch);
  }
  return next.run();
}

// ---- Mark Entry / Mark Citation dialogs --------------------------------------

type MarkChain = {
  markIndexEntry: (entry: IndexEntryAttributes) => { run: () => boolean };
  markAllIndexEntries: (entry: IndexEntryAttributes, matchText: string) => { run: () => boolean };
  markAuthorityEntry: (entry: AuthorityEntryAttributes) => { run: () => boolean };
  markAllAuthorityEntries: (entry: AuthorityEntryAttributes) => { run: () => boolean };
};

export interface IndexMarkRequest {
  term: string;
  subentry: string;
  referenceMode: unknown;
  crossReference: string;
  pageRangeBookmark: string;
  boldPageNumber: boolean;
  italicPageNumber: boolean;
}

/**
 * Mark Index Entry's Mark / Mark All on the chain's selection. A cross
 * reference or page range the entry cannot keep, and a page range on Mark
 * All, are refused as Word refuses them.
 */
export function markIndexEntryFromDialog(
  editor: Editor,
  chain: unknown,
  value: IndexMarkRequest,
  markAll: boolean,
  matchText: string,
): boolean {
  const term = composeIndexTerm(value.term, value.subentry);
  if (!term) return false;
  const entry = normalizeIndexEntryAttributes({
    term,
    referenceMode: value.referenceMode,
    crossReference: value.crossReference,
    pageRangeBookmark: value.pageRangeBookmark,
    boldPageNumber: value.boldPageNumber,
    italicPageNumber: value.italicPageNumber,
  });
  if (
    (value.referenceMode === "crossReference" && entry.referenceMode !== "crossReference") ||
    (value.referenceMode === "pageRange" && entry.referenceMode !== "pageRange") ||
    (entry.referenceMode === "pageRange" &&
      !getBookmarks(editor.state).some((bookmark) => bookmark.name === entry.pageRangeBookmark)) ||
    (markAll && entry.referenceMode === "pageRange")
  ) {
    return false;
  }
  const commands = chain as MarkChain;
  return markAll ? commands.markAllIndexEntries(entry, matchText).run() : commands.markIndexEntry(entry).run();
}

/** Mark Citation's Mark / Mark All on the chain's selection. */
export function markAuthorityEntryFromDialog(
  editor: Editor,
  chain: unknown,
  value: Partial<AuthorityEntryAttributes>,
  markAll: boolean,
): boolean {
  const entry = normalizeAuthorityEntryAttributes(value);
  if (
    !entry.longCitation ||
    !entry.shortCitation ||
    (entry.pageRangeBookmark &&
      !getBookmarks(editor.state).some((bookmark) => bookmark.name === entry.pageRangeBookmark))
  ) {
    return false;
  }
  const commands = chain as MarkChain;
  return markAll ? commands.markAllAuthorityEntries(entry).run() : commands.markAuthorityEntry(entry).run();
}

// ---- Manual Table (Table of Contents gallery) ---------------------------------

/** One line of a manual table of contents: its words, level (1-9) and page. */
export interface ManualTableOfContentsEntry {
  readonly text: string;
  readonly level: number;
  readonly page: number | string;
}

/** A mark as document JSON holds it. */
interface ManualTocMark {
  readonly type: string;
  readonly attrs?: Record<string, unknown>;
}

/** How one level of a manual table looks: Word's own run and paragraph
 * formatting for that level in the gallery block. */
interface ManualTocLevelLook {
  /** The line wears TOC N (tocLevel; the writers name the style), else
   * Normal. */
  readonly styled: boolean;
  /** Run marks on the words (and on the page number when `pageToo`). */
  readonly marks: readonly ManualTocMark[];
  readonly pageToo: boolean;
  readonly spaceBefore?: number;
  readonly spaceAfter?: number;
}

interface ManualTocLook {
  /** The title's own font (Word's TOC Heading paragraph, direct rFonts). */
  readonly titleFont?: string;
  readonly titleSpaceAfter?: number;
  /** Word's leader between an entry's words and its page number. */
  readonly leader: "dot" | "none";
  readonly levels: Readonly<Record<1 | 2 | 3, ManualTocLevelLook>>;
}

const CAMBRIA_11: readonly ManualTocMark[] = [
  { type: "fontFamily", attrs: { family: "Cambria" } },
  { type: "fontSize", attrs: { size: "14.6667px" } },
];
const PLAIN_LEVEL: ManualTocLevelLook = { styled: true, marks: [], pageToo: false };

/**
 * Word for Mac 16.86's five Manual Table blocks (Document Elements/Table of
 * Contents.dotx, category 手动目录), as their XML formats them: Classic and
 * Simple are TOC 1-3 as styled; Modern sets the TOC 3 line in italic; Formal
 * puts TOC 1 in capitals, TOC 2 in small capitals and TOC 3 in italic;
 * Contemporary is Normal paragraphs in 11 pt Cambria (bold underlined
 * capitals, bold small capitals, small capitals) with space around the first
 * level. Classic, Modern and Formal lead the page number with dots (a right
 * positional tab with a dot leader); Contemporary and Simple with a bare gap
 * (a right tab).
 */
const MANUAL_TOC_LOOKS: Readonly<Record<string, ManualTocLook>> = {
  contemporary: {
    leader: "none",
    levels: {
      1: {
        styled: false,
        marks: [...CAMBRIA_11, { type: "bold" }, { type: "underline" }, { type: "allCaps" }],
        pageToo: true,
        spaceBefore: 12,
        spaceAfter: 6,
      },
      2: { styled: false, marks: [...CAMBRIA_11, { type: "bold" }, { type: "smallCaps" }], pageToo: true },
      3: { styled: false, marks: [...CAMBRIA_11, { type: "smallCaps" }], pageToo: true },
    },
  },
  classic: { leader: "dot", levels: { 1: PLAIN_LEVEL, 2: PLAIN_LEVEL, 3: PLAIN_LEVEL } },
  simple: { leader: "none", levels: { 1: PLAIN_LEVEL, 2: PLAIN_LEVEL, 3: PLAIN_LEVEL } },
  modern: {
    titleFont: "Arial",
    titleSpaceAfter: 12,
    leader: "dot",
    levels: {
      1: PLAIN_LEVEL,
      2: PLAIN_LEVEL,
      3: { styled: true, marks: [{ type: "italic" }], pageToo: true },
    },
  },
  formal: {
    titleFont: "Cambria",
    titleSpaceAfter: 12,
    leader: "dot",
    levels: {
      1: { styled: true, marks: [{ type: "allCaps" }], pageToo: false },
      2: { styled: true, marks: [{ type: "smallCaps" }], pageToo: false },
      3: { styled: true, marks: [{ type: "italic" }], pageToo: true },
    },
  },
};

/** How one line of a gallery thumbnail looks. */
export interface TocThumbnailLevelLook {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly caps: boolean;
  readonly smallCaps: boolean;
  readonly underline: boolean;
  readonly font?: string;
  /** Indent steps from the margin (TOC 2 and TOC 3 step in). */
  readonly indent: number;
  /** The line keeps space above it (Contemporary's first level). */
  readonly spaced: boolean;
}

export interface TocThumbnailLook {
  readonly titleFont?: string;
  readonly leader: "dot" | "none";
  readonly levels: readonly [TocThumbnailLevelLook, TocThumbnailLevelLook, TocThumbnailLevelLook];
}

/**
 * The gallery thumbnail of a manual table (`look` is the row's id): the
 * block's own formatting over Word's TOC 1-3 styles (TOC 1 bold, TOC 2 italic
 * and indented, TOC 3 indented further), so each row reads as the table it
 * inserts. Any other id is Classic, which is also how Word's Automatic tables
 * look.
 */
export function tocThumbnailLook(look: string): TocThumbnailLook {
  const format = MANUAL_TOC_LOOKS[look] ?? MANUAL_TOC_LOOKS.classic;
  const level = (n: 1 | 2 | 3): TocThumbnailLevelLook => {
    const levelLook = format.levels[n];
    const has = (type: string) => levelLook.marks.some((mark) => mark.type === type);
    const font = levelLook.marks.find((mark) => mark.type === "fontFamily")?.attrs?.family;
    return {
      bold: has("bold") || (levelLook.styled && n === 1),
      italic: has("italic") || (levelLook.styled && n === 2),
      caps: has("allCaps"),
      smallCaps: has("smallCaps"),
      underline: has("underline"),
      ...(typeof font === "string" ? { font } : {}),
      indent: levelLook.styled ? n - 1 : 0,
      spaced: levelLook.spaceBefore !== undefined,
    };
  };
  return {
    ...(format.titleFont ? { titleFont: format.titleFont } : {}),
    leader: format.leader,
    levels: [level(1), level(2), level(3)],
  };
}

/** A Word content control id (w:id): a positive 31-bit integer. */
function contentControlId(): number {
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  return (random[0] % 2_000_000_000) + 1;
}

/**
 * Word's Manual Table, as the References gallery inserts it: one content
 * control of the "Table of Contents" gallery holding a title (its first
 * paragraph, which the DOCX writers style "TOC Heading") and one line per
 * entry (TOC N by its tocLevel). An entry's words are a temporary placeholder
 * control (typing replaces them, as in Word) and its page number is typed
 * text at the right margin after the format's leader; there is no field, so
 * the table never updates (Word: "won't be able to update it
 * automatically"). `look` is the gallery row's id.
 */
export function manualTableOfContentsContent(
  title: string,
  entries: readonly ManualTableOfContentsEntry[],
  look = "classic",
): JSONContent[] {
  const format = MANUAL_TOC_LOOKS[look] ?? MANUAL_TOC_LOOKS.classic;
  const blockId = contentControlId();
  const titleMarks: ManualTocMark[] = format.titleFont
    ? [{ type: "fontFamily", attrs: { family: format.titleFont } }]
    : [];
  return [
    {
      type: "blockContentControl",
      attrs: {
        controlType: "richText",
        controlId: blockId,
        docPartGallery: "Table of Contents",
        docPartUnique: true,
      },
      content: [
        {
          type: "paragraph",
          ...(format.titleSpaceAfter !== undefined ? { attrs: { spaceAfter: format.titleSpaceAfter } } : {}),
          content: [{ type: "text", text: title, ...(titleMarks.length ? { marks: titleMarks } : {}) }],
        },
        ...entries.map((entry, index) => {
          const level = Math.min(3, Math.max(1, Math.round(entry.level))) as 1 | 2 | 3;
          const levelLook = format.levels[level];
          const controlId = contentControlId();
          return {
            type: "paragraph",
            attrs: {
              tocEntryLeader: format.leader,
              ...(levelLook.styled ? { tocLevel: level } : {}),
              ...(levelLook.spaceBefore !== undefined ? { spaceBefore: levelLook.spaceBefore } : {}),
              ...(levelLook.spaceAfter !== undefined ? { spaceAfter: levelLook.spaceAfter } : {}),
            },
            content: [
              {
                type: "text",
                text: entry.text,
                marks: [
                  {
                    type: "contentControl",
                    attrs: {
                      controlType: "richText",
                      controlId,
                      controlKey: `toc-manual-${blockId}-${index}`,
                      placeholder: true,
                      temporary: true,
                    },
                  },
                  { type: "tocEntryTitle" },
                  ...levelLook.marks,
                ],
              },
              {
                type: "text",
                text: String(entry.page),
                marks: [{ type: "tocEntryPage" }, ...(levelLook.pageToo ? levelLook.marks : [])],
              },
            ],
          };
        }),
      ],
    },
  ];
}
