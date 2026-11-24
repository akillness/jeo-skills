/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Continued footnotes — from the plan to each page's note rows.
 *
 * The cut (ledgerCut) charges a note's first rows to the fragment holding its
 * reference, gives the rest the room left on that page and carries what is
 * still over to the following pages' note areas. This turns a plan into the
 * rows (px) each note gets on each page, in the order the page's zone lists
 * them: continued rows first, then the page's own notes in reference order.
 * Pure: no DOM.
 */
import type { PageNoteAllocation } from "@mrnote/core/web/components/console/editor/native-document/paged/pagedFootnotes.ts";
import type { LogicalBlock, TextCutPayload } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerAtoms.ts";
import type { LedgerPlacement, LedgerPlan } from "./ledgerTypes";

const EPSILON_PX = 1e-6;

interface FragmentNote {
  id: string;
  rowPx: number;
  minPx: number;
}

function contentOffsetBefore(block: LogicalBlock, partIndex: number): number {
  let offset = 0;
  for (let i = 0; i < partIndex; i += 1) offset += block.parts[i].node.content.size;
  return offset;
}

/** The notes a placement's fragment references, in reference order. */
function fragmentNotes(block: LogicalBlock, placement: LedgerPlacement): FragmentNote[] {
  const all = block.parts.flatMap((part, partIndex) =>
    part.notes.map((note) => ({
      id: note.id,
      rowPx: note.heightPx,
      minPx: note.minPx,
      logicalOffset: contentOffsetBefore(block, partIndex) + note.offset,
    })),
  );
  if (all.length === 0) return [];
  if (block.kind !== "text") {
    // Other kinds charge their notes to the whole atom: the first fragment.
    return placement.from === null ? all : [];
  }
  const from = placement.from?.kind === "text" ? (placement.from.payload as TextCutPayload).logicalOffset : 0;
  const to = placement.to?.kind === "text" ? (placement.to.payload as TextCutPayload).logicalOffset : Number.POSITIVE_INFINITY;
  return all.filter((note) => note.logicalOffset >= from && note.logicalOffset < to);
}

/**
 * Page index → the rows each note gets there. Pages without note rows are
 * absent. `chromePx` is the zone chrome a page with continued rows pays
 * once (the same value the cut was given).
 */
export function deriveNoteZoneAllocations(
  plan: LedgerPlan,
  logical: readonly LogicalBlock[],
  chromePx: number,
): Map<number, PageNoteAllocation[]> {
  const result = new Map<number, PageNoteAllocation[]>();
  const queue: Array<{ id: string; remainingPx: number }> = [];
  [...plan.pages, ...(plan.notePages ?? [])].forEach((page, pageIndex) => {
    const allocations: PageNoteAllocation[] = [];
    let carryRows = page.noteCarryInPx ? Math.max(0, page.noteCarryInPx - chromePx) : 0;
    while (carryRows > EPSILON_PX && queue.length > 0) {
      const head = queue[0];
      const take = Math.min(head.remainingPx, carryRows);
      head.remainingPx -= take;
      carryRows -= take;
      const last = head.remainingPx <= EPSILON_PX;
      allocations.push({ id: head.id, px: take, first: false, last });
      if (last) queue.shift();
      else break;
    }
    for (const placement of page.placements) {
      const block = logical[placement.atom];
      if (!block) continue;
      let flexLeft = placement.noteFlexTakenPx ?? 0;
      for (const note of fragmentNotes(block, placement)) {
        const extra = Math.min(Math.max(0, note.rowPx - note.minPx), flexLeft);
        flexLeft -= extra;
        const px = note.minPx + extra;
        const rest = note.rowPx - px;
        const last = rest <= EPSILON_PX;
        allocations.push({ id: note.id, px, first: true, last });
        if (!last) queue.push({ id: note.id, remainingPx: rest });
      }
    }
    if (allocations.length > 0) result.set(pageIndex, allocations);
  });
  return result;
}

/** True when any note is spread over more than one page. */
export function allocationsContinueNotes(
  allocations: ReadonlyMap<number, readonly PageNoteAllocation[]>,
): boolean {
  for (const list of allocations.values()) {
    if (list.some((allocation) => !allocation.first || !allocation.last)) return true;
  }
  return false;
}
