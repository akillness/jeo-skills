/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Transaction } from "@tiptap/pm/state";
import type { MapResult, Mapping } from "@tiptap/pm/transform";
import { DecorationSet, type Decoration } from "@tiptap/pm/view";

export type PositionRange = [number, number];

interface TransactionSpan {
  /** Original positions below this one are unchanged. */
  floor: number;
  /** Original positions above this one move by `delta`. */
  ceiling: number;
  delta: number;
}

const spans = new WeakMap<Transaction, TransactionSpan>();

/** Where a transaction's steps change the document, in original positions. */
export function transactionSpan(tr: Transaction): TransactionSpan {
  const known = spans.get(tr);
  if (known) return known;
  const maps = tr.mapping.maps;
  let floor = Number.POSITIVE_INFINITY;
  let ceilingAfter = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < maps.length; index += 1) {
    const after = maps.length > index + 1 ? tr.mapping.slice(index + 1) : null;
    maps[index]!.forEach((oldStart, _oldEnd, _newStart, newEnd) => {
      // Each step's own positions: a position below every step's first
      // change is below it in every step's document too.
      if (oldStart < floor) floor = oldStart;
      const end = after ? after.map(newEnd, 1) : newEnd;
      if (end > ceilingAfter) ceilingAfter = end;
    });
  }
  const delta = tr.doc.content.size - tr.before.content.size;
  const span: TransactionSpan = Number.isFinite(floor)
    ? { floor, ceiling: tr.mapping.invert().map(ceilingAfter, 1), delta }
    // Nothing moves (attributes or marks only).
    : { floor: Number.POSITIVE_INFINITY, ceiling: Number.POSITIVE_INFINITY, delta: 0 };
  spans.set(tr, span);
  return span;
}

/** A position mapped through `tr` as `tr.mapping.map(pos, assoc)` maps it. */
export function mapPositionFast(tr: Transaction, pos: number, assoc: -1 | 1): number {
  const { floor, ceiling, delta } = transactionSpan(tr);
  if (pos < floor) return pos;
  if (pos > ceiling) return pos + delta;
  return tr.mapping.map(pos, assoc);
}

/** Past this many ranges a list is kept merged. */
const MERGE_ABOVE = 256;

/** Overlapping or touching ranges as one: the same positions. */
export function mergeRanges(ranges: readonly PositionRange[]): PositionRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: PositionRange[] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) {
      if (to > last[1]) last[1] = to;
    } else merged.push([from, to]);
  }
  return merged;
}

/**
 * `ranges` mapped through `tr` (each start with assoc -1, each end with +1),
 * then `added`. With nothing of `ranges` at or past the transaction's first
 * change, the same entries come back without a mapping.
 */
export function mapRangesFast(
  ranges: readonly PositionRange[],
  tr: Transaction,
  added: readonly PositionRange[] = [],
  /** False for a list read by each range's start (a retry list): never merged. */
  merge = true,
): PositionRange[] {
  const { floor } = transactionSpan(tr);
  let mapped: PositionRange[];
  let allBelow = true;
  for (const range of ranges) if (range[1] >= floor) { allBelow = false; break; }
  if (allBelow) mapped = ranges.length || added.length ? [...ranges, ...added] : [];
  else {
    mapped = ranges.map(([from, to]): PositionRange => [mapPositionFast(tr, from, -1), mapPositionFast(tr, to, 1)]);
    if (added.length) mapped.push(...added);
  }
  return merge && mapped.length > MERGE_ABOVE ? mergeRanges(mapped) : mapped;
}

/** `window.__docsFastRangeMap = false` maps every range step by step (old, A/B). */
export function fastRangeMappingOn(): boolean {
  return (globalThis as { __docsFastRangeMap?: boolean }).__docsFastRangeMap !== false;
}

/**
 * A decoration set mapped through `tr`; the same set when the transaction
 * changes nothing in or after the top-level node where its first change is
 * and no decoration stands there (a part appended past every decoration).
 */
export function mapDecorationsFast(set: DecorationSet, tr: Transaction): DecorationSet {
  if (set === DecorationSet.empty) return set;
  const { floor } = transactionSpan(tr);
  const size = tr.before.content.size;
  if (floor > size) return Number.isFinite(floor) ? set.map(decorationMapping(tr), tr.doc) : set;
  const $floor = tr.before.resolve(floor);
  const nodeStart = $floor.depth > 0 ? $floor.before(1) : floor;
  if (set.find(nodeStart, size).length === 0) return set;
  return set.map(decorationMapping(tr), tr.doc);
}

/**
 * A stretch of the old document's positions (`lo`..`hi`, both in) that no step
 * of a transaction touches: each of them maps to itself plus `off`. A `dirty`
 * stretch holds positions some step's changed range reached (its ends
 * included), mapped step by step as ProseMirror maps them.
 */
interface MappedStretch { lo: number; hi: number; off: number; dirty: boolean }

/** Below this many steps the transaction's own mapping is as cheap. */
const FAST_DECORATION_STEPS = 4;
/** A transaction cut into more stretches than this keeps its own mapping. */
const MAX_STRETCHES = 50_000;

