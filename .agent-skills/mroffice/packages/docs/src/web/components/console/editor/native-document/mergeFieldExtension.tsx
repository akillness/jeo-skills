"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import {
  MAIL_MERGE_DATA_ATTR,
  MERGE_FIELD_NODE_NAME,
  buildAddressBlockParts,
  buildGreetingLineParts,
  mergeConditionPlaceholder,
  mergeFieldPlaceholder,
  normalizeMailMergeData,
  normalizeMergeCondition,
  resolveMergeConditionDisplay,
  resolveMergeFieldDisplay,
  sanitizeMergeFieldName,
  type MailMergeData,
  type MailMergeCompositionPart,
  type MailMergeRecord,
  type MergeCondition,
} from "@mrnote/core/web/components/console/editor/native-document/mailMerge.ts";
import { trustReadOnlyDocumentMutation } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";

/**
 * Document MAIL MERGE (Word/WPS "邮件合并" parity) — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds:
 *   - ONE inline ATOM node ("mergeField") — a merge-field placeholder dropped at
 *     the caret carrying a sanitized `field` = a DATA COLUMN NAME. In the editor
 *     it renders as «FieldName»; during a PREVIEW its NodeView paints the current
 *     record's value instead (a display-only overlay — the field node itself is
 *     never mutated).
 *   - ONE optional top-level doc attribute ("mailMergeData") holding the recipient
 *     data source `{ columns, rows }`.
 *
 * The node + attribute round-trip through the document schema's open
 * `content`/`attrs` passthrough (see lib/native-page-schemas → documentNodeSchema
 * accepts any node type; documentDocAttrsSchema is a passthrough), so EXISTING
 * documents — which carry none of these — still validate and load unchanged. There
 * is no flag: the feature is purely opt-in per user action (Insert merge field /
 * Recipients); a document with no merge fields behaves exactly as before.
 *
 * PREVIEW MECHANISM: NoteEditor holds the active preview record in React state and
 * passes it down to the editor as the `documentMailMerge` storage's `record`
 * (set via the `setMailMergePreview` command, which is a meta-only transaction —
 * it does NOT touch the doc, so the persisted JSON keeps the field nodes verbatim).
 * Each mergeField NodeView reads that storage to decide whether to paint the
 * placeholder or the record's value, mirroring how the citation NodeView reads the
 * live source store to render its in-text marker.
 *
 * SECURITY: the node renders ONLY a sanitized `data-merge-field` attribute + a
 * fixed class; the field name + every cell value are scrubbed of control bytes and
 * clamped in ./mailMerge and always rendered as TEXT (React/TipTap escape them), so
 * a forged document can never smuggle markup or break out of the attribute surface.
 */

/**
 * Window CustomEvents the toolbar's Mail-merge buttons dispatch. NoteEditor listens
 * for them to open the field picker / recipients dialog (decoupling the thin
 * toolbar triggers from the dialog UI). Mirrors INSERT_CITATION_EVENT.
 */
export const INSERT_MERGE_FIELD_EVENT = "mrnote:insert-merge-field";
export const OPEN_MAIL_MERGE_RECIPIENTS_EVENT = "mrnote:mail-merge-recipients";
export interface OpenMergeFieldPickerDetail {
  opener?: HTMLElement | null;
}
export type MailMergeDialogAction =
  | "recipients"
  | "mergeType"
  | "filterSort"
  | "addressBlock"
  | "greetingLine"
  | "matchFields"
  | "rules"
  | "preview"
  | "finishDocx";
export interface OpenMailMergeDialogDetail {
  action: MailMergeDialogAction;
  presetMergeType?: "envelopes" | "labels";
  opener?: HTMLElement | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentMailMerge: {
      /**
       * Insert a merge field for the given data column at the caret. No-op when the
       * field name sanitizes to empty (an unusable column). The name is sanitized
       * (and clamped) at the command edge.
       */
      insertMergeField: (field: string) => ReturnType;
      insertMergeCondition: (condition: unknown) => ReturnType;
      /** Insert a mapped address block as editable MERGEFIELD atoms + breaks. */
      insertMergeAddressBlock: (data: unknown) => ReturnType;
      /** Insert a mapped greeting line as editable literal/MERGEFIELD runs. */
      insertMergeGreetingLine: (data: unknown) => ReturnType;
      /**
       * Replace the recipient data source (the `{ columns, rows }` store) on the
       * top-level doc attrs. The candidate is normalized; passing empty/garbage
       * clears the store. Used by the Recipients dialog (paste CSV/TSV) and the
       * on-load restore path.
       */
      setMailMergeData: (data: unknown) => ReturnType;
      /**
       * Re-apply the data source onto the top-level doc attrs from a value read out
       * of persisted content. setContent restores only the doc's CHILDREN (incl. the
       * mergeField nodes) and DISCARDS the doc node's own attrs, so the store must be
       * re-attached on load (history-suppressed). Mirrors restoreSources. Always
       * returns true.
       */
      restoreMailMergeData: (data: unknown) => ReturnType;
      /**
       * Set (or clear, with null) the PREVIEW record. A meta-only transaction: it
       * updates the extension storage + forces a re-decoration so every mergeField
       * NodeView repaints, WITHOUT mutating the document. Always returns true.
       */
      setMailMergePreview: (record: MailMergeRecord | null) => ReturnType;
    };
  }
}

