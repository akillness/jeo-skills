"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Change Chart Type > Combo > Custom Combination, once for Docs, the deck and
 * the worksheet.
 *
 * Excel, Word and PowerPoint open the same pane ("Create a combination
 * chart"; "Add or remove a secondary axis in a chart in Excel", Microsoft
 * Support): one row per data series with the series name, its chart type and
 * a Secondary Axis check box. A combination is made of 2-D charts and needs
 * at least two series; each series keeps its data, only how it is drawn and
 * which value axis scales it change. MRAI's chart model draws a combination's
 * series as clustered columns, lines or areas, so those are the types a row
 * offers. The dialog owns the rows, the words and the test ids; a host gives
 * the chart's current rows and commits the result in its own transaction.
 */
import { useEffect, useState, type RefObject } from "react";
import { useTranslations } from "../../../host/next-intl";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { COMBO_RENDER_AS } from "../console/editor/extensions/chartBlockShared";
import {
  officeChartCombinationRefusal,
  type OfficeChartCombinationRow,
} from "../../lib/office-charts/chart-type";

const WORDS = {
  title: "office.chartCombo.title",
  description: "office.chartCombo.description",
  seriesName: "office.chartCombo.seriesName",
  chartType: "office.chartCombo.chartType",
  secondaryAxis: "office.chartCombo.secondaryAxis",
  column: "office.chartCombo.column",
  bar: "office.chartCombo.bar",
  line: "office.chartCombo.line",
  area: "office.chartCombo.area",
  scatter: "office.chartCombo.scatter",
  pie: "office.chartCombo.pie",
  doughnut: "office.chartCombo.doughnut",
  ok: "office.chartCombo.ok",
  cancel: "office.chartCombo.cancel",
  needsSeries: "office.chartCombo.needsSeries",
  needsPrimary: "office.chartCombo.needsPrimary",
  needsRings: "office.chartCombo.needsRings",
  needsBarAxis: "office.chartCombo.needsBarAxis",
} as const;

// Excel's Custom Combination offers 2-D column, line, area and X Y (scatter)
// series on the shared axes, clustered bars on an axis group of their own,
// and a pie or doughnut ring that combines only with the other ring kind
// (`COMBO_RENDER_AS`).
const TYPES = COMBO_RENDER_AS;

export interface OfficeChartComboDialogProps {
  open: boolean;
  locale: string;
  /** The chart's current rows (`officeChartCombinationRows`). */
  rows: readonly OfficeChartCombinationRow[];
  /** Why the chart cannot be changed here; the rows stay readable. */
  disabledReason?: string | null;
  onSubmit: (rows: OfficeChartCombinationRow[]) => void;
  onClose: () => void;
  testIdPrefix: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function OfficeChartComboDialog(props: OfficeChartComboDialogProps) {
  const t = useTranslations("console-notebooks");
  const word = (key: keyof typeof WORDS) => t(WORDS[key]);
  const [rows, setRows] = useState<OfficeChartCombinationRow[]>(() => [...props.rows]);
  useEffect(() => {
    if (props.open) setRows([...props.rows]);
    // Reseed only when the dialog opens: a chart edit elsewhere while it is
    // open must not throw away what the author is choosing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);
  const refusal = officeChartCombinationRefusal(rows);
  const reason =
    props.disabledReason ??
    (refusal === "series"
      ? word("needsSeries")
      : refusal === "primary"
        ? word("needsPrimary")
        : refusal === "rings"
          ? word("needsRings")
          : refusal === "bars"
            ? word("needsBarAxis")
            : null);
  const edit = (index: number, patch: Partial<OfficeChartCombinationRow>) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );
  const id = (suffix: string) => `${props.testIdPrefix}-${suffix}`;
  const readOnly = Boolean(props.disabledReason);
  return (
    <OfficeDialogShell
      open={props.open}
      title={word("title")}
      description={word("description")}
      defaultActionLabel={word("ok")}
      cancelActionLabel={word("cancel")}
      defaultActionDisabled={reason !== null}
      onDefaultAction={() => {
        if (reason === null) props.onSubmit(rows);
      }}
      onCancel={props.onClose}
      returnFocusRef={props.returnFocusRef}
      testIdPrefix={props.testIdPrefix}
    >
      <table
        data-testid={id("rows")}
        style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}
      >
        <thead>
          <tr>
            {(["seriesName", "chartType", "secondaryAxis"] as const).map((key) => (
              <th
                key={key}
                scope="col"
                style={{ textAlign: "left", fontWeight: 600, padding: "4px 8px" }}
              >
                {word(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 400, padding: "4px 8px" }}>
                {row.name}
              </th>
              <td style={{ padding: "4px 8px" }}>
                <select
                  aria-label={t("office.chartCombo.seriesChartType", {
                    series: row.name,
                  })}
                  className="note-editor-office-toolbar__input"
                  value={row.renderAs}
                  disabled={readOnly}
                  data-testid={id(`type-${index}`)}
                  onChange={(event) =>
                    edit(index, {
                      renderAs: event.target.value as OfficeChartCombinationRow["renderAs"],
                    })
                  }
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {word(type)}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ padding: "4px 8px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  aria-label={t("office.chartCombo.seriesSecondaryAxis", {
                    series: row.name,
                  })}
                  checked={row.secondary}
                  disabled={readOnly}
                  data-testid={id(`secondary-${index}`)}
                  onChange={(event) => edit(index, { secondary: event.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {reason ? (
        <p role="note" data-testid={id("reason")} style={{ margin: "8px 0 0", fontSize: 12, color: "#605e5c" }}>
          {reason}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
