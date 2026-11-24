/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import {
  collectHeadingsFromDoc,
  normalizeOutlineHeadingLevel,
  resolveTocSourceLevel,
  tocStyleLevelsOf,
  shouldDescendDocumentOutlineNode,
  type TocHeading,
} from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";
import { isSuggestingActive } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

export type DocumentOutlineMoveDirection = "up" | "down";

export interface DocumentOutlineMoveAvailability {
  up: boolean;
  down: boolean;
}

interface HeadingEntry {
  heading: TocHeading;
  parentId: string | null;
}

interface FlatBlock {
  node: ProseMirrorNode;
  pageIndex: number;
  pos: number;
}

interface PageInfo {
  node: ProseMirrorNode;
  pos: number;
}

interface OutlineMovePlan {
  firstChangedPage: number;
  lastChangedPage: number;
  pages: ProseMirrorNode[];
  pageInfos: PageInfo[];
  targetNode: ProseMirrorNode;
}

const MAX_OUTLINE_HEADINGS = 2_000;
const MAX_OUTLINE_BLOCKS = 20_000;

function collectHeadingPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  doc.descendants((node, pos) => {
    if (!shouldDescendDocumentOutlineNode(node.type.name)) return false;
    if (node.type.name !== "heading" && node.type.name !== "paragraph") {
      return true;
    }
    if (!fragmentCarries("headingEntry", node.attrs)) return true;
    if (
      resolveTocSourceLevel(
        node.type.name,
        node.attrs,
        normalizeOutlineHeadingLevel,
        styleLevelOf,
      ) !== null
    ) {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}

function collectHeadingEntries(
  headings: readonly TocHeading[],
): HeadingEntry[] {
  const ancestors: TocHeading[] = [];
  return headings.map((heading) => {
    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].level >= heading.level
    ) {
      ancestors.pop();
    }
    const parentId = ancestors[ancestors.length - 1]?.id ?? null;
    ancestors.push(heading);
    return { heading, parentId };
  });
}

function collectPagesAndBlocks(doc: ProseMirrorNode): {
  pages: PageInfo[];
  blocks: FlatBlock[];
} | null {
  const pages: PageInfo[] = [];
  const blocks: FlatBlock[] = [];
  let invalidRoot = false;
  doc.forEach((page, pagePos, pageIndex) => {
    if (page.type.name !== "pageBlock" || page.childCount === 0) {
      invalidRoot = true;
      return;
    }
    pages.push({ node: page, pos: pagePos });
    page.forEach((node, offset) => {
      blocks.push({ node, pageIndex, pos: pagePos + 1 + offset });
    });
  });
  if (
    invalidRoot ||
    pages.length === 0 ||
    blocks.length === 0 ||
    blocks.length > MAX_OUTLINE_BLOCKS
  ) {
    return null;
  }
  return { pages, blocks };
}

function sectionEnd(
  entries: readonly HeadingEntry[],
  positions: readonly number[],
  positionToBlock: ReadonlyMap<number, number>,
  entryIndex: number,
  blockCount: number,
): number | null {
  const level = entries[entryIndex]?.heading.level;
  if (!level) return null;
  for (let index = entryIndex + 1; index < entries.length; index += 1) {
    const next = entries[index];
    if (next.heading.level > level) continue;
    // An outline paragraph nested in a list (or another block) is not a
    // page-level block: the block holding it belongs to the section it sits
    // in, so it cannot end this one — the next page-level heading does
    
    const block = positionToBlock.get(positions[index] ?? -1);
    if (block === undefined) continue;
    return block;
  }
  return blockCount;
}

function samePageChildren(
  page: ProseMirrorNode,
  blocks: readonly ProseMirrorNode[],
): boolean {
  return (
    page.childCount === blocks.length &&
    blocks.every((block, index) => page.child(index) === block)
  );
}

function siblingHeadingIndex(
  entries: readonly HeadingEntry[],
  targetIndex: number,
  direction: DocumentOutlineMoveDirection,
  movable: (index: number) => boolean = () => true,
): number {
  const target = entries[targetIndex];
  if (!target) return -1;
  if (direction === "up") {
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const candidate = entries[index];
      if (
        candidate.parentId === target.parentId &&
        candidate.heading.level === target.heading.level &&
        movable(index)
      ) {
        return index;
      }
    }
    return -1;
  }
  for (let index = targetIndex + 1; index < entries.length; index += 1) {
    const candidate = entries[index];
    if (
      candidate.parentId === target.parentId &&
      candidate.heading.level === target.heading.level &&
      movable(index)
    ) {
      return index;
    }
    if (candidate.heading.level < target.heading.level) break;
  }
  return -1;
}

