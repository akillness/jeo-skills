/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Character scale (Font → Advanced → Scale, `w:w`) in the editor.
 *
 * Word widens or narrows every character of the run and lays the run out
 * with those widths: a long 200% run fills each line, breaks where text
 * normally breaks (between CJK characters, at spaces) and centres like any
 * other text. CSS can only stretch glyphs with a transform, which needs an
 * atomic box, and one box for the whole run could not break across lines:
 * a run wider than the line was squeezed into a narrow box that wrapped
 * after a few characters and was then painted twice as wide, off centre
 * (WUA 025). So the run is cut where a line may break -- one CJK character,
 * one Latin word -- and each piece is its own stretched box whose advance
 * (natural width x scale) is kept by its right margin; the spaces between
 * words stay ordinary text, so they still break and hang at a line end, and
 * get the scaled advance as extra letter spacing.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measureOutsideEditorObservation } from "../native-document/documentLayoutStatus";
import { touchedTextblocks } from "../native-document/touchedTextblocks";

export const CHAR_SCALE_UNIT_CLASS = "docs-char-scale-unit";
export const CHAR_SCALE_SPACE_CLASS = "docs-char-scale-space";

export type CharScalePiece = Readonly<{
  from: number;
  to: number;
  /** `unit`: a stretched box; `space`: inline white space that only widens. */
  kind: "unit" | "space";
}>;

const GRAPHEMES =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function graphemes(text: string): string[] {
  if (!GRAPHEMES) return Array.from(text);
  return Array.from(GRAPHEMES.segment(text), (part) => part.segment);
}

/** Characters Word breaks around one by one (ideographs, kana, Hangul,
 * Bopomofo and the full-width forms and CJK punctuation blocks). */
