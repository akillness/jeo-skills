"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, type Mark, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { liftListItem } from "@tiptap/pm/schema-list";
import { RemoveMarkStep, ReplaceStep, canJoin, type Step } from "@tiptap/pm/transform";
import { wordStyleHeadingLevels } from "../../../../lib/document-style-identity";
import { inheritedBoldValue } from "./boldExtension";
import { inheritedItalicValue } from "./italicExtension";
import { FOOTNOTE_MARK_NAME, normalizeFootnotes, removeFootnoteEntry, sanitizeFootnoteId } from "./footnotes";
import { BOOKMARK_POINT_NODE_NAME } from "./bookmarks";
import { COMMENT_MARK_NAME, normalizeCommentThreads, removeReplyAt, removeThread, sanitizeThreadId } from "./comments";

/**
 * Track Changes (Word/WPS "suggesting mode") — STAGE 1 pure logic.
 *
 * Two inline marks model a tracked change:
 *   - INSERTION ("trackInsertion"): text the suggester added. Accepting it keeps
 *     the text and strips the mark; rejecting it removes the text.
 *   - DELETION  ("trackDeletion"): text the suggester wants gone. Rather than
 *     actually cutting it, suggesting mode "tombstones" the range with this mark
 *     (rendered struck-through). Accepting it removes the text; rejecting it
 *     keeps the text and strips the mark.
 *
 * Everything in THIS module is intentionally framework-free: it operates on a
 * ProseMirror doc/Transaction so the accept/reject behavior can be unit-tested
 * headlessly by constructing an EditorState, applying these helpers, and
 * asserting on the resulting document. The TipTap marks/extension that wire this
 * into the live editor live in trackChangesExtension.ts.
 */

export const INSERTION_MARK_NAME = "trackInsertion";
export const DELETION_MARK_NAME = "trackDeletion";
export const FORMAT_REVISION_MARK_NAME = "trackFormatting";
export const PARAGRAPH_FORMAT_REVISION_ATTR = "trackParagraphFormatting";







export const ROW_DELETION_REVISION_ATTR = "trackRowDeletion";

/**
 * A table row inserted while changes are tracked (Word's `w:trPr/w:ins`,
 * Insert Rows Above/Below with Track Changes on; Word 16 for Mac also marks
 * each of its cells' paragraph marks inserted). The row is a revision of its
 * own even while its cells are empty: accepting keeps it, rejecting removes
 * it (its table with its last row). `{author, timestamp}` or null.
 */
export const ROW_INSERTION_REVISION_ATTR = "trackRowInsertion";

export interface RowInsertionRevision {
  author: string | null;
  timestamp: number | null;
}

export function normalizeRowInsertionRevision(value: unknown): RowInsertionRevision | null {
  if (value === true) return { author: null, timestamp: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return { author: sanitizeChangeAuthor(raw.author), timestamp: sanitizeChangeTimestamp(raw.timestamp) };
}

/** Every tracked-inserted table row, in document order. */
export function trackedInsertedRows(doc: ProseMirrorNode): Array<{ pos: number; node: ProseMirrorNode; revision: RowInsertionRevision }> {
  const rows: Array<{ pos: number; node: ProseMirrorNode; revision: RowInsertionRevision }> = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === "row") {
      const revision = normalizeRowInsertionRevision(node.attrs[ROW_INSERTION_REVISION_ATTR]);
      if (revision) rows.push({ pos, node, revision });
      return false;
    }
    return !node.isTextblock;
  });
  return rows;
}

/** The tracked-inserted table row holding `pos`, if any. */
export function trackedInsertedRowAround(
  doc: ProseMirrorNode,
  pos: number,
): { pos: number; node: ProseMirrorNode } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole === "row") {
      return normalizeRowInsertionRevision(node.attrs[ROW_INSERTION_REVISION_ATTR])
        ? { pos: $pos.before(depth), node }
        : null;
    }
  }
  return null;
}

/** Accepting a row insertion: the row is an ordinary row. */
function keepTrackedInsertedRow(tr: Transaction, rowPos: number): boolean {
  const row = tr.doc.nodeAt(rowPos);
  if (!row || !normalizeRowInsertionRevision(row.attrs[ROW_INSERTION_REVISION_ATTR])) return false;
  tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, [ROW_INSERTION_REVISION_ATTR]: null });
  return true;
}

/** The tracked-deleted table row holding `pos`, if any. */
export function trackedDeletedRowAround(
  doc: ProseMirrorNode,
  pos: number,
): { pos: number; node: ProseMirrorNode } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole === "row") {
      return node.attrs[ROW_DELETION_REVISION_ATTR] === true
        ? { pos: $pos.before(depth), node }
        : null;
    }
  }
  return null;
}

/** Every tracked-deleted table row, in document order. */
function trackedDeletedRows(doc: ProseMirrorNode): number[] {
  const rows: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === "row" && node.attrs[ROW_DELETION_REVISION_ATTR] === true) {
      rows.push(pos);
      return false;
    }
    return !node.isTextblock;
  });
  return rows;
}

/** Accepting a row deletion: the row goes, and its table with its last row. */
function removeTrackedDeletedRow(tr: Transaction, rowPos: number): boolean {
  const row = tr.doc.nodeAt(rowPos);
  if (!row || row.type.spec.tableRole !== "row") return false;
  const $row = tr.doc.resolve(rowPos);
  const table = $row.parent;
  if (table.childCount <= 1) {
    tr.delete($row.before(), $row.after());
  } else {
    tr.delete(rowPos, rowPos + row.nodeSize);
  }
  return true;
}

/** Rejecting a row deletion: the row is an ordinary row again. */
function restoreTrackedDeletedRow(tr: Transaction, rowPos: number): boolean {
  const row = tr.doc.nodeAt(rowPos);
  if (!row || row.attrs[ROW_DELETION_REVISION_ATTR] !== true) return false;
  tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, [ROW_DELETION_REVISION_ATTR]: null });
  return true;
}

/**
 * Table property revisions: a cell, a row or a table whose properties
 * changed while changes were tracked (Word's `w:tcPrChange`,
 * `w:trPrChange`, `w:tblPrChange`, ISO/IEC 29500-1 17.13.5.36/37/34). The
 * node keeps its new properties and remembers the ones it had,
 * `{revisionId, author, timestamp, previousAttrs}`: accepting forgets them,
 * rejecting puts them back. As in `w:tcPrChange`, `previousAttrs` is the
 * complete previous set: a tracked attribute it does not name had its
 * default.
 *
 * Word reviews every property change of one table as ONE revision ("Formatted
 * Table", `wdRevisionTableProperty`, measured in Word 16.86: shading a cell
 * and centring another in a second row list as one revision over the table,
 * and Accept/Reject take both). The Reviewing pane therefore lists a table's
 * property revisions as one change, and Accept/Reject resolve them together;
 * each node still states its own previous properties, which is what the DOCX
 * writers put in its own record.
 *
 * Merging or splitting cells and deleting a column are not property
 * revisions: Word applies them untracked ("This action will not be marked as
 * a change"), and so does the editor.
 */
export const CELL_FORMAT_REVISION_ATTR = "trackCellFormatting";
export const ROW_FORMAT_REVISION_ATTR = "trackRowFormatting";
export const TABLE_FORMAT_REVISION_ATTR = "trackTableFormatting";

/** The cell properties a cell revision remembers (`w:tcPr`'s shading, borders,
 * margins, text direction and vertical alignment). A cell's horizontal
 * alignment is its paragraphs' (`w:jc`), tracked as their own revisions; its
 * width belongs to the column. Keep in step with the API's
 * TRACKED_CELL_FORMAT_ATTRS (document_export_revision_policy.py). */
export const TRACKED_CELL_FORMAT_ATTRS = [
  "backgroundColor",
  "cellShading",
  "borderStyle",
  "cellBorders",
  "cellMargin",
  "textDirection",
  "verticalAlign",
] as const;

/** The row properties a row revision remembers (`w:trPr`'s height, header
 * row and "allow row to break across pages"). */
export const TRACKED_ROW_FORMAT_ATTRS = [
  "rowHeight",
  "rowHeightTwips",
  "rowHeightRule",
  "headerRow",
  "cantSplit",
] as const;

/** The table properties a table revision remembers (`w:tblPr`'s alignment,
 * indent, cell spacing, shading, borders, default cell margins, positioning
 * and alt text). */
export const TRACKED_TABLE_FORMAT_ATTRS = [
  "tableAlign",
  "tableIndentPx",
  "tableIndentTwips",
  "tableCellSpacingPx",
  "tableCellSpacingTwips",
  "tableShading",
  "tablePositioning",
  "borderless",
  "tableBorders",
  "tableCellMargin",
  "tableCaption",
  "tableDescription",
] as const;

export type TablePropertyRevisionScope = "cell" | "row" | "table";

export interface NativeTablePropertyRevisionAuthority extends ChangeAttrs {
  revisionId: string;
  previousAttrs: Record<string, unknown>;
}

/** Which kind of table property revision a node can carry, if any. */
export function tablePropertyRevisionScope(node: ProseMirrorNode): TablePropertyRevisionScope | null {
  const role = node.type.spec.tableRole;
  if (role === "cell" || role === "header_cell") return "cell";
  if (role === "row") return "row";
  if (role === "table") return "table";
  return null;
}

export function tablePropertyRevisionAttr(scope: TablePropertyRevisionScope): string {
  return scope === "cell"
    ? CELL_FORMAT_REVISION_ATTR
    : scope === "row"
      ? ROW_FORMAT_REVISION_ATTR
      : TABLE_FORMAT_REVISION_ATTR;
}

export function trackedTablePropertyAttrs(scope: TablePropertyRevisionScope): readonly string[] {
  return scope === "cell"
    ? TRACKED_CELL_FORMAT_ATTRS
    : scope === "row"
      ? TRACKED_ROW_FORMAT_ATTRS
      : TRACKED_TABLE_FORMAT_ATTRS;
}

export function normalizeTablePropertyRevision(
  value: unknown,
  scope: TablePropertyRevisionScope,
): NativeTablePropertyRevisionAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const revisionId = sanitizeRevisionId(record.revisionId);
  const previous = record.previousAttrs;
  if (!revisionId || !previous || typeof previous !== "object" || Array.isArray(previous)) return null;
  const allowed = trackedTablePropertyAttrs(scope);
  const previousAttrs: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(previous as Record<string, unknown>)) {
    if (raw === undefined) continue;
    if (!allowed.includes(key)) return null;
    const next = boundedJsonValue(raw);
    if (next === undefined) return null;
    previousAttrs[key] = next;
  }
  if (JSON.stringify(previousAttrs).length > MAX_FORMAT_AUTHORITY_JSON_LENGTH) return null;
  return { ...normalizeChangeAttrs(record), revisionId, previousAttrs };
}

/** The table property revision a cell, row or table carries, if any. */
export function tablePropertyRevisionOf(node: ProseMirrorNode): NativeTablePropertyRevisionAuthority | null {
  const scope = tablePropertyRevisionScope(node);
  return scope ? normalizeTablePropertyRevision(node.attrs[tablePropertyRevisionAttr(scope)], scope) : null;
}

/**
 * The tracked properties of a cell, row or table as a revision remembers
 * them: every tracked attribute that differs from its default, as Word's
 * `w:tcPrChange` holds the complete previous `w:tcPr`.
 */
export function tablePropertySnapshot(node: ProseMirrorNode): Record<string, unknown> {
  const scope = tablePropertyRevisionScope(node);
  if (!scope) return {};
  const specAttrs = node.type.spec.attrs ?? {};
  const snapshot: Record<string, unknown> = {};
  for (const key of trackedTablePropertyAttrs(scope)) {
    if (!(key in specAttrs)) continue;
    const value: unknown = node.attrs[key];
    const fallback: unknown = specAttrs[key]?.default ?? null;
    if (value === undefined || JSON.stringify(value) === JSON.stringify(fallback)) continue;
    snapshot[key] = value;
  }
  return snapshot;
}

/** The cells, rows and table itself of the table at `tablePos` that carry a
 * property revision (a table nested in a cell is a table of its own). */
function tablePropertyRevisionNodes(
  doc: ProseMirrorNode,
  tablePos: number,
): Array<{ pos: number; node: ProseMirrorNode; authority: NativeTablePropertyRevisionAuthority }> {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table") return [];
  const found: Array<{ pos: number; node: ProseMirrorNode; authority: NativeTablePropertyRevisionAuthority }> = [];
  const own = tablePropertyRevisionOf(table);
  if (own) found.push({ pos: tablePos, node: table, authority: own });
  table.forEach((row, rowOffset) => {
    const rowPos = tablePos + 1 + rowOffset;
    const rowAuthority = tablePropertyRevisionOf(row);
    if (rowAuthority) found.push({ pos: rowPos, node: row, authority: rowAuthority });
    row.forEach((cell, cellOffset) => {
      const cellAuthority = tablePropertyRevisionOf(cell);
      if (cellAuthority) found.push({ pos: rowPos + 1 + cellOffset, node: cell, authority: cellAuthority });
    });
  });
  return found;
}

/**
 * One table's property revisions as the Reviewing pane shows them: every
 * page fragment of the table (the paged editor draws a long table as one
 * `table` node per page, sharing `pageTableFragmentId`), the span they
 * cover, and the author and time of the latest record.
 */
export interface TablePropertyRevisionGroup {
  tablePositions: number[];
  from: number;
  to: number;
  author: string | null;
  timestamp: number | null;
}

export function collectTablePropertyRevisionGroups(doc: ProseMirrorNode): TablePropertyRevisionGroup[] {
  const groups = new Map<string, TablePropertyRevisionGroup & { latest: number }>();
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole !== "table") return !node.isTextblock;
    const records = tablePropertyRevisionNodes(doc, pos);
    if (records.length > 0) {
      const fragment = node.attrs.pageTableFragmentId;
      const key = typeof fragment === "string" && fragment ? `fragment:${fragment}` : `table:${pos}`;
      let group = groups.get(key);
      if (!group) {
        group = { tablePositions: [], from: pos + 1, to: pos + node.nodeSize - 1, author: null, timestamp: null, latest: -1 };
        groups.set(key, group);
      }
      group.tablePositions.push(pos);
      group.from = Math.min(group.from, pos + 1);
      group.to = Math.max(group.to, pos + node.nodeSize - 1);
      for (const { authority } of records) {
        const at = authority.timestamp ?? -1;
        if (group.latest < 0 || at >= group.latest) {
          group.latest = at;
          group.author = authority.author ?? group.author;
          group.timestamp = authority.timestamp;
        }
      }
    }
    // A table nested in a cell has revisions of its own.
    return true;
  });
  return [...groups.values()]
    .map((group) => ({
      tablePositions: group.tablePositions,
      from: group.from,
      to: group.to,
      author: group.author,
      timestamp: group.timestamp,
    }))
    .sort((a, b) => a.from - b.from);
}

/**
 * Accept (forget the previous properties) or reject (put them back) every
 * property revision of the tables at `tablePositions`. Attribute-only
 * changes: every position stays valid.
 */
export function resolveTablePropertyRevisions(
  tr: Transaction,
  tablePositions: readonly number[],
  mode: "accept" | "reject",
): boolean {
  let changed = false;
  for (const tablePos of tablePositions) {
    for (const { pos, node, authority } of tablePropertyRevisionNodes(tr.doc, tablePos)) {
      const scope = tablePropertyRevisionScope(node)!;
      const attrs: Record<string, unknown> = { ...node.attrs, [tablePropertyRevisionAttr(scope)]: null };
      if (mode === "reject") {
        const specAttrs = node.type.spec.attrs ?? {};
        for (const key of trackedTablePropertyAttrs(scope)) {
          if (key in specAttrs) attrs[key] = specAttrs[key]?.default ?? null;
        }
        for (const [key, value] of Object.entries(authority.previousAttrs)) {
          if (key in specAttrs) attrs[key] = value;
        }
      }
      tr.setNodeMarkup(pos, undefined, attrs, node.marks);
      changed = true;
    }
  }
  return changed;
}

/** The table property revision group a position falls in, if any. */
function tablePropertyRevisionGroupAt(doc: ProseMirrorNode, pos: number): TablePropertyRevisionGroup | null {
  return (
    collectTablePropertyRevisionGroups(doc)
      .filter((group) => pos >= group.from && pos <= group.to)
      // The innermost table: a nested table's group lies inside its host's.
      .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0] ?? null
  );
}
















