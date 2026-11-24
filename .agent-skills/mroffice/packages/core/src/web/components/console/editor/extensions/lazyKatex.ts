/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  wordDisplayGroupLines,
  wordDisplayLatex,
  wordMathGroupLayout,
  wordMathLine,
  wordMathLineWithoutPoints,
  wrappableDisplayLatex,
  type WordMathLine,
  type WordMathLineExtent,
} from "./wordDisplayMath";
import { wordDisplayMathExtents } from "./wordMathMetrics";
import { officeMathLatex } from "./officeMathSpacing";
import { applyOfficeMathFit, drawnHere, officeMathFit } from "./officeMathFit";
import { katexNodeWidth } from "../../../../lib/katex-tree-width";
import katex from "katex";
import { KATEX_DRAWABLE_STRICT_CODES, katexStrict, prepareLatexForKatex } from "../../../../lib/katex-render";
import { equationSlotTrust, latexWithSlotsDrawn } from "./equationLiveLatex";
import { sheetsOf } from "../native-document/paged/sheetMeasureMemo";

// Shared lazy-KaTeX machinery for the math node views.
//
// A formula-heavy import (a math textbook projects to ~10k inlineMath/
// mathBlock nodes) used to render EVERY formula synchronously on mount:
// ~1-5ms of KaTeX per node froze the main thread for tens of seconds and
// made the page feel hung right after upload. Instead, node views paint a
// cheap textual placeholder and typeset only when scrolled near the
// viewport, and identical formulas share one KaTeX parse via a string cache
// (textbooks repeat symbols constantly).

const cache = new Map<string, string>();
// (A reset past this reads every formula again: a 272-page book holds 4,569
// different ones, and its print typeset 8,557 at 2-3 ms each.)
const MAX_CACHE_ENTRIES = 12_000;

function rememberMarkup(key: string, html: string): string {
  // Simple full-reset bound: pathological documents can't grow the cache
  // unboundedly, and a reset just re-parses on demand.
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, html);
  return html;
}

export type InlineMathStyle = "office" | null;

/**
 * Final KaTeX box geometry used while the live formula is still lazy.
 *
 * The placeholder deliberately stores geometry rather than rendered HTML:
 * pagination can remain Word-stable without mounting thousands of KaTeX DOM
 * trees in the editable surface. `baselineDepth` is only meaningful for an
 * inline formula and is the distance from its bottom edge to the surrounding
 * text baseline.
 */
export interface LazyMathPlaceholderGeometry {
  width: number;
  height: number;
  baselineDepth: number;
  kind: "inline" | "block";
  /** KaTeX broke the typeset formula over lines: no box stands for it, so
   * it is typeset in the page instead (renderLazyMathNow). */
  wraps?: boolean;
}

/** On a measuring clone's formula whose box is known already: it stands as its
 * placeholder, is not typeset and is not read (ledgerFormulaBoxes). */
export const KNOWN_FORMULA_ATTR = "data-math-known";

const PLACEHOLDER_WIDTH = "--math-placeholder-width";
const PLACEHOLDER_HEIGHT = "--math-placeholder-height";
const PLACEHOLDER_DEPTH = "--math-placeholder-depth";

/** Apply an equal-geometry box to a pending raw-LaTeX preview. */
export function applyLazyMathPlaceholderGeometry(
  el: HTMLElement,
  geometry: LazyMathPlaceholderGeometry,
): void {
  if (
    !Number.isFinite(geometry.width) ||
    !Number.isFinite(geometry.height) ||
    !Number.isFinite(geometry.baselineDepth) ||
    geometry.width < 0 ||
    geometry.height < 0 ||
    geometry.baselineDepth < 0
  ) {
    return;
  }
  // Every pagination pass re-applies the geometry of every pending formula;
  // rewriting an unchanged value still invalidated each one's style (10k
  // formulas in a math textbook: seconds per pass). Write only what changed.
  if (el.getAttribute("data-math-layout-ready") !== geometry.kind) {
    el.setAttribute("data-math-layout-ready", geometry.kind);
  }
  setPlaceholderProperty(el, PLACEHOLDER_WIDTH, `${geometry.width}px`);
  setPlaceholderProperty(el, PLACEHOLDER_HEIGHT, `${geometry.height}px`);
  setPlaceholderProperty(el, PLACEHOLDER_DEPTH, `${geometry.baselineDepth}px`);
}

