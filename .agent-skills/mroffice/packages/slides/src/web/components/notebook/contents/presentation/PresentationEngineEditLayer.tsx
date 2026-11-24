"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A body being typed in, drawn by the text engine (flag `slides-edit`): the
 * same lines, baselines and glyph positions as the body at rest, the printed
 * slide and the thumbnails (`PresentationEngineTextBody`), so a box does not
 * move as it is clicked into.
 *
 * The body's editing rows stay what they were -- the contentEditable host's
 * own rows, the caret's, the selection's and the input method's, their lines
 * ended where the engine ends them (`powerpoint-line-fit-dom`) -- but their
 * glyphs are not painted (`data-presentation-engine-edit` in the window's
 * stylesheet). Over them the engine draws the words, and paints the caret and
 * the selection from its own lines (`officeTextCaretAtOffset`,
 * `officeTextSelectionRects`) at the host's selection. A press is answered
 * from the engine's lines too (`officeTextOffsetAtPoint`).
 *
 * Letters the window has not drawn yet (a typing burst) are laid out here, from
 * the host's words (`presentationRowsWithTypedText`). Whatever the engine
 * cannot follow -- an input method composing, a row's break typed before the
 * window draws it, a field -- shows the host's own rows until the window
 * draws the body again: never a body drawn wrong.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  officeTextCaretAtOffset,
  officeTextOffsetAtPoint,
  officeTextSelectionRects,
  type OfficeTextHitMap,
} from "@mrnote/core/web/lib/text-engine/office-text-hit.ts";
import {
  presentationPreviewComposing,
  presentationPreviewPlainText,
  presentationPreviewSelection,
  setPresentationPreviewSelection,
} from "@mrnote/core/web/lib/presentation/text-selection.ts";
import type { PresentationFontSizeUnit } from "../../../../lib/presentation/text-layout-css";
import type { PresentationFontAliases } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import {
  PresentationEngineTextBody,
  presentationEngineDrawsSame,
  presentationEngineLineStarts,
  usePresentationEngineBody,
  type PresentationEngineBodyAnswer,
} from "./PresentationEngineTextBody";
import { presentationRowsText, presentationRowsWithTypedText } from "./presentationEngineEditing";
import { PowerPointLineFitAfterPaintContext } from "./usePowerPointLineFit";
import type { PresentationParagraphRowPlan } from "./presentationParagraphRows";

const PX_PER_PT = 4 / 3;

export const PRESENTATION_ENGINE_EDIT_ATTRIBUTE = "data-presentation-engine-edit";

const NO_ROWS: readonly PresentationParagraphRowPlan[] = [];

function px(points: number): number {
  return Math.round(points * PX_PER_PT * 1000) / 1000;
}

function hostOf(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]') ?? null;
}