const decorationMappings = new WeakMap<Transaction, Mapping>();

function pushStretch(list: MappedStretch[], stretch: MappedStretch): void {
  if (stretch.lo > stretch.hi) return;
  const last = list[list.length - 1];
  if (last && last.hi + 1 === stretch.lo && last.dirty === stretch.dirty && (stretch.dirty || last.off === stretch.off)) {
    last.hi = stretch.hi;
    return;
  }
  list.push({ ...stretch });
}

/** The old document's positions cut where the steps of `tr` change it; null past MAX_STRETCHES. */
export function mappedStretches(tr: Transaction): MappedStretch[] | null {
  let stretches: MappedStretch[] = [{ lo: 0, hi: tr.before.content.size, off: 0, dirty: false }];
  for (const map of tr.mapping.maps) {
    const ranges: Array<[number, number, number]> = [];
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      ranges.push([oldStart, oldEnd, newEnd - newStart - (oldEnd - oldStart)]);
    });
    if (!ranges.length) continue;
    const next: MappedStretch[] = [];
    for (const stretch of stretches) {
      if (stretch.dirty) {
        pushStretch(next, stretch);
        continue;
      }
      // This step's positions are the old ones plus `off`.
      const { off } = stretch;
      let lo = stretch.lo, shift = 0;
      const hi = stretch.hi;
      for (const [start, end, size] of ranges) {
        if (lo > hi || hi + off < start) break;
        if (lo + off > end) {
          shift += size;
          continue;
        }
        if (lo + off < start) {
          pushStretch(next, { lo, hi: start - off - 1, off: off + shift, dirty: false });
          lo = start - off;
        }
        const reached = Math.min(hi, end - off);
        pushStretch(next, { lo, hi: reached, off: 0, dirty: true });
        lo = reached + 1;
        shift += size;
      }
      pushStretch(next, { lo, hi, off: off + shift, dirty: false });
    }
    if (next.length > MAX_STRETCHES) return null;
    stretches = next;
  }
  return stretches;
}

/** `window.__docsFastDecorationMapOff = true`: decorations are mapped through every step (old, A/B). */
function fastDecorationMappingOff(): boolean {
  return (globalThis as { __docsFastDecorationMapOff?: boolean }).__docsFastDecorationMapOff === true;
}















export function decorationMapping(tr: Transaction): Mapping {
  const mapping = tr.mapping;
  if (mapping.maps.length < FAST_DECORATION_STEPS || fastDecorationMappingOff()) return mapping;
  const known = decorationMappings.get(tr);
  if (known) return known;
  const stretches = mappedStretches(tr);
  if (!stretches) {
    decorationMappings.set(tr, mapping);
    return mapping;
  }
  let cursor = 0;
  const clean = (pos: number): MappedStretch | null => {
    let at = cursor;
    if (!(stretches[at] && stretches[at]!.lo <= pos && pos <= stretches[at]!.hi)) {
      let low = 0, high = stretches.length - 1;
      at = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const stretch = stretches[middle]!;
        if (pos < stretch.lo) high = middle - 1;
        else if (pos > stretch.hi) low = middle + 1;
        else {
          at = middle;
          break;
        }
      }
      if (at < 0) return null;
      cursor = at;
    }
    const stretch = stretches[at]!;
    return stretch.dirty ? null : stretch;
  };
  const fast = {
    maps: mapping.maps,
    from: 0,
    to: mapping.maps.length,
    mirror: undefined,
    map(pos: number, assoc = 1): number {
      const stretch = clean(pos);
      return stretch ? pos + stretch.off : mapping.map(pos, assoc);
    },
    mapResult(pos: number, assoc = 1): MapResult {
      const stretch = clean(pos);
      if (!stretch) return mapping.mapResult(pos, assoc);
      // What DecorationSet reads of a result: where, and that nothing was deleted.
      return { pos: pos + stretch.off, deleted: false, deletedBefore: false, deletedAfter: false, deletedAcross: false } as unknown as MapResult;
    },
  } as unknown as Mapping;
  decorationMappings.set(tr, fast);
  return fast;
}

/** What a DecorationSet holds; the package types neither it nor the constructor. */
interface HeldDecorationSet { local: readonly Decoration[]; children: readonly unknown[] }
const ConstructibleDecorationSet = DecorationSet as unknown as new (local: Decoration[], children: unknown[]) => DecorationSet;

