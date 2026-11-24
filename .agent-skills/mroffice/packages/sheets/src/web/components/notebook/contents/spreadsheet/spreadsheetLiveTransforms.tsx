"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A sheet's gestures as the others see them while the hand is still on them
 * (lib/collab/live-transform): a chart, picture or shape moved, sized or
 * turned follows the hand; a column or row divider's guide line moves with
 * the drag; the range a fill handle or a dragged border will fill or land on
 * wears an outline that glides from cell to cell. The commits on release are
 * unchanged and stay the truth.
 *
 * Surface: `xls:<page>:<sheet>`, so streams never cross sheets or workbooks.
 * Object ids and units:
 * - `native:<chart>` / `drawing:<object>`: the drawing's frame in the sheet's
 *   content pixels (the frames the window's own drawing preview paints), its
 *   turn in degrees.
 * - `col:<index>` / `row:<index>`: x = the line, w = the size it is dragged
 *   to (content pixels; 0 hides it).
 * - `fill` / `move`: the target range in cells (x = first column, y = first
 *   row, w/h = columns/rows).
 *
 * Sending (only a member who can edit): the window's drawing preview hands
 * every frame it paints to {@link SpreadsheetLiveTransforms.drawings}; the
 * end goes out a render later with the frames the commit left (or the last
 * sample, when the commit is not there yet). Divider, fill and move drags go
 * out from their preview states ({@link SpreadsheetLiveTransforms.gesture}).
 *
 * Receiving: the peers' streams on this sheet are found on the awareness;
 * a drawing is painted by a second drawing preview (the same projection the
 * local hand uses, chart and shape re-laid out at the live size), only for
 * the objects streamed. Lines and ranges are drawn by
 * {@link SpreadsheetLiveGestureOverlays}, one small element per stream that
 * alone re-renders as it moves; the grid is never laid out again for them.
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { Awareness } from "y-protocols/awareness";

import {
  LIVE_TRANSFORM_FIELD,
  createLiveTransformPublisher,
  decodeLiveTransform,
  dropLiveTransform,
  liveTransformKey,
  liveTransforms,
  noteCommittedTransform,
  shortestTurn,
  useLiveTransform,
  useLiveTransformTracker,
  type LiveTransformFrame,
  type LiveTransformObject,
  type LiveTransformPublisher,
} from "@mrnote/core/web/lib/collab/live-transform.ts";
import { sanitizeCollabUser } from "@mrnote/core/web/lib/collab/collab-state.ts";
import type { ChartDrawingFrame } from "../../../../lib/spreadsheet/chart-groups";
import { sheetBoxPaneParts, sheetFreezeLinesPx, sheetFrozenPanes } from "./SheetRangePaneLayers";
import { sheetRangePaneLayer, type SheetFrozenLines, type SheetRangePane } from "./useSheetRangeBoxes";
import {
  createDrawingPreview,
  type DrawingLiveSize,
  type DrawingPreviewFrame,
} from "../../../../lib/spreadsheet/drawing-preview";
import { MAX_GRID_COLUMNS, MAX_GRID_ROWS, offsetOfLine, totalAxisSize } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX } from "./spreadsheetGridConstants";

export const SPREADSHEET_LIVE_FILL_ID = "fill";
export const SPREADSHEET_LIVE_MOVE_ID = "move";
/** A settled frame this close (content px) to the last sample is the commit. */
const SETTLED_TOLERANCE_PX = 2;
/** The end waits this long for the render that carries the commit. */
const END_FALLBACK_MS = 150;

export function spreadsheetLiveSurface(pageId: string, sheetId: string): string {
  return `xls:${pageId}:${sheetId}`;
}

export type SpreadsheetLiveId =
  | { readonly kind: "drawing"; readonly id: string }
  | { readonly kind: "line"; readonly axis: "col" | "row"; readonly index: number }
  | { readonly kind: "range"; readonly which: "fill" | "move" };