export function PresentationEngineEditLayer({
  answer,
  rows,
  bodyStyle,
  fontSizeUnit,
  fontAliases,
  autofitScale,
  tabStops,
  defaultTabPx,
  kerning,
  eastAsianLines,
  lineBox,
  widthPx,
  wrap,
  colorOverride,
  children,
}: {
  /**
   * The engine's layout of the body as the window last drew it; null while
   * it has none (a face still loading, a check asked again): the host's own
   * rows show, in the same elements, so the host's words and its caret are
   * never mounted afresh when the engine's answer comes and goes.
   */
  answer: Extract<PresentationEngineBodyAnswer, { status: "ok" }> | null;
  rows: readonly PresentationParagraphRowPlan[] | null;
  bodyStyle: CSSProperties;
  fontSizeUnit: PresentationFontSizeUnit;
  fontAliases: PresentationFontAliases;
  autofitScale: number;
  tabStops: unknown;
  defaultTabPx?: unknown;
  kerning?: unknown;
  /** `source.nativeEastAsianLines` (readings row 1001). */
  eastAsianLines?: unknown;
  /** `source.nativeLineBox` (readings row 1013). */
  lineBox?: unknown;
  widthPx: number | null;
  wrap: boolean;
  colorOverride?: string;
  /** The body's editing rows. */
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Letters the host holds that `rows` (the window's last drawing) does not.
  const [typed, setTyped] = useState<{
    base: readonly PresentationParagraphRowPlan[];
    /** `presentationRowsText(base)`. */
    baseText: string;
    rows: readonly PresentationParagraphRowPlan[];
    /** The host's words they were laid out from. */
    text: string;
  } | null>(null);
  // The host's words are something the engine cannot follow until the window draws them.
  const [staleFor, setStaleFor] = useState<readonly PresentationParagraphRowPlan[] | null>(null);
  const rowsText = useMemo(() => (rows ? presentationRowsText(rows) : null), [rows]);
  // The window drawing again while letters are held (anything but their own
  // draw: a save's status, a collaborator's caret) plans the same rows anew:
  // the same words, a new object. The letters stay laid out on the new rows;
  // falling back to the window's drawing showed the host's own rows for that
  // key (the words it lacked read as a mismatch), and the body's height came
  // and went with them, which the window reads as a letter that started a
  
  const typedRows = useMemo(() => {
    if (!typed || !rows || rowsText === null) return null;
    if (typed.base === rows) return typed.rows;
    if (typed.baseText !== rowsText) return null;
    return presentationRowsWithTypedText(rows, typed.text, rowsText);
  }, [typed, rows, rowsText]);
  const stale = staleFor !== null && staleFor === rows;
  const local = usePresentationEngineBody({
    enabled: typedRows !== null,
    force: true,
    rows: typedRows ?? rows,
    bodyStyle,
    fontSizeUnit,
    fontAliases,
    autofitScale,
    tabStops,
    defaultTabPx,
    kerning,
    eastAsianLines,
    lineBox,
    widthPx,
    wrap,
  });
  const laid = typedRows !== null ? (local.status === "ok" ? local : null) : answer;
  const laidRows = typedRows ?? rows ?? NO_ROWS;
  // The window lays out the letters this layer already drew (its typing
  // burst ends, `typingBurstRef`): the drawing made for them stays, so the
  // body is not drawn a second time, nor its caret's map made again.
  const { drawn, rows: drawnRows } = useKeptDrawing(laid, laidRows);
  const hitMap = useMemo<OfficeTextHitMap | null>(
    () => (drawn ? { layout: drawn.layout, runLengths: drawn.input.rowRuns.map((runs) => runs.map((run) => run.text.length)) } : null),
    [drawn],
  );
  const drawnText = useMemo(() => (drawn ? drawn.input.rowRuns.map((runs) => runs.map((run) => run.text).join("")).join("\n") : ""), [drawn]);

  // The host's words read again: letters typed in place laid out here; what
  // the engine cannot follow shows the host's own rows.
  const readWords = useCallback(() => {
    const host = hostOf(wrapperRef.current);
    if (!host || !rows || rowsText === null || presentationPreviewComposing(host)) return;
    const text = presentationPreviewPlainText(host);
    if (text === rowsText) {
      setTyped(null);
      setStaleFor(null);
      return;
    }
    const next = presentationRowsWithTypedText(rows, text, rowsText);
    if (next === null) {
      setStaleFor(rows);
      return;
    }
    setTyped({ base: rows, baseText: rowsText, rows: next, text });
  }, [rows, rowsText]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const host = hostOf(wrapper);
    if (!wrapper || !host) return;
    const doc = host.ownerDocument;
    const view = doc.defaultView;
    // An input method's marked text is the host's own until it is committed.
    const composeStart = (event: Event) => {
      if (event.target instanceof Node && host.contains(event.target)) wrapper.setAttribute("data-engine-composing", "");
    };
    const composeEnd = (event: Event) => {
      if (!(event.target instanceof Node && host.contains(event.target))) return;
      wrapper.removeAttribute("data-engine-composing");
      readWords();
    };
    const input = () => readWords();
    // A press lands where the engine drew the words, not where the host's
    // unpainted rows would put it. Double and triple clicks are the host's
    // word and paragraph selection, which already reads the engine's lines.
    const press = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail !== 1 || event.altKey || event.metaKey || event.ctrlKey || !host.isContentEditable) return;
      if (wrapper.hasAttribute("data-engine-composing") || wrapper.hasAttribute("data-engine-reveal")) return;
      const length = presentationPreviewPlainText(host).length;
      const offsetAt = (x: number, y: number) => {
        const offset = officeTextOffsetAtPoint(wrapper, x, y);
        return offset === null ? null : Math.max(0, Math.min(length, offset));
      };
      const hit = offsetAt(event.clientX, event.clientY);
      if (hit === null) return;
      event.preventDefault();
      if (doc.activeElement !== host) host.focus({ preventScroll: true });
      const current = event.shiftKey ? presentationPreviewSelection(host, length) : null;
      const anchor = current ? (hit < current.start ? current.end : current.start) : hit;
      let focus = hit;
      setPresentationPreviewSelection(host, Math.min(anchor, focus), Math.max(anchor, focus));
      if (!view) return;
      const move = (next: MouseEvent) => {
        if ((next.buttons & 1) === 0) return;
        const offset = offsetAt(next.clientX, next.clientY);
        if (offset === null || offset === focus) return;
        focus = offset;
        setPresentationPreviewSelection(host, Math.min(anchor, focus), Math.max(anchor, focus));
      };
      const release = () => {
        view.removeEventListener("mousemove", move, true);
        view.removeEventListener("mouseup", release, true);
      };
      view.addEventListener("mousemove", move, true);
      view.addEventListener("mouseup", release, true);
    };
    host.addEventListener("compositionstart", composeStart, true);
    host.addEventListener("compositionend", composeEnd, true);
    host.addEventListener("input", input);
    wrapper.addEventListener("mousedown", press);
    return () => {
      host.removeEventListener("compositionstart", composeStart, true);
      host.removeEventListener("compositionend", composeEnd, true);
      host.removeEventListener("input", input);
      wrapper.removeEventListener("mousedown", press);
    };
  }, [readWords]);

  // The host's words must be the ones drawn: a body whose rows show other
  // words than the engine laid out (a field drawn another way) is the host's.
  const [mismatch, setMismatch] = useState(false);
  useLayoutEffect(() => {
    if (typedRows !== null) return;
    const host = hostOf(wrapperRef.current);
    setMismatch(Boolean(host && drawn && presentationPreviewPlainText(host) !== drawnText && !presentationPreviewComposing(host)));
  }, [drawn, drawnText, typedRows]);

  // Letters laid out here are the host's own words: no mismatch while they are
  // (the last check's answer is the window's drawing's, and stayed up while
  // the letters came, showing the host's rows).
  const reveal = stale || (mismatch && typedRows === null) || drawn === null;
  const heightPt = drawn ? drawn.layout.height : answer?.layout.height ?? 0;
  // The drawing changes with the words, not with the caret: a caret moved or
  // a selection made draws the paint layer alone (`PresentationEngineCaretPaint`).
  const body = useMemo(
    () =>
      drawn ? (
        <PresentationEngineTextBody
          answer={drawn}
          rows={drawnRows}
          fontSizeUnit={fontSizeUnit}
          fontAliases={fontAliases}
          autofitScale={autofitScale}
          colorOverride={colorOverride}
          overlay
        />
      ) : null,
    [drawn, drawnRows, fontSizeUnit, fontAliases, autofitScale, colorOverride],
  );
  return (
    <div
      ref={wrapperRef}
      {...{ [PRESENTATION_ENGINE_EDIT_ATTRIBUTE]: "" }}
      {...(reveal ? { "data-engine-reveal": "" } : {})}
      style={{ position: "relative", width: "100%", height: reveal ? undefined : px(heightPt) }}
    >
      <div data-presentation-engine-edit-rows="" style={reveal ? undefined : { position: "absolute", left: 0, top: 0, width: "100%" }}>
        {


}
        <PowerPointLineFitAfterPaintContext.Provider value={!reveal}>{children}</PowerPointLineFitAfterPaintContext.Provider>
      </div>
      {drawn && !reveal ? (
        <div
          data-presentation-engine-edit-ink=""
          data-office-text-marker=""
          data-presentation-selection-ignore="true"
          contentEditable={false}
          aria-hidden
          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: px(heightPt), pointerEvents: "none", userSelect: "none" }}
        >
          {hitMap ? <PresentationEngineCaretPaint hitMap={hitMap} wrapperRef={wrapperRef} layer="selection" /> : null}
          {body}
          {hitMap ? <PresentationEngineCaretPaint hitMap={hitMap} wrapperRef={wrapperRef} layer="caret" /> : null}
        </div>
      ) : null}
    </div>
  );
}

