"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes } from "@tiptap/core";

import {
  documentBorderLineCss,
  documentBorderLineIsVisible,
  documentBorderLineWidthPx,
  normalizeDocumentBorderLine,
} from "@mrnote/core/web/lib/document-borders.ts";
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";

/**
 * Character SHADING (Word/WPS 字符底纹, run `<w:shd w:fill="E7E6E6">`) and
 * character BORDER (Word/WPS 字符边框, run `<w:bdr w:val="single">`) — TipTap
 * wiring for the Home-tab font-group toggles.
 *
 * TWO SEPARATE MARKS, deliberately:
 *   - `charShading` is NOT the highlight mark. Word keeps 字符底纹 (a fixed
 *     light-gray fill toggled from the Home tab) distinct from the highlighter
 *     (a color the user picks); reusing `highlight` would make the two buttons
 *     overwrite each other. As independent marks they co-exist — a run can be
 *     highlighted AND carry the shading toggle, and each round-trips its own
 *     OOXML element on export (an explicit highlight wins the single `w:shd`
 *     slot, see docx-export.ts serializeRunProps).
 *   - `charBorder` draws a thin box around the run (1px currentColor), the
 *     Word 字符边框 look, exported as run `<w:bdr w:val="single">`.
 *
 * ADDITIVE: registering these adds two inline marks that round-trip through the
 * document schema's open `marks` passthrough (see lib/native-page-schemas →
 * documentDocAttrsSchema), so EXISTING documents — which carry neither — still
 * validate and load byte-for-byte unchanged. No flag: purely opt-in per user
 * action; a document with no charShading/charBorder marks behaves, renders and
 * EXPORTS exactly as before.
 *
 * SECURITY: neither mark carries a user-controlled attribute. Render emits a
 * FIXED, developer-authored data-attribute + inline CSS fragment (single source
 * of truth below), so no user value ever reaches the style surface — no CSS
 * injection is possible.
 */

/** The inline mark name for Word/WPS 字符底纹 (character shading). */
export const CHAR_SHADING_MARK_NAME = "charShading";
/** The inline mark name for Word/WPS 字符边框 (character border). */
export const CHAR_BORDER_MARK_NAME = "charBorder";

/**
 * Word's standard character-shading fill (the gray Word/WPS apply for 字符底纹).
 * Shared by the editor render AND the DOCX exporter's `w:fill` so the two can
 * never drift; the importer maps this exact fill back to the mark.
 */
export const CHAR_SHADING_FILL = "E7E6E6";

/** Fixed inline CSS for the shading run (never interpolated with user input). */
export const CHAR_SHADING_CSS = `background-color: #${CHAR_SHADING_FILL.toLowerCase()}`;

/**
 * Fixed inline CSS for the border run. `currentColor` keeps the hairline in the
 * run's own text color (Word draws 字符边框 with the automatic text color).
 */
export const CHAR_BORDER_CSS =
  "border: 1px solid currentColor; border-radius: 1px";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentCharEffects: {
      /**
       * Toggle Word/WPS 字符底纹 (light-gray character shading) on the current
       * selection. A collapsed cursor inside a shaded run removes the whole run
       * (extendEmptyMarkRange), mirroring superscript/emphasisDots.
       */
      toggleCharShading: () => ReturnType;
      /** Toggle Word/WPS 字符边框 (thin character border) on the selection. */
      toggleCharBorder: () => ReturnType;
    };
  }
}

