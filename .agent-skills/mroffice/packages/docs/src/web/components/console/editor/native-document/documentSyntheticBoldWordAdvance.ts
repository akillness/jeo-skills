/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { Extension } from "@tiptap/core";
import { isEastAsianFontCodePoint } from "@mrnote/core/web/components/office-ribbon/officeFontScriptSlots.ts";
import { OFFICE_FONT_ASSETS_EVENT } from "@mrnote/core/web/components/office-ribbon/officeFontAssets.ts";
import { wordFontIsEastAsian, wordFontShipsRegularOnly } from "@mrnote/core/web/components/console/editor/native-document/wordFontMetrics.ts";
import { effectiveBoldAt } from "@mrnote/core/web/components/console/editor/native-document/boldExtension.ts";
import { newFontFacesOf } from "@mrnote/core/web/lib/font-face-news.ts";
import { fontFamilyNames } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerFontRanges.ts";

/**
 * Word's emboldening of the East Asian faces Office installs with no bold
 * (SimSun, KaiTi, the MS Mincho and Gothic faces, Batang, ...): a bold run
 * is set in the regular face, stroked, and every glyph the face draws
 * advances 5/256 em further. A space advances as in the regular face, and a
 * character the face lacks is set in a fallback face that is not widened
 * (Word 16.86: MS Gothic bold widens 字 but not the simplified 汉, NSimSun no
 * Hangul). Measured against an Arial bar after the run, 10–12 pt.
 *
 * The page paints these runs with a stand-in whose bold is either real (no
 * wider than its regular) or the engine's own emboldening (WebKit adds a
 * device pixel, Chromium nothing), so the difference to Word is projected as
 * letter-spacing on the bold characters, net of what the engine adds.
 */
const EXTRA_EM = 5 / 256;
const SETTLING_ATTR = "data-pagination-initial-settling";

/** By the name a document gives the face, lower-cased; `hangul`: whether the
 * face draws Hangul itself (measured where noted, else not assumed). */
const FAMILIES: ReadonlyMap<string, { readonly hangul: boolean }> = new Map(
  (
    [
      [["simsun", "宋体"], true],
      [["nsimsun", "新宋体"], false],
      [["simhei", "黑体"], false],
      [["kaiti", "楷体", "kaiti_gb2312", "楷体_gb2312"], false],
      [["fangsong", "仿宋", "fangsong_gb2312", "仿宋_gb2312"], false],
      [["mingliu", "細明體", "细明体"], false],
      [["pmingliu", "新細明體", "新细明体"], false],
      [["ms mincho", "ｍｓ 明朝"], true],
      [["ms pmincho", "ｍｓ ｐ明朝"], true],
      [["ms gothic", "ｍｓ ゴシック"], false],
      [["ms pgothic", "ｍｓ ｐゴシック"], false],
      [["ms ui gothic"], false],
      [["batang", "바탕", "batangche", "바탕체"], true],
      [["gungsuh", "궁서", "gungsuhche", "궁서체"], true],
      [["gulim", "굴림", "gulimche", "굴림체"], true],
      [["dotum", "돋움", "dotumche", "돋움체"], true],
    ] as const
  ).flatMap(([names, hangul]) => names.map((name) => [name, { hangul }] as const)),
);

