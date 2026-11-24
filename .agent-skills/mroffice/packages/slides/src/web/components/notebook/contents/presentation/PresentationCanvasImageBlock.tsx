"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One picture block as the edit canvas draws it.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { CroppedImageContent, importedPptxPictureFrameStyle } from "./PresentationMediaContent";
import { labeledActionButtonStyle } from "../../../../lib/presentation/window-chrome-styles";
import { PresentationPreservedObjectNotice } from "./PresentationPreservedObjectNotice";
import { PresentationModel3dFrame } from "./PresentationModel3dFrame";
import { ImagePlus, Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  CROP_CORNERS,
  CROP_EDGES,
  type CropCorner,
  type CropEdge,
  type CropRect,
} from "@mrnote/core/web/lib/presentation-crop-group.ts";
import type { PresentationImageBlock, PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { KeyboardEvent, PointerEvent } from "react";
import type { OfficeThemeGridColors } from "@mrnote/core/web/lib/office-theme-color-grid.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCanvasImageBlockCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  cropEditingId: string | null;
  cropPreview: { blockId: string; crop: CropRect; } | null;
  replaceBlock: (blockId: string, nextBlock: PresentationBlock) => void;
  deleteBlock: (blockId: string) => void;
  selectBlockFromClick: (clickedBlockId: string, additive: boolean, preserveTextSelection?: boolean) => void;
  beginReplaceImage: (blockId: string, trigger?: HTMLElement | null) => void;
  nudgeCropHandle: (blockId: string, edge: CropEdge, event: KeyboardEvent<HTMLElement>) => void;
  beginCropGesture: (blockId: string, edge: CropEdge | CropCorner | "pan", event: PointerEvent) => void;
  block: PresentationImageBlock;
  displayedImageBlock: PresentationImageBlock | null;
  pictureSmartArtMemberId: string | null;
  pictureSmartArtReplaceDisabledReason: string | null;
  pictureSmartArtReplaceLabel: string;
  /** The deck's theme, for a picture's Recolor tile (Accent 1 Light ...). */
  deckThemeGridColors?: OfficeThemeGridColors | null;
  /** Selected, and a metafile the server could not draw: the picture itself
   * is transparent, so the frame says what is here. */
  pictureNotDrawn?: boolean;
  /** A 3-D model this browser cannot draw (no WebGL, its part unreadable):
   * what the frame says over the picture PowerPoint kept; null to say nothing. */
  model3dFailureNotice?: string | null;
}

