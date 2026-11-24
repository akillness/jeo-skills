"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Chinese Typography / 中文版式 — TipTap wiring for three character-layout
 * features that Word and WPS Writer expose under the "中文版式" sub-menu of the
 * Format / 格式 menu:
 *
 *   1. 縦中横 / tate-chu-yoko (竖排中横向排列数字): a short horizontal run (digits
 *      or Roman letters) rendered upright inside a vertically-set paragraph.  In
 *      OOXML: `<w:eastAsianLayout w:vert="1"/>` inside the run's `<w:rPr>`. In
 *      CSS: rotate the span 90° CCW inside a vertical-rl ancestor so the glyphs
 *      face the reader upright.
 *
 *   2. 合并字符 (combine characters): one to six characters are squeezed together
 *      to occupy a single character-width slot with an optional surrounding
 *      bracket.  Word writes it as an EQ field, `eq \o(\s\up 6(合并),\s\do 2(字符))`
 *      (measured in Word 16.86): the characters in two half-size rows over one
 *      another; drawn here by {@link combineCharactersRows} and a decoration.
 *
 *   3. 双行合一 (two-lines-in-one / 两行拍): a phrase is stacked as two half-height
 *      rows fitting inside a single line height, with an optional bracket. In
 *      OOXML: `<w:eastAsianLayout w:combine="1" w:combineBrackets="…"/>` applied
 *      to the run (same element as 合并字符 — the authoring distinction is captured
 *      in the mark's `feature` attribute so we can render and export faithfully).
 *      In CSS: `font-size:50%; line-height:1; white-space:normal; display:inline-
 *      flex; flex-direction:column` approximation of two stacked rows.
 *
 * OOXML SCHEMA — CT_EastAsianLayout (ECMA-376 §17.3.2.9):
 *   w:id            optional run id (omitted in our output — Word auto-assigns)
 *   w:vert          "1" / "0" → tate-chu-yoko on/off
 *   w:vertCompress  "1" / "0" → compress vertical run height (companion of vert)
 *   w:combine       "1" / "0" → combine / two-lines-in-one on/off
 *   w:combineBrackets  "none" | "round" | "square" | "angle" | "curly"
 *
 * ADDITIVE: registering this extension adds ONE inline mark ("eastAsianLayout")
 * carrying a whitelisted `feature` attr and an optional `brackets` attr. It
 * round-trips through the document schema's open `marks` passthrough (see
 * lib/native-page-schemas → documentDocAttrsSchema), so EXISTING documents —
 * which carry none — still validate and load byte-for-byte unchanged. There is
 * no flag: the feature is purely opt-in per user action; a document with no
 * eastAsianLayout marks behaves, renders, and EXPORTS exactly as before.
 *
 * SECURITY: both `feature` and `brackets` are CLOSED whitelists. Stored command
 * values funnel through {@link normalizeEalFeature} / {@link normalizeEalBrackets},
 * while HTML admission requires exact canonical enum values and one authenticated
 * direct content wrapper. Forged wrappers are rejected instead of being coerced
 * to a default. Each admitted combination maps to a fixed, developer-authored
 * CSS fragment via {@link eastAsianLayoutCss} (single source of truth), so no CSS
 * injection is possible.
 */

/** The inline mark name for an eastAsianLayout (中文版式) run. */
export const EAL_MARK_NAME = "eastAsianLayout";

/**
 * The three supported 中文版式 features. Each maps to a distinct in-editor
 * rendering and a distinct OOXML attribute combination on `<w:eastAsianLayout>`.
 */
export const EAL_FEATURE_VALUES = ["tateChuYoko", "combineChars", "twoLinesInOne"] as const;
export type EalFeature = (typeof EAL_FEATURE_VALUES)[number];

/** Default feature when none / unknown is supplied. */
export const DEFAULT_EAL_FEATURE: EalFeature = "tateChuYoko";

const EAL_FEATURE_SET = new Set<string>(EAL_FEATURE_VALUES);

/**
 * The bracket styles for 合并字符 / 双行合一 (`w:combineBrackets`). `none` means
 * no enclosing bracket; the others add the matching bracket pair around the run.
 */
export const EAL_BRACKETS_VALUES = ["none", "round", "square", "angle", "curly"] as const;
export type EalBrackets = (typeof EAL_BRACKETS_VALUES)[number];

export const DEFAULT_EAL_BRACKETS: EalBrackets = "none";

const EAL_BRACKETS_SET = new Set<string>(EAL_BRACKETS_VALUES);

