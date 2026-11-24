/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * "Paste Special" formatting modes (Word/WPS paste-options parity):
 *
 *   - "keep"  — Keep Source Formatting: paste the clipboard HTML untouched (the
 *               editor's default paste; preserves every style it can map).
 *   - "merge" — Merge Formatting: keep the INLINE emphasis (bold / italic /
 *               underline / strike / sub / sup / inline code / links) but DROP the
 *               source's block styling — headings flatten to paragraphs, list
 *               structure flattens to lines, and inline color / font / size /
 *               background are stripped so the text adopts the destination style.
 *   - "text"  — Keep Text Only: paste the raw text with no marks at all (handled
 *               by {@link plainTextPaste}; included here so a single enum drives
 *               the whole paste-options menu).
 *
 * The HTML transform here is PURE (regex / DOM, no editor dependency) so it can be
 * unit-tested and reused: NoteEditor reads the active mode and, for "merge", runs
 * {@link mergeFormatHtml} on the clipboard's `text/html` before feeding it to
 * `insertContent`.
 *
 * SECURITY: merge-format does not "trust" the source HTML — it REBUILDS the output
 * from a whitelist of inline-emphasis tags and the text inside them, dropping
 * every attribute (style/class/color/event handlers/etc.) and every non-emphasis
 * element. So a pasted `<script>`, an `onclick=`, a `style=` payload, or any other
 * markup can never survive the merge path; the result is plain text wrapped only
 * in attribute-free `<strong>/<em>/<u>/<s>/<sub>/<sup>/<code>/<a>` (and `<br>` /
 * `<p>` for structure), plus a note reference's `<sup data-type="footnote-ref">`
 * carrying only its sanitized note id. TipTap re-sanitizes on insert as a
 * second layer.
 */

import type { Mark as PmMark } from "@tiptap/pm/model";
import { sanitizeCustomMark, sanitizeFootnoteId } from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import { normalizePastedPlainText, PLAIN_PASTE_MAX_TEXT_LENGTH, htmlToPlainText } from "./plainTextPaste";

/** The three Word/WPS paste-options modes. */
export type PasteFormatMode = "keep" | "merge" | "text";

/** The default paste mode (Keep Source Formatting — the editor's native paste). */
export const DEFAULT_PASTE_MODE: PasteFormatMode = "keep";

const PASTE_MODE_SET = new Set<PasteFormatMode>(["keep", "merge", "text"]);

/** Coerce an arbitrary value into a valid {@link PasteFormatMode} (default keep). */
export function normalizePasteMode(value: unknown): PasteFormatMode {
  return typeof value === "string" && PASTE_MODE_SET.has(value as PasteFormatMode)
    ? (value as PasteFormatMode)
    : DEFAULT_PASTE_MODE;
}

// Inline-emphasis tags merge-format KEEPS, each mapped to its canonical,
// attribute-free output tag. Synonyms fold onto the canonical form (b→strong,
// i→em, del/strike→s) so the result is uniform and easy for TipTap to parse.
const EMPHASIS_TAG_MAP: Record<string, string> = {
  STRONG: "strong",
  B: "strong",
  EM: "em",
  I: "em",
  U: "u",
  S: "s",
  STRIKE: "s",
  DEL: "s",
  SUB: "sub",
  SUP: "sup",
  CODE: "code",
};

// Block-level tags that introduce a paragraph break in the flattened output.
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "LI",
  "TR",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "SECTION",
  "ARTICLE",
  "UL",
  "OL",
  "TABLE",
  "PRE",
  // A definition list's terms and definitions are separate paragraphs
  
  // paragraph with them).
  "DL",
  "DT",
  "DD",
  "CAPTION",
  "FIGURE",
  "FIGCAPTION",
  "ADDRESS",
  "HEADER",
  "FOOTER",
  "MAIN",
  "ASIDE",
  "NAV",
]);

/** Escape the five XML/HTML metacharacters in a text node. */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a value destined for a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}











