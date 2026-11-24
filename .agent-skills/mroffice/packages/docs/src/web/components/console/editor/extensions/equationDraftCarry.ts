/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { VisualMathEditorCaret, VisualMathEditorState } from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";

/**
 * An equation open in its editor whose view is rebuilt — the page ledger
 * moves its block to another sheet, a formula is rebuilt as its placeholder
 * — keeps its draft: the view taken down hands it on, and the view built
 * for the same node opens its editor on it again. Nothing is written into
 * the document (a half-typed formula is not a commit), and a draft nobody
 * takes up by the end of that view update (the equation was deleted) is
 * dropped.
 *
 * Drafts are kept per editor, by the node instance the view drew (a moved
 * block keeps its nodes) and, when it has one, by the node's block id (a
 * node rebuilt from the same source); never by position.
 */
export interface CarriedEquationDraft {
  /** What the editor held. */
  readonly state: VisualMathEditorState;
  /** The node's value the edit opened on: what a commit checks it still is. */
  readonly base: VisualMathEditorState;
  readonly caret: VisualMathEditorCaret | null;
  /** The editor had the keyboard. */
  readonly focused: boolean;
}

export interface EquationDraftIdentity {
  readonly node: object;
  /** A stable id of the node (a block formula's block_id), or null. */
  readonly id: string | null;
}

type Reopen = (draft: CarriedEquationDraft) => void;

interface EditorDrafts {
  /** Drafts handed on in this view update, not yet taken up. */
  readonly byNode: Map<object, CarriedEquationDraft>;
  readonly byId: Map<string, CarriedEquationDraft>;
  /** Views built in this update for a node whose open view is not taken
   * down yet. */
  readonly waitingByNode: Map<object, Reopen>;
  readonly waitingById: Map<string, Reopen>;
  /** Views open on their editor, by what they draw. */
  readonly openByNode: WeakMap<object, number>;
  readonly openById: Map<string, number>;
  sweepQueued: boolean;
}

const drafts = new WeakMap<object, EditorDrafts>();

function draftsOf(editor: object): EditorDrafts {
  let entry = drafts.get(editor);
  if (!entry) {
    entry = {
      byNode: new Map(),
      byId: new Map(),
      waitingByNode: new Map(),
      waitingById: new Map(),
      openByNode: new WeakMap(),
      openById: new Map(),
      sweepQueued: false,
    };
    drafts.set(editor, entry);
  }
  return entry;
}

/** At the end of the view update (ProseMirror builds and takes down views
 * synchronously within it): drop what nobody took up. */
function sweepLater(entry: EditorDrafts): void {
  if (entry.sweepQueued) return;
  entry.sweepQueued = true;
  queueMicrotask(() => {
    entry.sweepQueued = false;
    entry.byNode.clear();
    entry.byId.clear();
    entry.waitingByNode.clear();
    entry.waitingById.clear();
  });
}

function adjust<K>(map: { get(key: K): number | undefined; set(key: K, value: number): unknown; delete(key: K): unknown }, key: K, by: number): void {
  const next = (map.get(key) ?? 0) + by;
  if (next > 0) map.set(key, next);
  else map.delete(key);
}

/** A view's editor opened (`open`) or closed for the node it draws. */
export function noteEquationDraftOpen(editor: object, identity: EquationDraftIdentity, open: boolean): void {
  const entry = draftsOf(editor);
  adjust(entry.openByNode, identity.node, open ? 1 : -1);
  if (identity.id) adjust(entry.openById, identity.id, open ? 1 : -1);
}

/**
 * The view drawing `identity` is taken down with its editor open: its draft
 * goes to the view built for the same node in this update, now or when it is
 * built.
 */
export function handOnEquationDraft(
  editor: object,
  identity: EquationDraftIdentity,
  draft: CarriedEquationDraft,
): void {
  const entry = draftsOf(editor);
  const waiter =
    entry.waitingByNode.get(identity.node) ??
    (identity.id ? entry.waitingById.get(identity.id) : undefined);
  if (waiter) {
    entry.waitingByNode.delete(identity.node);
    if (identity.id) entry.waitingById.delete(identity.id);
    queueMicrotask(() => waiter(draft));
    return;
  }
  entry.byNode.set(identity.node, draft);
  if (identity.id) entry.byId.set(identity.id, draft);
  sweepLater(entry);
}

/**
 * A view is built for `identity`: the draft of the view it replaces, if
 * any, is reopened through `reopen` once this update has placed the view
 * (also when the view it replaces is taken down after it is built).
 */
export function takeUpEquationDraft(
  editor: object,
  identity: EquationDraftIdentity,
  reopen: Reopen,
): void {
  const entry = drafts.get(editor);
  if (!entry) return;
  const draft =
    entry.byNode.get(identity.node) ??
    (identity.id ? entry.byId.get(identity.id) : undefined);
  if (draft) {
    entry.byNode.delete(identity.node);
    if (identity.id) entry.byId.delete(identity.id);
    queueMicrotask(() => reopen(draft));
    return;
  }
  // The open view for this node is still up: it is taken down later in
  // this update (a block moved to an earlier sheet is built there first).
  const open =
    (entry.openByNode.get(identity.node) ?? 0) > 0 ||
    (identity.id ? (entry.openById.get(identity.id) ?? 0) > 0 : false);
  if (!open) return;
  entry.waitingByNode.set(identity.node, reopen);
  if (identity.id) entry.waitingById.set(identity.id, reopen);
  sweepLater(entry);
}
