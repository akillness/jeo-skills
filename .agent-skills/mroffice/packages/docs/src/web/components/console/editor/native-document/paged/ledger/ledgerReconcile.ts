/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Ledger reconciliation — turn a plan into ONE ProseMirror transaction.
 *
 * The plan speaks in logical atoms and cuts; the document speaks in sheets
 * and fragments. Reconciliation:
 *
 *   1. decides which existing seams survive: a seam whose logical key the
 *      plan reproduces, and every seam before a fragment the plan cuts inside
 *      (the planner measured that fragment as it is). All other seams are
 *      merged back, from the end of the document backwards;
 *   2. keeps an ordered SEQUENCE of the surviving fragments (atom, ordinal) —
 *      moves never change reading order, so the sequence plus the plan gives
 *      each page's exact fragment count;
 *   3. walks the page boundaries left to right: whole fragments move across
 *      the boundary until the page ends where the plan says; a NEW cut is
 *      then materialised with the existing split helpers, which expect the
 *      block to open the next sheet and pull its head back, and the tail
 *      joins the sequence.
 *
 * Every helper operates on `tr.doc`; positions are recomputed from the live
 * transaction between steps and nothing is measured here.
 */
import { Mark, type Node as PmNode } from "@tiptap/pm/model";
import { ReplaceStep } from "@tiptap/pm/transform";
import { MRNOTE_BLOCK_ID_ATTR } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { Selection, type Transaction } from "@tiptap/pm/state";
import {
  applyBoundaryMove,
  applyCodeBlockSplit,
  applyContinuationMerge,
  applyNoteListCursorSplit,
  applyNoteListOverflowCursorSplit,
  applyNoteSliceMerge,
  applyOverflowSplit,
  applyTableBoundarySplit,
  applyTableOverflowSplit,
  applyTextBlockOverflowSplit,
  applyTextBlockSplit,
  captureTableTextSelection,
  collectPages,
  REBALANCE_META,
  restoreTableTextSelection,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { TABLE_FRAGMENT_ID_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import {
  applyContainerBoundarySplit,
  applyContainerContinuationMerge,
  applyContainerOverflowSplit,
} from "@mrnote/core/web/components/console/editor/native-document/paged/containerSplitting.ts";
import { mergeAdjacentTableFragmentsJson } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import { unequalColumnPlacementForBlock, unequalColumnProjectionForSheet } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";
import type { JoinedColumnCut } from "./ledgerColumns";
import { isContinuationTail } from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import {
  applyRowSliceBoundarySplit,
  applyRowSliceMerge,
  applyRowSliceOverflowSplit,
} from "@mrnote/core/web/components/console/editor/native-document/paged/rowSliceSplitting.ts";
import type { LedgerCut, LedgerPlan } from "./ledgerTypes";
import {
  existingSeamKey,
  isColumnSeam,
  rebasedContainerPlan,
  type CodeCutPayload,
  type ContainerCutPayload,
  type LogicalBlock,
  type NotesCutPayload,
  type RowsCutPayload,
  type TableCutPayload,
  type TextCutPayload,
} from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerAtoms.ts";

export interface ReconcileResult {
  tr: Transaction;
  changed: boolean;
  /** Cuts the helpers refused (kept whole; the verifier reports overflow). */
  refusedCuts: number;
  mergedSeams: number;
  /** Blocks whose seam between two fragments in one track of a sheet was
   * merged, as `blockId@sheet` with the room the head's track left before it
   * (see refuseColumnCuts). */
  mergedInSheet: JoinedColumnCut[];
  splits: number;
  moves: number;
  /** Per-boundary diagnostics for verification harnesses. */
  steps: Array<{ boundary: number; current: number; wanted: number; delta: number; cut: string | null; endIndex: number; placed: number }>;
}

interface SequenceEntry {
  atom: number;
  /** Original part index this fragment starts with (after merges). */
  startPart: number;
}

/** The room the head's track leaves before it when the projector drew the
 * head whole in a later track (its split candidate there); null when the
 * head stands where it fits. */
function headColumnRoomPx(head: HTMLElement): number | null {
  const sheet = head.parentElement;
  if (!sheet) return null;
  const projection = unequalColumnProjectionForSheet(sheet);
  if (!projection) return null;
  // The projector's own index: every element child of the sheet.
  const index = Array.from(sheet.children).filter((child) => child instanceof HTMLElement).indexOf(head);
  if (index < 0) return null;
  const candidate = projection.splitCandidates.find((entry) => entry.blockIndex === index);
  return candidate ? candidate.availablePx : null;
}

function cutPartIndex(cut: LedgerCut): number | null {
  const payload = cut.payload as { partIndex?: unknown } | null;
  return payload && Number.isInteger(payload.partIndex) ? (payload.partIndex as number) : null;
}

function sameAttrValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether two documents differ in nothing but their block ids. */
export function sameIgnoringBlockIds(a: PmNode, b: PmNode): boolean {
  if (a === b) return true;
  if (a.type !== b.type || a.childCount !== b.childCount || !Mark.sameSet(a.marks, b.marks)) return false;
  if (a.isText) return a.text === b.text;
  for (const key of new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])) {
    if (key === MRNOTE_BLOCK_ID_ATTR) continue;
    if (!sameAttrValue(a.attrs[key], b.attrs[key])) return false;
  }
  for (let index = 0; index < a.childCount; index += 1) {
    if (!sameIgnoringBlockIds(a.child(index), b.child(index))) return false;
  }
  return true;
}