export function parseSpreadsheetLiveId(id: string): SpreadsheetLiveId | null {
  if (id.startsWith("native:") || id.startsWith("drawing:")) return { kind: "drawing", id };
  if (id === SPREADSHEET_LIVE_FILL_ID || id === SPREADSHEET_LIVE_MOVE_ID) return { kind: "range", which: id };
  const line = /^(col|row):(\d{1,7})$/u.exec(id);
  if (line) return { kind: "line", axis: line[1] as "col" | "row", index: Number(line[2]) };
  return null;
}

export interface SpreadsheetLiveRange {
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
}

export function spreadsheetLiveRangeObject(which: "fill" | "move", range: SpreadsheetLiveRange): LiveTransformObject {
  return { id: which, x: range.c1, y: range.r1, w: range.c2 - range.c1 + 1, h: range.r2 - range.r1 + 1 };
}

export function spreadsheetLiveLineObject(axis: "col" | "row", index: number, size: number): LiveTransformObject {
  return { id: `${axis}:${index}`, x: index, y: 0, w: Math.max(0, size), h: 0 };
}

/** A drawing's committed frame and turn, as the window draws it. */
export interface SpreadsheetCommittedDrawing {
  readonly frame: ChartDrawingFrame;
  readonly rotation: number;
}

export type SpreadsheetCommittedDrawingOf = (id: string) => SpreadsheetCommittedDrawing | null;

/** The drawing preview's frames as the objects that stream (drawings only). */
export function spreadsheetDrawingLiveObjects(
  frames: readonly DrawingPreviewFrame[],
  committedOf: SpreadsheetCommittedDrawingOf,
): LiveTransformObject[] {
  const objects: LiveTransformObject[] = [];
  for (const frame of frames) {
    if (parseSpreadsheetLiveId(frame.id)?.kind !== "drawing") continue;
    const rotation = frame.rotation ?? committedOf(frame.id)?.rotation ?? 0;
    objects.push({
      id: frame.id,
      x: frame.after.left,
      y: frame.after.top,
      w: frame.after.width,
      h: frame.after.height,
      r: rotation,
    });
  }
  return objects;
}

/**
 * The frames a drawing gesture settled on: the committed frames when every
 * one is where the last sample left it (the commit landed), else null (the
 * last sample stands until the document reaches it).
 */
export function spreadsheetSettledDrawingObjects(
  last: readonly LiveTransformObject[],
  committedOf: SpreadsheetCommittedDrawingOf,
): LiveTransformObject[] | null {
  const settled: LiveTransformObject[] = [];
  for (const object of last) {
    const committed = committedOf(object.id);
    if (!committed) return null;
    const { left, top, width, height } = committed.frame;
    if (
      Math.abs(left - object.x) > SETTLED_TOLERANCE_PX ||
      Math.abs(top - object.y) > SETTLED_TOLERANCE_PX ||
      Math.abs(width - object.w) > SETTLED_TOLERANCE_PX ||
      Math.abs(height - object.h) > SETTLED_TOLERANCE_PX ||
      Math.abs(shortestTurn(committed.rotation, object.r ?? 0)) > 0.5
    ) {
      return null;
    }
    settled.push({ id: object.id, x: left, y: top, w: width, h: height, r: committed.rotation });
  }
  return settled.length > 0 ? settled : null;
}

/** Content pixels at a fractional line coordinate (line + part of its size). */
export function spreadsheetAxisOffsetAt(
  coordinate: number,
  count: number,
  size: (line: number) => number,
): number {
  const clamped = Math.max(0, Math.min(count, coordinate));
  const line = Math.floor(clamped);
  const base = offsetOfLine(line, count, size);
  return line >= count ? base : base + (clamped - line) * size(line);
}

/** A peer's line or range stream on this sheet, drawn by the overlays. */
export interface SpreadsheetLiveGestureEntry {
  readonly clientId: number;
  readonly id: string;
  readonly color: string;
  readonly name: string;
}