export const OBJECT_DELETION_REVISION_ATTR = "trackObjectDeletion";
export const LEGACY_PICTURE_DELETION_REVISION_ATTR = "trackPictureDeletion";

/** What a deleted object is, for the Reviewing pane and the drawing rules. */
export type TrackedObjectKind =
  | "picture"
  | "chart"
  | "shape"
  | "textBox"
  | "equation"
  | "pageBreak"
  | "columnBreak"
  | "sectionBreak"
  | "horizontalRule"
  | "noteReference"
  | "field";

/** Node types whose deletion is one object revision (Word's own set). */
export const OBJECT_DELETION_NODE_KINDS: ReadonlyMap<string, TrackedObjectKind> = new Map([
  ["image", "picture"],
  ["inlineImage", "picture"],
  ["chart", "chart"],
  ["inlineChart", "chart"],
  ["documentShape", "shape"],
  ["inlineDocumentShape", "shape"],
  ["textBox", "textBox"],
  ["mathBlock", "equation"],
  ["inlineMath", "equation"],
  ["pageBreak", "pageBreak"],
  ["columnBreak", "columnBreak"],
  ["sectionBreak", "sectionBreak"],
  ["horizontalRule", "horizontalRule"],
  // A footnote/endnote reference mark deleted with Track Changes on (Word's
  // w:del around the run holding w:footnoteReference): struck in the revision
  // colour; accepting it deletes the mark, and the note with it.
  ["footnoteRef", "noteReference"],
  // A field deleted with Track Changes on (Word's w:del around every run of
  // it, the code as w:delInstrText): struck in the revision colour; accepting
  // it takes the field away, rejecting it gives the live field back (corpus
  // R490-D02's EndNote citations, reading generation 404).
  ["documentField", "field"],
]);

export const OBJECT_DELETION_NODE_NAMES: readonly string[] = [...OBJECT_DELETION_NODE_KINDS.keys()];

/** The object kind of a node (or node name) that can carry a deletion revision. */
export function trackedObjectKind(
  node: { readonly type: { readonly name: string } } | string,
): TrackedObjectKind | null {
  const name = typeof node === "string" ? node : node.type.name;
  return OBJECT_DELETION_NODE_KINDS.get(name) ?? null;
}

/** Word strikes a drawing or an equation; a break or a rule only gets a change bar. */
export function trackedObjectKindIsStruck(kind: TrackedObjectKind): boolean {
  return kind !== "pageBreak" && kind !== "columnBreak" && kind !== "sectionBreak" && kind !== "horizontalRule";
}

export interface ObjectDeletionRevision {
  readonly author: string | null;
  readonly timestamp: number | null;
  readonly revisionId: string | null;
}

/** The object-deletion revision a stored value states, or null. */
export function normalizeObjectDeletionRevision(
  value: unknown,
): ObjectDeletionRevision | null {
  if (value === true) return { author: null, timestamp: null, revisionId: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    author: sanitizeChangeAuthor(record.author),
    timestamp: sanitizeChangeTimestamp(record.timestamp),
    revisionId: sanitizeRevisionId(record.revisionId),
  };
}

/** The deletion revision a node carries, or null. */
export function objectDeletionRevisionOf(node: ProseMirrorNode): ObjectDeletionRevision | null {
  if (!OBJECT_DELETION_NODE_KINDS.has(node.type.name)) return null;
  return normalizeObjectDeletionRevision(node.attrs[OBJECT_DELETION_REVISION_ATTR]);
}

export interface TrackedDeletedObject {
  pos: number;
  node: ProseMirrorNode;
  kind: TrackedObjectKind;
  revision: ObjectDeletionRevision;
}

/** The tracked-deleted object node at (or just before) `pos`, if any. */
export function trackedDeletedObjectAt(
  doc: ProseMirrorNode,
  pos: number,
): TrackedDeletedObject | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const candidates = [doc.nodeAt(clamped) ? clamped : -1];
  const $pos = doc.resolve(clamped);
  if ($pos.nodeBefore) candidates.push(clamped - $pos.nodeBefore.nodeSize);
  for (const candidate of candidates) {
    if (candidate < 0) continue;
    const node = doc.nodeAt(candidate);
    if (!node) continue;
    const kind = trackedObjectKind(node);
    const revision = kind ? objectDeletionRevisionOf(node) : null;
    if (kind && revision) return { pos: candidate, node, kind, revision };
  }
  return null;
}

/** Every tracked-deleted object, in document order (a text box's content is not entered). */
export function trackedDeletedObjects(doc: ProseMirrorNode): TrackedDeletedObject[] {
  return trackedDeletedObjectsBetween(doc, 0, doc.content.size);
}

/** trackedDeletedObjects of the nodes that reach into `from`..`to`. */
export function trackedDeletedObjectsBetween(doc: ProseMirrorNode, from: number, to: number): TrackedDeletedObject[] {
  const found: TrackedDeletedObject[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    const kind = trackedObjectKind(node);
    if (kind) {
      const revision = objectDeletionRevisionOf(node);
      if (revision) {
        found.push({ pos, node, kind, revision });
        return false;
      }
      return !node.isLeaf;
    }
    return !node.isTextblock || node.childCount > 0;
  });
  return found;
}

/** The doc attribute holding the note store (footnoteExtension FOOTNOTES_ATTR). */
const NOTE_STORE_ATTR = "footnotes";

/** Accepting an object deletion: the object goes (an emptied host with it). */
function removeTrackedDeletedObject(tr: Transaction, pos: number): boolean {
  const node = tr.doc.nodeAt(pos);
  if (!node || !trackedObjectKind(node)) return false;
  tr.deleteRange(pos, pos + node.nodeSize);
  if (node.type.name === FOOTNOTE_MARK_NAME) dropNoteLeftWithoutReference(tr, node.attrs.noteId);
  return true;
}

/**
 * Accepting the deletion of a note reference deletes the note with it, as
 * Word does: left in the store with nothing pointing at it, the note would
 * make the document refuse to export. A note another reference still shows
 * stays.
 */
function dropNoteLeftWithoutReference(tr: Transaction, noteId: unknown): void {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return;
  let referenced = false;
  tr.doc.descendants((child) => {
    if (referenced) return false;
    if (child.type.name === FOOTNOTE_MARK_NAME && sanitizeFootnoteId(child.attrs.noteId) === id) {
      referenced = true;
    }
    return !child.isLeaf;
  });
  if (referenced) return;
  const notes = normalizeFootnotes(tr.doc.attrs[NOTE_STORE_ATTR]);
  const next = removeFootnoteEntry(notes, id);
  if (next !== notes) tr.setDocAttribute(NOTE_STORE_ATTR, next);
}

/** Rejecting an object deletion: the object is an ordinary object again. */
function restoreTrackedDeletedObject(tr: Transaction, pos: number): boolean {
  const node = tr.doc.nodeAt(pos);
  if (!node || node.attrs[OBJECT_DELETION_REVISION_ATTR] == null) return false;
  tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    [OBJECT_DELETION_REVISION_ATTR]: null,
  });
  return true;
}

export const TRACKED_FORMAT_MARK_NAMES = new Set([
  "bold",
  "strong",
  "italic",
  "em",
  "underline",
  "strike",
  "strikethrough",
  "doubleStrike",
  "hiddenText",
  "superscript",
  "subscript",
  "smallCaps",
  "allCaps",
  "textColor",
  "highlight",
  "fontFamily",
  "fontCjkFamily",
  "fontComplexFamily",
  "fontSize",
  "characterStyle",
  "emphasisDots",
  "eastAsianLayout",
  "charSpacing",
  "charScale",
  "kerningThreshold",
  "charShading",
  "charBorder",
]);

/**
 * Run marks a revision's snapshot may name beside the tracked ones: Word's
 * `w:rPrChange` holds the complete previous `w:rPr`, its `w:lang` too (an
 * imported revision's snapshot names the run's proofing language). Recorded
 * live, a snapshot holds the tracked marks only, so such a mark is put back
 * (and the current one taken off) only when the snapshot names it. A
 * snapshot that named one was refused whole: Reject All and Accept All left
 * the revision standing (corpus R456-D10 E43).
 */
export const SNAPSHOT_ONLY_FORMAT_MARK_NAMES = new Set(["proofingLanguage"]);

export const TRACKED_PARAGRAPH_FORMAT_ATTRS = [
  "customStyleName",
  "customStyleId",
  "docxStyleId",
  "textAlign",
  "indent",
  "textIndent",
  "indentLeftPt",
  "indentRightPt",
  "firstLineIndentPt",
  "lineHeight",
  "lineHeightPt",
  "lineHeightRule",
  "spaceBefore",
  "spaceAfter",
  "borderPreset",
  "paragraphBorders",
  "shadingColor",
  "keepNext",
  "keepLines",
  "widowControl",
  "contextualSpacing",
  "tabStops",
  "tocOutlineLevel",
  "builtinStyleId",
] as const;

/**
 * A paragraph revision recorded live also names the heading level the
 * paragraph had (0 = a body paragraph), because a heading is its own node
 * type here while Word keeps it in the paragraph's style: rejecting Heading 1
 * turns the heading back into the paragraph it was. Imported revisions have
 * no such key and keep the node type on reject.
 */
export const PARAGRAPH_FORMAT_HEADING_LEVEL_KEY = "headingLevel";

/**
 * A paragraph revision recorded live when Bullets, Numbering or Checklist
 * put a paragraph that was in no list into one: 0, the paragraph was in no
 * list. A list is structure here while Word keeps it in the paragraph's
 * numbering (w:pPr/w:numPr), so the previous properties alone could not say
 * it; rejecting the change takes the paragraph back out of the list (WUA 244:
 * the conversion was no revision at all, and Reject All left the list).
 */
export const PARAGRAPH_FORMAT_LIST_LEVEL_KEY = "listLevel";

/**
 * The paragraph properties of Word's `w:pPrChange` the import states beside
 * the tracked ones (its complete previous `w:pPr`): the East Asian
 * typography and the line-number / hyphenation opt-outs. A live snapshot
 * does not record them, so they are restored only from an imported revision
 * (one that names no heading level). A snapshot that named one was refused
 * whole: Reject All and Accept All left the revision standing (corpus
 * R456-D10 E43, 39 paragraphs).
 */
export const IMPORTED_PARAGRAPH_FORMAT_ATTRS = [
  "suppressLineNumbers",
  "suppressAutoHyphens",
  "snapToGrid",
  "wordWrap",
  "kinsoku",
  "overflowPunct",
  "topLinePunct",
  "textAlignment",
  "adjustRightInd",
  "mirrorIndents",
  "autoSpaceDE",
  "autoSpaceDN",
] as const;

/**
 * An imported revision whose recorded properties (Word's `w:pPrChange/w:pPr`)
 * number the paragraph: `{numId, level}` of the recorded `w:numPr` (numId 0,
 * Word's "not numbered"), and, where the import reads the recorded paragraph
 * as a list item, the list it would draw it in (`list`: the wrapper's type and
 * attributes, the paragraph standing alone). Rejecting the revision puts the
 * paragraph back into that list, or takes it out of its list for numId 0, as
 * Word does (corpus R490-D02 E43: "Paragraph, was List Paragraph" items in
 * table cells). A numbered heading states no list: its numbering is the
 * heading's, which the page does not draw.
 */
export const PARAGRAPH_FORMAT_RECORDED_NUMBERING_KEY = "recordedNumbering";

export interface RecordedParagraphNumbering {
  numId: number;
  level: number;
  list?: { type: "bulletList" | "orderedList"; attrs?: Record<string, unknown> };
}

const PARAGRAPH_FORMAT_SNAPSHOT_KEYS: readonly string[] = [
  ...TRACKED_PARAGRAPH_FORMAT_ATTRS,
  ...IMPORTED_PARAGRAPH_FORMAT_ATTRS,
  PARAGRAPH_FORMAT_HEADING_LEVEL_KEY,
  PARAGRAPH_FORMAT_LIST_LEVEL_KEY,
  PARAGRAPH_FORMAT_RECORDED_NUMBERING_KEY,
];

export interface TrackedFormatMarkSnapshot {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface NativeFormatRevisionAuthority extends ChangeAttrs {
  revisionId: string | null;
  previousMarks: TrackedFormatMarkSnapshot[];
}

export interface NativeParagraphFormatRevisionAuthority extends ChangeAttrs {
  revisionId: string | null;
  previousAttrs: Record<string, unknown>;
}

/**
 * Closed set of inline atoms that can safely carry an insertion revision.
 * Deletion revisions remain text-only; block and table revisions are outside
 * the supported document contract. A footnote or endnote reference inserted
 * with Track Changes on is Word's w:ins around the run holding it: rejecting
 * it takes the note away with it (live Word audit WUA 045: an inserted or
 * pasted note was saved as accepted and survived Reject All). Keep in step
 * with the API's DOCUMENT_TRACK_INSERTION_INLINE_ATOM_TYPES.
 */
// A line break typed with Track Changes on is an insertion like typed text
// (WUA 228: Shift+Return was untracked and Reject All left it).
// A field inserted with Track Changes on is Word's w:ins around its runs:
// rejecting it takes the field away (reading generation 404).
export const TRACKED_INSERTION_INLINE_ATOM_NAMES = new Set(["inlineMath", "footnoteRef", "hardBreak", "documentField"]);

export function supportsTrackedInsertion(node: ProseMirrorNode): boolean {
  return (
    node.isText ||
    (node.isInline &&
      node.isAtom &&
      TRACKED_INSERTION_INLINE_ATOM_NAMES.has(node.type.name))
  );
}

/**
 * An object inserted while changes are tracked. Word records a picture, a
 * chart, a shape or text box, a page/column break or a horizontal line put in
 * as `w:ins` around the run holding it, a display equation as `w:ins` inside
 * each of its `m:r`, and a section break as an inserted paragraph mark on the
 * paragraph carrying the `w:sectPr`. The revision is an attribute of the
 * node, as an object deletion's is: accepting it leaves an ordinary object,
 * rejecting it takes the object out. An inline equation and a note reference
 * carry the insertion mark instead (TRACKED_INSERTION_INLINE_ATOM_NAMES).
 * `{author, timestamp, revisionId}` or null, the deletion's record.
 */
export const OBJECT_INSERTION_REVISION_ATTR = "trackObjectInsertion";

/** Node types whose insertion is one object revision. */
export const OBJECT_INSERTION_NODE_KINDS: ReadonlyMap<string, TrackedObjectKind> = new Map(
  [...OBJECT_DELETION_NODE_KINDS].filter(([name]) => !TRACKED_INSERTION_INLINE_ATOM_NAMES.has(name)),
);

export const OBJECT_INSERTION_NODE_NAMES: readonly string[] = [...OBJECT_INSERTION_NODE_KINDS.keys()];

/** The insertion revision an object node carries, or null. */
export function objectInsertionRevisionOf(node: ProseMirrorNode): ObjectDeletionRevision | null {
  if (!OBJECT_INSERTION_NODE_KINDS.has(node.type.name)) return null;
  return normalizeObjectDeletionRevision(node.attrs[OBJECT_INSERTION_REVISION_ATTR]);
}

/** Every tracked-inserted object, in document order (a text box's content is not entered). */
export function trackedInsertedObjects(doc: ProseMirrorNode): TrackedDeletedObject[] {
  return trackedInsertedObjectsBetween(doc, 0, doc.content.size);
}

/** trackedInsertedObjects of the nodes that reach into `from`..`to`. */
export function trackedInsertedObjectsBetween(doc: ProseMirrorNode, from: number, to: number): TrackedDeletedObject[] {
  const found: TrackedDeletedObject[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    const kind = OBJECT_INSERTION_NODE_KINDS.get(node.type.name);
    if (kind) {
      const revision = objectInsertionRevisionOf(node);
      if (revision) {
        found.push({ pos, node, kind, revision });
        return false;
      }
      return !node.isLeaf;
    }
    return !node.isTextblock || node.childCount > 0;
  });
  return found;
}

/** The tracked-inserted object node at (or just before) `pos`, if any. */
function trackedInsertedObjectAt(doc: ProseMirrorNode, pos: number): TrackedDeletedObject | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const candidates = [doc.nodeAt(clamped) ? clamped : -1];
  const $pos = doc.resolve(clamped);
  if ($pos.nodeBefore) candidates.push(clamped - $pos.nodeBefore.nodeSize);
  for (const candidate of candidates) {
    if (candidate < 0) continue;
    const node = doc.nodeAt(candidate);
    const kind = node ? OBJECT_INSERTION_NODE_KINDS.get(node.type.name) : undefined;
    const revision = node && kind ? objectInsertionRevisionOf(node) : null;
    if (node && kind && revision) return { pos: candidate, node, kind, revision };
  }
  return null;
}

