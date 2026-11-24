"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { paginationLayoutScale } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationGeometry.ts";
import {
  documentBorderLineIsVisible,
  documentBorderLineWidthPx,
  normalizeDocumentParagraphBorders,
} from "@mrnote/core/web/lib/document-borders.ts";
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { wordPositionedFrame } from "@mrnote/core/web/components/console/editor/native-document/wordFramePosition.ts";

/**
 * Word's text frames (`w:framePr`, not a drop cap): a paragraph Word lifts out
 * of the text and sets at a stated size and place, the rest of the text going
 * round it (`around`/`auto`) or past it (`notBeside`). The import hands the
 * effective frame -- the paragraph's own `w:framePr` over its style chain's,
 * attribute by attribute -- in the paragraph's source receipt
 * (`source.frame`, twips and Word's tokens); the page draws it, the package
 * keeps the elements.
 *
 * Measured in Word 16.86 (eight variants and the corpus):
 * - anchors not stated anywhere are the margins, on both axes;
 * - `vAnchor="text"`/`hAnchor="text"` place the frame at its own paragraph,
 *   `w:y`/`w:x` below and right of it;
 * - `w:yAlign` places the frame only on an anchor some level states (an
 *   inherited one included); otherwise `w:y` does;
 * - a stated height without `w:hRule` is a minimum, `hRule="auto"` ignores it;
 * - text goes round the frame on one side; `notBeside` keeps it off the
 *   frame's lines;
 * - consecutive paragraphs with the same frame are one frame, stacked.
 *
 * The frame is drawn as a float (so the text goes round it) whose margins put
 * it where Word does; a page- or margin-anchored frame's top is measured
 * against where its paragraph stands and kept in this plugin's state, so the
 * offsets survive every redraw. `yAlign="inline"` frames stay in the text.
 */
export const WORD_FRAME_ATTR = "data-word-frame";

interface WordFrame {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  hSpace?: number;
  vSpace?: number;
  hRule?: string;
  hAnchor?: string;
  vAnchor?: string;
  xAlign?: string;
  yAlign?: string;
  wrap?: string;
}

interface FrameOffsets {
  readonly top: number;
  readonly left: number;
  /** A frame at its own paragraph: the top margin that puts it `w:y` below
   * the paragraph the frame is drawn from (the one after it), measured,
   * and for `notBeside` the margin that widens it across the column. */
  readonly drop?: number;
  readonly fill?: number;
  /** On a sheet the unequal-column projection lays out (every block placed
   * in its track): the frame is set at its page point instead, out of the
   * flow, `top`/`left` in the sheet's coordinates, `width` its text box's
   * when it states none (the column it is drawn from). */
  readonly projected?: boolean;
  readonly width?: number;
}

interface FramesState {
  readonly offsets: ReadonlyMap<string, FrameOffsets>;
  readonly decorations: DecorationSet;
}

const wordTextFramesKey = new PluginKey<FramesState>("documentWordTextFrames");
const TWIPS_PER_PX = 15;

function readFrame(node: ProseMirrorNode): WordFrame | null {
  const source = node.attrs?.source as { adapter?: unknown; frame?: unknown } | null | undefined;
  if (!node.isTextblock || source?.adapter !== "docx" || !source.frame || typeof source.frame !== "object") return null;
  const frame = source.frame as WordFrame;
  if (frame.yAlign === "inline") return null;
  // A framePr that neither moves nor sizes the paragraph is no frame in Word
  // (wordFramePosition.ts; corpus R480-D18's docDefaults frame).
  return wordPositionedFrame(frame);
}

const HOLDS_FRAME = new SheetFact((node) => readFrame(node) !== null);

function frameKey(frame: WordFrame): string {
  return JSON.stringify(Object.keys(frame).sort().map((key) => [key, frame[key as keyof WordFrame]]));
}

function blockKey(node: ProseMirrorNode, pos: number): string {
  const id = node.attrs?.block_id ?? node.attrs?.blockId;
  return typeof id === "string" && id ? id : `@${pos}`;
}

function px(twips: number | undefined): number {
  return typeof twips === "number" && Number.isFinite(twips) ? twips / TWIPS_PER_PX : 0;
}

