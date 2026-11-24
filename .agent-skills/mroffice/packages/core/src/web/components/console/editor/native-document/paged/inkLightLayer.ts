/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@tiptap/pm/view";

import { documentFloatingStack, documentShapeRelativeHeight } from "../../../../../lib/document-shapes";
import { floatStackZIndex } from "../../../../../lib/office-float-anchor";
import { inkPointerArbiter } from "../../../../../lib/ink-pointer-policy";
import { bodyKeepOnPage, sheetGeometry } from "../floatingTextBoxLayout";
import { documentShapeMultiSelection } from "../documentShapeExtension";
import {
  INK_LAYER_STROKE_ATTR,
  inkLayerDrawing,
  inkLayerDrawingHolder,
  inkStrokeAttrs,
  inkStrokeDrawsInLayer,
  placeInkLayerDrawing,
  type InkLayerDrawing,
} from "../inkStrokeDrawing";
import { inkSheetLayerDrawing, inkSheetLayerHost } from "./inkSheetLayer";
import { inkLightWanted } from "./inkLightSwitch";
import { inkStrokeBoxOnSheet, inkStrokeCanvas, outOfFlowStrokeElement, type InkStrokeBox } from "./inkStrokePlacement";
import { paginationLayoutScale } from "./paginationGeometry";
import { SHEET_DORMANT_ATTR } from "./sheetDormancy";

/** On a stroke's empty element while its sheet's layer draws it. */
export const INK_LIGHT_ATTR = "data-ink-light";
/** On a layer host of this module: "ink" or "highlight". */
export const INK_LIGHT_HOST_ATTR = "data-ink-light-layer";
/** On a layer host: the run of the sheet's stack it draws (sheetBands). */
const INK_LIGHT_BAND_ATTR = "data-ink-light-band";
/** The decoration spec key that keeps a stroke its whole node view. */
export const INK_LIVE_SPEC = "inkLive";

const SHEET_SELECTOR = "article[data-page-sheet]";
const SHAPE_NODE = "documentShape";
/** Strokes built in one task beyond this many are drawn in slices after it
 * (a note opening); fewer (a landing, an eraser's pieces, an undo) are drawn
 * in the frame they arrive in. */
const DRAWN_AT_ONCE_PER_TASK = 128;
/** One slice of drawing keeps the thread at most this long. */
const SLICE_BUDGET_MS = 6;
/** A stroke the reader worked on goes back to the layer this long after. */
const LINGER_MS = 1500;
/** After this long with no change, the sheets whose strokes stand under a
 * block are placed again (a font or a picture arriving moves no mutation). */
const SWEEP_AFTER_QUIET_MS = 2500;
/** Frames a sheet may wait for its layer's widget. */
const HOSTLESS_TRIES = 10;
/** How soon a sheet not laid out yet (no size: a hidden window) is looked
 * at again. */
const UNLAID_RETRY_MS = 500;
/** Sheets near the view but out of it are drawn this long after the last
 * strokes built in bulk (the note's opening). */
const OPENING_QUIET_MS = 4000;

type HostKind = "ink" | "highlight";

/** Strokes the layer could not place (a table cell, newspaper columns, a
 * drawing it cannot reproduce): their node view draws them from then on. */
const unplaceable = new WeakSet<object>();
/** Counts additions to `unplaceable` (what was read from it is read again). */
let unplaceableGeneration = 0;

/** Whether `view` draws its strokes at rest in their sheets' layers
 * (inkLightSwitch). */
export function inkLightEnabled(view: EditorView): boolean {
  return inkLightWanted(view.dom.ownerDocument.defaultView);
}

/** Whether these decorations keep a stroke its whole node view. */
export function inkLiveIn(decorations: readonly Decoration[]): boolean {
  return decorations.some((decoration) => (decoration.spec as Record<string, unknown> | undefined)?.[INK_LIVE_SPEC] === true);
}

/** Whether the stroke `node` is drawn by its sheet's layer in `view`, given
 * its decorations: its node view is then a `LightInkView`. */
export function inkStrokeRestsInLayer(view: EditorView, node: ProseMirrorNode, decorations: readonly Decoration[]): boolean {
  return (
    node.type.name === SHAPE_NODE &&
    inkLightEnabled(view) &&
    // Pages to draw on (a document held as pages, its layers there).
    (inkLightKey.getState(view.state)?.sheets.length ?? 0) > 0 &&
    !unplaceable.has(node.attrs) &&
    !inkLiveIn(decorations) &&
    inkStrokeDrawsInLayer(node)
  );
}

// ---------------------------------------------------------------------------
// The empty element of a stroke drawn by its layer.

let builtThisTask = 0;
let taskResetQueued = false;
function countBuilt(): number {
  if (!taskResetQueued) {
    taskResetQueued = true;
    queueMicrotask(() => {
      builtThisTask = 0;
      taskResetQueued = false;
    });
  }
  builtThisTask += 1;
  return builtThisTask;
}

export class LightInkView implements NodeView {
  readonly dom: HTMLElement;
  node: ProseMirrorNode;
  /** Its drawing (undefined: not painted yet; null: the layer cannot). */
  drawing: InkLayerDrawing | null | undefined = undefined;
  /** The numbers it was last placed from (its sheet's geometry, its place
   * in the flow): placed again only when they change. */
  placedWith: string | null = null;
  /** Where it was last placed on its sheet, and the corner of its sheet's
   * content and its place in the flow it was placed from (sheet px). */
  box: InkStrokeBox | null = null;
  origin: { readonly left: number; readonly top: number } | null = null;
  /** Built with many others (a note opening): drawn in slices. */
  bulk: boolean;
  hidden = false;
  destroyed = false;

  constructor(
    node: ProseMirrorNode,
    readonly view: EditorView,
    readonly getPos: () => number | undefined,
  ) {
    this.node = node;
    const dom = view.dom.ownerDocument.createElement("figure");
    dom.setAttribute(INK_LIGHT_ATTR, "");
    dom.setAttribute("data-ink-tool", String(node.attrs.inkTool ?? ""));
    // Out of the flow (the ledger charges it nothing, the float pass finds
    // the place in the flow of the strokes after it past it).
    dom.setAttribute("data-float-mode", "overlay");
    dom.contentEditable = "false";
    dom.style.display = "none";
    this.dom = dom;
    this.bulk = countBuilt() > DRAWN_AT_ONCE_PER_TASK;
    storeOf(view).add(this);
  }

  update(node: ProseMirrorNode, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type || !inkStrokeRestsInLayer(this.view, node, decorations)) return false;
    if (node.attrs !== this.node.attrs) {
      this.dom.setAttribute("data-ink-tool", String(node.attrs.inkTool ?? ""));
      this.node = node;
      storeOf(this.view).changed(this);
    } else {
      this.node = node;
    }
    return true;
  }

  /** Selected while drawn by its layer (the selection plugin's decoration
   * makes the whole node view first; this is the fallback). */
  selectNode(): void {
    storeOf(this.view).wakeSoon(this);
  }

  deselectNode(): void {}

  stopEvent(): boolean {
    return false;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    storeOf(this.view).remove(this);
  }
}

const lightViews = new WeakMap<Element, LightInkView>();
/** Where the layer last drew a stroke, by its attributes. */
const wokenPlaces = new WeakMap<object, { box: InkStrokeBox; origin: { left: number; top: number } }>();

/**
 * A stroke's whole node view just built in place of its empty element (it
 * was woken): its stage is put where the layer drew it, so a read of its box
 * at once (the lasso's frame, a drag starting under the press) finds it
 * there, not at its paragraph's corner; the float pass places it exactly in
 * the frame after.
 */
