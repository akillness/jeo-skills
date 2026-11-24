"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type {
  PdfNativeVectorSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-inspection";
import {
  filledVectorsOverImages,
  unroutedVectorsInFrontOfTargets,
} from "../../../../../lib/pdf/native-target-stacking";
import type { PdfVectorContentItem } from "../../../../../lib/pdf/vector-content-inventory";
import type { PdfNativeImageTarget } from "./nativeImageTarget";
import { nativeVectorHitBounds, nativeVectorLineHitClipPath } from "./nativeVectorGeometry";

export function nativeVectorSelectionKey(
  route: Pick<
    PdfNativeVectorSelectionRoute,
    "pageNumber" | "rendererOperatorIndex" | "proofId"
  >,
): string {
  return `${route.pageNumber}:${route.rendererOperatorIndex}:${route.proofId}`;
}

export type PdfNativeVectorTargetHandler = (
  route: PdfNativeVectorSelectionRoute,
  event: ReactMouseEvent<HTMLButtonElement>,
) => void;

/** One page's vector targets. A table page routes every rule as its own
 * target -- two thousand buttons on a grade table -- and rebuilding them on
 * each viewer render (every keystroke of a text edit renders the viewer)
 * held the main thread for seconds: the edit box, its preview and the
 * pointer all lagged behind the text. The layer renders again only when its
 * routes, the selection or the label change. */
/** Development timing marks for the vector-route pipeline (session start,
 * worker ready, operator list, routed page), read by the headless feel
 * walkthrough to see where a save's route rebuild spends its time. */
export const vectorRouteMark: (label: string, detail?: Record<string, unknown>) => void =
  process.env.NODE_ENV === "production"
    ? () => {}
    : (label, detail) => {
        console.debug(
          "[pdf-vector-routes]",
          label,
          Math.round(performance.now()),
          detail ?? "",
        );
      };

