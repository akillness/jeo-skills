/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Paragraphs are never wrapped in an in-line object to make them fit.
 *
 * ProseMirror fits content where it does not belong by searching for a
 * wrapper whose content takes it (ContentMatch.findWrapping), both when the
 * clipboard is parsed in the caret's paragraph and when a slice is fitted
 * into a range. An in-line text box or shape (`inlineDocumentShape`) holds
 * paragraphs and sits in a line, so it was such a wrapper: two plain
 * paragraphs pasted from a web page into a paragraph became a 220 x 140
 * shape holding them, cut off at its edge (WUA 077). Without an in-line
 * wrapper the parser closes the paragraph and places the pasted ones beside
 * it, as Word does. A wrapper that is itself an in-line node is skipped;
 * the search is otherwise ProseMirror's own.
 */

import { ContentMatch, type NodeType } from "@tiptap/pm/model";

interface WrappingStep {
  readonly match: ContentMatch;
  readonly type: NodeType | null;
  readonly via: WrappingStep | null;
}

const PATCHED = Symbol.for("mrai.blockWrappingInline");

function computeWrappingWithoutInlineWrappers(
  this: ContentMatch,
  target: NodeType,
): readonly NodeType[] | null {
  const seen: Record<string, true> = Object.create(null);
  const active: WrappingStep[] = [{ match: this, type: null, via: null }];
  while (active.length) {
    const current = active.shift()!;
    const match = current.match;
    if (match.matchType(target)) {
      const result: NodeType[] = [];
      for (let step: WrappingStep | null = current; step?.type; step = step.via) {
        result.push(step.type);
      }
      return result.reverse();
    }
    for (let index = 0; index < match.edgeCount; index += 1) {
      const { type, next } = match.edge(index);
      if (
        !type.isLeaf &&
        !type.isInline &&
        !type.hasRequiredAttrs() &&
        !(type.name in seen) &&
        (!current.type || next.validEnd)
      ) {
        active.push({ match: type.contentMatch, type, via: current });
        seen[type.name] = true;
      }
    }
  }
  return null;
}

const prototype = ContentMatch.prototype as unknown as Record<PropertyKey, unknown>;
if (!prototype[PATCHED] && typeof prototype.computeWrapping === "function") {
  prototype[PATCHED] = true;
  prototype.computeWrapping = computeWrappingWithoutInlineWrappers;
}

export {};
