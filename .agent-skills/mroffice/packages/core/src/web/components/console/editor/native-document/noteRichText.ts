/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Rich note bodies (footnotes/endnotes) — DOM <-> FootnoteRichBody bridge.
 *
 * The note body editing island is a rich contenteditable host (NOT a nested
 * ProseMirror instance: nesting a second editor inside the main editor's DOM
 * fights it for selection/beforeinput). Formatting therefore lives as plain
 * semantic elements (b/i/u/s/sup/sub) produced by execCommand shortcuts, and
 * this module is the trust boundary between that free-form DOM and the
 * sanitized FootnoteRichBody store shape:
 *
 *   - serializeNoteBodyDom: whitelist WALK of the island's DOM. Only known
 *     inline flags survive; every other element contributes only its
 *     text. Block-ish boundaries (div/p/li, <br>) become paragraph breaks.
 *   - renderNoteBodyInto: rebuilds display DOM from the sanitized runs using
 *     createElement/textContent only — pasted markup can never reach
 *     innerHTML, so the island cannot smuggle live HTML into the page.
 */

import { isNoteMathRun, sanitizeNoteHighlight, sanitizeNoteHref, sanitizeNoteMathRun } from "./footnotes";
import type { FootnoteParagraphLine, FootnoteRichBody, FootnoteRun } from "./footnotes";
import { renderKatexCached } from "../extensions/lazyKatex";

const FLAG_TAGS: Record<string, keyof Omit<FootnoteRun, "text" | "math" | "mathDisplay">> = {
  B: "bold",
  STRONG: "bold",
  I: "italic",
  EM: "italic",
  U: "underline",
  S: "strike",
  STRIKE: "strike",
  DEL: "strike",
  SUP: "superscript",
  SUB: "subscript",
};

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "BLOCKQUOTE"]);

type Flags = Partial<Omit<FootnoteRun, "text" | "math" | "mathDisplay">>;

/**
 * A note formula in the island: an uneditable atom (`contenteditable=false`)
 * holding the KaTeX drawing, its LaTeX in this attribute. It is ONE character
 * of the note for every offset the island counts (like a <br>), and the
 * serializer reads it back as the formula run, never as its drawing's text.
 */
export const NOTE_MATH_ATTR = "data-note-math";
const NOTE_MATH_DISPLAY_ATTR = "data-note-math-display";

/** Whether a DOM node is a note formula atom. */
export function isNoteMathAtom(node: Node | null | undefined): boolean {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).hasAttribute(NOTE_MATH_ATTR),
  );
}

/** The note formula atom a DOM node is inside (itself included), or null. */
export function noteMathAtomOf(node: Node | null | undefined, root?: Node): HTMLElement | null {
  let current: Node | null | undefined = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.hasAttribute(NOTE_MATH_ATTR)) return current;
    current = current.parentNode;
  }
  return null;
}

function pushRun(paragraph: FootnoteRun[], text: string, flags: Flags): void {
  if (!text) return;
  const last = paragraph[paragraph.length - 1];
  const sameFlags =
    last &&
    !isNoteMathRun(last) &&
    !!last.bold === !!flags.bold &&
    !!last.italic === !!flags.italic &&
    !!last.underline === !!flags.underline &&
    !!last.strike === !!flags.strike &&
    !!last.superscript === !!flags.superscript &&
    !!last.subscript === !!flags.subscript &&
    !!last.hidden === !!flags.hidden &&
    last.href === flags.href &&
    last.highlight === flags.highlight;
  if (sameFlags && last) {
    last.text += text;
    return;
  }
  paragraph.push({ text, ...flags });
}

/**
 * Serialize the editing island's DOM into paragraphs of whitelisted runs.
 * Never throws on hostile DOM; unknown elements are transparent wrappers.
 */
