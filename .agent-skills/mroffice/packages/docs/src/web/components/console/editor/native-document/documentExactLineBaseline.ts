/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { mergedRanges } from "@mrnote/core/web/components/console/editor/native-document/touchedTextblocks.ts";
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measureOfficeFontLineBox } from "@mrnote/core/web/components/office-ribbon/officeFontLineBox.ts";
import { documentDisplayFontPluginKey } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";
import { projectionFontReach, sheetRangesOf, textblocksIn } from "@mrnote/core/web/components/console/editor/native-document/projectionFontNews.ts";
import { docsLayoutPerfLegacy } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutPerfLegacy.ts";
import { ChangedSheets } from "./paged/changedSheets";
import { textEngineEnabled } from "@mrnote/core/web/lib/text-engine/flags.ts";
import {
  DOCUMENT_EXACT_LINE_PENDING,
  PAGE_LEDGER_BACKGROUND_ATTR,
  writeDocumentLayoutStatus,
} from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { PAGE_LEDGER_CONVERGED_EVENT } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { visibleSheetRange } from "./paged/ledger/ledgerScope";
import { sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import { msSinceTyping, TYPING_IDLE_MS } from "@mrnote/core/web/lib/typing-session.ts";

/**
 * Where Word puts the text of an EXACT line: its baseline 0.8 of the line
 * below the line's top, whatever the face and size (Word 16 for Mac: 24pt
 * lines put it 19.2pt down in Calibri, Times New Roman, Cambria and Aptos
 * alike, 30pt Arial 24.0pt, 14pt 11.28pt, 40pt 32.16pt;
 * `wp-ea/exact-baseline.docx`).
 *
 * The engine centres each face's own ascent and descent in the line, in whole
 * pixels. The paragraph's text is moved by the difference, which
 * note-editor.css's exact-line rule reads as `--doc-word-line-shift` (paint
 * only: the line boxes, and every page break with them, stay where they are).
 */
export const WORD_EXACT_LINE_BASELINE = 0.8;

const exactLineBaselineKey = new PluginKey<DecorationSet>("documentExactLineBaseline");
const MAX_MEASUREMENTS = 256;

/** Sheets either side of the reader's whose shifts do not wait for the layout. */
const EXACT_LINE_NEAR_SHEETS = 3;
/** How soon far sheets' shifts look again whether the layout has ended. */
const EXACT_LINE_RETRY_MS = 1500;

function isExactLine(node: ProseMirrorNode): number | null {
  if (!node.isTextblock || node.attrs.lineHeightPt == null || node.attrs.lineHeightRule === "atLeast") return null;
  const points = Number(node.attrs.lineHeightPt);
  return Number.isFinite(points) && points > 0 ? points : null;
}

function shorthand(css: CSSStyleDeclaration): string {
  return `${css.fontStyle || "normal"} ${css.fontWeight || "400"} ${css.fontSize} ${css.fontFamily}`;
}

/** The first element that paints text in the block: its face is the line's. */
function firstTextElement(block: HTMLElement): HTMLElement | null {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if ((text.textContent ?? "").trim() && text.parentElement) return text.parentElement;
  }
  return null;
}

/** What a block's shift was read from, and the shift (null: none). */
interface BlockReading {
  readonly element: HTMLElement;
  readonly signature: string;
  readonly shift: number | null;
}

/**
 * The shifts read by the last passes, by block. A block's shift is a function
 * of its line height (its node), the computed faces of the block and of its
 * first run, and the writing mode: all decided by the elements' attributes and
 * those of their ancestors (which select the rules), and the context the
 * memo's owner keys it by (fonts, the display fonts, the document's own
 * attributes). A block whose node, element and those attributes are all as
 * they were is not read again: the pass read every exact paragraph's computed
 * style after every change, a style recalculation of every page the browser
 * otherwise skips (R286-D01: 16 s of a 276 s open).
 */
export class ExactLineReadings {
  private readings = new WeakMap<ProseMirrorNode, BlockReading>();
  private context = "";

  /** Whether the context changed: everything read before is gone. */
  enter(context: string): boolean {
    if (context === this.context) return false;
    this.context = context;
    this.clear();
    return true;
  }

  clear(): void {
    this.readings = new WeakMap();
  }

  get(block: ProseMirrorNode): BlockReading | undefined {
    return this.readings.get(block);
  }

  set(block: ProseMirrorNode, reading: BlockReading): void {
    this.readings.set(block, reading);
  }

  delete(block: ProseMirrorNode): void {
    this.readings.delete(block);
  }
}

/** The shift this plugin writes itself selects no face. */
const OWN_SHIFT = /--doc-word-line-shift\s*:[^;]*;?/g;

