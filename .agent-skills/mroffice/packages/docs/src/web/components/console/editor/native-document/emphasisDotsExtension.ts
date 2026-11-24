"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Chinese EMPHASIS DOTS / 着重号 (Word `<w:em>`, WPS Writer "着重号") — TipTap
 * wiring.
 *
 * 着重号 is the dotted emphasis mark Chinese typography places UNDER (or, in some
 * styles, beside) each character of an emphasized run — the CJK analogue of
 * italic, which reads poorly on Han characters. Word represents it as a run
 * property `<w:em w:val="dot"/>` (values: none / dot / comma / circle / underDot);
 * the browser equivalent is the CSS `text-emphasis` shorthand plus
 * `text-emphasis-position`, which actually paints the dots in-editor.
 *
 * ADDITIVE: registering this extension adds ONE inline mark ("emphasisDots")
 * carrying an optional whitelisted `style` (the emphasis glyph). It round-trips
 * through the document schema's open `marks` passthrough (see
 * lib/native-page-schemas → documentDocAttrsSchema), so EXISTING documents —
 * which carry none — still validate and load byte-for-byte unchanged. There is
 * no flag: the feature is purely opt-in per user action (toggling emphasis dots
 * on a selection); a document with no emphasis-dot marks behaves, renders, and
 * EXPORTS exactly as before.
 *
 * SECURITY: the `style` attr is a CLOSED whitelist — parse/render funnel it
 * through {@link normalizeEmphasisDotStyle}, so a forged/imported value outside
 * the set is dropped (falls back to the default "dot"), never interpolated into
 * the inline CSS. Each whitelisted style maps to a fixed, developer-authored CSS
 * fragment via {@link emphasisDotsCss} (single source of truth), so no CSS
 * injection is possible.
 */

/** The inline mark name for a Chinese emphasis-dot (着重号) run. */
export const EMPHASIS_DOTS_MARK_NAME = "emphasisDots";

/**
 * The supported emphasis marks: Word's `<w:em>` values (ECMA-376 17.18.24
 * ST_Em) apart from "none", which is the absence of the mark. Word's Font
 * dialog offers the same four (VBA wdEmphasisMarkOverSolidCircle /
 * OverComma / OverWhiteCircle / UnderSolidCircle).
 *
 * Where Word draws them (measured in Word 16): `comma` and `circle` above the
 * text, `underDot` below it, and `dot` below Simplified Chinese text (East
 * Asian language zh-CN / zh-SG) and above every other language. The mark's
 * `placement` records "over" for a dot drawn above; null is the style's own
 * place, so the editor's own 着重号 stays under the text.
 */
export const EMPHASIS_DOT_STYLE_VALUES = ["dot", "comma", "circle", "underDot"] as const;
export type EmphasisDotStyle = (typeof EMPHASIS_DOT_STYLE_VALUES)[number];
export type EmphasisDotPlacement = "over" | "under";

/** Word's default 着重号 glyph (and our default when none/unknown is supplied). */
export const DEFAULT_EMPHASIS_DOT_STYLE: EmphasisDotStyle = "dot";

const EMPHASIS_DOT_STYLE_SET = new Set<string>(EMPHASIS_DOT_STYLE_VALUES);

/**
 * Map an arbitrary stored / imported / Word `<w:em w:val>` value to a whitelisted
 * {@link EmphasisDotStyle}, or null when the value is unusable (e.g. "none", which
 * means no emphasis and so no mark). `underDot` → `dot` (both are an under dot);
 * casing/whitespace are tolerated. Anything outside the closed set returns null.
 */
export function normalizeEmphasisDotStyle(
  value: unknown,
): EmphasisDotStyle | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.toLowerCase() === "none") return null;
  if (v.toLowerCase() === "underdot") return "underDot";
  const lower = v.toLowerCase();
  return EMPHASIS_DOT_STYLE_SET.has(lower) ? (lower as EmphasisDotStyle) : null;
}