function safeHref(href: string | null | undefined): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (trimmed === "") return null;
  if (/^(https?:\/\/|mailto:|tel:|\/\/)/i.test(trimmed)) return trimmed;
  // A relative path (no scheme, no leading slash-slash, no colon-before-slash).
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return null;
}












/**
 * Word's Merge Formatting keeps the source's bold, italic or underline only
 * where it marks PART of what was copied: an emphasis on every word of the
 * selection is the source's own formatting, which the destination's replaces
 * (live Word audit WUA 127: a wholly italic "12345" pasted into bold text
 * stayed italic). This walks the copied text as the renderer does and
 * returns the emphasis every non-blank run carries.
 */
const WHOLE_SELECTION_EMPHASIS = ["strong", "em", "u"] as const;
function wholeSelectionEmphasis(container: Node): ReadonlySet<string> {
  let common: Set<string> | null = null;
  const visit = (node: Node, state: ReadonlySet<string>): void => {
    if (node.nodeType === 3) {
      if (!(node.textContent ?? "").trim()) return;
      const here = new Set<string>(WHOLE_SELECTION_EMPHASIS.filter((name) => state.has(name)));
      common = common === null ? here : new Set([...common].filter((name) => here.has(name)));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "HEAD") return;
    const next = emphasisAfter(state, el, el.tagName);
    for (const child of Array.from(el.childNodes)) visit(child, next);
  };
  visit(container, NO_EMPHASIS);
  return common ?? NO_EMPHASIS;
}

let droppedEmphasis: ReadonlySet<string> = new Set();

function mergeFormatViaDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  droppedEmphasis = wholeSelectionEmphasis(doc.body);
  let out: string;
  try {
    out = renderMergedBlocks(doc.body);
  } finally {
    droppedEmphasis = NO_EMPHASIS;
  }
  // Cap total length (mirrors the plain-paste guard) so a pathological clipboard
  // cannot lock the editor; the cap counts the visible structure too.
  if (out.length > PLAIN_PASTE_MAX_TEXT_LENGTH) {
    out = out.slice(0, PLAIN_PASTE_MAX_TEXT_LENGTH);
  }
  return out;
}

/** The output tags of emphasis, in the order they nest. */
const EMPHASIS_ORDER = ["strong", "em", "u", "s", "sub", "sup", "code"] as const;






function cssEmphasisChange(element: Element): { on: string[]; off: string[] } {
  const style = (element as HTMLElement).style;
  const on: string[] = [];
  const off: string[] = [];
  if (!style) return { on, off };
  const weight = style.fontWeight.trim().toLowerCase();
  const numeric = Number.parseInt(weight, 10);
  if (weight === "bold" || weight === "bolder" || (Number.isFinite(numeric) && numeric >= 600)) {
    on.push("strong");
  } else if (weight === "normal" || weight === "lighter" || (Number.isFinite(numeric) && numeric < 600)) {
    off.push("strong");
  }
  const slant = style.fontStyle.trim().toLowerCase();
  if (slant === "italic" || slant.startsWith("oblique")) on.push("em");
  else if (slant === "normal") off.push("em");
  const line = `${style.textDecorationLine} ${style.textDecoration}`.trim().toLowerCase();
  if (line.includes("underline")) on.push("u");
  if (line.includes("line-through")) on.push("s");
  if (/(^|\s)none(\s|$)/.test(line) && !line.includes("underline") && !line.includes("line-through")) {
    off.push("u", "s");
  }
  const align = style.verticalAlign.trim().toLowerCase();
  if (align === "sub") on.push("sub");
  else if (align === "super") on.push("sup");
  else if (align === "baseline") off.push("sub", "sup");
  return { on, off };
}

/** `state` after an element's tag and inline CSS. */
function emphasisAfter(state: ReadonlySet<string>, element: Element, tag: string): ReadonlySet<string> {
  const next = new Set(state);
  const tagged = EMPHASIS_TAG_MAP[tag];
  if (tagged) next.add(tagged);
  // A block's own weight is block styling, which Merge Formatting leaves to
  // the destination; inline elements (a link too) state their runs' emphasis.
  if (!BLOCK_TAGS.has(tag)) {
    const { on, off } = cssEmphasisChange(element);
    for (const name of off) next.delete(name);
    for (const name of on) next.add(name);
  }
  return next;
}