/** Accepting an object insertion: it is an ordinary object. */
function keepTrackedInsertedObject(tr: Transaction, pos: number): boolean {
  const node = tr.doc.nodeAt(pos);
  if (!node || node.attrs[OBJECT_INSERTION_REVISION_ATTR] == null) return false;
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, [OBJECT_INSERTION_REVISION_ATTR]: null });
  return true;
}

/**
 * Author labels are user-supplied (and round-trip through persisted JSON), so we
 * cap their length and strip control bytes the same way the rest of the editor
 * sanitizes free text at its edge. The cap is generous enough for a display name
 * but bounds what a forged document can smuggle in. It is the bound the server
 * holds a revision's author to (`REVISION_AUTHOR_MAX`): Word writes a name with
 * its e-mail address, sometimes twice (corpus R60-D13, 103 characters).
 */
export const MAX_CHANGE_AUTHOR_LENGTH = 255;

export interface ChangeAttrs {
  author: string | null;
  timestamp: number | null;
  /** Native OOXML revision wrapper identity (`w:moveFrom|moveTo/@w:id`). */
  revisionId: string | null;
  /** Shared Word move identity (`w:moveFromRangeStart|moveToRangeStart/@w:name`). */
  moveId: string | null;
  moveRole: "from" | "to" | null;
  /** Native range start/end identity for this endpoint. */
  moveRangeId: string | null;
}

// C0 controls, DEL, and the C1 control block. Replaced with a space so the
// author can never break out of an attribute or inject markup; the follow-up
// \s+ collapse then folds the gap back to a single space.
const CONTROL_BYTE_RE = /[\u0000-\u001f\u007f-\u009f]+/g;

/**
 * Strip control characters, collapse whitespace, and clamp to a sane upper
 * bound. Returns null for anything that is not a non-empty string after
 * scrubbing, so an absent/blank/forged author never reaches the DOM as anything
 * other than a bounded, single-line attribute value.
 */
export function sanitizeChangeAuthor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(CONTROL_BYTE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_CHANGE_AUTHOR_LENGTH
    ? cleaned.slice(0, MAX_CHANGE_AUTHOR_LENGTH)
    : cleaned;
}

/**
 * Coerce a timestamp to a finite, non-negative integer (epoch millis) or null.
 * Rejects NaN/Infinity/negatives and non-numeric strings so the rendered
 * data-attribute is always a clean integer the toolbar can reason about.
 */
export function sanitizeChangeTimestamp(value: unknown): number | null {
  let n: number | null = null;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    n = Number(value);
  }
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * Canonicalize the attribute bag both marks carry. Used by the marks'
 * parseHTML/renderHTML and by setSuggesting when stamping a tracked change, so
 * the same scrub applies on every edge (incoming HTML, outgoing HTML, and live
 * authoring).
 */
export function normalizeChangeAttrs(value: unknown): ChangeAttrs {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const revisionId = sanitizeRevisionId(record.revisionId);
  const rawMoveId =
    typeof record.moveId === "string" &&
    /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/.test(record.moveId.trim())
      ? record.moveId.trim()
      : null;
  const rawMoveRole =
    record.moveRole === "from" || record.moveRole === "to"
      ? record.moveRole
      : null;
  const rawMoveRangeId = sanitizeRevisionId(record.moveRangeId);
  const completeMove = Boolean(
    revisionId && rawMoveId && rawMoveRole && rawMoveRangeId,
  );
  return {
    author: sanitizeChangeAuthor(record.author),
    timestamp: sanitizeChangeTimestamp(record.timestamp),
    revisionId,
    moveId: completeMove ? rawMoveId : null,
    moveRole: completeMove ? rawMoveRole : null,
    moveRangeId: completeMove ? rawMoveRangeId : null,
  };
}

const REVISION_ID_RE = /^[0-9]{1,10}$/;
const MAX_FORMAT_AUTHORITY_JSON_LENGTH = 8_192;

function sanitizeRevisionId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    value = String(value);
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return REVISION_ID_RE.test(normalized) ? normalized : null;
}

function boundedJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === undefined) return undefined;
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === "string") {
    return value.length <= 512 ? value : undefined;
  }
  if (Array.isArray(value)) {
    if (value.length > 64) return undefined;
    const next: unknown[] = [];
    for (const item of value) {
      const normalized = boundedJsonValue(item, depth + 1);
      if (normalized === undefined) return undefined;
      next.push(normalized);
    }
    return next;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 32) return undefined;
    const next: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      // A key with no value is no key, as JSON has it: a live mark's attrs
      // carry such keys, and the format revision a toolbar command had just
      // recorded read as invalid -- the Reviewing pane showed 0 until a reload
      // (where the JSON round trip had dropped them) listed it (WUA 130).
      if (item === undefined) continue;
      if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key)) return undefined;
      const normalized = boundedJsonValue(item, depth + 1);
      if (normalized === undefined) return undefined;
      next[key] = normalized;
    }
    return next;
  }
  return undefined;
}

export function normalizeFormatMarkSnapshots(
  value: unknown,
): TrackedFormatMarkSnapshot[] | null {
  if (
    !Array.isArray(value) ||
    value.length > TRACKED_FORMAT_MARK_NAMES.size + SNAPSHOT_ONLY_FORMAT_MARK_NAMES.size
  ) {
    return null;
  }
  const seen = new Set<string>();
  const snapshots: TrackedFormatMarkSnapshot[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (
      typeof record.type !== "string" ||
      !(
        TRACKED_FORMAT_MARK_NAMES.has(record.type) ||
        SNAPSHOT_ONLY_FORMAT_MARK_NAMES.has(record.type)
      ) ||
      seen.has(record.type)
    ) {
      return null;
    }
    seen.add(record.type);
    const attrs =
      record.attrs === undefined
        ? undefined
        : boundedJsonValue(record.attrs, 0);
    if (
      record.attrs !== undefined &&
      (!attrs || Array.isArray(attrs) || typeof attrs !== "object")
    ) {
      return null;
    }
    snapshots.push({
      type: record.type,
      ...(attrs ? { attrs: attrs as Record<string, unknown> } : {}),
    });
  }
  return JSON.stringify(snapshots).length <= MAX_FORMAT_AUTHORITY_JSON_LENGTH
    ? snapshots
    : null;
}

export function normalizeParagraphFormatSnapshot(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) => !PARAGRAPH_FORMAT_SNAPSHOT_KEYS.includes(key),
    )
  ) {
    return null;
  }
  const normalized: Record<string, unknown> = {};
  for (const key of PARAGRAPH_FORMAT_SNAPSHOT_KEYS) {
    if (!(key in source)) continue;
    if (key === PARAGRAPH_FORMAT_RECORDED_NUMBERING_KEY) {
      const numbering = normalizeRecordedParagraphNumbering(source[key]);
      if (!numbering) return null;
      normalized[key] = numbering;
      continue;
    }
    const next = boundedJsonValue(source[key]);
    if (next === undefined) return null;
    if (
      key === PARAGRAPH_FORMAT_HEADING_LEVEL_KEY &&
      !(typeof next === "number" && Number.isInteger(next) && next >= 0 && next <= 6)
    ) {
      return null;
    }
    if (key === PARAGRAPH_FORMAT_LIST_LEVEL_KEY && next !== 0) return null;
    normalized[key] = next;
  }
  if (JSON.stringify(normalized).length > MAX_FORMAT_AUTHORITY_JSON_LENGTH) {
    // A long numbering definition on the recorded list is drawn from the
    // gallery instead: the revision itself is kept.
    const numbering = normalized[PARAGRAPH_FORMAT_RECORDED_NUMBERING_KEY] as
      | RecordedParagraphNumbering
      | undefined;
    if (!numbering?.list?.attrs || !("listDefinition" in numbering.list.attrs)) return null;
    const attrs = Object.fromEntries(
      Object.entries(numbering.list.attrs).filter(([key]) => key !== "listDefinition" && key !== "listStyleId"),
    );
    normalized[PARAGRAPH_FORMAT_RECORDED_NUMBERING_KEY] = {
      ...numbering,
      list: { ...numbering.list, attrs },
    };
    if (JSON.stringify(normalized).length > MAX_FORMAT_AUTHORITY_JSON_LENGTH) return null;
  }
  return normalized;
}

function normalizeRecordedParagraphNumbering(value: unknown): RecordedParagraphNumbering | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const { numId, level, list } = source;
  if (Object.keys(source).some((key) => key !== "numId" && key !== "level" && key !== "list")) return null;
  if (typeof numId !== "number" || !Number.isInteger(numId) || numId < 0 || numId > 2147483647) return null;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 8) return null;
  const numbering: RecordedParagraphNumbering = { numId, level };
  if (list === undefined || list === null) return numbering;
  if (numId === 0 || typeof list !== "object" || Array.isArray(list)) return null;
  const { type, attrs } = list as Record<string, unknown>;
  if (Object.keys(list).some((key) => key !== "type" && key !== "attrs")) return null;
  if (type !== "bulletList" && type !== "orderedList") return null;
  if (attrs === undefined || attrs === null) {
    numbering.list = { type };
    return numbering;
  }
  const bounded = boundedJsonValue(attrs);
  if (!bounded || typeof bounded !== "object" || Array.isArray(bounded)) return null;
  numbering.list = { type, attrs: bounded as Record<string, unknown> };
  return numbering;
}

/**
 * The paragraph properties a revision remembers, read off a paragraph or
 * heading: every tracked attribute that differs from its default, plus the
 * heading level (0 for a body paragraph). Word's `w:pPrChange` holds the
 * complete previous `w:pPr` the same way.
 */
export function paragraphFormatSnapshot(
  node: ProseMirrorNode,
): Record<string, unknown> {
  const specAttrs = node.type.spec.attrs ?? {};
  const snapshot: Record<string, unknown> = {};
  for (const key of TRACKED_PARAGRAPH_FORMAT_ATTRS) {
    const value: unknown = node.attrs[key];
    const fallback: unknown = specAttrs[key]?.default ?? null;
    if (value === undefined || JSON.stringify(value) === JSON.stringify(fallback)) {
      continue;
    }
    snapshot[key] = value;
  }
  const level = Number(node.attrs.level);
  snapshot[PARAGRAPH_FORMAT_HEADING_LEVEL_KEY] =
    node.type.name === "heading" && Number.isInteger(level)
      ? Math.min(Math.max(level, 1), 6)
      : 0;
  return snapshot;
}

/** The tracked run formatting a text node wears, as a revision remembers it. */
export function formatMarkSnapshots(
  marks: readonly Mark[],
): TrackedFormatMarkSnapshot[] {
  return marks
    .filter((mark) => TRACKED_FORMAT_MARK_NAMES.has(mark.type.name))
    .map((mark) =>
      Object.keys(mark.attrs).length > 0
        ? { type: mark.type.name, attrs: { ...mark.attrs } }
        : { type: mark.type.name },
    )
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
}

/**
 * A fresh native revision id for a revision recorded in the editor: past
 * every id the document already holds, and clear of the small sequential ids
 * the DOCX writer gives insertions and deletions.
 */
export function nextNativeRevisionId(doc: ProseMirrorNode): string {
  let highest = 99_999;
  const consider = (value: unknown) => {
    const id = Number(sanitizeRevisionId(value));
    if (Number.isSafeInteger(id) && id > highest) highest = id;
  };
  doc.descendants((node) => {
    for (const mark of node.marks) consider(mark.attrs.revisionId);
    const paragraphRevision: unknown = node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR];
    if (paragraphRevision && typeof paragraphRevision === "object") {
      consider((paragraphRevision as Record<string, unknown>).revisionId);
    }
    const scope = tablePropertyRevisionScope(node);
    const tableRevision: unknown = scope ? node.attrs[tablePropertyRevisionAttr(scope)] : null;
    if (tableRevision && typeof tableRevision === "object") {
      consider((tableRevision as Record<string, unknown>).revisionId);
    }
    return true;
  });
  return String(highest + 1);
}

export function normalizeNativeFormatRevisionAuthority(
  value: unknown,
): NativeFormatRevisionAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const revisionId = sanitizeRevisionId(record.revisionId);
  const previousMarks = normalizeFormatMarkSnapshots(record.previousMarks);
  if (!revisionId || !previousMarks) return null;
  return {
    ...normalizeChangeAttrs(record),
    revisionId,
    previousMarks,
  };
}

export function normalizeNativeParagraphFormatRevisionAuthority(
  value: unknown,
): NativeParagraphFormatRevisionAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const revisionId = sanitizeRevisionId(record.revisionId);
  const previousAttrs = normalizeParagraphFormatSnapshot(record.previousAttrs);
  if (!revisionId || !previousAttrs) return null;
  return {
    ...normalizeChangeAttrs(record),
    revisionId,
    previousAttrs,
  };
}

function markIsNamed(mark: Mark, name: string): boolean {
  return mark.type.name === name;
}

function nodeHasMark(node: ProseMirrorNode, name: string): boolean {
  return node.marks.some((mark) => markIsNamed(mark, name));
}

/**
 * A contiguous [from, to) document range that carries a given mark on every
 * text node it spans. The runs are returned in document order; non-adjacent
 * occurrences yield separate runs.
 */
export interface MarkRange {
  from: number;
  to: number;
}

/**
 * Collect every contiguous run of text that carries the named mark within
 * [searchFrom, searchTo). Walks the doc with positions so callers can mutate via
 * a Transaction afterward. Runs are merged across adjacent text nodes that share
 * the mark (e.g. the same change split by an unrelated nested mark boundary).
 */
/**
 * A point bookmark inside a tracked change: the text on both sides of it is
 * marked inserted (or deleted). It belongs to that change, so the deletion
 * that is accepted, or the insertion that is rejected, takes it away with the
 * text; the other answer keeps it. Left standing on its own, a point a
 * tracked cut and paste had moved stayed at the old place once the move was
 * accepted (live Word audit WUA 035).
 */
export function isPointInTrackedChange(
  parent: ProseMirrorNode | null | undefined,
  index: number,
  markName: typeof INSERTION_MARK_NAME | typeof DELETION_MARK_NAME,
): boolean {
  const node = parent?.maybeChild(index);
  if (!parent || node?.type.name !== BOOKMARK_POINT_NODE_NAME) return false;
  const changed = (sibling: ProseMirrorNode | null) =>
    Boolean(sibling?.isText && nodeHasMark(sibling, markName));
  return changed(parent.maybeChild(index - 1)) && changed(parent.maybeChild(index + 1));
}

/** {@link isPointInTrackedChange} for a deletion. */
export function isPointInTrackedDeletion(
  parent: ProseMirrorNode | null | undefined,
  index: number,
): boolean {
  return isPointInTrackedChange(parent, index, DELETION_MARK_NAME);
}

export function collectMarkRanges(
  doc: ProseMirrorNode,
  markName: string,
  searchFrom = 0,
  searchTo: number = doc.content.size,
): MarkRange[] {
  const ranges: MarkRange[] = [];
  let current: MarkRange | null = null;
  doc.nodesBetween(searchFrom, searchTo, (node, pos, parent, index) => {
    const changedPoint =
      (markName === DELETION_MARK_NAME || markName === INSERTION_MARK_NAME) &&
      isPointInTrackedChange(parent, index, markName);
    const isEligible =
      node.isText ||
      changedPoint ||
      (markName === INSERTION_MARK_NAME && supportsTrackedInsertion(node));
    if (!isEligible) {
      // Unsupported atoms and block boundaries break contiguity. Insertion
      // revisions may span the closed inline-atom set above; deletions may not.
      if (current) {
        ranges.push(current);
        current = null;
      }
      return true;
    }
    const start = Math.max(pos, searchFrom);
    const end = Math.min(pos + node.nodeSize, searchTo);
    if (end <= start) return true;
    if (changedPoint || nodeHasMark(node, markName)) {
      if (current && current.to === start) {
        current.to = end;
      } else {
        if (current) ranges.push(current);
        current = { from: start, to: end };
      }
    } else if (current) {
      ranges.push(current);
      current = null;
    }
    return true;
  });
  if (current) ranges.push(current);
  return ranges;
}