/**
 * Map an arbitrary stored / imported value to a whitelisted {@link EalFeature},
 * or null when the value is unusable. Casing/whitespace are tolerated. Anything
 * outside the closed set returns null.
 */
export function normalizeEalFeature(value: unknown): EalFeature | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  // Accept camelCase canonical form or lowercase (for forward compat).
  const lower = v.toLowerCase();
  // Direct match (camelCase canonical).
  if (EAL_FEATURE_SET.has(v)) return v as EalFeature;
  // Lowercase variant mapping.
  switch (lower) {
    case "tatechuyoko":
    case "tate-chu-yoko":
    case "vert":
      return "tateChuYoko";
    case "combinechars":
    case "combine-chars":
    case "combinecharacters":
      return "combineChars";
    case "twolinesinone":
    case "two-lines-in-one":
    case "twolines":
      return "twoLinesInOne";
    default:
      return null;
  }
}

/** Coerce to a usable feature, defaulting to tateChuYoko. */
export function coerceEalFeature(value: unknown): EalFeature {
  return normalizeEalFeature(value) ?? DEFAULT_EAL_FEATURE;
}

/**
 * Map an arbitrary stored / imported `w:combineBrackets` value to a whitelisted
 * {@link EalBrackets}, or null when the value is unusable / "none".
 */
export function normalizeEalBrackets(value: unknown): EalBrackets | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v || v === "none") return null;
  return EAL_BRACKETS_SET.has(v) ? (v as EalBrackets) : null;
}

/** Coerce to a usable bracket style, defaulting to "none". */
export function coerceEalBrackets(value: unknown): EalBrackets {
  return normalizeEalBrackets(value) ?? DEFAULT_EAL_BRACKETS;
}

/**
 * Return the bracket characters for a {@link EalBrackets} value, or null for
 * "none". The open bracket is [0], the close bracket is [1].
 */
export function ealBracketPair(brackets: EalBrackets): [string, string] | null {
  switch (brackets) {
    case "round":  return ["（", "）"];
    case "square": return ["【", "】"];
    case "angle":  return ["〈", "〉"];
    case "curly":  return ["｛", "｝"];
    case "none":
    default:
      return null;
  }
}

/**
 * The concrete inline CSS each feature/bracket combination renders as (single
 * source of truth). A fixed, developer-authored string — never interpolated with
 * user input — so no CSS injection is possible.
 *
 * - tateChuYoko: render inline-block rotating text upright in vertical context.
 *   In a vertical-rl container the text is rotated 90° CW, so counter-rotating
 *   90° CCW produces upright horizontal digits/letters. We approximate this with
 *   a class that the editor's global CSS will style correctly; the inline style
 *   sets the data attr so CSS can key on it without !important hacks.
 *
 * - combineChars: compress the run to fit in ≈1 em (the "shrink text into one
 *   character" appearance). `display:inline-block; transform:scaleX(…)` with
 *   a scale factor based on a 6-char maximum.
 *
 * - twoLinesInOne: stack as two half-height rows. We split on a zero-width
 *   joiner boundary in the CSS; since we can't split the text in CSS we show a
 *   compressed single-row approximation with a "two lines" visual hint.
 */
export function eastAsianLayoutCss(feature: EalFeature): string {
  switch (feature) {
    case "tateChuYoko":
      // Upright horizontal run inside vertical-rl parent. The inline-block with
      // text-combine-upright is the CSS standard property for exactly this feature.
      return [
        "text-combine-upright:all",
        "-webkit-text-combine:horizontal",
        "display:inline",
      ].join(";");

    case "combineChars":
      // Drawn by the combine-characters decoration (two half-size rows over
      // one another, `combineCharactersRows`); the run's own characters are
      // kept in the document and hidden. A scaled one-row box kept its
      // unscaled width as a blank after the characters.
      return "white-space:nowrap";

    case "twoLinesInOne":
      // Drawn by the same decoration as Combine Characters, as two half-size
      // lines one above the other between full-size brackets
      // (`twoLinesInOneRows`). A single text node cannot be split by CSS: the
      // run drawn as one column showed one small line, with its brackets set
      // above and below it (WUA 088).
      return "white-space:nowrap";

    default:
      return "";
  }
}

/** The Word `w:combineBrackets` value for a given {@link EalBrackets}. */
export function ealBracketsToWordVal(brackets: EalBrackets): string {
  // Word's enum: none / round / square / angle / curly — match our values 1:1.
  return brackets;
}