export function placeWokenInkStage(dom: HTMLElement, nodeAttrs: Readonly<Record<string, unknown>>): void {
  const place = wokenPlaces.get(nodeAttrs);
  if (!place) return;
  const stage = dom.querySelector<HTMLElement>(":scope > div");
  if (!stage) return;
  const canvas = inkStrokeCanvas(inkStrokeAttrs(nodeAttrs));
  stage.style.left = `${place.box.left - canvas.x - place.origin.left}px`;
  stage.style.top = `${place.box.top - canvas.y - place.origin.top}px`;
}

/** The layer-drawn stroke whose empty element is `element`, if it is one. */
export function lightInkViewOf(element: unknown): LightInkView | null {
  return element instanceof Element ? lightViews.get(element) ?? null : null;
}

// ---------------------------------------------------------------------------
// A sheet's frame: what places its strokes, read once per task.

interface SheetFrame {
  readonly sheet: HTMLElement;
  readonly rect: DOMRect;
  readonly scale: { readonly x: number; readonly y: number };
  readonly geometry: NonNullable<ReturnType<typeof sheetGeometry>>;
  /** The left of the sheet's content (border and padding), sheet px. */
  readonly contentLeft: number;
  /** Where each stroke element's place in the flow starts (sheet px). */
  flowTopOf(element: Element): number;
  /** Whether a stroke's place was read off a block of the sheet's content. */
  readonly underBlocks: boolean;
}

class SheetAsleep extends Error {}

function readSheetFrame(view: EditorView, sheet: HTMLElement, mayWake = false): SheetFrame | null {
  const geometry = sheetGeometry(sheet, bodyKeepOnPage(view));
  if (!geometry) return null;
  const rect = sheet.getBoundingClientRect();
  const layoutScale = paginationLayoutScale(sheet);
  const scale = { x: layoutScale.x || 1, y: layoutScale.y || 1 };
  const style = getComputedStyle(sheet);
  const contentTop = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0);
  const contentLeft = (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingLeft) || 0);
  const tops = new Map<Element, number>();
  let underBlocks = false;
  /** An in-flow block's bottom with its space after, or null out of the flow. */
  const bottomOf = (block: Element): number | null => {
    if (!(block instanceof HTMLElement)) return null;
    if (outOfFlowStrokeElement(block) || block.hasAttribute("data-ink-sheet-layer")) return null;
    // Reading a block of a sleeping sheet would wake it (sheetDormancy).
    if (!mayWake && sheet.hasAttribute(SHEET_DORMANT_ATTR)) throw new SheetAsleep();
    const blockStyle = getComputedStyle(block);
    if (blockStyle.display === "none" || blockStyle.position === "absolute" || blockStyle.position === "fixed") return null;
    const bottom = block.getBoundingClientRect().bottom;
    underBlocks = true;
    return (bottom - rect.top) / scale.y + Math.max(0, Number.parseFloat(blockStyle.marginBottom) || 0);
  };
  const flowTopOf = (element: Element): number => {
    const known = tops.get(element);
    if (known !== undefined) return known;
    const chain: Element[] = [];
    let top: number | undefined;
    for (let current: Element = element; top === undefined; ) {
      const cached = tops.get(current);
      if (cached !== undefined) {
        top = cached;
        break;
      }
      chain.push(current);
      const previous = current.previousElementSibling;
      if (!previous) {
        top = contentTop;
        break;
      }
      const bottom = bottomOf(previous);
      if (bottom !== null) {
        top = bottom;
        break;
      }
      current = previous;
    }
    for (const link of chain) tops.set(link, top);
    return top;
  };
  return {
    sheet,
    rect,
    scale,
    geometry,
    contentLeft,
    flowTopOf,
    get underBlocks() {
      return underBlocks;
    },
  };
}

// ---------------------------------------------------------------------------
// The layers of one editor.

interface HostState {
  readonly svg: SVGSVGElement;
  /** Its holders, lowest first, with their stroke's stacking height. */
  readonly order: Array<{ readonly height: number; readonly holder: SVGElement }>;
}

const stores = new WeakMap<EditorView, InkLightStore>();
const storesByRoot = new WeakMap<Element, InkLightStore>();

function storeOf(view: EditorView): InkLightStore {
  let store = stores.get(view);
  if (!store) {
    store = new InkLightStore(view);
    stores.set(view, store);
    storesByRoot.set(view.dom, store);
  }
  return store;
}

class InkLightStore {
  private readonly views = new Set<LightInkView>();
  /** Strokes to place (new, changed, or their sheet changed). */
  private readonly pending = new Set<LightInkView>();
  /** Sheets whose strokes are all placed again. */
  private readonly dirtySheets = new Set<HTMLElement>();
  /** Sheets that wait to wake before their strokes can be placed. */
  private readonly asleep = new Set<HTMLElement>();
  /** Sheets whose strokes stand under a block of their content. */
  private readonly underBlocks = new WeakSet<HTMLElement>();
  private readonly hosts = new WeakMap<Element, HostState>();
  private readonly owners = new WeakMap<SVGSVGElement, LightInkView>();
  /** Strokes to paint, after the frame (built in bulk). */
  private readonly toPaint = new Set<LightInkView>();
  private readonly hostlessTries = new WeakMap<HTMLElement, number>();
  /** Sheets far from the reader, drawn when they come near. */
  private readonly far = new Set<HTMLElement>();
  private scrollFrame = 0;
  private distances = new WeakMap<HTMLElement, number>();
  private boxes = new WeakMap<HTMLElement, DOMRect>();
  /** The sheets whose layers took a place in the stack, looked at again
   * after each change of the document (`restack`). */
  private readonly stackedHosts = new Map<HTMLElement, readonly HostState[]>();
  /** Each sheet's place in the floating stack, by the page node it read. */
  private readonly stacks = new WeakMap<HTMLElement, { page: ProseMirrorNode; heights: readonly number[]; z: string }>();
  private boxesAt = Number.NEGATIVE_INFINITY;
  private distancesAt = Number.NEGATIVE_INFINITY;
  private reviewTimer: ReturnType<typeof setTimeout> | null = null;
  /** When strokes were last built in bulk (a note opening, a page loaded). */
  lastBulkAt = Number.NEGATIVE_INFINITY;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private sliceTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;
  private frames = new Map<HTMLElement, SheetFrame | null>();
  private framesQueued = false;
  /** Frames read for the editor's own questions (they may wake a sheet). */
  private askedFrames = new Map<HTMLElement, SheetFrame | null>();
  private askedQueued = false;
  private observer: MutationObserver | null = null;
  private wakeQueued = new Set<LightInkView>();
  /** Placing may wake a sleeping sheet (a print copies every sheet). */
  private waking = false;
  private started = false;
  private readonly onDown = (event: Event) => this.pressed(event);