type OkAnswer = Extract<PresentationEngineBodyAnswer, { status: "ok" }>;

/**
 * `laid`, or the drawing last committed when `laid` draws the same body
 * (`presentationEngineDrawsSame`): one drawing object while the words and
 * their places stay what they are, whichever layout said so.
 */
function useKeptDrawing(
  laid: OkAnswer | null,
  laidRows: readonly PresentationParagraphRowPlan[],
): { drawn: OkAnswer | null; rows: readonly PresentationParagraphRowPlan[] } {
  const keptRef = useRef<{ drawn: OkAnswer; rows: readonly PresentationParagraphRowPlan[] } | null>(null);
  // The last committed drawing (written below, after each commit): read, never written, while rendering.
  /* eslint-disable react-hooks/refs */
  const kept = keptRef.current;
  const keep = laid !== null && kept !== null && kept.drawn !== laid && presentationEngineDrawsSame(kept.drawn, kept.rows, laid, laidRows);
  const drawn = keep ? kept.drawn : laid;
  const rows = keep ? kept.rows : laidRows;
  useLayoutEffect(() => {
    keptRef.current = drawn ? { drawn, rows } : null;
  }, [drawn, rows]);
  return { drawn, rows };
  /* eslint-enable react-hooks/refs */
}

/** One host's selection as the body's offsets, read once per frame for every painter of it. */
const selectionReaders = new WeakMap<HTMLElement, { value: { start: number; end: number } | null; frame: number; listeners: Set<() => void> }>();

