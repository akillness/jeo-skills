"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, useId, type ReactNode } from "react";

import {
  headerFooterPictureLayout,
  headerFooterPictureTransfer,
} from "../../../../lib/spreadsheet/header-footer-picture";
import {
  HEADER_FOOTER_PICTURE_MARK,
  type PrintHeaderFooterPicture,
} from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";

/**
 * A header/footer section's picture as it prints: its Format Picture size,
 * cropped against the original, with its Image Control colour transfer drawn
 * as an SVG filter (the same linear transfer the PDF applies).
 */
export function SpreadsheetHeaderFooterPicture({
  picture,
  pointToPx,
  testId,
}: {
  picture: PrintHeaderFooterPicture;
  pointToPx: (points: number) => number;
  testId?: string;
}): React.JSX.Element {
  const filterId = `hf-picture-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const layout = headerFooterPictureLayout(picture, pointToPx);
  const transfer = headerFooterPictureTransfer(picture);
  const channels = transfer
    ? (["R", "G", "B"] as const).map((channel) => {
        const Func = `feFunc${channel}` as "feFuncR" | "feFuncG" | "feFuncB";
        return (
          <Func
            key={channel}
            type="linear"
            slope={transfer.slope}
            intercept={transfer.intercept}
          />
        );
      })
    : null;
  const thresholds = transfer?.threshold
    ? (["R", "G", "B"] as const).map((channel) => {
        const Func = `feFunc${channel}` as "feFuncR" | "feFuncG" | "feFuncB";
        return <Func key={channel} type="discrete" tableValues="0 1" />;
      })
    : null;
  return (
    <span
      data-testid={testId}
      data-hf-picture="true"
      role="img"
      aria-label={picture.alt || undefined}
      style={{
        display: "inline-block",
        position: "relative",
        width: layout.boxWidth,
        height: layout.boxHeight,
        overflow: "hidden",
        verticalAlign: "baseline",
        lineHeight: 0,
      }}
    >
      {transfer ? (
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            {transfer.grayscale ? <feColorMatrix type="saturate" values="0" /> : null}
            <feComponentTransfer>{channels}</feComponentTransfer>
            {thresholds ? <feComponentTransfer>{thresholds}</feComponentTransfer> : null}
          </filter>
        </svg>
      ) : null}
      {/* An embedded data image (the page stores only embedded pictures). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={picture.src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: layout.imageLeft,
          top: layout.imageTop,
          width: layout.imageWidth,
          height: layout.imageHeight,
          maxWidth: "none",
          maxHeight: "none",
          filter: transfer ? `url(#${filterId})` : undefined,
        }}
      />
    </span>
  );
}

/**
 * Text with the section's picture drawn at its {@link HEADER_FOOTER_PICTURE_MARK}
 * (the resolved `&[Picture]` code); text without the mark renders as is.
 */
export function withHeaderFooterPicture(
  text: string,
  picture: PrintHeaderFooterPicture | undefined,
  pointToPx: (points: number) => number,
  testId?: string,
): ReactNode {
  if (!picture || !text.includes(HEADER_FOOTER_PICTURE_MARK)) {
    return text.split(HEADER_FOOTER_PICTURE_MARK).join("");
  }
  const [before, ...rest] = text.split(HEADER_FOOTER_PICTURE_MARK);
  return (
    <Fragment>
      {before}
      <SpreadsheetHeaderFooterPicture picture={picture} pointToPx={pointToPx} testId={testId} />
      {rest.join("")}
    </Fragment>
  );
}

