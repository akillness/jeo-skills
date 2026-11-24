/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The footnote zone of a column page, read from the plan.
 *
 * On a page the column projector lays out, the notes stand in one zone that
 * spans the page and every column ends above it, so the zone comes off the
 * page's capacity, not off the block that carries the reference. Which notes
 * a page holds depends on where the page ends, and where it ends depends on
 * the room the zone leaves. Read from where the fragments stand now, that is
 * a capacity that follows the layout: R372-D01 (two equal columns, 41 notes)
 * planned page 7 with 1850 px while a paragraph was cut at offset 363 and
 * with 1749 px while it was cut at offset 89 -- the two references between
 * (offsets 114 and 197) changed pages with the cut, 50.5 px of zone in each
 * of two columns -- and each plan was right for its own capacity and wrong
 * for the other's: 21 passes an opening, ended by the cycle hold, ten pages
 * that went somewhere and came back.
 *
 * Here the zone of each page is the smallest one the plan itself agrees
 * with: the pages are planned, each page's zone is read from the references
 * the plan puts on it, and the first page whose zone is not the one it was
 * planned with is planned again with another, until the references the page
 * holds need no more than the zone it was planned with and no smaller zone
 * would do. A page that holds the notes of all its references at the zone
 * they make has that zone. Where the last reference's note finds no room --
 * with room for it the line carrying it no longer fits, without it the line
 * comes back -- the zone is narrowed between the two until the page ends
 * just above that line, which goes to the next page and leaves this one
 * short: Word's rule (a reference and its note's first row stand on one
 * page). Nothing in it reads the page as it stands, so the same document is
 * given the same capacities at every pass and every opening.
 */

import type { LedgerCut, LedgerPage, LedgerPlan } from "./ledgerTypes";

export interface FootZoneNote {
  id: string;
  /** Content offset of the reference in its logical block. */
  logicalOffset: number;
  /** The fragment holding the reference as the block stands. */
  partIndex: number;
  heightPx: number;
  pitchPx: number;
  chromePx: number;
}

export interface FootZonePlanInput {
  /** Plan the pages with `zoneOf(page)` px held out of every column of each
   * page (by absolute page index; 0 for a page with no zone). The plan may
   * end where the page after `through` opens (`truncated`): only its pages
   * up to `through` are read then, and it is never the one returned. */
  plan(zoneOf: (page: number) => number, through: number): { plan: LedgerPlan; truncated: boolean };
  /** Absolute index of the plan's first page. */
  firstPage: number;
  /** Whether the page's notes stand in a zone across its columns. */
  zonePage(page: number): boolean;
  /** The first page at or after `from` whose notes stand in such a zone;
   * null when no page from there on does. (Absent: read from `zonePage`.) */
  nextZonePage?(from: number): number | null;
  /** The notes an atom references that are charged to no block. */
  notesOf(atom: number): readonly FootZoneNote[] | undefined;
  /** Whether the note's reference stands before `cut` in its atom. */
  noteBeforeCut(atom: number, note: FootZoneNote, cut: LedgerCut): boolean;
  /** The zone (px a column) these notes make on the page. */
  zonePx(page: number, notes: readonly FootZoneNote[]): number;
  /** Plans made at most; past them the caller falls back. By default
   * `FOOT_ZONE_PLANS_A_PAGE` for each column page reached and
   * `FOOT_ZONE_PLANS_SPARE`. */
  maxPlans?: number;
}

export interface FootZonePlanResult {
  plan: LedgerPlan;
  /** The zone each page was planned with (absent: none). */
  zones: Map<number, number>;
  plans: number;
  /** Every zone page holds no more notes than its zone has room for. */
  settled: boolean;
}

/** Zones are sums of measured rows: two that differ by less are the same. */
const SAME_ZONE_PX = 0.01;
/** How near (px) the zone of a page that ends above a reference is brought
 * to the least one that sends the reference's line on. */
const ZONE_STEP_PX = 0.5;
/** Each try plans the document from its start to the page being settled
 * (the pages above it are planned the same every time, and the caller
 * answers a cut asked for twice once): a page whose notes all fit takes two,
 * one that ends above a reference up to ten. A search is given this many for
 * each column page it reaches, and some to spare; past them the caller falls
 * back (see `maxPlans`). */
export const FOOT_ZONE_PLANS_A_PAGE = 10;
export const FOOT_ZONE_PLANS_SPARE = 30;

interface PageState {
  /** The largest zone tried that the page's notes did not fit (-1: none). */
  lo: number;
  /** The smallest zone known to hold the notes of the page planned with it. */
  hi: number;
  tried: Set<number>;
  /** A zone the page's notes asked for when planned with more: the one zone
   * below `hi` that may still be exactly its own. */
  probe: number | null;
  settled: boolean;
}

const zoneKey = (px: number): number => Math.round(px * 1000);

