/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { readSmartArtGraphicEffect, smartArtGraphicFormatStyle } from "../../../../lib/spreadsheet/smartart-background";
import { EMU_PER_PT, EMU_PER_PX, ptToPx } from "../../../../lib/office-units";
import { textHasEastAsian } from "./noteTextStyle";
import { drawDocumentPicture } from "../../../../lib/document-picture-references";
import { wordGridFontLineMetrics } from "./wordFontMetrics";
import { inkLightStandIn, inkStrokeRestsInLayer, LightInkView, placeWokenInkStage, restInkStrokeSoon } from "./paged/inkLightLayer";
import { documentThemeBodyLatin } from "../../../../lib/document-design";
import { smartArtSlotPictureFormatOf } from "../../../../lib/office-smartart/slot-picture-format";
import { appendDocumentSmartArtSlotPicture } from "./documentSmartArtSlotPicture";
import { SAVED_WITHOUT_HISTORY_META, trustReadOnlyDocumentMutation } from "./readOnlyTransactionAuthority";
import { textEffectsCss } from "../extensions/TextEffects";
import { layOutFitTextRegion } from "../extensions/TextStyling";
import { normalizeChartBlockAttrs, type ChartBlockAttrsV2 } from "../extensions/chartBlockShared";
import { documentChartPlanInputs } from "../extensions/documentChartHost";
import {
  documentChartFloatingHeight,
  documentChartFromGroupMember,
  documentChartGroupable,
  documentChartGroupMemberChart,
  documentChartGroupSize,
  documentChartPickable,
} from "./documentChartGroup";
import { requestChartPicture } from "../../../../lib/office-charts/chart-picture-client";
import { documentChartPictureContent } from "../../../../lib/office-charts/document-chart-picture";
import { sanitizeChartPicture } from "../../../../lib/office-charts/chart-picture-sanitize";
import { officeChartColorWithOpacity, officeFillPatternOf, officeFillPatternSvg } from "../../../../lib/office-chart-shape-paint";
import { officePictureFillPattern, officePictureNaturalSize } from "../../../../lib/office-picture-fill-options";
import {
  officeShapeEffectFilterCss,
  officeShapeEffectReflectionCss,
} from "../../../../lib/office-shape-effects";
import {
  normalizeOfficeLineSketch,
  officeShapeEffectsFilterRegion,
  officeShapeEffectsPaint,
  officeShapeTextTurn,
  officeSketchSeed,
  officeShapeShadowDropShadow,
  type OfficeShapeEffectPrimitive,
} from "../../../../lib/office-shape-effects-paint";
import { holdOfficeTextBoxForChrome } from "../../../../lib/office-inactive-selection";
import { officeCircleRadialSvgAttrs, officeRectPathGradient, wordCirclePathGradient } from "../../../../lib/office-path-gradient";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Mark, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { SMARTART_PREPARE_RETRY_MS, subscribeSmartArtPreparation } from "../../../../lib/office-smartart/prepared-conversion";
import type { SmartArtRefusal } from "../../../../lib/office-smartart/convert-refusal-message";
import {
  DOCUMENT_SMARTART_REFUSED_EVENT,
  documentSmartArtAbsentDrawingScene,
  documentSmartArtDrawingAbsent,
  documentSmartArtPreparation,
  documentSmartArtPreparedMemberId,
  documentSmartArtPreparedNode,
  retryDocumentSmartArtPreparation,
} from "./documentSmartArtPrepared";
import { documentSmartArtHostColorTheme } from "./documentSmartArtOpenConversion";

import {
  applyOfficeInlineTextEditorCentered,
  applyOfficeInlineTextEditorStyle,
  fitOfficeInlineTextEditor,
  officeInlineTextCaretFromPoint,
} from "../../../../lib/office-inline-text-editor";
import {
  handleOfficeShapeTextKey,
  openOfficeShapeTextField,
  officeShapeTextFieldPaintStyle,
} from "../../../office-ribbon/OfficeShapeTextField";
import { normalizeDocumentShapeTextRuns } from "../../../../lib/document-shape-text-runs";
import {
  DOCUMENT_SHAPE_STORY_ATTRIBUTE,
  documentShapeStoryFromLegacy,
  documentShapeStoryPlugin,
  documentShapeVisibleText,
  documentWithShapeStoriesMirrored,
  documentShapeTakesStory,
  marksForRunStyle,
} from "./documentShapeStory";
import {
  DOCUMENT_SHAPE_LABEL_ATTRIBUTE,
  documentShapeLinkedFlowFor,
  documentShapeLinkedFlowPlugin,
} from "./documentShapeLinkedFlow";
import {
  normalizePresentationUnderlineStyle,
  presentationTextDecorationCss,
} from "../../../../lib/presentation-text-decoration";
import type { RunStyle, TextRun } from "../../../../lib/presentation-runs";
import {
  DOCUMENT_SHAPE_SCRIPT_SCALE,
  mountDocumentShapeRichTextField,
  type DocumentShapeRichTextField,
} from "./documentShapeRichTextField";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView, NodeView, NodeViewConstructor } from "@tiptap/pm/view";
import { documentGroupMembersReorderable, documentGroupMembersWithout } from "../../../../lib/document-shape-group-tree";

import {
  HOLLOW_PATH_KINDS,
  gradientVector,
  normalizePresentationConnectorSpec,
  shapeMultiParts,
  shapePathD,
  shapePolygonPoints,
  type MergeableShape,
  type MergedShapeResult,
} from "../../../../lib/presentation-shapes";
import { presentationCustomPathToSvgPath } from "../../../../lib/presentation-freeform";
import { officeCustomPathPaintedSegments, officeCustomPathSegmentFill } from "../../../../lib/office-custom-path-paints";
import {
  officeCustomPathMergePoints,
  officeMergedShapeCustomPath,
  officeShapesMergeable,
} from "../../../../lib/office-shape-merge-client";
import { alignBlocks, distributeBlocks } from "../../../../lib/presentation-align";
import {
  documentInkEffectPaint,
  documentInkPathFractions,
  documentInkPencilFilter,
  documentInkPencilSeed,
  inkStrokeEndPaint,
  inkStrokeTipsPathData,
  normalizeInkCutEnds,
  normalizeInkPressure,
  normalizeInkAudio,
  normalizeInkTape,
  documentInkStrokeOpacity,
  documentInkTapeFlipped,
  DOCUMENT_INK_TAPE_OPACITY,
  type InkTape,
} from "../../../../lib/document-ink";
import {
  inkCornerDegreesForTool,
  inkPressuresVary,
  inkStrokePathData,
  inkVariableWidthOutlinePathData,
} from "../../../../lib/office-ink-smooth";
import { appendInkEffectSvg, inkEffectSvgPlan } from "../../../../lib/office-ink-effects";
import { inkLineWidthScaled } from "../../../../lib/office-ink-line-scale";

/** Paint-only ids for an ink stroke's gradient and pencil grain. */
let inkPaintCounter = 0;
import { officeLineWeightPtToPx } from "../../../../lib/office-line-weight";
// One drawing for one preset across all three hosts: the slide canvas, the
// sheet canvas and this one all evaluate the SAME DrawingML preset program
// (SHAPE-IMPORT-AUDIT.md §2.9). The handwritten 0..100 outlines below were a
// second, non-conforming guess at the same 187 shapes and drew at least
// eighteen of them as a different figure.
import {
  presentationConnectorRouteGeometry,
  presentationPresetGeometryForKind,
} from "../../../../lib/presentation-authored-preset-geometry";
import { nativeLineEndPath, nativeLineEndPlacements, nativePathFillColor, readNativeLineEnd, type NativeLineEnd } from "../../../../lib/native-drawing-geometry";
import { buildBlockTransform, constrainedMoveAxis, RESIZE_HANDLES, type ResizeHandle } from "../../../../lib/presentation-drag";
import { OFFICE_SCENE_LABEL_LINE_SPACING, SMARTART_PICTURE_PLACEHOLDER_ICON_SRC } from "../../../../lib/office-smartart/model";
import { smartArtMemberTextItem } from "../../../../lib/office-smartart/interaction-model";
import { normalizeBandRichBlocks } from "./headerFooter";
import { buildBandRichDom } from "./paged/bandRichDom";
import {
  preservedSmartArtSlotMedia,
  preservedSmartArtSlotPictures,
  slotPictureLayout,
  type PreservedSlotPicture,
} from "../../../../lib/office-smartart/preserved-slot-pictures";
import { smartArtTextBoxInsetPercents } from "../../../../lib/office-smartart/text-box";
import {
  DOCUMENT_SMARTART_LABEL_LINE_HEIGHT,
  documentSmartArtLabelFontPx,
  documentSmartArtMemberLabelPx,
  documentSmartArtOfficeLabelScale,
} from "../../../../lib/office-smartart/document-shapes-model";
import { normalizeEastAsianFontFamilies, orderEastAsianFontFamiliesForText } from "../../../../lib/document-word-line-metrics";
import { withOfficeFontSubstitutes } from "../../../../lib/office-fonts/substitutes";
// The SmartArt quick styles' 3-D, approximated in 2-D exactly the way the
// slide canvas approximates it (SMARTART-STYLES.md §5). One module decides
// how each property is faked, so a diagram in a document reads like the same
// diagram in a slide instead of like a second guess at it.
import {
  smartArtCameraCss,
  smartArtBevelLight,
  smartArtBevelOutline,
  smartArtBevelLightPrimitives,
  smartArtContourStroke,
  smartArtFaceTintPrimitives,
  smartArtMaterialOpacity,
  smartArtMaterialOpacityAfterBevel,
  smartArtMaterialOpacityPrimitives,
  smartArtShape3dFilter,
  type SmartArtFilterPrimitive,
} from "../../../../lib/office-smartart/canvas-3d";
import {
  smartArtEditIn2dKey,
  smartArtEditingIn2d,
  smartArtFlat2d,
  smartArtGraphicHasScene,
  smartArtShapesLockedIn3d,
  subscribeSmartArtEditIn2d,
} from "../../../../lib/office-smartart/edit-in-2d";
import { documentViewScale, resizeDocumentObjectThroughZero } from "./documentObjectResize";
import { reanchorMovedDocumentFloats } from "./floatReanchor";
import { liftSheetsDuringDrag, type SheetLift } from "./dragSheetLift";
import { INLINE_SHAPE_NODE_NAME } from "./documentObjectNodes";
import {
  documentShapeBandAcrossAnchor,
  documentShapeFloatLayoutAnchor,
  documentShapeAxisIsPercent,
  documentShapePercentAxesMoved,
  documentShapeFloatMode,
  documentShapeIsTopAndBottom,
  clearFloatLayoutState,
  floatHostParagraphAnchor,
  floatPaintOf,
} from "./floatingTextBoxLayout";
import { beginDocumentObjectSnap, clearDocumentObjectSnapGuides, type DocumentObjectSnap } from "./documentObjectSnap";
import { floatStackRanksMoved, floatStackZIndex, normalizeFloatAnchor, type FloatAnchor } from "../../../../lib/office-float-anchor";
import {
  OFFICE_DRAWING_OVERLAY_CLASS_NAMES,
  OFFICE_HIT_TEXT_ATTRIBUTE,
  officeDrawingSelectionStyles,
} from "../../../office-ribbon/OfficeDrawingSelection";
import {
  mountOfficeAdjustHandles,
  mountOfficeEditPoints,
  OFFICE_EDIT_POINTS_LABELS,
  type OfficeAdjustHandlesOptions,
  type OfficeEditPointsLabels,
  type OfficeEditPointsOptions,
  type OfficeOverlayController,
} from "../../../../lib/office-drawing-overlays";
import { officePresetTextRect, officeShapeHasAdjustHandles } from "../../../../lib/office-shape-adjust-handles";
import {
  officeCustomPathEditBox,
  officeCustomPathFromEdit,
  officeEditPathFromCustomPath,
  officeEditPathFromPreset,
  type OfficeEditPath,
} from "../../../../lib/office-custom-path-edit";
import {normalizeOfficeShapeGradient,normalizeOfficeShapeShadow,officeGradientAngle,officeGradientAngleForBox,officeGradientDrawnStops,type OfficeShapeGradient} from "../../../../lib/office-shape-paint";
import {
  isOfficeInsetStroke,
  officeStrokeAlign,
  officeStrokeAlignClipId,
  officeStrokeAlignPaintWidth,
} from "../../../../lib/office-shape-line-align";
import { officeLineFamilyDash, officeStrokeDash, officeStrokeDashArray } from "../../../../lib/office-stroke-dash";
import {
  officeCompoundStrokeLayers,
  officeStrokeDetail,
  officeStrokeDetailSvgAttributes,
} from "../../../../lib/office-stroke-detail";
import { normalizeOfficeTextPaint, officeTextPaintCss } from "../../../../lib/office-text-paint";
import {
  DOCUMENT_SHAPE_DEFAULT_FILL,
  DOCUMENT_SHAPE_DEFAULT_HEIGHT_EMU,
  DOCUMENT_SHAPE_DEFAULT_OUTLINE,
  DOCUMENT_SHAPE_DEFAULT_OUTLINE_WIDTH_PT,
  DOCUMENT_SHAPE_DEFAULT_TEXT_FILL,
  DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_FAMILY,
  DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
  DOCUMENT_SHAPE_DEFAULT_WIDTH_EMU,
  DOCUMENT_SHAPE_EMU_PER_PX,
  DOCUMENT_SHAPE_MAX_EDGE_EMU,
  DOCUMENT_SHAPE_MIN_EDGE_EMU,
  DOCUMENT_SHAPE_SCHEMA_VERSION,
  documentShapeDefinition,
  documentShapeFormatPatch,
  documentShapeConnectorCanvasLabelPatch,
  documentShapeGroupMemberTextPatch,
  documentShapeGroupMoveMember,
  documentShapeEmuToPx,
  documentShapeGroupAttrs,
  documentShapeHasNativeConnectors,
  documentShapeGroupIsEditable,
  documentShapeGroupTextIsEditable,
  documentShapeIsPreservedNativeSmartArt,
  documentShapeNativeSmartArtTextBlocker,
  documentShapeSmartArtIdentity,
  documentShapePxToEmu,
  documentShapeRelativeHeight,
  documentShapeUngroupAttrs,
  documentShapeUngroupMembers,
  type DocumentShapeGroupInput,
  documentFloatingStack,
  normalizeDocumentInkEffect,
  normalizeDocumentInkTool,
  normalizeDocumentShapeAttrs,
  documentShapeMemberDrawnLeafAttrs,
  documentShapeMemberLeafAttrs,
  documentShapeMemberWithGroupPaint,
  normalizeDocumentShapeEffects,
  normalizeDocumentShapePictureFill,
  normalizeDocumentShapeText,
  DOCUMENT_SHAPE_MAX_TEXT_LENGTH,
  type DocumentShapeAttrs,
  type DocumentShapeAttrsInput,
  type DocumentShapeTextBody,
  type DocumentShapeGroupMember,
  documentShapeTextEffectShadowCss,
  documentShapeKeyPatch,
} from "../../../../lib/document-shapes";
import { PAGED_FOLLOW_UP_META } from "../../../../lib/collab/paged-history-meta";
import { officeObjectKeyAction, officeObjectTextKey } from "../../../../lib/office-object-nudge";
import {
  INK_LASSO_MEMBER_ATTRIBUTE,
  anchorInkLassoLoop,
  inkLassoUnionBox,
  sameInkLassoIds,
  type InkLassoAnchoredLoop,
  type InkLassoPoint,
} from "../../../../lib/office-ink-lasso-selection";
import { smartArtOutlineAfterDelete } from "../../../../lib/office-smartart/design-model";
import {
  documentPreservedSmartArtMemberTransformPatch,
  documentPreservedSmartArtShapeMemberIds,
  documentPreservedSmartArtShapeOrder,
  documentSmartArtCanvasShapeMemberIds,
  documentSmartArtItemMemberIds,
  documentSmartArtMemberDeletedItemId,
  documentSmartArtMemberItemId,
  documentSmartArtMemberTextPatch,
  documentSmartArtMemberTransformPatch,
  readDocumentSmartArtDiagram,
  type DocumentSmartArtDiagram,
  type DocumentSmartArtMemberTransform,
} from "../../../../lib/office-smartart/document-design-model";
// Deleting a shape relays the diagram out: the engine host answers the patch.
import { EngineUnavailableError, isEngineAbort, smartArtEngine } from "../../../../lib/office-smartart/remote";
import { toast } from "../../../../hooks/use-toast";

import styles from "./DocumentShapeBlock.module.css";

import { tryCapturePointer } from "./pointerCapture";
import { beginObjectDragGesture } from "../../../../lib/object-drag-gesture";
import { attachOfficeTextWarp } from "../../../../lib/office-text-warp-render";
import { attachOfficeTextShadowCopy, officeTextShadowTransformed } from "../../../../lib/office-text-shadow-copy";
import { touchMultiSelectScopeFor } from "../../../../lib/touch-multi-select";
import {
  isCompatMouseFromTouch,
  isTouchLikePointer,
} from "../../../../lib/pointer-capability";
import { isImeCompositionKey } from "../../../../lib/code-runner/editor-keys";
import { cssFontFamilyOrUndefined } from "../../../../lib/css-font-family";
import { subscribeEditorSurfaceEditable } from "../useEditorSurfaceEditable";
import {
  cancelInkStrokePaint,
  inkStrokePaintPending,
  paintInkStroke,
  paintInkStrokeNow,
} from "./deferredInkPaint";
import {
  beginDocumentLiveGesture,
  reapplyDocumentLiveFrame,
  registerDocumentLiveTarget,
  type DocumentLiveGesture,
} from "./documentLiveTransform";
import { shortestTurn, type LiveTransformFrame } from "../../../../lib/collab/live-transform";

/** A selected stroke's frame is at least this wide and tall (two 20 px grips), so its grips stand off the line. */
const INK_SELECTION_MIN_FRAME_PX = 44;
/** How far a press on a strip of tape may wander and still be a tap (CSS px). */
const INK_TAPE_TAP_SLOP_PX = 6;

/**
 * The canvas says which shape of an authored SmartArt is selected (Office's
 * shape-inside-the-frame selection), so the SmartArt tab's outline verbs
 * (Add Shape, Promote, Demote, Move Up / Down, Larger / Smaller) act on THAT
 * item, as they do on a slide. `itemId` is `null` when the frame itself is
 * selected again.
 */
export const DOCUMENT_SMARTART_MEMBER_SELECTION_EVENT =
  "mrai:document-smartart-member-selection";

export interface DocumentSmartArtMemberSelectionDetail {
  readonly groupId: string;
  readonly itemId: string | null;
  readonly memberId: string | null;
}

let lastSmartArtMemberSelection: DocumentSmartArtMemberSelectionDetail | null =
  null;

/**
 * A click on an EMPTY picture slot's picture icon: Office opens its picture
 * dialog right there (Microsoft Support, "Create a SmartArt graphic": in a
 * picture layout, click the picture icon in the shape). The toolbar owns the
 * file picker and the slot command, so the canvas only says which member.
 */
export const DOCUMENT_SMARTART_PICTURE_SLOT_EVENT =
  "mrai:document-smartart-picture-slot";

export interface DocumentSmartArtPictureSlotDetail {
  readonly groupId: string;
  readonly memberId: string;
}

/**
 * One authored SmartArt shape resized by its handles: Word keeps the size as
 * the shape's custScaleX/Y and lays the WHOLE graphic out again around it,
 * which is a served relayout the toolbar owns (its engine queue, one Undo).
 * The canvas asks for it with this cancelable event; the toolbar claims it
 * with `preventDefault()`. Unclaimed (no toolbar mounted), the resize is the
 * plain box edit the canvas previewed.
 */
export const DOCUMENT_SMARTART_ITEM_RESIZE_EVENT =
  "mrai:document-smartart-item-resize";

export interface DocumentSmartArtItemResizeDetail {
  readonly groupId: string;
  readonly itemId: string;
  /** Against the shape as it is now, per axis. */
  readonly factor: { readonly x: number; readonly y: number };
}

/** The box a connector route with a zero axis is evaluated in, across that
 * axis: the preset evaluator's own floor (one pixel), centred on the file's
 * line, so the route lies within half a pixel of it (paintShapeGeometry). */
const ZERO_AXIS_ROUTE_PX = 1;

/**
 * The latest announcement. The press that selects a shape also selects the
 * graphic, so the SmartArt tab (and its listener) may mount only AFTER the
 * event fired; it reads this once on mount.
 */
export function lastDocumentSmartArtMemberSelection(): DocumentSmartArtMemberSelectionDetail | null {
  return lastSmartArtMemberSelection;
}

const SVG_NS = "http://www.w3.org/2000/svg";
let documentShapeMarkerSequence = 0;

export interface DocumentShapeNodeViewLabels {
  readonly shape: string;
  readonly textBox: string;
  readonly rotate: string;
  readonly resize: Readonly<Record<ResizeHandle, string>>;
  readonly text: string;
  readonly connectorLabel: string;
  /** A picture that is one member of a group. */
  readonly picture: string;
  readonly moveConnectedShape: string;
  readonly moveNamedShape: (name: string) => string;
  /** Why an imported Office diagram still holding `[Text]` prompts takes no typing. */
  readonly smartArtPlaceholderTextOnly: string;
  /** Why any other preserved diagram's text cannot be written back. */
  readonly smartArtTextNotEditable: string;
  /** A relayout (deleting a shape) needs the server, which is unreachable. */
  readonly smartArtNeedsConnection: string;
  /** The server could not lay the diagram out; nothing changed. */
  readonly smartArtLayoutFailed: string;
  /**
   * The prompt an EMPTY SmartArt shape shows (Office's `[Text]`), drawn by the
   * editor only: the point stays empty in the page and in the file.
   */
  readonly smartArtTextPrompt?: string;
  /** Edit Points' vertex, handle and menu names. */
  readonly editPoints: OfficeEditPointsLabels;
  /** The yellow adjustment handles of a selected preset. */
  readonly adjustShape: string;
}

interface DocumentShapeOptions {
  readonly labels: DocumentShapeNodeViewLabels;
  /**
   * The page this document is, when its source package can be asked for a
   * preserved diagram's slot pictures (`undefined` in guest mode).
   */
  readonly getPageId?: () => string | undefined;
  /**
   * The print surface (DocumentPrintSurface): a read-only editor that is
   * never saved still sizes a "Resize shape to fit text" shape to its words,
   * as the editor does once a writer opens the page. Nothing of it is
   * written back.
   */
  readonly fitTextWhenReadOnly?: boolean;
}

/**
 * Draw one preserved diagram slot's picture over the slot the member painted
 * (SMARTART-IMPORT.md §5.68's next step; `lib/office-smartart/preserved-slot-pictures`).
 *
 * The picture is clipped to the member's OWN painted geometry, placed by the
 * slot's `a:fillRect` and cropped by its `a:srcRect`; the outline is drawn
 * again above it, because Office strokes a shape over its picture fill. The
 * layer stays empty until the diagram's media arrives, and stays empty if it
 * never does: the slot is then what the page shows, as before.
 */
function appendPreservedSlotPicture(
  memberElement: HTMLElement,
  memberSvg: SVGSVGElement,
  before: Element,
  slot: PreservedSlotPicture,
  media: Promise<Readonly<Record<string, string>> | null>,
): void {
  const painted = (Array.from(memberSvg.children) as SVGElement[]).filter((shape) =>
    ["path", "rect", "circle", "ellipse", "polygon"].includes(shape.tagName.toLowerCase()),
  );
  const layer = document.createElement("div");
  layer.dataset.documentShapeSlotPicture = "pending";
  Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  let clipRef = "";
  if (painted.length) {
    const clipId = `document-shape-slot-picture-${++documentShapeMarkerSequence}`;
    const clip = svgElement("clipPath", { id: clipId, clipPathUnits: "objectBoundingBox" });
    for (const shape of painted) {
      const copy = shape.cloneNode(true) as SVGElement;
      copy.removeAttribute("filter");
      copy.removeAttribute("stroke");
      copy.removeAttribute("stroke-width");
      // The member's geometry is drawn in a 0..100 box; the clip's units are
      // the layer's own box (0..1).
      copy.setAttribute(
        "transform",
        `scale(0.01)${copy.getAttribute("transform") ? ` ${copy.getAttribute("transform")}` : ""}`,
      );
      clip.append(copy);
    }
    const clipSvg = svgElement("svg", { width: "0", height: "0", "aria-hidden": "true" });
    clipSvg.style.position = "absolute";
    const defs = svgElement("defs", {});
    defs.append(clip);
    clipSvg.append(defs);
    layer.append(clipSvg);
    clipRef = `url(#${clipId})`;
  }
  const { box, image } = slotPictureLayout(slot);
  const stretchBox = document.createElement("div");
  Object.assign(stretchBox.style, {
    position: "absolute",
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
    overflow: "hidden",
  });
  const frame = document.createElement("div");
  Object.assign(frame.style, {
    position: "absolute",
    inset: "0",
    ...(clipRef ? { clipPath: clipRef } : {}),
  });
  frame.append(stretchBox);
  layer.append(frame);
  // The outline over the picture: the painted shapes again, fill removed.
  const outline = memberSvg.cloneNode(true) as SVGSVGElement;
  for (const shape of Array.from(outline.children) as SVGElement[]) {
    if (["path", "rect", "circle", "ellipse", "polygon"].includes(shape.tagName.toLowerCase())) {
      shape.setAttribute("fill", "none");
      shape.removeAttribute("filter");
    }
  }
  outline.style.position = "absolute";
  outline.style.inset = "0";
  memberElement.insertBefore(layer, before);
  void media.then((images) => {
    const url = images?.[slot.embed];
    if (!url || !layer.isConnected) {
      layer.dataset.documentShapeSlotPicture = "unavailable";
      return;
    }
    const picture = document.createElement("img");
    picture.src = url;
    picture.alt = "";
    picture.setAttribute("aria-hidden", "true");
    picture.draggable = false;
    Object.assign(picture.style, {
      position: "absolute",
      left: `${image.left}%`,
      top: `${image.top}%`,
      width: `${image.width}%`,
      height: `${image.height}%`,
      objectFit: "fill",
      maxWidth: "none",
      pointerEvents: "none",
    });
    stretchBox.append(picture);
    layer.append(outline);
    layer.dataset.documentShapeSlotPicture = "drawn";
  });
}

/**
 * Shape Format > Edit Shape > Edit Points (and the shape's right-click Edit
 * Points) on a Docs shape: the toolbar names the node by position and the
 * node view at that position enters the shared vertex editor.
 */
export const DOCUMENT_SHAPE_EDIT_POINTS_EVENT = "mrai:document-shape-edit-points";
/**
 * The Selection Pane picks one object of a group (Microsoft Support, "Manage
 * objects with the Selection pane": a group's objects are listed under it and
 * each can be selected): the node view at `position` selects the group and
 * that member in it, as a press on the member does.
 */
export const DOCUMENT_SHAPE_SELECT_MEMBER_EVENT = "mrai:document-shape-select-member";
export interface DocumentShapeSelectMemberDetail {
  readonly position: number;
  readonly memberId: string;
}
/**
 * Said (on `window`) whenever an object picked inside a plain group (not a
 * SmartArt graphic) is picked or let go, so the ribbon's Arrange commands
 * read it again ({@link documentShapePickedGroupMember}).
 */
export const DOCUMENT_SHAPE_GROUP_MEMBER_PICK_EVENT = "mrai:document-shape-group-member-pick";

/** Each view's object picked inside a plain group: its group's place, read live. */
const pickedGroupMembers = new WeakMap<EditorView, { readonly position: () => number | undefined; readonly memberId: string }>();

/**
 * Delete on an object picked in a plain group (the group at `position`):
 * that object only, in one Undo step, the group staying selected; the
 * group's last object takes the group with it (Word deletes the item
 * selected inside its group). False, changing nothing, when the group
 * cannot lose it here: a connector glued to it, a SmartArt graphic, a
 * group whose objects were not read with their groups.
 */
export function deleteDocumentShapeGroupMember(view: EditorView, position: number, memberId: string): boolean {
  const { state } = view;
  const current = state.doc.nodeAt(position);
  const members = current?.attrs.groupMembers as readonly DocumentShapeGroupMember[] | null | undefined;
  if (!view.editable || !current || current.type.name !== "documentShape" || !members?.some((member) => member.memberId === memberId)) {
    return false;
  }
  if (typeof current.attrs.smartArtKind === "string" || documentShapeIsPreservedNativeSmartArt(current.attrs)) return false;
  if (members.length === 1) {
    view.dispatch(closeHistory(state.tr.delete(position, position + current.nodeSize)));
    return true;
  }
  if (!documentGroupMembersReorderable(current)) return false;
  const groupMembers = documentGroupMembersWithout(members, memberId);
  if (!groupMembers) return false;
  const transaction = closeHistory(
    state.tr.setNodeMarkup(position, undefined, { ...current.attrs, groupMembers }, current.marks),
  );
  view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, position)));
  return true;
}

/**
 * The object picked inside the selected plain group (select the group, then
 * the object; or its row in the Selection Pane): what Word's Bring Forward /
 * Send Backward and Delete act on (Microsoft Support, "Group shapes,
 * pictures, or other objects in Word": "To work with an individual item in
 * the group, select the group, and then select the item"). Null when the
 * group itself is what is selected, or the group is a SmartArt graphic.
 */
export function documentShapePickedGroupMember(
  editor: Pick<Editor, "isDestroyed" | "state" | "view">,
): { readonly pos: number; readonly node: ProseMirrorNode; readonly memberId: string } | null {
  if (editor.isDestroyed) return null;
  const picked = pickedGroupMembers.get(editor.view);
  if (!picked) return null;
  const { selection } = editor.state;
  const pos = picked.position();
  if (!(selection instanceof NodeSelection) || pos === undefined || selection.from !== pos) return null;
  const node = selection.node;
  const members = node.attrs.groupMembers as readonly DocumentShapeGroupMember[] | null | undefined;
  if (
    node.type.name !== "documentShape" ||
    typeof node.attrs.smartArtKind === "string" ||
    documentShapeIsPreservedNativeSmartArt(node.attrs) ||
    !members?.some((member) => member.memberId === picked.memberId)
  ) {
    return null;
  }
  return { pos, node, memberId: picked.memberId };
}
/**
 * Asks a shape's node view to open its in-shape text editor (dispatched on
 * the node's DOM, cancelable: the view cancels it when it opened). `seed`
 * is a typed key that replaces the words.
 */
export const DOCUMENT_SHAPE_TEXT_EDIT_EVENT = "mrai:document-shape-text-edit";
export interface DocumentShapeTextEditDetail {
  readonly seed?: string;
}

export interface DocumentShapeEditPointsDetail {
  readonly position: number;
}

/**
 * Whether Edit Points can start on this shape: an ordinary shape (not a group,
 * an ink stroke or a connector) whose outline is either its own custom path
 * or a preset drawn as one path, which Edit Points turns into one.
 */
export function documentShapeEditPointsAvailable(attrs: DocumentShapeAttrs): boolean {
  if (attrs.groupMembers?.length || attrs.inkTool) return false;
  const width = documentShapeEmuToPx(attrs.widthEmu);
  const height = documentShapeEmuToPx(attrs.heightEmu);
  if (attrs.customPath) return officeEditPathFromCustomPath(attrs.customPath, width, height) !== null;
  const definition = documentShapeDefinition(attrs.preset);
  if (definition.lineLike) return false;
  return officeEditPathFromPreset(definition.drawingPreset, width, height, attrs.adjustments) !== null;
}

/**
 * One finished Edit Points edit as the shape's attrs: its own custom path and
 * the box that follows the outline. The preset stays as the nearest auto-shape
 * a host that draws only presets can fall back to; the custom path wins
 * everywhere else, and the adjust values described the preset, not this
 * outline. Null when the path cannot be stored. The node view's Edit Points
 * and the AI's document.object.shape_edit_points write this.
 */
export function documentShapeEditedPathPatch(
  attrs: DocumentShapeAttrs,
  path: OfficeEditPath,
): Partial<DocumentShapeAttrs> | null {
  const result = officeCustomPathFromEdit(path);
  if (!result) return null;
  const box = officeCustomPathEditBox(
    {
      x: documentShapeEmuToPx(attrs.xEmu),
      y: documentShapeEmuToPx(attrs.yEmu),
      width: Math.max(1, documentShapeEmuToPx(attrs.widthEmu)),
      height: Math.max(1, documentShapeEmuToPx(attrs.heightEmu)),
    },
    result, attrs.rotation, attrs.flipH, attrs.flipV,
  );
  return {
    customPath: result.customPath,
    adjustments: undefined,
    xEmu: documentShapePxToEmu(box.x),
    yEmu: documentShapePxToEmu(box.y),
    widthEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, documentShapePxToEmu(box.width)),
    heightEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, documentShapePxToEmu(box.height)),
  };
}

const DEFAULT_DOCUMENT_SHAPE_LABELS: DocumentShapeNodeViewLabels = {
  shape: "Shape",
  textBox: "Text box",
  rotate: "Rotate shape",
  resize: {
    n: "Resize shape top",
    s: "Resize shape bottom",
    e: "Resize shape right",
    w: "Resize shape left",
    nw: "Resize shape top left",
    ne: "Resize shape top right",
    se: "Resize shape bottom right",
    sw: "Resize shape bottom left",
  },
  text: "Shape text",
  connectorLabel: "Connector label",
  picture: "Picture",
  moveConnectedShape: "Move connected shape",
  moveNamedShape: (name) => `Move ${name}`,
  smartArtPlaceholderTextOnly:
    "Office saved this graphic with empty text placeholders, so the file holds no text to edit.",
  smartArtTextNotEditable:
    "This graphic's text cannot be edited here; it is preserved as Office wrote it.",
  smartArtNeedsConnection: "This needs a connection. Nothing was changed.",
  smartArtLayoutFailed: "The graphic could not be laid out. Nothing was changed.",
  smartArtTextPrompt: "[Text]",
  editPoints: OFFICE_EDIT_POINTS_LABELS,
  adjustShape: "Adjust shape",
};

/**
 * Word's multi-object selection on the page: Shift / Ctrl + click adds a
 * floating shape to the selection (the last one clicked stays the editor's
 * NodeSelection), which Shape Format > Group > Group then groups. Positions
 * map through edits; a click elsewhere ends the multi-selection.
 */
export interface DocumentShapeMultiSelectionState {
  readonly positions: readonly number[];
  /**
   * Picked by Draw ▸ Lasso Select: the loop drawn, kept relative to the frame
   * around the strokes it took (lib/office-ink-lasso-selection). The strokes
   * then wear one shared frame instead of one each. Kept while the same
   * shapes stay picked (a move keeps it), dropped with the selection.
   */
  readonly lasso?: InkLassoAnchoredLoop | null;
  /**
   * The picked shapes themselves, to find them again when an edit takes them
   * out and puts them back (undo of a move, a peer's edit): a position alone
   * is lost with its node.
   */
  readonly nodes?: readonly ProseMirrorNode[];
}

export const documentShapeMultiSelectionKey = new PluginKey<DocumentShapeMultiSelectionState>(
  "documentShapeMultiSelection",
);

export function documentShapeMultiSelection(state: EditorState): readonly number[] {
  return documentShapeMultiSelectionKey.getState(state)?.positions ?? [];
}

/** The lasso's loop while the strokes it took are still the selection, else null. */
export function documentShapeLassoSelection(
  state: EditorState,
): { readonly positions: readonly number[]; readonly loop: InkLassoAnchoredLoop } | null {
  const value = documentShapeMultiSelectionKey.getState(state);
  return value?.lasso && value.positions.length > 0
    ? { positions: value.positions, loop: value.lasso }
    : null;
}









export function documentShapeMultiSelectionGroupState(
  state: EditorState,
): "none" | "refused" | "ready" {
  const positions = documentShapeMultiSelection(state);
  if (positions.length < 2) return "none";
  return documentObjectsGroupable(state.doc, positions) ? "ready" : "refused";
}

/**
 * A node the shapes' multi-selection holds: a shape, or a chart that floats
 * (Group takes one with the shapes beside it, as Word's does).
 */
export function documentShapePickable(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(
    node &&
      (node.type.name === "documentShape" ||
        documentChartPickable(node.type.name, node.attrs as Record<string, unknown>)),
  );
}

/**
 * The objects at `positions` as Group plans them: each shape with its attrs,
 * each floating chart as its member's chart at its frame. `place` puts a
 * chart's frame in the group's offsets (where it is DRAWN); without it the
 * frame stands at 0, 0, which only asks whether Group would take them.
 */
function documentGroupInputs(
  doc: ProseMirrorNode,
  positions: readonly number[],
  place?: (pos: number) => { readonly xEmu: number; readonly yEmu: number } | null,
): DocumentShapeGroupInput[] | null {
  const inputs: DocumentShapeGroupInput[] = [];
  for (const pos of positions) {
    const node = doc.nodeAt(pos);
    if (!node) return null;
    const attrs = node.attrs as Record<string, unknown>;
    if (node.type.name === "documentShape") {
      inputs.push({ pos, attrs });
      continue;
    }
    if (!documentChartGroupable(node.type.name, attrs)) return null;
    const at = place ? place(pos) : { xEmu: 0, yEmu: 0 };
    if (!at) return null;
    inputs.push({
      pos,
      attrs: { ...at, ...documentChartGroupSize(attrs), relativeHeight: documentChartFloatingHeight(attrs) },
      chart: documentChartGroupMemberChart(attrs),
    });
  }
  return inputs;
}

/**
 * Shift / Ctrl + click on a floating chart while a shape or another floating
 * chart is selected: the chart joins the picked objects (or leaves them), as
 * the same press on a shape does. False when the press is not such a pick.
 */
export function toggleDocumentChartPick(
  view: EditorView,
  position: number,
  event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
): boolean {
  if (!view.editable || !(event.shiftKey || event.ctrlKey || event.metaKey)) return false;
  const { state } = view;
  if (
    !(state.selection instanceof NodeSelection) ||
    !documentShapePickable(state.selection.node) ||
    !documentShapePickable(state.doc.nodeAt(position))
  ) {
    return false;
  }
  const current = documentShapeMultiSelection(state);
  const base = current.length ? current : [state.selection.from];
  const positions = base.includes(position) ? base.filter((pos) => pos !== position) : [...base, position];
  if (positions.length === 0) return false;
  const focus = positions.includes(position) ? position : positions[positions.length - 1]!;
  view.dispatch(
    state.tr
      .setSelection(NodeSelection.create(state.doc, focus))
      .setMeta(documentShapeMultiSelectionKey, { positions: positions.length > 1 ? positions : [] }),
  );
  return true;
}

/** Whether Group takes the objects at `positions` (two or more shapes, or shapes and floating charts). */
export function documentObjectsGroupable(doc: ProseMirrorNode, positions: readonly number[]): boolean {
  const unique = [...new Set(positions)];
  if (unique.length < 2) return false;
  const inputs = documentGroupInputs(doc, unique);
  return inputs !== null && documentShapeGroupAttrs(inputs) !== null;
}

/**
 * Word's Regroup (Shape Format > Group > Regroup; Microsoft Support, "Group or
 * ungroup shapes, pictures, or other objects"): the shapes the last Ungroup
 * took apart, by position, mapped through every edit. The memory goes when one
 * of them is deleted; like PowerPoint's, it lasts the editing session only.
 */
const documentShapeRegroupKey = new PluginKey<readonly number[]>("documentShapeRegroup");

function documentShapeRegroupPlugin(): Plugin<readonly number[]> {
  return new Plugin<readonly number[]>({
    key: documentShapeRegroupKey,
    state: {
      init: () => [],
      apply(tr, value, _oldState) {
        const meta = tr.getMeta(documentShapeRegroupKey) as readonly number[] | undefined;
        if (meta) return meta;
        if (!tr.docChanged || value.length === 0) return value;
        const mapped: number[] = [];
        for (const pos of value) {
          const result = mapPickedShape(tr, _oldState.doc, pos);
          if (result === null) return [];
          mapped.push(result);
        }
        return mapped;
      },
    },
  });
}

/**
 * The shapes Regroup would group again for the current selection: the last
 * Ungroup's members when a selected shape is one of them, they are all still
 * shapes, and Group would take them. Null otherwise.
 */
export function documentShapeRegroupPositions(state: EditorState): readonly number[] | null {
  const remembered = documentShapeRegroupKey.getState(state) ?? [];
  if (remembered.length < 2) return null;
  const selected = new Set(documentShapeMultiSelection(state));
  if (state.selection instanceof NodeSelection) selected.add(state.selection.from);
  if (!remembered.some((pos) => selected.has(pos))) return null;
  return documentObjectsGroupable(state.doc, remembered) ? remembered : null;
}










function mapPickedShape(tr: Transaction, before: ProseMirrorNode, pos: number): number | null {
  const node = before.nodeAt(pos);
  if (!node) return null;
  const start = tr.mapping.map(pos, 1);
  const end = tr.mapping.map(pos + node.nodeSize, -1);
  if (end - start !== node.nodeSize) return null;
  return documentShapePickable(tr.doc.nodeAt(start)) ? start : null;
}

/**
 * The picked shapes after `tr`: each mapped, and one the edit took out found
 * again by itself (the same node, else an equal one of its kind) wherever it
 * was put back -- the undo of a move onto another page, a peer's edit.
 */
/** A shape's identity and place, which a move or an undo rewrites; not its drawing. */
const PICK_PLACE_ATTRS: ReadonlySet<string> = new Set([
  "block_id", "anchor_id", "source", "xEmu", "yEmu", "floatAnchor", "relativeHeight", "zOrderStackComplete",
  "trackObjectDeletion", "trackObjectInsertion",
]);

function documentShapePickedAgain(tr: Transaction, before: ProseMirrorNode, value: DocumentShapeMultiSelectionState): number[] {
  const found: number[] = [];
  const missing: ProseMirrorNode[] = [];
  value.positions.forEach((pos, index) => {
    const mapped = mapPickedShape(tr, before, pos);
    if (mapped !== null) found.push(mapped);
    else if (value.nodes?.[index]) missing.push(value.nodes[index]!);
  });
  if (missing.length > 0) {
    const taken = new Set(found);
    const candidates: Array<{ node: ProseMirrorNode; pos: number }> = [];
    tr.doc.descendants((node, pos) => {
      if (!documentShapePickable(node)) return true;
      candidates.push({ node, pos });
      return false;
    });
    // The same node, else one drawn the same: its identity and its place
    // aside (a node put back by an undo carries the block id and the offsets
    // it had before the move), the drawing, size and words are the same.
    const drawnAlike = (a: ProseMirrorNode, b: ProseMirrorNode): boolean => {
      if (a.type !== b.type || !a.content.eq(b.content)) return false;
      const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
      for (const key of keys) {
        if (PICK_PLACE_ATTRS.has(key)) continue;
        if (JSON.stringify(a.attrs[key] ?? null) !== JSON.stringify(b.attrs[key] ?? null)) return false;
      }
      return true;
    };
    for (const node of missing) {
      const again =
        candidates.find((candidate) => !taken.has(candidate.pos) && candidate.node === node) ??
        candidates.find((candidate) => !taken.has(candidate.pos) && drawnAlike(candidate.node, node));
      if (again) {
        taken.add(again.pos);
        found.push(again.pos);
      }
    }
  }
  return [...new Set(found)].sort((a, b) => a - b);
}

function documentShapeMultiSelectionPlugin(): Plugin<DocumentShapeMultiSelectionState> {
  return new Plugin<DocumentShapeMultiSelectionState>({
    key: documentShapeMultiSelectionKey,
    state: {
      init: (): DocumentShapeMultiSelectionState => ({ positions: [] }),
      apply(tr, value, old, next) {
        const meta = tr.getMeta(documentShapeMultiSelectionKey) as DocumentShapeMultiSelectionState | undefined;
        const withNodes = (state: DocumentShapeMultiSelectionState): DocumentShapeMultiSelectionState =>
          state.positions.length === 0
            ? state
            : { ...state, nodes: state.positions.flatMap((pos) => next.doc.nodeAt(pos) ?? []) };
        if (meta) {
          const positions = [...new Set(meta.positions)].sort((a, b) => a - b);
          if (meta.lasso !== undefined) return withNodes(meta.lasso ? { positions, lasso: meta.lasso } : { positions });
          // The same shapes picked again (a move or a scale of them all):
          // the lasso's loop stays with them.
          const mapped = tr.docChanged
            ? value.positions.map((pos) => tr.mapping.map(pos))
            : value.positions;
          return withNodes(
            value.lasso && sameInkLassoIds(mapped, positions) ? { positions, lasso: value.lasso } : { positions },
          );
        }
        if (value.positions.length === 0) return value;
        const positions = tr.docChanged ? documentShapePickedAgain(tr, old.doc, value) : value.positions;
        if (positions.length === 0) return { positions: [] };
        // Only the writer's own move of the selection ends the pick: a click
        // or a key off the shapes (the lasso: a press outside its frame). An
        // edit that only carried the selection along -- the shapes moved onto
        // another paragraph, the pages relaid, an undo, a peer's edit, ink
        
        const selection = next.selection;
        const writerMovedSelection = tr.selectionSet && !tr.docChanged;
        if (
          (writerMovedSelection && (!(selection instanceof NodeSelection) || !positions.includes(selection.from))) ||
          positions.some((pos) => !documentShapePickable(next.doc.nodeAt(pos)))
        ) {
          return { positions: [] };
        }
        if (positions === value.positions) return value;
        return withNodes({ ...value, positions });
      },
    },
    appendTransaction(transactions, _old, state) {
      // The edit carried the editor's selection off the picked shapes (a node
      // taken out and put back leaves a caret beside it): it goes back on them.
      if (!transactions.some((tr) => tr.docChanged) || transactions.some((tr) => tr.selectionSet && !tr.docChanged)) return null;
      const picked = documentShapeMultiSelectionKey.getState(state);
      if (!picked || picked.positions.length === 0) return null;
      const { selection } = state;
      if (selection instanceof NodeSelection && picked.positions.includes(selection.from)) return null;
      const focus = picked.positions[picked.positions.length - 1]!;
      if (!documentShapePickable(state.doc.nodeAt(focus))) return null;
      return state.tr.setSelection(NodeSelection.create(state.doc, focus)).setMeta("addToHistory", false);
    },
    props: {
      decorations(state) {
        const positions = documentShapeMultiSelection(state);
        const lasso = documentShapeLassoSelection(state) !== null;
        if (positions.length < 2 && !lasso) return null;
        const attrs: Record<string, string> = positions.length > 1 ? { "data-multiselected": "true" } : {};
        // Picked by the lasso: one shared frame stands for each stroke's own.
        if (lasso) attrs[INK_LASSO_MEMBER_ATTRIBUTE] = "true";
        return DecorationSet.create(
          state.doc,
          positions.flatMap((pos) => {
            const node = state.doc.nodeAt(pos);
            return node ? [Decoration.node(pos, pos + node.nodeSize, attrs)] : [];
          }),
        );
      },
    },
  });
}

/**
 * Several shapes picked together move as one: the same offset (document
 * pixels) added to each, one Undo step; they stay picked. False when none
 * of them may move (in line with text).
 */
/**
 * The offsets (and anchor) a move of the shape at `pos` writes when an axis
 * it moves stands at a relative (percent) position: Word restates that axis
 * as an offset from its own origin (`documentShapePercentAxesMoved`). Empty
 * when the shape has no such axis.
 */
/** An in-line drawing's `wp:effectExtent` (`source.inlineEffectExtent`,
 * EMU left/top/right/bottom) as the stage's CSS margin; empty when none. */
function inlineEffectExtentMargin(source: unknown): string {
  const extent = source && typeof source === "object" ? (source as { inlineEffectExtent?: unknown }).inlineEffectExtent : null;
  if (!Array.isArray(extent) || extent.length !== 4 || !extent.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    return "";
  }
  const [left, top, right, bottom] = (extent as number[]).map((value) => `${Number((value / EMU_PER_PX).toFixed(3))}px`);
  return `${top} ${right} ${bottom} ${left}`;
}

/** `window.__docsSmartArtRunShadingOff = true`: an in-line drawing does not
 * paint the shading of its run (as before; A/B). */
function smartArtRunShadingOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsSmartArtRunShadingOff?: boolean }).__docsSmartArtRunShadingOff === true;
}

/** `window.__docsMemberTextOverflowOff = true`: a drawing member's words
 * (not a text box) are cut at its box, as before (A/B). */
function memberTextOverflowOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsMemberTextOverflowOff?: boolean }).__docsMemberTextOverflowOff === true;
}

/**
 * The shading of the run holding an in-line drawing (`source.hostRunShading`,
 * reading 49): Word lays it behind the whole drawing, its effect extent
 * included (corpus R441-D03: a SmartArt in a run shaded 4F6228 stands on a
 * dark green panel). The drawing's own box is filled; its effect extent
 * (laid out as the stage's margin in line) by one shadow per side.
 */
function inlineHostRunShading(source: unknown): { color: string; shadow: string } | null {
  if (smartArtRunShadingOff()) return null;
  const shading = source && typeof source === "object" ? (source as { hostRunShading?: unknown }).hostRunShading : null;
  if (typeof shading !== "string" || !/^#[0-9a-f]{6}$/i.test(shading)) return null;
  const extent = source && typeof source === "object" ? (source as { inlineEffectExtent?: unknown }).inlineEffectExtent : null;
  const sides = Array.isArray(extent) && extent.length === 4 && extent.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? (extent as number[]).map((value) => Number((value / EMU_PER_PX).toFixed(3)))
    : [0, 0, 0, 0];
  const [left, top, right, bottom] = sides;
  const shadows = [
    top > 0 ? `0 ${-top}px 0 0 ${shading}` : "",
    bottom > 0 ? `0 ${bottom}px 0 0 ${shading}` : "",
    left > 0 ? `${-left}px 0 0 0 ${shading}` : "",
    right > 0 ? `${right}px 0 0 0 ${shading}` : "",
  ].filter(Boolean);
  return { color: shading, shadow: shadows.join(", ") };
}

function percentMovePatch(
  view: EditorView,
  pos: number,
  attrs: Record<string, unknown>,
  patch: { xEmu?: unknown; yEmu?: unknown },
): Record<string, unknown> {
  if (!documentShapeAxisIsPercent(attrs.floatAnchor, "horizontal") && !documentShapeAxisIsPercent(attrs.floatAnchor, "vertical")) {
    return {};
  }
  const dom = view.nodeDOM(pos);
  const converted = documentShapePercentAxesMoved(
    attrs.floatAnchor,
    { xEmu: Number(attrs.xEmu ?? 0), yEmu: Number(attrs.yEmu ?? 0) },
    { xEmu: Number(patch.xEmu ?? attrs.xEmu ?? 0), yEmu: Number(patch.yEmu ?? attrs.yEmu ?? 0) },
    dom instanceof HTMLElement ? floatPaintOf(dom) : null,
  );
  return converted ?? {};
}

export function moveDocumentShapesBy(
  view: EditorView,
  positions: readonly number[],
  dxPx: number,
  dyPx: number,
): boolean {
  if (!view.editable) return false;
  let transaction = closeHistory(view.state.tr);
  let moved = false;
  for (const pos of positions) {
    const node = transaction.doc.nodeAt(pos);
    if (!node || node.type.name !== "documentShape") continue;
    const patch = documentShapeKeyPatch(node.attrs, { kind: "move", dx: dxPx, dy: dyPx });
    if (!patch) continue;
    transaction = transaction.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch, ...percentMovePatch(view, pos, node.attrs, patch) }, node.marks);
    moved = true;
  }
  if (!moved) return false;
  // Each object goes to the paragraph under its new place (Word's anchor
  // follows a moved object); a stroke over a seam is cut there.
  const scale = documentViewScale(view.dom);
  const placed = reanchorMovedDocumentFloats(
    view,
    transaction,
    positions.map((pos) => ({ pos, dxClient: dxPx * (scale.scaleX || 1), dyClient: dyPx * (scale.scaleY || 1), sizeKept: true })),
  );
  return dispatchMovedShapes(view, transaction, positions, placed);
}

/**
 * Dispatch a move of the shapes at `positions` (old places) that
 * `placed` says now stand elsewhere: they stay picked, the one the editor
 * had selected among them too.
 */
function dispatchMovedShapes(
  view: EditorView,
  transaction: Transaction,
  positions: readonly number[],
  placed: ReadonlyMap<number, readonly number[]>,
): boolean {
  const now = [...new Set(positions.flatMap((pos) => placed.get(pos) ?? [transaction.mapping.map(pos, 1)]))].sort((a, b) => a - b);
  const selection = view.state.selection;
  if (selection instanceof NodeSelection) {
    const focus = placed.get(selection.from)?.[0] ?? transaction.mapping.map(selection.from, 1);
    if (transaction.doc.nodeAt(focus)) transaction = transaction.setSelection(NodeSelection.create(transaction.doc, focus));
  }
  const lasso = documentShapeLassoSelection(view.state);
  view.dispatch(
    transaction.setMeta(documentShapeMultiSelectionKey, {
      // A single shape is kept too: found again when the pages are relaid.
      positions: now,
      ...(lasso ? { lasso: lasso.loop } : {}),
    }),
  );
  return true;
}

/**
 * Pick several shapes together (Draw ▸ Lasso Select): the last becomes the
 * editor's NodeSelection, all of them the multi-selection. False when one is
 * not a shape any more.
 */
export function selectDocumentShapes(
  view: EditorView,
  positions: readonly number[],
  options: { readonly lassoLoop?: readonly InkLassoPoint[] } = {},
): boolean {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const { doc } = view.state;
  if (sorted.length === 0 || sorted.some((pos) => doc.nodeAt(pos)?.type.name !== "documentShape")) return false;
  const focus = sorted[sorted.length - 1]!;
  if (options.lassoLoop) {
    // Draw ▸ Lasso Select: the strokes are picked as one (a single one too)
    // and the loop stays drawn around them, kept relative to the frame they
    // stand in (client pixels, as the loop was drawn).
    const box = inkLassoUnionBox(
      sorted.flatMap((pos) => {
        const rect = documentShapeClientRectAt(view, pos);
        return rect ? [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }] : [];
      }),
    );
    const loop = (box ? anchorInkLassoLoop(options.lassoLoop, box) : null) ?? { points: [] };
    view.dispatch(
      view.state.tr
        .setSelection(NodeSelection.create(doc, focus))
        .setMeta(documentShapeMultiSelectionKey, { positions: sorted, lasso: loop }),
    );
    return true;
  }
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(doc, focus))
      .setMeta(documentShapeMultiSelectionKey, { positions: sorted.length > 1 ? sorted : [] }),
  );
  return true;
}

/** The painted box of the shape at `pos` (its `.shape` element), or null --
 * null too for a stroke its sheet's layer draws (it has no box: see
 * `documentShapeClientRectAt`). */
export function documentShapeElementAt(view: EditorView, pos: number): HTMLElement | null {
  const box = view.nodeDOM(pos);
  return box instanceof HTMLElement ? box.querySelector<HTMLElement>(`.${styles.shape}`) : null;
}

/** Where the shape at `pos` is painted on screen: its box's rectangle, or,
 * for a stroke its sheet's layer draws, where the layer draws it. */
export function documentShapeClientRectAt(view: EditorView, pos: number): DOMRect | null {
  const element = documentShapeElementAt(view, pos);
  if (element) return element.getBoundingClientRect();
  const light = view.nodeDOM(pos);
  return light instanceof Element ? inkLightStandIn(view, light)?.getBoundingClientRect() ?? null : null;
}

/**
 * The line a stroke scaled to `to` takes: the one rule of the commit
 * (transformDocumentShapes) and of the preview the lasso's grip draws
 * (previewDocumentInkScale), so the line does not jump when the hand lifts.
 */
export function documentInkScaledLine(
  current: Pick<DocumentShapeAttrs, "outlineWidthPt" | "widthEmu" | "heightEmu">,
  to: { readonly widthEmu: number; readonly heightEmu: number },
): number {
  return inkLineWidthScaled(
    current.outlineWidthPt,
    { width: Math.max(1, current.widthEmu), height: Math.max(1, current.heightEmu) },
    { width: to.widthEmu, height: to.heightEmu },
    24,
  );
}

const inkScalePreviews = new WeakMap<HTMLElement, (size: { readonly widthPx: number; readonly heightPx: number } | null) => void>();

/**
 * Draw the stroke whose canvas is `element` at a new size, as the commit will
 * write it (its box and its scaled line), or, with `null`, as it is. The
 * lasso's grip previews with this: a CSS stretch of the old drawing drew the
 * line wider one way than the other and then jumped when the hand lifted.
 * False when the element is no stroke's canvas.
 */
export function previewDocumentInkScale(
  element: HTMLElement,
  size: { readonly widthPx: number; readonly heightPx: number } | null,
): boolean {
  const preview = inkScalePreviews.get(element);
  if (!preview) return false;
  preview(size);
  return true;
}

/**
 * Several shapes picked together scaled as one (the lasso frame's corner
 * grips): each takes an offset and a new size in document pixels, one Undo
 * step; they stay picked. False when none of them changed.
 */
export function transformDocumentShapes(
  view: EditorView,
  changes: ReadonlyArray<{
    readonly pos: number;
    readonly dxPx: number;
    readonly dyPx: number;
    readonly widthPx: number;
    readonly heightPx: number;
    /** The shape's turn (degrees) after the change; absent, it keeps its own. */
    readonly rotationDeg?: number;
  }>,
): boolean {
  if (!view.editable) return false;
  let transaction = closeHistory(view.state.tr);
  let changed = false;
  for (const change of changes) {
    const node = transaction.doc.nodeAt(change.pos);
    if (!node || node.type.name !== "documentShape") continue;
    const current = normalizeDocumentShapeAttrs(node.attrs);
    if (current.wrapMode === "inline") continue;
    const next = normalizeDocumentShapeAttrs({
      ...current,
      xEmu: current.xEmu + documentShapePxToEmu(change.dxPx),
      yEmu: current.yEmu + documentShapePxToEmu(change.dyPx),
      widthEmu: Math.max(1, documentShapePxToEmu(change.widthPx)),
      heightEmu: Math.max(1, documentShapePxToEmu(change.heightPx)),
    });
    const rotation =
      change.rotationDeg === undefined || !Number.isFinite(change.rotationDeg)
        ? current.rotation
        : Math.round((((change.rotationDeg % 360) + 360) % 360) * 10) / 10;
    if (
      next.xEmu === current.xEmu &&
      next.yEmu === current.yEmu &&
      next.widthEmu === current.widthEmu &&
      next.heightEmu === current.heightEmu &&
      rotation === current.rotation
    ) {
      continue;
    }
    // A stroke scales as a picture does: its line thins and thickens with
    // its box, as the preview drew it (documentInkScaledLine).
    const inkWidth = current.inkTool ? { outlineWidthPt: documentInkScaledLine(current, next) } : {};
    transaction = transaction.setNodeMarkup(
      change.pos,
      undefined,
      {
        ...node.attrs,
        xEmu: next.xEmu,
        yEmu: next.yEmu,
        widthEmu: next.widthEmu,
        heightEmu: next.heightEmu,
        ...percentMovePatch(view, change.pos, node.attrs, next),
        ...inkWidth,
        ...(rotation !== current.rotation ? { rotation } : {}),
      },
      node.marks,
    );
    changed = true;
  }
  if (!changed) return false;
  // Each object goes to the paragraph under its new place (Word's anchor
  // follows a moved object). Scaled, a stroke keeps its single node.
  const scale = documentViewScale(view.dom);
  const placed = reanchorMovedDocumentFloats(
    view,
    transaction,
    changes.map((change) => ({
      pos: change.pos,
      dxClient: change.dxPx * (scale.scaleX || 1),
      dyClient: change.dyPx * (scale.scaleY || 1),
      sizeKept: false,
    })),
  );
  const multi = documentShapeMultiSelection(view.state);
  return dispatchMovedShapes(view, transaction, multi.length > 0 ? multi : changes.map((change) => change.pos), placed);
}

/** Several shapes picked together, deleted in one Undo step; the caret goes where the first stood. */
export function deleteDocumentShapes(view: EditorView, positions: readonly number[]): boolean {
  if (!view.editable) return false;
  const sorted = [...new Set(positions)].sort((a, b) => b - a);
  let transaction = closeHistory(view.state.tr);
  for (const pos of sorted) {
    const node = transaction.doc.nodeAt(pos);
    if (!node || !documentShapePickable(node)) return false;
    transaction = transaction.delete(pos, pos + node.nodeSize);
  }
  const first = transaction.mapping.map(sorted[sorted.length - 1] ?? 0);
  const $first = transaction.doc.resolve(Math.max(0, Math.min(transaction.doc.content.size, first)));
  const caret = TextSelection.findFrom($first, 1, true) ?? TextSelection.findFrom($first, -1, true);
  if (caret) transaction = transaction.setSelection(caret);
  view.dispatch(transaction.setMeta(documentShapeMultiSelectionKey, { positions: [] }));
  return true;
}

/**
 * Arrows on the selected floating shape, as Word nudges one (the shared
 * reading, `lib/office-object-nudge`): move a set step, Ctrl one SCREEN
 * pixel, Shift resize, Alt + Left / Right rotate 15 degrees; one history
 * step each. An inline shape, or several shapes at once, leave the key to
 * the editor.
 */
function documentShapeKeyboardPlugin(): Plugin {
  return new Plugin({
    props: {
      // A SmartArt graphic selected as a whole (its frame, or an arrow the
      // press landed on, which is not one of its item shapes) is not a run of
      // text: a typed character went into the page in its place and the whole
      // diagram was gone. Word and PowerPoint never replace a graphic with a
      // keystroke; a key typed on a selected SHAPE opens that shape's words
      // (the node view's own editor, which takes the focus first).
      handleTextInput(view) {
        const selection = view.state.selection;
        return (
          view.editable &&
          selection instanceof NodeSelection &&
          selection.node.type.name === "documentShape" &&
          typeof selection.node.attrs.smartArtKind === "string" &&
          Boolean(selection.node.attrs.groupMembers?.length)
        );
      },
      handleKeyDown(view, event) {
        const selection = view.state.selection;
        const several = documentShapeMultiSelection(view.state);
        if (view.editable && selection instanceof NodeSelection && several.length > 1) {
          // Several shapes picked together (Shift / Ctrl + click, Draw ▸
          // Lasso Select) go together: Delete removes them all, the arrows
          // move them all, one Undo step each, as in Word.
          if (
            (event.key === "Delete" || event.key === "Backspace") &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            event.preventDefault();
            return deleteDocumentShapes(view, several);
          }
          const rendered = view.dom.getBoundingClientRect().width;
          const laidOut = (view.dom as HTMLElement).offsetWidth;
          const action = officeObjectKeyAction(event, rendered > 0 && laidOut > 0 ? rendered / laidOut : 1);
          if (action?.kind === "move") {
            event.preventDefault();
            moveDocumentShapesBy(view, several, action.dx, action.dy);
            return true;
          }
          // Shift + arrow and Alt + arrow size and turn every selected shape
          // on its own, as if each were selected alone (Microsoft Support,
          // "Keyboard shortcuts for SmartArt graphics"); the keys did nothing
          // to the selection, or went to the page.
          if (action) {
            event.preventDefault();
            let transaction = view.state.tr;
            for (const pos of several) {
              const node = transaction.doc.nodeAt(pos);
              if (!node || node.type.name !== "documentShape") continue;
              // A whole SmartArt graphic does not turn (Word refuses its
              // rotation); a plain shape or group does.
              if (action.kind === "rotate" && typeof node.attrs.smartArtKind === "string" && node.attrs.groupMembers?.length) {
                continue;
              }
              const patch = documentShapeKeyPatch(node.attrs, action);
              if (patch) transaction = transaction.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }, node.marks);
            }
            if (!transaction.docChanged) return true;
            transaction.setSelection(NodeSelection.create(transaction.doc, selection.from));
            transaction.setMeta(documentShapeMultiSelectionKey, { positions: several });
            view.dispatch(transaction);
            return true;
          }
          return false;
        }
        const shapeName = selection instanceof NodeSelection ? selection.node.type.name : null;
        if (
          !view.editable ||
          !(selection instanceof NodeSelection) ||
          (shapeName !== "documentShape" && shapeName !== INLINE_SHAPE_NODE_NAME)
        ) {
          return false;
        }
        // Enter / F2 / a typed key edit the shape's words, as in Word; a
        // typed key must never replace the selected shape with text.
        const textKey = officeObjectTextKey(event);
        if (textKey) {
          const dom = view.nodeDOM(selection.from);
          const request = new CustomEvent<DocumentShapeTextEditDetail>(
            DOCUMENT_SHAPE_TEXT_EDIT_EVENT,
            {
              cancelable: true,
              detail: textKey.kind === "type" ? { seed: textKey.seed } : {},
            },
          );
          const opened = dom instanceof HTMLElement && !dom.dispatchEvent(request);
          if (opened || textKey.kind === "type") {
            event.preventDefault();
            return true;
          }
        }
        // A shape In Line with Text moves with its line, not by the arrows.
        if (shapeName === INLINE_SHAPE_NODE_NAME) return false;
        const rendered = view.dom.getBoundingClientRect().width;
        const laidOut = (view.dom as HTMLElement).offsetWidth;
        const zoom = rendered > 0 && laidOut > 0 ? rendered / laidOut : 1;
        const action = officeObjectKeyAction(event, zoom);
        if (!action) return false;
        // Alt + arrow on a whole SmartArt graphic: Word turns no whole
        
        // shapes, selected inside it, turns through its own keys.
        if (
          action.kind === "rotate" &&
          typeof selection.node.attrs.smartArtKind === "string" &&
          selection.node.attrs.groupMembers?.length
        ) {
          event.preventDefault();
          return true;
        }
        // Nudged onto another paragraph or page, the shape is anchored there.
        if (action.kind === "move") return moveDocumentShapesBy(view, [selection.from], action.dx, action.dy);
        const patch = documentShapeKeyPatch(selection.node.attrs, action);
        if (!patch) return false;
        const transaction = view.state.tr.setNodeMarkup(
          selection.from,
          undefined,
          { ...selection.node.attrs, ...patch },
          selection.node.marks,
        );
        transaction.setSelection(NodeSelection.create(transaction.doc, selection.from));
        view.dispatch(transaction);
        return true;
      },
    },
  });
}

/**
 * The top-left corner of a shape's drawn box, in the document's own (unzoomed)
 * pixels: the stage's corner plus the box's margins and its stroke padding.
 * Null when the shape is not drawn.
 */
function drawnShapeOrigin(
  view: EditorView,
  pos: number,
): { readonly x: number; readonly y: number } | null {
  const root = view.nodeDOM(pos);
  if (!(root instanceof HTMLElement)) return null;
  const stage = root.querySelector<HTMLElement>(`.${styles.stage}`);
  const shape = stage?.querySelector<HTMLElement>(`.${styles.shape}`);
  const node = view.state.doc.nodeAt(pos);
  if (!stage || !shape || !node) return null;
  const rendered = view.dom.getBoundingClientRect().width;
  const laidOut = (view.dom as HTMLElement).offsetWidth;
  const zoom = rendered > 0 && laidOut > 0 ? rendered / laidOut : 1;
  const rect = stage.getBoundingClientRect();
  const width = documentShapeEmuToPx(Number(node.attrs.widthEmu) || 0);
  const height = documentShapeEmuToPx(Number(node.attrs.heightEmu) || 0);
  return {
    x:
      rect.left / zoom +
      (parseFloat(shape.style.marginLeft) || 0) +
      (shape.offsetWidth - width) / 2,
    y:
      rect.top / zoom +
      (parseFloat(shape.style.marginTop) || 0) +
      (shape.offsetHeight - height) / 2,
  };
}

/**
 * The top-left corner of a floating chart's drawn box, in the document's own
 * (unzoomed) pixels, as {@link drawnShapeOrigin} reads a shape's. Null when
 * the chart is not drawn.
 */
function drawnChartOrigin(view: EditorView, pos: number): { readonly x: number; readonly y: number } | null {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const wrapper = dom.matches(".chart-block-wrapper") ? dom : dom.querySelector<HTMLElement>(".chart-block-wrapper");
  if (!wrapper) return null;
  const rendered = view.dom.getBoundingClientRect().width;
  const laidOut = (view.dom as HTMLElement).offsetWidth;
  const zoom = rendered > 0 && laidOut > 0 ? rendered / laidOut : 1;
  const rect = wrapper.getBoundingClientRect();
  return { x: rect.left / zoom, y: rect.top / zoom };
}

/**
 * Word's Group on the shapes -- and the floating charts -- at `positions`:
 * one `documentShape` group in the first shape's place, each member where it
 * is drawn. A chart becomes a member of `kind: "chart"` (`documentChartGroup`).
 */
/**
 * A floating shape's anchor restated for a frame cut from it: the origins,
 * the wrap and Behind Text of `anchor`, the frame's own offsets, size, turn,
 * mirror and place in the floating stack. Word's group floats by the anchor
 * its shapes floated by and gives it back to each shape at Ungroup; a node
 * with no anchor stands in the flow (`documentShapeFloatMode`), so a group of
 * floating shapes built without one dropped into the text as a block, and
 * an ungrouped member likewise.
 */
function floatAnchorForFrame(
  anchor: FloatAnchor,
  frame: Pick<DocumentShapeAttrs, "xEmu" | "yEmu" | "widthEmu" | "heightEmu" | "rotation" | "flipH" | "flipV" | "relativeHeight">,
): FloatAnchor {
  const { groupTransform: _groupTransform, ...own } = anchor;
  void _groupTransform;
  return {
    ...own,
    horizontal: { relativeFrom: anchor.horizontal.relativeFrom, offsetEmu: frame.xEmu },
    vertical: { relativeFrom: anchor.vertical.relativeFrom, offsetEmu: frame.yEmu },
    widthEmu: frame.widthEmu,
    heightEmu: frame.heightEmu,
    rotation: frame.rotation,
    flipH: frame.flipH,
    flipV: frame.flipV,
    relativeHeight: frame.relativeHeight ?? anchor.relativeHeight,
    simplePos: false,
  };
}








function documentObjectsInView(view: EditorView, positions: readonly number[]): boolean {
  const root = view.dom as HTMLElement;
  const scroller = root.closest<HTMLElement>(".note-window-scroll");
  const win = root.ownerDocument.defaultView;
  const frame = scroller?.getBoundingClientRect() ?? { top: 0, left: 0, bottom: win?.innerHeight ?? 0, right: win?.innerWidth ?? 0 };
  return positions.some((pos) => {
    const dom = view.nodeDOM(pos);
    const element = dom instanceof HTMLElement ? dom.querySelector("[data-document-shape-canvas]") ?? dom : null;
    const rect = element?.getBoundingClientRect();
    return Boolean(rect && rect.bottom > frame.top && rect.top < frame.bottom && rect.right > frame.left && rect.left < frame.right);
  });
}

export function groupDocumentShapes(
  editor: Editor,
  expectedDoc: ProseMirrorNode,
  positions: readonly number[],
): number | null {
  if (!editor.isEditable || editor.state.doc !== expectedDoc) return null;
  const uniquePositions = [...new Set(positions)].sort(
    (left, right) => left - right,
  );
  const shapeType = editor.schema.nodes.documentShape;
  // The group takes the first SHAPE's place and paragraph: a chart has no
  // shape offsets of its own to give it.
  const hostPos = uniquePositions.find((pos) => expectedDoc.nodeAt(pos)?.type === shapeType);
  const hostNode = hostPos === undefined ? null : expectedDoc.nodeAt(hostPos);
  if (!shapeType || hostPos === undefined || !hostNode) return null;
  // Where each object is DRAWN, so the members keep their places on the page:
  // two shapes in the flow state the same offsets from their own lines, and
  // a group built from those offsets alone put them on top of each other
  
  // between them as drawn.
  const hostOrigin = drawnShapeOrigin(editor.view, hostPos);
  const base = hostNode.attrs as Record<string, unknown>;
  const offsetFromHost = (origin: { x: number; y: number } | null) =>
    hostOrigin && origin
      ? {
          xEmu: Number(base.xEmu ?? 0) + documentShapePxToEmu(origin.x - hostOrigin.x),
          yEmu: Number(base.yEmu ?? 0) + documentShapePxToEmu(origin.y - hostOrigin.y),
        }
      : null;
  const inputs = documentGroupInputs(expectedDoc, uniquePositions, (pos) =>
    // A chart cannot stand by offsets it does not state: it is grouped only
    // where it is drawn.
    offsetFromHost(drawnChartOrigin(editor.view, pos)),
  );
  if (!inputs) return null;
  const placed = inputs.map((input) => {
    if (input.chart || input.pos === hostPos) return input;
    const offsets = offsetFromHost(drawnShapeOrigin(editor.view, input.pos));
    return offsets ? { ...input, attrs: { ...input.attrs, ...offsets } } : input;
  });
  const groupAttrs = documentShapeGroupAttrs(placed);
  if (!groupAttrs) return null;

  const inView = documentObjectsInView(editor.view, uniquePositions);
  let transaction = closeHistory(editor.state.tr);
  for (const pos of [...uniquePositions].reverse()) {
    if (pos === hostPos) continue;
    const node = transaction.doc.nodeAt(pos);
    if (!node) return null;
    transaction = transaction.delete(pos, pos + node.nodeSize);
  }
  const groupPosition = transaction.mapping.map(hostPos);
  const firstNode = transaction.doc.nodeAt(groupPosition);
  if (firstNode?.type !== shapeType) return null;
  // A group of floating shapes floats as they did: by the first shape's
  // anchor (its paragraph, its wrap), at the group's own frame.
  const hostAnchor = normalizeFloatAnchor(hostNode.attrs.floatAnchor);
  transaction = transaction.replaceWith(
    groupPosition,
    groupPosition + firstNode.nodeSize,
    shapeType.create(
      hostAnchor && groupAttrs.wrapMode !== "inline"
        ? { ...groupAttrs, floatAnchor: floatAnchorForFrame(hostAnchor, groupAttrs) }
        : groupAttrs,
    ),
  );
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, groupPosition),
  );
  editor.view.dispatch(inView ? transaction : transaction.scrollIntoView());
  editor.view.focus();
  return groupPosition;
}

export function ungroupDocumentShape(
  editor: Editor,
  expectedDoc: ProseMirrorNode,
  position: number,
): boolean {
  if (!editor.isEditable || editor.state.doc !== expectedDoc) return false;
  const node = expectedDoc.nodeAt(position);
  const shapeType = editor.schema.nodes.documentShape;
  if (node?.type !== shapeType) return false;
  const released = documentShapeUngroupMembers(
    node.attrs as Record<string, unknown>,
  );
  if (!released?.length) return false;
  // A chart member is the chart again (Word's Ungroup "leaves the individual
  // objects in their current location"), floating where it stood.
  const chartType = editor.schema.nodes.chart;
  if (released.some(({ chart }) => chart !== null) && !chartType) return false;
  // Each shape that leaves a floating group floats again, by the group's
  // anchor at its own frame (Word: Ungroup "leaves the individual objects in
  // their current location").
  const groupAnchor = normalizeFloatAnchor(node.attrs.floatAnchor);
  let members: ProseMirrorNode[];
  try {
    members = released.map(({ attrs, chart }) =>
      chart
        ? chartType!.create(documentChartFromGroupMember(chart, attrs))
        : shapeType.create(
            groupAnchor && attrs.wrapMode !== "inline"
              ? { ...attrs, floatAnchor: floatAnchorForFrame(groupAnchor, attrs) }
              : attrs,
          ),
    );
  } catch {
    return false;
  }
  const inView = documentObjectsInView(editor.view, [position]);
  let transaction = closeHistory(editor.state.tr).replaceWith(
    position,
    position + node.nodeSize,
    members,
  );
  // Regroup's memory: where each former member now stands.
  let memberPos = position;
  transaction = transaction.setMeta(
    documentShapeRegroupKey,
    members.map((member) => {
      const at = memberPos;
      memberPos += member.nodeSize;
      return at;
    }),
  );
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, position),
  );
  editor.view.dispatch(inView ? transaction : transaction.scrollIntoView());
  editor.view.focus();
  return true;
}

/**
 * Shape Format > Align > Align Selected Objects on the shapes Shift / Ctrl +
 * clicked on the page (Word's and PowerPoint's Align on two or more objects;
 * Distribute on three or more): the edges and centres are taken from where the
 * shapes are DRAWN, as Group measures them, so two shapes anchored to
 * different paragraphs line up on the page; each moves by its own offset and
 * keeps its size. `dryRun` answers whether the command applies.
 */
export function alignDocumentShapes(
  editor: Editor,
  positions: readonly number[],
  action: "left" | "center" | "right" | "top" | "middle" | "bottom" | "distributeHorizontal" | "distributeVertical",
  dryRun = false,
): boolean {
  if (!editor.isEditable) return false;
  const distribute = action === "distributeHorizontal" || action === "distributeVertical";
  if (positions.length < (distribute ? 3 : 2)) return false;
  const doc = editor.state.doc;
  const items = positions.map((pos) => {
    const node = doc.nodeAt(pos);
    if (node?.type.name !== "documentShape" || node.attrs.wrapMode === "inline") return null;
    const origin = drawnShapeOrigin(editor.view, pos);
    if (!origin) return null;
    return {
      pos,
      node,
      box: {
        left: origin.x,
        top: origin.y,
        width: documentShapeEmuToPx(Number(node.attrs.widthEmu) || 0),
        height: documentShapeEmuToPx(Number(node.attrs.heightEmu) || 0),
      },
    };
  });
  if (items.some((item) => item === null)) return false;
  if (dryRun) return true;
  const boxes = items.map((item) => item!.box);
  const placed = distribute
    ? distributeBlocks(boxes, action === "distributeHorizontal" ? "horizontal" : "vertical")
    : alignBlocks(
        boxes,
        ({ left: "left", center: "hcenter", right: "right", top: "top", middle: "vcenter", bottom: "bottom" } as const)[
          action as "left" | "center" | "right" | "top" | "middle" | "bottom"
        ],
      );
  const bound = (value: number) =>
    Math.max(-DOCUMENT_SHAPE_MAX_EDGE_EMU, Math.min(DOCUMENT_SHAPE_MAX_EDGE_EMU, Math.round(value)));
  let transaction = closeHistory(editor.state.tr);
  items.forEach((item, index) => {
    const dx = placed[index].left - boxes[index].left;
    const dy = placed[index].top - boxes[index].top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const attrs = item!.node.attrs;
    const offsets = {
      xEmu: bound(Number(attrs.xEmu ?? 0) + documentShapePxToEmu(dx)),
      yEmu: bound(Number(attrs.yEmu ?? 0) + documentShapePxToEmu(dy)),
    };
    transaction = transaction.setNodeMarkup(item!.pos, undefined, {
      ...attrs,
      ...offsets,
      ...percentMovePatch(editor.view, item!.pos, attrs, offsets),
    });
  });
  if (!transaction.docChanged) return true;
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection) {
    transaction = transaction.setSelection(NodeSelection.create(transaction.doc, selection.from));
  }
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/**
 * The two shapes Shift / Ctrl + clicked on the page as Merge Shapes reads them
 * (`lib/office-shape-merge-client`): the first one's frame in pixels from its
 * own offsets, the second placed by where the two are DRAWN (the rule Group
 * uses: two shapes in the flow state offsets from their own lines). Null when
 * the selection is not exactly two plain shapes Group would take, or either
 * has no fillable outline.
 */
export function documentShapeMergeInputs(
  editor: Editor,
  positions: readonly number[],
): { readonly first: MergeableShape; readonly second: MergeableShape; readonly positions: readonly [number, number] } | null {
  if (positions.length !== 2) return null;
  const nodes = positions.map((pos) => editor.state.doc.nodeAt(pos));
  if (nodes.some((node) => node?.type.name !== "documentShape")) return null;
  const inputs = positions.map((pos, index) => ({ pos, attrs: nodes[index]!.attrs as Record<string, unknown> }));
  if (documentShapeGroupAttrs(inputs) === null) return null;
  const attrs = nodes.map((node) => normalizeDocumentShapeAttrs(node!.attrs));
  if (attrs.some((shape) => shape.groupMembers?.length || shape.inkTool || shape.smartArtKind)) return null;
  const origins = positions.map((pos) => drawnShapeOrigin(editor.view, pos));
  const fields = attrs.map((shape, index): MergeableShape => {
    const definition = documentShapeDefinition(shape.preset);
    const points = shape.customPath ? officeCustomPathMergePoints(shape.customPath) : null;
    const drawnFirst = origins[0];
    const drawn = origins[index];
    const placed = index > 0 && drawnFirst && drawn;
    const left = placed
      ? documentShapeEmuToPx(attrs[0].xEmu) + drawn.x - drawnFirst.x
      : documentShapeEmuToPx(shape.xEmu);
    const top = placed
      ? documentShapeEmuToPx(attrs[0].yEmu) + drawn.y - drawnFirst.y
      : documentShapeEmuToPx(shape.yEmu);
    return {
      // A custom outline merges only as one closed run of straight sides.
      shape: shape.customPath ? (points ? "rectangle" : "custom-geometry") : definition.lineLike ? "line" : definition.previewKind,
      ...(points ? { points } : {}),
      left,
      top,
      width: documentShapeEmuToPx(shape.widthEmu),
      height: documentShapeEmuToPx(shape.heightEmu),
      rotation: shape.rotation,
      flipH: shape.flipH,
      flipV: shape.flipV,
    };
  });
  const [first, second] = fields;
  if (!officeShapesMergeable(first, second)) return null;
  return { first, second, positions: [positions[0], positions[1]] };
}

/**
 * Apply Merge Shapes' answer: the results take the first shape's place, paint
 * and stacking (PowerPoint keeps the first selected shape's formatting), the
 * second shape goes, in one Undo step. The results are in the pixels
 * `documentShapeMergeInputs` measured from the first shape's own offsets.
 */
export function applyDocumentShapeMerge(
  editor: Editor,
  expectedDoc: ProseMirrorNode,
  positions: readonly [number, number],
  results: readonly MergedShapeResult[],
): number | null {
  if (!editor.isEditable || editor.state.doc !== expectedDoc || results.length === 0) return null;
  const shapeType = editor.schema.nodes.documentShape;
  const firstNode = expectedDoc.nodeAt(positions[0]);
  const secondNode = expectedDoc.nodeAt(positions[1]);
  if (!shapeType || firstNode?.type !== shapeType || secondNode?.type !== shapeType) return null;
  const base = firstNode.attrs as Record<string, unknown>;
  const merged = results.flatMap((result) => {
    const customPath = officeMergedShapeCustomPath(result);
    if (!customPath) return [];
    return [
      shapeType.create({
        ...base,
        preset: "rect",
        customPath,
        adjustments: undefined,
        xEmu: documentShapePxToEmu(result.left),
        yEmu: documentShapePxToEmu(result.top),
        widthEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, documentShapePxToEmu(result.width)),
        heightEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, documentShapePxToEmu(result.height)),
        rotation: 0,
        flipH: false,
        flipV: false,
        text: "",
        textBody: null,
        textRuns: null,
        name: undefined,
        altText: "",
        source: null,
      }),
    ];
  });
  if (merged.length === 0) return null;
  const [front, back] = positions[0] < positions[1] ? positions : [positions[1], positions[0]];
  let transaction = closeHistory(editor.state.tr);
  const backNode = expectedDoc.nodeAt(back)!;
  // Later one first, so the earlier position still names its node.
  if (back === positions[1]) {
    transaction = transaction.delete(back, back + backNode.nodeSize);
    transaction = transaction.replaceWith(front, front + firstNode.nodeSize, merged);
  } else {
    transaction = transaction.replaceWith(back, back + firstNode.nodeSize, merged);
    transaction = transaction.delete(front, front + secondNode.nodeSize);
  }
  const at = transaction.mapping.map(positions[0], -1);
  const landed = transaction.doc.nodeAt(at)?.type === shapeType ? at : null;
  if (landed !== null) transaction = transaction.setSelection(NodeSelection.create(transaction.doc, landed));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return landed;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

/**
 * Paint a shape's `a:headEnd` / `a:tailEnd` onto this canvas.
 *
 * One marker per END, drawn by the SHARED native primitive, so a document and
 * a slide put the same arrowhead on the same outline; WHERE they land is the
 * measured Office rule (`nativeLineEndPlacements`, SHAPE-IMPORT-AUDIT.md
 * §7.10): a closed path takes none, the first open stroked path takes the head
 * and the last takes the tail, and every sub-path of those is decorated.
 */
function paintLineEnds(
  svg: SVGSVGElement,
  paths: readonly { readonly d: string; readonly stroke?: boolean }[],
  ends: { head: NativeLineEnd | null; tail: NativeLineEnd | null },
  stroke: string,
): void {
  if (!ends.head && !ends.tail) return;
  const markerId =
    svg.dataset.documentShapeMarkerId ??
    `document-shape-arrow-${++documentShapeMarkerSequence}`;
  svg.dataset.documentShapeMarkerId = markerId;
  const defs = svgElement("defs", {});
  for (const side of ["head", "tail"] as const) {
    const end = ends[side];
    if (!end) continue;
    const scale = 10 / 3;
    const marker = svgElement("marker", {
      id: `${markerId}-${side}`,
      viewBox: "0 0 6 6",
      markerWidth: end.length * scale,
      markerHeight: end.width * scale,
      refX: 6,
      refY: 3,
      orient: "auto-start-reverse",
      markerUnits: "userSpaceOnUse",
    });
    marker.append(
      svgElement("path", {
        d: nativeLineEndPath(end.type),
        fill: end.type === "arrow" ? "none" : stroke,
        stroke: end.type === "arrow" ? stroke : "none",
        "stroke-width": 0.75,
      }),
    );
    defs.append(marker);
  }
  svg.append(defs);
  // The carriers paint nothing themselves: SVG puts `marker-start`/`marker-end`
  // on the first and last vertex of a WHOLE path, which on a bracket pair is
  // two tips of four and on a rectangle is a corner Office decorates nowhere.
  for (const placement of nativeLineEndPlacements(paths)) {
    svg.append(
      svgElement("path", {
        d: placement.d,
        fill: "none",
        stroke: "none",
        "vector-effect": "non-scaling-stroke",
        "data-office-line-end-carrier": "true",
        ...(ends.head && placement.head
          ? { "marker-start": `url(#${markerId}-head)` }
          : {}),
        ...(ends.tail && placement.tail
          ? { "marker-end": `url(#${markerId}-tail)` }
          : {}),
      }),
    );
  }
}

/** The two decorations a shape's own `a:ln` states, as drawable ends. */
function documentShapeLineEnds(attrs: DocumentShapeAttrs): {
  head: NativeLineEnd | null;
  tail: NativeLineEnd | null;
} {
  return {
    head: readNativeLineEnd({
      type: attrs.headEnd,
      ...(attrs.headEndWidth ? { w: attrs.headEndWidth } : {}),
      ...(attrs.headEndLength ? { len: attrs.headEndLength } : {}),
    }),
    tail: readNativeLineEnd({
      type: attrs.tailEnd,
      ...(attrs.tailEndWidth ? { w: attrs.tailEndWidth } : {}),
      ...(attrs.tailEndLength ? { len: attrs.tailEndLength } : {}),
    }),
  };
}

/**
 * A shape's `shapeEffects` drawn by the editors' shared painter
 * (`lib/office-shape-effects-paint`): soft edges, an inner shadow and a bevel
 * as an SVG filter on the shape's own alpha, an outer shadow and a glow as
 * drop-shadows, a reflection below and a 3-D rotation as the camera turns it.
 * A Perspective shadow's scale and skew are not drawn here (its offset and
 * blur are). Lengths are the file's EMU in CSS pixels.
 */
function documentShapeEffectsPaint(
  svg: SVGSVGElement,
  attrs: DocumentShapeAttrs,
  /** The group's flips around a member's (`DocumentShapePaintOptions.groupFlip`). */
  groupFlip?: { readonly flipH?: boolean; readonly flipV?: boolean } | null,
): { filter: string; reflect: string; transform: string; outerShadow: boolean } {
  const effects = attrs.shapeEffects ? normalizeDocumentShapeEffects(attrs.shapeEffects) : null;
  // Shape Outline > Sketched; a shape Word already sketched carries the drawn
  // path as its own geometry and is not sketched again.
  const sketch =
    (attrs.source as { nativeSketchGeometry?: unknown } | undefined)?.nativeSketchGeometry === "baked"
      ? undefined
      : normalizeOfficeLineSketch(attrs.outlineSketch);
  const paint = effects || sketch
    ? officeShapeEffectsPaint(
        effects ?? undefined,
        {
          width: Math.max(1, attrs.widthEmu / EMU_PER_PX),
          height: Math.max(1, attrs.heightEmu / EMU_PER_PX),
        },
        {
          sketch,
          seed: officeSketchSeed(`${attrs.preset}:${attrs.widthEmu}x${attrs.heightEmu}`),
          // The svg wears its flips OUTSIDE the painted turn (the shape's
          // mirror is written in front of it; a member's box and its group's
          // layer mirror around it), so the 3-D turn is taken through them:
          // a group's mirror composed with its member's is one flip on each
          // axis that either flips.
          frame: {
            rotation: attrs.rotation,
            flipH: (attrs.flipH === true) !== (groupFlip?.flipH === true),
            flipV: (attrs.flipV === true) !== (groupFlip?.flipV === true),
          },
        },
      )
    : null;
  if (!paint) return { filter: "", reflect: "", transform: "", outerShadow: false };
  const filters: string[] = [];
  if (paint.primitives.length) {
    const id = svg.dataset.effectsId ?? `document-shape-effects-${++documentShapeMarkerSequence}`;
    svg.dataset.effectsId = id;
    const filter = svgElement("filter", {
      id,
      ...officeShapeEffectsFilterRegion(paint),
      "color-interpolation-filters": "sRGB",
    });
    const build = (primitive: OfficeShapeEffectPrimitive): SVGElement => {
      // The painter names filter primitives (feGaussianBlur, feMerge...).
      const node = svgElement(primitive.tag as keyof SVGElementTagNameMap, primitive.attrs);
      for (const child of primitive.children ?? []) node.append(build(child));
      return node;
    };
    filter.append(...paint.primitives.map(build));
    const defs = svgElement("defs", {});
    defs.append(filter);
    svg.append(defs);
    filters.push(`url(#${id})`);
  }
  const shadow = effects?.shadow && effects.shadow !== "none" ? effects.shadow : null;
  // A Perspective shadow is still a shadow here: its offset and blur.
  filters.push(...paint.cssFilters, ...(paint.silhouette && shadow ? [officeShapeShadowDropShadow(shadow)] : []));
  const outerShadow = Boolean(shadow && !shadow.inner);
  return { filter: filters.join(" "), reflect: paint.reflect, transform: paint.transform, outerShadow };
}

/** Stop elements of a gradient as drawn (`officeGradientDrawnStops`: the eased two-stop ramp). */
function documentGradientStopElements(gradient: OfficeShapeGradient): SVGElement[] {
  return officeGradientDrawnStops(gradient.stops).map((stop) => svgElement("stop", {
    offset: stop.position,
    "stop-color": stop.color,
    ...((stop as { alpha?: number }).alpha !== undefined ? { "stop-opacity": (stop as { alpha?: number }).alpha } : {}),
  }));
}

/**
 * A circular path gradient as Windows Word draws a shape's fill: concentric
 * circles about the middle of the tile rectangle (or the box), round in the
 * shape's own box (`wordCirclePathGradient`).
 */
function documentCirclePathGradientElement(id: string, gradient: OfficeShapeGradient, widthEmu: number, heightEmu: number): SVGElement {
  const circle = wordCirclePathGradient(gradient.tileRect, widthEmu, heightEmu);
  const element = svgElement("radialGradient", { id, ...officeCircleRadialSvgAttrs(circle, widthEmu, heightEmu) });
  for (const stop of documentGradientStopElements(gradient)) element.append(stop);
  return element;
}

/**
 * A rectangular path gradient (`rect`, and `shape` on the box) over the
 * shape's box: rectangular contours from the focus rectangle to the bounds
 * (`officeRectPathGradient`), as an SVG pattern in box units -- the last
 * stop's colour, each trapezoid a linear gradient across it stroked with
 * itself so no seam shows, the focus rectangle in the first stop's colour.
 * The slide shapes' `RectPathGradientPattern`, built as DOM.
 */
function documentRectPathGradientElement(id: string, gradient: OfficeShapeGradient): SVGElement {
  const shape = officeRectPathGradient(gradient.path?.fillToRect, gradient.tileRect);
  const stops = officeGradientDrawnStops(gradient.stops);
  const pattern = svgElement("pattern", { id, patternUnits: "objectBoundingBox", patternContentUnits: "objectBoundingBox", x: 0, y: 0, width: 1, height: 1, "data-path-gradient": "rect" });
  const opacity = (stop: { alpha?: number } | undefined): Record<string, number> =>
    stop?.alpha !== undefined ? { "fill-opacity": stop.alpha } : {};
  const last = stops[stops.length - 1];
  const first = stops[0];
  if (last) pattern.append(svgElement("rect", { x: 0, y: 0, width: 1, height: 1, fill: last.color, ...opacity(last as { alpha?: number }) }));
  shape.regions.forEach((region, index) => {
    const regionId = `${id}-r${index}`;
    const ramp = svgElement("linearGradient", { id: regionId, gradientUnits: "userSpaceOnUse", x1: region.from[0], y1: region.from[1], x2: region.to[0], y2: region.to[1] });
    for (const stop of documentGradientStopElements(gradient)) ramp.append(stop);
    pattern.append(ramp, svgElement("polygon", {
      points: region.points.map(([x, y]) => `${x},${y}`).join(" "),
      fill: `url(#${regionId})`,
      stroke: `url(#${regionId})`,
      "stroke-width": 0.002,
      "stroke-linejoin": "round",
    }));
  });
  const [fl, ft, fr, fb] = shape.focus;
  if (first && fr > fl && fb > ft) pattern.append(svgElement("rect", { x: fl, y: ft, width: fr - fl, height: fb - ft, fill: first.color, ...opacity(first as { alpha?: number }) }));
  return pattern;
}

/**
 * Paint one Docs shape into an `<svg viewBox="0 0 100 100">`.
 *
 * Exported because the header/footer band draws the drawings a band story
 * holds, and a band shape must be the SAME picture a body shape is: a second
 * painter is a second reading of `preset`, `adjustments`, `customPath`, the
 * paint and the two line ends, and those drift (SHAPE-IMPORT-AUDIT.md §60).
 */
/**
 * The shape's picture-fill pattern (`data-picture-fill-id`), laid over the
 * shape's whole box of `width` x `height` view units rather than over each
 * path's own bounds: `objectBoundingBox` is per referencing element, so a
 * preset of several filled faces otherwise squeezed the picture into each.
 */
function documentPictureFillOverBox(svg: SVGSVGElement, width: number, height: number): void {
  const id = svg.dataset.pictureFillId;
  const pattern = id ? svg.querySelector(`pattern[id="${id}"]`) : null;
  // (A turned picture's transform is in the path's own units: left as is.)
  if (!pattern || pattern.getAttribute("patternUnits") !== "objectBoundingBox" || pattern.hasAttribute("patternTransform")) return;
  for (const [name, scale] of [["x", width], ["y", height], ["width", width], ["height", height]] as const) {
    pattern.setAttribute(name, String(Number(pattern.getAttribute(name) ?? 0) * scale));
  }
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("patternContentUnits", "userSpaceOnUse");
  const content = svgElement("g", { transform: `scale(${width} ${height})` });
  content.append(...Array.from(pattern.childNodes));
  pattern.append(content);
}

function paintShapeGeometry(
  svg: SVGSVGElement,
  attrs: DocumentShapeAttrs,
  /**
   * The member's quick-style 3-D, when this shape is one member of a SmartArt.
   * Kept out of {@link DocumentShapeAttrs} on purpose: a standalone Docs shape
   * has no 3-D to carry, and the canvas only APPROXIMATES these (§5) while the
   * exported file is exact.
   */
  member?: Pick<DocumentShapeGroupMember, "shape3d" | "scene3d" | "fillPattern">,
  options?: DocumentShapePaintOptions,
): void {
  svg.replaceChildren();
  delete svg.dataset.inkEffect;
  // Repaint starts from the authored 0..100 view every time; only the preset
  // branch below swaps in the shape's own box, and it must not leak into a
  // later repaint of a custom path, a connector or a handwritten outline.
  svg.setAttribute("viewBox", "0 0 100 100");
  const definition = documentShapeDefinition(attrs.preset);
  const kind = definition.previewKind;
  let fill = attrs.fill === "none" ? "transparent" : attrs.fill;
  if(attrs.fillGradient){
    const id=svg.dataset.fillId??`document-shape-fill-${++documentShapeMarkerSequence}`;svg.dataset.fillId=id;
    // A gradient stating its literal angle (`a:lin@scaled="0"`; a member's
    // part of its group's sweep) is drawn at that angle in the box's own
    // aspect; a scaled one in the unit box, which is what scaling means.
    const defs=svgElement("defs",{});
    const path=attrs.fillGradient.path;
    if(path){
      // A path gradient (`a:path`) as Windows Word draws a shape's fill
      // (docx-look/probes focus*.docx): rect and shape paths in rectangular
      // contours from the `a:fillToRect` focus, a circle about the middle of
      // its bounds whatever the focus says. Drawn as a linear ramp they were
      // a left-to-right sweep (every path gradient in a Word shape).
      defs.append(path.kind==="circle"
        ? documentCirclePathGradientElement(id,attrs.fillGradient,attrs.widthEmu,attrs.heightEmu)
        : documentRectPathGradientElement(id,attrs.fillGradient));
    }else{
      const vector = attrs.fillGradient.scaled === false
        ? gradientVector(officeGradientAngleForBox(attrs.fillGradient, attrs.widthEmu, attrs.heightEmu), attrs.widthEmu, attrs.heightEmu)
        : gradientVector(officeGradientAngle(attrs.fillGradient));
      const g=svgElement("linearGradient",{id,...vector});
      for(const stop of officeGradientDrawnStops(attrs.fillGradient.stops))g.append(svgElement("stop",{offset:stop.position,"stop-color":stop.color}));
      defs.append(g);
    }
    svg.append(defs);fill=`url(#${id})`;
  }
  // Format Shape > Fill > Pattern fill (a shape's own, or a group member's):
  // the shared pattern drawn as an SVG tile.
  const fillPattern = member?.fillPattern ?? attrs.fillPattern ?? null;
  // A member's picture is its part of its group's (`fillFromGroup`).
  const fillPicture = attrs.fillPicture ?? null;
  if (fillPicture) {
    // Format Shape > Fill > Picture or texture fill: the picture stretched
    // into its fill rectangle or tiled over the geometry's box and clipped to
    // it, at its Transparency, upright when it does not turn with the shape
    // (the shared pattern every editor paints).
    const id = svg.dataset.pictureFillId ?? `document-shape-picture-${++documentShapeMarkerSequence}`;
    svg.dataset.pictureFillId = id;
    const geometry = officePictureFillPattern({
      width: Math.max(1, attrs.widthEmu / EMU_PER_PX),
      height: Math.max(1, attrs.heightEmu / EMU_PER_PX),
      natural: officePictureNaturalSize(fillPicture.src),
      options: fillPicture,
      rotation: attrs.rotation,
    });
    const pattern = svgElement("pattern", {
      id,
      patternUnits: "objectBoundingBox",
      patternContentUnits: "objectBoundingBox",
      x: geometry?.x ?? 0,
      y: geometry?.y ?? 0,
      width: geometry?.width ?? 1,
      height: geometry?.height ?? 1,
      ...(geometry?.transform ? { patternTransform: geometry.transform } : {}),
      ...(fillPicture.tile ? { "data-picture-fill": "tile" } : {}),
    });
    for (const image of geometry?.images ?? []) {
      pattern.append(svgElement("image", {
        href: fillPicture.src,
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
        preserveAspectRatio: "none",
        ...(image.transform ? { transform: image.transform } : {}),
        ...(geometry?.opacity !== undefined ? { opacity: geometry.opacity } : {}),
      }));
    }
    const defs = svgElement("defs", {});
    defs.append(pattern);
    svg.append(defs);
    fill = `url(#${id})`;
  } else if(fillPattern){
    const id=svg.dataset.patternId??`document-shape-pattern-${++documentShapeMarkerSequence}`;svg.dataset.patternId=id;
    const defs=svgElement("defs",{});defs.append(officeFillPatternSvg(fillPattern,id));svg.append(defs);fill=`url(#${id})`;
  } else if (!attrs.fillGradient && attrs.fillTransparency && attrs.fill !== "none") {
    // A solid fill's Transparency: the colour at its alpha.
    fill = officeChartColorWithOpacity(attrs.fill, (100 - attrs.fillTransparency) / 100);
  }
  // The shape's own effects (`shapeEffects`, the editors' shared effect model):
  // when they state an outer shadow it replaces the older custom shadow.
  const carried = documentShapeEffectsPaint(svg, attrs, options?.groupFlip);
  const customShadow = attrs.shapeShadow && !carried.outerShadow
    ? `drop-shadow(0 ${attrs.shapeShadow.distance}px ${attrs.shapeShadow.blur / 2}px ${attrs.shapeShadow.color}${Math.round(attrs.shapeShadow.opacity * 255).toString(16).padStart(2, "0")})`
    : "";
  // Bevel and extrusion: the shared 2-D approximation, so a `3d1` box is lit
  // and a `3d5` box has its extruded face here exactly as on a slide.
  const shape3dFilter = member?.shape3d
    ? smartArtShape3dFilter(member.shape3d, attrs.fill, member.scene3d)
    : null;
  
  // the sheet draw (`OfficeSmartArtBevelFilter`), built into this canvas's
  // own DOM. It runs on the face first; the shadows then sweep the result.
  const bevelLight = member?.shape3d
    ? smartArtBevelLight(member.shape3d, options?.groupFlip?.flipH || options?.groupFlip?.flipV ? null : smartArtBevelOutline(attrs.preset, attrs))
    : null;
  const rigTint = member?.shape3d ? smartArtFaceTintPrimitives(member.scene3d, member.shape3d, options?.faceSpan) : [];
  let bevelFilter = "";
  if (bevelLight || rigTint.length || (member?.shape3d && smartArtMaterialOpacity(member.shape3d) !== null)) {
    const id = svg.dataset.bevelId ?? `document-shape-bevel-${++documentShapeMarkerSequence}`;
    svg.dataset.bevelId = id;
    const filter = svgElement("filter", {
      id,
      x: "-10%",
      y: "-10%",
      width: "120%",
      height: "120%",
      filterUnits: "objectBoundingBox",
      primitiveUnits: "userSpaceOnUse",
      "color-interpolation-filters": "sRGB",
      "data-testid": "office-smartart-bevel-filter",
    });
    const build = (primitive: SmartArtFilterPrimitive): SVGElement => {
      const element = document.createElementNS(SVG_NS, primitive.tag);
      for (const [key, value] of Object.entries(primitive.attrs)) element.setAttribute(key, String(value));
      for (const child of primitive.children ?? []) element.append(build(child));
      return element;
    };
    const lit: SmartArtFilterPrimitive[] = [
      ...rigTint,
      ...(bevelLight
        ? smartArtBevelLightPrimitives(
            bevelLight,
            rigTint.length ? "tinted" : "SourceGraphic",
            "SourceAlpha",
            smartArtMaterialOpacity(member?.shape3d),
          )
        : []),
    ];
    // Powder's own opacity (`smartArtMaterialOpacity`): under a bevel read
    // side by side, over any other.
    const last = lit.length ? String(lit[lit.length - 1]!.attrs.result ?? "SourceGraphic") : "SourceGraphic";
    const primitives: SmartArtFilterPrimitive[] = [
      ...lit,
      ...(smartArtMaterialOpacityAfterBevel(bevelLight) ? smartArtMaterialOpacityPrimitives(member?.shape3d, last) : []),
    ];
    for (const primitive of primitives) filter.append(build(primitive));
    const defs = svgElement("defs", {});
    defs.append(filter);
    svg.append(defs);
    bevelFilter = `url(#${id})`;
  }
  // A custom shadow replaces the basic shadow, not glow/soft-edge effects.
  svg.style.filter = [
    bevelFilter,
    carried.filter,
    attrs.shapeEffects || (attrs.shapeShadow && attrs.effect === "shadow") ? "" : shapeEffectFilter(attrs),
    customShadow,
    shape3dFilter ?? "",
  ].filter(Boolean).join(" ");
  svg.style.setProperty("-webkit-box-reflect", carried.reflect);
  svg.style.transform = carried.transform;
  // A 3-D CONTOUR is the outline of the solid, so it becomes a real stroke —
  // but only when the style itself draws no line, so an authored outline is
  // never overwritten.
  const contour = member?.shape3d ? smartArtContourStroke(member.shape3d) : null;
  const contourStroke = contour && attrs.outline === "none" ? contour : null;
  let stroke = contourStroke
    ? contourStroke.stroke
    : attrs.outline === "none"
      ? "transparent"
      : attrs.outline;
  if (!contourStroke && attrs.outline !== "none") {
    if (attrs.outlineGradient) {
      // A gradient line: the stops along the line's own angle.
      const id=svg.dataset.strokeId??`document-shape-stroke-${++documentShapeMarkerSequence}`;svg.dataset.strokeId=id;
      const defs=svgElement("defs",{}),g=svgElement("linearGradient",{id,...gradientVector(officeGradientAngle(attrs.outlineGradient))});
      for(const stop of officeGradientDrawnStops(attrs.outlineGradient.stops))g.append(svgElement("stop",{offset:stop.position,"stop-color":stop.color}));
      defs.append(g);svg.append(defs);stroke=`url(#${id})`;
    } else if (attrs.outlineTransparency) {
      stroke = officeChartColorWithOpacity(attrs.outline, (100 - attrs.outlineTransparency) / 100);
    }
  }
  // The file's own preset (Long Dash, Round Dot...) is drawn in line widths,
  // as Office defines it; the style's own dash keeps its fixed lengths.
  // Round Dot (`sysDot` with a round cap) is the dotted family's round dots,
  // as on a slide.
  const exactDash = officeStrokeDash(attrs.outlineStyle, attrs.outlineDash);
  const lineWidthPx = Math.max(0.75, officeLineWeightPtToPx(attrs.outlineWidthPt));
  const dash = exactDash === "sysDot" && attrs.outlineCap === "round"
    ? (officeLineFamilyDash("dotted", lineWidthPx)?.dashArray ?? "")
    : exactDash
    ? officeStrokeDashArray(exactDash, lineWidthPx)
    : attrs.outlineStyle === "dashed"
      ? "12 8"
      : attrs.outlineStyle === "dotted"
        ? "2 7"
        : "";
  const common = {
    fill,
    stroke,
    // A point is 4/3 of a CSS pixel (12 700 / 9 525 EMU), not 3/2. This one
    // multiplier used to be `* 1.5` while the connector route and the three
    // group-member sites in this same file already used 4/3, so every Docs
    // shape drew its outline ~12.5% heavier than the weight it states
    // (audit 64.7, fixed in 68).
    "stroke-width": Math.max(
      0.75,
      officeLineWeightPtToPx(
        contourStroke?.strokeWidth ?? attrs.outlineWidthPt,
      ),
    ),
    "stroke-dasharray": dash,
    // The cap and join the line states; round ones when it states none.
    ...officeStrokeDetailSvgAttributes(officeStrokeDetail(attrs)),
    "vector-effect": "non-scaling-stroke",
  };

  // The shape's OWN outline wins over the preset: `attrs.preset` names only
  // the nearest auto-shape for a host that cannot draw a path. The shared
  // converter returns `d` already in this canvas's 0..100 box, so the viewBox
  // needs no scaling.
  const authoredPath = presentationCustomPathToSvgPath(attrs.customPath);
  // Ink is drawn as the pen drew it: one curve through the stroke's samples
  // (lib/office-ink-smooth), not the polyline its outline states. The
  // outline, and with it every file writer and hit test, is unchanged.
  const inkCurve =
    authoredPath && attrs.inkTool
      ? inkStrokePathData(
          documentInkPathFractions(attrs).map((point) => ({ x: point.x * 100, y: point.y * 100 })),
          {
            unit: {
              x: Math.max(1, documentShapeEmuToPx(attrs.widthEmu)) / 100,
              y: Math.max(1, documentShapeEmuToPx(attrs.heightEmu)) / 100,
            },
            precision: 3,
            corner: inkCornerDegreesForTool(attrs.inkTool),
          },
        )
      : "";
  const customPath = inkCurve || authoredPath;
  // Ink: a highlighter paints translucent and multiplies over the words, a
  // pen opaque, as in Word; only the painted stroke takes the pointer, so the
  // words under a scribble's box stay clickable (the box itself is
  // pointer-transparent, see `render`).
  const ink: Record<string, string> = attrs.inkTool
    ? {
        // (a strip of tape: covering the words, or peeled back from them)
        "stroke-opacity": String(documentInkStrokeOpacity(attrs)),
        "pointer-events": "stroke",
      }
    : {};
  svg.style.mixBlendMode = attrs.inkTool === "highlighter" ? "multiply" : "";
  if (customPath && attrs.inkTool === "pen" && attrs.inkEffect) {
    // A pen effect: its layers (halo, gradient, sheen, glints) in the box's
    // own CSS pixels, from the one plan every editor paints
    // (lib/office-ink-effects). Paint only: the outline colour (the effect's
    // solid stand-in) is what every file writer states.
    paintDocumentInkEffect(svg, attrs, Number(common["stroke-width"]), ink["stroke-opacity"] ?? "1");
    return;
  }
  if (customPath) {
    // A pencil wears Word's pencil texture (a solid graphite core breaking
    // into grain at the rim). Paint only.
    let strokeHost: SVGElement = svg;
    // Where a stroke drawn in the box's own CSS pixels goes: the svg, or the
    // pencil's unscaled texture group.
    let pixelHost: SVGElement = svg;
    if (attrs.inkTool === "pencil") {
      inkPaintCounter += 1;
      const defs = svgElement("defs", {});
      svg.append(defs);
      {
        // The texture's grain must be round, so the pencil draws in the box's
        // own CSS pixels: the viewBox is the box, the 0..100 path is scaled
        // into it by a group, and the filter sits on an UNSCALED group above.
        const widthPx = Math.max(1, documentShapeEmuToPx(attrs.widthEmu));
        const heightPx = Math.max(1, documentShapeEmuToPx(attrs.heightEmu));
        svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
        const strokePx = Number(common["stroke-width"]);
        const pad = strokePx + 4;
        const pencil = documentInkPencilFilter(
          strokePx,
          { x: -pad, y: -pad, width: widthPx + 2 * pad, height: heightPx + 2 * pad },
          // (the grain is seeded by the outline as stated, so it does not
          // change with how the outline is drawn; a stroke being written
          // keeps one seed, else its grain re-rolled with every sample)
          options?.pencilSeed ?? documentInkPencilSeed(authoredPath ?? customPath),
        );
        const filterId = `docs-ink-pencil-${inkPaintCounter}`;
        const filter = svgElement("filter", { id: filterId, ...pencil.attrs });
        for (const primitive of pencil.primitives) {
          filter.append(svgElement(primitive.tag, { ...primitive.attrs }));
        }
        defs.append(filter);
        const textured = svgElement("g", { filter: `url(#${filterId})` });
        const scaled = svgElement("g", {
          transform: `scale(${widthPx / 100} ${heightPx / 100})`,
        });
        textured.append(scaled);
        svg.append(textured);
        strokeHost = scaled;
        pixelHost = textured;
      }
    }
    const cutEnds = attrs.inkTool ? normalizeInkCutEnds(attrs.inkCutEnds) : undefined;
    // A stroke a pressure pen drew is painted as a FILLED outline whose
    // width follows the pressure (lib/office-ink-smooth), in the box's own
    // pixels so the width is the pen's on screen; the outline the file
    // states (one width) is untouched. A cut end stops flat in it too.
    const pressured = attrs.inkTool ? documentInkPathFractions(attrs) : [];
    if (attrs.inkTool && inkPressuresVary(pressured.map((point) => point.p))) {
      const widthPx = Math.max(1, documentShapeEmuToPx(attrs.widthEmu));
      const heightPx = Math.max(1, documentShapeEmuToPx(attrs.heightEmu));
      svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
      const points = pressured.map((point) => ({ x: point.x * widthPx, y: point.y * heightPx, p: point.p }));
      const strokePx = Number(common["stroke-width"]);
      const opacity = ink["stroke-opacity"] ?? "1";
      const inkStroke = ink.stroke;
      const outline = svgElement("path", {
        d: inkVariableWidthOutlinePathData(points, strokePx, {
          corner: inkCornerDegreesForTool(attrs.inkTool),
          flatStart: cutEnds === "start" || cutEnds === "both",
          flatEnd: cutEnds === "end" || cutEnds === "both",
        }),
        fill: inkStroke ?? stroke,
        "fill-opacity": opacity,
        stroke: "none",
        "pointer-events": "visibleFill",
        "data-ink-pressure": "true",
      });
      pixelHost.append(outline);
      return;
    }
    if (cutEnds) {
      // A piece a point eraser left: flat where it was cut, the pen's round
      // tip where the pen ended it (the shared `inkStrokeEndPaint`). Drawn in
      // the box's own pixels, line and tips in one group carrying the ink's
      // opacity, so a highlighter's tip does not darken its line.
      const widthPx = Math.max(1, documentShapeEmuToPx(attrs.widthEmu));
      const heightPx = Math.max(1, documentShapeEmuToPx(attrs.heightEmu));
      svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
      const points = documentInkPathFractions(attrs).map((point) => ({
        x: point.x * widthPx,
        y: point.y * heightPx,
      }));
      const paint = inkStrokeEndPaint(points, cutEnds);
      const { "stroke-opacity": opacity = "1", ...inkPaint } = ink;
      const { "vector-effect": _scaling, ...pixelLine } = common;
      const group = svgElement("g", { opacity });
      group.append(
        svgElement("path", {
          d: inkStrokePathData(points, { corner: inkCornerDegreesForTool(attrs.inkTool) }),
          ...pixelLine,
          ...inkPaint,
          "stroke-linecap": paint.linecap,
        }),
      );
      if (paint.tips.length > 0) {
        group.append(
          svgElement("path", {
            d: inkStrokeTipsPathData(paint.tips),
            ...pixelLine,
            ...inkPaint,
            "stroke-linecap": "round",
          }),
        );
      }
      pixelHost.append(group);
      return;
    }
    if (!attrs.inkTool && attrs.customPath && attrs.customPathPaints) {
      // Paths that paint apart (`a:path@fill` / `@stroke`): each with its own
      // fill -- none, the shape's, or that darkened or lightened -- and
      // outlined or not, in order, as Office draws them.
      const segments = officeCustomPathPaintedSegments(attrs.customPath, attrs.customPathPaints);
      for (const segment of segments) {
        strokeHost.append(svgElement("path", {
          d: segment.d,
          ...common,
          fill: officeCustomPathSegmentFill(fill, segment.fill),
          ...(segment.stroke ? {} : { stroke: "none" }),
        }));
      }
      paintLineEnds(svg, segments, documentShapeLineEnds(attrs), stroke);
      return;
    }
    strokeHost.append(svgElement("path", { d: customPath, ...common, ...ink }));
    // An OPEN outline of the shape's own is a line and wears the ends its file
    // states; a CLOSED one takes none, exactly as Office draws it. Ink is a
    // bare stroke.
    if (!attrs.inkTool) {
      paintLineEnds(svg, [{ d: customPath, stroke: true }], documentShapeLineEnds(attrs), stroke);
    }
    return;
  }

  // The block's OWN ends win over the ones the preset implies: `a:ln` is where
  // DrawingML keeps the decoration, and a `stealth` head on an arrowed elbow is
  // the same connector wearing a different arrowhead (SHAPE-IMPORT-AUDIT.md
  // §7.4). Previously this canvas asked the preset alone, so every arrowhead in
  // a Word document was drawn as a triangle whatever the file said.
  const statedConnector = normalizePresentationConnectorSpec({
    shape: kind,
    headEnd: attrs.headEnd,
    tailEnd: attrs.tailEnd,
    headEndWidth: attrs.headEndWidth,
    headEndLength: attrs.headEndLength,
    tailEndWidth: attrs.tailEndWidth,
    tailEndLength: attrs.tailEndLength,
  });
  const connector = statedConnector ?? normalizePresentationConnectorSpec({ shape: kind });
  // The strict spec is a SLIDE's rule — there the kind names whether each end
  // is decorated. A document shape's preset is only the route, so an elbow
  // decorated at its beginning alone is the undecorated elbow wearing a stated
  // head (SHAPE-IMPORT-AUDIT.md §7.11). Seen in the real editor: falling back
  // to the preset's own ends drew that connector with no arrowhead at all.
  const statesOwnEnds =
    !statedConnector &&
    (attrs.headEnd !== undefined || attrs.tailEnd !== undefined);
  if (connector) {
    const ends = statesOwnEnds
      ? documentShapeLineEnds(attrs)
      : ({
          head: readNativeLineEnd({
            type: connector.headEnd,
            ...(connector.headEndWidth ? { w: connector.headEndWidth } : {}),
            ...(connector.headEndLength ? { len: connector.headEndLength } : {}),
          }),
          tail: readNativeLineEnd({
            type: connector.tailEnd,
            ...(connector.tailEndWidth ? { w: connector.tailEndWidth } : {}),
            ...(connector.tailEndLength ? { len: connector.tailEndLength } : {}),
          }),
        } as const);
    // A connector's route is its `@prst`, evaluated in its own box, exactly as
    // every other preset is. The three hand-written strings this replaced could
    // only ever express ONE elbow and ONE curve, so `bentConnector4`'s three
    // bends and `curvedConnector5`'s four cubics had nowhere to be drawn.
    // Drawn in the CANVAS box, not the file's box: a straight line's zero
    // axis is real and the box that shows it is at least one stroke thick
    // (the geometry block keeps the two in step, SHAPE-IMPORT-AUDIT.md §21).
    const routeStrokePx = Math.max(1, ptToPx(attrs.outlineWidthPt));
    const fileWidthPx = documentShapeEmuToPx(attrs.widthEmu);
    const fileHeightPx = documentShapeEmuToPx(attrs.heightEmu);
    const routeWidthPx = Math.max(fileWidthPx, routeStrokePx);
    const routeHeightPx = Math.max(fileHeightPx, routeStrokePx);
    // The route is the file's own: evaluated in the file's box (a zero axis
    // as one pixel, the program needs a box) and set in the middle of the canvas,
    // which is centred on it. Evaluated in the widened canvas instead, a
    // flat 6 pt rule ran from the canvas's top corner to its bottom one: a
    // wedge 8 px out of level across the page (corpus R283-D12, R279-D17
    // footers; Word draws it level).
    const evalWidthPx = Math.max(fileWidthPx, ZERO_AXIS_ROUTE_PX);
    const evalHeightPx = Math.max(fileHeightPx, ZERO_AXIS_ROUTE_PX);
    const routeGeometry = presentationConnectorRouteGeometry(
      connector.connectorPreset,
      evalWidthPx,
      evalHeightPx,
      // The route's own dragged bend (a Word elbow pulled sideways, or a VML
      // bracket that turns back past its end), not the preset's middle: a
      // fraction of the file's own box, where it is evaluated.
      attrs.adjustments,
    );
    if (routeGeometry) {
      const originX = (routeWidthPx - evalWidthPx) / 2;
      const originY = (routeHeightPx - evalHeightPx) / 2;
      svg.setAttribute("viewBox", `${-originX} ${-originY} ${routeWidthPx} ${routeHeightPx}`);
    }
    const connectorPaths = routeGeometry?.paths.map((path) => path.d) ?? [
      connector.route === "elbow"
        ? "M5 78H50V22H95"
        : connector.route === "curved"
          ? "M5 78C25 15 75 85 95 22"
          : "M5 78L95 22",
    ];
    for (const connectorPath of connectorPaths) {
      svg.append(
        svgElement("path", { d: connectorPath, ...common, fill: "none" }),
      );
    }
    paintLineEnds(
      svg,
      connectorPaths.map((d) => ({ d, stroke: true })),
      ends,
      stroke,
    );
    return;
  }
  // The preset's own DrawingML program, evaluated at THIS shape's pixel size.
  // Evaluating at the real aspect ratio is the whole point: DrawingML derives
  // corner radii, arrow-head widths and border thicknesses from `ss = min(w,h)`,
  // so a preset sampled in a square box and then stretched is a different
  // figure — a `roundRect`'s circular corners become ellipses, a `frame`'s
  // border thickens on one axis only. `presentationPresetGeometryForKind`
  // returns null for connectors (handled above) and for anything the catalog
  // has no preset program for; those keep the outlines below.
  const presetGeometry = presentationPresetGeometryForKind(
    kind,
    documentShapeEmuToPx(attrs.widthEmu),
    documentShapeEmuToPx(attrs.heightEmu),
    // …with the shape's OWN dragged handles, so a corner someone pulled in Word
    // is drawn where they pulled it instead of at the preset's default.
    attrs.adjustments,
  );
  if (presetGeometry) {
    const [viewWidth, viewHeight] = presetGeometry.viewBox ?? [100, 100];
    svg.setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`);
    // DrawingML fills every path of a preset and THEN strokes every path, so a
    // stroke-only path is an overlay however early it is declared. SVG paints
    // in document order instead, which let `chartPlus`/`chartStar`/`chartX`
    // cover their own marks with the frame declared after them — three blank
    // boxes. Partitioning is stable, so the other 190 are untouched.
    const ordered = [
      ...presetGeometry.paths.filter((path) => path.fill !== "none"),
      ...presetGeometry.paths.filter((path) => path.fill === "none"),
    ];
    if (fillPicture && ordered.filter((path) => path.fill !== "none").length > 1) {
      // A picture fills the SHAPE's box, every face showing its part of the
      // one picture (Word's VML cube, R136-D24: the palm runs from the front
      // face into the top and the side); laid out per path it was squeezed
      // into each face on its own.
      documentPictureFillOverBox(svg, viewWidth, viewHeight);
    }
    for (const part of ordered) {
      svg.append(
        svgElement("path", {
          ...common,
          d: part.d,
          // `darken`/`lighten` are the preset's OWN shading of the shape's
          // fill — a cube's side faces, a bevel's chamfers — exactly as the
          // slide canvas paints them.
          fill: nativePathFillColor(fill, part.fill),
          stroke: part.stroke ? stroke : "none",
        }),
      );
    }
    // A preset that is not a connector wears the ends its own `a:ln` states —
    // Word draws them on an `arc`, a bracket and a callout's leader, and on
    // nothing closed. Docs carries those ends on the shape itself (it has no
    // preserve-only outline), so this is the only canvas that can draw them.
    paintLineEnds(svg, presetGeometry.paths, documentShapeLineEnds(attrs), stroke);
    return;
  }
  if (kind === "ellipse") {
    svg.append(
      svgElement("ellipse", { cx: 50, cy: 50, rx: 45, ry: 40, ...common }),
    );
    return;
  }
  if (kind === "rectangle" || kind === "rounded-rectangle") {
    svg.append(
      svgElement("rect", {
        x: 5,
        y: 9,
        width: 90,
        height: 82,
        rx: kind === "rounded-rectangle" ? 17 : 2,
        ...common,
      }),
    );
    return;
  }

  const parts = shapeMultiParts(kind);
  if (parts) {
    for (const part of parts) {
      svg.append(
        svgElement("path", {
          d: part.d,
          fill:
            part.role === "body" ? fill : part.role === "ink" ? stroke : "none",
          stroke: part.role === "ink" ? "none" : stroke,
          "stroke-width": part.role === "ink" ? 0 : common["stroke-width"],
          "stroke-dasharray": part.role === "body" ? dash : "",
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
          "vector-effect": "non-scaling-stroke",
        }),
      );
    }
    return;
  }
  const path = shapePathD(kind);
  if (path) {
    svg.append(
      svgElement("path", {
        d: path,
        ...common,
        "fill-rule": HOLLOW_PATH_KINDS.has(kind) ? "evenodd" : "nonzero",
      }),
    );
    return;
  }
  const polygon = shapePolygonPoints(kind);
  if (polygon) {
    svg.append(svgElement("polygon", { points: polygon, ...common }));
    return;
  }
  svg.append(
    svgElement("rect", { x: 5, y: 9, width: 90, height: 82, rx: 2, ...common }),
  );
}

/**
 * The geometry elements a painted shape can end up made of. `paintShapeGeometry`
 * returns from a dozen places, each appending one of these; the inset pass below
 * has to find them wherever they came from rather than be threaded through
 * every branch.
 */
const DOCUMENT_SHAPE_INK_ELEMENTS = new Set([
  "path",
  "rect",
  "ellipse",
  "circle",
  "polygon",
  "polyline",
  "line",
]);

/**
 * `a:ln@algn="in"`: move the whole stroke inside the geometry path.
 *
 * SVG has no stroke-alignment, so the ink is DOUBLED and clipped to the
 * element's own fill region -- the outer half is removed and the inner half
 * lands where Office puts it. The fill boundary is not moved: insetting the
 * PATH would shrink the fill too, and two shapes differing only in line width
 * would stop lining up (SHAPE-IMPORT-AUDIT.md section 64).
 *
 * Elements that paint no stroke are skipped, which excludes the arrow-marker
 * carriers `paintLineEnds` leaves behind; markers live in `<defs>` and are not
 * walked at all.
 */
function applyInsetStroke(svg: SVGSVGElement, attrs: DocumentShapeAttrs): void {
  if (!isOfficeInsetStroke(attrs.outlineAlign)) return;
  let sequence = 0;
  let defs: SVGDefsElement | null = null;
  const insetKey =
    svg.dataset.documentShapeInsetId ??
    (svg.dataset.documentShapeInsetId = String(++documentShapeMarkerSequence));
  for (const element of Array.from(svg.children)) {
    if (!DOCUMENT_SHAPE_INK_ELEMENTS.has(element.tagName)) continue;
    const stroke = element.getAttribute("stroke");
    const width = Number(element.getAttribute("stroke-width"));
    if (!stroke || stroke === "none" || stroke === "transparent") continue;
    if (!Number.isFinite(width) || width <= 0) continue;
    const clipId = officeStrokeAlignClipId(
      insetKey,
      attrs.outlineAlign,
      ++sequence,
    );
    if (!clipId) continue;
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      svg.prepend(defs);
    }
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", clipId);
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    // A clone with no ink: `clipPath` uses the element's FILL region whatever
    // its paint says, and a stroke on the clone would be ignored anyway.
    const outline = element.cloneNode(false) as SVGElement;
    for (const name of [
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "clip-path",
      "filter",
      "marker-start",
      "marker-end",
    ]) {
      outline.removeAttribute(name);
    }
    outline.setAttribute("fill", "black");
    clip.append(outline);
    defs.append(clip);
    element.setAttribute(
      "stroke-width",
      String(officeStrokeAlignPaintWidth(width, attrs.outlineAlign)),
    );
    element.setAttribute("clip-path", `url(#${clipId})`);
  }
}

/**
 * Paint one Docs shape, then put its ink where its own `a:ln` says.
 *
 * The two steps are separate because the painter returns from a dozen places
 * (custom path, connector, preset program, each hand-drawn fallback) and the
 * alignment is ONE answer for all of them -- the failure shape section 59.5
 * named, where the same sentence written per-branch drifted per-branch.
 */
/**
 * A pen-effect stroke into `svg`, in the box's own CSS pixels: the plan of
 * lib/office-ink-effects (the same layers the deck, the worksheet and the
 * running stroke paint), its pressure outline when the pen varied, the
 * eraser's flat cut ends with the pen's round tips where it ended.
 */
function paintDocumentInkEffect(
  svg: SVGSVGElement,
  attrs: DocumentShapeAttrs,
  strokePx: number,
  opacity: string,
): void {
  inkPaintCounter += 1;
  const widthPx = Math.max(1, documentShapeEmuToPx(attrs.widthEmu));
  const heightPx = Math.max(1, documentShapeEmuToPx(attrs.heightEmu));
  svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
  const fractions = documentInkPathFractions(attrs);
  const pressured = inkPressuresVary(fractions.map((point) => point.p));
  const points = fractions.map((point) => ({
    x: point.x * widthPx,
    y: point.y * heightPx,
    ...(pressured && point.p !== undefined ? { p: point.p } : {}),
  }));
  // A strip of tape is cut square at both ends, as tape torn off a roll.
  const cutEnds = attrs.inkTape ? "both" : normalizeInkCutEnds(attrs.inkCutEnds);
  const ends = cutEnds && !pressured ? inkStrokeEndPaint(points, cutEnds) : null;
  const plan = inkEffectSvgPlan(
    documentInkEffectPaint(attrs.inkEffect!),
    {
      points,
      widthPx: strokePx,
      pressured,
      corner: inkCornerDegreesForTool(attrs.inkTool),
      flatStart: cutEnds === "start" || cutEnds === "both",
      flatEnd: cutEnds === "end" || cutEnds === "both",
      ...(ends ? { linecap: ends.linecap, tipsD: ends.tips.length > 0 ? inkStrokeTipsPathData(ends.tips) : undefined } : {}),
      opacity: Number(opacity) || 1,
    },
    `docs-ink-effect-${inkPaintCounter}`,
  );
  const defs = svgElement("defs", {});
  svg.append(defs);
  svg.dataset.inkEffect = attrs.inkEffect;
  appendInkEffectSvg(
    svg.ownerDocument,
    svg,
    defs,
    plan,
    { "pointer-events": pressured ? "visibleFill" : "stroke" },
    pressured ? { "data-ink-pressure": "true", "pointer-events": "visibleFill" } : {},
  );
}









export function paintDocumentInkPreview(
  box: HTMLDivElement,
  input: DocumentShapeAttrsInput,
  options?: DocumentShapePaintOptions,
): { svg: SVGSVGElement; originX: number; originY: number } {
  const attrs = normalizeDocumentShapeAttrs(input);
  let svg = box.firstElementChild instanceof SVGSVGElement ? box.firstElementChild : null;
  if (!svg) {
    svg = svgElement("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" }) as SVGSVGElement;
    svg.classList.add(styles.svg);
    box.append(svg);
  }
  paintShape(svg, attrs, undefined, options);
  // The canvas the node view gives it (`render`): at least a stroke thick.
  const width = documentShapeEmuToPx(attrs.widthEmu);
  const height = documentShapeEmuToPx(attrs.heightEmu);
  const strokePx = Math.max(1, ptToPx(attrs.outlineWidthPt));
  const canvasWidth = Math.max(width, strokePx);
  const canvasHeight = Math.max(height, strokePx);
  const x = documentShapeEmuToPx(attrs.xEmu) - (canvasWidth - width) / 2;
  const y = documentShapeEmuToPx(attrs.yEmu) - (canvasHeight - height) / 2;
  Object.assign(box.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${canvasWidth}px`,
    height: `${canvasHeight}px`,
  } satisfies Partial<CSSStyleDeclaration>);
  return { svg, originX: x, originY: y };
}

/** Whether a stroke's attributes leave nothing for its node view to put on
 * its SVG as CSS (a Shape Effect, a reflection), so its sheet's layer can
 * draw it (`paintDocumentInkForLayer`). Read before anything is painted. */
export function documentInkPaintsInLayer(attrs: DocumentShapeAttrs): boolean {
  return Boolean(attrs.inkTool) && !attrs.groupMembers?.length && !shapeEffectFilter(attrs) && !officeShapeEffectReflectionCss(attrs.effect);
}

/**
 * A stroke of ink at rest painted for its sheet's layer (inkStrokeDrawing):
 * an SVG laid out as the node view's canvas SVG is (`paintShape` on the same
 * attributes, the viewBox and aspect it leaves), with no box of its own yet.
 * Null for a stroke whose drawing is more than its SVG: a Shape Effect or a
 * reflection the node view puts on the SVG as CSS, which a layer cannot
 * draw the same; its node view draws it.
 */
export function paintDocumentInkForLayer(
  attrs: DocumentShapeAttrs,
): { readonly svg: SVGSVGElement; readonly blend: "normal" | "multiply" } | null {
  if (!documentInkPaintsInLayer(attrs)) return null;
  const svg = svgElement("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none" }) as SVGSVGElement;
  paintShape(svg, attrs);
  // Painting leaves only the highlighter's blend on the SVG (the node view
  // puts it on the ranked element, and so does the layer); anything else
  // there is a drawing the layer would not reproduce.
  const blend = svg.style.mixBlendMode === "multiply" ? "multiply" : "normal";
  svg.style.mixBlendMode = "";
  if (svg.style.cssText.trim()) return null;
  svg.removeAttribute("style");
  return { svg, blend };
}

/** What a painter may fix about a paint, for a stroke of ink being written. */
export interface DocumentShapePaintOptions {
  /** The pencil texture's grain seed, instead of the one the outline gives. */
  readonly pencilSeed?: number;
  /**
   * A SmartArt member's place down its diagram (0 top .. 1 bottom): Metallic
   * lights a face by its height in the whole graphic, as the slide does.
   */
  readonly faceSpan?: { readonly top: number; readonly bottom: number; readonly left?: number; readonly right?: number } | null;
  /**
   * A group member's group's own flips: the group's layer mirrors the
   * member's box, so the member's 3-D turn is taken through both mirrors.
   */
  readonly groupFlip?: { readonly flipH?: boolean; readonly flipV?: boolean } | null;
}

/**
 * One shape member of a group, painted as the group draws it: wearing its
 * part of its group's fill when it states `a:grpFill` (`fillFromGroup`),
 * worked out from the group's box and the member's box as they are NOW -- a
 * moved or resized member, a resized group or a new group fill is drawn at
 * once (`office-shape-group-fill`).
 */
export function paintDocumentShapeGroupMember(
  svg: SVGSVGElement,
  group: DocumentShapeAttrs,
  member: DocumentShapeGroupMember,
  options?: DocumentShapePaintOptions,
): void {
  const drawn = documentShapeMemberWithGroupPaint(group, member);
  paintShape(svg, documentShapeMemberDrawnLeafAttrs(documentShapeMemberLeafAttrs(drawn), group), drawn, options);
}

export function paintShape(
  svg: SVGSVGElement,
  attrs: DocumentShapeAttrs,
  member?: Pick<DocumentShapeGroupMember, "shape3d" | "scene3d" | "fillPattern">,
  options?: DocumentShapePaintOptions,
): void {
  paintShapeGeometry(svg, attrs, member, options);
  applyInsetStroke(svg, attrs);
  applyCompoundStroke(svg, attrs);
}

/**
 * `a:ln@cmpd`: draw the outline as the two or three parallel lines it is.
 *
 * SVG strokes one line, so each stroked element is split into its fill and
 * its stroke, and the stroke is masked by layered strokes of the same
 * geometry (`officeCompoundStrokeLayers`): the gaps let the page show
 * outside the outline and the fill inside it, as Office draws them. An inset
 * pen is left as one line (its ink is already clipped to the inside).
 */
function applyCompoundStroke(svg: SVGSVGElement, attrs: DocumentShapeAttrs): void {
  const compound = officeStrokeDetail(attrs).outlineCompound;
  if (!compound || isOfficeInsetStroke(attrs.outlineAlign)) return;
  const key =
    svg.dataset.documentShapeCompoundId ??
    (svg.dataset.documentShapeCompoundId = String(++documentShapeMarkerSequence));
  let sequence = 0;
  let defs: SVGDefsElement | null = null;
  for (const element of Array.from(svg.children)) {
    if (!DOCUMENT_SHAPE_INK_ELEMENTS.has(element.tagName)) continue;
    const stroke = element.getAttribute("stroke");
    const width = Number(element.getAttribute("stroke-width"));
    if (!stroke || stroke === "none" || stroke === "transparent") continue;
    if (!Number.isFinite(width) || width <= 0) continue;
    const tag = element.tagName.toLowerCase();
    const closed =
      tag === "rect" ||
      tag === "ellipse" ||
      tag === "circle" ||
      tag === "polygon" ||
      (tag === "path" && /z\s*$/i.test(element.getAttribute("d") ?? ""));
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      svg.prepend(defs);
    }
    const bare = element.cloneNode(false) as SVGElement;
    for (const name of [
      "fill",
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "clip-path",
      "mask",
      "filter",
      "marker-start",
      "marker-end",
      "id",
    ]) {
      bare.removeAttribute(name);
    }
    sequence += 1;
    const clipId = `document-shape-compound-clip-${key}-${sequence}`;
    const maskId = `document-shape-compound-mask-${key}-${sequence}`;
    const layers = officeCompoundStrokeLayers(compound, closed);
    if (layers.some((layer) => layer.inside)) {
      const clip = document.createElementNS(SVG_NS, "clipPath");
      clip.setAttribute("id", clipId);
      clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      const region = bare.cloneNode(false) as SVGElement;
      region.setAttribute("fill", "black");
      clip.append(region);
      defs.append(clip);
    }
    const mask = document.createElementNS(SVG_NS, "mask");
    mask.setAttribute("id", maskId);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    // The canvas is a 0..100 box; the stroke may reach past it.
    mask.setAttribute("x", "-100");
    mask.setAttribute("y", "-100");
    mask.setAttribute("width", "300");
    mask.setAttribute("height", "300");
    for (const layer of layers) {
      const band = bare.cloneNode(false) as SVGElement;
      band.setAttribute("fill", "none");
      band.setAttribute("stroke", layer.ink ? "white" : "black");
      band.setAttribute("stroke-width", String(Math.round(width * layer.width * 1000) / 1000));
      if (layer.inside) band.setAttribute("clip-path", `url(#${clipId})`);
      mask.append(band);
    }
    defs.append(mask);
    // The fill keeps its own element, under the masked stroke.
    const fill = element.getAttribute("fill");
    if (fill && fill !== "none" && fill !== "transparent") {
      const body = element.cloneNode(true) as SVGElement;
      for (const name of [
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "marker-start",
        "marker-end",
        "id",
      ]) {
        body.removeAttribute(name);
      }
      body.setAttribute("stroke", "none");
      svg.insertBefore(body, element);
      element.setAttribute("fill", "none");
    }
    element.setAttribute("mask", `url(#${maskId})`);
  }
}

function shapeEffectFilter(attrs: DocumentShapeAttrs): string {
  // Shape Effects: the shared screen table (`lib/office-shape-effects`).
  return officeShapeEffectFilterCss(attrs.effect);
}

/**
 * Lay an imported shape's text out the way Word lays it out.
 *
 * A Word drawing's text is a real text body, not one label: `bodyPr` gives the
 * four insets and where the body sits in the shape's height (ECMA-376 Part 1
 * §21.1.2.1.1 `ST_TextAnchoringType`), and every `w:txbxContent` child is a
 * paragraph with its own `w:jc` (§17.3.1.13), run size and `w:spacing`. Drawing
 * it as one centred string inside an invented percentage inset put Word's
 * seven separately aligned paragraphs on three wrapped centred lines.
 *
 * Returns false for a shape with no such reading — an editor-authored shape —
 * so the caller's single-string rendering is left exactly as it was.
 */
/** The label's box: the preset's text rectangle, then the body insets. */
function documentShapeTextInsetCss(
  attrs: DocumentShapeAttrs,
  widthPx: number,
  heightPx: number,
): string {
  const definition = documentShapeDefinition(attrs.preset);
  const rect =
    (!attrs.customPath && !definition.lineLike
      ? officePresetTextRect(definition.drawingPreset, widthPx, heightPx, attrs.adjustments)
      : null) ?? { left: 0, top: 0, right: 1, bottom: 1 };
  const body = attrs.textBody;
  const px = (emu: number) => `${emu / DOCUMENT_SHAPE_EMU_PER_PX}px`;
  const percent = (fraction: number) => `${Math.round(fraction * 100_000) / 1_000}%`;
  return [
    `calc(${percent(rect.top)} + ${px(body?.insetTopEmu ?? 45_720)})`,
    `calc(${percent(1 - rect.right)} + ${px(body?.insetRightEmu ?? 91_440)})`,
    `calc(${percent(1 - rect.bottom)} + ${px(body?.insetBottomEmu ?? 45_720)})`,
    `calc(${percent(rect.left)} + ${px(body?.insetLeftEmu ?? 91_440)})`,
  ].join(" ");
}

/**
 * The turn (degrees clockwise) a shape's words take in the shape's own
 * plane, before any 3-D turn: Rotate All Text 270° is the vertical words'
 * sideways glyphs a further half turn (read bottom-up), and Flip Vertical
 * turns the words a half turn -- Word never mirrors a shape's words: a flipH
 * shape's read as the plain one's, a flipV shape's upside down, turned with
 * the shape's face in 3-D as the plain one's are (text3d-flip-probe-word.pdf:
 * X 40 Y 20 perspective, horizontal and vert270 words, Keep Text Flat on and
 * off). The label is drawn outside the shape's flips, so it takes none.
 */
export function documentShapeTextPlaneTurn(
  attrs: Partial<Pick<DocumentShapeAttrs, "textDirection" | "flipV">>,
): number {
  return ((attrs.textDirection === "rotate270" ? 180 : 0) + (attrs.flipV === true ? 180 : 0)) % 360;
}

/**
 * The shape's centre in its label box's own px (the box
 * `documentShapeTextInsetCss` lays out): where the label turns with the
 * shape's 3-D rotation, so the words stay on the turned face.
 */
function documentShapeTextOriginPx(
  attrs: DocumentShapeAttrs,
  widthPx: number,
  heightPx: number,
): { readonly x: number; readonly y: number } {
  const definition = documentShapeDefinition(attrs.preset);
  const rect =
    (!attrs.customPath && !definition.lineLike
      ? officePresetTextRect(definition.drawingPreset, widthPx, heightPx, attrs.adjustments)
      : null) ?? { left: 0, top: 0, right: 1, bottom: 1 };
  const left = rect.left * widthPx + (attrs.textBody?.insetLeftEmu ?? 91_440) / DOCUMENT_SHAPE_EMU_PER_PX;
  const top = rect.top * heightPx + (attrs.textBody?.insetTopEmu ?? 45_720) / DOCUMENT_SHAPE_EMU_PER_PX;
  return { x: widthPx / 2 - left, y: heightPx / 2 - top };
}

/**
 * How one `w:txbxContent` paragraph is drawn: its block (`w:jc`, `w:spacing`
 * line and before / after) and the type its unformatted runs take (its size,
 * or the document's Normal size when the shape states none, and its face).
 * The body draws its paragraphs with it at rest, and the in-shape editor
 * types them with it, so opening the words changes none of them.
 */
export function shapeTextBodyParagraphCss(
  paragraph: DocumentShapeTextBody["paragraphs"][number],
  inheritsDocumentSize = false,
  wordStory = false,
): {
  block: {
    margin: string;
    marginTop?: string;
    marginBottom?: string;
    marginLeft?: string;
    marginRight?: string;
    textIndent?: string;
    textAlign?: string;
    lineHeight?: string;
  };
  font: { fontSize?: string; fontFamily?: string };
} {
  const lineHeight = wordStory
    ? wordStoryLineHeight(paragraph)
    : paragraph.lineHeight !== undefined
      ? String(paragraph.lineHeight)
      : undefined;
  return {
    block: {
      margin: "0",
      // A Word shape's own story (`wordStory`, not a SmartArt diagram's
      // DrawingML text): a paragraph that states no spacing takes the
      // document's default paragraph spacing, as Word gives a text box's
      // paragraphs (corpus R30-D05: the 8pt after counts in the
      // middle-anchored box, the words sat 4px low).
      ...(paragraph.spaceBeforePt !== undefined
        ? { marginTop: `${paragraph.spaceBeforePt}pt` }
        : wordStory
          ? { marginTop: "var(--doc-default-paragraph-space-before, 0pt)" }
          : {}),
      ...(paragraph.spaceAfterPt !== undefined
        ? { marginBottom: `${paragraph.spaceAfterPt}pt` }
        : wordStory
          ? { marginBottom: "var(--doc-default-paragraph-space-after, 0pt)" }
          : {}),
      // The paragraph's own w:ind (corpus R158-D07: a banner title set in
      // 4386 twips from the box's left edge).
      ...(paragraph.indentLeftPt !== undefined ? { marginLeft: `${paragraph.indentLeftPt}pt` } : {}),
      ...(paragraph.indentRightPt !== undefined ? { marginRight: `${paragraph.indentRightPt}pt` } : {}),
      ...(paragraph.firstLineIndentPt !== undefined ? { textIndent: `${paragraph.firstLineIndentPt}pt` } : {}),
      ...(paragraph.align !== undefined ? { textAlign: paragraph.align } : {}),
      ...(lineHeight !== undefined ? { lineHeight } : {}),
    },
    font: {
      ...(paragraph.fontSizePt !== undefined
        ? { fontSize: `${paragraph.fontSizePt}pt` }
        : inheritsDocumentSize
          ? { fontSize: "var(--doc-default-font-size, inherit)" }
          : {}),
      ...(paragraph.fontFamily !== undefined
        ? { fontFamily: withOfficeFontSubstitutes(paragraph.fontFamily) }
        : {}),
    },
  };
}

/**
 * A Word story's line height (`w:spacing w:line w:lineRule="auto"`, a multiple
 * of single, or the document's default multiple when the paragraph states
 * none). Word counts the
 * multiple in the face's single line (ascender + descender + line gap: 1.149
 * em for Times New Roman), as it does in the body; a CSS multiple counts em,
 * so `line-height: 1.15` set a Times New Roman text box 13 % short of Word's
 * (R432-D10, R432-D04 abstract boxes: 16.9 px lines for Word's 19.4 px). A
 * paragraph whose face Word's metrics do not record, or that holds East Asian
 * text (set in another face, with Word's own 1.3x box), keeps the plain
 * multiple.
 */
function wordStoryLineHeight(paragraph: DocumentShapeTextBody["paragraphs"][number]): string | undefined {
  const multiple = paragraph.lineHeight;
  const family = paragraph.fontFamily;
  const metrics = family && !textHasEastAsian(paragraph.text) ? wordGridFontLineMetrics(family) : null;
  const single = metrics ? metrics.box + metrics.lineGap : 0;
  // An exact line is that length whatever the text (R432-D15's title box:
  // blank lines 11 pt and 0.9 pt exactly); an at-least line is the face's
  // single line, never less than the length.
  if (paragraph.lineHeightPt !== undefined && paragraph.lineHeightRule === "exact") {
    return `${paragraph.lineHeightPt}pt`;
  }
  if (paragraph.lineHeightPt !== undefined && paragraph.lineHeightRule === "atLeast") {
    return single > 0 && Number.isFinite(single)
      ? `max(${paragraph.lineHeightPt}pt, ${Math.round(single * 10_000) / 10_000}em)`
      : `${paragraph.lineHeightPt}pt`;
  }
  if (!(Number.isFinite(single) && single > 0)) return multiple !== undefined ? String(multiple) : undefined;
  const singleEm = Math.round(single * 10_000) / 10_000;
  // A paragraph stating no spacing of its own is set in its style's, which a
  // shape's story does not resolve (`_shape_text_body`): the document's
  // default multiple (Word 2013's Normal: 1.08), as its spacing before and
  // after take the document's defaults.
  return multiple !== undefined
    ? String(Math.round(multiple * single * 10_000) / 10_000)
    : `calc(var(--doc-default-line-height, 1) * ${singleEm})`;
}

/**
 * The label's line height as the paragraphs inherit it: a multiple of each
 * paragraph's own size (the `.text` rule's 1.25), not the label's computed
 * px, which would set a 10pt paragraph in the 14pt label's line.
 */
function documentShapeParagraphLineHeight(label: CSSStyleDeclaration): string {
  const lineHeight = Number.parseFloat(label.lineHeight);
  const fontSize = Number.parseFloat(label.fontSize);
  return Number.isFinite(lineHeight) && fontSize > 0
    ? String(Math.round((lineHeight / fontSize) * 1000) / 1000)
    : label.lineHeight;
}

/**
 * A body paragraph as the in-shape editor types it: the paragraph's own CSS,
 * and the label's computed size and face where the paragraph states none
 * (the paragraph inherits them at rest; the editor's runs would otherwise
 * take the shape's stated size over them).
 */
function documentShapeEditorParagraph(
  paragraph: DocumentShapeTextBody["paragraphs"][number],
  inheritsDocumentSize: boolean,
  label: CSSStyleDeclaration,
  wordStory = false,
): { block: Record<string, string>; font: { fontSize: string; fontFamily: string } } {
  const css = shapeTextBodyParagraphCss(paragraph, inheritsDocumentSize, wordStory);
  return {
    block: css.block,
    font: {
      fontSize: css.font.fontSize ?? label.fontSize,
      fontFamily: cssFontFamilyOrUndefined(css.font.fontFamily ?? label.fontFamily),
    },
  };
}

/** A text size in points as CSS px (1 pt = 4/3 px). */
export function documentShapePointsToPx(points: number): number {
  return ptToPx(points);
}

/** A shape read from a Word file whose text is a Word story (`w:txbxContent`),
 * not a SmartArt diagram's DrawingML text. */
function documentShapeIsWordStory(attrs: Record<string, unknown>): boolean {
  const source = attrs.source as { adapter?: unknown; nodeType?: unknown } | null | undefined;
  return Boolean(
    source &&
      typeof source === "object" &&
      source.adapter === "docx" &&
      source.nodeType !== "nativeSmartArtGroup" &&
      !attrs.smartArtKind,
  );
}

/**
 * `inheritsDocumentSize`: the shape states no text size of its own (Home's
 * size is still the editor default). A `w:txbxContent` paragraph whose runs
 * state no `w:sz` is then set in the document's Normal size, as Word sets
 * it, and not in the editor's 14 pt shape default.
 */
function applyShapeTextBody(
  container: HTMLElement,
  body: DocumentShapeTextBody | null | undefined,
  inheritsDocumentSize = false,
  formatted?: { runs: readonly TextRun[]; shape: DocumentShapeAttrs },
  wordStory = false,
): boolean {
  if (!body || body.paragraphs.length === 0) {
    delete container.dataset.shapeTextBody;
    // Only what the body layout alone sets. The paint wrote the label's
    // vertical and horizontal alignment (`align-items`, `text-align`) and
    // writes its inset just after this; removing them here drew every
    
    for (const property of ["display", "flex-direction", "justify-content"]) {
      container.style.removeProperty(property);
    }
    return false;
  }
  const px = (emu: number) => `${emu / DOCUMENT_SHAPE_EMU_PER_PX}px`;
  container.dataset.shapeTextBody = "true";
  container.style.inset = [
    px(body.insetTopEmu),
    px(body.insetRightEmu),
    px(body.insetBottomEmu),
    px(body.insetLeftEmu),
  ].join(" ");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent =
    body.anchor === "t" ? "flex-start" : body.anchor === "b" ? "flex-end" : "center";
  container.style.alignItems = "stretch";
  // A paragraph that states no `w:jc` anywhere in its cascade takes Word's own
  // default, which is the start edge — not the centre this box used to force.
  container.style.textAlign = "start";
  // Words formatted in part draw run by run inside their own paragraph: the
  // paragraphs spell the shape's text in order, so each takes the slice of
  // the runs its words are. The text spells a paragraph break as a line
  // break (and is stored trimmed), which no paragraph's own words hold, so
  // the break is stepped over; a page stored before the break was spelt has
  // its paragraphs run together and steps over nothing.
  const runsText = (formatted?.runs ?? []).map((run) => run.text).join("");
  const spelt = body.paragraphs.map((paragraph) => paragraph.text).join("\n");
  const separated = body.paragraphs.length > 1 && spelt.trim() === runsText.trim();
  let consumed =
    separated
      ? runsText.length - runsText.trimStart().length - (spelt.length - spelt.trimStart().length)
      : 0;
  const slicesFor = (length: number): TextRun[] => {
    const start = consumed;
    const end = consumed + length;
    consumed = end + (separated ? 1 : 0);
    const slices: TextRun[] = [];
    let offset = 0;
    for (const run of formatted?.runs ?? []) {
      const runStart = offset;
      const runEnd = offset + run.text.length;
      offset = runEnd;
      const from = Math.max(start, runStart);
      const to = Math.min(end, runEnd);
      if (to > from) slices.push({ ...run, text: run.text.slice(from - runStart, to - runStart) });
    }
    return slices;
  };
  container.replaceChildren(
    ...body.paragraphs.map((paragraph) => {
      const line = document.createElement("p");
      line.dataset.shapeTextParagraph = "true";
      const css = shapeTextBodyParagraphCss(paragraph, inheritsDocumentSize, wordStory);
      for (const [property, value] of Object.entries({ ...css.block, ...css.font })) {
        if (value !== undefined) (line.style as unknown as Record<string, string>)[property] = value;
      }
      // An empty `w:p` still occupies one line in Word; a zero-width space is
      // what gives the empty box its line without adding a visible glyph.
      const slices = formatted ? slicesFor(paragraph.text.length) : [];
      if (slices.length && formatted) {
        line.replaceChildren(...slices.map((run) => shapeTextRunSpan(run, formatted.shape)));
      } else {
        line.textContent = paragraph.text === "" ? "\u200b" : paragraph.text;
      }
      return line;
    }),
  );
  return true;
}

/** The node view's text-shadow rule now lives beside the WordArt gallery in
 * lib/document-shapes so the Insert gallery previews with the identical
 * declaration; this is the same function under its old local name. */
function textEffectShadow(attrs: DocumentShapeAttrs): string {
  return documentShapeTextEffectShadowCss(attrs.textEffect);
}

/**
 * One run of a shape's words, drawn with the fields it states over the
 * label's own (the label carries the whole-shape format).
 */
/**
 * Lay out a shape run's Fit Text once it is on the page (it is measured):
 * with the runs beside it of the same region and width, on the same line,
 * or alone when Word gave it no region (`w:id`).
 */
function scheduleShapeFitTextLayout(span: HTMLSpanElement): void {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    if (!span.isConnected) return;
    const id = span.getAttribute("data-fit-text-id");
    const width = span.getAttribute("data-fit-text-width");
    const line = span.parentElement;
    const region =
      id === null || line === null
        ? [span]
        : Array.from(line.children).filter(
            (piece): piece is HTMLElement =>
              piece instanceof HTMLElement &&
              piece.getAttribute("data-fit-text-id") === id &&
              piece.getAttribute("data-fit-text-width") === width,
          );
    layOutFitTextRegion(region.includes(span) ? region : [span]);
  });
}

/**
 * The runs a preserved Office diagram's label is drawn in, read off the file's
 * own drawing (the view's host-neutral member, `textStyle.paragraphs[].runs`),
 * when they are formatted in part: Word draws "Be" bold red and "ta" in the
 * layout's white (SmartArt probe W24), and the member's one `textFill` /
 * `textBold` -- the first run's -- painted the whole word red and bold. For
 * DRAWING only: the page and its save keep the member as it is. `null` when
 * the words are uniform, edited since the import, or not the file's.
 */
function preservedSmartArtMemberRuns(
  attrs: DocumentShapeAttrs,
  member: DocumentShapeGroupMember,
): TextRun[] | null {
  if (!documentShapeIsPreservedNativeSmartArt(attrs) || member.textRuns?.length) return null;
  const view = attrs.source?.nativeSmartArtView as { members?: unknown } | undefined;
  const drawn = Array.isArray(view?.members)
    ? (view!.members as Array<Record<string, unknown>>).find((entry) => entry?.memberId === member.memberId)
    : undefined;
  const paragraphs = (drawn?.textStyle as { paragraphs?: unknown } | undefined)?.paragraphs;
  if (!drawn || drawn.role !== "text" || drawn.text !== member.text || !Array.isArray(paragraphs)) return null;
  const runs: TextRun[] = [];
  paragraphs.forEach((paragraph, index) => {
    const own = (paragraph as { runs?: unknown })?.runs;
    if (index > 0) runs.push({ text: "\n" });
    for (const run of Array.isArray(own) ? own : []) {
      const text = (run as { text?: unknown })?.text;
      if (typeof text !== "string" || !text) continue;
      const style = ((run as { style?: unknown }).style ?? {}) as Record<string, unknown>;
      runs.push({
        text,
        style: {
          bold: style.bold === true,
          italic: style.italic === true,
          ...(typeof style.color === "string" && /^#[0-9a-f]{6}$/i.test(style.color) ? { color: style.color } : {}),
        },
      });
    }
  });
  if (runs.map((run) => run.text).join("") !== member.text) return null;
  const worded = runs.filter((run) => run.text.trim());
  const key = (run: TextRun) => JSON.stringify(run.style ?? {});
  return worded.length > 1 && worded.some((run) => key(run) !== key(worded[0])) ? runs : null;
}

/**
 * A shape's words formatted in part, as ONE line of runs. The `.text` box is a
 * grid that centres its child, so each run handed to it as a child of its own
 * stood on a row of its own: a label whose "Be" alone was bold and red drew
 * "Be" over "ta" (SmartArt probe W24; Word draws "Beta" on one line).
 */
function shapeTextRunsLine(runs: readonly TextRun[], shape: DocumentShapeAttrs): HTMLSpanElement {
  const line = document.createElement("span");
  line.append(...runs.map((run) => shapeTextRunSpan(run, shape)));
  return line;
}

function shapeTextRunSpan(run: TextRun, shape: DocumentShapeAttrs): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = run.text;
  const style = run.style;
  if (!style) return span;
  // Hidden words (Word's `w:vanish`): Word neither shows nor prints them, so
  // the shape keeps them in its text and draws nothing for them.
  if ((style as { hidden?: unknown }).hidden === true) {
    span.style.display = "none";
    span.dataset.shapeRunHidden = "true";
    return span;
  }
  if (style.bold !== undefined) span.style.fontWeight = style.bold ? "700" : "400";
  if (style.italic !== undefined) span.style.fontStyle = style.italic ? "italic" : "normal";
  if (style.underline !== undefined || style.strike !== undefined) {
    const underline = style.underline ?? shape.textUnderline !== "none";
    const strike = style.strike ?? shape.textStrike;
    span.style.textDecorationLine =
      [underline ? "underline" : "", strike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
    if (underline && shape.textUnderline === "double") span.style.textDecorationStyle = "double";
    // The run's own line kind (Word's dotted, dashed, wavy, thick ... `w:u`),
    // drawn as a slide run's is. Words-only draws the plain line, as the
    // body's underline does.
    const kind = normalizePresentationUnderlineStyle(
      (style as { underlineStyle?: unknown }).underlineStyle,
    );
    if (underline && kind) Object.assign(span.style, presentationTextDecorationCss(kind, undefined));
  }
  if (style.color) span.style.color = style.color;
  if (style.highlight) span.style.backgroundColor = style.highlight;
  if (typeof style.fontSize === "number") span.style.fontSize = `${style.fontSize}px`;
  if (style.fontFamily) span.style.fontFamily = style.fontFamily;
  // Character spacing (Word's `w:spacing`), points to px as a slide run's.
  if (typeof style.letterSpacing === "number") {
    span.style.letterSpacing = `${Math.round(ptToPx(style.letterSpacing) * 100) / 100}px`;
  }
  // Raised or lowered words (Word's `w:position`), as the body draws them.
  const raised = (style as { positionHalfPoints?: unknown }).positionHalfPoints;
  if (typeof raised === "number") span.style.verticalAlign = `${raised / 2}pt`;
  // Fit Text (Word's `w:fitText`), drawn as a body run's is: the runs of one
  // region (`w:id`) on the line share its width (corpus R148-D14).
  const fit = style as unknown as { fitTextTwips?: unknown; fitTextId?: unknown };
  const fitted = typeof fit.fitTextTwips === "number";
  if (fitted) {
    span.setAttribute("data-fit-text-width", String(fit.fitTextTwips));
    if (typeof fit.fitTextId === "number") span.setAttribute("data-fit-text-id", String(fit.fitTextId));
    // A fitted region is one stretch of its line, as Word lays it out: the
    // box's narrow width (R148-D14's 38 px labels) never wraps it before it
    // is measured.
    span.style.whiteSpace = "pre";
    scheduleShapeFitTextLayout(span);
  }
  // Character scale (Word's `w:w`), drawn as a body run's charScale is. Fit
  // Text sets the region's width itself (the body's layout clears the
  // scale's transform too).
  const charScale = (style as unknown as { charScale?: unknown }).charScale;
  if (!fitted && typeof charScale === "number" && charScale !== 100) {
    span.style.display = "inline-block";
    span.style.transform = `scaleX(${charScale / 100})`;
    span.style.transformOrigin = "left center";
  }
  // All caps / Small caps DISPLAY the words in capitals; the text is kept.
  if (style.caps === "all") span.style.textTransform = "uppercase";
  else if (style.caps === "small") span.style.fontVariantCaps = "small-caps";
  // Superscript / Subscript: Word raises or lowers the words at a smaller size.
  if (style.superscript || style.subscript) {
    span.style.verticalAlign = style.superscript ? "super" : "sub";
    span.style.fontSize =
      typeof style.fontSize === "number"
        ? `${style.fontSize * DOCUMENT_SHAPE_SCRIPT_SCALE}px`
        : `${DOCUMENT_SHAPE_SCRIPT_SCALE}em`;
  }
  // WordArt on these words (Word's w14 run effects), over their colour, as
  // the field they are typed in draws it (`cellTextRunCss`).
  if (style.textPaint) {
    try {
      for (const [key, value] of Object.entries(officeTextPaintCss(style.textPaint))) {
        const cssName = key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
        span.style.setProperty(cssName, String(value));
      }
      span.dataset.runTextPaint = "true";
    } catch {
      /* drawn plain */
    }
  }
  return span;
}

/**
 * The shape's own character format, as a run states it (sizes in CSS px). A
 * flag is stated only when it is on: an unformatted word then draws in the
 * label's own weight (500) rather than the field's "normal" (400).
 */
function shapeInheritedRunStyle(shape: DocumentShapeAttrs): RunStyle {
  return {
    ...(shape.textBold ? { bold: true } : {}),
    ...(shape.textItalic ? { italic: true } : {}),
    ...(shape.textUnderline !== "none" ? { underline: true } : {}),
    ...(shape.textStrike ? { strike: true } : {}),
    fontSize: documentShapePointsToPx(shape.textFontSizePt),
    fontFamily: shape.textFontFamily,
    ...(shape.textFill !== "none" ? { color: shape.textFill } : {}),
  };
}

/**
 * A group member's own character format, as a run states it: what an
 * unformatted word of the member draws as (`sizePx` is the label's drawn
 * size, the graphic's fitted one unless the member states its own).
 */
function memberInheritedRunStyle(member: DocumentShapeGroupMember, sizePx: number | null): RunStyle {
  return {
    ...(member.textBold === true ? { bold: true } : {}),
    ...(member.textItalic === true ? { italic: true } : {}),
    ...(member.textUnderline && member.textUnderline !== "none" ? { underline: true } : {}),
    ...(member.textStrike === true ? { strike: true } : {}),
    ...(sizePx !== null ? { fontSize: sizePx } : {}),
    ...(member.textFontFamily ? { fontFamily: member.textFontFamily } : {}),
    ...(member.textFill && member.textFill !== "none" ? { color: member.textFill } : {}),
  };
}

/**
 * The runs without the fields that only repeat the shape's own format: a word
 * set back to the shape's weight is not formatting of its own.
 */
function withoutInheritedRunFields(
  runs: readonly TextRun[] | undefined,
  inherited: RunStyle,
): TextRun[] | undefined {
  if (!runs) return undefined;
  return runs.map((run) => {
    if (!run.style) return { text: run.text };
    const style: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(run.style)) {
      const base = (inherited as Record<string, unknown>)[key];
      const same =
        typeof value === "number" && typeof base === "number"
          ? Math.abs(value - base) < 0.01
          : value === base || (value === false && base === undefined);
      if (!same) style[key] = value;
    }
    return Object.keys(style).length ? { text: run.text, style: style as RunStyle } : { text: run.text };
  });
}

function linkedTextBoxDisplayText(
  doc: ProseMirrorNode,
  current: DocumentShapeAttrs,
): string {
  const storyId = current.linkedTextBoxStoryId;
  const sequence = current.linkedTextBoxSequence;
  if (typeof storyId !== "number" || typeof sequence !== "number") {
    return current.text;
  }
  const story: DocumentShapeAttrs[] = [];
  doc.descendants((candidate) => {
    if (candidate.type.name !== "documentShape") return true;
    const attrs = normalizeDocumentShapeAttrs(candidate.attrs);
    if (attrs.linkedTextBoxStoryId === storyId) story.push(attrs);
    return true;
  });
  story.sort(
    (left, right) =>
      (left.linkedTextBoxSequence ?? 0) -
      (right.linkedTextBoxSequence ?? 0),
  );
  const source = story.find(
    (candidate) => candidate.linkedTextBoxSequence === 0,
  );
  if (!source) return "";
  let offset = 0;
  for (const candidate of story) {
    const width = documentShapeEmuToPx(candidate.widthEmu);
    const height = documentShapeEmuToPx(candidate.heightEmu);
    const fontPx = documentShapePointsToPx(candidate.textFontSizePt);
    const columns = Math.max(1, Math.floor(width / Math.max(5, fontPx * 0.58)));
    const rows = Math.max(1, Math.floor(height / Math.max(8, fontPx * 1.25)));
    const capacity = Math.max(1, columns * rows);
    if (candidate.linkedTextBoxSequence === sequence) {
      return source.text.slice(offset, offset + capacity);
    }
    offset += capacity;
  }
  return "";
}

function paintConnector(
  svg: SVGSVGElement,
  member: DocumentShapeGroupMember,
): void {
  svg.replaceChildren();
  const lineWidthPx = Math.max(0.75, officeLineWeightPtToPx(member.outlineWidthPt));
  // The line's own preset (System Dash, Long Dash...) in line widths, as a
  // shape's line is drawn; the family's fixed lengths otherwise.
  const exactDash = officeStrokeDash(member.outlineStyle, member.outlineDash);
  const dash = exactDash
    ? officeStrokeDashArray(exactDash, lineWidthPx)
    : member.outlineStyle === "dashed"
      ? "12 8"
      : member.outlineStyle === "dotted"
        ? "2 7"
        : "";
  svg.append(
    svgElement("path", {
      d: member.connectorPreset === "elbow" ? "M2 2H50V98H98" : "M2 2L98 98",
      fill: "none",
      stroke: member.outline,
      "stroke-width": lineWidthPx,
      "stroke-dasharray": dash,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke",
    }),
  );
}

function numericAttr(
  element: HTMLElement,
  name: string,
  fallback: number,
): number {
  // A missing or blank attribute is not 0 (`Number(null)` is): a pasted
  // plain shape read 0 for the linked text box fields it never had and the
  
  const raw = element.getAttribute(name);
  if (raw === null || raw.trim() === "") return fallback;
  const number = Number(raw);
  return Number.isFinite(number) ? number : fallback;
}











const SHAPE_CLIPBOARD_PAYLOAD_KEYS = [
  "name",
  "hidden",
  "decorative",
  "textBody",
  "textRuns",
  "textWarp",
  "keepTextFlat",
  "adjustments",
  "headEnd",
  "tailEnd",
  "headEndWidth",
  "headEndLength",
  "tailEndWidth",
  "tailEndLength",
  "customPath",
  "groupMembers",
  "groupCoordinateWidthEmu",
  "groupCoordinateHeightEmu",
  "groupFill",
  "smartArtKind",
  "smartArtGroupId",
  "smartArtStyle",
  "smartArtDirection",
  "smartArtColors",
  "smartArtLayoutUrn",
  "smartArtLayoutSha256",
] as const;

function shapeClipboardPayload(attrs: Readonly<Record<string, unknown>>): string | null {
  const payload: Record<string, unknown> = {};
  for (const key of SHAPE_CLIPBOARD_PAYLOAD_KEYS) {
    if (attrs[key] !== undefined && attrs[key] !== null) payload[key] = attrs[key];
  }
  return Object.keys(payload).length ? JSON.stringify(payload) : null;
}

const parsedShapeClipboardPayloads = new WeakMap<
  HTMLElement,
  Readonly<Record<string, unknown>> | null
>();

/**
 * The payload of a pasted shape, held to the shape's own normalizer: only a
 * field it keeps is taken, so a forged or foreign payload cannot put a value
 * in the document that the page would then refuse on save.
 */
function readShapeClipboardPayload(
  element: HTMLElement,
): Readonly<Record<string, unknown>> | null {
  if (parsedShapeClipboardPayloads.has(element)) {
    return parsedShapeClipboardPayloads.get(element) ?? null;
  }
  let result: Record<string, unknown> | null = null;
  const raw = element.getAttribute("data-shape-payload");
  if (raw) {
    try {
      const payload: unknown = JSON.parse(raw);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const input = payload as Record<string, unknown>;
        const normalized = normalizeDocumentShapeAttrs({
          preset: element.getAttribute("data-shape-preset") ?? undefined,
          // Runs are kept only while they spell the shape's words.
          text: element.getAttribute("data-shape-text") ?? "",
          widthEmu: numericAttr(element, "data-shape-width-emu", DOCUMENT_SHAPE_DEFAULT_WIDTH_EMU),
          heightEmu: numericAttr(element, "data-shape-height-emu", DOCUMENT_SHAPE_DEFAULT_HEIGHT_EMU),
          ...input,
        } as DocumentShapeAttrsInput) as unknown as Record<string, unknown>;
        result = {};
        for (const key of SHAPE_CLIPBOARD_PAYLOAD_KEYS) {
          if (!Object.hasOwn(input, key)) continue;
          const value = normalized[key];
          if (value !== undefined && value !== null) result[key] = value;
        }
      }
    } catch {
      result = null;
    }
  }
  parsedShapeClipboardPayloads.set(element, result);
  return result;
}

function shapeClipboardPayloadAttr(key: (typeof SHAPE_CLIPBOARD_PAYLOAD_KEYS)[number]) {
  return {
    default: undefined,
    rendered: false,
    parseHTML: (element: HTMLElement) => readShapeClipboardPayload(element)?.[key],
  };
}

function booleanAttr(element: HTMLElement, name: string): boolean {
  return ["1", "true", "on"].includes(
    (element.getAttribute(name) ?? "").trim().toLowerCase(),
  );
}

function optionalBooleanAttr(
  element: HTMLElement,
  name: string,
): boolean | undefined {
  const raw = element.getAttribute(name);
  if (raw === null) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "on"].includes(normalized)) return true;
  if (["0", "false", "off"].includes(normalized)) return false;
  return undefined;
}

/** The rotation grip's arrow. */
function rotateIconElement(): SVGSVGElement {
  const icon = svgElement("svg", { width: "9", height: "9", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "aria-hidden": "true" }) as SVGSVGElement;
  icon.append(svgElement("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5" }));
  return icon;
}

/** Each editor's shapes, by the function that ranks one in the stack. */
const stackRankers = new WeakMap<object, Set<() => void>>();

function shapeStackRankers(editor: object): Set<() => void> {
  let rankers = stackRankers.get(editor);
  if (!rankers) {
    rankers = new Set();
    stackRankers.set(editor, rankers);
  }
  return rankers;
}

/** Ranks every shape again when the document's floating heights change. */
function shapeStackRankPlugin(editor: object): Plugin {
  return new Plugin({
    key: new PluginKey("documentShapeStackRank"),
    view: () => ({
      update(view, previous) {
        if (view.state.doc === previous.doc) return;
        const now = documentFloatingStack(view.state.doc).heights;
        const before = documentFloatingStack(previous.doc).heights;
        // A shape that came ranked itself when it was built: the others move
        // only when a height they hold changes its place. A pen landing on
        // top of the stack ranked all 2,722 strokes of a page again.
        if (!floatStackRanksMoved(before, now)) return;
        for (const rank of shapeStackRankers(editor)) rank();
      },
    }),
  });
}

function createDocumentShapeNodeView(
  {
    editor,
    getPos,
    node: initialNode,
  }: {
    editor: Editor;
    getPos: () => number | undefined;
    node: ProseMirrorNode;
  },
  labels: DocumentShapeNodeViewLabels = DEFAULT_DOCUMENT_SHAPE_LABELS,
  getPageId?: () => string | undefined,
  fitTextWhenReadOnly = false,
): NodeView {
  let node = initialNode;
  let selected = false;
  let textEditing = false;
  /** Set by render: the shape's words are not this box's to type. */
  let shapeWordsLocked = false;
  let destroyed = false;
  let disposeActiveGesture: (() => void) | null = null;
  // This desk's gesture as the others see it (documentLiveTransform), ended
  // after the gesture's commit or cancel.
  let liveGesture: DocumentLiveGesture | null = null;
  const endLiveGesture = (): void => {
    const live = liveGesture;
    liveGesture = null;
    live?.end();
  };
  // The rest another member's live frame is drawn from (showLiveFrame).
  let liveBase: {
    left: number;
    top: number;
    w: number;
    h: number;
    r: number;
    placed: boolean;
    sized: boolean;
    turned: boolean;
  } | null = null;
  // One shape inside an authored SmartArt, selected on its own (PowerPoint's
  // click-a-shape-in-the-graphic). `null` while the frame is the selection.
  let selectedMemberId: string | null = null;
  // The diagram item the selected shape draws: member ids are positions in
  // the drawn layout, so after a layout change (a shape added before it) the
  // same id draws another item; the selection follows its item (WUA 219).
  let selectedItemId: string | null = null;
  // A Delete on the selected shape is waiting for the server's relayout.
  let memberDeletePending = false;
  // Per member: open its in-place text box, optionally seeded with the key
  // that started typing (Office replaces the shape's text with it).
  const memberTextOpeners = new Map<string, (seed?: string) => void>();
  /** The members' own text fields, unmounted when the members are rebuilt. */
  const memberFields: DocumentShapeRichTextField[] = [];
  // WordArt: the warped words are painted over the shape (and over each
  // member) by the shared painter; these dispose the live surfaces.
  let shapeWarp: { key: string; overlay: HTMLDivElement; dispose: () => void } | null = null;
  /** The words' turn in the shape's own plane, degrees (`documentShapeTextPlaneTurn`). */
  let textPlaneTurn = 0;
  const memberWarps: (() => void)[] = [];
  // Text Effects > Shadow > Perspective on straight words: the shared shadow
  // copy behind them (`office-text-shadow-copy`; a warped shape's shadow is
  // the warp painter's).
  let shapeShadowCopy: { key: string; dispose: () => void } | null = null;
  const disposeShapeWarp = () => {
    shapeWarp?.dispose();
    shapeWarp?.overlay.remove();
    shapeWarp = null;
    shapeShadowCopy?.dispose();
    shapeShadowCopy = null;
  };
  /**
   * Each member's text host (box and frame inside) and field, by member id,
   * with the member's drawn label as the LATEST render made it and the
   * function that closes the field. A field kept open across a render (a
   * resize of its own shape) is closed by the render that opened it, so it
   * must restore the label the page shows now, not the one it hid.
   */
  const openMemberTextBoxes = new Map<
    string,
    {
      host: HTMLElement;
      box: HTMLElement;
      field: DocumentShapeRichTextField | null;
      label: HTMLElement;
      close: (restore: boolean) => void;
    }
  >();

  // In Line with Text on a text line (`inlineDocumentShape`): the host is a
  // glyph-like inline box whose bottom edge stands on the baseline, as Word
  // draws a `wp:inline` drawing; the block spelling is a line of its own.
  const inlineHost = initialNode.type.name === INLINE_SHAPE_NODE_NAME;
  const root = document.createElement(inlineHost ? "span" : "figure");
  root.className = styles.root;
  root.dataset.documentShape = "true";
  root.dataset.testid = "document-shape-node";
  if (inlineHost) root.dataset.inline = "true";

  const stage = document.createElement("div");
  stage.className = styles.stage;
  const shape = document.createElement("div");
  shape.className = styles.shape;
  shape.dataset.testid = "document-shape-canvas";
  // The drawn box (not the full-width line) for the caret parked beside an
  // In Line with Text shape and for the gutter click (objectPlacement.ts).
  shape.dataset.documentShapeCanvas = "true";
  const svg = svgElement("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  svg.classList.add(styles.svg);
  const text = document.createElement("span");
  text.className = styles.text;
  const paintText = document.createElement("span");
  // What the shape DRAWS is no text of the page (the story below is). The
  // node view is not `contenteditable="false"` as a whole since its words
  // became a story, so WebKit took the drawn words for editable text: with
  // a gap cursor after a SmartArt it moved its own caret into a member's
  // label and drew it there, over the diagram. The drawn label and the
  // group's members are kept out of the editing host.
  paintText.contentEditable = "false";
  paintText.setAttribute(DOCUMENT_SHAPE_LABEL_ATTRIBUTE, "true");
  text.append(paintText);
  // The words as a story (`documentShapeStory.ts`): ProseMirror's own content
  // element, laid in the label's text rectangle and edited as the body is.
  const storyHost = document.createElement("div");
  storyHost.className = styles.story;
  storyHost.setAttribute(DOCUMENT_SHAPE_STORY_ATTRIBUTE, "true");
  /** Whether the words are the story (else the label draws `text`). */
  const storyMode = (): boolean => node.childCount > 0;
  const groupLayer = document.createElement("div");
  groupLayer.dataset.testid = "document-shape-group-canvas";
  groupLayer.setAttribute("aria-hidden", "true");
  groupLayer.contentEditable = "false";
  Object.assign(groupLayer.style, {
    position: "absolute",
    inset: "0",
    overflow: "visible",
    pointerEvents: "none",
    transformOrigin: "center center",
  });
  // What the shape draws lives in `paint`, which carries the page's float
  // rank (`floatStackZIndex`) and so is a stacking context of its own; the
  // shape box itself carries none, so the selection chrome beside `paint`
  // (frame, grips, edit points) escapes it and paints over every float on
  // the page — Word draws the selected shape's handles over everything too.
  // A SmartArt graphic's OWN formatting (Shape Fill / Outline / Effects with
  // the whole graphic selected: Word's `dgm:bg` and `dgm:whole`) across its
  // frame, under its shapes, as the slide and the sheet draw it.
  const smartArtGraphicLayer = document.createElement("div");
  smartArtGraphicLayer.dataset.testid = "document-smartart-graphic-format";
  smartArtGraphicLayer.setAttribute("aria-hidden", "true");
  Object.assign(smartArtGraphicLayer.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    transformOrigin: "center center",
    display: "none",
  });
  const paint = document.createElement("div");
  paint.className = styles.paint;
  paint.dataset.documentShapePaint = "true";
  // An ink stroke has no words, members or grips until it is selected: its
  // layers for them join it then (attachShapeLayers). A page of handwriting
  // held five empty layers per stroke, 15,000 elements on a 3,000-stroke note
  // that WebKit walked and styled at the first focus and tap of a visit.
  const inkAtFirst = Boolean(initialNode.attrs.inkTool);
  paint.append(svg, text);
  if (!inkAtFirst) paint.append(smartArtGraphicLayer, groupLayer);
  shape.append(paint);
  // The members' text boxes live in a layer of their own over the group
  // layer, each in a host box laid like its member: a render rebuilds the
  // member elements, and a field inside one would be re-parented -- which
  // blurs it and so closed it mid-word. Here nothing moves it.
  const memberTextLayer = document.createElement("div");
  memberTextLayer.dataset.documentShapeMemberTextLayer = "true";
  // Since a shape's words became a story of the body (`contentDOM`), the
  // node view is no longer `contenteditable="false"` as a whole, so a field
  // in here was part of the PAGE's editing host: placing its caret moved the
  // keyboard to the page and the field closed at once (a double-click on a
  // SmartArt or grouped shape opened nothing). Its own non-editable layer
  // makes each field the editing host of its words again.
  memberTextLayer.contentEditable = "false";
  Object.assign(memberTextLayer.style, {
    position: "absolute",
    inset: "0",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "2",
  });
  if (!inkAtFirst) paint.append(memberTextLayer);
  // Word types a shape's words IN the shape, where they are drawn (the shared
  // in-shape editor every host wears). The box sits on the label's own text
  // rectangle; the textarea hangs in it as the label's vertical anchor says.
  const shapeTextBox = document.createElement("span");
  shapeTextBox.dataset.documentShapeTextEditor = "true";
  // Its field is the editing host of the words, not part of the page's
  // (see the member text layer above).
  shapeTextBox.contentEditable = "false";
  Object.assign(shapeTextBox.style, { position: "absolute", pointerEvents: "auto", zIndex: "2" });
  shapeTextBox.hidden = true;
  if (!inkAtFirst) paint.append(shapeTextBox);
  
  // formatted on its own), mounted on first use. It keeps the textarea's
  // `value` / `selectionStart` / `setSelectionRange`, so the shared in-shape
  // editor helpers drive it unchanged.
  let shapeTextField: DocumentShapeRichTextField | null = null;
  // Home reads the field's selection on the editor's next transaction: one
  // that changes nothing (no document, no selection) tells it to look again.
  let notifyFrame = 0;
  // The member whose words are open in their own field (a SmartArt shape's
  // label), when one is: Home reads that field's selection the same way.
  let openMemberTextId: string | null = null;
  const notifyShapeTextSelection = () => {
    if (notifyFrame || typeof requestAnimationFrame !== "function") return;
    notifyFrame = requestAnimationFrame(() => {
      notifyFrame = 0;
      if (destroyed || editor.isDestroyed || !(shapeTextOpen || openMemberTextId)) return;
      editor.view.dispatch(editor.state.tr.setMeta("documentShapeTextFieldSelection", true));
    });
  };
  const shapeTextElement = (): HTMLTextAreaElement | null =>
    (shapeTextField?.element() ?? null) as unknown as HTMLTextAreaElement | null;
  const ensureShapeTextField = (): HTMLTextAreaElement | null => {
    attachShapeLayers();
    if (!shapeTextField) {
      shapeTextField = mountDocumentShapeRichTextField(shapeTextBox, {
        ariaLabel: labels.text,
        testId: "document-shape-text-input",
        maxLength: DOCUMENT_SHAPE_MAX_TEXT_LENGTH,
        onInput: () => {
          const field = shapeTextElement();
          if (field) fitOfficeInlineTextEditor(field);
          notifyShapeTextSelection();
        },
        onSelectionUpdate: () => notifyShapeTextSelection(),
      });
      const field = shapeTextElement();
      if (field) applyOfficeInlineTextEditorStyle(field);
    }
    return shapeTextElement();
  };

  // The selection chrome (frame, grips, edit points), beside `paint` in the
  // shape box: the box's own geometry (size, offsets, a drag's live margins)
  // places it, and with no rank on the box it paints over every float.
  const chrome = document.createElement("div");
  chrome.className = styles.chrome;
  chrome.dataset.documentSelectionChrome = "true";
  // Its frame and grips are built with the view, except an ink stroke's:
  // a page of handwriting opened thousands of strokes, each with ten grips
  // and their listeners that only a selected stroke ever shows. A stroke
  // builds them when it is first selected, multi-selected or edited.
  let chromeBuilt = false;
  let rotateHandle!: HTMLButtonElement;
  const resizeHandles = new Map<ResizeHandle, HTMLButtonElement>();
  const buildChromeHandles = (): void => {
    const selectionFrame = document.createElement("div");
    selectionFrame.className = `${officeDrawingSelectionStyles.frame} ${styles.selectionFrame}`;
    selectionFrame.setAttribute("aria-hidden", "true");
    selectionFrame.dataset.documentSelectionChrome = "true";
    chrome.append(selectionFrame);

    rotateHandle = document.createElement("button");
    rotateHandle.type = "button";
    rotateHandle.className = `${officeDrawingSelectionStyles.rotate} ${styles.rotateHandle}`;
    rotateHandle.dataset.testid = "document-shape-rotate-handle";
    rotateHandle.setAttribute("aria-label", labels.rotate);
    rotateHandle.tabIndex = -1;
    rotateHandle.dataset.officeDrawingRotate = "true";
    rotateHandle.dataset.documentSelectionChrome = "true";
    rotateHandle.append(rotateIconElement());
    chrome.append(rotateHandle);

    for (const handle of RESIZE_HANDLES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${officeDrawingSelectionStyles.resize} ${styles.resizeHandle}`;
      button.dataset.officeDrawingHandle = handle;
      button.dataset.documentSelectionChrome = "true";
      button.style.setProperty("--office-drawing-grip-size", "20px");
      button.style.setProperty("--office-drawing-grip-edge", "-10px");
      button.dataset.testid = `document-shape-resize-${handle}`;
      button.dataset.handle = handle;
      button.setAttribute("aria-label", labels.resize[handle]);
      button.tabIndex = -1;
      chrome.append(button);
      resizeHandles.set(handle, button);
    }
  };
  if (!inkAtFirst) shape.append(chrome);
  let shapeLayersAttached = !inkAtFirst;
  /** A stroke's layers for words, members and grips, in the places every
   * other shape has them from the start. */
  const attachShapeLayers = (): void => {
    if (shapeLayersAttached) return;
    shapeLayersAttached = true;
    text.after(smartArtGraphicLayer, groupLayer);
    paint.append(memberTextLayer, shapeTextBox);
    shape.append(chrome);
  };
  stage.append(shape);
  /** The shape's turn, on `paint` and the chrome alike and never on the shape
   * box: a turned (or perspective) box is a stacking context of its own, and
   * the rank on `paint` and the chrome's place above every float would both
   * be shut inside it. Both are the box's whole area, so they turn about the
   * same centre. */
  const setShapeTurn = (degrees: number) => {
    const turn = degrees ? `${degrees}deg` : "";
    paint.style.rotate = turn;
    chrome.style.rotate = turn;
  };

  root.append(stage);

  // The selected SmartArt shape's own chrome: the frame and eight handles
  // every drawing host paints (OfficeDrawingSelection), laid INSIDE the
  // member's box so the member's own rotation carries it.
  // Built the first time a member is selected (only a SmartArt has any).
  let memberChrome: HTMLDivElement | null = null;
  let memberFrame: HTMLDivElement | null = null;
  const memberResizeHandles = new Map<ResizeHandle, HTMLButtonElement>();
  let memberRotateHandle!: HTMLButtonElement;
  const buildMemberChrome = (): HTMLDivElement => {
    const built = document.createElement("div");
    built.dataset.testid = "document-shape-member-selection";
    built.dataset.documentSelectionChrome = "true";
    Object.assign(built.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    memberFrame = document.createElement("div");
    memberFrame.className = officeDrawingSelectionStyles.frame;
    memberFrame.style.inset = "0";
    built.append(memberFrame);
    for (const handle of RESIZE_HANDLES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${officeDrawingSelectionStyles.resize} ${styles.memberResizeHandle}`;
      button.dataset.officeDrawingHandle = handle;
      button.dataset.documentSelectionChrome = "true";
      button.style.setProperty("--office-drawing-grip-size", "16px");
      button.style.setProperty("--office-drawing-grip-edge", "-8px");
      button.dataset.testid = `document-shape-member-resize-${handle}`;
      button.setAttribute("aria-label", labels.resize[handle]);
      button.tabIndex = -1;
      built.append(button);
      memberResizeHandles.set(handle, button);
    }
    // The shape's own rotation handle (Office: "each individual shape is
    // rotated around its own center"); the graphic's frame has none.
    memberRotateHandle = document.createElement("button");
    memberRotateHandle.type = "button";
    memberRotateHandle.className = `${officeDrawingSelectionStyles.rotate} ${styles.memberRotateHandle}`;
    memberRotateHandle.dataset.testid = "document-shape-member-rotate-handle";
    memberRotateHandle.setAttribute("aria-label", labels.rotate);
    memberRotateHandle.tabIndex = -1;
    memberRotateHandle.dataset.officeDrawingRotate = "true";
    memberRotateHandle.dataset.documentSelectionChrome = "true";
    memberRotateHandle.append(rotateIconElement());
    built.append(memberRotateHandle);
    memberChrome = built;
    wireMemberChrome(built);
    return built;
  };

  // Normalized once per attrs object (a node's attrs never change in place):
  // every render, overlay sync and fit check read them, and an ink stroke's
  // normalization parses its whole path. A page of handwriting re-read every
  // stroke's path each time the editor's write authority flipped.
  let normalizedAttrs: { readonly source: unknown; readonly value: DocumentShapeAttrs } | null = null;
  const attrs = (): DocumentShapeAttrs => {
    if (normalizedAttrs?.source !== node.attrs) {
      normalizedAttrs = { source: node.attrs, value: normalizeDocumentShapeAttrs(node.attrs) };
    }
    return normalizedAttrs.value;
  };
  // The ink stroke's attrs its SVG was last painted from (null: painted from
  // something else since, a preview), and the SVG styles that paint left
  // (the render resets them before painting). A stroke's drawing depends on
  // its attrs alone.
  let paintedInk: {
    readonly attrs: unknown;
    readonly filter: string;
    readonly reflect: string;
    readonly transform: string;
  } | null = null;

  // The shared drawing overlays: the yellow adjustment handles of a selected
  // preset, and Edit Points. Both live INSIDE `shape` (rotated with it, never
  // mirrored -- the flip is on the SVG) and hand plain values back.
  let adjustOverlay: OfficeOverlayController<OfficeAdjustHandlesOptions> | null = null;
  let editPointsOverlay: OfficeOverlayController<OfficeEditPointsOptions> | null = null;
  let editPointsActive = false;
  const overlayBox = (current: DocumentShapeAttrs) => ({
    width: Math.max(1, documentShapeEmuToPx(current.widthEmu)),
    height: Math.max(1, documentShapeEmuToPx(current.heightEmu)),
    rotation: current.rotation,
    flipH: current.flipH,
    flipV: current.flipV,
  });
  const editPathFor = (current: DocumentShapeAttrs): OfficeEditPath | null => {
    const { width, height } = overlayBox(current);
    if (current.customPath) return officeEditPathFromCustomPath(current.customPath, width, height);
    const definition = documentShapeDefinition(current.preset);
    return definition.lineLike ? null : officeEditPathFromPreset(definition.drawingPreset, width, height, current.adjustments);
  };
  const commitEditPath = (path: OfficeEditPath): void => {
    const patch = documentShapeEditedPathPatch(attrs(), path);
    if (!patch || !commitAttrs(patch, false)) render();
  };
  const exitEditPoints = (): void => {
    if (!editPointsActive) return;
    editPointsActive = false;
    delete root.dataset.editPoints;
    syncDrawingOverlays();
  };
  const syncDrawingOverlays = (): void => {
    const current = attrs();
    const editable = editor.isEditable && selected && !selectedMemberId && !current.groupMembers?.length;
    if (editPointsActive && editable) {
      const path = editPathFor(current);
      if (path) {
        adjustOverlay?.destroy();
        adjustOverlay = null;
        root.dataset.editPoints = "true";
        const options: OfficeEditPointsOptions = {
          ...overlayBox(current),
          path,
          labels: labels.editPoints,
          classNames: OFFICE_DRAWING_OVERLAY_CLASS_NAMES,
          testIdPrefix: "document-shape-edit-points",
          // The drag is previewed by the overlay's own outline, as Office
          // draws the pending outline over the shape until the release.
          onCommit: commitEditPath,
          onExit: () => {
            exitEditPoints();
            selectCurrentNode(true);
          },
        };
        if (editPointsOverlay) editPointsOverlay.update(options);
        else editPointsOverlay = mountOfficeEditPoints(chrome, options);
        return;
      }
    }
    if (editPointsOverlay) {
      editPointsOverlay.destroy();
      editPointsOverlay = null;
      editPointsActive = false;
      delete root.dataset.editPoints;
    }
    const definition = current.customPath ? null : documentShapeDefinition(current.preset);
    const showAdjust =
      editable && !current.inkTool && !textEditing && definition !== null && !definition.lineLike &&
      officeShapeHasAdjustHandles(definition.drawingPreset);
    if (!showAdjust || !definition) {
      adjustOverlay?.destroy();
      adjustOverlay = null;
      return;
    }
    const options: OfficeAdjustHandlesOptions = {
      ...overlayBox(current),
      drawingPreset: definition.drawingPreset,
      adjustments: current.adjustments ?? null,
      label: labels.adjustShape,
      classNames: OFFICE_DRAWING_OVERLAY_CLASS_NAMES,
      testIdPrefix: "document-shape-adjust",
      onPreview: (next) => {
        paintedInk = null;
        paintShape(svg, { ...attrs(), adjustments: next });
      },
      onCommit: (next) => {
        if (!commitAttrs({ adjustments: next }, false)) render();
      },
      onCancel: () => {
        paintedInk = null;
        paintShape(svg, attrs());
      },
    };
    if (adjustOverlay) adjustOverlay.update(options);
    else adjustOverlay = mountOfficeAdjustHandles(shape, options);
  };
  const onEditPointsRequest = (event: Event): void => {
    const detail = (event as CustomEvent<DocumentShapeEditPointsDetail>).detail;
    if (!detail || detail.position !== getPos() || !editor.isEditable) return;
    if (!documentShapeEditPointsAvailable(attrs())) return;
    editPointsActive = true;
    selectCurrentNode(false);
    syncDrawingOverlays();
  };
  window.addEventListener(DOCUMENT_SHAPE_EDIT_POINTS_EVENT, onEditPointsRequest);
  const onSelectMemberRequest = (event: Event): void => {
    const detail = (event as CustomEvent<DocumentShapeSelectMemberDetail>).detail;
    if (!detail || detail.position !== getPos() || destroyed) return;
    const members = attrs().groupMembers ?? [];
    if (!members.some((member) => member.memberId === detail.memberId)) return;
    // The group first (its node view's `selectNode` runs in that dispatch),
    // then the member painted on it.
    selectCurrentNode(false);
    selectMember(detail.memberId, false);
  };
  window.addEventListener(DOCUMENT_SHAPE_SELECT_MEMBER_EVENT, onSelectMemberRequest);

  /** The authored diagram this node is, when its shapes may be edited one by one. */
  const editableSmartArt = (): DocumentSmartArtDiagram | null =>
    editor.isEditable && documentShapeGroupIsEditable(node.attrs)
      ? readDocumentSmartArtDiagram(node.attrs)
      : null;

  /**
   * The conversion of the file's own diagram this node is, once it is ready
   * (`documentSmartArtPrepared`): written nowhere until a change lands on it,
   * together with it, in one transaction. The graphic's frame and the words of a
   * diagram without a text receipt work on it; a shape moved inside the graphic,
   * and words with a receipt, stay on the file's own drawing.
   */
  const preparedConversion = (): ProseMirrorNode | null =>
    editor.isEditable ? documentSmartArtPreparedNode(node) : null;

  /**
   * What this node is drawn as. A file's diagram with no cached drawing holds
   * only its frame, so it is drawn as its conversion (read-only or not), asked
   * for as it opens: the conversion's shapes in the file's own frame, under the
   * file's own source -- nothing is written, and its first real edit lands the
   * same conversion. Every other node is drawn as it is.
   */
  let shownFrom: { readonly attrs: unknown; readonly scene: ProseMirrorNode | null; readonly value: DocumentShapeAttrs } | null =
    null;
  const shownAttrs = (): DocumentShapeAttrs => {
    const current = attrs();
    const scene = documentSmartArtDrawingAbsent(node.attrs)
      ? documentSmartArtAbsentDrawingScene(editor, node, getPageId?.())
      : null;
    if (!scene) return current;
    if (shownFrom?.attrs === node.attrs && shownFrom.scene === scene) return shownFrom.value;
    const laid = normalizeDocumentShapeAttrs(scene.attrs);
    const value: DocumentShapeAttrs = {
      ...laid,
      // Where the file places it, and whose it is: the file's own diagram.
      xEmu: current.xEmu,
      yEmu: current.yEmu,
      widthEmu: current.widthEmu,
      heightEmu: current.heightEmu,
      wrapMode: current.wrapMode,
      altText: current.altText,
      source: current.source,
    };
    shownFrom = { attrs: node.attrs, scene, value };
    return value;
  };

  /**
   * Format > Shapes > Edit in 2-D (lib/office-smartart/edit-in-2d): the key of
   * this graphic, and whether it wears a 3-D scene style at all. Null for
   * anything that is no SmartArt graphic.
   */
  const editIn2dGraphic = (): { key: string; hasScene: boolean } | null => {
    const current = attrs();
    const identity = current.groupMembers?.length ? documentShapeSmartArtIdentity(current) : null;
    if (!identity) return null;
    return {
      key: smartArtEditIn2dKey("document", identity.groupId),
      hasScene: smartArtGraphicHasScene(current.smartArtStyle, current.groupMembers ?? []),
    };
  };
  /** Its shapes are locked in a 3-D scene: no move, size or turn of their own. */
  const shapesLockedIn3d = (): boolean => {
    const graphic = editIn2dGraphic();
    return graphic !== null && smartArtShapesLockedIn3d(graphic.key, graphic.hasScene);
  };
  /** Edit in 2-D is on: the graphic is drawn flat. */
  const drawnIn2d = (): boolean => {
    const graphic = editIn2dGraphic();
    return graphic !== null && graphic.hasScene && smartArtEditingIn2d(graphic.key);
  };

  /**
   * A PRESERVED Office diagram whose shapes may still be moved and resized
   * one at a time, as Office lets every SmartArt shape be; the save writes
   * the rectangle into its cached drawing and the shape's `dgm:prSet`
   * factors (`office_smartart_preserved_geometry`).
   */
  const movablePreservedSmartArt = (): boolean =>
    editor.isEditable && documentShapeIsPreservedNativeSmartArt(node.attrs);

  /**
   * A plain group (not a SmartArt graphic, which picks its shapes at the
   * first press): its objects are picked as in Word, the group first and then
   * the object (Microsoft Support, "Group shapes, pictures, or other objects
   * in Word": "To work with an individual item in the group, select the
   * group, and then select the item").
   */
  const plainGroupPicksObjects = (): boolean =>
    Boolean(node.attrs.groupMembers?.length) &&
    typeof node.attrs.smartArtKind !== "string" &&
    !documentShapeIsPreservedNativeSmartArt(node.attrs) &&
    !editableSmartArt() &&
    !preparedConversion();

  /**
   * The members that are one SmartArt shape with `memberId` (authored or
   * preserved): what a press on it selects. An authored diagram's background
   * or connecting shape is one of them, selected on its own.
   */
  const smartArtShapeMemberIds = (memberId: string): string[] => {
    const diagram = editableSmartArt();
    if (diagram) return documentSmartArtCanvasShapeMemberIds(diagram.members, memberId);
    return movablePreservedSmartArt()
      ? documentPreservedSmartArtShapeMemberIds(node.attrs, memberId)
      : [];
  };

  /**
   * Whether the selected shape moves, resizes and takes words: every shape of
   * a preserved diagram and every item's shape of an authored one, but not an
   * authored diagram's background or connecting shape, which only paints.
   */
  const smartArtShapeIsItem = (memberId: string): boolean => {
    const diagram = editableSmartArt();
    return diagram
      ? documentSmartArtItemMemberIds(diagram.members, memberId).length > 0
      : smartArtShapeMemberIds(memberId).length > 0;
  };

  /** One member transform as a group patch, for whichever diagram this is. */
  const smartArtMemberTransformPatch = (
    memberId: string,
    transform: DocumentSmartArtMemberTransform,
  ): Partial<DocumentShapeAttrs> | null => {
    const diagram = editableSmartArt();
    if (diagram) return documentSmartArtMemberTransformPatch(diagram, memberId, transform);
    return movablePreservedSmartArt()
      ? documentPreservedSmartArtMemberTransformPatch(node.attrs, memberId, transform)
      : null;
  };

  /**
   * Paint the member selection in place: the member elements are not rebuilt,
   * so a press that selects a shape keeps its pointer capture and goes on to
   * drag it in the same gesture, as on a slide.
   */
  const paintMemberSelection = (): void => {
    const target =
      selected && selectedMemberId
        ? (Array.from(groupLayer.children).find(
            (candidate) =>
              (candidate as HTMLElement).dataset.documentShapeGroupMember ===
              selectedMemberId,
          ) as HTMLElement | undefined)
        : undefined;
    if (!target) {
      memberChrome?.remove();
      delete root.dataset.memberSelected;
      return;
    }
    const chromeOfMember = memberChrome ?? buildMemberChrome();
    if (chromeOfMember.parentElement !== target) target.append(chromeOfMember);
    // Every SmartArt shape, a connecting arrow included, moves, resizes and
    // rotates on its own (Office); only an item's shape takes words.
    // Not in a 3-D scene style until Edit in 2-D: selected, but no grips.
    const resizable =
      selectedMemberId && !shapesLockedIn3d() ? smartArtShapeMemberIds(selectedMemberId).length > 0 : false;
    for (const button of memberResizeHandles.values()) button.hidden = !resizable;
    memberRotateHandle.hidden = !resizable;
    root.dataset.memberSelected = selectedMemberId ?? undefined;
  };

  const announceMemberSelection = (): void => {
    // A plain group's picked object, for the ribbon's Arrange commands and
    // Delete (documentShapePickedGroupMember).
    if (!editor.isDestroyed) {
      const plain = !editableSmartArt() && !movablePreservedSmartArt() && !preparedConversion();
      const held = pickedGroupMembers.get(editor.view);
      if (plain && selected && selectedMemberId) {
        pickedGroupMembers.set(editor.view, { position: () => (destroyed ? undefined : getPos()), memberId: selectedMemberId });
        window.dispatchEvent(new Event(DOCUMENT_SHAPE_GROUP_MEMBER_PICK_EVENT));
      } else if (held && held.position() === getPos()) {
        pickedGroupMembers.delete(editor.view);
        window.dispatchEvent(new Event(DOCUMENT_SHAPE_GROUP_MEMBER_PICK_EVENT));
      }
    }
    // The conversion's commands act on the conversion's shape for it.
    const conversion = preparedConversion();
    const diagram = conversion ? readDocumentSmartArtDiagram(conversion.attrs) : editableSmartArt();
    if (!diagram) return;
    const memberId =
      conversion && selectedMemberId
        ? documentSmartArtPreparedMemberId(node, conversion, selectedMemberId)
        : selectedMemberId;
    const detail: DocumentSmartArtMemberSelectionDetail = {
      groupId: diagram.groupId,
      itemId: memberId
        ? documentSmartArtMemberItemId(diagram.members, memberId)
        : null,
      memberId,
    };
    lastSmartArtMemberSelection = detail;
    window.dispatchEvent(
      new CustomEvent<DocumentSmartArtMemberSelectionDetail>(
        DOCUMENT_SMARTART_MEMBER_SELECTION_EVENT,
        { detail },
      ),
    );
  };

  const selectMember = (memberId: string | null, focusView = true): void => {
    if (memberId === selectedMemberId) {
      paintMemberSelection();
      return;
    }
    selectedMemberId = memberId;
    const selectedDiagram = memberId ? editableSmartArt() : null;
    selectedItemId =
      memberId && selectedDiagram ? documentSmartArtMemberItemId(selectedDiagram.members, memberId) : null;
    paintMemberSelection();
    announceMemberSelection();
    // The member's keyboard model (Enter / F2, typing, arrows, Escape) listens
    // on the editor view: a press that selects a shape keeps its pointer
    // capture, which leaves the view unfocused in a real browser, so the keys
    // went to the page. Put the graphic in the selection and the keyboard on
    // the view, as a press on the graphic itself does.
    if (memberId && !editor.isDestroyed && editor.isEditable) {
      selectCurrentNode(focusView && !editor.view.hasFocus());
    }
  };

  const selectCurrentNode = (focus = false): number | null => {
    const position = getPos();
    if (typeof position !== "number") return null;
    const { state, dispatch } = editor.view;
    if (
      !(state.selection instanceof NodeSelection) ||
      state.selection.from !== position
    ) {
      dispatch(
        state.tr.setSelection(NodeSelection.create(state.doc, position)),
      );
    }
    if (focus) editor.view.focus();
    return position;
  };

  const commitAttrs = (
    patch: Partial<DocumentShapeAttrs>,
    focus = true,
    options: {
      





      joinHistory?: boolean;
    } = {},
  ): boolean => {
    const position = getPos();
    if (typeof position !== "number" || !editor.isEditable) return false;
    // A move of an axis at a relative (percent) position restates it as an
    // offset from its own origin, as Word does.
    const percentMove =
      patch.xEmu !== undefined || patch.yEmu !== undefined
        ? documentShapePercentAxesMoved(
            node.attrs.floatAnchor,
            { xEmu: Number(node.attrs.xEmu ?? 0), yEmu: Number(node.attrs.yEmu ?? 0) },
            { xEmu: Number(patch.xEmu ?? node.attrs.xEmu ?? 0), yEmu: Number(patch.yEmu ?? node.attrs.yEmu ?? 0) },
            floatPaintOf(root),
          )
        : null;
    if (percentMove) patch = { ...patch, xEmu: percentMove.xEmu, yEmu: percentMove.yEmu };
    // The graphic's frame on a diagram not converted yet lands on its conversion.
    const baseAttrs = preparedConversion()?.attrs ?? node.attrs;
    const requested = { ...patch, ...documentShapeFormatPatch(baseAttrs, patch) };
    const next = normalizeDocumentShapeAttrs({ ...baseAttrs, ...requested });
    const keys = Object.keys(requested) as (keyof DocumentShapeAttrs)[];
    if (keys.every((key) => JSON.stringify(baseAttrs[key]) === JSON.stringify(next[key]))) {
      // A click is not a repaint. Replacing its SVG target before click/dblclick
      // cancels those native events in Chromium; repainting after focus also
      // makes WebKit replace the object range with a paragraph caret.
      if (focus) selectCurrentNode(true);
      return true;
    }
    const { state, dispatch } = editor.view;
    let transaction = (options.joinHistory ? state.tr : closeHistory(state.tr)).setNodeMarkup(position, undefined, {
      ...baseAttrs,
      // Normalize the requested fields only. Display defaults on an old
      // source-backed shape must not become unrelated native paint edits.
      ...Object.fromEntries(keys.map((key) => [key, next[key]])),
      ...(percentMove ? { floatAnchor: percentMove.floatAnchor } : {}),
    });
    transaction = transaction.setSelection(
      NodeSelection.create(transaction.doc, position),
    );
    if (!options.joinHistory) yUndoPluginKey.getState(state)?.undoManager.stopCapturing();
    dispatch(transaction);
    if (focus) editor.view.focus();
    return true;
  };

  const commitConnectorCanvas = (
    _expectedDoc: ProseMirrorNode,
    expectedNode: ProseMirrorNode,
    _expectedPosition: number,
    next: DocumentShapeAttrs,
  ): boolean => {
    const { state, dispatch } = editor.view;
    const livePosition = getPos();
    // The write is judged on THIS node: it must still be the node the gesture
    // or the typing started on, and still the selection. The whole document
    // used to have to be the one the diagram was last drawn in, so any edit
    // elsewhere (with the graphic still selected, the node view is not drawn
    // again) threw away the words typed in a shape and snapped a dragged shape
    // back. An edit before the node moves its position, which is fine.
    if (
      !editor.isEditable ||
      typeof livePosition !== "number" ||
      state.doc.nodeAt(livePosition) !== expectedNode ||
      !(state.selection instanceof NodeSelection) ||
      state.selection.from !== livePosition
    ) {
      render();
      return false;
    }
    let transaction = closeHistory(state.tr).setNodeMarkup(
      livePosition,
      undefined,
      { ...expectedNode.attrs, ...next },
    );
    transaction = transaction.setSelection(
      NodeSelection.create(transaction.doc, livePosition),
    );
    dispatch(transaction.scrollIntoView());
    editor.view.focus();
    return true;
  };

  const applyGroupMemberLayout = (
    members: readonly DocumentShapeGroupMember[],
    coordinateWidth: number,
    coordinateHeight: number,
  ): void => {
    for (const member of members) {
      const memberElement = Array.from(groupLayer.children).find(
        (candidate) =>
          (candidate as HTMLElement).dataset.documentShapeGroupMember ===
          member.memberId,
      ) as HTMLElement | undefined;
      if (!memberElement) continue;
      Object.assign(memberElement.style, {
        left: `${(member.xEmu / coordinateWidth) * 100}%`,
        top: `${(member.yEmu / coordinateHeight) * 100}%`,
        width: `${(member.widthEmu / coordinateWidth) * 100}%`,
        height: `${(member.heightEmu / coordinateHeight) * 100}%`,
        // A member carries the extent the PACKAGE wrote, and Word writes a
        // diagram's separator rules 2 EMU thick — a fraction of a percent of
        // the child space, which paints nothing at all. The member's box is
        // therefore at least as thick as the stroke it has to show, exactly as
        // a straight line's canvas box is (SHAPE-IMPORT-AUDIT.md §21.3, §22).
        // The geometry the file holds and the geometry the save writes back
        // are untouched; unlike the line's box this one is not re-centred,
        // because a percentage layout has no pixel size to centre in.
        minWidth: `${Math.max(1, ptToPx(member.outlineWidthPt))}px`,
        minHeight: `${Math.max(1, ptToPx(member.outlineWidthPt))}px`,
        transform: buildBlockTransform(member.rotation, member) ?? "",
      });
      const host = openMemberTextBoxes.get(member.memberId)?.host;
      if (host) {
        Object.assign(host.style, {
          left: memberElement.style.left,
          top: memberElement.style.top,
          width: memberElement.style.width,
          height: memberElement.style.height,
          transform: memberElement.style.transform,
        });
      }
    }
  };

  /** Paint the SVG from these attrs: the geometry, its effects, its mirror. */
  const paintSvg = (current: DocumentShapeAttrs): void => {
    paintShape(svg, current);
    // The shape's mirror goes on after its paint, which writes the svg's
    // transform for its effects: set before, every flipped shape (a line
    // drawn up to the right, a mirrored arrow from a Word file) drew
    // unmirrored.
    const mirror = buildBlockTransform(0, current);
    if (mirror) svg.style.transform = [mirror, svg.style.transform].filter(Boolean).join(" ");
    paintedInk = current.inkTool
      ? {
          attrs: node.attrs,
          filter: svg.style.filter,
          reflect: svg.style.getPropertyValue("-webkit-box-reflect"),
          transform: svg.style.transform,
        }
      : null;
  };
  /** A landed stroke's paint, run now or from the deferred-paint queue. */
  const paintLandedInk = (queued: boolean): void => {
    if (destroyed) return;
    const current = attrs();
    if (!current.inkTool || current.groupMembers?.length) return;
    if (!queued) {
      paintSvg(current);
      return;
    }
    // From the queue, outside any update: ProseMirror's DOM observer would
    // take the new path for an edit to read back, and its flush reads the
    // DOM selection, which lays out the whole document (a quarter of a
    // second per slice on a page of ink). The paint is the view's own.
    const observer = editor.isDestroyed
      ? null
      : (editor.view as unknown as { domObserver?: { stop(): void; start(): void } }).domObserver ?? null;
    observer?.stop();
    try {
      paintSvg(current);
    } finally {
      observer?.start();
    }
  };
  /** Whether the node view's first render (the one that builds it) is done. */
  let firstRenderDone = false;
  /** The flags a render derives from the editor's write authority. */
  const showControlsEditable = (controlsEditable: boolean, current: DocumentShapeAttrs): void => {
    shapeWordsLocked =
      !controlsEditable ||
      (typeof current.linkedTextBoxSequence === "number" &&
        current.linkedTextBoxSequence > 0);
    root.dataset.editable = controlsEditable ? "true" : "false";
    if (chromeBuilt) {
      rotateHandle.disabled = !controlsEditable;
      for (const handle of resizeHandles.values()) handle.disabled = !controlsEditable;
    }
  };
  /** The grips' state: hidden on a graphic that cannot be edited, disabled
   * while the editor takes no writes. */
  const showChromeState = (hidden: boolean, controlsEditable: boolean): void => {
    if (!chromeBuilt) return;
    // A whole SmartArt graphic wears no rotation handle: Word turns no whole
    
    // shapes, selected inside it, has its own.
    const current = attrs();
    rotateHandle.hidden =
      hidden ||
      ((typeof current.smartArtKind === "string" || preparedConversion() !== null) &&
        Boolean(current.groupMembers?.length));
    rotateHandle.disabled = !controlsEditable;
    for (const handle of resizeHandles.values()) {
      handle.hidden = hidden;
      handle.disabled = !controlsEditable;
    }
  };
  /** Build the frame and grips (once), wired and in the shape's state. */
  const ensureChrome = (): void => {
    attachShapeLayers();
    if (chromeBuilt) return;
    chromeBuilt = true;
    buildChromeHandles();
    wireChromeHandles();
    const current = attrs();
    const isGroup = Boolean(current.groupMembers?.length);
    const editableGroup = isGroup && (documentShapeGroupIsEditable(current) || preparedConversion() !== null);
    showChromeState(isGroup && !editableGroup, editor.isEditable && (!isGroup || editableGroup));
  };
  // The shape's place in the page's one floating stack. Ranks are dense over
  // the whole document's heights, so a change of ANY floating object's height
  // can move this one's rank too: the stack plugin calls this again for every
  // shape when the document's heights change (WUA 139: Bring to Front on a
  // second shape left the first one's stale rank equal to the new top one,
  // and DOM order painted the wrong one on top until a reopen).
  const applyStackRank = (): void => {
    const current = attrs();
    const floatMode = documentShapeFloatMode(current.wrapMode, node.attrs.floatAnchor);
    const floating = floatMode === "overlay" || floatMode === "float";
    // `floatStackZIndex` over the same heights a floating text box uses. Paint
    // order is not the reorder command's question: `resolveDocumentShapeStack`
    // stays fail-closed about RENUMBERING, while `relativeHeight` is a fact the
    // file states and every floating object that states one takes its place.
    // A shape that states none is left unranked rather than given a guess.
    const behindDoc = normalizeFloatAnchor(node.attrs.floatAnchor)?.behindDoc ?? false;
    const stackHeight =
      current.wrapMode === "inline"
        ? null
        : documentShapeRelativeHeight(current.relativeHeight);
    const zIndex =
      stackHeight !== null
        ? String(
            floatStackZIndex(
              { relativeHeight: stackHeight, behindDoc },
              documentFloatingStack(editor.state.doc).heights,
            ),
          )
        : behindDoc
          ? // "Behind Text" with no height to rank by still belongs under the
            // text layer; that is the one thing its anchor does state.
            "-1"
          : "";
    if (floating) {
      // The rank goes on `paint`, never on the wrapper, the stage or the
      // shape box: a positioned wrapper with a z-index is a stacking context
      // of its own, and every floating object would then paint in its own
      // little stack instead of in the one `relativeHeight` order Word gives
      // the whole page; the shape box stays rank-less so the selection chrome
      // beside `paint` can paint over every float. "Behind Text" paints
      // under the text layer, which `floatStackZIndex` has already signed —
      // negating again here would flip it back above.
      root.style.zIndex = "";
      stage.style.zIndex = "";
      paint.style.zIndex = zIndex;
    } else {
      root.style.zIndex = zIndex;
      stage.style.zIndex = "";
      paint.style.zIndex = "";
    }
  };
  shapeStackRankers(editor).add(applyStackRank);
  /** The canvas box a shape is drawn in, set on `shape`. */
  const sizeCanvas = (current: DocumentShapeAttrs) => {
    const width = documentShapeEmuToPx(current.widthEmu);
    const height = documentShapeEmuToPx(current.heightEmu);
    // A zero axis is drawn in a box as thick as its stroke (renderShape).
    const strokePx = Math.max(1, ptToPx(current.outlineWidthPt));
    const canvasWidth = Math.max(width, strokePx);
    const canvasHeight = Math.max(height, strokePx);
    shape.style.width = `${canvasWidth}px`;
    shape.style.height = `${canvasHeight}px`;
    // The stylesheet's 16 px floor is for shapes that enclose an area. On a
    // zero axis it outranks the height above, and the canvas stretches the
    // line's one-stroke viewBox to 16 px: a flat Word line drew as a slope.
    shape.style.minWidth = width < strokePx ? `${strokePx}px` : "";
    shape.style.minHeight = height < strokePx ? `${strokePx}px` : "";
    return { width, height, strokePx, canvasWidth, canvasHeight };
  };
  // A stroke being scaled (its own grips, the lasso's) is drawn at its new
  // size and line, as the commit writes it; `null` draws it as the node
  // holds it again.
  const drawInkScaled = (to: { readonly widthEmu: number; readonly heightEmu: number } | null): void => {
    const current = attrs();
    if (!current.inkTool || destroyed) return;
    if (!to) {
      sizeCanvas(current);
      paintSvg(current);
      return;
    }
    const shown = { ...current, ...to, outlineWidthPt: documentInkScaledLine(current, to) };
    sizeCanvas(shown);
    paintShape(svg, shown);
    const mirror = buildBlockTransform(0, shown);
    if (mirror) svg.style.transform = [mirror, svg.style.transform].filter(Boolean).join(" ");
  };
  inkScalePreviews.set(shape, (size) =>
    drawInkScaled(
      size
        ? {
            widthEmu: Math.max(1, documentShapePxToEmu(size.widthPx)),
            heightEmu: Math.max(1, documentShapePxToEmu(size.heightPx)),
          }
        : null,
    ),
  );
  const renderShape = (): void => {
    const current = shownAttrs();
    // Edit in 2-D draws every member without its 3-D (camera and solid); the
    // node keeps it, and nothing below writes a member back from this list.
    const groupMembers = drawnIn2d()
      ? current.groupMembers?.map((member) => smartArtFlat2d(member))
      : current.groupMembers;
    const isGroup = Boolean(groupMembers?.length);
    const prepared = isGroup ? preparedConversion() : null;
    const editableGroup = isGroup && (documentShapeGroupIsEditable(current) || prepared !== null);
    // A preserved Office diagram is geometry-locked but text-editable: the
    // backend writes a member's text into the diagram's own data part and
    // refuses every other delta, so its labels take the ordinary member text
    // path while nothing may be moved, resized or repainted.
    const textEditableGroup =
      isGroup && (documentShapeGroupTextIsEditable(current) || prepared !== null);
    // …and when it is preserved but NOT text-editable — an Office diagram
    // still holding its empty `[Text]` prompts writes no run anywhere, so a
    // save has nothing to put a label in — the diagram says why instead of
    // taking typing that could never reach the file.
    const textBlocker =
      isGroup && !textEditableGroup
        ? documentShapeNativeSmartArtTextBlocker(current)
        : null;
    const controlsEditable = editor.isEditable && (!isGroup || editableGroup);
    const { width, height, canvasWidth, canvasHeight } = sizeCanvas(current);
    // A straight line has a ZERO axis — that is its real geometry, not a
    // rounding (SHAPE-IMPORT-AUDIT.md §21) — and a box with a zero side paints
    // nothing at all: the SVG has no scale to draw in and clips its own
    // stroke. The CANVAS box is therefore at least as thick as the stroke it
    // has to show, centred on the line so the geometry the file holds and the
    // geometry the save writes back are untouched. Every shape that encloses
    // an area is already at least 16 px on both axes, so this is a no-op for
    // all of them (sizeCanvas).
    const x = documentShapeEmuToPx(current.xEmu) - (canvasWidth - width) / 2;
    const y = documentShapeEmuToPx(current.yEmu) - (canvasHeight - height) / 2;
    // How the shape takes part in the body flow. Only a shape that carries
    // the source anchor it was read from can leave the flow: its origins are
    // known, and its own wrap element (the one the save keeps) picks how.
    const floatMode = documentShapeFloatMode(current.wrapMode, node.attrs.floatAnchor);
    const floating = floatMode === "overlay" || floatMode === "float";
    // A stroke's selection frame is at least two grips across on each axis:
    // on a flat or upright stroke the grips sat on the line itself, so
    // pressing the selected line to drag it took a grip and resized it.
    const framePadX = current.inkTool ? Math.max(0, (INK_SELECTION_MIN_FRAME_PX - canvasWidth) / 2) : 0;
    const framePadY = current.inkTool ? Math.max(0, (INK_SELECTION_MIN_FRAME_PX - canvasHeight) / 2) : 0;
    chrome.style.inset = framePadX || framePadY ? `${-framePadY}px ${-framePadX}px` : "";
    // Overlay: the stage is parked at the point offset (0, 0) resolves to, so
    // the shape's own margins ARE its `xEmu`/`yEmu` offsets from Word's
    // origins and a drag moves exactly what the writer writes back. Float:
    // the float box itself carries the offset, the shape sits at its origin.
    // An axis at a relative (percent) position is placed by the stage alone
    // (`documentShapeFloatLayoutAnchor`): its live offset is the file's
    // Fallback from another origin, never painted.
    const percentX = floating && documentShapeAxisIsPercent(node.attrs.floatAnchor, "horizontal");
    const percentY = floating && documentShapeAxisIsPercent(node.attrs.floatAnchor, "vertical");
    shape.style.marginLeft = `${floatMode === "float" || percentX ? 0 : x}px`;
    shape.style.marginTop = `${floatMode === "float" || percentY ? 0 : y}px`;
    // Ink: the box is pointer-transparent so the words under a scribble stay
    // clickable; its painted stroke (`pointer-events: stroke`) still selects
    // and drags the shape through the box's own listener.
    // The box itself takes no pointer: `paint` (turned with the drawing) is
    // the hit area, so a turned shape is hit where it is drawn, and its
    // events reach the box's own listeners as they bubble.
    shape.style.pointerEvents = "none";
    paint.style.pointerEvents = current.inkTool ? "none" : "auto";
    svg.style.pointerEvents = current.inkTool ? "auto" : "";
    setShapeTurn(current.rotation);
    paint.style.perspective = current.effect === "threeD" ? "420px" : "";
    svg.style.display = isGroup ? "none" : "";
    text.style.display = isGroup ? "none" : "";
    // A shape whose words are no story (a SmartArt, a group, a label) holds
    // no text of the page at all, so it is one object to the editing host,
    // as ProseMirror makes every atom: left editable (its story is why the
    // node view is not marked as a whole), WebKit took the drawn frame for an
    // empty line as tall as the diagram and, with a gap cursor after it,
    // drew its own caret down the page through the middle of the SmartArt.
    // Only a story's words are part of the editing host.
    const holdsStory = storyMode() && !isGroup;
    root.contentEditable = holdsStory ? "inherit" : "false";
    paint.contentEditable = holdsStory ? "inherit" : "false";
    groupLayer.style.display = isGroup ? "block" : "none";
    groupLayer.setAttribute(
      "aria-hidden",
      isGroup && documentShapeHasNativeConnectors(current) ? "false" : "true",
    );
    groupLayer.style.transform = isGroup
      ? (buildBlockTransform(0, current) ?? "")
      : "";
    // The group's own Shape Effects (a glow, an outer shadow) drawn round the
    // whole drawing as one silhouette, as Word draws a group's
    // `wpg:grpSpPr/a:effectLst` (corpus R116-D30): the shared painter's CSS
    // part on the members' layer.
    groupLayer.style.filter =
      isGroup && current.shapeEffects
        ? (officeShapeEffectsPaint(normalizeDocumentShapeEffects(current.shapeEffects), {
            width: Math.max(1, current.widthEmu / EMU_PER_PX),
            height: Math.max(1, current.heightEmu / EMU_PER_PX),
          })?.cssFilters.join(" ") ?? "")
        : "";
    // A SmartArt graphic's own fill, line and effect (Shape Fill / Outline /
    // Effects with the whole graphic selected, Word's `dgm:bg` / `dgm:whole`)
    // across its frame, under its shapes: the shared painter the slide and
    // the sheet use.
    {
      const graphicStyle =
        isGroup && typeof current.smartArtKind === "string"
          ? smartArtGraphicFormatStyle({
              background: /^#[0-9a-f]{6}$/i.test(current.fill) ? { fill: current.fill } : null,
              line:
                /^#[0-9a-f]{6}$/i.test(current.outline) && current.outlineWidthPt > 0
                  ? { color: current.outline, widthPt: current.outlineWidthPt }
                  : null,
              effect: readSmartArtGraphicEffect(current.effect),
            })
          : null;
      smartArtGraphicLayer.removeAttribute("style");
      Object.assign(smartArtGraphicLayer.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        transformOrigin: "center center",
        display: graphicStyle ? "block" : "none",
        transform: graphicStyle ? (buildBlockTransform(0, current) ?? "") : "",
        ...(graphicStyle ?? {}),
      });
    }
    svg.style.transform = isGroup
      ? ""
      : (buildBlockTransform(0, current) ?? "");
    svg.style.transformOrigin = "center center";
    svg.style.filter = shapeEffectFilter(current);
    svg.style.setProperty(
      "-webkit-box-reflect",
      officeShapeEffectReflectionCss(current.effect),
    );
    if (!inlineHost && stage.style.margin) stage.style.margin = "";
    // The shading of the run holding an in-line drawing (Word paints it
    // behind the whole drawing, its effect extent too). Only an in-line
    // drawing states one, standing in its run or alone in its paragraph.
    const runShading = inlineHostRunShading(node.attrs.source);
    shape.style.backgroundColor = runShading?.color ?? "";
    shape.style.boxShadow = runShading?.shadow ?? "";
    if (floating) {
      // Out of the flow the stage reserves nothing: an overlay costs its page
      // no height (Word's In Front Of / Behind Text), and a float is sized by
      // the shape alone. Geometry lives on NodeView-owned elements, set here
      // and by the layout pass — never on a node ProseMirror re-renders.
      stage.style.minHeight = "";
      stage.style.width = floatMode === "float" ? `${canvasWidth}px` : "";
      stage.style.height = floatMode === "float" ? `${canvasHeight}px` : "";
      const layoutAnchor = documentShapeFloatLayoutAnchor(node.attrs.floatAnchor, current);
      if (layoutAnchor) root.setAttribute("data-float-anchor", JSON.stringify(layoutAnchor));
      const hostAnchor = floatHostParagraphAnchor(node.attrs.source);
      if (hostAnchor) root.dataset.floatHostAnchor = hostAnchor;
      else delete root.dataset.floatHostAnchor;
      // No longer a Top and Bottom band.
      delete root.dataset.floatBand;
      delete root.dataset.floatBandPage;
    } else if (inlineHost) {
      // Exactly the drawing's box: the line it stands on grows by its height
      // and nothing else, as for an in-line picture.
      stage.style.minHeight = "0";
      stage.style.width = `${canvasWidth}px`;
      stage.style.height = `${canvasHeight}px`;
      // Its effect extent too (`wp:effectExtent`), which Word lays out as
      // part of the in-line drawing: an in-line SmartArt with l=3 pt stands
      // 3 pt right of the words before it (wps-position-parity S01).
      stage.style.margin = inlineEffectExtentMargin(node.attrs.source);
      stage.style.left = "";
      stage.style.top = "";
      stage.style.translate = "";
      shape.style.translate = "";
      root.removeAttribute("data-float-anchor");
      // What the float pass wrote on it while it held a floating shape
      // (clearFloatLayoutState): only floating wrappers are visited by it.
      clearFloatLayoutState(root);
      delete root.dataset.floatHostAnchor;
      delete root.dataset.floatBand;
      delete root.dataset.floatBandPage;
    } else {
      // A Top and Bottom shape takes exactly its own room: Word starts the
      // text right under it. Any other in-flow shape keeps the editor's
      // breathing space.
      // So does an In Line with Text drawing read from a Word file alone in
      // its paragraph: Word draws it as that paragraph's one line, the
      // paragraph's spacing around it (the root's margins, the module CSS).
      // The editor's 20px breathing space made each such line 8px taller
      // than Word's (corpus R52-D11: 12 shapes, one moving to a third page).
      const wordInline = current.wrapMode === "inline" && node.attrs.source?.adapter === "docx";
      stage.style.minHeight = documentShapeIsTopAndBottom(node.attrs.floatAnchor, current.wrapMode) || wordInline
        ? `${canvasHeight + Math.max(0, y)}px`
        : `${Math.max(40, canvasHeight + Math.max(0, y) + 20)}px`;
      stage.style.width = "";
      stage.style.height = "";
      // A stage that returns to the flow must not keep the offset a floating
      // layout pass gave it (nor the canvas the fraction of an ink stroke's
      // place, floatingTextBoxLayout `inkStageOnWholePixels`).
      stage.style.left = "";
      stage.style.top = "";
      stage.style.translate = "";
      shape.style.translate = "";
      root.removeAttribute("data-float-anchor");
      // (A Top and Bottom band keeps what the band pass gives it.)
      if (!documentShapeIsTopAndBottom(node.attrs.floatAnchor, current.wrapMode)) clearFloatLayoutState(root);
      // A Top and Bottom shape stays in the flow, but the layout pass still
      // needs to know which paragraph it is anchored in: Word places it from
      // that paragraph's own top, so two such shapes of neighbouring
      // paragraphs overlap (`layoutBandRuns`).
      const bandHost =
        documentShapeIsTopAndBottom(node.attrs.floatAnchor, current.wrapMode)
          ? floatHostParagraphAnchor(node.attrs.source)
          : null;
      // One the page placed itself measures from where its run of shapes
      // starts (`layoutBandRuns`), side by side as its offsets say.
      const bandPage =
        !bandHost && documentShapeIsTopAndBottom(node.attrs.floatAnchor, current.wrapMode);
      if (bandHost) {
        root.dataset.floatHostAnchor = bandHost;
        root.dataset.floatBand = "true";
        delete root.dataset.floatBandPage;
      } else if (bandPage) {
        delete root.dataset.floatHostAnchor;
        root.dataset.floatBand = "true";
        root.dataset.floatBandPage = "true";
      } else {
        delete root.dataset.floatHostAnchor;
        delete root.dataset.floatBand;
        delete root.dataset.floatBandPage;
      }
      // Across, a Top and Bottom shape is placed from its anchor's own
      // horizontal origin, which the layout pass resolves on the page
      // (`placeBandShapesAcross`); the margin above is only a first guess
      // from the column's edge.
      const bandAcross = documentShapeIsTopAndBottom(node.attrs.floatAnchor, current.wrapMode)
        ? documentShapeBandAcrossAnchor(node.attrs.floatAnchor, current.xEmu, current.widthEmu)
        : null;
      if (bandAcross) root.dataset.bandAcross = JSON.stringify(bandAcross);
      else delete root.dataset.bandAcross;
      for (const property of ["float", "marginLeft", "marginRight", "marginTop", "marginBottom", "shapeOutside", "shapeMargin"] as const) {
        root.style[property] = "";
      }
      // "In Line with Text" alone in its paragraph: the paragraph's own
      // alignment places the drawing, as Word places an in-line drawing
      // like a character of a centred or right-aligned paragraph.
      if (current.wrapMode === "inline" && current.textAlign && current.textAlign !== "left") {
        shape.style.marginLeft = "auto";
        shape.style.marginRight = current.textAlign === "center" ? "auto" : "0";
      }
    }
    if (floatMode === "flow") delete root.dataset.floatMode;
    else root.dataset.floatMode = floatMode;
    // A stroke carries no words: its label is left empty and unstyled, the
    // two dozen text styles below were most of a stroke's render on a page
    // of handwriting. Any words (or a story) take the whole path.
    const wordlessInk =
      Boolean(current.inkTool) && !isGroup && !storyMode() && !current.text &&
      !current.textRuns?.length && !current.textWarp && !current.textPaint;
    // Its empty text and selection boxes leave the render tree (the
    // stylesheet, on this mark): six positioned boxes per stroke, a page of
    // handwriting's styles, layers and z-order lists growing with every one.
    if (wordlessInk) root.dataset.inkBare = "true";
    else delete root.dataset.inkBare;
    if (wordlessInk) {
      if (paintText.firstChild) paintText.textContent = "";
      if (text.firstChild !== paintText || text.childNodes.length !== 1) text.replaceChildren(paintText);
      if (shapeWarp) disposeShapeWarp();
    } else {
      const linkedText = storyMode() ? "" : linkedTextBoxDisplayText(editor.state.doc, current);
      // Words formatted in part draw run by run; a linked chain box draws
      // the slice of the story it holds, as plain text.
      // A later box of a chain whose first box holds a story draws that
      // story's continuation (documentShapeLinkedFlow.ts): kept through a
      // re-render, which would otherwise blank it until the next frame.
      const linkedFlow =
        !storyMode() && typeof current.linkedTextBoxSequence === "number" && current.linkedTextBoxSequence > 0
          ? documentShapeLinkedFlowFor(root)
          : null;
      if (storyMode()) {
        paintText.textContent = "";
      } else if (linkedFlow) {
        if (paintText.firstChild !== linkedFlow || paintText.childNodes.length !== 1) paintText.replaceChildren(linkedFlow);
      } else if (current.textRuns?.length && linkedText === current.text) {
        paintText.replaceChildren(shapeTextRunsLine(current.textRuns, current));
      } else {
        paintText.textContent = linkedText;
      }
      paintText.removeAttribute("style");
      storyHost.removeAttribute("style");
      if (current.textPaint) {
        // The shape's WordArt paints its words, a story's as a label's.
        const painted = storyMode() ? storyHost : paintText;
        if (!storyMode()) painted.style.display = "inline-block";
        for (const [key, value] of Object.entries(officeTextPaintCss(current.textPaint))) {
          const cssName = key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
          painted.style.setProperty(cssName, String(value));
        }
      }
      text.style.color =
        current.textFill === "none" ? "transparent" : current.textFill;
      text.style.fontFamily = current.textFontFamily;
      // The size is in points (Word's `w:sz`, the pane's "pt"): 4/3 CSS px each.
      text.style.fontSize = `${documentShapePointsToPx(current.textFontSizePt)}px`;
      // Word's regular weight (400): 500 drew every shape's words a step
      // heavier than Word wherever the face has a medium.
      text.style.fontWeight = current.textBold ? "700" : "400";
      // Home's Italic, Underline and Strikethrough on the selected shape, and
      // the words' own alignment (Word's Add Text centres them).
      text.style.fontStyle = current.textItalic ? "italic" : "";
      text.style.textDecorationLine = [
        current.textUnderline === "none" ? "" : "underline",
        current.textStrike ? "line-through" : "",
      ]
        .filter(Boolean)
        .join(" ");
      text.style.textDecorationStyle =
        current.textUnderline === "double" ? "double" : "";
      text.style.textAlign = current.textHorizontalAlign;
      text.style.webkitTextStroke =
        current.textOutline === "none" || current.textOutlineWidthPt <= 0
          ? ""
          : `${current.textOutlineWidthPt}px ${current.textOutline}`;
      text.style.textShadow = textEffectShadow(current);
      text.style.alignItems =
        current.textVerticalAlign === "top"
          ? "start"
          : current.textVerticalAlign === "bottom"
            ? "end"
            : "center";
      text.style.justifyItems =
        current.textHorizontalAlign === "left"
          ? "start"
          : current.textHorizontalAlign === "right"
            ? "end"
            : current.textHorizontalAlign === "justify"
              ? "stretch"
              : "center";
      text.style.writingMode =
        current.textDirection === "horizontal" ? "horizontal-tb" : "vertical-rl";
      // Rotate All Text 90° / 270° (`vert` / `vert270`) turns every character,
      // Chinese included: `sideways`, as the deck draws them. `mixed` stood the
      // Chinese upright and turned only the Latin, two directions in one line
      // (WUA 104). Stacked keeps each character upright.
      text.style.textOrientation =
        current.textDirection === "stacked"
          ? "upright"
          : current.textDirection === "horizontal"
            ? "mixed"
            : "sideways";
      // rotate270 reads bottom-up (the sideways words a further half turn),
      // and a flipped shape's words turn in its plane, never mirrored:
      // drawn with the 3-D turn below.
      textPlaneTurn = documentShapeTextPlaneTurn(current);
      text.style.whiteSpace = current.textWrap ? "pre-wrap" : "pre";
      if (storyMode()) {
        // The story is laid in the label's rectangle; the label's font, colour
        // and alignment are its defaults, and the vertical anchor places it.
        if (text.firstChild !== storyHost || text.childNodes.length !== 1) text.replaceChildren(storyHost);
        text.style.whiteSpace = current.textWrap ? "pre-wrap" : "pre";
        // An imported shape anchors its words as its body says (`bodyPr`
        // anchor); its insets come with the label's rectangle below.
        if (current.textBody) {
          text.style.alignItems =
            current.textBody.anchor === "t" ? "start" : current.textBody.anchor === "b" ? "end" : "center";
          text.style.textAlign = "start";
        }
      } else if (
        applyShapeTextBody(
          text,
          current.textBody,
          current.textFontSizePt === DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
          undefined,
          documentShapeIsWordStory(node.attrs as Record<string, unknown>),
        )
      ) {
        text.style.whiteSpace = "pre-wrap";
      } else if (text.firstChild !== paintText || text.childNodes.length !== 1) {
        text.replaceChildren(paintText);
      }
      // Word lays the words out in the geometry's own text rectangle (`a:rect`,
      // the same one the deck and the worksheet use), the body insets measured
      // from its edges: an ellipse's inscribed box, a triangle's lower part.
      // Word's default insets are 0.1 in left/right and 0.05 in top/bottom.
      text.style.inset = documentShapeTextInsetCss(current, width, height);
      // WordArt: the words bent on the preset's paths (Word draws them so while
      // the shape is shown; typing shows them straight in the in-shape field).
      {
        const warp = !textEditing && !isGroup ? current.textWarp : undefined;
        const warpShadow = current.textPaint?.shadow ?? null;
        // A gradient text fill is one ramp over the warp's box (the canvas
        // paints it; the words' own CSS ramp is hidden with them).
        const warpGradient = current.textPaint?.fillGradient ?? null;
        const key = warp
          ? `${JSON.stringify(warp)}|${current.textWrap}|${current.textHorizontalAlign}|${JSON.stringify(warpShadow)}|${JSON.stringify(warpGradient)}`
          : "";
        if (shapeWarp && shapeWarp.key !== key) disposeShapeWarp();
        if (warp && !shapeWarp) {
          const overlay = document.createElement("div");
          overlay.dataset.documentShapeTextWarp = warp.preset;
          Object.assign(overlay.style, { position: "absolute", pointerEvents: "none", overflow: "visible" });
          paint.insertBefore(overlay, text.nextSibling);
          shapeWarp = {
            key,
            overlay,
            dispose: attachOfficeTextWarp({
              source: text,
              host: overlay,
              warp,
              // A documentShape's warp fills its text rectangle whatever its
              // wrap (a legacy WordArt's fitshape; a drawn shape's square
              // wrap): only a Word text box frame narrows to its line.
              align: current.textHorizontalAlign,
              shadow: warpShadow,
              fillGradient: warpGradient,
            }),
          };
        }
        if (shapeWarp) shapeWarp.overlay.style.inset = text.style.inset;
        const copiedShadow = !warp && officeTextShadowTransformed(warpShadow) ? warpShadow : null;
        const copyKey = copiedShadow ? JSON.stringify(copiedShadow) : "";
        if (shapeShadowCopy && shapeShadowCopy.key !== copyKey) {
          shapeShadowCopy.dispose();
          shapeShadowCopy = null;
        }
        if (copiedShadow && !shapeShadowCopy) {
          shapeShadowCopy = {
            key: copyKey,
            dispose: attachOfficeTextShadowCopy({ source: text, host: paint, shadow: copiedShadow, insetsFromPadding: true }),
          };
        }
      }
    }
    // Format Shape > 3-D Rotation: the words lie on the shape's front and turn
    // with it unless Keep text flat is checked; typed into, they lie flat, as
    // Office edits them. Turned about the SHAPE's centre, as its drawing is.
    {
      const textTurn = isGroup
        ? null
        : officeShapeTextTurn(
            current.shapeEffects ? normalizeDocumentShapeEffects(current.shapeEffects) : null,
            { width: Math.max(1, width), height: Math.max(1, height) },
            { keepTextFlat: current.keepTextFlat, editing: textEditing },
          );
      const origin = textTurn ? documentShapeTextOriginPx(current, width, height) : null;
      for (const layer of [text, shapeWarp?.overlay]) {
        if (!layer) continue;
        // The words' turn in the plane is taken BEFORE the 3-D turn, as
        // Word lays them on the shape's front and turns the front
        // (text3d-flip-probe-word.pdf: a flipV shape's and a vert270
        // shape's words lean and foreshorten with the shape's face). A
        // WordArt overlay is horizontal: it takes the flip's half turn only.
        const plane = isGroup ? 0 : layer === text ? textPlaneTurn : documentShapeTextPlaneTurn({ flipV: current.flipV });
        layer.style.transform = textTurn ? `${textTurn.transform}${plane ? ` rotate(${plane}deg)` : ""}` : "";
        layer.style.rotate = !textTurn && plane ? `${plane}deg` : "";
        layer.style.transformStyle = textTurn?.transformStyle ?? "";
        layer.style.transformOrigin = origin ? `${origin.x}px ${origin.y}px` : "";
      }
    }
    // A later box of a linked chain shows the words that overflow from the
    // first; only the first takes typing.
    shapeWordsLocked =
      !controlsEditable ||
      (typeof current.linkedTextBoxSequence === "number" &&
        current.linkedTextBoxSequence > 0);
    root.dataset.selected = selected ? "true" : "false";
    root.dataset.textEditing = textEditing ? "true" : "false";
    root.dataset.preset = current.preset;
    root.dataset.group = isGroup ? "true" : "false";
    root.dataset.preserveOnly = isGroup && !editableGroup ? "true" : "false";
    root.dataset.editable = controlsEditable ? "true" : "false";
    root.dataset.lockAspectRatio = current.lockAspectRatio ? "true" : "false";
    // Hidden from the Selection Pane: still in the document, not drawn.
    if (current.hidden) root.dataset.hidden = "true";
    else delete root.dataset.hidden;
    root.dataset.textBox = current.isTextBox ? "true" : "false";
    root.dataset.effect = current.effect;
    root.dataset.textDirection = current.textDirection;
    root.dataset.textVerticalAlign = current.textVerticalAlign;
    root.dataset.wrapMode = current.wrapMode;
    // A drawing read from a Word file: In Line with Text it is its
    // paragraph's line and nothing more (no breathing room of our own).
    const source = node.attrs.source as { adapter?: unknown } | null | undefined;
    if (source && typeof source === "object" && source.adapter === "docx") root.dataset.docxSource = "true";
    else delete root.dataset.docxSource;
    // Ink strokes (Draw tab) are addressable as such: styling and harnesses
    // key on the figure, not on the painted path.
    if (current.inkTool) root.dataset.inkTool = current.inkTool;
    else delete root.dataset.inkTool;
    // Written while recording: playing the recording dims what is still to come.
    if (current.inkTool && current.inkAudio) root.dataset.inkAudio = current.inkAudio;
    else delete root.dataset.inkAudio;
    // A strip of tape (Draw ▸ Tape): a tap peels it back or lays it down.
    if (current.inkTool && current.inkTape) root.dataset.inkTape = current.inkTape;
    else delete root.dataset.inkTape;
    if (typeof current.linkedTextBoxStoryId === "number") {
      root.dataset.linkedTextBoxStory = String(current.linkedTextBoxStoryId);
      root.dataset.linkedTextBoxSequence = String(
        current.linkedTextBoxSequence ?? 0,
      );
    } else {
      delete root.dataset.linkedTextBoxStory;
      delete root.dataset.linkedTextBoxSequence;
    }
    // Mark as decorative (Word's Alt Text > Mark as decorative): a reader
    // skips the object, so reading it offers nothing to assistive
    // technology; an author editing still reaches it by its kind, not by the
    // description the mark set aside (WUA 143).
    const decorative = node.attrs.decorative === true;
    root.setAttribute(
      "aria-label",
      decorative
        ? current.isTextBox ? labels.textBox : labels.shape
        : current.altText ||
          current.text ||
          (current.isTextBox ? labels.textBox : labels.shape),
    );
    if (decorative && !editor.isEditable) {
      root.setAttribute("aria-hidden", "true");
      root.setAttribute("data-decorative", "true");
    } else {
      root.removeAttribute("aria-hidden");
      root.removeAttribute("data-decorative");
    }
    const blockerLabel =
      textBlocker === "placeholderTextOnly"
        ? labels.smartArtPlaceholderTextOnly
        : textBlocker
          ? labels.smartArtTextNotEditable
          : null;
    if (blockerLabel) {
      root.title = blockerLabel;
      root.dataset.smartArtTextBlocked = textBlocker ?? undefined;
    } else {
      root.removeAttribute("title");
      delete root.dataset.smartArtTextBlocked;
    }
    // Paint a compact normalized CSS rank, never the raw UInt32 DrawingML
    // value — and rank it in the document's ONE floating stack, the same
    applyStackRank();
    // A highlighter multiplies over the words under it, so they stay dark,
    // as in Word. The blend goes on the element that ranks in the page's
    // stack (`paint` for a float, the wrapper inline): on the stroke's svg it
    // blended only with that element's own transparent layer, and the
    // translucent yellow washed the words out (WUA 148).
    const highlighter = node.attrs.inkTool === "highlighter";
    paint.style.mixBlendMode = highlighter && floating ? "multiply" : "";
    root.style.mixBlendMode = highlighter && !floating ? "multiply" : "";
    if (typeof current.relativeHeight === "number") {
      root.dataset.relativeHeight = String(current.relativeHeight);
    } else {
      delete root.dataset.relativeHeight;
    }
    showChromeState(isGroup && !editableGroup, controlsEditable);
    if (!isGroup || !groupMembers) {
      groupLayer.replaceChildren();
      // An ink stroke painted from these very attrs is drawn already: a
      // render for anything else (the editor's write authority flipping, a
      // selection) re-fitted every stroke's pressure outline on the page,
      
      if (current.inkTool && paintedInk?.attrs === node.attrs) {
        svg.style.filter = paintedInk.filter;
        svg.style.setProperty("-webkit-box-reflect", paintedInk.reflect);
        svg.style.transform = paintedInk.transform;
      } else if (current.inkTool) {
        // A stroke built with many others (a page of handwriting opening) is
        // drawn after the open, its sheet's turn by nearness to the view
        // (deferredInkPaint); one still waiting is drawn by its queued job,
        // from the attrs the node holds then.
        if (!inkStrokePaintPending(root)) {
          paintInkStroke(root, paintLandedInk, { bulk: !firstRenderDone });
        }
      } else {
        cancelInkStrokePaint(root);
        paintSvg(current);
      }
      if (selectedMemberId) {
        selectedMemberId = null;
        paintMemberSelection();
      }
      return;
    }

    // An authored SmartArt's shapes are selected, moved, resized and typed
    // into one at a time (the deck's member model, on the Docs group). Read
    // live in every handler: the editor may not be editable (or mounted) yet
    // when this renders.
    memberTextOpeners.clear();
    // The member whose words are open keeps its field: the box and its frame
    // are lifted out before the members are rebuilt and set back into the
    // member's new element below, so a render (another shape's move, a
    // decoration elsewhere) never tears the field down mid-word.
    const keptMemberText =
      openMemberTextId !== null && openMemberTextBoxes.get(openMemberTextId)
        ? { memberId: openMemberTextId, ...openMemberTextBoxes.get(openMemberTextId)! }
        : null;
    for (const field of memberFields.splice(0)) {
      if (field !== keptMemberText?.field) field.destroy();
    }
    if (keptMemberText?.field) memberFields.push(keptMemberText.field);
    for (const [memberId, entry] of openMemberTextBoxes) {
      if (memberId !== keptMemberText?.memberId) entry.host.remove();
    }
    openMemberTextBoxes.clear();
    for (const dispose of memberWarps.splice(0)) dispose();
    if (!keptMemberText) openMemberTextId = null;
    const coordinateWidth = current.groupCoordinateWidthEmu ?? current.widthEmu;
    const coordinateHeight =
      current.groupCoordinateHeightEmu ?? current.heightEmu;
    // An authored SmartArt's words are sized together, from its current
    // frame, as Office sizes a graphic's text (the shared fit); every other
    // group keeps the `.text` rule's size.
    const smartArtLabelPx = documentSmartArtLabelFontPx(current);
    // A converted Word diagram's words at the sizes Office's autofit gave them.
    const officeLabelScale = documentSmartArtOfficeLabelScale(current);
    // An authored diagram's shapes open their item's words; its connecting
    // shapes and picture placeholders open none (the rule the three editors
    // share, `smartArtMemberTextItem`). An ordinary group's members all do.
    const smartArtDrawing = new Set(
      editableSmartArt()
        ? groupMembers
            .filter((member) => smartArtMemberTextItem(member) === null)
            .map((member) => member.memberId)
        : [],
    );
    // A preserved Office diagram's picture slots, drawn from the page's own
    // source package (one request per diagram, shared across renders).
    const slotPageId = getPageId?.();
    const slotPictures =
      slotPageId && documentShapeIsPreservedNativeSmartArt(current)
        ? preservedSmartArtSlotPictures(current.source?.nativeSmartArtView)
        : null;
    const slotMedia = slotPictures && slotPageId
      ? preservedSmartArtSlotMedia({ pageId: slotPageId, ...slotPictures.address })
      : null;
    // The diagram's box, which Metallic's one light runs down and 3d6's
    // runs across.
    const groupTop = Math.min(...groupMembers.map((member) => member.yEmu));
    const groupBottom = Math.max(...groupMembers.map((member) => member.yEmu + member.heightEmu));
    const groupLeft = Math.min(...groupMembers.map((member) => member.xEmu));
    const groupRight = Math.max(...groupMembers.map((member) => member.xEmu + member.widthEmu));
    const faceSpanOf = (member: (typeof groupMembers)[number]) =>
      groupBottom > groupTop
        ? {
            top: (member.yEmu - groupTop) / (groupBottom - groupTop),
            bottom: (member.yEmu + member.heightEmu - groupTop) / (groupBottom - groupTop),
            ...(groupRight > groupLeft
              ? {
                  left: (member.xEmu - groupLeft) / (groupRight - groupLeft),
                  right: (member.xEmu + member.widthEmu - groupLeft) / (groupRight - groupLeft),
                }
              : {}),
          }
        : null;
    const memberElements = groupMembers.map((member) => {
      const memberElement = document.createElement("div");
      memberElement.dataset.documentShapeGroupMember = member.memberId;
      memberElement.dataset.documentShapeGroupMemberKind =
        member.kind ?? "shape";
      memberElement.className = styles.groupMember;
      // A whole-diagram 3-D style (`3d5`-`3d9`) tilts the diagram as ONE
      // object: the same rotation on every member, each member's transform
      // origin moved onto the group's shared centre. Both boxes are in the
      // group's own child coordinate space, which is what `smartArtCameraCss`
      // wants, and the member's own rotation still composes on top.
      // A nested group's camera turns only its own leaves, about that
      // nested group's box (`scene3dFrame`, group-scene3d-probe2 W2).
      const pivot = member.scene3dFrame;
      const camera = member.scene3d
        ? smartArtCameraCss(
            member.scene3d,
            pivot
              ? { left: pivot.xEmu, top: pivot.yEmu, width: pivot.widthEmu, height: pivot.heightEmu }
              : { left: 0, top: 0, width: coordinateWidth, height: coordinateHeight },
            {
              left: member.xEmu,
              top: member.yEmu,
              width: member.widthEmu,
              height: member.heightEmu,
            },
          )
        : null;
      Object.assign(memberElement.style, {
        position: "absolute",
        left: `${(member.xEmu / coordinateWidth) * 100}%`,
        top: `${(member.yEmu / coordinateHeight) * 100}%`,
        width: `${(member.widthEmu / coordinateWidth) * 100}%`,
        height: `${(member.heightEmu / coordinateHeight) * 100}%`,
        // A member carries the extent the PACKAGE wrote, and Word writes a
        // diagram's separator rules 2 EMU thick — a fraction of a percent of
        // the child space, which paints nothing at all. The member's box is
        // therefore at least as thick as the stroke it has to show, exactly as
        // a straight line's canvas box is (SHAPE-IMPORT-AUDIT.md §21.3, §22).
        // The geometry the file holds and the geometry the save writes back
        // are untouched; unlike the line's box this one is not re-centred,
        // because a percentage layout has no pixel size to centre in.
        minWidth: `${Math.max(1, ptToPx(member.outlineWidthPt))}px`,
        minHeight: `${Math.max(1, ptToPx(member.outlineWidthPt))}px`,
        transform: [camera?.transform, buildBlockTransform(member.rotation, member)]
          .filter(Boolean)
          .join(" "),
        transformOrigin: camera?.transformOrigin ?? "center center",
        ...(camera ? { transformStyle: camera.transformStyle } : {}),
        pointerEvents:
          textEditableGroup && editor.isEditable ? "auto" : "none",
        // A SmartArt item its layout does not draw (Office's unused text) is
        // in the outline and nowhere on the page: not painted, never clicked.
        ...(member.smartArtHidden === true ? { display: "none", pointerEvents: "none" } : {}),
      });
      const memberSvg = svgElement("svg", {
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
      });
      memberSvg.classList.add(styles.svg);
      memberSvg.style.width = "100%";
      memberSvg.style.height = "100%";
      const memberText = document.createElement("span");
      memberText.className = styles.text;
      // The diagram's text box for this shape (Office's `dsp:txXfrm`) when it
      // is not the shape's box: a Segmented Cycle wedge's words in the wedge.
      // Absent, the `.text` rule's own inset (the shape's box).
      const memberTextInset = member.smartArtTextBox
        ? (() => {
            const inset = smartArtTextBoxInsetPercents(member.smartArtTextBox);
            return `${inset.top}% ${inset.right}% ${inset.bottom}% ${inset.left}%`;
          })()
        : null;
      if (memberTextInset) memberText.style.inset = memberTextInset;
      // A SmartArt item's words stand at Office's SmartArt line (the single
      // line's 90 %, as the engine fits them and Word draws them), and the line
      // spacing the author gave them (a converted point's `a:lnSpc`) scales the
      // single line itself.
      if (typeof member.smartArtLineSpacing === "number" && Number.isFinite(member.smartArtLineSpacing)) {
        memberText.style.lineHeight = String(
          Math.round(((DOCUMENT_SMARTART_LABEL_LINE_HEIGHT * member.smartArtLineSpacing) / OFFICE_SCENE_LABEL_LINE_SPACING) * 1000) / 1000,
        );
      } else if (typeof (current as { smartArtKind?: unknown }).smartArtKind === "string" && member.smartArtRole !== undefined) {
        memberText.style.lineHeight = String(Math.round(DOCUMENT_SMARTART_LABEL_LINE_HEIGHT * 1000) / 1000);
      }
      // A SmartArt item's words longer than their shape spill above and
      // below it, centred, as Word draws them (DrawingML's `vertOverflow`
      // default), never cut by the `.text` rule's clip.
      if (member.smartArtRole !== undefined || documentShapeIsPreservedNativeSmartArt(current)) {
        memberText.style.overflow = "visible";
      } else if (member.isTextBox !== true && !member.textStory && !memberTextOverflowOff()) {
        // So are a drawing member's own words (a locked canvas's or a
        // group's shape, `a:txBody`): DrawingML's `vertOverflow` is
        // `overflow` unless the file says `clip`, and Windows Word draws the
        // words past the shape (corpus R475-D26 page 5, a locked canvas's
        // "Control 0.006% ..." labels, 20 pt in a 31.5 pt box scaled down:
        // whole in Word, their upper half cut here). A text box (`txBox`,
        // a Word story) keeps the clip: Word hides what does not fit in it.
        memberText.style.overflow = "visible";
      }
      // The words' own alignment (a converted point's `algn`, Align Text):
      // the line stands at that side of the box, its lines aligned so.
      if (member.textHorizontalAlign && member.textHorizontalAlign !== "center") {
        memberText.style.textAlign = member.textHorizontalAlign;
        memberText.style.justifyItems =
          member.textHorizontalAlign === "right" ? "end" : member.textHorizontalAlign === "left" ? "start" : "stretch";
      }
      // …and the capitals they are set in (`cap="all"`), the words untouched.
      if (member.smartArtTextCapitals === true) memberText.style.textTransform = "uppercase";
      // Format Shape > Text Box on the member (Word: each shape in a group
      // keeps its own): where the words anchor, which way they run, and
      // whether they wrap. The defaults are the `.text` rule's own.
      if (member.textVerticalAlign === "top" || member.textVerticalAlign === "bottom") {
        memberText.style.alignItems = member.textVerticalAlign === "top" ? "start" : "end";
      }
      if (member.textDirection && member.textDirection !== "horizontal") {
        memberText.style.writingMode = "vertical-rl";
        memberText.style.textOrientation = member.textDirection === "stacked" ? "upright" : "sideways";
        if (member.textDirection === "rotate270") memberText.style.rotate = "180deg";
      }
      if (member.textWrap === false) memberText.style.whiteSpace = "pre";
      // Home's Font commands on the group (or one member) write the words'
      // format on each member: a size other than the hydration default
      // replaces the graphic's fitted size (Office's autofit ends where the
      // author sets a size), and bold, italic, underline, strike and a font
      // other than the default are drawn as set.
      // A group the author made of shapes (not a SmartArt graphic) keeps
      // each shape's words as they were: the shape's font, size and regular
      // weight. The diagram defaults below (the fitted label size, the
      // interface font, the medium weight) belong to SmartArt; applied to
      // grouped shapes they changed Arial 14 pt to the interface font at
      // 14px/500 the moment the shapes were grouped (WUA 158).
      const authoredGroup =
        typeof (current as { smartArtKind?: unknown }).smartArtKind !== "string" &&
        !documentShapeIsPreservedNativeSmartArt(current) &&
        !editableSmartArt();
      const memberSizePx =
        typeof member.textFontSizePt === "number" &&
        (member.smartArtAuthorTextSize === true ||
          member.textFontSizePt !== DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT)
          ? documentShapePointsToPx(member.textFontSizePt)
          : authoredGroup
            ? documentShapePointsToPx(member.textFontSizePt ?? DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT)
            : (documentSmartArtMemberLabelPx(member, officeLabelScale) ?? smartArtLabelPx);
      const memberWeight = member.textBold === true ? "700" : "400";
      // `flipH` mirrors the member's GEOMETRY, never its words: Word and
      // PowerPoint draw a horizontally flipped shape's text unmirrored. The
      // member's box carries the flip (so its outline and a picture member
      // mirror), which would mirror the label with it, so the label takes the
      // flip back. A Right to Left SmartArt's chevrons are flipped this way
      // and keep their words readable. The group's own flip mirrors the whole
      // member layer, so the words take back the mirror the member and its
      // group make together: a flipped group keeps its labels readable, as
      // one flipped shape does (WUA 174).
      const memberTextMirrored =
        (member.flipH === true) !== (current.flipH === true) &&
        (member.flipV === true) === (current.flipV === true);
      if (memberTextMirrored) {
        memberText.style.transform = "scaleX(-1)";
      }
      // A preserved diagram's label formatted in part is drawn run by run, as
      // the file's own drawing states its runs (display only).
      const memberRuns = member.textRuns?.length ? member.textRuns : preservedSmartArtMemberRuns(current, member);
      const memberBodyApplied = applyShapeTextBody(
        memberText,
        member.textBody,
        member.textFontSizePt === undefined ||
          member.textFontSizePt === DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
        memberRuns?.length
          ? {
              runs: memberRuns,
              shape: documentShapeMemberLeafAttrs(member),
            }
          : undefined,
        documentShapeIsWordStory(node.attrs as Record<string, unknown>),
      );
      // The words' text effects (an outline, a shadow, a reflection, a
      // glow), drawn as a body run's textEffects mark draws them.
      if (member.textEffects) {
        memberText.style.cssText += `;${textEffectsCss(member.textEffects)}`;
      }
      if (!memberBodyApplied) {
        // Words formatted in part draw run by run (a run's field over the
        // member's), as a standalone shape's do.
        if (memberRuns?.length) {
          const leaf = documentShapeMemberLeafAttrs(member);
          memberText.replaceChildren(shapeTextRunsLine(memberRuns, leaf));
        } else if (
          member.text === "" &&
          editableSmartArt() &&
          member.smartArtItemId !== undefined &&
          member.smartArtPicturePlaceholder !== true &&
          (member.smartArtRole === "node" || member.smartArtRole === "label")
        ) {
          // An empty SmartArt shape shows Office's `[Text]` prompt, drawn
          // here only: the point stays empty in the page and in the file, as
          // in Word (an Add Shape writes no words of its own).
          memberText.textContent = labels.smartArtTextPrompt ?? "[Text]";
          memberText.dataset.documentShapeTextPrompt = "true";
          memberText.style.opacity = "0.6";
        } else {
          memberText.textContent = member.text;
        }
        if (memberSizePx !== null) {
          memberText.style.fontSize = `${memberSizePx}px`;
        }
      }
      // A SmartArt label with no face of its own (none, or the shape model's
      // default the writer leaves off the diagram) is set by Word in the
      // document theme's body font: the export writes no face and the quick
      // style's `a:fontRef idx="minor"` takes the theme's (Cambria in a
      // document whose theme says so, Aptos in a new one). The editor draws
      // that face, not its own interface font, so the page is Word's picture.
      const smartArtThemeFace =
        !authoredGroup &&
        !memberBodyApplied &&
        typeof (current as { smartArtKind?: unknown }).smartArtKind === "string" &&
        member.smartArtAuthorTextFont !== true &&
        (member.textFontFamily === undefined || member.textFontFamily === DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_FAMILY)
          ? documentThemeBodyLatin(editor.state.doc.attrs.documentDesign, editor.state.doc.attrs.defaultFontFamily)
          : undefined;
      if (member.textBold === true) memberText.style.fontWeight = memberWeight;
      // A body the package states is set in the package's weight: regular
      // is 400 there, not the editor's own medium label (a10-smartart-word);
      // a grouped shape's words keep Word's regular weight too (WUA 158).
      // A SmartArt label is regular too: Word's quick styles set the words
      // in the theme's body font at its regular weight (`dgm:style/a:fontRef
      // idx="minor"`), not the editor's medium interface label.
      else if (memberBodyApplied || authoredGroup || smartArtThemeFace) memberText.style.fontWeight = "400";
      if (member.textItalic === true) memberText.style.fontStyle = "italic";
      const memberDecoration = [
        member.textUnderline && member.textUnderline !== "none" ? "underline" : "",
        member.textStrike === true ? "line-through" : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (memberDecoration) {
        memberText.style.textDecorationLine = memberDecoration;
        if (member.textUnderline === "double") {
          memberText.style.textDecorationStyle = "double";
        }
      }
      const memberFontFamily =
        smartArtThemeFace ??
        member.textFontFamily ??
        (authoredGroup ? DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_FAMILY : undefined);
      if (
        memberFontFamily &&
        (memberFontFamily !== DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_FAMILY ||
          authoredGroup ||
          smartArtThemeFace ||
          member.smartArtAuthorTextFont === true)
      ) {
        // Behind a Latin face the document's own East Asian faces, the ones
        // Word draws the label's CJK text in (SimSun behind Cambria in
        // a10-smartart-word), so the browser does not pick its own.
        const eastAsian = memberBodyApplied
          ? orderEastAsianFontFamiliesForText(
              (normalizeEastAsianFontFamilies(editor.state.doc.attrs.eastAsianFontFamilies) ?? [])
                .filter((face) => face.toLowerCase() !== memberFontFamily.toLowerCase()),
              member.text,
            )
          : [];
        // With the served open faces behind each Office name, where the real
        // ones are not installed (the body text's TextStyling does the same).
        memberText.style.fontFamily = smartArtThemeFace
          ? // The theme's face as the editor holds it now (see
            // DOCUMENT_THEME_BODY_FACE_PROPERTY), the face read here behind it.
            `var(${DOCUMENT_THEME_BODY_FACE_PROPERTY}, ${documentThemeBodyFaceStack(editor.state.doc.attrs)})`
          : withOfficeFontSubstitutes(
              [memberFontFamily, ...eastAsian]
                .map((face) => (/^[A-Za-z][\w-]*$/.test(face) ? face : `"${face.replace(/"/g, "")}"`))
                .join(", "),
            );
      }
      // A member paints its OWN label colour when it carries one: that is how a
      // SmartArt quick style's light or dark text survives into a document
      // (`lib/office-smartart/document-shapes`'s `smartArtLabelPaint`, the same
      // colour a slide label and a sheet shape carry). A member without one
      // keeps the document text colour, which is every hand-built group's
      // behaviour.
      if (member.textFill !== undefined) {
        memberText.style.color =
          member.textFill === "none" ? "transparent" : member.textFill;
      }
      // WordArt on the member's words (a style chosen with the whole SmartArt
      // graphic selected), painted as a standalone shape's words are.
      if (member.textPaint && member.kind !== "picture") {
        for (const [key, value] of Object.entries(officeTextPaintCss(member.textPaint))) {
          const cssName = key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
          memberText.style.setProperty(cssName, String(value));
        }
      }
      if (member.kind === "chart" && member.chart) {
        // A chart Word grouped with other objects (corpus R48-D09): drawn by
        // the ONE chart planner a Docs chart node is drawn by, at the member's
        // box; a chart the engine cannot draw leaves the box empty.
        memberText.style.display = "none";
        const chartBox = document.createElement("div");
        chartBox.dataset.documentShapeGroupMemberChart = "true";
        Object.assign(chartBox.style, { position: "absolute", inset: "0", pointerEvents: "none" });
        const widthPx = Math.max(1, Math.round(ptToPx((member.widthEmu / EMU_PER_PT))));
        const heightPx = Math.max(1, Math.round(ptToPx((member.heightEmu / EMU_PER_PT))));
        try {
          // The chart's own V2 attrs (the normalizer's `attrs`; handed the
          // whole reading, the picture drew the chart model's default data,
          // corpus R460-D40's grouped charts as "类别 1..4").
          const chartAttrs = normalizeChartBlockAttrs(member.chart as Record<string, unknown>).attrs;
          const inputs = documentChartPlanInputs(member.chart as Record<string, unknown>, null);
          const { content } = documentChartPictureContent({
            attrs: chartAttrs as ChartBlockAttrsV2,
            nativeLook: inputs.nativeLook,
            themeAccents: inputs.themeAccents,
            linkedValueNumberFormat: inputs.linkedValueNumberFormat,
          });
          requestChartPicture({ ...content, width: widthPx, height: heightPx })
            .then((picture) => {
              chartBox.innerHTML = sanitizeChartPicture(picture.svg, picture.width, picture.height);
              const drawn = chartBox.querySelector("svg");
              if (drawn) {
                drawn.style.width = "100%";
                drawn.style.height = "100%";
                drawn.style.display = "block";
              }
            })
            .catch(() => {
              // Offline, busy or refused: the box keeps the chart's place.
            });
        } catch {
          // A chart the planner refuses keeps its place, empty.
        }
        memberElement.setAttribute("role", "img");
        memberElement.append(memberSvg, memberText, chartBox);
      } else if (member.kind === "picture") {
        // A picture inside a group IS a member of the group: it sits in the
        // group's child coordinate space, so the box, the turn and the two
        // mirrors above already place it, and its position among its siblings
        // in THIS list is the group's z-order (the package's document order,
        // which is what `CT_WordprocessingGroup`'s single unbounded choice
        // makes it). What is left is what a picture has and a shape does not:
        // its bytes, its frame, and its crop (SHAPE-IMPORT-AUDIT.md §58).
        //
        // The frame is painted first, by the SAME `paintShape` every other
        // member gets, and the picture is then clipped to THAT geometry --
        // not to a second idea of what a `roundRect` is. A clip built from
        // anything but the painted path is a shape that can drift from the
        // one the reader read.
        // The frame is painted without the picture's line: Word draws a
        // picture's outline OVER its pixels, so that line is painted after
        // the picture, below.
        paintShape(
          memberSvg,
          normalizeDocumentShapeAttrs({
            ...member,
            outline: "none",
            outlineWidthPt: 0,
            source: null,
          }),
        );
        memberText.style.display = "none";
        const clipShapes = (Array.from(memberSvg.children) as SVGElement[])
          .filter((painted) =>
            ["path", "rect", "circle", "ellipse", "polygon"].includes(
              painted.tagName.toLowerCase(),
            ),
          )
          .map((painted) => painted.cloneNode(true) as SVGElement);
        let clipPathRef = "";
        if (clipShapes.length) {
          const clipId = `document-shape-picture-${++documentShapeMarkerSequence}`;
          const clip = svgElement("clipPath", { id: clipId });
          for (const shape of clipShapes) {
            shape.removeAttribute("filter");
            shape.removeAttribute("stroke");
            shape.removeAttribute("stroke-width");
            clip.append(shape);
          }
          const defs = svgElement("defs", {});
          defs.append(clip);
          memberSvg.append(defs);
          clipPathRef = `url(#${clipId})`;
        }
        // `a:srcRect` keeps a window on the source and `a:stretch/a:fillRect`
        // stretches THAT window over the frame -- so the picture is stretched,
        // never letter-boxed and never cover-cropped. The window is spelled
        // here the only way plain CSS can: an overflow box, the image scaled
        // by 1/(1 - l - r) and 1/(1 - t - b), and shifted by the left/top
        // crop. Identity crop leaves every number at its default.
        const cropLeft = (member.pictureCropLeft ?? 0) / 100;
        const cropRight = (member.pictureCropRight ?? 0) / 100;
        const cropTop = (member.pictureCropTop ?? 0) / 100;
        const cropBottom = (member.pictureCropBottom ?? 0) / 100;
        const keptWidth = Math.max(1e-6, 1 - cropLeft - cropRight);
        const keptHeight = Math.max(1e-6, 1 - cropTop - cropBottom);
        const cropWindow = document.createElement("div");
        Object.assign(cropWindow.style, {
          position: "absolute",
          inset: "0",
          overflow: "hidden",
          pointerEvents: "none",
          ...(clipPathRef ? { clipPath: clipPathRef } : {}),
        });
        const picture = document.createElement("img");
        // A picture whose bytes did not fit the page's budget still draws as
        // the frame it is, wearing the glyph every host already draws for a
        // picture that holds none, so it reads as a picture rather than as a
        // blank box. The import receipt names that member.
        // Its bytes inline, or the stored file's own picture named by digest
        // (`mrai-picture:<sha256>`, as an imported picture beside the group
        // is: drawn from the page that holds it).
        if (member.src) memberWarps.push(drawDocumentPicture(picture, member.src));
        else picture.src = SMARTART_PICTURE_PLACEHOLDER_ICON_SRC;
        picture.alt = "";
        picture.setAttribute("aria-hidden", "true");
        picture.draggable = false;
        // The editor's own picture rule (a block image's 12px top and bottom
        // margin and width cap) is the body's, not a member's: it pushed every
        // grouped picture 12px down inside its clipped frame (corpus R158-D07:
        // the crest's lettering showed only its lower half).
        Object.assign(picture.style, { margin: "0", maxWidth: "none", maxHeight: "none" });
        Object.assign(
          picture.style,
          member.src
            ? {
                position: "absolute",
                left: `${(-cropLeft / keptWidth) * 100}%`,
                top: `${(-cropTop / keptHeight) * 100}%`,
                width: `${(1 / keptWidth) * 100}%`,
                height: `${(1 / keptHeight) * 100}%`,
                objectFit: "fill",
                pointerEvents: "none",
              }
            : {
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "40%",
                height: "40%",
                objectFit: "contain",
                opacity: "0.65",
                pointerEvents: "none",
              },
        );
        cropWindow.append(picture);
        memberElement.dataset.documentShapeGroupMemberPicture = member.src
          ? "filled"
          : "unavailable";
        memberElement.setAttribute("role", "img");
        memberElement.setAttribute("aria-label", labels.picture);
        memberElement.append(memberSvg, memberText, cropWindow);
        if (member.outline !== "none" && member.outlineWidthPt > 0) {
          const outlineSvg = svgElement("svg", {
            viewBox: "0 0 100 100",
            preserveAspectRatio: "none",
            "aria-hidden": "true",
          });
          outlineSvg.classList.add(styles.svg);
          Object.assign(outlineSvg.style, {
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
          });
          paintShape(
            outlineSvg,
            normalizeDocumentShapeAttrs({ ...member, kind: "shape", src: undefined, source: null }),
          );
          memberElement.append(outlineSvg);
        }
      } else if (member.kind === "connector") {
        paintConnector(memberSvg, member);
        memberText.style.display = "none";
        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.className = styles.connectorLabel;
        labelInput.dataset.documentConnectorLabel = member.memberId;
        labelInput.value = member.text;
        labelInput.maxLength = 2_000;
        labelInput.disabled = !editableGroup || !editor.isEditable;
        labelInput.setAttribute("aria-label", labels.connectorLabel);
        const expectedDoc = editor.state.doc;
        const expectedNode = node;
        const expectedPosition = getPos();
        labelInput.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
          selectCurrentNode(false);
        });
        labelInput.addEventListener("change", () => {
          if (typeof expectedPosition !== "number") return;
          const next = documentShapeConnectorCanvasLabelPatch(
            current,
            member.memberId,
            labelInput.value,
          );
          if (next) {
            commitConnectorCanvas(
              expectedDoc,
              expectedNode,
              expectedPosition,
              next,
            );
          }
        });
        labelInput.addEventListener("keydown", (event) => {
          // An IME's Enter / Escape confirm or cancel its composition.
          if (isImeCompositionKey(event)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            labelInput.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            labelInput.value = member.text;
            selectCurrentNode(true);
          }
        });
        memberElement.append(memberSvg, memberText, labelInput);
      } else {
        paintDocumentShapeGroupMember(memberSvg, current, member, {
          faceSpan: faceSpanOf(member),
          groupFlip: current,
        });
        // A wash (a Venn's discs, a Grouped List's plate) is the member's own
        // transparency; its label stays opaque.
        if (member.opacity !== undefined) {
          memberSvg.style.opacity = String(member.opacity / 100);
        }
        memberElement.tabIndex =
          textEditableGroup && editor.isEditable ? 0 : -1;
        memberElement.setAttribute("role", "button");
        memberElement.setAttribute(
          "aria-label",
          member.text
            ? labels.moveNamedShape(member.text)
            : labels.moveConnectedShape,
        );
        memberElement.append(memberSvg, memberText);
        if (member.textStory) {
          // The member's own story (a table, a picture among its words),
          // drawn by the header band's renderer: the same blocks a header
          // text box's story is.
          const blocks = normalizeBandRichBlocks(member.textStory, false, true);
          if (blocks) {
            const story = buildBandRichDom(document, blocks, {
              pageLabel: "",
              totalPages: 1,
              styleDefinitions: editor.state.doc.attrs.styleDefinitions,
            });
            story.dataset.documentShapeMemberStory = "true";
            memberText.replaceChildren(story);
          }
        }
        const slotPicture = slotPictures?.slots.get(member.memberId);
        if (slotPicture && slotMedia) {
          appendPreservedSlotPicture(memberElement, memberSvg, memberText, slotPicture, slotMedia);
        }
        // A member's WordArt (a Word 2007 canvas's bent label, R05-D09).
        if (member.textWarp && member.text.trim()) {
          const overlay = document.createElement("span");
          overlay.className = styles.text;
          overlay.dataset.documentShapeTextWarp = member.textWarp.preset;
          if (memberTextInset) overlay.style.inset = memberTextInset;
          overlay.style.pointerEvents = "none";
          memberElement.append(overlay);
          memberWarps.push(
            attachOfficeTextWarp({
              source: memberText,
              host: overlay,
              warp: member.textWarp,
              align: member.textHorizontalAlign ?? "center",
            }),
          );
        }
        // Office hit-tests a SmartArt shape by its GEOMETRY: a press on its
        // painted fill or outline, or on its words, selects it, and the empty
        // part of its box passes the press to the shape below (or to the
        // graphic). Every Segmented Cycle wedge's box is the whole disc; hit
        // by box, the topmost wedge took every press. Only a member that
        // takes presses at all (its inline `auto` above) changes: the class
        // decides instead, and the open label editor keeps its own `auto`.
        if (
          memberElement.style.pointerEvents === "auto" &&
          (editableSmartArt() || movablePreservedSmartArt())
        ) {
          memberElement.style.pointerEvents = "";
          memberElement.classList.add(officeDrawingSelectionStyles.geometryHit);
          // Its words' rectangle (the diagram's text box) is hit as words; an
          // empty label is no words and blocks nothing beneath it.
          if (memberText.textContent?.trim()) {
            memberText.setAttribute(OFFICE_HIT_TEXT_ATTRIBUTE, "");
            // Hit where the words are: bare text has no box of its own, so it
            // goes in an element (a grid item, sized to the words).
            if (!memberText.firstElementChild) {
              const words = document.createElement("span");
              words.textContent = memberText.textContent;
              memberText.replaceChildren(words);
            }
          }
        }
        if (member.smartArtPicturePlaceholder) {
          // A picture layout's slot. The member itself is an ordinary shape in
          // the neutral placeholder colours (a Word group member is a
          // `wps:wsp` and draws no picture of its own).
          //
          // A FILLED slot draws the member's own picture at full bleed, the way
          // Office draws a picture point's `a:blipFill`: `cover`, so the slot
          // stays the shape the layout laid out and the picture is cropped to
          // it rather than letterboxed inside it. An EMPTY one keeps the glyph
          // the SmartArt engine already draws for a picture point holding no
          // picture, so the slot reads as a picture in every host rather than
          // as a blank box. One branch, two states — the filled slot is not a
          // second rendering path.
          memberElement.dataset.documentShapeGroupMemberPicture = member.src
            ? "filled"
            : "true";
          if (member.src) {
            // The slot's picture with its Picture Format (Crop, Picture
            // Style): `./documentSmartArtSlotPicture`.
            const dispose = appendDocumentSmartArtSlotPicture(memberElement, {
              src: member.src,
              format: smartArtSlotPictureFormatOf(member),
              preset: member.preset,
              widthPx: (current.widthEmu * (member.widthEmu / coordinateWidth)) / EMU_PER_PX,
              heightPx: (current.heightEmu * (member.heightEmu / coordinateHeight)) / EMU_PER_PX,
            });
            if (dispose) memberWarps.push(dispose);
          }
          const glyph = document.createElement("img");
          glyph.src = member.src ?? SMARTART_PICTURE_PLACEHOLDER_ICON_SRC;
          glyph.alt = "";
          glyph.setAttribute("aria-hidden", "true");
          glyph.draggable = false;
          Object.assign(
            glyph.style,
            member.src
              ? {
                  position: "absolute",
                  inset: "0",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  pointerEvents: "none",
                }
              : {
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "40%",
                  height: "40%",
                  objectFit: "contain",
                  opacity: "0.65",
                  pointerEvents: "none",
                },
          );
          if (!member.src) memberElement.append(glyph);
          if (!member.src) {
            memberElement.addEventListener("click", (event) => {
              const diagram = editableSmartArt();
              if (!diagram || !editor.isEditable) return;
              const box = glyph.getBoundingClientRect();
              if (
                box.width > 0 &&
                (event.clientX < box.left ||
                  event.clientX > box.right ||
                  event.clientY < box.top ||
                  event.clientY > box.bottom)
              ) {
                return;
              }
              window.dispatchEvent(
                new CustomEvent<DocumentSmartArtPictureSlotDetail>(
                  DOCUMENT_SMARTART_PICTURE_SLOT_EVENT,
                  { detail: { groupId: diagram.groupId, memberId: member.memberId } },
                ),
              );
            });
          }
        }
        if (
          textEditableGroup &&
          editor.isEditable &&
          !smartArtDrawing.has(member.memberId) &&
          // Words that wait for the conversion land on an item of it: a shape
          // the conversion has no item for takes none.
          (!prepared ||
            documentShapeGroupTextIsEditable(current) ||
            documentSmartArtPreparedMemberId(node, prepared, member.memberId) !== null) &&
          // A member whose story holds a table or a picture keeps it: its
          // words are written from the story, not from a label edit.
          !member.textStory
        ) {
          // A member's label IS its shape text, so it is edited exactly the way
          // a standalone shape's text is: double click, type, Enter to commit,
          // Escape to abandon. The input only covers the member while it is
          // being edited, so the box keeps its painted label and stays
          // draggable the rest of the time. This is the one text path every
          // native group shares — a flowchart box, a mind-map branch, and a
          // SmartArt node all commit through the same member patch.
          // Typed IN the shape, as Word does: the shared in-shape editor
          // style under the label's own metrics (the `.text` rule's font and
          // inset, the member's own colour), so the words do not move.
          // Typed IN the shape, as Word does, in the SAME rich text field a
          
          // formatted on its own and drawn formatted while it is typed), on
          // the label's own rectangle (the `.text` rule's 18% / 14% inset).
          const memberTextBox = document.createElement("span");
          memberTextBox.dataset.documentShapeTextEditor = "true";
          memberTextBox.dataset.documentShapeGroupMemberTextBox = member.memberId;
          Object.assign(memberTextBox.style, {
            position: "absolute",
            // Typed where the words are drawn: the shape's text box.
            inset: memberTextInset ?? "18% 14%",
            pointerEvents: "auto",
            zIndex: "2",
          });
          // Typed unmirrored in a flipped member, like the label it replaces.
          if (memberTextMirrored) memberTextBox.style.transform = "scaleX(-1)";
          memberTextBox.hidden = true;
          const memberFont = `${memberText.style.fontStyle || "normal"} ${memberWeight} ${memberSizePx ?? 14}px/1.25 ${memberText.style.fontFamily || "var(--font-sans, ui-sans-serif, system-ui, sans-serif)"}`;
          const memberColor = memberText.style.color || "var(--console-text-primary, #172033)";
          let memberField: DocumentShapeRichTextField | null = null;
          const memberFieldElement = (): HTMLTextAreaElement | null =>
            (memberField?.element() ?? null) as unknown as HTMLTextAreaElement | null;
          const ensureMemberField = (): HTMLTextAreaElement | null => {
            if (!memberField) {
              memberField = mountDocumentShapeRichTextField(memberTextBox, {
                ariaLabel: labels.text,
                testId: "document-shape-member-text-input",
                maxLength: 2_000,
                onInput: () => {
                  const field = memberFieldElement();
                  if (field) fitOfficeInlineTextEditor(field);
                  notifyShapeTextSelection();
                },
                onSelectionUpdate: () => notifyShapeTextSelection(),
              });
              memberFields.push(memberField);
              const entry = openMemberTextBoxes.get(member.memberId);
              if (entry) entry.field = memberField;
              const field = memberFieldElement();
              if (field) {
                applyOfficeInlineTextEditorStyle(field, {
                  width: "100%",
                  height: "auto",
                  font: memberFont,
                  color: memberColor,
                  "caret-color": memberColor,
                });
                // The label is centred in the shape (`.text` places its items
                // at the middle); the editor hangs from the same middle.
                applyOfficeInlineTextEditorCentered(field, 0, 0);
                field.dataset.documentShapeGroupMemberText = member.memberId;
              }
            }
            return memberFieldElement();
          };
          const memberInherited = memberInheritedRunStyle(member, memberSizePx);
          // No box of its own around the words: Office marks the shape whose
          // text is being typed by turning ITS selection outline dashed (the
          // handles stay), and draws no inner text rectangle. The inset frame
          // drawn here before read as a stray line that could not be moved.
          /** Write the field's words (and their runs) when they changed. */
          const commitMemberText = (): void => {
            const livePosition = getPos();
            if (typeof livePosition !== "number" || !memberField) return;
            // The node as it is NOW: the field may have outlived a render of
            // the graphic (another shape moved, a decoration changed).
            const live = attrs();
            const liveMember = shownAttrs().groupMembers?.find((candidate) => candidate.memberId === member.memberId);
            if (!liveMember) return;
            const typed = memberField.content();
            const value = normalizeDocumentShapeText(typed.text);
            const runs =
              normalizeDocumentShapeTextRuns(
                withoutInheritedRunFields(typed.runs, memberInherited),
                value,
              ) ?? null;
            if (
              value === liveMember.text &&
              JSON.stringify(runs) === JSON.stringify(liveMember.textRuns ?? null)
            ) {
              return;
            }
            // A diagram whose words have no place in the file's own parts: its
            // first words land with its conversion, as one Undo step.
            const conversion = documentShapeGroupTextIsEditable(node.attrs) ? null : preparedConversion();
            if (conversion) {
              const convertedMember = documentSmartArtPreparedMemberId(node, conversion, member.memberId);
              const diagram = readDocumentSmartArtDiagram(conversion.attrs);
              const words =
                convertedMember && diagram
                  ? documentSmartArtMemberTextPatch(diagram, convertedMember, value, runs)
                  : null;
              const { state, dispatch } = editor.view;
              if (!words || !editor.isEditable || state.doc.nodeAt(livePosition) !== node) return;
              yUndoPluginKey.getState(state)?.undoManager.stopCapturing();
              dispatch(
                closeHistory(state.tr).setNodeMarkup(livePosition, undefined, {
                  ...conversion.attrs,
                  ...words,
                }),
              );
              return;
            }
            // A SmartArt shape's words are its outline item's: they go
            // through the shared outline verb (the Text Pane's) and land on
            // the member that hosts the item's text, geometry untouched.
            const smartArtDiagram = editableSmartArt();
            const smartArtText = smartArtDiagram
              ? documentSmartArtMemberTextPatch(
                  smartArtDiagram,
                  member.memberId,
                  value,
                  runs,
                )
              : null;
            const next = smartArtDiagram
              ? smartArtText
                ? ({ ...live, ...smartArtText } as DocumentShapeAttrs)
                : null
              : documentShapeGroupMemberTextPatch(
                  live,
                  member.memberId,
                  value,
                  runs,
                );
            if (!next) return;
            // Written on THIS node wherever the selection went: the field
            // closes on a press elsewhere, which has already moved the page's
            // caret there, and the words typed must not be lost to a
            // selection guard (nor the new caret taken back by the shape).
            const { state, dispatch } = editor.view;
            if (!editor.isEditable || state.doc.nodeAt(livePosition) !== node) return;
            const transaction = closeHistory(state.tr).setNodeMarkup(livePosition, undefined, {
              ...node.attrs,
              groupMembers: next.groupMembers,
            });
            yUndoPluginKey.getState(state)?.undoManager.stopCapturing();
            dispatch(transaction);
          };
          const closeMemberText = (restore: boolean): void => {
            if (openMemberTextId === member.memberId) openMemberTextId = null;
            memberTextBox.hidden = true;
            if (memberFrame) delete memberFrame.dataset.textEditing;
            // The label the page shows now: a render while the field was open
            // drew a new one (and hid it under the field).
            const live = openMemberTextBoxes.get(member.memberId);
            (live && live.box === memberTextBox ? live.label : memberText).style.visibility = "";
            if (!restore) commitMemberText();
          };
          memberTextBox.addEventListener("pointerdown", (event) =>
            event.stopPropagation(),
          );
          memberTextBox.addEventListener("dblclick", (event) =>
            event.stopPropagation(),
          );
          memberTextBox.addEventListener("focusout", (event) => {
            const related = (event as FocusEvent).relatedTarget;
            if (related instanceof globalThis.Node && memberTextBox.contains(related)) return;
            // Into the ribbon, a menu or a pane: the words stay open and
            // selected, as Word keeps them; they close on the next press
            // outside both.
            if (holdOfficeTextBoxForChrome(memberTextBox, related, () => closeMemberText(false))) return;
            closeMemberText(false);
          });
          // `value =` on the field (a programmatic replacement) commits at once.
          memberTextBox.addEventListener("change", () => commitMemberText());
          memberTextBox.addEventListener("keydown", (event) => {
            event.stopPropagation();
            const field = memberFieldElement();
            if (!field) return;
            // The shared shape text box's keyboard: Enter ends the words
            // (Shift+Enter is a line break, as in the deck), Esc leaves them
            // as typed; either way the shape is selected again, as Word
            // does. Tab types a tab, Home / End move along the line, Select
            // All is the shape's words, not the page's.
            const done = () => {
              closeMemberText(false);
              selectCurrentNode(true);
            };
            handleOfficeShapeTextKey(event, field, { commit: done, leave: done });
          });
          const layMemberTextHost = (host: HTMLElement): void => {
            Object.assign(host.style, {
              position: "absolute",
              left: memberElement.style.left,
              top: memberElement.style.top,
              width: memberElement.style.width,
              height: memberElement.style.height,
              transform: memberElement.style.transform,
              transformOrigin: memberElement.style.transformOrigin,
              pointerEvents: "none",
            });
            host.dataset.documentShapeGroupMemberTextHost = member.memberId;
          };
          if (keptMemberText && keptMemberText.memberId === member.memberId) {
            // The field already open on this member stays where it is, words,
            // caret and selection intact; its host follows the member's box.
            layMemberTextHost(keptMemberText.host);
            memberText.style.visibility = "hidden";
            openMemberTextBoxes.set(member.memberId, {
              host: keptMemberText.host,
              box: keptMemberText.box,
              field: keptMemberText.field,
              label: memberText,
              close: keptMemberText.close,
            });
            memberTextOpeners.set(member.memberId, () => {
              (keptMemberText.field?.element() as unknown as HTMLElement | null)?.focus({ preventScroll: true });
            });
            return memberElement;
          }
          const memberTextHost = document.createElement("div");
          layMemberTextHost(memberTextHost);
          memberTextHost.append(memberTextBox);
          memberTextLayer.append(memberTextHost);
          openMemberTextBoxes.set(member.memberId, {
            host: memberTextHost,
            box: memberTextBox,
            field: null,
            label: memberText,
            close: closeMemberText,
          });
          const openMemberText = (seed?: string, caret?: number | null): void => {
            const field = ensureMemberField();
            if (!field || !memberField) return;
            selectCurrentNode(false);
            openMemberTextId = member.memberId;
            // Typed where and as the label is drawn: its box (the package's
            // body insets when it states them), its direction, its anchor,
            // its weight and its paragraphs. Typed in the `.text` rule's box,
            // centred and in the editor's medium weight, a package's top-
            // anchored regular label jumped to the middle in bold-ish type.
            const words = seed ?? member.text;
            const label = getComputedStyle(memberText);
            memberTextBox.style.inset = memberText.style.inset || memberTextInset || "18% 14%";
            memberTextBox.style.writingMode = memberText.style.writingMode;
            memberTextBox.style.textOrientation = memberText.style.textOrientation;
            memberTextBox.style.rotate = memberText.style.rotate;
            const body = memberText.dataset.shapeTextBody === "true" ? member.textBody : null;
            const paragraphs =
              body && body.paragraphs.length > 0 &&
              words === body.paragraphs.map((paragraph) => paragraph.text).join("\n")
                ? body.paragraphs.map((paragraph) =>
                    documentShapeEditorParagraph(
                      paragraph,
                      member.textFontSizePt === undefined ||
                        member.textFontSizePt === DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
                      label,
                      documentShapeIsWordStory(node.attrs as Record<string, unknown>),
                    ),
                  )
                : null;
            const anchor = body
              ? body.anchor === "t" ? "top" : body.anchor === "b" ? "bottom" : "middle"
              : member.textVerticalAlign === "top" || member.textVerticalAlign === "bottom"
                ? member.textVerticalAlign
                : "middle";
            const clear = label.color === "rgba(0, 0, 0, 0)" || label.color === "transparent";
            memberField.setContent({
              text: words,
              // A typed key replaces the words, and their formatting with them.
              runs: seed === undefined ? member.textRuns : undefined,
              inherited: memberInherited,
              style: {
                fontFamily: label.fontFamily,
                fontSize: label.fontSize,
                fontWeight: label.fontWeight,
                fontStyle: label.fontStyle,
                lineHeight: paragraphs ? documentShapeParagraphLineHeight(label) : label.lineHeight,
                color: clear ? memberColor : label.color,
                caretColor: clear ? memberColor : label.color,
                textAlign: paragraphs ? "start" : "center",
                whiteSpace: label.whiteSpace === "pre" ? "pre" : "pre-wrap",
                // Typed in the WordArt it is drawn in at rest.
                ...(member.kind !== "picture" ? officeShapeTextFieldPaintStyle(member.textPaint) : {}),
              },
              ...(paragraphs ? { paragraphs } : {}),
              paint: member.kind !== "picture" ? (member.textPaint ?? null) : null,
            });
            if (anchor === "middle") {
              applyOfficeInlineTextEditorCentered(field, 0, 0);
            } else {
              Object.assign(field.style, {
                top: anchor === "top" ? "0" : "auto",
                bottom: anchor === "bottom" ? "0" : "auto",
                height: "auto",
                maxHeight: "100%",
                transform: "",
              });
            }
            memberText.style.visibility = "hidden";
            memberTextBox.hidden = false;
            // Text-edit mode, as Office shows it: the member's outline dashed
            // (the shared `data-text-editing` rule, lib/office-text-edit-mode).
            if (!memberChrome) buildMemberChrome();
            memberFrame!.dataset.textEditing = "true";
            // Typing on a selected shape replaces its words, as in Office; a
            // caret, not a selection, otherwise: at the pointer for a
            // double-click, at the end for Enter / F2.
            openOfficeShapeTextField(field, seed === undefined ? caret : undefined);
            fitOfficeInlineTextEditor(field);
          };
          memberTextOpeners.set(member.memberId, openMemberText);
          memberElement.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Read the pointer's place in the words before the label hides.
            const caret = officeInlineTextCaretFromPoint(
              memberText,
              event.clientX,
              event.clientY,
            );
            openMemberText(undefined, caret);
          });
        }
        memberElement.addEventListener("contextmenu", () => {
          // Office: a right click on a shape inside the graphic selects THAT
          // shape, and the menu it opens is the shape's (the toolbar reads the
          // pressed member off the event target). The menu that opens owns
          // the keyboard, so the view is not focused under it.
          if (smartArtShapeMemberIds(member.memberId).length) {
            selectMember(member.memberId, false);
          }
        });
        memberElement.addEventListener("pointerdown", (event) => {
          const expectedDoc = editor.state.doc;
          const expectedNode = node;
          const expectedPosition = getPos();
          if (typeof expectedPosition !== "number") return;
          // A pointer landing while this member's label is open belongs to the
          // label, never to a move gesture.
          if (openMemberTextId === member.memberId) return;
          
          // swipe scrolls the page, a tap selects the group, a still hold
          // lifts it whole. Begun here at once, the move was the browser's
          // pan and was cancelled, and the swipe selected the group.
          if (isTouchLikePointer(event) && root.dataset.selected !== "true") return;
          // Word: "select the group, and then select the item" -- a click on
          // an object of a plain group already selected picks that object.
          const picksObject = selected && plainGroupPicksObjects();
          const startX = event.clientX;
          const startY = event.clientY;
          const startMemberX = member.xEmu;
          const startMemberY = member.yEmu;
          let preview = current;
          if (smartArtShapeMemberIds(member.memberId).length) {
            // Office: a click on a shape inside the graphic selects THAT
            // shape (the frame stays drawn around the graphic); dragging it
            // moves the shape alone, within the frame -- in an Office
            // diagram MRAI preserves as much as in one it authored.
            const pressed = beginMemberTransform(
              event,
              member.memberId,
              (dx, dy) => ({ kind: "move", dx, dy }),
            );
            if (pressed) return;
          }
          beginGesture(
            event,
            (next) => {
              const moved = documentShapeGroupMoveMember(
                current,
                member.memberId,
                startMemberX +
                  Math.round(
                    ((next.clientX - startX) / Math.max(width, 1)) *
                      coordinateWidth,
                  ),
                startMemberY +
                  Math.round(
                    ((next.clientY - startY) / Math.max(height, 1)) *
                      coordinateHeight,
                  ),
              );
              if (!moved?.groupMembers) return;
              preview = moved;
              applyGroupMemberLayout(
                moved.groupMembers,
                coordinateWidth,
                coordinateHeight,
              );
            },
            () => {
              // A click is not a move. `preview` starts as the group's
              // normalized attributes (the editor's schema version, its
              // defaults on every member): committed for a press that never
              // moved, a mere pick rewrote the whole group (corpus R240-D26:
              // 376 members, a 1.2 MB page grown to 2.3 MB, and a save the
              // Word file then refused).
              if (preview === current) {
                if (picksObject) selectMember(member.memberId);
                else selectCurrentNode(true);
                return;
              }
              commitConnectorCanvas(
                expectedDoc,
                expectedNode,
                expectedPosition,
                preview,
              );
            },
          );
        });
      }
      return memberElement;
    });
    groupLayer.replaceChildren(...memberElements);
    // A selected shape survives a re-render (its own move, a restyle) but not
    // the loss of its member or of the diagram's editability. A layout that
    // moved its item to another member id moves the selection with it.
    if (selectedMemberId && selectedItemId) {
      const diagram = editableSmartArt();
      const drawnItem = diagram ? documentSmartArtMemberItemId(diagram.members, selectedMemberId) : null;
      if (diagram && drawnItem !== selectedItemId) {
        const moved = diagram.members.find(
          (member) =>
            member.smartArtItemId === selectedItemId &&
            typeof member.memberId === "string" &&
            smartArtShapeMemberIds(member.memberId).length > 0,
        );
        selectedMemberId = moved?.memberId ?? null;
        if (!moved) selectedItemId = null;
        announceMemberSelection();
      }
    }
    // A plain group's object picked in the Selection Pane stays picked while
    // the group holds it; a diagram's only while it is one of its shapes.
    const plainGroup = !editableSmartArt() && !movablePreservedSmartArt();
    if (
      selectedMemberId &&
      (plainGroup
        ? !(attrs().groupMembers ?? []).some((member) => member.memberId === selectedMemberId)
        : smartArtShapeMemberIds(selectedMemberId).length === 0)
    ) {
      selectedMemberId = null;
      selectedItemId = null;
      announceMemberSelection();
    }
    paintMemberSelection();
  };

  const cancelGesture = (): void => {
    if (!disposeActiveGesture) return;
    disposeActiveGesture?.();
    disposeActiveGesture = null;
    render();
    endLiveGesture();
  };

  let lastEditorEditable = editor.isEditable;
  const refreshEditorWriteAuthority = (): void => {
    if (editor.isEditable === lastEditorEditable) return;
    lastEditorEditable = editor.isEditable;
    // Read-only drops a gesture in flight and the grips it could not use.
    if (!lastEditorEditable) cancelGesture();
    // A stroke that is not selected shows its write authority in its flags
    // alone: a whole render of every stroke on the page each time the page
    // turned writable held a page of handwriting for a second at open.
    const current = attrs();
    if (current.inkTool && !selected && !textEditing && !current.groupMembers?.length) {
      showControlsEditable(lastEditorEditable, current);
      return;
    }
    render();
  };
  // The Docs host flips editability with setEditable(value, false), which
  // emits no "update": a page that finished connecting drew its shapes
  // read-only (a SmartArt shape could not be pressed, moved or typed into)
  // until the first edit. The editor's updates, its transactions and the
  // surface's `contenteditable` are watched once per editor for every node
  // view that follows the authority (subscribeEditorSurfaceEditable): each
  // shape had its own two listeners and observer, 4,000 callbacks per
  // transaction on a page of 2,000 strokes.
  const unwatchWriteAuthority = subscribeEditorSurfaceEditable(editor, refreshEditorWriteAuthority);
  // Edit in 2-D switched on or off (a client view, not the node's content):
  // a graphic in a 3-D scene style draws again, flat or in its scene, and its
  // selected shape's grips follow.
  const unwatchEditIn2d = subscribeSmartArtEditIn2d(() => {
    if (destroyed || !editIn2dGraphic()?.hasScene) return;
    render();
    paintMemberSelection();
  });

  const beginGesture = (
    event: PointerEvent,
    onMove: (event: PointerEvent) => void,
    onCommit: (event: PointerEvent) => void,
    // A shape of a PRESERVED diagram moves on its own even though the group
    // as a whole is geometry-locked (its members are the diagram's drawing).
    preservedMember = false,
    // The element that takes the pointer, for a gesture begun after its
    // pointerdown has finished dispatching (a finger's hold lifts it later,
    // when `event.currentTarget` is gone).
    captureTarget?: HTMLElement,
    // The gesture as the others see it, begun before the first preview
    // (its rest frames are read then); ended here after the commit.
    live?: DocumentLiveGesture,
  ): void => {
    const current = attrs();
    if (
      !editor.isEditable ||
      event.button > 0 ||
      (current.groupMembers &&
        !documentShapeGroupIsEditable(current) &&
        !preparedConversion() &&
        !(preservedMember && movablePreservedSmartArt()))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cancelGesture();
    liveGesture = live ?? null;
    selectCurrentNode(false);
    const target = captureTarget ?? (event.currentTarget as HTMLElement);
    tryCapturePointer(target, event.pointerId);
    let active = true;
    // The finger resting on this shape while another finger taps more shapes
    // into the selection (P-11) holds it, never moves it: once the
    // multi-select mode has begun under it, its moves and release are void.
    const multiSelect = touchMultiSelectScopeFor(editor);
    const heldForMultiSelect = (() => {
      const before = multiSelect.active;
      return () => !before && multiSelect.active && isTouchLikePointer(event);
    })();
    const cleanup = () => {
      if (!active) return;
      active = false;
      // A move's or resize's alignment guides go with the gesture.
      clearDocumentObjectSnapGuides(root.ownerDocument);
      if (target.hasPointerCapture?.(event.pointerId)) {
        target.releasePointerCapture?.(event.pointerId);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", keydown, true);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      if (!active) return;
      if (!editor.isEditable) {
        cancelGesture();
        return;
      }
      if (heldForMultiSelect()) return;
      onMove(next);
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      if (!active) return;
      cleanup();
      disposeActiveGesture = null;
      if (!editor.isEditable || heldForMultiSelect()) {
        render();
        endLiveGesture();
        return;
      }
      onCommit(next);
      endLiveGesture();
    };
    const cancel = (next?: PointerEvent) => {
      if (next && next.pointerId !== event.pointerId) return;
      cancelGesture();
      selectCurrentNode(true);
    };
    const keydown = (next: globalThis.KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault();
      next.stopPropagation();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", keydown, true);
    // Node-view deselection/destruction must be able to stop a gesture without
    // re-selecting the atom. Pointercancel/Escape call `cancel` explicitly and
    // therefore still restore the selected shape and editor focus.
    disposeActiveGesture = cleanup;
  };

  /**
   * A press on one SmartArt shape (its body or one of its handles): select
   * that shape, then move or resize it through the shared transform
   * (`documentSmartArtMemberTransformPatch`), previewed in place and committed
   * as ONE group patch on release. A press that does not move commits nothing.
   */
  const beginMemberTransform = (
    event: PointerEvent,
    memberId: string,
    makeTransform: (
      dx: number,
      dy: number,
      pointer: PointerEvent,
    ) => DocumentSmartArtMemberTransform,
  ): boolean => {
    if (!editor.isEditable || event.button > 0) return false;
    // A shape of a graphic in a 3-D scene is selected, never moved, sized or
    // turned, until Edit in 2-D (the graphic's frame still moves all of it).
    if (shapesLockedIn3d()) {
      event.preventDefault();
      event.stopPropagation();
      selectCurrentNode(false);
      selectMember(memberId);
      return true;
    }
    // Word ends the typing when a handle of the shape is dragged: the words
    // are written, the outline turns solid and the shape is resized as a
    // shape. Written first, so the gesture starts from the document that
    // holds them.
    if (openMemberTextId !== null) {
      openMemberTextBoxes.get(openMemberTextId)?.close(false);
    }
    const expectedPosition = getPos();
    if (typeof expectedPosition !== "number") return false;
    const expectedDoc = editor.state.doc;
    const current = attrs();
    const coordinateWidth = current.groupCoordinateWidthEmu ?? current.widthEmu;
    const coordinateHeight =
      current.groupCoordinateHeightEmu ?? current.heightEmu;
    const box = groupLayer.getBoundingClientRect();
    const emuPerPxX = coordinateWidth / Math.max(1, box.width);
    const emuPerPxY = coordinateHeight / Math.max(1, box.height);
    const startX = event.clientX;
    const startY = event.clientY;
    let preview: DocumentShapeAttrs | null = null;
    beginGesture(
      event,
      (next) => {
        const patch = smartArtMemberTransformPatch(
          memberId,
          makeTransform(
            (next.clientX - startX) * emuPerPxX,
            (next.clientY - startY) * emuPerPxY,
            next,
          ),
        );
        if (!patch?.groupMembers) return;
        preview = { ...current, ...patch } as DocumentShapeAttrs;
        applyGroupMemberLayout(
          patch.groupMembers,
          coordinateWidth,
          coordinateHeight,
        );
      },
      () => {
        if (!preview) {
          paintMemberSelection();
          return;
        }
        if (smartArtItemResizeClaimed(memberId, preview)) {
          // The relayout lands as its own change; until it does the shapes
          // stand where they were.
          paintMemberSelection();
          const committed = attrs();
          applyGroupMemberLayout(
            committed.groupMembers ?? [],
            committed.groupCoordinateWidthEmu ?? committed.widthEmu,
            committed.groupCoordinateHeightEmu ?? committed.heightEmu,
          );
          return;
        }
        commitConnectorCanvas(
          expectedDoc,
          node,
          expectedPosition,
          preview,
        );
      },
      !editableSmartArt(),
    );
    selectMember(memberId);
    return true;
  };

  /**
   * A resize of one authored item's shape, handed to the toolbar's relayout
   * (`DOCUMENT_SMARTART_ITEM_RESIZE_EVENT`): true when it took it. A move, a
   * turn or a connector's own resize stays the canvas's box edit.
   */
  const smartArtItemResizeClaimed = (memberId: string, preview: DocumentShapeAttrs): boolean => {
    // A file's diagram resizes as its conversion: the shape of the file's
    // drawing names its item there, and the relayout lands the conversion with
    // it, in one step (`documentSmartArtPrepared`; PowerPoint converts nothing,
    // but lays the diagram out again just the same).
    const authored = editableSmartArt();
    const conversion = authored ? null : preparedConversion();
    const diagram = authored ?? (conversion ? readDocumentSmartArtDiagram(conversion.attrs) : null);
    if (!diagram) return false;
    const before = attrs().groupMembers?.find((member) => member.memberId === memberId);
    const after = preview.groupMembers?.find((member) => member.memberId === memberId);
    const convertedId = conversion ? documentSmartArtPreparedMemberId(node, conversion, memberId) : memberId;
    const itemShape = convertedId ? diagram.members.find((member) => member.memberId === convertedId) : undefined;
    const itemId = itemShape?.smartArtItemId;
    if (
      !before ||
      !after ||
      typeof itemId !== "string" ||
      (itemShape?.smartArtRole !== "node" && itemShape?.smartArtRole !== "label") ||
      !(before.widthEmu > 0) ||
      !(before.heightEmu > 0) ||
      (after.rotation ?? 0) !== (before.rotation ?? 0) ||
      (Math.abs(after.widthEmu - before.widthEmu) < 1 && Math.abs(after.heightEmu - before.heightEmu) < 1)
    ) {
      return false;
    }
    return !window.dispatchEvent(
      new CustomEvent<DocumentSmartArtItemResizeDetail>(DOCUMENT_SMARTART_ITEM_RESIZE_EVENT, {
        cancelable: true,
        detail: {
          groupId: diagram.groupId,
          itemId,
          factor: { x: after.widthEmu / before.widthEmu, y: after.heightEmu / before.heightEmu },
        },
      }),
    );
  };

  function wireMemberChrome(built: HTMLDivElement): void {
  memberRotateHandle.addEventListener("pointerdown", (event) => {
    const memberId = selectedMemberId;
    const target = built.parentElement;
    if (!memberId || !target) return;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    beginMemberTransform(event, memberId, (_dx, _dy, pointer) => {
      const angle = Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX);
      let degrees = ((angle - startAngle) * 180) / Math.PI;
      if (pointer.shiftKey) degrees = Math.round(degrees / 15) * 15;
      return { kind: "rotate", pivotMemberId: memberId, degrees };
    });
  });

  for (const [handle, button] of memberResizeHandles) {
    button.addEventListener("pointerdown", (event) => {
      if (!selectedMemberId || !smartArtShapeMemberIds(selectedMemberId).length) return;
      beginMemberTransform(event, selectedMemberId, (dx, dy, pointer) => ({
        kind: "resize",
        handle,
        dx,
        dy,
        // Shift keeps the shape's proportions, as on every other handle.
        maintainAspect: pointer.shiftKey,
      }));
    });
  }
  }

  /** One keyboard edit of the selected shape, committed as its own undo step. */
  const commitMemberPatch = (patch: Partial<DocumentShapeAttrs> | null): void => {
    const position = getPos();
    if (!patch || typeof position !== "number") return;
    commitConnectorCanvas(editor.state.doc, node, position, {
      ...attrs(),
      ...patch,
    } as DocumentShapeAttrs);
  };

  /**
   * The outline after Delete or Cut on one shape: its own item taken out, or
   * -- a shape drawn for an item without its words (Vertical Circle List's
   * circles) -- that item, as Office's Delete on it does. Null for a
   * connecting arrow or background, which Office refuses.
   */
  const memberDeletedOutline = (diagram: DocumentSmartArtDiagram, memberId: string) => {
    const itemId = documentSmartArtMemberDeletedItemId(diagram.members, memberId);
    return itemId ? smartArtOutlineAfterDelete(diagram.outline, itemId) : null;
  };

  /**
   * The graphic a shape's Delete (or Cut) takes an item out of, and that
   * shape as it stands there: the authored graphic itself, or -- on the
   * file's own diagram of a layout MRAI owns -- its prepared conversion, of
   * which the Delete is the first real edit: the conversion lands with it, in
   * one transaction and one Undo step, as a fill or Reset Shape does. Null
   * for a diagram that is neither (yet), and for a shape the conversion has
   * no item for (a connecting arrow, which Office refuses).
   */
  const memberDeleteTarget = (
    memberId: string,
  ): { diagram: DocumentSmartArtDiagram; memberId: string; base: Record<string, unknown> | null } | null => {
    const diagram = editableSmartArt();
    if (diagram) return { diagram, memberId, base: null };
    const conversion = preparedConversion();
    const converted = conversion ? readDocumentSmartArtDiagram(conversion.attrs) : null;
    const convertedMember =
      conversion && converted ? documentSmartArtPreparedMemberId(node, conversion, memberId) : null;
    return conversion && converted && convertedMember
      ? { diagram: converted, memberId: convertedMember, base: conversion.attrs as Record<string, unknown> }
      : null;
  };

  /**
   * Delete (and Cut) on one shape of an authored graphic: its item comes out
   * of the outline, the server lays the graphic out again, and the shape that
   * takes its place is selected with the keys on the page. False when the
   * shape belongs to no item. `shownMemberId` is the shape as the page shows
   * it (the file's drawing, before a conversion lands).
   */
  const deleteMemberItem = (
    target: { diagram: DocumentSmartArtDiagram; memberId: string; base: Record<string, unknown> | null },
    shownMemberId: string = target.memberId,
  ): boolean => {
    const { diagram, memberId } = target;
    // A shape drawn for an item without its words (Vertical Circle List's
    // circles) takes that item out, as Office's Delete on it does.
    const change = memberDeletedOutline(diagram, memberId);
    if (!change) return false;
    memberDeletePending = true;
    // The relayout is the server's; it lands only on the node it was asked
    // about (an edit in the meantime drops it).
    const asked = node;
    // The theme the file's diagram was drawn through (its view, or the
    // receipt its conversion keeps): the rebuild draws its gradients and
    // shadows as the conversion did.
    const colorTheme = documentSmartArtHostColorTheme(editor.state.doc.attrs, diagram.attrs);
    void smartArtEngine("document.rebuild", {
      attrs: diagram.attrs,
      ...(colorTheme ? { colorTheme } : {}),
      kind: diagram.kind,
      outline: change.items,
    }).then(
      (answer) => {
        memberDeletePending = false;
        if (destroyed || node !== asked) return;
        // Read before the rebuild renders, which drops the deleted shape.
        const stillOnShape = selected && selectedMemberId === shownMemberId;
        const position = getPos();
        if (!answer.patch || typeof position !== "number") return;
        // On the file's own diagram the rebuild lands on its conversion.
        const committed = commitConnectorCanvas(editor.state.doc, node, position, {
          ...(target.base ?? attrs()),
          ...answer.patch,
        } as DocumentShapeAttrs);
        if (!committed || !stillOnShape) return;
        // The shape that takes the deleted one's place is selected, with
        // the keys on the page, so the next Delete removes it in turn.
        // Left on the graphic, the next Delete took the whole graphic.
        const rebuilt = editableSmartArt();
        const next =
          rebuilt?.members.find(
            (member) =>
              member.smartArtItemId === change.selectedItemId &&
              member.smartArtRole === "node" &&
              member.smartArtHidden !== true,
          ) ??
          rebuilt?.members.find(
            (member) =>
              member.smartArtItemId === change.selectedItemId &&
              typeof member.memberId === "string" &&
              smartArtShapeMemberIds(member.memberId).length > 0,
          );
        selectMember(next?.memberId ?? null);
      },
      (error: unknown) => {
        memberDeletePending = false;
        if (destroyed || isEngineAbort(error)) return;
        toast({
          title:
            error instanceof EngineUnavailableError && error.reason === "offline"
              ? labels.smartArtNeedsConnection
              : labels.smartArtLayoutFailed,
          variant: "destructive",
        });
      },
    );
    return true;
  };

  /**
   * A shape's Delete pressed on the file's own diagram before its conversion
   * is ready (it is asked for when the graphic is selected): the shape it was
   * pressed on, done when the conversion arrives and the shape is still the
   * one selected. A diagram that cannot convert says why, as a double-click
   * on its words does; one whose preparation failed asks again.
   */
  let deleteAwaited: string | null = null;
  const awaitConversionForDelete = (memberId: string): void => {
    const preparation = preparedConversion() ? undefined : documentSmartArtPreparation(node);
    if (!preparation) return;
    if (preparation.state === "refused") {
      window.dispatchEvent(
        new CustomEvent<SmartArtRefusal>(DOCUMENT_SMARTART_REFUSED_EVENT, { detail: preparation.refusal }),
      );
      return;
    }
    deleteAwaited = memberId;
    if (preparation.state === "failed") retryDocumentSmartArtPreparation(editor, node, getPageId?.());
  };

  /**
   * Office's keyboard model for a shape selected inside a SmartArt graphic
   * (Microsoft Support, "Keyboard shortcuts for SmartArt graphics"): Esc
   * returns to the graphic, Tab / Shift+Tab walk the shapes, Enter or F2
   * edits the text and plain typing replaces it, the arrow keys nudge (Ctrl
   * for a finer step), Shift+arrows grow or shrink, Delete removes the shape.
   */
  const onMemberKeydown = (event: globalThis.KeyboardEvent): void => {
    if (destroyed || !selected || !selectedMemberId || event.defaultPrevented) {
      return;
    }
    const target = event.target;
    if (
      editor.isDestroyed ||
      !(target instanceof globalThis.Node) ||
      !editor.view.dom.contains(target) ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // A key typed in a shape's own text field (the rich field a member's or
    // a shape's words are typed in) is the field's: Shift+Arrow there
    // extends the selection, it does not resize the shape -- which also
    // took the focus back to the page and closed the field mid-word.
    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (element?.closest("[data-document-shape-text-editor]")) return;
    const diagram = editableSmartArt();
    const preserved = !diagram && movablePreservedSmartArt();
    if (!diagram && !preserved) {
      // A plain group's object picked in the Selection Pane: Escape goes
      // back to the group, as in Word.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        selectMember(null);
        return;
      }
      // Delete takes that object out of its group, never the whole group
      // (Word deletes the item selected inside its group). One the group
      // cannot lose here (a connector glued to it, a group whose objects
      // were not read with their groups) stays, and so does the group.
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        editor.isEditable
      ) {
        event.preventDefault();
        event.stopPropagation();
        const position = getPos();
        if (typeof position === "number") deleteDocumentShapeGroupMember(editor.view, position, selectedMemberId);
      }
      return;
    }
    const memberId = selectedMemberId;
    const itemMembers = smartArtShapeMemberIds(memberId);
    const consume = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    const openText = (seed?: string): void => {
      if (!smartArtShapeIsItem(memberId)) return;
      const opener = [memberId, ...itemMembers]
        .map((id) => memberTextOpeners.get(id))
        .find(Boolean);
      opener?.(seed);
    };
    if (event.key === "Escape") {
      consume();
      selectMember(null);
      return;
    }
    // The shape's Delete is being laid out: its keys wait for the graphic it
    // leaves (a second Delete, a nudge or typed words on the shape that is
    // going would act on the graphic as it was).
    if (memberDeletePending && !event.metaKey && !event.ctrlKey && !event.altKey) {
      consume();
      return;
    }
    if (event.key === "Enter" || event.key === "F2") {
      consume();
      openText();
      return;
    }
    if (event.key === "Tab" && !diagram) {
      // A preserved diagram has no outline MRAI owns: its shapes are walked
      // in the drawing's own order.
      consume();
      const order = documentPreservedSmartArtShapeOrder(node.attrs);
      const index = order.findIndex((id) => itemMembers.includes(id));
      const next = order[(index + (event.shiftKey ? -1 : 1) + order.length) % order.length];
      if (next) selectMember(next);
      return;
    }
    if (event.key === "Tab" && diagram) {
      consume();
      const order = diagram.outline
        .map(
          (item) =>
            diagram.members.find(
              (member) =>
                member.smartArtItemId === item.id &&
                member.smartArtRole === "node",
            ) ??
            diagram.members.find((member) => member.smartArtItemId === item.id),
        )
        // An item the layout does not draw has no shape to walk to.
        .filter(
          (member): member is DocumentShapeGroupMember =>
            Boolean(member) && member?.smartArtHidden !== true,
        );
      const index = order.findIndex((member) => itemMembers.includes(member.memberId));
      const next = order[(index + (event.shiftKey ? -1 : 1) + order.length) % order.length];
      if (next) selectMember(next.memberId);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      // Never the page's while a shape is selected: left to ProseMirror, the
      // key deleted the node selection, the whole graphic. A shape of a
      // preserved Office diagram has no outline MRAI lays out again, and a
      // connecting arrow or background is no item, so those refuse, as
      // Office refuses the arrows.
      consume();
      const target = memberDeleteTarget(memberId);
      if (target) {
        deleteMemberItem(target, memberId);
        return;
      }
      // The file's own diagram of a layout MRAI owns, its conversion still on
      // its way: the Delete is done when it is ready; one that cannot convert
      // says why.
      awaitConversionForDelete(memberId);
      return;
    }
    const arrow = (
      {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      } as Record<string, [number, number]>
    )[event.key];
    // Alt + Left / Right turns the selected shape 15 degrees about its own
    // centre, its words with it, as its rotation handle does (Microsoft
    // Support, "Keyboard shortcuts for SmartArt graphics"); the key moved the
    // shape sideways instead.
    const turn = arrow && event.altKey ? officeObjectKeyAction(event) : null;
    // In a 3-D scene the arrows neither move, size nor turn one shape.
    if (arrow && shapesLockedIn3d()) {
      consume();
      return;
    }
    if (arrow && event.altKey) {
      consume();
      if (turn?.kind === "rotate") {
        commitMemberPatch(
          smartArtMemberTransformPatch(memberId, { kind: "rotate", pivotMemberId: memberId, degrees: turn.degrees }),
        );
      }
      return;
    }
    if (arrow) {
      consume();
      const box = groupLayer.getBoundingClientRect();
      const current = attrs();
      const coordinateWidth = current.groupCoordinateWidthEmu ?? 0;
      const coordinateHeight = current.groupCoordinateHeightEmu ?? 0;
      const stepPx = event.ctrlKey || event.metaKey ? 1 : 8;
      const dx = arrow[0] * stepPx * (coordinateWidth / Math.max(1, box.width));
      const dy = arrow[1] * stepPx * (coordinateHeight / Math.max(1, box.height));
      const transform: DocumentSmartArtMemberTransform = event.shiftKey
        ? // Shift+Right / Shift+Up enlarge, Shift+Left / Shift+Down reduce.
          arrow[0] !== 0
          ? { kind: "resize", handle: "e", dx, dy: 0 }
          : { kind: "resize", handle: "s", dx: 0, dy: -dy }
        : { kind: "move", dx, dy };
      commitMemberPatch(smartArtMemberTransformPatch(memberId, transform));
      return;
    }
    if (
      event.key === "Process" ||
      (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
    ) {
      // Typing on the selected shape replaces its words; an IME press opens
      // the box so the composition lands there, never in the page.
      consume();
      openText(event.key === "Process" ? undefined : event.key);
    }
  };
  // The view may not be mounted yet while its node views are built.
  const keyboardScope = root.ownerDocument;
  keyboardScope.addEventListener("keydown", onMemberKeydown, true);

  /**
   * Copy and Cut with ONE shape of the graphic selected take that shape, as
   * PowerPoint and Excel do: the clipboard holds it as an ordinary shape (a
   * paste gives a plain shape, not a graphic), and Cut then takes its item
   * out as Delete does, the keys following the next shape. Left to
   * ProseMirror, the event copied -- and Cut removed -- the whole graphic
   * (the node selection). A connecting arrow is not cut; the graphic itself
   * selected (no shape inside it) still copies and cuts whole.
   */
  const onMemberClipboard = (event: ClipboardEvent): void => {
    if (destroyed || !selected || !selectedMemberId || event.defaultPrevented) return;
    const target = event.target;
    if (
      editor.isDestroyed ||
      !(target instanceof globalThis.Node) ||
      !editor.view.dom.contains(target) ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (element?.closest("[data-document-shape-text-editor]")) return;
    const diagram = editableSmartArt();
    if (!diagram && !movablePreservedSmartArt()) return;
    event.preventDefault();
    event.stopPropagation();
    const memberId = selectedMemberId;
    const cutting = event.type === "cut";
    // A preserved Office diagram has no outline to take an item out of, and
    // a shape whose Delete is still being laid out is going.
    // The file's own diagram cuts through its prepared conversion.
    const cutTarget = cutting ? memberDeleteTarget(memberId) : null;
    if (memberDeletePending || (cutting && (!cutTarget || !memberDeletedOutline(cutTarget.diagram, cutTarget.memberId)))) return;
    // The shape (with its words and picture companions) as ordinary shapes.
    const ids = new Set([memberId, ...smartArtShapeMemberIds(memberId)]);
    // Released from the graphic as Ungroup would, where they stand: only
    // the copied members, so a member that cannot stand alone elsewhere in
    // the graphic does not refuse them.
    const members = (normalizeDocumentShapeAttrs(node.attrs).groupMembers ?? []).filter((member) => ids.has(member.memberId));
    const released = documentShapeUngroupMembers({
      ...(node.attrs as Record<string, unknown>),
      source: null,
      groupMembers: members,
    });
    const shapeType = editor.schema.nodes.documentShape;
    let copied: ProseMirrorNode[] = [];
    try {
      copied = (released ?? []).flatMap(({ attrs: memberAttrs, chart }) =>
        chart === null ? [shapeType.create(memberAttrs)] : [],
      );
    } catch {
      copied = [];
    }
    if (!copied.length || !event.clipboardData) return;
    const { dom, text } = editor.view.serializeForClipboard(new Slice(Fragment.fromArray(copied), 0, 0));
    event.clipboardData.clearData();
    event.clipboardData.setData("text/html", dom.innerHTML);
    event.clipboardData.setData("text/plain", text);
    if (cutting && cutTarget) deleteMemberItem(cutTarget, memberId);
  };
  keyboardScope.addEventListener("copy", onMemberClipboard, true);
  keyboardScope.addEventListener("cut", onMemberClipboard, true);

  // Shift / Ctrl + click: add this shape to (or take it out of) the page's
  // multi-selection instead of starting a drag.
  let multiSelectPress = false;
  shape.addEventListener("mousedown", (event) => {
    if (!multiSelectPress) return;
    multiSelectPress = false;
    event.preventDefault();
    event.stopPropagation();
  });
  // Draw ▸ Tape on a page this reader cannot write: a tap still peels the
  // strip back for them alone (unsaved), as a printed sheet's tape would.
  let tapePeek: InkTape | null = null;
  const flipTape = (): void => {
    const current = attrs();
    const stored = normalizeInkTape(current.inkTape);
    if (!stored) return;
    const position = getPos();
    if (editor.isEditable && typeof position === "number" && editor.state.doc.nodeAt(position) === node) {
      // A peek, not an edit: Undo goes on taking back the writing, not the
      // taps of a reader testing themselves.
      editor.view.dispatch(
        editor.state.tr
          .setNodeMarkup(position, undefined, { ...node.attrs, inkTape: documentInkTapeFlipped(stored) })
          .setMeta("addToHistory", false)
          // ...but the page's to save: a strip left peeled back stays so.
          .setMeta(SAVED_WITHOUT_HISTORY_META, true),
      );
      return;
    }
    tapePeek = documentInkTapeFlipped(tapePeek ?? stored);
    svg.style.opacity =
      tapePeek === stored ? "" : String(DOCUMENT_INK_TAPE_OPACITY[tapePeek] / DOCUMENT_INK_TAPE_OPACITY[stored]);
    root.dataset.inkTape = tapePeek;
  };
  const pressTape = (event: PointerEvent, drag: () => void): void => {
    const touch = isTouchLikePointer(event);
    // The mouse's and pen's press is the strip's (ProseMirror would select
    // it); a finger's stays the page's, so a swipe still scrolls.
    if (!touch) event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const end = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", end, true);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      if (Math.hypot(next.clientX - startX, next.clientY - startY) <= INK_TAPE_TAP_SLOP_PX) return;
      end();
      if (!touch) drag();
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      end();
      flipTape();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", end, true);
  };
  // Whether the shape was already selected when this press began (a finger's
  
  let selectedAtPress = false;
  shape.addEventListener("pointerdown", (event) => {
    selectedAtPress = root.dataset.selected === "true";
    // A press in a story's words is a press in text: ProseMirror puts the
    // caret there (Word places it on the first click in a shape's words);
    // the shape is moved by its frame and its unworded area.
    if (
      storyMode() &&
      storyHost.contains(event.target as globalThis.Node) &&
      !event.shiftKey && !event.ctrlKey && !event.metaKey
    ) {
      return;
    }
    const position = getPos();
    const { state } = editor.view;
    if (
      editor.isEditable &&
      !inlineHost &&
      typeof position === "number" &&
      state.selection instanceof NodeSelection &&
      // A floating chart selected first joins too (Group takes it with them).
      documentShapePickable(state.selection.node) &&
      // Shift / Ctrl + click, or a finger's tap while another finger rests
      
      // tap after it until the multi-select bar's Done.
      (event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        touchMultiSelectScopeFor(editor).isAdditivePress(event))
    ) {
      const current = documentShapeMultiSelection(state);
      const base = current.length ? current : [state.selection.from];
      const positions = base.includes(position)
        ? base.filter((pos) => pos !== position)
        : [...base, position];
      if (positions.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        multiSelectPress = true;
        const focus = positions.includes(position) ? position : positions[positions.length - 1];
        editor.view.dispatch(
          state.tr
            .setSelection(NodeSelection.create(state.doc, focus))
            .setMeta(documentShapeMultiSelectionKey, { positions: positions.length > 1 ? positions : [] }),
        );
        return;
      }
    }
    // A press on an object of a plain group already selected that takes no
    // press of its own (a picture, a chart, a line; a group whose objects take
    // no words): released where it began, it picks that object, as in Word.
    // A drag still moves the whole group.
    const pressedObject = selectedAtPress && plainGroupPicksObjects() ? groupObjectAt(event) : null;
    // A press on the graphic's frame (not on one of its shapes, which stop
    // the event) selects the graphic again, as in Office.
    if (selectedMemberId) selectMember(null);
    const current = attrs();
    // "In Line with Text" sits where its paragraph puts it: Word offers no
    // position for it, and the writer has none to write. The press still
    // selects the shape; a drag moves it through the text like a character
    // (objectMove.ts), never by an offset.
    const inline = current.wrapMode === "inline";
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = documentShapeEmuToPx(current.xEmu);
    const startTop = documentShapeEmuToPx(current.yEmu);
    // The preview moves the shape from where it is PAINTED. A floated shape
    // paints at its float box's origin (margin 0) while its offset lives on
    // the float, so the preview adds the pointer delta to the painted margin
    // and the commit adds the same delta to the stored offset.
    const paintedLeft = Number.parseFloat(shape.style.marginLeft) || 0;
    const paintedTop = Number.parseFloat(shape.style.marginTop) || 0;
    const scale = documentViewScale(editor.view.dom);
    let previewLeft = startLeft;
    let previewTop = startTop;
    // A shape picked with others (Shift / Ctrl + click, Draw ▸ Lasso Select)
    // carries them along: each previewed from where it is painted, all
    // written in one step at the end.
    const several = documentShapeMultiSelection(editor.view.state);
    const companions =
      typeof position === "number" && several.length > 1 && several.includes(position)
        ? several.flatMap((pos) => {
            if (pos === position) return [];
            const box = editor.view.nodeDOM(pos);
            const element = box instanceof HTMLElement ? box.querySelector<HTMLElement>(`.${styles.shape}`) : null;
            return element
              ? [{ element, figure: box as HTMLElement, left: Number.parseFloat(element.style.marginLeft) || 0, top: Number.parseFloat(element.style.marginTop) || 0 }]
              : [];
          })
        : [];
    // Word's alignment guides: the shape (with the shapes picked with it)
    // lines up with the page's other floating objects, edges and margins.
    let snap: DocumentObjectSnap | null = null;
    let lift: SheetLift | null = null;
    // The shape and the shapes picked with it, as the others see them move.
    let live: DocumentLiveGesture | undefined;
    const startMove = () => beginGesture(
      event,
      (next) => {
        if (inline) return;
        // Shift keeps the drag on one line, as Word's does.
        const along = constrainedMoveAxis(next.clientX - startX, next.clientY - startY, next.shiftKey);
        let deltaX = along === "vertical" ? 0 : (next.clientX - startX) / scale.scaleX;
        let deltaY = along === "horizontal" ? 0 : (next.clientY - startY) / scale.scaleY;
        snap ??= beginDocumentObjectSnap([root, ...companions.map((companion) => companion.figure)]);
        // Drawn over the next page while carried across a seam.
        lift ??= liftSheetsDuringDrag([root, ...companions.map((companion) => companion.figure)]);
        lift.follow(next.clientY - startY);
        if (snap) ({ dx: deltaX, dy: deltaY } = snap.move(deltaX, deltaY, next, along));
        previewLeft = startLeft + deltaX;
        previewTop = startTop + deltaY;
        shape.style.marginLeft = `${paintedLeft + deltaX}px`;
        shape.style.marginTop = `${paintedTop + deltaY}px`;
        for (const companion of companions) {
          companion.element.style.marginLeft = `${companion.left + deltaX}px`;
          companion.element.style.marginTop = `${companion.top + deltaY}px`;
        }
        live?.offset(deltaX, deltaY);
      },
      () => {
        snap?.end();
        snap = null;
        lift?.lower();
        lift = null;
        if (inline) return;
        // Measured where they stand, not where the preview drew them (a
        // stroke taken onto another page is landed again from its drawing).
        const restorePreview = () => {
          shape.style.marginLeft = `${paintedLeft}px`;
          shape.style.marginTop = `${paintedTop}px`;
          for (const companion of companions) {
            companion.element.style.marginLeft = `${companion.left}px`;
            companion.element.style.marginTop = `${companion.top}px`;
          }
        };
        if (companions.length > 0) {
          restorePreview();
          const moved =
            (previewLeft !== startLeft || previewTop !== startTop) &&
            moveDocumentShapesBy(editor.view, several, previewLeft - startLeft, previewTop - startTop);
          // The arrows and Delete go on acting on all of them.
          editor.view.focus();
          if (!moved) {
            render();
            for (const companion of companions) {
              companion.element.style.marginLeft = `${companion.left}px`;
              companion.element.style.marginTop = `${companion.top}px`;
            }
          }
          return;
        }
        // Dropped over another paragraph or page, the shape is anchored
        // there (moveDocumentShapesBy re-anchors, as Word's anchor follows).
        const at = getPos();
        restorePreview();
        if (
          typeof at === "number" &&
          editor.state.doc.nodeAt(at) === node &&
          (previewLeft !== startLeft || previewTop !== startTop) &&
          moveDocumentShapesBy(editor.view, [at], previewLeft - startLeft, previewTop - startTop)
        ) {
          return;
        }
        if (
          !commitAttrs({
            xEmu: documentShapePxToEmu(previewLeft),
            yEmu: documentShapePxToEmu(previewTop),
          })
        ) {
          render();
        }
      },
      false,
      shape,
      (live =
        inline || typeof position !== "number"
          ? undefined
          : beginDocumentLiveGesture(
              editor.view,
              companions.length > 0 ? [position, ...several.filter((pos) => pos !== position)] : [position],
            )),
    );
    // Draw ▸ Tape: a tap on a strip of tape peels it back from the words or
    // lays it down over them again (learning by heart); a press that moves
    // drags it as any stroke, a finger's swipe scrolls. Picked by a lasso or
    // with Shift it is selected as ink is.
    if (current.inkTool && current.inkTape && root.dataset.selected !== "true" && event.button <= 0) {
      pressTape(event, startMove);
      return;
    }
    
    // selects it; a shape already selected moves at once (it wears
    // touch-action: none), any other lifts after a still hold (the shared
    // object drag gesture, P-4). An in-line shape moves through the text
    // (objectMove), so its press only selects here.
    if (
      isTouchLikePointer(event) &&
      root.dataset.selected !== "true" &&
      editor.isEditable
    ) {
      event.stopPropagation();
      beginObjectDragGesture(
        event,
        {
          onLift: () => {
            if (inline) selectCurrentNode(false);
            else startMove();
          },
          onMove: () => {},
          onEnd: () => {},
          onCancel: (reason) => {
            if (reason === "tap") selectCurrentNode(false);
          },
        },
        { element: shape, escapeCancels: false },
      );
      return;
    }
    startMove();
    if (pressedObject) pickObjectOnRelease(event, pressedObject);
  });

  /** The object of this group under a press, the topmost first. */
  function groupObjectAt(event: PointerEvent): string | null {
    const members = attrs().groupMembers ?? [];
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest<HTMLElement>("[data-document-shape-group-member]");
    const hitId = hit && groupLayer.contains(hit) ? hit.dataset.documentShapeGroupMember : undefined;
    if (hitId && members.some((member) => member.memberId === hitId)) return hitId;
    // An object that takes no presses is found by its box.
    for (const element of Array.from(groupLayer.children).reverse()) {
      if (!(element instanceof HTMLElement) || element.style.display === "none") continue;
      const id = element.dataset.documentShapeGroupMember;
      if (!id || !members.some((member) => member.memberId === id)) continue;
      const box = element.getBoundingClientRect();
      if (
        box.width > 0 &&
        box.height > 0 &&
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      ) {
        return id;
      }
    }
    return null;
  }

  /** Picks `memberId` when the press ends with nothing moved. */
  function pickObjectOnRelease(event: PointerEvent, memberId: string): void {
    const pressedDoc = editor.state.doc;
    const end = (): void => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const cancel = (next: PointerEvent): void => {
      if (next.pointerId === event.pointerId) end();
    };
    const up = (next: PointerEvent): void => {
      if (next.pointerId !== event.pointerId) return;
      end();
      if (destroyed || !selected || editor.state.doc !== pressedDoc) return;
      if (!(attrs().groupMembers ?? []).some((member) => member.memberId === memberId)) return;
      selectMember(memberId);
    };
    // After the move's own release listener: it writes nothing for a click.
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  function wireChromeHandles(): void {
  for (const [handle, button] of resizeHandles) {
    button.addEventListener("pointerdown", (event) => {
      // Word ends the typing when a handle is dragged (as for a SmartArt
      // shape's words): the words are written first.
      if (shapeTextOpen) closeShapeText(false);
      const current = attrs();
      const startX = event.clientX;
      const startY = event.clientY;
      const geometry = { left: current.xEmu, top: current.yEmu, width: current.widthEmu, height: current.heightEmu, rotation: current.rotation };
      // Same painted-origin rule as the move preview: a floated shape paints
      // at margin 0, so only the change in offset is added to what it paints.
      const paintedLeft = Number.parseFloat(shape.style.marginLeft) || 0;
      const paintedTop = Number.parseFloat(shape.style.marginTop) || 0;
      const scale = documentViewScale(editor.view.dom);
      let preview = geometry;
      // A handle dragged through the pinned edge mirrors the shape in the
      // same gesture, as Word flips it (its geometry, never its words); the
      // crossed axis toggles the shape's own flag and dragging back restores
      // it. The mirror is previewed on the layer that paints it.
      let previewFlip = { flipH: current.flipH, flipV: current.flipV };
      const flipLayer = current.groupMembers?.length ? groupLayer : svg;
      // Word's alignment guides size a floating, unturned shape's dragged
      // edges onto the page's other objects and margins (points only). A
      // stroke of ink scales freely: snapped edge by edge, its width and
      
      const startPaint =
        current.inkTool || current.wrapMode === "inline" || (current.rotation ?? 0) % 360 !== 0 ? null : floatPaintOf(root);
      const snap = startPaint ? beginDocumentObjectSnap([root]) : null;
      const livePos = getPos();
      const live = typeof livePos === "number" ? beginDocumentLiveGesture(editor.view, [livePos]) : undefined;
      beginGesture(
        event,
        (next) => {
          const resized = (dx: number, dy: number) =>
            resizeDocumentObjectThroughZero(geometry, handle, dx, dy, {
              ...scale, emuPerPx: DOCUMENT_SHAPE_EMU_PER_PX, min: DOCUMENT_SHAPE_MIN_EDGE_EMU,
              max: DOCUMENT_SHAPE_MAX_EDGE_EMU, lockAspect: current.lockAspectRatio || next.shiftKey,
              fromCenter: next.ctrlKey || next.altKey,
            });
          let pointerDx = next.clientX - startX;
          let pointerDy = next.clientY - startY;
          if (snap && startPaint) {
            // The box on the page: where the pass painted it, moved and
            // sized as the resize moves the stored geometry.
            ({ dx: pointerDx, dy: pointerDy } = snap.resize(
              (dx, dy) => {
                const geom = resized(dx, dy).geom;
                return {
                  left: startPaint.leftPx + documentShapeEmuToPx(geom.left - geometry.left),
                  top: startPaint.topPx + documentShapeEmuToPx(geom.top - geometry.top),
                  width: documentShapeEmuToPx(geom.width),
                  height: documentShapeEmuToPx(geom.height),
                };
              },
              pointerDx,
              pointerDy,
              handle,
              next,
              { lockAspect: current.lockAspectRatio || next.shiftKey, centered: next.ctrlKey || next.altKey },
            ));
          }
          const through = resized(pointerDx, pointerDy);
          preview = { ...through.geom, rotation: current.rotation };
          previewFlip = { flipH: current.flipH !== through.flipX, flipV: current.flipV !== through.flipY };
          // An inline shape grows from where its line holds it; only its size
          // changes, whichever handle is dragged.
          if (current.wrapMode === "inline") {
            preview = { ...preview, left: geometry.left, top: geometry.top };
          }
          if (current.inkTool) {
            // A stroke is drawn as it lands: its line scales with its box.
            drawInkScaled({ widthEmu: preview.width, heightEmu: preview.height });
          } else {
            shape.style.width = `${documentShapeEmuToPx(preview.width)}px`;
            shape.style.height = `${documentShapeEmuToPx(preview.height)}px`;
          }
          shape.style.marginLeft = `${paintedLeft + documentShapeEmuToPx(preview.left - geometry.left)}px`;
          shape.style.marginTop = `${paintedTop + documentShapeEmuToPx(preview.top - geometry.top)}px`;
          flipLayer.style.transform = buildBlockTransform(0, previewFlip) ?? "";
          if (typeof livePos === "number") {
            live?.move([
              {
                pos: livePos,
                x: documentShapeEmuToPx(preview.left - geometry.left),
                y: documentShapeEmuToPx(preview.top - geometry.top),
                w: documentShapeEmuToPx(preview.width),
                h: documentShapeEmuToPx(preview.height),
              },
            ]);
          }
        },
        () => {
          snap?.end();
          const flipped = previewFlip.flipH !== current.flipH || previewFlip.flipV !== current.flipV;
          const sized = preview.width !== geometry.width || preview.height !== geometry.height;
          if (
            !commitAttrs({
              xEmu: preview.left,
              yEmu: preview.top,
              widthEmu: preview.width,
              heightEmu: preview.height,
              // A stroke's line scales with its box, as the lasso scales it.
              ...(current.inkTool && sized
                ? { outlineWidthPt: documentInkScaledLine(current, { widthEmu: preview.width, heightEmu: preview.height }) }
                : {}),
              ...(flipped ? { flipH: previewFlip.flipH, flipV: previewFlip.flipV } : {}),
            })
          ) {
            drawInkScaled(null);
            render();
          }
        },
        false,
        undefined,
        live,
      );
    });
  }

  rotateHandle.addEventListener("pointerdown", (event) => {
    if (typeof attrs().smartArtKind === "string" && attrs().groupMembers?.length) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (shapeTextOpen) closeShapeText(false);
    const current = attrs();
    const rect = shape.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(
      event.clientY - centerY,
      event.clientX - centerX,
    );
    let previewRotation = current.rotation;
    const livePos = getPos();
    const live = typeof livePos === "number" ? beginDocumentLiveGesture(editor.view, [livePos]) : undefined;
    beginGesture(
      event,
      (next) => {
        const angle = Math.atan2(
          next.clientY - centerY,
          next.clientX - centerX,
        );
        let degrees = current.rotation + ((angle - startAngle) * 180) / Math.PI;
        if (next.shiftKey) degrees = Math.round(degrees / 15) * 15;
        previewRotation = Math.round(degrees * 10) / 10;
        setShapeTurn(previewRotation);
        if (typeof livePos === "number") live?.move([{ pos: livePos, r: previewRotation }]);
      },
      () => {
        if (!commitAttrs({ rotation: previewRotation })) render();
      },
      false,
      undefined,
      live,
    );
  });
  }

  /** Whether this shape takes typed words. */
  const shapeTextEditable = (): boolean => {
    const current = attrs();
    return (
      editor.isEditable &&
      !shapeWordsLocked &&
      !current.inkTool &&
      !current.groupMembers?.length
    );
  };
  let shapeTextOpen = false;
  /** Close the in-shape editor, writing its words when they changed. */
  const closeShapeText = (reselect: boolean): void => {
    if (!shapeTextOpen) return;
    shapeTextOpen = false;
    const current = attrs();
    const typed = shapeTextField?.content() ?? { text: current.text, runs: undefined };
    const value = normalizeDocumentShapeText(typed.text);
    const runs =
      normalizeDocumentShapeTextRuns(
        withoutInheritedRunFields(typed.runs, shapeInheritedRunStyle(current)),
        value,
      ) ?? null;
    shapeTextBox.hidden = true;
    text.style.visibility = "";
    textEditing = false;
    root.dataset.textEditing = "false";
    const textChanged = value !== current.text;
    const runsChanged = JSON.stringify(runs) !== JSON.stringify(current.textRuns ?? null);
    // The imported body reading describes the words it was read WITH; once
    // they are retyped -- or formatted in part, which it cannot draw -- it is
    // dropped.
    if (textChanged || runsChanged) {
      if (
        !commitAttrs(
          { text: value, textRuns: runs, ...(textChanged || runs ? { textBody: null } : {}) },
          reselect,
        )
      ) {
        render();
      }
    } else if (reselect) {
      selectCurrentNode(true);
    }
  };
  /**
   * Open the in-shape editor: at `caret` (a double-click's point), after the
   * words (Enter / F2), or typing `seed`, which replaces them (a key typed on
   * the selected shape). False when the shape takes no words.
   */
  /**
   * Open the words as a story: the caret goes into the shape's own content,
   * typed by the body's editor. A label's words (and a typed `seed`, which
   * replaces them) become the story first, in the same step. `point` is a
   * press's place: the caret goes where it landed in the words, else after
   * them.
   */
  const openStory = (
    seed?: string,
    point?: { readonly clientX: number; readonly clientY: number } | null,
  ): boolean => {
    const position = getPos();
    if (typeof position !== "number") return false;
    const { state } = editor.view;
    const shapeNode = state.doc.nodeAt(position);
    if (!shapeNode || (shapeNode.type.name !== "documentShape" && shapeNode.type.name !== INLINE_SHAPE_NODE_NAME)) {
      return false;
    }
    let tr = closeHistory(state.tr);
    const contentFrom = position + 1;
    const contentTo = contentFrom + shapeNode.content.size;
    if (seed !== undefined || shapeNode.childCount === 0) {
      const blocks = documentShapeStoryFromLegacy(state.schema, shapeNode.attrs, seed);
      if (!blocks.length) return false;
      tr = tr.replaceWith(contentFrom, contentTo, blocks);
      yUndoPluginKey.getState(state)?.undoManager.stopCapturing();
    }
    const opened = tr.doc.nodeAt(position);
    if (!opened) return false;
    const end = Selection.findFrom(tr.doc.resolve(position + opened.nodeSize - 1), -1, true);
    if (!end) return false;
    tr = tr.setSelection(end);
    editor.view.dispatch(tr);
    editor.view.focus();
    if (point && seed === undefined) {
      const hit = editor.view.posAtCoords({ left: point.clientX, top: point.clientY });
      const now = editor.view.state.doc.nodeAt(position);
      if (hit && now && hit.pos > position && hit.pos < position + now.nodeSize - 1) {
        const at = Selection.near(editor.view.state.doc.resolve(hit.pos));
        editor.view.dispatch(editor.view.state.tr.setSelection(at));
      }
    }
    return true;
  };
  const openShapeText = (
    seed?: string,
    caret?: number | null,
    point?: { readonly clientX: number; readonly clientY: number } | null,
  ): boolean => {
    if (!shapeTextEditable()) return false;
    if (storyMode() || documentShapeTakesStory(node.attrs)) {
      return openStory(seed, point);
    }
    const shapeTextInput = ensureShapeTextField();
    if (!shapeTextInput || !shapeTextField) return false;
    const current = attrs();
    selectCurrentNode(false);
    shapeTextOpen = true;
    textEditing = true;
    root.dataset.textEditing = "true";
    shapeTextBox.style.inset = text.style.inset;
    // The editor wears the label's whole text direction: writing mode, the
    // 180deg turn that makes rotate270 read bottom-up, and stacked letters.
    // With the writing mode alone, a 270deg label flipped over while it was
    
    shapeTextBox.style.writingMode = text.style.writingMode;
    shapeTextBox.style.rotate = textPlaneTurn ? `${textPlaneTurn}deg` : "";
    shapeTextBox.style.textOrientation = text.style.textOrientation;
    const label = getComputedStyle(text);
    const clear = label.color === "rgba(0, 0, 0, 0)" || label.color === "transparent";
    // An imported Word shape draws its words as the paragraphs of its
    // `w:txbxContent` (each with its own size, alignment and spacing, at the
    // body's anchor): they are typed in those paragraphs. Typed in the
    // label's one size, a 10pt second line grew to 14pt and the lines moved
    // the moment the words were opened. Only while the words still spell the
    // paragraphs: a seed replaces them, as a retyped body is dropped.
    const words = seed ?? current.text;
    const body = current.textBody;
    const bodyParagraphs =
      body && body.paragraphs.length > 0 &&
      words === body.paragraphs.map((paragraph) => paragraph.text).join("\n")
        ? body.paragraphs.map((paragraph) =>
            documentShapeEditorParagraph(
              paragraph,
              current.textFontSizePt === DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
              label,
              documentShapeIsWordStory(node.attrs as Record<string, unknown>),
            ),
          )
        : null;
    const verticalAlign = bodyParagraphs && body
      ? body.anchor === "t" ? "top" : body.anchor === "b" ? "bottom" : "middle"
      : current.textVerticalAlign;
    shapeTextField.setContent({
      text: words,
      // A typed key replaces the words, and their formatting with them.
      runs: seed === undefined ? (current.textRuns ?? undefined) : undefined,
      inherited: shapeInheritedRunStyle(current),
      style: {
        fontFamily: label.fontFamily,
        fontSize: label.fontSize,
        fontWeight: label.fontWeight,
        fontStyle: label.fontStyle,
        lineHeight: bodyParagraphs ? documentShapeParagraphLineHeight(label) : label.lineHeight,
        color: clear ? "inherit" : label.color,
        caretColor: clear ? "currentColor" : label.color,
        // A body's paragraph that states no `w:jc` starts at the start edge,
        // as the body draws it.
        textAlign: bodyParagraphs ? "start" : current.textHorizontalAlign,
        whiteSpace: current.textWrap || bodyParagraphs ? "pre-wrap" : "pre",
        // Typed in the WordArt it is drawn in at rest.
        ...officeShapeTextFieldPaintStyle(current.textPaint),
      },
      ...(bodyParagraphs ? { paragraphs: bodyParagraphs } : {}),
      paint: current.textPaint ?? null,
    });
    if (verticalAlign === "middle") {
      applyOfficeInlineTextEditorCentered(shapeTextInput, 0, 0);
    } else {
      Object.assign(shapeTextInput.style, {
        top: verticalAlign === "top" ? "0" : "auto",
        bottom: verticalAlign === "bottom" ? "0" : "auto",
        height: "auto",
        maxHeight: "100%",
        transform: "",
      });
    }
    text.style.visibility = "hidden";
    shapeTextBox.hidden = false;
    openOfficeShapeTextField(shapeTextInput, seed === undefined ? caret : undefined);
    fitOfficeInlineTextEditor(shapeTextInput);
    return true;
  };
  shapeTextBox.addEventListener("pointerdown", (event) => event.stopPropagation());
  shapeTextBox.addEventListener("dblclick", (event) => event.stopPropagation());
  shapeTextBox.addEventListener("focusout", (event) => {
    const next = (event as FocusEvent).relatedTarget;
    if (next instanceof globalThis.Node && shapeTextBox.contains(next)) return;
    // Into the ribbon, a menu or a pane: the words stay open and selected,
    // as Word keeps them; they close on the next press outside both.
    if (holdOfficeTextBoxForChrome(shapeTextBox, next, () => closeShapeText(false))) return;
    closeShapeText(false);
  });
  shapeTextBox.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const field = shapeTextElement();
    if (!field) return;
    // The shared shape text box's keyboard: Enter is a new paragraph in the
    // shape (the field's own), Esc leaves the words as typed and selects the
    // shape again; Tab types a tab (the browser's Tab left the shape and the
    // focus-out closed its words), Home / End move along the line, and Select
    // All is the shape's words (the browser's took the whole document: the
    // page's selection moved and the edit closed).
    handleOfficeShapeTextKey(event, field, { leave: () => closeShapeText(true) });
  });
  // Enter / F2 / a typed key on the selected shape (the keyboard plugin).
  root.addEventListener(DOCUMENT_SHAPE_TEXT_EDIT_EVENT, (event) => {
    const detail = (event as CustomEvent<DocumentShapeTextEditDetail>).detail;
    if (openShapeText(detail?.seed)) event.preventDefault();
  });
  // A finger: Word and PowerPoint for iPad put the caret in a shape when the
  // shape that is already selected is tapped again (a double tap is not
  // dependable on a touch screen). The tap's click (not a drag, which sends
  // none) on a selected shape opens its words where the finger landed.
  shape.addEventListener("click", (event) => {
    if (!isCompatMouseFromTouch(event) || !selectedAtPress) return;
    selectedAtPress = false;
    if (
      !editor.isEditable ||
      attrs().inkTool ||
      root.dataset.textEditing === "true" ||
      (event.target as Element).closest("button")
    ) {
      return;
    }
    // A tap in a story's words is the body's own (the caret goes there).
    if (storyMode() && storyHost.contains(event.target as globalThis.Node)) return;
    event.preventDefault();
    event.stopPropagation();
    const caret = officeInlineTextCaretFromPoint(text, event.clientX, event.clientY);
    openShapeText(undefined, caret, event);
  });
  shape.addEventListener("dblclick", (event) => {
    // A stroke carries no words: double-clicking ink types nothing.
    if (!editor.isEditable || attrs().inkTool || (event.target as Element).closest("button")) return;
    // Words on a diagram whose conversion is on its way open when it is ready;
    // one that cannot convert says why.
    const preparation = !preparedConversion() ? documentSmartArtPreparation(node) : undefined;
    if (preparation) {
      event.preventDefault();
      event.stopPropagation();
      selectCurrentNode(false);
      if (preparation.state === "refused") {
        window.dispatchEvent(
          new CustomEvent<SmartArtRefusal>(DOCUMENT_SMARTART_REFUSED_EVENT, { detail: preparation.refusal }),
        );
      } else {
        wordsAwaited = { x: event.clientX, y: event.clientY };
        // Not answered last time: this press asks again.
        if (preparation.state === "failed") retryDocumentSmartArtPreparation(editor, node, getPageId?.());
      }
      return;
    }
    // A double-click in a story's words selects a word, as in the body.
    if (storyMode() && storyHost.contains(event.target as globalThis.Node)) return;
    event.preventDefault();event.stopPropagation();
    // Read the pointer's place in the words before the label hides.
    const caret = officeInlineTextCaretFromPoint(text, event.clientX, event.clientY);
    // A shape that takes no words (a locked chain box, a read-only page) is
    // selected, as a double-click on it does in Word.
    if (!openShapeText(undefined, caret, event)) selectCurrentNode(false);
  });
  // Word's "Resize shape to fit text": after a paint, the shape's height is
  // set to what its words take (the label box plus its rectangle's margins),
  // growing or shrinking, as Word re-sizes the shape on every text change.
  let autofitFrame = 0;
  // A group member with "Resize shape to fit text" (`a:spAutoFit` in its own
  // `wps:bodyPr`): Windows Word sets its words and insets at their own size,
  // grows the member to them, and the group's box and the group's line with
  // it (docx-look probe grp1: a Google Docs caption box, the next line 80 pt
  // lower; corpus R406-D01, every page after its first drawing). Drawn so,
  // on every surface, and never written: the group's stored frame and child
  // space stay the package's, so a save writes only the members edited.
  // `window.__docsGroupAutofitOff = true` draws the stored box, for an A/B of
  // one build.
  let groupGrowthPx = 0;
  const fitGroupMembersToText = (current: DocumentShapeAttrs): void => {
    const members = current.groupMembers ?? [];
    const off =
      typeof window !== "undefined" &&
      (window as Window & { __docsGroupAutofitOff?: boolean }).__docsGroupAutofitOff === true;
    const heightPx = documentShapeEmuToPx(current.heightEmu);
    const coordinateHeight = current.groupCoordinateHeightEmu ?? current.heightEmu;
    let bottomPx = heightPx;
    if (
      !off &&
      heightPx > 0 &&
      coordinateHeight > 0 &&
      !current.rotation &&
      !current.flipV &&
      members.some((member) => member.textAutofit === "shape")
    ) {
      const pxPerUnit = heightPx / coordinateHeight;
      for (const member of members) {
        if (member.textAutofit !== "shape" || member.rotation) continue;
        const element = Array.from(groupLayer.children).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.dataset.documentShapeGroupMember === member.memberId,
        );
        const words = element
          ? Array.from(element.children).find(
              (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(styles.text),
            )
          : undefined;
        if (!element || !words) continue;
        const statedPx = member.heightEmu * pxPerUnit;
        element.style.height = `${(member.heightEmu / coordinateHeight) * 100}%`;
        const content = Array.from(words.children).reduce(
          (sum, child) => sum + (child as HTMLElement).offsetHeight,
          0,
        );
        if (!(content > 0) || !(words.clientHeight > 0)) continue;
        const needed = Math.ceil(element.offsetHeight - words.clientHeight + content);
        if (needed <= statedPx + 0.5) continue;
        element.style.height = `${needed}px`;
        bottomPx = Math.max(bottomPx, member.yEmu * pxPerUnit + needed);
      }
    }
    const growth = bottomPx - heightPx > 0.5 ? bottomPx - heightPx : 0;
    if (growth > 0) {
      // The members keep their places in the stated box; the box grows below.
      groupLayer.style.bottom = "auto";
      groupLayer.style.height = `${heightPx}px`;
      shape.style.height = `${Math.max(heightPx, 1) + growth}px`;
    } else if (groupLayer.style.height) {
      // Back on the stored box (`inset: 0`, as the layer is made).
      groupLayer.style.bottom = "0";
      groupLayer.style.height = "";
    }
    if (Math.abs(growth - groupGrowthPx) > 0.5) {
      groupGrowthPx = growth;
      // The line the group stands in changed height: the page plan measures
      // it again, as for a picture whose size arrived late.
      if (typeof window !== "undefined") window.dispatchEvent(new Event("mrn-page-rebalance"));
    }
  };
  // A face arriving late sets a fitted member's words again: fitted again.
  const groupFonts = typeof document !== "undefined" ? document.fonts : undefined;
  const refitGroupOnFonts = (): void => {
    if (destroyed || !attrs().groupMembers?.some((member) => member.textAutofit === "shape")) return;
    fitGroupMembersToText(attrs());
  };
  groupFonts?.addEventListener("loadingdone", refitGroupOnFonts);
  const fitShapeToText = (): void => {
    autofitFrame = 0;
    // Ink never fits text: out before its path is read.
    if (destroyed || node.attrs.inkTool) return;
    if (attrs().groupMembers?.length) {
      fitGroupMembersToText(attrs());
      return;
    }
    // A read-only page keeps its stored size, except on the print surface:
    // a document no writer has opened yet (a fresh import) prints its boxes
    // fitted, as the editor shows them once opened; never saved from there.
    const readOnlyFit = !editor.isEditable && fitTextWhenReadOnly;
    if (!editor.isEditable && !readOnlyFit) return;
    const current = attrs();
    if (current.textAutofit !== "shape" || current.groupMembers?.length || current.inkTool) return;
    // An empty label keeps its frame; an empty story is one line tall, as
    // a new text box with no words yet is in PowerPoint and Word.
    if (!current.text.trim() && !current.textBody && !storyMode()) return;
    const words = Array.from(text.children) as HTMLElement[];
    const content = words.reduce((sum, child) => sum + child.offsetHeight, 0);
    if (!(content > 0) || !(text.clientHeight > 0)) return;
    const height = documentShapeEmuToPx(current.heightEmu);
    const needed = Math.max(16, Math.ceil(height - text.clientHeight + content));
    if (Math.abs(needed - height) < 1) return;
    if (readOnlyFit) {
      const position = getPos();
      if (typeof position !== "number") return;
      const live = editor.view.state.doc.nodeAt(position);
      if (!live || live.type !== node.type) return;
      editor.view.dispatch(trustReadOnlyDocumentMutation(
        editor.view.state.tr.setNodeMarkup(position, undefined, { ...live.attrs, heightEmu: documentShapePxToEmu(needed) }, live.marks),
        "layout-normalization",
      ));
      return;
    }
    if (!storyMode()) {
      commitAttrs({ heightEmu: documentShapePxToEmu(needed) }, false, { joinHistory: true });
      return;
    }
    // Typing in the story: the height follows in the same step and the caret
    // stays in the words. Through `commitAttrs` it selected the shape, so
    // the next key replaced the words typed before it. A box placed whole in
    // a step of its own (Ink to Text's reading) is fitted in that step too: the
    // fit is the step's derived follow-up (lib/collab/paged-history-meta), or
    // Undo took back only the fit and never reached the reading.
    const position = getPos();
    if (typeof position !== "number") return;
    const { state } = editor.view;
    const live = state.doc.nodeAt(position);
    if (!live || live.type !== node.type) return;
    editor.view.dispatch(
      state.tr
        .setNodeMarkup(position, undefined, { ...live.attrs, heightEmu: documentShapePxToEmu(needed) }, live.marks)
        .setMeta(PAGED_FOLLOW_UP_META, true),
    );
  };
  const render = (): void => {
    renderShape();
    firstRenderDone = true;
    // A group's fitted members are drawn in the same paint as the group, so
    // no measure of the page sees the stored box between the two.
    if (attrs().groupMembers?.some((member) => member.textAutofit === "shape")) {
      fitGroupMembersToText(attrs());
    }
    syncDrawingOverlays();
    if (!autofitFrame && typeof requestAnimationFrame === "function") {
      autofitFrame = requestAnimationFrame(fitShapeToText);
    }
    // Another member's hand on the shape is drawn again over what the node
    // just painted (documentLiveTransform).
    liveBase = null;
    reapplyDocumentLiveFrame(root);
  };

  // The selected diagram's conversion is ready: its frame's grips and its words
  // open on what the first real edit will write. The drawing does not change.
  let wordsAwaited: { x: number; y: number } | null = null;
  let absentRetry: ReturnType<typeof setTimeout> | null = null;
  const unsubscribePreparation = subscribeSmartArtPreparation(() => {
    if (destroyed) return;
    const preparation = documentSmartArtPreparation(node);
    if (documentSmartArtDrawingAbsent(node.attrs)) {
      // A diagram drawn as its conversion is drawn again when the conversion
      // arrives; one the engine did not answer for is asked again.
      if (preparation?.state === "ready" && shownFrom?.scene !== preparation.value) render();
      if (preparation?.state === "failed" && absentRetry === null) {
        absentRetry = setTimeout(() => {
          absentRetry = null;
          if (!destroyed) render();
        }, SMARTART_PREPARE_RETRY_MS);
      }
    }
    if (deleteAwaited) {
      const pressed = deleteAwaited;
      if (preparation?.state === "refused" || preparation?.state === "failed") {
        deleteAwaited = null;
        window.dispatchEvent(
          new CustomEvent<SmartArtRefusal | null>(DOCUMENT_SMARTART_REFUSED_EVENT, {
            detail: preparation.state === "refused" ? preparation.refusal : null,
          }),
        );
      } else if (preparedConversion()) {
        deleteAwaited = null;
        const target = selected && selectedMemberId === pressed ? memberDeleteTarget(pressed) : null;
        if (target) deleteMemberItem(target, pressed);
      }
    }
    if (wordsAwaited && (preparation?.state === "refused" || preparation?.state === "failed")) {
      wordsAwaited = null;
      window.dispatchEvent(
        new CustomEvent<SmartArtRefusal | null>(DOCUMENT_SMARTART_REFUSED_EVENT, {
          // No answer from the engine: null, which the host says as that.
          detail: preparation.state === "refused" ? preparation.refusal : null,
        }),
      );
    }
    if (!preparedConversion() || !selected || openMemberTextId !== null) return;
    ensureChrome();
    render();
    announceMemberSelection();
    // A double click that was waiting for this opens the words under it.
    const awaited = wordsAwaited;
    wordsAwaited = null;
    if (awaited) {
      requestAnimationFrame(() => {
        document.elementFromPoint(awaited.x, awaited.y)?.dispatchEvent(
          new MouseEvent("dblclick", { bubbles: true, cancelable: true, composed: true, clientX: awaited.x, clientY: awaited.y }),
        );
      });
    }
  });

  // Another member moving, sizing or turning this shape (or strokes of ink
  // in their lasso): drawn the way this desk's own previews draw it -- the
  // canvas's painted margins, its size, its turn -- over the node's state.
  function showLiveFrame(frame: LiveTransformFrame | null): void {
    if (!frame) {
      if (liveBase) {
        // A stroke drawn at the frame's size is drawn as the node holds it.
        if (liveBase.sized) drawInkScaled(null);
        liveBase = null;
        render();
      }
      return;
    }
    if (!liveBase) {
      liveBase = {
        left: Number.parseFloat(shape.style.marginLeft) || 0,
        top: Number.parseFloat(shape.style.marginTop) || 0,
        w: shape.offsetWidth,
        h: shape.offsetHeight,
        r: attrs().rotation ?? 0,
        placed: false,
        sized: false,
        turned: false,
      };
    }
    const base = liveBase;
    // An in-line shape's margins are its line's (auto): never written for a
    // frame that does not move it.
    if (base.placed || Math.abs(frame.x) > 0.01 || Math.abs(frame.y) > 0.01) {
      base.placed = true;
      shape.style.marginLeft = `${base.left + frame.x}px`;
      shape.style.marginTop = `${base.top + frame.y}px`;
    }
    if (base.sized || Math.abs(frame.w - base.w) > 0.5 || Math.abs(frame.h - base.h) > 0.5) {
      base.sized = true;
      if (attrs().inkTool && base.w > 0 && base.h > 0) {
        // A stroke is drawn as it will land, its line scaled with its box (as
        // the member scaling it sees it), not the old drawing stretched.
        const current = attrs();
        drawInkScaled({
          widthEmu: Math.max(1, Math.round(current.widthEmu * (frame.w / base.w))),
          heightEmu: Math.max(1, Math.round(current.heightEmu * (frame.h / base.h))),
        });
      } else {
        shape.style.width = `${frame.w}px`;
        shape.style.height = `${frame.h}px`;
      }
    }
    if (base.turned || Math.abs(shortestTurn(base.r, frame.r)) > 0.05) {
      base.turned = true;
      setShapeTurn(frame.r);
    }
  }
  const unregisterLiveTarget = registerDocumentLiveTarget(root, {
    rest: () =>
      shape.offsetWidth > 0 || shape.offsetHeight > 0
        ? { w: shape.offsetWidth, h: shape.offsetHeight, r: attrs().rotation ?? 0 }
        : null,
    show: showLiveFrame,
  });

  // The decorations ProseMirror last handed the view (an ink stroke rests in
  // its layer once none keeps it whole).
  let lastDecorations: readonly Decoration[] = [];
  // Every shape but an ink stroke has its grips from the start.
  if (!initialNode.attrs.inkTool) ensureChrome();
  render();

  return {
    dom: root,
    contentDOM: storyHost,
    selectNode() {
      selected = true;
      paintInkStrokeNow(root);
      ensureChrome();
      root.dataset.selected = "true";
      // Selected again with its conversion ready: its frame and words open on it.
      if (documentSmartArtPreparedNode(node)) render();
      paintMemberSelection();
      syncDrawingOverlays();
    },
    deselectNode() {
      selected = false;
      // A stroke nothing keeps whole now rests in its sheet's layer again
      // (paged/inkLightLayer): asked once more, as it was asked while selected.
      if (node.attrs.inkTool && !disposeActiveGesture && inkStrokeRestsInLayer(editor.view, node, lastDecorations)) {
        restInkStrokeSoon(editor.view, getPos);
      }
      closeShapeText(false);
      textEditing = false;
      cancelGesture();
      root.dataset.selected = "false";
      root.dataset.textEditing = "false";
      exitEditPoints();
      syncDrawingOverlays();
      if (selectedMemberId) {
        selectedMemberId = null;
        announceMemberSelection();
      }
      paintMemberSelection();
    },
    update(updatedNode, decorations) {
      if (updatedNode.type !== node.type) return false;
      lastDecorations = decorations;
      // Nothing keeps the stroke whole any more: its sheet's layer draws it
      // again (paged/inkLightLayer), from an empty element built in its place.
      if (!selected && !disposeActiveGesture && inkStrokeRestsInLayer(editor.view, updatedNode, decorations)) return false;
      // Picked with others (Shift+click): the frame shows, so it is built.
      if (
        !chromeBuilt &&
        decorations.some(
          (decoration) =>
            (decoration as unknown as { type?: { attrs?: Record<string, string> } }).type?.attrs?.["data-multiselected"] === "true",
        )
      ) {
        ensureChrome();
      }
      // The caret is in the story: the shape is in text editing (Word's
      // dashed frame), and a WordArt warp shows its words straight.
      const storyActive = decorations.some(
        (decoration) => (decoration as unknown as { spec?: { documentShapeStoryActive?: boolean } }).spec?.documentShapeStoryActive === true,
      );
      const wasActive = root.dataset.storyActive === "true";
      root.dataset.storyActive = storyActive ? "true" : "false";
      // Only the words changed (typing in the story): the drawing stands.
      if (
        updatedNode.attrs === node.attrs &&
        storyActive === wasActive &&
        (updatedNode.childCount > 0) === (node.childCount > 0)
      ) {
        node = updatedNode;
        if (!autofitFrame && typeof requestAnimationFrame === "function") {
          autofitFrame = requestAnimationFrame(fitShapeToText);
        }
        return true;
      }
      textEditing = storyActive || shapeTextOpen;
      // A member's words are being typed in their own field, which lives in
      // the member element a render rebuilds: a transaction that leaves the
      // node as it is (the field's own selection notice, a decoration
      // elsewhere) must not tear the field down mid-word.
      if (updatedNode === node && openMemberTextId !== null) return true;
      if (updatedNode !== node) cancelGesture();
      // The conversion landed: the shape in hand stays in hand, as its own member.
      const conversion = updatedNode !== node ? documentSmartArtPreparedNode(node) : null;
      const handed =
        conversion && selectedMemberId && !documentShapeIsPreservedNativeSmartArt(updatedNode.attrs)
          ? documentSmartArtPreparedMemberId(node, conversion, selectedMemberId)
          : undefined;
      node = updatedNode;
      if (handed !== undefined) {
        selectedMemberId = handed;
        announceMemberSelection();
      }
      render();
      return true;
    },
    stopEvent(event) {
      const target = event.target as globalThis.Node | null;
      // A shape's own text editor (a group / SmartArt member's words, a
      // connector label) owns its keys, input and composition. Without this
      // ProseMirror also read the keypress and, the graphic being the node
      // selection, replaced the whole SmartArt with the typed character.
      const element =
        target instanceof HTMLElement ? target : target?.parentElement ?? null;
      // The story's words are the body's: ProseMirror takes their events.
      if (target && storyMode() && storyHost.contains(target)) return false;
      return Boolean(
        target &&
        (shapeTextBox.contains(target) ||
          (element &&
            (element.closest("[data-document-connector-label]") ||
              element.closest("[data-document-shape-group-member-text]") ||
              element.closest("[data-document-shape-group-member-text-box]")))),
      );
    },
    ignoreMutation(mutation) {
      // The story is ProseMirror's own content: its typing and its caret are
      // read back as the body's are. Everything else here is the drawing's.
      const target = mutation.target as globalThis.Node | null;
      if (!target || !storyHost.contains(target)) return true;
      if (mutation.type === "attributes" && target === storyHost) return true;
      return false;
    },
    destroy() {
      destroyed = true;
      groupFonts?.removeEventListener("loadingdone", refitGroupOnFonts);
      unsubscribePreparation();
      if (absentRetry !== null) clearTimeout(absentRetry);
      unregisterLiveTarget();
      shapeStackRankers(editor).delete(applyStackRank);
      shapeTextField?.destroy();
      shapeTextField = null;
      for (const field of memberFields.splice(0)) field.destroy();
      disposeShapeWarp();
      for (const dispose of memberWarps.splice(0)) dispose();
      if (autofitFrame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(autofitFrame);
      window.removeEventListener(DOCUMENT_SHAPE_EDIT_POINTS_EVENT, onEditPointsRequest);
      window.removeEventListener(DOCUMENT_SHAPE_SELECT_MEMBER_EVENT, onSelectMemberRequest);
      adjustOverlay?.destroy();
      editPointsOverlay?.destroy();
      unwatchWriteAuthority();
      unwatchEditIn2d();
      cancelInkStrokePaint(root);
      keyboardScope.removeEventListener("keydown", onMemberKeydown, true);
      keyboardScope.removeEventListener("copy", onMemberClipboard, true);
      keyboardScope.removeEventListener("cut", onMemberClipboard, true);
      disposeActiveGesture?.();
      disposeActiveGesture = null;
    },
  };
}

/** Each editor's shape node view constructor, by node name. */
const documentShapeNodeViewConstructors = new WeakMap<Editor, Map<string, NodeViewConstructor>>();

/**
 * The shape node view for `name`, as a ProseMirror `nodeViews` prop. The
 * constructor is the same function for every plugin TipTap builds for the
 * editor: TipTap rebuilds its plugins once the view is mounted, and a
 * `nodeViews` prop with a new function makes ProseMirror build every node
 * view of the document again.
 */
function documentShapeNodeViewPlugin(name: string, editor: Editor, options: DocumentShapeOptions): Plugin {
  let constructors = documentShapeNodeViewConstructors.get(editor);
  if (!constructors) {
    constructors = new Map();
    documentShapeNodeViewConstructors.set(editor, constructors);
  }
  let construct = constructors.get(name);
  if (!construct) {
    // A stroke at rest is drawn by its sheet's layer (paged/inkLightLayer):
    // an empty element until the reader works on it.
    construct = (node, view, getPos, decorations) => {
      if (inkStrokeRestsInLayer(view, node, decorations)) return new LightInkView(node, view, getPos);
      const built = createDocumentShapeNodeView({ editor, getPos, node }, options.labels, options.getPageId, options.fitTextWhenReadOnly === true);
      if (node.attrs.inkTool && built.dom instanceof HTMLElement) placeWokenInkStage(built.dom, node.attrs);
      return built;
    };
    constructors.set(name, construct);
  }
  return new Plugin({
    key: new PluginKey(`${name}NodeView`),
    props: { nodeViews: { [name]: construct } },
  });
}

/**
 * Words copied out of a shape's story keep the format they are drawn in. A
 * story's unformatted words take the shape's own character format (its face,
 * size, weight, colour), which a copy leaves behind with the shape: pasted
 * into the body, Arial 14 pt text box words came out in the body's font at
 * 12 pt under Keep Source Formatting (WUA 154). The copy states that format
 * on each word that does not state its own, as Word's Keep Source Formatting
 * keeps the copied text's format. Copying the whole shape is untouched: its
 * words keep following the shape.
 */
function documentShapeStoryCopyPlugin(): Plugin {
  const withInherited = (fragment: Fragment, inherited: readonly Mark[]): Fragment => {
    const nodes: ProseMirrorNode[] = [];
    fragment.forEach((child) => {
      if (child.isText) {
        const missing = inherited.filter((mark) => !child.marks.some((own) => own.type === mark.type));
        nodes.push(missing.length ? child.mark(missing.reduce((set, mark) => mark.addToSet(set), child.marks)) : child);
      } else if (child.content.size && child.type.name !== "documentShape" && child.type.name !== "inlineDocumentShape") {
        nodes.push(child.copy(withInherited(child.content, inherited)));
      } else {
        nodes.push(child);
      }
    });
    return Fragment.from(nodes);
  };
  // The open path of the copy, top down: the shape whose story both ends of
  // the copy stand in is on it, open on both sides.
  const carried = (fragment: Fragment, openStart: number, openEnd: number): Fragment => {
    if (openStart <= 0 || openEnd <= 0 || fragment.childCount !== 1) return fragment;
    const only = fragment.firstChild!;
    if (only.type.name === "documentShape" || only.type.name === "inlineDocumentShape") {
      const marks = marksForRunStyle(
        only.type.schema,
        shapeInheritedRunStyle(normalizeDocumentShapeAttrs(only.attrs as Record<string, unknown>)),
      );
      return marks.length ? Fragment.from(only.copy(withInherited(only.content, marks))) : fragment;
    }
    return Fragment.from(only.copy(carried(only.content, openStart - 1, openEnd - 1)));
  };
  return new Plugin({
    key: new PluginKey("documentShapeStoryCopy"),
    props: {
      transformCopied: (slice) => {
        const content = carried(slice.content, slice.openStart, slice.openEnd);
        return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
      },
    },
  });
}

/**
 * The CSS custom property on the editor that holds the document theme's body
 * face (with its served stand-ins): a SmartArt label with no face of its own
 * is drawn in `var(...)`, so a new theme font (Design > Fonts, a reopened
 * theme) reaches every graphic at once, as it does in Word, with no shape
 * drawn again.
 */
export const DOCUMENT_THEME_BODY_FACE_PROPERTY = "--document-theme-body-face";

function documentThemeBodyFaceStack(attrs: Readonly<Record<string, unknown>>): string {
  const face = documentThemeBodyLatin(attrs.documentDesign, attrs.defaultFontFamily);
  return withOfficeFontSubstitutes(/^[A-Za-z][\w-]*$/.test(face) ? face : `"${face.replace(/"/g, "")}"`);
}

function documentThemeBodyFacePlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("documentThemeBodyFace"),
    view(view) {
      let written: string | null = null;
      const write = (attrs: Readonly<Record<string, unknown>>) => {
        const stack = documentThemeBodyFaceStack(attrs);
        if (stack === written && view.dom.style.getPropertyValue(DOCUMENT_THEME_BODY_FACE_PROPERTY)) return;
        written = stack;
        view.dom.style.setProperty(DOCUMENT_THEME_BODY_FACE_PROPERTY, stack);
      };
      write(view.state.doc.attrs);
      return {
        update(updated) {
          write(updated.state.doc.attrs);
        },
      };
    },
  });
}

export const DocumentShapeBlock = Node.create<DocumentShapeOptions>({
  name: "documentShape",
  group: "block",
  // A shape's words are its own story, the body's block content (Word's
  // `w:txbxContent`; `documentShapeStory.ts`). Empty for a shape with no
  // words, and for one whose words are still its label (`text`).
  content: "block*",
  // The story is a world of its own: a join, lift or Backspace at its edge
  // never mixes its paragraphs with the body's, as Word keeps a text box's.
  isolating: true,
  // Still one object to the body: the arrows step over it, a click on its
  // frame selects it whole.
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { labels: DEFAULT_DOCUMENT_SHAPE_LABELS, getPageId: undefined };
  },

  addProseMirrorPlugins() {
    return [
      documentShapeNodeViewPlugin(this.name, this.editor, this.options),
      // Inline shapes rank too: one plugin per editor ranks both kinds.
      shapeStackRankPlugin(this.editor),
      documentShapeMultiSelectionPlugin(),
      documentShapeLinkedFlowPlugin(),
      documentShapeRegroupPlugin(),
      documentShapeKeyboardPlugin(),
      documentShapeStoryCopyPlugin(),
      documentThemeBodyFacePlugin(),
    ];
  },

  // The story's keyboard (Select All, Esc, its edges) before the editor's own
  // keymaps, which would take Select All to the whole document.
  addExtensions() {
    return [
      Extension.create({
        name: "documentShapeStory",
        priority: 1000,
        addProseMirrorPlugins() {
          return [documentShapeStoryPlugin(DOCUMENT_SHAPE_MAX_TEXT_LENGTH)];
        },
        // Every serializer of the editor (save, export, the AI's copy) reads
        // the shapes' `text` as their stories now say it: the mirror waits for
        // typing to go idle, the serialized document does not.
        onBeforeCreate() {
          const editor = this.editor;
          const serialize = editor.getJSON.bind(editor);
          editor.getJSON = () => {
            let state: EditorState | null = null;
            try {
              state = editor.isDestroyed ? null : editor.state;
            } catch {
              state = null; // no view yet: nothing typed to mirror
            }
            return state ? (documentWithShapeStoriesMirrored(state).toJSON() as ReturnType<typeof serialize>) : serialize();
          };
        },
      }),
    ];
  },

  addAttributes() {
    return {
      schemaVersion: {
        default: DOCUMENT_SHAPE_SCHEMA_VERSION,
        parseHTML: (element) => numericAttr(element, "data-shape-version", 1),
      },
      preset: {
        default: "rect",
        parseHTML: (element) =>
          element.getAttribute("data-shape-preset") || "rect",
      },
      xEmu: {
        default: 0,
        parseHTML: (element) => numericAttr(element, "data-shape-x-emu", 0),
      },
      yEmu: {
        default: 0,
        parseHTML: (element) => numericAttr(element, "data-shape-y-emu", 0),
      },
      widthEmu: {
        default: DOCUMENT_SHAPE_DEFAULT_WIDTH_EMU,
        parseHTML: (element) =>
          numericAttr(
            element,
            "data-shape-width-emu",
            DOCUMENT_SHAPE_DEFAULT_WIDTH_EMU,
          ),
      },
      heightEmu: {
        default: DOCUMENT_SHAPE_DEFAULT_HEIGHT_EMU,
        parseHTML: (element) =>
          numericAttr(
            element,
            "data-shape-height-emu",
            DOCUMENT_SHAPE_DEFAULT_HEIGHT_EMU,
          ),
      },
      rotation: {
        default: 0,
        parseHTML: (element) => numericAttr(element, "data-shape-rotation", 0),
      },
      flipH: {
        default: false,
        parseHTML: (element) => booleanAttr(element, "data-shape-flip-h"),
      },
      flipV: {
        default: false,
        parseHTML: (element) => booleanAttr(element, "data-shape-flip-v"),
      },
      lockAspectRatio: {
        // Preserve legacy JSON omission through ProseMirror hydration. An
        // unrelated update must not materialize an explicit false and thereby
        // clear an authenticated original-package lock during patchback.
        default: undefined,
        parseHTML: (element) =>
          optionalBooleanAttr(element, "data-shape-lock-aspect-ratio"),
      },
      isTextBox: {
        default: false,
        parseHTML: (element) => booleanAttr(element, "data-shape-text-box"),
      },
      relativeHeight: {
        // Legacy page atoms intentionally retain omission. Only native import,
        // new-shape insertion, or an explicit z-order transaction writes it.
        default: undefined,
        parseHTML: (element) =>
          documentShapeRelativeHeight(
            numericAttr(element, "data-shape-relative-height", Number.NaN),
          ) ?? undefined,
      },
      zOrderStackComplete: {
        default: undefined,
        parseHTML: (element) =>
          optionalBooleanAttr(element, "data-shape-z-order-stack-complete"),
      },
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-shape-text") || "",
      },
      fill: {
        default: DOCUMENT_SHAPE_DEFAULT_FILL,
        parseHTML: (element) =>
          element.getAttribute("data-shape-fill") ||
          DOCUMENT_SHAPE_DEFAULT_FILL,
      },
      outline: {
        default: DOCUMENT_SHAPE_DEFAULT_OUTLINE,
        parseHTML: (element) =>
          element.getAttribute("data-shape-outline") ||
          DOCUMENT_SHAPE_DEFAULT_OUTLINE,
      },
      outlineWidthPt: {
        default: DOCUMENT_SHAPE_DEFAULT_OUTLINE_WIDTH_PT,
        parseHTML: (element) =>
          numericAttr(
            element,
            "data-shape-outline-width-pt",
            DOCUMENT_SHAPE_DEFAULT_OUTLINE_WIDTH_PT,
          ),
      },
      outlineStyle: {
        default: "solid",
        parseHTML: (element) =>
          element.getAttribute("data-shape-outline-style") || "solid",
      },
      // The line's compound type, cap, join and miter limit, as the source
      // states them (`@/lib/office-stroke-detail`). No schema default, as the
      // effects: an older page's absent key keeps the file's line, an
      // authored null (Single, the default cap or join) is written out.
      outlineCompound: {
        default: undefined,
        parseHTML: (element) =>
          element.getAttribute("data-shape-outline-compound") || null,
      },
      outlineCap: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-shape-outline-cap") || null,
      },
      outlineJoin: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-shape-outline-join") || null,
      },
      outlineMiterLimit: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-shape-outline-miter-limit");
          return raw && /^[0-9]{1,9}$/.test(raw) ? Number(raw) : null;
        },
      },
      // The exact `a:prstDash` preset beyond the style's family; `null` on a
      // shape authored here (`@/lib/office-stroke-dash`).
      outlineDash: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-shape-outline-dash") || null,
      },
      // `a:ln@algn`. `null` is a line that states no alignment, which is what
      // every shape authored in this editor holds and what every page stored
      // before audit §64 holds; it must stay distinguishable from an authored
      // "center" so an untouched export writes no `algn`.
      outlineAlign: {
        default: null,
        parseHTML: (element) =>
          officeStrokeAlign(element.getAttribute("data-shape-outline-align")),
      },
      // Draw-tab ink: the tool that drew this stroke. Absent on every other
      // shape (see `DocumentShapeAttrs.inkTool`).
      inkTool: {
        default: undefined,
        parseHTML: (element) =>
          normalizeDocumentInkTool(element.getAttribute("data-shape-ink-tool")),
      },
      inkEffect: {
        default: undefined,
        parseHTML: (element) =>
          normalizeDocumentInkEffect(element.getAttribute("data-shape-ink-effect")),
      },
      // Draw-tab ink a point eraser cut: the ends that stop flat
      // (`DocumentShapeAttrs.inkCutEnds`).
      inkCutEnds: {
        default: undefined,
        parseHTML: (element) =>
          normalizeInkCutEnds(element.getAttribute("data-shape-ink-cut-ends")),
      },
      // Draw-tab ink from a pressure pen: the pressure at each outline
      // sample (`DocumentShapeAttrs.inkPressure`), paint only.
      inkPressure: {
        default: undefined,
        parseHTML: (element) =>
          normalizeInkPressure(element.getAttribute("data-shape-ink-pressure")),
      },
      // Draw-tab ink written while recording: the recording and the moment
      // (`DocumentShapeAttrs.inkAudio`), for playing the writing back with it.
      inkAudio: {
        default: undefined,
        parseHTML: (element) =>
          normalizeInkAudio(element.getAttribute("data-shape-ink-audio")),
      },
      // Draw ▸ Tape: a strip of tape over the words, covering or peeled
      // back (`DocumentShapeAttrs.inkTape`); a tap flips it.
      inkTape: {
        default: undefined,
        parseHTML: (element) =>
          normalizeInkTape(element.getAttribute("data-shape-ink-tape")),
      },
      effect: {
        default: "none",
        parseHTML: (element) =>
          element.getAttribute("data-shape-effect") || "none",
      },
      // Keep legacy JSON omission distinct from an authored null. Rendering
      // resolves visual defaults, but a body-only save must not clear native paint.
      fillGradient: {default:undefined,parseHTML:element=>{try{return normalizeOfficeShapeGradient(JSON.parse(element.getAttribute("data-shape-fill-gradient")??"null"))??null;}catch{return null;}}},
      shapeShadow: {default:undefined,parseHTML:element=>{try{return normalizeOfficeShapeShadow(JSON.parse(element.getAttribute("data-shape-shadow")??"null"))??null;}catch{return null;}}},
      shapeEffects: {default:undefined,parseHTML:element=>{try{return normalizeDocumentShapeEffects(JSON.parse(element.getAttribute("data-shape-effects")??"null"));}catch{return null;}}},
      // Shape Outline > Sketched. Like the effects, an absent key (an older
      // page) stays distinct from an authored null (no sketch, written out).
      outlineSketch: {default:undefined,parseHTML:element=>normalizeOfficeLineSketch(element.getAttribute("data-shape-outline-sketch"))??null},
      // Format Shape > Fill & Line: a pattern fill, the fill's and line's
      // Transparency and a gradient line; absent (an older page) stays
      // distinct from an authored null (none, written out).
      fillPattern: {default:undefined,parseHTML:element=>{try{return officeFillPatternOf(JSON.parse(element.getAttribute("data-shape-fill-pattern")??"null"));}catch{return null;}}},
      // Picture or texture fill (absent: an older page; null: none).
      fillPicture: {default:undefined,parseHTML:element=>{try{return normalizeDocumentShapePictureFill(JSON.parse(element.getAttribute("data-shape-fill-picture")??"null"));}catch{return null;}}},
      fillTransparency: {default:undefined,parseHTML:element=>{const value=Number(element.getAttribute("data-shape-fill-transparency"));return Number.isInteger(value)&&value>=1&&value<=100?value:null;}},
      outlineTransparency: {default:undefined,parseHTML:element=>{const value=Number(element.getAttribute("data-shape-outline-transparency"));return Number.isInteger(value)&&value>=1&&value<=100?value:null;}},
      outlineGradient: {default:undefined,parseHTML:element=>{try{return normalizeOfficeShapeGradient(JSON.parse(element.getAttribute("data-shape-outline-gradient")??"null"))??null;}catch{return null;}}},
      textFill: {
        default: undefined,
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-fill") ||
          DOCUMENT_SHAPE_DEFAULT_TEXT_FILL,
      },
      textPaint: {
        default: undefined,
        parseHTML: element => {
          const value = element.getAttribute("data-shape-text-paint");
          if (value === null) return undefined;
          try { return normalizeOfficeTextPaint(JSON.parse(value)) ?? null; }
          catch { return undefined; }
        },
      },
      textOutline: {
        default: "none",
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-outline") || "none",
      },
      textOutlineWidthPt: {
        default: 0,
        parseHTML: (element) =>
          numericAttr(element, "data-shape-text-outline-width-pt", 0),
      },
      textEffect: {
        default: "none",
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-effect") || "none",
      },
      textFontSizePt: {
        default: DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
        parseHTML: (element) =>
          numericAttr(
            element,
            "data-shape-text-font-size-pt",
            DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_SIZE_PT,
          ),
      },
      textFontFamily: {
        default: DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_FAMILY,
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-font-family") ||
          DOCUMENT_SHAPE_DEFAULT_TEXT_FONT_FAMILY,
      },
      textBold: {
        default: false,
        parseHTML: (element) => booleanAttr(element, "data-shape-text-bold"),
      },
      textItalic: {
        default: false,
        parseHTML: (element) => booleanAttr(element, "data-shape-text-italic"),
      },
      textUnderline: {
        default: "none",
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-underline") || "none",
      },
      textStrike: {
        default: false,
        parseHTML: (element) => booleanAttr(element, "data-shape-text-strike"),
      },
      textHorizontalAlign: {
        default: "center",
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-horizontal-align") || "center",
      },
      // The paragraph's alignment of an "In Line with Text" shape (the same
      // key a chart node keeps); absent for every other shape.
      textAlign: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-shape-paragraph-align") || null,
      },
      textDirection: {
        default: "horizontal",
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-direction") || "horizontal",
      },
      textVerticalAlign: {
        default: "middle",
        parseHTML: (element) =>
          element.getAttribute("data-shape-text-vertical-align") || "middle",
      },
      textWrap: {
        default: true,
        parseHTML: (element) =>
          optionalBooleanAttr(element, "data-shape-text-wrap") ?? true,
      },
      altText: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-shape-alt-text") || "",
      },
      // Word's Selection Pane name and eye (`wp:docPr` @name / @hidden).
      name: shapeClipboardPayloadAttr("name"),
      hidden: shapeClipboardPayloadAttr("hidden"),
      decorative: shapeClipboardPayloadAttr("decorative"),
      // Word's "Resize shape to fit text" (`a:spAutoFit`). Written to the
      
      // the clipboard and every pasted copy stopped growing with its words.
      textAutofit: {
        default: undefined,
        parseHTML: (element) => {
          const value = element.getAttribute("data-shape-text-autofit");
          return value === "shape" || value === "none" ? value : undefined;
        },
        renderHTML: (attributes) =>
          attributes.textAutofit === "shape" || attributes.textAutofit === "none"
            ? { "data-shape-text-autofit": attributes.textAutofit }
            : {},
      },
      wrapMode: {
        default: "square",
        parseHTML: (element) =>
          element.getAttribute("data-shape-wrap-mode") || "square",
      },
      // The source `wp:anchor` reading of an imported floating shape — the
      // same receipt a floating text box carries — so the shape floats where
      // Word floats it instead of taking a block of the page's height.
      // Undeclared, ProseMirror would drop it at the door. The package owns
      // it: the writer never reads it back. A copy carries it, normalized
      // both ways: without it a pasted floating shape still said "In Front
      // of Text" but was laid out as a block of the page and pushed the
      // text after it down (live Word audit WUA 034); Word's copy of a
      // floating shape floats too.
      floatAnchor: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-shape-float-anchor");
          if (!raw) return null;
          try {
            return normalizeFloatAnchor(JSON.parse(raw));
          } catch {
            return null;
          }
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const anchor = normalizeFloatAnchor(attributes.floatAnchor);
          return anchor ? { "data-shape-float-anchor": JSON.stringify(anchor) } : {};
        },
      },
      // The source `bodyPr` + `w:txbxContent` paragraph reading of an imported
      // shape's text, so the renderer lays it out the way Word does instead of
      // drawing one centred string. Package-owned like `floatAnchor`: the
      // writer never reads it, and `text` stays what a save writes back.
      //
      // `undefined`, not `null`, for the same reason this node's paint fields
      // use it: a legacy page atom and an editor-authored shape simply OMIT
      // the reading, and that omission must stay distinct from an authored
      // null (which is how retyping the words clears a stale reading).
      textBody: shapeClipboardPayloadAttr("textBody"),
      
      textRuns: shapeClipboardPayloadAttr("textRuns"),
      // The words' WordArt transform (`a:prstTxWarp`), the ONE warp value of
      // `@/lib/office-text-warp`; drawn by `@/lib/office-text-warp-render`.
      textWarp: shapeClipboardPayloadAttr("textWarp"),
      // Format Shape > 3-D Rotation > Keep text flat (`a:flatTx`): the words
      // stay flat on the front of a shape its 3-D rotation turns.
      keepTextFlat: shapeClipboardPayloadAttr("keepTextFlat"),
      linkedTextBoxStoryId: {
        default: undefined,
        parseHTML: (element) => {
          const value = numericAttr(
            element,
            "data-shape-linked-text-box-story",
            Number.NaN,
          );
          return Number.isFinite(value) ? value : undefined;
        },
      },
      linkedTextBoxSequence: {
        default: undefined,
        parseHTML: (element) => {
          const value = numericAttr(
            element,
            "data-shape-linked-text-box-sequence",
            Number.NaN,
          );
          return Number.isFinite(value) ? value : undefined;
        },
      },
      source: { default: null, rendered: false },
      // The shape's dragged adjust handles. Undeclared, ProseMirror drops them
      // at the door and every such shape reopens at the preset's defaults.
      adjustments: shapeClipboardPayloadAttr("adjustments"),
      // The two `a:ln` decorations and their optional `@w`/`@len`. Same reason
      // as the handles above: undeclared, ProseMirror dropped them at the door,
      // so an imported `stealth` arrowhead was drawn as the triangle the preset
      // implies and a non-connector's arrowhead was not drawn at all — the page
      // carried both (SHAPE-IMPORT-AUDIT.md §7.4/§7.10).
      headEnd: shapeClipboardPayloadAttr("headEnd"),
      tailEnd: shapeClipboardPayloadAttr("tailEnd"),
      headEndWidth: shapeClipboardPayloadAttr("headEndWidth"),
      headEndLength: shapeClipboardPayloadAttr("headEndLength"),
      tailEndWidth: shapeClipboardPayloadAttr("tailEndWidth"),
      tailEndLength: shapeClipboardPayloadAttr("tailEndLength"),
      // The shape's own outline, when it is not any preset. Same reason as the
      // identity below: undeclared, ProseMirror drops it at the door and the
      // shape silently reopens as the nearest auto-shape.
      customPath: shapeClipboardPayloadAttr("customPath"),
      groupMembers: shapeClipboardPayloadAttr("groupMembers"),
      groupCoordinateWidthEmu: shapeClipboardPayloadAttr("groupCoordinateWidthEmu"),
      groupCoordinateHeightEmu: shapeClipboardPayloadAttr("groupCoordinateHeightEmu"),
      // The group's own fill its `a:grpFill` members wear: undeclared,
      // ProseMirror drops it and those members draw their fallback colour.
      groupFill: shapeClipboardPayloadAttr("groupFill"),
      // The identity a group that IS a SmartArt carries (`document-shapes.ts`,
      // all-or-nothing). The schema has to declare it or ProseMirror drops it
      // on the way in, and neither an inserted diagram nor an imported one
      // would ever be recognised as the catalog layout it is.
      smartArtKind: shapeClipboardPayloadAttr("smartArtKind"),
      smartArtGroupId: shapeClipboardPayloadAttr("smartArtGroupId"),
      // …and which of the fourteen SmartArt Styles it wears, for the same
      // reason: undeclared, ProseMirror drops it and the diagram reopens flat.
      smartArtStyle: shapeClipboardPayloadAttr("smartArtStyle"),
      // …and whether it runs Right to Left (a mirrored diagram), likewise.
      smartArtDirection: shapeClipboardPayloadAttr("smartArtDirection"),
      // …and its Change Colors variation, likewise.
      smartArtColors: shapeClipboardPayloadAttr("smartArtColors"),
      // …and the Office alias it is laid out from (hProcess9 for a Basic
      // Process), likewise: undeclared, it reopens as the catalog layout.
      smartArtLayoutUrn: shapeClipboardPayloadAttr("smartArtLayoutUrn"),
      // …and, laid out from the file's own definition, that part's digest:
      // undeclared, every rebuild after a reload lost the definition.
      smartArtLayoutSha256: shapeClipboardPayloadAttr("smartArtLayoutSha256"),
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-document-shape]",
        // The story, when the copied shape holds one; a label shape has none.
        contentElement: (element) =>
          (element as HTMLElement).querySelector<HTMLElement>(`:scope > [${DOCUMENT_SHAPE_STORY_ATTRIBUTE}]`) ??
          document.createElement("div"),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = normalizeDocumentShapeAttrs(HTMLAttributes);
    const payload = shapeClipboardPayload(node.attrs);
    return [
      "figure",
      mergeAttributes(
        {
          "data-document-shape": "true",
          ...(payload ? { "data-shape-payload": payload } : {}),
          "data-shape-version": attrs.schemaVersion,
          "data-shape-preset": attrs.preset,
          "data-shape-x-emu": attrs.xEmu,
          "data-shape-y-emu": attrs.yEmu,
          "data-shape-width-emu": attrs.widthEmu,
          "data-shape-height-emu": attrs.heightEmu,
          "data-shape-rotation": attrs.rotation,
          "data-shape-flip-h": attrs.flipH,
          "data-shape-flip-v": attrs.flipV,
          ...(typeof attrs.lockAspectRatio === "boolean"
            ? {
                "data-shape-lock-aspect-ratio": attrs.lockAspectRatio,
              }
            : {}),
          "data-shape-text-box": attrs.isTextBox,
          ...(typeof attrs.relativeHeight === "number"
            ? {
                "data-shape-relative-height": attrs.relativeHeight,
              }
            : {}),
          ...(typeof attrs.zOrderStackComplete === "boolean"
            ? {
                "data-shape-z-order-stack-complete":
                  attrs.zOrderStackComplete,
              }
            : {}),
          // A story's words as the story says them (its `text` mirror waits
          // for typing to go idle).
          "data-shape-text": documentShapeVisibleText(node),
          ...(attrs.fillGradient?{"data-shape-fill-gradient":JSON.stringify(attrs.fillGradient)}:{}),
          ...(attrs.shapeShadow?{"data-shape-shadow":JSON.stringify(attrs.shapeShadow)}:{}),
          ...(attrs.shapeEffects?{"data-shape-effects":JSON.stringify(attrs.shapeEffects)}:{}),
          "data-shape-fill": attrs.fill,
          "data-shape-outline": attrs.outline,
          "data-shape-outline-width-pt": attrs.outlineWidthPt,
          "data-shape-outline-style": attrs.outlineStyle,
          ...(attrs.outlineDash
            ? { "data-shape-outline-dash": attrs.outlineDash }
            : {}),
          ...(attrs.outlineCompound
            ? { "data-shape-outline-compound": attrs.outlineCompound }
            : {}),
          ...(attrs.outlineCap ? { "data-shape-outline-cap": attrs.outlineCap } : {}),
          ...(attrs.outlineJoin ? { "data-shape-outline-join": attrs.outlineJoin } : {}),
          ...(typeof attrs.outlineMiterLimit === "number"
            ? { "data-shape-outline-miter-limit": attrs.outlineMiterLimit }
            : {}),
          ...(attrs.outlineAlign
            ? { "data-shape-outline-align": attrs.outlineAlign }
            : {}),
          ...(attrs.outlineSketch ? { "data-shape-outline-sketch": attrs.outlineSketch } : {}),
          ...(attrs.fillPattern ? { "data-shape-fill-pattern": JSON.stringify(attrs.fillPattern) } : {}),
          ...(attrs.fillPicture ? { "data-shape-fill-picture": JSON.stringify(attrs.fillPicture) } : {}),
          ...(attrs.fillTransparency ? { "data-shape-fill-transparency": String(attrs.fillTransparency) } : {}),
          ...(attrs.outlineTransparency ? { "data-shape-outline-transparency": String(attrs.outlineTransparency) } : {}),
          ...(attrs.outlineGradient ? { "data-shape-outline-gradient": JSON.stringify(attrs.outlineGradient) } : {}),
          ...(attrs.inkTool ? { "data-shape-ink-tool": attrs.inkTool } : {}),
          ...(attrs.inkEffect ? { "data-shape-ink-effect": attrs.inkEffect } : {}),
          ...(attrs.inkCutEnds ? { "data-shape-ink-cut-ends": attrs.inkCutEnds } : {}),
          ...(attrs.inkPressure ? { "data-shape-ink-pressure": attrs.inkPressure } : {}),
          ...(attrs.inkAudio ? { "data-shape-ink-audio": attrs.inkAudio } : {}),
          ...(attrs.inkTape ? { "data-shape-ink-tape": attrs.inkTape } : {}),
          "data-shape-effect": attrs.effect,
          "data-shape-text-fill": attrs.textFill,
          textPaint: null,
          ...(attrs.textPaint !== undefined ? { "data-shape-text-paint": JSON.stringify(attrs.textPaint) } : {}),
          "data-shape-text-outline": attrs.textOutline,
          "data-shape-text-outline-width-pt": attrs.textOutlineWidthPt,
          "data-shape-text-effect": attrs.textEffect,
          "data-shape-text-font-size-pt": attrs.textFontSizePt,
          "data-shape-text-font-family": attrs.textFontFamily,
          "data-shape-text-bold": attrs.textBold,
          ...(attrs.textItalic ? { "data-shape-text-italic": true } : {}),
          ...(attrs.textUnderline && attrs.textUnderline !== "none"
            ? { "data-shape-text-underline": attrs.textUnderline }
            : {}),
          ...(attrs.textStrike ? { "data-shape-text-strike": true } : {}),
          ...(attrs.textHorizontalAlign && attrs.textHorizontalAlign !== "center"
            ? { "data-shape-text-horizontal-align": attrs.textHorizontalAlign }
            : {}),
          ...(attrs.textAlign ? { "data-shape-paragraph-align": attrs.textAlign } : {}),
          "data-shape-text-direction": attrs.textDirection,
          "data-shape-text-vertical-align": attrs.textVerticalAlign,
          "data-shape-text-wrap": attrs.textWrap,
          "data-shape-alt-text": attrs.altText,
          "data-shape-wrap-mode": attrs.wrapMode,
          ...(typeof attrs.linkedTextBoxStoryId === "number"
            ? {
                "data-shape-linked-text-box-story":
                  attrs.linkedTextBoxStoryId,
                "data-shape-linked-text-box-sequence":
                  attrs.linkedTextBoxSequence ?? 0,
              }
            : {}),
        },
        HTMLAttributes,
      ),
      // The story (copy / paste and HTML carry the words with the shape).
      ["div", { [DOCUMENT_SHAPE_STORY_ATTRIBUTE]: "true" }, 0],
    ];
  },

  // The node view is handed to ProseMirror by a plugin, not `addNodeView`:
  // TipTap's wrapper merges every rendered attribute of the node into an
  // HTMLAttributes object for each view it builds (a quarter of a
  // millisecond per shape, a second for a page of handwriting), and this
  // view reads none of them.
});

/**
 * Word's shape or SmartArt graphic In Line with Text sharing its line with
 * text (`w:r/w:drawing/wp:inline` holding `wps:wsp` / `wpg:wgp`, ECMA-376
 * §20.4.2.8: "like a character glyph"): the SAME shape (identical attributes,
 * node view and writers) as an inline atom of its paragraph. It never floats:
 * `wrapMode` stays "inline", with no position and no floating stack order; a
 * Wrap Text choice makes it the block `documentShape` again.
 */
const DOCUMENT_SHAPE_LIST_ANCESTORS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
]);

/**
 * Whether `tr` leaves an in-line shape beneath a list. A shape cannot be
 * saved there (the same rule the insertion and the page contract keep for the
 * block shape), so an edit that would put one there — a list toggled on its
 * paragraph, a paste into a list item — is refused instead of producing a
 * page the save would reject. Only the span the transaction touched is read.
 */
function transactionPutsInlineShapeInList(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      from = Math.min(from, after.map(newStart, -1));
      to = Math.max(to, after.map(newEnd, 1));
    });
  });
  if (from > to) return false;
  const doc = tr.doc;
  let inList = false;
  doc.nodesBetween(
    Math.max(0, from),
    Math.min(doc.content.size, to),
    (node, pos) => {
      if (inList) return false;
      if (node.type.name !== INLINE_SHAPE_NODE_NAME) return true;
      const $pos = doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if (DOCUMENT_SHAPE_LIST_ANCESTORS.has($pos.node(depth).type.name)) {
          inList = true;
          break;
        }
      }
      return false;
    },
  );
  return inList;
}

/** A transaction taking every mark off the in-line shapes the
 * transactions' steps reached; null when none wears one. */
export function inlineShapesWithoutMarks(
  transactions: readonly Transaction[],
  state: EditorState,
  name: string,
): Transaction | null {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  const ranges: Array<[number, number]> = [];
  transactions.forEach((tr, trIndex) => {
    const after = transactions.slice(trIndex + 1);
    const toEnd = (position: number, bias: number) =>
      after.reduce((at, next) => next.mapping.map(at, bias), position);
    tr.steps.forEach((step, index) => {
      const later = tr.mapping.slice(index);
      const { from, to, pos } = step as unknown as { from?: number; to?: number; pos?: number };
      if (typeof from === "number" && typeof to === "number") {
        ranges.push([toEnd(later.map(from, -1), -1), toEnd(later.map(to, 1), 1)]);
      } else if (typeof pos === "number") {
        const at = toEnd(later.map(pos, 1), 1);
        ranges.push([at, at + 1]);
      }
    });
  });
  const size = state.doc.content.size;
  const marked = new Set<number>();
  for (const [from, to] of ranges) {
    const start = Math.max(0, Math.min(from, size));
    const end = Math.min(size, Math.max(to, start));
    if (end <= start) continue;
    state.doc.nodesBetween(start, end, (node, pos) => {
      if (node.type.name === name && node.marks.length > 0) marked.add(pos);
      return true;
    });
  }
  if (marked.size === 0) return null;
  const tr = state.tr;
  for (const pos of marked) {
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, node.attrs, []);
  }
  return tr;
}

export const InlineDocumentShape = DocumentShapeBlock.extend({
  name: INLINE_SHAPE_NODE_NAME,
  group: "inline",
  inline: true,
  // A glyph of its line whose words are a story too (Word's in-line drawing
  // holds a text box like a floating one): the block shape's content.
  // The story's plugin is the block shape's; one instance per editor.
  addExtensions() {
    return [];
  },
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      // An in-line shape is held in line with text by definition: the server
      // refuses any other wrap on this node, so the default (a node built
      // from its schema, or parsed markup without the attribute) is "inline",
      // not the block shape's "square".
      wrapMode: {
        default: "inline",
        parseHTML: () => "inline",
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      documentShapeNodeViewPlugin(this.name, this.editor, this.options),
      new Plugin({
        key: new PluginKey("inlineDocumentShapeOutsideLists"),
        // Remote collaborative steps always apply: dropping one would break
        // CRDT convergence (the peer that made it refused it the same way).
        filterTransaction: (tr) =>
          tr.getMeta("y-sync$") !== undefined ||
          !transactionPutsInlineShapeInList(tr),
      }),
      new Plugin({
        key: new PluginKey("inlineDocumentShapeWearsNoMarks"),
        // A font, size, colour or link set over a line that holds an
        // in-line shape went onto the shape too (ProseMirror marks every
        // inline node of the range): the server refuses the page then
        // ("inlineDocumentShape nodes must be atomic"), and the save with
        // it (corpus R471-D47 E51, a font set over a paragraph holding
        // one). Word's drawing run takes no character formatting the
        // drawing shows either. Its own story's words keep theirs.
        appendTransaction: (transactions, _oldState, state) =>
          inlineShapesWithoutMarks(transactions, state, this.name),
      }),
    ];
  },

  parseHTML() {
    return [
      {
        tag: "span[data-document-shape][data-inline-document-shape]",
        contentElement: (element) =>
          (element as HTMLElement).querySelector<HTMLElement>(`:scope > [${DOCUMENT_SHAPE_STORY_ATTRIBUTE}]`) ??
          document.createElement("span"),
      },
    ];
  },

  renderHTML(props) {
    const [, attrs] = this.parent!(props) as [string, Record<string, unknown>];
    // The story travels with a copied shape, as a floating shape's does.
    return ["span", { ...attrs, "data-inline-document-shape": "true" }, ["span", { [DOCUMENT_SHAPE_STORY_ATTRIBUTE]: "true" }, 0]];
  },
});

export { createDocumentShapeNodeView };