function mergeSeam(tr: Transaction, block: LogicalBlock, headPos: number, tailPos: number): boolean {
  const head = tr.doc.nodeAt(headPos);
  const tail = tr.doc.nodeAt(tailPos);
  if (!head || !tail) return false;
  switch (block.kind) {
    case "text":
    case "code":
      return applyContinuationMerge(tr, headPos, tailPos);
    case "container":
      return applyContainerContinuationMerge(tr, headPos, tailPos);
    case "notes":
      return applyNoteSliceMerge(tr, headPos, tailPos);
    case "rows":
      return applyRowSliceMerge(tr, headPos, tailPos);
    case "table": {
      const merged = mergeAdjacentTableFragmentsJson(head.toJSON(), tail.toJSON());
      if (!merged) return false;
      let node: PmNode;
      try {
        node = tr.doc.type.schema.nodeFromJSON(merged);
        node.check();
      } catch {
        return false;
      }
      // A caret in the tail fragment's cell maps to the end of the replaced
      // range (the paragraph after the table) and the next keystrokes land
      // there; carry it across the merge as a text offset in the table.
      const selection = captureTableTextSelection(tr, head, headPos);
      const $tail = tr.doc.resolve(tailPos);
      const tailParent = $tail.parent;
      if (tailParent.type.name === PAGE_BLOCK_NODE && tailParent.childCount === 1) {
        const parentPos = $tail.before($tail.depth);
        tr.delete(parentPos, parentPos + tailParent.nodeSize);
      } else {
        tr.delete(tailPos, tailPos + tail.nodeSize);
      }
      tr.replaceWith(headPos, headPos + head.nodeSize, node);
      restoreTableTextSelection(tr, String(node.attrs?.[TABLE_FRAGMENT_ID_ATTR] ?? ""), selection);
      return true;
    }
    default:
      return false;
  }
}

/** How many following sheets one page may pull from to fill itself. */
const MAX_PULL_SHEETS = 64;














