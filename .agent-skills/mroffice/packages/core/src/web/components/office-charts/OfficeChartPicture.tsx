"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A chart drawn by the server's chart engine, in any editor.
 *
 * The planner and the drawing run on the server (engine `charts`); this
 * component asks for the picture of a chart's model at its size
 * (`lib/office-charts/chart-picture-client.ts`) and shows it as inline SVG.
 * The deck's static chart picture is where it started; Docs and the
 * worksheet draw with it too. Its rules:
 *
 * - A chart never disappears while a request is in flight or fails: the
 *   picture of this chart at another size (or the one drawn before an edit)
 *   stands in at its own size, never stretched; with no picture yet the
 *   host's fallback (its title) shows.
 * - During a resize gesture (`live`) the picture follows the frame: the last
 *   one is stretched to it for the moment, and the size under the pointer is
 *   asked for one request at a time (each answer stands in until the next),
 *   so the chart is redrawn as it is dragged, as Excel's is. A stand-in shown
 *   at its own size inside a frame that kept growing read as the chart
 *   twitching, then jumping at the release.
 * - A picture this browser stored on an earlier visit shows while the server
 *   answers, and stays when the server cannot be reached.
 * - A drawing of NEW content that fails keeps the old picture faded with a
 *   notice: "needs a connection" when offline, else that it is not current.
 * - A click is hit-tested on the picture's marks (`officeChartSvgHitAt`) and
 *   named with the series the answer lists; nothing is planned in the browser.
 */

import { useTranslations } from "../../../host/next-intl";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { EngineUnavailableError, isEngineAbort } from "../../lib/engine-host/client";
import type { ChartRenderPicture, ChartRenderRequest, ChartTextPart } from "../../lib/engine-host/charts-types";
import {
  officeDrawingVisibleResizeHandles,
  OFFICE_DRAWING_RESIZE_HANDLES,
} from "../office-ribbon/OfficeDrawingSelection";
import {
  dispatchOfficeChartHit,
  dispatchOfficeChartPlace,
  officeChartPicturePartAt,
  officeChartSvgHitAt,
  type OfficeChartPicturePart,
} from "../../lib/office-charts/chart-hit";
import {
  officeChartElementTip,
  officeChartElementTipKey,
  officeChartLegendListsPoints,
  type OfficeChartElementTip,
  type OfficeChartTipTarget,
} from "../../lib/office-charts/chart-element-tips";
import { postChartPicture } from "../../lib/office-charts/chart-picture-board";
import {
  ChartPictureRefusedError,
  chartPictureKey,
  requestChartPicture,
  storedChartPicture,
} from "../../lib/office-charts/chart-picture-client";
import { namespaceChartPictureIds, sanitizeChartPicture } from "../../lib/office-charts/chart-picture-sanitize";
import { endOfficeChartTextEdit, useOfficeChartTextEdit } from "../../lib/office-charts/chart-text-edit-store";
import { useOfficeChartSelectionDetail } from "../../lib/office-charts/chart-selection-store";
import { useInnerHtml } from "../../lib/stable-inner-html";
import { OfficeChartTextLayer } from "./OfficeChartTextLayer";
import selectionStyles from "./OfficeChartSelection.module.css";

/** A host's last step on a sanitized picture (the deck's native 3-D pie raster). */
export type OfficeChartPictureFinish = (
  markup: string,
  picture: ChartRenderPicture,
  signal: AbortSignal,
) => Promise<string>;

interface Shown {
  key: string;
  contentKey: string;
  markup: string;
  picture: ChartRenderPicture;
  /** From the browser's store, not yet confirmed by the server. */
  stored?: boolean;
}

// The same picture serves every surface that shows the chart (the stage, a
// rail tile, the sorter, the slide show): finished markup by request.
const finished = new Map<string, { markup: string; picture: ChartRenderPicture }>();
const MAX_FINISHED = 48;
const MAX_FINISHED_CHARS = 16_000_000;
let finishedChars = 0;

function keep(key: string, markup: string, picture: ChartRenderPicture): void {
  const cost = key.length + markup.length;
  if (cost > MAX_FINISHED_CHARS) return;
  const existing = finished.get(key);
  if (existing) {
    finishedChars -= key.length + existing.markup.length;
    finished.delete(key);
  }
  while (finished.size >= MAX_FINISHED || finishedChars + cost > MAX_FINISHED_CHARS) {
    const oldest = finished.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    finishedChars -= oldest.length + finished.get(oldest)!.markup.length;
    finished.delete(oldest);
  }
  finished.set(key, { markup, picture });
  finishedChars += cost;
}

/** Tests: forget the finished pictures (a page reload). */
export function resetOfficeChartPicturesForTests(): void {
  finished.clear();
  finishedChars = 0;
}

/** `reason`: why it failed, as the engine or its refusal named it (a print
 * that drops a chart says which, ``data-chart-render-error``). */
type Failure = { key: string; offline: boolean; reason?: string };

