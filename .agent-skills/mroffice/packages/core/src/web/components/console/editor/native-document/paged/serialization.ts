/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Collapse editor-only physical pagination projections into one semantic
 * document before any persistence, export, comparison, or AI-context read.
 *
 * Ordering is intentional:
 * 1. table fragments own runtime attrs nested inside rows/cells;
 * 2. list/blockquote fragments may contain ordinary split blocks;
 * 3. the generic block merger finally joins top-level paragraph/code/note
 *    continuations.
 *
 * Every helper has an identity fast path, so ordinary documents pay only
 * three shallow guards and retain object identity.
 */

import { mergeSplitContinuationsJson } from "./blockSplitting";
import { mergeContainerContinuationsJson } from "./containerSplitting";
import {
  flattenPageBlocks,
  pageBlockDistribution,
  pageBlockLayoutKey,
  storedPageBlockDistribution,
} from "./pageBlockExtension";
import { mergeTableContinuationsJson } from "./tablePagination";
import { memoizedProjectionDerivation, PAGED_RUNTIME_MERGE } from "./projectionJsonMemo";
import {
  PAGE_REGION_RECEIPT,
  paginationProjectionRestores,
  type PaginationProjectionReceipt,
} from "./paginationProjectionReceipt";

export function mergePagedRuntimeContinuationsJson<T>(document: T): T {
  // A save merges the same runtime document for its receipt and for storage:
  // once per document within a projection scope.
  return memoizedProjectionDerivation(PAGED_RUNTIME_MERGE, document, mergeRuntimeContinuations);
}

function mergeRuntimeContinuations<T>(document: T): T {
  const tablesMerged = mergeTableContinuationsJson(document);
  const containersMerged = mergeContainerContinuationsJson(tablesMerged);
  return mergeSplitContinuationsJson(containersMerged);
}

/**
 * Complete persistence boundary for the structural editor: collapse every
 * runtime continuation, then remove pageBlock wrappers. A whole-block cache
 * is valid only when merging did not change the measured page distribution.
 * Fragmented pages need an exact projection receipt; the roots remaining
 * after merging are not evidence of where their complete content can fit.
 */
export function flattenPagedDocumentForStorage<T>(
  document: T,
  options?: {
    paginationSettled?: boolean;
    projection?: PaginationProjectionReceipt | null;
  },
): T {
  const physicalSizes = pageBlockDistribution(document);
  const merged = mergePagedRuntimeContinuationsJson(document);
  const sizes = pageBlockDistribution(merged);
  const flattened = flattenPageBlocks(merged);
  const root = flattened as Record<string, unknown> | null;
  if (!root || typeof root !== "object") return flattened;
  const attrs =
    root.attrs && typeof root.attrs === "object"
      ? (root.attrs as Record<string, unknown>)
      : {};
  const stripStalePaginationMetadata = (): T => {
    if (
      !("pageBlockSizes" in attrs) &&
      !("pageBlockLayoutKey" in attrs) &&
      !(PAGE_REGION_RECEIPT in attrs)
    ) {
      return flattened;
    }
    const nextAttrs = { ...attrs };
    delete nextAttrs.pageBlockSizes;
    delete nextAttrs.pageBlockLayoutKey;
    delete nextAttrs[PAGE_REGION_RECEIPT];
    return { ...root, attrs: nextAttrs } as T;
  };
  // This boundary also normalizes durable FLAT input before hydration. A
  // different, still-starting editor must not erase that snapshot's verified
  // layout. Runtime page wrappers continue to obey the settling gate below.
  if (sizes === null && flattened === merged) {
    const nextAttrs = { ...attrs };
    if (nextAttrs[PAGE_REGION_RECEIPT] && !paginationProjectionRestores(root, nextAttrs[PAGE_REGION_RECEIPT])) {
      delete nextAttrs[PAGE_REGION_RECEIPT];
    }
    if (storedPageBlockDistribution(root) === null) {
      delete nextAttrs.pageBlockSizes;
      delete nextAttrs.pageBlockLayoutKey;
    }
    const changed = Object.keys(attrs).some((key) => !(key in nextAttrs));
    return changed ? { ...root, attrs: nextAttrs } as T : flattened;
  }
  if (options?.paginationSettled === false) {
    return stripStalePaginationMetadata();
  }
  if (sizes === null) return stripStalePaginationMetadata();
  const layoutKey = pageBlockLayoutKey(flattened);
  if (layoutKey === null) return stripStalePaginationMetadata();
  const nextAttrs = { ...attrs };
  // The receipt just proven against this root needs no second proof: the
  // restore is a pure function of the two, and neither changed.
  let proven: unknown = undefined;
  if (options?.projection && paginationProjectionRestores(root, options.projection)) {
    nextAttrs[PAGE_REGION_RECEIPT] = options.projection;
    proven = options.projection;
  }
  if (
    nextAttrs[PAGE_REGION_RECEIPT] &&
    nextAttrs[PAGE_REGION_RECEIPT] !== proven &&
    !paginationProjectionRestores(root, nextAttrs[PAGE_REGION_RECEIPT])
  )
    delete nextAttrs[PAGE_REGION_RECEIPT];
  if (physicalSizes && (
    physicalSizes.length !== sizes.length ||
    physicalSizes.some((count, index) => count !== sizes[index])
  )) {
    // An exact recipe above can still restore every physical cut. Without
    // one, let hydration reflow the canonical blocks rather than seeding it
    // with a different, never-measured distribution made by the mergers.
    delete nextAttrs.pageBlockSizes;
    delete nextAttrs.pageBlockLayoutKey;
    return { ...root, attrs: nextAttrs } as T;
  }
  return {
    ...root,
    attrs: {
      ...nextAttrs,
      pageBlockSizes: sizes,
      pageBlockLayoutKey: layoutKey,
    },
  } as T;
}

export default mergePagedRuntimeContinuationsJson;
