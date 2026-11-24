/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The pass scope — which pages one pass lays out.
 *
 * Word repaginates in the background: an edit lays out the pages the reader
 * sees first, from the first page the edit can have changed, and the rest
 * of the document follows while the reader goes on typing. The ledger does
 * the same with three pieces:
 *
 *   - a pass STARTS at the first page an edit can have changed: the page
 *     before the first sheet whose content changed (its foot may take the
 *     changed content back), moved back to a whole atom's opening so the
 *     planner starts from a known state; the pages before keep their
 *     composition;
 *   - a pass STOPS as soon as a page opens exactly as the current page
 *     does and nothing after it changed (`resync`: pagination is memoryless
 *     given a page's opening, so the rest already is the answer), or when
 *     it has laid out the pages the reader sees plus a few more (`yield`:
 *     the page it stopped at is remembered as PENDING and a later pass goes
 *     on from there);
 *   - the plan handed to the reconciler covers the whole document anyway:
 *     the pages a pass did not lay out are described as they stand, and the
 *     page a pass yielded at takes whatever the window left over, so it may
 *     run over its foot until the background reaches it (its sheet grows
 *     under the overrun, see PAGE_LEDGER_DEFERRED_ATTR).
 *
 * Documents with footnotes keep the single whole-document pass: continued
 * footnote rows carry across pages, so no page's opening is self-contained.
 */
import type { EditorView } from "@tiptap/pm/view";
import { textEngineEnabled } from "@mrnote/core/web/lib/text-engine/flags.ts";
import { boundaryCut, existingSeamKey, textTailNotesPx, type LedgerBuild, type LogicalBlock } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerAtoms.ts";

/** `window.__docsSeamNotesUncharged = true` (ledgerAtoms.planTextHead): as before. */
function seamNotesUnchargedSwitch(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsSeamNotesUncharged?: boolean }).__docsSeamNotesUncharged === true;
}
import type {
  LedgerCut,
  LedgerCutOptions,
  LedgerCutStart,
  LedgerPage,
  LedgerPlacement,
  LedgerPlan,
} from "./ledgerTypes";

export interface LedgerPassScope {
  /** Sheets an earlier pass yielded at: their composition is not yet the
   * plan's answer, a pass must go on from them. */
  pending: ReadonlySet<HTMLElement>;
  /** Index range of the sheets the reader sees (null: unknown). */
  visible: { first: number; last: number } | null;
  /** Pages a pass lays out at least, beyond its start. */
  minPages: number;
  /** A long document laid out progressively (the initial settle, a font
   * that changed every page): a pass starts at the first page even when
   * every sheet changed, and lays out at most `maxPages` pages, the rest
   * following pass by pass. Without it such a pass lays out the whole
   * document at once. */
  progressive?: {
    maxPages: number;
    /** Pages a progressive pass lays out at least (the background, with no
     * reader waiting on one page, lays out more per pass than an edit). */
    minPages?: number;
  } | null;
}

export interface ScopedPass {
  start: LedgerCutStart;
  /** Exclusive index of the first page the pass may leave to a later one. */
  windowEnd: number;
  /** Indexes (ascending) of the pending sheets in this build. */
  pendingPages: number[];
  /** Set by the stop rule: the pass resynced, but these later sheets changed
   * and still have to be laid out by a later pass (their indexes in this
   * build, ascending). Every one of them: a sheet counts as changed for one
   * build only, so one left out here was never laid out at all. The last
   * fragment of a table or a list cut twice in a row stood on such a sheet
   * (the page the second cut made) and stayed taller than its page. */
  resyncLeaves: number[];
}

/** The opening of each planned page, in one comparable vocabulary. */
export function pageStartAtoms(plan: LedgerPlan): string[] {
  return plan.pages.map((page) => {
    const first = page.placements[0];
    return first ? `${first.atom}${first.from ? "+" + first.from.key : ""}` : "";
  });
}

/**
 * The sheets a plan leaves as they are: each whose opening and the next
 * sheet's opening the plan keeps, so it holds the same blocks before and
 * after the plan is applied (its element too: ProseMirror keeps an unchanged
 * page node's view). A plan's last page counts only when the plan reaches
 * the document's end with as many pages as there are sheets.
 */
