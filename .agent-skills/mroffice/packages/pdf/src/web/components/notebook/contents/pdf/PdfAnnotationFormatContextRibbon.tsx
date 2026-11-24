"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfNativeVectorMergeOperation } from "../../../../lib/pdf/native-vector-selection-edit";
import { type ShapeKind, type ShapeLineEnding, type ShapeLineStyle } from "@mrnote/core/web/lib/pdf/shapes.ts";
import { type PdfStandardBlendMode } from "../../../../lib/pdf/blend-modes";
import type { AlignEdge } from "@mrnote/core/web/lib/presentation-align.ts";
import type { PdfRibbonTranslator } from "./pdfRibbonTranslator";

export type PdfAnnotationContextKind =
  | "shape"
  | "signature"
  | "stamp"
  | "measurement"
  | "attachment"
  | "note"
  | "ink"
  | "redaction";

export interface PdfAnnotationFormatContextRibbonModel {
  kind: PdfAnnotationContextKind;
  nativeSource: boolean;
  /** A drawing of the page's own content (Edit Content), not an annotation:
   * its delete is 删除图形, never 删除批注 (user audit PDF 0053). */
  contentObject?: boolean;
  page: number;
  width: number;
  height: number;
  widthPoints?: number;
  heightPoints?: number;
  sizeEnabled?: boolean;
  sizeDisabledReason?: string;
  /** Changes when a size (or any geometry) write for this object was turned
   *  down, so the size fields show the object's real size again. */
  sizeResyncKey?: number;
  pointAnchor?: boolean;
  busy: boolean;
  copyEnabled: boolean;
  copyDisabledReason?: string;
  pasteEnabled: boolean;
  pasteDisabledReason?: string;
  duplicateEnabled: boolean;
  duplicateDisabledReason?: string;
  arrangeEnabled?: boolean;
  arrangeDisabledReason?: string;
  /** 对齐 / 分布 for the selected source vectors: on the box around two or
   * more, on the page for one; 分布 needs three. */
  alignEnabled?: boolean;
  selectionCount?: number;
  /** 合并形状 (Shape Format > Merge Shapes) on two selected closed shapes. */
  mergeEnabled?: boolean;
  mergeDisabledReason?: string;
  /** Native z-order (bring forward / send backward) for source vectors. */
  reorderEnabled?: boolean;
  reorderDisabledReason?: string;
  /** The object is already drawn last (first) among its stream's vectors, so
   * the moves in that direction grey out and say so, as Office does. */
  reorderAtFront?: boolean;
  reorderAtBack?: boolean;
  /** Cover the source vector with an appearance-only visual mask. */
  maskEnabled?: boolean;
  maskDisabledReason?: string;
  /** Vertex editing of a source vector (a line or a subpath). */
  vertexEditing?: boolean;
  vertexEditEnabled?: boolean;
  vertexEditDisabledReason?: string;
  deleteEnabled: boolean;
  deleteDisabledReason?: string;
  styleEnabled?: boolean;
  styleDisabledReason?: string;
  /** The style takes a change while the object's last one is still being
   * written (queued after it): `busy` does not grey the style controls. */
  styleQueues?: boolean;
  strokeSupported?: boolean;
  outlineColor?: string;
  lineWidth?: number;
  shapeKind?: ShapeKind;
  lineStyle?: ShapeLineStyle;
  lineStart?: ShapeLineEnding;
  lineEnd?: ShapeLineEnding;
  lineEndingsSupported?: boolean;
  fillSupported?: boolean;
  fillToggleEnabled?: boolean;
  fillToggleDisabledReason?: string;
  fillColor?: string | null;
  fillOpacitySupported?: boolean;
  fillOpacity?: number;
  opacitySupported?: boolean;
  opacity?: number;
  /** Why the transparency cannot be set as one number (a drawing whose
   * fill and outline differ): said on the control, which then shows no
   * value instead of a 0 that is not the drawing's (user audit PDF 0052). */
  opacityDisabledReason?: string;
  blendModeSupported?: boolean;
  blendMode?: PdfStandardBlendMode;
  cornerSupported?: boolean;
  cornerRadius?: number;
  /** Line caps and corner joins of the outline (PDF `J` / `j`). */
  capJoinSupported?: boolean;
  capJoinDisabledReason?: string;
  lineCap?: PdfShapeLineCap;
  lineJoin?: PdfShapeLineJoin;
  /** Any angle (a source vector); otherwise quarter turns only. */
  freeRotation?: boolean;
  /** The angle the object was turned to (degrees, clockwise), when it is
   * known: the angle field reads it, as WPS's 旋转 reads 30 after a 30 degree
   * turn, and a typed angle turns the object to it. Without it the field is
   * a command that always reads 0 and turns by what is typed. */
  rotationDegrees?: number;
  /** The Format Shape pane is open for this shape. */
  formatPaneOpen?: boolean;
  attachment?: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    saveEnabled: boolean;
    saveDisabledReason?: string;
  };
}