const unquote = (family: string) => family.trim().replace(/^["']|["']$/g, "").trim();
const familiesOf = (stack: string) => stack.split(",").map(unquote).filter(Boolean);

type CharClass = "space" | "latin" | "han" | "kana" | "hangul" | "other";
function charClass(cp: number): CharClass {
  if (cp === 0x20 || cp === 0xa0) return "space";
  if (!isEastAsianFontCodePoint(cp)) return "latin";
  if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0xac00 && cp <= 0xd7af)) return "hangul";
  if (cp >= 0x3040 && cp <= 0x30ff) return "kana";
  if ((cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || cp >= 0x20000) return "han";
  return "other";
}
const PROBE_SAMPLE: Record<CharClass, string> = { space: " ", latin: "n", han: "国", kana: "あ", hangul: "한", other: "，" };

/** The family Word sets a character of this class in, as the page routes it:
 * Latin in the run's first face, East Asian in its first East Asian one. */
function wordFamily(stack: readonly string[], cls: CharClass): string | undefined {
  if (cls === "latin" || cls === "space") return stack[0]?.toLowerCase();
  return stack.find((family) => FAMILIES.has(family.toLowerCase()) || wordFontIsEastAsian(family))?.toLowerCase();
}

/** A face the page binds from the document's own font file (MRAI-Font-…)
 * is known by the file Word measured. */
const EMBEDDED: { readonly hangul: boolean } = { hangul: false };
const faceOf = (family: string | undefined) =>
  family === undefined ? undefined : FAMILIES.get(family) ?? (/^mrai-font-/.test(family) && wordFontShipsRegularOnly(family) ? EMBEDDED : undefined);

/** The face of `FAMILIES` Word sets this bold character in, if any. */
function syntheticFace(stack: string, character: string) {
  const cp = character.codePointAt(0);
  if (cp === undefined) return undefined;
  const cls = charClass(cp);
  // By font list and class: asked for every bold character, splitting the list
  // each time was most of the projection (R286-D01: 3.5 s of an opening).
  const key = `${cls}\u0000${stack}`;
  if (syntheticFaces.has(key)) return syntheticFaces.get(key);
  const named = faceOf(wordFamily(familiesOf(stack), cls));
  const face = named && !(cls === "hangul" && !named.hangul) ? named : undefined;
  syntheticFaces.set(key, face);
  return face;
}
const syntheticFaces = new Map<string, { readonly hangul: boolean } | undefined>();

/** The em Word adds to a bold character in this stack, 0 when none. */
export function wordSyntheticBoldExtraEm(stack: string, character: string): number {
  return !/\s/u.test(character) && syntheticFace(stack, character) ? EXTRA_EM : 0;
}

const probes = new WeakMap<Document, { element: HTMLSpanElement; widths: Map<string, number> }>();
/** What the engine itself adds to one bold character of `stack` at `sizePx`. */
function engineBoldExtraPx(doc: Document, stack: string, sizePx: number, cls: CharClass): number {
  let probe = probes.get(doc);
  if (!probe) {
    const element = doc.createElement("span");
    element.setAttribute("aria-hidden", "true");
    element.style.cssText =
      "position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;letter-spacing:0;word-spacing:0;font-kerning:none;font-feature-settings:normal;font-style:normal;contain:layout style";
    probe = { element, widths: new Map() };
    probes.set(doc, probe);
  }
  const key = `${cls}|${sizePx}|${stack}`;
  const known = probe.widths.get(key);
  if (known !== undefined) return known;
  const { element } = probe;
  if (!element.isConnected) doc.body?.appendChild(element);
  element.style.fontFamily = stack;
  element.style.fontSize = `${sizePx}px`;
  element.textContent = PROBE_SAMPLE[cls].repeat(16);
  element.style.fontWeight = "400";
  const regular = element.getBoundingClientRect().width;
  element.style.fontWeight = "700";
  const bold = element.getBoundingClientRect().width;
  const extra = Number.isFinite(bold - regular) ? Math.max(0, (bold - regular) / 16) : 0;
  probe.widths.set(key, extra);
  return extra;
}

function elementAt(view: EditorView, pos: number): HTMLElement | null {
  try {
    const point = view.domAtPos(pos, 1);
    let node: Node | null = point.node;
    if (node.nodeType === 1) node = node.childNodes[point.offset] ?? node;
    while (node && node.nodeType === 1 && node.firstChild) node = node.firstChild;
    return node ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement) : null;
  } catch {
    return null;
  }
}

/** The element whose letter-spacing is the run's own, under `textElement`
 * (the element its text stands in): the nearest one the editor draws for a
 * mark or a node, above the wrappers inline decorations draw around the text
 * (the outermost of which carries the text's view description).
 *
 * Decorations covering the same characters share one wrapper, so this
 * projection's own (and the East Asian spacing pass's, and the engine's line
 * corrections, which all read this one's spacing or are overridden by it)
 * lands on the very element that carries, say, the East Asian face a page
 * routes the run to. Read from the wrappers, the run's spacing and face came
 * out one way while the run had no piece and the other way once it had one:
 * every face that arrived read the block again and flipped its piece
 * (allometric.docx 中文名, bold 宋体: 0.2734 px on, off, on ... six times while
 * it opened; the layout it stood still in depended on how many faces came). */