export interface SpreadsheetLiveDrawingSink {
  /** The window's drawing preview painted these frames. */
  publish(frames: readonly DrawingPreviewFrame[]): void;
  /** The window's drawing preview was cleared (the gesture ended). */
  end(): void;
}

export interface SpreadsheetLiveTransforms {
  readonly drawings: SpreadsheetLiveDrawingSink;
  /** A divider, fill or move drag's objects now; null: none runs. */
  gesture(objects: readonly LiveTransformObject[] | null): void;
  /** The peers' line and range streams on this sheet. */
  readonly entries: readonly SpreadsheetLiveGestureEntry[];
}

export interface SpreadsheetLiveTransformsOptions {
  readonly awareness: Awareness | null;
  /** This member can edit the sheet (only then it publishes). */
  readonly canPublish: boolean;
  /** `xls:<page>:<sheet>`; null: nothing streams or is drawn. */
  readonly surface: string | null;
  readonly getRoot: () => HTMLElement | null;
  /** The committed frame of a drawing on the active sheet (read fresh). */
  readonly committedDrawingRef: { readonly current: SpreadsheetCommittedDrawingOf };
  /** A line's committed size on the active sheet (read fresh). */
  readonly lineSizeRef: { readonly current: (axis: "col" | "row", index: number) => number };
  /** The peers' drawings' live sizes (charts and shapes re-lay out at them). */
  readonly setRemoteLiveSizes: (sizes: ReadonlyMap<string, DrawingLiveSize>) => void;
}

const sameObjectFrame = (a: LiveTransformFrame | undefined, b: LiveTransformFrame) =>
  Boolean(a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.r === b.r);

interface SpreadsheetLiveDesk {
  /** The window's options as of its latest render. */
  configure(options: SpreadsheetLiveTransformsOptions): void;
  readonly drawings: SpreadsheetLiveDrawingSink;
  gesture(objects: readonly LiveTransformObject[] | null): void;
  /** Sends on this awareness until the returned dispose. */
  send(awareness: Awareness): () => void;
  /** Draws the peers' streams on `surface` until the returned dispose. */
  receive(awareness: Awareness, surface: string): () => void;
  /** After each render, before it is painted. */
  rendered(surface: string | null, entries: readonly SpreadsheetLiveGestureEntry[]): void;
}

/**
 * The sending and receiving state of one sheet window; its options are read
 * fresh at every call (the window's frames change every render).
 */
