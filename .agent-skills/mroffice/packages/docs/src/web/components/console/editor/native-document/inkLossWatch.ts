/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { PAGED_CANONICAL_REMOTE_META } from "@mrnote/core/web/lib/collab/paged-document-bridge.ts";
import {
  inkFingerprint,
  publishInkErasures,
  unexplainedInkRemovals,
} from "@mrnote/core/web/lib/collab/ink-erasure-journal.ts";

import { isDoNotTrackEnabled, sendErrorBeacon } from "@mrnote/core/web/lib/errors/report-beacon.ts";

/** Strokes the room took out of this view (another window, device or person). */
export const INK_TAKEN_BY_ROOM_EVENT = "mrnote:ink-taken-by-room";

/** This many strokes taken out by one change is reported. */
const MASS_LOSS = 3;
/** A stroke taken out this soon after a stroke landed is reported. */
const LANDED_GRACE_MS = 3000;
const MAX_REPORTS = 4;

function isInk(node: ProseMirrorNode): boolean {
  return Boolean((node.attrs as { inkTool?: unknown }).inkTool);
}

function inkIn(node: ProseMirrorNode | Slice["content"]): number {
  let count = 0;
  node.descendants((child) => {
    if (isInk(child)) {
      count += 1;
      return false;
    }
    return true;
  });
  return count;
}

function fingerprintOf(node: ProseMirrorNode): string {
  return inkFingerprint(node.type.name, node.attrs);
}

/** The strokes the transaction's steps took out and put in, by fingerprint. */
function inkChange(tr: Transaction): { removed: string[]; added: string[] } {
  const removed: string[] = [];
  const added: string[] = [];
  tr.steps.forEach((step, index) => {
    if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return;
    const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
    const doc = tr.docs[index];
    if (doc && to > from) {
      doc.nodesBetween(from, to, (node, pos) => {
        if (!isInk(node)) return true;
        // Wholly inside the replaced range: taken out (a stroke a step only
        // re-marks is put back by its slice).
        if (pos >= from && pos + node.nodeSize <= to) removed.push(fingerprintOf(node));
        return false;
      });
    }
    slice.content.descendants((child) => {
      if (isInk(child)) {
        added.push(fingerprintOf(child));
        return false;
      }
      return true;
    });
  });
  return { removed, added };
}

/** The positions of the strokes `tr` put in, in its resulting document. */
function landedInk(tr: Transaction): number[] {
  const landed: number[] = [];
  tr.steps.forEach((step, index) => {
    if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return;
    const after = tr.mapping.slice(index + 1);
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = after.map(newStart, -1);
      const to = after.map(newEnd, 1);
      if (to <= from) return;
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!isInk(node)) return true;
        if (pos >= from && pos + node.nodeSize <= to && !landed.includes(pos)) landed.push(pos);
        return false;
      });
    });
  });
  return landed;
}

/** An Undo or Redo: the room's history (the paged bridge) or the editor's. */
function isHistoryStep(tr: Transaction): boolean {
  const sync = tr.getMeta(ySyncPluginKey) as { isUndoRedoOperation?: boolean } | undefined;
  return sync?.isUndoRedoOperation === true || tr.getMeta("history$") !== undefined;
}

/** Who took a stroke out: a room update, the reader (an authored, undoable
 * change), or neither (a plugin or a maintenance pass, no Undo step). */
function sourceOf(tr: Transaction): "room" | "reader" | "maintenance" {
  if (tr.getMeta(PAGED_CANONICAL_REMOTE_META)) return "room";
  return tr.getMeta("addToHistory") === false ? "maintenance" : "reader";
}

function askedForByReader(tr: Transaction): boolean {
  return Boolean(tr.getMeta("documentInkTakenOutByReader") || tr.getMeta("documentInkReading"));
}

function metaKeys(tr: Transaction): string[] {
  const meta = (tr as unknown as { meta?: Record<string, unknown> }).meta ?? {};
  return Object.keys(meta).map((key) => key.replace(/\$\d*$/, "$"));
}

/** Taking `taken` out of `from`, one for one. */
function without(from: readonly string[], taken: readonly string[]): string[] {
  const left = [...from];
  for (const item of taken) {
    const index = left.indexOf(item);
    if (index >= 0) left.splice(index, 1);
  }
  return left;
}

/** How long a room deletion no journal explains yet waits for the presence that may. */
export const INK_LOSS_SETTLE_MS = 300;

