/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";

export type SelectionBias = -1 | 1;

/**
 * Resolve a structural hit (for example a pageBlock boundary) to a legal
 * selection, preferring the nearest inline caret in the requested direction.
 */
export function selectionNearInlineContent(
  doc: ProseMirrorNode,
  requestedPosition: number,
  bias: SelectionBias = 1,
): Selection {
  const finitePosition = Number.isFinite(requestedPosition)
    ? Math.trunc(requestedPosition)
    : 0;
  const position = Math.min(Math.max(finitePosition, 0), doc.content.size);
  const resolved = doc.resolve(position);
  const oppositeBias: SelectionBias = bias === 1 ? -1 : 1;

  return (
    Selection.findFrom(resolved, bias, true) ??
    Selection.findFrom(resolved, oppositeBias, true) ??
    Selection.near(resolved, bias)
  );
}