  constructor(private readonly view: EditorView) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    const win = this.view.dom.ownerDocument.defaultView;
    this.observer = win ? new win.MutationObserver((records) => this.observe(records)) : null;
    this.observer?.observe(this.view.dom, { subtree: true, childList: true, attributes: true, characterData: true });
    this.view.dom.addEventListener("pointerdown", this.onDown, true);
    win?.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    this.schedule();
  }

  destroy(): void {
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
    this.view.dom.removeEventListener("pointerdown", this.onDown, true);
    const win = this.view.dom.ownerDocument.defaultView;
    win?.removeEventListener("scroll", this.onScroll, true);
    if (this.scrollFrame && win) win.cancelAnimationFrame(this.scrollFrame);
    if (this.frame && win) win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.sliceTimer !== null) clearTimeout(this.sliceTimer);
    if (this.sweepTimer !== null) clearTimeout(this.sweepTimer);
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.reviewTimer !== null) clearTimeout(this.reviewTimer);
    stores.delete(this.view);
  }

  /** The host a layer widget draws for `kind`. */
  host(kind: HostKind, band = 0): HTMLElement {
    const host = inkSheetLayerHost(this.view.dom.ownerDocument, kind);
    host.setAttribute(INK_LIGHT_HOST_ATTR, kind);
    host.setAttribute(INK_LIGHT_BAND_ATTR, String(band));
    // The highlighters multiply over the page, as each one's own ranked
    // element did (WUA 148); inside the layer each multiplies over the
    // strokes before it too.
    if (kind === "highlight") host.style.mixBlendMode = "multiply";
    return host;
  }

  add(view: LightInkView): void {
    if (view.bulk) this.lastBulkAt = performance.now();
    this.views.add(view);
    lightViews.set(view.dom, view);
    this.pending.add(view);
    this.schedule();
  }

  changed(view: LightInkView): void {
    this.takeDown(view);
    view.drawing = undefined;
    view.box = null;
    view.bulk = countBuilt() > DRAWN_AT_ONCE_PER_TASK;
    this.pending.add(view);
    this.schedule();
  }

  remove(view: LightInkView): void {
    // Its node view, when one is built in its place (a stroke woken), stands
    // where the layer drew it until the float pass places it.
    if (view.box && view.origin) wokenPlaces.set(view.node.attrs, { box: view.box, origin: view.origin });
    this.views.delete(view);
    this.pending.delete(view);
    this.toPaint.delete(view);
    this.takeDown(view);
    if (view.drawing && this.owners.get(view.drawing.element) === view) this.owners.delete(view.drawing.element);
  }

  /** Hide or show a stroke the layer draws (the replay draws it itself). */
  setHidden(view: LightInkView, hidden: boolean): void {
    if (view.hidden === hidden) return;
    view.hidden = hidden;
    if (hidden) this.takeDown(view);
    else {
      this.pending.add(view);
      this.schedule();
    }
  }

  /** Make `view` its whole node view in a moment (outside any update);
   * `forGood` when the layer cannot place or draw it. */
  wakeSoon(view: LightInkView, forGood = false): void {
    if (forGood && !unplaceable.has(view.node.attrs)) {
      unplaceable.add(view.node.attrs);
      unplaceableGeneration += 1;
    }
    const first = this.wakeQueued.size === 0;
    this.wakeQueued.add(view);
    if (!first) return;
    // All of them in one transaction.
    queueMicrotask(() => {
      const views = Array.from(this.wakeQueued);
      this.wakeQueued.clear();
      if (this.view.isDestroyed) return;
      const positions = views.flatMap((woken) => {
        const pos = woken.destroyed ? undefined : woken.getPos();
        return typeof pos === "number" ? [pos] : [];
      });
      wakeInkStrokes(this.view, positions);
    });
  }

  /** The layer-drawn stroke `drawing` (an element of a layer) stands for. */
  ownerOf(drawing: Element): LightInkView | null {
    return drawing instanceof SVGSVGElement ? this.owners.get(drawing) ?? null : null;
  }

  /** Everything waiting is placed now (a print, a test). */
  flushNow(): void {
    for (const view of this.toPaint) {
      view.bulk = false;
      this.pending.add(view);
    }
    this.toPaint.clear();
    for (const sheet of this.asleep) this.dirtySheets.add(sheet);
    for (const sheet of this.far) this.dirtySheets.add(sheet);
    this.waking = true;
    try {
      this.flush(true);
    } finally {
      this.waking = false;
    }
  }

  /** The frame of `sheet` for this task. */
  frameOf(sheet: HTMLElement): SheetFrame | null {
    if (!this.frames.has(sheet)) {
      this.frames.set(sheet, readSheetFrame(this.view, sheet, this.waking));
      if (!this.framesQueued) {
        this.framesQueued = true;
        queueMicrotask(() => this.forgetFrames());
      }
    }
    return this.frames.get(sheet) ?? null;
  }

  forgetFrames(): void {
    this.frames = new Map();
    this.framesQueued = false;
    this.askedFrames = new Map();
  }

  /** Where `view`'s stroke stands on its sheet now, or null. Asked by the
   * editor (an eraser, the lasso, the replay), it reads the page as any read
   * of a stroke's box did: a sleeping sheet it needs wakes (sheetDormancy). */
  boxOf(view: LightInkView): { frame: SheetFrame; box: InkStrokeBox } | null {
    const sheet = sheetOf(view.dom);
    if (!sheet) return null;
    let frame = this.askedFrames.get(sheet);
    if (frame === undefined) {
      frame = readSheetFrame(this.view, sheet, true);
      this.askedFrames.set(sheet, frame);
      if (!this.askedQueued) {
        this.askedQueued = true;
        queueMicrotask(() => {
          this.askedFrames = new Map();
          this.askedQueued = false;
        });
      }
    }
    if (!frame) return null;
    const box = inkStrokeBoxOnSheet(view.node.attrs.floatAnchor, inkStrokeAttrs(view.node.attrs), frame.geometry, frame.flowTopOf(view.dom));
    return box ? { frame, box } : null;
  }

  schedule(): void {
    if (this.frame || !this.started) return;
    const win = this.view.dom.ownerDocument.defaultView;
    if (!win) return;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = 0;
      this.flush(false);
    });
  }

  private takeDown(view: LightInkView): void {
    const drawing = view.drawing;
    if (!drawing) return;
    const holder = inkLayerDrawingHolder(drawing);
    const root = holder.getRootNode();
    if (root instanceof ShadowRoot) {
      const state = this.hosts.get(root.host);
      const index = state ? state.order.findIndex((entry) => entry.holder === holder) : -1;
      if (state && index >= 0) state.order.splice(index, 1);
    }
    holder.remove();
    view.box = null;
    view.placedWith = null;
  }

  private hostStateOf(host: Element | null): HostState | null {
    if (!host) return null;
    let state = this.hosts.get(host);
    if (!state) {
      const svg = inkSheetLayerDrawing(host);
      if (!svg) return null;
      state = { svg, order: [] };
      this.hosts.set(host, state);
    }
    return state;
  }

  /** Paint `view`'s drawing (once; its own copy when another holds it). */
  private paint(view: LightInkView): InkLayerDrawing | null {
    if (view.drawing !== undefined) return view.drawing;
    const doc = this.view.dom.ownerDocument;
    let drawing = inkLayerDrawing(view.node.attrs, doc);
    const owner = drawing ? this.owners.get(drawing.element) : undefined;
    if (drawing && owner && owner !== view && !owner.destroyed) drawing = inkLayerDrawing(view.node.attrs, doc, { fresh: true });
    if (drawing) this.owners.set(drawing.element, view);
    view.drawing = drawing;
    return drawing;
  }

  /** Place the waiting strokes: the sheets in view now, the rest in slices. */
  private flush(everything: boolean): void {
    if (this.view.isDestroyed) return;
    this.forgetFrames();
    const sheets = new Set<HTMLElement>(this.dirtySheets);
    this.dirtySheets.clear();
    for (const view of this.pending) {
      if (view.destroyed) continue;
      const sheet = sheetOf(view.dom);
      if (sheet) sheets.add(sheet);
      else if (view.dom.isConnected) this.wakeSoon(view, true);
    }
    this.pending.clear();
    for (const sheet of this.asleep) if (!sheet.isConnected) this.asleep.delete(sheet);
    for (const sheet of sheets) {
      if (!sheet.isConnected) continue;
      try {
        this.placeSheet(sheet, everything);
        this.asleep.delete(sheet);
      } catch (error) {
        if (!(error instanceof SheetAsleep)) throw error;
        this.asleep.add(sheet);
      }
    }
    if (this.toPaint.size > 0) this.queueSlice();
    // A sheet with no size yet (its window hidden) is looked at again; a
    // sleeping one is placed when it wakes (observe).
    if (this.retryTimer === null && Array.from(this.asleep).some((sheet) => !sheet.hasAttribute(SHEET_DORMANT_ATTR))) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        for (const sheet of this.asleep) if (!sheet.hasAttribute(SHEET_DORMANT_ATTR)) this.dirtySheets.add(sheet);
        this.schedule();
      }, UNLAID_RETRY_MS);
    }
  }

  private placeSheet(sheet: HTMLElement, everything: boolean): void {
    const bands = this.bandsOf(sheet);
    const hosts = Array.from(sheet.querySelectorAll<HTMLElement>(`:scope > [${INK_LIGHT_HOST_ATTR}]`)).sort(
      (a, b) => Number(a.getAttribute(INK_LIGHT_BAND_ATTR)) - Number(b.getAttribute(INK_LIGHT_BAND_ATTR)),
    );
    const states = hosts.map((host) => this.hostStateOf(host));
    const ready =
      bands !== null &&
      states.length === bands.length &&
      states.every((state, at) => state !== null && hosts[at]!.getAttribute(INK_LIGHT_HOST_ATTR) === bands[at]!.kind);
    if (!ready || !bands) {
      // Its layer is not drawn yet, or not as its stack now runs (the widgets
      // come with the transaction that changes them): looked at again in the
      // next frames; a sheet that never gets them has its strokes drawn by
      // their node views.
      const tries = (this.hostlessTries.get(sheet) ?? 0) + 1;
      this.hostlessTries.set(sheet, tries);
      if (tries > HOSTLESS_TRIES) {
        for (let child = sheet.firstElementChild; child; child = child.nextElementSibling) {
          const view = lightViews.get(child);
          if (view && !view.destroyed) this.wakeSoon(view, true);
        }
        return;
      }
      this.dirtySheets.add(sheet);
      this.schedule();
      return;
    }
    this.hostlessTries.delete(sheet);
    // A sheet far from the reader is drawn when it comes near (a scroll, its
    // waking): drawn while the note opens, every sheet of it was laid out and
    // painted, and the opening's frames were the slowest of all.
    const nearness = everything ? "seen" : this.nearness(sheet);
    // Near but out of view while the note is still opening (strokes built
    // in bulk a moment ago): drawn once the opening is over.
    const opening = !everything && performance.now() - this.lastBulkAt < OPENING_QUIET_MS;
    if (nearness === "far" || (nearness === "near" && opening)) {
      this.far.add(sheet);
      if (nearness === "near") this.reviewFarSoon();
      return;
    }
    this.far.delete(sheet);
    // Strokes still to paint (a note opening): painted first, the sheet
    // placed when the last is; nothing of the page is read meanwhile (a read
    // each frame laid the page out once more per frame while it opened).
    if (!everything) {
      let waiting = false;
      for (let child = sheet.firstElementChild; child; child = child.nextElementSibling) {
        const view = lightViews.get(child);
        if (view && !view.destroyed && !view.hidden && view.drawing === undefined && view.bulk) {
          this.toPaint.add(view);
          waiting = true;
        }
      }
      if (waiting) return;
    }
    const frame = this.frameOf(sheet);
    // Not laid out (hollow, or no room yet): placed when it changes.
    if (!frame) throw new SheetAsleep();
    const geometryKey = `${JSON.stringify(frame.geometry)}`;
    const placements: Array<{ view: LightInkView; drawing: InkLayerDrawing; box: InkStrokeBox; flowTop: number }> = [];
    let waiting = false;
    for (let child = sheet.firstElementChild; child; child = child.nextElementSibling) {
      const view = lightViews.get(child);
      if (!view || view.destroyed) continue;
      if (view.hidden) continue;
      if (view.drawing === undefined && view.bulk && !everything) {
        this.toPaint.add(view);
        waiting = true;
        continue;
      }
      const drawing = this.paint(view);
      if (!drawing) {
        this.wakeSoon(view, true);
        continue;
      }
      const flowTop = frame.flowTopOf(child);
      const key = `${geometryKey}|${flowTop}`;
      const target = states[bandOf(bands, strokeHeight(view.node))] as HostState;
      // Placed from the same numbers, and still in its layer: nothing to do.
      if (view.box && view.placedWith === key && inkLayerDrawingHolder(drawing).parentNode === target.svg) continue;
      const box = inkStrokeBoxOnSheet(view.node.attrs.floatAnchor, drawing.attrs, frame.geometry, flowTop);
      if (!box) {
        this.wakeSoon(view, true);
        continue;
      }
      view.placedWith = key;
      placements.push({ view, drawing, box, flowTop });
    }
    // A sheet gets its strokes all at once, when the last is painted: one
    // layout and one raster of its layer, not one per slice (a layer
    // re-rastered with every few strokes added made the opening's frames
    // 100-280 ms in WebKit).
    if (waiting) {
      for (const { view } of placements) view.placedWith = null;
      return;
    }
    for (const { view, drawing, box, flowTop } of placements) {
      const target = states[bandOf(bands, strokeHeight(view.node))] as HostState;
      const before = inkLayerDrawingHolder(drawing);
      if (!sameBox(view.box, box) || before.parentNode !== target.svg) {
        const holder = placeInkLayerDrawing(drawing, box);
        view.box = box;
        view.origin = { left: frame.contentLeft, top: flowTop };
        if (holder.parentNode !== target.svg) this.insert(target, holder, Number(drawing.attrs.relativeHeight) || 0);
      }
    }
    this.stack(sheet, states as HostState[]);
    if (frame.underBlocks) this.underBlocks.add(sheet);
    else this.underBlocks.delete(sheet);
  }

  /** Where `sheet` is against the reader's view: in it, near it (a screen
   * above or two below), or far. Its own box (a sleeping sheet keeps it). */
  private nearness(sheet: HTMLElement, fresh = false): "seen" | "near" | "far" {
    const height = this.view.dom.ownerDocument.defaultView?.innerHeight ?? 0;
    if (!(height > 0)) return "seen";
    // Read once per frame for every sheet (a placement asks each frame).
    const now = performance.now();
    if (fresh || now - this.boxesAt > 100) {
      this.boxes = new WeakMap();
      this.boxesAt = now;
    }
    let rect = this.boxes.get(sheet);
    if (!rect) {
      rect = sheet.getBoundingClientRect();
      this.boxes.set(sheet, rect);
    }
    if (rect.bottom > 0 && rect.top < height) return "seen";
    return rect.bottom > -height && rect.top < height * 3 ? "near" : "far";
  }

  /** Far sheets looked at again once the opening is over. */
  private reviewFarSoon(): void {
    if (this.reviewTimer !== null) return;
    this.reviewTimer = setTimeout(() => {
      this.reviewTimer = null;
      if (performance.now() - this.lastBulkAt < OPENING_QUIET_MS || inkPointerArbiter.strokeRunning()) {
        this.reviewFarSoon();
        return;
      }
      for (const sheet of this.far) if (sheet.isConnected && this.nearness(sheet) !== "far") this.dirtySheets.add(sheet);
      if (this.dirtySheets.size > 0) this.schedule();
    }, OPENING_QUIET_MS);
  }

  /** The reader scrolled: far sheets come near. */
  private readonly onScroll = (): void => {
    if (this.far.size === 0 || this.scrollFrame) return;
    const win = this.view.dom.ownerDocument.defaultView;
    if (!win) return;
    this.scrollFrame = win.requestAnimationFrame(() => {
      this.scrollFrame = 0;
      for (const sheet of this.far) {
        if (!sheet.isConnected) this.far.delete(sheet);
        else if (this.nearness(sheet, true) !== "far") this.dirtySheets.add(sheet);
      }
      if (this.dirtySheets.size > 0) this.schedule();
    });
  };

  /**
   * The layer's place in the page's floating stack. Its strokes stand at
   * their own heights among the page's other floating objects (pictures, text
   * boxes, shapes, strokes drawn by their own views): the layer takes the
   * height of its highest stroke, which is right while no other object of the
   * sheet stands between its lowest and highest stroke. When one does, the
   * sheet's strokes are drawn by their own views again, each at its height.
   */
  private stack(sheet: HTMLElement, hostStates: readonly HostState[]): void {
    this.stackedHosts.set(sheet, hostStates);
    let first: LightInkView | null = null;
    for (let child = sheet.firstElementChild; child && !first; child = child.nextElementSibling) {
      const view = lightViews.get(child);
      if (view && !view.destroyed) first = view;
    }
    const pos = first?.getPos();
    if (!first || typeof pos !== "number") return;
    const doc = this.view.state.doc;
    let page: ProseMirrorNode;
    try {
      page = doc.resolve(pos).parent;
    } catch {
      return;
    }
    const heights = documentFloatingStack(doc).heights;
    const known = this.stacks.get(sheet);
    let hostZ: string;
    if (known && known.page === page && known.heights === heights) {
      hostZ = known.z;
    } else {
      // The page's own span is read once per page node; only the place of
      // its highest stroke among the document's heights is found again when
      // another page changes (each stroke landing changes the heights).
      const span = sheetStackSpan(page);
      if (span.between) {
        for (let child = sheet.firstElementChild; child; child = child.nextElementSibling) {
          const view = lightViews.get(child);
          if (view && !view.destroyed) this.wakeSoon(view, true);
        }
        this.stacks.delete(sheet);
        return;
      }
      hostZ = Number.isFinite(span.high) ? String(floatStackZIndex({ relativeHeight: span.high, behindDoc: false }, heights)) : "";
      this.stacks.set(sheet, { page, heights, z: hostZ });
    }
    for (const state of hostStates) {
      const host = state.svg.getRootNode() instanceof ShadowRoot ? ((state.svg.getRootNode() as ShadowRoot).host as HTMLElement) : null;
      if (host && host.style.zIndex !== hostZ) host.style.zIndex = hostZ;
    }
  }

  /** The runs of `sheet`'s stack (sheetBands), from its page node; null when
   * no stroke of it is placed by the layer. */
  private bandsOf(sheet: HTMLElement): readonly InkBand[] | null {
    for (let child = sheet.firstElementChild; child; child = child.nextElementSibling) {
      const view = lightViews.get(child);
      if (!view || view.destroyed) continue;
      const pos = view.getPos();
      if (typeof pos !== "number") continue;
      try {
        return sheetBands(this.view.state.doc.resolve(pos).parent);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** The document changed: each layer's place in the stack is checked (a
   * sheet whose page node is the same is not read again). */
  restack(): void {
    for (const [sheet, hosts] of this.stackedHosts) {
      if (!sheet.isConnected || hosts.some((host) => !host.svg.isConnected)) {
        this.stackedHosts.delete(sheet);
        continue;
      }
      this.stack(sheet, hosts);
    }
  }

  /** Put `holder` among its host's drawings by its stacking height. */
  private insert(state: HostState, holder: SVGElement, height: number): void {
    // Out of the host it stood in before (another sheet's).
    const root = holder.getRootNode();
    if (root instanceof ShadowRoot) {
      const previous = this.hosts.get(root.host);
      if (previous && previous !== state) {
        const index = previous.order.findIndex((entry) => entry.holder === holder);
        if (index >= 0) previous.order.splice(index, 1);
      }
    }
    let low = 0;
    let high = state.order.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (state.order[middle]!.height <= height) low = middle + 1;
      else high = middle;
    }
    const next = state.order[low]?.holder ?? null;
    state.svg.insertBefore(holder, next);
    state.order.splice(low, 0, { height, holder });
  }

  private queueSlice(): void {
    if (this.sliceTimer !== null) return;
    this.sliceTimer = setTimeout(() => {
      this.sliceTimer = null;
      this.paintSlice();
    }, 0);
  }

  /** Paint waiting strokes, nearest sheet first, for a few milliseconds. */
  private paintSlice(): void {
    if (this.view.isDestroyed || this.toPaint.size === 0) return;
    // The pen is writing: its samples come first.
    if (inkPointerArbiter.strokeRunning() || this.view.composing) {
      this.sliceTimer = setTimeout(() => {
        this.sliceTimer = null;
        this.paintSlice();
      }, 120);
      return;
    }
    const started = performance.now();
    const win = this.view.dom.ownerDocument.defaultView;
    const height = win?.innerHeight ?? 0;
    const bySheet = new Map<HTMLElement | null, LightInkView[]>();
    for (const view of this.toPaint) {
      if (view.destroyed) {
        this.toPaint.delete(view);
        continue;
      }
      const sheet = sheetOf(view.dom);
      const group = bySheet.get(sheet);
      if (group) group.push(view);
      else bySheet.set(sheet, [view]);
    }
    // Each sheet's distance from the view, read once a second at most: read
    // in every slice, it laid the opening page out again between frames.
    const now = performance.now();
    if (now - this.distancesAt > 1000) {
      this.distances = new WeakMap();
      this.distancesAt = now;
    }
    const distance = (sheet: HTMLElement | null) => {
      if (!sheet?.isConnected) return Number.POSITIVE_INFINITY;
      const known = this.distances.get(sheet);
      if (known !== undefined) return known;
      const rect = sheet.getBoundingClientRect();
      const away = rect.bottom < 0 ? -rect.bottom : rect.top > height ? rect.top - height : 0;
      this.distances.set(sheet, away);
      return away;
    };
    const order = Array.from(bySheet.entries())
      .map(([sheet, views]) => ({ sheet, views, away: distance(sheet) }))
      .sort((a, b) => a.away - b.away);
    outer: for (const { sheet, views } of order) {
      for (const view of views) {
        this.toPaint.delete(view);
        this.paint(view);
        if (sheet) this.dirtySheets.add(sheet);
        if (performance.now() - started >= SLICE_BUDGET_MS) break outer;
      }
    }
    if (this.dirtySheets.size > 0) this.schedule();
    if (this.toPaint.size > 0) this.queueSlice();
  }

  private observe(records: readonly MutationRecord[]): void {
    let changed = false;
    for (const record of records) {
      const target = record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
      if (!target) continue;
      if (record.type === "attributes" && target.matches(SHEET_SELECTOR) && target.parentElement === this.view.dom) {
        // A sleeping sheet woke: its strokes are placed now.
        if (record.attributeName === SHEET_DORMANT_ATTR) {
          if (this.asleep.has(target as HTMLElement) && !target.hasAttribute(SHEET_DORMANT_ATTR)) this.dirtySheets.add(target as HTMLElement);
          continue;
        }
        if (record.attributeName === "style" || record.attributeName === "class") this.dirtySheets.add(target as HTMLElement);
        continue;
      }
      if (record.type === "childList") {
        // A layer drawn again (its widget rebuilt) holds nothing yet.
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element && node.hasAttribute(INK_LIGHT_HOST_ATTR) && node.parentElement?.matches(SHEET_SELECTOR)) {
            this.dirtySheets.add(node.parentElement as HTMLElement);
            for (const child of Array.from(node.parentElement.children)) {
              const view = lightViews.get(child);
              if (view) view.box = null;
            }
            changed = true;
          }
        }
      }
      if (target.closest(`[${INK_LIGHT_ATTR}], [data-ink-sheet-layer]`)) continue;
      const sheet = target.closest<HTMLElement>(SHEET_SELECTOR);
      // Strokes standing under a block move with the block.
      if (sheet && this.underBlocks.has(sheet)) {
        this.dirtySheets.add(sheet);
        changed = true;
      }
    }
    if (this.dirtySheets.size > 0) this.schedule();
    if (changed || records.length > 0) this.sweepWhenQuiet();
  }

  private sweepWhenQuiet(): void {
    if (this.sweepTimer !== null) clearTimeout(this.sweepTimer);
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      for (const view of this.views) {
        const sheet = sheetOf(view.dom);
        if (sheet && this.underBlocks.has(sheet)) this.dirtySheets.add(sheet);
      }
      if (this.dirtySheets.size > 0) this.schedule();
    }, SWEEP_AFTER_QUIET_MS);
  }

  /** A press on a stroke the layer draws: it becomes its node view, which
   * takes the press (it selects or drags itself there). The mouse events
   * after it find it by themselves (WebKit keeps a press's target). */
  private pressed(event: Event): void {
    const drawing = this.drawingPressed(event);
    if (!drawing) return;
    const view = this.ownerOf(drawing);
    if (!view || view.destroyed) return;
    const pos = view.getPos();
    if (typeof pos !== "number") return;
    wakeInkStrokes(this.view, [pos]);
    const dom = this.view.nodeDOM(pos);
    const own = dom instanceof Element ? dom.querySelector("svg path") : null;
    if (!own) return;
    const forwarded = forwardedPress(event);
    if (!forwarded) return;
    event.stopImmediatePropagation();
    own.dispatchEvent(forwarded);
    // The stroke took the press (it selects or drags itself): the mouse
    // events of the press are not the page's (a caret placed under it).
    if (forwarded.defaultPrevented) event.preventDefault();
  }

  /** The drawing of a layer a press landed on: the press's own target, or,
   * where the engine hit the sheet under the layer instead (WebKit's hit
   * test of a press passes over a shadow tree's SVG that its own
   * `elementFromPoint` finds), the drawing under the press in its sheet's
   * layers. */
  private drawingPressed(event: Event): Element | null {
    const target = (event.composedPath?.()[0] ?? event.target) as Element | null;
    const own = target?.closest?.(`[${INK_LAYER_STROKE_ATTR}]`);
    if (own) return own;
    const { clientX, clientY } = event as PointerEvent;
    if (typeof clientX !== "number" || typeof clientY !== "number") return null;
    const sheet = target?.closest?.(SHEET_SELECTOR);
    if (!sheet || sheet.parentElement !== this.view.dom) return null;
    // Only a press on the sheet's own paper or a stroke's empty place: one
    // in its text or on another object is theirs.
    if (target !== sheet && !target?.hasAttribute?.(INK_LIGHT_HOST_ATTR)) return null;
    for (const host of Array.from(sheet.querySelectorAll(`:scope > [${INK_LIGHT_HOST_ATTR}]`)).reverse()) {
      const hit = host.shadowRoot?.elementFromPoint(clientX, clientY);
      const drawing = hit?.closest?.(`[${INK_LAYER_STROKE_ATTR}]`);
      if (drawing) return drawing;
    }
    return null;
  }
}

