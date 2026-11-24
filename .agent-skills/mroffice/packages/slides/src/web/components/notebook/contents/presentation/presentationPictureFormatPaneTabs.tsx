/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";

import type { OfficeShapeFormatPaneSection, OfficeShapeFormatPaneTab } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";

/**
 * PowerPoint's Format Picture pane (PPT-B025): the shared Format Shape pane
 * (as the spreadsheet's XLS-A080 uses it) with a picture's four pages --
 * Fill & Line (Line), Effects (Shadow, Reflection, Glow, Soft Edges, 3-D
 * Format, 3-D Rotation: the shared Effects sections a shape's pane shows,
 * officeEffectsPaneSections), Size & Properties (size, position and
 * the picture's link), Picture (Picture Corrections, Picture Color, Picture
 * Transparency, Crop). Each control is the deck's own writer, drawn by the
 * window; this module only says where PowerPoint puts it. Blend mode, corner
 * radius and the animation picker are not on PowerPoint's pane and are not
 * here (Animations and Picture Styles / Crop to Shape carry those).
 */
export interface PresentationPictureFormatPaneControls {
  readonly line: ReactNode;
  /** The picture's older shadow switch, shown while it is on (null: off). */
  readonly shadow: ReactNode | null;
  /** Office's Effects sections over the picture's `pictureEffects`. */
  readonly effects: readonly OfficeShapeFormatPaneSection[];
  readonly geometry: ReactNode;
  readonly caption: ReactNode | null;
  readonly link: ReactNode;
  readonly corrections: ReactNode;
  readonly color: ReactNode;
  readonly transparency: ReactNode;
  readonly crop: ReactNode | null;
  readonly actions: ReactNode;
  /** A 3-D model's own page (Format 3D Model > 3D Model): its rotation. */
  readonly model3d?: readonly OfficeShapeFormatPaneSection[] | null;
}

export interface PresentationPictureFormatPaneLabels {
  readonly fillLine: string;
  readonly line: string;
  readonly effects: string;
  readonly shadow: string;
  readonly sizeProperties: string;
  readonly size: string;
  readonly link: string;
  readonly picture: string;
  readonly corrections: string;
  readonly color: string;
  readonly transparency: string;
  readonly crop: string;
  readonly model3d?: string;
}

export function presentationPictureFormatPaneTabs(
  controls: PresentationPictureFormatPaneControls,
  labels: PresentationPictureFormatPaneLabels,
): OfficeShapeFormatPaneTab[] {
  return [
    {
      id: "fill-line",
      label: labels.fillLine,
      sections: [
        { id: "line", title: labels.line, fields: [{ kind: "custom", id: "line", render: controls.line }] },
      ],
    },
    {
      id: "effects",
      label: labels.effects,
      sections: [
        ...(controls.shadow
          ? [{ id: "shadow", title: labels.shadow, fields: [{ kind: "custom" as const, id: "shadow", render: controls.shadow }] }]
          : []),
        ...controls.effects,
      ],
    },
    {
      id: "size",
      label: labels.sizeProperties,
      sections: [
        {
          id: "geometry",
          title: labels.size,
          fields: [{ kind: "custom", id: "geometry", render: controls.geometry }],
        },
        { id: "link", title: labels.link, fields: [{ kind: "custom", id: "link", render: controls.link }] },
      ],
    },
    {
      id: "picture",
      label: labels.picture,
      sections: [
        {
          id: "corrections",
          title: labels.corrections,
          fields: [{ kind: "custom", id: "corrections", render: controls.corrections }],
        },
        { id: "color", title: labels.color, fields: [{ kind: "custom", id: "color", render: controls.color }] },
        {
          id: "transparency",
          title: labels.transparency,
          fields: [{ kind: "custom", id: "transparency", render: controls.transparency }],
        },
        ...(controls.crop
          ? [{ id: "crop", title: labels.crop, fields: [{ kind: "custom" as const, id: "crop", render: controls.crop }] }]
          : []),
        {
          id: "actions",
          fields: [
            { kind: "custom", id: "actions", render: controls.actions },
            // The editor's own caption for a picture in the flow (not a
            // PowerPoint field; kept with the picture's actions).
            ...(controls.caption
              ? [{ kind: "custom" as const, id: "caption", render: controls.caption }]
              : []),
          ],
        },
      ],
    },
    ...(controls.model3d && controls.model3d.length && labels.model3d
      ? [{ id: "model3d", label: labels.model3d, sections: [...controls.model3d] }]
      : []),
  ];
}
