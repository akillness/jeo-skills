/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { EditorView } from "@tiptap/pm/view";
import { measureOutsideEditorObservation } from "../documentLayoutStatus";
import { PAGE_OVERSIZE_ATTR } from "./paginationProjectionKeys";
import { sheetsOf } from "./sheetMeasureMemo";
import { msSinceTyping } from "../../../../../lib/typing-session";

/** On a dormant sheet: its content is out of the render tree. */
export const SHEET_DORMANT_ATTR = "data-page-dormant";
/** Sheets before the reader's first and after their last that stay awake
 * (the next part of a parted document loads 2400 px ahead; three pages
 * cover it, and a float drawn over a neighbouring page has it awake). */
export const SHEET_DORMANCY_AWAKE_PAGES = 3;
/** Sheets either side that stay awake while the reader is typing, and for how long
 * after a key that counts. */
const TYPING_AWAKE_PAGES = 0;
const TYPING_NARROW_AWAKE_MS = 60_000;
/** The gap between keys a sleep slips into. */
const TYPING_GAP_MS = 150;
/** Sheets awake below which a key does not look for more to put to sleep. */
const TYPING_AWAKE_LIMIT = 4;
/** A sheet that changed or was read while dormant does not sleep again
 * for this long. */
export const SHEET_DORMANCY_RESTLESS_MS = 8000;
/** How long after the last change of the pages or scroll more sheets go to sleep. */
const SLEEP_AFTER_MS = 700;
/** While a scroll goes on and more sheets are awake than its band and this
 * many more, the ones behind it go back to sleep (every 400 ms at most): a
 * long scroll used to keep every sheet it passed awake until it stopped, and
 * WebKit's frames grow with the sheets drawn. */
const SCROLL_SLEEP_SLACK_PAGES = 4;
const SCROLL_SLEEP_EVERY_MS = 400;


/** Computed values only layout gives (used pixels of `auto` and percentage
 * sizes and offsets): reading one from a dormant sheet's element wakes it. */