function withoutDecorationsWithin(set: DecorationSet, start: number, end: number, inside = false): DecorationSet {
  const held = set as unknown as HeldDecorationSet;
  let local = held.local as Decoration[];
  let children = held.children as unknown[];
  for (let index = 0; index < local.length; index += 1) {
    const item = local[index]!;
    if (inside ? item.from >= start && item.to <= end : item.from <= end && item.to >= start) {
      if (local === held.local) local = local.slice();
      local.splice(index, 1);
      index -= 1;
    }
  }
  for (let index = 0; index < children.length; index += 3) {
    const childStart = children[index] as number, childEnd = children[index + 1] as number;
    if (!(childStart < end && childEnd > start)) continue;
    const child = children[index + 2] as DecorationSet;
    const offset = childStart + 1;
    const kept = withoutDecorationsWithin(child, start - offset, end - offset, inside);
    if (kept === child) continue;
    if (children === held.children) children = children.slice();
    if (kept === DecorationSet.empty) {
      children.splice(index, 3);
      index -= 3;
    } else children[index + 2] = kept;
  }
  if (local === held.local && children === held.children) return set;
  return local.length || children.length ? new ConstructibleDecorationSet(local, children) : DecorationSet.empty;
}

/**
 * `set` without the decorations that lie within [from, to] -- not those that
 * only touch it, which `find` returns too: the node decoration of the block
 * before or after a measured one (documentEngineLineBreaks' withoutMeasuredSpans).
 */
export function removeDecorationsInside(set: DecorationSet, from: number, to: number): DecorationSet {
  if (set === DecorationSet.empty) return set;
  if (decorationRemoveWalkOff()) return set.remove(set.find(from, to).filter((decoration) => decoration.from >= from && decoration.to <= to));
  return withoutDecorationsWithin(set, from, to, true);
}

/** `window.__docsDecorationRemoveWalkOff = true`: `set.remove(set.find(from, to))` (old, A/B). */
function decorationRemoveWalkOff(): boolean {
  return (globalThis as { __docsDecorationRemoveWalkOff?: boolean }).__docsDecorationRemoveWalkOff === true;
}










export function removeDecorationsWithin(set: DecorationSet, from: number, to: number): DecorationSet {
  if (set === DecorationSet.empty) return set;
  if (decorationRemoveWalkOff()) return set.remove(set.find(from, to));
  return withoutDecorationsWithin(set, from, to);
}

/** `window.__docsDecorationRemoveListOff = true`: `set.remove(removed)` (old, A/B). */
function decorationRemoveListOff(): boolean {
  return (globalThis as { __docsDecorationRemoveListOff?: boolean }).__docsDecorationRemoveListOff === true;
}

/** The decoration's type, which `Decoration.eq` compares; not in the declared type. */
type TypedDecoration = Decoration & { type: { eq(other: unknown): boolean } };

/** Index (a multiple of 3) of the child of `children` whose range holds
 * `span` strictly inside, at `offset`; -1 when none does. Children are the
 * ranges of distinct nodes: sorted, never overlapping. */
function childHolding(children: readonly unknown[], span: Decoration, offset: number): number {
  let low = 0, high = children.length / 3 - 1, found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((children[middle * 3] as number) + offset < span.from) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (found < 0) return -1;
  return span.to < (children[found * 3 + 1] as number) + offset ? found * 3 : -1;
}

function withoutDecorationList(set: DecorationSet, spans: readonly Decoration[], offset: number): DecorationSet {
  const held = set as unknown as HeldDecorationSet;
  let local = held.local as Decoration[];
  let children = held.children as unknown[];
  let loose: Decoration[] = spans as Decoration[];
  if (children.length) {
    loose = [];
    const byChild = new Map<number, Decoration[]>();
    for (const span of spans) {
      const index = childHolding(children, span, offset);
      if (index < 0) {
        loose.push(span);
        continue;
      }
      const found = byChild.get(index);
      if (found) found.push(span);
      else byChild.set(index, [span]);
    }
    // From the last child back, so a child taken out leaves the indices before it.
    for (const index of [...byChild.keys()].sort((a, b) => b - a)) {
      const child = children[index + 2] as DecorationSet;
      const kept = withoutDecorationList(child, byChild.get(index)!, (children[index] as number) + offset + 1);
      if (kept === child) continue;
      if (children === held.children) children = children.slice();
      if (kept === DecorationSet.empty) children.splice(index, 3);
      else children[index + 2] = kept;
    }
  }
  if (local.length && loose.length) {
    const byRange = new Map<string, Decoration[]>();
    for (const span of loose) {
      const key = `${span.from}:${span.to}`;
      const same = byRange.get(key);
      if (same) same.push(span);
      else byRange.set(key, [span]);
    }
    for (let index = 0; index < local.length; index += 1) {
      const item = local[index]! as TypedDecoration;
      const same = byRange.get(`${item.from + offset}:${item.to + offset}`);
      if (!same?.some((span) => item.type.eq((span as TypedDecoration).type))) continue;
      if (local === held.local) local = local.slice();
      local.splice(index, 1);
      index -= 1;
    }
  }
  if (local === held.local && children === held.children) return set;
  return local.length || children.length ? new ConstructibleDecorationSet(local, children) : DecorationSet.empty;
}










export function removeDecorationList(set: DecorationSet, removed: readonly Decoration[]): DecorationSet {
  if (!removed.length || set === DecorationSet.empty) return set;
  if (decorationRemoveListOff()) return set.remove(removed.slice());
  return withoutDecorationList(set, removed, 0);
}
