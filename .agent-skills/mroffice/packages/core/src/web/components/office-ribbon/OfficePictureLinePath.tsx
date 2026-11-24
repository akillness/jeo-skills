"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId } from "react";

import { OFFICE_PICTURE_LINE_MITER_LIMIT, type OfficePictureLineJoin } from "../../lib/office-picture-line";
import { officeCompoundStrokeLayers, type OfficeStrokeCompound } from "../../lib/office-stroke-detail";

/**
 * A picture's line along `d` (`lib/office-picture-line`: the path it is
 * stroked on, in the drawing's units): one line, or the two or three lines a
 * compound states, cut from it by a mask whose gaps show what is under the
 * picture, as a shape's closed compound outline is drawn
 * (`PresentationNativeShapeGraphic`). `bounds` holds the whole line.
 */
export function OfficePictureLinePath({
  d,
  color,
  width,
  opacity,
  compound,
  join = "round",
  dashArray,
  dashCap,
  bounds,
  testId,
}: {
  d: string;
  color: string;
  width: number;
  opacity?: number;
  compound?: OfficeStrokeCompound;
  join?: OfficePictureLineJoin;
  dashArray?: string;
  dashCap?: "butt" | "round" | "square";
  bounds: { x: number; y: number; width: number; height: number };
  testId?: string;
}) {
  const uid = `office-picture-line-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const stroke = (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinejoin={join}
      strokeMiterlimit={join === "miter" ? OFFICE_PICTURE_LINE_MITER_LIMIT : undefined}
      strokeDasharray={dashArray}
      strokeLinecap={dashArray ? dashCap : undefined}
      data-testid={testId}
      data-line-compound={compound}
      data-line-join={join}
    />
  );
  if (!compound) return stroke;
  const layers = officeCompoundStrokeLayers(compound, true);
  const n = (value: number) => Math.round(value * 1000) / 1000;
  return (
    <g>
      <defs>
        {layers.some((layer) => layer.inside) ? (
          <clipPath id={`${uid}-inside`} clipPathUnits="userSpaceOnUse">
            <path d={d} />
          </clipPath>
        ) : null}
        <mask id={uid} maskUnits="userSpaceOnUse" {...bounds}>
          {layers.map((layer, index) => (
            <path
              key={index}
              d={d}
              fill="none"
              stroke={layer.ink ? "white" : "black"}
              strokeWidth={n(width * layer.width)}
              strokeLinejoin={join}
              strokeMiterlimit={join === "miter" ? OFFICE_PICTURE_LINE_MITER_LIMIT : undefined}
              clipPath={layer.inside ? `url(#${uid}-inside)` : undefined}
            />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${uid})`}>{stroke}</g>
    </g>
  );
}