function fewestSeamSteps(before: PmNode, after: PmNode, fresh: () => Transaction): Transaction | null {
  const pageType = before.type.schema.nodes[PAGE_BLOCK_NODE];
  if (!pageType) return null;
  const flatten = (doc: PmNode): { blocks: PmNode[]; seams: Set<number>; pages: boolean } => {
    const blocks: PmNode[] = [];
    const seams = new Set<number>();
    let pages = true;
    doc.forEach((page) => {
      if (page.type !== pageType || page.childCount === 0) pages = false;
      if (blocks.length > 0) seams.add(blocks.length);
      page.forEach((block) => blocks.push(block));
    });
    return { blocks, seams, pages };
  };
  const old = flatten(before), next = flatten(after);
  if (!old.pages || !next.pages || old.blocks.length !== next.blocks.length) return null;
  for (let index = 0; index < old.blocks.length; index += 1) {
    if (old.blocks[index] !== next.blocks[index] && !old.blocks[index].eq(next.blocks[index])) return null;
  }
  const changes = new Set<number>();
  for (const seam of old.seams) if (!next.seams.has(seam)) changes.add(seam);
  for (const seam of next.seams) if (!old.seams.has(seam)) changes.add(seam);
  const tr = fresh();
  if (tr.doc !== before) return null;
  // From the end, so the positions before a change stand.
  for (const seam of [...changes].sort((a, b) => b - a)) {
    // Where block `seam` starts in the document as it is now.
    let pos = -1, seen = 0;
    tr.doc.forEach((page, offset) => {
      if (pos >= 0) return;
      if (seam >= seen && seam < seen + page.childCount) {
        let inner = offset + 1;
        for (let i = 0; i < seam - seen; i += 1) inner += page.child(i).nodeSize;
        pos = inner;
      }
      seen += page.childCount;
    });
    if (pos < 0) return null;
    if (old.seams.has(seam)) {
      // The seam goes: block `seam` opens a page; join it to the page before.
      if (pos - 1 <= 0) return null;
      tr.join(pos - 1);
    } else {
      tr.split(pos, 1);
    }
  }
  return tr.doc.eq(after) ? tr : null;
}











export function withoutCancellingPairs(tr: Transaction, fresh: () => Transaction): Transaction | null {
  const steps = tr.steps;
  const skip = new Set<number>();
  for (let index = 0; index + 1 < steps.length; index += 1) {
    if (skip.has(index)) continue;
    const first = steps[index], second = steps[index + 1];
    if (!(first instanceof ReplaceStep) || !(second instanceof ReplaceStep)) continue;
    const joinThenSplit = first.to === first.from + 2 && first.slice.size === 0 && second.from === first.from && second.to === second.from;
    const splitThenJoin = first.from === first.to && second.to === second.from + 2 && second.slice.size === 0 && second.from === first.from;
    if (!joinThenSplit && !splitThenJoin) continue;
    const beforePair = tr.docs[index];
    const afterPair = index + 2 < steps.length ? tr.docs[index + 2] : tr.doc;
    if (beforePair && afterPair && beforePair.eq(afterPair)) {
      skip.add(index);
      skip.add(index + 1);
      index += 1;
    }
  }
  if (skip.size === 0) return null;
  const replay = fresh();
  if (!replay.doc.eq(tr.docs[0] ?? tr.doc)) return null;
  for (let index = 0; index < steps.length; index += 1) {
    if (skip.has(index)) continue;
    if (replay.maybeStep(steps[index]).failed) return null;
  }
  return replay.doc.eq(tr.doc) ? replay : null;
}

