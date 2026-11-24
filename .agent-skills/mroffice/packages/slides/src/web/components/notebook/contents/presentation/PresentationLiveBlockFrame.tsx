"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A slide object drawn where another member's hand has it (lib/collab/
 * live-transform): while a member moves, sizes or turns objects, the others
 * see them follow the hand, not jump on release.
 *
 * Sending: {@link presentationLiveTransformObjects} reads the deck's own
 * gesture previews (the drag/resize preview and the rotate preview, the same
 * frames this desk draws) into the objects the publisher streams.
 *
 * Receiving: each block's host element is this component. It reads only its
 * own block's live frame, so a sample re-renders this element alone; the
 * block's contents are the same elements the window rendered, and React
 * leaves them be. The window's own preview always wins (this desk's hand).
 * Contents that are laid out from the block's size (a shape's outline path)
 * stretch with the frame until the commit lands and the window draws them
 * again; positions and turns are exact.
 */

import { createContext, useEffect, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import {
  noteCommittedTransform,
  useLiveTransform,
  type LiveTransformFrame,
  type LiveTransformObject,
} from "@mrnote/core/web/lib/collab/live-transform.ts";
import type { BlockGeometry } from "@mrnote/core/web/lib/presentation-drag.ts";
import { geometryNumber, hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";

/** Slide EMU per wire unit: frames travel in the slide's CSS pixels (as live ink does). */
export const PRESENTATION_LIVE_EMU_PER_UNIT = 9_525;

const toUnits = (emu: number): number => emu / PRESENTATION_LIVE_EMU_PER_UNIT;

/** The surface a deck's objects stream on: one page, one slide. */
export function presentationLiveTransformSurface(pageId: string, slideId: string): string {
  return `ppt:${pageId}:${slideId}`;
}

/** The block's frame (EMU) with the canvas's own defaults for a missing size. */
function blockFrameEmu(
  block: PresentationBlock,
  bounds: { width: number; height: number },
): BlockGeometry {
  return {
    left: geometryNumber(block, "left") ?? 0,
    top: geometryNumber(block, "top") ?? 0,
    width: geometryNumber(block, "width") ?? Math.round(bounds.width * 0.35),
    height: geometryNumber(block, "height") ?? Math.round(bounds.height * 0.18),
  };
}

function objectOf(id: string, geom: BlockGeometry, rotation: number): LiveTransformObject {
  return {
    id,
    x: toUnits(geom.left),
    y: toUnits(geom.top),
    w: toUnits(geom.width),
    h: toUnits(geom.height),
    r: rotation,
  };
}

/** The document's frame for a block, in wire units; null for a block not placed on the slide. */
export function presentationLiveFrameOf(
  block: PresentationBlock,
  bounds: { width: number; height: number },
): LiveTransformFrame | null {
  if (!hasLayoutGeometry(block)) return null;
  const { r = 0, ...frame } = objectOf(block.id, blockFrameEmu(block, bounds), geometryNumber(block, "rotation") ?? 0);
  return { x: frame.x, y: frame.y, w: frame.w, h: frame.h, r };
}

export interface PresentationGesturePreviews {
  readonly drag: {
    readonly blockId: string;
    readonly geom: BlockGeometry;
    readonly members?: ReadonlyMap<string, BlockGeometry>;
  } | null;
  readonly rotate: {
    readonly blockId: string;
    readonly rotation: number;
    readonly members?: ReadonlyMap<string, BlockGeometry & { rotation: number }>;
  } | null;
}

/**
 * The objects this desk's gesture has in hand, as the canvas draws them (the
 * block under the hand first). Empty when no gesture previews.
 */
export function presentationLiveTransformObjects(
  blocks: readonly PresentationBlock[],
  bounds: { width: number; height: number },
  previews: PresentationGesturePreviews,
): LiveTransformObject[] {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const objects = new Map<string, LiveTransformObject>();
  const rotationOf = (id: string) => {
    const block = byId.get(id);
    return block ? geometryNumber(block, "rotation") ?? 0 : 0;
  };
  const { drag, rotate } = previews;
  if (drag && byId.has(drag.blockId)) {
    objects.set(drag.blockId, objectOf(drag.blockId, drag.geom, rotationOf(drag.blockId)));
    for (const [id, geom] of drag.members ?? []) {
      if (!objects.has(id) && byId.has(id)) objects.set(id, objectOf(id, geom, rotationOf(id)));
    }
  }
  if (rotate && byId.has(rotate.blockId)) {
    // As the canvas draws a turn: every member swings about the selection's
    // centre with its own frame, the block under the hand too; alone, the
    // block keeps its frame and takes the angle.
    const primary = byId.get(rotate.blockId)!;
    const own = rotate.members?.get(rotate.blockId);
    objects.set(
      rotate.blockId,
      own ? objectOf(rotate.blockId, own, own.rotation) : objectOf(rotate.blockId, blockFrameEmu(primary, bounds), rotate.rotation),
    );
    for (const [id, member] of rotate.members ?? []) {
      if (id === rotate.blockId || !byId.has(id)) continue;
      objects.set(id, objectOf(id, member, member.rotation));
    }
  }
  return [...objects.values()];
}

/** The document's frames of these blocks (what a gesture settled on), in wire units. */
export function presentationSettledTransformObjects(
  blocks: readonly PresentationBlock[],
  bounds: { width: number; height: number },
  ids: readonly string[],
): LiveTransformObject[] {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const settled: LiveTransformObject[] = [];
  for (const id of ids) {
    const block = byId.get(id);
    if (!block || !hasLayoutGeometry(block)) continue;
    settled.push(objectOf(id, blockFrameEmu(block, bounds), geometryNumber(block, "rotation") ?? 0));
  }
  return settled;
}

type HostProps = Omit<HTMLAttributes<HTMLDivElement>, "style">;

export interface PresentationLiveBlockFrameProps extends HostProps {
  /** The style the window renders (its own preview included). */
  readonly style: CSSProperties | undefined;
  /** The style at another geometry (EMU) and rotation. */
  readonly styleAt: (geom: BlockGeometry | undefined, rotation: number | undefined) => CSSProperties | undefined;
  /** Null: no stream draws this block (a preview or a show). */
  readonly liveSurface: string | null;
  readonly liveBlockId: string;
  /** The document's frame in wire units; null for a block not placed on the slide. */
  readonly committedFrame: LiveTransformFrame | null;
  /** This desk's own gesture previews the block. */
  readonly ownPreview: boolean;
  readonly children?: ReactNode;
}

/**
 * The frame (slide EMU) another member's hand has this block at, for the
 * contents that are drawn at their size rather than stretched: a stroke of
 * ink is drawn at it, its line scaled, as the commit will land it (it jumped
 * on the release). Null while no other hand holds it.
 */
export const PresentationLiveGeometryContext = createContext<BlockGeometry | null>(null);

export function PresentationLiveBlockFrame({
  style,
  styleAt,
  liveSurface,
  liveBlockId,
  committedFrame,
  ownPreview,
  children,
  ...host
}: PresentationLiveBlockFrameProps) {
  const surface = committedFrame ? liveSurface : null;
  const live = useLiveTransform(surface, liveBlockId);
  const cx = committedFrame?.x;
  const cy = committedFrame?.y;
  const cw = committedFrame?.w;
  const ch = committedFrame?.h;
  const cr = committedFrame?.r;
  useEffect(() => {
    if (surface === null || cx === undefined || cy === undefined || cw === undefined || ch === undefined || cr === undefined) {
      return;
    }
    noteCommittedTransform(surface, liveBlockId, { x: cx, y: cy, w: cw, h: ch, r: cr });
  }, [surface, liveBlockId, cx, cy, cw, ch, cr]);
  const held = live && !ownPreview;
  const lx = held ? live.x : undefined;
  const ly = held ? live.y : undefined;
  const lw = held ? live.w : undefined;
  const lh = held ? live.h : undefined;
  const liveGeom = useMemo<BlockGeometry | null>(
    () =>
      lx === undefined || ly === undefined || lw === undefined || lh === undefined
        ? null
        : {
            left: lx * PRESENTATION_LIVE_EMU_PER_UNIT,
            top: ly * PRESENTATION_LIVE_EMU_PER_UNIT,
            width: lw * PRESENTATION_LIVE_EMU_PER_UNIT,
            height: lh * PRESENTATION_LIVE_EMU_PER_UNIT,
          },
    [lx, ly, lw, lh],
  );
  const drawn = held && liveGeom ? styleAt(liveGeom, live.r) : style;
  return (
    <div
      {...host}
      style={drawn}
      data-live-transform={held ? "true" : undefined}
    >
      <PresentationLiveGeometryContext.Provider value={liveGeom}>{children}</PresentationLiveGeometryContext.Provider>
    </div>
  );
}
