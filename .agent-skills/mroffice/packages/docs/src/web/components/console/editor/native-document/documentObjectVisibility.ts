/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import type { Step } from "@tiptap/pm/transform";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Word's Selection Pane visibility (Microsoft Support, "Manage objects with
 * the Selection Pane"): the eye beside an object hides it (it is neither
 * drawn nor printed but stays in the document, listed in the pane), and
 * Show All / Hide All toggle every listed object at once.
 *
 * A SHAPE's eye is its own `hidden` attribute, Word's `wp:docPr/@hidden`,
 * which both DOCX writers write and both importers read (documentShape).
 * This module carries the eye for the other floating families the pane
 * lists, pictures and text boxes, as `selectionPaneHidden`. Their writers
 * (the native picture writer and the source-package save of an imported
 * Word file) have no `wp:docPr/@hidden` carrier for them, so the flag is
 * document-local: it round-trips through MRAI's own document,
 * collaboration and undo, and an exported DOCX shows the picture.
 *
 * A hidden picture or text box is painted with `visibility: hidden` through
 * a node decoration (so its NodeView needs no new attribute handling) and
 * ignores the pointer.
 */

export const SELECTION_PANE_HIDDEN_ATTR = "selectionPaneHidden";
export const DOCUMENT_OBJECT_HIDDEN_CLASS = "document-object-hidden";

/**
 * The listed objects this flag hides: pictures and text boxes. Shapes use
 * their own `hidden` (`wp:docPr/@hidden`); charts, SmartArt, Mermaid / code
 * charts, whiteboards and files keep a closed attribute contract with the
 * page validator (a chart's attrs are the shared chart schema's), so they
 * are listed without an eye.
 */
export const SELECTION_PANE_OBJECT_TYPES = [
  "image",
  "inlineImage",
  "textBox",
] as const;

const OBJECT_TYPE_SET: ReadonlySet<string> = new Set(
  SELECTION_PANE_OBJECT_TYPES,
);

/** Whether a node can carry the Selection Pane's hidden flag. */
export function canHideInSelectionPane(
  node: ProseMirrorNode | null | undefined,
): boolean {
  return Boolean(
    node &&
      OBJECT_TYPE_SET.has(node.type.name) &&
      SELECTION_PANE_HIDDEN_ATTR in (node.type.spec.attrs ?? {}),
  );
}

export function isSelectionPaneHidden(node: ProseMirrorNode | null | undefined): boolean {
  return node?.attrs?.[SELECTION_PANE_HIDDEN_ATTR] === true;
}

const pluginKey = new PluginKey<DecorationSet>("documentObjectVisibility");

function hiddenDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (OBJECT_TYPE_SET.has(node.type.name)) {
      if (isSelectionPaneHidden(node)) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: DOCUMENT_OBJECT_HIDDEN_CLASS,
            "data-selection-pane-hidden": "true",
          }),
        );
      }
      return false;
    }
    return true;
  });
  return decorations.length
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

/**
 * Set the visibility of the objects at `positions` in one transaction (one
 * undo step). Positions that no longer hold a listed object are skipped;
 * returns null when nothing changes.
 */
export function setObjectsHidden(
  tr: Transaction,
  positions: readonly number[],
  hidden: boolean,
): Transaction | null {
  let changed = false;
  for (const pos of positions) {
    const node = tr.doc.nodeAt(pos);
    if (!node || !OBJECT_TYPE_SET.has(node.type.name)) continue;
    if (!(SELECTION_PANE_HIDDEN_ATTR in (node.type.spec.attrs ?? {}))) continue;
    if (isSelectionPaneHidden(node) === hidden) continue;
    tr.setNodeMarkup(
      pos,
      undefined,
      { ...node.attrs, [SELECTION_PANE_HIDDEN_ATTR]: hidden },
      node.marks,
    );
    changed = true;
  }
  return changed ? tr : null;
}

/** Whether a step can bring a hidden object into the document. */
function stepMayHide(step: Step): boolean {
  const { slice, attr } = step as unknown as { slice?: Slice; attr?: string };
  if (attr === SELECTION_PANE_HIDDEN_ATTR) return true;
  if (!slice) return false;
  let found = false;
  slice.content.descendants((node) => {
    if (!found && isSelectionPaneHidden(node)) found = true;
    return !found;
  });
  return found;
}

const DocumentObjectVisibility = Extension.create({
  name: "documentObjectVisibility",

  addGlobalAttributes() {
    return [
      {
        types: [...SELECTION_PANE_OBJECT_TYPES],
        attributes: {
          [SELECTION_PANE_HIDDEN_ATTR]: {
            default: false,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-selection-pane-hidden") === "true",
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs[SELECTION_PANE_HIDDEN_ATTR] === true
                ? { "data-selection-pane-hidden": "true" }
                : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_config, state) => hiddenDecorations(state.doc),
          apply: (tr, value, _old, state) => {
            if (!tr.docChanged) return value;
            // With nothing hidden, only a step that brings a hidden object
            // in (a toggle, a paste, a remote change) needs a rescan.
            if (
              value === DecorationSet.empty &&
              !tr.steps.some(stepMayHide)
            ) {
              return value;
            }
            return hiddenDecorations(state.doc);
          },
        },
        props: {
          decorations: (state) => pluginKey.getState(state),
        },
      }),
    ];
  },
});

export default DocumentObjectVisibility;