function createSpreadsheetLiveDesk(
  initial: SpreadsheetLiveTransformsOptions,
  setEntries: (entries: readonly SpreadsheetLiveGestureEntry[]) => void,
): SpreadsheetLiveDesk {
  let latest = initial;
  const options = () => latest;
  // ---- Sending ------------------------------------------------------------
  let publisher: LiveTransformPublisher | null = null;
  let drawingStream: { surface: string; last: LiveTransformObject[] } | null = null;
  let pendingEnd: { surface: string; last: LiveTransformObject[]; timer: ReturnType<typeof setTimeout> } | null = null;
  let gestureStream: string | null = null;

  const flushEnd = () => {
    const pending = pendingEnd;
    if (!pending) return;
    pendingEnd = null;
    clearTimeout(pending.timer);
    publisher?.end(pending.surface, spreadsheetSettledDrawingObjects(pending.last, options().committedDrawingRef.current));
  };

  const drawings: SpreadsheetLiveDrawingSink = {
    publish(frames) {
      const surface = options().surface;
      if (!publisher || !surface) return;
      const objects = spreadsheetDrawingLiveObjects(frames, options().committedDrawingRef.current);
      if (objects.length === 0) return;
      // A new gesture before the last one's end went out: that end first.
      flushEnd();
      drawingStream = { surface, last: objects };
      publisher.publish(surface, objects);
    },
    end() {
      const stream = drawingStream;
      if (!stream) return;
      drawingStream = null;
      // The commit lands in the render this clear is batched with: the end
      // goes out after it, with the frames the document now holds.
      flushEnd();
      pendingEnd = { surface: stream.surface, last: stream.last, timer: setTimeout(flushEnd, END_FALLBACK_MS) };
    },
  };

  // ---- Receiving ----------------------------------------------------------
  let entriesSignature = "";
  /** Drawing ids the peers stream on this sheet. */
  const drawingIds = new Set<string>();
  const unsubscribe = new Map<string, () => void>();
  const remoteFrames = new Map<string, LiveTransformFrame>();
  /** Objects whose stream ended (their commit may still be on its way). */
  const ended = new Set<string>();
  const noted = new Map<string, LiveTransformFrame>();
  const remotePreview = createDrawingPreview(() => options().getRoot());
  let paintQueued = false;
  let remoteSized = false;

  const committedFrameOf = (id: string): LiveTransformFrame | null => {
    const parsed = parseSpreadsheetLiveId(id);
    if (!parsed) return null;
    if (parsed.kind === "drawing") {
      const committed = options().committedDrawingRef.current(id);
      if (!committed) return null;
      const { left, top, width, height } = committed.frame;
      return { x: left, y: top, w: Math.max(0, width), h: Math.max(0, height), r: committed.rotation };
    }
    if (parsed.kind === "line") {
      return { x: parsed.index, y: 0, w: Math.max(0, options().lineSizeRef.current(parsed.axis, parsed.index)), h: 0, r: 0 };
    }
    return null;
  };

  /** The document's frame of a streamed object, told to the store when it changed. */
  const noteId = (surface: string, id: string): boolean => {
    const frame = committedFrameOf(id);
    if (!frame) return false;
    const before = noted.get(id);
    if (sameObjectFrame(before, frame)) return false;
    noted.set(id, frame);
    noteCommittedTransform(surface, id, frame);
    // The commit of an ended stream landed, though not where the stream
    // ended (a desk whose grid sizes differ): the document's frame now.
    if (before && ended.has(id)) dropLiveTransform(surface, id);
    return true;
  };

  const paint = (now = false) => {
    paintQueued = false;
    const frames: DrawingPreviewFrame[] = [];
    const sizes = new Map<string, DrawingLiveSize>();
    for (const [id, live] of remoteFrames) {
      const committed = options().committedDrawingRef.current(id);
      if (!committed) continue;
      const after = { left: live.x, top: live.y, width: live.w, height: live.h };
      const turned = Math.abs(shortestTurn(committed.rotation, live.r)) > 0.01;
      frames.push({ id, before: committed.frame, after, ...(turned ? { rotation: live.r } : {}) });
      if (Math.round(live.w) !== Math.round(committed.frame.width) || Math.round(live.h) !== Math.round(committed.frame.height)) {
        sizes.set(id, { width: Math.round(live.w), height: Math.round(live.h) });
      }
    }
    if (frames.length > 0) {
      remotePreview.schedule(frames);
      if (now) remotePreview.flush();
    }
    if (sizes.size > 0 || remoteSized) {
      remoteSized = sizes.size > 0;
      options().setRemoteLiveSizes(sizes);
    }
  };
  const queuePaint = () => {
    if (paintQueued) return;
    paintQueued = true;
    queueMicrotask(() => paint());
  };

  return {
    configure(next) {
      latest = next;
    },
    drawings,
    gesture(objects) {
      const surface = options().surface;
      if (!publisher) return;
      if (objects && objects.length > 0 && surface) {
        if (gestureStream && gestureStream !== surface) publisher.end(gestureStream, null);
        gestureStream = surface;
        publisher.publish(surface, objects);
        return;
      }
      if (gestureStream) {
        const streaming = gestureStream;
        gestureStream = null;
        publisher.end(streaming, null);
      }
    },
    send(awareness) {
      const own = createLiveTransformPublisher(awareness);
      publisher = own;
      return () => {
        if (pendingEnd) clearTimeout(pendingEnd.timer);
        pendingEnd = null;
        drawingStream = null;
        gestureStream = null;
        if (publisher === own) publisher = null;
        own.dispose();
      };
    },
    receive(awareness, surface) {
      const rangeGestures = new Map<string, number>();
      const subscribeDrawing = (id: string) => {
        if (unsubscribe.has(id)) return;
        const key = liveTransformKey(surface, id);
        const read = () => {
          const frame = liveTransforms.read(key);
          if (frame) remoteFrames.set(id, frame);
          else if (remoteFrames.delete(id)) remotePreview.release(id);
          queuePaint();
        };
        noteId(surface, id);
        unsubscribe.set(id, liveTransforms.subscribe(key, read));
        read();
      };
      // On "change", which the awareness emits before "update" (where the
      // tracker reads the samples): the document's frames are in the store
      // before a stream's first sample is.
      const scan = () => {
        const seenDrawings = new Set<string>();
        const next: SpreadsheetLiveGestureEntry[] = [];
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return;
          const record = state as Record<string, unknown> | undefined;
          const decoded = decodeLiveTransform(record?.[LIVE_TRANSFORM_FIELD]);
          if (!decoded || decoded.surface !== surface) return;
          const user = sanitizeCollabUser((record?.user ?? {}) as { id?: unknown; name?: unknown; color?: unknown });
          for (const object of decoded.objects) {
            const parsed = parseSpreadsheetLiveId(object.id);
            if (!parsed) continue;
            if (parsed.kind === "range") {
              // A range has no document frame: a gesture starts where its
              // first sample is (not from the last one's outline) and
              // settles where it ends.
              const streamKey = `${clientId}:${object.id}`;
              const start = rangeGestures.get(streamKey) !== decoded.gesture;
              if (start) rangeGestures.set(streamKey, decoded.gesture);
              if (start || (decoded.end && !ended.has(object.id))) {
                noteCommittedTransform(surface, object.id, { x: object.x, y: object.y, w: object.w, h: object.h, r: 0 });
              }
            }
            if (decoded.end) ended.add(object.id);
            else ended.delete(object.id);
            if (parsed.kind === "drawing") {
              seenDrawings.add(object.id);
              subscribeDrawing(object.id);
            } else {
              if (parsed.kind === "line") noteId(surface, object.id);
              next.push({ clientId, id: object.id, color: user.color, name: user.name });
            }
          }
        });
        for (const id of [...unsubscribe.keys()]) {
          if (seenDrawings.has(id)) continue;
          unsubscribe.get(id)?.();
          unsubscribe.delete(id);
          if (remoteFrames.delete(id)) remotePreview.release(id);
        }
        drawingIds.clear();
        for (const id of seenDrawings) drawingIds.add(id);
        for (const id of [...ended]) {
          if (!seenDrawings.has(id) && !next.some((entry) => entry.id === id)) ended.delete(id);
        }
        queuePaint();
        const signature = JSON.stringify(next);
        if (signature !== entriesSignature) {
          entriesSignature = signature;
          setEntries(next);
        }
      };
      scan();
      awareness.on("change", scan);
      return () => {
        awareness.off("change", scan);
        for (const stop of unsubscribe.values()) stop();
        unsubscribe.clear();
        remoteFrames.clear();
        drawingIds.clear();
        ended.clear();
        noted.clear();
        remotePreview.clear();
        if (remoteSized) {
          remoteSized = false;
          options().setRemoteLiveSizes(new Map());
        }
        entriesSignature = "";
        setEntries([]);
      };
    },
    rendered(surface, entries) {
      // The end of a drawing gesture this desk made: the commit is in this render.
      flushEnd();
      if (!surface) return;
      let changed = false;
      for (const id of drawingIds) changed = noteId(surface, id) || changed;
      for (const entry of entries) {
        if (parseSpreadsheetLiveId(entry.id)?.kind === "line") noteId(surface, entry.id);
      }
      // A projection over a frame that just changed is painted again before
      // this render shows: never a frame drawn from the old one.
      if (changed && remoteFrames.size > 0) paint(true);
    },
  };
}

