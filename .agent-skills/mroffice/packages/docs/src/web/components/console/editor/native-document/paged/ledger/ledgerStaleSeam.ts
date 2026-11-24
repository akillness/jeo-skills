/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { wordKeepsJustifiedWord, wordTrailingPunctuationLength } from "@mrnote/core/web/lib/text-engine/docs-word-rules.ts";

/** `window.__docsStretchedSeamOff = true` asks the older reading (a head's
 * last row has only the room it leaves at its edge), for an A/B of one build. */
function justifiedSlackOff(win: Window | null): boolean {
  return (win as (Window & { __docsStretchedSeamOff?: boolean }) | null)?.__docsStretchedSeamOff === true;
}

/**
 * A seam left inside a row: the head's last row ends short of the tail's
 * first word, which it now has room for (pageLedgerExtension markStaleSeams
 * for page seams).
 */
/**
 * Whether the head's last row has room for the tail's first word: past the
 * space the row already ends with (it hangs, and its box is the row's), or a
 * space and the word. In a justified paragraph Word narrows the row's spaces
 * to keep a word that overflows by little (`narrows`: compatibility mode 15,
 * wordKeepsJustifiedWord): R283-D05's "They concluded" stood 3.5 px over its
 * edge on one open, and on another "concluded" opened page 3 and the seam,
 * a space-width short of "room", was never re-cut.
 */
export function headRowTakesTailWord(headDom: HTMLElement, tailDom: HTMLElement, narrows = false): boolean {
  const headText = headDom.textContent ?? "";
  const tailText = tailDom.textContent ?? "";
  // Cut inside a word (a hyphenated break): the joined row is not read here.
  if (!/\s$/.test(headText) && !/^\s/.test(tailText)) return false;
  // A row a line break ends takes nothing after it, whatever room it leaves
  // (corpus R280-D13: a search string of short lines, each ended by a
  // w:br; every pass read the head's last row as stale, cut before it, and
  // the head lost a row a pass until four stood on a page Word fills).
  if (/[\n\u2028\u000b][ \t]*$/.test(headText) || /^[ \t]*[\n\u2028\u000b]/.test(tailText)) return false;
  if (lastInlineIsBreak(headDom, "last") || lastInlineIsBreak(tailDom, "first")) return false;
  const style = getComputedStyle(headDom);
  if (style.direction === "rtl" || /^(vertical|sideways)/.test(style.writingMode)) return false;
  const doc = headDom.ownerDocument;
  const box = headDom.getBoundingClientRect();
  if (!(box.width > 0) || !(headDom.offsetWidth > 0)) return false;
  const scale = box.width / headDom.offsetWidth;
  const range = doc.createRange();
  range.selectNodeContents(headDom);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return false;
  const lastTop = Math.max(...rects.map((rect) => rect.top));
  const lastRight = Math.max(...rects.filter((rect) => Math.abs(rect.top - lastTop) < 2 * scale).map((rect) => rect.right));
  const contentRight = box.right - ((Number.parseFloat(style.paddingRight) || 0) + (Number.parseFloat(style.borderRightWidth) || 0)) * scale;
  const edgeRoom = contentRight - lastRight;
  // A head's last row is set justified (a cut paragraph's rows run to the
  // edge, `text-align-last: justify`): its room is what justification added
  // to its spaces, not what it leaves at the edge (corpus R425-D02: "of" ended
  // a column's last row stretched to the edge, "25 million." was never taken
  // back, and the column broke mid-row where Word sets one row).
  const stretched = !justifiedSlackOff(doc.defaultView) && edgeRoom < 1 * scale;
  if (!(edgeRoom > 0) && !stretched) return false;
  // The tail's first word, as drawn.
  const walker = doc.createTreeWalker(tailDom, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const data = (node as Text).data;
    if (/^\s*$/.test(data)) continue;
    const match = /^(\s*)(\S+)/.exec(data);
    if (!match) return false;
    const word = doc.createRange();
    word.setStart(node, match[1].length);
    word.setEnd(node, match[1].length + match[2].length);
    const wordRects = Array.from(word.getClientRects()).filter((rect) => rect.width > 0);
    // A word the tail wraps over two rows of its own is no word a row takes.
    if (wordRects.length !== 1) return false;
    const canvas = doc.createElement("canvas").getContext("2d");
    const parent = (node as Text).parentElement;
    if (!canvas || !parent) return false;
    const tailStyle = getComputedStyle(parent);
    canvas.font = `${tailStyle.fontStyle} ${tailStyle.fontWeight} ${tailStyle.fontSize} ${tailStyle.fontFamily}`;
    const space = canvas.measureText(" ").width * scale;
    const wordPx = wordRects[0].width;
    const row = lastRowSpaces(headDom, lastTop, scale);
    const slack = stretched ? row.innerWidths.reduce((sum, width) => sum + Math.max(0, width - space), 0) : 0;
    const room = Math.max(0, edgeRoom) + slack;
    if (!(room > 0)) return false;
    const needed = wordPx + (row.endsWithSpace ? 0 : space);
    if (room >= needed + 0.25 * scale) return true;
    if (!narrows || style.textAlign !== "justify" || !(row.spaces + (row.endsWithSpace ? 0 : 1) > 0)) return false;
    const trailing = wordTrailingPunctuationLength(match[2]);
    const trailingPx = trailing > 0 ? canvas.measureText(match[2].slice(-trailing)).width * scale : 0;
    const fontPx = (Number.parseFloat(tailStyle.fontSize) || 0) * scale;
    return wordKeepsJustifiedWord(needed - room, row.spaces + (row.endsWithSpace ? 0 : 1), fontPx, space, wordPx, trailingPx);
  }
  return false;
}

