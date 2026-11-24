"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The freeform and custom-geometry drawing layer over the slide canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Point } from "@mrnote/core/web/lib/presentation-polygon-points.ts";
import { withoutEscapeClause } from "@mrnote/core/web/lib/touch-copy.ts";
import { useTouchMode } from "@mrnote/core/web/lib/touch-mode.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationFreeformDrawLayerCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  activeSlideBounds: { width: number; height: number; };
  activeCustomGeometryTool: "curve" | "freeform" | "scribble";
  freeformPoints: Point[];
  cancelFreeform: () => void;
  finishFreeform: (closed?: boolean, pointsOverride?: readonly Point[]) => boolean;
}

export function PresentationFreeformDrawLayer({ ctl }: { ctl: PresentationFreeformDrawLayerCtl }) {
  const touchMode = useTouchMode();
  const {
    t,
    activeSlideBounds,
    activeCustomGeometryTool,
    freeformPoints,
    cancelFreeform,
    finishFreeform,
  } = ctl;
  return (
              <div
                data-presentation-custom-geometry-tool={
                  activeCustomGeometryTool ?? undefined
                }
                style={{ display: "contents" }}
              >
                {




}
                <div
                  data-presentation-freeform-surface="true"
                  data-testid="presentation-freeform-surface"
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 39,
                    cursor: "crosshair",
                  }}
                />
                {/* Live preview of the freeform path forming (slide-EMU viewBox,
                    non-scaling stroke). pointer-events:none so clicks fall
                    through to the canvas vertex placer. */}
                <svg
                  className="presentation-window__freeform-preview"
                  viewBox={`0 0 ${activeSlideBounds.width} ${activeSlideBounds.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 40,
                  }}
                >
                  {freeformPoints.length > 1 ? (
                    <polyline
                      points={freeformPoints
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                      fill="none"
                      stroke="var(--ppt-accent, #c43e1c)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {freeformPoints.map((p, index) => (
                    <circle
                      key={index}
                      cx={p.x}
                      cy={p.y}
                      r={
                        Math.max(
                          activeSlideBounds.width,
                          activeSlideBounds.height,
                        ) * 0.006
                      }
                      fill="var(--ppt-accent, #c43e1c)"
                    />
                  ))}
                </svg>
                <div
                  className="presentation-window__freeform-bar"
                  style={{
                    position: "absolute",
                    top: 8,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 41,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span
                    data-testid="presentation-freeform-count"
                    style={{ fontSize: 12 }}
                  >
                    {(touchMode ? withoutEscapeClause : String)(
                      t(
                        activeCustomGeometryTool === "curve"
                          ? "presentation.curveHint"
                          : activeCustomGeometryTool === "scribble"
                            ? "presentation.scribbleHint"
                            : "presentation.freeformHint",
                      ),
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => finishFreeform(false)}
                    disabled={freeformPoints.length < 2}
                    data-testid="presentation-freeform-finish"
                  >
                    {t("presentation.freeformFinish")}
                  </button>
                  <button
                    type="button"
                    onClick={cancelFreeform}
                    data-testid="presentation-freeform-cancel"
                  >
                    {t("presentation.freeformCancel")}
                  </button>
                </div>
              </div>
  );
}
