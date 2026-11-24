"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * SmartArt hit-testing on the edit canvas, as PowerPoint does it.
 *
 * 1. A SmartArt SHAPE is hit by what is drawn: a press on its painted fill or
 *    outline, or on its words, selects that shape; the empty part of its box
 *    passes the press on to whatever lies below. A Segmented Cycle draws each
 *    wedge in a box the size of the whole disc, so hit by box the topmost
 *    wedge took every press and the other wedges (and their labels) could not
 *    be selected. The shape's block host wears the shared `.geometryHit`
 *    (OfficeDrawingSelection); its words wear `data-office-hit-text`
 *    (PresentationCanvasShapeBlock). A SmartArt LABEL keeps its hit-testing:
 *    on its shape it lets presses through to the shape until its words are
 *    typed in (its border too: it wears no text-box move bands then), and
 *    beside one it is hit by its text rectangle, which always draws words or
 *    the `[Text]` prompt. An ordinary shape with No Fill is hit the same way
 *    (`presentationShapeHitsByGeometry`): by its outline, across a band a few
 *    screen pixels wide, and its words; its interior passes the press on.
 * 2. A press inside the graphic's frame that lands on no shape selects the
 *    WHOLE graphic: a hit area the size of the frame lies in the slide's paint
 *    order right under the graphic's lowest member (every block is a z-index 0
 *    layer drawn in DOM order), so an object in front of the graphic still
 *    takes its own presses and one behind it is covered by the graphic.
 *
 * No hooks run in the window for this; the hit area is a child component.
 */

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  OFFICE_HIT_BOX_ATTRIBUTE,
  officeDrawingSelectionStyles,
} from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { ResizeHandle } from "@mrnote/core/web/lib/presentation-drag.ts";
import { objectDragIsTouch } from "@mrnote/core/web/lib/object-drag-gesture.ts";
import { geometryNumber } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { presentationInPaintOrder } from "@mrnote/core/web/lib/presentation-paint-order.ts";
import { isBlockNotDrawn } from "@mrnote/core/web/lib/presentation-selection-pane.ts";
import { nativeSmartArtDrawingAbsent } from "@mrnote/core/web/lib/presentation-native-smartart.ts";
import { readSmartArtBlockMarker } from "@mrnote/core/web/lib/presentation-smartart.ts";
import { presentationShapeHasNoFill, presentationShapeHasNoInterior } from "../../../../lib/presentation-shape-no-fill";
import {
  presentationSmartArtGroup,
  presentationSmartArtLabelShape,
} from "../../../../lib/presentation/selection-geometry";
import { SMARTART_FRAME_PAD_PX } from "../../../../lib/presentation/window-constants";
import type { PresentationSmartArtGroupFrameCtl } from "./PresentationSmartArtGroupFrame";

/**
 * Whether a block on the edit canvas is hit by its geometry and its words,
 * not by its box: a SmartArt shape (rule 1 above), and an ordinary shape with
 * No Fill or an open outline with nothing inside it (an arc, a bracket),
 * which PowerPoint selects by its outline or its words while a
 * click on its empty interior passes through to what lies below (a dashed
 * frame drawn over a chart). A text box (`type: "text"`, or a shape the deck
 * states is one) is not one: PowerPoint selects it by a click anywhere inside
 * it. Nor is the frame of a SmartArt whose cached drawing is absent: it
 * paints nothing itself (its diagram is drawn as the engine lays it out, taking no presses), and it is
 * the graphic, which PowerPoint selects by a click anywhere in its frame --
 * hit by its geometry, the click went through to the title placeholder below.
 */
export function presentationShapeHitsByGeometry(block: PresentationBlock): boolean {
  if (block.type !== "shape" || nativeSmartArtDrawingAbsent(block)) return false;
  if (readSmartArtBlockMarker(block) !== null) return true;
  // A text box the import took as a shape (`txBox="1"` with an outline that is
  // not a rectangle, an effect, an empty frame that paints: readings row 1018,
  // `source.nativeTextBox`) is hit by its whole frame, as PowerPoint hits a
  // text box: a No Fill txBox rect and roundRect return themselves for a
  // point anywhere in their frame, beside their line included
  
  if (presentationShapeIsNativeTextBox(block)) return false;
  // A placeholder is no exception: Windows PowerPoint hit-tests a No Fill
  // placeholder as it does any No Fill shape, by its outline and its words,
  // and a point in its blank part reaches what lies below (the same probe: a
  // No Fill subtitle and body placeholder return Nothing under their one line).
  return presentationShapeHasNoFill(block) || presentationShapeHasNoInterior(block);
}