const LAYOUT_STYLE_NAMES = new Set([
  "width", "height", "inline-size", "block-size",
  "top", "right", "bottom", "left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "transform", "transform-origin", "perspective-origin", "translate",
]);
const LAYOUT_STYLE_PROPERTIES = Array.from(LAYOUT_STYLE_NAMES).map((name) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

export interface SheetDormancyOptions {
  /** The ledger measured `sheet` as it stands. */
  isMeasured(sheet: HTMLElement): boolean;
  /** The ledger still has to lay `sheet` out. */
  isPending(sheet: HTMLElement): boolean;
  /** The document is laid out (the ledger settled once, no fill running):
   * before that nothing sleeps, and dormancy reads nothing. */
  ready?(): boolean;
  /** Input elsewhere: sleeping waits (it costs a style pass). */
  inputQuiet?(): boolean;
}

export interface SheetDormancy {
  /** Wake every dormant sheet that may no longer sleep (the ledger forgot
   * its measurements, a change). Synchronous; runs before a pass measures. */
  wakeIneligible(): void;
  /** The selection may have moved: its sheets wake now. */
  selectionChanged(): void;
  /** Put the sheets that may sleep to sleep once the pages are quiet. */
  scheduleSleep(): void;
  /** Every sheet awake (printing, a capture). */
  wakeAll(reason: string): void;
  destroy(): void;
  readonly dormantCount: number;
}

interface Controller {
  root: HTMLElement;
  view: EditorView;
  options: SheetDormancyOptions;
  sheets: HTMLElement[];
  dormant: Set<HTMLElement>;
  restlessUntil: WeakMap<HTMLElement, number>;
  observer: MutationObserver;
  suspended: number;
  wakeSheet(sheet: HTMLElement, reason: string): void;
  sync(): void;
}

interface DormancyStats {
  sleeps: number;
  /** Sheets dormant after the last rule written. */
  dormantNow?: number;
  wakes: Record<string, number>;
  rules: number;
}

const controllers = new Map<HTMLElement, Controller>();
/** Dormant sheets in all editors: with none, reads cost nothing extra. */
let dozing = 0;
let interceptionInstalled = false;
let printing = false;

function stats(win: Window): DormancyStats {
  const host = win as Window & { __sheetDormancyStats?: DormancyStats };
  return (host.__sheetDormancyStats ??= { sleeps: 0, wakes: {}, rules: 0 });
}

/** Whether pages go dormant here: in WebKit (the `font` keyword below is
 * WebKit's), where sheets are never skipped by the browser itself. Verified
 * across the editors (it wraps WebKit's geometry reads for the whole page);
 * `window.__sheetDormancy` forces it either way, in any engine. */
const SHEET_DORMANCY_DEFAULT_ON = true;

export function sheetDormancyEnabled(win: Window | null | undefined): boolean {
  if (!win) return false;
  const forced = (win as Window & { __sheetDormancy?: boolean }).__sheetDormancy;
  if (typeof forced === "boolean") return forced;
  if (!SHEET_DORMANCY_DEFAULT_ON) return false;
  const g = win as Win;
  try {
    return g.CSS?.supports?.("font", "-apple-system-body") === true;
  } catch {
    return false;
  }
}

/** The dormant sheet `node` stands in (strictly inside it), if any. */
/** Whether `element` is inside the pages of an editor with a sheet asleep
 * (a pointer walk; most reads of the app are not). */
function insideDozingRoot(element: Element): boolean {
  for (const [root, controller] of controllers) if (controller.dormant.size > 0 && root.contains(element)) return true;
  return false;
}

function dormantSheetOf(node: Node | null | undefined): { controller: Controller; sheet: HTMLElement } | null {
  if (dozing === 0 || !node) return null;
  // The browser's own ancestor walk: a read anywhere else in the app (a
  // spreadsheet cell, a slide) finds no dormant sheet above it at once.
  const element: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (!element || !insideDozingRoot(element)) return null;
  const sheet = element.closest(`article[data-page-sheet][${SHEET_DORMANT_ATTR}]`) as HTMLElement | null;
  // The sheet's own box is never asleep.
  if (!sheet || sheet === node) return null;
  const controller = sheet.parentElement ? controllers.get(sheet.parentElement as HTMLElement) : undefined;
  return controller?.dormant.has(sheet) ? { controller, sheet } : null;
}

/** A layout read of `node` (or of a range from `node` to `end`): its
 * dormant sheets wake first. */
function wakeForRead(node: Node | null | undefined, end?: Node | null): void {
  if (dozing === 0) return;
  const found = dormantSheetOf(node);
  if (found) found.controller.wakeSheet(found.sheet, "read");
  if (end && end !== node) {
    const last = dormantSheetOf(end);
    if (last) last.controller.wakeSheet(last.sheet, "read");
    // A range across sheets: every sheet between its ends.
    const first = found?.sheet ?? sheetIn(node);
    const final = last?.sheet ?? sheetIn(end);
    if (first && final && first !== final && first.parentElement === final.parentElement) {
      const controller = controllers.get(first.parentElement as HTMLElement);
      if (controller) {
        for (let sheet = first.nextElementSibling; sheet && sheet !== final; sheet = sheet.nextElementSibling) {
          if (controller.dormant.has(sheet as HTMLElement)) controller.wakeSheet(sheet as HTMLElement, "read");
        }
      }
    }
  }
}

function sheetIn(node: Node | null | undefined): HTMLElement | null {
  const element: Element | null = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
  const sheet = element?.closest?.("article[data-page-sheet]") as HTMLElement | null | undefined;
  return sheet?.parentElement && controllers.has(sheet.parentElement as HTMLElement) ? sheet : null;
}

type AnyFn = (...args: never[]) => unknown;
type Win = Window & typeof globalThis;

/** Wrap the platform's layout reads once per window (see the file comment). */
function installInterception(host: Window): void {
  const win = host as Win;
  if (interceptionInstalled) return;
  interceptionInstalled = true;
  const wrapMethod = (proto: object | undefined, name: string, before: (self: unknown, args: unknown[]) => void) => {
    if (!proto) return;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const original = descriptor?.value as AnyFn | undefined;
    if (typeof original !== "function") return;
    Object.defineProperty(proto, name, {
      ...descriptor,
      value: function (this: unknown, ...args: unknown[]) {
        if (dozing > 0) before(this, args);
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      },
    });
  };
  const wrapGetter = (proto: object | undefined, name: string) => {
    if (!proto) return;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const getter = descriptor?.get;
    if (!getter) return;
    Object.defineProperty(proto, name, {
      ...descriptor,
      get: function (this: Node) {
        if (dozing > 0) wakeForRead(this);
        return getter.call(this);
      },
    });
  };
  const self = (target: unknown) => wakeForRead(target as Node);
  const elementProto = win.Element?.prototype;
  for (const name of ["getBoundingClientRect", "getClientRects", "scrollIntoView", "scrollIntoViewIfNeeded", "checkVisibility"]) {
    wrapMethod(elementProto, name, self);
  }
  for (const name of ["clientTop", "clientLeft", "clientWidth", "clientHeight", "scrollTop", "scrollLeft", "scrollWidth", "scrollHeight"]) {
    wrapGetter(elementProto, name);
  }
  const htmlProto = win.HTMLElement?.prototype;
  for (const name of ["offsetTop", "offsetLeft", "offsetWidth", "offsetHeight", "offsetParent", "innerText"]) {
    wrapGetter(htmlProto, name);
  }
  const svgProto = (win as Window & { SVGGraphicsElement?: { prototype: object } }).SVGGraphicsElement?.prototype;
  for (const name of ["getBBox", "getCTM", "getScreenCTM"]) wrapMethod(svgProto, name, self);
  const rangeProto = win.Range?.prototype;
  for (const name of ["getBoundingClientRect", "getClientRects"]) {
    wrapMethod(rangeProto, name, (range) => {
      const r = range as Range;
      wakeForRead(r.startContainer, r.endContainer);
    });
  }
  // A computed style is the cascade's answer whether or not the element is
  // laid out (fonts, borders, colours read the same in a dormant sheet),
  // except for the values only layout gives: a size or offset that is `auto`
  // or a percentage reads its used pixels once laid out, and `auto` or a
  // percentage while dormant (a table of contents' leaders were drawn from
  // `auto`: no dots). So a computed style wakes the element's sheet when one
  // of those values is read from it, not when it is taken: the style reads
  // across the document every pass (fonts, borders, the content-fit tables)
  // leave the far sheets asleep. A dormant sheet's own blocks read
  // `display: none`: taking theirs wakes it at once.
  const computed = win.getComputedStyle;
  if (typeof computed === "function") {
    const owners = new WeakMap<object, Element>();
    win.getComputedStyle = function (element: Element, pseudo?: string | null) {
      if (dozing > 0 && element?.parentElement?.hasAttribute(SHEET_DORMANT_ATTR)) {
        const sheet = element.parentElement;
        const controller = sheet.parentElement ? controllers.get(sheet.parentElement as HTMLElement) : undefined;
        if (controller) {
          controller.sync();
          if (controller.dormant.has(sheet as HTMLElement)) controller.wakeSheet(sheet as HTMLElement, "read");
        }
      }
      const style = computed.call(win, element, pseudo);
      // Only while a sheet sleeps, and only for an element in an editor's pages.
      if (dozing > 0 && element && insideDozingRoot(element)) owners.set(style, element);
      return style;
    } as typeof win.getComputedStyle;
    const wakeOwner = (style: object) => {
      if (dozing === 0) return;
      const owner = owners.get(style);
      if (owner) wakeForRead(owner);
    };
    // The properties are accessors on the declaration's prototype chain.
    const holders: object[] = [];
    for (let p: object | null = Object.getPrototypeOf(computed.call(win, win.document.documentElement)); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) holders.push(p);
    for (const name of LAYOUT_STYLE_PROPERTIES) {
      for (const holder of holders) {
        const descriptor = Object.getOwnPropertyDescriptor(holder, name);
        if (!descriptor?.get) continue;
        const getter = descriptor.get;
        Object.defineProperty(holder, name, { ...descriptor, get: function (this: object) { wakeOwner(this); return getter.call(this); } });
        break;
      }
    }
    for (const holder of holders) {
      const descriptor = Object.getOwnPropertyDescriptor(holder, "getPropertyValue");
      const original = descriptor?.value as ((this: CSSStyleDeclaration, name: string) => string) | undefined;
      if (typeof original !== "function") continue;
      Object.defineProperty(holder, "getPropertyValue", {
        ...descriptor,
        value: function (this: CSSStyleDeclaration, name: string) {
          if (dozing > 0 && LAYOUT_STYLE_NAMES.has(String(name))) wakeOwner(this);
          return original.call(this, name);
        },
      });
      break;
    }
  }
  // A copy of the pages (a print capture, a page preview, a mirror) is
  // never dormant.
  const nodeProto = win.Node?.prototype;
  const cloneDescriptor = nodeProto ? Object.getOwnPropertyDescriptor(nodeProto, "cloneNode") : undefined;
  const clone = cloneDescriptor?.value as ((this: Node, deep?: boolean) => Node) | undefined;
  if (nodeProto && clone) {
    Object.defineProperty(nodeProto, "cloneNode", {
      ...cloneDescriptor,
      value: function (this: Node, deep?: boolean) {
        const copy = clone.call(this, deep);
        if (dozing > 0 && copy.nodeType === 1) {
          const element = copy as Element;
          element.removeAttribute(SHEET_DORMANT_ATTR);
          if (deep && Array.from(controllers.keys()).some((root) => this === root || this.contains(root))) {
            for (const dormant of Array.from(element.querySelectorAll(`[${SHEET_DORMANT_ATTR}]`))) dormant.removeAttribute(SHEET_DORMANT_ATTR);
          }
        }
        return copy;
      },
    });
  }
  // Observers are not told that an element's sheet slept or woke.
  wrapObserver(win, "ResizeObserver", true);
  wrapObserver(win, "IntersectionObserver", false);
  win.addEventListener("beforeprint", () => {
    printing = true;
    for (const controller of controllers.values()) controller.suspended += 1;
    for (const controller of controllers.values()) wakeEverything(controller, "print");
  });
  win.addEventListener("afterprint", () => {
    if (!printing) return;
    printing = false;
    for (const controller of controllers.values()) controller.suspended = Math.max(0, controller.suspended - 1);
  });
}

function wrapObserver(win: Window, name: "ResizeObserver" | "IntersectionObserver", sizes: boolean): void {
  const host = win as unknown as Record<string, unknown>;
  const Original = host[name] as (new (callback: (entries: Array<{ target: Element; contentRect?: DOMRectReadOnly }>, observer: unknown) => void, options?: unknown) => unknown) | undefined;
  if (typeof Original !== "function") return;
  // The size last told to each observer for each element, and the elements
  // a dormant sheet's change was kept from it.
  const told = new WeakMap<object, WeakMap<Element, string>>();
  const kept = new WeakMap<object, WeakSet<Element>>();
  const Wrapped = function (this: unknown, callback: (entries: Array<{ target: Element; contentRect?: DOMRectReadOnly }>, observer: unknown) => void, options?: unknown) {
    const filter = (entries: Array<{ target: Element; contentRect?: DOMRectReadOnly }>, observer: unknown) => {
      let sizesTold = told.get(observer as object);
      if (sizes && !sizesTold) told.set(observer as object, (sizesTold = new WeakMap()));
      let withheld = kept.get(observer as object);
      const delivered = entries.filter((entry) => {
        const rect = entry.contentRect;
        const key = rect ? `${rect.width}x${rect.height}` : "";
        if (dozing > 0 && dormantSheetOf(entry.target)) {
          if (!withheld) kept.set(observer as object, (withheld = new WeakSet()));
          withheld.add(entry.target);
          return false;
        }
        // Back from sleep at the size it had: nothing changed for it.
        if (withheld?.has(entry.target)) {
          withheld.delete(entry.target);
          if (sizes && sizesTold?.get(entry.target) === key) return false;
        }
        if (sizes) sizesTold?.set(entry.target, key);
        return true;
      });
      if (delivered.length > 0) callback(delivered, observer);
    };
    return new Original(filter, options);
  } as unknown as typeof Original;
  Wrapped.prototype = Original.prototype;
  host[name] = Wrapped;
}

function recount(): void {
  let total = 0;
  for (const controller of controllers.values()) total += controller.dormant.size;
  dozing = total;
}

/** Bring the sheets' attributes in line with `dormant` (outside ProseMirror's
 * observation: the attribute is no change of the page). */
function apply(controller: Controller, sheets: Iterable<HTMLElement>): void {
  const writes: Array<[HTMLElement, boolean]> = [];
  for (const sheet of sheets) {
    const dormant = controller.dormant.has(sheet) && sheet.parentElement === controller.root;
    if (sheet.hasAttribute(SHEET_DORMANT_ATTR) !== dormant) writes.push([sheet, dormant]);
  }
  if (writes.length === 0) return;
  measureOutsideEditorObservation(controller.view, () => {
    for (const [sheet, dormant] of writes) {
      if (dormant) sheet.setAttribute(SHEET_DORMANT_ATTR, "");
      else sheet.removeAttribute(SHEET_DORMANT_ATTR);
    }
  });
  recount();
  const woke = writes.filter(([, dormant]) => !dormant).map(([sheet]) => sheet);
  if (woke.length > 0) reseatCaretIn(controller, woke);
  const win = controller.root.ownerDocument.defaultView;
  if (win) {
    const s = stats(win);
    s.rules += 1;
    s.dormantNow = controller.dormant.size;
  }
}

















function reseatCaretIn(controller: Controller, woke: readonly HTMLElement[]): void {
  const selection = controller.root.ownerDocument.getSelection();
  const anchor = selection?.anchorNode;
  const focus = selection?.focusNode;
  if (!selection || !anchor || !focus) return;
  if (!woke.some((sheet) => sheet.contains(anchor) || sheet.contains(focus))) return;
  // A composition owns the caret; resetting it would end the composition.
  if (controller.view.composing) return;
  try {
    selection.setBaseAndExtent(anchor, selection.anchorOffset, focus, selection.focusOffset);
  } catch {
    // A node taken out between the read and the write: the next selection is the editor's.
  }
}

function wakeEverything(controller: Controller, reason: string): void {
  if (controller.dormant.size === 0) return;
  const win = controller.root.ownerDocument.defaultView;
  if (win) {
    const s = stats(win);
    s.wakes[reason] = (s.wakes[reason] ?? 0) + controller.dormant.size;
  }
  const sheets = Array.from(controller.dormant);
  controller.dormant.clear();
  apply(controller, sheets);
}

export function createSheetDormancy(view: EditorView, options: SheetDormancyOptions): SheetDormancy | null {
  const root = view.dom as HTMLElement;
  const win = root.ownerDocument.defaultView;
  if (!win || !sheetDormancyEnabled(win) || controllers.has(root) || root.classList.contains("sheet-band-story")) return null;
  installInterception(win);
  let sleepTimer: number | undefined;
  let destroyed = false;
  /** Sheets whose height changed asleep: never dormant. */
  const keepAwake = new WeakSet<HTMLElement>();
  const controller: Controller = {
    root,
    view,
    options,
    sheets: sheetsOf(root),
    dormant: new Set(),
    restlessUntil: new WeakMap(),
    observer: null as unknown as MutationObserver,
    suspended: 0,
    wakeSheet(sheet, reason) {
      if (!controller.dormant.delete(sheet)) return;
      controller.restlessUntil.set(sheet, performance.now() + SHEET_DORMANCY_RESTLESS_MS);
      const s = stats(win);
      s.wakes[reason] = (s.wakes[reason] ?? 0) + 1;
      // Development: who read a dormant sheet (`window.__sheetDormancyTrace = {}`).
      const trace = (win as Window & { __sheetDormancyTrace?: Record<string, number> }).__sheetDormancyTrace;
      if (trace && reason === "read") {
        const key = (new Error().stack ?? "").split("\n").slice(3, 8).map((line) => line.trim().replace(/\(?(file|https?):[^)]*\/([^/]+):(\d+):\d+\)?/, "$2:$3")).join(" < ");
        trace[key] = (trace[key] ?? 0) + 1;
      }
      apply(controller, [sheet]);
      scheduleSleep();
    },
    sync() {
      const records = controller.observer.takeRecords();
      if (records.length > 0) note(records);
    },
  };
  // A change inside a sheet wakes it (the ledger measures it again, a remote
  // edit is drawn); sheets put in or taken out move the others' positions.
  const note = (records: readonly MutationRecord[]) => {
    let structural = false;
    const woke: HTMLElement[] = [];
    for (const record of records) {
      if (record.target === root) {
        if (record.type === "childList") structural = true;
        continue;
      }
      // With no sheet asleep there is nothing to wake: a document being
      // filled (hundreds of thousands of records) costs nothing here.
      if (controller.dormant.size === 0) continue;
      if (record.type === "attributes" && record.target instanceof Element &&
          record.target.getAttribute(record.attributeName ?? "") === record.oldValue) continue;
      // The stamps the page passes write on the sheet element itself change
      // nothing inside it.
      if (record.type === "attributes" && (record.target as Element).parentElement === root) continue;
      let element: Element | null = record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
      while (element && element.parentElement !== root) element = element.parentElement;
      if (!element) continue;
      const sheet = element as HTMLElement;
      controller.restlessUntil.set(sheet, performance.now() + SHEET_DORMANCY_RESTLESS_MS);
      if (controller.dormant.has(sheet)) {
        controller.dormant.delete(sheet);
        woke.push(sheet);
        const s = stats(win);
        s.wakes.change = (s.wakes.change ?? 0) + 1;
      }
    }
    if (structural) {
      controller.sheets = sheetsOf(root);
      for (const sheet of controller.dormant) {
        if (sheet.parentElement === root) continue;
        // A sheet taken out (its page drained) keeps no dormancy.
        controller.dormant.delete(sheet);
        woke.push(sheet);
      }
    }
    if (woke.length > 0) apply(controller, woke);
  };
  controller.observer = new (win as Win).MutationObserver((records) => note(records));
  controller.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
  controllers.set(root, controller);
  // Development: the controllers, for harnesses that time a wake.
  if ((win as Window & { __sheetDormancyTrace?: unknown }).__sheetDormancyTrace) {
    (win as Window & { __sheetDormancyControllers?: unknown }).__sheetDormancyControllers = controllers;
  }

  // The element the pages scroll in: the last one seen scrolling them (the
  // notebook window's body is not in place yet when the editor is made), or
  // the nearest ancestor that scrolls.
  let scroller: HTMLElement | null = null;
  const scrollerOf = (): HTMLElement | null => {
    if (scroller?.isConnected && scroller.contains(root)) return scroller;
    for (let node = root.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1) {
        const overflow = win.getComputedStyle(node).overflowY;
        if (overflow === "auto" || overflow === "scroll") return (scroller = node);
      }
    }
    return null;
  };

  /** Index range of the sheets in the reader's viewport (the sheets' own
   * boxes: a dormant sheet keeps its box). */
  const visibleRange = (): { first: number; last: number } | null => {
    const sheets = controller.sheets;
    if (sheets.length === 0) return null;
    const host = scrollerOf();
    const bounds = host ? host.getBoundingClientRect() : { top: 0, bottom: win.innerHeight };
    if (!(bounds.bottom > bounds.top)) return null;
    // Binary search on the sheets' tops (they stand in order).
    const top = (index: number) => sheets[index].getBoundingClientRect();
    let lo = 0;
    let hi = sheets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (top(mid).bottom <= bounds.top) lo = mid + 1;
      else hi = mid;
    }
    let last = lo;
    while (last + 1 < sheets.length && top(last + 1).top < bounds.bottom) last += 1;
    const firstBox = top(lo);
    if (firstBox.top >= bounds.bottom || firstBox.bottom <= bounds.top) return null;
    return { first: lo, last };
  };

  const selectionSheets = (): [number, number] | null => {
    try {
      const { from, to } = view.state.selection;
      const doc = view.state.doc;
      return [doc.resolve(from).index(0), doc.resolve(Math.min(to, doc.content.size)).index(0)];
    } catch {
      return null;
    }
  };

  /** Whether `sheet` (at `index`) may sleep now. */
  const mayDoze = (sheet: HTMLElement, index: number, visible: { first: number; last: number } | null, selection: [number, number] | null, now: number): boolean => {
    if (root.matches('[data-document-view-mode="web"], [data-document-view-mode="outline"], [data-document-view-mode="draft"]')) return false;
    // A hand on the keys is not about to arrive at the next pages, and each sheet
    // awake is laid out and painted with every key (a 25-page report in WebKit: 8
    // awake, 700 ms a key; a scroll still wakes the band ahead of it).
    // The ledger's read of the next page wakes it if the text reaches it.
    const typing = msSinceTyping() < TYPING_NARROW_AWAKE_MS;
    const awake = typing ? TYPING_AWAKE_PAGES : SHEET_DORMANCY_AWAKE_PAGES;
    if (visible && index >= visible.first - awake && index <= visible.last + awake) return false;
    // A next-door page's object drawn over this one (floatingTextBoxLayout) needs
    // its sheet in the render tree.
    if (typing && visible && index >= visible.first - 1 && index <= visible.last + 1 && sheet.querySelector("[data-float-overhang]")) return false;
    if (!visible && index < SHEET_DORMANCY_AWAKE_PAGES) return false;
    const aroundSelection = typing ? 0 : 1;
    if (selection && index >= selection[0] - aroundSelection && index <= selection[1] + aroundSelection) return false;
    if ((controller.restlessUntil.get(sheet) ?? 0) > now) return false;
    if (sheet.hasAttribute(PAGE_OVERSIZE_ATTR)) return false;
    if (options.isPending(sheet) || !options.isMeasured(sheet)) return false;
    if (keepAwake.has(sheet)) return false;
    // A picture not loaded yet loads only while its sheet is drawn (a lazy
    // one as it nears the viewport): asleep, it would still be a blank frame
    // the moment the reader reaches it.
    // Not one that waits for the viewport: it loads when its sheet wakes ahead of
    // the reader, and until then kept a far sheet with a picture awake for good
    // (a 25-page report: 10 sheets, every key laying them out and painting).
    for (const img of Array.from(sheet.getElementsByTagName("img"))) if (!img.complete && img.loading !== "lazy") return false;
    return true;
  };

  /** When the soonest sheet kept awake only by a recent change may sleep
   * (Infinity: none), found by the last `refresh(true)`. */
  let restlessUntilSoonest = Infinity;
  /** Wake what may not sleep; with `sleep`, put what may to sleep. */
  const refresh = (sleep: boolean) => {
    if (destroyed) return;
    controller.sync();
    if (controller.suspended > 0) {
      wakeEverything(controller, "suspended");
      return;
    }
    const sheets = controller.sheets;
    const visible = visibleRange();
    const selection = selectionSheets();
    const now = performance.now();
    const changed: HTMLElement[] = [];
    const heights = new Map<HTMLElement, number>();
    let slept = 0;
    if (sleep) restlessUntilSoonest = Infinity;
    sheets.forEach((sheet, index) => {
      const may = mayDoze(sheet, index, visible, selection, now);
      if (sleep && !may && !controller.dormant.has(sheet)) {
        const restless = controller.restlessUntil.get(sheet) ?? 0;
        if (restless > now) restlessUntilSoonest = Math.min(restlessUntilSoonest, restless);
      }
      if (controller.dormant.has(sheet)) {
        if (!may) {
          controller.dormant.delete(sheet);
          changed.push(sheet);
        }
      } else if (sleep && may) {
        heights.set(sheet, sheet.offsetHeight);
        controller.dormant.add(sheet);
        slept += 1;
        changed.push(sheet);
      }
    });
    if (slept > 0) stats(win).sleeps += slept;
    if (changed.length > 0) apply(controller, changed);
    // A sheet must keep its height asleep (its paper box): one whose height
    // came from its content (a view or a sheet the paper does not size)
    // would move every page after it. It wakes and stays awake.
    const moved: HTMLElement[] = [];
    for (const [sheet, height] of heights) {
      if (sheet.offsetHeight === height) continue;
      controller.dormant.delete(sheet);
      keepAwake.add(sheet);
      moved.push(sheet);
    }
    if (moved.length > 0) apply(controller, moved);
  };

  const scheduleSleep = () => {
    if (destroyed || options.ready?.() === false) return;
    if (sleepTimer !== undefined) win.clearTimeout(sleepTimer);
    sleepTimer = win.setTimeout(function attempt() {
      sleepTimer = undefined;
      if (destroyed) return;
      if (options.ready?.() === false) return;
      // At a keystroke's end while typing: the sheets still awake from reading go
      // now (once), not at the next pause, which a fast hand does not make.
      const sinceTyping = msSinceTyping();
      if (sinceTyping < TYPING_NARROW_AWAKE_MS) {
        if (sinceTyping < TYPING_GAP_MS) {
          sleepTimer = win.setTimeout(attempt, TYPING_GAP_MS);
          return;
        }
      } else if (options.inputQuiet && !options.inputQuiet()) {
        sleepTimer = win.setTimeout(attempt, SLEEP_AFTER_MS);
        return;
      }
      refresh(true);
      // A sheet woken by a read or a change may sleep once it has been quiet
      // for SHEET_DORMANCY_RESTLESS_MS; nothing else asks again then (it
      // stayed awake until the next scroll: a measurement that read every
      // sheet left a whole document awake).
      if (restlessUntilSoonest !== Infinity && sleepTimer === undefined && !destroyed) {
        sleepTimer = win.setTimeout(attempt, Math.max(SLEEP_AFTER_MS, restlessUntilSoonest - performance.now() + 50));
      }
    }, SLEEP_AFTER_MS);
  };
  let lastScrollSleep = 0;

  // Scrolling: the sheets coming near wake before the frame paints them;
  // the ones left behind sleep once the scrolling stops.
  // A hand coming to the keys: the band narrows (mayDoze) at the first gap.
  const onKey = () => {
    if (destroyed || sleepTimer !== undefined) return;
    if (controller.sheets.length - controller.dormant.size <= TYPING_AWAKE_LIMIT) return;
    scheduleSleep();
  };
  win.addEventListener("keydown", onKey, { capture: true, passive: true });
  const onScroll = (event: Event) => {
    if (destroyed) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.contains(root)) return;
    scroller = target as HTMLElement;
    if (controller.dormant.size > 0) {
      const visible = visibleRange();
      if (visible) {
        const woke: HTMLElement[] = [];
        for (let index = Math.max(0, visible.first - SHEET_DORMANCY_AWAKE_PAGES); index <= Math.min(controller.sheets.length - 1, visible.last + SHEET_DORMANCY_AWAKE_PAGES); index += 1) {
          const sheet = controller.sheets[index];
          if (sheet && controller.dormant.delete(sheet)) {
            woke.push(sheet);
            const s = stats(win);
            s.wakes.scroll = (s.wakes.scroll ?? 0) + 1;
          }
        }
        if (woke.length > 0) apply(controller, woke);
      }
    }
    // A long scroll: the sheets far behind it sleep without waiting for it
    // to stop.
    const now = performance.now();
    if (
      now - lastScrollSleep >= SCROLL_SLEEP_EVERY_MS &&
      options.ready?.() !== false &&
      controller.sheets.length - controller.dormant.size > 2 * SHEET_DORMANCY_AWAKE_PAGES + 2 + SCROLL_SLEEP_SLACK_PAGES
    ) {
      lastScrollSleep = now;
      refresh(true);
    }
    scheduleSleep();
  };
  // Scroll does not bubble: listened for on the way down, from the document.
  root.ownerDocument.addEventListener("scroll", onScroll, { capture: true, passive: true });

  return {
    // Nothing asleep, nothing to wake: no read at all (it runs before every
    // pass, the bridge's fill polls included).
    wakeIneligible: () => {
      if (controller.dormant.size > 0) refresh(false);
    },
    selectionChanged: () => {
      if (controller.dormant.size === 0) return;
      const selection = selectionSheets();
      if (!selection) return;
      controller.sync();
      for (let index = Math.max(0, selection[0] - 1); index <= selection[1] + 1; index += 1) {
        const sheet = controller.sheets[index];
        if (sheet && controller.dormant.has(sheet)) controller.wakeSheet(sheet, "selection");
      }
    },
    scheduleSleep,
    wakeAll: (reason) => wakeEverything(controller, reason),
    destroy() {
      destroyed = true;
      if (sleepTimer !== undefined) win.clearTimeout(sleepTimer);
      root.ownerDocument.removeEventListener("scroll", onScroll, { capture: true });
      win.removeEventListener("keydown", onKey, { capture: true });
      controller.observer.disconnect();
      const sheets = Array.from(controller.dormant);
      controller.dormant.clear();
      controllers.delete(root);
      if (!view.isDestroyed) apply(controller, sheets);
      recount();
    },
    get dormantCount() {
      return controller.dormant.size;
    },
  };
}