/** The same press, to dispatch at a stroke's own drawing. Its fields are
 * copied one by one: WebKit refuses an event as another's init dictionary. */
function forwardedPress(event: Event): Event | null {
  const press = event as PointerEvent;
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: press.view,
    detail: press.detail,
    screenX: press.screenX,
    screenY: press.screenY,
    clientX: press.clientX,
    clientY: press.clientY,
    ctrlKey: press.ctrlKey,
    shiftKey: press.shiftKey,
    altKey: press.altKey,
    metaKey: press.metaKey,
    button: press.button,
    buttons: press.buttons,
    pointerId: press.pointerId,
    pointerType: press.pointerType,
    isPrimary: press.isPrimary,
    width: press.width,
    height: press.height,
    pressure: press.pressure,
    tiltX: press.tiltX,
    tiltY: press.tiltY,
  };
  try {
    const win = (event.target as Node | null)?.ownerDocument?.defaultView ?? null;
    const Pointer = (win as (Window & { PointerEvent?: typeof PointerEvent }) | null)?.PointerEvent ?? (typeof PointerEvent === "function" ? PointerEvent : null);
    if (Pointer && event.type.startsWith("pointer")) return new Pointer(event.type, init);
    const Mouse = (win as (Window & { MouseEvent?: typeof MouseEvent }) | null)?.MouseEvent ?? MouseEvent;
    return new Mouse(event.type, init);
  } catch {
    return null;
  }
}

