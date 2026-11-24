"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import {
  normalizeEquationInputMode,
  normalizeEquationLayoutMode,
  type EquationInputMode,
  type EquationLayoutMode,
  type EquationStructureId,
} from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import { type EquationPlacement } from "@mrnote/core/web/components/console/editor/extensions/equationPlacement.ts";

// The tab's pieces live with the shared tab; Docs' callers keep importing
// them from here.

import { openEquationEditors } from "../extensions/openEquationEditors";
import type { EquationInsertPayload } from "@mrnote/core/web/components/console/editor/native-document/DocumentEquationGalleryMenu.tsx";

const EQUATION_NODE_TYPES = new Set(["mathBlock", "inlineMath"]);

export interface DocumentEquationSelection {
  pos: number;
  nodeType: "mathBlock" | "inlineMath";
  latex: string;
  inputMode: EquationInputMode;
  layoutMode: EquationLayoutMode;
}

export type DocumentEquationCommand =
  | { type: "inputMode"; value: EquationInputMode }
  | { type: "layoutMode"; value: EquationLayoutMode }
  | { type: "placement"; value: EquationPlacement }
  | { type: "symbol"; id: string }
  | { type: "structure"; id: EquationStructureId }
  | { type: "structureMember"; id: string };

export type DocumentEquationCommandResult =
  | { ok: true; selection: DocumentEquationSelection }
  | {
      ok: false;
      reason:
        | "stale_selection"
        | "readonly"
        | "unknown_structure_member"
        | "unknown_symbol"
        | "unsupported_unicode"
        | "unsupported_text"
        | "unsupported_placement";
    };

/**
 * The equation the contextual controls act on: an explicit atom
 * NodeSelection, or the equation open in its editor. Word shows the Equation
 * tab while the insertion point is inside an equation ("Write an equation or
 * formula", Microsoft Support); typing in the open editor moves the browser
 * selection into it, which ProseMirror reads back as a caret beside the atom,
 * so the open editor itself is the evidence. A caret merely adjacent to an
 * inline equation, with no editor open, must not switch tabs.
 */
export function readDocumentEquationSelection(
  editor: Editor,
): DocumentEquationSelection | null {
  // The equation open in its editor comes first: double-clicking an
  // equation in a table cell opens its editor while ProseMirror's selection
  // can still be the equation selected before it, and the ribbon's commands
  // then rewrote that other equation (live Word audit WUA 046).
  const selection = editor.state.selection;
  const selected =
    openEquationEditorTarget(editor) ??
    (selection instanceof NodeSelection &&
    EQUATION_NODE_TYPES.has(selection.node.type.name)
      ? { node: selection.node, pos: selection.from }
      : null);
  if (!selected) return null;
  const node = selected.node;
  return {
    pos: selected.pos,
    nodeType: node.type.name as "mathBlock" | "inlineMath",
    latex: String(node.attrs.latex ?? ""),
    inputMode: normalizeEquationInputMode(node.attrs.inputMode),
    layoutMode: normalizeEquationLayoutMode(node.attrs.layoutMode),
  };
}

/** The equation whose visual editor is open (its node view says so). */
function openEquationEditorTarget(
  editor: Editor,
): { node: ProseMirrorNode; pos: number } | null {
  let open: Element | null = null;
  try {
    const candidates = openEquationEditors(editor.view.dom);
    // The one the keyboard is in, when more than one is open.
    const active = editor.view.dom.ownerDocument.activeElement;
    open =
      candidates.find((candidate) => active instanceof Element && candidate.contains(active)) ??
      candidates[0] ??
      null;
  } catch {
    return null;
  }
  if (!open) return null;
  // The open editor's own node, from its DOM: walking the document asked the
  // view for the DOM of every formula before it (thousands in a math book).
  try {
    const pos = editor.view.posAtDOM(open, 0) - 1;
    const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
    if (node && EQUATION_NODE_TYPES.has(node.type.name) && editor.view.nodeDOM(pos) === open) return { node, pos };
  } catch {
    // The walk below answers.
  }
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (EQUATION_NODE_TYPES.has(node.type.name) && editor.view.nodeDOM(pos) === open) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}
