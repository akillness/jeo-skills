/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { bookmarkRangesFor } from "@mrnote/core/web/components/console/editor/native-document/bookmarkExtension.ts";
import { collectBookmarks } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";
import { commentRangesFor } from "@mrnote/core/web/components/console/editor/native-document/commentExtension.ts";
import { COMMENT_MARK_NAME, sanitizeThreadId } from "@mrnote/core/web/components/console/editor/native-document/comments.ts";
import {
  FOOTNOTE_MARK_NAME,
  noteStreamOf,
  resolveFootnoteMode,
  sanitizeFootnoteId,
} from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import {
  normalizeOutlineHeadingLevel,
  resolveTocSourceLevel,
  tocStyleLevelsOf,
} from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";
import { isRowSliceTail } from "@mrnote/core/web/components/console/editor/native-document/paged/atomRowSlices.ts";
import { TABLE_FRAGMENT_ID_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

export const DOCUMENT_GO_TO_KINDS = [
  "page",
  "heading",
  "bookmark",
  "comment",
  "footnote",
  "endnote",
  "table",
  "equation",
  "object",
] as const;

export type DocumentGoToKind = (typeof DOCUMENT_GO_TO_KINDS)[number];

export interface DocumentGoToTarget {
  /** Stable within one document snapshot; never persisted. */
  id: string;
  kind: DocumentGoToKind;
  /** One-based order inside the target kind. */
  ordinal: number;
  /** Optional human-readable text (heading text, bookmark name, object label). */
  label: string | null;
  /** ProseMirror position used by setTextSelection/setNodeSelection. */
  from: number;
  /** End of a text range; equals from for a caret or node target. */
  to: number;
  selection: "caret" | "text" | "node";
}

const OBJECT_NODE_NAMES = new Set([
  "documentShape",
  "inlineDocumentShape",
  "image",
  "inlineImage",
  "chart",
  "inlineChart",
  "smartArt",
  "mermaid",
  "codeChart",
  "textBox",
  "whiteboard",
  "file",
  "ai_output",
  "reference",
  "task",
  "flashcard",
]);

const EQUATION_NODE_NAMES = new Set(["inlineMath", "mathBlock"]);

function cleanLabel(value: unknown, max = 100): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/\s+/g, " ").trim();
  return label ? label.slice(0, max) : null;
}

function nodeLabel(node: ProseMirrorNode): string | null {
  const attrs = node.attrs as Record<string, unknown>;
  return (
    cleanLabel(attrs.alt) ??
    cleanLabel(attrs.caption) ??
    cleanLabel(attrs.title) ??
    cleanLabel(attrs.filename) ??
    cleanLabel(attrs.name) ??
    cleanLabel(attrs.text) ??
    cleanLabel(node.textContent)
  );
}

/** First legal text/caret position inside a block container such as pageBlock. */
function firstCaretIn(node: ProseMirrorNode, nodePos: number): number | null {
  let emptyTextblock: number | null = null;
  let textPosition: number | null = null;
  node.descendants((child, relativePos) => {
    if (textPosition !== null) return false;
    const absolutePos = nodePos + 1 + relativePos;
    if (child.isText && child.nodeSize > 0) {
      textPosition = absolutePos;
      return false;
    }
    if (emptyTextblock === null && child.isTextblock) {
      emptyTextblock = absolutePos + 1;
    }
    return true;
  });
  return textPosition ?? emptyTextblock;
}

/** The first selectable object (picture, chart, shape, equation) inside a page. */
function firstObjectIn(node: ProseMirrorNode, nodePos: number): number | null {
  let found: number | null = null;
  node.descendants((child, relativePos) => {
    if (found !== null) return false;
    const name = child.type.name;
    if (
      (OBJECT_NODE_NAMES.has(name) || EQUATION_NODE_NAMES.has(name)) &&
      child.type.spec.selectable !== false
    ) {
      found = nodePos + 1 + relativePos;
      return false;
    }
    return true;
  });
  return found;
}

function appendTarget(
  targets: DocumentGoToTarget[],
  target: Omit<DocumentGoToTarget, "ordinal">,
): void {
  // Ordinals are assigned in one linear pass after collection. Keeping append
  // O(1) matters for the permitted 5,000-page document ceiling.
  targets.push({ ...target, ordinal: 0 });
}

