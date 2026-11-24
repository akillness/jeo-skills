"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Live transforms on a PDF page: an object placed on the page (a shape, a
 * stamp, a signature, a redaction, a measurement, a form field) that another
 * member is moving, sizing or turning, drawn on this desk while the hand is
 * still on it (lib/collab/live-transform, on the page room's presence).
 *
 * The write on release is unchanged and stays the truth. The others' frame
 * is drawn where the viewer already draws a gesture in flight (the viewer's
 * `heldPlacedBox` / `heldPlacedRotation`); an object the page canvas paints
 * itself (a managed native appearance) shows its overlay copy at the frame
 * while it moves, the canvas keeps its pixels until the write repaints it.
 *
 * Wire: surface `pdf:<pageId>:<page number>`, the viewer's object key
 * (`shape:<id>`, `stamp:<id>`, ...), the box in page per-mille (tenths of a
 * percent: the shared store eases in steps of half a unit), and the turn made
 * since the gesture began (0 for a move or a resize). The object's box or
 * angle changing here is its write landing: the frame goes at once.
 */

import { useEffect, useMemo, useReducer, useRef } from "react";
import type { Awareness } from "y-protocols/awareness";

import {
  createLiveTransformPublisher,
  liveTransformKey,
  liveTransforms,
  useLiveTransformTracker,
  type LiveTransformPublisher,
} from "@mrnote/core/web/lib/collab/live-transform.ts";
import type { PercentBox } from "../../../../lib/pdf/annotation-transform";

/** The page room the viewer's objects stream on. */
export interface PdfLiveTransformRoom {
  readonly pageId: string;
  readonly awareness: Awareness | null;
  /** This member can edit: its own gestures go out. */
  readonly sends: boolean;
}

export interface PdfLiveTransforms {
  /** The box to draw for `key` on `pageNumber`: another member's, else `box`. */
  box<B extends PercentBox>(pageNumber: number, key: string, box: B): B;
  /** The turn another member has given `key` since its angle was `saved`. */
  turn(pageNumber: number, key: string, saved: string): number;
  /** Another member's hand is on `key` now. */
  active(pageNumber: number, key: string): boolean;
  /** This member's gesture at `box` (turned `turn` since it began); null ends it. */
  publish(pageNumber: number, key: string, box: PercentBox | null, turn?: number): void;
}

const PER_MILLE = 10;

export function pdfLiveSurface(pageId: string, pageNumber: number): string {
  return `pdf:${pageId}:${pageNumber}`;
}

/**
 * The viewer's live transforms for `room` (null: none). The viewer
 * re-renders as another member's frame moves on this page, as it does for
 * its own gesture.
 */
export function usePdfLiveTransforms(room: PdfLiveTransformRoom | null | undefined): PdfLiveTransforms | null {
  const pageId = room?.pageId ?? null;
  const awareness = room?.awareness ?? null;
  const sends = Boolean(room?.sends && awareness);
  useLiveTransformTracker(awareness);
  const publisherRef = useRef<LiveTransformPublisher | null>(null);
  useEffect(() => {
    if (!awareness || !sends) return;
    const publisher = createLiveTransformPublisher(awareness);
    publisherRef.current = publisher;
    return () => {
      if (publisherRef.current === publisher) publisherRef.current = null;
      publisher.dispose();
    };
  }, [awareness, sends]);
  const [version, bump] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (!pageId || !awareness) return;
    const prefix = `pdf:${pageId}:`;
    return liveTransforms.subscribeAll((key) => {
      if (key.startsWith(prefix)) bump();
    });
  }, [awareness, pageId]);
  // What each streamed object stood at when its stream began here: a
  // change is its write landing.
  const startsRef = useRef(new Map<string, string>());
  return useMemo(() => {
    if (!pageId) return null;
    void version;
    const starts = startsRef.current;
    const landed = (key: string, snapshot: string, slot: string): boolean => {
      const at = `${key}\u0001${slot}`;
      const before = starts.get(at);
      if (before === undefined) {
        starts.set(at, snapshot);
        return false;
      }
      if (before === snapshot) return false;
      starts.delete(at);
      // Not inside the render that saw it: the store notifies.
      queueMicrotask(() => liveTransforms.drop(key));
      return true;
    };
    const forget = (key: string) => {
      starts.delete(`${key}\u0001box`);
      starts.delete(`${key}\u0001turn`);
    };
    const live: PdfLiveTransforms = {
      box(pageNumber, objectKey, box) {
        const key = liveTransformKey(pdfLiveSurface(pageId, pageNumber), objectKey);
        const frame = liveTransforms.read(key);
        if (!frame) {
          forget(key);
          return box;
        }
        liveTransforms.noteCommitted(key, {
          x: box.x * PER_MILLE,
          y: box.y * PER_MILLE,
          w: box.width * PER_MILLE,
          h: box.height * PER_MILLE,
          r: 0,
        });
        if (landed(key, `${box.x},${box.y},${box.width},${box.height}`, "box")) return box;
        return {
          ...box,
          x: frame.x / PER_MILLE,
          y: frame.y / PER_MILLE,
          width: frame.w / PER_MILLE,
          height: frame.h / PER_MILLE,
        };
      },
      turn(pageNumber, objectKey, saved) {
        const key = liveTransformKey(pdfLiveSurface(pageId, pageNumber), objectKey);
        const frame = liveTransforms.read(key);
        if (!frame || landed(key, saved, "turn")) return 0;
        return frame.r > 180 ? frame.r - 360 : frame.r;
      },
      active(pageNumber, objectKey) {
        return liveTransforms.read(liveTransformKey(pdfLiveSurface(pageId, pageNumber), objectKey)) !== null;
      },
      publish(pageNumber, objectKey, box, turn = 0) {
        const publisher = publisherRef.current;
        if (!publisher) return;
        const surface = pdfLiveSurface(pageId, pageNumber);
        if (!box) {
          // The others hold the last frame until the write lands there.
          publisher.end(surface, null);
          return;
        }
        publisher.publish(surface, [
          {
            id: objectKey,
            x: box.x * PER_MILLE,
            y: box.y * PER_MILLE,
            w: Math.max(0, box.width) * PER_MILLE,
            h: Math.max(0, box.height) * PER_MILLE,
            r: turn,
          },
        ]);
      },
    };
    return live;
  }, [pageId, version]);
}
