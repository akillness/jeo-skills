/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
const published = new WeakMap<HTMLElement, readonly number[]>();

/** The sections, by page index, of the overflow just published for `root`. */
export function publishBandOverflowSections(root: HTMLElement | null | undefined, sections: readonly number[]): void {
  if (root) published.set(root, sections);
}

export function bandOverflowSectionsOf(root: HTMLElement): readonly number[] | null {
  return published.get(root) ?? null;
}





export function bandOverflowByIndexOnly(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsBandOverflowBySection?: boolean }).__docsBandOverflowBySection !== true;
}

/**
 * The overflow a page of `section` at `index` takes: the value published at
 * its index when that was measured for its section; else the one its section's
 * pages were measured with (the most common, a first page's own band aside),
 * else none.
 */
export function bandOverflowForSection(
  index: number,
  section: number,
  sections: readonly number[],
  valueAt: (index: number) => string,
): string {
  if (sections[index] === section) return valueAt(index);
  const counts = new Map<string, number>();
  let best: string | null = null;
  let most = 0;
  sections.forEach((measured, at) => {
    if (measured !== section) return;
    const value = valueAt(at);
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > most) {
      most = count;
      best = value;
    }
  });
  return best ?? "0px";
}
