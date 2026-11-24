/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { noteBodyLineMetrics } from "./blockSplitting";
import { unequalColumnCount } from "./unequalColumnProjection";
























const TEXT_BLOCK = "p, h1, h2, h3, h4, h5, h6";
const LINE_OWNER =
  ".document-word-linebox, .document-word-line-fraction, .document-auto-linebox";

function readMultiplier(block: HTMLElement): number {
  const authored = block.getAttribute("data-line-height");
  const raw =
    authored != null && authored !== ""
      ? authored
      : getComputedStyle(block).getPropertyValue("--doc-default-line-height");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 1 && /^\s*\d*\.?\d+\s*$/.test(raw)
    ? value
    : 0;
}

const NOTE_LIST = ".mrnote-footnote-list";
const NOTE_ENTRY = ".mrnote-footnote-list__entry";
const NOTE_BODY = ".mrnote-footnote-list__bodytext";

/**
 * A note list is cut by its planner with Word's rule applied to the note
 * body's row pitch (`noteBodyRowsThatFit`): the last kept row may hang its
 * Auto leading, `pitch - size`, below the page bottom. The fragment the cut
 * produces must pass the page-bottom check by the same arithmetic, or the
 * ledger alternates between the cut and its rejection.
 */
function noteListTrailingCreditPx(list: HTMLElement): number {
  const entries = Array.from(list.querySelectorAll<HTMLElement>(NOTE_ENTRY)).filter(
    (entry) => entry.dataset.noteMirror !== "true" && entry.getClientRects().length > 0,
  );
  const body = entries.at(-1)?.querySelector<HTMLElement>(NOTE_BODY) ?? null;
  return body ? noteBodyLineMetrics(body).creditPx : 0;
}

/** Extra Auto leading below the last rendered line of `block`, in CSS px. */
export function trailingAutoLeadingCreditPx(block: Element | null | undefined): number {
  const win = block?.ownerDocument?.defaultView;
  if (!win || !(block instanceof win.HTMLElement)) return 0;
  const noteList = block.matches(NOTE_LIST) ? block : block.querySelector<HTMLElement>(NOTE_LIST);
  if (noteList && !block.querySelector(TEXT_BLOCK)) return noteListTrailingCreditPx(noteList);
  const last = block.matches(TEXT_BLOCK)
    ? block
    : Array.from(block.querySelectorAll<HTMLElement>(TEXT_BLOCK)).at(-1) ?? null;
  if (!last) return 0;
  // Table rows and exact/atLeast rules are not covered by the controls.
  const table = last.closest("table");
  if (table && block.contains(table)) return 0;
  // An "at least" line on the grid whose floor leaves it one slot is the
  // slot's, its text centred by its own single line (gridFootCreditPx).
  if (atLeastOneSlotGridLine(last)) return gridFootCreditPx(last, Number.parseFloat(getComputedStyle(last).lineHeight));
  if (last.hasAttribute("data-line-height-pt") || last.hasAttribute("data-line-height-rule")) return 0;
  // Word 文档网格 (`<w:docGrid w:type="lines">`): every line's advance IS a whole
  // grid slot, so there is no Auto leading hanging below the last line for the
  // page edge to absorb. A line of several slots is its text centred in them:
  // the room under the text may cross the edge (gridFootCreditPx). A block
  // that opted out of the grid keeps the Auto rule.
  if (
    last.closest('[data-doc-grid="lines"]') &&
    last.getAttribute("data-snap-to-grid") !== "false"
  ) {
    return gridFootCreditPx(last, Number.parseFloat(getComputedStyle(last).lineHeight));
  }
  const multiplier = readMultiplier(last);
  if (!(multiplier > 1)) return 0;
  const candidates: number[] = [];
  const owners = Array.from(last.querySelectorAll<HTMLElement>(LINE_OWNER));
  let lastTop = Number.NEGATIVE_INFINITY;
  const measured: Array<{ top: number; line: number }> = [];
  for (const owner of owners) {
    const rect = Array.from(owner.getClientRects()).filter((box) => box.height > 0).at(-1);
    const line = Number.parseFloat(getComputedStyle(owner).lineHeight);
    if (!rect || !Number.isFinite(line) || !(line > 0)) continue;
    measured.push({ top: rect.top, line });
    lastTop = Math.max(lastTop, rect.top);
  }
  for (const entry of measured) if (entry.top >= lastTop - 0.5) candidates.push(entry.line);
  // The paragraph's own line height stands in only when no run on the last line
  // owns a box. Beside taller runs it says nothing of the line, and it is not
  // there at all once a paragraph's piece is drawn by its runs alone: the same
  // last line read 13.79 px whole and 18.38 px as a tail, so a page held the
  // paragraph as a tail and cut it whole, for good (corpus R283-D05, its page 7).
  if (!candidates.length) {
    const paragraphLine = Number.parseFloat(getComputedStyle(last).lineHeight);
    if (Number.isFinite(paragraphLine) && paragraphLine > 0) candidates.push(paragraphLine);
  }
  if (!candidates.length) return 0;
  // The smallest owned line box on the last line is the conservative bound
  // for mixed runs; homogeneous lines (the usual case) are exact.
  const line = Math.min(...candidates);
  const credit = Math.max(0, line * (1 - 1 / multiplier));
  // A line holding an in-line picture hangs only the leading below the
  // picture: the picture itself must fit (Word 16.86, t-picfoot: a picture
  // whose bottom is the body's foot stays, one 2 pt lower takes its line to
  // the next page, at single and 1.1 alike; corpus R282-D02: a 342 pt map
  // 0.5 pt over the foot stayed on page 1, Word sets it on page 2).
  const picture = lastLinePictureBottom(last);
  return picture === null ? credit : Math.min(credit, Math.max(0, last.getBoundingClientRect().bottom - picture));
}