export function reconcileLedgerPlan(
  tr: Transaction,
  plan: LedgerPlan,
  logical: LogicalBlock[],
  fresh?: () => Transaction,
): ReconcileResult {
  const result: ReconcileResult = { tr, changed: false, refusedCuts: 0, mergedSeams: 0, mergedInSheet: [], splits: 0, moves: 0, steps: [] };
  const pageType = tr.doc.type.schema.nodes[PAGE_BLOCK_NODE];
  if (!pageType) return result;
  // A refused cut is reconciled as "push the block forward, then pull it back":
  // two steps whose net effect on the document is nothing at all. ProseMirror's
  // `docChanged` counts steps, so the composition below is compared against the
  // document it started from instead — a pass that cannot change the document
  // must report convergence, or the ledger re-runs the identical plan until it
  // gives up and marks the layout stalled.
  const before = tr.doc;

  // ---- 1. which seams survive.
  // A seam key names a cut within its own fragment (a container's
  // `item:1:blocks:14` counts the blocks of the item's piece it ends), so
  // two seams of one atom can share a key: a wanted key is matched with the
  // seam it was planned at (the cut's part), not with any seam that has it.
  const wantedKeys = new Map<number, Array<{ key: string; part: number | null }>>();
  const keepBefore = new Map<number, number>(); // atom -> keep every seam < part
  for (const page of plan.pages) {
    for (const placement of page.placements) {
      const cut = placement.to;
      if (!cut) continue;
      const keys = wantedKeys.get(placement.atom) ?? [];
      keys.push({ key: cut.key, part: cutPartIndex(cut) });
      wantedKeys.set(placement.atom, keys);
      const part = cutPartIndex(cut);
      if (part !== null) keepBefore.set(placement.atom, Math.max(keepBefore.get(placement.atom) ?? 0, part));
    }
  }
  const keptSeams = new Map<number, number[]>(); // atom -> sorted seam indexes kept
  const merges: Array<{ block: LogicalBlock; seam: number; headPos: number; tailPos: number }> = [];
  // A seam inside a sheet the plan describes as it stands is that sheet's.
  const standingSeam = (block: LogicalBlock, seam: number) =>
    Boolean(plan.standing && block.parts[seam].sheet === block.parts[seam + 1].sheet && plan.standing(block.parts[seam].sheet));
  for (const block of logical) {
    const wanted = wantedKeys.get(block.index) ?? [];
    const before = keepBefore.get(block.index) ?? 0;
    const kept: number[] = [];
    // (By key: a paragraph many pages long has as many wanted cuts as seams.)
    const wantedParts = new Map<string, Array<number | null>>();
    for (const entry of wanted) {
      const parts = wantedParts.get(entry.key);
      if (parts) parts.push(entry.part);
      else wantedParts.set(entry.key, [entry.part]);
    }
    for (let seam = 0; seam < block.parts.length - 1; seam += 1) {
      const key = existingSeamKey(block, seam);
      const wantedHere = key !== null && Boolean(wantedParts.get(key)?.some((part) => part === null || part === seam));
      if (isColumnSeam(block, seam) || standingSeam(block, seam) || wantedHere || seam + 1 <= before) kept.push(seam);
      else merges.push({ block, seam, headPos: block.parts[seam].pos, tailPos: block.parts[seam + 1].pos });
    }
    keptSeams.set(block.index, kept);
  }
  // Merge from the end so earlier document positions remain valid.
  merges.sort((a, b) => b.headPos - a.headPos);
  for (const merge of merges) {
    const head = merge.block.parts[merge.seam];
    const tail = merge.block.parts[merge.seam + 1];
    const inSheet = head.sheet === tail.sheet;
    // Only a column cut the projector drew with both pieces in one track is
    // refused on its sheet (R13-D13, see refuseColumnCuts). Any other seam
    // joined inside a sheet -- a page cut whose pieces a pass brought onto
    // one page, a cut a later pass moved -- is no such cut: refusing it kept
    // the block whole on that sheet for the rest of the layout even where it
    // later straddled a column's foot, so the page's cut and the plan's parted
    // by which pass came first (R460-D16 p10, a paragraph the plan cut at the
    // first column's foot drawn whole in the second).
    const headTrack = inSheet && !head.hollow ? unequalColumnPlacementForBlock(head.dom)?.columnIndex : undefined;
    const tailTrack = inSheet && !tail.hollow ? unequalColumnPlacementForBlock(tail.dom)?.columnIndex : undefined;
    const anySeam = (head.dom.ownerDocument?.defaultView as (Window & { __dqc2RefuseAnySeam?: boolean }) | null)?.__dqc2RefuseAnySeam === true;
    const oneTrack = anySeam ? inSheet : headTrack !== undefined && headTrack === tailTrack;
    const headId = head.node.attrs?.[MRNOTE_BLOCK_ID_ATTR];
    if (mergeSeam(tr, merge.block, merge.headPos, merge.tailPos)) {
      result.mergedSeams += 1;
      if (oneTrack && typeof headId === "string" && headId) result.mergedInSheet.push({ key: `${headId}@${head.sheet}`, roomPx: headColumnRoomPx(head.dom) });
    } else {
      // A seam the helpers cannot join stays a fragment boundary.
      const kept = keptSeams.get(merge.block.index) ?? [];
      kept.push(merge.seam);
      kept.sort((a, b) => a - b);
      keptSeams.set(merge.block.index, kept);
    }
  }

  // ---- 2. the fragment sequence after merges.
  const sequence: SequenceEntry[] = [];
  for (const block of logical) {
    const kept = keptSeams.get(block.index) ?? [];
    sequence.push({ atom: block.index, startPart: 0 });
    for (const seam of kept) sequence.push({ atom: block.index, startPart: seam + 1 });
  }
  /** Sequence index of the fragment of `atom` that contains original part `part`. */
  const fragmentIndexFor = (atom: number, part: number): number => {
    let found = -1;
    for (let i = 0; i < sequence.length; i += 1) {
      const entry = sequence[i];
      if (entry.atom !== atom) continue;
      if (entry.startPart <= part) found = i;
      else break;
    }
    return found;
  };
  const lastFragmentIndexFor = (atom: number): number => {
    let found = -1;
    for (let i = 0; i < sequence.length; i += 1) if (sequence[i].atom === atom) found = i;
    return found;
  };

  // ---- 3. boundaries left to right.
  let placed = 0; // sequence entries already on earlier pages
  for (let boundary = 0; boundary < plan.pages.length; boundary += 1) {
    const page = plan.pages[boundary];
    const last = page.placements[page.placements.length - 1];
    if (!last) break;
    const block = logical[last.atom];
    let endIndex: number;
    let pendingCut: LedgerCut | null = null;
    if (last.to === null) {
      endIndex = lastFragmentIndexFor(last.atom);
    } else {
      const seamKeys = (keptSeams.get(last.atom) ?? []).map((seam) => ({ seam, key: existingSeamKey(block, seam) }));
      // The seam the cut was planned at (its part), not an earlier seam of
      // the atom that happens to share its key: page 373b71a8 (one list item
      // over 30 pages) planned its 10th page at `item:1:blocks:14`, the key
      // of its 2nd page's seam, and the page was "ended" there -- the rest of
      // the item stood on the 9th sheet uncut, 17,919 px tall.
      const cutPart = cutPartIndex(last.to);
      const kept = seamKeys.find((entry) => entry.key === last.to!.key && (cutPart === null || entry.seam === cutPart));
      if (kept) {
        // The page ends at an existing seam: the fragment before it.
        endIndex = fragmentIndexFor(last.atom, kept.seam);
      } else {
        const part = cutPartIndex(last.to) ?? 0;
        endIndex = fragmentIndexFor(last.atom, part);
        pendingCut = last.to;
      }
    }
    if (endIndex < placed) endIndex = placed; // never an empty page
    const wantedCount = endIndex - placed + 1;

    const pages = collectPages(tr.doc);
    const current = pages?.[boundary];
    if (!pages || !current) break;
    const delta = current.node.childCount - wantedCount;
    result.steps.push({ boundary, current: current.node.childCount, wanted: wantedCount, delta, cut: pendingCut?.key ?? null, endIndex, placed });
    if (delta !== 0) {
      applyBoundaryMove(tr, pageType, boundary, delta, { isolateTrailingForcedBreak: false });
      result.moves += 1;
      // A pull takes at most the whole next sheet. A page that wants more
      // than that sheet holds (provisional sheets of a long document are
      // estimates, often far shorter than a page) keeps pulling from the
      // sheets after it until it holds what the plan gave it. Left short,
      // every later boundary was off by the shortfall: each pushed its tail
      // on to the next, through to the end of the document, so a background
      // pass of twelve pages moved blocks on every one of ~500 sheets after
      // them (~500 moves, about a second of DOM rebuilding per pass on a
      // 296-page book).
      for (let pulls = 0; delta < 0 && pulls < MAX_PULL_SHEETS; pulls += 1) {
        const now = collectPages(tr.doc);
        const page = now?.[boundary];
        if (!now || !page || !now[boundary + 1]) break;
        const short = page.node.childCount - wantedCount;
        if (short >= 0) break;
        applyBoundaryMove(tr, pageType, boundary, short, { isolateTrailingForcedBreak: false });
        result.moves += 1;
        const after = collectPages(tr.doc)?.[boundary];
        if (!after || after.node.childCount === page.node.childCount) break;
      }
    }
    if (pendingCut) {
      // The block to split must open the next sheet; push it, cut, pull the head back.
      const after = collectPages(tr.doc);
      const page2 = after?.[boundary];
      if (page2 && page2.node.childCount >= 2) {
        applyBoundaryMove(tr, pageType, boundary, 1, { isolateTrailingForcedBreak: false });
        result.moves += 1;
        if (applyPlannedCut(tr, boundary, pendingCut, block)) {
          result.splits += 1;
          sequence.splice(endIndex + 1, 0, { atom: last.atom, startPart: sequence[endIndex].startPart });
        } else {
          // Refused: pull the whole block back so the page keeps its content.
          applyBoundaryMove(tr, pageType, boundary, -1, { isolateTrailingForcedBreak: false });
          result.refusedCuts += 1;
        }
      } else if (page2 && page2.node.childCount === 1) {
        // The block opens its own page (oversized or alone): cut it in place —
        // the head stays, the tail and every follower move to the next sheet.
        if (applyPlannedOverflowCut(tr, boundary, pendingCut, block)) {
          result.splits += 1;
          sequence.splice(endIndex + 1, 0, { atom: last.atom, startPart: sequence[endIndex].startPart });
        } else {
          result.refusedCuts += 1;
        }
      }
    }
    // A page never carries two fragments of one block: their seam would paint
    // block spacing the plan never charged (the whole-atom model renders the
    // block joined). Fragments kept only so a later cut's payload stayed valid
    // join here, once that cut is in the transaction.
    const joined = plan.standing?.(boundary) ? 0 : mergeSamePageFragments(tr, boundary, sequence, placed, endIndex, logical);
    endIndex -= joined;
    result.mergedSeams += joined;
    placed = endIndex + 1;
  }
  // Drain anything the plan left behind the last page.
  let pages = collectPages(tr.doc);
  const lastBoundary = plan.pages.length - 1;
  while (pages && pages.length > plan.pages.length && lastBoundary >= 0) {
    const next = pages[lastBoundary + 1];
    applyBoundaryMove(tr, pageType, lastBoundary, -next.node.childCount);
    result.moves += 1;
    const again = collectPages(tr.doc);
    if (!again || again.length >= pages.length) break;
    pages = again;
  }

  // A composition that only gave fragments new block ids (a cut that put a
  // seam back where it stood) changes nothing the ledger lays out. Counted as
  // a change, it was dispatched, measured the same, planned the same and
  // dispatched again without end (corpus R03-D23: a re-cut whose tail held
  // only the shells the rejoin folds away).
  result.changed = tr.docChanged && !tr.doc.eq(before) && !sameIgnoringBlockIds(tr.doc, before);
  if (result.changed && fresh && tr.steps.length > 0 && tr.docs[0] === before) {
    // The trace's per-boundary record stays the plan's; the steps are fewer.
    const fewer = fewestSeamSteps(before, tr.doc, fresh) ?? withoutCancellingPairs(tr, fresh);
    if (fewer && fewer.steps.length < tr.steps.length) {
      // The caret a table move put back by hand (restoreTableTextSelection) was
      // on the transaction being replaced. Mapped through the fewer steps it
      // lands past the replaced range: typing in a table cell, the line that
      // moved a row sent the caret to another cell (real Safari, R280-D22: 33
      // to 1846), and the next keys went there.
      if (tr.selectionSet) fewer.setSelection(Selection.fromJSON(fewer.doc, tr.selection.toJSON()));
      result.tr = fewer;
    }
  }
  if (result.changed) {
    result.tr.setMeta(REBALANCE_META, true);
    result.tr.setMeta("addToHistory", false);
  }
  return result;
}

