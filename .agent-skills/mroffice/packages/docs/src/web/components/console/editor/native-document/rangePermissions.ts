/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's editing exceptions under Restrict Editing (ECMA-376 17.13.7.1-2,
 * `w:permStart` / `w:permEnd`; Review > Restrict Editing > Exceptions): under
 * a "No changes (Read only)" or "Comments" restriction, the parts of the text
 * an author marked as editable by Everyone stay editable, and nothing else.
 *
 * The page holds each marker where the file had it, as an invisible inline
 * atom (`rangePermission`, its `edge` the start or the end; a marker Word kept
 * between paragraphs is read onto the paragraph beside it). The text between a
 * start and the end with the same id is an editable region.
 *
 * Fail closed: only a region granted to Everyone (`w:edGrp="everyone"`) is
 * editable here. One granted to a named editor (`w:ed`), to a Windows group,
 * or to a column of a table (`w:colFirst` / `w:colLast`), a start with no end,
 * and an end with no start, are carried for the file and edit nothing.
 *
 * Dependency-light (ProseMirror model/transform only) so the rule is unit
 * testable and shared by the extension's filter, its highlight and NoteEditor.
 */

import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from "@tiptap/pm/transform";

import { COMMENT_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/comments.ts";
import { normalizeDocumentProtection } from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";

export const RANGE_PERMISSION_NODE_NAME = "rangePermission";

/** ECMA-376 ST_EdGrp: the groups a range permission may name. */
export const RANGE_PERMISSION_EDITOR_GROUPS = [
  "none",
  "everyone",
  "administrators",
  "contributors",
  "editors",
  "owners",
  "current",
] as const;
export type RangePermissionEditorGroup = (typeof RANGE_PERMISSION_EDITOR_GROUPS)[number];

const EDITOR_GROUPS: ReadonlySet<string> = new Set(RANGE_PERMISSION_EDITOR_GROUPS);
/** Word's ids are 32-bit integers (it writes signed and unsigned ones). */
const PERMISSION_ID_RE = /^-?[0-9]{1,10}$/;
const EDITOR_MAX = 256;

export interface RangePermissionAttrs {
  edge: "start" | "end";
  permissionId: string;
  editorGroup: RangePermissionEditorGroup | null;
  editor: string | null;
  columnFirst: number | null;
  columnLast: number | null;
}

function columnIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 63
    ? value
    : null;
}

/** The marker's closed attributes, or null when they do not read. */
export function normalizeRangePermissionAttrs(value: unknown): RangePermissionAttrs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bag = value as Record<string, unknown>;
  const edge = bag.edge === "start" || bag.edge === "end" ? bag.edge : null;
  const id = typeof bag.permissionId === "string" ? bag.permissionId : null;
  if (!edge || !id || !PERMISSION_ID_RE.test(id)) return null;
  const group =
    typeof bag.editorGroup === "string" && EDITOR_GROUPS.has(bag.editorGroup)
      ? (bag.editorGroup as RangePermissionEditorGroup)
      : null;
  const editor =
    typeof bag.editor === "string" && bag.editor.length > 0 && bag.editor.length <= EDITOR_MAX &&
    !/[\u0000-\u001f\u007f]/.test(bag.editor)
      ? bag.editor
      : null;
  return {
    edge,
    permissionId: id,
    editorGroup: edge === "start" ? group : null,
    editor: edge === "start" ? editor : null,
    columnFirst: edge === "start" ? columnIndex(bag.columnFirst) : null,
    columnLast: edge === "start" ? columnIndex(bag.columnLast) : null,
  };
}

/** Whether a start marker opens a region this editor lets anyone edit. */
export function rangePermissionGrantsEveryone(attrs: RangePermissionAttrs): boolean {
  return (
    attrs.edge === "start" &&
    attrs.editorGroup === "everyone" &&
    attrs.columnFirst === null &&
    attrs.columnLast === null
  );
}

/** One editable region: the positions between its start and end markers. */
export interface EditableRange {
  /** Just after the start marker. */
  from: number;
  /** At the end marker. */
  to: number;
  permissionId: string;
}

const rangesByDoc = new WeakMap<ProseMirrorNode, readonly EditableRange[]>();

