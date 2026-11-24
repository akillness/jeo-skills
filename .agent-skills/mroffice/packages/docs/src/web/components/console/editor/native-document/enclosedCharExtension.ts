"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, Mark, mergeAttributes, type Editor } from "@tiptap/core";
import type { Mark as ProseMirrorMark } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { isMacPlatform } from "@mrnote/core/web/lib/mac-platform.ts";

/**
 * ENCLOSED / CIRCLED CHARACTERS / 带圈字符 (Word "Enclose Characters" /
 * 中文版式 → 带圈字符, WPS Writer "带圈字符") — TipTap wiring.
 *
 * 带圈字符 wraps a single character in a circle / square / triangle / diamond —
 * the typographic enclosure Word offers under "Enclose Characters". Word stores
 * it as an EQ field (`EQ \o(\s\up …,○)` or `\x` variants), which is a complex
 * field-instruction round-trip; here we represent the enclosure as a single
 * inline mark that PAINTS the enclosure in-editor via CSS, which is the faithful
 * on-screen behavior a user expects when they apply it.
 *
 * ADDITIVE: registering this extension adds ONE inline mark ("enclosedChar")
 * carrying a whitelisted `shape` attr (circle / square / triangle / diamond,
 * default circle). It round-trips through the document schema's open `marks`
 * passthrough (see lib/native-page-schemas → documentDocAttrsSchema), so EXISTING
 * documents — which carry none — still validate and load byte-for-byte unchanged.
 * There is no flag: the feature is purely opt-in per user action (wrapping a
 * selected character); a document with no enclosed-char marks behaves, renders,
 * and EXPORTS exactly as before.
 *
 * SECURITY: the `shape` attr is a CLOSED whitelist — parse/render funnel it
 * through {@link normalizeEnclosedCharShape}, so a forged/imported value outside
 * the set is dropped (falls back to the default "circle"), never interpolated
 * into the inline CSS. Each whitelisted shape maps to a fixed, developer-authored
 * CSS fragment via {@link enclosedCharCss} (single source of truth), so no CSS
 * injection is possible.
 *
 * DOCX round-trip uses Word's live EQ overstrike field grammar
 * (`EQ \\o\\ac(SHAPE,TEXT)`). The closed parser below is shared by the browser
 * importer and exporter so unsupported EQ equations remain ordinary cached
 * field results instead of being mistaken for editable enclosure authority.
 */

/** The inline mark name for an enclosed / circled character (带圈字符) run. */
export const ENCLOSED_CHAR_MARK_NAME = "enclosedChar";

/**
 * The supported enclosure shapes. Word's "Enclose Characters" dialog offers
 * circle / square / triangle / diamond; circle is the default (the canonical
 * 带圈字符 ○).
 */
export const ENCLOSED_CHAR_SHAPE_VALUES = [
  "circle",
  "square",
  "triangle",
  "diamond",
] as const;
export type EnclosedCharShape = (typeof ENCLOSED_CHAR_SHAPE_VALUES)[number];

/** Word's default enclosure (and our default when none/unknown is supplied). */
export const DEFAULT_ENCLOSED_CHAR_SHAPE: EnclosedCharShape = "circle";

const ENCLOSED_CHAR_SHAPE_SET = new Set<string>(ENCLOSED_CHAR_SHAPE_VALUES);

/**
 * Word's Enclose Characters styles: 缩小文字 (Shrink text: the enclosure at
 * the text size, the text shrunk inside it) and 增大圈号 (Enlarge symbol: the
 * enclosure grown around full-size text; Word writes the symbol run at about
 * 1.5 x the text size, lowered 2pt). A mark without a style is Shrink text,
 * which is what every enclosure before this attribute rendered and exported.
 */
export const ENCLOSED_CHAR_STYLE_VALUES = ["shrink", "enlarge"] as const;
export type EnclosedCharStyle = (typeof ENCLOSED_CHAR_STYLE_VALUES)[number];

export function normalizeEnclosedCharStyle(value: unknown): EnclosedCharStyle {
  return value === "enlarge" ? "enlarge" : "shrink";
}

/**
 * One enclosure is one Word EQ field. Two enclosures side by side are two
 * fields, so their marks must never be equal (ProseMirror joins adjacent text
 * with equal marks into one run, which drew and exported both characters in
 * one enclosure). Each enclosure carries its own short unit id.
 */
