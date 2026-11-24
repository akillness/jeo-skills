/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  applyManagedOutlineMutation as applyManagedOutlineTreeMutation,
  validateManagedOutlineTree,
  type ManagedOutlineNode,
} from "@mrnote/core/web/lib/pdf/outline.ts";

export type PdfManagedOutlineOperation =
  | "add"
  | "rename"
  | "update-destination"
  | "move"
  | "delete";

export interface PdfManagedOutlineCommitInput {
  readonly operation: PdfManagedOutlineOperation | "rename-source" | "delete-source";
  readonly tree: readonly ManagedOutlineNode[];
  /** rename-source / delete-source: one of the file's own bookmarks, by its
   * place in the outline (sibling indexes), and a rename's new title. */
  readonly sourceTarget?: Readonly<{ path: readonly number[]; title: string | null; expectedTitle?: string }>;
  /** A source rename's title before it: its Undo renames back. */
  readonly sourcePreviousTitle?: string;
  /** The managed tree the edit was made on, when it is not the one the pane
   * shows (MRAI's tree read from the file for an edit the pane listed with
   * the file's own bookmarks). */
  readonly before?: readonly ManagedOutlineNode[];
}

export function managedOutlineAddReplayTrees(
  current: readonly ManagedOutlineNode[],
  target: readonly ManagedOutlineNode[],
): readonly (readonly ManagedOutlineNode[])[] {
  const present = new Set<string>();
  const collectPresent = (nodes: readonly ManagedOutlineNode[]) =>
    nodes.forEach((node) => {
      present.add(node.id);
      collectPresent(node.children);
    });
  collectPresent(current);
  const placements: Array<{
    node: ManagedOutlineNode;
    parentId: string | null;
    index: number;
  }> = [];
  const collectPlacements = (
    nodes: readonly ManagedOutlineNode[],
    parentId: string | null,
  ) =>
    nodes.forEach((node, index) => {
      if (!present.has(node.id)) placements.push({ node, parentId, index });
      collectPlacements(node.children, node.id);
    });
  collectPlacements(target, null);
  const replayTrees: Array<readonly ManagedOutlineNode[]> = [];
  let tree = validateManagedOutlineTree(current);
  for (const placement of placements) {
    tree = applyManagedOutlineTreeMutation(tree, {
      kind: "add",
      parentId: placement.parentId,
      index: placement.index,
      node: { ...placement.node, children: [] },
    });
    replayTrees.push(tree);
  }
  return Object.freeze(replayTrees);
}

export interface PdfDocumentEditUndoSnapshot {
  readonly content: Record<string, unknown>;
  /** The page the command left: its Undo takes back only what differs. */
  readonly after?: Record<string, unknown>;
  


  readonly undo?: () => Promise<boolean>;
}
