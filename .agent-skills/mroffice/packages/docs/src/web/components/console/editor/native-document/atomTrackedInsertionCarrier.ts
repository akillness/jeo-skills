/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A tracked insertion on an inline atom (a line break, a note reference, an
 * equation) that survives the collaboration room.
 *
 * The room's binding (y-tiptap) keeps an element's attributes, never the
 * marks on an inline atom, so the insertion mark on a note reference or a
 * line break typed with Track Changes on was gone once the page came back
 * from the room: the review pane lost the revision and Reject All left the
 * object (live Word audit WUA 045, WUA 228). The mark is carried as the
 * atom's own attribute, as the break's run formatting already is
 * (documentHardBreakRunFormat `docxRunMarks`):
 *
 * - while a mark is on the atom, the attribute states its attributes;
 * - an atom with the attribute and no mark takes the mark back (the page
 *   read from the room), unless this very change took the mark off (an
 *   accepted insertion), in which case the attribute goes too.
 *
 * The API's revision projection reads the same attribute
 * (document_export_revision_policy), so the export, Accept and Reject see
 * the revision whichever way the page was stored.
 */
import { Extension } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  Mapping,
  RemoveMarkStep,
  RemoveNodeMarkStep,
} from "@tiptap/pm/transform";

import { imeSafeAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { INSERTION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";

export const TRACKED_INSERTION_CARRIER_ATTR = "trackedInsertion";

/** The atoms an insertion mark can be on (trackChanges.ts
 * TRACKED_INSERTION_INLINE_ATOM_NAMES, the API's
 * DOCUMENT_TRACK_INSERTION_INLINE_ATOM_TYPES). */
export const TRACKED_INSERTION_CARRIER_TYPES: ReadonlySet<string> = new Set([
  "inlineMath",
  "footnoteRef",
  "hardBreak",
  "documentField",
]);

const CARRIED_KEYS = ["author", "timestamp", "revisionId", "moveId", "moveRole", "moveRangeId"] as const;

/** The mark's attributes the carrier states (bounded, nulls left out). */
export function trackedInsertionCarrier(value: unknown): Record<string, string | number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const key of CARRIED_KEYS) {
    const item = source[key];
    if (typeof item === "string" && item.length <= 256) out[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sameCarrier(a: unknown, b: unknown): boolean {
  return JSON.stringify(trackedInsertionCarrier(a)) === JSON.stringify(trackedInsertionCarrier(b));
}

interface Touched {
  ranges: [number, number][];
  /** Ranges (final positions) a removed insertion mark covered. */
  cleared: [number, number][];
}

function touchedRanges(transactions: readonly Transaction[], size: number): Touched {
  const touched: Touched = { ranges: [], cleared: [] };
  const allMaps = transactions.flatMap((tr) => tr.mapping.maps);
  let offset = 0;
  for (const tr of transactions) {
    tr.steps.forEach((step, index) => {
      const later = new Mapping(allMaps.slice(offset + index + 1));
      const clamp = (pos: number) => Math.max(0, Math.min(size, pos));
      step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        touched.ranges.push([clamp(later.map(newStart, -1)), clamp(later.map(newEnd, 1))]);
      });
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
        const range: [number, number] = [clamp(later.map(step.from, 1)), clamp(later.map(step.to, -1))];
        touched.ranges.push(range);
        if (step instanceof RemoveMarkStep && step.mark.type.name === INSERTION_MARK_NAME) touched.cleared.push(range);
      } else if (step instanceof AddNodeMarkStep || step instanceof RemoveNodeMarkStep || step instanceof AttrStep) {
        const pos = clamp(later.map(step.pos, 1));
        touched.ranges.push([pos, Math.min(size, pos + 1)]);
        if (step instanceof RemoveNodeMarkStep && step.mark.type.name === INSERTION_MARK_NAME) {
          touched.cleared.push([pos, Math.min(size, pos + 1)]);
        }
      }
    });
    offset += tr.steps.length;
  }
  return touched;
}

export const AtomTrackedInsertionCarrier = Extension.create({
  name: "atomTrackedInsertionCarrier",

  addGlobalAttributes() {
    return [
      {
        types: [...TRACKED_INSERTION_CARRIER_TYPES],
        attributes: {
          [TRACKED_INSERTION_CARRIER_ATTR]: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-tracked-insertion");
              if (!raw || raw.length > 2048) return null;
              try {
                return trackedInsertionCarrier(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const carrier = trackedInsertionCarrier(attrs[TRACKED_INSERTION_CARRIER_ATTR]);
              return carrier ? { "data-tracked-insertion": JSON.stringify(carrier) } : {};
            },
          },
        },
      },
    ];
  },

  // A page opened with the attribute only (stored from the room) shows its
  // revisions at once; later loads replace the whole document and pass
  // through the plugin below.
  onCreate() {
    const { state, view } = this.editor;
    const markType = state.schema.marks[INSERTION_MARK_NAME];
    if (!markType) return;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (!TRACKED_INSERTION_CARRIER_TYPES.has(node.type.name)) return true;
      const carrier = trackedInsertionCarrier(node.attrs[TRACKED_INSERTION_CARRIER_ATTR]);
      if (carrier && !markType.isInSet(node.marks)) tr.addNodeMark(pos, markType.create(carrier));
      return false;
    });
    if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false));
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: imeSafeAppendTransaction((transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const markType = state.schema.marks[INSERTION_MARK_NAME];
          if (!markType) return null;
          const size = state.doc.content.size;
          const { ranges, cleared } = touchedRanges(transactions, size);
          if (ranges.length === 0) return null;
          const tr = state.tr;
          const seen = new Set<number>();
          const visit = (node: ProseMirrorNode, pos: number) => {
            if (!TRACKED_INSERTION_CARRIER_TYPES.has(node.type.name) || seen.has(pos)) return;
            seen.add(pos);
            const mark: Mark | undefined = markType.isInSet(node.marks);
            const carried = node.attrs[TRACKED_INSERTION_CARRIER_ATTR];
            if (mark) {
              const wanted = trackedInsertionCarrier(mark.attrs);
              if (!sameCarrier(wanted, carried)) tr.setNodeAttribute(pos, TRACKED_INSERTION_CARRIER_ATTR, wanted);
              return;
            }
            const carrier = trackedInsertionCarrier(carried);
            if (!carrier) {
              if (carried != null) tr.setNodeAttribute(pos, TRACKED_INSERTION_CARRIER_ATTR, null);
              return;
            }
            if (cleared.some(([from, to]) => pos >= from && pos < to)) {
              tr.setNodeAttribute(pos, TRACKED_INSERTION_CARRIER_ATTR, null);
            } else {
              tr.addNodeMark(pos, markType.create(carrier));
            }
          };
          for (const [from, to] of ranges) {
            const start = Math.max(0, Math.min(from, to));
            const end = Math.min(size, Math.max(from, to));
            if (end > start) state.doc.nodesBetween(start, end, (node, pos) => (visit(node, pos), true));
            else {
              const node = state.doc.nodeAt(start);
              if (node) visit(node, start);
            }
          }
          return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
        }),
      }),
    ];
  },
});