// ---------------------------------------------------------------------------
// TipTap Commands type extension
// ---------------------------------------------------------------------------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentEastAsianLayout: {
      /**
       * Toggle one of the three 中文版式 features on the current selection.
       * `feature` selects the mode; `brackets` is the optional enclosure style for
       * 合并字符 / 双行合一 (ignored for 縦中横). Mirrors toggleEmphasisDots: a collapsed
       * cursor inside a marked run removes the whole run (extendEmptyMarkRange).
       */
      toggleEastAsianLayout: (feature: string, brackets?: string) => ReturnType;
      /** Clear 中文版式 from an exact non-empty text selection. */
      clearEastAsianLayout: () => ReturnType;
    };
  }
}

interface SelectedEalTextRange {
  from: number;
  to: number;
  feature: EalFeature | null;
  brackets: EalBrackets | null;
  marked: boolean;
}

function canonicalEalBrackets(value: unknown): EalBrackets | null {
  if (typeof value === "string" && value.trim().toLowerCase() === "none") {
    return "none";
  }
  return normalizeEalBrackets(value);
}

function selectedEalTextRanges(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): { ranges: SelectedEalTextRange[]; malformed: boolean } {
  const ranges: SelectedEalTextRange[] = [];
  let malformed = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const selectedFrom = Math.max(from, pos);
    const selectedTo = Math.min(to, pos + node.nodeSize);
    if (selectedTo <= selectedFrom) return;
    const mark = node.marks.find(
      (candidate) => candidate.type.name === EAL_MARK_NAME,
    );
    const feature = mark ? normalizeEalFeature(mark.attrs.feature) : null;
    let brackets: EalBrackets | null = null;
    if (mark && !feature) malformed = true;
    if (feature) {
      brackets =
        feature === "tateChuYoko"
          ? "none"
          : canonicalEalBrackets(mark?.attrs.brackets);
      if (!brackets) malformed = true;
    }
    ranges.push({
      from: selectedFrom,
      to: selectedTo,
      feature,
      brackets,
      marked: Boolean(mark),
    });
  });
  return { ranges, malformed };
}

// ---------------------------------------------------------------------------
// HTML parse authority
// ---------------------------------------------------------------------------

function readEalFeature(element: HTMLElement): EalFeature | null {
  const value = element.getAttribute("data-eal-feature");
  return value !== null && EAL_FEATURE_SET.has(value)
    ? (value as EalFeature)
    : null;
}

function readEalBrackets(element: HTMLElement): EalBrackets | null {
  const value = element.getAttribute("data-eal-brackets");
  if (value === null) return "none";
  return EAL_BRACKETS_SET.has(value) ? (value as EalBrackets) : null;
}

function directEalContentChild(element: HTMLElement): HTMLElement | null {
  const contentElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-eal-content]"),
  );
  if (contentElements.length !== 1) return null;
  const [content] = contentElements;
  if (
    content.parentElement !== element ||
    content.tagName !== "SPAN" ||
    content.getAttribute("data-eal-content") !== "" ||
    content.attributes.length !== 1 ||
    content.querySelector(
      "[data-eal-content], [data-eal-feature], [data-eal-bracket]",
    )
  ) {
    return null;
  }
  return content;
}

function isExactEalBracketElement(
  node: ChildNode,
  side: "open" | "close",
  glyph: string,
): boolean {
  if (!(node instanceof HTMLElement) || node.tagName !== "SPAN") return false;
  return (
    node.attributes.length === 2 &&
    node.getAttribute("data-eal-bracket") === side &&
    node.getAttribute("contenteditable") === "false" &&
    node.childNodes.length === 1 &&
    node.firstChild?.nodeType === Node.TEXT_NODE &&
    node.textContent === glyph
  );
}

interface EalHtmlAuthority {
  feature: EalFeature;
  brackets: EalBrackets;
  content: HTMLElement;
}

function readEalHtmlAuthority(element: HTMLElement): EalHtmlAuthority | null {
  const feature = readEalFeature(element);
  const brackets = readEalBrackets(element);
  const content = directEalContentChild(element);
  if (!feature || !brackets || !content) return null;
  if (feature === "tateChuYoko" && brackets !== "none") return null;

  const pair = ealBracketPair(brackets);
  if (!pair) {
    return element.childNodes.length === 1 && element.firstChild === content
      ? { feature, brackets, content }
      : null;
  }
  if (
    element.childNodes.length !== 3 ||
    element.childNodes[1] !== content ||
    !isExactEalBracketElement(element.childNodes[0], "open", pair[0]) ||
    !isExactEalBracketElement(element.childNodes[2], "close", pair[1])
  ) {
    return null;
  }
  return { feature, brackets, content };
}

