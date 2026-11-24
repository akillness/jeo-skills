"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import { cssNamedColorHex } from "../../../../lib/css-named-colors";
import { mergeAttributes } from "@tiptap/core";
import { Underline } from "@tiptap/extension-underline";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isUnderlineSelectionWithEquations, selectionHoldsEquation, settleSelectedEquations } from "./equationNodeFormat";
export * from "./underlineStyles";
import { UNDERLINE_STYLE_VALUES, underlineStyleIsHeavy, underlineStyleToCssDecoration } from "./underlineStyles";
import type { UnderlineStyle } from "./underlineStyles";

/**
 * UNDERLINE STYLES + COLOR (Word/WPS `<w:u w:val w:color>`) — TipTap wiring.
 *
 * Word/WPS underline is far richer than a single on/off toggle: a run can pick a
 * line STYLE (`<w:u w:val="single|double|dotted|wave|…"/>`) and an underline
 * COLOR (`<w:u … w:color="RRGGBB"/>`) independent of the text color. TipTap's
 * stock `Underline` mark (bundled in StarterKit) is a bare boolean — it parses
 * `<u>` / `text-decoration: underline` and renders a plain `<u>`, dropping both
 * style and color on every round-trip.
 *
 * This extends the stock mark (keeping its name `"underline"`, its
 * set/toggle/unset commands, the Mod-U shortcut, and its markdown handling) with
 * two persisted attrs:
 *   • `underlineStyle` ∈ {single, double, dotted, wavy} — picks the
 *     `text-decoration-style` (single == the plain underline, byte-stable).
 *   • `underlineColor` — a 6-hex (#rrggbb) `text-decoration-color`, or null to
 *     inherit the text color (byte-stable).
 *
 * ADDITIVE + BYTE-STABLE: a plain underline run (style "single", no color)
 * renders the exact `<u>` it always did and carries NO data attribute, so an
 * existing document is unchanged. The attrs round-trip through the document
 * schema's open `marks` passthrough (lib/native-page-schemas.ts), so a document
 * that never sets a fancy underline still validates and loads unchanged.
 *
 * SECURITY: `underlineStyle` is a CLOSED whitelist funneled through
 * {@link normalizeUnderlineStyle}; `underlineColor` is funneled through
 * {@link normalizeUnderlineColor} (a strict 6-hex check), so neither a forged
 * stored value nor an imported DOCX value can inject arbitrary CSS — the render
 * only ever emits a whitelisted `text-decoration-style` token and a validated
 * `#rrggbb` color.
 */

/** The eight styles Word's ribbon Underline gallery shows; the dialog has all. */
export const UNDERLINE_RIBBON_STYLE_VALUES = [
  "single",
  "double",
  "thick",
  "dotted",
  "dash",
  "dotDash",
  "dotDotDash",
  "wavy",
] as const satisfies readonly UnderlineStyle[];

/** The default (a plain single underline) — byte-stable, emits no data attr. */
export const DEFAULT_UNDERLINE_STYLE: UnderlineStyle = "single";

/**
 * Map an arbitrary stored / imported value to a whitelisted {@link UnderlineStyle},
 * defaulting to {@link DEFAULT_UNDERLINE_STYLE}. Tolerates casing/whitespace and
 * the common Word aliases (`wave`/`wavyHeavy` → wavy, `dottedHeavy` → dotted,
 * `dash`-family → dotted as the closest renderable style). Anything unknown falls
 * back to single — the mark IS present, so we never erase it, just normalize the
 * style.
 */
const UNDERLINE_STYLE_BY_LOWERCASE: ReadonlyMap<string, UnderlineStyle> = new Map(
  UNDERLINE_STYLE_VALUES.map((style) => [style.toLowerCase(), style] as const),
);

export function normalizeUnderlineStyle(value: unknown): UnderlineStyle {
  if (typeof value !== "string") return DEFAULT_UNDERLINE_STYLE;
  const v = value.trim().toLowerCase();
  if (!v) return DEFAULT_UNDERLINE_STYLE;
  const known = UNDERLINE_STYLE_BY_LOWERCASE.get(v);
  if (known) return known;
  // Word `<w:u w:val>` tokens the editor spells differently, plus the aliases
  // older documents stored.
  if (v === "wave") return "wavy";
  if (v === "dashheavy") return "dashedHeavy";
  if (v === "dotdashheavy") return "dashDotHeavy";
  if (v === "dotdotdashheavy") return "dashDotDotHeavy";
  return DEFAULT_UNDERLINE_STYLE;
}

/**
 * Strict 6-hex underline color (#rrggbb, lowercased) or null. `null`/`"auto"`/
 * malformed → null (inherit the text color, the byte-stable default).
 */