export const PdfNativeVectorTargetLayer = memo(function PdfNativeVectorTargetLayer({
  routes,
  selectedKeys,
  label,
  onActivate,
  onContextMenu,
  onRest,
  items,
  blockedLabel,
  placing = false,
}: {
  readonly routes: readonly PdfNativeVectorSelectionRoute[];
  readonly selectedKeys: ReadonlySet<string>;
  readonly label: string;
  readonly onActivate: PdfNativeVectorTargetHandler;
  readonly onContextMenu: PdfNativeVectorTargetHandler;
  /** The pointer has rested on a target for a moment (not just passed over
   * it): what a press that follows will need can be made ready. */
  readonly onRest?: (route: PdfNativeVectorSelectionRoute) => void;
  /** The page's renderer inventory: a stroked shape's target covers the
   * stroke it paints (see nativeVectorHitBounds). */
  readonly items?: readonly PdfVectorContentItem[];
  

  readonly blockedLabel?: string;
  /** A tool that places something on the page is armed (Insert Text): its
   * click lands where it is made, over a shape too, as in WPS. */
  readonly placing?: boolean;
}) {
  const restTimerRef = useRef<number | null>(null);
  // Shapes in front of a target that are not targets themselves: each
  // covers what the page shows of it, in paint order with the targets, so a
  // click on it selects nothing instead of the target behind it.
  const shields = useMemo(
    () => unroutedVectorsInFrontOfTargets(items, routes),
    [items, routes],
  );
  const paintOrder = useMemo(() => {
    if (shields.length === 0) return null;
    return [
      ...routes.map((route) => ({ at: route.rendererOperatorIndex, route, shield: null })),
      ...shields.map((shield) => ({ at: shield.operatorIndex, route: null, shield })),
    ].sort((a, b) => a.at - b.at);
  }, [routes, shields]);
  const cancelRest = () => {
    if (restTimerRef.current !== null) window.clearTimeout(restTimerRef.current);
    restTimerRef.current = null;
  };
  useEffect(() => cancelRest, []);
  const shieldElement = (shield: (typeof shields)[number]) => (
    <span
      key={`shield:${shield.operatorIndex}`}
      aria-hidden
      data-pdf-native-vector-blocked
      data-testid="pdf-native-content-vector-blocked"
      data-native-vector-operator={shield.operatorIndex}
      title={blockedLabel}
      style={{
        position: "absolute",
        left: `${shield.bounds.x * 100}%`,
        top: `${shield.bounds.y * 100}%`,
        width: `${shield.bounds.width * 100}%`,
        height: `${shield.bounds.height * 100}%`,
        cursor: "default",
        pointerEvents: "auto",
      }}
      // The press itself reaches the page, which lets the selection go (a
      // click away); the click goes no further, as a target's does not.
      onClick={(event) => event.stopPropagation()}
    />
  );
  const routeButton = (route: PdfNativeVectorSelectionRoute) => {
        const key = nativeVectorSelectionKey(route);
        const box = nativeVectorHitBounds(route, items);
        
        const lineClip = nativeVectorLineHitClipPath(route, items, box);
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={selectedKeys.has(key)}
            className="pdf-viewer__native-vector-target"
            data-testid="pdf-native-content-vector-select"
            data-native-vector-proof-family={route.proofFamily}
            data-native-vector-kind={route.nativeKind}
            data-native-vector-operator={route.rendererOperatorIndex}
            onPointerEnter={
              onRest
                ? () => {
                    cancelRest();
                    restTimerRef.current = window.setTimeout(() => {
                      restTimerRef.current = null;
                      onRest(route);
                    }, 50);
                  }
                : undefined
            }
            onPointerLeave={onRest ? cancelRest : undefined}
            onPointerDown={
              onRest
                ? () => {
                    cancelRest();
                    onRest(route);
                  }
                : undefined
            }
            style={{
              position: "absolute",
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
              minWidth: 4,
              minHeight: 4,
              margin: 0,
              padding: 0,
              // The frame is the stylesheet's: a dashed outline while idle,
              // solid on hover and when selected, the same language as the
              // text targets, so an editable vector reads as one before it
              // is clicked.
              border: 0,
              borderRadius: 2,
              background: "transparent",
              boxSizing: "border-box",
              cursor: "pointer",
              pointerEvents: "auto",
              ...(lineClip ? { clipPath: lineClip } : {}),
            }}
            data-native-vector-line-hit={lineClip ? "stroke" : undefined}
            title={label}
            onContextMenu={(event) => onContextMenu(route, event)}
            onClick={(event) => onActivate(route, event)}
          />
        );
  };
  return (
    <div
      data-pdf-native-content-vector-layer
      data-testid="pdf-native-content-vector-layer"
      data-pdf-placing={placing ? "true" : undefined}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none",
      }}
    >
      {paintOrder
        ? paintOrder.map((entry) =>
            entry.route ? routeButton(entry.route) : shieldElement(entry.shield!),
          )
        : routes.map(routeButton)}
    </div>
  );
});
export type PdfNativeImageTargetHandler = (
  target: PdfNativeImageTarget,
  event: ReactMouseEvent<HTMLButtonElement>,
) => void;
export const EMPTY_NATIVE_IMAGE_TARGETS: readonly PdfNativeImageTarget[] =
  Object.freeze([]);

/** The select tool's image targets. They sit over the vector targets: a logo
 * is usually painted over a background rectangle of its own size, and a click
 * on the picture has to pick the picture, not the rectangle beneath it (which
 * then resized under the logo while the picture stayed put). The click hands
 * the image to the embedded-image editor, which owns its move, resize, crop,
 * rotate and replace. */