export function sheetsKeptByPlan(build: LedgerBuild, plan: LedgerPlan, reachesEnd: boolean): Set<HTMLElement> {
  const planned = pageStartAtoms(plan);
  const current = currentPageStartAtoms(build);
  const kept = new Set<HTMLElement>();
  for (let index = 0; index < planned.length && index < current.length; index += 1) {
    if (planned[index] !== current[index]) continue;
    const last = index === planned.length - 1;
    const same = last
      ? reachesEnd && planned.length === current.length
      : planned[index + 1] === current[index + 1];
    const sheet = build.sheets[index];
    if (same && sheet) kept.add(sheet);
  }
  return kept;
}

/** The opening of each current sheet, in the plan's vocabulary. Equality
 * with the plan's openings means the document already IS the ledger's
 * answer. */
export function currentPageStartAtoms(build: LedgerBuild): string[] {
  const starts: string[] = [];
  const pageOfPart = new Map<number, string>();
  for (const block of build.logical) {
    block.parts.forEach((part, partIndex) => {
      if (part.childIndex === 0) {
        const seam = partIndex > 0 ? existingSeamKey(block, partIndex - 1) : null;
        pageOfPart.set(part.sheet, `${block.index}${partIndex > 0 ? "+" + (seam ?? `part${partIndex}`) : ""}`);
      }
    });
  }
  for (let i = 0; i < build.sheets.length; i += 1) starts.push(pageOfPart.get(i) ?? "");
  return starts;
}

/** The fragment that opens sheet `page`: its block and part index. */
function openingOf(build: LedgerBuild, page: number): { block: LogicalBlock; partIndex: number } | null {
  for (const block of build.logical) {
    for (let partIndex = 0; partIndex < block.parts.length; partIndex += 1) {
      const part = block.parts[partIndex];
      if (part.sheet === page && part.childIndex === 0) return { block, partIndex };
      if (part.sheet > page) return null;
    }
  }
  return null;
}

/**
 * Where this pass starts and how far it must go, or null when the whole
 * document is laid out at once: nothing changed and nothing is pending (a
 * verification pass reads cached measurements anyway), or every sheet
 * changed (fonts, width, zoom: there is no unchanged page to keep).
 */
/** A document of more sheets than this is not planned to its end in one pass. */
const PLAN_TO_END_MAX_SHEETS = 400;
/**
 * The start a scoped pass plans from. A page opened by a forced break keeps
 * its first paragraph's space before less the space after the page before's
 * last paragraph in the flow (Word: Page Break Before, or a break opening
 * the paragraph, in compatibility modes 12 and 14 and with no mode; see
 * ledgerCut). A whole pass closes that page and carries its space after in;
 * a scoped pass started at the page read it in `resolvePassScope` and then
 * dropped it (only footnote documents under their progressive trial kept
 * it), so the same page opened 10 px lower when the pass began there than
 * when it began earlier: R347-D02 page 2 held blocks 18-27 in a key's local
 * pass (612.12 of 620 px, block 28's line 7.88 px short) and 18-28 in the
 * whole pass after it (620 of 620), and went between the two on every key.
 * `window.__docsScopedLeadingAfterOff = true` drops it again outside the
 * footnote trial (as before; A/B).
 */
export function scopedPlanStart(start: LedgerCutStart, notesCarry: boolean | null): LedgerCutStart {
  const carries = scopedLeadingAfterOff() ? notesCarry === true : notesCarry !== false;
  return carries ? start : { ...start, leadingAfterPx: 0 };
}

function scopedLeadingAfterOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsScopedLeadingAfterOff?: boolean }).__docsScopedLeadingAfterOff === true;
}

/** The pages such a pass plans at most, under docs-layout. */
const LONG_DOCUMENT_PLAN_PAGES = 64;