/**
 * A shape the deck states is a text box (`p:cNvSpPr@txBox`, readings row
 * 1018): hit by its whole frame, and grabbed by its border as any text box
 * (the text-move bands PresentationWindow draws on a text box's frame).
 */
export function presentationShapeIsNativeTextBox(block: PresentationBlock): boolean {
  const source = (block as unknown as { source?: unknown }).source;
  return !!source && typeof source === "object" && (source as { nativeTextBox?: unknown }).nativeTextBox === true;
}

/**
 * The class a block host adds so a shape is hit by its geometry and its words
 * (`presentationShapeHitsByGeometry`): `""` for every other block, and for
 * every block of a slide that takes no pointer at all (a preview), whose
 * inherited `pointer-events: none` the shared rule's `visiblePainted` would
 * override.
 */
export function presentationShapeGeometryHitClassName(
  block: PresentationBlock,
  inert: boolean,
): string {
  if (inert || !presentationShapeHitsByGeometry(block)) return "";
  return ` ${officeDrawingSelectionStyles.geometryHit}`;
}

/** One graphic's frame hit area, keyed by its lowest drawn member. */
const PAINTED_GEOMETRY = "path, rect, circle, ellipse, polygon, polyline, line";
const paintsNothingValue = (value: string | null) => value === "none" || value === "transparent";

/**
 * Whether the drawn shape `host` paints nothing a press could land on: no
 * box-drawn geometry and every SVG outline with neither fill nor line (a
 * text-only SmartArt shape). A missing fill attribute is SVG's black: paint.
 */
function shapePaintsNothing(host: Element | null): boolean {
  if (!host || host.querySelector(`[${OFFICE_HIT_BOX_ATTRIBUTE}]`)) return false;
  for (const node of host.querySelectorAll(`svg :is(${PAINTED_GEOMETRY})`)) {
    // Definitions, and the icons of the block's own buttons (move up / down),
    // are not the shape's drawing.
    if (node.closest("defs, clipPath, mask, pattern, marker, button")) continue;
    if (!paintsNothingValue(node.getAttribute("fill"))) return false;
    if (!paintsNothingValue(node.getAttribute("stroke"))) return false;
  }
  return true;
}

interface SmartArtGraphicHitArea {
  groupId: string;
  memberIds: ReadonlySet<string>;
  /** The member a press selects the graphic through when none is selected. */
  primaryId: string;
  bounds: { left: number; top: number; width: number; height: number };
  /**
   * The graphic's labels that hold a shape's words, with the shape they
   * belong to. A label lets the press through to its shape; where the shape
   * paints nothing there (a text-only shape, No Fill and no line) the press
   * reaches this area, and Office still selects the shape: its words are hit.
   */
  labels: ReadonlyArray<{
    labelId: string;
    shapeId: string;
    rect: { left: number; top: number; right: number; bottom: number };
    /** The shape paints nothing (No Fill, no line): a text-only shape. */
    textOnly: boolean;
  }>;
}

/** A block whose fill and line both paint nothing (a text-only shape). */
function blockPaintsNothing(block: PresentationBlock): boolean {
  const record = block as { fill?: unknown; stroke?: unknown; strokeWidth?: unknown };
  const none = (value: unknown) => value === "none" || value === "transparent";
  return none(record.fill) && (none(record.stroke) || record.strokeWidth === 0);
}

const hitAreaCache = new WeakMap<
  readonly PresentationBlock[],
  ReadonlyMap<string, SmartArtGraphicHitArea>
>();

/**
 * Every SmartArt graphic's frame on a slide, keyed by the id of its LOWEST
 * drawn member in paint order (where the hit area is drawn). The frame is the
 * union of its drawn members' boxes, the same box the selected graphic's frame
 * is drawn around. Cached per blocks array.
 */