/** Whether the frame's top is placed on the page (measured), not at its own
 * paragraph. */
function pagePlaced(frame: WordFrame): boolean {
  return (frame.vAnchor ?? "margin") !== "text";
}

function floatSide(frame: WordFrame): "left" | "right" {
  return frame.xAlign === "right" || frame.xAlign === "outside" ? "right" : "left";
}

interface FrameGroupMember {
  node: ProseMirrorNode;
  pos: number;
  frame: WordFrame;
  first: boolean;
  last: boolean;
  groupKey: string;
}

function frameGroups(doc: ProseMirrorNode): FrameGroupMember[] {
  const members: FrameGroupMember[] = [];
  doc.forEach((page, pageOffset) => {
    if (page.type.name !== PAGE_BLOCK_NODE || !HOLDS_FRAME.sheet(page)) return;
    let previous: FrameGroupMember | null = null;
    page.forEach((child, offset) => {
      const pos = pageOffset + 1 + offset;
      const frame = readFrame(child);
      if (!frame) {
        if (previous) previous.last = true;
        previous = null;
        return;
      }
      const key = frameKey(frame);
      const continues = previous !== null && previous.groupKey === key;
      if (previous && !continues) previous.last = true;
      const member: FrameGroupMember = {
        node: child,
        pos,
        frame,
        first: !continues,
        last: false,
        groupKey: continues ? previous!.groupKey : key,
      };
      members.push(member);
      previous = member;
    });
    if (previous) (previous as FrameGroupMember).last = true;
  });
  return members;
}