export function resolvePassScope(
  build: LedgerBuild,
  scope: LedgerPassScope,
  /** A document with footnotes: the sheets footnote rows are carried into. */
  carriedInto: ((page: number) => boolean) | null = null,
): ScopedPass | null {
  const sheets = build.sheets;
  if (sheets.length === 0) return null;
  const changed: number[] = [];
  const pendingPages: number[] = [];
  sheets.forEach((sheet, index) => {
    if (build.changedSheets.has(sheet)) changed.push(index);
    if (scope.pending.has(sheet)) pendingPages.push(index);
  });
  if (changed.length === sheets.length && !scope.progressive) return null;
  if (changed.length === 0 && pendingPages.length === 0) return null;
  // The page before the first changed sheet may take changed content back
  // (a paragraph that opened the next page and shrank fits its foot now);
  // a pending page is laid out from itself.
  let startPage = Math.min(
    changed.length ? Math.max(0, changed[0] - 1) : Number.POSITIVE_INFINITY,
    pendingPages.length ? pendingPages[0] : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(startPage)) return null;
  // Rows carried into a page come from the page before it: the pass starts
  // where none are.
  while (carriedInto && startPage > 0 && carriedInto(startPage)) startPage -= 1;
  // A page opening with the continuation of a paragraph cut on the page
  // before starts from that existing cut (the seam the planner measured).
  // Only a seam it cannot express sends the start back to the page the
  // whole atom opens (a document of long paragraphs would otherwise plan
  // from its first page on every pass).
  let block: LogicalBlock | null = null;
  let from: LedgerCut | null = null;
  for (let guard = 0; guard <= sheets.length; guard += 1) {
    const opening = openingOf(build, startPage);
    if (!opening) return null;
    if (opening.partIndex === 0) {
      block = opening.block;
      break;
    }
    const cut = boundaryCut(opening.block, opening.partIndex);
    if (cut) {
      block = opening.block;
      // The page pays the notes its opening continuation holds, as a plan
      // that made the cut charges them (planTextHead).
      const notesPx = seamNotesUnchargedSwitch() ? 0 : textTailNotesPx(opening.block, opening.partIndex);
      from = seamNotesUnchargedSwitch() ? cut : { ...cut, tailHeightPx: cut.tailHeightPx + notesPx, ...(opening.block.kind === "text" ? { tailNotesPx: notesPx } : {}) };
      break;
    }
    let earlier = opening.block.parts[0].sheet;
    if (earlier >= startPage) return null;
    while (carriedInto && earlier > 0 && carriedInto(earlier)) earlier -= 1;
    startPage = earlier;
  }
  if (!block) return null;
  const previous = from ? null : build.atoms[block.index - 1];
  const openedByForcedBreak = previous ? previous.forcedBreakAfter || previous.columnBreakAfter : false;
  // The last paragraph in the flow of the page before, as the planner closes
  // a page (an anchored object or a break marker is none).
  let leadingAfterPx = 0;
  if (!from && startPage > 0) {
    const floor = openingOf(build, startPage - 1)?.block.index ?? 0;
    for (let index = block.index - 1; index >= floor; index -= 1) {
      const atom = build.atoms[index];
      if (atom && !atom.hidden && !atom.anchored) {
        leadingAfterPx = Math.max(0, atom.spaceAfterPx || 0);
        break;
      }
    }
  }
  // The window reaches past the reader's pages and past the first pending
  // page it starts at or before: a pass that stopped at page P must lay P
  // out and go on from it, or every pass would end where the last one did.
  const minPages = Math.max(1, scope.minPages);
  const firstPending = pendingPages.find((page) => page >= startPage);
  let windowEnd = scopeWindowEnd(startPage, scope, firstPending);
  // A document that ends soon after the window is laid out to its end:
  // yielding would only hand its last page an overrun for a frame and open
  // the new page a frame later than one pass does. (Not a progressive pass:
  // its sheets past the window are provisional, each may hold several
  // pages, and how many are left is not known until they are laid out.)
  if (!scope.progressive && sheets.length <= windowEnd + minPages) windowEnd = Number.POSITIVE_INFINITY;
  // docs-layout: every block past the sheets measured is known with no
  // layout (the engine's reading or a kept measurement), so planning the
  // rest lays nothing out: the pass plans the document to its end in one
  // go, as Word's background repagination finishes once it has every line
  // (a book of 425 provisional sheets otherwise came down to its 271 a
  // window of four pages at a time, a pass every few seconds).
  // Not before the pages are revealed (the reader's first pages come from a
  // window of their own: a first pass moving a whole document held them
  // back, R286-D01's first screen 8 s to 47 s), and not over estimates (a
  // plan of guesses the page then corrects pass after pass: 7 passes to 16).
  // Over estimates too when the sheets are far from what the document needs
  // (its blocks' heights against the pages' room): a book opened on 425
  // provisional sheets for 271 pages came down a window at a time, minutes
  // of passes; corrected locally afterwards, the plan in one go is far
  // closer than the sheets it replaces.
  const revealed = !sheets[0]?.parentElement?.hasAttribute("data-pagination-initial-settling");
  if (build.horizon && build.horizon.firstEstimated === null && revealed && textEngineEnabled("docs-layout") &&
      ((build.horizon.guessed ?? 0) === 0 || sheetsFarFromNeeded(build)) &&
      mayPlanToTheEnd(sheets[0]?.parentElement ?? null, sheetsFarFromNeeded(build))) {
    // Not in one task past a book's length: what a pass costs goes with the
    // pages it moves, and the steps of 2,700 moved pages held the thread for
    // 20-60 s at a time, again after each key (each change is mapped through
    // the steps after it). The rest follows pass by pass, with the thread free
    // in between.
    windowEnd = sheets.length > PLAN_TO_END_MAX_SHEETS ? Math.max(windowEnd, startPage + LONG_DOCUMENT_PLAN_PAGES) : Number.POSITIVE_INFINITY;
  }
  return { start: { atom: block.index, page: startPage, openedByForcedBreak, from, ...(leadingAfterPx > 0 ? { leadingAfterPx } : {}) }, windowEnd, pendingPages, resyncLeaves: [] };
}