function runSpacingElement(textElement: HTMLElement): HTMLElement {
  for (let element: HTMLElement | null = textElement; element; element = element.parentElement) {
    const desc = (element as HTMLElement & { pmViewDesc?: { node?: { isText?: boolean } | null } }).pmViewDesc;
    if (!desc) continue;
    return desc.node?.isText ? element.parentElement ?? textElement : textElement;
  }
  return textElement;
}

const OWN_CLASS = "document-synthetic-bold-word-advance";
/** The page-rebalance reason this projection announces a change with. */
export const SYNTHETIC_BOLD_ADVANCE_REASON = "synthetic-bold-advance";
const quantum = (px: number) => Math.round(px * 10000) / 10000;

/** `px`: the letter-spacing; `engine`: what the engine's emboldening adds. */
type Piece = readonly [from: number, to: number, px: number, engine: number];

/** No piece at all, for a reason no face arriving changes: the block names
 * none of the faces Word emboldens (in its marks or its computed family,
 * the same string before and after a face loads), or none of its text is
 * bold. It outlives the font cache: the faces a long Chinese book fetches
 * while it opens, hundreds of subsets, each cleared every block's pieces
 * and every block read its styles again (2.1 s of OI29500's opening). */
const NO_NAMED_FACE: Piece[] = [];
/** No piece, read while pagination still settles: no text found bold from
 * the marks and styles alone. No face arriving changes that verdict either
 * (only a bold run measures the faces), so it too outlives the font cache;
 * it is read again once the pages have settled. A Song-set book named the
 * face in every block, and each of the hundreds of subsets it fetched while
 * it opened read every block again. */
const UNSETTLED_NO_BOLD: Piece[] = [];

/** The families (lower-cased, unquoted) each block's pieces were read with:
 * only a face of one of them arriving can read them otherwise. */
const piecesFamilies = new WeakMap<Piece[], Set<string>>();

/** One textblock's pieces, positions relative to the block's content. */
function blockPieces(view: EditorView, block: PmNode, start: number, documentNamesFace = false): Piece[] {
  const pieces: Piece[] = [];
  const families = new Set<string>();
  piecesFamilies.set(pieces, families);
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  if (!win) return pieces;
  // Most blocks name none of these faces, neither in their own style nor in
  // a run's font: one style read settles them.
  // A document set in one of them by default (a Song-set book) names it in
  // every block: the block's computed family is not read for it, which
  // recalculated the page's styles for each block the pages split while
  // they settled. Only a bold run below reads its face.
  let named = documentNamesFace;
  block.descendants((node) => {
    if (named) return false;
    for (const mark of node.marks) {
      if ((mark.type.name === "fontFamily" || mark.type.name === "fontCjkFamily") &&
          typeof mark.attrs.family === "string" && familiesOf(mark.attrs.family).some((family) => faceOf(family.toLowerCase()))) named = true;
    }
    return !named;
  });
  if (!named) {
    const dom = view.nodeDOM(start - 1);
    const element = dom instanceof win.HTMLElement ? dom : null;
    if (!element || !familiesOf(win.getComputedStyle(element).fontFamily).some((family) => faceOf(family.toLowerCase()))) return NO_NAMED_FACE;
  }
  // Boldness is read from the page while pagination settles only from the
  // marks and styles (effectiveBoldAt): a verdict read then is not final.
  const settled = !view.dom.hasAttribute(SETTLING_ATTR);
  let bold = false;
  block.descendants((node, offset) => {
    if (bold) return false;
    if (node.isText && node.text && effectiveBoldAt(view.state, start + offset, node.marks, view)) bold = true;
    return !bold;
  });
  if (!bold) return settled ? NO_NAMED_FACE : UNSETTLED_NO_BOLD;
  block.descendants((node, offset) => {
    if (!node.isText || !node.text) return true;
    if (!effectiveBoldAt(view.state, start + offset, node.marks, view)) return false;
    const text = node.text;
    let index = 0;
    while (index < text.length) {
      // A run of one script: the page may route it to its own element.
      const cp = text.codePointAt(index)!;
      const eastAsian = isEastAsianFontCodePoint(cp);
      let end = index;
      while (end < text.length) {
        const next = text.codePointAt(end)!;
        if (isEastAsianFontCodePoint(next) !== eastAsian) break;
        end += next > 0xffff ? 2 : 1;
      }
      const from = start + offset + index;
      // The face and size the text is drawn in, from its own element (no
      // decoration that reads this projection sets either); the run's own
      // letter-spacing from above the decorations' wrappers: not this
      // projection's, nor the East Asian spacing pass's (which is read from
      // this one), whether or not they share the face's wrapper.
      const element = elementAt(view, from);
      const style = element ? win.getComputedStyle(element) : null;
      const sizePx = style ? Number.parseFloat(style.fontSize) : NaN;
      if (element && style && sizePx > 0 &&
          (!style.writingMode || style.writingMode === "horizontal-tb")) {
        const spacingElement = runSpacingElement(element);
        const base = Number.parseFloat((spacingElement === element ? style : win.getComputedStyle(spacingElement)).letterSpacing);
        const spacing = Number.isFinite(base) ? base : 0;
        // Each character once in a run: the same few, thousands of times in a
        // long book's bold (a font list read for each was 4.6 s of an opening).
        const fontFamily = style.fontFamily;
        for (const name of fontFamilyNames(fontFamily)) families.add(name);
        const asked = new Map<number, readonly [px: number, engine: number] | null>();
        for (let at = index; at < end;) {
          const point = text.codePointAt(at)!;
          const width = point > 0xffff ? 2 : 1;
          let extra = asked.get(point);
          if (extra === undefined) {
            const character = String.fromCodePoint(point);
            // A space Word does not widen, but the engine may (WebKit).
            if (syntheticFace(fontFamily, character)) {
              const engine = quantum(engineBoldExtraPx(doc, fontFamily, sizePx, charClass(point)));
              extra = [quantum(spacing + wordSyntheticBoldExtraEm(fontFamily, character) * sizePx - engine), engine];
            } else extra = null;
            asked.set(point, extra);
          }
          if (extra) {
            const [px, engine] = extra;
            const last = pieces[pieces.length - 1];
            const pieceFrom = offset + at;
            if (px === spacing && !engine) { at += width; continue; }
            if (last && last[1] === pieceFrom && last[2] === px && last[3] === engine) pieces[pieces.length - 1] = [last[0], pieceFrom + width, px, engine];
            else pieces.push([pieceFrom, pieceFrom + width, px, engine]);
          }
          at += width;
        }
      }
      index = end;
    }
    return false;
  });
  return pieces;
}