const CharShadingMark = Mark.create({
  name: CHAR_SHADING_MARK_NAME,

  parseHTML() {
    return [{ tag: "span[data-char-shading]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-char-shading": "true",
        style: CHAR_SHADING_CSS,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCharShading:
        () =>
        ({ chain, editor }) => {
          if (editor.isActive(CHAR_SHADING_MARK_NAME)) {
            // extendEmptyMarkRange: a collapsed cursor inside a marked run
            // removes the whole run (Word/WPS parity, same as emphasisDots).
            return chain()
              .unsetMark(CHAR_SHADING_MARK_NAME, { extendEmptyMarkRange: false })
              .run();
          }
          // setMark arms a stored mark at a collapsed cursor so the next typed
          // character carries the shading.
          return chain().setMark(CHAR_SHADING_MARK_NAME).run();
        },
    };
  },
});

/**
 * A run border's line (Word `w:bdr`, ECMA-376 17.3.2.4) in the shape paragraph
 * borders use (lib/document-borders): ST_Border style, width in points, colour
 * (absent = automatic, the text colour) and distance from the text in points.
 * All null is the Home tab button's own border: single, 0.5pt, automatic.
 */
export interface CharBorderAttributes {
  style: string | null;
  sizePt: number | null;
  color: string | null;
  spacePt: number | null;
}

/**
 * Fixed inline CSS for a run border. Word boxes the run with the line's
 * width, style and colour and keeps `w:space` points of room on its left and
 * right (measured in Word 16: the box's height is the line's, the space only
 * widens it); every value passes the shared border normalizer first.
 */
export function charBorderCss(attrs: Partial<CharBorderAttributes> | null | undefined): string {
  const line = normalizeDocumentBorderLine(
    {
      style: attrs?.style ?? "single",
      ...(typeof attrs?.sizePt === "number" ? { sizePt: attrs.sizePt } : {}),
      ...(typeof attrs?.color === "string" ? { color: attrs.color } : {}),
      ...(typeof attrs?.spacePt === "number" ? { spacePt: attrs.spacePt } : {}),
    },
    { allowSpace: true },
  );
  if (!line) return CHAR_BORDER_CSS;
  const border = documentBorderLineCss(line, {
    style: "single",
    sizePt: 0.5,
    color: "currentColor",
  });
  if (!border) return CHAR_BORDER_CSS;
  const space = line.spacePt ? `; padding-inline: ${line.spacePt}pt` : "";
  // Word grows the run's line by the border's drawn width AND its w:space
  // above and below (note-editor.css `[data-char-border]`); Word 16, 11pt
  // Calibri single lines: 0.5pt single at space 0/1/2/4/8/16pt 14.5 / 16.4 /
  // 18.5 / 22.5 / 30.4 / 46.5pt, the 13.45pt line plus twice width + space.
  // A double is drawn three times its line wide, without the 3px floor the
  // CSS double needs to show two lines. A "none" border keeps its space
  // (21.4pt at space 4); "nil" is no border at all (13.45pt).
  const linePt = line.sizePt ?? 0.5;
  const drawnPx = !documentBorderLineIsVisible(line)
    ? 0
    : line.style === "double" ? ptToPx(linePt * 3) : ptToPx(linePt);
  const grow =
    line.style === "nil" ? 0 : Math.round((drawnPx + ptToPx(line.spacePt ?? 0)) * 1000) / 1000;
  const growCss = grow > 0 ? `; --docs-char-border-grow: ${grow}px` : "";
  if (line.style === "dotted") {
    // Word's dotted run border is square dots as wide as the line, a gap as
    // wide between them (dbl probe); CSS draws round dots, which at 100%
    // zoom shrink to one light row. The stylesheet paints the squares
    // (`[data-char-border-style="dotted"]`) in a transparent border.
    const dot = documentBorderLineWidthPx(line);
    return `border: ${dot}px solid transparent${space}; --docs-char-border-dot: ${dot}px; --docs-char-border-color: ${line.color ?? "currentColor"}${growCss}`;
  }
  return `border: ${border}${space}${growCss}`;
}

function numberAttr(element: HTMLElement, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null || !raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const CharBorderMark = Mark.create({
  name: CHAR_BORDER_MARK_NAME,
  // Word draws ONE box around adjacent runs with the same border, whatever
  // else changes inside it (shading, colour, bold, underline; measured in
  // Word 16). The border mark therefore nests outside every formatting mark
  // but the run's font marks (priority 101, registered before it), which
  // its box takes its height from.
  priority: 101,

  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-char-border-style") || null,
        renderHTML: () => ({}),
      },
      sizePt: {
        default: null,
        parseHTML: (element: HTMLElement) => numberAttr(element, "data-char-border-size"),
        renderHTML: () => ({}),
      },
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-char-border-color") || null,
        renderHTML: () => ({}),
      },
      spacePt: {
        default: null,
        parseHTML: (element: HTMLElement) => numberAttr(element, "data-char-border-space"),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-char-border]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const attrs = mark.attrs as Partial<CharBorderAttributes>;
    const line = normalizeDocumentBorderLine(
      {
        style: attrs.style ?? "single",
        sizePt: attrs.sizePt ?? undefined,
        color: attrs.color ?? undefined,
        spacePt: attrs.spacePt ?? undefined,
      },
      { allowSpace: true },
    );
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-char-border": "true",
        ...(line && attrs.style ? { "data-char-border-style": line.style } : {}),
        ...(line && typeof line.sizePt === "number" && attrs.sizePt !== null
          ? { "data-char-border-size": String(line.sizePt) }
          : {}),
        ...(line?.color && attrs.color ? { "data-char-border-color": line.color } : {}),
        ...(line && typeof line.spacePt === "number" && attrs.spacePt !== null
          ? { "data-char-border-space": String(line.spacePt) }
          : {}),
        style: charBorderCss(attrs),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCharBorder:
        () =>
        ({ chain, editor }) => {
          if (editor.isActive(CHAR_BORDER_MARK_NAME)) {
            return chain()
              .unsetMark(CHAR_BORDER_MARK_NAME, { extendEmptyMarkRange: false })
              .run();
          }
          return chain().setMark(CHAR_BORDER_MARK_NAME).run();
        },
    };
  },
});

export const DocumentCharShading = CharShadingMark;
export const DocumentCharBorder = CharBorderMark;
