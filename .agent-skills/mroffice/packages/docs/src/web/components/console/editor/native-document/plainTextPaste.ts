/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * "Paste as Plain Text" / "Keep Text Only" (Word/WPS Ctrl+Shift+V) helpers for
 * the native document editor. Strips the clipboard's formatting and inserts the
 * raw text, so a paste from a styled source (a web page, another doc) drops all
 * marks, colors, fonts and block structure beyond line breaks.
 *
 * The logic here is PURE (no editor / ProseMirror dependency) so it can be
 * unit-tested: NoteEditor wires the Ctrl+Shift+V shortcut + the clipboard read
 * and feeds the resulting string into `insertContent` as ordinary text.
 */

/** Upper bound on a single plain paste, mirroring the table-paste guard, so a
 * pathological multi-megabyte clipboard can't lock the editor. */
import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const PLAIN_PASTE_MAX_TEXT_LENGTH = 500_000;

/**
 * Normalize a plain-text string for insertion: collapse CRLF / CR to LF and
 * cap the length. Plain text carries no marks, so nothing else is stripped —
 * this is the canonical form the editor inserts as mark-free text. Over-long
 * input is truncated (never rejected) so a huge paste degrades gracefully.
 */
export function normalizePastedPlainText(text: string): string {
  if (typeof text !== "string" || text.length === 0) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.length <= PLAIN_PASTE_MAX_TEXT_LENGTH) return normalized;
  // The cap is in UTF-16 units: a cut between the halves of a surrogate pair
  // left half an emoji or a CJK extension character behind (OFL-061). The
  // pair goes whole or not at all.
  let end = PLAIN_PASTE_MAX_TEXT_LENGTH;
  const last = normalized.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return normalized.slice(0, end);
}

/**
 * Reduce an HTML fragment to its plain text, mapping block-level elements and
 * `<br>` to newlines so a pasted paragraph/list keeps its line breaks but loses
 * every mark/attribute. SSR-safe: when no DOM is available (no `document`), it
 * strips tags with a regex fallback. The result is funneled through
 * {@link normalizePastedPlainText} so the caller always gets the canonical form.
 */
export function htmlToPlainText(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  // SSR / no-DOM fallback: strip tags, decode a few common entities, normalize.
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    const stripped = html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
    return normalizePastedPlainText(stripped);
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const BLOCK = new Set([
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
  ]);
  let out = "";
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
    if (BLOCK.has(el.tagName) && !out.endsWith("\n")) out += "\n";
  };
  walk(doc.body);
  return normalizePastedPlainText(out);
}

/**
 * Extract the mark-free text to paste from a clipboard payload. Prefers the
 * clipboard's own `text/plain` (already mark-free); only when that is absent /
 * empty does it fall back to flattening `text/html`. Returns "" when neither is
 * present, so the caller can decide to fall through to the default paste.
 *
 * Accepts a minimal `{ getData }` shape so it works with both a real
 * `DataTransfer` and a test double, and never throws (a clipboard `getData`
 * that throws is treated as "no data of that type").
 */
export function plainTextFromClipboard(
  clipboard: { getData(type: string): string } | null | undefined,
): string {
  if (!clipboard || typeof clipboard.getData !== "function") return "";
  const read = (type: string): string => {
    try {
      return clipboard.getData(type) ?? "";
    } catch {
      return "";
    }
  };
  const plain = read("text/plain");
  // Spaces are text too: three spaces pasted as unformatted text are three
  
  // character at all defers to the HTML's text.
  if (plain.length > 0) return normalizePastedPlainText(plain);
  const html = read("text/html");
  if (html.trim().length > 0) return htmlToPlainText(html);
  return "";
}

/**
 * True when the key event is the "Paste as Plain Text / Keep Text Only"
 * shortcut: Ctrl/⌘ + Shift + V (and NOT Alt). Mirrors Word/WPS and the common
 * browser "paste and match style" chord.
 */
export function isPlainPasteShortcut(event: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "v"
  );
}

/**
 * Pasted plain text keeps its blank lines, as Word keeps them: every line
 * break starts a paragraph, so two in a row leave an empty paragraph
 * between. ProseMirror's own reading split on runs of line breaks and
 * dropped them (WUA 207: three U+000A between two words gave two adjacent
 * paragraphs). Text with no blank line is left to the editor's own reading.
 */
export const PlainTextBlankLines = Extension.create({
  name: "plainTextBlankLines",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("plainTextBlankLines"),
        props: {
          clipboardTextParser(text, $context) {
            const lines = text.replace(/\r\n?/g, "\n").split("\n");
            // Only an interior blank line needs this reading.
            if (!lines.slice(1, -1).some((line) => line === "")) return null as unknown as Slice;
            const schema = $context.doc.type.schema;
            const paragraph = schema.nodes.paragraph;
            if (!paragraph) return null as unknown as Slice;
            const marks = $context.marks();
            const blocks = lines.map((line) =>
              paragraph.create(null, line ? schema.text(line, marks) : null),
            );
            return new Slice(Fragment.from(blocks), 1, 1);
          },
        },
      }),
    ];
  },
});
