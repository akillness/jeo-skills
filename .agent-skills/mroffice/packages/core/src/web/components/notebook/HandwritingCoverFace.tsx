"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { Book3D } from "./Book3D";
import type { HandwritingCover } from "../../lib/handwriting-paper";
import type { CoverTemplate } from "../../lib/notebook-cover";

/** The width the cover is laid out at before it is scaled to its box: the
 *  size of a notebook on the shelf, so its title and art keep the shelf's
 *  proportions on a whole page. */
const BASE_WIDTH = 360;

/**
 * A handwriting document's cover, flat, filling its box: the notebook's own
 * cover (Book3D: the same templates, painted covers, colours and title), laid
 * out at shelf size and scaled to the page, the gallery tile or the
 * thumbnail it stands on. `aspect` is the box's height over its width.
 */
export const HandwritingCoverFace = memo(function HandwritingCoverFace({
  cover,
  title,
  typeLabel,
  aspect,
  className,
  style,
  motion,
}: {
  cover: HandwritingCover;
  title: string;
  typeLabel: string;
  aspect: number;
  className?: string;
  style?: CSSProperties;
  /** A moving cover: "hover" in a gallery, still elsewhere (a page, a print). */
  motion?: "play" | "hover";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const width = host.offsetWidth;
      if (width > 0) setScale(width / BASE_WIDTH);
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={hostRef}
      // notebook-luxe-cover: the cover skin the shelf wears -- the painted
      // covers (styles/cover-art.css) and the moving ones are drawn only
      // inside it; without it a painted cover showed as its plain colour.
      className={["handwriting-cover-face notebook-luxe-cover", className].filter(Boolean).join(" ")}
      style={style}
      data-handwriting-cover-face=""
      aria-hidden="true"
    >
      {scale > 0 ? (
        <div
          className="handwriting-cover-face__book"
          style={{
            width: BASE_WIDTH,
            height: BASE_WIDTH * aspect,
            transform: `scale(${scale})`,
          }}
        >
          <Book3D
            title={title}
            typeLabel={typeLabel}
            template={cover.template as CoverTemplate}
            coverColor={cover.color}
            spineColor={cover.spineColor}
            textTheme={cover.textTheme}
            imageUrl={cover.imageUrl}
            motion={motion}
          />
        </div>
      ) : null}
    </div>
  );
});
