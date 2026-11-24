/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, useLayoutEffect, useRef, type CSSProperties } from "react";

import {
  applyPdfTextBoxBarRules,
  applyPdfTextBoxTabStops,
  pdfTextBoxBarPositions,
  pdfTextBoxDefaultTabStop,
  pdfTextBoxTabStopsPx,
} from "../../../../lib/pdf/text-box-tabs";

import {
  pdfTextBoxParagraphRanges,
  pdfTextBoxParagraphSpacingPx,
  pdfTextBoxTypographyStyle,
} from "@mrnote/core/web/lib/pdf/text-box-typography.ts";
import type { TextBoxViewOverlay } from "../../../../lib/pdf/text-box-view-overlay";
import {
  pdfFormulaBoxDrawsLatex,
  pdfFormulaPreviewRectPx,
} from "@mrnote/core/web/lib/pdf/formula-render.ts";
import { PDF_TEXTBOX_LINE_HEIGHT_RATIO } from "../../../../lib/pdf/text-run-layout";
import PdfFormulaPreview from "./PdfFormulaPreview";
import { cssFontFamilyOrUndefined } from "@mrnote/core/web/lib/css-font-family.ts";

type ViewRun = NonNullable<TextBoxViewOverlay["runs"]>[number];

function viewRunsForRange(
  runs: readonly ViewRun[] | undefined,
  start: number,
  end: number,
): ViewRun[] {
  if (!runs) return [];
  const result: ViewRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const runStart = offset;
    const runEnd = runStart + run.text.length;
    offset = runEnd;
    if (runEnd <= start || runStart >= end) continue;
    const localStart = Math.max(start, runStart) - runStart;
    const localEnd = Math.min(end, runEnd) - runStart;
    const text = run.text.slice(localStart, localEnd);
    if (text) result.push({ ...run, text });
  }
  return result;
}

function viewRunSpan(run: ViewRun, displayedPageHeight: number, key: string) {
  return (
    <span
      key={key}
      data-testid="pdf-textbox-view-run"
      data-pdf-textbox-run-content={run.text}
      style={{
        fontSize: Math.max(1, run.fontSize * displayedPageHeight),
        color: run.color,
        fontFamily: cssFontFamilyOrUndefined(run.fontFamily),
        fontWeight: run.fontWeight,
        fontStyle: run.fontStyle,
      }}
    />
  );
}

export interface PdfTextBoxViewLayerProps {
  overlays: readonly TextBoxViewOverlay[];
  displayedPageHeight: number;
  displayedPageWidth?: number;
  /** Screen pixels per point of the page: a WordArt box's effect sizes. */
  pixelsPerPoint?: number;
}