function contiguousMarkedRanges(
  doc: ProseMirrorNode,
  markName: string,
): Array<{ id: string; from: number; to: number; label: string | null }> {
  const out: Array<{
    id: string;
    from: number;
    to: number;
    label: string | null;
  }> = [];
  const indexById = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find(
      (candidate) => candidate.type.name === markName,
    );
    const rawId = mark?.attrs?.threadId;
    const id = markName === COMMENT_MARK_NAME ? sanitizeThreadId(rawId) : null;
    if (!id) return true;
    const end = pos + node.nodeSize;
    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, out.length);
      out.push({ id, from: pos, to: end, label: cleanLabel(node.text) });
      return true;
    }
    const existing = out[existingIndex];
    existing.from = Math.min(existing.from, pos);
    existing.to = Math.max(existing.to, end);
    if (!existing.label) existing.label = cleanLabel(node.text);
    return true;
  });
  return out;
}

/**
 * Build the live Home > Editing > Go To catalog from the ProseMirror document.
 * Targets are structural, not DOM-derived, so navigation works before/after
 * pagination projection and does not depend on rendered element ids.
 */
export function collectDocumentGoToTargets(
  doc: ProseMirrorNode,
): DocumentGoToTarget[] {
  const targets: DocumentGoToTarget[] = [];
  const footnoteMode = resolveFootnoteMode(doc.attrs?.footnoteMode);
  // Fragments of one table split across pages share a pageTableFragmentId;
  // Go To lists the logical table once, at its first fragment, with the text
  // of every fragment as its label (it listed each page's piece as its own
  
  const tableFragments = new Map<string, { index: number; labels: string[] }>();

  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  doc.descendants((node, pos, parent) => {
    const name = node.type.name;
    if (name === "pageBlock" && parent?.type.name === "doc") {
      const caret = firstCaretIn(node, pos);
      if (caret !== null) {
        appendTarget(targets, {
          id: `page:${pos}`,
          kind: "page",
          label: null,
          from: caret,
          to: caret,
          selection: "caret",
        });
      } else {
        // A page holding only objects (a picture, a chart, a shape) has no
        // caret position; Go To Page selects its first object instead of
        
        const object = firstObjectIn(node, pos);
        appendTarget(targets, {
          id: `page:${pos}`,
          kind: "page",
          label: null,
          from: object ?? pos + 1,
          to: object ?? pos + 1,
          selection: object === null ? "caret" : "node",
        });
      }
      return true;
    }

    // A heading is what the navigation pane calls one: a heading node, or a
    // paragraph the author gave an outline level (Go To only knew the node
    // type, so an outline-level paragraph the pane listed was missing here,
    
    // heading.
    if (
      (name === "heading" || name === "paragraph") &&
      fragmentCarries("headingEntry", node.attrs) &&
      resolveTocSourceLevel(name, node.attrs, normalizeOutlineHeadingLevel, styleLevelOf) !== null
    ) {
      const from = pos + 1;
      const to = from + node.content.size;
      appendTarget(targets, {
        id: `heading:${pos}`,
        kind: "heading",
        label: cleanLabel(node.textContent),
        from,
        to: Math.max(from, to),
        selection: to > from ? "text" : "caret",
      });
      return true;
    }

    if (name === FOOTNOTE_MARK_NAME) {
      const noteId = sanitizeFootnoteId(node.attrs?.noteId);
      if (!noteId) return true;
      const stream = noteStreamOf(noteId, footnoteMode);
      appendTarget(targets, {
        id: `${stream}:${noteId}:${pos}`,
        kind: stream,
        label: cleanLabel(node.attrs?.customMark) ?? noteId,
        from: pos,
        to: pos,
        selection: "node",
      });
      return false;
    }

    if (name === "table") {
      const fragmentId = node.attrs?.[TABLE_FRAGMENT_ID_ATTR];
      const fragmentKey =
        typeof fragmentId === "string" && fragmentId ? fragmentId : null;
      const known = fragmentKey ? tableFragments.get(fragmentKey) : undefined;
      if (known) {
        known.labels.push(node.textContent);
        targets[known.index].label = cleanLabel(known.labels.join(" "));
        return true;
      }
      // Word's Go To Table places the insertion point in the table rather than
      // selecting the structural table node. That also works with TipTap's
      // non-selectable table schema and preserves normal cell editing commands.
      const caret = firstCaretIn(node, pos);
      if (fragmentKey) {
        tableFragments.set(fragmentKey, { index: targets.length, labels: [node.textContent] });
      }
      appendTarget(targets, {
        id: `table:${pos}`,
        kind: "table",
        label: cleanLabel(node.textContent),
        from: caret ?? pos,
        to: caret ?? pos,
        selection: caret === null ? "node" : "caret",
      });
      return true;
    }

    if (
      EQUATION_NODE_NAMES.has(name) &&
      node.isAtom &&
      node.type.spec.selectable !== false
    ) {
      appendTarget(targets, {
        id: `equation:${name}:${pos}`,
        kind: "equation",
        label: cleanLabel(node.attrs?.latex),
        from: pos,
        to: pos,
        selection: "node",
      });
      return false;
    }

    if (OBJECT_NODE_NAMES.has(name)) {
      // An object that flows over pages by its rows is one object: the
      // copies on its later pages are not places of their own.
      if (isRowSliceTail(node)) return false;
      appendTarget(targets, {
        id: `object:${name}:${pos}`,
        kind: "object",
        label: nodeLabel(node) ?? name,
        from: pos,
        to: pos,
        selection: "node",
      });
      return false;
    }
    return true;
  });

  for (const bookmark of collectBookmarks(doc.toJSON())) {
    const ranges = bookmarkRangesFor(doc, bookmark.name);
    if (!ranges.length) continue;
    appendTarget(targets, {
      id: `bookmark:${bookmark.name}`,
      kind: "bookmark",
      label: bookmark.name,
      from: ranges[0].from,
      to: ranges[ranges.length - 1].to,
      selection: "text",
    });
  }

  for (const comment of contiguousMarkedRanges(doc, COMMENT_MARK_NAME)) {
    // Re-resolve through the canonical helper. The scanner supplies ordering and
    // a short visible label; commentRangesFor is the authority for the range.
    const ranges = commentRangesFor(doc, comment.id);
    if (!ranges.length) continue;
    appendTarget(targets, {
      id: `comment:${comment.id}`,
      kind: "comment",
      label: comment.label ?? comment.id,
      from: ranges[0].from,
      to: ranges[ranges.length - 1].to,
      selection: "text",
    });
  }

  const ordinals = new Map<DocumentGoToKind, number>();
  for (const target of targets) {
    const next = (ordinals.get(target.kind) ?? 0) + 1;
    ordinals.set(target.kind, next);
    target.ordinal = next;
  }
  return targets;
}