export interface OfficeChartPictureProps {
  /** The part the host's Current Selection names (a click on the chart's
   * title, legend, an axis, its labels or the data labels): drawn with the
   * selection frame Office draws around a selected chart element. */
  selectedPart?: OfficeChartPicturePart | null;
  /** The chart at its size (`width` / `height` are the picture's px). */
  request: ChartRenderRequest;
  /** The chart without its size: a picture with the same content key stands
   * in (unstretched) while another size is drawn. */
  contentKey: string;
  /** A resize gesture is under way: ask nothing, keep the last picture. */
  live?: boolean;
  /** The `live` size is a frame being dragged (not an off-screen chart):
   * the picture follows it (see the module notes). */
  following?: boolean;
  label: string;
  testId?: string;
  noticeTestId?: string;
  /** Extra attributes for the picture element (a host's own markers). */
  pictureAttributes?: Record<string, string>;
  style?: CSSProperties;
  finish?: OfficeChartPictureFinish;
  /** Every picture shown (the host reads series colours, GL need, ...). */
  onPicture?: (picture: ChartRenderPicture) => void;
  /** The server could not draw this request (offline, refused, failed). */
  onError?: (error: unknown) => void;
  /** Shown while no picture of the chart exists yet (the host's title). */
  children?: ReactNode;
  /**
   * Drawn over the picture (and over the stand-in before it), under the
   * selected element's frames: the chart area's frame line
   * (`OfficeChartAreaOutline`).
   */
  overlay?: ReactNode;
  /** Hovering a point shows its tooltip (the request must ask for `tips`):
   * the words the engine answered, laid out here, never formatted here. */
  tooltips?: boolean;
  /** A right click on a plotted point reports it too (`context`), so the
   * host can open that element's shortcut menu, as Office does. */
  contextMenuHits?: boolean;
  /**
   * The selected element may be dragged (or sized) by hand: the title, an
   * axis title, the legend, the plot area. The drop is reported to the host
   * (`OFFICE_CHART_PLACE_EVENT`), which keeps it as Office's `c:manualLayout`.
   * Without it the frame only shows the selection.
   */
  placeable?: boolean;
  /** The host's key for this chart (its Current Selection's key): a chart
   * text the host begins to edit under it (`beginOfficeChartTextEdit`) is
   * typed here, in the picture's own drawing of that text. Absent: the
   * chart's texts are shown, never typed in (a rail tile, a preview). */
  textEditKey?: string | null;
  /**
   * Whether the host has this chart selected as an object (Docs' node
   * selection, the worksheet's or the deck's selected chart). Office's first
   * click on a chart selects the chart; once it is selected a click selects
   * the element under the pointer (its title, legend, a series, ...). A
   * double-click selects and opens either way. Absent: every click selects
   * the element under it.
   */
  chartSelected?: boolean;
  /**
   * Office's chart tips ("Show chart element names on hover"): the name of
   * the element under the pointer, and a point's series, name and value,
   * shown by the pointer. A host that passes it (true or false) has the
   * point words asked for once, so turning the tips on asks nothing again.
   */
  elementTips?: boolean;
  /** The chart's family, for the names of its axes and legend entries. */
  chartType?: string;
}

/** What a point of the picture falls on. */
type PictureTarget =
  | {
      kind: "part";
      part: OfficeChartPicturePart;
      legendEntry?: number;
      label?: { series: number; point: number; mark: string };
    }
  | { kind: "point"; seriesIndex: number; dataIndex: number | null }
  | { kind: "plot" }
  | { kind: "chart" };

interface Tip {
  x: number;
  y: number;
  /** The picture frame's own size (the tip turns back from its far edges). */
  w: number;
  h: number;
  key: string;
  tip: OfficeChartElementTip;
}

/** A gesture on an element's frame: the frame stays mounted until release. */
interface FrameDrag {
  key: string;
  part: OfficeChartPicturePart;
  box: { x: number; y: number; width: number; height: number };
  label?: { series: number; point: number };
}

/** A pointer at rest this long over an element shows its tip (ms). */
const TIP_DELAY_MS = 350;