/** A floating object's height in the page's stack (`documentFloatingStack`),
 * or null for one that has none (in line with text, not an object). */
function floatingHeightOf(node: ProseMirrorNode): number | null {
  const name = node.type.name;
  const anchorHeight = () => {
    const anchor = node.attrs.floatAnchor as { relativeHeight?: unknown } | null | undefined;
    return anchor && typeof anchor === "object" ? documentShapeRelativeHeight(anchor.relativeHeight) : null;
  };
  if (name === "documentShape") return node.attrs.wrapMode === "inline" ? null : documentShapeRelativeHeight(node.attrs.relativeHeight);
  if (name === "textBox" || name === "chart") return anchorHeight();
  if (name === "image" && (node.attrs.officeDrawingKind === "anchor" || (typeof node.attrs.dataFloat === "string" && node.attrs.dataFloat.length > 0))) {
    return anchorHeight() ?? documentShapeRelativeHeight(node.attrs.relativeHeight);
  }
  return null;
}

function sheetOf(element: Element): HTMLElement | null {
  const parent = element.parentElement;
  return parent && parent.matches(SHEET_SELECTOR) && !parent.hasAttribute("data-page-column-flow") ? parent : null;
}

function sameBox(a: InkStrokeBox | null, b: InkStrokeBox): boolean {
  return Boolean(
    a &&
      Math.abs(a.left - b.left) < 1e-3 &&
      Math.abs(a.top - b.top) < 1e-3 &&
      Math.abs(a.width - b.width) < 1e-3 &&
      Math.abs(a.height - b.height) < 1e-3 &&
      a.rotation === b.rotation &&
      a.flipH === b.flipH &&
      a.flipV === b.flipV,
  );
}