/** Where a mark of this style and stored placement is drawn. */
export function emphasisDotPlacement(
  style: EmphasisDotStyle,
  placement: unknown,
): EmphasisDotPlacement {
  if (style === "comma" || style === "circle") return "over";
  if (style === "underDot") return "under";
  return placement === "over" ? "over" : "under";
}

/**
 * Coerce any value to a usable {@link EmphasisDotStyle}, defaulting to
 * {@link DEFAULT_EMPHASIS_DOT_STYLE}. Used by the command/render paths where the
 * mark is KNOWN to be present (so "none"/unknown should not erase it, just fall
 * back to the canonical dot).
 */
export function coerceEmphasisDotStyle(value: unknown): EmphasisDotStyle {
  return normalizeEmphasisDotStyle(value) ?? DEFAULT_EMPHASIS_DOT_STYLE;
}

/**
 * The concrete inline CSS each emphasis style renders as (single source of
 * truth, shared by the mark's renderHTML). A fixed, developer-authored string —
 * never interpolated with user input — so no CSS injection is possible. The dots
 * sit UNDER the run on the RIGHT side, which is the convention Word uses for the
 * 着重号 (and what CJK readers expect); `text-emphasis-position` is set on the
 * same span so a stylesheet-less HTML export still paints the marks.
 */
export function emphasisDotsCss(
  style: EmphasisDotStyle,
  placement: unknown = null,
): string {
  const side = emphasisDotPlacement(style, placement) === "over" ? "over" : "under";
  const position = `text-emphasis-position: ${side} right; -webkit-text-emphasis-position: ${side} right`;
  switch (style) {
    case "comma":
      return `text-emphasis: filled sesame; -webkit-text-emphasis: filled sesame; ${position}`;
    case "circle":
      return `text-emphasis: open circle; -webkit-text-emphasis: open circle; ${position}`;
    case "dot":
    case "underDot":
    default:
      return `text-emphasis: filled dot; -webkit-text-emphasis: filled dot; ${position}`;
  }
}

/** The Word `<w:em w:val>` token this editor style maps to on DOCX export. */
export function emphasisDotStyleToWordVal(style: EmphasisDotStyle): string {
  // Word's <w:em> vals: dot / comma / circle / underDot (the mark's absence is
  // "none").
  return style;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentEmphasisDots: {
      /**
       * Toggle the Chinese emphasis-dot (着重号) mark on the current selection. An
       * optional `style` chooses the glyph (default {@link DEFAULT_EMPHASIS_DOT_STYLE}).
       * Mirrors toggleSuperscript: a collapsed cursor inside a marked run removes
       * the whole run (extendEmptyMarkRange) for Word/WPS parity.
       */
      toggleEmphasisDots: (style?: string) => ReturnType;
      /**
       * Word's Font dialog Emphasis mark: set one style on the selection, or
       * remove the mark with "none".
       */
      setEmphasisDots: (style: string) => ReturnType;
    };
  }
}

function readEmphasisDotStyle(element: HTMLElement): EmphasisDotStyle {
  // A round-tripped span carries the canonical token on data-emphasis-dots; an
  // unknown/absent value falls back to the default dot (the mark IS present).
  return coerceEmphasisDotStyle(element.getAttribute("data-emphasis-dots"));
}

/**
 * Word's emphasis marks are drawn by the editor, one per character
 * (note-editor.css `.docs-emphasis-mark`), not by CSS `text-emphasis`.
 * Measured in Word 16 (probe-em, 11pt): a dot is ~0.12em across, centred
 * 1.07em above the baseline when over the text and 0.31em below it when
 * under; the marks do not make the line taller. CSS `text-emphasis` sat
 * ~6px higher and grew every line by half an em (~15%). The mark keeps its
 * `text-emphasis` declaration for stylesheet-less HTML; the editor's
 * stylesheet turns it off and draws these per-character decorations.
 */
