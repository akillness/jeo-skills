"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The zoom writing window (Goodnotes' zoom window, Notability's zoom view):
 * a panel docked along the bottom of the editor's window shows a box of the
 * page magnified, and what the pen writes large in the panel is written
 * small on the page, in the box. The box walks on along the line as the
 * writing reaches the panel's right side and turns to the next line with
 * the Return button; dragged by its tab it goes anywhere on the page.
 *
 * Host-neutral, as the floating palette that opens it: the panel replays
 * each stroke into the editor as the pen strokes the editor would have
 * received there (pointer events at the box's place on screen), so Docs,
 * Slides and Sheet take it through their own ink -- the pen, the eraser,
 * pressure, Scribble to erase and the shapes all behave as on the page. The
 * page in the panel is a picture of the page (a copy of its elements,
 * refreshed as the page changes), not a second editor.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { OFFICE_WET_INK_FLUSH_EVENT } from "../../lib/office-wet-ink";

import styles from "./OfficeInkZoomWindow.module.css";

/** What a page is, in each editor: the element the box sits on. */
const PAGE_SELECTOR = [
  "article[data-page-sheet]",
  '[data-testid="presentation-slide-canvas"]',
  '[data-testid="spreadsheet-grid-viewport"]',
].join(",");
const ZOOM_UI_ATTRIBUTE = "data-ink-zoom-window";
/** The pointer the replayed strokes are written with (never a real one). */
const REPLAY_POINTER_ID = 9_001;
/** How much larger the panel shows the box (default, and its bounds). */
const ZOOM_DEFAULT = 2.5;
const ZOOM_MIN = 1.5;
const ZOOM_MAX = 4;
/** Writing past this share of the panel's width walks the box on at the lift. */
const ADVANCE_AT = 0.72;
/** And by this share of its width. */
const ADVANCE_BY = 0.55;

export interface OfficeInkZoomWindowLabels {
  readonly title: string;
  readonly back: string;
  readonly forward: string;
  readonly nextLine: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly close: string;
}

export interface OfficeInkZoomWindowProps {
  /** The editor's window (the panel docks along its bottom). */
  readonly host: HTMLElement;
  /** The picked pen's look, for the stroke as it is written in the panel. */
  readonly color: string;
  /** The pen's width on the page at 100% (CSS px). */
  readonly widthPx: number;
  readonly labels: OfficeInkZoomWindowLabels;
  readonly testIdPrefix: string;
  readonly onClose: () => void;
  /** The pen touched down in the panel (the palette puts its open menus away, as a tap on the page does). */
  readonly onWrite?: () => void;
}

/** The box: its page, and its place on it in the page's own (unzoomed) pixels. */
interface ZoomBox {
  readonly page: HTMLElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Where the line the box walks along starts (page px). */
  readonly lineStart: number;
}

function pageScale(page: HTMLElement): number {
  const rect = page.getBoundingClientRect();
  return page.offsetWidth > 0 ? rect.width / page.offsetWidth || 1 : 1;
}

function pageAt(doc: Document, x: number, y: number): HTMLElement | null {
  for (const element of doc.elementsFromPoint(x, y)) {
    if (element.closest(`[${ZOOM_UI_ATTRIBUTE}]`)) continue;
    const page = element.closest<HTMLElement>(PAGE_SELECTOR);
    if (page) return page;
  }
  return null;
}

/**
 * The page most of which shows in `host` above `bottom` (screen px): where
 * the first box goes when none is under the window's upper part (a slide
 * centred in a tall portrait window has only the desk there).
 */
function mostVisiblePage(host: HTMLElement, bottom: number): HTMLElement | null {
  const hostRect = host.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const page of host.querySelectorAll<HTMLElement>(PAGE_SELECTOR)) {
    if (page.closest(`[${ZOOM_UI_ATTRIBUTE}], [data-ink-zoom-copy]`)) continue;
    const rect = page.getBoundingClientRect();
    const width = Math.min(rect.right, hostRect.right) - Math.max(rect.left, hostRect.left);
    const height = Math.min(rect.bottom, bottom) - Math.max(rect.top, hostRect.top);
    const area = width > 0 && height > 0 ? width * height : 0;
    if (area > bestArea) {
      best = page;
      bestArea = area;
    }
  }
  return best;
}

