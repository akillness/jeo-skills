"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Shape for a shape on a PDF page (Office's Format Shape pane;
 * ONLYOFFICE's Shape Settings at the right): the shared OfficeShapeFormatPane
 * -- the one Docs, the deck and the worksheet draw -- on the Shape Editing
 * tab's own model and commands (PdfAnnotationFormatContextRibbon). Each
 * field is one of the tab's: the same value in, the same change out, the
 * same reason greying it; the pane adds no writer of its own.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useState } from "react";

import {
  OfficeShapeFormatPane,
  type OfficeShapeFormatPaneField,
  type OfficeShapeFormatPaneSection,
} from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { PDF_STANDARD_BLEND_MODES } from "../../../../lib/pdf/blend-modes";
import { SHAPE_LINE_ENDINGS, SHAPE_LINE_STYLES } from "@mrnote/core/web/lib/pdf/shapes.ts";

import {
  PDF_SHAPE_LINE_CAPS,
  PDF_SHAPE_LINE_JOINS,
  type PdfAnnotationFormatContextRibbonLabels,
  type PdfAnnotationFormatContextRibbonModel,
  type PdfAnnotationStyleChange,
} from "./PdfAnnotationFormatContextRibbon";
import { pdfTaskPaneClassName } from "./pdfTaskPaneDock";

/** The fill a cleared No Fill brings back when the shape had none. */
const DEFAULT_FILL = "#4472c4";