function rejectEalHtmlWrapper(element: HTMLElement): void {
  const content = directEalContentChild(element);
  const safeChildren = content ? Array.from(content.childNodes) : [];
  element.replaceChildren(...safeChildren);
  element.removeAttribute("data-eal-feature");
  element.removeAttribute("data-eal-brackets");
  element.removeAttribute("style");
}

// ---------------------------------------------------------------------------
// Combine Characters (合并字符): Word's two half-size rows
// ---------------------------------------------------------------------------

/** The ideographic space Word pads a one- or two-character combination with. */
const IDEOGRAPHIC_SPACE = "\u3000";

/**
 * The two rows Word draws a Combine Characters run in, measured in Word 16.86
 * (Home ▸ Asian Layout ▸ Combine Characters, the EQ field it writes):
 *   1 char  → "字　" over "　"        2 chars → "合　" over "　并"
 *   3 chars → 2 over 1                4 chars → 2 over 2
 *   5 chars → 2 over 3                6 chars → 3 over 3
 * Each row is set at half the text's size; with five or more characters both
 * rows are also scaled to 66 % across (`w:w="66"`). Word combines at most six;
 * a longer run (an imported one) splits the same way as five and six.
 */
export function combineCharactersRows(text: string): {
  readonly rows: readonly [string, string];
  readonly scaled: boolean;
} {
  const chars = Array.from(text);
  const n = chars.length;
  if (n <= 1) return { rows: [`${chars[0] ?? ""}${IDEOGRAPHIC_SPACE}`, IDEOGRAPHIC_SPACE], scaled: false };
  if (n === 2) {
    return { rows: [`${chars[0]}${IDEOGRAPHIC_SPACE}`, `${IDEOGRAPHIC_SPACE}${chars[1]}`], scaled: false };
  }
  const first = n === 3 ? 2 : Math.floor(n / 2);
  return {
    rows: [chars.slice(0, first).join(""), chars.slice(first).join("")],
    scaled: n >= 5,
  };
}

/**
 * The two lines Word sets a Two Lines in One run in (Home ▸ Asian Layout ▸
 * Two Lines in One, `w:eastAsianLayout w:combine="1"`): the first half of
 * the characters over the second, each line at half the text's size, the
 * first line taking the odd character.
 */
export function twoLinesInOneRows(text: string): readonly [string, string] {
  const chars = Array.from(text);
  const first = Math.ceil(chars.length / 2);
  return [chars.slice(0, first).join(""), chars.slice(first).join("")];
}

const combineCharactersKey = new PluginKey<DecorationSet>("documentCombineCharacters");

function isCombineMark(mark: { readonly type: { readonly name: string }; readonly attrs: Record<string, unknown> }): boolean {
  if (mark.type.name !== EAL_MARK_NAME) return false;
  const feature = coerceEalFeature(mark.attrs.feature);
  return feature === "combineChars" || feature === "twoLinesInOne";
}

/** The combined runs of one text block: each run's range, words and the
 * marks its drawing wears (the run's own formatting, its size above all). */