interface TrackedContentRange extends MarkRange {
  markName: typeof INSERTION_MARK_NAME | typeof DELETION_MARK_NAME;
  attrs: ChangeAttrs;
}

export interface NativeMoveSegment extends MarkRange {
  role: "from" | "to";
  markName: typeof INSERTION_MARK_NAME | typeof DELETION_MARK_NAME;
  revisionId: string;
  rangeId: string;
}

interface NativeMoveGroup {
  moveId: string;
  author: string | null;
  timestamp: number | null;
  segments: [NativeMoveSegment, NativeMoveSegment];
}

/** Each document's tracked ranges, by mark: a document is immutable, and
 * the review entries, the move pairing and the change bars each walked the
 * whole of it again for the same answer on every transaction (a long book
 * with no revision at all: every block, several times a pagination pass). */
const trackedContentRanges = new WeakMap<ProseMirrorNode, Map<string, readonly TrackedContentRange[]>>();

function collectTrackedContentRanges(
  doc: ProseMirrorNode,
  markName: typeof INSERTION_MARK_NAME | typeof DELETION_MARK_NAME,
): TrackedContentRange[] {
  let byMark = trackedContentRanges.get(doc);
  if (!byMark) trackedContentRanges.set(doc, (byMark = new Map()));
  let ranges = byMark.get(markName);
  if (!ranges) byMark.set(markName, (ranges = scanTrackedContentRanges(doc, markName)));
  // Each caller gets ranges of its own.
  return ranges.map((range) => ({ ...range }));
}

/** Whether a node holds the mark anywhere in it, by node: a page or a
 * paragraph the pages did not change is not looked through again. */
const holdsMark = {
  [INSERTION_MARK_NAME]: new WeakMap<ProseMirrorNode, boolean>(),
  [DELETION_MARK_NAME]: new WeakMap<ProseMirrorNode, boolean>(),
} as const;

function nodeHoldsMark(node: ProseMirrorNode, markName: typeof INSERTION_MARK_NAME | typeof DELETION_MARK_NAME): boolean {
  if (node.isText) return node.marks.some((mark) => mark.type.name === markName);
  const memo = holdsMark[markName];
  const known = memo.get(node);
  if (known !== undefined) return known;
  let holds = node.marks.some((mark) => mark.type.name === markName);
  if (!holds) {
    node.forEach((child) => {
      if (!holds && nodeHoldsMark(child, markName)) holds = true;
    });
  }
  memo.set(node, holds);
  return holds;
}

function scanTrackedContentRanges(
  doc: ProseMirrorNode,
  markName: typeof INSERTION_MARK_NAME | typeof DELETION_MARK_NAME,
): TrackedContentRange[] {
  const ranges: TrackedContentRange[] = [];
  let current: (TrackedContentRange & { key: string }) | null = null;
  doc.descendants((node, pos, parent, index) => {
    // A block holding no such change: entering it ends the range open
    // before it, and nothing inside it starts one.
    if (!node.isText && !node.isInline && !nodeHoldsMark(node, markName) &&
        !(markName === INSERTION_MARK_NAME && supportsTrackedInsertion(node))) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      return false;
    }
    // A point bookmark inside a change runs on with it (WUA 035).
    if (current && current.to === pos && isPointInTrackedChange(parent, index, markName)) {
      current.to = pos + node.nodeSize;
      return false;
    }
    const eligible =
      node.isText ||
      (markName === INSERTION_MARK_NAME && supportsTrackedInsertion(node));
    if (!eligible) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      return true;
    }
    const mark = node.marks.find(
      (candidate) => candidate.type.name === markName,
    );
    if (!mark) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      return false;
    }
    const attrs = normalizeChangeAttrs(mark.attrs);
    const key = JSON.stringify(attrs);
    const to = pos + node.nodeSize;
    if (current && current.to === pos && current.key === key) {
      current.to = to;
    } else {
      if (current) ranges.push(current);
      current = { from: pos, to, markName, attrs, key };
    }
    return false;
  });
  if (current) ranges.push(current);
  return ranges;
}

/**
 * Authenticate Word moves at the editor edge. A native move is exposed as one
 * review record only when there is exactly one `from` deletion and one `to`
 * insertion carrying the same bounded move id, author and timestamp. Any
 * duplicate, missing or contradictory endpoint deliberately remains two normal
 * revisions, so imported/forged partial XML can never gain paired authority.
 */
function collectNativeMoveGroups(doc: ProseMirrorNode): NativeMoveGroup[] {
  const candidates = [
    ...collectTrackedContentRanges(doc, DELETION_MARK_NAME),
    ...collectTrackedContentRanges(doc, INSERTION_MARK_NAME),
  ].filter(
    (range) =>
      range.attrs.moveId !== null &&
      range.attrs.moveRole !== null &&
      range.attrs.revisionId !== null &&
      range.attrs.moveRangeId !== null &&
      ((range.markName === DELETION_MARK_NAME &&
        range.attrs.moveRole === "from") ||
        (range.markName === INSERTION_MARK_NAME &&
          range.attrs.moveRole === "to")),
  );
  const byId = new Map<string, TrackedContentRange[]>();
  for (const range of candidates) {
    const id = range.attrs.moveId!;
    byId.set(id, [...(byId.get(id) ?? []), range]);
  }
  const groups: NativeMoveGroup[] = [];
  for (const [moveId, ranges] of byId) {
    if (ranges.length !== 2) continue;
    const from = ranges.find((range) => range.attrs.moveRole === "from");
    const to = ranges.find((range) => range.attrs.moveRole === "to");
    if (
      !from ||
      !to ||
      from.attrs.author !== to.attrs.author ||
      from.attrs.timestamp !== to.attrs.timestamp ||
      from.attrs.revisionId === to.attrs.revisionId ||
      from.attrs.moveRangeId === to.attrs.moveRangeId
    ) {
      continue;
    }
    groups.push({
      moveId,
      author: from.attrs.author,
      timestamp: from.attrs.timestamp,
      segments: [
        {
          from: from.from,
          to: from.to,
          role: "from",
          markName: DELETION_MARK_NAME,
          revisionId: from.attrs.revisionId!,
          rangeId: from.attrs.moveRangeId!,
        },
        {
          from: to.from,
          to: to.to,
          role: "to",
          markName: INSERTION_MARK_NAME,
          revisionId: to.attrs.revisionId!,
          rangeId: to.attrs.moveRangeId!,
        },
      ],
    });
  }
  return groups.sort(
    (a, b) =>
      Math.min(...a.segments.map((segment) => segment.from)) -
      Math.min(...b.segments.map((segment) => segment.from)),
  );
}

function nativeMoveAt(
  doc: ProseMirrorNode,
  pos: number,
): NativeMoveGroup | null {
  return (
    collectNativeMoveGroups(doc).find((group) =>
      group.segments.some(
        (segment) => pos >= segment.from && pos <= segment.to,
      ),
    ) ?? null
  );
}

function resolveNativeMove(
  tr: Transaction,
  group: NativeMoveGroup,
  resolution: "accept" | "reject",
): boolean {
  const { insertion, deletion } = trackMarkTypes(tr.doc);
  if (!insertion || !deletion) return false;
  const operations = group.segments
    .map((segment) => ({
      ...segment,
      delete:
        resolution === "accept"
          ? segment.role === "from"
          : segment.role === "to",
    }))
    .sort((a, b) => b.from - a.from || b.to - a.to);
  for (const operation of operations) {
    if (operation.delete) {
      tr.delete(operation.from, operation.to);
    } else {
      tr.removeMark(
        operation.from,
        operation.to,
        operation.role === "from" ? deletion : insertion,
      );
    }
  }
  return true;
}

interface FormatRevisionRange extends MarkRange {
  authority: NativeFormatRevisionAuthority;
}

interface ParagraphFormatRevisionRange extends MarkRange {
  nodePos: number;
  authority: NativeParagraphFormatRevisionAuthority;
}

function collectFormatRevisionRanges(
  doc: ProseMirrorNode,
): FormatRevisionRange[] {
  const ranges: FormatRevisionRange[] = [];
  let current: (FormatRevisionRange & { key: string }) | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      return true;
    }
    const mark = node.marks.find(
      (candidate) => candidate.type.name === FORMAT_REVISION_MARK_NAME,
    );
    const authority = mark
      ? normalizeNativeFormatRevisionAuthority(mark.attrs)
      : null;
    if (!authority) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      return false;
    }
    const key = JSON.stringify(authority);
    const to = pos + node.nodeSize;
    if (current && current.to === pos && current.key === key) {
      current.to = to;
    } else {
      if (current) ranges.push(current);
      current = { from: pos, to, authority, key };
    }
    return false;
  });
  if (current) ranges.push(current);
  return ranges;
}

function collectParagraphFormatRevisionRanges(
  doc: ProseMirrorNode,
): ParagraphFormatRevisionRange[] {
  const ranges: ParagraphFormatRevisionRange[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph" && node.type.name !== "heading") {
      return true;
    }
    const authority = normalizeNativeParagraphFormatRevisionAuthority(
      node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR],
    );
    if (authority) {
      ranges.push({
        nodePos: pos,
        from: pos + 1,
        to: Math.max(pos + 2, pos + node.nodeSize - 1),
        authority,
      });
    }
    return false;
  });
  return ranges;
}

/** The list item type a paragraph at `pos` sits in directly, or null. */
function enclosingListItemType(
  doc: ProseMirrorNode,
  pos: number,
): ProseMirrorNode["type"] | null {
  const $pos = doc.resolve(Math.min(pos + 1, doc.content.size));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "listItem" || node.type.name === "taskItem") return node.type;
    if (node.type.spec.tableRole !== undefined) return null;
  }
  return null;
}

/**
 * Take the paragraph at `nodePos` out of every list it is in, as Bullets
 * pressed again does. Each lift runs on a state of its own: the library's
 * lift checks its range against the whole transaction's mapping and refuses
 * one with earlier steps. Returns the paragraph's new position.
 */
export function liftParagraphOutOfLists(tr: Transaction, nodePos: number): number {
  let pos = nodePos;
  for (let guard = 0; guard < 10; guard += 1) {
    const itemType = enclosingListItemType(tr.doc, pos);
    if (!itemType) break;
    let lifted: Transaction | null = null;
    try {
      const state = EditorState.create({
        doc: tr.doc,
        selection: TextSelection.create(tr.doc, pos + 1),
      });
      liftListItem(itemType)(state, (next) => {
        lifted = next;
      });
    } catch {
      break;
    }
    const steps = (lifted as Transaction | null)?.steps ?? [];
    if (steps.length === 0) break;
    const start = tr.mapping.maps.length;
    for (const step of steps) tr.step(step);
    pos = tr.mapping.slice(start).map(pos, 1);
  }
  return pos;
}

/**
 * What Reject does to a paragraph's list membership once its properties are
 * back: take it out of its list (a live list conversion, or recorded numId 0),
 * or put it into the list its recorded numbering draws.
 */
type ParagraphListPutBack = { kind: "lift" } | { kind: "wrap"; numbering: RecordedParagraphNumbering };

function clearParagraphFormatRevision(
  tr: Transaction,
  nodePos: number,
  previousAttrs?: Record<string, unknown>,
  /** Where a list lift or wrap goes when the caller still has positions to
   * use: it runs them itself, once they are done. */
  deferLift?: (nodePos: number, mappingFrom: number, putBack: ParagraphListPutBack) => void,
): boolean {
  const node = tr.doc.nodeAt(nodePos);
  if (
    !node ||
    (node.type.name !== "paragraph" && node.type.name !== "heading")
  ) {
    return false;
  }
  const authority = normalizeNativeParagraphFormatRevisionAuthority(
    node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR],
  );
  if (!authority) return false;
  const attrs: Record<string, unknown> = { ...node.attrs };
  attrs[PARAGRAPH_FORMAT_REVISION_ATTR] = null;
  let type = node.type;
  let liftOut = false;
  let putBack: ParagraphListPutBack | null = null;
  if (previousAttrs) {
    // Public equivalent of NodeType.defaultAttrs: the schema defaults exist
    // only when no attribute is required.
    const specAttrs = node.type.hasRequiredAttrs()
      ? undefined
      : node.type.spec.attrs;
    for (const key of TRACKED_PARAGRAPH_FORMAT_ATTRS) {
      attrs[key] = specAttrs?.[key]?.default ?? null;
    }
    if (!(PARAGRAPH_FORMAT_HEADING_LEVEL_KEY in previousAttrs)) {
      // An imported revision: Word's previous pPr, complete.
      for (const key of IMPORTED_PARAGRAPH_FORMAT_ATTRS) {
        if (key in attrs) attrs[key] = specAttrs?.[key]?.default ?? null;
      }
    }
    const {
      [PARAGRAPH_FORMAT_HEADING_LEVEL_KEY]: headingLevel,
      [PARAGRAPH_FORMAT_LIST_LEVEL_KEY]: listLevel,
      [PARAGRAPH_FORMAT_RECORDED_NUMBERING_KEY]: recordedNumbering,
      ...previous
    } = previousAttrs;
    liftOut = listLevel === 0;
    if (!liftOut && typeof headingLevel !== "number" && !recordedNumberingOff()) {
      const numbering = normalizeRecordedParagraphNumbering(recordedNumbering);
      if (numbering?.numId === 0) liftOut = true;
      else if (numbering?.list) putBack = { kind: "wrap", numbering };
    }
    Object.assign(attrs, previous);
    // A live-recorded revision knows whether the paragraph was a heading.
    if (typeof headingLevel === "number") {
      const nodes = tr.doc.type.schema.nodes;
      const previousType = headingLevel > 0 ? nodes.heading : nodes.paragraph;
      if (previousType) {
        type = previousType;
        if (headingLevel > 0) attrs.level = headingLevel;
      }
    } else {
      const restyled = importedRevisionRestyle(tr, node, attrs);
      if (restyled) {
        tr.setNodeMarkup(nodePos, restyled.type, restyled.attrs, node.marks);
        restyleInheritedToggles(tr, nodePos, node);
        settleParagraphListMembership(tr, nodePos, liftOut ? { kind: "lift" } : putBack, deferLift);
        return true;
      }
    }
  }
  tr.setNodeMarkup(nodePos, type, attrs, node.marks);
  settleParagraphListMembership(tr, nodePos, liftOut ? { kind: "lift" } : putBack, deferLift);
  return true;
}

/** `window.__docsRecordedNumberingOff`: Reject leaves list membership to the
 * live-recorded list conversion alone (the A/B arm). */
function recordedNumberingOff(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __docsRecordedNumberingOff?: unknown }).__docsRecordedNumberingOff === true
  );
}

function settleParagraphListMembership(
  tr: Transaction,
  nodePos: number,
  putBack: ParagraphListPutBack | null,
  deferLift?: (nodePos: number, mappingFrom: number, putBack: ParagraphListPutBack) => void,
): void {
  if (!putBack) return;
  if (deferLift) deferLift(nodePos, tr.mapping.maps.length, putBack);
  else if (putBack.kind === "lift") liftParagraphOutOfLists(tr, nodePos);
  else wrapParagraphInRecordedList(tr, nodePos, putBack.numbering);
}

/**
 * Put a body paragraph that is in no list into the list its rejected
 * revision's recorded numbering draws (one list item in a wrapper of the
 * recorded type and attributes), joined to the list just after it when that
 * one was put back from the same numbering (Word's consecutive paragraphs of
 * one w:numId are one list). A heading, a paragraph already in a list, or a
 * place the schema holds no list leave the paragraph as it is. Returns the
 * wrapper's position, or null.
 */
