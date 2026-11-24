"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The quick data flyout beside a selected chart: its categories, series names
 * and values in a small grid, each cell committed when it is left or on Enter
 * (see `lib/office-charts/quick-data`). A value that comes from a formula is
 * shown greyed; the full data sheet stays one click away. A cell still being
 * typed in when the flyout closes (a click outside it) is committed as it is
 * left, as the sheet commits a cell on leaving it; one it cannot take is
 * dropped with the flyout, as Esc drops it.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";

import { MenuFlyout } from "../ui/MenuFlyout";
import { useTranslations } from "../../../host/next-intl";

import type {
  ChartQuickData,
  ChartQuickDataCell,
  ChartQuickDataEdit,
} from "../../lib/office-charts/quick-data";

const WORDS = {
  title: "office.chartQuickData.title",
  category: "office.chartQuickData.category",
  openSheet: "office.chartQuickData.openSheet",
  formula: "office.chartQuickData.formula",
  formulaCell: "office.chartQuickData.formulaCell",
  notNumber: "office.chartQuickData.notNumber",
  refused: "office.chartQuickData.refused",
  empty: "office.chartQuickData.empty",
} as const;

const CELL: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid var(--office-chart-quick-edge, #c8c6c4)",
  borderRadius: 3,
  padding: "2px 5px",
  font: "inherit",
  background: "var(--office-chart-quick-face, #ffffff)",
  color: "inherit",
};

type CellKey = string;