// ---------------------------------------------------------------------------
// What the rest of the editor asks of a stroke the layer draws.

/**
 * Where the layer-drawn stroke with empty element `element` stands on screen,
 * as its canvas would: `getBoundingClientRect` is the bounds of the canvas as
 * turned, `offsetWidth`/`offsetHeight` the canvas's own size, `closest` its
 * element's. Worked out now from its sheet (read once per task), so it is
 * right just after a change that moved it. Null when it cannot be placed.
 */
export function inkLightStandIn(view: EditorView, element: Element): HTMLElement | null {
  const light = lightViews.get(element);
  if (!light || light.view !== view) return null;
  const store = storeOf(view);
  const placed = store.boxOf(light);
  if (!placed) return null;
  const { frame, box } = placed;
  const width = box.width * frame.scale.x;
  const height = box.height * frame.scale.y;
  const turn = (box.rotation * Math.PI) / 180;
  const across = Math.abs(width * Math.cos(turn)) + Math.abs(height * Math.sin(turn));
  const down = Math.abs(width * Math.sin(turn)) + Math.abs(height * Math.cos(turn));
  const centreX = frame.rect.left + (box.left + box.width / 2) * frame.scale.x;
  const centreY = frame.rect.top + (box.top + box.height / 2) * frame.scale.y;
  const rect = rectOf(centreX - across / 2, centreY - down / 2, across, down);
  const standIn = {
    getBoundingClientRect: () => rect,
    closest: (selector: string) => element.closest(selector),
    offsetWidth: box.width,
    offsetHeight: box.height,
    isConnected: element.isConnected,
  };
  return standIn as unknown as HTMLElement;
}

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  if (typeof DOMRect === "function") return new DOMRect(left, top, width, height);
  return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