/** Read + normalize the recipient data source off a doc node's attrs. Never throws. */
export function readMailMergeData(doc: ProseMirrorNode): MailMergeData {
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  return normalizeMailMergeData(attrs[MAIL_MERGE_DATA_ATTR]);
}

/** Convenience reader off an EditorState. */
export function getMailMergeData(state: EditorState): MailMergeData {
  return readMailMergeData(state.doc);
}

/** Shape of the extension storage holding the live preview record. */
interface MailMergeStorage {
  record: MailMergeRecord | null;
}

function insertCompositionParts(
  parts: readonly MailMergeCompositionPart[],
  state: EditorState,
  tr: Transaction,
  dispatch?: (transaction: Transaction) => void,
): boolean {
  const fieldType = state.schema.nodes[MERGE_FIELD_NODE_NAME];
  const hardBreakType = state.schema.nodes.hardBreak;
  if (!fieldType || parts.length === 0) return false;
  const nodes: ProseMirrorNode[] = [];
  for (const part of parts) {
    if (part.kind === "field") {
      const field = sanitizeMergeFieldName(part.field);
      if (field) nodes.push(fieldType.create({ field }));
    } else if (part.kind === "text" && part.text) {
      nodes.push(state.schema.text(part.text));
    } else if (part.kind === "break" && hardBreakType) {
      nodes.push(hardBreakType.create());
    }
  }
  if (nodes.length === 0) return false;
  if (dispatch) {
    tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0));
    dispatch(tr);
  }
  return true;
}

/**
 * The in-text merge-field marker. In the un-previewed editing state it renders the
 * «FieldName» placeholder; while a record is being previewed it paints that
 * record's value for the field (an unbound field still shows the placeholder, so a
 * typo'd column is visible). The field name is read off the immutable node attrs
 * and re-sanitized so a forged value cannot smuggle markup; the preview record is
 * read from the extension storage (set by setMailMergePreview), so previewing is a
 * pure display overlay that never edits the persisted node.
 */
function MergeFieldView(props: NodeViewProps) {
  const { editor, node } = props;
  // A node carries EITHER a structured `condition` (IF field) or a plain
  // `field` (column name); the condition wins when present.
  const condition = node.attrs?.condition ?? null;
  const field = sanitizeMergeFieldName(node.attrs?.field);
  const storage = (editor.storage as unknown as Record<string, unknown>)[
    "documentMailMerge"
  ] as MailMergeStorage | undefined;
  const record = storage?.record ?? null;
  const previewing = record !== null;
  const display = condition
    ? previewing
      ? resolveMergeConditionDisplay(condition, record)
      : mergeConditionPlaceholder(condition)
    : previewing
      ? resolveMergeFieldDisplay(field, record)
      : mergeFieldPlaceholder(field);

  return (
    <NodeViewWrapper
      as="span"
      className={`mrnote-merge-field${previewing ? " mrnote-merge-field--preview" : ""}`}
      data-type="merge-field"
      data-merge-field={!condition && field ? field : undefined}
      data-merge-condition={condition ? "1" : undefined}
      data-testid="merge-field"
      contentEditable={false}
    >
      {display}
    </NodeViewWrapper>
  );
}

/**
 * The inline merge-field ATOM node. parse/render funnel the field name through the
 * ./mailMerge sanitizer so a forged/imported value can never break out of the DOM
 * attribute surface or inject markup. The field name is carried on a
 * `data-merge-field` attribute (round-tripped through getHTML) and the placeholder
 * painted by the NodeView. Mirrors CrossReference (inline atom) for shape.
 */
