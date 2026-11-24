"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { RotateCw } from "./icons/houseIcons";
import { useEffect, useRef, type ComponentProps, type CSSProperties } from "react";
import { useTranslations } from "../../../host/next-intl";
import {
  mountOfficeAdjustHandles,
  mountOfficeEditPoints,
  mountOfficeFreeformDraw,
  mountOfficeShapeDraw,
  type OfficeAdjustHandlesOptions,
  type OfficeEditPointsOptions,
  type OfficeFreeformDrawOptions,
  type OfficeShapeDrawOptions,
  type OfficeOverlayClassNames,
  type OfficeOverlayController,
} from "../../lib/office-drawing-overlays";
import { RESIZE_HANDLES, type ResizeHandle } from "../../lib/presentation-drag";
import styles from "./OfficeDrawingSelection.module.css";

/** Passive PowerPoint-style selection chrome. Hosts own selection, transforms,
 * coordinates, permission checks and persistence; no editor state lives here. */
export const officeDrawingSelectionStyles = styles;
/**
 * The attribute a shape's words wear inside a `.geometryHit` element, so a
 * press on them selects the shape although the rest of its box is passed
 * through (Office hit-tests a shape by its geometry and its text).
 */
export const OFFICE_HIT_TEXT_ATTRIBUTE = "data-office-hit-text";
/**
 * The attribute a shape drawn as an HTML box (not SVG) wears inside a
 * `.geometryHit` element: the box is the shape's painted geometry.
 */
export const OFFICE_HIT_BOX_ATTRIBUTE = "data-office-hit-box";
/**
 * The attribute an invisible SVG twin of a No Fill shape's outline wears
 * inside a `.geometryHit` element: the outline is hit across a band at least
 * a few screen pixels wide (wider in touch mode), not only on its drawn
 * hairline. The twin states its line width, in the drawing's own pixels, in
 * {@link OFFICE_HIT_BAND_LINE_PROPERTY}; it takes no press anywhere else.
 */
export const OFFICE_HIT_BAND_ATTRIBUTE = "data-office-hit-band";
export const OFFICE_HIT_BAND_LINE_PROPERTY = "--office-hit-band-line";
/** The props of a hit-band twin whose drawn line is `lineWidth` px wide. */
export function officeHitBandProps(lineWidth: number) {
  return {
    fill: "none",
    stroke: "transparent",
    strokeWidth: lineWidth,
    vectorEffect: "non-scaling-stroke",
    pointerEvents: "none",
    [OFFICE_HIT_BAND_ATTRIBUTE]: "",
    style: { [OFFICE_HIT_BAND_LINE_PROPERTY]: `${Math.max(0, lineWidth)}px` } as CSSProperties,
  } as const;
}
/** Whether an SVG paint value paints nothing ("no fill" / "no line"). */
export function officePaintIsNone(paint: string | null | undefined): boolean {
  return !paint || paint === "none" || paint === "transparent";
}
export const OFFICE_DRAWING_RESIZE_HANDLES = RESIZE_HANDLES;
export type OfficeDrawingResizeHandle = ResizeHandle;

/**
 * The shortest side, in the grips' own pixels, along which a middle grip is
 * still drawn: three 8px grips (two corners and the middle one) side by side.
 */
export const OFFICE_DRAWING_EDGE_GRIP_MIN_SPAN = 24;

/**
 * The resize grips a selection frame of this size draws. PowerPoint drops a
 * side's middle grip once the frame is too short along that side for it to
 * stand clear of the corner grips (a thin bar keeps its corners and its long
 * sides' middles); a size that cannot be read keeps all eight. `width` and
 * `height` are in the same pixels the 8px grips are painted in.
 */
export function officeDrawingVisibleResizeHandles(
  width: number,
  height: number,
  handles: readonly ResizeHandle[] = RESIZE_HANDLES,
): readonly ResizeHandle[] {
  const tooNarrow = Number.isFinite(width) && width < OFFICE_DRAWING_EDGE_GRIP_MIN_SPAN;
  const tooShort = Number.isFinite(height) && height < OFFICE_DRAWING_EDGE_GRIP_MIN_SPAN;
  if (!tooNarrow && !tooShort) return handles;
  return handles.filter((handle) =>
    handle === "n" || handle === "s" ? !tooNarrow
      : handle === "e" || handle === "w" ? !tooShort
        : true);
}

/**
 * The class names the framework-free overlays paint with. Docs' node view
 * passes the same object, so all three hosts wear one look.
 */