/** Merge adjacent fragments of the same atom that sit on page `boundary`
 * (sequence entries `placed..endIndex`), from the end of the page backwards.
 * Returns the number of seams merged; the sequence loses those entries. */
function mergeSamePageFragments(
  tr: Transaction,
  boundary: number,
  sequence: SequenceEntry[],
  placed: number,
  endIndex: number,
  logical: LogicalBlock[],
): number {
  let merged = 0;
  for (let i = endIndex - 1; i >= placed; i -= 1) {
    if (sequence[i].atom !== sequence[i + 1].atom) continue;
    // An unequal-column seam is the projector's: both fragments belong on
    // this sheet, in different tracks.
    if (isColumnSeam(logical[sequence[i].atom], sequence[i + 1].startPart - 1)) continue;
    const page = collectPages(tr.doc)?.[boundary];
    if (!page || page.node.childCount !== endIndex - merged - placed + 1) break;
    const childIndex = i - placed;
    let headPos = page.pos + 1;
    for (let c = 0; c < childIndex; c += 1) headPos += page.node.child(c).nodeSize;
    const tailPos = headPos + page.node.child(childIndex).nodeSize;
    if (!mergeSeam(tr, logical[sequence[i].atom], headPos, tailPos)) continue;
    sequence.splice(i + 1, 1);
    merged += 1;
  }
  return merged;
}