export function wrapParagraphInRecordedList(
  tr: Transaction,
  nodePos: number,
  numbering: RecordedParagraphNumbering,
  /** The list put back just before, at `pos` once `mapped` maps were made. */
  joinWith?: { pos: number; mapped: number; numbering: RecordedParagraphNumbering } | null,
): number | null {
  const node = tr.doc.nodeAt(nodePos);
  const list = numbering.list;
  if (!node || node.type.name !== "paragraph" || !list) return null;
  if (enclosingListItemType(tr.doc, nodePos)) return null;
  const schema = tr.doc.type.schema;
  const listType = schema.nodes[list.type];
  const itemType = schema.nodes.listItem;
  if (!listType || !itemType) return null;
  const known = listType.spec.attrs ?? {};
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(list.attrs ?? {})) {
    if (key in known) attrs[key] = value;
  }
  const $from = tr.doc.resolve(nodePos + 1);
  const range = $from.blockRange(tr.doc.resolve(nodePos + node.nodeSize - 1));
  if (!range || range.startIndex + 1 !== range.endIndex) return null;
  let wrapper: ProseMirrorNode;
  try {
    wrapper = listType.create(attrs, itemType.create(null, node));
  } catch {
    return null;
  }
  if (!range.parent.canReplaceWith(range.startIndex, range.endIndex, wrapper.type)) return null;
  if (!wrapper.type.validContent(wrapper.content) || !itemType.validContent(Fragment.from(node))) return null;
  try {
    tr.wrap(range, [
      { type: listType, attrs },
      { type: itemType },
    ]);
  } catch {
    return null;
  }
  const listPos = nodePos;
  if (joinWith) {
    const after = listPos + (tr.doc.nodeAt(listPos)?.nodeSize ?? 0);
    const next = tr.doc.nodeAt(after);
    if (
      after === tr.mapping.slice(joinWith.mapped).map(joinWith.pos, 1) &&
      next?.type === listType &&
      joinWith.numbering.numId === numbering.numId &&
      joinWith.numbering.level === numbering.level &&
      JSON.stringify(next.attrs) === JSON.stringify(tr.doc.nodeAt(listPos)?.attrs) &&
      canJoin(tr.doc, after)
    ) {
      tr.join(after);
    }
  }
  return listPos;
}

/**
 * An imported paragraph revision (Word's `w:pPrChange`) that puts back another
 * paragraph style: whether the paragraph is a heading follows the style it
 * returns to, as when the file is read (the style's heading name or outline
 * level, along `w:basedOn`). Rejecting "Heading 1, was Keywords" leaves a
 * Keywords paragraph, not a heading in the Keywords style; rejecting
 * "Figure caption, was MDPI heading 1" leaves a heading (corpus R490-D02 /
 * R491-D02 E43: the saved file read back as a paragraph / heading the page
 * did not show). Null when the style does not change, the document has no
 * style definitions, or the paragraph's present type is not the one its
 * present style reads as (its heading level came from elsewhere).
 */
function importedRevisionRestyle(
  tr: Transaction,
  node: ProseMirrorNode,
  attrs: Record<string, unknown>,
): { type: ProseMirrorNode["type"]; attrs: Record<string, unknown> } | null {
  const before = node.attrs.docxStyleId ?? null;
  const after = attrs.docxStyleId ?? null;
  if (before === after) return null;
  const definitions = (tr.doc.attrs as { styleDefinitions?: { styles?: unknown } }).styleDefinitions;
  const styles = Array.isArray(definitions?.styles) ? (definitions.styles as unknown[]) : [];
  const levels = wordStyleHeadingLevels(styles);
  if (levels.size === 0) return null;
  const defaultStyle = styles.find(
    (style): style is { styleId: string } =>
      !!style &&
      typeof style === "object" &&
      (style as Record<string, unknown>).type === "paragraph" &&
      (style as Record<string, unknown>).default === true &&
      typeof (style as Record<string, unknown>).styleId === "string",
  );
  const levelOf = (styleId: unknown): number | null | undefined => {
    const id = typeof styleId === "string" && styleId ? styleId : defaultStyle?.styleId;
    return id === undefined ? undefined : levels.get(id);
  };
  const levelBefore = levelOf(before);
  const levelAfter = levelOf(after);
  if (levelBefore === undefined || levelAfter === undefined) return null;
  const headingBefore = node.type.name === "heading";
  if (headingBefore !== (levelBefore !== null)) return null;
  if (headingBefore && Number(node.attrs.level) !== levelBefore) return null;
  const nodes = tr.doc.type.schema.nodes;
  const type = levelAfter !== null ? nodes.heading : nodes.paragraph;
  if (!type) return null;
  return {
    type,
    attrs: levelAfter !== null ? { ...attrs, level: levelAfter } : attrs,
  };
}

/**
 * The bold and italic a paragraph's runs take from its style, written as the
 * reader writes them once the paragraph is restyled by
 * {@link importedRevisionRestyle}: in a heading, a run without direct bold
 * carries the bold mark stating no value (`{value: null}`); in body text the
 * style's bold is a plain bold mark, and an italic style's italic is a plain
 * italic mark in either. The old style's leave with it (as Home > Styles
 * drops them, WUA 150) and the new style's come; a direct format (`value`
 * true or false) stays, and nothing is changed where a style's look is not
 * known.
 */
function restyleInheritedToggles(
  tr: Transaction,
  nodePos: number,
  before: ProseMirrorNode,
  limit = Number.POSITIVE_INFINITY,
): void {
  const node = tr.doc.nodeAt(nodePos);
  if (!node) return;
  const docAttrs = tr.doc.attrs as Record<string, unknown>;
  const heading = node.type.name === "heading";
  const headingBefore = before.type.name === "heading";
  const edits: Array<{ from: number; to: number; mark: Mark | null; drop: Mark | null }> = [];
  for (const [name, inherited] of [
    ["bold", inheritedBoldValue],
    ["italic", inheritedItalicValue],
  ] as const) {
    const type = tr.doc.type.schema.marks[name];
    if (!type) continue;
    node.forEach((child, offset) => {
      if (!child.isText || offset >= limit) return;
      const from = nodePos + 1 + offset;
      const to = nodePos + 1 + Math.min(offset + child.nodeSize, limit);
      const mark = child.marks.find((entry) => entry.type === type) ?? null;
      const was = inherited(docAttrs, before, child.marks);
      const now = inherited(docAttrs, node, child.marks);
      if (name === "bold" && heading) {
        // In a heading no direct bold states inheritance.
        if (!mark || mark.attrs.value === undefined) {
          edits.push({ from, to, mark: type.create({ value: null }), drop: mark });
        }
        return;
      }
      if (name === "bold" && headingBefore) {
        if (mark && mark.attrs.value === null && now !== null) {
          edits.push({ from, to, mark: now ? type.create() : null, drop: mark });
        } else if (!mark && now === true) {
          edits.push({ from, to, mark: type.create(), drop: null });
        }
        return;
      }
      if (mark && mark.attrs.value === undefined && was === true && now === false) {
        edits.push({ from, to, mark: null, drop: mark });
      } else if (!mark && was === false && now === true) {
        edits.push({ from, to, mark: type.create(), drop: null });
      }
    });
  }
  for (const edit of edits) {
    if (edit.drop) tr.removeMark(edit.from, edit.to, edit.drop);
    if (edit.mark) tr.addMark(edit.from, edit.to, edit.mark);
  }
}

/** The paragraph revision id of the paragraph or heading around `pos`. */
function paragraphRevisionIdAt(
  doc: ProseMirrorNode,
  pos: number,
): string | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      return (
        normalizeNativeParagraphFormatRevisionAuthority(
          node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR],
        )?.revisionId ?? null
      );
    }
  }
  return null;
}

/**
 * A run-format revision recorded with its paragraph's revision (same id): the
 * run formatting a paragraph style writes as marks here (a heading's size
 * and colour), which Word keeps in the style itself. It is part of that one
 * paragraph change: listed, accepted and rejected with it.
 */
function isParagraphLinkedRunRevision(
  doc: ProseMirrorNode,
  range: FormatRevisionRange,
): boolean {
  const id = range.authority.revisionId;
  return id !== null && paragraphRevisionIdAt(doc, range.from) === id;
}

function linkedRunRevisionsIn(
  doc: ProseMirrorNode,
  nodePos: number,
): FormatRevisionRange[] {
  const node = doc.nodeAt(nodePos);
  if (!node) return [];
  const end = nodePos + node.nodeSize;
  return collectFormatRevisionRanges(doc).filter(
    (range) =>
      range.from > nodePos &&
      range.to < end &&
      isParagraphLinkedRunRevision(doc, range),
  );
}

function restoreRunFormatRevision(
  tr: Transaction,
  range: FormatRevisionRange,
): boolean {
  const formatType = tr.doc.type.schema.marks[FORMAT_REVISION_MARK_NAME];
  if (!formatType) return false;
  const restoredMarks: Mark[] = [];
  for (const snapshot of range.authority.previousMarks) {
    const type = tr.doc.type.schema.marks[snapshot.type];
    if (!type) return false;
    try {
      restoredMarks.push(type.create(snapshot.attrs));
    } catch {
      return false;
    }
  }
  for (const name of TRACKED_FORMAT_MARK_NAMES) {
    const type = tr.doc.type.schema.marks[name];
    if (type) tr.removeMark(range.from, range.to, type);
  }
  for (const snapshot of range.authority.previousMarks) {
    if (!SNAPSHOT_ONLY_FORMAT_MARK_NAMES.has(snapshot.type)) continue;
    const type = tr.doc.type.schema.marks[snapshot.type];
    if (type) tr.removeMark(range.from, range.to, type);
  }
  tr.removeMark(range.from, range.to, formatType);
  for (const mark of restoredMarks) {
    tr.addMark(range.from, range.to, mark);
  }
  return true;
}

/**
 * Does the doc contain ANY tracked change? Used to gate
 * the toolbar's Accept/Reject controls so they only light up for a document that
 * actually has suggestions.
 */
/**
 * A tracked PARAGRAPH MARK: the paragraph itself was inserted or deleted,
 * not only its words (Word: `w:pPr/w:rPr/w:ins|w:del`; what Compare and
 * Combine record for a paragraph only one version has). Its words carry the
 * ordinary insertion / deletion marks; the attribute decides what becomes of
 * the paragraph once they are resolved -- rejecting an inserted paragraph or
 * accepting a deleted one removes the paragraph, the other two keep it.
 */
export const PARAGRAPH_MARK_REVISION_ATTR = "trackParagraphMark";

export interface ParagraphMarkRevision {
  kind: "ins" | "del";
  author: string | null;
  timestamp: number | null;
}

export function normalizeParagraphMarkRevision(value: unknown): ParagraphMarkRevision | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "ins" && raw.kind !== "del") return null;
  return {
    kind: raw.kind,
    author: sanitizeChangeAuthor(raw.author),
    timestamp: sanitizeChangeTimestamp(raw.timestamp),
  };
}

/**
 * Paragraph marks under revision whose paragraph has no word of the same
 * revision left: a review item of their own (a ¶ Word lists as "Inserted:
 * Paragraph Mark"). A mark whose paragraph still holds inserted / deleted
 * words is settled with those words and is not listed twice.
 */
export function standaloneParagraphMarkRevisions(
  doc: ProseMirrorNode,
): Array<{ pos: number; node: ProseMirrorNode; revision: ParagraphMarkRevision }> {
  const found: Array<{ pos: number; node: ProseMirrorNode; revision: ParagraphMarkRevision }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph" && node.type.name !== "heading") return true;
    const revision = normalizeParagraphMarkRevision(node.attrs[PARAGRAPH_MARK_REVISION_ATTR]);
    if (!revision) return false;
    const markName = revision.kind === "ins" ? INSERTION_MARK_NAME : DELETION_MARK_NAME;
    let pending = false;
    node.descendants((child) => {
      if (nodeHasMark(child, markName)) pending = true;
      return !pending;
    });
    if (!pending) found.push({ pos, node, revision });
    return false;
  });
  return found;
}

/**
 * Settle the paragraph marks whose words have been resolved: after `mode`,
 * a paragraph with no revision mark of its kind left is either removed
 * (rejecting an insertion, accepting a deletion -- when nothing else is left
 * in it) or simply loses the attribute. `within` limits it to one range (a
 * single change); all of them otherwise.
 */
export function resolveParagraphMarkRevisions(
  tr: Transaction,
  mode: "accept" | "reject",
  within?: { from: number; to: number },
): boolean {
  const found: Array<{ pos: number; revision: ParagraphMarkRevision }> = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph" && node.type.name !== "heading") return true;
    const revision = normalizeParagraphMarkRevision(node.attrs[PARAGRAPH_MARK_REVISION_ATTR]);
    if (!revision) return false;
    if (within && (pos + node.nodeSize < within.from || pos > within.to)) return false;
    found.push({ pos, revision });
    return false;
  });
  let changed = false;
  for (const { pos, revision } of found.reverse()) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    const markName = revision.kind === "ins" ? INSERTION_MARK_NAME : DELETION_MARK_NAME;
    let pending = false;
    node.descendants((child) => {
      if (nodeHasMark(child, markName)) pending = true;
      return !pending;
    });
    if (pending) continue;
    const removes =
      (revision.kind === "ins" && mode === "reject") ||
      (revision.kind === "del" && mode === "accept");
    const $pos = tr.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    const boundary = pos + node.nodeSize;
    const next = removes ? tr.doc.nodeAt(boundary) : null;
    const emptyItem = removes && holdsNoContent(node) ? emptyListItemAround(tr.doc, pos, node) : null;
    if (removes && holdsNoContent(node) && parent.canReplace(index, index + 1)) {
      tr.delete(pos, pos + node.nodeSize);
    } else if (emptyItem) {
      // The only paragraph of a list item, emptied by the rejection: Word
      // removes the paragraph -- the item, numbered or bulleted, is gone, and
      // the list with it when that was its only item (R456-D10 E43: eleven
      // inserted objectives, each its own one-item list, were left as empty
      // numbered items; their mark and format revisions with them).
      tr.delete(emptyItem.from, emptyItem.to);
    } else if (removes && next?.isTextblock && canJoin(tr.doc, boundary)) {
      // The paragraph mark itself goes: the paragraph runs on into the next
      // one, which keeps ITS mark -- the merged paragraph has the following
      // paragraph's properties, as in Word (OFL-009: the boundary of a
      // non-empty paragraph was kept and only the attribute cleared).
      tr.join(boundary);
      tr.setNodeMarkup(pos, next.type, next.attrs, tr.doc.nodeAt(pos)?.marks);
      // Its words take the following paragraph's style, as in Word (its
      // final view of a deleted mark draws the "ALPHA" of a bold Heading 1
      // regular beside the Normal paragraph it joined, and "gamma" of a
      // Normal paragraph bold in the Heading 1 after it; work-I/out34/truth/
      // delmark): the bold and italic the old style gave them leave with it.
      // The heading's own words kept the heading's inherited bold (value
      // null) in a clause paragraph, where the writer wrote none (corpus
      // R491-D27 E43: "Es wird die Anwendung deutschen Rechts").
      restyleInheritedToggles(tr, pos, node, node.content.size);
    } else if (removes && node.content.size > 0 && followingListItemParagraph(tr.doc, pos, node)) {
      // The last paragraph of a list item: it runs on into the next item's
      // first paragraph, as Backspace there does in Word, and the merged
      // paragraph is that item's (AI70H h81 C05: two claims joined).
      const following = followingListItemParagraph(tr.doc, pos, node)!;
      tr.delete(pos + node.nodeSize - 1, following.pos + 1);
      tr.setNodeMarkup(pos, following.node.type, following.node.attrs, tr.doc.nodeAt(pos)?.marks);
      restyleInheritedToggles(tr, pos, node, node.content.size);
    } else {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, [PARAGRAPH_MARK_REVISION_ATTR]: null });
    }
    changed = true;
  }
  return changed;
}

/** Nothing left in the paragraph but where Word's last layout broke its page
 * (``sourcePageBreak``, w:lastRenderedPageBreak): a cache of the old layout,
 * no content of the paragraph (R456-D10 E43: an inserted objective that had
 * crossed a page kept its marker, and with it an empty numbered item). */
function holdsNoContent(node: ProseMirrorNode): boolean {
  let content = false;
  node.forEach((child) => {
    if (child.type.name !== "sourcePageBreak") content = true;
  });
  return !content;
}

/** The range to delete for an empty paragraph whose mark goes when it is the
 * only content of its list item: the item, or the whole list when the item is
 * its only one and the list's parent can do without it. */
function emptyListItemAround(
  doc: ProseMirrorNode, pos: number, node: ProseMirrorNode,
): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const item = $pos.parent;
  if (!/listItem|taskItem/.test(item.type.name) || item.childCount !== 1 || $pos.depth < 2) return null;
  if (item.firstChild !== node) return null;
  const itemPos = $pos.before();
  const list = $pos.node($pos.depth - 1);
  const itemIndex = $pos.index($pos.depth - 1);
  if (list.childCount > 1) {
    return list.canReplace(itemIndex, itemIndex + 1) ? { from: itemPos, to: itemPos + item.nodeSize } : null;
  }
  const listPos = $pos.before($pos.depth - 1);
  const container = $pos.node($pos.depth - 2);
  const listIndex = $pos.index($pos.depth - 2);
  return container.canReplace(listIndex, listIndex + 1) ? { from: listPos, to: listPos + list.nodeSize } : null;
}