/** What the pen would have struck at (x, y): the topmost element that is not the zoom window's own or the palette. */
function strikeTarget(doc: Document, x: number, y: number): Element | null {
  for (const element of doc.elementsFromPoint(x, y)) {
    if (element.closest(`[${ZOOM_UI_ATTRIBUTE}], [data-pen-palette-root]`)) continue;
    return element;
  }
  return null;
}

/**
 * A still copy of the page for the panel: the page's elements, inside shells
 * of its ancestors (their classes and data attributes, so the page's styles
 * that depend on them still apply), laid flat.
 */
function pageCopy(page: HTMLElement): HTMLElement {
  const copy = page.cloneNode(true) as HTMLElement;
  for (const editable of copy.querySelectorAll("[contenteditable]")) editable.setAttribute("contenteditable", "false");
  // A picture, not the page: nothing that finds the page's parts by their
  // test ids finds these, and none of it takes focus or a pointer. (Element
  // ids stay: a gradient pen's paint refers to its gradient by id, and the
  // page, earlier in the document, is still the one an id finds.)
  for (const tagged of [copy, ...copy.querySelectorAll("[data-testid]")]) tagged.removeAttribute("data-testid");
  copy.setAttribute("inert", "");
  copy.setAttribute("data-ink-zoom-copy", "");
  copy.removeAttribute("id");
  Object.assign(copy.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    margin: "0px",
    width: `${page.offsetWidth}px`,
    height: `${page.offsetHeight}px`,
    transform: "none",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  let inner: HTMLElement = copy;
  for (let ancestor = page.parentElement; ancestor && ancestor !== page.ownerDocument.body; ancestor = ancestor.parentElement) {
    const shell = ancestor.cloneNode(false) as HTMLElement;
    shell.removeAttribute("id");
    shell.removeAttribute("data-testid");
    shell.style.cssText =
      "position:relative;display:block;transform:none;overflow:visible;width:auto;height:auto;margin:0;padding:0;inset:auto;";
    shell.append(inner);
    inner = shell;
  }
  return inner;
}

/**
 * The replayed pointer is not one the browser knows: capturing it throws
 * (NotFoundError), and an editor that captures the pointer before it starts
 * its stroke (Slides, Sheet) would stop there. While a zoom window is open,
 * capturing or releasing the replayed pointer does nothing and it is never
 * captured; every real pointer is captured as before.
 */
let replayCaptureHolds = 0;
let restoreReplayCapture: (() => void) | null = null;
function holdReplayPointerCapture(): () => void {
  if (replayCaptureHolds++ === 0) {
    const proto = Element.prototype;
    const set = proto.setPointerCapture;
    const release = proto.releasePointerCapture;
    const has = proto.hasPointerCapture;
    proto.setPointerCapture = function (this: Element, pointerId: number) {
      if (pointerId !== REPLAY_POINTER_ID) set?.call(this, pointerId);
    };
    proto.releasePointerCapture = function (this: Element, pointerId: number) {
      if (pointerId !== REPLAY_POINTER_ID) release?.call(this, pointerId);
    };
    proto.hasPointerCapture = function (this: Element, pointerId: number) {
      return pointerId === REPLAY_POINTER_ID ? false : Boolean(has?.call(this, pointerId));
    };
    restoreReplayCapture = () => {
      proto.setPointerCapture = set;
      proto.releasePointerCapture = release;
      proto.hasPointerCapture = has;
    };
  }
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--replayCaptureHolds === 0) {
      restoreReplayCapture?.();
      restoreReplayCapture = null;
    }
  };
}