export const PdfNativeImageTargetLayer = memo(function PdfNativeImageTargetLayer({
  targets,
  label,
  onActivate,
  onImageContextMenu,
  vectorRoutes,
  selectedVectorKeys,
  vectorLabel,
  onActivateVector,
  onVectorContextMenu,
  onVectorRest,
  placing = false,
}: {
  readonly targets: readonly PdfNativeImageTarget[];
  readonly label: string;
  readonly onActivate: PdfNativeImageTargetHandler;
  /** Right-click on a picture: it is selected and its menu opens (WPS). */
  readonly onImageContextMenu?: PdfNativeImageTargetHandler;
  

  readonly vectorRoutes?: readonly PdfNativeVectorSelectionRoute[];
  readonly selectedVectorKeys?: ReadonlySet<string>;
  readonly vectorLabel?: string;
  readonly onActivateVector?: PdfNativeVectorTargetHandler;
  readonly onVectorContextMenu?: PdfNativeVectorTargetHandler;
  readonly onVectorRest?: (route: PdfNativeVectorSelectionRoute) => void;
  /** As the vector layer's: a placing tool's click goes through. */
  readonly placing?: boolean;
}) {
  // Pictures and the shapes in front of them, in the order the page paints
  // them: a later sibling takes the click where two overlap.
  const stacked = useMemo(() => {
    const front =
      vectorRoutes && onActivateVector
        ? filledVectorsOverImages(vectorRoutes, targets)
        : [];
    if (front.length === 0) return null;
    return [
      ...targets.map((target) => ({
        at: target.operatorIndex ?? -1,
        target,
        route: null,
      })),
      ...front.map((route) => ({
        at: route.rendererOperatorIndex,
        target: null,
        route,
      })),
    ].sort((a, b) => a.at - b.at);
  }, [onActivateVector, targets, vectorRoutes]);
  const frontVectorButton = (route: PdfNativeVectorSelectionRoute) => {
    const key = nativeVectorSelectionKey(route);
    return (
      <button
        key={`vector:${key}`}
        type="button"
        // The shape's own target, in the vector layer, is the one assistive
        // technology and the keyboard reach; this one only takes the pointer
        // where the picture's target would otherwise cover it.
        aria-hidden
        tabIndex={-1}
        className="pdf-viewer__native-vector-target"
        data-testid="pdf-native-content-vector-select-front"
        data-native-vector-operator={route.rendererOperatorIndex}
        aria-pressed={selectedVectorKeys?.has(key) ?? false}
        onPointerDown={onVectorRest ? () => onVectorRest(route) : undefined}
        style={{
          position: "absolute",
          left: `${route.bounds.x * 100}%`,
          top: `${route.bounds.y * 100}%`,
          width: `${route.bounds.width * 100}%`,
          height: `${route.bounds.height * 100}%`,
          minWidth: 4,
          minHeight: 4,
          margin: 0,
          padding: 0,
          border: 0,
          borderRadius: 2,
          background: "transparent",
          boxSizing: "border-box",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
        title={vectorLabel}
        onContextMenu={(event) => onVectorContextMenu?.(route, event)}
        onClick={(event) => onActivateVector?.(route, event)}
      />
    );
  };
  const imageButton = (target: PdfNativeImageTarget) => (
    <button
      key={target.order}
      type="button"
      aria-label={label}
      className="pdf-viewer__native-vector-target"
      data-testid="pdf-native-content-image-select"
      data-native-image-order={target.order}
      data-native-image-source={target.sourceSha256?.slice(0, 12)}
      style={{
        position: "absolute",
        left: `${target.bounds.x * 100}%`,
        top: `${target.bounds.y * 100}%`,
        width: `${target.bounds.width * 100}%`,
        height: `${target.bounds.height * 100}%`,
        minWidth: 4,
        minHeight: 4,
        margin: 0,
        padding: 0,
        border: 0,
        borderRadius: 2,
        background: "transparent",
        boxSizing: "border-box",
        cursor: "pointer",
        pointerEvents: "auto",
      }}
      title={label}
      onContextMenu={
        onImageContextMenu
          ? (event) => onImageContextMenu(target, event)
          : undefined
      }
      onClick={(event) => onActivate(target, event)}
    />
  );
  return (
    <div
      data-pdf-native-content-image-layer
      data-testid="pdf-native-content-image-layer"
      data-pdf-placing={placing ? "true" : undefined}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none",
      }}
    >
      {stacked
        ? stacked.map((entry) =>
            entry.route
              ? frontVectorButton(entry.route)
              : imageButton(entry.target),
          )
        : targets.map(imageButton)}
    </div>
  );
});
