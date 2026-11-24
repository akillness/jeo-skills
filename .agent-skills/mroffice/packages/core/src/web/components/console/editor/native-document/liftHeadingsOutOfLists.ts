/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { JSONContent } from "@tiptap/core";

/**
 * DEFENSIVE normalizer for schema-invalid persisted content: a `heading`
 * nested inside `bulletList/orderedList > listItem`.
 *
 * Word "numbered outline headings" (a Heading style bound to a multilevel
 * numbering) used to be list-grouped by both import paths, producing
 * `orderedList > listItem > heading`. The editor's listItem content
 * expression forbids headings, so loading such a page threw and the window
 * error boundary swallowed the editor entirely. New imports no longer emit
 * the shape; this pure transform rewrites ALREADY-PERSISTED broken pages on
 * load by splitting the list around each nested heading and lifting the
 * heading to the enclosing (schema-legal) level.
 *
 * Guarantees:
 * - PURE and idempotent: valid documents are returned unchanged (same object
 *   identity, `changed: false`).
 * - Splitting preserves order: items before the heading form one list, the
 *   heading follows at the parent level, items after it form a new list.
 * - block_ids are preserved on the first split segment of a list/item; the
 *   continuation segments drop `block_id` so the backfill mints fresh unique
 *   ids (a duplicated id would break AI-edit targeting).
 * - The lifted heading keeps its own attrs and gains
 *   `attrs.source.listNumbering = { type, level }` (unless already present)
 *   so the original numbering intent survives as metadata — no visible
 *   ordinal text is synthesized.
 */

const LIST_TYPES = new Set(["bulletList", "orderedList"]);

export interface LiftHeadingsResult {
  document: JSONContent;
  changed: boolean;
}

function stripBlockId(
  attrs: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!attrs) return undefined;
  const rest = { ...attrs };
  delete rest.block_id;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function withSegmentAttrs(
  node: JSONContent,
  content: JSONContent[],
  isContinuation: boolean,
): JSONContent {
  const segment: JSONContent = { ...node, content };
  if (isContinuation) {
    const attrs = stripBlockId(
      node.attrs as Record<string, unknown> | undefined,
    );
    if (attrs) {
      segment.attrs = attrs;
    } else {
      delete segment.attrs;
    }
  }
  return segment;
}

function stampListNumbering(
  heading: JSONContent,
  listType: string,
  depth: number,
): JSONContent {
  const attrs = { ...((heading.attrs as Record<string, unknown>) ?? {}) };
  const existingSource =
    attrs.source && typeof attrs.source === "object" && !Array.isArray(attrs.source)
      ? (attrs.source as Record<string, unknown>)
      : undefined;
  if (existingSource?.listNumbering) return heading;
  attrs.source = {
    ...(existingSource ?? {}),
    listNumbering: {
      type: listType === "orderedList" ? "ordered" : "bullet",
      level: depth,
    },
  };
  return { ...heading, attrs };
}

function transformGeneric(
  node: JSONContent,
  depth: number,
): { node: JSONContent; changed: boolean } {
  if (!Array.isArray(node.content)) return { node, changed: false };
  const result = transformNodes(node.content, depth);
  if (!result.changed) return { node, changed: false };
  return { node: { ...node, content: result.nodes }, changed: true };
}

function transformList(
  list: JSONContent,
  depth: number,
): { nodes: JSONContent[]; changed: boolean } {
  let changed = false;
  const emitted: JSONContent[] = [];
  let currentItems: JSONContent[] = [];
  let listSegmentEmitted = false;

  const flushListSegment = (): void => {
    if (currentItems.length === 0) return;
    emitted.push(withSegmentAttrs(list, currentItems, listSegmentEmitted));
    listSegmentEmitted = true;
    currentItems = [];
  };
  const emitHeading = (heading: JSONContent, headingDepth: number): void => {
    flushListSegment();
    emitted.push(stampListNumbering(heading, list.type ?? "bulletList", headingDepth));
    changed = true;
  };

  for (const child of list.content ?? []) {
    if (child.type === "heading") {
      // A heading as a DIRECT list child (no listItem wrapper) is equally
      // schema-invalid; lift it the same way.
      emitHeading(child, depth);
      continue;
    }
    if (child.type !== "listItem") {
      const generic = transformGeneric(child, depth);
      changed = changed || generic.changed;
      currentItems.push(generic.node);
      continue;
    }
    let segment: JSONContent[] = [];
    let itemSegmentEmitted = false;
    const flushItemSegment = (): void => {
      if (segment.length === 0) return;
      // listItem content is "paragraph block*": a split segment that would
      // start with a nested list needs a bridging empty paragraph to stay
      // schema-valid (the same idiom the importer uses for level jumps).
      // Never fires for untouched valid items (they already start with a
      // paragraph), so identity is preserved when nothing was lifted.
      if (segment[0]?.type !== "paragraph") {
        segment.unshift({ type: "paragraph" });
      }
      currentItems.push(withSegmentAttrs(child, segment, itemSegmentEmitted));
      itemSegmentEmitted = true;
      segment = [];
    };
    for (const grand of child.content ?? []) {
      if (grand.type === "heading") {
        flushItemSegment();
        emitHeading(grand, depth);
        continue;
      }
      if (grand.type && LIST_TYPES.has(grand.type)) {
        const nested = transformList(grand, depth + 1);
        changed = changed || nested.changed;
        for (const block of nested.nodes) {
          if (block.type === "heading") {
            // Already stamped at its own (deeper) level by the recursion.
            flushItemSegment();
            flushListSegment();
            emitted.push(block);
          } else {
            segment.push(block);
          }
        }
        continue;
      }
      const generic = transformGeneric(grand, depth);
      changed = changed || generic.changed;
      segment.push(generic.node);
    }
    flushItemSegment();
  }
  flushListSegment();

  if (!changed) return { nodes: [list], changed: false };
  return { nodes: emitted, changed: true };
}

function transformNodes(
  nodes: JSONContent[],
  depth: number,
): { nodes: JSONContent[]; changed: boolean } {
  let changed = false;
  const out: JSONContent[] = [];
  for (const node of nodes) {
    if (node.type && LIST_TYPES.has(node.type)) {
      const result = transformList(node, depth);
      changed = changed || result.changed;
      out.push(...result.nodes);
      continue;
    }
    const generic = transformGeneric(node, depth);
    changed = changed || generic.changed;
    out.push(generic.node);
  }
  if (!changed) return { nodes, changed: false };
  return { nodes: out, changed: true };
}

export function liftHeadingsOutOfLists(
  document: JSONContent,
): LiftHeadingsResult {
  if (!Array.isArray(document.content)) {
    return { document, changed: false };
  }
  const result = transformNodes(document.content, 0);
  if (!result.changed) {
    return { document, changed: false };
  }
  return { document: { ...document, content: result.nodes }, changed: true };
}