export function OfficeInkZoomWindow({ host, color, widthPx, labels, testIdPrefix, onClose, onWrite }: OfficeInkZoomWindowProps) {
  const doc = host.ownerDocument;
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [box, setBox] = useState<ZoomBox | null>(null);
  const [panelRect, setPanelRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [, setTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<ZoomBox | null>(null);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => holdReplayPointerCapture(), []);
  useLayoutEffect(() => {
    boxRef.current = box;
    zoomRef.current = zoom;
  }, [box, zoom]);

  // The panel along the bottom of the window, a third of its height.
  const measurePanel = useCallback(() => {
    const rect = host.getBoundingClientRect();
    const height = Math.round(Math.min(340, Math.max(180, rect.height * 0.34)));
    setPanelRect({ left: rect.left + 8, top: rect.bottom - height - 8, width: Math.max(160, rect.width - 16), height });
  }, [host]);
  useLayoutEffect(() => {
    measurePanel();
    const observer = new ResizeObserver(measurePanel);
    observer.observe(host);
    window.addEventListener("resize", measurePanel);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measurePanel);
    };
  }, [host, measurePanel]);

  // The body of the panel (below its bar): the box is its shape at 1/zoom.
  const bodySize = () => {
    const body = bodyRef.current;
    return body ? { width: body.clientWidth, height: body.clientHeight } : null;
  };

  // First box: on the page in the upper part of the window, its line starting a little in from the page's left.
  useEffect(() => {
    if (box || !panelRect) return;
    const rect = host.getBoundingClientRect();
    const size = bodySize();
    if (!size) return;
    const page =
      pageAt(doc, rect.left + rect.width / 2, rect.top + Math.min(rect.height * 0.3, panelRect.top - rect.top - 40)) ??
      mostVisiblePage(host, panelRect.top);
    if (!page) return;
    const scale = pageScale(page);
    const pageRect = page.getBoundingClientRect();
    const width = size.width / zoomRef.current / scale;
    const height = size.height / zoomRef.current / scale;
    const x = Math.max(0, Math.min(page.offsetWidth - width, page.offsetWidth * 0.1));
    const y = Math.max(0, Math.min(page.offsetHeight - height, (rect.top + rect.height * 0.2 - pageRect.top) / scale));
    setBox({ page, x, y, width, height, lineStart: x });
  }, [box, panelRect, doc, host]);

  // A zoom change keeps the box's top-left and gives it the panel's shape at the new zoom.
  useEffect(() => {
    const current = boxRef.current;
    const size = bodySize();
    if (!current || !size) return;
    const scale = pageScale(current.page);
    const width = size.width / zoom / scale;
    const height = size.height / zoom / scale;
    if (Math.abs(width - current.width) < 0.5 && Math.abs(height - current.height) < 0.5) return;
    setBox({ ...current, width, height });
  }, [zoom, panelRect]);

  // The picture of the page: refreshed as the page changes (a stroke lands,
  // the text reflows), and as the box moves.
  const refreshView = useCallback(() => {
    const view = viewRef.current;
    const current = boxRef.current;
    const size = bodySize();
    if (!view || !current || !size) return;
    const k = size.width / current.width;
    const copy = pageCopy(current.page);
    // Enlarged by `zoom`, not a scale transform: the copy is laid out and
    // drawn at the panel's size, so its strokes and text are as sharp as
    // the panel's own. A transform enlarges what was drawn at the page's
    // size, and iPadOS shows the ink (its own layer) blurred once a stroke
    // lands. Browsers without `zoom` fall back to the transform.
    const frame = doc.createElement("div");
    const zoomable = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "2");
    Object.assign(frame.style, {
      position: "absolute",
      left: zoomable ? `${-current.x * k}px` : "0px",
      top: zoomable ? `${-current.y * k}px` : "0px",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    if (zoomable) {
      const inner = doc.createElement("div");
      inner.style.zoom = String(k);
      inner.append(copy);
      frame.append(inner);
    } else {
      frame.style.transformOrigin = "0 0";
      frame.style.transform = `scale(${k}) translate(${-current.x}px, ${-current.y}px)`;
      frame.append(copy);
    }
    view.replaceChildren(frame);
    // What the panel drew of the strokes is in the picture now.
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, [doc]);
  useEffect(() => {
    if (!box) return;
    refreshView();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(refreshView, 220);
    });
    observer.observe(box.page, { subtree: true, childList: true, attributes: true, characterData: true });
    const onScroll = () => setTick((tick) => tick + 1);
    doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
      doc.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [box, refreshView, doc]);

  // The panel's own drawing of the stroke being written (until it lands in the picture).
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const body = bodyRef.current;
    if (!canvas || !body) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(body.clientWidth * dpr);
    canvas.height = Math.round(body.clientHeight * dpr);
  }, []);
  useLayoutEffect(sizeCanvas, [panelRect, sizeCanvas]);

  /** The box on screen now (it moves with the page as the page scrolls). */
  const boxOnScreen = (current: ZoomBox) => {
    const rect = current.page.getBoundingClientRect();
    const scale = pageScale(current.page);
    return {
      left: rect.left + current.x * scale,
      top: rect.top + current.y * scale,
      width: current.width * scale,
      height: current.height * scale,
    };
  };

  const stroke = useRef<{
    target: Element;
    last: { x: number; y: number } | null;
    maxX: number;
    pointerType: string;
  } | null>(null);

  const replay = (type: string, target: Element, event: PointerEvent, x: number, y: number) => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: REPLAY_POINTER_ID,
        pointerType: event.pointerType === "mouse" ? "mouse" : "pen",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
        pressure: type === "pointerup" ? 0 : event.pressure || 0.5,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        width: 1,
        height: 1,
      }),
    );
  };

  const toPage = (current: ZoomBox, clientX: number, clientY: number) => {
    const body = bodyRef.current!.getBoundingClientRect();
    const onScreen = boxOnScreen(current);
    const k = body.width / onScreen.width;
    return { x: onScreen.left + (clientX - body.left) / k, y: onScreen.top + (clientY - body.top) / k };
  };

  const draw = (from: { x: number; y: number } | null, to: { x: number; y: number }, pressure: number) => {
    const canvas = canvasRef.current;
    const body = bodyRef.current;
    const current = boxRef.current;
    if (!canvas || !body || !current) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    const k = body.clientWidth / current.width;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.strokeStyle = color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(1, widthPx * k * (0.6 + 0.8 * Math.min(1, Math.max(0, pressure || 0.5))));
    context.beginPath();
    context.moveTo((from ?? to).x, (from ?? to).y);
    context.lineTo(to.x, to.y);
    context.stroke();
  };

  const onBodyDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = boxRef.current;
    if (!current || event.button !== 0) return;
    // A finger resting on the panel is the hand; the pen and the mouse write.
    if (event.pointerType === "touch") return;
    event.preventDefault();
    event.stopPropagation();
    const at = toPage(current, event.clientX, event.clientY);
    const target = strikeTarget(doc, at.x, at.y);
    if (!target) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const body = event.currentTarget.getBoundingClientRect();
    const local = { x: event.clientX - body.left, y: event.clientY - body.top };
    stroke.current = { target, last: local, maxX: local.x, pointerType: event.pointerType };
    onWrite?.();
    replay("pointerdown", target, event.nativeEvent, at.x, at.y);
    draw(null, local, event.pressure);
  };
  const onBodyMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const running = stroke.current;
    const current = boxRef.current;
    if (!running || !current) return;
    event.stopPropagation();
    const body = event.currentTarget.getBoundingClientRect();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      const local = { x: sample.clientX - body.left, y: sample.clientY - body.top };
      const at = toPage(current, sample.clientX, sample.clientY);
      replay("pointermove", running.target, sample, at.x, at.y);
      draw(running.last, local, sample.pressure);
      running.last = local;
      running.maxX = Math.max(running.maxX, local.x);
    }
  };
  const onBodyUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const running = stroke.current;
    const current = boxRef.current;
    stroke.current = null;
    if (!running || !current) return;
    event.stopPropagation();
    const at = toPage(current, event.clientX, event.clientY);
    replay(event.type === "pointercancel" ? "pointercancel" : "pointerup", running.target, event.nativeEvent, at.x, at.y);
    // The stroke lands now: the picture shows it as the page has it.
    window.setTimeout(() => window.dispatchEvent(new Event(OFFICE_WET_INK_FLUSH_EVENT)), 40);
    // Writing near the right walks the box on along the line.
    const body = bodyRef.current;
    if (body && running.maxX > body.clientWidth * ADVANCE_AT) walk(ADVANCE_BY);
  };

  const walk = (share: number) => {
    const current = boxRef.current;
    if (!current) return;
    const step = current.width * share;
    let x = current.x + step;
    let y = current.y;
    if (share > 0 && x + current.width > current.page.offsetWidth) {
      // The line is full: the next one, from where this one started.
      x = current.lineStart;
      y = Math.min(current.page.offsetHeight - current.height, current.y + current.height * 0.85);
    }
    x = Math.max(0, Math.min(current.page.offsetWidth - current.width, x));
    setBox({ ...current, x, y });
  };
  const nextLine = () => {
    const current = boxRef.current;
    if (!current) return;
    setBox({
      ...current,
      x: current.lineStart,
      y: Math.min(current.page.offsetHeight - current.height, current.y + current.height * 0.85),
    });
  };

  // The box's tab drags it over the page; where it is let go, a new line starts.
  const onTabDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = boxRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    const scale = pageScale(current.page);
    const start = { x: event.clientX, y: event.clientY, bx: current.x, by: current.y };
    const move = (next: PointerEvent) => {
      const latest = boxRef.current;
      if (!latest) return;
      const x = Math.max(0, Math.min(latest.page.offsetWidth - latest.width, start.bx + (next.clientX - start.x) / scale));
      const y = Math.max(0, Math.min(latest.page.offsetHeight - latest.height, start.by + (next.clientY - start.y) / scale));
      setBox({ ...latest, x, y, lineStart: x });
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  if (!panelRect) return null;
  const onScreen = box ? boxOnScreen(box) : null;
  const ui = { [ZOOM_UI_ATTRIBUTE]: "" };
  return createPortal(
    <>
      {onScreen ? (
        <div
          {...ui}
          className={styles.box}
          data-testid={`${testIdPrefix}-zoom-box`}
          style={{ left: onScreen.left, top: onScreen.top, width: onScreen.width, height: onScreen.height }}
        >
          <button
            type="button"
            className={styles.tab}
            aria-label={labels.title}
            data-testid={`${testIdPrefix}-zoom-box-tab`}
            onPointerDown={onTabDown}
          />
        </div>
      ) : null}
      <div
        {...ui}
        role="region"
        aria-label={labels.title}
        className={styles.panel}
        data-testid={`${testIdPrefix}-zoom-window`}
        style={{ left: panelRect.left, top: panelRect.top, width: panelRect.width, height: panelRect.height }}
      >
        <div className={styles.bar}>
          <span className={styles.title}>{labels.title}</span>
          <button type="button" className={styles.button} aria-label={labels.back} title={labels.back} onClick={() => walk(-ADVANCE_BY)}>
            ←
          </button>
          <button type="button" className={styles.button} aria-label={labels.forward} title={labels.forward} onClick={() => walk(ADVANCE_BY)}>
            →
          </button>
          <button
            type="button"
            className={styles.button}
            aria-label={labels.nextLine}
            title={labels.nextLine}
            data-testid={`${testIdPrefix}-zoom-next-line`}
            onClick={nextLine}
          >
            ↵
          </button>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.button}
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((value) => Math.max(ZOOM_MIN, Math.round((value - 0.5) * 10) / 10))}
          >
            −
          </button>
          <span className={styles.level}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={styles.button}
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((value) => Math.min(ZOOM_MAX, Math.round((value + 0.5) * 10) / 10))}
          >
            +
          </button>
          <button
            type="button"
            className={styles.button}
            aria-label={labels.close}
            title={labels.close}
            data-testid={`${testIdPrefix}-zoom-close`}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div
          ref={bodyRef}
          className={styles.body}
          data-testid={`${testIdPrefix}-zoom-body`}
          onPointerDown={onBodyDown}
          onPointerMove={onBodyMove}
          onPointerUp={onBodyUp}
          onPointerCancel={onBodyUp}
        >
          <div ref={viewRef} className={styles.view} aria-hidden="true" />
          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          <span className={styles.advanceMark} style={{ left: `${ADVANCE_AT * 100}%` }} aria-hidden="true" />
        </div>
      </div>
    </>,
    doc.body,
  );
}