/** The block opening sheet `boundary + 1` is cut at `cut`; its head is pulled
 * back onto sheet `boundary`. Positions are resolved on `tr.doc`. */
function applyPlannedCut(tr: Transaction, boundary: number, cut: LedgerCut, block: LogicalBlock): boolean {
  const pages = collectPages(tr.doc);
  const source = pages?.[boundary + 1];
  if (!pages || !source || source.node.childCount === 0) return false;
  const opener = source.node.child(0);
  const openerPos = source.pos + 1;
  switch (cut.kind) {
    case "text": {
      const payload = cut.payload as TextCutPayload;
      const startOffset = logicalOffsetOfOpener(tr, openerPos, opener, block);
      const local = payload.logicalOffset - startOffset;
      if (!(local > 0) || local >= opener.content.size) return false;
      // The plan only cuts a keep-lines paragraph that no page can hold.
      return applyTextBlockSplit(tr, boundary, openerPos + 1 + local, {
        forceOversizedKeepLinesSplit: true,
      });
    }
    case "code": {
      const payload = cut.payload as CodeCutPayload;
      const startLine = codeLinesBeforeOpener(tr, openerPos, opener, block);
      const headLines = payload.line - startLine;
      if (headLines <= 0) return false;
      return applyCodeBlockSplit(tr, boundary, headLines);
    }
    case "container": {
      const plan = rebasedContainerPlan(cut.payload as ContainerCutPayload, opener);
      return plan !== null && applyContainerBoundarySplit(tr, boundary, plan);
    }
    case "table": {
      const payload = cut.payload as TableCutPayload;
      if (!payload.planned) return false;
      return applyTableBoundarySplit(tr, boundary, payload.planned.plan, payload.planned.cuts);
    }
    case "notes": {
      const payload = cut.payload as NotesCutPayload;
      return applyNoteListCursorSplit(tr, boundary, payload.cursor);
    }
    case "rows":
      return applyRowSliceBoundarySplit(tr, boundary, (cut.payload as RowsCutPayload).row);
    default:
      return false;
  }
}