/** `rgb(224, 62, 62)` / `red` as #rrggbb; anything else is not a colour here. */
function cssColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(?:1|1\.0+|100%)\s*)?\)$/.exec(text);
  if (rgb) {
    const channels = rgb.slice(1, 4).map((channel) => Number.parseInt(channel, 10));
    if (channels.some((channel) => channel > 255)) return null;
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return cssNamedColorHex(text);
}

export function normalizeUnderlineColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v || v === "auto") return null;
  const hex = v.replace(/^#/, "");
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

/**
 * The Word `<w:u w:val>` token an editor underline style maps to on DOCX export
 * (single source of truth, shared by the exporter). `wavy` → Word's `wave`.
 */
export function underlineStyleToWordVal(style: UnderlineStyle): string {
  return style === "wavy" ? "wave" : style;
}

/**
 * Word's wave underlines (`wave`, `wavyHeavy`, `wavyDouble`), which the
 * stylesheet draws: measured in Word 16 at 11pt, a wave has a 0.215em period
 * and a 0.065em swing just under the baseline, `wavyDouble` is two thin
 * waves in phase - CSS `text-decoration-style: wavy` is three times as tall
 * and has no double form.
 */
export function underlineStyleIsWave(style: UnderlineStyle): boolean {
  return style === "wavy" || style === "wavyHeavy" || style === "wavyDouble";
}

/**
 * Word's dotted and dashed underlines, which the stylesheet draws as Word's
 * own rhythm (measured in Word 16 at 11pt: dotted 1.5pt dots every 2.9pt,
 * dash 3.9pt dashes every 5.8pt, long dash 7.9pt every 11.8pt, dot-dash and
 * dot-dot-dash their own patterns; heavy styles twice as thick). CSS
 * `dotted` draws round dots and `dashed` one dash rhythm for all of them.
 */
export function underlineStyleIsPatterned(style: UnderlineStyle): boolean {
  return (
    style === "dotted" ||
    style === "dottedHeavy" ||
    style === "dash" ||
    style === "dashedHeavy" ||
    style === "dashLong" ||
    style === "dashLongHeavy" ||
    style === "dotDash" ||
    style === "dashDotHeavy" ||
    style === "dotDotDash" ||
    style === "dashDotDotHeavy"
  );
}

/**
 * Build the inline-style string + data attributes for an underline run. Returns
 * an EMPTY object for a plain single underline with no color (so the rendered
 * `<u>` is byte-for-byte the stock element). Otherwise emits a
 * `text-decoration` declaration (line + validated style + validated color) plus
 * `data-underline-*` round-trip hooks.
 */
export function underlineRenderAttrs(
  rawStyle: unknown,
  rawColor: unknown,
): Record<string, string> {
  const style = normalizeUnderlineStyle(rawStyle);
  const color = normalizeUnderlineColor(rawColor);
  const attrs: Record<string, string> = {};
  if (style === DEFAULT_UNDERLINE_STYLE && !color) {
    return attrs;
  }
  // "Words only": the mark draws no line of its own; the extension's
  
  // that skips the spaces, and a single line ran through them).
  // Word's waves, dots and dashes are drawn by note-editor.css
  // (`u[data-underline-style]`): CSS `wavy` is about three times Word's wave
  // and has no double wave; CSS dots are round and has one dash rhythm.
  if (style === "none") {
    // The mark draws nothing; note-editor.css takes the link's default line
    // off the text it wraps.
    attrs["data-underline-style"] = style;
    attrs.style = "text-decoration-line:none";
    return attrs;
  }
  const drawnWave = underlineStyleIsWave(style) || underlineStyleIsPatterned(style);
  const decl: string[] = [
    style === "words" || drawnWave ? "text-decoration-line:none" : "text-decoration-line:underline",
  ];
  if (style !== DEFAULT_UNDERLINE_STYLE) {
    if (style !== "words" && !drawnWave) {
      decl.push(`text-decoration-style:${underlineStyleToCssDecoration(style)}`);
    }
    if (underlineStyleIsHeavy(style) && !drawnWave) decl.push("text-decoration-thickness:0.15em");
    attrs["data-underline-style"] = style;
  }
  if (color) {
    decl.push(
      drawnWave ? `--docs-underline-color:${color}` : `text-decoration-color:${color}`,
    );
    attrs["data-underline-color"] = color;
  }
  attrs.style = decl.join(";");
  return attrs;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentUnderlineStyle: {
      /**
       * Set (or update) the underline STYLE on the current selection, arming the
       * underline mark if not already present. `null`/unknown resets to single.
       */
      setUnderlineStyle: (style: UnderlineStyle | null) => ReturnType;
      /**
       * Set (or clear) the underline COLOR on the current selection, arming the
       * underline mark if not already present. `null` clears the color override.
       */
      setUnderlineColor: (color: string | null) => ReturnType;
    };
  }
}

/**
 * The extended underline mark. `Underline.extend` preserves the stock parseHTML
 * (`<u>` / `text-decoration: underline`), commands, keyboard shortcut and
 * markdown wiring; we layer the two whitelisted attrs and the style/color
 * commands on top.
 */