function combineDecorationsInBlock(
  block: ProseMirrorNode,
  blockStart: number,
  out: Decoration[],
): void {
  let run: {
    from: number;
    to: number;
    text: string;
    marks: readonly ProseMirrorMark[];
    mark: ProseMirrorMark;
  } | null = null;
  const flush = () => {
    if (!run || !run.text) return;
    const { from, to, text, marks } = run;
    const pair = coerceEalFeature(run.mark.attrs.feature) === "twoLinesInOne"
      ? ealBracketPair(coerceEalBrackets(run.mark.attrs.brackets))
      : null;
    const twoLines = coerceEalFeature(run.mark.attrs.feature) === "twoLinesInOne";
    const { rows, scaled } = twoLines
      ? { rows: twoLinesInOneRows(text), scaled: false }
      : combineCharactersRows(text);
    out.push(
      Decoration.inline(from, to, { class: "docs-eal-combine-source" }),
      Decoration.widget(
        from,
        (view) => {
          const doc = view.dom.ownerDocument;
          const box = doc.createElement("span");
          box.className = twoLines ? "docs-eal-combine docs-eal-two-lines" : "docs-eal-combine";
          box.setAttribute("contenteditable", "false");
          box.setAttribute("aria-hidden", "true");
          if (scaled) box.dataset.scaled = "true";
          for (const row of rows) {
            const line = doc.createElement("span");
            line.textContent = row;
            line.style.setProperty("--eal-row-chars", String(Array.from(row).length));
            box.append(line);
          }
          // Two Lines in One's brackets enclose the two lines (Word: "(测/试)"):
          // drawn with them, the mark's own brackets standing beside the
          // drawing are hidden (note-editor.css), else the lines stood in
          // front of an empty pair.
          if (!pair) return box;
          const framed = doc.createElement("span");
          framed.className = "docs-eal-two-lines-frame";
          framed.setAttribute("contenteditable", "false");
          framed.setAttribute("aria-hidden", "true");
          const open = doc.createElement("span");
          open.textContent = pair[0];
          const close = doc.createElement("span");
          close.textContent = pair[1];
          framed.append(open, box, close);
          return framed;
        },
        {
          side: -1,
          marks: marks.filter((mark) => mark.type.name !== EAL_MARK_NAME),
          ignoreSelection: true,
          key: `eal-combine:${twoLines ? `2${pair ? pair[0] : ""}` : ""}${scaled ? "s" : ""}:${rows[0]}\u0000${rows[1]}`,
        },
      ),
    );
  };
  block.forEach((child, offset) => {
    const pos = blockStart + 1 + offset;
    const mark = child.isText ? child.marks.find(isCombineMark) : undefined;
    if (mark && run && run.mark.eq(mark) && run.to === pos) {
      run.to = pos + child.nodeSize;
      run.text += child.text ?? "";
      return;
    }
    flush();
    run = mark
      ? { from: pos, to: pos + child.nodeSize, text: child.text ?? "", marks: child.marks, mark }
      : null;
  });
  flush();
}

function combineDecorations(doc: ProseMirrorNode): DecorationSet {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    combineDecorationsInBlock(node, pos, out);
    return false;
  });
  return out.length ? DecorationSet.create(doc, out) : DecorationSet.empty;
}

/** Only the text blocks a transaction touched are read again. */
function remapCombineDecorations(set: DecorationSet, tr: Transaction): DecorationSet {
  let next = set.map(tr.mapping, tr.doc);
  const touched = new Map<number, ProseMirrorNode>();
  tr.mapping.maps.forEach((map, index) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const rest = tr.mapping.slice(index + 1);
      const from = rest.map(newStart, -1);
      const to = rest.map(newEnd, 1);
      tr.doc.nodesBetween(from, Math.min(to, tr.doc.content.size), (node, pos) => {
        if (!node.isTextblock) return true;
        touched.set(pos, node);
        return false;
      });
    });
  });
  // A step that changes marks moves no position: its step map is empty, so
  // the ranges above never saw it. Applying Two Lines in One or Combine
  // Characters is exactly such a step, and the run kept being drawn as plain
  
  tr.steps.forEach((step, index) => {
    const range = step as unknown as { from?: unknown; to?: unknown };
    if (typeof range.from !== "number" || typeof range.to !== "number") return;
    const rest = tr.mapping.slice(index + 1);
    const from = rest.map(range.from, -1);
    const to = rest.map(range.to, 1);
    tr.doc.nodesBetween(Math.max(0, from), Math.min(to, tr.doc.content.size), (node, pos) => {
      if (!node.isTextblock) return true;
      touched.set(pos, node);
      return false;
    });
  });
  if (touched.size === 0) return next;
  for (const [pos, block] of touched) {
    next = next.remove(next.find(pos, pos + block.nodeSize));
    const out: Decoration[] = [];
    combineDecorationsInBlock(block, pos, out);
    if (out.length) next = next.add(tr.doc, out);
  }
  return next;
}

/** The Combine Characters drawing as a ProseMirror plugin (decorations only:
 * the document keeps the run's characters as they are). */
export function combineCharactersPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: combineCharactersKey,
    state: {
      init: (_config, state: EditorState) => combineDecorations(state.doc),
      apply: (tr, set) => (tr.docChanged ? remapCombineDecorations(set, tr) : set),
    },
    props: {
      decorations: (state) => combineCharactersKey.getState(state),
    },
  });
}

// ---------------------------------------------------------------------------
// The Mark
// ---------------------------------------------------------------------------

