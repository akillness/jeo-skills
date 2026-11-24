/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Word's "Balance SBCS characters and DBCS characters"
 * (`w:compat/w:balanceSingleByteDoubleByteWidth`, with East Asian layout on:
 * the page's `wordBalancedSpaces`) sets a space that does not stand between
 * two characters of Latin-type text at half an East Asian cell, half an em:
 * a run of spaces (no-break spaces too), a space at a line's end or beside a tab, a break or an
 * East Asian character. A space between two Latin words keeps its width.
 * Word 16 probe sbdb (12 pt Times New Roman): "Xa  Xb" 2 x 6 pt for
 * 2 x 3 pt, "Xa Xb" 3 pt, a leading space 6 pt, the same in compatibility
 * mode 15 and without one. Corpus R283-D11: the double spaces of a Greek
 * bill of quantities, where Word's cells wrap a line sooner.
 *
 * Each such space is given the word spacing that makes it half an em in its
 * own face, measured where it is drawn: the text engine reads a run's word
 * spacing from the page (docs-lines pushText), so its lines and the
 * browser's stay one.
 */
export const balancedSpacesKey = new PluginKey<DecorationSet>("balancedSpaces");

const EAST_ASIAN = /[ᄀ-ᇿ⺀-⿿、-〿぀-ヿ㄀-ㄯ㄰-㆏ㆠ-ㇿ㈀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]/u;

/** A character that counts as Latin-type text beside a space (a letter,
 * digit or mark of any non-East-Asian script; not a space, tab or break). */
function latinText(char: string | null): boolean {
  return char !== null && !/[\s ]/u.test(char) && !EAST_ASIAN.test(char);
}

/** `window.__docsBalancedNbspOff = true` asks the older reading (no-break
 * spaces keep their width), for an A/B of one build. */
function balancedNbspOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsBalancedNbspOff?: boolean}).__docsBalancedNbspOff === true;
}

function balancedNbspAfterAtomOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsBalancedNbspAfterAtomOff?: boolean}).__docsBalancedNbspAfterAtomOff === true;
}

/** The document positions of the spaces Word balances in one textblock: the
 * spaces, and the no-break spaces (corpus R395-D10: an exam's choices "A. 1"
 * to "D. −i" set apart by 33 no-break spaces each, which Word sets at half an
 * em and wraps onto two lines). */
export function balancedSpaceRanges(block: ProseMirrorNode, start: number): number[] {
  // The block's characters, every inline leaf one non-text slot.
  const chars: Array<string | null> = [];
  const positions: number[] = [];
  block.forEach((child, offset) => {
    if (child.isText) {
      const text = child.text ?? "";
      for (let index = 0; index < text.length; index += 1) {
        chars.push(text[index]!);
        positions.push(start + offset + index);
      }
    } else {
      chars.push(null);
      positions.push(-1);
    }
  });
  const out: number[] = [];
  const nbsp = !balancedNbspOff();
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char !== " " && !(nbsp && char === "\u00a0")) continue;
    // A no-break space is balanced like a space, but not in a run of them
    // that follows East Asian text (Windows Word, docx-look/probes/nbsp
    // k_spaces, w_texts: "x" and 16 no-break spaces 5.25 pt each at 10.5 pt,
    // after "中" 2.37, a lone one between two letters 2.4).
    // Nor a run that opens the paragraph or follows an inline leaf (an
    // equation, a picture, a tab, a break): Windows Word, docx-look/brk10/
    // probes nbspmath (R395-D10's package): 20 after "X" 5.25 pt each, after
    // an equation, a picture, a tab or at the start 2.38; plain spaces after
    // an equation 5.25. R395-D10 question 7 keeps its four choices
    // "A. (\u22122,6)" + 20 no-break spaces \u2026 on one line.
    // `window.__docsBalancedNbspAfterAtomOff = true`: such runs balanced, as before.
    if (char === "\u00a0") {
      let first = index;
      while (first > 0 && chars[first - 1] === "\u00a0") first -= 1;
      const lead = first > 0 ? chars[first - 1] : null;
      if (lead !== null && EAST_ASIAN.test(lead)) continue;
      if ((lead === null || lead === "\t") && !balancedNbspAfterAtomOff()) continue;
    }
    const before = index > 0 ? chars[index - 1]! : null;
    const after = index + 1 < chars.length ? chars[index + 1]! : null;
    if (!latinText(before) || !latinText(after)) out.push(positions[index]!);
  }
  return out;
}