const ENCLOSED_CHAR_UNIT_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function normalizeEnclosedCharUnit(value: unknown): string | null {
  return typeof value === "string" && ENCLOSED_CHAR_UNIT_RE.test(value)
    ? value
    : null;
}

export function newEnclosedCharUnit(): string {
  return `e${Math.random().toString(36).slice(2, 10)}`;
}

/** Whether a character is half-width (Word pairs two of them in one enclosure). */
function isHalfWidthCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code > 0xffff) return false;
  return !(
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code === 0x3000
  );
}

/**
 * The characters Word encloses from a selection: its first character, or its
 * first two when both are half-width ("10", "AB"). Word's Enclose Characters
 * applied to "多字" encloses "多" only (verified in Word for Mac 16).
 */
export function enclosedCharUnitText(text: string): string {
  const chars = Array.from(text);
  if (chars.length === 0) return "";
  const [first, second] = chars;
  if (second !== undefined && isHalfWidthCharacter(first) && isHalfWidthCharacter(second) &&
      first.trim() && second.trim()) {
    return first + second;
  }
  return first;
}

const ENCLOSED_CHAR_SYMBOL_BY_SHAPE: Readonly<
  Record<EnclosedCharShape, string>
> = {
  circle: "○",
  square: "□",
  triangle: "△",
  diamond: "◇",
};

const ENCLOSED_CHAR_SHAPE_BY_SYMBOL: Readonly<
  Record<string, EnclosedCharShape>
> = {
  "○": "circle",
  O: "circle",
  o: "circle",
  "□": "square",
  "△": "triangle",
  "◇": "diamond",
};

const ENCLOSED_CHAR_FIELD_RE =
  /^\s*EQ\s*\\o\s*\\ac\s*\(\s*([○Oo□△◇])\s*,\s*([^,()\\\r\n]{1,32}?)\s*\)(?:\s*\\\*\s+MERGEFORMAT)?\s*$/i;
const FIELD_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

export interface EnclosedCharFieldValue {
  shape: EnclosedCharShape;
  text: string;
}

/** Exact Word/WPS symbol used as the first operand of the EQ overstrike. */
export function enclosedCharSymbol(shape: EnclosedCharShape): string {
  return ENCLOSED_CHAR_SYMBOL_BY_SHAPE[shape];
}

/**
 * Whether text is exactly representable by the supported EQ enclosure grammar.
 * Keeping this boundary shared prevents an authored mark from exporting as a
 * different field expression (or silently losing its enclosure).
 */
export function isEnclosedCharFieldText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 32 &&
    value === value.trim() &&
    !FIELD_CONTROL_RE.test(value) &&
    !/[,()\\]/.test(value)
  );
}

/** Parse only the closed EQ-overstrike subset emitted by Word/MRAI. */
export function parseEnclosedCharFieldInstruction(
  value: unknown,
): EnclosedCharFieldValue | null {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    FIELD_CONTROL_RE.test(value)
  ) {
    return null;
  }
  const match = ENCLOSED_CHAR_FIELD_RE.exec(value);
  if (!match) return null;
  const shape = ENCLOSED_CHAR_SHAPE_BY_SYMBOL[match[1]];
  const text = match[2].trim();
  return shape && isEnclosedCharFieldText(text) ? { shape, text } : null;
}

/**
 * Map an arbitrary stored / imported value to a whitelisted
 * {@link EnclosedCharShape}, or null when the value is unusable. Casing /
 * whitespace are tolerated. Anything outside the closed set returns null.
 */
export function normalizeEnclosedCharShape(
  value: unknown,
): EnclosedCharShape | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return ENCLOSED_CHAR_SHAPE_SET.has(v) ? (v as EnclosedCharShape) : null;
}

/**
 * Coerce any value to a usable {@link EnclosedCharShape}, defaulting to
 * {@link DEFAULT_ENCLOSED_CHAR_SHAPE}. Used by the command/render paths where the
 * mark is KNOWN to be present (so unknown should not erase it, just fall back to
 * the canonical circle).
 */
export function coerceEnclosedCharShape(value: unknown): EnclosedCharShape {
  return normalizeEnclosedCharShape(value) ?? DEFAULT_ENCLOSED_CHAR_SHAPE;
}

















