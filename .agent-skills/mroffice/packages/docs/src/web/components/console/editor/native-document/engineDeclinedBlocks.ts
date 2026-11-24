/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/**
 * The paragraphs the text engine left to the browser (a face it cannot read
 * a character's width from, an auto-layout table's cell): their lines are
 * the browser's, and the Word rules the engine would keep for them are kept
 * by the projections that serve the browser's lines (justifiedSpaceShrink).
 * Keyed by node: a paragraph edited since is measured by the engine again.
 */
const declined = new WeakSet<ProseMirrorNode>();
let declinedSinceRead = false;

/** The engine leaves `node`'s lines to the browser. */
export function noteEngineDeclinedBlock(node: ProseMirrorNode): void {
  if (declined.has(node)) return;
  declined.add(node);
  declinedSinceRead = true;
}

export function engineDeclinedBlock(node: ProseMirrorNode): boolean {
  return declined.has(node);
}

/** Whether a paragraph was left to the browser since this was last asked. */
export function takeEngineDeclinedNews(): boolean {
  const news = declinedSinceRead;
  declinedSinceRead = false;
  return news;
}

/** The textblock `element` draws, or null. */
export function textblockOfElement(view: EditorView, element: HTMLElement): ProseMirrorNode | null {
  try {
    const node = view.state.doc.nodeAt(view.posAtDOM(element, 0) - 1);
    return node?.isTextblock ? node : null;
  } catch {
    return null;
  }
}