function attributesOf(element: Element): string {
  let key = element.nodeName;
  for (const name of element.getAttributeNames()) {
    // A sheet going dormant or waking (paged/sheetDormancy) changes no face.
    if (name === "data-page-dormant") continue;
    let value = element.getAttribute(name) ?? "";
    if (name === "style") {
      value = value.replace(OWN_SHIFT, "").trim();
      if (value === "") continue;
    }
    key += ` ${name}=${value}`;
  }
  return key;
}

/** The shifts of the blocks in `ranges`, of the whole document without them. */
function shifts(view: EditorView, cache: Map<string, number | null>, readings?: ExactLineReadings, ranges?: readonly (readonly [number, number])[]): Decoration[] {
  const doc = view.dom.ownerDocument, win = doc.defaultView;
  if (!win) return [];
  const root = view.dom;
  // The ancestors' attributes, each element's once a pass (a sheet holds many blocks).
  const ancestry = new Map<Element, string>();
  const above = (element: Element | null): string => {
    if (!element || element === root) return "";
    let key = ancestry.get(element);
    if (key === undefined) {
      key = `${above(element.parentElement)}<${attributesOf(element)}`;
      ancestry.set(element, key);
    }
    return key;
  };
  const signatureOfBlock = (element: HTMLElement, run: HTMLElement | null): string => {
    let inner = "";
    for (let at: Element | null = run; at && at !== element; at = at.parentElement) inner = `<${attributesOf(at)}${inner}`;
    return `${above(element.parentElement)}<${attributesOf(element)}|${inner}`;
  };
  const baselineIn = (font: string, pixels: number): number | null => {
    const key = `${font}|${pixels}`;
    let baseline = cache.get(key);
    if (baseline === undefined) {
      const measured = measureOfficeFontLineBox(doc, {font, lineHeight: `${pixels}px`, measureHeight: false});
      baseline = measured && Number.isFinite(measured.baselinePx) ? measured.baselinePx : null;
      if (cache.size >= MAX_MEASUREMENTS) cache.delete(cache.keys().next().value!);
      cache.set(key, baseline);
    }
    return baseline;
  };
  const decorations: Decoration[] = [];
  const visit = (node: ProseMirrorNode, position: number): boolean => {
    if (!node.isTextblock) return true;
    const points = isExactLine(node);
    if (points === null) return false;
    const element = view.nodeDOM(position);
    // A list item's marker belongs to the item: the stylesheet leaves list
    // paragraphs where the browser puts them, and so does this.
    if (!(element instanceof win.HTMLElement) || element.parentElement?.closest("li")) return false;
    const run = firstTextElement(element);
    const signature = readings ? signatureOfBlock(element, run) : "";
    const known = readings?.get(node);
    if (known && known.element === element && known.signature === signature) {
      if (known.shift !== null) {
        decorations.push(Decoration.node(position, position + node.nodeSize,
          {style: `--doc-word-line-shift:${known.shift}px`}, {exactLineShift: known.shift}));
      }
      return false;
    }
    const shift = readShift(element, run, points);
    readings?.set(node, {element, signature, shift});
    if (shift === null) return false;
    decorations.push(Decoration.node(position, position + node.nodeSize,
      {style: `--doc-word-line-shift:${shift}px`}, {exactLineShift: shift}));
    return false;
  };
  if (ranges) for (const [from, to] of mergedRanges(ranges)) view.state.doc.nodesBetween(from, to, visit);
  else view.state.doc.descendants(visit);
  return decorations;

  function readShift(element: HTMLElement, run: HTMLElement | null, points: number): number | null {
    const mode = win!.getComputedStyle(element).writingMode;
    if (mode && mode !== "horizontal-tb") return null;
    const pixels = ptToPx(points);
    // Every box on the line shares one baseline, as low as the lowest one the
    // engine centres: the paragraph's own strut and the run that opens it --
    // unless the run takes no line height (note-editor.css's exact-line rule,
    // WUA 109), which leaves the strut alone to place the baseline. Counting
    // such a run anyway left a run larger than the paragraph's own face up to
    // a quarter line high (a converter's 22pt line in a 10pt paragraph: 6 px).
    const own = baselineIn(shorthand(win!.getComputedStyle(element)), pixels);
    const runStyle = run && run !== element ? win!.getComputedStyle(run) : null;
    const first = runStyle && Number.parseFloat(runStyle.lineHeight) !== 0
      ? baselineIn(shorthand(runStyle), pixels) : own;
    if (own === null || first === null) return null;
    return Math.round((pixels * WORD_EXACT_LINE_BASELINE - Math.max(own, first)) * 64) / 64;
  }
}

const signatureOf = (items: readonly Decoration[]) =>
  items.map((item) => `${item.from}:${item.spec.exactLineShift as number}`).sort().join(",");