const MergeField = Node.create({
  name: MERGE_FIELD_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      field: {
        default: "" as string,
        parseHTML: (element: HTMLElement) =>
          sanitizeMergeFieldName(element.getAttribute("data-merge-field")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const field = sanitizeMergeFieldName(attrs.field);
          return field ? { "data-merge-field": field } : {};
        },
      },
      // Optional structured IF/condition (mutually exclusive with `field`),
      // persisted as JSON in data-merge-condition so it round-trips through
      // getHTML like the other doc attrs; funneled through normalizeMergeCondition
      // on parse + render so a forged value can't store a malformed condition.
      condition: {
        default: null as MergeCondition | null,
        parseHTML: (element: HTMLElement) => {
          try {
            return normalizeMergeCondition(
              JSON.parse(
                element.getAttribute("data-merge-condition") || "null",
              ),
            );
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const cond = normalizeMergeCondition(attrs.condition);
          return cond ? { "data-merge-condition": JSON.stringify(cond) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="merge-field"]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    // Static serialization (HTML export path). A conditional node serializes its
    // JSON condition + the «IF column» placeholder; a plain field serializes its
    // name + the «field» placeholder. The live NodeView re-paints either (and
    // swaps in the resolved value while previewing).
    const condRaw = (HTMLAttributes as { "data-merge-condition"?: unknown })[
      "data-merge-condition"
    ];
    let condition: MergeCondition | null = null;
    if (typeof condRaw === "string" && condRaw) {
      try {
        condition = normalizeMergeCondition(JSON.parse(condRaw));
      } catch {
        condition = null;
      }
    }
    if (condition) {
      return [
        "span",
        mergeAttributes(
          {},
          { "data-merge-condition": JSON.stringify(condition) },
          { "data-type": "merge-field", class: "mrnote-merge-field" },
        ),
        mergeConditionPlaceholder(condition),
      ];
    }
    const field = sanitizeMergeFieldName(
      (HTMLAttributes as { "data-merge-field"?: unknown })["data-merge-field"],
    );
    return [
      "span",
      mergeAttributes({}, field ? { "data-merge-field": field } : {}, {
        "data-type": "merge-field",
        class: "mrnote-merge-field",
      }),
      mergeFieldPlaceholder(field),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(MergeFieldView);
  },
});

/**
 * The doc-level store: holds the recipient data source on the `doc` node so it
 * persists on doc.attrs through getJSON, and is re-attached on load via
 * `restoreMailMergeData` (mirrors CitationStore / DocumentComments).
 */
const MailMergeStore = Extension.create({
  name: "documentMailMergeStore",

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          [MAIL_MERGE_DATA_ATTR]: { default: null as MailMergeData | null },
        },
      },
    ];
  },
});

/**
 * The user-facing extension: registers the merge-field node + the data store + the
 * commands, and owns the live PREVIEW record in its storage. The commands keep the
 * data store on the doc attrs and the preview overlay in sync.
 */
export const DocumentMailMerge = Extension.create<
  Record<string, never>,
  MailMergeStorage
>({
  name: "documentMailMerge",

  addStorage() {
    return { record: null };
  },

  addExtensions() {
    return [MergeField, MailMergeStore];
  },

  addCommands() {
    return {
      insertMergeField:
        (field: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const fieldType = state.schema.nodes[MERGE_FIELD_NODE_NAME];
          if (!fieldType) return false;
          const name = sanitizeMergeFieldName(field);
          if (!name) return false;
          if (dispatch) {
            const node = fieldType.create({ field: name });
            tr.replaceSelectionWith(node, false);
            dispatch(tr);
          }
          return true;
        },

      insertMergeCondition:
        (condition: unknown) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const fieldType = state.schema.nodes[MERGE_FIELD_NODE_NAME];
          if (!fieldType) return false;
          const cond = normalizeMergeCondition(condition);
          if (!cond) return false;
          if (dispatch) {
            const node = fieldType.create({ condition: cond });
            tr.replaceSelectionWith(node, false);
            dispatch(tr);
          }
          return true;
        },

      insertMergeAddressBlock:
        (data: unknown) =>
        ({ editor, state, tr, dispatch }) =>
          editor.isEditable &&
          insertCompositionParts(
            buildAddressBlockParts(normalizeMailMergeData(data)),
            state,
            tr,
            dispatch,
          ),

      insertMergeGreetingLine:
        (data: unknown) =>
        ({ editor, state, tr, dispatch }) =>
          editor.isEditable &&
          insertCompositionParts(
            buildGreetingLineParts(normalizeMailMergeData(data)),
            state,
            tr,
            dispatch,
          ),

      setMailMergeData:
        (data: unknown) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const normalized = normalizeMailMergeData(data);
          // Byte-stable: store null (no attribute) when the source is empty rather
          // than an empty object, so a document that never gained recipients keeps
          // a clean doc-attrs surface.
          const next = normalized.columns.length > 0 ? normalized : null;
          if (dispatch) {
            tr.setDocAttribute(MAIL_MERGE_DATA_ATTR, next);
            dispatch(tr);
          }
          return true;
        },

      restoreMailMergeData:
        (data: unknown) =>
        ({ tr, dispatch }) => {
          const normalized = normalizeMailMergeData(data);
          const next = normalized.columns.length > 0 ? normalized : null;
          if (dispatch) {
            tr.setDocAttribute(MAIL_MERGE_DATA_ATTR, next);
            trustReadOnlyDocumentMutation(tr, "hydration-restore");
            dispatch(tr);
          }
          return true;
        },

      setMailMergePreview:
        (record: MailMergeRecord | null) =>
        ({ tr, dispatch }) => {
          // Update the storage the NodeView reads, then force a no-op doc-meta
          // transaction so every mergeField NodeView re-renders against the new
          // record. We never mutate the document — previewing is display-only.
          if (dispatch) {
            this.storage.record = record;
            tr.setMeta("addToHistory", false);
            tr.setMeta("mailMergePreview", true);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export default DocumentMailMerge;