/** `html` wrapped in the tags of `state`. */
function withEmphasis(state: ReadonlySet<string>, html: string): string {
  const tags = EMPHASIS_ORDER.filter((name) => state.has(name) && !droppedEmphasis.has(name));
  return `${tags.map((name) => `<${name}>`).join("")}${html}${[...tags].reverse().map((name) => `</${name}>`).join("")}`;
}

const TABLE_SECTION_TAGS = new Set(["THEAD", "TBODY", "TFOOT"]);

/** The rows of a table, in document order, through its optional sections. */
function tableRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const child of Array.from(table.children)) {
    if (child.tagName === "TR") rows.push(child);
    else if (TABLE_SECTION_TAGS.has(child.tagName)) {
      for (const row of Array.from(child.children)) {
        if (row.tagName === "TR") rows.push(row);
      }
    }
  }
  return rows;
}







function mergedCellSpans(cell: Element, rowsLeft: number): string {
  const span = (name: string, maximum: number): number => {
    const raw = cell.getAttribute(name)?.trim() ?? "";
    if (!/^\d{1,5}$/.test(raw)) return 1;
    return Math.min(Math.max(Number.parseInt(raw, 10), 1), Math.max(maximum, 1));
  };
  const colspan = span("colspan", 1000);
  const rowspan = span("rowspan", rowsLeft);
  return `${colspan > 1 ? ` colspan="${colspan}"` : ""}${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}`;
}

/**
 * `container`'s content as attribute-free blocks: `<p>` paragraphs of kept
 * emphasis and text, and `<table>` grids whose cells hold the same. "" when
 * there is no text at all.
 */
/** Tags whose EMPTY element is a paragraph the author left blank on purpose. */
const EMPTY_PARAGRAPH_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI"]);

/** An element whose CSS keeps the line breaks written in its text. */
function whiteSpacePreservesBreaks(element: Element): boolean {
  const value = (element as HTMLElement).style?.whiteSpace?.trim().toLowerCase() ?? "";
  return value === "pre" || value === "pre-wrap" || value === "pre-line" || value === "break-spaces";
}

const NO_EMPHASIS: ReadonlySet<string> = new Set();

