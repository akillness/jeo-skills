"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The frame drawn around a selected SmartArt graphic on the canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { OfficeSmartArtGraphicFrame } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtGraphicFrame.tsx";
import { SMARTART_FRAME_PAD_PX } from "../../../../lib/presentation/window-constants";
import { type ResizeHandle } from "@mrnote/core/web/lib/presentation-drag.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Dispatch, PointerEvent, SetStateAction } from "react";
import type { PresentationChartContextElement } from "@/lib/presentation-chart-context-element";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationSmartArtGroupFrameCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  setBlockContextMenu: Dispatch<SetStateAction<{ x: number; y: number; blockId: string | null; tableCell?: { row: number; col: number; }; smartArtTarget?: "graphic" | "shape"; textEditing?: { hasSelection: boolean; }; chartElement?: PresentationChartContextElement; } | null>>;
  setSmartArtGraphicOnly: Dispatch<SetStateAction<boolean>>;
  smartArtGroupFrame: { groupId: string; primaryId: string; bounds: { left: number; top: number; width: number; height: number; }; resizable: boolean; };
  activeSlideBounds: { width: number; height: number; };
  beginBlockGesture: (blockId: string, handle: ResizeHandle | "move", event: PointerEvent, scope?: "member" | "group") => void;
  /** The Text Pane control on the frame's left edge; null hides it (no outline to edit). */
  smartArtTextPaneOpen: boolean;
  toggleSmartArtTextPane: (() => void) | null;
}

export function PresentationSmartArtGroupFrame({ ctl }: { ctl: PresentationSmartArtGroupFrameCtl }) {
  const {
    t,
    setBlockContextMenu,
    setSmartArtGraphicOnly,
    smartArtGroupFrame,
    activeSlideBounds,
    beginBlockGesture,
    smartArtTextPaneOpen,
    toggleSmartArtTextPane,
  } = ctl;
  // The graphic frame the worksheet draws too (`OfficeSmartArtGraphicFrame`,
  // geometry from `lib/office-smartart/interaction-model`), placed on the
  // slide in its percentage space.
  return (
    <OfficeSmartArtGraphicFrame
      testIdPrefix="presentation"
      groupId={smartArtGroupFrame.groupId}
      pad={SMARTART_FRAME_PAD_PX}
      className="presentation-window__smartart-group-frame"
      zIndex={9990}
      box={{
        left: `calc(${(smartArtGroupFrame.bounds.left / activeSlideBounds.width) * 100}% - ${SMARTART_FRAME_PAD_PX}px)`,
        top: `calc(${(smartArtGroupFrame.bounds.top / activeSlideBounds.height) * 100}% - ${SMARTART_FRAME_PAD_PX}px)`,
        width: `calc(${(smartArtGroupFrame.bounds.width / activeSlideBounds.width) * 100}% + ${SMARTART_FRAME_PAD_PX * 2}px)`,
        height: `calc(${(smartArtGroupFrame.bounds.height / activeSlideBounds.height) * 100}% + ${SMARTART_FRAME_PAD_PX * 2}px)`,
      }}
      style={{
        boxSizing: "border-box",
        border: "1px dashed #686868",
        pointerEvents: "none",
      }}
      edgeLabel={t("presentation.dragBlock")}
      edgeClassName="presentation-window__smartart-frame-edge"
      edgeTabIndex={0}
      onEdgePointerDown={(_edge, event) => {
        setSmartArtGraphicOnly(true);
        beginBlockGesture(smartArtGroupFrame.primaryId, "move", event, "group");
      }}
      onEdgeContextMenu={(event) => {
        // The frame is the GRAPHIC: Office answers a right click on it with
        // the graphic's menu, not a shape's, and its Cut / Copy take the
        // graphic, so the graphic is what is selected (as the press area's
        // right click selects it).
        setSmartArtGraphicOnly(true);
        setBlockContextMenu({
          x: event.clientX,
          y: event.clientY,
          blockId: smartArtGroupFrame.primaryId,
          smartArtTarget: "graphic",
        });
      }}
      textPane={toggleSmartArtTextPane ? { open: smartArtTextPaneOpen, onToggle: toggleSmartArtTextPane } : null}
      resizable={smartArtGroupFrame.resizable}
      handleLabel={(handle) => t(`presentation.resizeHandle.${handle}` as "presentation.resizeHandle.n")}
      onHandlePointerDown={(handle, event) => {
        // The frame's handles are the GRAPHIC's, as its edges are: a press
        // on one selects the graphic (no shape keeps its handles), so the
        // Delete that follows removes the whole graphic, not the shape that
        // was selected before (Microsoft Support, "Delete a SmartArt
        // graphic or a shape in a SmartArt graphic": click the border).
        if (event.button === 0) setSmartArtGraphicOnly(true);
        beginBlockGesture(smartArtGroupFrame.primaryId, handle, event, "group");
      }}
    />
  );
}