export function OfficeChartQuickDataPanel({
  data,
  unavailableReason,
  testIdPrefix,
  onEdit,
  onOpenSheet,
  onClose,
  trigger,
  panelRef,
}: {
  locale: string;
  /** The Data button: the flyout opens beside it as a layer of its own. */
  trigger: HTMLElement;
  panelRef?: Ref<HTMLDivElement>;
  data: ChartQuickData | null;
  unavailableReason?: string;
  testIdPrefix: string;
  onEdit?: (edit: ChartQuickDataEdit) => boolean;
  onOpenSheet?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const word = (key: keyof typeof WORDS) => t(WORDS[key]);
  const [drafts, setDrafts] = useState<Record<CellKey, string>>({});
  // The drafts as of this instant: Enter commits a cell and moves on, and the
  // move blurs the cell it left before React has re-rendered, so a commit
  // reads and clears its draft here or the same edit is made twice (the
  // second against the chart the first one replaced, and refused).
  const draftsRef = useRef<Record<CellKey, string>>({});
  const writeDrafts = (next: Record<CellKey, string>) => {
    draftsRef.current = next;
    setDrafts(next);
  };
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const id = (suffix: string) => `${testIdPrefix}-${suffix}`;
  // Each cell's latest reading and edit, so a draft can still be committed
  // after the flyout has closed around it.
  const cellsRef = useRef<
    Record<CellKey, { cell: ChartQuickDataCell; edit: (text: string) => ChartQuickDataEdit | string }>
  >({});
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  /** Commits a cell's draft; false when the chart cannot take it. */
  const commit = (key: CellKey, cell: ChartQuickDataCell, edit: (text: string) => ChartQuickDataEdit | string) => {
    const draft = draftsRef.current[key];
    if (draft === undefined) return true;
    const clear = () => {
      const next = { ...draftsRef.current };
      delete next[key];
      writeDrafts(next);
    };
    if (draft === cell.text) {
      clear();
      return true;
    }
    const made = edit(draft);
    if (typeof made === "string") {
      setError(made);
      return false;
    }
    if (onEdit?.(made)) {
      setError(null);
      clear();
      return true;
    }
    setError(word("refused"));
    return false;
  };

  useEffect(
    () => () => {
      // Closed by a click outside: the pointer-down unmounts the flyout
      // before the cell it leaves is blurred, so commit what is still typed.
      for (const [key, draft] of Object.entries(draftsRef.current)) {
        const entry = cellsRef.current[key];
        if (!entry || draft === entry.cell.text) continue;
        const made = entry.edit(draft);
        if (typeof made !== "string") onEditRef.current?.(made);
      }
      draftsRef.current = {};
    },
    [],
  );

  const input = (
    key: CellKey,
    cell: ChartQuickDataCell,
    label: string,
    edit: (text: string) => ChartQuickDataEdit | string,
    numeric: boolean,
  ) => {
    const readOnly = !onEdit || !cell.editable;
    cellsRef.current[key] = { cell, edit };
    return (
      <input
        aria-label={label}
        data-testid={id(`cell-${key}`)}
        data-quick-cell={key}
        inputMode={numeric ? "decimal" : undefined}
        readOnly={readOnly}
        title={!cell.editable ? word("formulaCell") : undefined}
        value={drafts[key] ?? cell.text}
        style={{
          ...CELL,
          textAlign: numeric ? "right" : "left",
          ...(cell.editable ? {} : { opacity: 0.55, cursor: "default" }),
        }}
        onChange={(event) =>
          writeDrafts({ ...draftsRef.current, [key]: event.target.value })
        }
        onBlur={() => commit(key, cell, edit)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Escape") {
            if (draftsRef.current[key] !== undefined) {
              event.preventDefault();
              const next = { ...draftsRef.current };
              delete next[key];
              writeDrafts(next);
              setError(null);
            } else {
              onClose();
            }
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          // A value the chart cannot take keeps the cell, with its message.
          if (!commit(key, cell, edit)) return;
          // Enter goes down a row, as in the sheet.
          const [row, column] = key.split(":").map(Number);
          tableRef.current
            ?.querySelector<HTMLInputElement>(`[data-quick-cell="${row + 1}:${column}"]`)
            ?.focus();
        }}
      />
    );
  };

  const hasFormula =
    data !== null &&
    (data.categories.some((cell) => !cell.editable) ||
      data.series.some(
        (series) => !series.name.editable || series.values.some((cell) => !cell.editable),
      ));

  // Portalled beside the Data button rather than drawn inside the chart's
  // rail: there it was cut off by the editor's scroll box and hidden under
  // a task pane when the chart sat near the right edge.
  return (
    <MenuFlyout
      ref={panelRef}
      trigger={trigger}
      offset={6}
      role="dialog"
      aria-label={word("title")}
      data-testid={id("panel")}
      className="docs-cupertino-menu"
      style={{
        padding: 8,
        fontSize: 12,
        width: "max-content",
        maxWidth: 420,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{word("title")}</div>
      {data ? (
        <div style={{ maxHeight: 300, overflow: "auto" }}>
          <table
            ref={tableRef}
            aria-label={word("title")}
            style={{ borderCollapse: "separate", borderSpacing: 3, tableLayout: "fixed" }}
          >
            <thead>
              <tr>
                <th scope="col" style={{ width: 96, textAlign: "left", fontWeight: 500 }}>
                  {word("category")}
                </th>
                {data.series.map((series, seriesIndex) => (
                  <th key={seriesIndex} scope="col" style={{ width: 76 }}>
                    {input(
                      `0:${seriesIndex + 1}`,
                      series.name,
                      series.name.text,
                      (text) =>
                        text.trim()
                          ? { kind: "seriesName", series: seriesIndex, text }
                          : word("empty"),
                      false,
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categories.map((category, index) => (
                <tr key={index}>
                  <th scope="row" style={{ fontWeight: 400 }}>
                    {input(
                      `${index + 1}:0`,
                      category,
                      category.text,
                      (text) =>
                        text.trim() ? { kind: "category", index, text } : word("empty"),
                      false,
                    )}
                  </th>
                  {data.series.map((series, seriesIndex) => (
                    <td key={seriesIndex}>
                      {input(
                        `${index + 1}:${seriesIndex + 1}`,
                        series.values[index],
                        `${series.name.text} · ${category.text}`,
                        (text) => {
                          // An emptied cell is a blank point, as in Office's
                          // data sheet; typing a number restores it.
                          if (text.trim() === "")
                            return { kind: "value", series: seriesIndex, index, value: null };
                          const value = Number(text.trim());
                          return Number.isFinite(value)
                            ? { kind: "value", series: seriesIndex, index, value }
                            : word("notNumber");
                        },
                        true,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="note" style={{ margin: 0, maxWidth: 240, color: "var(--office-ribbon-muted, #605e5c)" }}>
          {unavailableReason}
        </p>
      )}
      {error ? (
        <p role="alert" style={{ margin: "6px 0 0", color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}
      {hasFormula ? (
        <p style={{ margin: "6px 0 0", maxWidth: 320, color: "var(--office-ribbon-muted, #605e5c)" }}>
          {word("formula")}
        </p>
      ) : null}
      {onOpenSheet ? (
        <button
          type="button"
          data-testid={id("open-sheet")}
          style={{
            marginTop: 8,
            border: 0,
            padding: 0,
            background: "transparent",
            color: "var(--accent, #2563eb)",
            font: "inherit",
            cursor: "pointer",
          }}
          onClick={() => {
            onClose();
            onOpenSheet();
          }}
        >
          {word("openSheet")}
        </button>
      ) : null}
    </MenuFlyout>
  );
}