export function PdfShapeFormatPane({
  labels,
  model,
  onStyleChange,
  onSizeChange,
  onRotateBy,
  onClose,
}: {
  readonly labels: PdfAnnotationFormatContextRibbonLabels;
  readonly model: PdfAnnotationFormatContextRibbonModel;
  readonly onStyleChange: (change: PdfAnnotationStyleChange) => void;
  readonly onSizeChange?: (axis: "width" | "height", valuePoints: number, lockAspectRatio?: boolean) => void;
  readonly onRotateBy?: (degrees: number) => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  // The tab's own rules (PdfShapeEditingGroups): what greys a field, and why.
  const styleDisabled = (model.busy && !model.styleQueues) || !model.styleEnabled;
  const styleReason = styleDisabled ? (model.styleDisabledReason ?? labels.style) : undefined;
  const strokeDisabled = styleDisabled || model.strokeSupported === false;
  const fillDisabled = styleDisabled || !model.fillSupported || model.fillToggleEnabled === false;
  const fillReason = styleReason ?? (!model.fillSupported || model.fillToggleEnabled === false
    ? (model.fillToggleDisabledReason ?? labels.fill) : undefined);
  const capJoinDisabled = strokeDisabled || model.capJoinSupported !== true;
  const capJoinReason = styleReason ?? (model.capJoinSupported !== true
    ? (model.capJoinDisabledReason ?? labels.lineCap) : undefined);
  const opacityDisabled = styleDisabled || model.opacitySupported === false;
  const opacityReason = styleReason ?? (model.opacitySupported === false ? model.opacityDisabledReason : undefined);
  const sizeDisabled = !model.sizeEnabled || !onSizeChange || model.busy;
  const number = (raw: string, min: number, max: number): number | null => {
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
  };

  const fill: OfficeShapeFormatPaneSection = {
    id: "fill",
    title: t("document.shapeFormatPane.shapeFill"),
    fields: [
      {
        kind: "color",
        id: "fill-color",
        label: labels.fillColor,
        value: model.fillColor ?? "none",
        fallback: DEFAULT_FILL,
        disabled: fillDisabled,
        disabledReason: fillReason,
        none: { label: labels.noFill, restore: DEFAULT_FILL },
        onChange: (value) => onStyleChange({ fillColor: value === "none" ? null : value }),
      },
      ...(model.fillOpacitySupported ? [{
        kind: "number" as const,
        id: "fill-opacity",
        label: labels.fillOpacity,
        value: model.fillOpacity ?? 0.25,
        min: 0.05,
        max: 1,
        step: 0.05,
        disabled: fillDisabled,
        disabledReason: fillReason,
        onCommit: (raw: string) => {
          const value = number(raw, 0.05, 1);
          if (value === null) return false;
          onStyleChange({ fillOpacity: value });
          return true;
        },
      }] : []),
    ],
  };

  const outline: OfficeShapeFormatPaneSection = {
    id: "outline",
    title: t("document.shapeFormatPane.shapeOutline"),
    fields: [
      {
        kind: "color",
        id: "outline-color",
        label: labels.outlineColor,
        value: model.outlineColor ?? "#000000",
        disabled: strokeDisabled,
        disabledReason: styleReason,
        onChange: (value) => { if (value !== "none") onStyleChange({ outlineColor: value }); },
      },
      {
        kind: "number",
        id: "line-width",
        label: labels.lineWidth,
        value: Math.round((model.lineWidth ?? 0.6) * 100) / 100,
        min: 0.1,
        max: 72,
        step: 0.25,
        unit: labels.points,
        disabled: strokeDisabled,
        disabledReason: styleReason,
        onCommit: (raw) => {
          const value = number(raw, 0.1, 72);
          if (value === null) return false;
          if (Math.abs(value - (model.lineWidth ?? 0.6)) >= 0.005) onStyleChange({ lineWidth: value });
          return true;
        },
      },
      {
        kind: "select",
        id: "line-style",
        label: labels.lineStyle,
        value: model.lineStyle ?? "solid",
        options: SHAPE_LINE_STYLES.map((style) => ({ value: style, label: labels.lineStyleLabels[style] })),
        disabled: strokeDisabled,
        disabledReason: styleReason,
        onChange: (value) => onStyleChange({ lineStyle: value as (typeof SHAPE_LINE_STYLES)[number] }),
      },
      {
        kind: "select",
        id: "line-cap",
        label: labels.lineCap,
        value: model.lineCap ?? "butt",
        options: PDF_SHAPE_LINE_CAPS.map((cap) => ({ value: cap, label: labels.lineCapLabels[cap] })),
        disabled: capJoinDisabled,
        disabledReason: capJoinReason,
        onChange: (value) => onStyleChange({ lineCap: value as (typeof PDF_SHAPE_LINE_CAPS)[number] }),
      },
      {
        kind: "select",
        id: "line-join",
        label: labels.lineJoin,
        value: model.lineJoin ?? "miter",
        options: PDF_SHAPE_LINE_JOINS.map((join) => ({ value: join, label: labels.lineJoinLabels[join] })),
        disabled: capJoinDisabled,
        disabledReason: capJoinReason,
        onChange: (value) => onStyleChange({ lineJoin: value as (typeof PDF_SHAPE_LINE_JOINS)[number] }),
      },
      ...(model.lineEndingsSupported ? (["lineStart", "lineEnd"] as const).map((end): OfficeShapeFormatPaneField => ({
        kind: "select",
        id: end === "lineStart" ? "line-start" : "line-end",
        label: labels[end],
        value: model[end] ?? "none",
        options: SHAPE_LINE_ENDINGS.map((ending) => ({ value: ending, label: labels.lineEndingLabels[ending] })),
        disabled: strokeDisabled,
        disabledReason: styleReason,
        onChange: (value) => onStyleChange({ [end]: value as (typeof SHAPE_LINE_ENDINGS)[number] }),
      })) : []),
    ],
  };

  const look: OfficeShapeFormatPaneSection = {
    id: "transparency",
    title: labels.transparency,
    ...(opacityReason && model.opacitySupported === false ? { hint: opacityReason } : {}),
    fields: [
      {
        kind: "number",
        id: "transparency",
        label: labels.transparency,
        value: model.opacitySupported === false ? "" : Math.round((1 - (model.opacity ?? 1)) * 100),
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        disabled: opacityDisabled,
        disabledReason: opacityReason,
        onCommit: (raw) => {
          const value = number(raw, 0, 100);
          if (value === null) return false;
          onStyleChange({ opacity: Math.round((1 - value / 100) * 100) / 100 });
          return true;
        },
      },
      ...(model.blendModeSupported ? [{
        kind: "select" as const,
        id: "blend-mode",
        label: labels.blendMode,
        value: model.blendMode ?? "Normal",
        options: PDF_STANDARD_BLEND_MODES.map((mode) => ({ value: mode, label: labels.blendModeLabels[mode] })),
        disabled: styleDisabled,
        disabledReason: styleReason,
        onChange: (value: string) => onStyleChange({ blendMode: value as (typeof PDF_STANDARD_BLEND_MODES)[number] }),
      }] : []),
      ...(model.cornerSupported ? [{
        kind: "number" as const,
        id: "corner-radius",
        label: labels.cornerRadius,
        value: model.cornerRadius ?? 0,
        min: 0,
        max: 50,
        step: 1,
        disabled: styleDisabled,
        disabledReason: styleReason,
        onCommit: (raw: string) => {
          const value = number(raw, 0, 50);
          if (value === null) return false;
          onStyleChange({ cornerRadius: value });
          return true;
        },
      }] : []),
    ],
  };

  const sizeField = (axis: "width" | "height", value: number | undefined): OfficeShapeFormatPaneField => ({
    kind: "number",
    id: axis,
    label: axis === "width" ? labels.width : labels.height,
    value: value === undefined ? "" : Math.round(value * 100) / 100,
    min: 1,
    max: 14400,
    step: 1,
    unit: labels.points,
    disabled: sizeDisabled,
    disabledReason: model.sizeDisabledReason,
    onCommit: (raw) => {
      const next = number(raw, 1, 14400);
      if (next === null || !onSizeChange) return false;
      onSizeChange(axis, next, lockAspectRatio);
      return true;
    },
  });
  const size: OfficeShapeFormatPaneSection = {
    id: "size",
    title: t("document.shapeFormatPane.size"),
    fields: [
      sizeField("height", model.heightPoints),
      sizeField("width", model.widthPoints),
      {
        kind: "checkbox",
        id: "lock-aspect-ratio",
        label: labels.lockAspectRatio,
        checked: lockAspectRatio,
        disabled: sizeDisabled,
        disabledReason: model.sizeDisabledReason,
        onChange: setLockAspectRatio,
      },
      {
        kind: "number",
        id: "rotation",
        label: t("document.shapeFormatPane.rotation"),
        value: model.rotationDegrees ?? 0,
        min: -360,
        max: 360,
        step: model.freeRotation ? 1 : 90,
        unit: "°",
        disabled: !onRotateBy || model.busy,
        ...(model.freeRotation ? {} : { disabledReason: labels.rotateQuarterTurnsOnly }),
        onCommit: (raw) => {
          const next = number(raw, -360, 360);
          if (next === null || !onRotateBy) return false;
          const by = next - (model.rotationDegrees ?? 0);
          if (Math.abs(by) >= 0.01) onRotateBy(by);
          return true;
        },
      },
    ],
  };

  return (
    <OfficeShapeFormatPane
      testIdPrefix="pdf-shape-format-pane"
      labels={{
        title: t("document.shapeFormatPane.formatShape"),
        close: t("document.shapeFormatPane.closeFormatPane"),
        apply: t("document.shapeFormatPane.apply"),
        cancel: t("document.shapeFormatPane.cancel"),
      }}
      tabs={[
        { id: "shape", label: t("document.shapeFormatPane.fillLine"), sections: [fill, outline, look] },
        { id: "size", label: t("presentation.ui.shapeFormatPane.sizeProperties"), sections: [size] },
      ]}
      writable={!model.busy || Boolean(model.styleQueues)}
      onClose={onClose}
      dockRight={false}
      className={pdfTaskPaneClassName("pdf-viewer__shape-format-pane")}
    />
  );
}
