"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment } from "react";

import { officeClearColorTable, type OfficePictureFilterStep } from "../../lib/office-picture-adjust-filter";

/**
 * A blip's Color and Corrections as one SVG filter (`office-recolor-presets`),
 * defined in a zero-size SVG beside the drawing it filters; the drawing takes
 * `filter: url(#id)`. sRGB interpolation: Office computes on the encoded
 * values, not on linear light. A Set Transparent Color step (`clear`) cuts
 * its colour out of the picture first (`office-picture-adjust-filter`).
 */
export function OfficeAdjustSvgFilter({
  id,
  steps,
}: {
  readonly id: string;
  readonly steps: readonly OfficePictureFilterStep[];
}) {
  if (!steps.length) return null;
  return (
    <svg aria-hidden="true" width="0" height="0" focusable="false" style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1">
          {steps.map((step, index) =>
            step.type === "clear" ? (
              // Each channel's indicator of the colour, summed less 2 as the
              // alpha of a "hit", and the picture drawn out of it. First in
              // a step list (`OfficeClearColorStep`): it reads the picture.
              <Fragment key={index}>
                <feComponentTransfer in="SourceGraphic">
                  {(["feFuncR", "feFuncG", "feFuncB"] as const).map((Func, channel) => (
                    <Func key={Func} type="discrete" tableValues={officeClearColorTable(step.color[channel] ?? 0, step.tolerance).join(" ")} />
                  ))}
                </feComponentTransfer>
                <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 1 1 0 -2" result={`${id}-clear`} />
                <feComposite in="SourceGraphic" in2={`${id}-clear`} operator="out" />
              </Fragment>
            ) : step.type === "matrix" ? (
              <feColorMatrix key={index} type="matrix" values={step.values.join(" ")} />
            ) : (
              <feComponentTransfer key={index}>
                {(["feFuncR", "feFuncG", "feFuncB"] as const).map((Func) =>
                  step.type === "discrete" ? (
                    <Func key={Func} type="discrete" tableValues={step.table.join(" ")} />
                  ) : (
                    <Func key={Func} type="linear" slope={step.slope} intercept={step.intercept} />
                  ),
                )}
              </feComponentTransfer>
            ),
          )}
        </filter>
      </defs>
    </svg>
  );
}