export const OFFICE_DRAWING_OVERLAY_CLASS_NAMES: OfficeOverlayClassNames = {
  adjustLayer: styles.adjustLayer,
  adjust: styles.adjust,
  editLayer: styles.editLayer,
  editVertex: styles.editVertex,
  editHandle: styles.editHandle,
  editMenu: styles.editMenu,
  drawLayer: styles.drawLayer,
};

export function OfficeDrawingResizeGrip({handle, label, className, hitSize = 20, style, ...props}: Omit<ComponentProps<"button">, "children"> & {
  handle: ResizeHandle;
  label: string;
  hitSize?: 8 | 20;
}) {
  return <button type="button" aria-label={label} title={label}
    className={`${styles.resize} ${className ?? ""}`} data-office-drawing-handle={handle}
    style={{"--office-drawing-grip-size":`${hitSize}px`,"--office-drawing-grip-edge":hitSize === 8 ? "-5px" : "-10px",...style} as CSSProperties} {...props}/>;
}

export function OfficeDrawingRotateGrip({label, className, ...props}: Omit<ComponentProps<"button">, "children"> & {label:string}) {
  return <button type="button" aria-label={label} title={label}
    className={`${styles.rotate} ${className ?? ""}`} data-office-drawing-rotate="true" {...props}>
    <RotateCw size={9} aria-hidden="true"/>
  </button>;
}

/** Mount one framework-free overlay into a host div for the component's life. */
function useOverlay<Options>(
  mount: (host: HTMLElement, options: Options) => OfficeOverlayController<Options>,
  options: Options,
  enabled: boolean,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeOverlayController<Options> | null>(null);
  const optionsRef = useRef(options);
  // Effects run in order: the latest options are recorded before a mount reads them.
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;
    controllerRef.current = mount(host, optionsRef.current);
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [mount, enabled]);
  useEffect(() => {
    controllerRef.current?.update(options);
  });
  return hostRef;
}

const overlayHostStyle: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };

export type OfficeDrawingAdjustHandlesProps = Omit<OfficeAdjustHandlesOptions, "classNames">;

/**
 * The yellow adjustment handles of one preset shape, shared by Docs, the deck
 * and the worksheet (Office's "adjustment handle"; ECMA-376 `a:ahLst`). Hosts
 * mount it inside their selection frame over the shape's own box and persist
 * `onCommit` as the shape's `adjustments` (`a:avLst`).
 */
export function OfficeDrawingAdjustHandles(props: OfficeDrawingAdjustHandlesProps) {
  const host = useOverlay(mountOfficeAdjustHandles, { ...props, classNames: OFFICE_DRAWING_OVERLAY_CLASS_NAMES }, true);
  return <div ref={host} style={overlayHostStyle} data-office-drawing-overlay="adjust"/>;
}

export type OfficeDrawingEditPointsProps = Omit<OfficeEditPointsOptions, "classNames">;

/** Edit Points over one shape (the shared custom-geometry model). */
export function OfficeDrawingEditPoints(props: OfficeDrawingEditPointsProps) {
  const host = useOverlay(mountOfficeEditPoints, { ...props, classNames: OFFICE_DRAWING_OVERLAY_CLASS_NAMES }, true);
  return <div ref={host} style={overlayHostStyle} data-office-drawing-overlay="edit-points"/>;
}

export type OfficeFreeformDrawLayerProps = Omit<OfficeFreeformDrawOptions, "classNames">;

/** Freeform: Shape / Freeform: Scribble / Curve over a host surface. */
export function OfficeFreeformDrawLayer(props: OfficeFreeformDrawLayerProps) {
  const t = useTranslations("console-notebooks");
  const touchKeys = props.touchKeys ?? {
    finish: t("presentation.freeformFinish"),
    cancel: t("presentation.freeformCancel"),
  };
  const host = useOverlay(mountOfficeFreeformDraw, { ...props, touchKeys, classNames: OFFICE_DRAWING_OVERLAY_CLASS_NAMES }, true);
  return <div ref={host} style={{ ...overlayHostStyle, pointerEvents: "auto", zIndex: 40 }} data-office-drawing-overlay="freeform"/>;
}

export type OfficeShapeDrawLayerProps = Omit<OfficeShapeDrawOptions, "classNames">;

/**
 * A gallery shape drawn with the crosshair over a host surface (Office's
 * click-and-drag insertion): the host gets the frame and inserts.
 */
export function OfficeShapeDrawLayer(props: OfficeShapeDrawLayerProps) {
  const host = useOverlay(mountOfficeShapeDraw, { ...props, classNames: OFFICE_DRAWING_OVERLAY_CLASS_NAMES }, true);
  return <div ref={host} style={{ ...overlayHostStyle, pointerEvents: "auto", zIndex: 40 }} data-office-drawing-overlay="shape-draw"/>;
}
