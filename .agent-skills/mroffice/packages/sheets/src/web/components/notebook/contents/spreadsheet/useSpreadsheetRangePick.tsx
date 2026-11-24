"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { sheetRefPrefix } from "@mrnote/core/web/lib/spreadsheet/paste-special.ts";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";

import { SpreadsheetRangePickerBar } from "./SpreadsheetRangePicker";
import { columnLabel } from "./spreadsheetRangeA1";

/**
 * Excel's RefEdit for every dialog box that takes a cell or range: a Collapse
 * Dialog button beside the box shrinks the dialog to one bar, the person
 * clicks or drags the range on the sheet (on another sheet too) and the box
 * follows the selection, written the way that box writes references; Enter,
 * Escape or Expand Dialog brings the dialog back and the sheet's selection
 * back to where it was. One pick at a time, owned here, so each dialog only
 * names its box and the reference style Excel uses in it.
 */
export type SpreadsheetRangePickStyle =
  /** A1 / A1:B5: a function argument, a sparkline's data. */
  | "relative"
  /** $A$1 / $A$1:$B$5: a target cell, a criteria or list range, a print area. */
  | "absolute"
  /** =$A$1:$B$5: Create Table, a query's destination. */
  | "absoluteFormula"
  /** Sheet1!$A$1:$B$5 always: a PivotTable's source, a Consolidate reference. */
  | "sheetAbsolute"
  /** =Sheet1!$A$1:$B$5 always: a name's Refers to. */
  | "sheetFormula"
  /** $1:$3: Rows to repeat at top. */
  | "rows"
  /** $A:$C: Columns to repeat at left. */
  | "columns";

export interface SpreadsheetPickRect {
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
}

const cellRef = (row: number, col: number, absolute: boolean) =>
  absolute ? `$${columnLabel(col)}$${row + 1}` : `${columnLabel(col)}${row + 1}`;

/** The text a box writes for the selection, in its reference style. A pick
 * on a sheet other than the dialog's names that sheet, as Excel does. */
export function spreadsheetRangePickText(
  style: SpreadsheetRangePickStyle,
  rect: SpreadsheetPickRect,
  sheetName: string,
  onHomeSheet: boolean,
): string {
  const r1 = Math.min(rect.r1, rect.r2);
  const r2 = Math.max(rect.r1, rect.r2);
  const c1 = Math.min(rect.c1, rect.c2);
  const c2 = Math.max(rect.c1, rect.c2);
  const absolute = style !== "relative";
  const area =
    style === "rows"
      ? `$${r1 + 1}:$${r2 + 1}`
      : style === "columns"
        ? `$${columnLabel(c1)}:$${columnLabel(c2)}`
        : r1 === r2 && c1 === c2
          ? cellRef(r1, c1, absolute)
          : `${cellRef(r1, c1, absolute)}:${cellRef(r2, c2, absolute)}`;
  const named = style === "sheetAbsolute" || style === "sheetFormula" || !onHomeSheet;
  const reference = `${named ? sheetRefPrefix(sheetName) : ""}${area}`;
  return style === "absoluteFormula" || style === "sheetFormula" ? `=${reference}` : reference;
}

export interface SpreadsheetRangePickRequest {
  /** The box's id, also the bar's test id prefix. */
  readonly id: string;
  /** The dialog's title, read by the collapsed bar. */
  readonly dialogLabel: string;
  /** The box's label. */
  readonly inputLabel: string;
  readonly style: SpreadsheetRangePickStyle;
  /** The box's text when the pick starts. */
  readonly value: string;
  /** Writes the box (the host's own state). */
  readonly onChange: (text: string) => void;
  /** The box IS the selection (a sparkline's Location Range): the pick
   * leaves the sheet's selection where it was picked. */
  readonly keepsSelection?: boolean;
  /** The box takes a reference to another sheet (a name's Refers to, a
   * PivotTable's source). Other boxes read their range on the dialog's own
   * sheet only, so a pick there leaves them as they were. */
  readonly otherSheets?: boolean;
}

/** A reference typed in the box that names cells of `sheetName` ("H2:H4",
 * "$H$2:$H$4", "'Sheet 1'!H2"), or null. */
