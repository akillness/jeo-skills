/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** No part for this long: the parts that came are laid out. */
export const PARTS_ARRIVING_QUIET_MS = 8000;
/** How often a held pass looks again. */
export const PARTS_ARRIVING_POLL_MS = 1000;

export interface PartsArrivingInput {
  /** The document's first layout is done. */
  readonly settledOnce: boolean;
  /** A change not a part's (typing, an AI edit, undo) waits for this pass. */
  readonly readerEdited: boolean;
  /** Parts are still to come in. */
  readonly partsToCome: boolean;
  readonly msSincePart: number;
  /** The next part is being read now (the editor root's data-document-parts-loading). */
  readonly partLoading?: boolean;
  /** The parts are being read all at once (lib/document-page-parts
   * `loadsPartsAtOnce`): they come within seconds, the first layout included,
   * so the pages past the reader wait for them from the start. */
  readonly eager?: boolean;
  /** The first sheet the pass would lay out, or null with nothing pending. */
  readonly frontier: number | null;
  /** Whether that sheet is far past the reader's (ledgerBackgroundPace). */
  readonly frontierFar: boolean;
}

export function holdForArrivingParts(input: PartsArrivingInput): boolean {
  if ((!input.settledOnce && !input.eager) || input.readerEdited || !input.partsToCome) return false;
  if (!input.partLoading && !(input.msSincePart < PARTS_ARRIVING_QUIET_MS)) return false;
  return input.frontier !== null && input.frontierFar;
}

/**
 * What the editor root says of the parts (NoteEditor writes them from the
 * parts hook, a render after it changes): whether the next is being read, and
 * how many are still to come in. Before it says, the parts sentinel tells
 * "some still to come" (it stays while the reader holds the loading back,
 * hence the quiet window), and nothing tells "being read".
 */
export function partsState(root: HTMLElement, sentinelSaysToCome: () => boolean): { toCome: boolean; loading: boolean; eager: boolean } {
  const left = root.getAttribute("data-document-parts-left");
  const loading = root.getAttribute("data-document-parts-loading") === "true";
  const eager = root.getAttribute("data-document-parts-eager") === "true";
  if (left === null) return { toCome: sentinelSaysToCome(), loading, eager: false };
  return { toCome: Number(left) > 0, loading, eager };
}

/** `window.__docsPartsArrivingHold = false` lays each part out as it comes (old, A/B). */
export function partsArrivingHoldOn(view: { dom: { ownerDocument: Document } }): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsPartsArrivingHold?: boolean }) | null)?.__docsPartsArrivingHold !== false;
}