function renderMergedBlocks(container: Node): string {
  const blocks: string[] = [];
  let parts: string[] = [];
  let pendingBlockBreak = false;
  // Inside <pre> (or a white-space: pre* element) a line feed is a line the
  // author wrote, not source formatting: it survives as a line break where
  
  // two-line <pre> into one line).
  let preserveBreaks = 0;

  const closeParagraph = () => {
    const inner = parts.join("").replace(/^(?:<br>)+/, "").replace(/(?:<br>)+$/, "");
    parts = [];
    pendingBlockBreak = false;
    if (inner.trim() !== "") blocks.push(`<p>${inner}</p>`);
  };
  const flushBlockBreak = () => {
    if (pendingBlockBreak && parts.length > 0) closeParagraph();
    pendingBlockBreak = false;
  };

  const walk = (node: Node, state: ReadonlySet<string> = NO_EMPHASIS): void => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (text.length === 0) return;
      flushBlockBreak();
      parts.push(
        preserveBreaks > 0
          ? text.split("\n").map((line) => withEmphasis(state, escapeHtmlText(line))).join("<br>")
          : withEmphasis(state, escapeHtmlText(text)),
      );
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName;

    if (tag === "BR") {
      flushBlockBreak();
      parts.push("<br>");
      return;
    }
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "HEAD") return;
    if (tag === "PRE" || whiteSpacePreservesBreaks(el)) {
      preserveBreaks += 1;
      try {
        walkElement(el, tag, state);
      } finally {
        preserveBreaks -= 1;
      }
      return;
    }
    walkElement(el, tag, state);
  };

  const walkElement = (el: Element, tag: string, outer: ReadonlySet<string>): void => {
    const node: Node = el;
    if (tag === "TABLE") {
      const sourceRows = tableRows(el);
      const rows = sourceRows
        .map((row, rowIndex) => {
          const cells = Array.from(row.children)
            .filter((cell) => cell.tagName === "TD" || cell.tagName === "TH")
            .map(
              (cell) =>
                `<td${mergedCellSpans(cell, sourceRows.length - rowIndex)}>${
                  renderMergedBlocks(cell) || "<p></p>"
                }</td>`,
            );
          return cells.length > 0 ? `<tr>${cells.join("")}</tr>` : "";
        })
        .filter((row) => row !== "");
      // A table's caption is visible text: it stays, as the paragraph above
      
      const captions = Array.from(el.children)
        .filter((child) => child.tagName === "CAPTION")
        .map((caption) => renderMergedBlocks(caption))
        .filter((caption) => caption !== "");
      if (rows.length === 0 && captions.length === 0) return;
      closeParagraph();
      blocks.push(...captions);
      if (rows.length > 0) blocks.push(`<table>${rows.join("")}</table>`);
      return;
    }

    // A footnote or endnote reference is content, not formatting: Word's
    // Merge Formatting pastes the reference and its note as Keep Source
    // Formatting does, the reference only taking the destination's look
    // (live Word audit WUA 261: the reference and its note text were
    // dropped). Its sanitized id is the one attribute that rides, and the
    // pasted-note plugin gives the copy a note of its own.
    if (tag === "SUP" && el.getAttribute("data-type") === "footnote-ref") {
      const noteId = sanitizeFootnoteId(el.getAttribute("data-note-id"));
      if (!noteId) return;
      const customMark = sanitizeCustomMark(el.getAttribute("data-custom-mark"));
      flushBlockBreak();
      parts.push(
        `<sup data-type="footnote-ref" data-note-id="${escapeHtmlAttr(noteId)}"${
          customMark ? ` data-custom-mark="${escapeHtmlAttr(customMark)}"` : ""
        }></sup>`,
      );
      return;
    }

    const emphasis = EMPHASIS_TAG_MAP[tag];
    if (emphasis === "code") {
      // Inline <code> only; a <pre><code> block flattens like a block (the <pre>
      // already triggered a block break) but keeps the code mark inline.
      flushBlockBreak();
    }

    let href: string | null = null;
    if (tag === "A") {
      href = safeHref(el.getAttribute("href"));
    }

    // Emphasis is a state each text run is written in: a tag or inline CSS
    
    // dropped where <strong> was kept, a link's own CSS bold too, and a
    // `font-weight: 400` run inside a bold span came out bold).
    const state = emphasisAfter(outer, el, tag);
    if (tag === "A" && href) {
      flushBlockBreak();
      parts.push(`<a href="${escapeHtmlAttr(href)}">`);
      for (const child of Array.from(node.childNodes)) walk(child, state);
      parts.push("</a>");
      return;
    }
    if (emphasis) {
      for (const child of Array.from(node.childNodes)) walk(child, state);
      return;
    }

    // Not an emphasis element: recurse into its children (keeping their text +
    // emphasis), and remember to break the paragraph at a block boundary.
    const blocksBefore = blocks.length;
    const partsBefore = parts.length;
    for (const child of Array.from(node.childNodes)) walk(child, state);
    if (BLOCK_TAGS.has(tag)) {
      // A paragraph with nothing in it is still a paragraph: Merge Formatting
      // only restyles, it never removes the blank line an author left between
      
      // itself counts, so wrappers around real paragraphs add nothing.
      if (
        EMPTY_PARAGRAPH_TAGS.has(tag) &&
        blocks.length === blocksBefore &&
        parts.length === partsBefore &&
        (el.textContent ?? "").trim() === ""
      ) {
        closeParagraph();
        blocks.push("<p></p>");
      }
      pendingBlockBreak = true;
    }
  };

  walk(container);
  closeParagraph();
  return blocks.join("");
}