function sameDocumentGoToTarget(
  left: DocumentGoToTarget,
  right: DocumentGoToTarget,
): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.ordinal === right.ordinal &&
    left.label === right.label &&
    left.from === right.from &&
    left.to === right.to &&
    left.selection === right.selection
  );
}

/**
 * Navigate to one target authenticated against the exact document generation
 * that produced it. Returns false before focus/selection when that authority is
 * stale or when an id now resolves to a different target.
 */
export function goToDocumentTarget(
  editor: Editor,
  target: DocumentGoToTarget,
  expectedDoc: ProseMirrorNode,
): boolean {
  if (editor.state.doc !== expectedDoc) return false;
  const live = collectDocumentGoToTargets(editor.state.doc).find(
    (candidate) => candidate.id === target.id,
  );
  if (!live || !sameDocumentGoToTarget(live, target)) return false;
  editor.commands.focus();
  // The target comes into view, as Word's Go To brings it: a selection set
  // on another page stayed off screen (the same as WUA 051's notes).
  if (live.selection === "node") {
    return editor.chain().setNodeSelection(live.from).scrollIntoView().run();
  }
  return editor
    .chain()
    .setTextSelection(
      live.selection === "caret" ? live.from : { from: live.from, to: live.to },
    )
    .scrollIntoView()
    .run();
}
