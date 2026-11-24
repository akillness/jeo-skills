"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A worksheet chart's title or axis title typed where the sheet lays it out
 * itself, around a plot drawn without its titles (a chart not on the model
 * yet, or no chart engine). Every chart the engine draws with its titles
 * types them in place in the picture's own drawing instead
 * (`OfficeChartTextLayer`).
 *
 * Office: "click the chart title or axis title, then type the new text"
 * (Microsoft Support, "Edit titles or data labels in a chart"): Enter keeps
 * the text, Escape keeps the old title, and moving away keeps what was typed.
 * A title may hold line breaks (an imported title, or one typed in the
 * chart's own text layer): the box is a text area of as many lines as the
 * title, so its lines show as lines and survive the edit, and Shift+Enter
 * starts a new one.
 */
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

import { MAX_CHART_TEXT_CHARS } from "../console/editor/extensions/chartBlockShared";
import { isImeCompositionKey } from "../../lib/code-runner/editor-keys";
import { officeBlurWentIntoChrome } from "../../lib/office-inactive-selection";
import { officeTextPaintCss, type OfficeTextPaint } from "../../lib/office-text-paint";

export type OfficeChartTitleKind = "title" | "axisX" | "axisY";

/** Where Office draws each title on the chart, as an overlay box. */
const PLACEMENT: Record<OfficeChartTitleKind, CSSProperties> = {
  title: {
    top: 6,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(100%, 360px)",
    minHeight: 32,
    fontWeight: 600,
  },
  axisX: {
    bottom: 4,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(52%, 220px)",
    minHeight: 30,
    fontSize: 12,
  },
  axisY: {
    top: "50%",
    left: 19,
    transform: "translate(-50%, -50%) rotate(-90deg)",
    width: 160,
    minHeight: 30,
    fontSize: 12,
  },
};

export interface OfficeChartTitleInputProps {
  kind: OfficeChartTitleKind;
  value: string;
  label: string;
  testId: string;
  /** Called once per edit: `commit` false for Escape. */
  onFinish: (commit: boolean, value: string) => void;
  autoFocus?: boolean;
  /** The title's own text format (fill, outline), drawn on the box. */
  style?: CSSProperties;
  /**
   * The paint the title's words are drawn in as WordArt
   * (`presentationChartTitleTextPaint`): the words typed keep it -- the
   * chart's picture of the title is hidden while it is edited, and a plain
   * box showed the words without their WordArt.
   */
  textPaint?: OfficeTextPaint;
  /** Host data attributes (print, selection chrome). */
  dataAttributes?: Record<`data-${string}`, string>;
}

/** The WordArt's look on the box's words, the caret in their colour. */
function wordArtCss(paint: OfficeTextPaint | undefined): CSSProperties {
  if (!paint) return {};
  return {
    ...officeTextPaintCss(paint),
    caretColor: paint.fill !== "none" ? paint.fill : paint.outline !== "none" ? paint.outline : "#000000",
  };
}

export function OfficeChartTitleInput(props: OfficeChartTitleInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Enter / Escape finish the edit and then blur the box; that blur must not
  // finish it a second time.
  const finishedRef = useRef(false);
  // "Moving away keeps what was typed": a click anywhere outside the chart
  // deselects it, and the host takes the box down with the selection. The
  // browser fires no blur for a box that is removed while focused, so the
  // box keeps its own words on the way out. The latest draft and callback
  // are read through refs: the cleanup runs once, at unmount. A finished
  // edit (Enter, Escape, blur) clears the ref itself, because the host may
  // take the box down in the same commit, before the cleared draft renders.
  const draftRef = useRef<string | null>(null);
  draftRef.current = draft;
  const onFinishRef = useRef(props.onFinish);
  onFinishRef.current = props.onFinish;
  const finish = (commit: boolean, value: string) => {
    finishedRef.current = true;
    draftRef.current = null;
    setDraft(null);
    props.onFinish(commit, value);
  };
  useEffect(
    () => () => {
      if (draftRef.current === null) return;
      const value = draftRef.current;
      draftRef.current = null;
      onFinishRef.current(true, value);
    },
    [],
  );
  const inputProps: HTMLAttributes<HTMLTextAreaElement> = props.dataAttributes ?? {};
  const shown = draft ?? props.value;
  return (
    <textarea
      {...inputProps}
      ref={inputRef}
      aria-label={props.label}
      autoFocus={props.autoFocus}
      className="office-chart-title-input"
      contentEditable={false}
      data-office-chart-title={props.kind}
      data-testid={props.testId}
      maxLength={MAX_CHART_TEXT_CHARS}
      rows={shown.split("\n").length}
      value={shown}
      onBlur={(event) => {
        if (finishedRef.current) {
          finishedRef.current = false;
          return;
        }
        // Into the ribbon (a tab, the Font group, a menu): the title stays in
        // edit, as Office keeps the title selected while its ribbon is used --
        // its selected words shown grey (the shared inactive selection), and
        
        // highlight vanished on a tab click while the title stayed selected).
        if (officeBlurWentIntoChrome(event.relatedTarget)) return;
        finish(true, event.currentTarget.value);
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => {
        finishedRef.current = false;
        // Back from the ribbon, the words typed so far stay.
        if (draftRef.current === null) {
          setDraft(props.value);
          event.currentTarget.select();
        }
      }}
      onKeyDown={(event) => {
        // An IME's Enter confirms what it composed and its Escape cancels
        // it: neither ends the title's edit (the box closed with the
        // composition unconfirmed).
        if (isImeCompositionKey(event.nativeEvent)) return;
        if (event.key !== "Enter" && event.key !== "Escape") return;
        // Shift+Enter: a new line in the title.
        if (event.key === "Enter" && event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === "Enter", event.currentTarget.value);
        event.currentTarget.blur();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={
        {
              position: "absolute",
              zIndex: 5,
              display: "block",
              boxSizing: "border-box",
              margin: 0,
              border: "1px solid #9ca3af",
              borderRadius: 4,
              padding: "2px 8px",
              backgroundColor: "#ffffff",
              color: "inherit",
              font: "inherit",
              textAlign: "center",
              whiteSpace: "pre-wrap",
              resize: "none",
              overflow: "hidden",
              // A host that lays the title out itself (the worksheet's title
              // row) places the box statically in that row: Office's overlay
              // offsets and the centring translate would shift it half a box
              // to the left and cut its words.
              ...(props.style?.position === "static" ? {} : PLACEMENT[props.kind]),
              ...props.style,
              ...wordArtCss(props.textPaint),
            }
      }
    />
  );
}
