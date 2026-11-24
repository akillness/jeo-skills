/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * How large an equation is drawn on a slide, so its equation box can be sized
 * to it ("Resize shape to fit text" with no wrap, as PowerPoint's Insert >
 * Equation box is).
 *
 * The equation is laid out exactly as the slide draws it (the same KaTeX
 * atom `PresentationMathRun` renders, at the run's size) inside the slide's
 * own design surface, which is drawn scaled: `offsetWidth`/`offsetHeight`
 * are its unscaled design px. A wrapper that is its own formatting context
 * keeps the display equation's margins inside the measurement. Null when
 * nothing is laid out (a hidden surface, or no layout engine at all).
 */

import { createPresentationMathAtomElement } from "@mrnote/core/web/components/notebook/contents/presentation/PresentationMathRun.tsx";

export function measurePresentationEquation(
  surface: HTMLElement | null,
  latex: string,
  fontSizePx: number,
): { width: number; height: number } | null {
  if (!surface || !latex.trim()) return null;
  const document = surface.ownerDocument;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.setAttribute("data-presentation-equation-measure", "");
  Object.assign(probe.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    display: "inline-block",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    fontSize: `${Math.max(1, fontSizePx)}px`,
    lineHeight: "normal",
  });
  probe.appendChild(createPresentationMathAtomElement(document, { text: latex, latex, display: true, runIndex: 0 }));
  surface.appendChild(probe);
  try {
    const width = probe.offsetWidth;
    const height = probe.offsetHeight;
    return width > 0 && height > 0 ? { width, height } : null;
  } finally {
    probe.remove();
  }
}