/**
 * A line the text engine corrects narrows (or widens) its spaces by a word
 * spacing of its own (documentEngineLineBreaks), on the same text: the two
 * decorations' styles meet on one element, this one's written last, so a
 * plain width here undid the engine's on every balanced space (corpus
 * R342-D30: the kept "with no" narrowed by 0.0394 px a space, four balanced
 * spaces kept their width and the browser sent "no" down). The engine states
 * its extra in this property; the balanced width adds it.
 * `window.__docsEngineWordExtraVarOff = true`: the plain width, as before.
 */
export const ENGINE_WORD_EXTRA_VAR = "--docs-engine-word-extra";

function engineWordExtraOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsEngineWordExtraVarOff?: boolean }).__docsEngineWordExtraVarOff === true;
}

const spaceWidths = new Map<string, number>();
let canvas: CanvasRenderingContext2D | null | undefined;

function spaceWidth(font: string): number | null {
  const known = spaceWidths.get(font);
  if (known !== undefined) return known;
  if (canvas === undefined) canvas = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!canvas) return null;
  canvas.font = font;
  const width = canvas.measureText(" ").width;
  if (!(width > 0)) return null;
  // A face still loading measures in its fallback: measured again once in.
  let loaded = true;
  try {
    loaded = typeof document === "undefined" || !document.fonts || document.fonts.check(font, " ");
  } catch {
    loaded = true;
  }
  if (loaded) spaceWidths.set(font, width);
  return width;
}

/** The word spacing (px) that makes the space at `pos` half an em, or null. */
function balancingSpacing(view: EditorView, pos: number): number | null {
  let element: Element | null = null;
  try {
    const at = view.domAtPos(pos + 1);
    element = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : (at.node as Element);
  } catch {
    return null;
  }
  if (!element) return null;
  const style = view.dom.ownerDocument.defaultView?.getComputedStyle(element);
  const sizePx = style ? Number.parseFloat(style.fontSize) : Number.NaN;
  if (!style || !(sizePx > 0)) return null;
  const width = spaceWidth(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
  if (width === null) return null;
  const spacing = sizePx / 2 - width;
  return spacing > 0.05 ? Math.round(spacing * 1000) / 1000 : null;
}

function measuredDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  if ((doc.attrs as Record<string, unknown>).wordBalancedSpaces !== true) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const at of balancedSpaceRanges(node, pos + 1)) {
      const spacing = balancingSpacing(view, at);
      if (spacing === null) continue;
      const style = engineWordExtraOff() ? `word-spacing:${spacing}px` : `word-spacing:calc(${spacing}px + var(${ENGINE_WORD_EXTRA_VAR}, 0px))`;
      decorations.push(Decoration.inline(at, at + 1, { style, "data-balanced-space": "" }, { balancedSpace: spacing }));
    }
    return false;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function signature(set: DecorationSet, doc: ProseMirrorNode): string {
  return set.find(0, doc.content.size).map((item) => `${item.from}:${String((item.spec as { balancedSpace?: number }).balancedSpace)}`).join(",");
}

export const BalancedSpaces = Extension.create({
  name: "balancedSpaces",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: balancedSpacesKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, previous) => {
            const measured = tr.getMeta(balancedSpacesKey) as DecorationSet | undefined;
            if (measured) return measured;
            return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
          },
        },
        props: {
          decorations: (state) => balancedSpacesKey.getState(state),
        },
        view: (view) => {
          let frame = 0;
          const schedule = () => {
            if (frame || (view.state.doc.attrs as Record<string, unknown>).wordBalancedSpaces !== true) return;
            const win = view.dom.ownerDocument.defaultView;
            if (!win) return;
            frame = win.requestAnimationFrame(() => {
              frame = 0;
              if (view.isDestroyed) return;
              const next = measuredDecorations(view);
              const current = balancedSpacesKey.getState(view.state) ?? DecorationSet.empty;
              if (signature(next, view.state.doc) === signature(current, view.state.doc)) return;
              view.dispatch(view.state.tr.setMeta(balancedSpacesKey, next).setMeta("addToHistory", false));
            });
          };
          schedule();
          // A face that comes in sets its spaces anew.
          const fonts = view.dom.ownerDocument.fonts;
          const onFonts = () => schedule();
          fonts?.addEventListener?.("loadingdone", onFonts);
          return {
            update: (_view, previous) => {
              if (previous.doc !== view.state.doc) schedule();
            },
            destroy: () => {
              fonts?.removeEventListener?.("loadingdone", onFonts);
              if (frame) view.dom.ownerDocument.defaultView?.cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