const plannedToTheEnd = new WeakSet<Element>();

/** A plan to the document's end moves every page after its first change. Once
 * the sheets stand about where they belong, moving the far ones again each pass
 * is work the next pass undoes (a 124-page report: 80-114 pages moved per pass
 * while what changed moved on 9, 18, 40 pages in): they wait for the frontier.
 * Trial (`window.__docsPlanToEndOnce`) until measured. */
function mayPlanToTheEnd(root: Element | null, far: boolean): boolean {
  const win = root?.ownerDocument.defaultView as (Window & { __docsPlanToEndOnce?: boolean }) | null | undefined;
  if (!root || !win?.__docsPlanToEndOnce) return true;
  if (far || !plannedToTheEnd.has(root)) {
    plannedToTheEnd.add(root);
    return true;
  }
  return false;
}

/** Whether the document's sheets are far from the number its blocks need:
 * their heights and the spacing between them against the mean page room,
 * off by more than 15 % (and 8 sheets). */
export function sheetsFarFromNeeded(build: LedgerBuild): boolean {
  const sheets = build.sheets.length;
  if (sheets === 0 || build.capacities.length === 0) return false;
  const room = build.capacities.reduce((sum, capacity) => sum + capacity, 0) / build.capacities.length;
  if (!(room > 0)) return false;
  let total = 0;
  for (const atom of build.atoms) total += Math.max(0, atom.heightPx) + Math.max(0, atom.spaceBeforePx ?? 0) + Math.max(0, atom.spaceAfterPx ?? 0);
  const needed = total / room;
  return Math.abs(needed - sheets) > Math.max(8, sheets * 0.15);
}

/**
 * The first page a pass starting at `startPage` may leave to a later pass:
 * past the reader's pages and the first pending page, and, for a progressive
 * pass, no more than its page budget beyond where it has new pages to lay
 * out: its start, or the first pending page after it (a reader who jumped to
 * the end of a book still being laid out gets the pages in front of them a
 * budget at a time, never the whole book in one task).
 *
 * The budget counts from the pending page, not from the start: a sheet
 * before it that something restyles on every frame (a text box placed
 * again, a list marker fitted again) starts every pass there, and a budget
 * counted from that start ended each pass a few pages later, so the
 * background walked again from the top through pages it had already laid
 * out and never got far past them. The pages between are planned from the
 * measurements they have, which costs no layout.
 */