/** Whether the block's last (or first) inline content is a line break
 * element: a `<br>` that is no ProseMirror trailing placeholder, past text
 * of spaces and tabs only and the editor's own zero-size widgets. */
function lastInlineIsBreak(dom: HTMLElement, end: "first" | "last"): boolean {
  const walker = dom.ownerDocument.createTreeWalker(dom, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  if (end === "last") nodes.reverse();
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (/^[ \t]*$/.test((node as Text).data)) continue;
      return false;
    }
    const element = node as HTMLElement;
    if (element.localName === "br") {
      if (element.classList.contains("ProseMirror-trailingBreak")) continue;
      return true;
    }
    if (element.localName === "img") {
      if (element.classList.contains("ProseMirror-separator")) continue;
      return false;
    }
  }
  return false;
}

/** The spaces on the head's last row (the one it ends with among them), and
 * whether it ends with one. Read back from the row's end. */
function lastRowSpaces(headDom: HTMLElement, lastTop: number, scale: number): { spaces: number; endsWithSpace: boolean; innerWidths: number[] } {
  const doc = headDom.ownerDocument;
  const texts: Text[] = [];
  const walker = doc.createTreeWalker(headDom, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  const range = doc.createRange();
  let spaces = 0;
  let endsWithSpace = false;
  let seenInk = false;
  // The drawn widths of the row's spaces between its words (not the ones it
  // ends with, which hang).
  const innerWidths: number[] = [];
  for (let t = texts.length - 1; t >= 0; t -= 1) {
    const data = texts[t].data;
    for (let i = data.length - 1; i >= 0; i -= 1) {
      range.setStart(texts[t], i);
      range.setEnd(texts[t], i + 1);
      const box = Array.from(range.getClientRects()).find((rect) => rect.width > 0 || rect.height > 0);
      if (!box) continue;
      if (Math.abs(box.top - lastTop) >= 2 * scale) return { spaces, endsWithSpace, innerWidths };
      if (/\s/.test(data[i])) {
        spaces += 1;
        if (!seenInk && box.width > 0) endsWithSpace = true;
        if (seenInk) innerWidths.push(box.width);
      } else {
        seenInk = true;
      }
    }
  }
  return { spaces, endsWithSpace, innerWidths };
}


/**
 * A row cut across pages whose cell lines have since left the cut: a cell's
 * head paragraph ends on a row short of the first word of its tail on the
 * next page, which that row now has room for (the lines were broken before a
 * face, a column width or the cell's own spacing settled, and the cut stood
 * where it was made). Word breaks a cell's lines first and the row after a
 * line; here which earlier line breaking the cut was made under decided the
 * page (corpus R284-D30: "③ " alone at the foot of page 8 with
 * "약간 동의하지 않는다" opening page 9, on one open in three; "④ 다소 " /
 * "관심이 있다" on page 11 on another). The answer is how far from the head
 * piece's top (layout px) its highest such row starts: the head is cut again
 * above it and the next plan takes back from the joined tail the lines that
 * fit. Null when no cell of the cut row has one.
 */
export function staleRowSeamKeepPx(headDom: HTMLElement, tailDom: HTMLElement, narrows: boolean, scaleY: number): number | null {
  const headTable = headDom.localName === "table" ? headDom : headDom.querySelector("table");
  const tailTable = tailDom.localName === "table" ? tailDom : tailDom.querySelector("table");
  if (!headTable || !tailTable || !(scaleY > 0)) return null;
  const ownRows = (table: Element) => Array.from((table as HTMLTableElement).rows ?? []).filter((row) => row.closest("table") === table);
  const headRow = ownRows(headTable).filter((row) => row.getAttribute("data-page-table-row-continues") === "true").pop();
  const tailRow = ownRows(tailTable).find((row) => row.getAttribute("data-page-table-row-continuation") === "true");
  if (!headRow || !tailRow) return null;
  const column = (cell: Element, index: number) => cell.getAttribute("data-page-table-source-cell-col") ?? `#${index}`;
  const tailCells = new Map(Array.from(tailRow.children).map((cell, index) => [column(cell, index), cell] as const));
  const top = headDom.getBoundingClientRect().top;
  let keep: number | null = null;
  Array.from(headRow.children).forEach((cell, index) => {
    const tailCell = tailCells.get(column(cell, index));
    if (!tailCell) return;
    const own = (root: Element, attr: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(`[${attr}="true"]`)).filter((block) => block.closest("td, th") === root);
    const head = own(cell, "data-page-table-block-continues").pop();
    const tail = own(tailCell, "data-page-table-block-continuation")[0];
    if (!head || !tail || !/^(p|h[1-6])$/.test(head.localName)) return;
    if (!headRowTakesTailWord(head, tail, narrows)) return;
    const range = head.ownerDocument.createRange();
    range.selectNodeContents(head);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length < 2) return;
    // The row the head ends on; a head of that one row is no seam to move.
    const lastTop = Math.min(...rects.filter((rect) => rect.top >= Math.max(...rects.map((r) => r.top)) - 2).map((rect) => rect.top));
    if (!(lastTop > Math.min(...rects.map((rect) => rect.top)) + 1)) return;
    const px = (lastTop - top) / scaleY;
    if (px > 0) keep = keep === null ? px : Math.min(keep, px);
  });
  return keep;
}