function buildDecorations(doc: ProseMirrorNode, offsets: ReadonlyMap<string, FrameOffsets>): DecorationSet {
  const decorations: Decoration[] = [];
  for (const member of frameGroups(doc)) {
    const { frame } = member;
    const side = floatSide(frame);
    const width = px(frame.w);
    const measured = offsets.get(blockKey(member.node, member.pos));
    const style: string[] = [];
    // The frame's width is its text's (Word draws a border and its spacing
    // outside it).
    if (width > 0) style.push(`width:${width}px`, "max-width:none", "box-sizing:content-box");
    if (!pagePlaced(frame) && measured?.projected) {
      // A frame on a page of projected columns: the projection places every
      // block in its track, a frame among them squeezed into the column it
      // fell in (corpus R78-D30: a 74-letter frame one letter wide down the
      // third column, running onto a second page). Word sets it at its page
      // point, out of the text; it is drawn there and costs the flow nothing.
      // (Inline !important outranks the projection's slot rules.)
      style.push("position:absolute !important", "z-index:1", "margin:0 !important", "float:none");
      style.push(`top:${measured.top}px !important`, `left:${measured.left}px !important`);
      if (!(width > 0) && measured.width && measured.width > 0) style.push(`width:${measured.width}px !important`, "box-sizing:content-box", "max-width:none");
      else if (width > 0) style.push(`width:${width}px !important`);
    } else if (pagePlaced(frame)) {
      // On the margin or the page: Word places it there whatever text runs
      // above; the layout pass reads where (top/left on the sheet) and the
      // text is left as it flows.
      style.push("position:absolute", "z-index:1", "margin:0");
      style.push(`top:${measured?.top ?? 0}px`, `left:${measured?.left ?? 0}px`);
      if (!measured) style.push("visibility:hidden");
    } else {
      // Word sets a frame at its own paragraph out of the text: it takes no
      // room in the flow, stands `w:y` below where the paragraph after it
      // starts, and the lines above it keep the full width (Word 16.86,
      // corpus R77-D16 / tdf133924: an "around" frame 71 pt and a
      // "notBeside" one 273 pt below the body's first line; the body starts
      // at the top, goes round the first and resumes below the second). A
      // float whose shape leaves out its top margin does that; a notBeside
      // frame is a float as wide as the column, so no text stands beside it.
      const notBeside = frame.wrap === "notBeside";
      const drop = member.first ? Math.max(0, measured?.drop ?? px(frame.y)) : 0;
      if (notBeside) style.push("float:left", "clear:none");
      else style.push(`float:${side}`, `clear:${side}`);
      style.push(`margin-top:${drop}px`);
      if (drop > 0) style.push(`shape-outside:inset(${drop}px 0px 0px 0px)`);
      const inline = measured?.left ?? (frame.hAnchor === "page" ? 0 : px(frame.x));
      if (notBeside) style.push(`margin-left:${inline}px`, `margin-right:${Math.max(0, measured?.fill ?? 0)}px`);
      else if (side === "left") style.push(`margin-left:${inline}px`, `margin-right:${px(frame.hSpace)}px`);
      else style.push(`margin-right:${inline}px`, `margin-left:${px(frame.hSpace)}px`);
      if (member.last) style.push(`margin-bottom:${px(frame.vSpace)}px`);
    }
    // One paragraph is the whole frame: its height is the frame's, border
    // and border spacing included (Word 16.86, frameh probes: an exact or
    // at-least 113.4pt frame draws a 113.5pt box whether its border is
    // 0.75pt or 3pt, its spacing 0, 4 or 12pt, or it has none; the text
    // moves down by the spacing). Its width is the text's, as above.
    if (member.first && member.last && frame.h && frame.h > 0 && frame.hRule !== "auto") {
      const height = Math.max(0, px(frame.h) - frameVerticalChromePx(member.node));
      style.push(frame.hRule === "exact" ? `height:${height}px` : `min-height:${height}px`);
      if (frame.hRule === "exact") style.push("overflow:hidden");
    }
    decorations.push(
      Decoration.node(member.pos, member.pos + member.node.nodeSize, {
        [WORD_FRAME_ATTR]: member.first ? "head" : "member",
        style: style.join(";"),
        ...(!pagePlaced(frame) && measured?.projected ? { "data-float-mode": "overlay" } : {}),
      }),
    );
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** The room the frame paragraph's top and bottom borders take, as they are
 * drawn (documentParagraphBordersHtmlAttributes: the line's CSS width and its
 * spacing as padding). */
function frameVerticalChromePx(node: ProseMirrorNode): number {
  const borders = normalizeDocumentParagraphBorders(node.attrs?.paragraphBorders);
  let chrome = 0;
  for (const edge of ["top", "bottom"] as const) {
    const line = borders?.[edge];
    if (!line || !documentBorderLineIsVisible(line)) continue;
    chrome += documentBorderLineWidthPx(line) + ptToPx(line.spacePt ?? 0);
  }
  return chrome;
}

function sameOffsets(a: ReadonlyMap<string, FrameOffsets>, b: ReadonlyMap<string, FrameOffsets>): boolean {
  if (a.size !== b.size) return false;
  const near = (x: number | undefined, y: number | undefined) =>
    x === undefined || y === undefined ? x === y : Math.abs(x - y) <= 0.5;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (!other || !near(other.top, value.top) || !near(other.left, value.left) ||
        !near(other.drop, value.drop) || !near(other.fill, value.fill) ||
        !near(other.width, value.width) || other.projected !== value.projected) return false;
  }
  return true;
}

function cssPixels(value: string): number {
  return Number.parseFloat(value) || 0;
}

/** Where each frame stands, read off the painted pages: a page- or
 * margin-placed frame's top/left in its containing block, a frame at its
 * own paragraph its side margin. */
function measureOffsets(view: EditorView, state: EditorState): Map<string, FrameOffsets> | null {
  const current = wordTextFramesKey.getState(state)?.offsets ?? new Map();
  const next = new Map<string, FrameOffsets>();
  const members = frameGroups(state.doc);
  for (let index = 0; index < members.length; index += 1) {
    const head = members[index];
    if (!head.first) continue;
    const group = [head];
    while (index + 1 < members.length && !members[index + 1].first) group.push(members[++index]);
    const elements = group.map((member) => view.nodeDOM(member.pos));
    if (!elements.every((element): element is HTMLElement => element instanceof HTMLElement)) continue;
    const first = elements[0] as HTMLElement;
    const sheet = first.closest<HTMLElement>("article[data-page-sheet]");
    if (!sheet) continue;
    const { frame } = head;
    const scale = paginationLayoutScale(first);
    const sheetStyle = getComputedStyle(sheet);
    const pageWidth = sheet.offsetWidth;
    const pageHeight = cssPixels(sheetStyle.minHeight) || sheet.offsetHeight;
    const marginLeft = cssPixels(sheetStyle.paddingLeft);
    const marginRight = cssPixels(sheetStyle.paddingRight);
    const marginTop = cssPixels(sheetStyle.paddingTop);
    const marginBottom = cssPixels(sheetStyle.paddingBottom);
    const style = getComputedStyle(first);
    // Word places the frame's text; its border and the border's spacing
    // stand outside it.
    const insetLeft = cssPixels(style.borderLeftWidth) + cssPixels(style.paddingLeft);
    const insetRight = cssPixels(style.borderRightWidth) + cssPixels(style.paddingRight);
    const insetTop = cssPixels(style.borderTopWidth) + cssPixels(style.paddingTop);
    const textWidth = first.offsetWidth - insetLeft - insetRight;
    const groupHeight = elements.reduce((sum, element) => sum + element.offsetHeight, 0);
    const areaLeft = frame.hAnchor === "page" ? 0 : marginLeft;
    const areaWidth = frame.hAnchor === "page" ? pageWidth : pageWidth - marginLeft - marginRight;
    let textLeft: number;
    if (frame.xAlign === "right" || frame.xAlign === "outside") textLeft = areaLeft + areaWidth - textWidth;
    else if (frame.xAlign === "center") textLeft = areaLeft + (areaWidth - textWidth) / 2;
    else if (frame.xAlign === "left" || frame.xAlign === "inside") textLeft = areaLeft;
    else textLeft = areaLeft + px(frame.x);
    // The paragraph the frame is drawn from: the first after the group.
    const lastElement = elements[elements.length - 1] as HTMLElement;
    let anchorBlock = lastElement.nextElementSibling as HTMLElement | null;
    while (anchorBlock && anchorBlock.hasAttribute(WORD_FRAME_ATTR)) anchorBlock = anchorBlock.nextElementSibling as HTMLElement | null;
    if (!pagePlaced(frame) && sheet.getAttribute("data-page-unequal-column-flow") === "true" && anchorBlock) {
      const sheetRect = sheet.getBoundingClientRect();
      const anchorRect = anchorBlock.getBoundingClientRect();
      const anchorTop = (anchorRect.top - sheetRect.top) / (scale.y || 1);
      const anchorWidth = anchorRect.width / (scale.x || 1);
      const ownWidth = frame.w && frame.w > 0 ? px(frame.w) : Math.max(1, anchorWidth - insetLeft - insetRight);
      let left: number;
      if (frame.xAlign === "right" || frame.xAlign === "outside") left = areaLeft + areaWidth - ownWidth - insetRight - insetLeft;
      else if (frame.xAlign === "center") left = areaLeft + (areaWidth - ownWidth) / 2 - insetLeft;
      else if (frame.xAlign === "left" || frame.xAlign === "inside") left = areaLeft - insetLeft;
      else left = areaLeft + px(frame.x) - insetLeft;
      let y = anchorTop + px(frame.y) - insetTop;
      group.forEach((member, at) => {
        next.set(blockKey(member.node, member.pos), {
          top: Math.round(y * 100) / 100,
          left: Math.round(left * 100) / 100,
          projected: true,
          ...(frame.w && frame.w > 0 ? {} : { width: Math.round(ownWidth * 100) / 100 }),
        });
        y += (elements[at] as HTMLElement).offsetHeight;
      });
      continue;
    }
    if (!pagePlaced(frame)) {
      const side = floatSide(frame);
      const notBeside = frame.wrap === "notBeside";
      const inline =
        side === "left" || notBeside
          ? textLeft - insetLeft - marginLeft
          : pageWidth - marginRight - (textLeft + textWidth + insetRight);
      // The paragraph the frame is drawn from: the first after the group.
      // Floats take no room in the flow, so its top is where the frame's
      // place is measured from; a float pushed below an earlier one is
      // given back the difference.
      const anchor = anchorBlock;
      const appliedDrop = cssPixels(first.style.marginTop);
      const drop = anchor && anchor.offsetParent === first.offsetParent
        ? Math.max(0, appliedDrop + anchor.offsetTop + px(frame.y) - first.offsetTop)
        : px(frame.y);
      const parent = first.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const columnWidth = parent && parentStyle
        ? parent.clientWidth - cssPixels(parentStyle.paddingLeft) - cssPixels(parentStyle.paddingRight)
        : pageWidth - marginLeft - marginRight;
      const fill = notBeside ? Math.max(0, Math.floor(columnWidth - inline - first.offsetWidth)) : 0;
      group.forEach((member, at) => next.set(blockKey(member.node, member.pos), {
        top: 0,
        left: inline,
        ...(at === 0 ? { drop: Math.round(drop * 100) / 100 } : {}),
        ...(notBeside ? { fill } : {}),
      }));
      continue;
    }
    const areaTop = frame.vAnchor === "page" ? 0 : marginTop;
    const areaHeight = frame.vAnchor === "page" ? pageHeight : pageHeight - marginTop - marginBottom;
    // yAlign places the frame only on an anchor the document states.
    let top: number;
    if (frame.vAnchor && frame.yAlign === "center") top = areaTop + (areaHeight - groupHeight) / 2;
    else if (frame.vAnchor && (frame.yAlign === "bottom" || frame.yAlign === "outside")) top = areaTop + areaHeight - groupHeight;
    else if (frame.vAnchor && (frame.yAlign === "top" || frame.yAlign === "inside")) top = areaTop;
    else top = areaTop + px(frame.y) - insetTop;
    // Sheet layout px -> the containing block's own coordinates.
    const container = (first.offsetParent as HTMLElement | null) ?? sheet;
    const sheetRect = sheet.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const dx = (containerRect.left - sheetRect.left) / (scale.x || 1) + container.clientLeft;
    const dy = (containerRect.top - sheetRect.top) / (scale.y || 1) + container.clientTop;
    let y = top - dy;
    for (let at = 0; at < group.length; at += 1) {
      next.set(blockKey(group[at].node, group[at].pos), { top: y, left: textLeft - insetLeft - dx });
      y += elements[at].offsetHeight;
    }
  }
  return sameOffsets(current, next) ? null : next;
}

const OFFSETS_META = "documentWordTextFramesOffsets";

const DocumentWordTextFrames = Extension.create({
  name: "documentWordTextFrames",

  addProseMirrorPlugins() {
    return [
      new Plugin<FramesState>({
        key: wordTextFramesKey,
        state: {
          init: (_config, state) => ({ offsets: new Map(), decorations: buildDecorations(state.doc, new Map()) }),
          apply: (tr, value, _old, state) => {
            const offsets = (tr.getMeta(OFFSETS_META) as Map<string, FrameOffsets> | undefined) ?? value.offsets;
            if (!tr.docChanged && offsets === value.offsets) return value;
            return { offsets, decorations: buildDecorations(state.doc, offsets) };
          },
        },
        props: {
          decorations: (state) => wordTextFramesKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (view) => {
          let frame = 0;
          let passes = 0;
          let timer: ReturnType<typeof setTimeout> | null = null;
          const run = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const next = measureOffsets(view, view.state);
            // A frame moved by its own margin moves the text it floats in;
            // a few passes settle it, an oscillation stops there.
            if (next && passes < 6) {
              passes += 1;
              view.dispatch(view.state.tr.setMeta(OFFSETS_META, next).setMeta("addToHistory", false));
            }
          };
          const schedule = () => {
            if (!frameGroups(view.state.doc).length) return;
            if (!frame) frame = requestAnimationFrame(run);
            if (timer) clearTimeout(timer);
            // Pagination settles after the first paint: look again once it has.
            timer = setTimeout(() => {
              passes = 0;
              if (!frame) frame = requestAnimationFrame(run);
            }, 400);
          };
          schedule();
          return {
            update: (_view, previous) => {
              if (previous.doc !== view.state.doc) {
                passes = 0;
                schedule();
              }
            },
            destroy: () => {
              if (frame) cancelAnimationFrame(frame);
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});

export default DocumentWordTextFrames;