const CJK_BREAKABLE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u2E80-\u2FFF\u3000-\u303F\u3200-\u33FF\uFE30-\uFE4F\uFF00-\uFFEF]/u;
/** May not begin a line: kept with the character before it. */
const NO_LINE_START = /^[、。，．：；？！）〕］｝〉》」』】〙〗〟｠»’”ー々〻ゝゞヽヾぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ・…‥!),.:;?\]}%]/u;
/** May not end a line: kept with the character after it. */
const NO_LINE_END = /^[（〔［｛〈《「『【〘〖〝｟«‘“([{]$/u;
const LINE_SPACE = /^[^\S\t\n\r\u2028\u2029]+$/u;
/** Hyphens a word may break after (hyphen-minus, hyphen, en dash). */
const BREAK_AFTER_HYPHEN = /^[-\u2010\u2013]$/u;
const WORD_CHARACTER = /^[\p{L}\p{N}]/u;

/** A line may break after a hyphen that joins two words or a word and a
 * number ("Hingoli-|431513", "pre-|2025"), as Word and the browsers break
 * them; a minus sign opening a number ("-5") stays with it (line-break.ts).
 * A scaled piece held such a word whole: corpus R281-D06's 105% address line
 * put "Hingoli-431513," on the second line, where Word ends the first after
 * "Hingoli-". */
function breaksAfterHyphen(text: string, unitFrom: number, at: number, next: string): boolean {
  const hyphen = text[at - 1];
  if (hyphen === undefined || !BREAK_AFTER_HYPHEN.test(hyphen) || !WORD_CHARACTER.test(next)) return false;
  const before = at - 2 >= unitFrom ? text[at - 2] : undefined;
  return before !== undefined && WORD_CHARACTER.test(before);
}

/**
 * Cut a scaled run's text into the pieces it may break between. PURE.
 * Tabs and line separators are left alone (no piece): they keep their own
 * layout rules.
 */
export function charScalePieces(text: string): CharScalePiece[] {
  const pieces: Array<{ from: number; to: number; kind: "unit" | "space"; word: boolean; glue: boolean }> = [];
  let offset = 0;
  for (const grapheme of graphemes(text)) {
    const from = offset;
    const to = (offset += grapheme.length);
    const last = pieces[pieces.length - 1];
    const adjacent = last !== undefined && last.to === from;
    if (/^\s+$/u.test(grapheme)) {
      if (!LINE_SPACE.test(grapheme)) continue;
      // One piece per run of the same space character: a piece's extra
      // spacing is measured for one character.
      if (adjacent && last.kind === "space" && text[last.from] === grapheme[0]) last.to = to;
      else pieces.push({ from, to, kind: "space", word: false, glue: false });
      continue;
    }
    const lastUnit = adjacent && last.kind === "unit" ? last : null;
    if (lastUnit && (lastUnit.glue || NO_LINE_START.test(grapheme))) {
      lastUnit.to = to;
      lastUnit.glue = NO_LINE_END.test(grapheme);
      lastUnit.word = lastUnit.word && !CJK_BREAKABLE.test(grapheme);
      continue;
    }
    const cjk = CJK_BREAKABLE.test(grapheme);
    if (lastUnit && lastUnit.word && !cjk && !NO_LINE_END.test(grapheme) && !breaksAfterHyphen(text, lastUnit.from, from, grapheme)) {
      lastUnit.to = to;
      continue;
    }
    pieces.push({ from, to, kind: "unit", word: !cjk, glue: NO_LINE_END.test(grapheme) });
  }
  return pieces.map(({ from, to, kind }) => ({ from, to, kind }));
}

type ScaleOf = (node: ProseMirrorNode) => number | null;

function textblockDecorations(block: ProseMirrorNode, blockPos: number, scaleOf: ScaleOf): Decoration[] {
  const decorations: Decoration[] = [];
  block.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    const scale = scaleOf(child);
    if (scale === null || scale === 100) return;
    const start = blockPos + 1 + offset;
    for (const piece of charScalePieces(child.text)) {
      decorations.push(
        piece.kind === "unit"
          ? Decoration.inline(start + piece.from, start + piece.to, {
              class: CHAR_SCALE_UNIT_CLASS,
              "data-char-scale-unit": String(scale),
              style: `display:inline-block;white-space:nowrap;text-indent:0;transform:scaleX(${scale / 100});transform-origin:left center`,
            })
          : Decoration.inline(start + piece.from, start + piece.to, {
              class: CHAR_SCALE_SPACE_CLASS,
              "data-char-scale-unit": String(scale),
            }),
      );
    }
  });
  return decorations;
}

function buildAll(doc: ProseMirrorNode, scaleOf: ScaleOf): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    decorations.push(...textblockDecorations(node, pos, scaleOf));
    return false;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const REBUILD = "rebuild";

/**
 * Decorate every scaled run with its break pieces. Rebuilt per touched
 * textblock; while an IME composition is open the pieces are only mapped
 * (re-cutting the text under the composition would end it).
 */
export function createCharScaleLayoutPlugin(markName: string, normalizeScale: (value: unknown) => number | null): Plugin<DecorationSet> {
  const key = new PluginKey<DecorationSet>(`${markName}Layout`);
  const scaleOf: ScaleOf = (node) => {
    const mark = node.marks.find((candidate) => candidate.type.name === markName);
    return mark ? normalizeScale(mark.attrs.scale) : null;
  };
  let composing = false;
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state: EditorState) => buildAll(state.doc, scaleOf),
      apply: (tr, current) => {
        if (tr.getMeta(key) === REBUILD) return buildAll(tr.doc, scaleOf);
        if (!tr.docChanged) return current;
        let next = current.map(tr.mapping, tr.doc);
        if (composing) return next;
        for (const pos of touchedTextblocks(tr)) {
          const block = tr.doc.nodeAt(pos);
          if (!block) continue;
          const end = pos + block.nodeSize;
          next = next.remove(next.find(pos, end));
          const added = textblockDecorations(block, pos, scaleOf);
          if (added.length) next = next.add(tr.doc, added);
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        compositionstart: () => {
          composing = true;
          return false;
        },
        compositionend: (view) => {
          composing = false;
          queueMicrotask(() => {
            if (view.isDestroyed || view.composing) return;
            // Only a document with scaled text has pieces to rebuild: an
            // IME commit elsewhere dispatched a needless projection
            // transaction (and a ribbon refresh) on every composition.
            const drawn = key.getState(view.state);
            let scaled = Boolean(drawn && drawn.find().length > 0);
            if (!scaled) {
              view.state.selection.$head.parent.forEach((child) => {
                if (!scaled && scaleOf(child) !== null) scaled = true;
              });
            }
            if (scaled) view.dispatch(view.state.tr.setMeta(key, REBUILD).setMeta("addToHistory", false));
          });
          return false;
        },
      },
    },
  });
}

