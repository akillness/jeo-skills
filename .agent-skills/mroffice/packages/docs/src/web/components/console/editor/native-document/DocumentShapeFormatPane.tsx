"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Link2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type {
  DocumentShapeAttrs,
  DocumentShapeEffectPreset,
  DocumentShapeFormatRequest,
  DocumentShapeTextDirection,
  DocumentShapeTextVerticalAlign,
  DocumentShapeWrapMode,
} from "@mrnote/core/web/lib/document-shapes.ts";
import { DOCUMENT_SHAPE_MAX_TEXT_FONT_SIZE_PT } from "@mrnote/core/web/lib/document-shapes.ts";

import {
  OfficeShapeFormatPane,
  humanizeOfficeShapeFormatOption,
  type OfficeShapeFormatPaneTab,
} from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { officeEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";
import { withOfficePictureEffect } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { documentShapeOfficeEffects, type DocumentShapePaintRequest } from "@mrnote/core/web/lib/document-shapes.ts";
import { officeChartFillLineSections, officePictureFillPaneArgs } from "@mrnote/core/web/components/office-ribbon/officeChartFillLinePage.tsx";
import type { OfficeLineEndsState } from "@mrnote/core/web/lib/office-line-ends.ts";
import { documentShapeDefinition } from "@mrnote/core/web/lib/document-shapes.ts";
import { documentShapeFillLineChange, documentShapeFillLineStyle } from "./documentShapeFillLine";
import styles from "@mrnote/core/web/components/console/editor/native-document/DocumentShapeFormatPane.module.css";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";

/**
 * Docs' Format Shape pane: the ONE shared pane
 * (components/office-ribbon/OfficeShapeFormatPane) fed the document shape's
 * attributes and Docs' own writers. Word's pane has Shape Options and Text
 * Options; Docs adds Alt Text as its own tab and Word's Link Text Boxes
 * (Shape Format > Text > Create Link), which the shared pane draws as host
 * tabs. Every control id the toolbar's tests address is unchanged.
 */
export interface DocumentShapeFormatLinkTarget {
  readonly label: string;
  readonly pos: number;
}

/** Word's Size page of the pane: the values and the Layout writers. */
export interface DocumentShapeFormatSize {
  /** Centimetres, as the ribbon's Size boxes show them. */
  readonly width: string;
  readonly height: string;
  /** Degrees, clockwise. */
  readonly rotation: string;
  readonly disabledReason?: string;
  readonly onSize: (axis: "width" | "height", centimetres: string) => boolean;
  readonly onRotate: (degrees: string) => boolean;
}

export type DocumentShapeFormatOptionGroup =
  | "effect"
  | "wrap"
  | "textDirection"
  | "verticalAlign";

interface DocumentShapeFormatPaneProps {
  attrs: DocumentShapeAttrs;
  canEdit: boolean;
  draftConflictMessage?: string;
  initialSection?: "shape" | "effects" | "text" | "alt" | "link";
  /** A command's section of the page to bring into view (Shape Effects >
   * Glow > Glow Options...: `effects-glow`); a new `serial` asks again. */
  revealSection?: { readonly section: string; readonly serial: number } | null;
  isChinese: boolean;
  linkTargets: readonly DocumentShapeFormatLinkTarget[];
  onClose: () => void;
  onCommit: (request: DocumentShapeFormatRequest) => boolean;
  onLink: (targetPos: number) => boolean;
  optionLabel?: (
    group: DocumentShapeFormatOptionGroup,
    value: string,
  ) => string;
  useLatestDraftLabel?: string;
  size?: DocumentShapeFormatSize;
  /** Shape Outline's paint writer (Dash type's eight go through it, as the
   * ribbon's Dashes do). */
  onPaint?: (request: DocumentShapePaintRequest) => boolean;
  /** The document theme's six accents (Glow's colours in the Effects tab). */
  accentColors?: Readonly<Record<"accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6", string>>;
  /** The selected line's Begin / End Arrow (`enabled`: it takes them) and the toolbar's writer. */
  lineEnds?: { readonly value: OfficeLineEndsState | null; readonly enabled: boolean; readonly write: (ends: OfficeLineEndsState) => void };
  /** Fill > Picture or texture fill: opens the file picker for the shape's
   * fill picture (absent: the kind is listed greyed). */
  onPickPicture?: () => void;
  /** Picture source > Clipboard: the clipboard's picture as the fill. */
  onPastePicture?: () => void;
  /** Texture: the gallery's texture tiled as the fill. */
  onTexturePicture?: (id: string) => void;
}

const EFFECTS: readonly DocumentShapeEffectPreset[] = [
  "none",
  "shadow",
  "reflection",
  "glow",
  "softEdge",
  "bevel",
  "threeD",
];
const WRAPS: readonly DocumentShapeWrapMode[] = [
  "square",
  "tight",
  "through",
  "topAndBottom",
  "behindText",
  "inFrontOfText",
];
const DIRECTIONS: readonly DocumentShapeTextDirection[] = [
  "horizontal",
  "rotate90",
  "rotate270",
  "stacked",
];
const VERTICAL_ALIGNS: readonly DocumentShapeTextVerticalAlign[] = [
  "top",
  "middle",
  "bottom",
];

export const humanizeDocumentShapeFormatOption = humanizeOfficeShapeFormatOption;

export default function DocumentShapeFormatPane({
  attrs,
  canEdit,
  draftConflictMessage,
  initialSection = "shape",
  revealSection,
  linkTargets,
  onClose,
  onCommit,
  onLink,
  optionLabel,
  useLatestDraftLabel,
  size,
  accentColors,
  onPaint,
  lineEnds,
  onPickPicture,
  onPastePicture,
  onTexturePicture,
}: DocumentShapeFormatPaneProps) {
  const t = useTranslations("console-notebooks");
  const formatOptionLabel = (
    group: DocumentShapeFormatOptionGroup,
    value: string,
  ) =>
    optionLabel?.(group, value).trim() ||
    humanizeOfficeShapeFormatOption(value);
  const options = (group: DocumentShapeFormatOptionGroup, values: readonly string[]) =>
    values.map((value) => ({ value, label: formatOptionLabel(group, value) }));
  const commit = (request: DocumentShapeFormatRequest) =>
    canEdit && onCommit(request);
  // Format Shape > Fill & Line as Word lists it, through the page the deck's
  // shapes and every chart element use: No fill / Solid fill and its
  // Transparency / Gradient fill (presets, type, direction, angle, stops) /
  // Pattern fill (Office's 48); No line / Solid line and its Transparency /
  // Gradient line; Width, Compound, Dash, Cap, Join, Begin / End Arrow.
  const [selectedStops, setSelectedStops] = useState<{ fill: number; line: number }>({ fill: 0, line: 0 });
  const paneStyle = documentShapeFillLineStyle(attrs, lineEnds?.value ?? null);
  const word = (key: string, _zh: string, en: string, values?: Record<string, string | number>) =>
    (t.has as (key: string) => boolean)(key)
      ? (t as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values)
      : en;
  const lineLike = documentShapeDefinition(attrs.preset).lineLike;
  const fillLineSections = officeChartFillLineSections({
    style: paneStyle,
    area: "shape",
    fillAvailable: !lineLike,
    disabledReason: canEdit ? null : t("toolbar.readOnlyReason"),
    word,
    fillColorRow: {
      kind: "color",
      id: "fill",
      label: t("document.shapeFormatPane.shapeFill"),
      value: attrs.fill === "none" ? "#dbeafe" : attrs.fill,
      // A new colour keeps the fill's Transparency, as the pane's slider does.
      onChange: (value) => commit({ fill: value, fillTransparency: attrs.fillTransparency ?? null }),
    },
    lineColorRow: {
      kind: "color",
      id: "outline",
      label: t("document.shapeFormatPane.shapeOutline"),
      value: attrs.outline === "none" ? "#334155" : attrs.outline,
      onChange: (value) => commit({ outline: value, outlineTransparency: attrs.outlineTransparency ?? null }),
    },
    automaticFill: attrs.fill === "none" ? "#dbeafe" : attrs.fill,
    automaticLine: attrs.outline === "none" ? "#334155" : attrs.outline,
    selectedStop: selectedStops,
    onSelectStop: (target, index) => setSelectedStops((current) => ({ ...current, [target]: index })),
    onStyle: (next) => {
      const change = documentShapeFillLineChange(paneStyle, next);
      if (change.request) commit(change.request);
      if (change.dash) onPaint?.({ outlineMenuDash: change.dash });
      if (change.ends && lineEnds?.enabled) lineEnds.write(change.ends);
    },
    noAutomatic: true,
    pictureFillReason: t("document.shapeFormatPane.pictureFillUnavailable"),
    // Picture or texture fill: the picture stretched (into its offsets) or
    // tiled over the shape (Word's `a:blipFill`), with Office's options;
    // another kind picked replaces it.
    pictureFill: onPickPicture
      ? officePictureFillPaneArgs({
          active: Boolean(attrs.fillPicture),
          label: t("presentation.shapeFillPicture"),
          buttonLabel: t("office.shapeFill.picture"),
          disabled: !canEdit,
          disabledReason: canEdit ? undefined : t("toolbar.readOnlyReason"),
          onPick: onPickPicture,
          onClipboard: onPastePicture,
          ...(onTexturePicture ? { onTexture: onTexturePicture } : {}),
          onLeave: (next) => {
            const change = documentShapeFillLineChange(paneStyle, next, { fillRestated: true });
            if (change.request) commit(change.request);
          },
          options: attrs.fillPicture
            ? {
                value: attrs.fillPicture,
                word,
                onChange: (next) => {
                  const src = attrs.fillPicture?.src;
                  if (!src) return;
                  commit({ fillPicture: next.tile ? { src, ...next } : { src, stretch: true, ...next } });
                },
              }
            : undefined,
        })
      : undefined,
    openLine: Boolean(lineEnds?.enabled),
    lineJoinDefault: "miter",
    lineSectionTitle: "line",
  });

  const tabs: OfficeShapeFormatPaneTab[] = [
    {
      id: "shape",
      label: t("document.shapeFormatPane.shapeOptions"),
      sections: [
        ...fillLineSections,
        {
          id: "layout",
          title: t("document.shapeFormatPane.layout"),
          fields: [
            {
              kind: "select",
              id: "wrap",
              label: t("document.shapeFormatPane.wrapText"),
              value: attrs.wrapMode,
              options: options("wrap", WRAPS),
              onChange: (value) => commit({ wrapMode: value }),
            },
          ],
        },
        ...(size
          ? [
              {
                // Word's Size page: height, width and rotation through the
                // Layout writers the ribbon's Size group already commits with.
                id: "size",
                title: t("document.shapeFormatPane.size"),
                fields: [
                  {
                    kind: "number" as const,
                    id: "height",
                    label: t("document.shapeFormatPane.height"),
                    value: size.height,
                    min: 0.1,
                    step: 0.1,
                    unit: "cm",
                    inputClassName: documentValueInputClassName(),
                    disabled: Boolean(size.disabledReason),
                    disabledReason: size.disabledReason,
                    onCommit: (value: string) => size.onSize("height", value),
                  },
                  {
                    kind: "number" as const,
                    id: "width",
                    label: t("document.shapeFormatPane.width"),
                    value: size.width,
                    min: 0.1,
                    step: 0.1,
                    unit: "cm",
                    inputClassName: documentValueInputClassName(),
                    disabled: Boolean(size.disabledReason),
                    disabledReason: size.disabledReason,
                    onCommit: (value: string) => size.onSize("width", value),
                  },
                  {
                    kind: "number" as const,
                    id: "rotation",
                    label: t("document.shapeFormatPane.rotation"),
                    value: size.rotation,
                    min: -360,
                    max: 360,
                    step: 0.1,
                    unit: "°",
                    inputClassName: documentValueInputClassName(),
                    disabled: Boolean(size.disabledReason),
                    disabledReason: size.disabledReason,
                    onCommit: (value: string) => size.onRotate(value),
                  },
                ],
              },
            ]
          : []),
      ],
    },
    // Word's Format Shape > Effects (Shadow, Reflection, Glow, Soft Edges,
    // 3-D Format, 3-D Rotation): the shape's combinable `shapeEffects`, the
    // page the deck's pane draws. An older custom shadow and preset name read
    // as the effects they drew and are cleared by an edit.
    {
      id: "effects",
      label: t("presentation.ui.shapeFormatPane.effects"),
      sections: (() => {
        const accents = accentColors ?? {
          accent1: "#4472c4",
          accent2: "#ed7d31",
          accent3: "#a5a5a5",
          accent4: "#ffc000",
          accent5: "#5b9bd5",
          accent6: "#70ad47",
        };
        const current = documentShapeOfficeEffects(attrs, accents.accent1);
        return officeEffectsPaneSections({
          effects: current,
          accentColors: accents,
          labels: presentationEffectsPaneLabels(t),
          disabled: !canEdit,
          testIdPrefix: "effects",
          onChange: (kind, value) => {
            commit({
              shapeEffects: withOfficePictureEffect(current, kind, value, false) ?? null,
              shapeShadow: null,
              effect: "none",
            });
          },
          // 3-D Rotation > Keep text flat, on a shape holding words (its
          // body's `a:flatTx`); unchecked is stated, so the save takes the
          // file's element off.
          ...(attrs.text.trim()
            ? {
                keepTextFlat: {
                  checked: attrs.keepTextFlat === true,
                  onChange: (checked: boolean) => commit({ keepTextFlat: checked }),
                },
              }
            : {}),
        });
      })(),
    },
    {
      id: "text",
      label: t("document.shapeFormatPane.textOptions"),
      sections: [
        {
          id: "wordart",
          title: t("document.shapeFormatPane.wordartStyles"),
          fields: [
            {
              kind: "color",
              id: "text-fill",
              label: t("document.shapeFormatPane.textFill"),
              value: attrs.textFill === "none" ? "#0f172a" : attrs.textFill,
              onChange: (value) => commit({ textFill: value }),
            },
            {
              kind: "color",
              id: "text-outline",
              label: t("document.shapeFormatPane.textOutline"),
              value: attrs.textOutline === "none" ? "#0f172a" : attrs.textOutline,
              onChange: (value) => commit({ textOutline: value }),
            },
            {
              kind: "number",
              id: "text-outline-width",
              label: t("document.shapeFormatPane.outlineWidth"),
              value: attrs.textOutlineWidthPt,
              min: 0,
              max: 12,
              step: 0.5,
              unit: "pt",
              inputClassName: documentValueInputClassName(),
              onCommit: (value) => commit({ textOutlineWidthPt: value }),
            },
            {
              kind: "select",
              id: "text-effect",
              label: t("document.shapeFormatPane.textEffects"),
              value: attrs.textEffect,
              options: options("effect", EFFECTS),
              onChange: (value) => commit({ textEffect: value }),
            },
          ],
        },
        {
          id: "text-box",
          title: t("document.shapeFormatPane.textBox"),
          fields: [
            {
              kind: "text",
              id: "font-family",
              label: t("document.shapeFormatPane.font"),
              value: attrs.textFontFamily,
              maxLength: 80,
              onCommit: (value) => commit({ textFontFamily: value }),
            },
            {
              kind: "number",
              id: "font-size",
              label: t("document.shapeFormatPane.fontSize"),
              value: attrs.textFontSizePt,
              // Word's range for a shape's words, as the Font Size box's.
              min: 1,
              max: DOCUMENT_SHAPE_MAX_TEXT_FONT_SIZE_PT,
              step: 1,
              unit: "pt",
              inputClassName: documentValueInputClassName(),
              onCommit: (value) => commit({ textFontSizePt: value }),
            },
            {
              kind: "checkbox",
              id: "text-bold",
              label: t("document.shapeFormatPane.bold"),
              checked: attrs.textBold,
              onChange: (checked) => commit({ textBold: checked }),
            },
            {
              kind: "select",
              id: "text-direction",
              label: t("document.shapeFormatPane.textDirection"),
              value: attrs.textDirection,
              options: options("textDirection", DIRECTIONS),
              onChange: (value) => commit({ textDirection: value }),
            },
            {
              kind: "select",
              id: "text-align",
              label: t("document.shapeFormatPane.alignText"),
              value: attrs.textVerticalAlign,
              options: options("verticalAlign", VERTICAL_ALIGNS),
              onChange: (value) => commit({ textVerticalAlign: value }),
            },
            {
              kind: "checkbox",
              id: "text-autofit",
              label: t("document.shapeFormatPane.resizeShapeToFitText"),
              checked: attrs.textAutofit === "shape",
              onChange: (checked) => commit({ textAutofit: checked ? "shape" : "none" }),
            },
            {
              kind: "checkbox",
              id: "text-wrap",
              label: t("document.shapeFormatPane.wrapTextInShape"),
              checked: attrs.textWrap,
              onChange: (checked) => commit({ textWrap: checked }),
            },
          ],
        },
      ],
    },
    {
      id: "alt",
      label: t("document.shapeFormatPane.altText"),
      sections: [
        {
          id: "alt-text",
          title: t("document.shapeFormatPane.altText"),
          fields: [
            {
              kind: "textarea",
              id: "alt",
              label: t("document.shapeFormatPane.description"),
              value: attrs.altText,
              maxLength: 1000,
              rows: 6,
              // Office greys the description out on a decorative object.
              disabled: attrs.decorative === true,
              onCommit: (value) => commit({ altText: value }),
            },
            {
              kind: "checkbox",
              id: "alt-decorative",
              label: t("document.shapeFormatPane.markAsDecorative"),
              checked: attrs.decorative === true,
              // The description is kept while decorative (greyed above) and
              // comes back when the flag is cleared; the export leaves it
              
              onChange: (checked) => commit({ decorative: checked }),
            },
          ],
        },
      ],
    },
    {
      id: "link",
      label: t("document.shapeFormatPane.linkTextBoxes"),
      sections: [
        {
          id: "link-text-boxes",
          title: t("document.shapeFormatPane.linkTextBoxes"),
          hint: attrs.isTextBox
            ? t("document.shapeFormatPane.linkHint")
            : t("document.shapeFormatPane.linkUnavailable"),
          fields: [
            {
              kind: "buttons",
              id: "link",
              label: t("document.shapeFormatPane.linkTextBoxes"),
              buttons: attrs.isTextBox
                ? linkTargets.map((target) => ({
                    id: String(target.pos),
                    label: target.label,
                    icon: <Link2 size={16} aria-hidden />,
                    onSelect: () => {
                      if (canEdit) onLink(target.pos);
                    },
                  }))
                : [],
              emptyLabel: t("document.shapeFormatPane.noEmptyTextBoxAvailable"),
            },
          ],
        },
      ],
    },
  ];

  return (
    <OfficeShapeFormatPane
      testIdPrefix="document-shape-format-pane"
      className={styles.pane}
      dockRight={false}
      initialTab={initialSection}
      requestedTab={
        revealSection
          ? { id: initialSection, serial: revealSection.serial, section: revealSection.section }
          : undefined
      }
      labels={{
        title: t("document.shapeFormatPane.formatShape"),
        close: t("document.shapeFormatPane.closeFormatPane"),
        apply: t("document.shapeFormatPane.apply"),
        cancel: t("document.shapeFormatPane.cancel"),
        draftConflict: draftConflictMessage,
        useLatestDraft: useLatestDraftLabel,
      }}
      tabs={tabs}
      writable={canEdit}
      onClose={onClose}
    />
  );
}
