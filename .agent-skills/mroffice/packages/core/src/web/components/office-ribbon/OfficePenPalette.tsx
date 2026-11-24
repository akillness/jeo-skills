"use client";




























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../lib/office-units";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";

import DocumentInkPenGlyph from "../console/editor/native-document/DocumentInkPenGlyph";
import {
  OfficeInkEraserMenuItems,
  OfficeInkPenMenuContent,
  type OfficeInkPenPatch,
} from "./OfficeInkRibbon";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import { OfficeInkZoomWindow } from "./OfficeInkZoomWindow";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DOCUMENT_INK_THICKNESSES, type DocumentInkEraser, type DocumentInkPreset } from "../../lib/document-ink";
import { saveDrawWithTouch, useDrawWithTouch } from "../../lib/draw-with-touch";
import {
  PEN_PALETTE_PART_ATTRIBUTE,
  PEN_PALETTE_ROOT_ATTRIBUTE,
  beginPaletteReshape,
  finishPaletteReshape,
  holdPaletteExit,
  playPaletteEntrance,
  type PaletteReshape,
} from "../../lib/pen-palette-motion";

import styles from "./OfficePenPalette.module.css";

/** The palette's colours, a note-taking app's eight (Word's own values where it has them). */
export const OFFICE_PEN_PALETTE_COLORS: readonly string[] = [
  "#000000",
  "#2b57a5",
  "#3b8ed8",
  "#e12b2b",
  "#ffffff",
  "#2f8f3c",
  "#f2b233",
  "#5d3a9b",
];

export type OfficePenPaletteTool = "select" | "draw" | "eraser" | "lasso" | "laser" | "tape";
export type OfficePenPaletteOrientation = "vertical" | "horizontal";

export interface OfficePenPaletteCommand {
  readonly run: () => void;
  readonly active?: boolean;
  readonly disabled?: boolean;
}

/** A pen's menu, as the ribbon's pen gallery has it (OfficeInkPenMenuContent). */
export interface OfficePenPaletteMenu {
  readonly onUpdate: (id: string, patch: OfficeInkPenPatch) => void;
  readonly onRemove: (id: string) => void;
  readonly onMoreColors?: (id: string) => void;
  readonly effects?: boolean;
}

/** The eraser's kind, as the ribbon's Eraser drop-down picks it. */
export interface OfficePenPaletteEraser {
  readonly value: DocumentInkEraser;
  readonly onChoose: (kind: DocumentInkEraser) => void;
}

/**
 * Back to the pen once an erasing pen lifts (Goodnotes' "auto-deselect"),
 * remembered on this device for every editor's palette. Off unless asked.
 */
const ERASER_RETURN_KEY = "mrnote.inkEraserAutoReturn";