export const DocumentExactLineBaseline = Extension.create({
  name: "documentExactLineBaseline",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: exactLineBaselineKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (transaction, previous) =>
            (transaction.getMeta(exactLineBaselineKey) as DecorationSet | undefined) ??
            previous.map(transaction.mapping, transaction.doc),
        },
        props: { decorations: (state) => exactLineBaselineKey.getState(state) },
        view(view) {
          const win = view.dom.ownerDocument.defaultView;
          const cache = new Map<string, number | null>();
          const readings = new ExactLineReadings();
          // Laying the pages out once on opening (L3-DESIGN): only the sheets
          // that changed are read again, the rest keep their mapped shifts.
          const changed = textEngineEnabled("docs-layout") ? new ChangedSheets() : null;
          changed?.observe(view.dom);
          const contextIds = new WeakMap<object, number>();
          let nextContextId = 1;
          const idOf = (value: unknown): number => {
            if (value === null || (typeof value !== "object" && typeof value !== "function")) return 0;
            let id = contextIds.get(value as object);
            if (id === undefined) contextIds.set(value as object, (id = nextContextId++));
            return id;
          };
          let frame: number | null = null, destroyed = false;
          // While the pages are still being laid out, a far sheet's shifts wait:
          // they move a line's words within it, never a line, and each pass
          // moved its blocks and asked them again (a 124-page report: 1,257
          // reads of its computed style, 7 of its 75 s to its last page).
          const waiting = new Set<Element>();
          let waitingForAll = false;
          let retry: ReturnType<typeof setTimeout> | null = null;
          const layoutBusy = () =>
            view.dom.hasAttribute("data-pagination-initial-settling") || view.dom.hasAttribute(PAGE_LEDGER_BACKGROUND_ATTR);
          const notePending = () => {
            const pending = waitingForAll || waiting.size > 0;
            writeDocumentLayoutStatus(view.dom, DOCUMENT_EXACT_LINE_PENDING, pending ? "true" : null, view);
            // Whatever ended the layout (it may stall rather than converge).
            if (pending && retry === null && win) {
              retry = setTimeout(() => {
                retry = null;
                if (!destroyed && !layoutBusy()) schedule();
                else if (!destroyed) notePending();
              }, EXACT_LINE_RETRY_MS);
            }
          };
          /** The sheets to read now of `sheets` (null: all), the far ones left waiting. */
          const sheetsToReadNow = (sheets: ReadonlySet<Element> | null): ReadonlySet<Element> | null => {
            if (!changed) return sheets;
            const all = sheets === null || waitingForAll;
            const wanted = new Set<Element>(sheets ?? []);
            for (const sheet of waiting) wanted.add(sheet);
            if (!layoutBusy()) {
              waiting.clear();
              waitingForAll = false;
              return all ? null : wanted;
            }
            const list = sheetsOf(view.dom);
            const visible = visibleSheetRange(view, list);
            if (!visible) {
              if (all) waitingForAll = true;
              for (const sheet of wanted) waiting.add(sheet);
              return new Set<Element>();
            }
            const near = new Set<Element>();
            for (let at = Math.max(0, visible.first - EXACT_LINE_NEAR_SHEETS); at <= Math.min(list.length - 1, visible.last + EXACT_LINE_NEAR_SHEETS); at += 1) {
              if (all || wanted.has(list[at])) near.add(list[at]);
            }
            waiting.clear();
            if (all) waitingForAll = true;
            for (const sheet of wanted) if (!near.has(sheet)) waiting.add(sheet);
            return near;
          };
          let typingTimer: ReturnType<typeof setTimeout> | null = null;
          /** The block under the caret has a shift (mapped from before the key). */
          const caretBlockKeepsItsShift = () => {
            const { $from } = view.state.selection;
            if (!$from.parent.isTextblock || isExactLine($from.parent) === null) return true;
            const current = exactLineBaselineKey.getState(view.state) ?? DecorationSet.empty;
            return current.find($from.before(), $from.after()).length > 0;
          };
          const run = () => {
            frame = null;
            if (destroyed || view.isDestroyed) return;
            // A shift moves a line's words a pixel or two and no line: a key
            // typed in a paragraph that has its shift leaves it mapped until
            // the hand pauses (a table-heavy page: 22 ms of every key). A
            // paragraph just made (Enter) has none, and is read at once.
            const sinceTyping = msSinceTyping();
            if (sinceTyping < TYPING_IDLE_MS && caretBlockKeepsItsShift()) {
              if (typingTimer === null) {
                typingTimer = setTimeout(() => {
                  typingTimer = null;
                  schedule();
                }, TYPING_IDLE_MS - sinceTyping);
              }
              return;
            }
            // What decides every block's faces from outside the document's
            // elements: its attributes, the page fonts bound to its runs, and
            // the editor root and the elements around it (the window's
            // classes and the content columns' document defaults).
            // The root's own status flags (the ledger's, ProseMirror's focus)
            // select no face; its classes and style may.
            const rootClasses = [...view.dom.classList].filter((name) => !name.startsWith("ProseMirror-")).sort().join(" ");
            const columns = view.dom.closest(".note-editor-content-columns");
            const outside = `${rootClasses}|${view.dom.getAttribute("style") ?? ""}|${columns ? attributesOf(columns) : ""}`;
            // The font plan, not the plugin's state: that is a new object after every
            // edit (its decorations), which threw every reading away with each key.
            const contextChanged = readings.enter(`${idOf(view.state.doc.attrs)}|${idOf(documentDisplayFontPluginKey.getState(view.state)?.plan)}|${outside}`);
            if (contextChanged) changed?.invalidate();
            const current = exactLineBaselineKey.getState(view.state) ?? DecorationSet.empty;
            const sheets = changed ? sheetsToReadNow(changed.take()) : null;
            notePending();
            if (sheets) {
              const ranges: [number, number][] = [];
              // The sheets in order: `nodeDOM` walks the sheets before each it
              // is asked for, and this runs after every key.
              const articles = sheetsOf(view.dom);
              const inOrder = articles.length === view.state.doc.childCount;
              view.state.doc.forEach((node, offset, index) => {
                const dom = inOrder ? articles[index] : view.nodeDOM(offset);
                if (dom instanceof win!.Element && sheets.has(dom)) ranges.push([offset, offset + node.nodeSize]);
              });
              const added = shifts(view, cache, docsLayoutPerfLegacy() ? undefined : readings, ranges);
              const removed = ranges.flatMap(([from, to]) => current.find(from, to));
              if (signatureOf(added) === signatureOf(removed)) return;
              view.dispatch(view.state.tr.setMeta(exactLineBaselineKey, current.remove(removed).add(view.state.doc, added)).setMeta("addToHistory", false));
              return;
            }
            const next = shifts(view, cache, docsLayoutPerfLegacy() ? undefined : readings);
            if (signatureOf(next) === signatureOf(current.find())) return;
            view.dispatch(view.state.tr.setMeta(exactLineBaselineKey, DecorationSet.create(view.state.doc, next)).setMeta("addToHistory", false));
          };
          const schedule = () => {
            if (!win || destroyed || frame !== null) return;
            frame = win.requestAnimationFrame(run);
          };
          // A face that arrives later has other ascent and descent.
          const fontsLoaded = (event?: Event) => {
            // (projectionFontNews) With the trial, only the sheets drawing
            // the arrived face's characters, and the baselines of its family.
            const reach = projectionFontReach(view, "exact-line", event);
            if (reach === "none") return;
            if (reach === "all" || !changed) {
              cache.clear();
              readings.clear();
              changed?.invalidate();
            } else {
              for (const key of [...cache.keys()]) {
                const lower = key.toLowerCase();
                if (reach.families.some((family) => lower.includes(family))) cache.delete(key);
              }
              textblocksIn(view, sheetRangesOf(view, reach.sheets), (node) => readings.delete(node));
              for (const sheet of reach.sheets) changed.mark(sheet);
            }
            schedule();
          };
          view.dom.ownerDocument.fonts?.addEventListener?.("loadingdone", fontsLoaded);
          const lookAgain = () => { if (waitingForAll || waiting.size > 0) schedule(); };
          view.dom.addEventListener(PAGE_LEDGER_CONVERGED_EVENT, lookAgain);
          view.dom.ownerDocument.addEventListener("scroll", lookAgain, { capture: true, passive: true });
          schedule();
          return {
            update: (_view, previous) => {
              // A page font bound to the runs (documentDisplayFonts) changes
              // the face the line is set in without changing the document.
              if (previous.doc !== view.state.doc ||
                  documentDisplayFontPluginKey.getState(previous)?.plan !== documentDisplayFontPluginKey.getState(view.state)?.plan) schedule();
            },
            destroy: () => {
              destroyed = true;
              if (retry !== null) clearTimeout(retry);
              if (typingTimer !== null) clearTimeout(typingTimer);
              view.dom.removeEventListener(PAGE_LEDGER_CONVERGED_EVENT, lookAgain);
              view.dom.ownerDocument.removeEventListener("scroll", lookAgain, { capture: true });
              changed?.disconnect();
              if (frame !== null) win?.cancelAnimationFrame(frame);
              view.dom.ownerDocument.fonts?.removeEventListener?.("loadingdone", fontsLoaded);
            },
          };
        },
      }),
    ];
  },
});