/** The right margin that gives a stretched box of natural width `naturalWidth`
 * the advance `scale%` of it: negative for a compressed piece. Rounded to
 * 1/100 px. PURE. */
export function charScaleAdvanceMargin(pct: number, naturalWidth: number): number {
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) return 0;
  return Math.round((pct / 100 - 1) * naturalWidth * 100) / 100;
}

function pieceScale(element: HTMLElement): number | null {
  const pct = Number(element.getAttribute("data-char-scale-unit"));
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}

/** A style write, prepared while only reading so a whole pass forces one
 * layout, and applied with ProseMirror's DOM observer paused. */
type PieceWrite = () => void;

/** The end margin this module last wrote on a piece, and the spacing it found
 * there before (an East Asian spacing decoration on the same wrapper). */
const writtenAdvance = new WeakMap<HTMLElement, { value: string; base: number }>();

function advanceWrite(unit: HTMLElement, naturalWidth: number): PieceWrite | null {
  const pct = pieceScale(unit);
  if (pct === null) return null;
  // The advance shares margin-inline-end with the punctuation and auto
  // spacing decoration that may sit on the same wrapper: whatever stands
  // there that this module did not write is that spacing, and is kept.
  const declared = unit.style.getPropertyValue("margin-inline-end");
  const written = writtenAdvance.get(unit);
  const base =
    written && written.value === declared
      ? written.base
      : Number.isFinite(Number.parseFloat(declared))
        ? Number.parseFloat(declared)
        : 0;
  const margin = Math.round((charScaleAdvanceMargin(pct, naturalWidth) + base) * 100) / 100;
  const value = margin === 0 ? "" : `${margin}px`;
  if (declared === value) return null;
  return () => {
    if (value) unit.style.setProperty("margin-inline-end", value);
    else unit.style.removeProperty("margin-inline-end");
    writtenAdvance.set(unit, { value: unit.style.getPropertyValue("margin-inline-end"), base });
  };
}

/** The piece's laid-out (unstretched) width. */
function naturalWidth(unit: HTMLElement): number {
  const width = Number.parseFloat(getComputedStyle(unit).width);
  return Number.isFinite(width) ? width : unit.offsetWidth;
}

const DECORATION_PROPERTIES = [
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
  "text-underline-offset",
] as const;

/**
 * Underline and strikethrough are not propagated into an atomic inline box,
 * so a piece draws the lines its inline ancestors draw (inside the stretched
 * box, so the line spans the scaled advance as in Word). A line the piece
 * already draws itself (a words-only underline decoration) is kept.
 */
function decorationWrite(unit: HTMLElement): PieceWrite | null {
  const lines = new Set<string>();
  let source: CSSStyleDeclaration | null = null;
  for (let element = unit.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.display && style.display !== "inline" && style.display !== "contents") break;
    const line = style.textDecorationLine;
    if (!line || line === "none") continue;
    for (const part of line.split(/\s+/)) if (part) lines.add(part);
    source ??= style;
  }
  const lineSource: CSSStyleDeclaration | null = source;
  if (!lineSource) return null;
  for (const part of unit.style.textDecorationLine.split(/\s+/))
    if (part && part !== "none") lines.add(part);
  const value = Array.from(lines).join(" ");
  if (unit.style.textDecorationLine === value) return null;
  const carried = DECORATION_PROPERTIES.map((property) => [property, lineSource.getPropertyValue(property)] as const);
  return () => {
    unit.style.setProperty("text-decoration-line", value);
    for (const [property, carriedValue] of carried) if (carriedValue) unit.style.setProperty(property, carriedValue);
  };
}

let measureContext: CanvasRenderingContext2D | null | undefined;

