/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An inline picture wider than its paragraph's line (`data-picture-past-line`,
 * note-editor.css): nothing more fits on that line, so what the editor draws
 * after it (the paragraph's end) takes no line of its own, as in Word.
 * `ImageResizeNodeView.refreshInlineImagePageProjection` judges it at the
 * paragraph's width and writes the picture's extent on its line here.
 */

/** The width an inline picture takes on its paragraph's line, with its
 * effect extent (`refreshInlineImagePageProjection` writes it). */
export const PICTURE_LINE_EXTENT_ATTR = "data-picture-line-px";

/** Judge again, at the width the paragraph `host` now has, whether each
 * inline picture it holds runs past its line (`data-picture-past-line`): a
 * projector measuring the paragraph at another width (an unequal column's
 * narrower track) read it with the line its last width gave, so a picture
 * that fitted the wide track took an extra line under it in the narrow one
 * and which of the two a page was planned with depended on the track the
 * paragraph stood in the pass before (corpus R456-D20: a 335 px picture
 * indented 12 px in a 336 px column, 264.71 or 288.85 px by the pass). */
export function rejudgeInlinePicturesPastLine(host: HTMLElement): void {
  let width: number | null = null;
  for (const wrapper of Array.from(host.children)) {
    if (!(wrapper instanceof HTMLElement)) continue;
    const extent = Number.parseFloat(wrapper.getAttribute(PICTURE_LINE_EXTENT_ATTR) ?? "");
    if (!Number.isFinite(extent)) continue;
    width ??= hostTextWidth(host);
    const past = extent > width;
    if (past && wrapper.getAttribute("data-picture-past-line") !== "true") wrapper.setAttribute("data-picture-past-line", "true");
    else if (!past && wrapper.hasAttribute("data-picture-past-line")) wrapper.removeAttribute("data-picture-past-line");
  }
}

function hostTextWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return element.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
}