/**
 * SSR / no-DOM fallback: there is no safe way to keep inline emphasis without a
 * parser, so degrade to the plain-text flatten (the same result Keep-Text-Only
 * would give). This path only runs in non-browser test/SSR contexts; the real
 * paste always has a DOM.
 */
function mergeFormatFallback(html: string): string {
  const stripped = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
  return normalizePastedPlainText(stripped);
}

/**
 * Reduce a clipboard HTML fragment to Merge-Formatting output: inline emphasis
 * preserved, block styling / colors / fonts dropped, every attribute stripped
 * (except a sanitized link href). Returns "" for empty input. The result is safe
 * to feed to TipTap `insertContent` as HTML.
 */
export function mergeFormatHtml(html: unknown): string {
  if (typeof html !== "string" || html.trim().length === 0) return "";
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    return mergeFormatFallback(html);
  }
  try {
    return mergeFormatViaDom(html);
  } catch {
    return mergeFormatFallback(html);
  }
}

/**
 * Resolve what a paste should DO given the active mode and the clipboard
 * contents, WITHOUT touching the editor — the single decision point both the
 * runtime and the tests share:
 *
 *   - "text"  → always plain text (caller inserts {@link mergeFormatFallback}-style
 *               text; NoteEditor uses its existing plain-text path).
 *   - "merge" → merge-format HTML when the clipboard carries `text/html`; falls
 *               back to plain text when it only has `text/plain`.
 *   - "keep"  → let the editor's default paste run (action "default").
 *
 * `plain` / `html` are the clipboard's `text/plain` / `text/html` strings.
 */
export type PasteAction =
  | { kind: "default" }
  | { kind: "html"; html: string }
  | { kind: "text"; text: string };

export function resolvePasteAction(
  mode: PasteFormatMode,
  clipboard: { plain?: string; html?: string },
): PasteAction {
  const plain = typeof clipboard.plain === "string" ? clipboard.plain : "";
  const html = typeof clipboard.html === "string" ? clipboard.html : "";
  // A clipboard with HTML only (a copied bold word) still has text in it:
  
  const plainText = () =>
    plain.length > 0
      ? normalizePastedPlainText(plain)
      : html.trim().length > 0
        ? // A block's closing line feed is the block's edge, not a line the
          // text had: the words land inline where the caret is.
          htmlToPlainText(html).replace(/\n+$/u, "")
        : "";
  if (mode === "text") {
    return { kind: "text", text: plainText() };
  }
  if (mode === "merge") {
    const merged = html.trim().length > 0 ? mergeFormatHtml(html) : "";
    if (merged) return { kind: "html", html: merged };
    return { kind: "text", text: plainText() };
  }
  return { kind: "default" };
}

/**
 * The character formatting Merge Formatting gives pasted text: the direct
 * formatting of the text at the insertion point (Word: "the formatting of the
 * text around it"). Pasted words in a 16px bold sentence came out at the
 * default size and weight (live Word audit WUA 127). Marks that are not
 * formatting -- links, comments, revisions, bookmarks, index and field
 * entries, per-character layouts -- stay where they were.
 */
const MERGE_DESTINATION_EXCLUDED_MARKS: ReadonlySet<string> = new Set([
  "link",
  "wikiLink",
  "tocEntryTitle",
  "tocEntryPage",
  "code",
  "symbolChar",
  "trackInsertion",
  "trackDeletion",
  "trackFormatting",
  "comment",
  "bookmark",
  "indexEntry",
  "authorityEntry",
  "contentControl",
  "fitText",
  "enclosedChar",
  "eastAsianLayout",
]);

export function mergeDestinationMarks(
  state: { storedMarks: readonly PmMark[] | null; selection: { $from: { marks(): readonly PmMark[] } } },
): PmMark[] {
  const marks = state.storedMarks ?? state.selection.$from.marks();
  return marks.filter((mark) => !MERGE_DESTINATION_EXCLUDED_MARKS.has(mark.type.name));
}
