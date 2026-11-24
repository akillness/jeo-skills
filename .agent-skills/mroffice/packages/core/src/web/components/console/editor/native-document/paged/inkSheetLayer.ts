/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The strokes of a handwritten page at rest, drawn as one layer.
 *
 * A stroke is twenty elements (its frames, its drawing, a gradient of five
 * stops), and all of them stay in the render tree. A real note of 2,756 strokes
 * was 56,000 elements: fast scrolling in WebKit spent 8 s of 14 in frames over
 * 100 ms, with 1.5 s of script; and the page runs on the thread of every other
 * window, so with this note open the whole site was slow. Out of the render tree
 * they cost nothing: p95 149 → 37 ms, no frame over 100 ms.
 *
 * So once a sheet has rested, its strokes' drawings are copied into one SVG on
 * the sheet (a widget: ProseMirror keeps it among the sheet's children and reads
 * none of it) and their own contents are skipped (`content-visibility: hidden`).
 * Each keeps its node, its box and its place in the document: positions, the
 * eraser and the lasso read the document or the boxes as they did.
 *
 * Anything at all happening to a stroke (selected, lassoed, moved, painted again,
 * removed: a mutation on it) sends it back at once, and it comes back to the layer
 * when the page next rests. A stroke the layer cannot draw the same stays as it
 * is: one turned, faded or blended by its frames, or holding words.
 */
import { HOLLOW_SHEET_ATTR } from "./pageSheetView";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { inkLightWanted } from "./inkLightSwitch";

export const INK_MERGED_ATTR = "data-ink-merged";
const LAYER_ATTR = "data-ink-sheet-layer";

/** A mutation of a sheet's layer, or of whether a stroke is in it: nothing of the
 * page moved. */
export function inkLayerMutation(record: MutationRecord): boolean {
  if (record.type === "attributes" && record.attributeName === INK_MERGED_ATTR) return true;
  const target = record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
  if (target?.closest?.(`[${LAYER_ATTR}]`)) return true;
  return record.type === "childList" &&
    record.removedNodes.length === 0 &&
    Array.from(record.addedNodes).every((node) => node.nodeType === 1 && (node as Element).hasAttribute(LAYER_ATTR));
}

const SHEET_SELECTOR = "article[data-page-sheet]";
const STROKE_SELECTOR = `:scope > figure[data-ink-tool][data-ink-bare][data-float-mode="overlay"]:not([${INK_MERGED_ATTR}], [data-selected="true"], [data-multiselected="true"], [data-ink-lasso-member="true"], [data-ink-tape])`;
/** Fewer strokes than this on a page cost nothing worth a layer. */
const MIN_STROKES = 24;
/** How long a page rests before its strokes join its layer. */
const REST_MS = 2_500;
const SVG_NS = "http://www.w3.org/2000/svg";
/** The layer's own drawing rules, inside its shadow root (see layerFor). */
const LAYER_STYLE =
  "svg{position:absolute;top:0;left:0;width:1px;height:1px;overflow:visible;pointer-events:none}" +
  "svg [data-ink-stroke] path{pointer-events:visiblePainted}";

/** The drawing a sheet's layer holds: inside the shadow root of its host. */
function layerDrawingOf(host: Element | null): SVGSVGElement | null {
  return host?.shadowRoot?.querySelector<SVGSVGElement>("svg") ?? null;
}

/** Never for a page being printed: its copy stands on the strokes themselves. */
function layerWanted(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView;
  if (!win || (win as Window & { __mraiNoInkLayer?: boolean }).__mraiNoInkLayer) return false;
  // The strokes at rest have no node views to merge: their layers draw them
  // from the note's data (inkLightLayer).
  if (inkLightWanted(win)) return false;
  return !win.location.pathname.includes("/render/");
}

function drawnPlainly(stroke: Element, svg: SVGSVGElement, win: Window): boolean {
  for (let node: Element | null = svg; node && node !== stroke.parentElement; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if (
      style.transform !== "none" ||
      style.filter !== "none" ||
      style.mixBlendMode !== "normal" ||
      Number(style.opacity) !== 1 ||
      style.animationName !== "none"
    ) {
      return false;
    }
  }
  return true;
}

const number = (value: number): string => String(Math.round(value * 1000) / 1000);

/** A sheet's layer: a host whose drawing is in its shadow root (see layerFor). */
export function inkSheetLayerHost(doc: Document, key: string): HTMLElement {
  const host = doc.createElement("span");
  host.setAttribute(LAYER_ATTR, key);
  host.setAttribute("aria-hidden", "true");
  host.contentEditable = "false";
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = LAYER_STYLE;
  shadow.append(style, doc.createElementNS(SVG_NS, "svg"));
  return host;
}