/** The first paragraph of the list item after the one whose last paragraph
 * is at `pos`, when the two items are siblings in one list. */
function followingListItemParagraph(
  doc: ProseMirrorNode, pos: number, node: ProseMirrorNode,
): { pos: number; node: ProseMirrorNode } | null {
  const $end = doc.resolve(pos + node.nodeSize);
  const item = $end.parent;
  if (!/listItem|taskItem/.test(item.type.name) || $end.pos !== $end.end()) return null;
  const nextItemPos = $end.after();
  const nextItem = doc.nodeAt(nextItemPos);
  if (!nextItem || nextItem.type !== item.type) return null;
  const first = nextItem.firstChild;
  if (!first?.isTextblock) return null;
  return { pos: nextItemPos + 1, node: first };
}

/** Accept or reject the standalone paragraph mark at `pos` (its list item's `from`). */
function resolveStandaloneParagraphMarkAt(
  tr: Transaction,
  pos: number,
  mode: "accept" | "reject",
): boolean {
  const mark = standaloneParagraphMarkRevisions(tr.doc).find(
    (candidate) => pos >= candidate.pos && pos <= candidate.pos + candidate.node.nodeSize,
  );
  if (!mark) return false;
  return resolveParagraphMarkRevisions(tr, mode, {
    from: mark.pos + mark.node.nodeSize - 1,
    to: mark.pos + mark.node.nodeSize - 1,
  });
}

export function documentHasTrackedChanges(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (
      (supportsTrackedInsertion(node) &&
        nodeHasMark(node, INSERTION_MARK_NAME)) ||
      (node.isText &&
        (nodeHasMark(node, DELETION_MARK_NAME) ||
          nodeHasMark(node, FORMAT_REVISION_MARK_NAME))) ||
      ((node.type.name === "paragraph" || node.type.name === "heading") &&
        (normalizeNativeParagraphFormatRevisionAuthority(
          node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR],
        ) !== null ||
          normalizeParagraphMarkRevision(node.attrs[PARAGRAPH_MARK_REVISION_ATTR]) !== null)) ||
      (node.type.spec.tableRole === "row" &&
        normalizeRowInsertionRevision(node.attrs[ROW_INSERTION_REVISION_ATTR]) !== null) ||
      objectDeletionRevisionOf(node) !== null ||
      objectInsertionRevisionOf(node) !== null ||
      tablePropertyRevisionOf(node) !== null
    ) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * The mark-type objects this doc's schema registers for tracked changes, if any.
 * Returns null entries when a schema does not register a given mark so callers
 * degrade to a no-op rather than throwing.
 */
function trackMarkTypes(doc: ProseMirrorNode) {
  const marks = doc.type.schema.marks;
  return {
    insertion: marks[INSERTION_MARK_NAME] ?? null,
    deletion: marks[DELETION_MARK_NAME] ?? null,
    formatting: marks[FORMAT_REVISION_MARK_NAME] ?? null,
  };
}


/** The doc attribute holding the comment store (commentExtension COMMENT_THREADS_ATTR). */
const COMMENT_STORE_ATTR = "commentThreads";

/** Thread ids the importer gives a Word comment (projection: `wc-<w:id of its root>`). */
const IMPORTED_THREAD_ID_RE = /^wc-/;

interface ReviewDecision {
  decision: "accept" | "reject";
  /** Accept All / Reject All: every revision is settled, a reference's own among them. */
  all: boolean;
}




















function droppingCommentsOfReview(tr: Transaction, review: ReviewDecision, run: () => boolean): boolean {
  const firstStep = tr.steps.length;
  const done = run();
  if (done) settleCommentsOfReview(tr, firstStep, review);
  return done;
}

function settleCommentsOfReview(tr: Transaction, firstStep: number, review: ReviewDecision): void {
  const threads = normalizeCommentThreads(tr.doc.attrs[COMMENT_STORE_ATTR]);
  if (threads.length === 0) return;
  const settledRevisions = new Set<string>();
  const unanchored = new Set<string>();
  const noteRevision = (mark: Mark) => {
    if (mark.type.name !== INSERTION_MARK_NAME && mark.type.name !== DELETION_MARK_NAME) return;
    const revisionId = normalizeChangeAttrs(mark.attrs).revisionId;
    if (revisionId) settledRevisions.add(revisionId);
  };
  for (let index = firstStep; index < tr.steps.length; index += 1) {
    const step = tr.steps[index];
    if (step instanceof RemoveMarkStep) {
      noteRevision(step.mark);
      continue;
    }
    // ReplaceAroundStep is not a ReplaceStep: it rewraps blocks, deletes no words.
    if (!(step instanceof ReplaceStep)) continue;
    const { from, to } = step as ReplaceStep & { from: number; to: number };
    if (to <= from) continue;
    tr.docs[index].nodesBetween(from, to, (node) => {
      for (const mark of node.marks) {
        noteRevision(mark);
        if (mark.type.name !== COMMENT_MARK_NAME) continue;
        const id = sanitizeThreadId(mark.attrs.threadId);
        if (id && !IMPORTED_THREAD_ID_RE.test(id)) unanchored.add(id);
      }
      return true;
    });
  }
  if (unanchored.size > 0) {
    tr.doc.descendants((node) => {
      if (unanchored.size === 0) return false;
      for (const mark of node.marks) {
        if (mark.type.name === COMMENT_MARK_NAME) {
          const id = sanitizeThreadId(mark.attrs.threadId);
          if (id) unanchored.delete(id);
        }
      }
      return true;
    });
  }
  const goes = review.decision === "accept" ? "deletion" : "insertion";
  let next = threads;
  for (const thread of threads) {
    if (unanchored.has(thread.id)) {
      next = removeThread(next, thread.id);
      continue;
    }
    const dropped: number[] = [];
    const cleared: number[] = [];
    thread.comments.forEach((comment, index) => {
      const kind = comment.nativeReference;
      if (!kind) return;
      const revision = comment.nativeReferenceRevision;
      if (!review.all && !(revision && settledRevisions.has(revision))) return;
      (kind === goes ? dropped : cleared).push(index);
    });
    if (dropped[0] === 0) {
      next = removeThread(next, thread.id);
      continue;
    }
    for (const index of [...dropped].reverse()) next = removeReplyAt(next, thread.id, index);
    if (cleared.length > 0) {
      // removeReplyAt keeps the other records as they are: found by identity.
      const settled = new Set(cleared.map((index) => thread.comments[index]));
      next = next.map((candidate) =>
        candidate.id !== thread.id
          ? candidate
          : {
              ...candidate,
              comments: candidate.comments.map((comment) => {
                if (!settled.has(comment)) return comment;
                const rest = { ...comment };
                delete rest.nativeReference;
                delete rest.nativeReferenceRevision;
                return rest;
              }),
            },
      );
    }
  }
  if (next === threads) return;
  const gone = new Set(threads.filter((thread) => !next.some((kept) => kept.id === thread.id)).map((thread) => thread.id));
  if (gone.size > 0) removeCommentAnchors(tr, gone);
  tr.setDocAttribute(COMMENT_STORE_ATTR, next);
}

/**
 * Take the anchors of deleted threads off the words and paragraphs that keep
 * them: a comment mark, or a paragraph's own `commentThreadIds` (a comment
 * Word anchors on the paragraph). Left there, the save's comment plan read
 * an anchor with no thread ("missing_parent") and refused the export.
 */
function removeCommentAnchors(tr: Transaction, gone: ReadonlySet<string>): void {
  const doc = tr.doc;
  doc.descendants((node, pos) => {
    const anchored = node.attrs?.commentThreadIds;
    if (Array.isArray(anchored) && anchored.some((id) => gone.has(id))) {
      const left = anchored.filter((id) => !gone.has(id));
      tr.setNodeAttribute(pos, "commentThreadIds", left.length > 0 ? left : null);
    }
    if (node.isInline) {
      for (const mark of node.marks) {
        if (mark.type.name === COMMENT_MARK_NAME && gone.has(sanitizeThreadId(mark.attrs.threadId) ?? "")) {
          tr.removeMark(pos, pos + node.nodeSize, mark);
        }
      }
    }
    return true;
  });
}

/**
 * Accept every tracked change in the doc, mutating the given Transaction in
 * place. Returns true if anything changed.
 *
 *   - insertion → strip the insertion mark (the text becomes permanent)
 *   - deletion  → delete the tombstoned text
 *
 * Both operations are applied right-to-left (highest document position first) so
 * earlier ranges' positions remain valid as later edits shift the doc — the
 * classic ProseMirror multi-edit ordering rule.
 */
function acceptAllRevisions(tr: Transaction): boolean {
  // Table property revisions first: they change attributes only, so every
  // position read below stays valid.
  let rowsChanged = resolveTablePropertyRevisions(
    tr,
    collectTablePropertyRevisionGroups(tr.doc).flatMap((group) => group.tablePositions),
    "accept",
  );
  // Deleted rows first, last one first: the rest is read from what remains.
  for (const row of trackedInsertedRows(tr.doc)) {
    rowsChanged = keepTrackedInsertedRow(tr, row.pos) || rowsChanged;
  }
  for (const rowPos of trackedDeletedRows(tr.doc).reverse()) {
    rowsChanged = removeTrackedDeletedRow(tr, rowPos) || rowsChanged;
  }
  for (const object of trackedInsertedObjects(tr.doc)) {
    rowsChanged = keepTrackedInsertedObject(tr, object.pos) || rowsChanged;
  }
  for (const object of trackedDeletedObjects(tr.doc).reverse()) {
    rowsChanged = removeTrackedDeletedObject(tr, object.pos) || rowsChanged;
  }
  const { insertion, deletion, formatting } = trackMarkTypes(tr.doc);
  // Snapshot ranges off the ORIGINAL doc, then apply from the end so positions
  // stay valid. Deletions shrink the doc, insertions (mark strips) do not change
  // length, so processing strictly right-to-left is safe for both.
  const insertionRanges = insertion
    ? collectMarkRanges(tr.doc, INSERTION_MARK_NAME)
    : [];
  const deletionRanges = deletion
    ? collectMarkRanges(tr.doc, DELETION_MARK_NAME)
    : [];
  const formattingRanges = formatting
    ? collectFormatRevisionRanges(tr.doc)
    : [];
  const paragraphRanges = collectParagraphFormatRevisionRanges(tr.doc);

  type Op =
    | { from: number; to: number; kind: "stripInsertion" | "delete" }
    | { from: number; to: number; kind: "stripFormatting" }
    | { from: number; to: number; kind: "acceptParagraph"; nodePos: number };
  const ops: Op[] = [
    ...insertionRanges.map(
      (r): Op => ({
        from: r.from,
        to: r.to,
        kind: "stripInsertion",
      }),
    ),
    ...deletionRanges.map(
      (r): Op => ({
        from: r.from,
        to: r.to,
        kind: "delete",
      }),
    ),
    ...formattingRanges.map(
      (range): Op => ({
        from: range.from,
        to: range.to,
        kind: "stripFormatting",
      }),
    ),
    ...paragraphRanges.map(
      (range): Op => ({
        from: range.nodePos,
        to: range.nodePos,
        nodePos: range.nodePos,
        kind: "acceptParagraph",
      }),
    ),
  ].sort((a, b) => b.from - a.from || b.to - a.to);

  let changed = rowsChanged;
  for (const op of ops) {
    if (op.kind === "delete") {
      tr.delete(op.from, op.to);
      changed = true;
    } else if (op.kind === "stripInsertion" && insertion) {
      tr.removeMark(op.from, op.to, insertion);
      changed = true;
    } else if (op.kind === "stripFormatting" && formatting) {
      tr.removeMark(op.from, op.to, formatting);
      changed = true;
    } else if (
      op.kind === "acceptParagraph" &&
      clearParagraphFormatRevision(tr, op.nodePos)
    ) {
      changed = true;
    }
  }
  return resolveParagraphMarkRevisions(tr, "accept") || changed;
}

/**
 * Reject every tracked change in the doc, mutating the given Transaction in
 * place. Returns true if anything changed.
 *
 *   - insertion → delete the inserted text (it was never wanted)
 *   - deletion  → strip the deletion mark (restore the tombstoned text)
 *
 * Applied right-to-left for the same position-stability reason as acceptAll.
 */
function rejectAllRevisions(tr: Transaction): boolean {
  // Table property revisions first: they change attributes only.
  let rowsChanged = resolveTablePropertyRevisions(
    tr,
    collectTablePropertyRevisionGroups(tr.doc).flatMap((group) => group.tablePositions),
    "reject",
  );
  // Inserted rows go first, last one first; a re-marked row keeps every
  // position.
  for (const row of trackedInsertedRows(tr.doc).reverse()) {
    rowsChanged = removeTrackedDeletedRow(tr, row.pos) || rowsChanged;
  }
  for (const rowPos of trackedDeletedRows(tr.doc)) {
    rowsChanged = restoreTrackedDeletedRow(tr, rowPos) || rowsChanged;
  }
  for (const object of trackedInsertedObjects(tr.doc).reverse()) {
    rowsChanged = removeTrackedDeletedObject(tr, object.pos) || rowsChanged;
  }
  for (const object of trackedDeletedObjects(tr.doc)) {
    rowsChanged = restoreTrackedDeletedObject(tr, object.pos) || rowsChanged;
  }
  const { insertion, deletion } = trackMarkTypes(tr.doc);
  const insertionRanges = insertion
    ? collectMarkRanges(tr.doc, INSERTION_MARK_NAME)
    : [];
  const deletionRanges = deletion
    ? collectMarkRanges(tr.doc, DELETION_MARK_NAME)
    : [];
  const formattingRanges = collectFormatRevisionRanges(tr.doc);
  const paragraphRanges = collectParagraphFormatRevisionRanges(tr.doc);

  type Op =
    | { from: number; to: number; kind: "stripDeletion" | "delete" }
    | {
        from: number;
        to: number;
        kind: "restoreFormatting";
        range: FormatRevisionRange;
      }
    | {
        from: number;
        to: number;
        kind: "restoreParagraph";
        nodePos: number;
        previousAttrs: Record<string, unknown>;
      };
  const ops: Op[] = [
    ...insertionRanges.map(
      (r): Op => ({
        from: r.from,
        to: r.to,
        kind: "delete",
      }),
    ),
    ...deletionRanges.map(
      (r): Op => ({
        from: r.from,
        to: r.to,
        kind: "stripDeletion",
      }),
    ),
    ...formattingRanges.map(
      (range): Op => ({
        from: range.from,
        to: range.to,
        kind: "restoreFormatting",
        range,
      }),
    ),
    ...paragraphRanges.map(
      (range): Op => ({
        from: range.nodePos,
        to: range.nodePos,
        kind: "restoreParagraph",
        nodePos: range.nodePos,
        previousAttrs: range.authority.previousAttrs,
      }),
    ),
  ].sort((a, b) => b.from - a.from || b.to - a.to);

  let changed = rowsChanged;
  // Every op but "delete" keeps positions (marks and node attributes), so they
  // all run first on the coordinates they were collected at; the insertions
  // are deleted last, right to left. Interleaved by start, a longer insertion
  // deleted first left a format revision sharing its start to restore old
  // coordinates: the untracked text after it lost its formatting, or the
  // range ran past the document's end (OFL-008).
  const ordered = [
    ...ops.filter((op) => op.kind !== "delete"),
    ...ops.filter((op) => op.kind === "delete"),
  ];
  // Paragraphs a rejected list conversion takes out of their list, or a
  // rejected revision's recorded numbering puts into one: lifted or wrapped
  // last, from where the other ops left them (both move positions).
  const lifts: Array<{ nodePos: number; mappingFrom: number; putBack: ParagraphListPutBack }> = [];
  for (const op of ordered) {
    if (op.kind === "delete") {
      tr.delete(op.from, op.to);
      changed = true;
    } else if (op.kind === "stripDeletion" && deletion) {
      tr.removeMark(op.from, op.to, deletion);
      changed = true;
    } else if (
      op.kind === "restoreFormatting" &&
      restoreRunFormatRevision(tr, op.range)
    ) {
      changed = true;
    } else if (
      op.kind === "restoreParagraph" &&
      clearParagraphFormatRevision(tr, op.nodePos, op.previousAttrs, (nodePos, mappingFrom, putBack) =>
        lifts.push({ nodePos, mappingFrom, putBack }),
      )
    ) {
      changed = true;
    }
  }
  const liftAt = lifts.map(({ nodePos, mappingFrom, putBack }) => ({
    pos: tr.mapping.slice(mappingFrom).map(nodePos, 1),
    mapped: tr.mapping.maps.length,
    putBack,
  }));
  // The last paragraph first: lifting or wrapping one leaves the positions
  // before it. A paragraph put back into the list of the numbering the one
  // after it was put back into joins that list.
  let wrapped: { pos: number; mapped: number; numbering: RecordedParagraphNumbering } | null = null;
  for (const { pos, mapped, putBack } of liftAt.sort((a, b) => b.pos - a.pos)) {
    const at = tr.mapping.slice(mapped).map(pos, 1);
    if (putBack.kind === "lift") {
      liftParagraphOutOfLists(tr, at);
      wrapped = null;
      continue;
    }
    const listPos = wrapParagraphInRecordedList(tr, at, putBack.numbering, wrapped);
    wrapped =
      listPos === null ? null : { pos: listPos, mapped: tr.mapping.maps.length, numbering: putBack.numbering };
  }
  return resolveParagraphMarkRevisions(tr, "reject") || changed;
}