const EastAsianLayoutMark = Mark.create({
  name: EAL_MARK_NAME,

  /**
   * Two marks with the same feature but different brackets are DIFFERENT
   * annotations, so they should not be merged. Setting `keepOnSplit` false and
   * not overriding `spanning` lets TipTap's default equality check (deep attr
   * comparison) merge adjacent runs with identical attrs only.
   */

  addAttributes() {
    return {
      feature: {
        default: DEFAULT_EAL_FEATURE as EalFeature,
        parseHTML: (element: HTMLElement) => readEalFeature(element),
        renderHTML: (attrs: Record<string, unknown>) => {
          const feature = coerceEalFeature(attrs.feature);
          return { "data-eal-feature": feature };
        },
      },
      brackets: {
        default: DEFAULT_EAL_BRACKETS as EalBrackets,
        parseHTML: (element: HTMLElement) => readEalBrackets(element),
        renderHTML: (attrs: Record<string, unknown>) => {
          const brackets = coerceEalBrackets(attrs.brackets);
          return brackets !== "none" ? { "data-eal-brackets": brackets } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-eal-feature]",
        getAttrs: (element: HTMLElement) => {
          const authority = readEalHtmlAuthority(element);
          if (!authority) {
            rejectEalHtmlWrapper(element);
            return false;
          }
          return {
            feature: authority.feature,
            brackets: authority.brackets,
          };
        },
        contentElement: (element: HTMLElement) =>
          directEalContentChild(element) ??
          element.ownerDocument.createElement("span"),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const feature = coerceEalFeature(
      (HTMLAttributes as Record<string, unknown>)["data-eal-feature"],
    );
    const brackets = coerceEalBrackets(
      (HTMLAttributes as Record<string, unknown>)["data-eal-brackets"],
    );
    // Merge the CSS into the element; bracket pairs wrap the content in the
    // HTML output as prefix/suffix text nodes in the renderHTML spec array so
    // they are visible even without CSS.
    const pair = ealBracketPair(brackets);
    const cssStyle = eastAsianLayoutCss(feature);
    const mergedAttrs = mergeAttributes(HTMLAttributes, {
      style: cssStyle,
    });
    return pair
      ? [
          "span",
          mergedAttrs,
          [
            "span",
            {
              "data-eal-bracket": "open",
              contenteditable: "false",
            },
            pair[0],
          ],
          ["span", { "data-eal-content": "" }, 0],
          [
            "span",
            {
              "data-eal-bracket": "close",
              contenteditable: "false",
            },
            pair[1],
          ],
        ]
      : ["span", mergedAttrs, ["span", { "data-eal-content": "" }, 0]];
  },

  addCommands() {
    return {
      toggleEastAsianLayout:
        (feature: string, brackets?: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (editor.isDestroyed || !editor.isEditable) return false;
          const targetFeature = normalizeEalFeature(feature);
          if (!targetFeature || tr.selection.empty) return false;
          const targetBrackets =
            targetFeature === "tateChuYoko"
              ? "none"
              : canonicalEalBrackets(brackets ?? "none");
          if (!targetBrackets) return false;

          const { from, to } = tr.selection;
          const selected = selectedEalTextRanges(tr.doc, from, to);
          if (selected.malformed || selected.ranges.length === 0) return false;
          const uniformlyTarget = selected.ranges.every(
            (range) =>
              range.feature === targetFeature &&
              range.brackets === targetBrackets,
          );
          const markType = state.schema.marks[EAL_MARK_NAME];
          if (!markType) return false;
          if (dispatch) {
            closeHistory(tr);
            for (const range of selected.ranges) {
              tr.removeMark(range.from, range.to, markType);
              if (!uniformlyTarget) {
                tr.addMark(
                  range.from,
                  range.to,
                  markType.create({
                    feature: targetFeature,
                    brackets: targetBrackets,
                  }),
                );
              }
            }
            dispatch(tr);
          }
          return true;
        },
      clearEastAsianLayout:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (editor.isDestroyed || !editor.isEditable || tr.selection.empty) {
            return false;
          }
          const { from, to } = tr.selection;
          const selected = selectedEalTextRanges(tr.doc, from, to);
          if (selected.malformed || selected.ranges.length === 0) return false;
          const markedRanges = selected.ranges.filter((range) => range.marked);
          if (markedRanges.length === 0) return true;
          const markType = state.schema.marks[EAL_MARK_NAME];
          if (!markType) return false;
          if (dispatch) {
            closeHistory(tr);
            for (const range of markedRanges) {
              tr.removeMark(range.from, range.to, markType);
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export const DocumentEastAsianLayout = EastAsianLayoutMark.extend({
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), combineCharactersPlugin()];
  },
});

export default DocumentEastAsianLayout;