/** The drawing a layer host holds (inkSheetLayerHost). */
export { layerDrawingOf as inkSheetLayerDrawing };

/** For a stroke in its sheet's layer: its drawing there, and the layers that
 * hold it (to take it back). */
const drawingOfStroke = new WeakMap<Element, Element>();
const layersOfStroke = new WeakMap<Element, InkSheetLayers>();

/** The drawing that paints `stroke` in its sheet's layer, while it is there.
 * Its box on screen is the stroke's own painted box (a stroke is taken into
 * the layer only drawn plainly: not turned, faded or blended). */
export function inkLayerDrawingOf(stroke: Element): Element | null {
  return stroke.hasAttribute(INK_MERGED_ATTR) ? drawingOfStroke.get(stroke) ?? null : null;
}

/** Take `stroke` back out of its sheet's layer (it is drawn by itself again,
 * and comes back to the layer when the page next rests). True when it was in
 * one. */
export function takeStrokeOutOfLayer(stroke: Element): boolean {
  const layers = layersOfStroke.get(stroke);
  if (!layers || !stroke.hasAttribute(INK_MERGED_ATTR)) return false;
  layers.takeBack(stroke);
  return true;
}

/** What places the strokes (the float pass) tells the layer: whether a sheet's
 * strokes were measured where they stand, and a way to have them measured. */
export interface InkLayerSettler {
  settled(sheet: Element): boolean;
  measure(): void;
}
const settlers = new WeakMap<EditorView, InkLayerSettler>();

export function setInkLayerSettler(view: EditorView, settler: InkLayerSettler | null): void {
  if (settler) settlers.set(view, settler);
  else settlers.delete(view);
}

/** A sheet not yet measured gets this many tries before its strokes join the
 * layer anyway (as they did before the layer asked). */
const SETTLE_TRIES = 2;
/** How soon the layer looks again after asking for a sheet to be measured. */
const SETTLE_STEP_MS = 160;

/** Shared with the plugin below: what a sheet's widget holds. */
class InkSheetLayers {
  private readonly settleTries = new WeakMap<Element, number>();
  private readonly layers = new WeakMap<Element, SVGSVGElement>();
  private readonly drawn = new Map<Element, Element>();
  private readonly observer: MutationObserver | null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private penDown = false;
  private destroyed = false;
  private readonly onDown = (event: Event) => {
    this.penDown = true;
    this.takeBackStrokeUnder(event);
  };
  private readonly onUp = () => {
    this.penDown = false;
    this.schedule();
  };

