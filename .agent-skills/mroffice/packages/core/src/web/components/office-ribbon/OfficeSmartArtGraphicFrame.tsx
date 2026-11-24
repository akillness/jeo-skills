"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The selected SmartArt graphic's frame, as the slide and the worksheet draw
 * it: a border round the graphic frame with four move strips straddling it,
 * Office's Text Pane control on its left edge, and eight sizing grips. The
 * geometry -- the strips outside the graphic's own press area, how they stack
 * -- is `lib/office-smartart/interaction-model`'s; the host places the frame
 * (its box, in its own coordinate space) and owns what a press does.
 */

import type { CSSProperties, MouseEvent, PointerEvent } from "react";

import { OfficeDrawingResizeGrip, officeDrawingSelectionStyles } from "./OfficeDrawingSelection";
import { OfficeSmartArtTextPaneToggle } from "./OfficeSmartArtTextPaneToggle";
import {
  SMARTART_FRAME_EDGES,
  SMARTART_FRAME_PAD_PX,
  smartArtFrameChrome,
  type SmartArtFrameEdge,
} from "../../lib/office-smartart/interaction-model";
import { RESIZE_HANDLES, type ResizeHandle } from "../../lib/presentation-drag";

export interface OfficeSmartArtGraphicFrameProps {
  /** `presentation` / `spreadsheet`: the prefix of every test id. */
  readonly testIdPrefix: string;
  /** The frame's own box, already padded out by `pad` (host units/CSS). */
  readonly box: Pick<CSSProperties, "left" | "top" | "width" | "height">;
  readonly pad?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly zIndex?: number;
  /** Extra attributes on the frame element (`data-*`). */
  readonly attributes?: Readonly<Record<string, string | undefined>>;
  readonly groupId: string;
  /** The strips' accessible name ("drag to move"). */
  readonly edgeLabel: string;
  readonly edgeClassName?: string;
  readonly edgeTabIndex?: number;
  readonly onEdgePointerDown: (edge: SmartArtFrameEdge, event: PointerEvent<HTMLElement>) => void;
  /** A right click on the border: the GRAPHIC's menu. */
  readonly onEdgeContextMenu: (event: MouseEvent<HTMLElement>) => void;
  /** The Text Pane control; null when the graphic has no outline to edit. */
  readonly textPane: { readonly open: boolean; readonly onToggle: () => void } | null;
  /** Whether the grips are offered (a locked or read-only graphic has none). */
  readonly resizable: boolean;
  readonly handleLabel: (handle: ResizeHandle) => string;
  /** The grip's test id suffix in this host's spelling (`nw`, `north-west` …). */
  readonly handleTestId?: (handle: ResizeHandle) => string;
  readonly onHandlePointerDown: (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => void;
}

export function OfficeSmartArtGraphicFrame(props: OfficeSmartArtGraphicFrameProps) {
  const pad = props.pad ?? SMARTART_FRAME_PAD_PX;
  const chrome = smartArtFrameChrome(pad);
  return (
    <div
      className={props.className ?? officeDrawingSelectionStyles.frame}
      data-testid={`${props.testIdPrefix}-smartart-group-frame`}
      data-group-id={props.groupId}
      {...props.attributes}
      style={{
        position: "absolute",
        ...props.box,
        ...(props.zIndex !== undefined ? { zIndex: props.zIndex } : {}),
        ...props.style,
      }}
    >
      {props.textPane ? (
        <OfficeSmartArtTextPaneToggle
          open={props.textPane.open}
          onToggle={props.textPane.onToggle}
          testId={`${props.testIdPrefix}-smartart-text-pane-toggle`}
        />
      ) : null}
      {SMARTART_FRAME_EDGES.map((edge) => (
        <div
          key={edge}
          role="button"
          tabIndex={props.edgeTabIndex ?? -1}
          aria-label={props.edgeLabel}
          title={props.edgeLabel}
          data-testid={`${props.testIdPrefix}-smartart-group-edge-${edge}`}
          className={props.edgeClassName}
          style={{
            position: "absolute",
            pointerEvents: "auto",
            cursor: "move",
            touchAction: "none",
            ...chrome.edges[edge],
          }}
          onPointerDown={(event) => props.onEdgePointerDown(edge, event)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onEdgeContextMenu(event);
          }}
        />
      ))}
      {props.resizable
        ? RESIZE_HANDLES.map((handle) => (
            <OfficeDrawingResizeGrip
              key={handle}
              handle={handle}
              label={props.handleLabel(handle)}
              data-testid={`${props.testIdPrefix}-smartart-group-handle-${props.handleTestId?.(handle) ?? handle}`}
              onPointerDown={(event) => props.onHandlePointerDown(handle, event)}
            />
          ))
        : null}
    </div>
  );
}
