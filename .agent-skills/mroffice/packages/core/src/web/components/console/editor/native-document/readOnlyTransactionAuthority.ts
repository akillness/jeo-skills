"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import type { Transaction } from "@tiptap/pm/state";

import { MRNOTE_BLOCK_IDENTITY_META } from "./blockIds";
import { commentOnlyLaneActive, isCommentOnlyTransaction } from "./commentOnlyLane";

/**
 * Closed, auditable reasons that may change a read-only document.
 *
 * `addToHistory:false` is deliberately NOT authority. Any caller can set it,
 * including a future command that forgot its own editability gate. A named
 * reason is accepted only together with history suppression, so trusted
 * system work remains non-undoable without turning that suppression flag into
 * a general write bypass.
 */
export const READ_ONLY_TRUSTED_MUTATION_META =
  "mrnoteReadOnlyTrustedDocumentMutation";

export type ReadOnlyTrustedMutationReason =
  | "content-restoration"
  // A later part of a Word document held as parts, appended as the reader
  // nears the end of what is loaded (lib/document-page-parts).
  | "document-part-load"
  // A later part merged with the server's after a save conflict (both
  // sides kept): saved, never the user's to undo.
  | "document-part-merge"
  | "font-record-adoption"
  | "hydration-content"
  | "hydration-restore"
  | "layout-normalization"
  | "session-view";

type NonHistoricalTrustedMutationReason = ReadOnlyTrustedMutationReason;

const trustedStandaloneMutationReasons =
  new Set<NonHistoricalTrustedMutationReason>([
    // The server rewrote this page's own font records while saving it; the
    // document keeps the same text and the same faces, and the change is not
    // the user's to undo.
    "font-record-adoption",
    "document-part-load",
    "document-part-merge",
    "hydration-restore",
    "layout-normalization",
    "session-view",
  ]);

const STRUCTURAL_REBALANCE_META = "structuralRebalance";
const DOCUMENT_SHELL_IMPORT_TOKEN_META = "mrnoteDocumentShellImportToken";
const documentShellImportTokenBrand = Symbol("documentShellImportToken");

export interface DocumentShellImportAuthorityToken {
  readonly [documentShellImportTokenBrand]: true;
}

const liveDocumentShellImportAuthorities = new WeakMap<
  Editor,
  Map<DocumentShellImportAuthorityToken, () => boolean>
>();

export function createDocumentShellImportAuthorityToken(): DocumentShellImportAuthorityToken {
  return Object.freeze({
    [documentShellImportTokenBrand]: true,
  }) as DocumentShellImportAuthorityToken;
}

export function registerDocumentShellImportAuthority(
  editor: Editor,
  token: DocumentShellImportAuthorityToken,
  isLive: () => boolean,
): () => void {
  let authorities = liveDocumentShellImportAuthorities.get(editor);
  if (!authorities) {
    authorities = new Map();
    liveDocumentShellImportAuthorities.set(editor, authorities);
  }
  if (authorities.has(token)) {
    throw new Error("Document shell import authority is already registered.");
  }
  authorities.set(token, isLive);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = liveDocumentShellImportAuthorities.get(editor);
    current?.delete(token);
    if (current?.size === 0) {
      liveDocumentShellImportAuthorities.delete(editor);
    }
  };
}

function documentShellImportAuthorityIsLive(
  editor: Editor | undefined,
  token: unknown,
): boolean {
  if (!editor || typeof token !== "object" || token === null) {
    return false;
  }
  try {
    if (!(documentShellImportTokenBrand in token)) return false;
  } catch {
    return false;
  }
  const isLive = liveDocumentShellImportAuthorities
    .get(editor)
    ?.get(token as DocumentShellImportAuthorityToken);
  if (!isLive) return false;
  try {
    return isLive() === true;
  } catch {
    return false;
  }
}

type ReadOnlyTransactionProbe = Pick<Transaction, "docChanged" | "getMeta">;

function isTransactionProbe(value: unknown): value is ReadOnlyTransactionProbe {
  return (
    typeof value === "object" &&
    value !== null &&
    "docChanged" in value &&
    "getMeta" in value &&
    typeof (value as { getMeta?: unknown }).getMeta === "function"
  );
}

function hasDirectTrustedMutationAuthority(
  transaction: ReadOnlyTransactionProbe,
  editor?: Editor,
): boolean {
  // Collaborative remote steps are the CRDT source of truth. Dropping one
  // would diverge the local replica from the shared document.
  if (transaction.getMeta("y-sync$") !== undefined) return true;

  const importToken = transaction.getMeta(DOCUMENT_SHELL_IMPORT_TOKEN_META);
  if (importToken !== undefined) {
    return (
      transaction.getMeta("addToHistory") !== false &&
      documentShellImportAuthorityIsLive(editor, importToken)
    );
  }
  const reason = transaction.getMeta(READ_ONLY_TRUSTED_MUTATION_META);
  // TipTap also puts preventUpdate on clearContent(false), so it is never
  // authority by itself. Whole-document hydration needs the closed reason,
  // preventUpdate, and history suppression together.
  if (reason === "hydration-content" || reason === "content-restoration") {
    return (
      transaction.getMeta("preventUpdate") === true &&
      transaction.getMeta("addToHistory") === false
    );
  }
  if (
    typeof reason === "string" &&
    trustedStandaloneMutationReasons.has(
      reason as NonHistoricalTrustedMutationReason,
    ) &&
    transaction.getMeta("addToHistory") === false
  ) {
    return true;
  }

  // Pagination's closed structural normalizer predates the shared helper.
  // Preserve only the exact existing meta AND its non-undoable contract.
  // The block-identity backfill (blockIds.ts) is the same kind of closed,
  // non-undoable normalizer: it stamps `block_id` on nodes an admitted
  // transaction created and changes nothing an author wrote. It has to be
  // named here: ProseMirror filters an appended transaction BEFORE stamping
  // its root (`appendedTransaction`), so while the editor is read-only (an
  // import locks it) the backfill of the imported nodes could not inherit
  // the import's authority and was silently dropped. The page then carried
  // the picture without an id, the save draft minted one, and the causal
  // capture refused the mismatch (`page_causal_capture_failed`): every
  // picture import into a collaborative page failed and quarantined its
  // autosave.
  return (
    (transaction.getMeta(STRUCTURAL_REBALANCE_META) === true ||
      transaction.getMeta(MRNOTE_BLOCK_IDENTITY_META) === true) &&
    transaction.getMeta("addToHistory") === false
  );
}