export function serializeNoteBodyDom(root: HTMLElement): FootnoteRichBody {
  const paragraphs: FootnoteRun[][] = [[]];
  const current = () => paragraphs[paragraphs.length - 1];
  // A block boundary only separates what is on either side of it (two
  // adjacent block boundaries are one break). A typed break — BR or a
  // newline in text — is always its own paragraph break, so a blank line
  
  const breakParagraph = (typed = false) => {
    if (typed || current().length > 0) paragraphs.push([]);
  };

  const walk = (node: Node, flags: Flags): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Newlines inside text nodes are paragraph breaks too (plaintext-only
      // era bodies carried \n).
      const parts = (node.textContent ?? "").split("\n");
      parts.forEach((part, index) => {
        if (index > 0) breakParagraph(true);
        pushRun(current(), part, flags);
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (isNoteMathAtom(el)) {
      // A formula: its run, whatever it is wrapped in (it takes no flags).
      const formula = sanitizeNoteMathRun({
        math: el.getAttribute(NOTE_MATH_ATTR),
        mathDisplay: el.hasAttribute(NOTE_MATH_DISPLAY_ATTR),
      });
      if (formula) current().push(formula);
      return;
    }
    if (el.tagName === "BR") {
      // Word's line break inside a note paragraph (`w:br`), drawn as a
      // marked BR, stays the store's U+2028 instead of a new paragraph.
      if (el.hasAttribute(NOTE_LINE_BREAK_ATTR)) pushRun(current(), NOTE_LINE_BREAK, flags);
      else breakParagraph(true);
      return;
    }
    const flagKey = FLAG_TAGS[el.tagName];
    let nextFlags: Flags = flagKey ? { ...flags, [flagKey]: true } : flags;
    if (el.hasAttribute("data-hidden-text")) {
      nextFlags = { ...nextFlags, hidden: true };
    }
    // A highlight: the note's own mark, or the background the browser's
    // highlight command (and a paste) states on a span. A transparent one is
    // No Color over a highlighted run.
    const background = el.getAttribute("data-highlight-color") ?? el.style?.backgroundColor;
    if (background) {
      const highlight = noteHighlightColor(background);
      if (highlight !== null) {
        const rest: Flags = { ...nextFlags };
        delete rest.highlight;
        nextFlags = highlight ? { ...rest, highlight } : rest;
      }
    }
    if (el.tagName === "A") {
      // The link a run sits in survives the island (OFL-058); an address the
      // store does not admit leaves its text as plain text.
      const href = sanitizeNoteHref(el.getAttribute("href"));
      if (href) nextFlags = { ...nextFlags, href };
    }
    const isBlock = BLOCK_TAGS.has(el.tagName);
    if (isBlock) breakParagraph();
    for (const child of Array.from(el.childNodes)) walk(child, nextFlags);
    if (isBlock) breakParagraph();
  };

  for (const child of Array.from(root.childNodes)) walk(child, {});
  while (
    paragraphs.length > 1 &&
    paragraphs[paragraphs.length - 1].length === 0
  ) {
    paragraphs.pop();
  }
  return paragraphs;
}

/**
 * A CSS background as a note run's highlight: `#rrggbb`, "" for none (a
 * transparent background), or null for a value that says nothing.
 */
function noteHighlightColor(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (text === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(text)) return "";
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (digit) => digit + digit) : hex[1];
    return sanitizeNoteHighlight(`#${digits}`) ?? null;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(text);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map((channel) => Math.min(255, Number(channel)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** A note's line break inside a paragraph (Word's `w:br`), as the store holds it. */
export const NOTE_LINE_BREAK = "\u2028";
const NOTE_LINE_BREAK_ATTR = "data-note-line-break";

/**
 * Note text as display nodes: each U+2028 (Word's `w:br` in a note) is a
 * marked BR, the browser drawing that character as no break at all (corpus
 * R37-D15: a fourteen-line footnote showed on one line).
 */
export function noteTextNodes(doc: Document, text: string): Node {
  if (!text.includes(NOTE_LINE_BREAK)) return doc.createTextNode(text);
  const fragment = doc.createDocumentFragment();
  text.split(NOTE_LINE_BREAK).forEach((piece, index) => {
    if (index > 0) {
      const br = doc.createElement("br");
      br.setAttribute(NOTE_LINE_BREAK_ATTR, "");
      fragment.appendChild(br);
    }
    if (piece) fragment.appendChild(doc.createTextNode(piece));
  });
  return fragment;
}

/**
 * A note formula as its island atom: the formula drawn by the same KaTeX
 * seam the body's in-line equations use (`lazyKatex`), in Office math style,
 * uneditable and selected/deleted as one character. A display formula
 * (`m:oMathPara`) is drawn in display mode on a line of its own, as Word
 * sets a display zone.
 */
export function noteMathAtom(doc: Document, run: Pick<FootnoteRun, "math" | "mathDisplay">): HTMLElement {
  const atom = doc.createElement("span");
  const latex = run.math ?? "";
  atom.setAttribute(NOTE_MATH_ATTR, latex);
  atom.setAttribute("contenteditable", "false");
  atom.className = "mrnote-note-math inline-math-preview";
  atom.setAttribute("data-math-style", "office");
  atom.setAttribute("role", "math");
  atom.setAttribute("aria-label", latex);
  if (run.mathDisplay) {
    atom.setAttribute(NOTE_MATH_DISPLAY_ATTR, "");
    atom.style.display = "block";
    atom.style.textAlign = "center";
  }
  renderKatexCached(atom, latex, Boolean(run.mathDisplay));
  return atom;
}

/** Wrap a text node in the flag elements a run carries (innermost first). */
function runToDom(doc: Document, run: FootnoteRun): Node {
  if (isNoteMathRun(run)) return noteMathAtom(doc, run);
  let node: Node = noteTextNodes(doc, run.text);
  const wrap = (tag: string) => {
    const el = doc.createElement(tag);
    el.appendChild(node);
    node = el;
  };
  if (run.subscript) wrap("sub");
  if (run.superscript) wrap("sup");
  if (run.strike) wrap("s");
  if (run.underline) wrap("u");
  if (run.italic) wrap("em");
  if (run.bold) wrap("strong");
  if (run.href) {
    const anchor = doc.createElement("a");
    anchor.setAttribute("href", run.href);
    anchor.setAttribute("rel", "noopener noreferrer");
    if (!run.href.startsWith("#")) anchor.setAttribute("target", "_blank");
    anchor.appendChild(node);
    node = anchor;
  }
  if (run.highlight) {
    const mark = doc.createElement("mark");
    mark.setAttribute("data-highlight-color", run.highlight);
    mark.setAttribute("style", `background-color: ${run.highlight}; color: inherit`);
    mark.appendChild(node);
    node = mark;
  }
  if (run.hidden) {
    const hidden = doc.createElement("span");
    hidden.setAttribute("data-hidden-text", "");
    hidden.setAttribute(
      "style",
      "display: var(--mrnote-hidden-text-display, none); text-decoration: var(--mrnote-hidden-text-decoration, none)",
    );
    hidden.appendChild(node);
    node = hidden;
  }
  return node;
}

/**
 * Render sanitized runs into a host element (cleared first). Paragraphs are
 * separated by <br> so the body stays a wrapping inline flow (the note list
 * lays entries out as inline content, matching the plain-text era).
 */
export function renderNoteBodyInto(
  host: HTMLElement,
  rich: FootnoteRichBody,
): void {
  const doc = host.ownerDocument;
  host.textContent = "";
  rich.forEach((runs, index) => {
    if (index > 0) host.appendChild(doc.createElement("br"));
    for (const run of runs) host.appendChild(runToDom(doc, run));
  });
}

/** A note paragraph's own Exactly / At least line (read-only layout evidence). */
export type NoteParagraphLine = FootnoteParagraphLine;

/** Marks the span that sets one note paragraph on its own line. */
export const NOTE_PARAGRAPH_LINE_ATTR = "data-note-paragraph-line";
/** The note row's own (automatic) line, which a paragraph without a line of
 * its own takes once the row's strut is zeroed. */
export const NOTE_NATURAL_LINE_PROPERTY = "--note-natural-line";

/** Move a note row's line onto its paragraphs: the row's strut is zeroed and
 * its line kept for the paragraphs that state none. */
export function noteRowLineToParagraphs(row: HTMLElement, natural: string): void {
  row.style.setProperty(NOTE_NATURAL_LINE_PROPERTY, natural && natural !== "normal" && natural !== "0px" ? natural : "1.2em");
  row.style.lineHeight = "0px";
}

/** A note paragraph's line as a style object (for React-rendered rows). */
export function noteParagraphLineStyle(line: NoteParagraphLine | null | undefined): { lineHeight: string } {
  const natural = `var(${NOTE_NATURAL_LINE_PROPERTY}, 1.2em)`;
  if (!line) return { lineHeight: natural };
  return { lineHeight: line.rule === "exact" ? `${line.pt}pt` : `max(${line.pt}pt, ${natural})` };
}

function noteParagraphLineCss(line: NoteParagraphLine | null | undefined): string {
  const natural = `var(${NOTE_NATURAL_LINE_PROPERTY}, 1.2em)`;
  if (!line) return `line-height:${natural}`;
  return line.rule === "exact" ? `line-height:${line.pt}pt` : `line-height:max(${line.pt}pt, ${natural})`;
}

/**
 * Set each paragraph of a rendered note body on its own line, as Word sets
 * every note paragraph at its own spacing (Word 16.86, corpus R77-D14: an
 * endnote whose paragraphs are Exactly 7.5 pt fits 92 on a page; at the
 * note's one line height, 51). Each paragraph's nodes are wrapped in a span
 * that carries its line; the breaks between paragraphs stay where they are,
 * so the island reads back the same text (spans are transparent to
 * serializeNoteBodyDom). `firstParagraph` is the index of the paragraph the
 * body starts in (a page's slice of a note). Returns whether it wrapped.
 */
export function applyNoteParagraphLines(
  host: HTMLElement,
  lines: readonly (NoteParagraphLine | null)[] | undefined,
  firstParagraph = 0,
): boolean {
  if (!lines?.length) return false;
  const doc = host.ownerDocument;
  // A plain body's paragraphs are newlines in its text: each newline stays
  // with the paragraph it ends.
  for (const node of Array.from(host.childNodes)) {
    const text = node.nodeType === Node.TEXT_NODE ? node.textContent ?? "" : "";
    if (!text.includes("\n")) continue;
    const fragment = doc.createDocumentFragment();
    const parts = text.split("\n");
    parts.forEach((part, index) => {
      const piece = index < parts.length - 1 ? `${part}\n` : part;
      if (piece) fragment.appendChild(doc.createTextNode(piece));
    });
    host.replaceChild(fragment, node);
  }
  let paragraph = Math.max(0, Math.trunc(firstParagraph));
  let span: HTMLElement | null = null;
  for (const node of Array.from(host.childNodes)) {
    if (node instanceof HTMLElement && node.tagName === "BR" && !node.hasAttribute(NOTE_LINE_BREAK_ATTR)) {
      span = null;
      paragraph += 1;
      continue;
    }
    if (!span) {
      span = doc.createElement("span");
      span.setAttribute(NOTE_PARAGRAPH_LINE_ATTR, String(paragraph));
      span.setAttribute("style", noteParagraphLineCss(lines[paragraph]));
      host.insertBefore(span, node);
    }
    span.appendChild(node);
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").endsWith("\n")) {
      span = null;
      paragraph += 1;
    }
  }
  const row = host.parentElement;
  if (row && row.style.lineHeight && row.style.lineHeight !== "0px") noteRowLineToParagraphs(row, row.style.lineHeight);
  return true;
}

/** The paragraph a character offset of a note body stands in. */
export function noteParagraphIndexAt(body: string, offset: number): number {
  let count = 0;
  const end = Math.max(0, Math.min(Math.trunc(offset), body.length));
  for (let index = 0; index < end; index += 1) if (body.charCodeAt(index) === 10) count += 1;
  return count;
}

/** Stable content key for change detection (render/sync + measure keys). */
export function noteBodyRenderKey(body: string, rich?: FootnoteRichBody): string {
  return rich ? `r:${JSON.stringify(rich)}` : `p:${body}`;
}
