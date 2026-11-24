"use client";








/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { commentOnlyLaneActive, isCommentOnlyTransaction } from "@mrnote/core/web/components/console/editor/native-document/commentOnlyLane.ts";
import { normalizeDocumentProtection } from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";
import {
  RANGE_PERMISSION_NODE_NAME,
  collectEditableRanges,
  documentHasEditableRanges,
  nextEditableRange,
  normalizeRangePermissionAttrs,
  protectionHonorsEditableRanges,
  sliceHoldsMarker,
  spanHoldsMarker,
  transactionEditsOnlyEditableRanges,
} from "./rangePermissions";
import { isTrustedReadOnlyDocumentMutation } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";

const HIGHLIGHT_STORAGE_KEY = "mrnote.docs.highlightEditableRegions";
const HIGHLIGHT_META = "mrnoteEditableRegionHighlight";

function storedHighlight(): boolean {
  try {
    if (typeof window === "undefined") return true;
    // Word's checkbox is on until the reader turns it off.
    return window.localStorage.getItem(HIGHLIGHT_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function storeHighlight(on: boolean): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HIGHLIGHT_STORAGE_KEY, on ? "1" : "0");
    }
  } catch {
    // A private window keeps the choice for this page only.
  }
}

export interface RangePermissionPluginState {
  /** The document holds a region anyone may edit. */
  present: boolean;
  /** "Highlight the regions I can edit". */
  highlight: boolean;
}

export const rangePermissionPluginKey = new PluginKey<RangePermissionPluginState>(
  "documentRangePermissions",
);

/** Whether the document in `state` holds a region anyone may edit. */
export function editableRangesPresent(state: EditorState | null | undefined): boolean {
  return Boolean(state && rangePermissionPluginKey.getState(state)?.present);
}

export function editableRegionHighlightOn(state: EditorState | null | undefined): boolean {
  return state ? rangePermissionPluginKey.getState(state)?.highlight !== false : true;
}

/** Whether a transaction may have added or removed a marker. */
function touchesMarkers(tr: Transaction): boolean {
  return tr.steps.some((step, index) => {
    const json = step.toJSON() as { stepType?: unknown };
    if (json.stepType !== "replace" && json.stepType !== "replaceAround") return false;
    const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
    return sliceHoldsMarker(slice) || spanHoldsMarker(tr.docs[index], from, to);
  });
}

function onlyProtectionChange(tr: Transaction): boolean {
  return tr.steps.every((step) => {
    const json = step.toJSON() as { stepType?: unknown; attr?: unknown };
    return json.stepType === "docAttr" && json.attr === "documentProtection";
  });
}

function stripMarkers(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name === RANGE_PERMISSION_NODE_NAME) return;
    nodes.push(node.isLeaf ? node : node.copy(stripMarkers(node.content)));
  });
  return Fragment.fromArray(nodes);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentRangePermissions: {
      /** Word's "Highlight the regions I can edit". */
      setEditableRegionHighlight: (on: boolean) => ReturnType;
      /** Word's "Find Next Region I Can Edit": selects the next region. */
      goToNextEditableRegion: () => ReturnType;
    };
  }
}

export const RangePermission = Node.create({
  name: RANGE_PERMISSION_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    const attr = (name: string, data: string, number = false) => ({
      default: null,
      parseHTML: (element: HTMLElement) => {
        const raw = element.getAttribute(data);
        if (raw === null) return null;
        return number ? Number.parseInt(raw, 10) : raw;
      },
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[name] === null || attrs[name] === undefined ? {} : { [data]: String(attrs[name]) },
    });
    return {
      edge: attr("edge", "data-range-permission"),
      permissionId: attr("permissionId", "data-permission-id"),
      editorGroup: attr("editorGroup", "data-editor-group"),
      editor: attr("editor", "data-editor"),
      columnFirst: attr("columnFirst", "data-column-first", true),
      columnLast: attr("columnLast", "data-column-last", true),
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-range-permission]",
        getAttrs: (element) =>
          normalizeRangePermissionAttrs({
            edge: (element as HTMLElement).getAttribute("data-range-permission"),
            permissionId: (element as HTMLElement).getAttribute("data-permission-id"),
          })
            ? null
            : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "mrnote-range-permission" })];
  },
});

