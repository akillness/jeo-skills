/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format 3D Model > 3D Model > 3D Model Rotation: a model's X / Y / Z as
 * PowerPoint's pane edits them (`lib/office-model3d/turn`). A turn loads the
 * model, fits its frame to it about its centre, draws its picture again and
 * puts all three on the page as one change (the save writes them as
 * PowerPoint writes a turn: `am3d:rot`, the frame, the raster and its
 * Fallback). Shown for a model the page can draw (schema 2) only.
 */

import type { OfficeShapeFormatPaneSection } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import type { PresentationBlock, PresentationImageBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { presentationModel3dOf } from "@mrnote/core/web/lib/office-model3d/block.ts";
import { loadModel3dRenderer, loadPageModel3d } from "@mrnote/core/web/lib/office-model3d/load.ts";
import { model3dPaneAngles, model3dRotationOf, turnModel3d } from "@mrnote/core/web/lib/office-model3d/turn.ts";
import type { Model3dVector } from "@mrnote/core/web/lib/office-model3d/scene.ts";

export interface PresentationModel3dPaneArgs {
  block: PresentationImageBlock;
  pageId: string | null;
  writable: boolean;
  labels: { title: string; x: string; y: string; z: string; failed: string };
  replaceBlock: (blockId: string, nextBlock: PresentationBlock) => void;
  /**
   * Replace the block as the slide holds it NOW (the window's live slide, not
   * the one this pane was drawn from): a turn lands a moment after it was
   * asked for, and a collaborator's words typed meanwhile in another object
   * of the slide must not be written over by a stale copy of it. ``change``
   * gets the live block and returns null to leave it.
   */
  commitLiveBlock?: (blockId: string, change: (live: PresentationBlock) => PresentationBlock | null) => boolean;
  /** Told when the turn could not be done here (no WebGL, the part unreadable). */
  onFailed?: (message: string) => void;
}

/** The block after a turn to ``rotation`` (60,000ths of a degree), or null. */
export async function turnPresentationModel3d(
  block: PresentationImageBlock,
  pageId: string,
  rotation: Model3dVector,
): Promise<PresentationImageBlock | null> {
  const model = presentationModel3dOf(block);
  if (!model) return null;
  const geometry = block as unknown as { left?: number; top?: number; width?: number; height?: number };
  if (![geometry.left, geometry.top, geometry.width, geometry.height].every((value) => typeof value === "number")) return null;
  const [renderer, loaded] = await Promise.all([loadModel3dRenderer(), loadPageModel3d(pageId, block.id, model)]);
  if (!renderer.model3dRenderingAvailable()) return null;
  const result = turnModel3d(renderer, loaded, model, {
    left: geometry.left as number,
    top: geometry.top as number,
    width: geometry.width as number,
    height: geometry.height as number,
  }, rotation);
  if (!result) return null;
  const source = (block.source ?? {}) as Record<string, unknown>;
  const authority = (source.nativeModel3d ?? {}) as Record<string, unknown>;
  return {
    ...block,
    left: result.frame.left,
    top: result.frame.top,
    width: result.frame.width,
    height: result.frame.height,
    src: result.picture,
    source: {
      ...source,
      // The frame keeps the turned model's proportions (PowerPoint's
      // noChangeAspect), measured from its new size.
      pictureSizeOriginalWidthEmu: result.frame.width,
      pictureSizeOriginalHeightEmu: result.frame.height,
      nativeModel3d: { ...authority, scene: result.scene },
    },
  } as PresentationImageBlock;
}

function afterPendingUpdates(run: () => void): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  setTimeout(() => {
    // A frame (a hidden window has none: at most a quarter second instead).
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(once, 0));
    setTimeout(once, 250);
  }, 0);
}

function sameModelFrame(live: PresentationBlock, asked: PresentationImageBlock): boolean {
  const a = live as unknown as Record<string, unknown>;
  const b = asked as unknown as Record<string, unknown>;
  const rotationOf = (block: Record<string, unknown>) =>
    JSON.stringify(presentationModel3dOf(block as { source?: unknown })?.scene.transform.rotation ?? null);
  return (
    ["left", "top", "width", "height", "rotation", "src"].every((key) => a[key] === b[key]) &&
    rotationOf(a) === rotationOf(b)
  );
}

export function presentationModel3dPaneSections(args: PresentationModel3dPaneArgs): OfficeShapeFormatPaneSection[] | null {
  const model = presentationModel3dOf(args.block);
  if (!model || model.scene.viewportSize === null) return null;
  const angles = model3dPaneAngles(model.scene.transform.rotation);
  const disabled = !args.writable || !args.pageId;
  const commit = (axis: 0 | 1 | 2) => (text: string): boolean => {
    const degrees = Number(String(text).replace(/[°\s]/g, ""));
    if (!Number.isFinite(degrees) || degrees < 0 || degrees >= 360 || !args.pageId) return false;
    const rotation = [...model.scene.transform.rotation] as [number, number, number];
    rotation[axis] = model3dRotationOf(degrees);
    if (rotation[axis] === model.scene.transform.rotation[axis]) return true;
    const blockId = args.block.id;
    const asked = args.block;
    void turnPresentationModel3d(asked, args.pageId, rotation)
      .then((next) => {
        if (!next) {
          args.onFailed?.(args.labels.failed);
          return;
        }
        // After the updates that arrived while the model was drawn (the
        // drawing holds the thread) are in the window's slide: their socket
        // messages run first, the window's render of them is a task after
        // that, so the turn lands after a frame and a task more.
        afterPendingUpdates(() => {
          if (!args.commitLiveBlock) {
            args.replaceBlock(blockId, next);
            return;
          }
          args.commitLiveBlock(blockId, (live) =>
            // The model as it was asked to turn: a model moved, sized or
            // turned by someone meanwhile is left as they made it.
            sameModelFrame(live, asked) ? next : null,
          );
        });
      })
      .catch(() => args.onFailed?.(args.labels.failed));
    return true;
  };
  const field = (axis: 0 | 1 | 2, key: string, label: string) => ({
    kind: "number" as const,
    id: `presentation-model3d-rotation-${key}`,
    label,
    value: angles[axis],
    min: 0,
    max: 359.9,
    step: 0.1,
    unit: "°",
    disabled,
    onCommit: commit(axis),
  });
  return [
    {
      id: "model3d-rotation",
      testId: "presentation-model3d-rotation",
      title: args.labels.title,
      fields: [field(0, "x", args.labels.x), field(1, "y", args.labels.y), field(2, "z", args.labels.z)],
    },
  ];
}