function hasTrustedMutationAuthority(
  transaction: ReadOnlyTransactionProbe,
  visited: Set<ReadOnlyTransactionProbe>,
  editor?: Editor,
): boolean {
  if (visited.has(transaction)) return false;
  visited.add(transaction);

  if (hasDirectTrustedMutationAuthority(transaction, editor)) return true;

  // ProseMirror identifies plugin-derived transactions with their originating
  // transaction. Derived document work inherits authority only from an
  // explicitly trusted root. A pure selection is allowed itself, but it does
  // not authorize a plugin to append a document mutation.
  const root = transaction.getMeta("appendedTransaction");
  return (
    isTransactionProbe(root) &&
    hasTrustedMutationAuthority(root, visited, editor)
  );
}

export function isTrustedReadOnlyDocumentMutation(
  transaction: ReadOnlyTransactionProbe | null | undefined,
  editor?: Editor,
): boolean {
  return Boolean(
    transaction?.docChanged &&
    hasTrustedMutationAuthority(transaction, new Set(), editor),
  );
}

/**
 * Evidence that the user personally erased the page, which is the only thing
 * that may mint the destructive-clear credential the API consumes. Being
 * merely untrusted is not that evidence: a non-undoable or plugin-appended
 * transaction changes the document without the user ever choosing it, and an
 * origin this module does not recognize must fail closed rather than credential
 * an overwrite of saved content.
 */
/**
 * A document change kept out of the writer's Undo stack that is still the
 * user's to save: a Like on a comment, a comment's materialized id. Without
 * it a collaborative page treated the change as maintenance and never saved
 * it (WUA 229: a Like showed, then was gone after reopening).
 */
export const SAVED_WITHOUT_HISTORY_META = "mrnoteSavedWithoutHistory";

export function isUserAuthoredDocumentMutation(
  transaction: ReadOnlyTransactionProbe | null | undefined,
): boolean {
  if (!transaction?.docChanged) return false;
  // Undo/Redo on a collaborative page runs through the Y.UndoManager, which
  // only ever reverts this client's own changes; y-sync applies the result
  // as a non-history transaction marked as an undo/redo. That IS the user's
  // command: undoing a drawing back to a blank page is a deliberate clear,
  // and without the credential the save of it was refused ("Refusing to
  
  const ySync = transaction.getMeta(ySyncPluginKey) as
    | { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean }
    | undefined;
  if (ySync?.isChangeOrigin === true && ySync.isUndoRedoOperation === true) {
    return true;
  }
  if (transaction.getMeta("addToHistory") === false) return false;
  if (transaction.getMeta("appendedTransaction")) return false;
  return !isTrustedReadOnlyDocumentMutation(transaction);
}

export function trustReadOnlyDocumentMutation<T extends Transaction>(
  transaction: T,
  reason: NonHistoricalTrustedMutationReason,
): T {
  transaction.setMeta(READ_ONLY_TRUSTED_MUTATION_META, reason);
  transaction.setMeta("addToHistory", false);
  return transaction;
}

export function authorizeDocumentShellImportMutation<T extends Transaction>(
  transaction: T,
  token: DocumentShellImportAuthorityToken,
): T {
  transaction.setMeta(DOCUMENT_SHELL_IMPORT_TOKEN_META, token);
  return transaction;
}

/**
 * Last defense beneath every toolbar, keymap, plugin and retained command.
 * Individual command gates remain responsible for truthful disabled UI and a
 * false return value; this filter prevents any missed or future entry point
 * from mutating a live read-only document.
 */
export const ReadOnlyTransactionAuthority = Extension.create({
  name: "readOnlyTransactionAuthority",
  priority: 20_000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        filterTransaction(transaction) {
          // Re-read live authority at dispatch time. A retained command cannot
          // rely on the editability that existed when it was rendered.
          if (editor.isEditable) return true;
          if (!transaction.docChanged) return true;
          // Word's "Comments" restriction: the text stays locked, a comment's
          // own steps go through (commentOnlyLane.ts).
          if (commentOnlyLaneActive(editor) && isCommentOnlyTransaction(transaction)) return true;
          return isTrustedReadOnlyDocumentMutation(transaction, editor);
        },
      }),
    ];
  },
});

export default ReadOnlyTransactionAuthority;
