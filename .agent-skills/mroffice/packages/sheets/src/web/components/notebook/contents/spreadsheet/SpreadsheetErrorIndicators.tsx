"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Background error checking (Excel: File > Options > Formulas > "Enable
 * background error checking", on by default). Microsoft Support, "Detect
 * errors in formulas": a flagged cell is "marked with a triangle in the
 * top-left corner of the cell"; selecting it shows an error button whose menu
 * names the problem and offers its fix, Ignore Error and Edit in Formula Bar.
 *
 * The rules are the Error Checking dialog's (`lib/spreadsheet/error-checking`),
 * asked one rendered cell at a time, with Excel's default rule set. This file
 * owns the reader, the triangle, the button and its menu; the window owns the
 * writes, which go through its ordinary sheet commit (one Undo each).
 *
 * The self-contained button is deliberate: no shared anchored options-button
 * primitive was committed when this was built.
 */

import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  checkCellForErrors,
  errorCheckCellFrom,
  type ErrorCheckFinding,
  type ErrorCheckRule,
  type ErrorCheckSourceCell, ignoredErrorRulesInRanges } from "../../../../lib/spreadsheet/error-checking";
import {
  disabledErrorCheckRules,
  readErrorCheckingOptions,
  serverErrorCheckingOptions,
  subscribeErrorCheckingOptions,
} from "../../../../lib/spreadsheet/error-checking-options";

import { SpreadsheetFormulaIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetFormulaRibbonIcons.tsx";
import styles from "./SpreadsheetErrorIndicators.module.css";
import { createPortal } from "react-dom";

import { usePopupPortalTarget } from "@mrnote/core/web/components/ui/portal-host.tsx";

export type SpreadsheetErrorIndicatorReader = (
  row: number,
  col: number,
) => ErrorCheckFinding | null;

/**
 * The finding (if any) for a cell, cached per cell map and result reader so
 * a render asks each visible cell once and nothing scans the whole sheet.
 * `displayAt` is the grid's live result for a formula cell.
 *
 * The user's Error Checking Options decide what is asked: nothing at all with
 * background checking off, otherwise every rule still ticked (Excel's
 * defaults until the user changes them).
 */
export function useSpreadsheetErrorIndicatorReader(
  cells: Readonly<Record<string, ErrorCheckSourceCell | undefined>>,
  displayAt: (
    cell: ErrorCheckSourceCell,
    row: number,
    col: number,
  ) => string,
  /** The formula a table's calculated column expects in a cell, if any. */
  calculatedColumnAt?: (row: number, col: number) => string | undefined,
  /** XLS-A075: a table cell whose value fails its data validation rule. */
  invalidTableDataAt?: (row: number, col: number) => boolean,
  

  ignoredErrorRanges?: unknown,
): SpreadsheetErrorIndicatorReader {
  const options = useSyncExternalStore(
    subscribeErrorCheckingOptions,
    readErrorCheckingOptions,
    serverErrorCheckingOptions,
  );
  const background = options.background;
  const disabled = useMemo(() => disabledErrorCheckRules(options), [options]);
  return useMemo(() => {
    const cache = new Map<string, ErrorCheckFinding | null>();
    const at = (row: number, col: number) => {
      const source = cells[`${row}:${col}`];
      return source
        ? errorCheckCellFrom(row, col, source, undefined, undefined, undefined, ignoredErrorRulesInRanges(ignoredErrorRanges, row, col))
        : undefined;
    };
    return (row, col) => {
      if (!background) return null;
      const key = `${row}:${col}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const source = cells[key];
      const raw = typeof source?.value === "string" ? source.value : "";
      const finding =
        source && String(source.value ?? "").trim() !== ""
          ? checkCellForErrors(
              errorCheckCellFrom(
                row,
                col,
                source,
                raw.startsWith("=") ? displayAt(source, row, col) : undefined,
                calculatedColumnAt?.(row, col),
                invalidTableDataAt?.(row, col),
                ignoredErrorRulesInRanges(ignoredErrorRanges, row, col),
              ),
              at,
              { disabled },
            )
          : null;
      cache.set(key, finding);
      return finding;
    };
  }, [cells, displayAt, calculatedColumnAt, invalidTableDataAt, ignoredErrorRanges, background, disabled]);
}

/** Each rule's menu title, as Excel words the error button's header. */
export const ERROR_OPTIONS_TITLE_KEYS: Record<ErrorCheckRule, string> = {
  "error-value": "spreadsheet.errorOptions.title.error-value",
  "inconsistent-calculated-column":
    "spreadsheet.errorOptions.title.inconsistent-calculated-column",
  "number-stored-as-text": "spreadsheet.errorOptions.title.number-stored-as-text",
  "inconsistent-formula": "spreadsheet.errorOptions.title.inconsistent-formula",
  "omits-adjacent-cells": "spreadsheet.errorOptions.title.omits-adjacent-cells",
  "unlocked-formula": "spreadsheet.errorOptions.title.unlocked-formula",
  "formula-references-empty":
    "spreadsheet.errorOptions.title.formula-references-empty",
  "two-digit-year": "spreadsheet.errorOptions.title.two-digit-year",
  "invalid-table-data": "spreadsheet.errorOptions.title.invalid-table-data",
};

/** The hover text: what the rule saw (the Error Checking dialog's wording). */
export const errorOptionsDescriptionKey = (rule: ErrorCheckRule) =>
  `spreadsheet.helperCopy.errorCheck.rule.${rule}`;

export function SpreadsheetErrorIndicatorMark({ rule }: { rule: ErrorCheckRule }) {
  return (
    <span
      aria-hidden="true"
      className={styles.indicator}
      data-error-rule={rule}
      data-testid="spreadsheet-error-indicator"
    />
  );
}

export function SpreadsheetErrorOptionsButton({
  label,
  description,
  firstColumn,
  onOpen,
}: {
  label: string;
  description: string;
  firstColumn: boolean;
  onOpen: (anchor: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      data-side={firstColumn ? "end" : undefined}
      aria-label={label}
      aria-haspopup="menu"
      title={description}
      data-testid="spreadsheet-error-options-button"
      // The grid keeps focus and selection: a press here is not a cell click.
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event.currentTarget.getBoundingClientRect());
      }}
    >
      <SpreadsheetFormulaIcon name="errorCheck" size={14} />
    </button>
  );
}

export interface SpreadsheetErrorOptionsAction {
  id: string;
  label: string;
  onSelect: () => void;
  /** Why a write is refused here (read-only page, protected cell). */
  disabledReason?: string;
}

export function SpreadsheetErrorOptionsMenu({
  anchor,
  title,
  actions,
  onClose,
}: {
  anchor: { left: number; bottom: number };
  title: string;
  actions: readonly SpreadsheetErrorOptionsAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Placed at the button's viewport rectangle, so portalled out of the
  // window: a window is the containing block of its fixed children (it
  // hints a transform) and clips them, which shifted the menu by the
  // window's own offset.
  const portalTarget = usePopupPortalTarget();
  const close = useRef(onClose);
  useInsertionEffect(() => {
    close.current = onClose;
  });
  const dismiss = useCallback(() => close.current(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [dismiss]);

  if (!portalTarget) return null;
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={title}
      className={styles.menu}
      data-testid="spreadsheet-error-options-menu"
      style={{ left: Math.max(8, anchor.left), top: anchor.bottom + 2 }}
    >
      <div className={styles.menuTitle}>{title}</div>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={styles.item}
          disabled={Boolean(action.disabledReason)}
          title={action.disabledReason}
          data-testid={`spreadsheet-error-options-${action.id}`}
          onClick={() => {
            dismiss();
            action.onSelect();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>,
    portalTarget,
  );
}