export const documentSyntheticBoldWordAdvanceKey = new PluginKey<DecorationSet>("documentSyntheticBoldWordAdvance");

// The engine's share is read back by the East Asian spacing pass
// (DocumentPageSetup), which sets those glyphs at the face's own advance.
function decorationFor(from: number, to: number, px: number, engine: number): Decoration {
  return Decoration.inline(from, to, {
    class: `${OWN_CLASS} document-synthetic-bold-advance`,
    style: `--document-synthetic-bold-letter-spacing:${px}px;--document-synthetic-bold-engine-advance:${engine}px`,
  }, { inclusiveStart: false, inclusiveEnd: false, syntheticBoldAdvance: true, wordSyntheticBold: `${px}/${engine}` });
}

const signature = (items: readonly Decoration[]) =>
  items.map((item) => `${item.from}:${item.to}:${(item.spec as { wordSyntheticBold?: string }).wordSyntheticBold}`).join(",");

export function createDocumentSyntheticBoldWordAdvancePlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: documentSyntheticBoldWordAdvanceKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, previous) {
        const next = tr.getMeta(documentSyntheticBoldWordAdvanceKey) as DecorationSet | undefined;
        if (next) return next;
        return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
      },
    },
    props: { decorations: (state) => documentSyntheticBoldWordAdvanceKey.getState(state) },
    view(view) {
      const doc = view.dom.ownerDocument;
      const win = doc.defaultView;
      // A block's pieces stand while the block, the document's styles and
      // the loaded fonts do.
      let cache = new WeakMap<PmNode, Piece[]>();
      let attrs = view.state.doc.attrs;
      let frame = 0;
      let disposed = false;
      const run = () => {
        frame = 0;
        if (disposed || view.isDestroyed || !view.dom.isConnected) return;
        const state = view.state;
        if (state.doc.attrs !== attrs) {
          attrs = state.doc.attrs;
          cache = new WeakMap();
        }
        const items: Decoration[] = [];
        const settled = !view.dom.hasAttribute(SETTLING_ATTR);
        const documentNamesFace = familiesOf(String(state.doc.attrs.defaultFontFamily ?? "")).some((family) => faceOf(family.toLowerCase()));
        state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return true;
          let pieces = cache.get(node);
          if (!pieces || (settled && pieces === UNSETTLED_NO_BOLD)) {
            // Only a block read for the first time builds its text: every
            // block's, on every change, cost each pass of a long book.
            pieces = node.textContent ? blockPieces(view, node, pos + 1, documentNamesFace) : NO_NAMED_FACE;
            cache.set(node, pieces);
          }
          for (const [from, to, px, engine] of pieces) items.push(decorationFor(pos + 1 + from, pos + 1 + to, px, engine));
          return false;
        });
        const current = documentSyntheticBoldWordAdvanceKey.getState(state) ?? DecorationSet.empty;
        if (signature(current.find()) === signature(items)) return;
        view.dispatch(state.tr
          .setMeta(documentSyntheticBoldWordAdvanceKey, DecorationSet.create(state.doc, items))
          .setMeta("addToHistory", false));
        view.dom.dispatchEvent(new CustomEvent("mrn-page-rebalance", { bubbles: true, detail: { reason: SYNTHETIC_BOLD_ADVANCE_REASON } }));
      };
      const schedule = () => {
        if (frame || disposed || !win) return;
        frame = win.requestAnimationFrame(run);
      };
      const onFonts = (event?: Event) => {
        // The families of the faces that arrived (WebKit names every face the
        // set holds in each event: lib/font-face-news); null reads them all again.
        const faces = newFontFacesOf(event) ??
          (event as (Event & { fontfaces?: ReadonlyArray<{ family?: string }> }) | undefined)?.fontfaces;
        const arrived = faces && faces.length > 0 && event?.type === "loadingdone"
          ? new Set(faces.flatMap((face) => fontFamilyNames(face.family ?? "")))
          : null;
        const drawsArrived = (stack: string) => arrived === null || fontFamilyNames(stack).some((name) => arrived.has(name));
        const probe = probes.get(doc);
        if (probe) for (const key of [...probe.widths.keys()]) if (drawsArrived(key.slice(key.indexOf("|", key.indexOf("|") + 1) + 1))) probe.widths.delete(key);
        // Only a block that names one of the faces measures anything a face
        // arriving can change (NO_NAMED_FACE), and only one read with the
        // family of a face that arrived: each of a long document's faces read
        // every bold block of it again (R286-D01: 14 faces, 3 s of an opening).
        const kept = cache;
        cache = new WeakMap();
        view.state.doc.descendants((node) => {
          if (!node.isTextblock) return true;
          const pieces = kept.get(node);
          if (pieces === NO_NAMED_FACE || pieces === UNSETTLED_NO_BOLD) cache.set(node, pieces);
          else if (pieces && arrived !== null) {
            const read = piecesFamilies.get(pieces);
            if (read && ![...read].some((name) => arrived.has(name))) cache.set(node, pieces);
          }
          return false;
        });
        schedule();
      };
      doc.fonts?.addEventListener?.("loadingdone", onFonts);
      doc.addEventListener(OFFICE_FONT_ASSETS_EVENT, onFonts);
      // The pages settled: the verdicts read while they settled are read again.
      const settling = win
        ? new win.MutationObserver(() => {
            if (!view.dom.hasAttribute(SETTLING_ATTR)) schedule();
          })
        : null;
      settling?.observe(view.dom, { attributes: true, attributeFilter: [SETTLING_ATTR] });
      schedule();
      return {
        update(current, oldState) {
          if (current.state.doc !== oldState.doc) schedule();
        },
        destroy() {
          disposed = true;
          settling?.disconnect();
          if (frame) win?.cancelAnimationFrame(frame);
          doc.fonts?.removeEventListener?.("loadingdone", onFonts);
          doc.removeEventListener(OFFICE_FONT_ASSETS_EVENT, onFonts);
          probes.get(doc)?.element.remove();
          probes.delete(doc);
        },
      };
    },
  });
}

export const DocumentSyntheticBoldWordAdvance = Extension.create({
  name: "documentSyntheticBoldWordAdvance",
  addProseMirrorPlugins: () => [createDocumentSyntheticBoldWordAdvancePlugin()],
});