/** One hairline from corner to corner of a background cell, in currentColor. */
function enclosedEdge(direction: "to top left" | "to top right"): string {
  return `linear-gradient(${direction},transparent calc(50% - 0.07em),currentColor calc(50% - 0.07em),currentColor calc(50% + 0.07em),transparent calc(50% + 0.07em))`;
}

const ENCLOSED_TRIANGLE_OUTLINE = [
  `${enclosedEdge("to top left")} left top / 50% 100% no-repeat`,
  `${enclosedEdge("to top right")} right top / 50% 100% no-repeat`,
  "linear-gradient(currentColor,currentColor) left bottom / 100% 0.12em no-repeat",
].join(",");

const ENCLOSED_DIAMOND_OUTLINE = [
  `${enclosedEdge("to top left")} left top / 50% 50% no-repeat`,
  `${enclosedEdge("to top right")} right top / 50% 50% no-repeat`,
  `${enclosedEdge("to top right")} left bottom / 50% 50% no-repeat`,
  `${enclosedEdge("to top left")} right bottom / 50% 50% no-repeat`,
].join(",");

export function enclosedCharCss(
  shape: EnclosedCharShape,
  style: EnclosedCharStyle = "shrink",
): string {
  // Shared box: a centered, square inline-block sized to the glyph so the
  // enclosure hugs one character. line-height:1 keeps the box tight.
  // Enlarge symbol grows the enclosure around full-size text (and sits a
  // little lower, as Word lowers its enlarged symbol).
  const box =
    style === "enlarge"
      ? "display:inline-flex;align-items:center;justify-content:center;box-sizing:content-box;aspect-ratio:1/1;min-width:1em;padding:0.22em;line-height:1;text-align:center;vertical-align:-0.18em"
      : "display:inline-flex;align-items:center;justify-content:center;box-sizing:content-box;aspect-ratio:1/1;min-width:1em;padding:0.08em;line-height:1;text-align:center;vertical-align:baseline;font-size:0.86em";
  switch (shape) {
    case "square":
      return `${box};border:0.06em solid currentColor;border-radius:0.06em`;
    case "triangle":
      // Apex at the top centre, base along the bottom. A square fits a
      // triangle only at half its base, so the character is drawn at half
      // the enclosure, low in it, and the enclosure keeps the size of the
      // other shapes: the whole character inside the outline.
      return `${box};font-size:${style === "enlarge" ? "0.72em" : "0.5em"};padding:0.9em 0.5em 0.1em;background:${ENCLOSED_TRIANGLE_OUTLINE}`;
    case "diamond":
      // A square fits a diamond at half its diagonal.
      return `${box};font-size:${style === "enlarge" ? "0.72em" : "0.5em"};padding:0.5em;background:${ENCLOSED_DIAMOND_OUTLINE}`;
    case "circle":
    default:
      return `${box};border:0.06em solid currentColor;border-radius:50%`;
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentEnclosedChar: {
      /**
       * Word's Enclose Characters on the selection: ONE enclosure around its
       * first character (or first two half-width characters), with the given
       * shape and style (shrink text / enlarge symbol), as its own EQ field.
       * Choosing the enclosure the character already has removes it. Empty
       * selections fail closed.
       */
      toggleEnclosedChar: (shape?: string, style?: string) => ReturnType;
    };
  }
}

/**
 * The enclosure the caret touches: the run of characters carrying one
 * enclosedChar mark just before or just after the selection head.
 */
function enclosureAtHead(
  editor: Editor,
): { from: number; to: number; blockStart: number; blockEnd: number } | null {
  const { $head } = editor.state.selection;
  const parent = $head.parent;
  if (!parent.isTextblock) return null;
  const enclosedOf = (index: number): ProseMirrorMark | null => {
    if (index < 0 || index >= parent.childCount) return null;
    return (
      parent.child(index).marks.find((mark) => mark.type.name === ENCLOSED_CHAR_MARK_NAME) ??
      null
    );
  };
  const indexAfter = $head.index();
  const inside = $head.textOffset > 0;
  const candidates = inside ? [indexAfter] : [indexAfter - 1, indexAfter];
  for (const index of candidates) {
    const mark = enclosedOf(index);
    if (!mark) continue;
    let first = index;
    let last = index;
    while (first > 0 && enclosedOf(first - 1)?.eq(mark)) first -= 1;
    while (last < parent.childCount - 1 && enclosedOf(last + 1)?.eq(mark)) last += 1;
    const blockStart = $head.start();
    let from = blockStart;
    for (let i = 0; i < first; i += 1) from += parent.child(i).nodeSize;
    let to = from;
    for (let i = first; i <= last; i += 1) to += parent.child(i).nodeSize;
    return {
      from,
      to,
      blockStart,
      blockEnd: $head.end(),
    };
  }
  return null;
}