function useHostSelection(wrapperRef: { readonly current: HTMLDivElement | null }): { start: number; end: number } | null {
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const host = hostOf(wrapper);
    if (!wrapper || !host) return;
    const doc = host.ownerDocument;
    const view = doc.defaultView;
    let entry = selectionReaders.get(host);
    if (!entry) {
      entry = { value: null, frame: 0, listeners: new Set() };
      selectionReaders.set(host, entry);
    }
    const shared = entry;
    const read = () => {
      shared.frame = 0;
      const active = doc.activeElement;
      let next: { start: number; end: number } | null = null;
      if (active && (active === host || host.contains(active))) {
        // Offsets read from the host's own words cannot pass their end, and
        // the painters stop at the engine's lines: no length to clamp to (the
        // host's words were read a second time each key for it).
        const range = presentationPreviewSelection(host, Number.MAX_SAFE_INTEGER);
        if (range) next = { start: range.start, end: range.end };
      }
      const same = shared.value === next || (shared.value && next && shared.value.start === next.start && shared.value.end === next.end);
      if (!same) {
        shared.value = next;
        for (const listener of shared.listeners) listener();
      }
    };
    // A caret moved by a key is read in the frame it is drawn in, once.
    const schedule = () => {
      if (shared.frame) return;
      shared.frame = view ? view.requestAnimationFrame(read) : 0;
      if (!view) read();
    };
    const listener = () => setSelection(shared.value);
    shared.listeners.add(listener);
    const first = shared.listeners.size === 1;
    if (first) {
      doc.addEventListener("selectionchange", schedule);
      host.addEventListener("focusin", schedule);
      host.addEventListener("focusout", schedule);
    }
    read();
    setSelection(shared.value);
    return () => {
      shared.listeners.delete(listener);
      if (shared.listeners.size === 0) {
        doc.removeEventListener("selectionchange", schedule);
        host.removeEventListener("focusin", schedule);
        host.removeEventListener("focusout", schedule);
        if (shared.frame && view) view.cancelAnimationFrame(shared.frame);
        selectionReaders.delete(host);
      }
    };
  }, [wrapperRef]);
  return selection;
}

