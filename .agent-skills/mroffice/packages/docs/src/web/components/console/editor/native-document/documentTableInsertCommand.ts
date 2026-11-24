/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { createTable } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import {
  DOCUMENT_VIRTUAL_TABLE_FORBIDDEN_ANCESTORS,
  DOCUMENT_VIRTUAL_TABLE_NODE_NAME,
  DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_DOCUMENT_OVERHEAD_BYTES,
  DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_MAX_BYTES,
  createDocumentVirtualTableAttrs,
  estimateDocumentWithVirtualTablesNativeXmlBytes,
  estimateDocumentVirtualTableNativeTableXmlBytes,
} from "@mrnote/core/web/components/console/editor/native-document/documentVirtualTableModel.ts";
import { applyDocumentTableLayoutPolicy } from "@mrnote/core/web/components/console/editor/native-document/tableStructure.ts";
import {
  DOCUMENT_TABLE_DENSE_REPRESENTATION,
  DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS,
  type DocumentTableDenseAdmissionReason,
  type DocumentTableLayoutPolicy,
  normalizeDocumentTableLayoutPolicy,
  validateDocumentTableDenseAdmission,
} from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";

export interface DocumentTableInsertSelection {
  readonly from: number;
  readonly to: number;
}

export interface DocumentTableInsertRequest {
  readonly editor: Editor;
  readonly sourceDocument: ProseMirrorNode;
  readonly selection: DocumentTableInsertSelection;
  readonly rows: number;
  readonly columns: number;
  readonly policy: DocumentTableLayoutPolicy;
}

export type DocumentTableInsertFailureReason =
  | DocumentTableDenseAdmissionReason
  | "editor_readonly"
  | "native_output_estimate_limit"
  | "selection_invalid"
  | "sparse_table_container_unsupported"
  | "transaction_rejected";

export type DocumentTableInsertResult =
  | {
      readonly ok: true;
      readonly rows: number;
      readonly columns: number;
      readonly policy: DocumentTableLayoutPolicy;
    }
  | {
      readonly ok: false;
      readonly reason: DocumentTableInsertFailureReason;
    };

/**
 * The caret position in the first cell of the table node that was just
 * inserted. The table is found by IDENTITY (ProseMirror inserts the very node
 * instance it is given), never by guessing "the table nearest the insertion
 * point": inside a table cell the nearest table is the OUTER one, whose first
 * cell the caret would otherwise jump back to.
 */
function firstCellTextPositionOf(
  doc: ProseMirrorNode,
  inserted: ProseMirrorNode,
): number | null {
  let tablePos: number | null = null;
  doc.descendants((node, pos) => {
    if (tablePos !== null) return false;
    if (node === inserted) {
      tablePos = pos;
      return false;
    }
    return true;
  });
  if (tablePos === null) return null;
  const start: number = tablePos;

  let firstCellTextPosition: number | null = null;
  doc.nodesBetween(
    start + 1,
    start + inserted.nodeSize - 1,
    (node, pos, parent) => {
      if (
        firstCellTextPosition === null &&
        node.type.name === "paragraph" &&
        (parent?.type.name === "tableCell" ||
          parent?.type.name === "tableHeader")
      ) {
        firstCellTextPosition = pos + 1;
        return false;
      }
      return firstCellTextPosition === null;
    },
  );
  return firstCellTextPosition;
}

function samePolicy(
  left: DocumentTableLayoutPolicy,
  right: DocumentTableLayoutPolicy,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.mode === right.mode &&
    (left.fixedWidthTwips ?? null) === (right.fixedWidthTwips ?? null)
  );
}

/**
 * The single table insertion authority used by every Insert Table alias.
 *
 * Dense tables retain the existing <=5,000-cell path byte-for-byte. Larger
 * valid Word dimensions become one sparse atom; admission happens before any
 * grid cells are allocated. Both representations are completed in a private
 * transaction before its single view dispatch, so a failed request cannot
 * write a partial table or a second history item.
 */
