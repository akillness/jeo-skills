"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A SmartArt graphic on a PDF page as the page shows it while it is edited
 * (lib/pdf/managed-chart.ts, kind "smartart"): its members painted by the
 * Docs editor's own shape painter (`paintShape`, as a Docs header draws a
 * group), its words in each member's text box at the size the graphic's
 * frame fits them to (`documentSmartArtLabelFontPx`, which the writer's
 * painter shares). Drawn at the frame's natural size and scaled to the
 * page's zoom, so the words wrap where the written graphic wraps them.
 */
import { useLayoutEffect, useRef } from "react";

import { paintShape } from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";
import { normalizeDocumentShapeAttrs } from "@mrnote/core/web/lib/document-shapes.ts";
import { documentSmartArtLabelFontPx } from "@mrnote/core/web/lib/office-smartart/document-shapes-model.ts";
import { smartArtTextBoxInsetPercents } from "@mrnote/core/web/lib/office-smartart/text-box.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const EMU_PER_POINT = 12_700;
const EMU_PER_PX = 9_525;
/** Office's body insets (`a:bodyPr` defaults): 0.1 in across, 0.05 in down. */
const BODY_INSET_X_PX = 91_440 / EMU_PER_PX;
const BODY_INSET_Y_PX = 45_720 / EMU_PER_PX;

type Member = Record<string, unknown> & {
  memberId?: string;
  xEmu?: number; yEmu?: number; widthEmu?: number; heightEmu?: number;
  rotation?: number; flipH?: boolean; flipV?: boolean;
  text?: string; textFill?: string; textBold?: boolean; textItalic?: boolean;
  textFontSizePt?: number; smartArtHidden?: boolean; smartArtAuthorTextSize?: boolean;
  smartArtTextBox?: Parameters<typeof smartArtTextBoxInsetPercents>[0];
};

/** The graphic's model drawn in a frame of `widthPt` x `heightPt` points: the
 * group's own extent is the frame's (as the writer draws it). */
export function pdfSmartArtAttrsInFrame(attrs: Record<string, unknown>, widthPt: number,
  heightPt: number): Record<string, unknown> {
  return { ...attrs, widthEmu: Math.round(widthPt * EMU_PER_POINT), heightEmu: Math.round(heightPt * EMU_PER_POINT) };
}

export function PdfSmartArtPicture({ attrs, widthPt, heightPt, cssWidth, cssHeight, textPrompt = null }: {
  attrs: Record<string, unknown>;
  /** The frame on the page, in points (the size the writer draws it at). */
  widthPt: number;
  heightPt: number;
  /** The frame on screen, in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Office's `[Text]` prompt in an empty item's shape, drawn while it is
   * edited only: the shape stays empty in the PDF (as in Word). */
  textPrompt?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([attrs, Math.round(widthPt * 100), Math.round(heightPt * 100), textPrompt]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const framed = pdfSmartArtAttrsInFrame(attrs, widthPt, heightPt);
    const members = (Array.isArray(framed.groupMembers) ? framed.groupMembers : []) as Member[];
    const width = Number(framed.groupCoordinateWidthEmu ?? framed.widthEmu) || 1;
    const height = Number(framed.groupCoordinateHeightEmu ?? framed.heightEmu) || 1;
    let labelPx: number | null = null;
    try {
      labelPx = documentSmartArtLabelFontPx(framed as unknown as Parameters<typeof documentSmartArtLabelFontPx>[0]);
    } catch {
      labelPx = null;
    }
    const layer = host.ownerDocument.createElement("div");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    const turn = [
      framed.rotation ? `rotate(${Number(framed.rotation)}deg)` : "",
      framed.flipH === true ? "scaleX(-1)" : "",
      framed.flipV === true ? "scaleY(-1)" : "",
    ].filter(Boolean);
    if (turn.length) layer.style.transform = turn.join(" ");
    for (const member of members) {
      if (member.smartArtHidden === true || member.hidden === true) continue;
      const cell = host.ownerDocument.createElement("div");
      cell.dataset.pdfSmartartMember = member.memberId ?? "";
      Object.assign(cell.style, {
        position: "absolute",
        left: `${(Number(member.xEmu) / width) * 100}%`,
        top: `${(Number(member.yEmu) / height) * 100}%`,
        width: `${(Number(member.widthEmu) / width) * 100}%`,
        height: `${(Number(member.heightEmu) / height) * 100}%`,
      } satisfies Partial<CSSStyleDeclaration>);
      const own = [
        member.rotation ? `rotate(${member.rotation}deg)` : "",
        member.flipH ? "scaleX(-1)" : "",
        member.flipV ? "scaleY(-1)" : "",
      ].filter(Boolean);
      if (own.length) cell.style.transform = own.join(" ");
      const svg = host.ownerDocument.createElementNS(SVG_NS, "svg") as SVGSVGElement;
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      Object.assign(svg.style, { position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible" });
      try {
        paintShape(svg, normalizeDocumentShapeAttrs({ ...member, source: null }));
      } catch {
        // A member the painter cannot draw is left out of the picture only.
      }
      cell.appendChild(svg);
      const prompted = !(typeof member.text === "string" && member.text.trim()) && Boolean(textPrompt) &&
        typeof member.smartArtItemId === "string" && member.smartArtPicturePlaceholder !== true &&
        (member.smartArtRole === "node" || member.smartArtRole === "label");
      if ((typeof member.text === "string" && member.text.trim()) || prompted) {
        const words = host.ownerDocument.createElement("div");
        const inset = member.smartArtTextBox ? smartArtTextBoxInsetPercents(member.smartArtTextBox) : null;
        const authoredSize = typeof member.textFontSizePt === "number" &&
          (member.smartArtAuthorTextSize === true || member.textFontSizePt !== 14);
        Object.assign(words.style, {
          position: "absolute",
          inset: inset ? `${inset.top}% ${inset.right}% ${inset.bottom}% ${inset.left}%` : "0",
          padding: `${BODY_INSET_Y_PX}px ${BODY_INSET_X_PX}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          lineHeight: "1.25",
          color: member.textFill ?? "#000000",
          fontWeight: member.textBold === true ? "700" : "400",
          fontStyle: member.textItalic === true ? "italic" : "normal",
          fontSize: `${authoredSize ? (member.textFontSizePt! * 96) / 72 : labelPx ?? 18.667}px`,
        } satisfies Partial<CSSStyleDeclaration>);
        // Words are not mirrored with a flipped shape (Word, PowerPoint).
        if ((member.flipH === true) !== (framed.flipH === true) && (member.flipV === true) === (framed.flipV === true)) {
          words.style.transform = "scaleX(-1)";
        }
        words.textContent = prompted ? textPrompt! : member.text!;
        if (prompted) words.style.opacity = "0.6";
        cell.appendChild(words);
      }
      layer.appendChild(cell);
    }
    host.replaceChildren(layer);
    // The key names the model and the frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const naturalWidth = (widthPt * 96) / 72;
  const naturalHeight = (heightPt * 96) / 72;
  return (
    <div
      aria-hidden="true"
      className="pdf-viewer__smartart-picture"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <div
        ref={hostRef}
        data-testid="pdf-smartart-picture"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: naturalWidth,
          height: naturalHeight,
          transformOrigin: "0 0",
          transform: `scale(${cssWidth / Math.max(1, naturalWidth)}, ${cssHeight / Math.max(1, naturalHeight)})`,
        }}
      />
    </div>
  );
}
