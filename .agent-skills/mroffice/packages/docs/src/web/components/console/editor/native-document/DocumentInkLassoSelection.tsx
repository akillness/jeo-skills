"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { OfficeInkLassoSelection } from "@mrnote/core/web/components/office-ribbon/OfficeInkLassoSelection.tsx";
import type { OfficeTouchCommand } from "@mrnote/core/web/components/office-ribbon/OfficeTouchCommandBar.tsx";
import {
  anchorInkLassoLoop,
  followInkLassoPointer,
  inkLassoUnionBox,
  placeInkLassoLoop,
  translateInkLassoBox,
  type InkLassoBox,
  type InkLassoHandle,
} from "@mrnote/core/web/lib/office-ink-lasso-selection.ts";
import { applyMultiResize } from "@mrnote/core/web/lib/presentation-multi-transform.ts";

import { surfaceLayout } from "./DocumentInkSurface";
import { liftSheetsDuringDrag } from "@mrnote/core/web/components/console/editor/native-document/dragSheetLift.ts";
import { documentShapeEmuToPx } from "@mrnote/core/web/lib/document-shapes.ts";
import {
  documentShapeClientRectAt,
  documentShapeElementAt,
  documentShapeLassoSelection,
  documentShapeMultiSelectionKey,
  moveDocumentShapesBy,
  previewDocumentInkScale,
  transformDocumentShapes,
} from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";
import { documentViewScale } from "@mrnote/core/web/components/console/editor/native-document/documentObjectResize.ts";
import { officeTurnAround } from "@mrnote/core/web/lib/office-object-frame.ts";
import { beginDocumentLiveGesture } from "@mrnote/core/web/components/console/editor/native-document/documentLiveTransform.ts";

interface Placement {
  readonly host: HTMLElement;
  /** No page column (a bare editor): the frame stands over the viewport. */
  readonly fixed: boolean;
  readonly space: { readonly width: number; readonly height: number };
  /** Client pixels to the host's own pixels. */
  readonly toSpace: (rect: DOMRect) => InkLassoBox;
  readonly hostScale: { readonly x: number; readonly y: number };
}

function placementFor(editor: Editor): Placement | null {
  const { host } = surfaceLayout(editor.view);
  if (!host) {
    const body = editor.view.dom.ownerDocument.body;
    return {
      host: body,
      fixed: true,
      space: { width: window.innerWidth, height: window.innerHeight },
      toSpace: (rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }),
      hostScale: { x: 1, y: 1 },
    };
  }
  const hostRect = host.getBoundingClientRect();
  const { scaleX, scaleY } = documentViewScale(host);
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  return {
    host,
    fixed: false,
    space: { width: host.clientWidth, height: host.clientHeight },
    toSpace: (rect) => ({
      left: (rect.left - hostRect.left) / sx - host.clientLeft,
      top: (rect.top - hostRect.top) / sy - host.clientTop,
      width: rect.width / sx,
      height: rect.height / sy,
    }),
    hostScale: { x: sx, y: sy },
  };
}

interface Measured {
  readonly placement: Placement;
  readonly positions: readonly number[];
  readonly box: InkLassoBox;
  readonly loop: ReturnType<typeof placeInkLassoLoop>;
}

/**
 * Docs' adapter for the shared lasso selection (OfficeInkLassoSelection):
 * the strokes Draw ▸ Lasso Select took wear one frame, drawn in the page
 * column over the pages, and the loop stays drawn around them. A press
 * inside the frame moves them all, a corner grip scales them all (one Undo
 * step each); a click elsewhere, Escape or another tool ends the selection
 * (the multi-selection plugin drops the lasso with it).
 */