export function scopeWindowEnd(startPage: number, scope: LedgerPassScope, firstPending: number | undefined): number {
  const minPages = Math.max(1, scope.progressive?.minPages ?? scope.minPages);
  const windowEnd = Math.max(
    startPage + minPages,
    (scope.visible?.last ?? -1) + 2,
    firstPending !== undefined ? firstPending + minPages : 0,
  );
  const cap = scope.progressive?.maxPages;
  const newFrom = firstPending !== undefined && firstPending > startPage ? firstPending : startPage;
  return cap !== undefined && cap > 0 ? Math.min(windowEnd, newFrom + Math.max(minPages, cap)) : windowEnd;
}

/** The planner's stop rule for a scoped pass (see the module comment). */
export function scopedStopAt(
  build: LedgerBuild,
  scoped: ScopedPass,
  currentStarts: readonly string[],
  /** A document with footnotes: the sheets footnote rows are carried into. */
  carriedInto: ((page: number) => boolean) | null = null,
  /** Whether the page standing at an index is one a pass laid out (null:
   * every page counts as laid out). */
  laidOut: ((page: number) => boolean) | null = null,
): NonNullable<LedgerCutOptions["stopAt"]> {
  const sheets = build.sheets;
  const changedWithin = (from: number, to: number): number[] => {
    const changed: number[] = [];
    for (let i = from; i < to && i < sheets.length; i += 1) {
      if (build.changedSheets.has(sheets[i])) changed.push(i);
    }
    return changed;
  };
  return (page, atom, from) => {
    // (The planner asks only at a page it carries no footnote rows into; the
    // page as it stands must carry none in either.)
    // Nor at a page no pass has laid out: a provisional sheet as the document
    // came (a part's own pagination) opens with the same block and may hold
    // less than the plan would put on it (R282-D07 under
    // `__docsFootnoteProgressive`: a resync on its provisional sheet 5, the
    // block after a table left on the next page, 56 pages for 55).
    if (page < currentStarts.length && currentStarts[page] === `${atom}${from ? "+" + from.key : ""}` && !carriedInto?.(page) && laidOut?.(page) !== false) {
      // The pages from here on were composed from this same opening: they
      // are the answer already, up to the next pending page, or up to a
      // sheet that changed since (the pages a previous pass moved content
      // into, or made): those are left pending for a later pass, which
      // starts there instead of planning the unchanged pages between again.
      //
      // With a pending page still ahead the pass goes on to it instead: a
      // later pass starts at the first changed sheet again, and when that
      // sheet changes on every pass (a field or decoration restyled each
      // frame) every pass resynced before the pending page and the
      // background never reached it -- the page stayed over its foot until
      // the ledger gave up ("ledger-cycle").
      //
      // Nor does a pass resync AT a changed sheet: that sheet is the next
      // pass's start, from this very opening, and the plan from here on is
      // the same one (pagination is memoryless given a page's opening).
      // Typing on a page the pass reached from the page before stopped at
      // the edited sheet itself, so every key in a long book took two
      // passes in two frames, the second laying out the page typed on.
      const nextPending = scoped.pendingPages.find((pending) => pending >= page);
      const changedHere = page < sheets.length && build.changedSheets.has(sheets[page]);
      if (nextPending === undefined && !changedHere) {
        scoped.resyncLeaves = changedWithin(page, sheets.length);
        return "resync";
      }
    }
    if (page >= scoped.windowEnd) return "yield";
    return null;
  };
}

function placementOf(block: LogicalBlock, firstPart: number, lastPart: number, from?: LedgerCut | null): LedgerPlacement {
  return {
    atom: block.index,
    from: from !== undefined ? from : firstPart > 0 ? boundaryCut(block, firstPart) : null,
    to: lastPart + 1 < block.parts.length ? boundaryCut(block, lastPart + 1) : null,
  };
}

/** The current composition as placements per sheet: one placement per
 * block and sheet (its in-sheet column fragments joined). */
function currentPlacements(build: LedgerBuild): LedgerPlacement[][] {
  const pages = build.sheets.map(() => [] as LedgerPlacement[]);
  for (const block of build.logical) {
    let runStart = 0;
    for (let i = 1; i <= block.parts.length; i += 1) {
      if (i === block.parts.length || block.parts[i].sheet !== block.parts[runStart].sheet) {
        pages[block.parts[runStart].sheet]?.push(placementOf(block, runStart, i - 1));
        runStart = i;
      }
    }
  }
  return pages;
}

