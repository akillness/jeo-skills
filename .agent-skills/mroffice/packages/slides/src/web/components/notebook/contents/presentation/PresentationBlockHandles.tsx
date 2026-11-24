"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The selected block's direct-manipulation handles on the canvas (move,
 * resize, rotate, adjust).
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { MoveRight, RotateCw } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { canChangePresentationChartFrame } from "@mrnote/core/web/lib/presentation-chart-frame-operations.ts";
import { PRESENTATION_PICTURE_SIZE_STEP_EMU, type PresentationPictureSizeCommandAdapter } from "@mrnote/core/web/lib/presentation-command-adapters.ts";
import type { PresentationShapeBlock, PresentationBlock, PresentationImageBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { PointerEvent, ReactNode, RefObject } from "react";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { ResizeHandle } from "@mrnote/core/web/lib/presentation-drag.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationBlockHandlesCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  slideDesignScale: number;
  smartArtFrameRotateGrip: { ownerId: string; box: { left: number; top: number; width: number; height: number; }; transform: string | undefined; } | null;
  activeSlideBounds: { width: number; height: number; };
  pictureSizeCommandRef: RefObject<PresentationPictureSizeCommandAdapter<PresentationImageBlock, SlideModel>>;
  beginBlockGesture: (blockId: string, handle: ResizeHandle | "move", event: PointerEvent, scope?: "member" | "group") => void;
  beginRotateGesture: (blockId: string, event: PointerEvent) => void;
  presentationShapeDrawingOverlay: (block: PresentationShapeBlock) => ReactNode;
  block: PresentationBlock;
  isMultiSelected: boolean;
  nativeGroupMoveOnly: boolean;
  showResizeHandles: boolean;
  visibleResizeHandles: readonly ("n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw")[];
  /**
   * A shape of a SmartArt graphic in a 3-D scene style, not in Edit in 2-D:
   * it is selected (its frame shows) but offers no move, size or turn grip.
   */
  sceneLocked?: boolean;
  /** A straight line or connector: its two end points, and no rotation handle (PowerPoint). */
  lineEnds?: boolean;
  /** The file locks the object's turn (`noRot`): no rotation handle. */
  rotateLocked?: boolean;
}

export function PresentationBlockHandles({ ctl }: { ctl: PresentationBlockHandlesCtl }) {
  const {
    t,
    slideDesignScale,
    smartArtFrameRotateGrip,
    activeSlideBounds,
    pictureSizeCommandRef,
    beginBlockGesture,
    beginRotateGesture,
    presentationShapeDrawingOverlay,
    block,
    isMultiSelected,
    nativeGroupMoveOnly,
    showResizeHandles,
    visibleResizeHandles,
    sceneLocked = false,
    lineEnds = false,
    rotateLocked = false,
  } = ctl;
  return (
                    <>
                      {block.type !== "table" && !sceneLocked ? (
                        <div
                          className="presentation-window__drag-handle"
                          role="button"
                          tabIndex={0}
                          aria-label={t("presentation.dragBlock")}
                          title={t("presentation.dragBlock")}
                          data-testid="presentation-drag-handle"
                          onPointerDown={(event) =>
                            beginBlockGesture(block.id, "move", event)
                          }
                        >
                          <MoveRight size={12} aria-hidden="true" />
                        </div>
                      ) : null}
                      {showResizeHandles && !sceneLocked
                        ? visibleResizeHandles.map((handle) => (
                            <div
                              key={handle}
                              className={officeDrawingSelectionStyles.resize}
                              data-office-drawing-handle={handle}
                              style={{zIndex:5}}
                              role="button"
                              tabIndex={0}
                              aria-label={t(
                                `presentation.resizeHandle.${handle}` as "presentation.resizeHandle.n",
                              )}
                              title={t(
                                `presentation.resizeHandle.${handle}` as "presentation.resizeHandle.n",
                              )}
                              data-testid={`presentation-resize-handle-${handle}`}
                              onPointerDown={(event) =>
                                beginBlockGesture(block.id, handle, event)
                              }
                              onKeyDown={block.type === "image" ? (event) => {
                                const step = PRESENTATION_PICTURE_SIZE_STEP_EMU;
                                const changes: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                                const delta = changes[event.key];
                                if (!delta) return;
                                event.preventDefault();
                                event.stopPropagation();
                                const resize = pictureSizeCommandRef.current.beginResize(block.id, activeSlideBounds);
                                if (resize?.preview(handle, delta[0], delta[1], { lockAspect: event.shiftKey, fromCenter: event.altKey })) resize.commit();
                              } : undefined}
                            />
                          ))
                        : null}
                      {/* Rotate grab-handle: floats above the selection's top edge
                        (like PowerPoint). Dragging it sets `rotation` around the
                        block center; Shift snaps to 15°. Every block wears the
                        shared Office drawing rotate grip (round, with a stem);
                        its arrow is the grip's own grey ink, not the icon
                        set's accent (PowerPoint's is grey). */}
                      {

}
                      {!nativeGroupMoveOnly &&
                      !sceneLocked &&
                      !lineEnds &&
                      !rotateLocked &&
                      block.type !== "table" &&
                      // A chart is a graphic frame PowerPoint does not turn.
                      canChangePresentationChartFrame(block, "rotate") &&
                      smartArtFrameRotateGrip?.ownerId !== block.id ? (
                        <div
                          className={officeDrawingSelectionStyles.rotate}
                          role="button"
                          tabIndex={0}
                          aria-label={t("presentation.rotateHandle")}
                          title={t("presentation.rotateHandle")}
                          data-testid="presentation-rotate-handle"
                          onPointerDown={(event) =>
                            beginRotateGesture(block.id, event)
                          }
                          style={{zIndex:5}}
                        >
                          <RotateCw
                            size={9 / (slideDesignScale > 0 ? slideDesignScale : 1)}
                            color="currentColor"
                            aria-hidden="true"
                          />
                        </div>
                      ) : null}
                      {block.type === "shape" && !isMultiSelected
                        ? presentationShapeDrawingOverlay(block as PresentationShapeBlock)
                        : null}
                    </>
  );
}
