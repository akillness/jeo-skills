"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The hidden layer where Shrink text on overflow is measured
 * (`lib/presentation/autofit-measure-store`).
 *
 * Each queued block is drawn here once for every step of PowerPoint's ladder
 * (`presentation-autofit-ladder`), by the renderer the slide itself uses, in a
 * frame as wide as the block's and as tall as its words. The first step whose
 * words fit the block's height is the one the block is drawn at. A whole
 * batch lays out in one pass; the next batch follows until the queue is
 * empty.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { PresentationTextBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { autofitStepsFor, type AutofitStep } from "../../../../lib/presentation-autofit-ladder";
import {
  attachAutofitMeasurer,
  storeMeasuredAutofit,
  takeAutofitMeasureRequests,
  type AutofitMeasureRequest,
} from "../../../../lib/presentation/autofit-measure-store";
import { geometryNumber, isImportedPptxBlock } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  AUTOFIT_EMU_PER_PX,
  importedPptxTextInsetsCss,
  textBlockDrawsInsets,
  textBlockInsetsCss,
  textBlockLineBreakCss,
  textBlockOverflowWrap,
  textBlockTabSizeCss,
  textBlockWraps,
} from "../../../../lib/presentation/text-layout-css";
import { PresentationTextVisualContents, presentationTextVisualLayout } from "./PresentationTextVisual";
import { pageEngineBlockHeight } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";

/** Blocks laid out per pass: each is drawn once per step. */
const BATCH = 6;

const LAYER: CSSProperties = {
  position: "fixed",
  left: -100_000,
  top: 0,
  visibility: "hidden",
  pointerEvents: "none",
  contain: "layout style",
};

function StepCandidate({
  request,
  step,
  id,
}: {
  request: AutofitMeasureRequest;
  step: AutofitStep;
  id: string;
}) {
  const { block, bounds, slide, masters, theme, fontAliases } = request;
  const layout = presentationTextVisualLayout(block, bounds, slide, masters, theme, fontAliases, {
    forcedFit: { fontScale: step.fontScale, lineSpacingMultiplier: 1 - step.lineSpacingReduction },
  });
  const widthPx = (geometryNumber(block, "width") ?? 0) / AUTOFIT_EMU_PER_PX;
  // The frame's insets are shares of the slide's width, as the slide draws them.
  const insets: CSSProperties = isImportedPptxBlock(block)
    ? importedPptxTextInsetsCss(block, bounds.width)
    : textBlockDrawsInsets(block)
      ? textBlockInsetsCss(block, bounds.width)
      : {};
  return (
    <div style={{ width: bounds.width / AUTOFIT_EMU_PER_PX }}>
      <div data-autofit-candidate={id} style={{ width: widthPx, boxSizing: "border-box", ...insets }}>
        <div
          style={{
            ...layout.paragraphTextStyles.containerStyle,
            whiteSpace: textBlockWraps(block as { style?: unknown }) ? "pre-wrap" : "pre",
            overflowWrap: textBlockOverflowWrap(block as { style?: unknown }),
            ...textBlockTabSizeCss(block as { style?: unknown }),
            ...textBlockLineBreakCss(block as { style?: unknown }),
          }}
        >
          <PresentationTextVisualContents block={block as PresentationTextBlock} layout={layout} />
        </div>
      </div>
    </div>
  );
}

/**
 * `hostRef`: the deck window the slides are drawn in. The candidates are laid
 * out inside it, so they inherit what the slides inherit from it -- above
 * all the face of a theme that names none (`.presentation-window`'s stack).
 * Under the page's body they took the app's own face, wider in Latin, and a
 * box shrank a step further than its words needed.
 */
export function PresentationAutofitMeasurer({ hostRef }: { hostRef?: RefObject<HTMLElement | null> } = {}) {
  const [batch, setBatch] = useState<AutofitMeasureRequest[]>([]);
  const busyRef = useRef(false);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () =>
      attachAutofitMeasurer(() => {
        if (busyRef.current) return;
        const next = takeAutofitMeasureRequests(BATCH);
        if (next.length > 0) {
          busyRef.current = true;
          setBatch(next);
        }
      }),
    [],
  );

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (batch.length === 0 || !layer) return;
    batch.forEach((request, index) => {
      const heightPx = (geometryNumber(request.block, "height") ?? 0) / AUTOFIT_EMU_PER_PX;
      const steps = autofitStepsFor(request.block);
      // No layout here (a test's DOM lays nothing out): the estimate stays.
      const first = layer.querySelector<HTMLElement>(`[data-autofit-candidate="${index}-0"]`);
      if (!first || !(first.offsetHeight > 0)) return;
      let chosen = steps[steps.length - 1]!;
      for (let position = 0; position < steps.length; position += 1) {
        const frame = layer.querySelector<HTMLElement>(`[data-autofit-candidate="${index}-${position}"]`);
        // The candidate's lines from the text engine where it can lay them
        // out (the presentation flag): every browser picks the same step.
        const frameHeight = frame
          ? pageEngineBlockHeight("presentation", frame, "[data-presentation-paragraph-text]") ?? frame.offsetHeight
          : undefined;
        // Half a pixel of slack: a fit to the pixel is a fit.
        if (frameHeight !== undefined && frameHeight <= heightPx + 0.5) {
          chosen = steps[position]!;
          break;
        }
      }
      storeMeasuredAutofit(request, {
        fontScale: chosen.fontScale,
        lineSpacingMultiplier: 1 - chosen.lineSpacingReduction,
      });
    });
    const next = takeAutofitMeasureRequests(BATCH);
    busyRef.current = next.length > 0;
    setBatch(next);
  }, [batch]);

  if (typeof document === "undefined" || batch.length === 0) return null;
  const host = hostRef?.current ?? document.body;
  return createPortal(
    <div ref={layerRef} aria-hidden="true" data-testid="presentation-autofit-measurer" style={LAYER}>
      {batch.map((request, index) =>
        autofitStepsFor(request.block).map((step, position) => (
          <StepCandidate key={`${index}-${position}`} request={request} step={step} id={`${index}-${position}`} />
        )),
      )}
    </div>,
    host,
  );
}