function moveToLineBoundary(editor: Editor, side: "start" | "end", extend: boolean): boolean {
  if (editor.isDestroyed || editor.view.composing) return false;
  if (!(editor.state.selection instanceof TextSelection)) return false;
  const unit = enclosureAtHead(editor);
  if (!unit) return false;
  const { view, state } = editor;
  let target = side === "start" ? unit.blockStart : unit.blockEnd;
  try {
    // The engine's own visual-line computation (as documentLineBoundaryKeys
    // uses it), started from just OUTSIDE the enclosure's box, so wrapping
    // and bidi resolve as for any other caret on that line.
    const domSelection = view.dom.ownerDocument.getSelection() as
      | (globalThis.Selection & {
          modify?: (alter: string, direction: string, granularity: string) => void;
        })
      | null;
    const inner = view.domAtPos(unit.from + 1).node;
    const box = (inner instanceof Element ? inner : inner.parentElement)?.closest(
      "[data-enclosed-char]",
    );
    const host = box?.parentNode;
    if (domSelection?.modify && box && host && view.dom.contains(box)) {
      const index = Array.prototype.indexOf.call(host.childNodes, box) as number;
      domSelection.collapse(host, side === "start" ? index : index + 1);
      domSelection.modify("move", side === "start" ? "backward" : "forward", "lineboundary");
      const focus = domSelection.focusNode;
      if (focus && view.dom.contains(focus)) {
        const found = view.posAtDOM(focus, domSelection.focusOffset);
        if (found >= unit.blockStart && found <= unit.blockEnd) {
          target = side === "start" ? Math.min(found, unit.from) : Math.max(found, unit.to);
        }
      }
    }
  } catch {
    // No layout (a hidden or headless view): the paragraph's own edge.
  }
  const anchor = extend ? state.selection.anchor : target;
  view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, anchor, target)).scrollIntoView(),
  );
  return true;
}

/**
 * The keys of {@link moveToLineBoundary}, ahead of the generic line-boundary
 * handlers (documentLineBoundaryKeys, priority 100), which start from the
 * caret inside the box and so stop at its edge.
 */
export const EnclosedCharLineBoundaryKeys = Extension.create({
  name: "enclosedCharLineBoundaryKeys",
  priority: 900,

  addKeyboardShortcuts() {
    const isMac = isMacPlatform();
    const shortcuts: Record<string, () => boolean> = {
      Home: () => moveToLineBoundary(this.editor, "start", false),
      End: () => moveToLineBoundary(this.editor, "end", false),
      "Shift-Home": () => moveToLineBoundary(this.editor, "start", true),
      "Shift-End": () => moveToLineBoundary(this.editor, "end", true),
    };
    if (isMac) {
      shortcuts["Meta-ArrowLeft"] = () => moveToLineBoundary(this.editor, "start", false);
      shortcuts["Meta-ArrowRight"] = () => moveToLineBoundary(this.editor, "end", false);
      shortcuts["Shift-Meta-ArrowLeft"] = () => moveToLineBoundary(this.editor, "start", true);
      shortcuts["Shift-Meta-ArrowRight"] = () => moveToLineBoundary(this.editor, "end", true);
    }
    return shortcuts;
  },
});

function readEnclosedCharShape(element: HTMLElement): EnclosedCharShape {
  // A round-tripped span carries the canonical token on data-enclosed-char; an
  // unknown/absent value falls back to the default circle (the mark IS present).
  return coerceEnclosedCharShape(element.getAttribute("data-enclosed-char"));
}