export default function PdfTextBoxViewLayer({
  overlays,
  displayedPageHeight,
  displayedPageWidth = displayedPageHeight,
  pixelsPerPoint,
}: PdfTextBoxViewLayerProps) {
  if (overlays.length === 0) return null;

  return (
    <div
      data-pdf-textbox-view-layer
      className="pdf-viewer__textbox-view-layer"
      data-testid="pdf-textbox-view-layer"
      aria-hidden="true"
      role="presentation"
    >
      {overlays.map((overlay) => {
        const fontSizePx = Math.max(6, overlay.fontSize * displayedPageHeight);
        const baseWidthPx = overlay.width * displayedPageWidth;
        const baseHeightPx = overlay.height * displayedPageHeight;
        const formulaLatex =
          overlay.kind === "formula" &&
          overlay.latex &&
          pdfFormulaBoxDrawsLatex(overlay, overlay.latex)
            ? overlay.latex
            : null;
        const canRenderFormula = formulaLatex != null;
        const paragraphSpacing = !canRenderFormula && !overlay.lineLayout
          ? pdfTextBoxParagraphSpacingPx(overlay.typography, displayedPageHeight) : null;
        const lineLayout = canRenderFormula ? undefined : overlay.lineLayout;
        // Word's Tabs: a box whose words hold tabs draws them at its stops
        // (Word's 0.5 in where it states none), its words written by
        // PdfTextBoxTabbedText (a CSS content string has no tab layout).
        const pageHeightPoints = pixelsPerPoint && pixelsPerPoint > 0 ? displayedPageHeight / pixelsPerPoint : 792;
        const tabs = !canRenderFormula && !lineLayout && !overlay.runs && overlay.text.includes("\t")
          ? pdfTextBoxTabStopsPx(overlay.typography, displayedPageHeight, pageHeightPoints) ??
            { stops: [], interval: pdfTextBoxDefaultTabStop(pageHeightPoints) * displayedPageHeight }
          : null;
        const formulaDisplayRect = canRenderFormula
          ? pdfFormulaPreviewRectPx({
              latex: formulaLatex,
              fontSizePx,
              baseLeftPx: overlay.x * displayedPageWidth,
              baseTopPx: overlay.y * displayedPageHeight,
              baseWidthPx,
              baseHeightPx,
              pageWidthPx: displayedPageWidth,
              pageHeightPx: displayedPageHeight,
            })
          : null;
        const displayHeightPercent =
          ((formulaDisplayRect?.height ?? baseHeightPx) / displayedPageHeight) *
          100;
        const displayWidthPercent =
          ((formulaDisplayRect?.width ?? baseWidthPx) / displayedPageWidth) *
          100;
        const displayLeftPercent =
          ((formulaDisplayRect?.left ?? overlay.x * displayedPageWidth) /
            displayedPageWidth) *
          100;
        const displayTopPercent =
          ((formulaDisplayRect?.top ?? overlay.y * displayedPageHeight) /
            displayedPageHeight) *
          100;
        return (
          <Fragment key={overlay.id}>
            {overlay.mask ? (
              <div
                className="pdf-viewer__textbox-view-mask"
                data-testid="pdf-textbox-view-mask"
                data-box-id={overlay.id}
                aria-hidden="true"
                role="presentation"
                style={{
                  left: `${overlay.mask.x * 100}%`,
                  top: `${overlay.mask.y * 100}%`,
                  width: `${overlay.mask.width * 100}%`,
                  height: `${overlay.mask.height * 100}%`,
                  background: overlay.maskBackgroundColor ?? overlay.backgroundColor,
                }}
              />
            ) : null}
            <div
              className={
                canRenderFormula
                  ? "pdf-viewer__textbox-view-text pdf-viewer__textbox-view-formula"
                  : `pdf-viewer__textbox-view-text${
                      lineLayout ? "" : " pdf-textbox-source-baseline"
                    }`
              }
              data-testid="pdf-textbox-view-text"
              data-box-id={overlay.id}
              data-pdf-textbox-view-content={
                canRenderFormula || overlay.runs || lineLayout || paragraphSpacing || tabs
                  ? ""
                  : overlay.text
              }
              data-pdf-textbox-view-latex={overlay.latex}
              aria-hidden="true"
              role="presentation"
              style={{
                left: `${displayLeftPercent}%`,
                top: `${displayTopPercent}%`,
                width: canRenderFormula
                  ? `${displayWidthPercent}%`
                  : `${overlay.width * 100}%`,
                height: canRenderFormula
                  ? `${displayHeightPercent}%`
                  : lineLayout
                    ? `${overlay.height * 100}%`
                    : undefined,
                minHeight: `${displayHeightPercent}%`,
                fontSize: fontSizePx,
                color: overlay.color,
                background: overlay.backgroundColor,
                fontFamily: cssFontFamilyOrUndefined(overlay.fontFamily),
                fontWeight: overlay.fontWeight,
                fontStyle: overlay.fontStyle,
                textDecoration: overlay.textDecoration,
                textAlign: overlay.textAlign,
                lineHeight: PDF_TEXTBOX_LINE_HEIGHT_RATIO,
                overflowWrap: canRenderFormula ? "anywhere" : "break-word",
                ...(overlay.typography && !canRenderFormula
                  ? (pdfTextBoxTypographyStyle(
                      overlay.typography,
                      displayedPageHeight,
                      fontSizePx,
                      pixelsPerPoint,
                    ) as CSSProperties)
                  : {}),
                // A turned box turns about its centre, as its editor frame
                // and its saved appearance do.
                ...(overlay.angle
                  ? ({ rotate: `${overlay.angle}deg`, transformOrigin: "center" } as CSSProperties)
                  : {}),
                // A horizontally scaled box: laid out 1/k as wide, scaled
                // by k about its centre (text-box-typography.ts).
                ...(overlay.typography?.horizontalScale && !canRenderFormula && !lineLayout
                  ? (() => {
                      const k = overlay.typography!.horizontalScale! / 100;
                      const inner = overlay.width * 100 / k;
                      return {
                        width: `${inner}%`,
                        left: `calc(${displayLeftPercent}% + ${(overlay.width * 100 - inner) / 2}%)`,
                        scale: `${k} 1`,
                        transformOrigin: "center",
                      } as CSSProperties;
                    })()
                  : {}),
              }}
            >
              {canRenderFormula ? (
                <PdfFormulaPreview
                  latex={formulaLatex}
                  color="inherit"
                  compact
                  testId="pdf-textbox-view-formula-render"
                />
              ) : tabs ? (
                <PdfTextBoxTabbedText
                  text={overlay.text}
                  tabs={tabs}
                  leftIndentPx={(overlay.typography?.leftIndent ?? 0) * displayedPageHeight}
                  paragraphSpacing={paragraphSpacing}
                />
              ) : lineLayout ? (
                lineLayout.map((line, lineIndex) => {
                  const lineRuns = viewRunsForRange(
                    overlay.runs,
                    line.start,
                    line.end,
                  );
                  return (
                    <span
                      key={lineIndex}
                      className="pdf-textbox-source-baseline"
                      data-testid="pdf-textbox-view-line"
                      data-pdf-textbox-line-content={
                        lineRuns.length > 0
                          ? ""
                          : overlay.text.slice(line.start, line.end)
                      }
                      style={{
                        position: "absolute",
                        left: `${line.x * 100}%`,
                        top: `${line.y * 100}%`,
                        width: `${line.width * 100}%`,
                        minHeight: `${line.height * 100}%`,
                        whiteSpace: "pre",
                        lineHeight: PDF_TEXTBOX_LINE_HEIGHT_RATIO,
                      }}
                    >
                      {lineRuns.map((run, runIndex) =>
                        viewRunSpan(
                          run,
                          displayedPageHeight,
                          `${lineIndex}-${runIndex}`,
                        ),
                      )}
                    </span>
                  );
                })
              ) : paragraphSpacing ? (
                // Word's Spacing Before / After: each paragraph a block,
                // padded (not margined: the two add up, as the writers
                // space them, instead of collapsing to the larger).
                pdfTextBoxParagraphRanges(overlay.text).map((range, index) => (
                  <div
                    key={index}
                    data-testid="pdf-textbox-view-paragraph"
                    style={{ paddingTop: paragraphSpacing.before, paddingBottom: paragraphSpacing.after }}
                  >
                    {overlay.runs
                      ? viewRunsForRange(overlay.runs, range.start, range.end).map((run, runIndex) =>
                        viewRunSpan(run, displayedPageHeight, `${index}-${runIndex}`))
                      : <span data-pdf-textbox-run-content={overlay.text.slice(range.start, range.end) || "\u200b"} />}
                  </div>
                ))
              ) : overlay.runs ? (
                overlay.runs.map((run, index) =>
                  viewRunSpan(run, displayedPageHeight, String(index)),
                )
              ) : null}
              {!tabs && !canRenderFormula && pdfTextBoxBarPositions(overlay.typography?.tabStops).length > 0 ? (
                <PdfTextBoxBarRules
                  layout={pdfTextBoxTabStopsPx(overlay.typography, displayedPageHeight, pageHeightPoints)!}
                  leftIndentPx={(overlay.typography?.leftIndent ?? 0) * displayedPageHeight}
                />
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** A box's bar tabs (Word's Bar) drawn through its lines, whatever draws
 * its words (text-box-tabs.ts `applyPdfTextBoxBarRules`, on the box). */
function PdfTextBoxBarRules({ layout, leftIndentPx }: {
  layout: Parameters<typeof applyPdfTextBoxBarRules>[1];
  leftIndentPx: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    applyPdfTextBoxBarRules(host, layout, leftIndentPx);
    return () => applyPdfTextBoxBarRules(host, { stops: [] }, 0);
  });
  return <span ref={ref} aria-hidden="true" data-testid="pdf-textbox-view-bars" style={{ display: "none" }} />;
}

/** A box's words holding tabs, each tab reaching its stop (text-box-tabs.ts),
 * its paragraphs spaced as the box spaces them. */
function PdfTextBoxTabbedText({ text, tabs, leftIndentPx, paragraphSpacing }: {
  text: string;
  tabs: Parameters<typeof applyPdfTextBoxTabStops>[1];
  leftIndentPx: number;
  paragraphSpacing: { before: number; after: number } | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const key = JSON.stringify([text, tabs, leftIndentPx, paragraphSpacing]);
  useLayoutEffect(() => {
    const node = ref.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const blocks = text.split("\n").map((paragraph) => {
      const block = node.ownerDocument.createElement("div");
      if (paragraphSpacing) {
        block.style.paddingTop = `${paragraphSpacing.before}px`;
        block.style.paddingBottom = `${paragraphSpacing.after}px`;
      }
      block.style.whiteSpace = "pre-wrap";
      block.textContent = paragraph || "\u200b";
      return block;
    });
    node.replaceChildren(...blocks);
    applyPdfTextBoxTabStops(host, tabs, leftIndentPx);
    // The key names the words, the stops and the spacing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <span ref={ref} data-testid="pdf-textbox-view-tabbed" style={{ display: "block" }} />;
}
