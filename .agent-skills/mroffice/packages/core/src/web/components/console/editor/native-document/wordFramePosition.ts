/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Whether Word lifts a paragraph with this (effective) `w:framePr` out of the
 * text at all. The element alone does not: Word sets the paragraph as a frame
 * only when some property moves or sizes it, and lays it in the text
 * otherwise (Windows Word, docx-look pc1/probes/fd: 36 variants on one
 * paragraph; pc1/probes/fr: the frame in docDefaults, Normal or the paragraph
 * itself, the same).
 *
 * Moving or sizing: a width; a height that is not `hRule="auto"`; `w:x` off 0
 * or `w:xAlign` other than left; `w:y` off 0 or `w:yAlign` other than inline;
 * `w:hAnchor` margin or page; `w:vAnchor` text; `w:wrap` other than auto.
 * Not: `w:hSpace`, `w:vSpace`, `w:anchorLock`, `w:hRule` alone, `w:vAnchor`
 * page or margin, `w:hAnchor` text, nor an empty element.
 *
 * Apple Pages writes `<w:framePr w:w="0" w:h="0" w:hRule="exact"
 * w:xAlign="left" w:y="0" w:vAnchor="margin"/>` into docDefaults (corpus
 * R480-D18): Word lays its 169 paragraphs as text over 8 pages; drawn as one
 * stacked frame they took 2.
 *
 * `window.__docsWordFramePositionOff = true` takes every framePr as a frame
 * again (A/B).
 */
export interface WordFramePositionProps {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  hRule?: string;
  hAnchor?: string;
  vAnchor?: string;
  xAlign?: string;
  yAlign?: string;
  wrap?: string;
}

function offZero(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

export function wordPositionsFrame(frame: WordFramePositionProps): boolean {
  if (offZero(frame.w)) return true;
  if (offZero(frame.h) && frame.hRule !== "auto") return true;
  if (frame.xAlign !== undefined ? frame.xAlign !== "left" : offZero(frame.x)) return true;
  if (frame.yAlign !== undefined ? frame.yAlign !== "inline" : offZero(frame.y)) return true;
  if (frame.hAnchor === "margin" || frame.hAnchor === "page") return true;
  if (frame.vAnchor === "text") return true;
  return frame.wrap !== undefined && frame.wrap !== "auto";
}

/** The frame as Word lays it out: the frame itself when Word moves or sizes
 * the paragraph by it, null when the paragraph stays in the text. */
export function wordPositionedFrame<T extends WordFramePositionProps>(frame: T | null | undefined): T | null {
  if (!frame) return null;
  const off = typeof window !== "undefined" && (window as Window & { __docsWordFramePositionOff?: boolean }).__docsWordFramePositionOff === true;
  return off || wordPositionsFrame(frame) ? frame : null;
}