/** The block opening sheet `sheetIndex` is cut at `cut` in place: the head
 * stays, the tail and its followers move to the next sheet. */
function applyPlannedOverflowCut(tr: Transaction, sheetIndex: number, cut: LedgerCut, block: LogicalBlock): boolean {
  const pages = collectPages(tr.doc);
  const sheet = pages?.[sheetIndex];
  if (!pages || !sheet || sheet.node.childCount === 0) return false;
  const opener = sheet.node.child(0);
  const openerPos = sheet.pos + 1;
  switch (cut.kind) {
    case "text": {
      const payload = cut.payload as TextCutPayload;
      const local = payload.logicalOffset - logicalOffsetOfOpener(tr, openerPos, opener, block);
      if (!(local > 0) || local >= opener.content.size) return false;
      return applyTextBlockOverflowSplit(tr, sheetIndex, openerPos + 1 + local, { forceOversizedKeepLinesSplit: true });
    }
    case "code": {
      const payload = cut.payload as CodeCutPayload;
      const headLines = payload.line - codeLinesBeforeOpener(tr, openerPos, opener, block);
      return headLines > 0 && applyOverflowSplit(tr, sheetIndex, headLines);
    }
    case "container": {
      const plan = rebasedContainerPlan(cut.payload as ContainerCutPayload, opener);
      return plan !== null && applyContainerOverflowSplit(tr, sheetIndex, plan);
    }
    case "table": {
      const payload = cut.payload as TableCutPayload;
      return Boolean(payload.planned) && applyTableOverflowSplit(tr, sheetIndex, payload.planned!.plan, payload.planned!.cuts);
    }
    case "notes":
      return applyNoteListOverflowCursorSplit(tr, sheetIndex, (cut.payload as NotesCutPayload).cursor);
    case "rows":
      return applyRowSliceOverflowSplit(tr, sheetIndex, (cut.payload as RowsCutPayload).row);
    default:
      return false;
  }
}

