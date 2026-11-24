"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The rotate grip of a selected SmartArt member on the canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { RotateCw } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { PointerEvent } from "react";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationSmartArtMemberRotateGripCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  slideDesignScale: number;
  smartArtFrameRotateGrip: { ownerId: string; box: { left: number; top: number; width: number; height: number; }; transform: string | undefined; };
  activeSlideBounds: { width: number; height: number; };
  beginRotateGesture: (blockId: string, event: PointerEvent) => void;
}

export function PresentationSmartArtMemberRotateGrip({ ctl }: { ctl: PresentationSmartArtMemberRotateGripCtl }) {
  const {
    t,
    slideDesignScale,
    smartArtFrameRotateGrip,
    activeSlideBounds,
    beginRotateGesture,
  } = ctl;
  return (
              <div
                data-testid="presentation-smartart-member-rotate-anchor"
                data-owner-id={smartArtFrameRotateGrip.ownerId}
                style={{
                  position: "absolute",
                  left: `${(smartArtFrameRotateGrip.box.left / activeSlideBounds.width) * 100}%`,
                  top: `${(smartArtFrameRotateGrip.box.top / activeSlideBounds.height) * 100}%`,
                  width: `${(smartArtFrameRotateGrip.box.width / activeSlideBounds.width) * 100}%`,
                  height: `${(smartArtFrameRotateGrip.box.height / activeSlideBounds.height) * 100}%`,
                  transform: smartArtFrameRotateGrip.transform,
                  transformOrigin: "50% 50%",
                  pointerEvents: "none",
                  zIndex: 9991,
                }}
              >
                <div
                  className={officeDrawingSelectionStyles.rotate}
                  role="button"
                  tabIndex={0}
                  aria-label={t("presentation.rotateHandle")}
                  title={t("presentation.rotateHandle")}
                  data-testid="presentation-rotate-handle"
                  onPointerDown={(event) =>
                    beginRotateGesture(smartArtFrameRotateGrip.ownerId, event)
                  }
                >
                  <RotateCw
                    size={9 / (slideDesignScale > 0 ? slideDesignScale : 1)}
                    color="currentColor"
                    aria-hidden="true"
                  />
                </div>
              </div>
  );
}