/** Hide (or show again) the stroke at `pos` while its layer draws it. True
 * when it is one. */
export function setInkLightStrokeHidden(view: EditorView, pos: number, hidden: boolean): boolean {
  const light = lightViews.get(view.nodeDOM(pos) as Element);
  if (!light) return false;
  storeOf(view).setHidden(light, hidden);
  return true;
}

/** Every stroke waiting to be drawn in the layers under `root` (an editor's
 * pages) is drawn now: a print copies the layers. */
export function flushInkLightLayers(root: Element | null | undefined): void {
  const store = root ? storesByRoot.get(root) : undefined;
  store?.flushNow();
}

const PRINTED_LAYER_STYLE = "position:absolute;top:0;left:0;width:1px;height:1px;overflow:visible;pointer-events:none";

/**
 * A printed copy of a sheet holds its layers' drawings in its own tree: a
 * copied host has no shadow root. `live` is the sheet's host, `copy` the
 * copy's; the copy is left out when the host draws nothing.
 */
export function printInkLightLayer(live: Element | undefined, copy: Element, doc: Document): void {
  const drawing = live ? inkSheetLayerDrawing(live) : null;
  if (!drawing || drawing.childElementCount === 0) {
    copy.remove();
    return;
  }
  const drawn = doc.importNode(drawing, true);
  drawn.setAttribute("style", PRINTED_LAYER_STYLE);
  copy.replaceChildren(drawn);
  const blend = live instanceof HTMLElement ? live.style.mixBlendMode : "";
  copy.setAttribute("style", `${PRINTED_LAYER_STYLE}${blend ? `;mix-blend-mode:${blend}` : ""}`);
}

/**
 * A whole stroke that nothing keeps whole any more (deselected after the
 * decoration that kept it went: ProseMirror asked it while it was still
 * selected) is asked again in a moment, and comes back to its layer.
 */
export function restInkStrokeSoon(view: EditorView, getPos: () => number | undefined): void {
  if (!inkLightEnabled(view)) return;
  queueMicrotask(() => {
    if (view.isDestroyed) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    view.dispatch(view.state.tr.setMeta(inkLightKey, { rest: [pos] }).setMeta("addToHistory", false));
  });
}

/** Make the strokes at `positions` their whole node views (a press, a tool
 * that needs their boxes laid out); they go back to the layer a moment
 * after nothing keeps them. */
export function wakeInkStrokes(view: EditorView, positions: readonly number[]): void {
  if (positions.length === 0 || !inkLightEnabled(view)) return;
  view.dispatch(view.state.tr.setMeta(inkLightKey, { wake: positions }).setMeta("addToHistory", false));
}

// ---------------------------------------------------------------------------
// The plugin: the layers' widgets and the strokes kept whole.

interface InkLightState {
  readonly enabled: boolean;
  readonly hasInk: boolean;
  readonly layers: DecorationSet;
  /** The top-level positions the layers stand at (one sheet each). */
  readonly sheets: readonly number[];
  /** Each sheet's runs of strokes (sheetBands), as its widgets draw them. */
  readonly bands: readonly string[];
  /** Strokes kept whole: what keeps them, and what lingers after. */
  readonly live: DecorationSet;
  readonly livePositions: readonly number[];
  readonly held: readonly number[];
  /** A one-transaction decoration on whole strokes that may rest again
   * (`restInkStrokeSoon`): their node views are asked again. */
  readonly nudge: DecorationSet;
}

export const inkLightKey = new PluginKey<InkLightState>("inkLight");

function isInk(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && node.type.name === SHAPE_NODE && node.attrs.inkTool);
}

function docHasInk(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (isInk(node)) found = true;
    return !found && node.type.name !== SHAPE_NODE;
  });
  return found;
}

function stepsAddInk(tr: Transaction): boolean {
  return tr.steps.some((step) => {
    const slice = (step as unknown as { slice?: { content: { descendants: (fn: (node: ProseMirrorNode) => boolean) => void } } }).slice;
    if (!slice) return false;
    let found = false;
    slice.content.descendants((node) => {
      if (found) return false;
      if (isInk(node)) found = true;
      return !found;
    });
    return found;
  });
}

function sheetPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name === "pageBlock") positions.push(offset);
  });
  return positions;
}

/** A run of a sheet's strokes, by stacking height, painted with one blend:
 * the pen's ink, or the highlighter multiplying over what is under it. */
interface InkBand {
  readonly kind: HostKind;
  /** The lowest stacking height in the run. */
  readonly from: number;
}

const bandsByPage = new WeakMap<ProseMirrorNode, readonly InkBand[]>();

/** Whether the layer draws `node` (a stroke resting in it, by its data). */
function restsByData(node: ProseMirrorNode): boolean {
  return node.type.name === SHAPE_NODE && Boolean(node.attrs.inkTool) && !unplaceable.has(node.attrs) && inkStrokeDrawsInLayer(node);
}

/** The stacking heights of a page's strokes the layer draws (lowest and
 * highest), and whether another floating object of the page that is in
 * front of the text stands between them. A pure function of the page node. */
interface StackSpan { readonly low: number; readonly high: number; readonly between: boolean; readonly generation: number }
const stackSpans = new WeakMap<ProseMirrorNode, StackSpan>();
function sheetStackSpan(page: ProseMirrorNode): StackSpan {
  const known = stackSpans.get(page);
  if (known && known.generation === unplaceableGeneration) return known;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  const others: number[] = [];
  page.descendants((node) => {
    const height = floatingHeightOf(node);
    if (height === null) return node.type.name !== "documentShape";
    if (node.type.name === "documentShape" && node.attrs.inkTool && inkStrokeDrawsInLayer(node) && !unplaceable.has(node.attrs)) {
      low = Math.min(low, height);
      high = Math.max(high, height);
    } else if (!(node.attrs.floatAnchor as { behindDoc?: unknown } | null)?.behindDoc) {
      others.push(height);
    }
    return false;
  });
  const span = { low, high, between: others.some((height) => height > low && height < high), generation: unplaceableGeneration };
  stackSpans.set(page, span);
  return span;
}

/** A stroke's stacking height (its place among the page's floating objects). */
function strokeHeight(node: ProseMirrorNode): number {
  return documentShapeRelativeHeight(node.attrs.relativeHeight) ?? 0;
}

/**
 * The runs of a page's strokes the layer draws, lowest first. A highlighter
 * written under a later pen stroke is under it, as each stroke's own view
 * stacked them: every change of blend up the stack starts a run of its own,
 * drawn by a host of its own (a page of pen alone is one run).
 */
function sheetBands(page: ProseMirrorNode): readonly InkBand[] {
  let bands = bandsByPage.get(page);
  if (bands) return bands;
  const strokes: Array<{ height: number; kind: HostKind }> = [];
  page.descendants((node) => {
    if (node.type.name !== SHAPE_NODE) return true;
    if (restsByData(node)) strokes.push({ height: strokeHeight(node), kind: node.attrs.inkTool === "highlighter" ? "highlight" : "ink" });
    return false;
  });
  strokes.sort((a, b) => a.height - b.height);
  const runs: InkBand[] = [];
  for (const stroke of strokes) {
    if (runs[runs.length - 1]?.kind !== stroke.kind) runs.push({ kind: stroke.kind, from: stroke.height });
  }
  bands = runs.length > 0 ? runs : [{ kind: "ink", from: Number.NEGATIVE_INFINITY }];
  bandsByPage.set(page, bands);
  return bands;
}

/** The run a stroke at `height` belongs to. */
function bandOf(bands: readonly InkBand[], height: number): number {
  let index = 0;
  for (let i = 1; i < bands.length; i++) if (bands[i]!.from <= height) index = i;
  return index;
}