export function PresentationCanvasImageBlock({ ctl }: { ctl: PresentationCanvasImageBlockCtl }) {
  const {
    t,
    cropEditingId,
    cropPreview,
    replaceBlock,
    deleteBlock,
    selectBlockFromClick,
    beginReplaceImage,
    nudgeCropHandle,
    beginCropGesture,
    block,
    displayedImageBlock,
    pictureSmartArtMemberId,
    deckThemeGridColors,
    pictureSmartArtReplaceDisabledReason,
    pictureSmartArtReplaceLabel,
    pictureNotDrawn,
    model3dFailureNotice,
  } = ctl;
  return (
                    <figure
                      className={
                        cropEditingId === block.id
                          ? "presentation-window__image-block presentation-window__image-block--cropping"
                          : "presentation-window__image-block"
                      }
                      data-testid="presentation-image-block"
                      data-cropping={
                        cropEditingId === block.id ? "true" : undefined
                      }
                      style={
                        hasLayoutGeometry(block)
                          ? {
                              position: "relative",
                              width: "100%",
                              height: "100%",
                            }
                          : undefined
                      }
                    >
                      <PresentationModel3dFrame
                        block={displayedImageBlock ?? block}
                        live
                        failureNotice={model3dFailureNotice}
                      >
                      <CroppedImageContent
                        block={displayedImageBlock ?? block}
                        themeColors={deckThemeGridColors}
                        fillParent={hasLayoutGeometry(block)}
                        cropOverride={
                          cropPreview && cropPreview.blockId === block.id
                            ? cropPreview.crop
                            : undefined
                        }
                        imgStyle={{
                          ...(importedPptxPictureFrameStyle(
                            displayedImageBlock ?? block,
                            hasLayoutGeometry(block),
                          ) ?? {
                            maxWidth: hasLayoutGeometry(block)
                              ? "100%"
                              : block.width
                                ? `${Math.min(block.width, 720)}px`
                                : undefined,
                          }),
                        }}
                      />
                      </PresentationModel3dFrame>
                      {pictureNotDrawn ? (
                        <PresentationPreservedObjectNotice
                          notice={{ kind: "picture", code: "metafile-not-drawn" }}
                          label={t("presentation.preservedObject.picture")}
                        />
                      ) : null}
                      {pictureSmartArtMemberId ? (
                        <button
                          type="button"
                          disabled={!!pictureSmartArtReplaceDisabledReason}
                          title={pictureSmartArtReplaceLabel}
                          aria-label={pictureSmartArtReplaceLabel}
                          data-disabled-reason={
                            pictureSmartArtReplaceDisabledReason
                              ? pictureSmartArtReplaceLabel
                              : undefined
                          }
                          data-testid="presentation-smartart-picture-replace"
                          style={{
                            ...labeledActionButtonStyle,
                            position: "absolute",
                            right: 8,
                            bottom: 8,
                            zIndex: 7,
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectBlockFromClick(block.id, false);
                            beginReplaceImage(block.id, event.currentTarget);
                          }}
                        >
                          <ImagePlus size={13} aria-hidden="true" />
                          {t("presentation.image.replace")}
                        </button>
                      ) : null}
                      {cropEditingId === block.id ? (
                        <div
                          className="presentation-window__crop-overlay"
                          data-testid="presentation-crop-overlay"
                          style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                          }}
                        >
                          {

}
                          <div
                            className="presentation-window__crop-pan"
                            aria-label={t("presentation.crop.pan")}
                            title={t("presentation.crop.pan")}
                            data-testid="presentation-crop-pan"
                            onPointerDown={(event) =>
                              beginCropGesture(block.id, "pan", event)
                            }
                          />
                          {CROP_CORNERS.map((corner) => (
                            <div
                              key={corner}
                              role="button"
                              tabIndex={-1}
                              aria-label={t(
                                `presentation.crop.handle.${corner}` as "presentation.crop.handle.top-left",
                              )}
                              title={t(
                                `presentation.crop.handle.${corner}` as "presentation.crop.handle.top-left",
                              )}
                              data-testid={`presentation-crop-handle-${corner}`}
                              className={`presentation-window__crop-handle presentation-window__crop-handle--corner presentation-window__crop-handle--${corner}`}
                              style={{ pointerEvents: "auto" }}
                              onPointerDown={(event) =>
                                beginCropGesture(block.id, corner, event)
                              }
                            />
                          ))}
                          {CROP_EDGES.map((edge) => (
                            <div
                              key={edge}
                              role="button"
                              tabIndex={0}
                              aria-label={t(
                                `presentation.crop.handle.${edge}` as "presentation.crop.handle.left",
                              )}
                              title={t(
                                `presentation.crop.handle.${edge}` as "presentation.crop.handle.left",
                              )}
                              data-testid={`presentation-crop-handle-${edge}`}
                              className={`presentation-window__crop-handle presentation-window__crop-handle--${edge}`}
                              style={{ pointerEvents: "auto" }}
                              onPointerDown={(event) =>
                                beginCropGesture(block.id, edge, event)
                              }
                              onKeyDown={(event) =>
                                nudgeCropHandle(block.id, edge, event)
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                      {!hasLayoutGeometry(block) ? (
                        <>
                          <input
                            value={block.src}
                            onChange={(event) =>
                              replaceBlock(block.id, {
                                ...block,
                                src: event.target.value,
                              } satisfies PresentationImageBlock)
                            }
                            placeholder={t("presentation.imageSrcPlaceholder")}
                            data-testid="presentation-image-src"
                          />
                          <input
                            value={block.caption || ""}
                            onChange={(event) =>
                              replaceBlock(block.id, {
                                ...block,
                                caption: event.target.value,
                              } satisfies PresentationImageBlock)
                            }
                            placeholder={t("presentation.captionPlaceholder")}
                            data-testid="presentation-image-caption"
                          />
                          <button
                            type="button"
                            onClick={() => deleteBlock(block.id)}
                            data-testid="presentation-delete-block"
                          >
                            <Trash2 size={13} />
                            {t("presentation.deleteBlock")}
                          </button>
                        </>
                      ) : null}
                    </figure>
  );
}