/** PM content offset, inside the logical block, at which the opener starts —
 * the sum of the content sizes of the continuation fragments before it. */
function logicalOffsetOfOpener(tr: Transaction, openerPos: number, opener: PmNode, block: LogicalBlock): number {
  if (!isContinuationTail(opener)) return 0;
  let offset = 0;
  let pos = openerPos;
  for (let guard = 0; guard < block.parts.length + 8; guard += 1) {
    const previous = previousBlock(tr.doc, pos);
    if (!previous || previous.node.type.name !== opener.type.name) break;
    offset += previous.node.content.size;
    if (!isContinuationTail(previous.node)) break;
    pos = previous.pos;
  }
  return offset;
}

function codeLinesBeforeOpener(tr: Transaction, openerPos: number, opener: PmNode, block: LogicalBlock): number {
  if (!isContinuationTail(opener)) return 0;
  let lines = 0;
  let pos = openerPos;
  for (let guard = 0; guard < block.parts.length + 8; guard += 1) {
    const previous = previousBlock(tr.doc, pos);
    if (!previous || previous.node.type.name !== opener.type.name) break;
    lines += previous.node.textContent.split("\n").length;
    if (!isContinuationTail(previous.node)) break;
    pos = previous.pos;
  }
  return lines;
}

/** The top-level block immediately before `pos` in reading order across
 * sheets, or null at the document start. */
function previousBlock(doc: PmNode, pos: number): { pos: number; node: PmNode } | null {
  const pages = collectPages(doc);
  if (!pages) return null;
  let previous: { pos: number; node: PmNode } | null = null;
  for (const page of pages) {
    let offset = page.pos + 1;
    for (let i = 0; i < page.node.childCount; i += 1) {
      const child = page.node.child(i);
      if (offset >= pos) return previous;
      previous = { pos: offset, node: child };
      offset += child.nodeSize;
    }
  }
  return previous;
}