/** The host's selection painted on the engine's lines: its highlight, or its caret. */
function PresentationEngineCaretPaint({
  hitMap,
  wrapperRef,
  layer,
}: {
  hitMap: OfficeTextHitMap;
  wrapperRef: { readonly current: HTMLDivElement | null };
  layer: "selection" | "caret";
}) {
  const selection = useHostSelection(wrapperRef);
  if (!selection) return null;
  if (layer === "selection") {
    if (selection.end <= selection.start) return null;
    return (
      <>
        {officeTextSelectionRects(hitMap, selection.start, selection.end).map((rect, index) => (
          <div
            key={index}
            data-testid="presentation-engine-selection"
            style={{ position: "absolute", left: px(rect.x), top: px(rect.y), width: px(rect.width), height: px(rect.height) }}
          />
        ))}
      </>
    );
  }
  if (selection.start !== selection.end) return null;
  const caret = officeTextCaretAtOffset(hitMap, selection.start);
  if (!caret) return null;
  const top = Math.max(caret.top, caret.baseline - caret.sizePt * 0.95);
  const bottom = Math.min(caret.bottom, caret.baseline + caret.sizePt * 0.25);
  return (
    <div
      key={selection.start}
      data-testid="presentation-engine-caret"
      style={{ position: "absolute", left: px(caret.x) - 0.5, top: px(top), height: px(bottom - top) }}
    />
  );
}

/**
 * A host's editing rows drawn by the engine where it lays them out (a shape's
 * label, whose own drawing cannot call the engine's hook after its early
 * returns): `render` draws the rows, given where the engine ends their lines.
 */
export function PresentationEngineEditOrRows({
  enabled,
  rows,
  bodyStyle,
  fontSizeUnit,
  fontAliases,
  autofitScale,
  tabStops,
  defaultTabPx,
  kerning,
  eastAsianLines,
  lineBox,
  widthPx,
  wrap,
  colorOverride,
  render,
}: {
  enabled: boolean;
  rows: readonly PresentationParagraphRowPlan[] | null;
  bodyStyle: CSSProperties;
  fontSizeUnit: PresentationFontSizeUnit;
  fontAliases: PresentationFontAliases;
  autofitScale: number;
  tabStops?: unknown;
  defaultTabPx?: unknown;
  kerning?: unknown;
  /** `source.nativeEastAsianLines` (readings row 1001). */
  eastAsianLines?: unknown;
  /** `source.nativeLineBox` (readings row 1013). */
  lineBox?: unknown;
  widthPx: number | null;
  wrap: boolean;
  colorOverride?: string;
  render: (engineLineStarts: string[] | undefined) => ReactNode;
}) {
  const engine = usePresentationEngineBody({
    enabled, force: true, rows, bodyStyle, fontSizeUnit, fontAliases, autofitScale, tabStops, defaultTabPx, kerning, eastAsianLines, lineBox, widthPx, wrap,
  });
  if (!enabled || !rows || widthPx === null) return <>{render(undefined)}</>;
  return (
    <PresentationEngineEditLayer
      answer={engine.status === "ok" ? engine : null}
      rows={rows}
      bodyStyle={bodyStyle}
      fontSizeUnit={fontSizeUnit}
      fontAliases={fontAliases}
      autofitScale={autofitScale}
      tabStops={tabStops}
      defaultTabPx={defaultTabPx}
      kerning={kerning}
      eastAsianLines={eastAsianLines}
      lineBox={lineBox}
      widthPx={widthPx}
      wrap={wrap}
      colorOverride={colorOverride}
    >
      {render(engine.status === "ok" ? presentationEngineLineStarts(engine) : undefined)}
    </PresentationEngineEditLayer>
  );
}