/**
 * Find the single tracked-change run (insertion OR deletion) that covers `pos`,
 * expanding outward across adjacent text nodes that share the same mark. Returns
 * null when the position is not inside a tracked change. A deletion takes
 * priority when both marks somehow overlap the same character (the struck-out
 * intent is the dominant one to resolve).
 */
export function trackedChangeAt(
  doc: ProseMirrorNode,
  pos: number,
): {
  from: number;
  to: number;
  kind: "insertion" | "deletion" | "formatting" | "move";
  formatScope?: "run" | "paragraph" | "table";
  nodePos?: number;
  move?: NativeMoveGroup;
  object?: TrackedObjectKind;
} | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const object = trackedDeletedObjectAt(doc, clamped);
  if (object && doc.nodeAt(clamped) === object.node) {
    return {
      from: object.pos,
      to: object.pos + object.node.nodeSize,
      kind: "deletion",
      nodePos: object.pos,
      object: object.kind,
    };
  }
  const inserted = trackedInsertedObjectAt(doc, clamped);
  if (inserted && doc.nodeAt(clamped) === inserted.node) {
    return {
      from: inserted.pos,
      to: inserted.pos + inserted.node.nodeSize,
      kind: "insertion",
      nodePos: inserted.pos,
      object: inserted.kind,
    };
  }
  const move = nativeMoveAt(doc, clamped);
  if (move) {
    return {
      from: Math.min(...move.segments.map((segment) => segment.from)),
      to: Math.max(...move.segments.map((segment) => segment.to)),
      kind: "move",
      move,
    };
  }
  const candidates: Array<{
    from: number;
    to: number;
    kind: "insertion" | "deletion" | "formatting";
    formatScope?: "run" | "paragraph" | "table";
    nodePos?: number;
  }> = [
    // One REVISION at a time, as the Reviewing pane lists them: adjacent
    // runs of the same mark with a different author, time or id are
    // different revisions, and accepting or rejecting one must not take
    // its neighbour with it (runs of one revision split by formatting
    // still join).
    ...collectTrackedContentRanges(doc, DELETION_MARK_NAME).map((range) => ({
      from: range.from,
      to: range.to,
      kind: "deletion" as const,
    })),
    ...collectTrackedContentRanges(doc, INSERTION_MARK_NAME).map((range) => ({
      from: range.from,
      to: range.to,
      kind: "insertion" as const,
    })),
    ...collectFormatRevisionRanges(doc)
      .filter((range) => !isParagraphLinkedRunRevision(doc, range))
      .map((range) => ({
        from: range.from,
        to: range.to,
        kind: "formatting" as const,
        formatScope: "run" as const,
      })),
    ...collectParagraphFormatRevisionRanges(doc).map((range) => ({
      from: range.from,
      to: range.to,
      kind: "formatting" as const,
      formatScope: "paragraph" as const,
      nodePos: range.nodePos,
    })),
    // Last: a table's property revision covers the whole table, so a change
    // of the words in it is that change, not the table's. The innermost
    // table first (a nested table's group lies inside its host's).
    ...collectTablePropertyRevisionGroups(doc)
      .sort((a, b) => a.to - a.from - (b.to - b.from))
      .map((group) => ({
        from: group.from,
        to: group.to,
        kind: "formatting" as const,
        formatScope: "table" as const,
        nodePos: group.tablePositions[0],
      })),
  ];
  // The change a position is inside wins. Only when none covers it does the
  // change ending right before it resolve, so a collapsed caret sitting just
  // after a change still resolves it (Word/WPS parity) while the start of an
  // insertion typed over a deletion is that insertion, not the deletion.
  const inside = candidates.find(
    (range) =>
      clamped >= range.from &&
      (clamped < range.to || range.from === range.to),
  );
  if (inside) return inside;
  // A position in an inserted row no text change covers is the row's
  // insertion (an empty inserted row has nothing else to review).
  const insertedRow = trackedInsertedRowAround(doc, clamped);
  if (insertedRow) {
    return {
      from: insertedRow.pos,
      to: insertedRow.pos + insertedRow.node.nodeSize,
      kind: "insertion",
      nodePos: insertedRow.pos,
    };
  }
  // A caret right after a deleted object resolves it, as after a run.
  if (object) {
    return {
      from: object.pos,
      to: object.pos + object.node.nodeSize,
      kind: "deletion",
      nodePos: object.pos,
      object: object.kind,
    };
  }
  return (
    candidates.find(
      (range) => clamped >= range.from && clamped <= range.to,
    ) ??
    null
  );
}

/**
 * Accept the single tracked change covering `pos`, mutating `tr`. No-op (returns
 * false) when `pos` is not inside a tracked change.
 */
function acceptOneChangeAt(tr: Transaction, pos: number): boolean {
  const done = acceptChangeAtPosition(tr, pos);
  // No word revision here: a paragraph's own mark may be the change.
  if (!done) return resolveStandaloneParagraphMarkAt(tr, pos, "accept");
  if (done) {
    const at = tr.mapping.map(pos, -1);
    resolveParagraphMarkRevisions(tr, "accept", { from: at, to: at });
  }
  return done;
}

function acceptChangeAtPosition(tr: Transaction, pos: number): boolean {
  const target = trackedChangeAt(tr.doc, pos);
  if (!target) return false;
  if (target.kind === "move" && target.move) {
    return resolveNativeMove(tr, target.move, "accept");
  }
  const { insertion, formatting } = trackMarkTypes(tr.doc);
  if (target.object) {
    return target.kind === "insertion"
      ? keepTrackedInsertedObject(tr, target.from)
      : removeTrackedDeletedObject(tr, target.from);
  }
  if (target.kind === "deletion") {
    // The deleted text of a deleted ROW stands for the row.
    const row = trackedDeletedRowAround(tr.doc, target.from);
    if (row) return removeTrackedDeletedRow(tr, row.pos);
    tr.delete(target.from, target.to);
    return true;
  }
  if (target.kind === "formatting") {
    if (target.formatScope === "table" && target.nodePos !== undefined) {
      const group = tablePropertyRevisionGroupAt(tr.doc, target.nodePos + 1);
      return group ? resolveTablePropertyRevisions(tr, group.tablePositions, "accept") : false;
    }
    if (target.formatScope === "paragraph" && target.nodePos !== undefined) {
      if (formatting) {
        for (const range of linkedRunRevisionsIn(tr.doc, target.nodePos)) {
          tr.removeMark(range.from, range.to, formatting);
        }
      }
      return clearParagraphFormatRevision(tr, target.nodePos);
    }
    if (!formatting) return false;
    tr.removeMark(target.from, target.to, formatting);
    return true;
  }
  const row = insertedRowTarget(tr.doc, target);
  if (row !== null) {
    // Accepting an inserted row keeps it, with what was typed in it.
    keepTrackedInsertedRow(tr, row);
    if (insertion) tr.removeMark(target.from, target.to, insertion);
    return true;
  }
  if (!insertion) return false;
  tr.removeMark(target.from, target.to, insertion);
  return true;
}

/** The inserted row a review target is (its position), or null. */
function insertedRowTarget(doc: ProseMirrorNode, target: { kind: string; nodePos?: number }): number | null {
  if (target.kind !== "insertion" || target.nodePos === undefined) return null;
  const node = doc.nodeAt(target.nodePos);
  return node && node.type.spec.tableRole === "row" && normalizeRowInsertionRevision(node.attrs[ROW_INSERTION_REVISION_ATTR])
    ? target.nodePos
    : null;
}

/**
 * Reject the single tracked change covering `pos`, mutating `tr`. No-op (returns
 * false) when `pos` is not inside a tracked change.
 */
function rejectOneChangeAt(tr: Transaction, pos: number): boolean {
  const done = rejectChangeAtPosition(tr, pos);
  if (!done) return resolveStandaloneParagraphMarkAt(tr, pos, "reject");
  if (done) {
    const at = tr.mapping.map(pos, -1);
    resolveParagraphMarkRevisions(tr, "reject", { from: at, to: at });
  }
  return done;
}

function rejectChangeAtPosition(tr: Transaction, pos: number): boolean {
  const target = trackedChangeAt(tr.doc, pos);
  if (!target) return false;
  if (target.kind === "move" && target.move) {
    return resolveNativeMove(tr, target.move, "reject");
  }
  const { deletion } = trackMarkTypes(tr.doc);
  if (target.object) {
    return target.kind === "insertion"
      ? removeTrackedDeletedObject(tr, target.from)
      : restoreTrackedDeletedObject(tr, target.from);
  }
  if (target.kind === "insertion") {
    const row = insertedRowTarget(tr.doc, target);
    // Rejecting an inserted row removes it (its table with its last row).
    if (row !== null) return removeTrackedDeletedRow(tr, row);
    tr.delete(target.from, target.to);
    return true;
  }
  if (target.kind === "formatting") {
    if (target.formatScope === "table" && target.nodePos !== undefined) {
      const group = tablePropertyRevisionGroupAt(tr.doc, target.nodePos + 1);
      return group ? resolveTablePropertyRevisions(tr, group.tablePositions, "reject") : false;
    }
    if (target.formatScope === "paragraph" && target.nodePos !== undefined) {
      const range = collectParagraphFormatRevisionRanges(tr.doc).find(
        (candidate) => candidate.nodePos === target.nodePos,
      );
      if (range) {
        for (const run of linkedRunRevisionsIn(tr.doc, range.nodePos)) {
          restoreRunFormatRevision(tr, run);
        }
      }
      return range
        ? clearParagraphFormatRevision(
            tr,
            range.nodePos,
            range.authority.previousAttrs,
          )
        : false;
    }
    const range = collectFormatRevisionRanges(tr.doc).find(
      (candidate) =>
        candidate.from === target.from && candidate.to === target.to,
    );
    return range ? restoreRunFormatRevision(tr, range) : false;
  }
  if (!deletion) return false;
  const row = trackedDeletedRowAround(tr.doc, target.from);
  if (row) {
    // Rejecting any part of a deleted row gives the whole row back.
    restoreTrackedDeletedRow(tr, row.pos);
    tr.removeMark(row.pos, row.pos + row.node.nodeSize, deletion);
    return true;
  }
  tr.removeMark(target.from, target.to, deletion);
  return true;
}

/**
 * Accept every tracked change in the doc, mutating the given Transaction in
 * place. Returns true if anything changed. A comment whose words the accepted
 * deletions took goes with them (droppingCommentsOfReview).
 */
export function acceptAll(tr: Transaction): boolean {
  return droppingCommentsOfReview(tr, { decision: "accept", all: true }, () => acceptAllRevisions(tr));
}

/**
 * Reject every tracked change in the doc, mutating the given Transaction in
 * place. Returns true if anything changed. A comment whose words the rejected
 * insertions took goes with them (droppingCommentsOfReview).
 */
export function rejectAll(tr: Transaction): boolean {
  return droppingCommentsOfReview(tr, { decision: "reject", all: true }, () => rejectAllRevisions(tr));
}

/**
 * Accept the single tracked change covering `pos`, mutating `tr`. No-op
 * (returns false) when `pos` is not inside a tracked change. A comment whose
 * words an accepted deletion took goes with it.
 */
export function acceptChangeAt(tr: Transaction, pos: number): boolean {
  return droppingCommentsOfReview(tr, { decision: "accept", all: false }, () => acceptOneChangeAt(tr, pos));
}

/**
 * Reject the single tracked change covering `pos`, mutating `tr`. No-op
 * (returns false) when `pos` is not inside a tracked change. A comment whose
 * words a rejected insertion took goes with it.
 */
export function rejectChangeAt(tr: Transaction, pos: number): boolean {
  return droppingCommentsOfReview(tr, { decision: "reject", all: false }, () => rejectOneChangeAt(tr, pos));
}

/** Longest snippet of affected text the review panel shows per change. */
export const MAX_CHANGE_SNIPPET_LENGTH = 120;

/**
 * One tracked change as the review panel sees it: its kind, the [from, to) range
 * it currently occupies in the live doc, the author/timestamp stamped on the run
 * (read off the run's FIRST mark), and a bounded text snippet of the affected
 * content. `from` is also the stable position the panel re-resolves a click and
 * an accept/reject against — never cache it across an edit.
 */
export interface TrackedChangeEntry {
  kind: "insertion" | "deletion" | "formatting" | "move";
  /** A revision of a whole object rather than of text (a deleted picture, chart, break ...). */
  object?: TrackedObjectKind;
  formatScope?: "run" | "paragraph" | "table";
  nodePos?: number;
  /** The change is a paragraph's own mark (its ¶), not any of its words. */
  paragraphMark?: true;
  moveId?: string;
  moveSegments?: [NativeMoveSegment, NativeMoveSegment];
  from: number;
  to: number;
  author: string | null;
  timestamp: number | null;
  /** Bounded, control-stripped snippet of the run's text (may be truncated). */
  snippet: string;
  /** True when `snippet` was clipped to MAX_CHANGE_SNIPPET_LENGTH. */
  truncated: boolean;
}

export type TrackedChangeNavigationDirection = "previous" | "next";

/**
 * Resolve the review item covering a live document position. Positions at a
 * run's start belong to that run; its end is exclusive, matching ProseMirror's
 * mark ranges and the accept/reject-at-position commands.
 */
export function trackedChangeEntryAtPosition(
  changes: readonly TrackedChangeEntry[],
  position: number,
): TrackedChangeEntry | null {
  const covering = changes.filter((change) =>
    change.moveSegments
      ? change.moveSegments.some(
          (segment) => position >= segment.from && position < segment.to,
        )
      : position >= change.from && position < change.to,
  );
  // A table's property revision spans the whole table: a change of the words
  // in it, which it also covers, is the one at the position.
  return (
    covering.find((change) => change.formatScope !== "table") ??
    covering[0] ??
    null
  );
}

/**
 * The revision Accept/Reject act on: the one covering the caret, or, for a
 * collapsed caret, the one it sits right after, as when the author has just
 * typed a tracked insertion and presses Accept.
 */
export function trackedChangeEntryAtCaret(
  changes: readonly TrackedChangeEntry[],
  selection: { readonly from: number; readonly empty: boolean },
): TrackedChangeEntry | null {
  return (
    trackedChangeEntryAtPosition(changes, selection.from) ??
    (selection.empty && selection.from > 0
      ? trackedChangeEntryAtPosition(changes, selection.from - 1)
      : null)
  );
}

/**
 * The revisions Accept/Reject act on for a selection, as Word's
 * `Selection.Range.Revisions`: every revision the selected range touches (a
 * moved block when either of its halves is touched), in document order. Select
 * All covers them all. A collapsed caret has the one revision it is in or
 * right after.
 */
export function trackedChangeEntriesInSelection(
  changes: readonly TrackedChangeEntry[],
  selection: { readonly from: number; readonly to: number; readonly empty: boolean },
): TrackedChangeEntry[] {
  if (selection.empty) {
    const current = trackedChangeEntryAtCaret(changes, selection);
    return current ? [current] : [];
  }
  const touches = (range: { from: number; to: number }) =>
    range.from === range.to
      ? range.from >= selection.from && range.from <= selection.to
      : range.from < selection.to && range.to > selection.from;
  return changes.filter((change) =>
    change.moveSegments ? change.moveSegments.some(touches) : touches(change),
  );
}