export function useSpreadsheetLiveTransforms(options: SpreadsheetLiveTransformsOptions): SpreadsheetLiveTransforms {
  const { awareness, canPublish, surface } = options;
  const [entries, setEntries] = useState<readonly SpreadsheetLiveGestureEntry[]>([]);
  const [desk] = useState(() => createSpreadsheetLiveDesk(options, setEntries));
  useLayoutEffect(() => {
    desk.configure(options);
  });
  useLiveTransformTracker(awareness);
  useEffect(() => (awareness && canPublish ? desk.send(awareness) : undefined), [awareness, canPublish, desk]);
  useEffect(() => (awareness && surface ? desk.receive(awareness, surface) : undefined), [awareness, surface, desk]);
  // Every render, before it is painted.
  useLayoutEffect(() => {
    desk.rendered(surface, entries);
  });
  return useMemo(() => ({ drawings: desk.drawings, gesture: desk.gesture, entries }), [desk, entries]);
}

export interface SpreadsheetLiveGestureOverlaysProps {
  readonly surface: string | null;
  readonly entries: readonly SpreadsheetLiveGestureEntry[];
  readonly colWidth: (line: number) => number;
  readonly rowHeight: (line: number) => number;
  readonly columnCount: number;
  readonly rowCount: number;
  readonly gridRtl: boolean;
  /** The frozen lines: a guide or an outline over frozen cells is drawn over that pane. */
  readonly frozen?: SheetFrozenLines | null;
}