/** The document's editable regions in document order (cached per doc). */
export function collectEditableRanges(doc: ProseMirrorNode): readonly EditableRange[] {
  const cached = rangesByDoc.get(doc);
  if (cached) return cached;
  const open = new Map<string, number>();
  const ranges: EditableRange[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== RANGE_PERMISSION_NODE_NAME) return true;
    const attrs = normalizeRangePermissionAttrs(node.attrs);
    if (!attrs) return false;
    if (attrs.edge === "start") {
      // A second start with the same id before its end: the first one stands.
      if (rangePermissionGrantsEveryone(attrs) && !open.has(attrs.permissionId)) {
        open.set(attrs.permissionId, pos + node.nodeSize);
      }
      return false;
    }
    const from = open.get(attrs.permissionId);
    if (from !== undefined) {
      open.delete(attrs.permissionId);
      ranges.push({ from, to: pos, permissionId: attrs.permissionId });
    }
    return false;
  });
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  rangesByDoc.set(doc, ranges);
  return ranges;
}

/** Whether the document holds a region anyone may edit. */
export function documentHasEditableRanges(doc: ProseMirrorNode): boolean {
  return collectEditableRanges(doc).length > 0;
}

/** Whether `from..to` lies wholly inside one editable region. */
export function spanInsideEditableRange(
  ranges: readonly EditableRange[],
  from: number,
  to: number,
): boolean {
  return ranges.some((range) => range.from <= from && to <= range.to);
}

/**
 * Whether the restriction is one Word lets exceptions open up: "No changes
 * (Read only)" or "Comments" (with or without a password; the password only
 * guards stopping the protection).
 */
export function protectionHonorsEditableRanges(value: unknown): boolean {
  const protection = normalizeDocumentProtection(value);
  // A password to modify (w:writeProtection) opens the whole file Read Only.
  if (protection?.credentials?.writeProtection) return false;
  return protection?.mode === "readOnly" || protection?.mode === "comments";
}

export function sliceHoldsMarker(slice: Slice): boolean {
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (node.type.name === RANGE_PERMISSION_NODE_NAME) found = true;
    return !found;
  });
  return found;
}

export function spanHoldsMarker(doc: ProseMirrorNode, from: number, to: number): boolean {
  if (to <= from) return false;
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    if (node.type.name === RANGE_PERMISSION_NODE_NAME) found = true;
    return !found;
  });
  return found;
}

const COMMENT_THREADS_ATTR = "commentThreads";

function stepInsideRanges(
  step: Step,
  doc: ProseMirrorNode,
  formattingLocked: boolean,
): boolean {
  const ranges = collectEditableRanges(doc);
  if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
    const { from, to } = step as unknown as { from: number; to: number };
    if (!spanInsideEditableRange(ranges, from, to)) return false;
    // The markers themselves stay where the author put them: no step takes
    // one away or brings a new one in (a region is not made by pasting).
    if (spanHoldsMarker(doc, from, to)) return false;
    return !sliceHoldsMarker(step.slice);
  }
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    if (!spanInsideEditableRange(ranges, step.from, step.to)) return false;
    // Word's formatting restriction beside the exceptions: no direct
    // formatting; a comment is no formatting.
    return !formattingLocked || step.mark.type.name === COMMENT_MARK_NAME;
  }
  // A comment's thread store is the document's comments, not its text.
  const json = step.toJSON() as { stepType?: unknown; attr?: unknown };
  return json.stepType === "docAttr" && json.attr === COMMENT_THREADS_ATTR;
}

/**
 * Whether every step of a transaction edits only inside the editable regions
 * of the document it applies to (and there is a step). Steps are checked in
 * order, each against the document the previous one produced.
 */
export function transactionEditsOnlyEditableRanges(
  transaction: { steps: readonly Step[]; docs: readonly ProseMirrorNode[] },
  options: { formattingLocked?: boolean } = {},
): boolean {
  if (transaction.steps.length === 0) return false;
  return transaction.steps.every((step, index) =>
    stepInsideRanges(step, transaction.docs[index], options.formattingLocked === true),
  );
}

/** The first editable region after `pos`, wrapping to the first one. */
export function nextEditableRange(
  doc: ProseMirrorNode,
  pos: number,
): EditableRange | null {
  const ranges = collectEditableRanges(doc);
  return ranges.find((range) => range.from > pos) ?? ranges[0] ?? null;
}