const EMPHASIS_GRAPHEMES =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** A run's characters as grapheme clusters (code points without Segmenter). */
function emphasisGraphemes(text: string): Iterable<string> {
  if (!EMPHASIS_GRAPHEMES) return text;
  return Array.from(EMPHASIS_GRAPHEMES.segment(text), (part) => part.segment);
}

function createEmphasisMarkDrawingPlugin(markName: string): Plugin {
  const cache = new WeakMap<object, DecorationSet>();
  const holdsMark = new SheetFact((node) => node.isText && node.marks.some((candidate) => candidate.type.name === markName));
  return new Plugin({
    props: {
      decorations(state) {
        const cached = cache.get(state.doc);
        if (cached) return cached;
        const decorations: Decoration[] = [];
        holdsMark.descendants(state.doc, (node, pos) => {
          if (!node.isText || !node.text) return true;
          const mark = node.marks.find((candidate) => candidate.type.name === markName);
          if (!mark) return false;
          const style = coerceEmphasisDotStyle(mark.attrs.style);
          const side = emphasisDotPlacement(style, mark.attrs.placement);
          let offset = 0;
          // One mark per character as the reader sees it: "é" typed as e +
          // U+0301 is one grapheme, and splitting it put the accent in its
          
          for (const character of emphasisGraphemes(node.text)) {
            const from = pos + offset;
            offset += character.length;
            // Word marks every character but white space.
            if (/^\s+$/u.test(character)) continue;
            decorations.push(
              Decoration.inline(from, from + character.length, {
                class: "docs-emphasis-mark",
                "data-emphasis-mark": style,
                "data-emphasis-side": side,
              }),
            );
          }
          return false;
        });
        const set = DecorationSet.create(state.doc, decorations);
        cache.set(state.doc, set);
        return set;
      },
    },
  });
}

const EmphasisDotsMark = Mark.create({
  name: EMPHASIS_DOTS_MARK_NAME,

  addAttributes() {
    return {
      style: {
        default: DEFAULT_EMPHASIS_DOT_STYLE as EmphasisDotStyle,
        parseHTML: (element: HTMLElement) => readEmphasisDotStyle(element),
        renderHTML: (attrs: Record<string, unknown>) => {
          const style = coerceEmphasisDotStyle(attrs.style);
          const placement =
            style === "dot" && attrs.placement === "over" ? "over" : null;
          return {
            "data-emphasis-dots": style,
            ...(placement ? { "data-emphasis-placement": placement } : {}),
            style: emphasisDotsCss(style, placement),
          };
        },
      },
      // "over" for a dot Word draws above the text; null = the style's place.
      placement: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-emphasis-placement") === "over" ? "over" : null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-emphasis-dots]" }];
  },

  addProseMirrorPlugins() {
    return [createEmphasisMarkDrawingPlugin(this.type.name)];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleEmphasisDots:
        (style?: string) =>
        ({ chain, editor }) => {
          if (editor.isActive(EMPHASIS_DOTS_MARK_NAME)) {
            // extendEmptyMarkRange so a collapsed cursor inside a marked run
            // removes the whole run (Word/WPS parity), matching superscript.
            return chain()
              .unsetMark(EMPHASIS_DOTS_MARK_NAME, { extendEmptyMarkRange: true })
              .run();
          }
          // setMark arms a stored mark at a collapsed cursor so the next typed
          // character carries the emphasis dots.
          return chain()
            .setMark(EMPHASIS_DOTS_MARK_NAME, {
              style: coerceEmphasisDotStyle(style),
            })
            .run();
        },
      setEmphasisDots:
        (style: string) =>
        ({ commands }) => {
          const normalized = normalizeEmphasisDotStyle(style);
          if (!normalized) {
            return commands.unsetMark(EMPHASIS_DOTS_MARK_NAME, {
              extendEmptyMarkRange: true,
            });
          }
          return commands.setMark(EMPHASIS_DOTS_MARK_NAME, {
            style: normalized,
            placement: null,
          });
        },
    };
  },
});

export const DocumentEmphasisDots = EmphasisDotsMark;

export default DocumentEmphasisDots;