/**
 * The Auto leading below a paragraph's last line the page edge may take,
 * read with no layout (a page the ledger plans from the text engine): its
 * own line-height under its multiple, as `trailingAutoLeadingCreditPx` reads
 * it without the lines' boxes. A run of a smaller line on the last line
 * would give less, so this reads a block with no inline picture only.
 */
export function trailingAutoLeadingCreditUnlaidPx(block: HTMLElement): number {
  if (!block.matches(TEXT_BLOCK) || block.querySelector(INLINE_PICTURE)) return 0;
  if (atLeastOneSlotGridLine(block)) return gridFootCreditPx(block, Number.parseFloat(getComputedStyle(block).lineHeight));
  if (block.hasAttribute("data-line-height-pt") || block.hasAttribute("data-line-height-rule")) return 0;
  if (block.closest('[data-doc-grid="lines"]') && block.getAttribute("data-snap-to-grid") !== "false") {
    return gridFootCreditPx(block, Number.parseFloat(getComputedStyle(block).lineHeight));
  }
  const multiplier = readMultiplier(block);
  if (!(multiplier > 1)) return 0;
  const line = Number.parseFloat(getComputedStyle(block).lineHeight);
  return Number.isFinite(line) && line > 0 ? Math.max(0, line * (1 - 1 / multiplier)) : 0;
}

const INLINE_PICTURE = '[data-inline-picture="true"], img[data-inline-picture]';

/** `window.__docsGridFootCreditOff = true` asks the older reading (no grid
 * line hangs anything past the foot), for an A/B of one build. */
function gridFootCreditOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsGridFootCreditOff?: boolean }).__docsGridFootCreditOff === true;
}

/**
 * The room under a grid line's text the page's foot may take. Windows Word
 * centres a line's text in the whole slots it takes and keeps the line on its
 * page when the text fits: the padding under it may cross the bottom margin
 * (docx-look/probes/gridfit, 15.6 pt grid, A4 with 72 pt margins: a 14 pt
 * bold heading, two slots over a 16.1 pt single line, stays on page 1 4.1 pt
 * past the foot (gf43), goes on 19.7 pt past (gf44); a 24 pt one, 1.8 pt of
 * padding, goes on 4.1 pt past (gh43); a single 12 pt line goes on 4.1 pt
 * past (gs45)). Corpus R393-D04's "1. Introduction" ended page 1 in Word
 * and opened page 2 here. Read from a block whose every line is the same
 * whole slots of one single line (`data-docs-word-grid-natural`, written by
 * DocumentPageSetup); any other grid block keeps the strict fit. One slot is
 * no different (probes/vsp8, 16.3 pt grid: 10 pt Palatino Linotype, its
 * single line 13.49 pt, stays 1.38 pt past the foot, goes on 1.68 pt past,
 * Auto and at least 14 pt alike): such a block records its pitch too
 * (`data-docs-word-grid-pitch`), and is credited while its line is that pitch.
 * `window.__docsGridOneSlotFootOff = true` records none (A/B).
 */
function gridFootCreditPx(block: HTMLElement, lineHeightPx: number): number {
  if (gridFootCreditOff() || block.querySelector(INLINE_PICTURE)) return 0;
  const natural = Number.parseFloat(block.getAttribute("data-docs-word-grid-natural") ?? "");
  if (!(natural > 0) || !(lineHeightPx > natural)) return 0;
  // A one-slot block's (no slots recorded): only while its line is that slot.
  const pitch = Number.parseFloat(block.getAttribute("data-docs-word-grid-pitch") ?? "");
  if (!block.hasAttribute("data-docs-word-grid-block-slots") && !(pitch > 0 && Math.abs(lineHeightPx - pitch) <= 0.5)) return 0;
  return (lineHeightPx - natural) / 2;
}