/** The peers' guides and outlines: over the cells, under the frozen panes. */
const LIVE_GESTURE_LAYER = 8;

type PaneLayers = Partial<Record<SheetRangePane, HTMLElement>>;

/** The peers' divider guides and fill / move outlines, in the grid stage. */
export function SpreadsheetLiveGestureOverlays({ surface, entries, frozen = null, ...geometry }: SpreadsheetLiveGestureOverlaysProps) {
  // A frozen pane's parts are drawn on a layer pinned with that pane, as the
  // range boxes are (SheetRangePaneLayers).
  const [layers, setLayers] = useState<PaneLayers>({});
  const panes = sheetFrozenPanes(frozen);
  // A fixed display: contents slot: the stage's own children never change
  // as streams come and go (that restyled every mounted cell).
  return (
    <div data-spreadsheet-stage-slot="live-gestures" style={{ display: "contents" }}>
      {surface
        ? entries.map((entry) => (
            <SpreadsheetLiveGestureBox
              key={`${entry.clientId}:${entry.id}`}
              surface={surface}
              entry={entry}
              frozen={frozen}
              layers={layers}
              {...geometry}
            />
          ))
        : null}
      {panes.map((pane) => (
        <div
          key={pane}
          ref={(element) => {
            setLayers((current) => (element && current[pane] !== element ? { ...current, [pane]: element } : current));
          }}
          aria-hidden="true"
          data-testid={`spreadsheet-live-gestures-pane-${pane}`}
          style={{
            position: "sticky",
            ...(pane !== "left" ? { top: 0 } : {}),
            ...(pane !== "top" ? { left: 0, width: 0 } : {}),
            height: 0,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: sheetRangePaneLayer(pane, LIVE_GESTURE_LAYER),
          }}
        />
      ))}
    </div>
  );
}