const EnclosedCharMark = Mark.create({
  name: ENCLOSED_CHAR_MARK_NAME,

  // An enclosure is one EQ field around its own characters, content and not
  // a run format (like symbolChar): typing at its edge must not grow it.
  // Inclusive, a space typed just after "10" joined the field as "10 ",
  
  inclusive: false,

  addAttributes() {
    return {
      shape: {
        default: DEFAULT_ENCLOSED_CHAR_SHAPE as EnclosedCharShape,
        parseHTML: (element: HTMLElement) => readEnclosedCharShape(element),
        // The inline style is drawn from shape AND style in renderHTML below.
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-enclosed-char": coerceEnclosedCharShape(attrs.shape),
        }),
      },
      style: {
        default: null as EnclosedCharStyle | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-enclosed-style") === "enlarge" ? "enlarge" : null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.style === "enlarge" ? { "data-enclosed-style": "enlarge" } : {},
      },
      unit: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          normalizeEnclosedCharUnit(element.getAttribute("data-enclosed-unit")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const unit = normalizeEnclosedCharUnit(attrs.unit);
          return unit ? { "data-enclosed-unit": unit } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-enclosed-char]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const style = enclosedCharCss(
      coerceEnclosedCharShape(mark.attrs.shape),
      normalizeEnclosedCharStyle(mark.attrs.style),
    );
    return ["span", mergeAttributes(HTMLAttributes, { style }), 0];
  },

  addCommands() {
    return {
      toggleEnclosedChar:
        (shape?: string, style?: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (editor.isDestroyed || !editor.isEditable) return false;
          const { from, to, empty } = tr.selection;
          if (empty) return false;
          // Word encloses ONE unit of the selection: its first character, or
          // its first two half-width characters. Find where the selection's
          // first text begins and take the unit from that text node.
          let unitFrom = -1;
          let unitText = "";
          let unitMark: ProseMirrorMark | null = null;
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (unitFrom >= 0) return false;
            if (!node.isText || typeof node.text !== "string") return true;
            const start = Math.max(from, pos);
            const end = Math.min(to, pos + node.nodeSize);
            const selected = node.text.slice(start - pos, end - pos);
            const offset = selected.search(/\S/u);
            if (offset < 0) return false;
            unitFrom = start + offset;
            unitMark = node.marks.find((m) => m.type.name === ENCLOSED_CHAR_MARK_NAME) ?? null;
            return false;
          });
          if (unitFrom >= 0) {
            // The unit is read from the selected TEXT, not from one run: a
            // bold "1" next to a plain "0" is still the two half-width
            
            const $unit = tr.doc.resolve(unitFrom);
            const blockEnd = $unit.end();
            const readTo = Math.min(to, blockEnd);
            let followed = "";
            let cursor = unitFrom;
            $unit.parent.nodesBetween(
              unitFrom - $unit.start(),
              readTo - $unit.start(),
              (child, offset) => {
                const childFrom = $unit.start() + offset;
                if (childFrom + child.nodeSize <= cursor) return false;
                if (!child.isText || childFrom > cursor) {
                  cursor = Number.POSITIVE_INFINITY;
                  return false;
                }
                const sliceEnd = Math.min(readTo, childFrom + child.nodeSize);
                followed += (child.text ?? "").slice(cursor - childFrom, sliceEnd - childFrom);
                cursor = sliceEnd;
                return false;
              },
            );
            unitText = enclosedCharUnitText(followed);
          }
          if (unitFrom < 0 || !isEnclosedCharFieldText(unitText)) return false;
          const markType = state.schema.marks[ENCLOSED_CHAR_MARK_NAME];
          if (!markType) return false;
          const unitTo = unitFrom + unitText.length;
          const targetShape = coerceEnclosedCharShape(shape);
          const targetStyle = normalizeEnclosedCharStyle(style);
          const current = unitMark as ProseMirrorMark | null;
          // The same enclosure chosen again removes it (Word's style None).
          let alreadyEnclosed = false;
          if (current) {
            let whole = true;
            tr.doc.nodesBetween(unitFrom, unitTo, (node) => {
              if (!node.isText) return;
              whole &&= node.marks.some((m) => m.eq(current));
            });
            alreadyEnclosed =
              whole &&
              coerceEnclosedCharShape(current.attrs.shape) === targetShape &&
              normalizeEnclosedCharStyle(current.attrs.style) === targetStyle;
          }
          if (dispatch) {
            tr.removeMark(unitFrom, unitTo, markType);
            if (!alreadyEnclosed) {
              tr.addMark(unitFrom, unitTo, markType.create({
                shape: targetShape,
                style: targetStyle === "enlarge" ? "enlarge" : null,
                unit: newEnclosedCharUnit(),
              }));
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export const DocumentEnclosedChar = EnclosedCharMark;

export default DocumentEnclosedChar;
