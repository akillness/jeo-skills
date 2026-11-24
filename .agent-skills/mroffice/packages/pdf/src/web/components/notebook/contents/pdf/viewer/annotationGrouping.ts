/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Group annotations by their 1-based `page` number into a Map, preserving
 * source-array order within each page bucket. Used to turn the per-page
 * `array.filter(a => a.page === n)` scans (O(pages × annotations) each render)
 * into O(1) `map.get(n)` lookups — mirroring how link / form-field annotations
 * are already keyed by page. Behavior-identical to the filter: the bucket for
 * page `n` contains exactly the items whose `.page === n`, in their original
 * relative order.
 */
export function groupAnnotationsByPage<T extends { page: number }>(
  items: readonly T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const bucket = map.get(item.page);
    if (bucket) bucket.push(item);
    else map.set(item.page, [item]);
  }
  return map;
}