export type PdfShapeLineCap = "butt" | "round" | "square";
export type PdfShapeLineJoin = "miter" | "round" | "bevel";
export const PDF_SHAPE_LINE_CAPS: readonly PdfShapeLineCap[] = [
  "butt",
  "round",
  "square",
];
export const PDF_SHAPE_LINE_JOINS: readonly PdfShapeLineJoin[] = [
  "miter",
  "round",
  "bevel",
];

export type PdfAnnotationStyleChange = Readonly<{
  outlineColor?: string;
  lineWidth?: number;
  lineStyle?: ShapeLineStyle;
  lineStart?: ShapeLineEnding;
  lineEnd?: ShapeLineEnding;
  fillColor?: string | null;
  fillOpacity?: number;
  opacity?: number;
  blendMode?: PdfStandardBlendMode;
  cornerRadius?: number;
  lineCap?: PdfShapeLineCap;
  lineJoin?: PdfShapeLineJoin;
}>;

export interface PdfAnnotationFormatContextRibbonLabels {
  annotation: string;
  style: string;
  inkStyle: string;
  clipboard: string;
  arrange: string;
  size: string;
  width: string;
  height: string;
  points: string;
  actions: string;
  shape: string;
  signature: string;
  stamp: string;
  measurement: string;
  attachment: string;
  attachmentFile: string;
  attachmentName: string;
  attachmentType: string;
  attachmentSize: string;
  saveAttachment: string;
  note: string;
  ink: string;
  redaction: string;
  managed: string;
  nativeSource: string;
  copy: string;
  paste: string;
  duplicate: string;
  rotateLeft: string;
  rotateRight: string;
  flipHorizontal: string;
  flipVertical: string;
  align: string;
  alignToPage: string;
  alignSelected: string;
  alignEdges: Readonly<Record<AlignEdge, string>>;
  distributeHorizontally: string;
  distributeVertically: string;
  mergeShapes: string;
  mergeOperations: Readonly<Record<PdfNativeVectorMergeOperation, string>>;
  bringForward: string;
  sendBackward: string;
  bringToFront: string;
  sendToBack: string;
  alreadyAtFront: string;
  alreadyAtBack: string;
  /** Absent where the ribbon has no Selection pane (other editors' use). */
  selectionPane?: string;
  editVertices: string;
  exitVertexEdit: string;
  mask: string;
  delete: string;
  /** Delete for a drawing of the page's own content. */
  deleteShape: string;
  outlineColor: string;
  inkColor: string;
  lineWidth: string;
  lineStyle: string;
  lineStart: string;
  lineEnd: string;
  lineStyleLabels: Record<ShapeLineStyle, string>;
  lineEndingLabels: Record<ShapeLineEnding, string>;
  fill: string;
  fillColor: string;
  fillOpacity: string;
  opacity: string;
  blendMode: string;
  blendModeLabels: Record<PdfStandardBlendMode, string>;
  cornerRadius: string;
  pointAnchor: string;
  backToEditing: string;
  pageNumber: (page: number) => string;
  insert: string;
  outlineMenu: string;
  transparency: string;
  lineCap: string;
  lineJoin: string;
  lineCapLabels: Record<PdfShapeLineCap, string>;
  lineJoinLabels: Record<PdfShapeLineJoin, string>;
  lockAspectRatio: string;
  rotate: string;
  rotateQuarterTurnsOnly: string;
  more: string;
  exitEditing: string;
  noFill: string;
  moreColors: string;
  themeColors: string;
  standardColors: string;
  recentColors: string;
  /** Quick Styles gallery: its "more" menu and why a filled style is off
   * for an annotation that has no fill (the gallery names each style from
   * the catalogue itself). */
  moreShapeStyles: string;
  outlineStylesOnly: string;
  /** Format Shape (the pane the Shape Styles launcher opens). */
  formatShape: string;
}