export function OfficeChartPicture({
  selectedPart = null,
  contentKey,
  live = false,
  following = false,
  label,
  testId = "office-chart-picture",
  noticeTestId = `${testId}-stale-notice`,
  pictureAttributes,
  style,
  finish,
  onPicture,
  onError,
  children,
  overlay,
  tooltips = false,
  contextMenuHits = false,
  textEditKey = null,
  placeable = false,
  chartSelected,
  elementTips,
  chartType,
  request: hostRequest,
}: OfficeChartPictureProps) {
  const t = useTranslations("console-notebooks");
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // The chart's texts are drawn here, from the frames the engine answers
  // (`textLayer`): the picture keeps their place, not their words. A host
  // that may show chart tips has each point's words asked for with it.
  const asksTips = tooltips || elementTips !== undefined;
  const request = useMemo(
    () => ({ ...hostRequest, textLayer: true, ...(asksTips ? { tips: true } : {}) }),
    [hostRequest, asksTips],
  );
  const family =
    chartType ?? (typeof hostRequest.attrs?.chartType === "string" ? hostRequest.attrs.chartType : "column");
  const key = useMemo(() => chartPictureKey(request), [request]);
  const textEdit = useOfficeChartTextEdit(textEditKey);
  // What inside the selected element is selected: a legend entry, labels.
  const selectionDetail = useOfficeChartSelectionDetail(textEditKey);
  const [shown, setShown] = useState<Shown>();
  const [failure, setFailure] = useState<Failure>();
  const latest = useRef({ request, finish, onPicture, onError });
  latest.current = { request, finish, onPicture, onError };

  const remembered = finished.get(key);
  const exact: Shown | undefined =
    shown?.key === key ? shown : remembered ? { key, contentKey, ...remembered } : undefined;
  const failed = failure?.key === key;
  // While the server draws the chart as it now is, the picture it had stays
  // up (Office keeps the old chart on screen until the new one is ready; a
  // blank frame for the seconds a busy server takes read as "my edit was
  // lost"). A picture of other content that stands in is marked pending.
  const standIn = !exact && shown ? shown : undefined;
  const display = exact ?? standIn;
  const pendingData = !failed && !exact && standIn !== undefined && standIn.contentKey !== contentKey;
  // The drawing of this chart as it now is failed and what stands in is a
  // picture of other content: it stays up, marked as not current.
  const staleData = failed && !exact && standIn !== undefined && standIn.contentKey !== contentKey;
  const offlineChange = staleData && failure?.offline === true;
  // A stand-in shown for more than a moment is marked as the chart before
  // the change: its bars faded and "Updating chart" over it, so a picture of
  // old values beside new figures does not read as the result (user audit
  // S-022 saw 40/30 bars under a table and labels already at 80/30).
  const [pendingShown, setPendingShown] = useState(false);
  useEffect(() => {
    if (!pendingData) {
      setPendingShown(false);
      return;
    }
    const timer = setTimeout(() => setPendingShown(true), 500);
    return () => clearTimeout(timer);
  }, [pendingData, contentKey]);
  const pendingMarked = pendingData && pendingShown;

  const onPictureRef = useRef<ChartRenderPicture | null>(null);
  useEffect(() => {
    if (!display || onPictureRef.current === display.picture) return;
    onPictureRef.current = display.picture;
    if (display.contentKey === contentKey) postChartPicture(contentKey, display.picture);
    latest.current.onPicture?.(display.picture);
  });

  // While the frame is dragged: one drawing in flight at a time, always of
  // the newest size; never aborted by the next frame (it would never land).
  const livePump = useRef<{ busy: boolean; wanted: string | null }>({ busy: false, wanted: null });
  useEffect(() => {
    if (!live || !following) {
      livePump.current.wanted = null;
      return;
    }
    const cached = finished.get(key);
    if (cached) {
      setShown({ key, contentKey, ...cached });
      return;
    }
    const pump = livePump.current;
    pump.wanted = key;
    const askNewest = () => {
      if (pump.busy || pump.wanted === null) return;
      const askedKey = pump.wanted;
      const { request: asked, finish: last } = latest.current;
      if (chartPictureKey(asked) !== askedKey) return;
      pump.busy = true;
      void requestChartPicture(asked)
        .then(async (picture) => {
          let markup = sanitizeChartPicture(picture.svg, picture.width, picture.height);
          if (last) markup = await last(markup, picture, new AbortController().signal);
          keep(askedKey, markup, picture);
          setShown({ key: askedKey, contentKey, markup, picture });
        })
        .catch(() => {})
        .finally(() => {
          pump.busy = false;
          if (pump.wanted !== null && pump.wanted !== askedKey) askNewest();
        });
    };
    askNewest();
  }, [key, contentKey, live, following]);

  useEffect(() => {
    if (live) return;
    const cached = finished.get(key);
    if (cached) {
      setShown({ key, contentKey, ...cached });
      return;
    }
    let disposed = false;
    let answered = false;
    const controller = new AbortController();
    const { request: asked, finish: last } = latest.current;
    const prepare = async (picture: ChartRenderPicture) => {
      let markup = sanitizeChartPicture(picture.svg, picture.width, picture.height);
      if (last) markup = await last(markup, picture, controller.signal);
      return markup;
    };
    // An earlier visit's picture of exactly this request, while the server answers.
    void storedChartPicture(asked)
      .then(async (picture) => {
        if (!picture || answered || disposed) return;
        const markup = await prepare(picture);
        if (!answered && !disposed) setShown({ key, contentKey, markup, picture, stored: true });
      })
      .catch(() => {});
    void requestChartPicture(asked, { signal: controller.signal })
      .then(async (picture) => {
        const markup = await prepare(picture);
        answered = true;
        keep(key, markup, picture);
        if (!disposed) setShown({ key, contentKey, markup, picture });
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted || isEngineAbort(error)) return;
        // A stored picture of this exact request stays up as the answer.
        setFailure({
          key,
          offline: error instanceof EngineUnavailableError && error.reason === "offline",
          reason: error instanceof ChartPictureRefusedError ? error.code
            : error instanceof EngineUnavailableError ? [error.reason, error.status, error.code].filter(Boolean).join(":")
              : error instanceof Error ? error.name : "unknown",
        });
        latest.current.onError?.(error);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [key, contentKey, live]);

  const markup = useMemo(
    () => (display ? namespaceChartPictureIds(display.markup, instanceId) : undefined),
    [display, instanceId],
  );
  // Parsed again only when the picture's markup changes (React compares the
  // wrapper, not the string): every selection change re-rendered this frame
  // and re-parsed the whole SVG.
  const pictureHtml = useInnerHtml(markup);

  /**
   * What a point of the screen falls on in the picture shown: a marked part
   * (the title, an axis title or its labels, the legend and the entry in it,
   * the data labels and the label in them), a plotted point, the plot area
   * on no series, or the chart area. `context`: a right click, which keeps
   * naming the plotted point it lands on.
   */
  const pictureTargetAt = (
    root: HTMLDivElement,
    clientX: number,
    clientY: number,
    context = false,
  ): PictureTarget | null => {
    if (!display || display.contentKey !== contentKey) return null;
    const svg = root.querySelector("svg:not([data-chart-area-outline])");
    if (!(svg instanceof SVGSVGElement)) return null;
    // In the picture's own pixels (a zoom or a scaled slide between).
    const box = root.getBoundingClientRect();
    const pw = display.picture.width || request.width;
    const ph = display.picture.height || request.height;
    const px = box.width > 0 ? ((clientX - box.left) / box.width) * pw : -1;
    const py = box.height > 0 ? ((clientY - box.top) / box.height) * ph : -1;
    if (!context) {
      const part = officeChartPicturePartAt(root, clientX, clientY);
      if (part) {
        const inside = (b: { x: number; y: number; width: number; height: number }) =>
          px >= b.x - 2 && px <= b.x + b.width + 2 && py >= b.y - 2 && py <= b.y + b.height + 2;
        const entry = part === "legend" ? display.picture.legendEntries?.find((item) => inside(item.box)) : undefined;
        const label = part === "dataLabels" ? display.picture.labels?.find((item) => inside(item.box)) : undefined;
        return {
          kind: "part",
          part,
          ...(entry ? { legendEntry: entry.index } : {}),
          ...(label ? { label: { series: label.series, point: label.point, mark: label.mark } } : {}),
        };
      }
    }
    const at = officeChartSvgHitAt(svg, clientX, clientY, { plotOnly: context });
    if (at) return { kind: "point", ...at };
    const plot = display.picture.parts.plot;
    if (plot && px >= plot.x && px <= plot.x + plot.width && py >= plot.y && py <= plot.y + plot.height)
      return { kind: "plot" };
    return px >= 0 && px <= pw && py >= 0 && py <= ph ? { kind: "chart" } : null;
  };

  const reportChartHitAt = (
    root: HTMLDivElement,
    clientX: number,
    clientY: number,
    open: boolean,
    context = false,
  ) => {
    const target = pictureTargetAt(root, clientX, clientY, context);
    if (!target || !display) return;
    // A click on a marked part (the title, an axis title or its labels, the
    // legend, the data labels) selects that element, as Office's click does;
    // a right click keeps naming the plotted point it lands on.
    if (target.kind === "part") {
      const { part, legendEntry, label } = target;
      // A click on what is already selected: Office's second click, which
      // puts a text (a title, one data label) into editing at that point.
      const again = label
        ? selectionDetail?.labels?.series === label.series && selectionDetail.labels.point === label.point
        : part === selectedPart;
      dispatchOfficeChartHit(
        root,
        {
          seriesName: "",
          dataIndex: null,
          part,
          ...(legendEntry !== undefined ? { legendEntry } : {}),
          ...(label ? { label: { series: label.series, point: label.point } } : {}),
        },
        open,
        false,
        { at: { clientX, clientY }, again },
      );
      return;
    }
    if (target.kind === "plot") {
      // Inside the plot area, on no series: the plot area (Office's click
      // there selects it).
      if (!context)
        dispatchOfficeChartHit(root, { seriesName: "", dataIndex: null, part: "plot" }, open, false, {
          at: { clientX, clientY },
          again: selectedPart === "plot",
        });
      return;
    }
    if (target.kind !== "point") return;
    const name = display.picture.series[target.seriesIndex]?.name;
    if (typeof name !== "string") return;
    dispatchOfficeChartHit(
      root,
      {
        seriesName: name,
        dataIndex: target.dataIndex,
        plotted: { series: target.seriesIndex, point: target.dataIndex },
      },
      open,
      context,
    );
  };

  // Office's clicks on a chart: the first selects the chart, the next one
  // the element under the pointer. Whether the host had the chart selected
  // is read when the press begins (the press itself selects it).
  const chartSelectedRef = useRef(chartSelected);
  chartSelectedRef.current = chartSelected;
  const pressSelectedRef = useRef(true);
  const notePress = () => {
    pressSelectedRef.current = chartSelectedRef.current !== false;
  };
  const reportChartHit = (event: ReactMouseEvent<HTMLDivElement>, open: boolean, context = false) => {
    if (!open && !context && !pressSelectedRef.current) return;
    reportChartHitAt(event.currentTarget, event.clientX, event.clientY, open, context);
  };

  // A host that drags its object by capturing the pointer (the deck's slide
  // objects) turns the press's click into a click on the object's own frame:
  // the picture never hears it, though its double-click still arrives, so a
  // second click on a selected chart could not move Current Selection (an
  // open Format pane stayed on the old element). A press that began on the
  // picture and ended, unmoved, as a click elsewhere is read here as the
  // picture's click.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reportAtRef = useRef(reportChartHitAt);
  reportAtRef.current = reportChartHitAt;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let press: { x: number; y: number; at: number; selected: boolean } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      press =
        event.button === 0 && event.target instanceof Node && root.contains(event.target)
          ? { x: event.clientX, y: event.clientY, at: event.timeStamp, selected: chartSelectedRef.current !== false }
          : null;
    };
    const onClick = (event: MouseEvent) => {
      const pressed = press;
      press = null;
      // The picture's own click handler has it; anything else was not a
      // click on the picture.
      if (!pressed || (event.target instanceof Node && root.contains(event.target))) return;
      if (
        Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4 ||
        event.timeStamp - pressed.at > 1000 ||
        !pressed.selected
      )
        return;
      reportAtRef.current(root, event.clientX, event.clientY, false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // A selected series wears Office's selection handles on every one of its
  // points, a selected point on that point alone: the corners of each drawn
  // bar or slice box, or the centre of a marker, read off the picture's own
  // marked shapes (as fractions of the picture, so a zoom keeps them on).
  const [pointMarks, setPointMarks] = useState<readonly { x: number; y: number }[]>([]);
  const pointsKey = selectionDetail?.points
    ? `${selectionDetail.points.series}:${selectionDetail.points.point ?? ""}`
    : "";
  useLayoutEffect(() => {
    const root = rootRef.current;
    const svg = root?.querySelector("svg:not([data-chart-area-outline])");
    const points = selectionDetail?.points;
    if (!root || !(svg instanceof SVGSVGElement) || !points || !markup) {
      setPointMarks((current) => (current.length ? [] : current));
      return;
    }
    const box = root.getBoundingClientRect();
    if (!(box.width > 0) || !(box.height > 0)) return;
    const marks: { x: number; y: number }[] = [];
    for (const element of Array.from(svg.querySelectorAll(`[ecmeta_series_index="${points.series}"]`))) {
      if (element.hasAttribute("ecmeta_part")) continue;
      const data = element.getAttribute("ecmeta_data_index");
      if (data === null || (points.point !== undefined && Number(data) !== points.point)) continue;
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 || rect.height > 0)) continue;
      const fx = (x: number) => (x - box.left) / box.width;
      const fy = (y: number) => (y - box.top) / box.height;
      // A marker or a dot: one handle at its centre; a bar or a slice:
      // one at each corner of its box.
      if (rect.width < 12 && rect.height < 12) {
        marks.push({ x: fx(rect.left + rect.width / 2), y: fy(rect.top + rect.height / 2) });
      } else {
        for (const [x, y] of [
          [rect.left, rect.top],
          [rect.right, rect.top],
          [rect.left, rect.bottom],
          [rect.right, rect.bottom],
        ] as const)
          marks.push({ x: fx(x), y: fy(y) });
      }
      if (marks.length > 400) break;
    }
    setPointMarks(marks);
    // `pointsKey` names the selection; `markup` is the picture drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, markup]);

  // Office's chart tips: the element under a pointer at rest is named by
  // it (a point with its value), hit-tested once per frame while it moves.
  const tipsOn = elementTips ?? tooltips;
  const namesOn = elementTips === true;
  const [tip, setTip] = useState<Tip | null>(null);
  const tipShown = useRef<Tip | null>(null);
  tipShown.current = tip;
  const tipFrame = useRef<number | null>(null);
  const tipTimer = useRef<number | null>(null);
  const tipPending = useRef("");
  const dragging = useRef(false);
  const stopTipTimer = () => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = null;
    tipPending.current = "";
  };
  useEffect(
    () => () => {
      if (tipFrame.current !== null) cancelAnimationFrame(tipFrame.current);
      if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    },
    [],
  );
  const hideTip = () => {
    stopTipTimer();
    if (tipFrame.current !== null) cancelAnimationFrame(tipFrame.current);
    tipFrame.current = null;
    if (tipShown.current) setTip(null);
  };
  useEffect(() => {
    if (!tipsOn) hideTip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipsOn]);
  /** The tip a target earns, in the picture shown. */
  const tipOf = (target: PictureTarget): OfficeChartElementTip | null => {
    if (!display) return null;
    const picture = display.picture;
    let found: OfficeChartTipTarget;
    if (target.kind === "point") {
      const series = picture.series[target.seriesIndex]?.name;
      if (typeof series !== "string") return null;
      const words = target.dataIndex !== null ? picture.tips?.[target.seriesIndex]?.points[target.dataIndex] : null;
      found = { point: { series, ...(words ? { name: words.name, value: words.value } : {}) } };
      // A host showing point values alone names no series without its point.
      if (!namesOn && !words) return null;
    } else if (!namesOn) {
      return null;
    } else if (target.kind === "part") {
      if (target.part === "legend" && target.legendEntry !== undefined) {
        const name = officeChartLegendListsPoints(family)
          ? picture.tips?.[0]?.points[target.legendEntry]?.name
          : picture.series[target.legendEntry]?.name;
        found = { part: "legend", ...(typeof name === "string" ? { legendEntry: name } : {}) };
      } else if (target.part === "dataLabels") {
        const drawn = Number(target.label?.mark.split(":")[0]);
        const name = Number.isInteger(drawn) ? picture.series[drawn]?.name : undefined;
        found = { part: "dataLabels", ...(typeof name === "string" ? { labelSeries: name } : {}) };
      } else {
        found = { part: target.part };
      }
    } else {
      found = { part: target.kind === "plot" ? "plot" : "chartArea" };
    }
    return officeChartElementTip(family, found);
  };
  const trackTip = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!tipsOn || dragging.current || event.buttons !== 0) return;
    const root = event.currentTarget;
    const { clientX, clientY } = event;
    if (tipFrame.current !== null) cancelAnimationFrame(tipFrame.current);
    tipFrame.current = requestAnimationFrame(() => {
      tipFrame.current = null;
      const found = pictureTargetAt(root, clientX, clientY);
      const words = found ? tipOf(found) : null;
      if (!words) {
        hideTip();
        return;
      }
      const key = officeChartElementTipKey(words);
      if (tipShown.current?.key === key || tipPending.current === key) return;
      // In the frame's own pixels (a zoomed page scales its screen box).
      const box = root.getBoundingClientRect();
      const scale = box.width > 0 && root.offsetWidth > 0 ? root.offsetWidth / box.width : 1;
      const next: Tip = {
        x: (clientX - box.left) * scale,
        y: (clientY - box.top) * scale,
        w: root.offsetWidth,
        h: root.offsetHeight,
        key,
        tip: words,
      };
      stopTipTimer();
      // A tip already up follows the pointer to the next element at once;
      // the first waits for the pointer to rest.
      if (tipShown.current) {
        setTip(next);
        return;
      }
      tipPending.current = key;
      tipTimer.current = window.setTimeout(() => {
        tipTimer.current = null;
        tipPending.current = "";
        setTip(next);
      }, TIP_DELAY_MS);
    });
  };
  const tipWords = (entry: OfficeChartElementTip): string => {
    switch (entry.key) {
      case "chartArea":
        return t("charts.elementTip.chartArea");
      case "plotArea":
        return t("charts.elementTip.plotArea");
      case "chartTitle":
        return t("charts.elementTip.chartTitle");
      case "legend":
        return t("charts.elementTip.legend");
      case "legendEntry":
        return entry.byPoint
          ? t("charts.elementTip.legendEntryPoint", { name: entry.name })
          : t("charts.elementTip.legendEntry", { name: entry.name });
      case "axis":
        return t(`charts.elementTip.axis.${entry.axis}`);
      case "axisTitle":
        return t("charts.elementTip.axisTitle", { axis: t(`charts.elementTip.axis.${entry.axis}`) });
      case "dataLabels":
        return t("charts.elementTip.dataLabels", { series: entry.series });
      case "series":
        return t("charts.elementTip.series", { series: entry.series });
      case "point":
        return entry.value !== undefined
          ? t("charts.elementTip.point", { series: entry.series, point: entry.point, value: entry.value })
          : t("charts.elementTip.pointName", { series: entry.series, point: entry.point });
    }
  };

  // A gesture on an element's frame: the frame stays mounted, where it was
  // pressed, until the release (a WebKit touch whose element is removed
  // mid-gesture never hears its release), and a dropped element is framed
  // where it lands while the chart is drawn there.
  const [frameDrag, setFrameDrag] = useState<FrameDrag | null>(null);
  const [landing, setLanding] = useState<{
    box: { x: number; y: number; w: number; h: number };
    contentKey: string;
    at: number;
  } | null>(null);
  const onFrameDrag = (drag: FrameDrag | null) => {
    dragging.current = drag !== null;
    if (drag) hideTip();
    setFrameDrag(drag);
  };
  const place = (
    part: OfficeChartPicturePart,
    box: { x: number; y: number; w: number; h: number },
    extra?: Parameters<typeof dispatchOfficeChartPlace>[3],
  ) => {
    if (!rootRef.current) return;
    setLanding({ box, contentKey, at: Date.now() });
    dispatchOfficeChartPlace(rootRef.current, part, box, extra);
  };
  // The landing frame goes once the chart is drawn as placed, or when the
  // host kept the chart as it was (a refused place changes nothing).
  const landed = landing !== null && exact !== undefined && exact.contentKey !== landing.contentKey;
  useEffect(() => {
    if (!landing) return;
    if (landed) {
      setLanding(null);
      return;
    }
    const unchanged = contentKey === landing.contentKey;
    const timer = window.setTimeout(() => setLanding(null), unchanged ? 1200 : 8000);
    return () => window.clearTimeout(timer);
  }, [landing, landed, contentKey]);

  const width = request.width, height = request.height;
  const status = failed && !display ? (failure?.offline ? "offline" : "failed") : failed ? "failed" : markup ? "ready" : "fallback";
  return (
    <div
      ref={rootRef}
      data-testid={testId}
      data-chart-render-status={status}
      data-chart-render-error={failed && failure?.reason ? failure.reason : undefined}
      data-chart-picture-stale={staleData ? "true" : undefined}
      data-chart-picture-pending={pendingData ? "true" : undefined}
      data-chart-picture-updating={pendingMarked ? "true" : undefined}
      data-chart-picture-stored={display?.stored ? "true" : undefined}
      // A click on a drawn series selects it, a second one its point
      // (Office's clicks): read off the picture by geometry and reported to
      // the window that owns the Format pane.
      onPointerDownCapture={() => {
        notePress();
        hideTip();
      }}
      onClick={(event) => reportChartHit(event, false)}
      onDoubleClick={(event) => reportChartHit(event, true)}
      onContextMenu={contextMenuHits ? (event) => reportChartHit(event, false, true) : undefined}
      onMouseMove={tipsOn ? trackTip : undefined}
      onMouseLeave={tipsOn ? hideTip : undefined}
      style={{
        height: "100%",
        width: "100%",
        flex: "1 1 0%",
        position: "relative",
        // A chart is pressed as an object, never as text: its drawn labels
        // and data table select no words, so Safari has no selection to
        // drag as a grey ghost beside it (the chart text layer turns
        // selection back on while a label is being typed; see
        // lib/native-drag-guard).
        WebkitUserSelect: "none",
        userSelect: "none",
        // Office draws chart words without the Mac's font smoothing, whose
        // dilation made light words on a filled point read bold (X-051:
        // C18's white funnel labels, Calibri Regular in Excel's print and
        // in ours, looked bold on screen). Grayscale antialiasing draws the
        // face's own weight.
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        ...(standIn ? { overflow: "hidden" } : {}),
        ...style,
      }}
    >
      {markup && display ? (
        <div
          data-chart-picture-frame="true"
          data-chart-picture-instance={instanceId}
          style={{
            position: "relative",
            display: "block",
            // Mid-gesture the stand-in is stretched to the frame until the
            // drawing at this size lands; otherwise it keeps its own size.
            height: standIn && !(live && following) ? `${(standIn.picture.height / height) * 100}%` : "100%",
            width: standIn && !(live && following) ? `${(standIn.picture.width / width) * 100}%` : "100%",
            pointerEvents: "none",
          }}
        >
          <div
            role="img"
            aria-label={label}
            data-chart-flat-drawing="true"
            data-chart-picture-size={standIn ? "stand-in" : undefined}
            {...pictureAttributes}
            style={{
              display: "block",
              height: "100%",
              width: "100%",
              pointerEvents: "none",
              ...(staleData ? { opacity: 0.35 } : pendingMarked ? { opacity: 0.45 } : {}),
            }}
            dangerouslySetInnerHTML={pictureHtml}
          />
          {display.picture.texts ? (
            <OfficeChartTextLayer
              texts={display.picture.texts}
              labels={display.picture.labels}
              width={display.picture.width || width}
              height={display.picture.height || height}
              edit={
                textEdit &&
                (textEdit.part.startsWith("label:") || display.picture.texts[textEdit.part as ChartTextPart])
                  ? textEdit
                  : null
              }
              onEditEnd={(edit) => endOfficeChartTextEdit(textEditKey, edit)}
              faded={staleData || pendingMarked}
              testId={`${testId}-text`}
            />
          ) : null}
        </div>
      ) : (
        children
      )}
      {overlay}
      {(() => {
        // The selected element's frame (and the frames of what inside it is
        // selected), on the picture of this chart as it now is; a frame
        // under a gesture stays where it was pressed until the release.
        const pw = display?.picture.width || width;
        const ph = display?.picture.height || height;
        const current = display !== undefined && display.contentKey === contentKey && !standIn;
        const frames: ReactNode[] = [];
        const frame = (
          frameKey: string,
          part: OfficeChartPicturePart,
          box: { x: number; y: number; width: number; height: number },
          kind: "element" | "member",
          frameTestId: string,
          onPlace?: (box: { x: number; y: number; w: number; h: number }) => void,
          label?: { series: number; point: number },
        ) =>
          frames.push(
            <SelectedPartFrame
              key={frameKey}
              frameKey={frameKey}
              part={part}
              kind={kind}
              box={frameDrag?.key === frameKey ? frameDrag.box : box}
              pictureWidth={pw}
              pictureHeight={ph}
              testId={frameTestId}
              onPlace={onPlace}
              label={label}
              onDrag={onFrameDrag}
            />,
          );
        const placedHere = landing !== null && frameDrag === null;
        if (
          current &&
          selectedPart &&
          display.picture.parts[selectedPart] &&
          // A text being typed draws its own box, which grows with its words.
          textEdit?.part !== selectedPart &&
          !placedHere
        ) {
          frame(
            `part:${selectedPart}`,
            selectedPart,
            display.picture.parts[selectedPart]!,
            "element",
            `${testId}-selected-part`,
            placeable && PLACEABLE_PARTS.has(selectedPart) ? (box) => place(selectedPart, box) : undefined,
          );
        } else if (frameDrag?.key.startsWith("part:")) {
          frame(frameDrag.key, frameDrag.part, frameDrag.box, "element", `${testId}-selected-part`);
        }
        if (current && selectionDetail && !placedHere) {
          // One legend entry inside the selected legend.
          if (selectionDetail.legendEntry !== undefined && selectedPart === "legend") {
            const entry = display.picture.legendEntries?.find((item) => item.index === selectionDetail.legendEntry);
            if (entry) frame(`entry:${entry.index}`, "legend", entry.box, "member", `${testId}-selected-entry`);
          }
          // One series' data labels, or one label (which a hand moves).
          const labels = selectionDetail.labels;
          if (labels) {
            for (const item of display.picture.labels ?? []) {
              if (item.series !== labels.series || (labels.point !== undefined && item.point !== labels.point)) continue;
              if (textEdit?.part === `label:${item.series}:${item.point}`) continue;
              frame(
                `label:${item.mark}`,
                "dataLabels",
                item.box,
                labels.point === undefined ? "member" : "element",
                `${testId}-selected-label`,
                placeable && labels.point !== undefined
                  ? (box) =>
                      place("dataLabels", box, {
                        label: { series: item.series, point: item.point },
                        from: { x: item.box.x / pw, y: item.box.y / ph, w: item.box.width / pw, h: item.box.height / ph },
                      })
                  : undefined,
                { series: item.series, point: item.point },
              );
            }
          }
        } else if (frameDrag?.key.startsWith("label:")) {
          frame(frameDrag.key, "dataLabels", frameDrag.box, "element", `${testId}-selected-label`);
        }
        return frames;
      })()}
      {landing && !frameDrag ? (
        <div
          aria-hidden="true"
          className={selectionStyles.landing}
          data-testid={`${testId}-landing`}
          style={{
            left: `${landing.box.x * 100}%`,
            top: `${landing.box.y * 100}%`,
            width: `${landing.box.w * 100}%`,
            height: `${landing.box.h * 100}%`,
          }}
        />
      ) : null}
      {pointMarks.length ? (
        <div
          aria-hidden="true"
          data-testid={`${testId}-selected-points`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
        >
          {pointMarks.map((mark, index) => (
            <span
              key={index}
              className={selectionStyles.pointMark}
              style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      {/* A data label typed in place: the picture leaves its own drawing of
          it out meanwhile (one copy of its words). */}
      {textEdit?.part.startsWith("label:") && display
        ? (() => {
            const typed = /^label:(\d+):(\d+)$/.exec(textEdit.part);
            const label = typed
              ? display.picture.labels?.find((item) => item.series === Number(typed[1]) && item.point === Number(typed[2]))
              : undefined;
            return label ? (
              <style>{`[data-chart-picture-instance="${instanceId}"] [ecmeta_label="${label.mark}"]{visibility:hidden}`}</style>
            ) : null;
          })()
        : null}
      {pendingMarked && !staleData ? (
        <div
          role="status"
          data-testid={`${testId}-updating`}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            color: "#3b3b3b",
            font: "12px/1.4 'Segoe UI', system-ui, sans-serif",
            pointerEvents: "none",
          }}
        >
          {t("charts.picture.updating")}
        </div>
      ) : null}
      {staleData ? (
        <div
          role="status"
          data-testid={noticeTestId}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            boxSizing: "border-box",
            color: "#3b3b3b",
            font: "12px/1.4 'Segoe UI', system-ui, sans-serif",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {offlineChange ? t("charts.picture.needsConnection") : t("presentation.chartStale.notice")}
        </div>
      ) : null}
      {tip ? (
        <div
          role="tooltip"
          data-testid={`${testId}-tooltip`}
          data-chart-tip={tip.tip.key}
          className={selectionStyles.tip}
          // Below and right of the pointer; turned back from the frame's far
          // edges (a worksheet chart clips what leaves its frame).
          style={{
            left: tip.x > tip.w * 0.55 ? tip.x - 6 : tip.x + 12,
            top: tip.y > tip.h * 0.7 ? tip.y - 8 : tip.y + 18,
            transform: `translate(${tip.x > tip.w * 0.55 ? "-100%" : "0"}, ${tip.y > tip.h * 0.7 ? "-100%" : "0"})`,
          }}
        >
          {tipWords(tip.tip)}
        </div>
      ) : null}
    </div>
  );
}

/** The elements a hand places (Office's `c:manualLayout`): the title, the
 * axis titles, the legend and the plot area. The last two size too (a
 * title, an axis title and a data label move only: Excel's chart title and
 * labels state no size of their own). */
const PLACEABLE_PARTS: ReadonlySet<OfficeChartPicturePart> = new Set(["title", "axisX", "axisY", "legend", "plot"]);
const SIZED_PARTS: ReadonlySet<OfficeChartPicturePart> = new Set(["legend", "plot"]);
type Handle = (typeof OFFICE_DRAWING_RESIZE_HANDLES)[number];
/** A press moved this far (screen px) is a drag, not a click. */
const DRAG_SLOP_PX = 3;
/** The smallest box a handle sizes an element to (picture px). */
const MIN_ELEMENT_PX = 8;

/**
 * The box an element's frame takes when it is dragged from `box` by
 * (dx, dy) picture px: moved whole (no handle), or one side or corner
 * sized by a handle, kept inside the chart (Office keeps an element in its
 * chart area) and at least `MIN_ELEMENT_PX` on a side.
 */
export function officeChartDraggedBox(
  box: { x: number; y: number; width: number; height: number },
  handle: string | null,
  dx: number,
  dy: number,
  pictureWidth: number,
  pictureHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (!handle) {
    const x = Math.min(pictureWidth - box.width, Math.max(0, box.x + dx));
    const y = Math.min(pictureHeight - box.height, Math.max(0, box.y + dy));
    return { ...box, x, y };
  }
  let left = box.x, top = box.y, right = box.x + box.width, bottom = box.y + box.height;
  if (handle.includes("w")) left = Math.min(right - MIN_ELEMENT_PX, Math.max(0, left + dx));
  if (handle.includes("e")) right = Math.max(left + MIN_ELEMENT_PX, Math.min(pictureWidth, right + dx));
  if (handle.includes("n")) top = Math.min(bottom - MIN_ELEMENT_PX, Math.max(0, top + dy));
  if (handle.includes("s")) bottom = Math.max(top + MIN_ELEMENT_PX, Math.min(pictureHeight, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * A selected element's frame (Office's selection rectangle around a chart
 * element). An element a hand may place moves with its frame: a press on it
 * dragged moves the element, a handle on a legend or plot area sizes it; an
 * outline follows the pointer and the element is placed on release (a
 * click stays a click: a title's second click types in it). The press
 * captures the pointer, so a finger, a pen or a trackpad drag is followed
 * outside the chart too, and the host keeps the frame mounted until the
 * release (`onDrag`).
 */
function SelectedPartFrame({
  frameKey,
  part,
  kind,
  box,
  pictureWidth,
  pictureHeight,
  testId,
  onPlace,
  label,
  onDrag,
}: {
  frameKey: string;
  part: OfficeChartPicturePart;
  kind: "element" | "member";
  box: { x: number; y: number; width: number; height: number };
  pictureWidth: number;
  pictureHeight: number;
  testId: string;
  onPlace?: (box: { x: number; y: number; w: number; h: number }) => void;
  label?: { series: number; point: number };
  onDrag: (drag: FrameDrag | null) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  // The outline while a drag is under way (picture px).
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const pad = 2;
  const begin = (event: ReactPointerEvent<HTMLElement>, handle: string | null) => {
    if (!onPlace || event.button !== 0) return;
    // The chart object's own move gesture must not take this press.
    event.stopPropagation();
    const frame = frameRef.current;
    const picture = frame?.parentElement;
    if (!frame || !picture) return;
    // Screen px to the picture's own px, measured on the picture's box as
    // drawn now (a workspace zoom, an editor zoom or a scaled slide between).
    const screen = picture.getBoundingClientRect();
    if (screen.width <= 0 || screen.height <= 0) return;
    const sx = pictureWidth / screen.width, sy = pictureHeight / screen.height;
    const start = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let moved = false;
    let last = box;
    const target = event.currentTarget;
    try {
      target.setPointerCapture?.(pointerId);
    } catch {
      /* a synthetic press has no pointer to capture */
    }
    onDrag({ key: frameKey, part, box, ...(label ? { label } : {}) });
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      if (!moved && Math.hypot(move.clientX - start.x, move.clientY - start.y) < DRAG_SLOP_PX) return;
      moved = true;
      // A drag selects nothing on the page beneath (a touch scrolls nothing).
      if (move.cancelable) move.preventDefault();
      last = officeChartDraggedBox(box, handle, (move.clientX - start.x) * sx, (move.clientY - start.y) * sy, pictureWidth, pictureHeight);
      setGhost(last);
    };
    // The host's object may be draggable (a Docs chart node), and its words
    // selectable (a worksheet): the press is the element's, never the start
    // of dragging the whole chart away or of selecting the chart's text.
    const noDrag = (drag: Event) => drag.preventDefault();
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("dragstart", noDrag, true);
      window.removeEventListener("selectstart", noDrag, true);
      try {
        if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
      } catch {
        /* the capture went with the press */
      }
      setGhost(null);
      onDrag(null);
      if (!moved || up.type === "pointercancel") return;
      // The release's click is the drag's, not a second click on the element.
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      onPlace({
        x: last.x / pictureWidth,
        y: last.y / pictureHeight,
        w: last.width / pictureWidth,
        h: last.height / pictureHeight,
      });
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("dragstart", noDrag, true);
    window.addEventListener("selectstart", noDrag, true);
  };
  const percentBox = (b: { x: number; y: number; width: number; height: number }) => ({
    left: `${((b.x - pad) / pictureWidth) * 100}%`,
    top: `${((b.y - pad) / pictureHeight) * 100}%`,
    width: `${((b.width + pad * 2) / pictureWidth) * 100}%`,
    height: `${((b.height + pad * 2) / pictureHeight) * 100}%`,
  });
  const sized = Boolean(onPlace) && SIZED_PARTS.has(part);
  // A short side drops its middle handle, as the drawings' frames do.
  const handles = sized ? officeDrawingVisibleResizeHandles(box.width + pad * 2, box.height + pad * 2) : [];
  return (
    <>
      <div
        ref={frameRef}
        aria-hidden="true"
        className={selectionStyles.frame}
        data-testid={testId}
        data-chart-part={part}
        data-chart-frame-kind={kind}
        data-chart-part-placeable={onPlace ? "true" : undefined}
        // Editor chrome: a press here is the element's (Docs' object gestures skip chrome).
        data-document-selection-chrome={onPlace ? "true" : undefined}
        onPointerDown={onPlace ? (event) => begin(event, null) : undefined}
        style={percentBox(box)}
      >
        {handles.map((handle: Handle) => (
          <span
            key={handle}
            className={selectionStyles.handle}
            data-handle={handle}
            data-testid={`${testId}-handle-${handle}`}
            onPointerDown={(event) => begin(event, handle)}
            style={{
              left: handle.includes("w") ? "0%" : handle.includes("e") ? "100%" : "50%",
              top: handle.includes("n") ? "0%" : handle.includes("s") ? "100%" : "50%",
            }}
          />
        ))}
      </div>
      {ghost ? (
        <div
          aria-hidden="true"
          className={selectionStyles.ghost}
          data-testid={`${testId}-ghost`}
          style={percentBox(ghost)}
        />
      ) : null}
    </>
  );
}