function seamIndexForKey(block: LogicalBlock, key: string): number | null {
  for (let seam = 0; seam < block.parts.length - 1; seam += 1) {
    if (existingSeamKey(block, seam) === key) return seam;
  }
  return null;
}

/**
 * A document with footnotes: the page a standing sheet was laid out as (its
 * note rows carried in and out, the flexible note room its fragments took)
 * and the note-only pages after the last one. A standing page drawn without
 * them published its notes as if nothing were carried across it: a note
 * continued from the page before a pass's start was dropped from the zones
 * (R205-D04 under `__docsFootnoteProgressive`).
 */
export interface StandingNotes {
  page(index: number): LedgerPage | undefined;
  notePages(): LedgerPage[] | undefined;
}

function withStandingNotes(page: LedgerPage, laidOut: LedgerPage | undefined): LedgerPage {
  if (!laidOut) return page;
  if (laidOut.noteCarryInPx) page.noteCarryInPx = laidOut.noteCarryInPx;
  if (laidOut.noteCarryOutPx) page.noteCarryOutPx = laidOut.noteCarryOutPx;
  // The same page node holds the same fragments, in order (atom indexes may
  // have moved with an edit before it).
  if (laidOut.placements.length === page.placements.length) {
    laidOut.placements.forEach((placement, index) => {
      if (placement.noteFlexTakenPx !== undefined) page.placements[index] = { ...page.placements[index]!, noteFlexTakenPx: placement.noteFlexTakenPx };
    });
  }
  return page;
}

/**
 * The whole-document plan of a scoped pass: the pages before its start as
 * they stand, the pages it planned, and after a stop the rest as it stands.
 * After a `yield` the page it stopped at takes every fragment from the one
 * it would open with through the end of the current sheet that fragment
 * stands on (or of the sheet at its own index, when that is later), so no
 * page after it is touched by this pass.
 */
export function composeScopedPlan(
  build: LedgerBuild,
  planned: LedgerPlan,
  start: LedgerCutStart,
  /** A document with footnotes: what the pass that laid out each standing
   * page planned for it (StandingNotes). */
  standingNotes: StandingNotes | null = null,
): LedgerPlan {
  const current = currentPlacements(build);
  const capacities = build.capacities;
  const pageAt = (index: number, placements: LedgerPlacement[]): LedgerPage => {
    const page: LedgerPage = {
      placements,
      usedPx: 0,
      capacityPx: capacities[Math.min(index, capacities.length - 1)] ?? 0,
      preserveLeadingSpace: false,
    };
    return standingNotes ? withStandingNotes(page, standingNotes.page(index)) : page;
  };
  const pages: LedgerPage[] = [];
  for (let i = 0; i < start.page && i < current.length; i += 1) pages.push(pageAt(i, current[i]));
  pages.push(...planned.pages);
  const stop = planned.stop;
  // The pages before the start, and after a resync, are the sheets with the
  // same index as they stand. `currentPlacements` joins a block's fragments
  // on one sheet; a seam between two of them that is not (yet) read as a
  // column seam (an unequal-column cut whose tail the projector placed in the
  // same track) was merged by the reconciler although no pass laid that page
  // out. The cut was made again on the next frame and merged again on the
  // one after: R13-D13 alternated so on its first page for every background
  // step.
  const firstPage = start.page;
  if (!stop) return { ...planned, pages, standing: (page) => page < firstPage };
  if (stop.kind === "resync") {
    for (let i = stop.page; i < current.length; i += 1) pages.push(pageAt(i, current[i]));
    const resyncPage = stop.page;
    // The note-only pages after the last one stand with it.
    const notePages = standingNotes?.notePages() ?? null;
    return { ...planned, ...(notePages?.length ? { notePages } : {}), pages, standing: (page) => page < firstPage || page >= resyncPage };
  }
  const block = build.logical[stop.atom];
  if (!block) return { ...planned, pages };
  // The part the yield page opens with: the whole block, the part after an
  // existing seam, or the part a fresh cut lands in (its tail is made by the
  // reconciler and opens the page).
  let tailPart = 0;
  let from: LedgerCut | null = null;
  if (stop.from) {
    const seam = seamIndexForKey(block, stop.from.key);
    if (seam !== null) {
      tailPart = seam + 1;
    } else {
      const payload = stop.from.payload as { partIndex?: unknown } | null;
      tailPart = payload && Number.isInteger(payload.partIndex) ? Math.min(block.parts.length - 1, Math.max(0, payload.partIndex as number)) : 0;
      from = stop.from;
    }
  }
  const until = Math.max(block.parts[tailPart]?.sheet ?? stop.page, stop.page);
  const placements: LedgerPlacement[] = [];
  const pushRuns = (owner: LogicalBlock, fromPart: number, firstFrom: LedgerCut | null | undefined) => {
    let runStart = fromPart;
    for (let i = fromPart + 1; i <= owner.parts.length; i += 1) {
      if (i === owner.parts.length || owner.parts[i].sheet !== owner.parts[runStart].sheet) {
        if (owner.parts[runStart].sheet <= until) {
          placements.push(placementOf(owner, runStart, i - 1, runStart === fromPart ? firstFrom : undefined));
        }
        runStart = i;
      }
    }
  };
  pushRuns(block, tailPart, from ?? (tailPart > 0 ? boundaryCut(block, tailPart) : null));
  for (let index = stop.atom + 1; index < build.logical.length; index += 1) {
    const next = build.logical[index];
    if ((next.parts[0]?.sheet ?? Number.POSITIVE_INFINITY) > until) break;
    pushRuns(next, 0, undefined);
  }
  if (placements.length > 0) pages.push(pageAt(stop.page, placements));
  for (let i = until + 1; i < current.length; i += 1) pages.push(pageAt(i, current[i]));
  return { ...planned, pages, standing: (page) => page < firstPage };
}