function loadEraserReturn(): boolean {
  try {
    return window.localStorage.getItem(ERASER_RETURN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveEraserReturn(on: boolean): void {
  try {
    window.localStorage.setItem(ERASER_RETURN_KEY, on ? "1" : "0");
  } catch {
    // A private window keeps the choice for this page only.
  }
}

export interface OfficePenPaletteProps {
  /** An element inside the editor: the palette floats over the window it is in. */
  anchor: HTMLElement | null;
  /** Remembers where the reader left the palette, per editor ("docs", "slides", "sheet"). */
  storageKey: string;
  testIdPrefix: string;
  pens: readonly DocumentInkPreset[];
  selectedPenId: string;
  tool: OfficePenPaletteTool | null;
  /** Read-only, or no page to draw on: every tool is off. */
  disabled?: boolean;
  disabledReason?: string;
  /** No ink on the page yet: nothing for the eraser or the lasso to take. */
  inkMissing?: boolean;
  onSelect: () => void;
  onPen: (pen: DocumentInkPreset) => void;
  onEraser: () => void;
  /** The eraser's kinds: tapping the picked eraser again opens them. */
  eraser?: OfficePenPaletteEraser;
  onLasso?: () => void;
  /** Laser Pointer: a fading line that points and is never saved (lib/office-ink-laser). */
  onLaser?: () => void;
  /** Tape: the pen lays strips over the words, a tap peels one back (learning by heart). */
  onTape?: () => void;
  /** Recolours / re-thickens the picked pen; left out where the pens are fixed presets. */
  onPenColor?: (color: string) => void;
  onPenWidth?: (widthPt: number) => void;
  /** What a long press on a pen opens; left out where the pens are fixed presets. */
  penMenu?: OfficePenPaletteMenu;
  /** Where each of the palette's pens is (a colour picker anchored to it). */
  penRef?: (id: string, element: HTMLButtonElement | null) => void;
  inkToShape?: OfficePenPaletteCommand;
  inkToText?: OfficePenPaletteCommand;
  inkToMath?: OfficePenPaletteCommand;
  ruler?: OfficePenPaletteCommand;
  undo?: OfficePenPaletteCommand;
  redo?: OfficePenPaletteCommand;
  onShowRibbon: () => void;
}

interface PaletteHost {
  readonly element: HTMLElement;
  /** Fixed over the viewport (no window to float in). */
  readonly fixed: boolean;
}

interface PaletteBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface PalettePlace {
  /** Where in the free room across (0 left .. 1 right) and down (0 top .. 1 bottom). */
  readonly fx: number;
  readonly fy: number;
  readonly folded: boolean;
  readonly orientation: OfficePenPaletteOrientation;
}

/** A drag under way: the pointer (room coordinates) and where on the palette it took hold (0..1). */
interface PaletteDrag {
  readonly px: number;
  readonly py: number;
  readonly gx: number;
  readonly gy: number;
}

interface PalettePress {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly startX: number;
  readonly startY: number;
  /** The tools' strip under the press, when it has more to scroll to. */
  readonly scroller: HTMLElement | null;
  /** The pen under the press, when a long press opens its menu. */
  readonly pen: DocumentInkPreset | null;
  lifted: boolean;
  dragging: boolean;
  menuOpened: boolean;
  readonly timers: number[];
}

const MARGIN = 12;
const DEFAULT_PLACE: PalettePlace = { fx: 1, fy: 0.5, folded: false, orientation: "vertical" };
const PLACE_KEY_PREFIX = "mrnote.penPalette.";
/** A press that travels this far (px) drags the palette (or, along the tools, scrolls them). */
const DRAG_SLOP_PX = 8;
/** A press held this long, unmoved, lifts the palette: any move then drags it. */
const LIFT_MS = 420;
/** A press on a pen held this long, unmoved, opens the pen's menu. */
export const PEN_PALETTE_MENU_HOLD_MS = 500;
/** After a drag or a pen's menu, the click its release makes is not a tap. */
const CLICK_AFTER_HOLD_MS = 400;
const SCROLLER_ATTRIBUTE = "data-pen-palette-scroller";
const PEN_ATTRIBUTE = "data-pen-palette-pen";

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadPlace(storageKey: string): PalettePlace {
  try {
    const stored = globalThis.localStorage?.getItem(PLACE_KEY_PREFIX + storageKey);
    if (!stored) return DEFAULT_PLACE;
    const parsed = JSON.parse(stored) as Partial<PalettePlace>;
    return {
      fx: clamp01(Number(parsed.fx)),
      fy: clamp01(Number(parsed.fy)),
      folded: parsed.folded === true,
      orientation: parsed.orientation === "horizontal" ? "horizontal" : "vertical",
    };
  } catch {
    return DEFAULT_PLACE;
  }
}

function savePlace(storageKey: string, place: PalettePlace): void {
  try {
    globalThis.localStorage?.setItem(PLACE_KEY_PREFIX + storageKey, JSON.stringify(place));
  } catch {
    /* storage unavailable: the place holds for this page */
  }
}

/** The window the anchor is in (its body is the room), else the viewport. */
function paletteHostFor(anchor: HTMLElement | null): PaletteHost | null {
  if (typeof document === "undefined") return null;
  const shell = anchor?.closest<HTMLElement>(".wm-window") ?? null;
  return shell ? { element: shell, fixed: false } : { element: document.body, fixed: true };
}

function paletteBoundsIn(host: PaletteHost): PaletteBounds {
  if (host.fixed) {
    const view = host.element.ownerDocument.defaultView;
    return { left: 0, top: 0, width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 };
  }
  const body = host.element.querySelector<HTMLElement>(":scope > .wm-body");
  if (body) {
    return { left: body.offsetLeft, top: body.offsetTop, width: body.offsetWidth, height: body.offsetHeight };
  }
  return { left: 0, top: 0, width: host.element.offsetWidth, height: host.element.offsetHeight };
}

/** How near an edge (px) the dragging pointer turns the palette to lie along it. */
function edgeZone(extent: number): number {
  return clamp(extent * 0.14, 56, 140);
}

/**
 * The palette's lie after a drag to `x`, `y` (room coordinates): upright by
 * the left and right edges, lying along the top and bottom ones; in the
 * middle and in a corner it keeps the lie it has.
 */
export function penPaletteOrientationAt(
  bounds: PaletteBounds,
  x: number,
  y: number,
  current: OfficePenPaletteOrientation,
): OfficePenPaletteOrientation {
  const zoneX = edgeZone(bounds.width);
  const zoneY = edgeZone(bounds.height);
  const bySide = x - bounds.left < zoneX || bounds.left + bounds.width - x < zoneX;
  const byTopOrBottom = y - bounds.top < zoneY || bounds.top + bounds.height - y < zoneY;
  if (byTopOrBottom && !bySide) return "horizontal";
  if (bySide && !byTopOrBottom) return "vertical";
  return current;
}

/** An event that happened in the element it is heard on, not in a portal of its React children. */
function ownEvent(event: { readonly target: EventTarget; readonly currentTarget: EventTarget }): boolean {
  const target = event.target;
  const current = event.currentTarget;
  return target instanceof Node && current instanceof Node && current.contains(target);
}

function PaletteButton({
  label,
  pressed,
  disabled,
  onClick,
  testId,
  children,
  className,
  penId,
  buttonRef,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
  className?: string;
  penId?: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={[styles.button, className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      data-active={pressed ? "true" : undefined}
      disabled={disabled}
      data-testid={testId}
      {...(penId ? { [PEN_ATTRIBUTE]: penId } : {})}
      // The editor keeps its focus and selection (a lasso's strokes, the caret).
      // A press or a tap in the button's own menu (portalled out of it, its
      // events still bubble here through React's tree) is the menu's: a tap
      // on one of the eraser's kinds closed the menu and then, as the
      // eraser's own click, opened it again.
      onMouseDown={(event) => {
        if (ownEvent(event)) event.preventDefault();
      }}
      onClick={(event) => {
        if (ownEvent(event)) onClick();
      }}
    >
      {children}
    </button>
  );
}

export function OfficePenPalette({
  anchor,
  storageKey,
  testIdPrefix,
  pens,
  selectedPenId,
  tool,
  disabled = false,
  disabledReason,
  inkMissing = false,
  onSelect,
  onPen,
  onEraser,
  eraser,
  onLasso,
  onLaser,
  onTape,
  onPenColor,
  onPenWidth,
  penMenu,
  penRef,
  inkToShape,
  inkToText,
  inkToMath,
  ruler,
  undo,
  redo,
  onShowRibbon,
}: OfficePenPaletteProps) {
  const t = useTranslations("console-notebooks");
  const drawWithTouch = useDrawWithTouch();
  // The window the palette floats over (read from the page once per anchor).
  const host = useMemo(() => paletteHostFor(anchor), [anchor]);
  const [bounds, setBounds] = useState<PaletteBounds | null>(null);
  const [place, setPlace] = useState<PalettePlace>(() => loadPlace(storageKey));
  const [drag, setDrag] = useState<PaletteDrag | null>(null);
  const [lifted, setLifted] = useState(false);
  const [menuPenId, setMenuPenId] = useState<string | null>(null);
  // The pen whose menu is mounted: it stays after the menu closes, so the
  // menu plays its exit instead of vanishing the moment it is dismissed.
  const [shownMenuPenId, setShownMenuPenId] = useState<string | null>(null);
  if (menuPenId !== null && menuPenId !== shownMenuPenId) setShownMenuPenId(menuPenId);
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false);
  const [eraserMenuShown, setEraserMenuShown] = useState(false);
  if (eraserMenuOpen && !eraserMenuShown) setEraserMenuShown(true);
  const [zoomWindowOpen, setZoomWindowOpen] = useState(false);
  const [eraserReturn, setEraserReturn] = useState(loadEraserReturn);
  const [thicknesses, setThicknesses] = useState(false);
  const [rootNode, setRootNodeState] = useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<PalettePress | null>(null);
  const reshapeRef = useRef<PaletteReshape | null>(null);
  // The lie a drag has asked for and the next render will show.
  const pendingOrientationRef = useRef<OfficePenPaletteOrientation | null>(null);
  const clickBlockedUntilRef = useRef(0);
  const hasColorColumn = Boolean(onPenColor || onPenWidth);
  const horizontal = place.orientation === "horizontal";

  // Where the palette is written comes from its own laid-out size, read
  // after every render and whenever it resizes (lib/pen-palette-motion reads
  // the same frame to glide from shape to shape).
  const geometryRef = useRef({ bounds, place, drag });
  const placeRoot = useCallback(() => {
    const root = rootRef.current;
    const { bounds: room, place: at, drag: dragging } = geometryRef.current;
    if (!root || !room) return;
    const roomX = Math.max(0, room.width - root.offsetWidth - MARGIN * 2);
    const roomY = Math.max(0, room.height - root.offsetHeight - MARGIN * 2);
    const minX = room.left + MARGIN;
    const minY = room.top + MARGIN;
    const x = dragging ? clamp(dragging.px - dragging.gx * root.offsetWidth, minX, minX + roomX) : minX + at.fx * roomX;
    const y = dragging ? clamp(dragging.py - dragging.gy * root.offsetHeight, minY, minY + roomY) : minY + at.fy * roomY;
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
  }, []);
  // Placed again only when what it stands by changed: the host re-renders on
  // every edit (each batch of ink landing), and reading the palette's size
  // then laid the whole document out in the middle of the edit -- a stall
  // that grew with the page's ink. A change of its own size (folded, turned,
  // its tools changed) reaches placeRoot through the ResizeObserver below.
  const placedRef = useRef<{ root: HTMLDivElement | null; bounds: PaletteBounds | null; place: PalettePlace; drag: PaletteDrag | null } | null>(null);
  useLayoutEffect(() => {
    geometryRef.current = { bounds, place, drag };
    const placed = placedRef.current;
    if (placed && placed.root === rootNode && placed.bounds === bounds && placed.place === place && placed.drag === drag) return;
    placedRef.current = { root: rootNode, bounds, place, drag };
    placeRoot();
  });
  // A new shape (folded, opened, turned) glides from the old one, once laid
  // out (every render: a turn and a turn back in one render still settle).
  useLayoutEffect(() => {
    pendingOrientationRef.current = null;
    const pending = reshapeRef.current;
    if (!pending) return;
    reshapeRef.current = null;
    finishPaletteReshape(rootRef.current, pending);
  });

  // Whether more tools sit before or after the scrolled strip (its ends fade).
  const [toolsEdge, setToolsEdge] = useState({ start: false, end: false });
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const measureTools = useCallback(() => {
    const node = toolsRef.current;
    if (!node) return;
    // The strip scrolls along its length: across when the palette lies along an edge.
    const across = node.scrollWidth - node.clientWidth > node.scrollHeight - node.clientHeight;
    const offset = across ? node.scrollLeft : node.scrollTop;
    const visible = across ? node.clientWidth : node.clientHeight;
    const total = across ? node.scrollWidth : node.scrollHeight;
    const start = offset > 1;
    const end = offset + visible < total - 1;
    setToolsEdge((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
  }, []);
  const toolsObserverRef = useRef<ResizeObserver | null>(null);
  const setToolsNode = useCallback(
    (node: HTMLDivElement | null) => {
      toolsObserverRef.current?.disconnect();
      toolsObserverRef.current = null;
      toolsRef.current = node;
      if (!node) return;
      measureTools();
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(measureTools);
        observer.observe(node);
        toolsObserverRef.current = observer;
      }
    },
    [measureTools],
  );

  // The room follows the window (resized, its title bar folded) and the viewport.
  useLayoutEffect(() => {
    if (!host) return;
    const measure = () =>
      setBounds((previous) => {
        const next = paletteBoundsIn(host);
        return previous &&
          previous.left === next.left &&
          previous.top === next.top &&
          previous.width === next.width &&
          previous.height === next.height
          ? previous
          : next;
      });
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(host.element);
    const body = host.fixed ? null : host.element.querySelector<HTMLElement>(":scope > .wm-body");
    if (body) observer?.observe(body);
    const view = host.element.ownerDocument.defaultView;
    view?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      view?.removeEventListener("resize", measure);
    };
  }, [host]);

  const setRootNode = useCallback((node: HTMLDivElement | null) => {
    const previous = rootRef.current;
    rootRef.current = node;
    setRootNodeState(node);
    if (node) {
      playPaletteEntrance(node);
    } else if (previous) {
      // Leaving (back to the ribbon, or the Draw tab left): a picture stays
      // for the ribbon to grow it into itself.
      holdPaletteExit(previous);
    }
  }, []);
  useEffect(() => {
    if (!rootNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(placeRoot);
    observer.observe(rootNode);
    return () => observer.disconnect();
  }, [rootNode, placeRoot]);
  // A lifted or dragged palette keeps the page from scrolling under the
  // press (a touch that began on the tools' strip would scroll it).
  useEffect(() => {
    if (!rootNode) return;
    const onTouchMove = (event: TouchEvent) => {
      const press = pressRef.current;
      if (press && (press.lifted || press.dragging) && event.cancelable) event.preventDefault();
    };
    rootNode.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => rootNode.removeEventListener("touchmove", onTouchMove);
  }, [rootNode]);
  useEffect(
    () => () => {
      for (const timer of pressRef.current?.timers ?? []) window.clearTimeout(timer);
    },
    [],
  );

  const updatePlace = useCallback(
    (patch: Partial<PalettePlace>, persist: boolean) => {
      setPlace((previous) => {
        const next = { ...previous, ...patch };
        if (persist) savePlace(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  /** A change of shape, drawn gliding from the shape the palette has now. */
  const reshape = useCallback(
    (patch: Partial<PalettePlace>, persist: boolean) => {
      // Two changes before one render: the shape it glides from is still the first.
      if (!reshapeRef.current) reshapeRef.current = beginPaletteReshape(rootRef.current);
      if (patch.orientation) pendingOrientationRef.current = patch.orientation;
      updatePlace(patch, persist);
    },
    [updatePlace],
  );

  /** A pointer's place in the room (a window may be zoomed on the canvas). */
  const toRoom = useCallback(
    (clientX: number, clientY: number) => {
      if (!host || host.fixed) return { x: clientX, y: clientY };
      const element = host.element;
      const box = element.getBoundingClientRect();
      const scale = element.offsetWidth > 0 ? box.width / element.offsetWidth || 1 : 1;
      return { x: (clientX - box.left) / scale - element.clientLeft, y: (clientY - box.top) / scale - element.clientTop };
    },
    [host],
  );

  // Back to the pen when an erasing stroke lifts, where the reader asked
  // for it. Any lift on the page counts (a pen, or a finger drawing with
  // touch), not one on the palette or a menu.
  const returnPen = pens.find((pen) => pen.id === selectedPenId) ?? pens[0] ?? null;
  useEffect(() => {
    if (!eraserReturn || tool !== "eraser" || !returnPen) return;
    const onLift = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target as Element | null;
      if (target?.closest?.(`[${PEN_PALETTE_ROOT_ATTRIBUTE}], [role=menu]`)) return;
      // After the eraser's own lift has finished its stroke.
      window.setTimeout(() => onPen(returnPen), 0);
    };
    window.addEventListener("pointerup", onLift, true);
    return () => window.removeEventListener("pointerup", onLift, true);
  }, [eraserReturn, tool, returnPen, onPen]);

  const openPenMenu = (pen: DocumentInkPreset) => {
    // The menu is the picked pen's, as the ribbon's drop-down is.
    if (tool !== "draw" || pen.id !== selectedPenId) onPen(pen);
    setMenuPenId(pen.id);
  };

  const releasePress = (press: PalettePress) => {
    for (const timer of press.timers) window.clearTimeout(timer);
    press.timers.length = 0;
    if (pressRef.current === press) pressRef.current = null;
    setLifted(false);
  };

  const startDrag = (press: PalettePress, event: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    press.dragging = true;
    for (const timer of press.timers) window.clearTimeout(timer);
    press.timers.length = 0;
    setMenuPenId(null);
    setLifted(true);
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      /* a synthetic pointer has no capture */
    }
    // Held where it was taken, so the palette does not jump under the pointer.
    const start = toRoom(press.startX, press.startY);
    const now = toRoom(event.clientX, event.clientY);
    setDrag({
      px: now.x,
      py: now.y,
      gx: root.offsetWidth > 0 ? clamp01((start.x - root.offsetLeft) / root.offsetWidth) : 0.5,
      gy: root.offsetHeight > 0 ? clamp01((start.y - root.offsetTop) / root.offsetHeight) : 0.5,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pressRef.current) return;
    const target = event.target instanceof Element ? event.target : null;
    // A press in a pen's or the eraser's menu reaches here through React's
    // tree (the menu is portalled out of the palette): it is the menu's own.
    // Taken as the palette's, a finger scrolling the menu dragged the palette
    
    if (!target || !ownEvent(event)) return;
    const strip = target?.closest<HTMLElement>(`[${SCROLLER_ATTRIBUTE}]`) ?? null;
    const scrolls =
      strip !== null &&
      (strip.scrollHeight > strip.clientHeight + 1 || strip.scrollWidth > strip.clientWidth + 1);
    const penId = target?.closest<HTMLElement>(`[${PEN_ATTRIBUTE}]`)?.getAttribute(PEN_ATTRIBUTE) ?? null;
    const pen = penId && penMenu && !disabled ? (pens.find((candidate) => candidate.id === penId) ?? null) : null;
    const press: PalettePress = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      scroller: scrolls ? strip : null,
      pen,
      lifted: false,
      dragging: false,
      menuOpened: false,
      timers: [],
    };
    pressRef.current = press;
    press.timers.push(
      window.setTimeout(() => {
        if (pressRef.current !== press || press.dragging) return;
        press.lifted = true;
        setLifted(true);
      }, LIFT_MS),
    );
    if (pen) {
      press.timers.push(
        window.setTimeout(() => {
          if (pressRef.current !== press || press.dragging) return;
          press.menuOpened = true;
          openPenMenu(pen);
        }, PEN_PALETTE_MENU_HOLD_MS),
      );
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (!press.dragging) {
      const dx = event.clientX - press.startX;
      const dy = event.clientY - press.startY;
      if (Math.hypot(dx, dy) <= DRAG_SLOP_PX) return;
      // A quick swipe along the tools scrolls them (the browser's own pan).
      if (!press.lifted && press.scroller && press.pointerType !== "mouse") {
        const along = horizontal ? Math.abs(dx) >= Math.abs(dy) : Math.abs(dy) >= Math.abs(dx);
        if (along) {
          releasePress(press);
          return;
        }
      }
      startDrag(press, event);
      return;
    }
    const at = toRoom(event.clientX, event.clientY);
    if (bounds && !place.folded) {
      const current = pendingOrientationRef.current ?? place.orientation;
      const orientation = penPaletteOrientationAt(bounds, at.x, at.y, current);
      if (orientation !== current) reshape({ orientation }, false);
    }
    setDrag((previous) => (previous ? { ...previous, px: at.x, py: at.y } : previous));
  };

  const finishPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    releasePress(press);
    // A slow tap (lifted, not moved) still taps.
    if (press.dragging || press.menuOpened) {
      clickBlockedUntilRef.current = performance.now() + CLICK_AFTER_HOLD_MS;
    }
    if (!press.dragging) return;
    // Where it was let go, kept as a share of the room (the window may resize).
    const root = rootRef.current;
    if (root && bounds) {
      const roomX = Math.max(0, bounds.width - root.offsetWidth - MARGIN * 2);
      const roomY = Math.max(0, bounds.height - root.offsetHeight - MARGIN * 2);
      updatePlace(
        {
          fx: roomX > 0 ? clamp01((root.offsetLeft - bounds.left - MARGIN) / roomX) : place.fx,
          fy: roomY > 0 ? clamp01((root.offsetTop - bounds.top - MARGIN) / roomY) : place.fy,
        },
        true,
      );
    }
    setDrag(null);
  };

  if (!host || !bounds) return null;
  const selectedPen = pens.find((pen) => pen.id === selectedPenId) ?? pens[0] ?? null;
  const style: CSSProperties = {
    position: host.fixed ? "fixed" : "absolute",
    ...(horizontal
      ? { maxWidth: Math.max(160, bounds.width - MARGIN * 2) }
      : { maxHeight: Math.max(120, bounds.height - MARGIN * 2) }),
  };
  const off = disabled;
  const label = (key: string) => t(key);
  const penColor = selectedPen?.color.toLowerCase() ?? null;
  const penWidth = selectedPen?.widthPt ?? null;
  // The pen menu opens toward the room: away from the edge the palette keeps to.
  const menuSide: "top" | "right" | "bottom" | "left" = horizontal
    ? place.fy > 0.5
      ? "top"
      : "bottom"
    : place.fx > 0.5
      ? "left"
      : "right";
  const menuPen = shownMenuPenId ? (pens.find((pen) => pen.id === shownMenuPenId) ?? null) : null;

  const face = place.folded ? (
    <PaletteButton
      label={label("toolbar.penPaletteExpand")}
      onClick={() => reshape({ folded: false }, true)}
      testId={`${testIdPrefix}-pen-palette-expand`}
      className={styles.foldedFace}
    >
      {selectedPen && tool === "draw" ? (
        <DocumentInkPenGlyph preset={selectedPen} size={0.5} />
      ) : (
        <OfficeSemanticIcon
          semanticId={
            tool === "eraser" ? "draw.eraser.stroke" : tool === "lasso" ? "draw.lasso" : tool === "laser" ? "draw.laser" : tool === "tape" ? "draw.tape" : "draw.select"
          }
          size={20}
        />
      )}
    </PaletteButton>
  ) : (
    <>
      <div className={styles.header}>
        <PaletteButton
          label={label("toolbar.penPaletteShowRibbon")}
          onClick={onShowRibbon}
          testId={`${testIdPrefix}-pen-palette-show-ribbon`}
          className={styles.endButton}
        >
          <OfficeSemanticIcon semanticId="menu.chevron.down" size={16} />
        </PaletteButton>
        <PaletteButton
          label={label("toolbar.penPaletteCollapse")}
          onClick={() => reshape({ folded: true }, true)}
          testId={`${testIdPrefix}-pen-palette-collapse`}
          className={styles.endButton}
        >
          <OfficeSemanticIcon semanticId="nav.chevrons.collapse" size={16} />
        </PaletteButton>
      </div>
      <div className={styles.lanes}>
        {hasColorColumn ? (
          <div className={styles.colors} data-testid={`${testIdPrefix}-pen-palette-colors`}>
            {thicknesses && onPenWidth
              ? DOCUMENT_INK_THICKNESSES.map((thickness) => (
                  <PaletteButton
                    key={thickness.pt}
                    label={`${thickness.mm} mm`}
                    pressed={penWidth !== null && Math.abs(penWidth - thickness.pt) < 0.05}
                    disabled={off || !selectedPen}
                    onClick={() => {
                      onPenWidth(thickness.pt);
                      setThicknesses(false);
                    }}
                    testId={`${testIdPrefix}-pen-palette-width-${thickness.mm}`}
                  >
                    <span
                      className={styles.thicknessDot}
                      style={{ width: Math.min(22, 3 + thickness.mm * 3), height: Math.min(22, 3 + thickness.mm * 3) }}
                    />
                  </PaletteButton>
                ))
              : onPenColor
                ? OFFICE_PEN_PALETTE_COLORS.map((color) => (
                    <PaletteButton
                      key={color}
                      label={color}
                      pressed={penColor === color}
                      disabled={off || !selectedPen}
                      onClick={() => onPenColor(color)}
                      testId={`${testIdPrefix}-pen-palette-color-${color.slice(1)}`}
                      className={styles.swatchButton}
                    >
                      <span
                        className={styles.swatch}
                        data-pale={color === "#ffffff" ? "true" : undefined}
                        style={{ background: color, ["--swatch" as string]: color } as CSSProperties}
                      />
                    </PaletteButton>
                  ))
                : null}
            {onPenWidth ? (
              <PaletteButton
                label={label("toolbar.drawInkWidth")}
                pressed={thicknesses}
                disabled={off || !selectedPen}
                onClick={() => setThicknesses((open) => !open)}
                testId={`${testIdPrefix}-pen-palette-thickness`}
                className={styles.thicknessToggle}
              >
                <span
                  className={styles.thicknessDot}
                  style={{
                    width: Math.min(20, 4 + (penWidth ?? 1.4) * 1.1),
                    height: Math.min(20, 4 + (penWidth ?? 1.4) * 1.1),
                    background: selectedPen?.color ?? undefined,
                  }}
                />
              </PaletteButton>
            ) : null}
          </div>
        ) : null}
        {
}
        <div className={styles.tools} data-free={hasColorColumn ? undefined : "true"}>
          <div
            ref={setToolsNode}
            className={styles.toolsScroller}
            data-testid={`${testIdPrefix}-pen-palette-tools`}
            data-more-start={toolsEdge.start ? "true" : undefined}
            data-more-end={toolsEdge.end ? "true" : undefined}
            {...{ [SCROLLER_ATTRIBUTE]: "" }}
            onScroll={measureTools}
          >
            {pens.map((pen) => (
              <PaletteButton
                key={pen.id}
                label={label(
                  pen.tool === "highlighter"
                    ? "toolbar.drawHighlighter"
                    : pen.tool === "pencil"
                      ? "toolbar.drawPencil"
                      : "toolbar.drawPen",
                )}
                pressed={tool === "draw" && pen.id === selectedPenId}
                disabled={off}
                // The picked pen tapped again opens its colours and widths,
                // as a note-taking app's pen does; a long press opens it too.
                onClick={() => (tool === "draw" && pen.id === selectedPenId && penMenu ? setMenuPenId(pen.id) : onPen(pen))}
                testId={`${testIdPrefix}-pen-palette-pen-${pen.id}`}
                className={styles.penButton}
                penId={pen.id}
                buttonRef={penRef ? (element) => penRef(pen.id, element) : undefined}
              >
                <DocumentInkPenGlyph preset={pen} size={0.5} />
                {menuPen?.id === pen.id && penMenu ? (
                  <DropdownMenu
                    open={menuPenId === pen.id}
                    modal={false}
                    onOpenChange={(open) => {
                      if (!open) setMenuPenId(null);
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <span className={styles.menuAnchor} aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <OfficeInkPenMenuContent
                      pen={menuPen}
                      penCount={pens.length}
                      testIdPrefix={`${testIdPrefix}-pen-palette-pen`}
                      effects={penMenu.effects}
                      onUpdate={penMenu.onUpdate}
                      onRemove={penMenu.onRemove}
                      onMoreColors={penMenu.onMoreColors}
                      side={menuSide}
                      align="center"
                    />
                  </DropdownMenu>
                ) : null}
              </PaletteButton>
            ))}
            <span className={styles.divider} aria-hidden="true" />
            <PaletteButton
              label={label("toolbar.drawEraser")}
              pressed={tool === "eraser"}
              disabled={off || inkMissing}
              // The picked eraser tapped again opens its kinds, as a
              // note-taking app's eraser does.
              onClick={() => (tool === "eraser" && eraser ? setEraserMenuOpen(true) : onEraser())}
              testId={`${testIdPrefix}-pen-palette-eraser`}
            >
              <OfficeSemanticIcon semanticId="draw.eraser.stroke" size={20} />
              {eraserMenuShown && eraser ? (
                <DropdownMenu open={eraserMenuOpen} modal={false} onOpenChange={setEraserMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <span className={styles.menuAnchor} aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side={menuSide}
                    align="center"
                    sideOffset={8}
                    collisionPadding={8}
                    data-testid={`${testIdPrefix}-pen-palette-eraser-menu`}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <OfficeInkEraserMenuItems
                      value={eraser.value}
                      testIdPrefix={`${testIdPrefix}-pen-palette-eraser`}
                      onChoose={eraser.onChoose}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={eraserReturn}
                      data-testid={`${testIdPrefix}-pen-palette-eraser-return`}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(on) => {
                        setEraserReturn(on);
                        saveEraserReturn(on);
                      }}
                    >
                      {label("toolbar.drawEraserAutoReturn")}
                    </DropdownMenuCheckboxItem>

                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </PaletteButton>
            {onLasso ? (
              <PaletteButton
                label={label("toolbar.drawLasso")}
                pressed={tool === "lasso"}
                disabled={off || inkMissing}
                onClick={onLasso}
                testId={`${testIdPrefix}-pen-palette-lasso`}
              >
                <OfficeSemanticIcon semanticId="draw.lasso" size={20} />
              </PaletteButton>
            ) : null}
            {onLaser ? (
              <PaletteButton
                label={label("toolbar.drawLaser")}
                pressed={tool === "laser"}
                disabled={off}
                onClick={onLaser}
                testId={`${testIdPrefix}-pen-palette-laser`}
              >
                <OfficeSemanticIcon semanticId="draw.laser" size={20} />
              </PaletteButton>
            ) : null}
            {onTape ? (
              <PaletteButton
                label={label("toolbar.drawTape")}
                pressed={tool === "tape"}
                disabled={off}
                onClick={onTape}
                testId={`${testIdPrefix}-pen-palette-tape`}
              >
                <OfficeSemanticIcon semanticId="draw.tape" size={20} />
              </PaletteButton>
            ) : null}
            <PaletteButton
              label={label("toolbar.select")}
              pressed={tool === "select" || tool === null}
              onClick={onSelect}
              testId={`${testIdPrefix}-pen-palette-select`}
            >
              <OfficeSemanticIcon semanticId="draw.select" size={20} />
            </PaletteButton>
            {ruler ? (
              <PaletteButton
                label={label("toolbar.ruler")}
                pressed={Boolean(ruler.active)}
                disabled={off || ruler.disabled}
                onClick={ruler.run}
                testId={`${testIdPrefix}-pen-palette-ruler`}
              >
                <OfficeSemanticIcon semanticId="view.ruler" size={20} />
              </PaletteButton>
            ) : null}
            {/* Zoom writing (OfficeInkZoomWindow): write large in a panel, small on the page. */}
            <PaletteButton
              label={label("toolbar.drawZoomWindow")}
              pressed={zoomWindowOpen}
              disabled={off}
              onClick={() => setZoomWindowOpen((open) => !open)}
              testId={`${testIdPrefix}-pen-palette-zoom-window`}
            >
              <OfficeSemanticIcon semanticId="view.zoom" size={20} />
            </PaletteButton>
            {inkToShape || inkToText || inkToMath ? <span className={styles.divider} aria-hidden="true" /> : null}
            {inkToShape ? (
              <PaletteButton
                label={label("toolbar.drawInkToShape")}
                pressed={Boolean(inkToShape.active)}
                disabled={off || inkToShape.disabled}
                onClick={inkToShape.run}
                testId={`${testIdPrefix}-pen-palette-ink-to-shape`}
              >
                <OfficeSemanticIcon semanticId="ink.toShape" size={20} />
              </PaletteButton>
            ) : null}
            {inkToText ? (
              <PaletteButton
                label={label("toolbar.drawInkToText")}
                pressed={Boolean(inkToText.active)}
                disabled={off || inkToText.disabled}
                onClick={inkToText.run}
                testId={`${testIdPrefix}-pen-palette-ink-to-text`}
              >
                <OfficeSemanticIcon semanticId="ink.toText" size={20} />
              </PaletteButton>
            ) : null}
            {inkToMath ? (
              <PaletteButton
                label={label("toolbar.drawInkToMath")}
                pressed={Boolean(inkToMath.active)}
                disabled={off || inkToMath.disabled}
                onClick={inkToMath.run}
                testId={`${testIdPrefix}-pen-palette-ink-to-math`}
              >
                <OfficeSemanticIcon semanticId="ink.toMath" size={20} />
              </PaletteButton>
            ) : null}
            <span className={styles.divider} aria-hidden="true" />
            <PaletteButton
              label={label("toolbar.drawTouch")}
              pressed={drawWithTouch}
              disabled={off}
              onClick={() => saveDrawWithTouch(!drawWithTouch)}
              testId={`${testIdPrefix}-pen-palette-touch`}
            >
              <OfficeSemanticIcon semanticId="edit.hand" size={20} />
            </PaletteButton>
          </div>
        </div>
      </div>
      {undo || redo ? (
        <div className={styles.footer}>
          {undo ? (
            <PaletteButton
              label={label("toolbar.undo")}
              disabled={undo.disabled}
              onClick={undo.run}
              testId={`${testIdPrefix}-pen-palette-undo`}
              className={styles.endButton}
            >
              <OfficeSemanticIcon semanticId="edit.undo" size={18} />
            </PaletteButton>
          ) : null}
          {redo ? (
            <PaletteButton
              label={label("toolbar.redo")}
              disabled={redo.disabled}
              onClick={redo.run}
              testId={`${testIdPrefix}-pen-palette-redo`}
              className={styles.endButton}
            >
              <OfficeSemanticIcon semanticId="edit.redo" size={18} />
            </PaletteButton>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const zoomPen = selectedPen;
  return (
    <>
      {createPortal(
    <div
      ref={setRootNode}
      className={styles.palette}
      style={style}
      data-testid={`${testIdPrefix}-pen-palette`}
      data-folded={place.folded ? "true" : undefined}
      data-orientation={place.orientation}
      data-lifted={lifted ? "true" : undefined}
      data-dragging={drag ? "true" : undefined}
      {...{ [PEN_PALETTE_ROOT_ATTRIBUTE]: "" }}
      role="toolbar"
      aria-label={label("toolbar.penPalette")}
      aria-orientation={place.folded ? undefined : place.orientation}
      title={off ? disabledReason : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPress}
      onPointerCancel={finishPress}
      onClickCapture={(event) => {
        if (!ownEvent(event)) return;
        if (performance.now() < clickBlockedUntilRef.current) {
          clickBlockedUntilRef.current = 0;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onContextMenu={(event) => {
        if (ownEvent(event)) event.preventDefault();
      }}
    >
      <div className={styles.backdrop} aria-hidden="true" {...{ [PEN_PALETTE_PART_ATTRIBUTE]: "backdrop" }} />
      <div className={styles.body} {...{ [PEN_PALETTE_PART_ATTRIBUTE]: "body" }}>
        {face}
      </div>
    </div>,
        host.element,
      )}
      {zoomWindowOpen && zoomPen ? (
        <OfficeInkZoomWindow
          host={host.element}
          color={zoomPen.color}
          widthPx={ptToPx(zoomPen.widthPt)}
          testIdPrefix={testIdPrefix}
          labels={{
            title: label("toolbar.drawZoomWindow"),
            back: label("toolbar.drawZoomWindowBack"),
            forward: label("toolbar.drawZoomWindowForward"),
            nextLine: label("toolbar.drawZoomWindowNextLine"),
            zoomIn: label("pdfViewer.zoomIn"),
            zoomOut: label("pdfViewer.zoomOut"),
            close: label("toolbar.close"),
          }}
          onWrite={() => {
            setMenuPenId(null);
            setEraserMenuOpen(false);
          }}
          onClose={() => setZoomWindowOpen(false)}
        />
      ) : null}
    </>
  );
}