const HOLDS_WORD_UNDERLINE = new SheetFact((node) =>
  node.isText && node.marks.some((mark) => mark.type.name === "underline" && normalizeUnderlineStyle(mark.attrs.underlineStyle) === "words"),
);

export const DocumentUnderline = Underline.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      underlineStyle: {
        default: DEFAULT_UNDERLINE_STYLE as UnderlineStyle,
        parseHTML: (element: HTMLElement) => {
          const data = element.getAttribute("data-underline-style");
          if (data) return normalizeUnderlineStyle(data);
          // Fall back to the inline text-decoration-style when present.
          const decoStyle =
            element.style?.textDecorationStyle ||
            element.style?.getPropertyValue?.("text-decoration-style") ||
            "";
          if (decoStyle === "double") return "double";
          if (decoStyle === "dotted") return "dotted";
          if (decoStyle === "dashed") return "dash";
          if (decoStyle === "wavy") return "wavy";
          return DEFAULT_UNDERLINE_STYLE;
        },
        // This attr's renderHTML receives ALL the mark's attributes, so it owns
        // the COMBINED render: it folds the style + color into ONE
        // `text-decoration` declaration + the `data-underline-*` round-trip
        // hooks (underlineColor's own renderHTML below is a no-op to avoid a
        // partial/duplicate emission). A plain single underline with no color
        // returns {}, so the rendered <u> stays byte-for-byte the stock element.
        renderHTML: (attributes: Record<string, unknown>) =>
          underlineRenderAttrs(
            attributes.underlineStyle,
            attributes.underlineColor,
          ),
      },
      underlineColor: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => {
          const data = element.getAttribute("data-underline-color");
          if (data) return normalizeUnderlineColor(data);
          const decoColor =
            element.style?.textDecorationColor ||
            element.style?.getPropertyValue?.("text-decoration-color") ||
            "";
          // The CSSOM states a colour as rgb(...) (or a name): read it as
          // any colour is read, not as six hex digits only.
          return normalizeUnderlineColor(decoColor) ?? normalizeUnderlineColor(cssColorHex(decoColor));
        },
        // Rendered jointly by underlineStyle's renderHTML above (which reads
        // both attrs); a no-op here prevents a second, partial declaration.
        renderHTML: () => ({}),
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    // underlineStyle's renderHTML has already collapsed style+color into the
    // merged `style` + `data-underline-*` attributes on HTMLAttributes; emit a
    // plain <u> carrying them (mergeAttributes folds in the stock options).
    return ["u", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addProseMirrorPlugins() {
    const cache = new WeakMap<object, DecorationSet>();
    return [
      new Plugin({
        props: {
          decorations(state) {
            const existing = cache.get(state.doc);
            if (existing) return existing;
            const decorations: Decoration[] = [];
            HOLDS_WORD_UNDERLINE.descendants(state.doc, (node, pos) => {
              if (!node.isText || !node.text) return true;
              const mark = node.marks.find(
                (candidate) =>
                  candidate.type.name === "underline" &&
                  normalizeUnderlineStyle(candidate.attrs.underlineStyle) === "words",
              );
              if (!mark) return false;
              const color = normalizeUnderlineColor(mark.attrs.underlineColor);
              const style = `text-decoration-line:underline${color ? `;text-decoration-color:${color}` : ""}`;
              for (const match of node.text.matchAll(/\S+/gu)) {
                const from = pos + (match.index ?? 0);
                decorations.push(
                  Decoration.inline(from, from + match[0].length, {
                    class: "docs-underline-words",
                    style,
                  }),
                );
              }
              return false;
            });
            const result = DecorationSet.create(state.doc, decorations);
            cache.set(state.doc, result);
            return result;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      // Underline over a selection holding an equation: decided over its
      // words and equations together, and written into the equations'
      // letters, where underline made inside them lives (`equationNodeFormat`).
      toggleUnderline:
        () =>
        ({ state, tr, dispatch, commands }) => {
          if (!selectionHoldsEquation(state)) return commands.toggleMark(this.name);
          const on = isUnderlineSelectionWithEquations(state);
          const applied = on ? commands.unsetMark(this.name) : commands.setMark(this.name, {});
          if (dispatch) settleSelectedEquations(state, tr, "underline", !on, this.type);
          return applied;
        },
      setUnderlineStyle:
        (style: UnderlineStyle | null) =>
        ({ chain }) =>
          chain()
            .setMark(this.name, {
              underlineStyle: normalizeUnderlineStyle(style),
            })
            .run(),
      setUnderlineColor:
        (color: string | null) =>
        ({ chain }) =>
          chain()
            .setMark(this.name, {
              underlineColor: normalizeUnderlineColor(color),
            })
            .run(),
    };
  },
});

export default DocumentUnderline;