export function DocumentInkLassoSelection({
  editor,
  inkArmed,
  label,
  handleLabel,
  rotateLabel,
  commands,
  commandsLabel,
}: {
  readonly editor: Editor;
  /** A pen, the eraser or the lasso picked again: the selection ends. */
  readonly inkArmed: boolean;
  readonly label: string;
  readonly handleLabel: (handle: InkLassoHandle) => string;
  readonly rotateLabel?: string;
  /** What a tap inside the frame offers (OfficeInkLassoSelection). */
  readonly commands?: () => readonly OfficeTouchCommand[];
  readonly commandsLabel?: string;
}) {
  const [measured, setMeasured] = useState<Measured | null>(null);
  // While a press drags or scales the strokes, the frame shows where they go.
  const [preview, setPreview] = useState<InkLassoBox | null>(null);
  // The turn a rotation shows while the grip is dragged (degrees).
  const [turn, setTurn] = useState(0);

  const measure = useCallback(() => {
    if (editor.isDestroyed) {
      setMeasured(null);
      return;
    }
    const lasso = documentShapeLassoSelection(editor.state);
    const placement = lasso ? placementFor(editor) : null;
    if (!lasso || !placement) {
      setMeasured(null);
      return;
    }
    const box = inkLassoUnionBox(
      lasso.positions.flatMap((pos) => {
        const rect = documentShapeClientRectAt(editor.view, pos);
        return rect ? [placement.toSpace(rect)] : [];
      }),
    );
    if (!box) {
      setMeasured(null);
      return;
    }
    setMeasured({ placement, positions: lasso.positions, box, loop: placeInkLassoLoop(lasso.loop, box) });
  }, [editor]);

  useEffect(() => {
    // The document lays out after a transaction: measure once it has.
    let frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const onTransaction = () => {
      measure();
      schedule();
    };
    editor.on("transaction", onTransaction);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      editor.off("transaction", onTransaction);
      window.removeEventListener("resize", schedule);
    };
  }, [editor, measure]);

  const dismiss = useCallback(() => {
    if (editor.isDestroyed || !documentShapeLassoSelection(editor.state)) return;
    const { state } = editor;
    // The caret goes beside the stroke that was the editor's selection.
    const at = state.selection.from;
    const $at = state.doc.resolve(Math.max(0, Math.min(state.doc.content.size, at)));
    const caret = TextSelection.findFrom($at, -1, true) ?? TextSelection.findFrom($at, 1, true);
    let transaction = state.tr.setMeta(documentShapeMultiSelectionKey, { positions: [], lasso: null });
    if (caret) transaction = transaction.setSelection(caret);
    editor.view.dispatch(transaction);
  }, [editor]);

  useEffect(() => {
    if (inkArmed) dismiss();
  }, [dismiss, inkArmed]);

  // A press on the page outside the frame ends the selection, whatever
  // presses: the editor's own click does it for a mouse, but a Pencil's tap
  // on the paper is taken by the system's handwriting before the page hears
  
  // Presses on the frame, its grips and its menu are the selection's own;
  // the ribbon and the palette stand outside the page and leave it.
  const host = measured ? (measured.placement.fixed ? editor.view.dom : measured.placement.host) : null;
  useEffect(() => {
    if (!host) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !host.contains(target)) return;
      if (target.closest('[data-testid="document-ink-lasso-selection"], [data-ink-lasso-commands="true"]')) return;
      dismiss();
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [dismiss, host]);

  const pressBody = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = measured;
      if (!current || !editor.isEditable) return;
      event.preventDefault();
      const scale = documentViewScale(editor.view.dom);
      const scaleX = scale.scaleX || 1;
      const scaleY = scale.scaleY || 1;
      // Each stroke previews from where it is painted, as a shape dragged
      // with others does (documentShapeExtension); all are written at the end.
      const strokes = current.positions.flatMap((pos) => {
        const element = documentShapeElementAt(editor.view, pos);
        return element
          ? [{ element, left: Number.parseFloat(element.style.marginLeft) || 0, top: Number.parseFloat(element.style.marginTop) || 0 }]
          : [];
      });
      const restore = () => {
        for (const stroke of strokes) {
          stroke.element.style.marginLeft = `${stroke.left}px`;
          stroke.element.style.marginTop = `${stroke.top}px`;
        }
      };
      // Drawn over the next page while they are carried across a seam.
      const lift = liftSheetsDuringDrag(strokes.map((stroke) => stroke.element));
      // The others see the strokes go with the hand (documentLiveTransform).
      const live = beginDocumentLiveGesture(editor.view, current.positions);
      followInkLassoPointer(event, {
        onMove: (dx, dy) => {
          lift.follow(dy);
          for (const stroke of strokes) {
            stroke.element.style.marginLeft = `${stroke.left + dx / scaleX}px`;
            stroke.element.style.marginTop = `${stroke.top + dy / scaleY}px`;
          }
          live.offset(dx / scaleX, dy / scaleY);
          setPreview(
            translateInkLassoBox(current.box, dx / current.placement.hostScale.x, dy / current.placement.hostScale.y),
          );
        },
        onEnd: (dx, dy, cancelled) => {
          setPreview(null);
          lift.lower();
          // Measured where they stand, not where the preview drew them: a
          // stroke the move takes onto another page is landed again from
          // its drawing (floatReanchor), and read off the preview it went
          // twice as far.
          restore();
          const moved =
            !cancelled &&
            (dx !== 0 || dy !== 0) &&
            !editor.isDestroyed &&
            moveDocumentShapesBy(editor.view, current.positions, dx / scaleX, dy / scaleY);
          if (!moved) restore();
          live.end();
          if (!editor.isDestroyed) editor.view.focus();
        },
      });
    },
    [editor, measured],
  );

  const pressHandle = useCallback(
    (handle: InkLassoHandle, event: ReactPointerEvent<HTMLElement>) => {
      const current = measured;
      if (!current || !editor.isEditable) return;
      const scale = documentViewScale(editor.view.dom);
      const scaleX = scale.scaleX || 1;
      const scaleY = scale.scaleY || 1;
      // Every stroke's painted box in document pixels, scaled together about
      // the frame's opposite corner (the deck's multi-selection resize).
      const strokes = current.positions.flatMap((pos) => {
        const element = documentShapeElementAt(editor.view, pos);
        const node = editor.state.doc.nodeAt(pos);
        if (!element || !node) return [];
        const rect = element.getBoundingClientRect();
        return [
          {
            pos,
            element,
            transform: element.style.transform,
            offsetWidth: element.offsetWidth,
            offsetHeight: element.offsetHeight,
            widthPx: documentShapeEmuToPx(Number(node.attrs.widthEmu) || 0),
            heightPx: documentShapeEmuToPx(Number(node.attrs.heightEmu) || 0),
            startGeom: {
              left: rect.left / scaleX,
              top: rect.top / scaleY,
              width: Math.max(1, rect.width / scaleX),
              height: Math.max(1, rect.height / scaleY),
            },
          },
        ];
      });
      if (strokes.length === 0) return;
      const members = strokes.map((stroke) => ({ blockId: String(stroke.pos), startGeom: stroke.startGeom }));
      // Each stroke's box as the others see it scale: moved by its corner's
      // offset, sized by the frame's factor (documentLiveTransform).
      const live = beginDocumentLiveGesture(editor.view, strokes.map((stroke) => stroke.pos));
      const unbounded = { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
      let latest: Map<string, { left: number; top: number; width: number; height: number }> | null = null;
      // Each stroke is drawn as the commit will write it: moved, sized and
      // its line scaled (previewDocumentInkScale), once a frame. A CSS
      // stretch of the old drawing drew the line wider one way than the
      // other, and it jumped when the hand lifted.
      let frame = 0;
      const draw = () => {
        frame = 0;
        const scaled = latest;
        if (!scaled) return;
        for (const stroke of strokes) {
          const next = scaled.get(String(stroke.pos));
          if (!next) continue;
          const start = stroke.startGeom;
          stroke.element.style.transform =
            `translate(${next.left - start.left}px, ${next.top - start.top}px) ${stroke.transform}`.trim();
          previewDocumentInkScale(stroke.element, {
            widthPx: stroke.widthPx * (next.width / start.width),
            heightPx: stroke.heightPx * (next.height / start.height),
          });
        }
      };
      const restore = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const stroke of strokes) {
          stroke.element.style.transform = stroke.transform;
          previewDocumentInkScale(stroke.element, null);
        }
      };
      followInkLassoPointer(event, {
        onMove: (dx, dy, moveEvent) => {
          const scaled = applyMultiResize(members, handle, dx / scaleX, dy / scaleY, unbounded, {
            maintainAspect: moveEvent.shiftKey,
            minSize: 4,
          });
          latest = scaled;
          if (!frame) frame = requestAnimationFrame(draw);
          live.move(
            strokes.flatMap((stroke) => {
              const next = scaled.get(String(stroke.pos));
              if (!next) return [];
              const start = stroke.startGeom;
              return [
                {
                  pos: stroke.pos,
                  x: next.left - start.left,
                  y: next.top - start.top,
                  w: stroke.offsetWidth * (next.width / start.width),
                  h: stroke.offsetHeight * (next.height / start.height),
                },
              ];
            }),
          );
          const box = inkLassoUnionBox(
            [...scaled.values()].map((geom) => ({
              left: geom.left * scaleX,
              top: geom.top * scaleY,
              width: geom.width * scaleX,
              height: geom.height * scaleY,
            })).map((client) =>
              current.placement.toSpace(new DOMRect(client.left, client.top, client.width, client.height)),
            ),
          );
          setPreview(box);
        },
        onEnd: (_dx, _dy, cancelled) => {
          setPreview(null);
          const scaled = latest;
          if (cancelled || !scaled || editor.isDestroyed) {
            restore();
            live.end();
            return;
          }
          // The commit draws each stroke from its new attrs in this same
          // task; drawn back as it was first, it flashed its old size.
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          for (const stroke of strokes) stroke.element.style.transform = stroke.transform;
          const scaledAll = transformDocumentShapes(
            editor.view,
            strokes.flatMap((stroke) => {
              const next = scaled.get(String(stroke.pos));
              if (!next) return [];
              const start = stroke.startGeom;
              return [
                {
                  pos: stroke.pos,
                  dxPx: next.left - start.left,
                  dyPx: next.top - start.top,
                  widthPx: stroke.widthPx * (next.width / start.width),
                  heightPx: stroke.heightPx * (next.height / start.height),
                },
              ];
            }),
          );
          if (!scaledAll) restore();
          live.end();
          editor.view.focus();
        },
      });
    },
    [editor, measured],
  );

  const pressRotate = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = measured;
      if (!current || !editor.isEditable) return;
      const scale = documentViewScale(editor.view.dom);
      const scaleX = scale.scaleX || 1;
      const scaleY = scale.scaleY || 1;
      const strokes = current.positions.flatMap((pos) => {
        const element = documentShapeElementAt(editor.view, pos);
        const node = editor.state.doc.nodeAt(pos);
        if (!element || !node) return [];
        return [
          {
            pos,
            element,
            rect: element.getBoundingClientRect(),
            rotation: Number(node.attrs.rotation) || 0,
            widthPx: documentShapeEmuToPx(Number(node.attrs.widthEmu) || 0),
            heightPx: documentShapeEmuToPx(Number(node.attrs.heightEmu) || 0),
            saved: { rotate: element.style.rotate, origin: element.style.transformOrigin },
          },
        ];
      });
      if (strokes.length === 0) return;
      // The strokes turn together about the frame's centre (client pixels).
      const union = inkLassoUnionBox(strokes.map((stroke) => stroke.rect));
      if (!union) return;
      const centerX = union.left + union.width / 2;
      const centerY = union.top + union.height / 2;
      const startX = event.clientX;
      const startY = event.clientY;
      const startAngle = Math.atan2(startY - centerY, startX - centerX);
      let degrees = 0;
      const restore = () => {
        for (const stroke of strokes) {
          stroke.element.style.rotate = stroke.saved.rotate;
          stroke.element.style.transformOrigin = stroke.saved.origin;
        }
      };
      // As the others see them turn: each stroke's centre round the frame's,
      // and the stroke by as much about its own (documentLiveTransform).
      const live = beginDocumentLiveGesture(editor.view, strokes.map((stroke) => stroke.pos));
      const turnedFrames = (by: number) =>
        strokes.map((stroke) => {
          const own = { x: stroke.rect.left + stroke.rect.width / 2, y: stroke.rect.top + stroke.rect.height / 2 };
          const moved = officeTurnAround(own, { x: centerX, y: centerY }, by);
          return {
            pos: stroke.pos,
            x: (moved.x - own.x) / scaleX,
            y: (moved.y - own.y) / scaleY,
            r: stroke.rotation + by,
          };
        });
      followInkLassoPointer(event, {
        onMove: (dx, dy, moveEvent) => {
          const angle = Math.atan2(startY + dy - centerY, startX + dx - centerX);
          let next = ((angle - startAngle) * 180) / Math.PI;
          next = ((next + 540) % 360) - 180;
          // Shift turns in 15-degree steps, as a shape's own grip does.
          if (moveEvent.shiftKey) next = Math.round(next / 15) * 15;
          degrees = Math.round(next * 10) / 10;
          for (const stroke of strokes) {
            stroke.element.style.transformOrigin =
              `${(centerX - stroke.rect.left) / scaleX}px ${(centerY - stroke.rect.top) / scaleY}px`;
            stroke.element.style.rotate = `${degrees}deg`;
          }
          setTurn(degrees);
          live.move(turnedFrames(degrees));
        },
        onEnd: (_dx, _dy, cancelled) => {
          restore();
          setTurn(0);
          if (cancelled || Math.abs(degrees) < 0.05 || editor.isDestroyed) {
            live.end();
            return;
          }
          // Each stroke's centre goes round the frame's centre, and the
          // stroke turns by as much about its own: one Undo step.
          const turned = transformDocumentShapes(
            editor.view,
            strokes.map((stroke) => {
              const own = { x: stroke.rect.left + stroke.rect.width / 2, y: stroke.rect.top + stroke.rect.height / 2 };
              const moved = officeTurnAround(own, { x: centerX, y: centerY }, degrees);
              return {
                pos: stroke.pos,
                dxPx: (moved.x - own.x) / scaleX,
                dyPx: (moved.y - own.y) / scaleY,
                widthPx: stroke.widthPx,
                heightPx: stroke.heightPx,
                rotationDeg: stroke.rotation + degrees,
              };
            }),
          );
          live.end();
          if (turned && !editor.isDestroyed) {
            // The loop turns with them, set in the frame the strokes now have.
            const placement = placementFor(editor);
            const box = placement
              ? inkLassoUnionBox(
                  current.positions.flatMap((pos) => {
                    const rect = documentShapeClientRectAt(editor.view, pos);
                    return rect ? [placement.toSpace(rect)] : [];
                  }),
                )
              : null;
            if (box && current.loop.length > 0) {
              const pivotX = current.box.left + current.box.width / 2;
              const pivotY = current.box.top + current.box.height / 2;
              const loop = current.loop.map((point) => officeTurnAround(point, { x: pivotX, y: pivotY }, degrees));
              const lasso = anchorInkLassoLoop(loop, box);
              const positions = documentShapeLassoSelection(editor.state)?.positions ?? current.positions;
              editor.view.dispatch(
                editor.state.tr.setMeta(documentShapeMultiSelectionKey, { positions, lasso }).setMeta("addToHistory", false),
              );
            }
          }
          if (!editor.isDestroyed) editor.view.focus();
        },
      });
    },
    [editor, measured],
  );

  if (!measured || inkArmed || typeof document === "undefined") return null;
  const box = preview ?? measured.box;
  return createPortal(
    <OfficeInkLassoSelection
      space={measured.placement.space}
      box={box}
      label={label}
      commands={commands?.()}
      commandsLabel={commandsLabel}
      testIdPrefix="document-ink-lasso-selection"
      onPressBody={editor.isEditable ? pressBody : undefined}
      onPressHandle={editor.isEditable ? pressHandle : undefined}
      handleLabel={handleLabel}
      onPressRotate={editor.isEditable ? pressRotate : undefined}
      rotateLabel={rotateLabel}
      rotation={turn}
      onDismiss={dismiss}
      zIndex={measured.placement.fixed ? 9_100 : 40}
      fixed={measured.placement.fixed}
    />,
    measured.placement.host,
  );
}