export const RangePermissionLane = Extension.create({
  name: "documentRangePermissionLane",

  addCommands() {
    return {
      setEditableRegionHighlight:
        (on: boolean) =>
        ({ tr, dispatch }) => {
          storeHighlight(on);
          if (dispatch) dispatch(tr.setMeta(HIGHLIGHT_META, on));
          return true;
        },
      goToNextEditableRegion:
        () =>
        ({ state, tr, dispatch }) => {
          const range = nextEditableRange(state.doc, state.selection.to);
          if (!range) return false;
          if (dispatch) {
            dispatch(tr.setSelection(TextSelection.create(tr.doc, range.from, range.to)).scrollIntoView());
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    let drawn: { doc: ProseMirrorNode; highlight: boolean; set: DecorationSet } | null = null;
    return [
      new Plugin<RangePermissionPluginState>({
        key: rangePermissionPluginKey,
        state: {
          init: (_config, state) => ({
            present: documentHasEditableRanges(state.doc),
            highlight: storedHighlight(),
          }),
          apply: (tr, value, _old, next) => {
            const highlight = tr.getMeta(HIGHLIGHT_META);
            const present =
              tr.docChanged && touchesMarkers(tr) ? documentHasEditableRanges(next.doc) : value.present;
            const nextHighlight = typeof highlight === "boolean" ? highlight : value.highlight;
            return present === value.present && nextHighlight === value.highlight
              ? value
              : { present, highlight: nextHighlight };
          },
        },
        // Under "No changes (Read only)" or "Comments", an edit goes through
        // only inside the regions anyone may edit (Word: "This modification
        // is not allowed because the selection is locked"). Fail closed: a
        // step this cannot place inside a region is refused.
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          const protection = state.doc.attrs?.documentProtection;
          if (!protectionHonorsEditableRanges(protection)) return true;
          if (isTrustedReadOnlyDocumentMutation(tr, editor)) return true;
          if (commentOnlyLaneActive(editor) && isCommentOnlyTransaction(tr)) return true;
          // Stopping a passwordless restriction (Restrict Editing > Stop
          // Protection) is the reader's to do; a password lock is not.
          if (onlyProtectionChange(tr)) {
            return !normalizeDocumentProtection(protection)?.credentials;
          }
          return transactionEditsOnlyEditableRanges(tr, {
            formattingLocked: normalizeDocumentProtection(protection)?.formatting === true,
          });
        },
        // The insertion point at a region's edge stands inside it: the place
        // before its opening bracket and the one after its closing bracket
        // are drawn where the region's own first and last places are.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          if (!protectionHonorsEditableRanges(newState.doc.attrs?.documentProtection)) return null;
          const { selection } = newState;
          if (!selection.empty || !(selection instanceof TextSelection)) return null;
          const pos = selection.from;
          const ranges = collectEditableRanges(newState.doc);
          if (!ranges.length) return null;
          const $pos = selection.$from;
          let target: number | null = null;
          if ($pos.nodeAfter?.type.name === RANGE_PERMISSION_NODE_NAME) {
            const after = pos + $pos.nodeAfter.nodeSize;
            if (ranges.some((range) => range.from === after)) target = after;
          }
          if (target === null && $pos.nodeBefore?.type.name === RANGE_PERMISSION_NODE_NAME) {
            const before = pos - $pos.nodeBefore.nodeSize;
            if (ranges.some((range) => range.to === before)) target = before;
          }
          if (target === null) return null;
          return newState.tr.setSelection(TextSelection.create(newState.doc, target)).setMeta("addToHistory", false);
        },
        props: {
          // A region is made by its author, never by a paste.
          transformPasted: (slice) =>
            sliceHoldsMarker(slice) ? new Slice(stripMarkers(slice.content), slice.openStart, slice.openEnd) : slice,
          decorations: (state) => {
            const value = rangePermissionPluginKey.getState(state);
            if (
              !value?.present ||
              !value.highlight ||
              !protectionHonorsEditableRanges(state.doc.attrs?.documentProtection)
            ) {
              return null;
            }
            if (drawn && drawn.doc === state.doc && drawn.highlight === value.highlight) return drawn.set;
            const decorations: Decoration[] = [];
            for (const range of collectEditableRanges(state.doc)) {
              const start = range.from - 1;
              decorations.push(
                Decoration.node(start, range.from, { class: "mrnote-range-permission-edge is-start" }),
                Decoration.node(range.to, range.to + 1, { class: "mrnote-range-permission-edge is-end" }),
              );
              if (range.to > range.from) {
                decorations.push(
                  Decoration.inline(range.from, range.to, { class: "mrnote-editable-region" }),
                );
              }
            }
            const set = DecorationSet.create(state.doc, decorations);
            drawn = { doc: state.doc, highlight: value.highlight, set };
            return set;
          },
        },
      }),
    ];
  },
});
