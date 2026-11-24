"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The drawing guides overlay over the slide canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import type { SnapGuide } from "@mrnote/core/web/lib/presentation-align.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationGuidesOverlayCtl {
  activeSlideBounds: { width: number; height: number; };
  staticCenterGuides: SnapGuide[];
}

export function PresentationGuidesOverlay({ ctl }: { ctl: PresentationGuidesOverlayCtl }) {
  const {
    activeSlideBounds,
    staticCenterGuides,
  } = ctl;
  return (
              <div
                className={presentationChrome.guidesOverlay}
                data-testid="presentation-guides-overlay"
                aria-hidden="true"
              >
                {staticCenterGuides.map((guide) => {
                  const vertical = guide.orientation === "vertical";
                  const percent = vertical
                    ? (guide.position / activeSlideBounds.width) * 100
                    : (guide.position / activeSlideBounds.height) * 100;
                  return (
                    <div
                      key={`static-guide-${guide.orientation}`}
                      className={
                        vertical
                          ? presentationChrome.guideVertical
                          : presentationChrome.guideHorizontal
                      }
                      data-testid="presentation-guide-line"
                      data-orientation={guide.orientation}
                      data-position-emu={guide.position}
                      style={
                        vertical
                          ? { left: `${percent}%` }
                          : { top: `${percent}%` }
                      }
                    />
                  );
                })}
              </div>
  );
}