export function presentationSmartArtGraphicHitAreas(
  blocks: readonly PresentationBlock[],
): ReadonlyMap<string, SmartArtGraphicHitArea> {
  const cached = hitAreaCache.get(blocks);
  if (cached) return cached;
  const areas = new Map<string, SmartArtGraphicHitArea>();
  const seen = new Set<string>();
  for (const { block } of presentationInPaintOrder(blocks)) {
    if (isBlockNotDrawn(block)) continue;
    const marker = readSmartArtBlockMarker(block);
    if (!marker || seen.has(marker.groupId)) continue;
    seen.add(marker.groupId);
    const group = presentationSmartArtGroup(blocks, block);
    if (!group) continue;
    const drawn = group.members.filter((member) => !isBlockNotDrawn(member));
    const rects = drawn.flatMap((member) => {
      const left = geometryNumber(member, "left");
      const top = geometryNumber(member, "top");
      const width = geometryNumber(member, "width");
      const height = geometryNumber(member, "height");
      return left !== null && top !== null && width !== null && height !== null
        ? [{ left, top, right: left + width, bottom: top + height }]
        : [];
    });
    if (rects.length === 0) continue;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const primary =
      drawn.find(
        (member) =>
          member.type === "shape" && readSmartArtBlockMarker(member)?.role === "node",
      ) ?? block;
    const labels = drawn.flatMap((member) => {
      const shape = presentationSmartArtLabelShape(blocks, member);
      const left = geometryNumber(member, "left");
      const top = geometryNumber(member, "top");
      const width = geometryNumber(member, "width");
      const height = geometryNumber(member, "height");
      return shape && left !== null && top !== null && width !== null && height !== null
        ? [{
            labelId: member.id,
            shapeId: shape.id,
            rect: { left, top, right: left + width, bottom: top + height },
            textOnly: blockPaintsNothing(shape),
          }]
        : [];
    });
    areas.set(block.id, {
      groupId: marker.groupId,
      labels,
      memberIds: new Set(group.members.map((member) => member.id)),
      primaryId: primary.id,
      bounds: { left, top, width: right - left, height: bottom - top },
    });
  }
  hitAreaCache.set(blocks, areas);
  return areas;
}

type SmartArtLabelHit = SmartArtGraphicHitArea["labels"][number];

/**
 * The labels of text-only SmartArt shapes on a slide, by label id. Their words
 * are hit ABOVE everything the slide paints before them: the label lets the
 * press through to its shape, and a shape that paints nothing is reached
 * through the graphic's frame area only where nothing else is drawn -- a
 * plate drawn behind the words (Vertical Block List's Level 2 panel) took the
 * press and a double click on the words selected the plate.
 */
export function presentationSmartArtTextOnlyLabels(
  blocks: readonly PresentationBlock[],
): ReadonlyMap<string, SmartArtLabelHit> {
  const labels = new Map<string, SmartArtLabelHit>();
  for (const area of presentationSmartArtGraphicHitAreas(blocks).values()) {
    for (const label of area.labels) if (label.textOnly) labels.set(label.labelId, label);
  }
  return labels;
}

/** The window bindings the hit area reads, passed through unchanged. */
export interface PresentationSmartArtGraphicHitLayerCtl {
  /** The slide's drawn blocks (the list the canvas paints, in array order). */
  blocks: readonly PresentationBlock[];
  /** The block this layer wraps. */
  block: PresentationBlock;
  activeSlideBounds: { width: number; height: number };
  /** The selection's primary block, which keeps the graphic's selection on it. */
  primaryId: string | null;
  /** No hit area: a preview slide, or a drawing tool that starts on the slide. */
  inert: boolean;
  selectBlockFromClick: (
    clickedBlockId: string,
    additive: boolean,
    preserveTextSelection?: boolean,
  ) => void;
  setSmartArtGraphicOnly: PresentationSmartArtGroupFrameCtl["setSmartArtGraphicOnly"];
  beginBlockGesture: (
    blockId: string,
    handle: ResizeHandle | "move",
    event: ReactPointerEvent,
    scope?: "member" | "group",
  ) => void;
  setBlockContextMenu: PresentationSmartArtGroupFrameCtl["setBlockContextMenu"];
  /** Put the caret in a SmartArt shape's words (false: it has none). */
  editSmartArtShapeText: (shapeId: string, seed?: string, point?: { x: number; y: number; word?: boolean }) => boolean;
  /**
   * The stacking the block this layer wraps stands at (a slide's Header &
   * Footer fields lift what is over them, `withFooterFieldStacking`). The hit
   * areas stand at it too, so the slide's paint order places them: at 0 under
   * members lifted to 3 (a slide with a footer field under the diagram), the
   * words' hit was under every shape of the graphic and a double click on them
   * took the shape behind (nobevel-style-probe p8, Horizontal Bullet List).
   */
  zIndex?: number;
}