function spaceAdvance(style: CSSStyleDeclaration, character: string): number | null {
  if (measureContext === undefined) {
    try {
      measureContext =
        typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)
          ? null
          : document.createElement("canvas").getContext("2d");
    } catch {
      measureContext = null;
    }
  }
  // The computed `font` shorthand is empty whenever a longhand it cannot
  // express is set (font-kerning, variant ligatures...): build it.
  const font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean).join(" ");
  if (!measureContext || !style.fontSize || !style.fontFamily) return null;
  measureContext.font = font;
  const width = measureContext.measureText(character).width;
  return Number.isFinite(width) && width > 0 ? width : null;
}

/** A space keeps breaking and hanging like text; its scaled advance is the
 * extra letter spacing on top of any spacing it inherits. */
function spaceWrite(space: HTMLElement): PieceWrite | null {
  const pct = pieceScale(space);
  const parent = space.parentElement;
  const character = space.textContent?.[0];
  if (pct === null || !parent || !character) return null;
  const inherited = getComputedStyle(parent);
  const advance = spaceAdvance(inherited, character);
  if (advance === null) return null;
  const base = Number.parseFloat(inherited.letterSpacing);
  const spacing = (Number.isFinite(base) ? base : 0) + (pct / 100 - 1) * advance;
  const value = `${Math.round(spacing * 100) / 100}px`;
  return space.style.letterSpacing === value ? null : () => { space.style.letterSpacing = value; };
}

/**
 * Keep every piece inside a scaled run's mark view at its scaled advance.
 * Pieces are created and replaced by ProseMirror as the run is edited; a
 * mutation observer picks them up (and sizes them before they are painted)
 * and a resize observer re-measures a piece whose font changes later.
 *
 * The writes go to ProseMirror's own decoration wrappers, so they are made
 * with its DOM observer paused: a wrapper is not its text node, and an
 * attribute change on it reads as an edit of the enclosing mark (bold,
 * italic, strikethrough...), which ProseMirror re-renders -- recreating the
 * pieces, whose sizing was read as an edit again, without end.
 * Returns the disconnect function.
 */
export function observeCharScalePieces(dom: HTMLElement, view?: EditorView | null): () => void {
  const commit = (writes: Array<PieceWrite | null>) => {
    const pending = writes.filter((write): write is PieceWrite => write !== null);
    if (pending.length) measureOutsideEditorObservation(view, () => { for (const write of pending) write(); });
  };
  const widths = new WeakMap<HTMLElement, number>();
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          commit(
            entries.map((entry) => {
              const target = entry.target as HTMLElement;
              const width = entry.contentRect?.width;
              widths.set(target, typeof width === "number" ? width : target.offsetWidth);
              return advanceWrite(target, widths.get(target) ?? 0);
            }),
          );
        })
      : null;
  const observed = new Set<HTMLElement>();
  let disposed = false;
  const sync = () => {
    if (disposed || !dom.isConnected) return;
    const writes: Array<PieceWrite | null> = [];
    for (const unit of Array.from(dom.querySelectorAll<HTMLElement>(`.${CHAR_SCALE_UNIT_CLASS}`))) {
      if (!observed.has(unit)) {
        observed.add(unit);
        resize?.observe(unit);
        widths.set(unit, naturalWidth(unit));
      }
      writes.push(advanceWrite(unit, widths.get(unit) ?? 0), decorationWrite(unit));
    }
    for (const space of Array.from(dom.querySelectorAll<HTMLElement>(`.${CHAR_SCALE_SPACE_CLASS}`)))
      writes.push(spaceWrite(space));
    for (const unit of Array.from(observed)) {
      if (dom.contains(unit)) continue;
      observed.delete(unit);
      resize?.unobserve(unit);
    }
    commit(writes);
  };
  const mutations = typeof MutationObserver === "function" ? new MutationObserver(sync) : null;
  // Style changes too: ProseMirror re-patching a wrapper's decoration style
  // (its spacing changed) takes this module's advance off with it.
  mutations?.observe(dom, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
  queueMicrotask(sync);
  return () => {
    disposed = true;
    mutations?.disconnect();
    resize?.disconnect();
    observed.clear();
  };
}