/** The notes whose references a planned page holds, in reading order. */
export function footZoneNotesOnPage(
  page: LedgerPage,
  notesOf: FootZonePlanInput["notesOf"],
  noteBeforeCut: FootZonePlanInput["noteBeforeCut"],
): FootZoneNote[] {
  const held: FootZoneNote[] = [];
  for (const placement of page.placements) {
    const notes = notesOf(placement.atom);
    if (!notes?.length) continue;
    for (const note of notes) {
      if (placement.from && noteBeforeCut(placement.atom, note, placement.from)) continue;
      if (placement.to && !noteBeforeCut(placement.atom, note, placement.to)) continue;
      held.push(note);
    }
  }
  return held;
}

export function planWithFootZones(input: FootZonePlanInput): FootZonePlanResult {
  const zones = new Map<number, number>();
  const states = new Map<number, PageState>();
  const zoneOf = (page: number): number => zones.get(page) ?? 0;
  const nextZonePage = input.nextZonePage ?? ((from: number): number | null => {
    for (let page = from; page < from + 100000; page += 1) if (input.zonePage(page)) return page;
    return null;
  });
  // The page being settled: the pages are planned as far as it, and on to
  // the next column page once it stands.
  let through = nextZonePage(input.firstPage) ?? Number.POSITIVE_INFINITY;
  let budget = input.maxPlans !== undefined ? Math.max(1, input.maxPlans) : FOOT_ZONE_PLANS_SPARE + FOOT_ZONE_PLANS_A_PAGE;
  let plans = 0;
  for (;;) {
    const { plan, truncated } = input.plan(zoneOf, through);
    plans += 1;
    // The first page out of step is planned again; the pages after it will
    // hold other blocks then, so what was learnt of them is dropped and each
    // starts from the zone its notes ask for in this plan.
    let moved = false;
    for (let index = 0; index < plan.pages.length; index += 1) {
      const page = input.firstPage + index;
      if (truncated && page > through) break;
      if (!input.zonePage(page)) continue;
      const needPx = input.zonePx(page, footZoneNotesOnPage(plan.pages[index]!, input.notesOf, input.noteBeforeCut));
      if (moved) {
        states.delete(page);
        if (needPx > SAME_ZONE_PX) zones.set(page, needPx);
        else zones.delete(page);
        continue;
      }
      const havePx = zoneOf(page);
      let state = states.get(page);
      if (state?.settled) {
        if (needPx <= havePx + SAME_ZONE_PX) continue;
        state = undefined;
      }
      if (!state) states.set(page, (state = { lo: -1, hi: Number.POSITIVE_INFINITY, tried: new Set(), probe: null, settled: false }));
      // The zone its own notes make: no smaller one holds them (a smaller
      // zone leaves the page more room, never fewer references).
      if (Math.abs(needPx - havePx) <= SAME_ZONE_PX) {
        state.settled = true;
        continue;
      }
      state.tried.add(zoneKey(havePx));
      if (needPx > havePx) {
        // More notes than the zone has room for; planned with room for all of
        // them the page can only hold as many or fewer.
        state.lo = Math.max(state.lo, havePx);
        state.hi = Math.min(state.hi, needPx);
      } else {
        // Room to spare: the line carrying the next reference went on.
        state.hi = Math.min(state.hi, havePx);
        if (needPx > state.lo + SAME_ZONE_PX) state.probe = needPx;
      }
      let nextPx: number | null = null;
      if (state.probe !== null && state.probe > state.lo + SAME_ZONE_PX && state.probe < state.hi - SAME_ZONE_PX && !state.tried.has(zoneKey(state.probe))) {
        nextPx = state.probe;
      } else if (!state.tried.has(zoneKey(state.hi))) {
        nextPx = state.hi;
      } else {
        const first = Math.floor(state.lo / ZONE_STEP_PX + 1e-9) + 1;
        const last = Math.ceil(state.hi / ZONE_STEP_PX - 1e-9) - 1;
        if (first <= last) nextPx = Math.floor((first + last) / 2) * ZONE_STEP_PX;
      }
      state.probe = null;
      if (nextPx === null) {
        // Nothing left between the two: the smallest zone that held.
        state.settled = true;
        if (Math.abs(havePx - state.hi) <= SAME_ZONE_PX) continue;
        nextPx = state.hi;
      }
      zones.set(page, nextPx);
      moved = true;
    }
    if (!moved) {
      // The whole of the pass's pages, every zone standing: the plan.
      if (!truncated) return { plan, zones, plans, settled: true };
      through = nextZonePage(through + 1) ?? Number.POSITIVE_INFINITY;
      if (input.maxPlans === undefined) budget += FOOT_ZONE_PLANS_A_PAGE;
    }
    if (plans >= budget) return { plan, zones, plans, settled: false };
  }
}