/**
 * A canvas block, preceded -- when it is the lowest drawn member of a SmartArt
 * graphic -- by the graphic's frame hit area (rule 2). A press there selects
 * the graphic through the frame's own path: its member selection, then the
 * graphic-only selection, and a drag moves the whole graphic as the frame's
 * edges do.
 */
export function PresentationSmartArtGraphicHitLayer({
  ctl,
  children,
}: {
  ctl: PresentationSmartArtGraphicHitLayerCtl;
  children: ReactNode;
}) {
  const area = ctl.inert
    ? undefined
    : presentationSmartArtGraphicHitAreas(ctl.blocks).get(ctl.block.id);
  const words = ctl.inert
    ? undefined
    : presentationSmartArtTextOnlyLabels(ctl.blocks).get(ctl.block.id);
  const {
    activeSlideBounds,
    selectBlockFromClick,
    setSmartArtGraphicOnly,
    beginBlockGesture,
    setBlockContextMenu,
    editSmartArtShapeText,
  } = ctl;
  // A text-only shape's words, hit right under its label in the slide's
  // paint order (over whatever the graphic draws behind them): a press
  // selects the shape, a drag moves it, a double click types in its words.
  const wordHit = words ? (
    <div
      className="presentation-window__smartart-words-hit"
      data-testid="presentation-smartart-words-hit"
      data-label-id={words.labelId}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${(words.rect.left / activeSlideBounds.width) * 100}%`,
        top: `${(words.rect.top / activeSlideBounds.height) * 100}%`,
        width: `${((words.rect.right - words.rect.left) / activeSlideBounds.width) * 100}%`,
        height: `${((words.rect.bottom - words.rect.top) / activeSlideBounds.height) * 100}%`,
        zIndex: ctl.zIndex ?? 0,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
        const touch = objectDragIsTouch(event);
        if (!touch) {
          event.currentTarget
            .closest<HTMLElement>(".presentation-window__slide")
            ?.focus({ preventScroll: true });
          selectBlockFromClick(words.labelId, false);
        }
        beginBlockGesture(words.shapeId, "move", event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        selectBlockFromClick(words.labelId, event.shiftKey || event.ctrlKey || event.metaKey);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        // The word double-clicked selected, as PowerPoint's double click
        // does in a SmartArt shape's words (and as on any of its shapes).
        editSmartArtShapeText(words.shapeId, undefined, { x: event.clientX, y: event.clientY, word: true });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        selectBlockFromClick(words.labelId, false);
        setBlockContextMenu({ x: event.clientX, y: event.clientY, blockId: words.shapeId });
      }}
    />
  ) : null;
  if (!area) {
    return (
      <>
        {wordHit}
        {children}
      </>
    );
  }
  // The graphic stays selected through the member already selected in it.
  const primaryId =
    ctl.primaryId && area.memberIds.has(ctl.primaryId) ? ctl.primaryId : area.primaryId;
  const selectGraphic = () => {
    selectBlockFromClick(primaryId, false);
    setSmartArtGraphicOnly(true);
  };
  const { bounds } = area;
  // The label whose words lie under the pointer, in slide units: the area is
  // the graphic's bounds padded by the frame's pixels on every side.
  const labelAt = (event: { clientX: number; clientY: number; currentTarget: Element }) => {
    if (area.labels.length === 0) return null;
    const box = event.currentTarget.getBoundingClientRect();
    const innerWidth = box.width - SMARTART_FRAME_PAD_PX * 2;
    const innerHeight = box.height - SMARTART_FRAME_PAD_PX * 2;
    if (innerWidth <= 0 || innerHeight <= 0) return null;
    const x = bounds.left + ((event.clientX - box.left - SMARTART_FRAME_PAD_PX) / innerWidth) * bounds.width;
    const y = bounds.top + ((event.clientY - box.top - SMARTART_FRAME_PAD_PX) / innerHeight) * bounds.height;
    // The topmost label first, as the slide paints them. Only a shape that
    // paints nothing is reached through its label's box here: a painted
    // shape takes the presses on its paint itself, and the rest of its
    // label's box (over a gap between wedges) is the graphic's, as in Office.
    const slide = event.currentTarget.closest(".presentation-window__slide") ?? event.currentTarget.parentElement;
    for (let index = area.labels.length - 1; index >= 0; index -= 1) {
      const label = area.labels[index];
      if (x < label.rect.left || x > label.rect.right || y < label.rect.top || y > label.rect.bottom) continue;
      const shape = slide?.querySelector(`[data-block-id="${CSS.escape(label.shapeId)}"]`) ?? null;
      if (shapePaintsNothing(shape)) return label;
    }
    return null;
  };
  return (
    <>
      <div
        className="presentation-window__smartart-hit-area"
        data-testid="presentation-smartart-graphic-hit-area"
        data-group-id={area.groupId}
        aria-hidden="true"
        style={{
          position: "absolute",
          // The frame the selected graphic draws, padding included.
          left: `calc(${(bounds.left / activeSlideBounds.width) * 100}% - ${SMARTART_FRAME_PAD_PX}px)`,
          top: `calc(${(bounds.top / activeSlideBounds.height) * 100}% - ${SMARTART_FRAME_PAD_PX}px)`,
          width: `calc(${(bounds.width / activeSlideBounds.width) * 100}% + ${SMARTART_FRAME_PAD_PX * 2}px)`,
          height: `calc(${(bounds.height / activeSlideBounds.height) * 100}% + ${SMARTART_FRAME_PAD_PX * 2}px)`,
          // A layer of the slide's paint order like every block: under the
          // graphic's members, over whatever the graphic covers.
          zIndex: ctl.zIndex ?? 0,
        }}
        onPointerDown={(event) => {
          // Shift / Ctrl / Cmd add the graphic to the selection on the click.
          if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
          const touch = objectDragIsTouch(event);
          if (!touch) {
            // The keyboard goes to the slide (Delete, Esc act on the
            // selection), out of any words still being typed in.
            event.currentTarget
              .closest<HTMLElement>(".presentation-window__slide")
              ?.focus({ preventScroll: true });
          }
          const label = labelAt(event);
          if (label) {
            // On a text-only shape's words: that shape, as a press on any
            // shape selects it (the label resolves to its shape).
            if (!touch) selectBlockFromClick(label.labelId, false);
            beginBlockGesture(label.shapeId, "move", event);
            return;
          }
          beginBlockGesture(primaryId, "move", event, "group");
          // A finger selects on its tap (the click below), as on any object.
          if (!touch) selectGraphic();
        }}
        onClick={(event) => {
          event.stopPropagation();
          const label = labelAt(event);
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            selectBlockFromClick(label?.labelId ?? primaryId, true);
            return;
          }
          if (label) {
            selectBlockFromClick(label.labelId, false);
            return;
          }
          selectGraphic();
        }}
        onDoubleClick={(event) => {
          // A double click on a shape's words types in them, the word
          // double-clicked selected.
          const label = labelAt(event);
          if (!label) return;
          event.stopPropagation();
          editSmartArtShapeText(label.shapeId, undefined, { x: event.clientX, y: event.clientY, word: true });
        }}
        onContextMenu={(event) => {
          // The graphic's menu, as a right click on its frame opens.
          event.preventDefault();
          event.stopPropagation();
          const label = labelAt(event);
          if (label) {
            // The shape's own menu, as a right click on a shape opens.
            selectBlockFromClick(label.labelId, false);
            setBlockContextMenu({ x: event.clientX, y: event.clientY, blockId: label.shapeId });
            return;
          }
          selectGraphic();
          setBlockContextMenu({
            x: event.clientX,
            y: event.clientY,
            blockId: primaryId,
            smartArtTarget: "graphic",
          });
        }}
      />
      {wordHit}
      {children}
    </>
  );
}