  constructor(private readonly view: EditorView) {
    const win = view.dom.ownerDocument.defaultView;
    this.observer = win ? new win.MutationObserver((records) => this.record(records)) : null;
    this.observer?.observe(view.dom, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true });
    view.dom.addEventListener("pointerdown", this.onDown, true);
    win?.addEventListener("pointerup", this.onUp, true);
    win?.addEventListener("pointercancel", this.onUp, true);
    this.schedule();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.observer?.disconnect();
    const win = this.view.dom.ownerDocument.defaultView;
    this.view.dom.removeEventListener("pointerdown", this.onDown, true);
    win?.removeEventListener("pointerup", this.onUp, true);
    win?.removeEventListener("pointercancel", this.onUp, true);
    this.drawn.clear();
  }

  schedule(after: number = REST_MS): void {
    if (this.destroyed || !layerWanted(this.view)) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.rest();
    }, after);
  }

  /** A stroke pressed goes back to being itself, and has the press: what selects
   * or drags it listens there. The mouse events after it find it by themselves. */
  private takeBackStrokeUnder(event: Event): void {
    // The layer's drawings are in its shadow root: the event's own target there.
    const target = (event.composedPath?.()[0] ?? event.target) as Element | null;
    const drawing = target?.closest?.("[data-ink-stroke]");
    if (!drawing) return;
    const stroke = this.strokeOf(drawing);
    if (!stroke) return;
    this.takeBack(stroke);
    const own = stroke.querySelector("svg path");
    if (!own) return;
    event.stopImmediatePropagation();
    const Pressed = event.constructor as new (type: string, init: EventInit) => Event;
    own.dispatchEvent(new Pressed(event.type, event as unknown as EventInit));
  }

  private strokeOf(drawing: Element): Element | null {
    for (const [stroke, held] of this.drawn) if (held === drawing) return stroke;
    return null;
  }

  takeBack(stroke: Element): void {
    const held = this.drawn.get(stroke);
    if (!held) return;
    this.drawn.delete(stroke);
    drawingOfStroke.delete(stroke);
    layersOfStroke.delete(stroke);
    held.remove();
    stroke.removeAttribute(INK_MERGED_ATTR);
    this.schedule();
  }

  private record(records: readonly MutationRecord[]): void {
    if (this.drawn.size === 0 && records.every((record) => record.type !== "childList")) return;
    let changed = false;
    for (const record of records) {
      if (record.type === "attributes") {
        const name = record.attributeName ?? "";
        const element = record.target as Element;
        if (name === INK_MERGED_ATTR || element.getAttribute(name) === record.oldValue) continue;
      }
      const target = record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
      if (target?.closest?.(`[${LAYER_ATTR}]`)) continue;
      changed = true;
      const stroke = target?.closest?.(`figure[${INK_MERGED_ATTR}]`);
      if (stroke) this.takeBack(stroke);
      if (record.type === "childList") {
        record.removedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const element = node as Element;
          if (element.matches(`figure[${INK_MERGED_ATTR}]`)) this.takeBack(element);
          else if (element.querySelector?.(`figure[${INK_MERGED_ATTR}]`)) {
            element.querySelectorAll(`figure[${INK_MERGED_ATTR}]`).forEach((inner) => this.takeBack(inner));
          }
        });
      }
    }
    if (changed) this.schedule();
  }

  /** The widget's element for a sheet (ProseMirror asks when it draws it): a host
   * whose drawing is in its shadow root. In the editable page, WebKit read every
   * element of the drawing at each change of the selection, finding the words
   * around the caret for the keyboard (WebPage::editorState,
   * Editor::stringForCandidateRequest walking candidate positions): on a note of
   * 3,000 strokes, putting the caret in the page took 10 s and every tap a
   * second on an iPad. A shadow tree is not part of the page's editing
   * positions, nor of the mutations the page observes; it draws and is hit the
   * same. */
  layerFor(key: string): HTMLElement {
    return inkSheetLayerHost(this.view.dom.ownerDocument, key);
  }

  private rest(): void {
    if (this.destroyed || this.view.isDestroyed) return;
    if (this.penDown || this.view.composing) {
      this.schedule();
      return;
    }
    const root = this.view.dom;
    const wanted: Array<{ pos: number; key: string }> = [];
    const work: Array<{ sheet: HTMLElement; strokes: Element[] }> = [];
    // A stroke joins the layer where the float pass put it. A sheet asleep at
    // that pass was never measured: merged as it stood, the first stroke
    // written anywhere took every stroke of it back out to measure it (900 at
    // once on a 3,000-stroke note, a 380 ms frame under the pen). It is
    // measured first, one sheet at a time, while the page rests.
    const settler = settlers.get(this.view);
    let unsettled: { sheet: HTMLElement; strokes: Element[] } | null = null;
    root.querySelectorAll<HTMLElement>(`:scope > ${SHEET_SELECTOR}`).forEach((sheet) => {
      if (sheet.hasAttribute(HOLLOW_SHEET_ATTR)) return;
      const strokes = Array.from(sheet.querySelectorAll(STROKE_SELECTOR));
      const standing = sheet.querySelector(`:scope > [${LAYER_ATTR}]`);
      const drawing = layerDrawingOf(standing);
      if (standing && !drawing) return;
      if (strokes.length === 0 || (!standing && strokes.length < MIN_STROKES)) return;
      if (!standing) {
        try {
          wanted.push({ pos: this.view.posAtDOM(sheet, 0), key: sheet.getAttribute("data-page-sheet") || "sheet" });
        } catch {
          // A sheet the view cannot place now: the next rest looks again.
        }
        return;
      }
      if (settler && !settler.settled(sheet)) {
        const tries = this.settleTries.get(sheet) ?? 0;
        if (tries < SETTLE_TRIES) {
          unsettled ??= { sheet, strokes };
          return;
        }
      }
      this.settleTries.delete(sheet);
      this.layers.set(sheet, drawing as SVGSVGElement);
      work.push({ sheet, strokes });
    });
    if (unsettled && settler) {
      const { sheet, strokes } = unsettled as { sheet: HTMLElement; strokes: Element[] };
      this.settleTries.set(sheet, (this.settleTries.get(sheet) ?? 0) + 1);
      // Reading a stroke's box wakes a sleeping sheet (sheetDormancy): the pass
      // then measures it.
      strokes[0]?.querySelector("svg")?.getBoundingClientRect();
      settler.measure();
      this.schedule(SETTLE_STEP_MS);
    }
    if (wanted.length > 0) {
      this.view.dispatch(
        this.view.state.tr
          .setMeta(inkSheetLayerKey, { positions: wanted.map((entry) => entry.pos) })
          .setMeta("addToHistory", false),
      );
      this.schedule();
    }
    const win = root.ownerDocument.defaultView;
    if (!win) return;
    const next = (index: number) => {
      if (index >= work.length || this.destroyed || this.penDown) {
        if (index < work.length) this.schedule();
        return;
      }
      this.draw(work[index].sheet, work[index].strokes, win);
      const idle = (win as Window & { requestIdleCallback?: (fn: () => void) => number }).requestIdleCallback;
      if (idle) idle.call(win, () => next(index + 1));
      else setTimeout(() => next(index + 1), 16);
    };
    next(0);
  }

  private draw(sheet: HTMLElement, strokes: readonly Element[], win: Window): void {
    const layer = this.layers.get(sheet);
    if (!layer?.isConnected) return;
    const sheetBox = sheet.getBoundingClientRect();
    const scaleX = sheet.offsetWidth > 0 ? sheetBox.width / sheet.offsetWidth : 1;
    const scaleY = sheet.offsetHeight > 0 ? sheetBox.height / sheet.offsetHeight : 1;
    const taken: Array<{ stroke: Element; markup: string }> = [];
    for (const stroke of strokes) {
      const svg = stroke.querySelector<SVGSVGElement>("svg");
      if (!svg || !svg.querySelector("path") || !drawnPlainly(stroke, svg, win)) continue;
      const box = svg.getBoundingClientRect();
      if (!(box.width > 0) || !(box.height > 0)) continue;
      const viewBox = svg.getAttribute("viewBox");
      taken.push({
        stroke,
        markup:
          `<svg data-ink-stroke="" x="${number((box.left - sheetBox.left) / scaleX)}" y="${number((box.top - sheetBox.top) / scaleY)}"` +
          ` width="${number(box.width / scaleX)}" height="${number(box.height / scaleY)}"` +
          `${viewBox ? ` viewBox="${viewBox}"` : ""} preserveAspectRatio="${svg.getAttribute("preserveAspectRatio") ?? "none"}"` +
          ` overflow="visible">${svg.innerHTML}</svg>`,
      });
    }
    if (taken.length === 0) return;
    const holder = sheet.ownerDocument.createElementNS(SVG_NS, "svg");
    holder.innerHTML = taken.map((entry) => entry.markup).join("");
    const drawings = Array.from(holder.children);
    const fragment = sheet.ownerDocument.createDocumentFragment();
    taken.forEach((entry, index) => {
      const drawing = drawings[index];
      if (!drawing) return;
      fragment.append(drawing);
      this.drawn.set(entry.stroke, drawing);
      drawingOfStroke.set(entry.stroke, drawing);
      layersOfStroke.set(entry.stroke, this);
      entry.stroke.setAttribute(INK_MERGED_ATTR, "true");
    });
    layer.append(fragment);
  }
}