export const InkLossWatch = Extension.create<{ getPageId: () => string | null | undefined }>({
  name: "inkLossWatch",

  addOptions() {
    return { getPageId: () => null };
  },

  addProseMirrorPlugins() {
    const getPageId = this.options.getPageId;
    // The strokes this view landed in the last moments, where they are now.
    let landings: { pos: number; at: number; f: string }[] = [];
    let reports = 0;
    // The journal entries (lib/collab/ink-erasure-journal) this view used.
    const used = new Set<string>();
    return [
      new Plugin({
        key: new PluginKey("inkLossWatch"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const pageId = getPageId() ?? null;
          const now = typeof performance === "undefined" ? 0 : performance.now();
          landings = landings.filter((landing) => now - landing.at < LANDED_GRACE_MS);
          let removed = 0;
          let added = 0;
          let history = false;
          // What the room took out and put in, by fingerprint: explained or
          // not by a deletion another view of the page wrote down.
          let roomRemoved: string[] = [];
          let roomAdded: string[] = [];
          // A stroke this view had just landed, taken out by the room (its
          // fingerprint) or by a pass of no one's.
          const lostByRoom: string[] = [];
          let lostByMaintenance = false;
          const ownTakenOut: string[] = [];
          for (const tr of transactions) {
            const change = inkChange(tr);
            removed += change.removed.length;
            added += change.added.length;
            const undo = isHistoryStep(tr);
            history ||= undo;
            const source = sourceOf(tr);
            if (source === "room" && !undo) {
              roomRemoved = [...roomRemoved, ...change.removed];
              roomAdded = [...roomAdded, ...change.added];
            } else if (source === "reader" || undo || askedForByReader(tr)) {
              // Taken out on purpose here: the other views of the page are
              // told, so the same deletion reaching them is not a loss.
              ownTakenOut.push(...without(change.removed, change.added));
            }
            landings = landings.flatMap((landing) => {
              const mapped = tr.mapping.mapResult(landing.pos, 1);
              if (!mapped.deletedAfter || isInk(tr.doc.nodeAt(mapped.pos) ?? tr.doc)) return [{ ...landing, pos: mapped.pos }];
              if (!undo && source === "room") lostByRoom.push(landing.f);
              else if (!undo && source === "maintenance") lostByMaintenance = true;
              return [];
            });
            // The reader's own strokes: a landing is authored, never a room
            // update or an Undo (Redo puts back what they had taken out).
            if (change.added.length > 0 && !undo && source !== "room") {
              for (const pos of landedInk(tr)) {
                const node = tr.doc.nodeAt(pos);
                if (node) landings.push({ pos, at: now, f: fingerprintOf(node) });
              }
            }
          }
          if (pageId && ownTakenOut.length > 0) publishInkErasures(pageId, ownTakenOut);
          if (reports >= MAX_REPORTS) return null;
          const net = removed - added;
          if (net <= 0 || history) {
            // Still use up what explained a room deletion that did not count.
            if (roomRemoved.length > 0) unexplainedInkRemovals(pageId, roomRemoved, used);
            return null;
          }
          // Asked for by the reader: a delete, the eraser, Ink to Text.
          if (transactions.some(askedForByReader)) return null;
          // The document as it stands is the one the landings now index.
          landings = landings.filter((landing) => isInk(newState.doc.nodeAt(landing.pos) ?? newState.doc));
          const strokesLeft = inkIn(newState.doc);
          const described = transactions.map((tr) => ({
            meta: metaKeys(tr),
            steps: tr.steps.map((step) => step.constructor.name).slice(0, 8),
            history: (tr.getMeta("addToHistory") as boolean | undefined) !== false,
          }));
          // What the room did, judged against the journal: `consume` uses the
          // entries up, a first look does not.
          const judge = (consume: boolean) => {
            const ledger = consume ? used : new Set(used);
            const unexplained = unexplainedInkRemovals(pageId, roomRemoved, ledger);
            const roomLoss = Math.max(0, unexplained.length - roomAdded.length);
            const otherLoss = Math.max(0, net - (roomRemoved.length - roomAdded.length));
            const lostLanding = lostByMaintenance
              ? "maintenance"
              : lostByRoom.some((f) => unexplained.includes(f))
                ? "room"
                : null;
            const lost = roomLoss + otherLoss;
            return {
              unexplained: unexplained.length,
              explained: roomRemoved.length - unexplained.length,
              roomLoss,
              lost,
              lostLanding,
              reportable: lost >= MASS_LOSS || lostLanding !== null,
            };
          };
          const report = (verdict: ReturnType<typeof judge>) => {
            if (!verdict.reportable || reports >= MAX_REPORTS) return;
            reports += 1;
            if (typeof window === "undefined" || isDoNotTrackEnabled()) return;
            sendErrorBeacon({
              name: "InkLoss",
              message: `ink taken out: page ${pageId ?? "?"}: ${removed} removed, ${added} added, ${strokesLeft} left, room explained ${verdict.explained} unexplained ${verdict.unexplained}${verdict.lostLanding ? `, a stroke this view had just landed (by ${verdict.lostLanding})` : ""}; ${JSON.stringify(described)}`.slice(0, 500),
              stack: `${navigator.userAgent.slice(0, 160)}\n${new Error("ink loss").stack ?? ""}`.slice(0, 3800),
              path: window.location?.pathname || "/",
              source: "window",
              window_type: "note",
            });
            // Taken out by the room, and by no deletion anyone made: said, and
            // the stored page keeps a copy (page_version_autosave).
            if (verdict.roomLoss > 0 || verdict.lostLanding === "room") {
              window.dispatchEvent(
                new CustomEvent(INK_TAKEN_BY_ROOM_EVENT, { detail: { strokes: Math.max(1, verdict.roomLoss) } }),
              );
            }
          };
          if (roomRemoved.length === 0) {
            report(judge(true));
            return null;
          }
          // A room deletion the journal does not explain yet may be explained
          // by presence that arrives just after the document update.
          if (!judge(false).reportable) {
            judge(true);
            return null;
          }
          if (typeof window === "undefined") {
            report(judge(true));
            return null;
          }
          window.setTimeout(() => report(judge(true)), INK_LOSS_SETTLE_MS);
          return null;
        },
      }),
    ];
  },
});
