/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
interface DocumentRanges {
  /** The document's createRange at the time; a test that stubs it (per-range
   * client rects) gets fresh ranges from its stub, and its restore drops
   * them again. */
  creator: Document["createRange"];
  sites: Map<string, Range>;
}

const ranges = new WeakMap<Document, DocumentRanges>();

export function measurementRange(doc: Document, site: string): Range {
  let entry = ranges.get(doc);
  if (!entry || entry.creator !== doc.createRange) {
    entry = { creator: doc.createRange, sites: new Map() };
    ranges.set(doc, entry);
  }
  const { sites } = entry;
  let range = sites.get(site);
  if (!range) {
    range = doc.createRange();
    sites.set(site, range);
  }
  return range;
}

/** A document of this window's own, never shown and never changed: where a
 * fresh range is parked once it is read (`releaseFreshRange`). */
const parkingDocuments = new WeakMap<Document, Document | null>();

function parkingDocumentFor(doc: Document): Document | null {
  if (parkingDocuments.has(doc)) return parkingDocuments.get(doc) ?? null;
  let parking: Document | null = null;
  try {
    parking = doc.implementation.createHTMLDocument("");
  } catch {
    parking = null;
  }
  parkingDocuments.set(doc, parking);
  return parking;
}

/**
 * A fresh range a measurement has read and will not read again, taken out of
 * its document's registry: its boundary is set in a private document, which
 * moves the range there (a range lives in the document of its boundary
 * points). What it measured is unchanged; the document's later node removals
 * no longer visit it until it is collected (see above: a fresh range per
 * character, kept on purpose where a measurement's order matters, left
 * thousands registered, and every page move emptied and filled sheets past
 * all of them).
 */
export function releaseFreshRange(range: Range): void {
  const parking = parkingDocumentFor(range.startContainer.ownerDocument ?? (range.startContainer as Document));
  if (!parking) return;
  try {
    range.setStart(parking, 0);
    range.collapse(true);
  } catch {
    // A range that cannot move stays where it is, as before.
  }
}