/**
 * Pick the previous/next review item relative to `position`, wrapping at the
 * document ends like Word/WPS revision navigation. When the position is inside
 * a change we move away from that change; between changes we choose the nearest
 * item in the requested direction. The input is the freshly-derived,
 * document-ordered result of `listTrackedChanges`.
 */
export function adjacentTrackedChange(
  changes: readonly TrackedChangeEntry[],
  position: number,
  direction: TrackedChangeNavigationDirection,
): TrackedChangeEntry | null {
  if (changes.length === 0) return null;

  const currentIndex = changes.findIndex((change) =>
    change.moveSegments
      ? change.moveSegments.some(
          (segment) => position >= segment.from && position < segment.to,
        )
      : position >= change.from && position < change.to,
  );
  if (currentIndex >= 0) {
    const offset = direction === "next" ? 1 : -1;
    return changes[(currentIndex + offset + changes.length) % changes.length];
  }

  if (direction === "next") {
    return changes.find((change) => change.from >= position) ?? changes[0];
  }

  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    if (change.to <= position) return change;
  }
  return changes[changes.length - 1];
}

/**
 * Extract a bounded, control-stripped snippet of the text in [from, to). Uses the
 * same control-byte scrub the author sanitizer uses so a snippet can never carry
 * raw control bytes into the panel, and clamps to MAX_CHANGE_SNIPPET_LENGTH.
 */
function snippetBetween(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): { snippet: string; truncated: boolean; objects: TrackedObjectKind[] } {
  // Text pieces of one word, whatever their formatting, join with nothing
  // ("Extra" bold + "ordinary" linked is "Extraordinary", WUA 221); a new
  // paragraph or an object starts a new piece after a space.
  let raw = "";
  const objects: TrackedObjectKind[] = [];
  let separate = false;
  const push = (text: string) => {
    if (!text) return;
    raw += (separate && raw ? " " : "") + text;
    separate = false;
  };
  doc.nodesBetween(from, to, (node, position) => {
    if (node.isText) {
      const text = node.text ?? "";
      const start = Math.max(from, position) - position;
      const end = Math.min(to, position + node.nodeSize) - position;
      if (end > start) push(text.slice(start, end));
      return false;
    }
    if (node.isTextblock) {
      separate = true;
      return true;
    }
    if (supportsTrackedInsertion(node)) {
      // An object is named by its kind in the pane (a footnote reference was
      // shown as "formula", WUA 222); an equation also shows its source.
      if (node.type.name === "hardBreak") {
        // A line break reads as the pane's return mark.
        push("↵");
      } else if (node.type.name === "footnoteRef") {
        objects.push("noteReference");
      } else if (node.type.name === "documentField") {
        objects.push("field");
      } else {
        const latex = node.attrs.latex;
        if (typeof latex === "string" && latex.trim()) {
          separate = true;
          push(latex);
          separate = true;
        } else {
          objects.push("equation");
        }
      }
      return false;
    }
    return true;
  });
  raw = raw.replace(CONTROL_BYTE_RE, " ").replace(/\s+/g, " ").trim();
  if (raw.length > MAX_CHANGE_SNIPPET_LENGTH) {
    return {
      snippet: raw.slice(0, MAX_CHANGE_SNIPPET_LENGTH),
      truncated: true,
      objects,
    };
  }
  return { snippet: raw, truncated: false, objects };
}

/**
 * Enumerate every tracked change (insertion and deletion runs) in DOCUMENT ORDER
 * — the order the review panel lists them top-to-bottom. Each entry carries the
 * run's live [from, to), author/timestamp, and a bounded snippet. Runs are the
 * same contiguous runs `collectMarkRanges` yields, so an adjacent split (a change
 * broken by an unrelated nested mark boundary) is ONE entry, and an insertion
 * abutting a deletion stays TWO entries (different kinds never merge).
 *
 * The returned positions are valid against `doc` AT CALL TIME only. The panel
 * re-derives this list on every editor update, so it never applies a cached
 * batch of positions — the documented stale-position hazard.
 */
/** What the Reviewing pane shows beside a deleted object's kind. */
function trackedObjectSnippet(node: ProseMirrorNode): string {
  const attrs = node.attrs as Record<string, unknown>;
  for (const key of ["alt", "title", "latex"]) {
    if (typeof attrs[key] === "string" && (attrs[key] as string).trim()) return attrs[key] as string;
  }
  return node.isLeaf ? "" : node.textContent;
}

const trackedChangeLists = new WeakMap<ProseMirrorNode, TrackedChangeEntry[]>();

/** The tracked changes of `doc`, read once per document (documents are
 * immutable): the toolbar, the Reviewing pane and Show Markup each asked for
 * them again on every keystroke, a walk of the whole document each time.
 * Callers must not mutate the list; they filter and sort copies. */
/**
 * A page-ledger transaction moves blocks between sheets and cuts or joins a
 * block's pieces, each piece carrying the attributes and marks its block
 * had: a document holding no revision before holds none after. Its list is
 * carried over instead of read again (each read walks the whole document for
 * every kind of revision: ~0.35 s in two minutes of the 298-page book's
 * background layout, read by the ribbon on every pass).
 */
export function carryRevisionFreeListThroughLayout(before: ProseMirrorNode, after: ProseMirrorNode): void {
  const known = trackedChangeLists.get(before);
  if (known && known.length === 0 && !trackedChangeLists.has(after)) trackedChangeLists.set(after, known);
}

const REVISION_MARK_NAMES = new Set<string>([INSERTION_MARK_NAME, DELETION_MARK_NAME, FORMAT_REVISION_MARK_NAME]);

/**
 * Typing into a revision-free document (Track Changes off) replaces text
 * inside one paragraph with text carrying no revision mark: no revision can
 * appear, since text holds revisions only in those marks and the paragraph,
 * its rows and objects are untouched. The (empty) list is carried over
 * instead of walking the whole document again on every keystroke (a
 * 296-page book: ~13 ms a key, read by the ribbon). `docs[i]` is the
 * document before `steps[i]`, as on a Transaction.
 */
export function carryRevisionFreeListThroughPlainText(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  steps: readonly Step[],
  docs: readonly ProseMirrorNode[],
): void {
  const known = trackedChangeLists.get(before);
  if (!known || known.length !== 0 || trackedChangeLists.has(after) || !steps.length) return;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const doc = docs[index];
    // ReplaceAroundStep is not a ReplaceStep: it rewraps blocks.
    if (!(step instanceof ReplaceStep) || !doc) return;
    const { from, to, slice } = step as ReplaceStep & { from: number; to: number };
    if (slice.openStart !== 0 || slice.openEnd !== 0 || from < 0 || to > doc.content.size) return;
    const $from = doc.resolve(from);
    if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) return;
    let plain = true;
    slice.content.forEach((node) => {
      if (!node.isText || node.marks.some((mark) => REVISION_MARK_NAMES.has(mark.type.name))) plain = false;
    });
    if (!plain) return;
  }
  trackedChangeLists.set(after, known);
}

export function listTrackedChanges(doc: ProseMirrorNode): TrackedChangeEntry[] {
  let entries = trackedChangeLists.get(doc);
  if (!entries) {
    entries = pagesHoldNoTrackedChange(doc) ? [] : readTrackedChanges(doc);
    trackedChangeLists.set(doc, entries);
  }
  return entries;
}

/** Whether a page holds a tracked change, by page node (kept across edits
 * that leave the page alone). */
const pageTracked = new WeakMap<ProseMirrorNode, boolean>();

/**
 * A paged document none of whose pages holds a tracked change, each read on
 * its own and kept by node: every entry comes from the marks and attributes
 * of the page it stands on, so none on any page is none in the document.
 * Each keystroke made a new document and its whole list was read again
 * (the toolbar asks on every transaction: 540 ms of 40 keystrokes on the
 * 272-page book); now only the page edited is.
 */
/** Each page's tracked changes read on its own, positions within the page
 * (from its start), by page node. */
const pageEntryLists = new WeakMap<ProseMirrorNode, TrackedChangeEntry[]>();

function pageEntries(doc: ProseMirrorNode, page: ProseMirrorNode): TrackedChangeEntry[] {
  let entries = pageEntryLists.get(page);
  if (!entries) {
    entries = readTrackedChanges(doc.type.create(doc.attrs, page));
    pageEntryLists.set(page, entries);
    pageTracked.set(page, entries.length > 0);
  }
  return entries;
}

/**
 * Whether a paged document holds a tracked change, one `shown` accepts, and
 * one the selection is in -- read page by page, each page's list kept by
 * node, so a keystroke reads only the page it edited (the toolbar asked for
 * the whole list on every transaction: 500 ms of 40 keystrokes on a book
 * holding tracked changes). A change running across a page boundary counts
 * on each page it covers; for these three answers that is the same. Null
 * for a document that is not paged (read whole).
 */
export function trackedChangesSummary(
  doc: ProseMirrorNode,
  selection: { readonly from: number; readonly to: number; readonly empty: boolean },
  shown: (change: TrackedChangeEntry) => boolean,
): { any: boolean; shown: boolean; inSelection: boolean } | null {
  if (doc.childCount < 2 || doc.firstChild?.type.name !== "pageBlock") return null;
  try {
    let any = false;
    let anyShown = false;
    let inSelection = false;
    doc.forEach((page, offset) => {
      const entries = pageEntries(doc, page);
      if (!entries.length) return;
      any = true;
      if (!anyShown && entries.some(shown)) anyShown = true;
      const start = offset;
      const end = offset + page.nodeSize;
      if (!inSelection && selection.to >= start && selection.from <= end) {
        const placed = entries.map((entry) => ({ ...entry, from: entry.from + start, to: entry.to + start }));
        inSelection = trackedChangeEntriesInSelection(placed, selection).length > 0;
      }
    });
    return { any, shown: anyShown, inSelection };
  } catch {
    return null;
  }
}

function pagesHoldNoTrackedChange(doc: ProseMirrorNode): boolean {
  if (doc.childCount < 2 || doc.firstChild?.type.name !== "pageBlock") return false;
  try {
    let found = false;
    doc.forEach((page) => {
      if (found) return;
      let tracked = pageTracked.get(page);
      if (tracked === undefined) {
        tracked = readTrackedChanges(doc.type.create(doc.attrs, page)).length > 0;
        pageTracked.set(page, tracked);
      }
      if (tracked) found = true;
    });
    return !found;
  } catch {
    return false;
  }
}

function readTrackedChanges(doc: ProseMirrorNode): TrackedChangeEntry[] {
  const { insertion, deletion, formatting } = trackMarkTypes(doc);
  const entries: TrackedChangeEntry[] = [];
  const nativeMoves = collectNativeMoveGroups(doc);
  const pairedRangeKeys = new Set(
    nativeMoves.flatMap((move) =>
      move.segments.map(
        (segment) => `${segment.markName}:${segment.from}:${segment.to}`,
      ),
    ),
  );

  for (const move of nativeMoves) {
    const source = move.segments.find((segment) => segment.role === "from")!;
    const destination = move.segments.find((segment) => segment.role === "to")!;
    const sourceSnippet = snippetBetween(doc, source.from, source.to);
    const destinationSnippet = snippetBetween(
      doc,
      destination.from,
      destination.to,
    );
    const combined = `${sourceSnippet.snippet} → ${destinationSnippet.snippet}`;
    entries.push({
      kind: "move",
      moveId: move.moveId,
      moveSegments: move.segments,
      from: Math.min(source.from, destination.from),
      to: Math.max(source.to, destination.to),
      author: move.author,
      timestamp: move.timestamp,
      snippet: combined.slice(0, MAX_CHANGE_SNIPPET_LENGTH),
      truncated:
        sourceSnippet.truncated ||
        destinationSnippet.truncated ||
        combined.length > MAX_CHANGE_SNIPPET_LENGTH,
    });
  }

  if (insertion) {
    for (const range of collectTrackedContentRanges(doc, INSERTION_MARK_NAME)) {
      if (
        pairedRangeKeys.has(`${INSERTION_MARK_NAME}:${range.from}:${range.to}`)
      ) {
        continue;
      }
      const { author, timestamp } = range.attrs;
      const { snippet, truncated, objects } = snippetBetween(doc, range.from, range.to);
      // An insertion that is only an object (a footnote reference, an empty
      // equation) is that object's revision, named by its kind.
      const object = !snippet && objects.length === 1 ? objects[0] : undefined;
      entries.push({
        kind: "insertion",
        ...(object ? { object } : {}),
        from: range.from,
        to: range.to,
        author,
        timestamp,
        snippet,
        truncated,
      });
    }
  }

  if (deletion) {
    for (const range of collectTrackedContentRanges(doc, DELETION_MARK_NAME)) {
      if (
        pairedRangeKeys.has(`${DELETION_MARK_NAME}:${range.from}:${range.to}`)
      ) {
        continue;
      }
      const { author, timestamp } = range.attrs;
      const { snippet, truncated } = snippetBetween(doc, range.from, range.to);
      entries.push({
        kind: "deletion",
        from: range.from,
        to: range.to,
        author,
        timestamp,
        snippet,
        truncated,
      });
    }
  }

  if (formatting) {
    for (const range of collectFormatRevisionRanges(doc)) {
      // Part of its paragraph's change, listed once with it.
      if (isParagraphLinkedRunRevision(doc, range)) continue;
      const { snippet, truncated } = snippetBetween(doc, range.from, range.to);
      entries.push({
        kind: "formatting",
        formatScope: "run",
        from: range.from,
        to: range.to,
        author: range.authority.author,
        timestamp: range.authority.timestamp,
        snippet,
        truncated,
      });
    }
  }

  for (const range of collectParagraphFormatRevisionRanges(doc)) {
    const { snippet, truncated } = snippetBetween(doc, range.from, range.to);
    entries.push({
      kind: "formatting",
      formatScope: "paragraph",
      nodePos: range.nodePos,
      from: range.from,
      to: range.to,
      author: range.authority.author,
      timestamp: range.authority.timestamp,
      snippet,
      truncated,
    });
  }

  // One "Formatted Table" per table, as Word's Reviewing pane lists a
  // table's property revisions.
  for (const group of collectTablePropertyRevisionGroups(doc)) {
    const { snippet, truncated } = snippetBetween(doc, group.from, group.to);
    entries.push({
      kind: "formatting",
      formatScope: "table",
      nodePos: group.tablePositions[0],
      from: group.from,
      to: group.to,
      author: group.author,
      timestamp: group.timestamp,
      snippet,
      truncated,
    });
  }

  for (const mark of standaloneParagraphMarkRevisions(doc)) {
    entries.push({
      kind: mark.revision.kind === "ins" ? "insertion" : "deletion",
      paragraphMark: true,
      nodePos: mark.pos,
      // The mark stands at the end of its paragraph's words.
      from: mark.pos + mark.node.nodeSize - 1,
      to: mark.pos + mark.node.nodeSize,
      author: mark.revision.author,
      timestamp: mark.revision.timestamp,
      snippet: "¶",
      truncated: false,
    });
  }

  for (const row of trackedInsertedRows(doc)) {
    const { snippet, truncated } = snippetBetween(doc, row.pos, row.pos + row.node.nodeSize);
    entries.push({
      kind: "insertion",
      nodePos: row.pos,
      from: row.pos,
      to: row.pos + row.node.nodeSize,
      author: row.revision.author,
      timestamp: row.revision.timestamp,
      snippet,
      truncated,
    });
  }

  for (const [kind, object] of [
    ...trackedDeletedObjects(doc).map((found) => ["deletion", found] as const),
    ...trackedInsertedObjects(doc).map((found) => ["insertion", found] as const),
  ]) {
    const snippet = trackedObjectSnippet(object.node).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
    entries.push({
      kind,
      object: object.kind,
      nodePos: object.pos,
      from: object.pos,
      to: object.pos + object.node.nodeSize,
      author: object.revision.author,
      timestamp: object.revision.timestamp,
      snippet: snippet.slice(0, MAX_CHANGE_SNIPPET_LENGTH),
      truncated: snippet.length > MAX_CHANGE_SNIPPET_LENGTH,
    });
  }

  // Document order. A deletion tombstone and an insertion never share a start
  // (one is text the user removed, the other text they added), so `from` alone
  // is a total order here; `to` is a stable tiebreak for the degenerate case.
  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  return entries;
}