/** The scroller found for an editor, kept while it still holds it. */
const scrollers = new WeakMap<Element, HTMLElement>();

/** Nearest scrolling ancestor of the editor (the notebook window's body).
 * Once found it is kept: its scrollHeight, read on every pass, laid the
 * whole book out again between the ledger's writes. Its box is the
 * viewport whether or not the document still overflows it. */
function scrollParentOf(element: Element): HTMLElement | null {
  const win = element.ownerDocument.defaultView;
  if (!win) return null;
  const known = scrollers.get(element);
  if (known && known.isConnected && known.contains(element)) {
    const overflow = win.getComputedStyle(known).overflowY;
    if (overflow === "auto" || overflow === "scroll") return known;
  }
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = win.getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      scrollers.set(element, node);
      return node;
    }
  }
  return null;
}

/** Index range of the sheets inside the reader's viewport, null when no
 * sheet is (or the viewport has no height). */
export function visibleSheetRange(view: EditorView, sheets: readonly HTMLElement[]): { first: number; last: number } | null {
  const scroller = scrollParentOf(view.dom);
  const win = view.dom.ownerDocument.defaultView;
  let top = 0;
  let bottom = win?.innerHeight ?? 0;
  if (scroller) {
    const bounds = scroller.getBoundingClientRect();
    top = bounds.top;
    bottom = bounds.bottom;
  }
  if (!(bottom > top)) return null;
  // The sheets stand in document order down the surface, so the first one
  // ending below the viewport's top and the last one starting above its
  // bottom are found by bisection. Every background step asks up to three
  // times, and a box read per sheet per question is the document's length each.
  const firstEndingBelow = lowerBound(sheets.length, (index) => sheets[index]!.getBoundingClientRect().bottom > top);
  const firstStartingAfter = lowerBound(sheets.length, (index) => !(sheets[index]!.getBoundingClientRect().top < bottom));
  const last = firstStartingAfter - 1;
  return firstEndingBelow > last ? null : { first: firstEndingBelow, last };
}

/** The first index in [0, length) that answers true, length when none does
 * (`holds` is false up to some index and true from there on). */
function lowerBound(length: number, holds: (index: number) => boolean): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (holds(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
