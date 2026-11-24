"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One Word drawing in a page thumbnail, painted by the SAME `paintShape` the
 * editor's own `documentShape` (and a header band's drawing) is painted by,
 * with its words over it. Loaded only for a thumbnail that has drawings: the
 * painter is the editor's.
 */
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

import { paintShape } from "../../console/editor/native-document/documentShapeExtension";
import { normalizeDocumentShapeAttrs } from "../../../lib/document-shapes";
import { emuToPx } from "../../../lib/office-float-anchor";
import { ptToPx } from "../../../lib/office-units";

const ALIGN: Record<string, CSSProperties["textAlign"]> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "justify",
};

export function DocumentShapeThumb({
  attrs,
  style,
}: {
  attrs: Record<string, unknown>;
  /** The box: its place and size in the host's px. */
  style: CSSProperties;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shape = useMemo(() => normalizeDocumentShapeAttrs({ ...attrs, source: null } as never), [attrs]);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      paintShape(svg, shape);
    } catch {
      // a drawing the painter cannot draw is left out of the thumbnail
      svg.replaceChildren();
    }
  }, [shape]);
  const transform = [
    shape.rotation ? `rotate(${shape.rotation}deg)` : "",
    shape.flipH ? "scaleX(-1)" : "",
    shape.flipV ? "scaleY(-1)" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const body = shape.textBody;
  const paragraphs = body?.paragraphs?.length
    ? body.paragraphs
    : shape.text
      ? shape.text.split("\n").map((text) => ({ text }))
      : [];
  const words = paragraphs.some((paragraph) => paragraph.text.trim());
  const color = /^#[0-9a-f]{6}$/i.test(shape.textFill) ? shape.textFill : undefined;
  const sizePx = ptToPx(shape.textFontSizePt || 11);
  const anchor = body?.anchor ?? (shape.textVerticalAlign === "bottom" ? "b" : shape.textVerticalAlign === "top" ? "t" : "ctr");
  return (
    <div style={{ position: "absolute", ...style, transform: transform || undefined }}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      />
      {words ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: anchor === "b" ? "flex-end" : anchor === "t" ? "flex-start" : "center",
            padding: body
              ? `${emuToPx(body.insetTopEmu)}px ${emuToPx(body.insetRightEmu)}px ${emuToPx(body.insetBottomEmu)}px ${emuToPx(body.insetLeftEmu)}px`
              : "4px 7px",
            overflow: "hidden",
            color,
            fontFamily: shape.textFontFamily || undefined,
            fontWeight: shape.textBold ? 700 : undefined,
            fontStyle: shape.textItalic ? "italic" : undefined,
            fontSize: sizePx,
            lineHeight: 1.2,
            // words are not mirrored with a flipped shape (Word)
            transform: shape.flipH !== shape.flipV ? "scaleX(-1)" : undefined,
          }}
        >
          {paragraphs.map((paragraph, index) => {
            const own = "fontSizePt" in paragraph && paragraph.fontSizePt ? ptToPx(paragraph.fontSizePt) : undefined;
            const align = "align" in paragraph && paragraph.align ? ALIGN[paragraph.align] : shape.textAlign ? ALIGN[shape.textAlign] : undefined;
            return (
              <p
                key={index}
                style={{
                  margin: 0,
                  textAlign: align,
                  fontSize: own,
                  fontFamily: "fontFamily" in paragraph && paragraph.fontFamily ? paragraph.fontFamily : undefined,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {paragraph.text || " "}
              </p>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default DocumentShapeThumb;