export function insertDocumentTable(
  request: DocumentTableInsertRequest,
): DocumentTableInsertResult {
  const admission = validateDocumentTableDenseAdmission({
    representation: DOCUMENT_TABLE_DENSE_REPRESENTATION,
    rows: request.rows,
    columns: request.columns,
    policy: request.policy,
  });
  const useSparseRepresentation =
    !admission.ok && admission.reason === "dense_cell_budget_exceeded";
  if (!admission.ok && !useSparseRepresentation) {
    return { ok: false, reason: admission.reason };
  }

  if (request.editor.isDestroyed || !request.editor.isEditable) {
    return { ok: false, reason: "editor_readonly" };
  }
  if (request.editor.state.doc !== request.sourceDocument) {
    return { ok: false, reason: "selection_invalid" };
  }

  const { from, to } = request.selection;
  const maximumPosition = request.editor.state.doc.content.size;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > maximumPosition
  ) {
    return { ok: false, reason: "selection_invalid" };
  }

  let transaction = request.editor.state.tr;
  try {
    // Mirror TipTap's canonical insertTable transaction semantics, but build
    // the complete policy-bearing node before touching the editor view. A
    // later validation/construction failure therefore leaves no partial table
    // for CommandManager.run() to dispatch.
    transaction = transaction.setSelection(
      TextSelection.create(transaction.doc, from, to),
    );
    if (useSparseRepresentation) {
      const policy = normalizeDocumentTableLayoutPolicy(request.policy);
      if (!policy) return { ok: false, reason: "invalid_layout_policy" };
      if (
        policy.mode === "initial_fixed" &&
        (policy.fixedWidthTwips ?? 0) * request.columns >
          DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
      ) {
        return { ok: false, reason: "fixed_width_total_exceeded" };
      }
      const sparseTableNativeXmlBytes =
        estimateDocumentVirtualTableNativeTableXmlBytes({
          rows: request.rows,
          columns: request.columns,
          cells: [],
          rowOverrides: [],
        });
      if (
        sparseTableNativeXmlBytes === null ||
        sparseTableNativeXmlBytes +
          DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_DOCUMENT_OVERHEAD_BYTES >=
          DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_MAX_BYTES
      ) {
        return { ok: false, reason: "native_output_estimate_limit" };
      }
      const sparseAttrs = createDocumentVirtualTableAttrs({
        rows: request.rows,
        columns: request.columns,
        tableLayoutPolicy: policy.mode,
        tableFixedWidthTwips: policy.fixedWidthTwips,
      });
      const sparseType =
        request.editor.schema.nodes[DOCUMENT_VIRTUAL_TABLE_NODE_NAME];
      if (!sparseAttrs || !sparseType) {
        return { ok: false, reason: "transaction_rejected" };
      }
      transaction.replaceSelectionWith(sparseType.create(sparseAttrs));
      const nativeXmlBytes = estimateDocumentWithVirtualTablesNativeXmlBytes(
        transaction.doc.toJSON(),
      );
      if (
        nativeXmlBytes === null ||
        nativeXmlBytes >= DOCUMENT_VIRTUAL_TABLE_NATIVE_XML_MAX_BYTES
      ) {
        return { ok: false, reason: "native_output_estimate_limit" };
      }
      let sparsePosition: number | null = null;
      transaction.doc.descendants((node, pos) => {
        if (
          node.type === sparseType &&
          node.attrs.tableId === sparseAttrs.tableId
        ) {
          sparsePosition = pos;
          return false;
        }
        return sparsePosition === null;
      });
      if (sparsePosition === null) {
        return { ok: false, reason: "transaction_rejected" };
      }
      // A table this large is one body-level Word table. Where the caret sits
      // in a quote, a list or a table cell it would land inside that container,
      // a shape the page-content schema and the API refuse to save — so the
      // request is refused here, before the document or its history change.
      const $sparse = transaction.doc.resolve(sparsePosition);
      for (let depth = $sparse.depth; depth > 0; depth -= 1) {
        if (
          DOCUMENT_VIRTUAL_TABLE_FORBIDDEN_ANCESTORS.has(
            $sparse.node(depth).type.name,
          )
        ) {
          return { ok: false, reason: "sparse_table_container_unsupported" };
        }
      }
      transaction
        .setSelection(NodeSelection.create(transaction.doc, sparsePosition))
        .scrollIntoView();
    } else {
      const baseTable = createTable(
        request.editor.schema,
        request.rows,
        request.columns,
        false,
      );
      const policyJson = applyDocumentTableLayoutPolicy(
        baseTable.toJSON(),
        request.policy,
      );
      const policyTable = request.editor.schema.nodeFromJSON(policyJson);
      const appliedPolicy: DocumentTableLayoutPolicy = {
        schemaVersion: 1,
        mode: policyTable.attrs.tableLayoutPolicy,
        fixedWidthTwips: policyTable.attrs.tableFixedWidthTwips ?? undefined,
      };
      if (!samePolicy(appliedPolicy, request.policy)) {
        return { ok: false, reason: "transaction_rejected" };
      }

      transaction.replaceSelectionWith(policyTable).scrollIntoView();
      const firstCellTextPosition = firstCellTextPositionOf(
        transaction.doc,
        policyTable,
      );
      if (firstCellTextPosition === null) {
        return { ok: false, reason: "transaction_rejected" };
      }
      transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(firstCellTextPosition), 1),
      );
    }
  } catch {
    return { ok: false, reason: "transaction_rejected" };
  }

  request.editor.view.dispatch(transaction);
  return {
    ok: true,
    rows: request.rows,
    columns: request.columns,
    policy: request.policy,
  };
}