export function spreadsheetRangePickTypedRange(
  text: string,
  sheetName: string,
): { r1: number; c1: number; r2: number; c2: number } | null {
  let body = text.trim().replace(/^=/, "");
  const bang = body.lastIndexOf("!");
  if (bang >= 0) {
    const named = body.slice(0, bang).replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
    if (named.toLocaleLowerCase() !== sheetName.toLocaleLowerCase()) return null;
    body = body.slice(bang + 1);
  }
  body = body.replace(/\$/g, "");
  if (!/^[A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?$/.test(body)) return null;
  return parseA1Range(body);
}

export interface SpreadsheetRangePickPlace {
  readonly sheetId: string;
  readonly active: { row: number; col: number };
  readonly anchor: { row: number; col: number };
}

interface ActivePick {
  readonly request: SpreadsheetRangePickRequest;
  readonly origin: SpreadsheetRangePickPlace;
  readonly text: string;
  readonly last: SpreadsheetPickRect & { sheetId: string };
}

export function useSpreadsheetRangePick(options: {
  /** The sheet's selection now. */
  readonly selection: SpreadsheetPickRect;
  readonly sheetId: string;
  readonly sheetName: string;
  /** Where the selection is when a pick starts (to go back to). */
  readonly place: () => SpreadsheetRangePickPlace;
  /** Back to the dialog's sheet and selection. */
  readonly restore: (place: SpreadsheetRangePickPlace) => void;
  readonly expandLabel: string;
  /** The window the pick belongs to: Enter or Escape pressed in it (the
   * sheet has the keyboard after a click there) ends the pick. */
  readonly getRoot?: () => HTMLElement | null;
}): {
  /** The box being picked, or null. */
  readonly activeId: string | null;
  /** True while a box whose id starts with `prefix` is picked (its dialog hides). */
  readonly picking: (prefix: string) => boolean;
  readonly start: (request: SpreadsheetRangePickRequest) => void;
  readonly finish: () => void;
  /** The collapsed dialog, while a pick is on. */
  readonly bar: ReactNode;
} {
  const [pick, setPick] = useState<ActivePick | null>(null);
  const { selection, sheetId, sheetName } = options;
  // The box follows the selection (a click, a drag, another sheet's tab).
  if (
    pick &&
    (selection.r1 !== pick.last.r1 ||
      selection.c1 !== pick.last.c1 ||
      selection.r2 !== pick.last.r2 ||
      selection.c2 !== pick.last.c2 ||
      sheetId !== pick.last.sheetId)
  ) {
    const onHomeSheet = sheetId === pick.origin.sheetId;
    const text = onHomeSheet || pick.request.otherSheets
      ? spreadsheetRangePickText(pick.request.style, selection, sheetName, onHomeSheet)
      : pick.text;
    setPick({ ...pick, text, last: { sheetId, ...selection } });
  }
  // The box's owner is the dialog, another component, whose state may not
  // change while this one renders: it hears of the text after the render.
  const sentTextRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!pick || pick.text === sentTextRef.current) return;
    sentTextRef.current = pick.text;
    pick.request.onChange(pick.text);
  }, [pick]);
  const finish = () => {
    if (!pick) return;
    setPick(null);
    if (!pick.request.keepsSelection) {
      options.restore(pick.origin);
      return;
    }
    // The box IS the selection: a reference typed in it selects those cells,
    // as a drag would (S-198: a typed H2:H4 was dropped for the old cells).
    const typed = sheetId === pick.origin.sheetId ? spreadsheetRangePickTypedRange(pick.text, sheetName) : null;
    if (
      typed &&
      (typed.r1 !== pick.last.r1 || typed.c1 !== pick.last.c1 || typed.r2 !== pick.last.r2 || typed.c2 !== pick.last.c2)
    ) {
      options.restore({
        sheetId: pick.origin.sheetId,
        active: { row: typed.r1, col: typed.c1 },
        anchor: { row: typed.r2, col: typed.c2 },
      });
    }
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  const picking = pick !== null;
  const { getRoot } = options;
  useEffect(() => {
    if (!picking) return;
    // After a click or drag on the sheet the grid has the keyboard, and
    // Enter there would move the active cell (and the box with it). In
    // Excel, Enter or Esc after the pick brings the dialog back.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      const root = getRoot?.();
      if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      finishRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [getRoot, picking]);
  return {
    activeId: pick?.request.id ?? null,
    picking: (prefix) => Boolean(pick?.request.id.startsWith(prefix)),
    start: (request) => {
      sentTextRef.current = request.value;
      setPick({
        request,
        origin: options.place(),
        text: request.value,
        last: { sheetId, ...selection },
      });
    },
    finish,
    bar: pick ? (
      <SpreadsheetRangePickerBar
        dialogLabel={pick.request.dialogLabel}
        expandLabel={options.expandLabel}
        inputLabel={pick.request.inputLabel}
        onChange={(text) => {
          sentTextRef.current = text;
          pick.request.onChange(text);
          setPick({ ...pick, text });
        }}
        onDone={finish}
        testIdPrefix={pick.request.id}
        value={pick.text}
      />
    ) : null,
  };
}

export type SpreadsheetRangePick = ReturnType<typeof useSpreadsheetRangePick>;