export const inkSheetLayerKey = new PluginKey<DecorationSet>("inkSheetLayer");

/** A stroke on a sheet: drawn by its layer, the pass that places strokes looks at
 * it only when its sheet moves. */
export function strokeInLayer(stroke: Element): boolean {
  return stroke.hasAttribute(INK_MERGED_ATTR);
}

export const InkSheetLayer = Extension.create({
  name: "inkSheetLayer",
  addProseMirrorPlugins() {
    let layers: InkSheetLayers | null = null;
    return [
      new Plugin<DecorationSet>({
        key: inkSheetLayerKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, _old, state) {
            let next = set.map(tr.mapping, tr.doc);
            const asked = tr.getMeta(inkSheetLayerKey) as { positions: number[] } | undefined;
            if (asked) {
              next = next.add(
                state.doc,
                asked.positions.map((pos) =>
                  Decoration.widget(pos, () => (layers as InkSheetLayers).layerFor(String(pos)), {
                    side: -1,
                    ignoreSelection: true,
                    key: `ink-sheet-layer-${pos}`,
                  }),
                ),
              );
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            return inkSheetLayerKey.getState(state);
          },
        },
        view(view) {
          layers = new InkSheetLayers(view);
          return {
            update(_view, previous) {
              if (previous.doc !== view.state.doc) layers?.schedule();
            },
            destroy() {
              layers?.destroy();
              layers = null;
            },
          };
        },
      }),
    ];
  },
});