function createMovePlan(
  doc: ProseMirrorNode,
  anchorId: string,
  direction: DocumentOutlineMoveDirection,
): OutlineMovePlan | null {
  const structure = collectPagesAndBlocks(doc);
  if (!structure) return null;
  const headings = collectHeadingsFromDoc(
    doc,
    normalizeOutlineHeadingLevel,
    shouldDescendDocumentOutlineNode,
  );
  if (headings.length === 0 || headings.length > MAX_OUTLINE_HEADINGS) {
    return null;
  }
  const positions = collectHeadingPositions(doc);
  if (positions.length !== headings.length) return null;
  const entries = collectHeadingEntries(headings);
  const targetIndex = entries.findIndex(
    (entry) => entry.heading.id === anchorId,
  );
  if (targetIndex < 0) return null;
  const positionToBlock = new Map<number, number>();
  const directBlockByPos = new Map(
    structure.blocks.map((block, index) => [block.pos, index]),
  );
  positions.forEach((position) => {
    const blockIndex = directBlockByPos.get(position);
    if (blockIndex !== undefined) positionToBlock.set(position, blockIndex);
  });
  // Only a page-level heading moves as a section; a heading nested in a
  // list or table stays with the block that holds it and takes no part.
  const movable = (index: number) =>
    positionToBlock.has(positions[index] ?? -1);

  const targetStart = positionToBlock.get(positions[targetIndex]);
  const targetEnd = sectionEnd(
    entries,
    positions,
    positionToBlock,
    targetIndex,
    structure.blocks.length,
  );
  if (
    targetStart === undefined ||
    targetEnd === null ||
    targetEnd <= targetStart
  ) {
    return null;
  }

  const siblingIndex = siblingHeadingIndex(entries, targetIndex, direction, movable);
  if (siblingIndex < 0) return null;
  const siblingStart = positionToBlock.get(positions[siblingIndex]);
  const siblingEnd = sectionEnd(
    entries,
    positions,
    positionToBlock,
    siblingIndex,
    structure.blocks.length,
  );
  if (
    siblingStart === undefined ||
    siblingEnd === null ||
    siblingEnd <= siblingStart
  ) {
    return null;
  }
  if (direction === "up" && siblingEnd !== targetStart) return null;
  if (direction === "down" && targetEnd !== siblingStart) return null;

  const original = structure.blocks.map((block) => block.node);
  const moved =
    direction === "up"
      ? [
          ...original.slice(0, siblingStart),
          ...original.slice(targetStart, targetEnd),
          ...original.slice(siblingStart, targetStart),
          ...original.slice(targetEnd),
        ]
      : [
          ...original.slice(0, targetStart),
          ...original.slice(siblingStart, siblingEnd),
          ...original.slice(targetStart, targetEnd),
          ...original.slice(siblingEnd),
        ];
  if (moved.length !== original.length) return null;

  const pages: ProseMirrorNode[] = [];
  let cursor = 0;
  for (const page of structure.pages) {
    const count = page.node.childCount;
    const pageBlocks = moved.slice(cursor, cursor + count);
    if (pageBlocks.length !== count) return null;
    pages.push(
      samePageChildren(page.node, pageBlocks)
        ? page.node
        : page.node.type.create(page.node.attrs, pageBlocks, page.node.marks),
    );
    cursor += count;
  }
  if (cursor !== moved.length) return null;
  const changed = pages
    .map((page, index) => (page === structure.pages[index].node ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length === 0) return null;
  return {
    firstChangedPage: changed[0],
    lastChangedPage: changed[changed.length - 1],
    pages,
    pageInfos: structure.pages,
    targetNode: structure.blocks[targetStart].node,
  };
}

export function documentOutlineSectionMoveAvailability(
  doc: ProseMirrorNode,
  anchorId: string,
): DocumentOutlineMoveAvailability {
  return {
    up: createMovePlan(doc, anchorId, "up") !== null,
    down: createMovePlan(doc, anchorId, "down") !== null,
  };
}

export function collectDocumentOutlineSectionMoveAvailability(
  doc: ProseMirrorNode,
): ReadonlyMap<string, DocumentOutlineMoveAvailability> {
  const structure = collectPagesAndBlocks(doc);
  if (!structure) return new Map();
  const headings = collectHeadingsFromDoc(
    doc,
    normalizeOutlineHeadingLevel,
    shouldDescendDocumentOutlineNode,
  );
  const positions = collectHeadingPositions(doc);
  if (
    headings.length === 0 ||
    headings.length > MAX_OUTLINE_HEADINGS ||
    positions.length !== headings.length
  ) {
    return new Map();
  }
  const entries = collectHeadingEntries(headings);
  const directBlockByPos = new Map(
    structure.blocks.map((block, index) => [block.pos, index]),
  );
  const positionToBlock = new Map<number, number>();
  positions.forEach((position) => {
    const blockIndex = directBlockByPos.get(position);
    if (blockIndex !== undefined) positionToBlock.set(position, blockIndex);
  });
  const movable = (index: number) =>
    positionToBlock.has(positions[index] ?? -1);
  const output = new Map<string, DocumentOutlineMoveAvailability>();
  entries.forEach((entry, index) => {
    const start = positionToBlock.get(positions[index]);
    const end = sectionEnd(
      entries,
      positions,
      positionToBlock,
      index,
      structure.blocks.length,
    );
    if (start === undefined || end === null || end <= start) {
      output.set(entry.heading.id, { up: false, down: false });
      return;
    }
    const upIndex = siblingHeadingIndex(entries, index, "up", movable);
    const downIndex = siblingHeadingIndex(entries, index, "down", movable);
    const upEnd =
      upIndex < 0
        ? null
        : sectionEnd(
            entries,
            positions,
            positionToBlock,
            upIndex,
            structure.blocks.length,
          );
    const downStart =
      downIndex < 0 ? undefined : positionToBlock.get(positions[downIndex]);
    output.set(entry.heading.id, {
      up: upIndex >= 0 && upEnd === start,
      down: downIndex >= 0 && downStart === end,
    });
  });
  return output;
}

/**
 * The Navigation pane's id of the heading at `pos` (its own position or any
 * position inside it), the id `moveDocumentOutlineSection` takes; null when
 * no outline heading is there.
 */
export function documentOutlineHeadingIdAt(doc: ProseMirrorNode, pos: number): string | null {
  const headings = collectHeadingsFromDoc(doc, normalizeOutlineHeadingLevel, shouldDescendDocumentOutlineNode);
  const positions = collectHeadingPositions(doc);
  if (headings.length !== positions.length) return null;
  const index = positions.findIndex((start) => {
    const node = doc.nodeAt(start);
    return node !== null && pos >= start && pos <= start + node.nodeSize;
  });
  return index < 0 ? null : (headings[index]?.id ?? null);
}

export function moveDocumentOutlineSection(
  editor: Editor,
  expectedDoc: ProseMirrorNode,
  anchorId: string,
  direction: DocumentOutlineMoveDirection,
): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    isSuggestingActive(editor.state) ||
    editor.state.doc !== expectedDoc
  ) {
    return false;
  }
  const plan = createMovePlan(expectedDoc, anchorId, direction);
  if (!plan) return false;
  const fromPage = plan.pageInfos[plan.firstChangedPage];
  const toPage = plan.pageInfos[plan.lastChangedPage];
  if (!fromPage || !toPage) return false;
  const replacement = Fragment.fromArray(
    plan.pages.slice(plan.firstChangedPage, plan.lastChangedPage + 1),
  );
  let transaction = editor.state.tr.replaceWith(
    fromPage.pos,
    toPage.pos + toPage.node.nodeSize,
    replacement,
  );
  let targetPos = 0;
  let foundTarget = false;
  for (const page of plan.pages) {
    let blockOffset = 0;
    page.forEach((block) => {
      if (!foundTarget && block === plan.targetNode) {
        targetPos += 1 + blockOffset;
        foundTarget = true;
      }
      blockOffset += block.nodeSize;
    });
    if (foundTarget) break;
    targetPos += page.nodeSize;
  }
  if (
    !foundTarget ||
    targetPos < 0 ||
    targetPos >= transaction.doc.content.size
  ) {
    return false;
  }
  transaction = transaction.setSelection(
    TextSelection.near(transaction.doc.resolve(targetPos + 1)),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}