/** A grid-snapped "at least" block DocumentPageSetup recorded a one-slot
 * single line for (`data-docs-word-grid-natural` without slots): Word sets
 * its text in the slot by that line, the floor aside (probes/vsp8). */
function atLeastOneSlotGridLine(block: HTMLElement): boolean {
  return block.getAttribute("data-line-height-rule") === "atLeast" &&
    block.hasAttribute("data-docs-word-grid-natural") &&
    !block.hasAttribute("data-docs-word-grid-block-slots") &&
    block.closest('[data-doc-grid="lines"]') !== null &&
    block.getAttribute("data-snap-to-grid") !== "false";
}

/** The bottom of the lowest in-line picture on `block`'s last line, or null. */
function lastLinePictureBottom(block: HTMLElement): number | null {
  const pictures = Array.from(block.querySelectorAll<HTMLElement>(INLINE_PICTURE));
  if (!pictures.length) return null;
  const blockBottom = block.getBoundingClientRect().bottom;
  let lowest: number | null = null;
  for (const picture of pictures) {
    const rect = picture.getBoundingClientRect();
    if (!(rect.height > 0)) continue;
    // On the last line: its bottom within that line of the block's foot.
    if (rect.bottom < blockBottom - Math.max(rect.height, 1) - 1) continue;
    lowest = lowest === null ? rect.bottom : Math.max(lowest, rect.bottom);
  }
  return lowest;
}

/** Credit of the block that ends a single-column sheet; 0 for column layouts. */
export function sheetTrailingAutoLeadingCreditPx(sheet: HTMLElement | null | undefined): number {
  if (!sheet) return 0;
  const unequal = unequalColumnCount(sheet);
  if (unequal !== null && unequal > 1) return 0;
  const columns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
  if (Number.isFinite(columns) && columns > 1) return 0;
  let last: Element | null = null;
  const shown: Element[] = [];
  for (const child of Array.from(sheet.children)) {
    if (child.matches(".ProseMirror-widget")) continue;
    if (child instanceof (sheet.ownerDocument.defaultView?.HTMLElement ?? HTMLElement) &&
        child.offsetHeight === 0 && getComputedStyle(child).display === "none") continue;
    last = child;
    shown.push(child);
  }
  const under = lineUnderOpeningPicturesPx(shown);
  return under > 0 ? under : trailingAutoLeadingCreditPx(last);
}

/**
 * A sheet that opens with Top and Bottom pictures and holds nothing after
 * them but one line of a paragraph: Word keeps that line on the page under
 * the pictures it is drawn from, past the bottom margin (pc6/probes/fp,
 * the ledger's `lineUnderObjects`). The whole line is no spill.
 */
function lineUnderOpeningPicturesPx(shown: readonly Element[]): number {
  if (shown.length < 2 || typeof window === "undefined") return 0;
  if ((window as Window & { __docsLineUnderPageObjectsOff?: boolean }).__docsLineUnderPageObjectsOff === true) return 0;
  const band = '[data-float-mode="band"][data-float-anchor]';
  const line = shown[shown.length - 1];
  if (!(line instanceof HTMLElement) || !line.matches(TEXT_BLOCK)) return 0;
  for (const child of shown.slice(0, -1)) {
    if (!(child.matches(band) || child.querySelector(band)) || (child.textContent ?? "").trim()) return 0;
  }
  const style = getComputedStyle(line);
  const height = line.offsetHeight;
  const pitch = Number.parseFloat(style.lineHeight);
  const linePx = Number.isFinite(pitch) && pitch > 0 ? pitch : (Number.parseFloat(style.fontSize) || 16) * 1.3;
  if (!(height > 0) || height > linePx * 1.5) return 0;
  const lineCredit = height + Math.max(0, Number.parseFloat(style.marginBottom) || 0);
  // Pictures taller than the body put the line further past the foot: the
  // whole of it below the foot is no spill (pc6/probes/fp fp-c, the
  // ledger's line under a taller-than-the-page picture).
  const sheet = line.parentElement;
  if (!sheet || (window as Window & { __docsLineUnderTallPictureOff?: boolean }).__docsLineUnderTallPictureOff === true) {
    return lineCredit;
  }
  const sheetRect = sheet.getBoundingClientRect();
  const scaleY = sheet.offsetHeight > 0 ? sheetRect.height / sheet.offsetHeight : 1;
  const footPx = (sheetRect.bottom - sheetRect.top) / (scaleY || 1) -
    (Number.parseFloat(getComputedStyle(sheet).paddingBottom) || 0);
  const lineTopPx = (line.getBoundingClientRect().top - sheetRect.top) / (scaleY || 1);
  return lineTopPx > footPx ? lineCredit + (lineTopPx - footPx) : lineCredit;
}