export function createPdfAnnotationFormatContextRibbonLabels(
  t: PdfRibbonTranslator,
): PdfAnnotationFormatContextRibbonLabels {
  return {
    annotation: t("pdf.annotationFormat.annotation"),
    style: t("pdf.annotationFormat.style"),
    inkStyle: t("pdf.annotationFormat.inkStyle"),
    clipboard: t("pdf.annotationFormat.clipboard"),
    arrange: t("pdf.annotationFormat.arrange"),
    size: t("pdf.annotationFormat.size"),
    width: t("pdf.annotationFormat.width"),
    height: t("pdf.annotationFormat.height"),
    points: t("pdf.annotationFormat.points"),
    actions: t("pdf.annotationFormat.actions"),
    shape: t("pdf.annotationFormat.shape"),
    signature: t("pdf.annotationFormat.signature"),
    stamp: t("pdf.annotationFormat.stamp"),
    measurement: t("pdf.annotationFormat.measurement"),
    attachment: t("pdf.annotationFormat.attachment"),
    attachmentFile: t("pdf.annotationFormat.attachmentFile"),
    attachmentName: t("pdf.annotationFormat.attachmentName"),
    attachmentType: t("pdf.annotationFormat.attachmentType"),
    attachmentSize: t("pdf.annotationFormat.attachmentSize"),
    saveAttachment: t("pdf.annotationFormat.saveAttachment"),
    note: t("pdf.annotationFormat.note"),
    ink: t("pdf.annotationFormat.ink"),
    redaction: t("pdf.annotationFormat.redaction"),
    managed: t("pdf.annotationFormat.managed"),
    nativeSource: t("pdf.annotationFormat.nativeSource"),
    copy: t("pdf.annotationFormat.copy"),
    paste: t("pdf.annotationFormat.paste"),
    duplicate: t("pdf.annotationFormat.duplicate"),
    rotateLeft: t("pdf.annotationFormat.rotateLeft"),
    rotateRight: t("pdf.annotationFormat.rotateRight"),
    flipHorizontal: t("pdf.annotationFormat.flipHorizontal"),
    flipVertical: t("pdf.annotationFormat.flipVertical"),
    align: t("pdf.annotationFormat.align"),
    alignToPage: t("pdf.annotationFormat.alignToPage"),
    // The Office words the deck editor's Align menu uses.
    alignSelected: t("presentation.arrange.alignSelectedObjects"),
    alignEdges: {
      left: t("presentation.arrange.alignLeft"),
      hcenter: t("presentation.arrange.alignCenter"),
      right: t("presentation.arrange.alignRight"),
      top: t("presentation.arrange.alignTop"),
      vcenter: t("presentation.arrange.alignMiddle"),
      bottom: t("presentation.arrange.alignBottom"),
    },
    distributeHorizontally: t("presentation.arrange.distributeHorizontally"),
    distributeVertically: t("presentation.arrange.distributeVertically"),
    mergeShapes: t("presentation.contextMenu.mergeShapes"),
    mergeOperations: {
      union: t("presentation.mergeShapes.union"),
      combine: t("presentation.mergeShapes.combine"),
      fragment: t("presentation.mergeShapes.fragment"),
      intersect: t("presentation.mergeShapes.intersect"),
      subtract: t("presentation.mergeShapes.subtract"),
    },
    bringForward: t("pdf.annotationFormat.bringForward"),
    sendBackward: t("pdf.annotationFormat.sendBackward"),
    bringToFront: t("pdf.annotationFormat.bringToFront"),
    sendToBack: t("pdf.annotationFormat.sendToBack"),
    alreadyAtFront: t("pdf.annotationFormat.alreadyAtFront"),
    alreadyAtBack: t("pdf.annotationFormat.alreadyAtBack"),
    selectionPane: t("toolbar.selectionPane"),
    editVertices: t("pdf.annotationFormat.editVertices"),
    exitVertexEdit: t("pdf.annotationFormat.exitVertexEdit"),
    mask: t("pdf.annotationFormat.mask"),
    delete: t("pdf.annotationFormat.delete"),
    deleteShape: t("pdfShape.delete"),
    outlineColor: t("pdf.annotationFormat.outlineColor"),
    inkColor: t("pdf.annotationFormat.inkColor"),
    lineWidth: t("pdf.annotationFormat.lineWidth"),
    lineStyle: t("pdf.annotationFormat.lineStyle"),
    lineStart: t("pdf.annotationFormat.lineStart"),
    lineEnd: t("pdf.annotationFormat.lineEnd"),
    lineStyleLabels: {
      solid: t("pdf.annotationFormat.lineStyleSolid"),
      dashed: t("pdf.annotationFormat.lineStyleDashed"),
      dotted: t("pdf.annotationFormat.lineStyleDotted"),
    },
    lineEndingLabels: {
      none: t("pdf.annotationFormat.lineEndingNone"),
      openArrow: t("pdf.annotationFormat.lineEndingOpenArrow"),
      closedArrow: t("pdf.annotationFormat.lineEndingClosedArrow"),
      circle: t("pdf.annotationFormat.lineEndingCircle"),
      square: t("pdf.annotationFormat.lineEndingSquare"),
    },
    fill: t("pdf.annotationFormat.fill"),
    fillColor: t("pdf.annotationFormat.fillColor"),
    fillOpacity: t("pdf.annotationFormat.fillOpacity"),
    opacity: t("pdf.annotationFormat.opacity"),
    blendMode: t("pdf.annotationFormat.blendMode"),
    blendModeLabels: {
      normal: t("pdf.annotationFormat.blendModeNormal"),
      multiply: t("pdf.annotationFormat.blendModeMultiply"),
      screen: t("pdf.annotationFormat.blendModeScreen"),
      overlay: t("pdf.annotationFormat.blendModeOverlay"),
      darken: t("pdf.annotationFormat.blendModeDarken"),
      lighten: t("pdf.annotationFormat.blendModeLighten"),
      "color-dodge": t("pdf.annotationFormat.blendModeColorDodge"),
      "color-burn": t("pdf.annotationFormat.blendModeColorBurn"),
      "hard-light": t("pdf.annotationFormat.blendModeHardLight"),
      "soft-light": t("pdf.annotationFormat.blendModeSoftLight"),
      difference: t("pdf.annotationFormat.blendModeDifference"),
      exclusion: t("pdf.annotationFormat.blendModeExclusion"),
      hue: t("pdf.annotationFormat.blendModeHue"),
      saturation: t("pdf.annotationFormat.blendModeSaturation"),
      color: t("pdf.annotationFormat.blendModeColor"),
      luminosity: t("pdf.annotationFormat.blendModeLuminosity"),
    },
    cornerRadius: t("pdf.annotationFormat.cornerRadius"),
    pointAnchor: t("pdf.annotationFormat.pointAnchor"),
    backToEditing: t("pdf.annotationFormat.backToEditing"),
    pageNumber: (page) => t("pdf.annotationFormat.pageNumber", { page }),
    insert: t("pdf.annotationFormat.insert"),
    outlineMenu: t("pdf.annotationFormat.outlineMenu"),
    transparency: t("pdf.annotationFormat.transparency"),
    lineCap: t("pdf.annotationFormat.lineCap"),
    lineJoin: t("pdf.annotationFormat.lineJoin"),
    lineCapLabels: {
      butt: t("pdf.annotationFormat.lineCapButt"),
      round: t("pdf.annotationFormat.lineCapRound"),
      square: t("pdf.annotationFormat.lineCapSquare"),
    },
    lineJoinLabels: {
      miter: t("pdf.annotationFormat.lineJoinMiter"),
      round: t("pdf.annotationFormat.lineJoinRound"),
      bevel: t("pdf.annotationFormat.lineJoinBevel"),
    },
    lockAspectRatio: t("pdf.annotationFormat.lockAspectRatio"),
    rotate: t("pdf.annotationFormat.rotate"),
    rotateQuarterTurnsOnly: t("pdf.annotationFormat.rotateQuarterTurnsOnly"),
    more: t("pdf.annotationFormat.more"),
    exitEditing: t("pdf.annotationFormat.exitEditing"),
    noFill: t("pdf.annotationFormat.noFill"),
    moreColors: t("pdf.annotationFormat.moreColors"),
    moreShapeStyles: t("pdf.annotationFormat.moreShapeStyles"),
    outlineStylesOnly: t("pdf.annotationFormat.outlineStylesOnly"),
    formatShape: t("document.shapeFormatPane.formatShape"),
    themeColors: t("pdf.annotationFormat.themeColors"),
    standardColors: t("pdf.annotationFormat.standardColors"),
    recentColors: t("pdf.annotationFormat.recentColors"),
  };
}