function setPlaceholderProperty(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

/** Remove stale placeholder constraints once real KaTeX owns the box. */
export function clearLazyMathPlaceholderGeometry(el: HTMLElement): void {
  el.removeAttribute("data-math-layout-ready");
  el.style.removeProperty(PLACEHOLDER_WIDTH);
  el.style.removeProperty(PLACEHOLDER_HEIGHT);
  el.style.removeProperty(PLACEHOLDER_DEPTH);
}

/** Normalize the only non-default inline-math layout style. */
export function normalizeInlineMathStyle(value: unknown): InlineMathStyle {
  return value === "office" ? "office" : null;
}

/**
 * Return the source used by an INLINE KaTeX renderer.
 *
 * Word distinguishes an inline `<m:oMath>` from a display
 * `<m:oMathPara>`. The latter is already represented by `mathBlock` and is
 * rendered with KaTeX's `displayMode`; promoting every Office inline atom to
 * `\\displaystyle` made fractions, limits and large operators acquire display
 * metrics inside ordinary prose. Besides looking unlike Word, those inflated
 * thousands of line boxes and therefore the physical page count. Keep the
 * style argument for the stable helper signature, but leave inline Office math
 * in text style just like any other inline formula.
 */
export function mathLatexForRender(latex: string, style: unknown): string {
  void style;
  return latex;
}

/**
 * Render one trusted editor preview through the same lightweight KaTeX seam
 * used by passive formulas.
 *
 * Unlike `renderKatexCached`, this helper rejects invalid input so a source
 * editor can keep its existing all-or-zero commit boundary. `trust: false`
 * also keeps URL/style-like LaTeX commands from becoming HTML authority.
 *
 * A character KaTeX has no metrics for (Chinese, an accented letter, ℃, €,
 * ′, a character the Equation gallery inserts) is not invalid: Office Math
 * stores any character, and MathLive keeps what is typed as is. KaTeX draws
 * it in the fallback font, so its coverage warnings are ignored; only real
 * syntax errors and untrusted commands are refused. Refusing them made an
 * equation holding typed Chinese impossible to commit, and drawn as raw TeX
 * where a path stored it without the check.
 */
export function renderValidatedKatexMarkup(
  latex: string,
  displayMode = false,
): string | null {
  const key = `V:${displayMode ? "D" : "I"}:${latex}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  try {
    return rememberMarkup(key, katex.renderToString(latexForKatex(latex), validatedKatexOptions(displayMode)));
  } catch {
    return null;
  }
}

/** What KaTeX is given for a stored formula: its empty slots drawn and its
 * math-level CJK / full-width text in `\text{}` (lib/katex-render). The
 * stored source is unchanged. */
function latexForKatex(latex: string): string {
  return prepareLatexForKatex(latexWithSlotsDrawn(latex));
}

/** The options every validated rendering uses (markup or layout tree). */
function validatedKatexOptions(displayMode: boolean): katex.KatexOptions {
  return {
    displayMode,
    // htmlExtension is \htmlClass itself; which ones may draw is the
    // trust check below (only the empty-slot class).
    // LaTeX-compatibility notes are not errors: a text accent in math (a
    // recognizer's \textcircled{S}), a newline in a display, a trailing
    // comment draw as KaTeX draws them; the whole equation stood as its raw
    
    strict: (errorCode: string) =>
      KATEX_DRAWABLE_STRICT_CODES.has(errorCode) ? "ignore" : "error",
    throwOnError: true,
    // Only the class an empty argument slot is drawn with
    // (latexWithSlotsDrawn); any other trusted command is refused.
    trust: (context) => {
      if (equationSlotTrust(context)) return true;
      throw new Error("Trusted LaTeX commands are not supported");
    },
  };
}

/** A node of KaTeX's HTML tree (`__renderToHTMLTree`): what it draws, before any DOM. */
export interface KatexHtmlTreeNode {
  readonly classes?: readonly string[];
  readonly style?: Readonly<Record<string, string | undefined>>;
  readonly children?: readonly KatexHtmlTreeNode[];
  readonly height?: number;
  readonly depth?: number;
  /** A symbol: its characters, advance width and italic correction (em). */
  readonly text?: string;
  readonly width?: number;
  readonly italic?: number;
}

/**
 * The HTML tree renderValidatedKatexMarkup draws `latex` from, with the same
 * options, or null when it refuses it: for laying a formula out where there
 * is no DOM (the command host).
 */
export function validatedKatexHtmlTree(latex: string, displayMode = false): KatexHtmlTreeNode | null {
  const render = (katex as unknown as {
    __renderToHTMLTree?: (expression: string, options: katex.KatexOptions) => KatexHtmlTreeNode;
  }).__renderToHTMLTree;
  if (!render) return null;
  try {
    return render(latexForKatex(latex), validatedKatexOptions(displayMode));
  } catch {
    return null;
  }
}

/**
 * Whether `latex` has been typeset before, in either placement. A formula
 * the reader has already seen must not fall back to the raw-LaTeX
 * placeholder when its node view is rebuilt — an inline ↔ display
 * conversion, a page re-split, an undo all recreate the view — so the view
 * typesets it synchronously instead of waiting for the IntersectionObserver
 * (the one-frame flash of TeX the reader reported).
 */
export function hasKatexMarkupCached(latex: string): boolean {
  return cache.has("D:" + latex) || cache.has("I:" + latex) || cache.has("OD:" + latex) || cache.has("OI:" + latex);
}

/** Render `latex` into `el`, reusing the cached KaTeX HTML for repeats. */
/** On a display formula's preview: it may break into lines (wordDisplayMath). */
export { INLINE_FORMULA_TYPESET_EVENT } from "../native-document/documentLayoutStatus";
export const DISPLAY_MATH_WRAPS_ATTR = "data-math-wraps";
/**
 * On a wrapping formula with a matrix: it may run a little past its column
 * before it breaks. KaTeX sets a matrix wider than Cambria Math does (the book's
 * Kronecker product: 417 pt here, 383 pt in Word), so one Word sets on one line
 * would break here by a few pixels.
 */
export const DISPLAY_MATH_MATRIX_ATTR = "data-math-matrix";
const MATRIX_ENVIRONMENT = /\\begin\{[a-zA-Z]*matrix\*?\}/u;
/** On an in-line formula's preview: Word's display equation among a paragraph's words. */
export const INLINE_DISPLAY_MATH_ATTR = "data-math-display";
/**
 * Whether a preview is typeset as a display formula: a block one, or Word's
 * display equation among a paragraph's words. Every typesetting of a preview
 * (the page's, a measuring clone's, the print's) asks this one question: the
 * clone typeset an in-paragraph display equation in-line (no breaking into
 * lines, KaTeX's in-line sizes), 10 px short of the page's on the book's
 * "d(d(f)p∘γ(s))ds", and the pages after it broke again as it was read.
 */
export function previewTypesetsAsDisplay(el: Element): boolean {
  return el.classList.contains("math-block-preview") || el.hasAttribute(INLINE_DISPLAY_MATH_ATTR);
}
const DISPLAY_MATH_GROUP_ATTR = "data-math-group";
/** On a preview: the zone's lines with their alignment points, JSON (`wordMathGroupOf`). */
export const WORD_MATH_ALIGNED_ATTR = "data-math-aligned";
/** Sent to a zone's other lines when one of its lines changed. */
export const WORD_MATH_LINE_MOVED_EVENT = "word-math-line-moved";
/** On a preview whose lines stand where their widths say. */
const WORD_MATH_PLACED_ATTR = "data-word-math-placed";
/** On a line drawn in two parts around its alignment point. */
const WORD_MATH_POINT_ATTR = "data-word-math-point";

const MARKUP_OPTIONS = { throwOnError: false, strict: katexStrict, trust: equationSlotTrust } as const;

function katexMarkup(latex: string, displayMode: boolean, office = false): string {
  // An imported Word formula is spaced as Word spaces it (officeMathSpacing).
  const source = office ? officeMathLatex(latex) : latex;
  // A display formula too long for its column breaks as Word's does: KaTeX
  // breaks only in its in-line mode, and a display style in it draws the same.
  const wrapping = displayMode ? wrappableDisplayLatex(source) : null;
  return katex.renderToString(latexForKatex(wrapping === null ? source : `\\displaystyle ${wrapping}`), {
    ...MARKUP_OPTIONS,
    displayMode: displayMode && wrapping === null,
  });
}

/**
 * On a breakable display formula (DISPLAY_MATH_WRAPS_ATTR), where the browser
 * has no hanging indent: its width on one line, as drawn. A formula that
 * breaks has its later lines an inch in, and Chromium never sizes a box below
 * its narrowest breaking, a later piece plus that inch: P(x) = |ψ(x)|² stood
 * in a box 59 px wider than itself, drawn at the box's left, the box centred.
 * Where `text-indent: … hanging` is understood the stylesheet sizes it alone
 * (note-editor.css); elsewhere it holds the box to this width.
 */
export const DISPLAY_MATH_LINE_WIDTH_PROPERTY = "--math-line-width";

let hangingIndent: boolean | undefined;
function hangingIndentSupported(): boolean {
  hangingIndent ??=
    typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("text-indent", "1px hanging");
  return hangingIndent;
}

const lineWidths = new Map<string, string | null>();
/**
 * DISPLAY_MATH_LINE_WIDTH_PROPERTY's value for display `latex` (null: not
 * breakable, or the browser needs none): KaTeX's own layout of the line it
 * draws, with an office formula's italic corrections (officeMathFit), read
 * from KaTeX's tree with no layout (within 0.3 px of the browser's,
 * lib/office-equation-katex-layout.ts), and a hair over so it never breaks a
 * line that fits.
 */
function breakableLineWidth(latex: string, office: boolean): string | null {
  if (hangingIndentSupported()) return null;
  const key = (office ? "O:" : ":") + latex;
  const known = lineWidths.get(key);
  if (known !== undefined) return known;
  let width: string | null = null;
  try {
    const wrapping = wrappableDisplayLatex(office ? officeMathLatex(latex) : latex);
    const render = (katex as unknown as {
      __renderToHTMLTree?: (expression: string, options: katex.KatexOptions) => KatexHtmlTreeNode;
    }).__renderToHTMLTree;
    if (wrapping !== null && render) {
      const tree = render(latexForKatex(`\\displaystyle ${wrapping}`), { ...MARKUP_OPTIONS, displayMode: false });
      const html = tree.children?.find((child) => child.classes?.includes("katex-html"));
      const bases = (html?.children ?? []).filter((child) => child.classes?.includes("base"));
      const em = bases.reduce(
        (sum, base, index) => sum + katexNodeWidth(base, 1, office ? drawnHere : undefined, bases[index + 1] ?? null),
        0,
      );
      if (em > 0) width = `${(em * 1.005 + 0.1).toFixed(4)}em`;
    }
  } catch {
    width = null;
  }
  if (lineWidths.size >= 4096) lineWidths.clear();
  lineWidths.set(key, width);
  return width;
}

function wordDisplayLineMarkup(line: string, aligned?: WordMathLine): string {
  const extents = wordDisplayMathExtents(line);
  const ascent = extents ? `--word-math-ascent:${extents.ascent}em;--word-math-descent:${extents.descent}em` : "";
  const box = extents ? ` data-word-math-box="true"` : "";
  if (aligned && aligned.whole === null) {
    return `<span class="word-math-line" ${WORD_MATH_POINT_ATTR}="true"${box}${ascent ? ` style="${ascent}"` : ""}>${wordMathPartsMarkup(aligned)}</span>`;
  }
  const markup = katexMarkup(line, true, true);
  const wraps = !markup.startsWith('<span class="katex-display"');
  const matrix = wraps && MATRIX_ENVIRONMENT.test(line) ? ` ${DISPLAY_MATH_MATRIX_ATTR}="true"` : "";
  const lineWidth = wraps ? breakableLineWidth(line, true) : null;
  const style = [ascent, lineWidth ? `${DISPLAY_MATH_LINE_WIDTH_PROPERTY}:${lineWidth}` : ""].filter(Boolean).join(";");
  return `<span class="word-math-line"${box}${style ? ` style="${style}"` : ""}${wraps ? ` ${DISPLAY_MATH_WRAPS_ATTR}="true"` : ""}${matrix}>${markup}</span>`;
}

/** The two sides of a line's alignment point, each keeping its spacing there. */
function wordMathPartsMarkup(line: WordMathLine): string {
  const left = line.left.trim() ? `<span class="word-math-part">${katexMarkup(`${line.left}{}`, true, true)}</span>` : "";
  return `${left}<span class="word-math-part">${katexMarkup(`{}${line.right}`, true, true)}</span>`;
}

const KATEX_FONT_FAMILIES = [
  "KaTeX_AMS",
  "KaTeX_Caligraphic",
  "KaTeX_Fraktur",
  "KaTeX_Main",
  "KaTeX_Math",
  "KaTeX_SansSerif",
  "KaTeX_Script",
  "KaTeX_Size1",
  "KaTeX_Size2",
  "KaTeX_Size3",
  "KaTeX_Size4",
  "KaTeX_Typewriter",
] as const;

let katexFontsReady: Promise<void> | null = null;
let katexFacesOnly: Promise<void> | null = null;
let katexFontsLoaded = false;

/** How long the KaTeX faces alone are waited for (projectionFontNews). */
const KATEX_FACES_WAIT_MS = 4000;

/** Every KaTeX face loaded: what a width read from a typeset formula needs.
 * `wholePage: false` (projectionFontNews) waits for the KaTeX faces alone, at
 * most a while, not for every face the page is loading (`fonts.ready`): in
 * WebKit a Chinese document's subsets kept that pending for minutes. */
export async function ensureKatexFonts(wholePage = true): Promise<void> {
  const fonts = document.fonts;
  if (!fonts?.load) {
    katexFontsLoaded = true;
    return;
  }
  if (!wholePage) {
    if (katexFontsLoaded) return;
    katexFacesOnly ??= Promise.race([
      Promise.allSettled(KATEX_FONT_FAMILIES.map((family) => fonts.load(`16px "${family}"`))).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, KATEX_FACES_WAIT_MS)),
    ]);
    await katexFacesOnly;
    return;
  }
  if (!katexFontsReady) {
    katexFontsReady = (async () => {
      await Promise.allSettled(KATEX_FONT_FAMILIES.map((family) => fonts.load(`16px "${family}"`)));
      await fonts.ready;
      katexFontsLoaded = true;
    })();
  }
  await katexFontsReady;
}

/** Each line's widths in em, typeset once off the page and kept. */
const wordMathExtents = new Map<string, WordMathLineExtent[]>();
const MEASURE_FONT_PX = 100;

function measureWordMathLines(key: string, lines: readonly WordMathLine[]): WordMathLineExtent[] {
  const known = wordMathExtents.get(key);
  if (known) return known;
  const host = document.createElement("div");
  host.className = "math-block-preview word-math-measure";
  host.setAttribute("data-math-style", "office");
  host.style.cssText = `position:absolute;left:-100000px;top:0;display:block;width:max-content;max-width:none;margin:0;visibility:hidden;font-size:${MEASURE_FONT_PX}px`;
  host.innerHTML = lines
    .map((line) => (line.whole === null
      ? `<div style="display:flex">${wordMathPartsMarkup(line)}</div>`
      : `<div style="display:flex"><span class="word-math-part">${katexMarkup(line.whole, true, true)}</span></div>`))
    .join("");
  document.body.append(host);
  const extents = Array.from(host.children, (row, index) => {
    const widths = Array.from(row.children, (part) => part.getBoundingClientRect().width / MEASURE_FONT_PX);
    const line = lines[index];
    if (line.whole !== null) return { left: null, right: widths[0] ?? 0 };
    return line.left.trim() ? { left: widths[0] ?? 0, right: widths[1] ?? 0 } : { left: 0, right: widths[0] ?? 0 };
  });
  host.remove();
  wordMathExtents.set(key, extents);
  return extents;
}

function applyWordMathGroup(el: HTMLElement, key: string, lines: readonly WordMathLine[], index: number | null): void {
  const { width, natural, extent, offsets } = wordMathGroupLayout(measureWordMathLines(key, lines));
  el.style.setProperty("--word-math-group", `${width}em`);
  el.style.setProperty("--word-math-natural", `${natural}em`);
  el.style.setProperty("--word-math-extent", `${extent}em`);
  el.setAttribute(WORD_MATH_PLACED_ATTR, "true");
  if (index !== null) {
    el.style.setProperty("--word-math-shift", `${offsets[index] ?? 0}em`);
    return;
  }
  Array.from(el.children).forEach((line, at) => {
    (line as HTMLElement).style.setProperty("--word-math-shift", `${offsets[at] ?? 0}em`);
  });
}

/** Place a group's lines: at once with the fonts in, else when they arrive. */
function settleWordMathGroup(el: HTMLElement, key: string, lines: readonly WordMathLine[], index: number | null): void {
  if (katexFontsLoaded || wordMathExtents.has(key)) {
    applyWordMathGroup(el, key, lines, index);
    return;
  }
  const typeset = el.innerHTML;
  void ensureKatexFonts().then(() => {
    if (el.innerHTML === typeset) applyWordMathGroup(el, key, lines, index);
  });
}

/** What `data-math-aligned` says: a group's lines, and which this formula is
 * when each line of the group is a formula of its own. */
function wordMathGroupOf(el: HTMLElement): { lines: unknown[]; index: number | null } | null {
  const stated = el.getAttribute(WORD_MATH_ALIGNED_ATTR);
  if (!stated) return null;
  try {
    const value = JSON.parse(stated) as { lines?: unknown; index?: unknown };
    return Array.isArray(value.lines)
      ? { lines: value.lines, index: typeof value.index === "number" ? value.index : null }
      : null;
  } catch {
    return null;
  }
}

export function renderKatexCached(
  el: HTMLElement,
  latex: string,
  displayMode: boolean,
): void {
  // Several lines of one Word equation: each on Word's line box, as one line is.
  const group = displayMode && el.getAttribute("data-math-style") === "office" ? wordDisplayGroupLines(latex) : null;
  const stated = displayMode ? wordMathGroupOf(el) : null;
  // Word's zone as one formula (a mathBlock), or one line of a zone whose lines
  // are formulas of their own (among a paragraph's words).
  const zone = group
    ? group.map((line, at) => wordMathLine(line, stated?.lines[at]))
    : stated && stated.index !== null
      ? stated.lines.map((line) => wordMathLine(wordDisplayLatex(wordMathLineWithoutPoints(String(line))), line))
      : null;
  const own = !group && zone && stated?.index !== null && stated ? zone[stated.index] : undefined;
  const statedKey = stated ? `${el.getAttribute(WORD_MATH_ALIGNED_ATTR)}\u0000` : "";
  const office = el.getAttribute("data-math-style") === "office";
  const key = (office ? "O" : "") + (group ? "G:" : displayMode ? "D:" : "I:") + statedKey + latex;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = group
        ? group.map((line, at) => wordDisplayLineMarkup(line, zone?.[at])).join("")
        : own?.whole === null
          ? wordMathPartsMarkup(own)
          : katexMarkup(latex, displayMode, office);
    } catch {
      el.textContent = latex;
      return;
    }
    rememberMarkup(key, html);
  }
  el.innerHTML = html;
  // An imported Word formula among words, at Word's width (officeMathFit).
  if (office && !displayMode && !stated) {
    applyOfficeMathFit(el, officeMathFit(latexForKatex(officeMathLatex(latex)), { ...MARKUP_OPTIONS, displayMode: false }));
  }
  if (group !== null) el.setAttribute(DISPLAY_MATH_GROUP_ATTR, "true");
  else if (el.hasAttribute(DISPLAY_MATH_GROUP_ATTR)) el.removeAttribute(DISPLAY_MATH_GROUP_ATTR);
  if (displayMode) {
    const wraps = group === null && own?.whole !== null && !html.startsWith('<span class="katex-display"');
    if (wraps !== el.hasAttribute(DISPLAY_MATH_WRAPS_ATTR)) {
      if (wraps) el.setAttribute(DISPLAY_MATH_WRAPS_ATTR, "true");
      else el.removeAttribute(DISPLAY_MATH_WRAPS_ATTR);
    }
    const lineWidth = wraps ? breakableLineWidth(latex, office) : null;
    if (lineWidth) {
      if (el.style.getPropertyValue(DISPLAY_MATH_LINE_WIDTH_PROPERTY) !== lineWidth) {
        el.style.setProperty(DISPLAY_MATH_LINE_WIDTH_PROPERTY, lineWidth);
      }
    } else if (el.style.getPropertyValue(DISPLAY_MATH_LINE_WIDTH_PROPERTY)) {
      el.style.removeProperty(DISPLAY_MATH_LINE_WIDTH_PROPERTY);
    }
    el.toggleAttribute(DISPLAY_MATH_MATRIX_ATTR, wraps && MATRIX_ENVIRONMENT.test(latex));
  }
  // A group whose lines stand other than at one left edge: its place is read
  // from the lines' widths. Lines at one left edge need no reading in a mathBlock.
  if (zone && (group === null || zone.some((line) => line.whole === null))) {
    settleWordMathGroup(el, statedKey + latex + (group ? "\u0000G" : "\u0000A"), zone, group ? null : stated?.index ?? null);
  } else if (el.hasAttribute(WORD_MATH_PLACED_ATTR)) {
    el.removeAttribute(WORD_MATH_PLACED_ATTR);
    for (const name of ["group", "natural", "extent", "shift"]) el.style.removeProperty(`--word-math-${name}`);
  }
}

let observer: IntersectionObserver | null = null;
interface PendingRender {
  /** `inView`: typeset because the formula came near the viewport (not
   * because something measures it). */
  render: (inView: boolean) => void;
  /** Whether the formula's KaTeX markup is in the cache already. */
  isCached?: () => boolean;
}
const pendingRenders = new Map<Element, PendingRender>();

/** How far outside the viewport a formula is typeset ahead of the reader. */
const NEAR_VIEW_MARGIN_PX = 800;
let sweepScheduled = false;

/**
 * Typeset the deferred formulas of the page sheets within the margin of the
 * viewport, found by geometry. A jump (a scrollbar drag, Go To, a page link)
 * moves a formula into view without the IntersectionObserver ever reporting
 * it: a sheet off screen is neither laid out nor painted
 * (content-visibility), and a formula observed while its sheet was skipped
 * had no box to intersect, so the sheet's formulas stayed placeholders in
 * view (9 of 15 on page 201 of a 296-page book). Sheets are in document
 * order, so the ones near the viewport are found by bisection.
 */
function sweepNearView(): void {
  if (pendingRenders.size === 0 || typeof document === "undefined") return;
  const viewBottom = (window.innerHeight || document.documentElement.clientHeight) + NEAR_VIEW_MARGIN_PX;
  for (const root of Array.from(document.querySelectorAll<HTMLElement>(".note-editor-content"))) {
    const sheets = sheetsOf(root);
    if (sheets.length === 0) continue;
    let low = 0;
    let high = sheets.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sheets[middle].getBoundingClientRect().bottom < -NEAR_VIEW_MARGIN_PX) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < sheets.length; index += 1) {
      const sheet = sheets[index];
      if (sheet.getBoundingClientRect().top > viewBottom) break;
      for (const el of Array.from(sheet.querySelectorAll("[data-math-pending]"))) {
        const pending = pendingRenders.get(el);
        if (!pending) continue;
        pendingRenders.delete(el);
        observer?.unobserve(el);
        pending.render(true);
      }
    }
  }
}

function scheduleNearViewSweep(): void {
  if (sweepScheduled || typeof requestAnimationFrame === "undefined") return;
  sweepScheduled = true;
  requestAnimationFrame(() => {
    sweepScheduled = false;
    sweepNearView();
  });
}

function ensureObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (observer) return observer;
  if (typeof document !== "undefined") {
    // Any scroll (the editor's own scroller included: capture) or resize
    // sweeps the sheets near the viewport in its next frame.
    document.addEventListener("scroll", scheduleNearViewSweep, { capture: true, passive: true });
    window.addEventListener("resize", scheduleNearViewSweep, { passive: true });
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pending = pendingRenders.get(entry.target);
        if (pending) {
          pendingRenders.delete(entry.target);
          observer?.unobserve(entry.target);
          pending.render(true);
        }
      }
    },
    // Generous margin: formulas typeset a screen ahead of the scroll so the
    // reader rarely catches a placeholder mid-view.
    { rootMargin: "800px 0px" },
  );
  return observer;
}











let sheetObserver: IntersectionObserver | null = null;
/** Formulas watched by themselves until placed with their sheet. */
const unplaced = new Set<HTMLElement>();
let placeScheduled = false;
const SHEET_SELECTOR = ".note-editor-content > article[data-page-sheet]";

function typesetPendingWithin(root: Element): void {
  for (const el of Array.from(root.querySelectorAll("[data-math-pending]"))) {
    const pending = pendingRenders.get(el);
    if (!pending) continue;
    pendingRenders.delete(el);
    observer?.unobserve(el);
    pending.render(true);
  }
}

function ensureSheetObserver(): IntersectionObserver | null {
  if (sheetObserver || typeof IntersectionObserver === "undefined") return sheetObserver;
  sheetObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.target.isConnected) {
          sheetObserver?.unobserve(entry.target);
          continue;
        }
        if (entry.isIntersecting) typesetPendingWithin(entry.target);
      }
    },
    { rootMargin: `${NEAR_VIEW_MARGIN_PX}px 0px` },
  );
  return sheetObserver;
}

/** Sheets watched now. Weakly, and so is the observer's hold on them: a page
 * drawn hollow (paged/pageHollowSheets) drops its sheet, and no formula may come
 * for a long time to look at this list. */
let watchedSheets = new WeakSet<Element>();

function placeFormulas(): void {
  placeScheduled = false;
  const sheets = ensureSheetObserver();
  for (const el of Array.from(unplaced)) {
    unplaced.delete(el);
    if (!pendingRenders.has(el)) continue;
    const sheet = el.isConnected ? el.closest(SHEET_SELECTOR) : null;
    if (!sheet || !sheets) continue; // watched by itself, as it was made
    observer?.unobserve(el);
    if (!watchedSheets.has(sheet)) {
      watchedSheets.add(sheet);
      sheets.observe(sheet);
    }
  }
}

function placeFormula(el: HTMLElement): void {
  unplaced.add(el);
  if (placeScheduled) return;
  placeScheduled = true;
  if (typeof requestAnimationFrame === "undefined") placeFormulas();
  else requestAnimationFrame(placeFormulas);
}

/** Tests: forget the observers (each test stubs its own). */
export function resetLazyRenderObserversForTests(): void {
  observer?.disconnect();
  observer = null;
  sheetObserver?.disconnect();
  sheetObserver = null;
  watchedSheets = new WeakSet();
  unplaced.clear();
}

let formulasStayPlaceholders = false;

/**
 * A process that reads documents and never draws them (the editor-command
 * host): its formula views stay placeholders and KaTeX never runs. Without
 * an IntersectionObserver every view typeset at once, 2 s of a 1000-block
 * page's formula conversion spent writing KaTeX trees into jsdom.
 */
export function keepFormulasAsPlaceholders(): void {
  formulasStayPlaceholders = true;
}

let formulasTypesetAtOnce = false;








export function typesetFormulasAtOnce(): void {
  formulasTypesetAtOnce = true;
}

/**
 * Defer `render` until `el` approaches the viewport. Returns a cleanup that
 * cancels the pending render (call it when the value changes or the node
 * view unmounts). Environments without IntersectionObserver (jsdom) render
 * immediately.
 */
export function observeLazyRender(
  el: HTMLElement,
  render: (inView: boolean) => void,
  isCached?: () => boolean,
): () => void {
  if (formulasTypesetAtOnce) {
    render(true);
    return () => {};
  }
  if (formulasStayPlaceholders) {
    pendingRenders.set(el, { render, isCached });
    return () => {
      pendingRenders.delete(el);
    };
  }
  const obs = ensureObserver();
  if (!obs) {
    render(true);
    return () => {};
  }
  pendingRenders.set(el, { render, isCached });
  // Watched by itself as it is made (not yet in the document as a view
  // builds it); handed to its sheet, if it has one, in the next frame.
  obs.observe(el);
  placeFormula(el);
  scheduleNearViewSweep();
  return () => {
    pendingRenders.delete(el);
    unplaced.delete(el);
    obs.unobserve(el);
  };
}

/**
 * Typeset one deferred formula now, cached or not (a formula no placeholder
 * box can stand for: one KaTeX breaks over lines). False when `el` has no
 * deferred render (already typeset, or not a lazy formula).
 */
export function renderLazyMathNow(el: Element): boolean {
  const pending = pendingRenders.get(el);
  if (!pending) return false;
  pendingRenders.delete(el);
  observer?.unobserve(el);
  pending.render(false);
  return true;
}

/** How long one frame of {@link typesetFormulasWithin} typesets. */
const WITHIN_FRAME_BUDGET_MS = 8;

/**
 * Typeset every deferred formula inside `root`, and each one deferred there
 * later (a page re-split rebuilds its formulas as placeholders), a frame's
 * budget at a time; returns the cleanup. For a short document read whole in
 * a preview (a script's file awaiting Confirm, a draft under review): left
 * to the viewport, a formula pages below the window stayed a placeholder
 * until the reader scrolled to it, and was typeset then, on the main thread,
 * while the reader scrolled (KaTeX, 1-5 ms a formula: the preview scrolled in
 * jolts), and the editor could not say its layout had settled (a pending
 * formula holds documentLifecycleLayoutSettled) until every page had been
 * scrolled past. Only `root`'s formulas: another window's long book keeps
 * its formulas waiting for its viewport.
 */
export function typesetFormulasWithin(root: Element): () => void {
  let frame: number | null = null;
  let stopped = false;
  // Formulas without a deferred render of their own (a print clone's) are
  // left as they are, and not looked at again.
  const notOurs = new WeakSet<Element>();
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const byFrame = typeof requestAnimationFrame === "function";
  const schedule = () => {
    if (stopped || frame !== null) return;
    frame = byFrame ? requestAnimationFrame(step) : (setTimeout(step, 16) as unknown as number);
  };
  const step = () => {
    frame = null;
    if (stopped) return;
    const started = now();
    for (const el of Array.from(root.querySelectorAll("[data-math-pending]"))) {
      if (notOurs.has(el)) continue;
      if (!renderLazyMathNow(el)) {
        notOurs.add(el);
        continue;
      }
      if (now() - started > WITHIN_FRAME_BUDGET_MS) {
        schedule();
        return;
      }
    }
  };
  const watch = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  watch?.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-math-pending"],
  });
  schedule();
  return () => {
    stopped = true;
    watch?.disconnect();
    if (frame === null) return;
    if (byFrame) cancelAnimationFrame(frame);
    else clearTimeout(frame);
    frame = null;
  };
}

/**
 * Typeset now, from the KaTeX cache only, the deferred formulas inside
 * `container` (a page the page ledger is about to measure). The ledger's
 * typeset clone has just cached their markup, so this is an innerHTML each.
 * Measured with the raw-TeX placeholder, a paragraph's lines came out a few
 * pixels off the typeset ones, and the pages depended on which formulas
 * happened to be typeset already (a moved block's view typesets at once
 * when cached, one left in place waits for the viewport): a long document
 * opened two ways paginated two ways. Returns how many were typeset.
 */
export function renderCachedLazyMathWithin(container: Element): number {
  let rendered = 0;
  for (const el of Array.from(container.querySelectorAll("[data-math-pending]"))) {
    const pending = pendingRenders.get(el);
    if (!pending?.isCached?.()) continue;
    pendingRenders.delete(el);
    observer?.unobserve(el);
    pending.render(false);
    rendered += 1;
  }
  return rendered;
}

/**
 * Formula nodes (ProseMirror node instances, which a block moved to another
 * page keeps) whose typeset formula was last drawn near the viewport, and the
 * exact typeset box each one was measured at.
 *
 * A formula view is rebuilt whenever the page ledger moves its block to
 * another sheet. Typesetting every rebuilt view at once (its markup was
 * cached) put a KaTeX tree back in the page for nearly every formula of a
 * long book as the background laid it out: ~8,600 trees to lay out and keep
 * on a 296-page textbook, and the typesetting itself on each move. A rebuilt
 * view is typeset at once only when its formula was near the viewport (so a
 * formula the reader sees never drops back to its placeholder); any other
 * stays a placeholder of its exact typeset box until it comes near.
 */
const formulasNearView = new WeakSet<object>();
const formulaBoxes = new WeakMap<object, LazyMathPlaceholderGeometry>();

/** The formula `node` was typeset near the viewport. */
export function markFormulaNearView(node: object): void {
  formulasNearView.add(node);
}

/** Whether a view rebuilt for `node` typesets at once. */
export function formulaWasNearView(node: object): boolean {
  return formulasNearView.has(node);
}

/** The exact typeset box `node` was measured at (the page ledger's typeset
 * clone), for its rebuilt placeholder. */
export function rememberFormulaBox(node: object, geometry: LazyMathPlaceholderGeometry): void {
  formulaBoxes.set(node, geometry);
}

export function formulaBoxOf(node: object): LazyMathPlaceholderGeometry | undefined {
  return formulaBoxes.get(node);
}

/** A formula view updated to a new node instance (an attribute changed)
 * keeps what its formula was. */
export function carryFormulaState(from: object, to: object): void {
  if (from === to) return;
  if (formulasNearView.has(from)) formulasNearView.add(to);
  // The box only goes to the same formula (its block re-split, a page move):
  // an edited one (its TeX, style or size changed) is measured again. Carried
  // over, the edited formula kept the box of what it was and the page
  // ledger, which leaves placed formulas alone, laid it out at that size.
  const sameMarkup = (from as { sameMarkup?: (other: unknown) => boolean }).sameMarkup;
  if (typeof sameMarkup === "function" && !sameMarkup.call(from, to)) return;
  const box = formulaBoxes.get(from);
  if (box && !formulaBoxes.has(to)) formulaBoxes.set(to, box);
}

/**
 * Typeset every deferred formula inside `container` (a detached print clone):
 * a formula still a placeholder there would print as nothing (its TeX is
 * drawn transparent). Chunked, with a yield between chunks, so a
 * formula-dense book does not freeze the tab. Returns how many it typeset.
 */
export async function typesetPendingMathIn(container: ParentNode, chunk = 150): Promise<number> {
  const pending = Array.from(container.querySelectorAll<HTMLElement>("[data-math-pending]"));
  // Where a group's lines stand is read from their widths.
  if (pending.some((el) => el.hasAttribute(WORD_MATH_ALIGNED_ATTR))) await ensureKatexFonts();
  for (let start = 0; start < pending.length; start += chunk) {
    for (const el of pending.slice(start, start + chunk)) {
      const source = el.getAttribute("data-math-render-latex") ??
        mathLatexForRender(el.textContent ?? "", el.getAttribute("data-math-style"));
      el.removeAttribute("data-math-pending");
      el.removeAttribute("data-math-render-latex");
      clearLazyMathPlaceholderGeometry(el);
      if (!source.trim()) continue;
      renderKatexCached(el, source, previewTypesetsAsDisplay(el));
    }
    if (start + chunk < pending.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pending.length;
}