const bandsKey = (bands: readonly InkBand[]): string => bands.map((band) => band.kind[0]).join("");

function layerDecorations(doc: ProseMirrorNode, sheets: readonly number[]): DecorationSet {
  return DecorationSet.create(
    doc,
    sheets.flatMap((pos, index) => {
      const page = doc.nodeAt(pos);
      const bands = page ? sheetBands(page) : [{ kind: "ink" as HostKind, from: 0 }];
      return bands.map((band, at) =>
        Decoration.widget(pos + 1, (view) => storeOf(view).host(band.kind, at), {
          side: -1000 + at,
          ignoreSelection: true,
          key: `ink-light-${index}-${at}-${band.kind}`,
        }),
      );
    }),
  );
}

function sheetBandKeys(doc: ProseMirrorNode, sheets: readonly number[]): string[] {
  return sheets.map((pos) => {
    const page = doc.nodeAt(pos);
    return page ? bandsKey(sheetBands(page)) : "i";
  });
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** The strokes the reader works on now: selected, picked with others. */
function strokesInUse(state: EditorState): number[] {
  const positions = new Set<number>();
  const { selection } = state;
  if (selection instanceof NodeSelection && isInk(selection.node)) positions.add(selection.from);
  for (const pos of documentShapeMultiSelection(state)) if (isInk(state.doc.nodeAt(pos))) positions.add(pos);
  return [...positions].sort((a, b) => a - b);
}

function liveDecorations(doc: ProseMirrorNode, positions: readonly number[]): DecorationSet {
  if (positions.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    positions.flatMap((pos) => {
      const node = doc.nodeAt(pos);
      return node && isInk(node) ? [Decoration.node(pos, pos + node.nodeSize, {}, { [INK_LIVE_SPEC]: true })] : [];
    }),
  );
}

export const InkLightLayer = Extension.create({
  name: "inkLightLayer",
  addProseMirrorPlugins() {
    // The decorations of the last state asked, combined once.
    let combined: { layers: DecorationSet; live: DecorationSet; set: DecorationSet } | null = null;
    return [
      new Plugin<InkLightState>({
        key: inkLightKey,
        state: {
          init: (_config, state) => {
            const empty: InkLightState = {
              enabled: false,
              hasInk: false,
              layers: DecorationSet.empty,
              sheets: [],
              bands: [],
              live: DecorationSet.empty,
              livePositions: [],
              held: [],
              nudge: DecorationSet.empty,
            };
            if (!inkLightWanted(typeof window === "undefined" ? null : window)) return empty;
            const hasInk = docHasInk(state.doc);
            const sheets = hasInk ? sheetPositions(state.doc) : [];
            const livePositions = strokesInUse(state);
            return {
              ...empty,
              enabled: true,
              hasInk,
              sheets,
              bands: hasInk ? sheetBandKeys(state.doc, sheets) : [],
              layers: hasInk ? layerDecorations(state.doc, sheets) : DecorationSet.empty,
              livePositions,
              live: liveDecorations(state.doc, livePositions),
            };
          },
          apply(tr, value, _oldState, newState) {
            if (!value.enabled) return value;
            const meta = tr.getMeta(inkLightKey) as { wake?: readonly number[]; release?: boolean; rest?: readonly number[] } | undefined;
            let { hasInk, sheets, layers, bands } = value;
            if (tr.docChanged) {
              if (!hasInk && stepsAddInk(tr)) hasInk = true;
              if (hasInk) {
                const now = sheetPositions(newState.doc);
                const mapped = value.sheets.map((pos) => tr.mapping.map(pos, -1));
                const nowBands = sheetBandKeys(newState.doc, now);
                if (!value.hasInk || !sameNumbers(now, mapped) || nowBands.join("|") !== value.bands.join("|")) {
                  layers = layerDecorations(newState.doc, now);
                } else {
                  layers = layers.map(tr.mapping, tr.doc);
                }
                sheets = now;
                bands = nowBands;
              }
            }
            // What keeps strokes whole: in use now, woken, or in use a
            // moment ago (until the linger ends).
            const inUse = strokesInUse(newState);
            const mapPos = (pos: number) => {
              const result = tr.mapping.mapResult(pos, 1);
              return result.deleted ? null : result.pos;
            };
            let held = meta?.release ? [] : value.held.map(mapPos).filter((pos): pos is number => pos !== null);
            if (!meta?.release) {
              const before = value.livePositions.map(mapPos).filter((pos): pos is number => pos !== null);
              held = [...new Set([...held, ...before.filter((pos) => !inUse.includes(pos))])];
            }
            if (meta?.wake) held = [...new Set([...held, ...meta.wake])];
            held = held.filter((pos) => isInk(newState.doc.nodeAt(pos))).sort((a, b) => a - b);
            const livePositions = [...new Set([...inUse, ...held])].sort((a, b) => a - b);
            const sameLive = sameNumbers(livePositions, value.livePositions.map((pos) => tr.mapping.map(pos, 1)));
            const live = sameLive ? value.live.map(tr.mapping, tr.doc) : liveDecorations(newState.doc, livePositions);
            const nudge = meta?.rest?.length
              ? DecorationSet.create(
                  newState.doc,
                  meta.rest.flatMap((pos) => {
                    const node = newState.doc.nodeAt(pos);
                    return node && isInk(node) ? [Decoration.node(pos, pos + node.nodeSize, {}, { inkNudge: true })] : [];
                  }),
                )
              : DecorationSet.empty;
            return { ...value, hasInk, sheets, bands, layers, live, livePositions, held, nudge };
          },
        },
        props: {
          decorations(state) {
            const value = inkLightKey.getState(state);
            if (!value?.enabled) return null;
            if (value.nudge !== DecorationSet.empty) {
              return DecorationSet.create(state.doc, [...value.layers.find(), ...value.live.find(), ...value.nudge.find()]);
            }
            if (value.live === DecorationSet.empty) return value.layers;
            if (value.layers === DecorationSet.empty) return value.live;
            if (combined?.layers !== value.layers || combined.live !== value.live) {
              combined = {
                layers: value.layers,
                live: value.live,
                set: DecorationSet.create(state.doc, [...value.layers.find(), ...value.live.find()]),
              };
            }
            return combined.set;
          },
        },
        view(view) {
          if (!inkLightEnabled(view) || !inkLightKey.getState(view.state)?.enabled) return {};
          const store = storeOf(view);
          // A document with no ink has nothing to draw: the store starts with
          // its first stroke (no observer, no frame asked for before).
          if (inkLightKey.getState(view.state)?.hasInk) store.start();
          let lingerTimer: ReturnType<typeof setTimeout> | null = null;
          const release = () => {
            lingerTimer = null;
            if (view.isDestroyed) return;
            const value = inkLightKey.getState(view.state);
            if (!value?.held.length) return;
            if (inkPointerArbiter.strokeRunning() || view.composing) {
              lingerTimer = setTimeout(release, LINGER_MS);
              return;
            }
            view.dispatch(view.state.tr.setMeta(inkLightKey, { release: true }).setMeta("addToHistory", false));
          };
          const update = (_view: EditorView, previous?: EditorState) => {
            if (inkLightKey.getState(view.state)?.hasInk) store.start();
            store.forgetFrames();
            if (previous && previous.doc !== view.state.doc) store.restack();
            const value = inkLightKey.getState(view.state);
            if (value?.held.length && lingerTimer === null) lingerTimer = setTimeout(release, LINGER_MS);
          };
          update(view);
          return {
            update,
            destroy() {
              if (lingerTimer !== null) clearTimeout(lingerTimer);
              store.destroy();
            },
          };
        },
      }),
    ];
  },
});