function SpreadsheetLiveGestureBox({
  surface,
  entry,
  colWidth,
  rowHeight,
  columnCount,
  rowCount,
  gridRtl,
  frozen,
  layers,
}: Omit<SpreadsheetLiveGestureOverlaysProps, "entries" | "surface"> & {
  surface: string;
  entry: SpreadsheetLiveGestureEntry;
  layers: PaneLayers;
}) {
  const live = useLiveTransform(surface, entry.id);
  const parsed = parseSpreadsheetLiveId(entry.id);
  if (!live || !parsed || parsed.kind === "drawing") return null;
  const columns = Math.min(MAX_GRID_COLUMNS, Math.max(columnCount, 1));
  const rows = Math.min(MAX_GRID_ROWS, Math.max(rowCount, 1));
  const sheetWidth = totalAxisSize(columns, colWidth);
  const sheetHeight = totalAxisSize(rows, rowHeight);
  // Logical start offset (content px) -> the stage's left edge.
  const leftOf = (start: number, end: number) =>
    SPREADSHEET_HEADER_WIDTH_PX + (gridRtl ? sheetWidth - end : start);
  const common = {
    position: "absolute" as const,
    zIndex: LIVE_GESTURE_LAYER,
    pointerEvents: "none" as const,
    boxSizing: "border-box" as const,
  };
  // The box in each pane it spans: the body's here, a frozen pane's on that
  // pane's pinned layer (in the same content pixels).
  const freeze = sheetFreezeLinesPx(frozen, rows, columns, rowHeight, colWidth);
  const inPanes = (box: { left: number; top: number; width: number; height: number }, draw: (style: CSSProperties) => ReactElement) =>
    sheetBoxPaneParts(box, freeze).map((part) => {
      const element = draw(part.clip ? { clipPath: part.clip } : {});
      if (part.pane === "body") return <Fragment key={part.pane}>{element}</Fragment>;
      const layer = layers[part.pane];
      return layer ? <Fragment key={part.pane}>{createPortal(element, layer)}</Fragment> : null;
    });
  if (parsed.kind === "line") {
    const at = offsetOfLine(parsed.index, parsed.axis === "col" ? columns : rows, parsed.axis === "col" ? colWidth : rowHeight) + live.w;
    const guide =
      parsed.axis === "col"
        ? { left: leftOf(at, at), top: 0, width: 0, height: SPREADSHEET_HEADER_HEIGHT_PX + sheetHeight }
        : { left: 0, top: SPREADSHEET_HEADER_HEIGHT_PX + at, width: SPREADSHEET_HEADER_WIDTH_PX + sheetWidth, height: 0 };
    return (
      <>
        {inPanes(guide, (clip) => (
          <div
            aria-hidden="true"
            data-testid="spreadsheet-live-resize-guide"
            data-live-transform-id={entry.id}
            style={{
              ...common,
              ...guide,
              ...(parsed.axis === "col" ? { borderLeft: `1px dashed ${entry.color}` } : { borderTop: `1px dashed ${entry.color}` }),
              ...clip,
            }}
          />
        ))}
      </>
    );
  }
  const start = spreadsheetAxisOffsetAt(live.x, columns, colWidth);
  const end = spreadsheetAxisOffsetAt(live.x + live.w, columns, colWidth);
  const top = spreadsheetAxisOffsetAt(live.y, rows, rowHeight);
  const bottom = spreadsheetAxisOffsetAt(live.y + live.h, rows, rowHeight);
  const frame = {
    left: leftOf(start, end),
    top: SPREADSHEET_HEADER_HEIGHT_PX + top,
    width: Math.max(2, end - start),
    height: Math.max(2, bottom - top),
  };
  return (
    <>
      {inPanes(frame, (clip) => (
        <div
          aria-hidden="true"
          data-testid={parsed.which === "fill" ? "spreadsheet-live-fill-frame" : "spreadsheet-live-move-frame"}
          data-live-transform-id={entry.id}
          title={entry.name}
          style={{ ...common, ...frame, border: `2px dashed ${entry.color}`, ...clip }}
        />
      ))}
    </>
  );
}
