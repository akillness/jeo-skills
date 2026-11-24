/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  PdfNativeListTextSelectionItemEvidence,
} from "../../../../../lib/pdf/engine/native/list-text-fidelity";

export type PdfNativeOverprintItem = Pick<
  PdfNativeListTextSelectionItemEvidence,
  "str" | "transform" | "width"
>;

export const nativeTextOverprintTwinCache = new WeakMap<
  readonly (PdfNativeOverprintItem | null | undefined)[],
  ReadonlySet<number>
>();

/** Items that draw an earlier item's text again over its own ink.
 *
 * A Qt fake-bold heading is its glyphs shown twice, the second pass a fraction
 * of a point over; the reader lists that pass as an item of its own, laid on
 * top. It names no character, so as an edit target it could only be refused,
 * and it took the click from the run beneath it -- whose edit already rewrites
 * both passes. The later pass is therefore no edit box and lets the pointer
 * through: same text, same size and advance within a sliver, origin within a
 * tenth or so of the font size. */
export function pdfNativeOverprintTwinItemIndexes(
  items: readonly (PdfNativeOverprintItem | null | undefined)[],
): ReadonlySet<number> {
  const cached = nativeTextOverprintTwinCache.get(items);
  if (cached) return cached;
  const twins = new Set<number>();
  const primaries = new Map<string, number[]>();
  items.forEach((item, index) => {
    if (!item || !/\S/u.test(item.str)) return;
    const [a, b, c, d, e, f] = item.transform;
    const size = Math.hypot(c, d);
    if (!(size > 0) || !Number.isFinite(e) || !Number.isFinite(f)) return;
    const earlier = primaries.get(item.str) ?? [];
    const twin = earlier.some((earlierIndex) => {
      const other = items[earlierIndex]!;
      const [oa, ob, oc, od, oe, of] = other.transform;
      const slack = 0.02 * size;
      return (
        Math.abs(oa - a) <= slack && Math.abs(ob - b) <= slack &&
        Math.abs(oc - c) <= slack && Math.abs(od - d) <= slack &&
        Math.abs(oe - e) <= 0.15 * size && Math.abs(of - f) <= 0.15 * size &&
        Math.abs(other.width - item.width) <= Math.max(0.02 * other.width, 0.15 * size)
      );
    });
    if (twin) twins.add(index);
    else primaries.set(item.str, [...earlier, index]);
  });
  const frozen: ReadonlySet<number> = twins;
  nativeTextOverprintTwinCache.set(items, frozen);
  return frozen;
}

export function nativeTextItemCanOwnStandaloneEditBox(
  item:
    | (Pick<PdfNativeListTextSelectionItemEvidence, "str"> &
        Partial<Pick<PdfNativeListTextSelectionItemEvidence, "itemIndex">>)
    | null
    | undefined,
  pageItems?: readonly (PdfNativeOverprintItem | null | undefined)[],
): boolean {
  return Boolean(
    item &&
      /\S/u.test(item.str) &&
      !(
        pageItems &&
        item.itemIndex !== undefined &&
        pdfNativeOverprintTwinItemIndexes(pageItems).has(item.itemIndex)
      ),
  );
}

/** A twin pass must not take the pointer from the run it overprints. */
export function releaseNativeTextOverprintTwinPointer(
  span: HTMLElement,
  item: Partial<Pick<PdfNativeListTextSelectionItemEvidence, "itemIndex">> | null | undefined,
  pageItems: readonly (PdfNativeOverprintItem | null | undefined)[] | undefined,
): void {
  if (
    pageItems &&
    item?.itemIndex !== undefined &&
    pdfNativeOverprintTwinItemIndexes(pageItems).has(item.itemIndex)
  ) {
    span.style.pointerEvents = "none";
  }
}
