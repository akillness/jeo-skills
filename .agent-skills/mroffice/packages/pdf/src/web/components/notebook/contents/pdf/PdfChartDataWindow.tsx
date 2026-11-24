"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * 图表 › 编辑数据 on a PDF page: the data window of a chart without a
 * workbook (Docs' ChartDataWindow). What is typed shows on the chart at once
 * (its preview picture) and is written when typing pauses, or on Done: a
 * chart is a native object of the file, not one write per key.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { ChartDataWindow, chartDataWindowLabels } from "@mrnote/docs/web/components/console/editor/extensions/ChartDataWindow.tsx";
import {
  validateChartBlockAttrsV2,
  type ChartBlockAttrsV2,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";

/** How long typing pauses before the chart is written. */
export const PDF_CHART_DATA_WRITE_DELAY_MS = 900;

export function PdfChartDataWindow({ chartId, attrs, onCommit, onPreview, onDone }: {
  readonly chartId: string;
  readonly attrs: ChartBlockAttrsV2;
  readonly onCommit: (attrs: ChartBlockAttrsV2) => void;
  readonly onPreview: (attrs: ChartBlockAttrsV2 | null) => void;
  readonly onDone: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<ChartBlockAttrsV2 | null>(null);
  const shown = draft ?? attrs;
  const pending = useRef<ChartBlockAttrsV2 | null>(null);
  const timer = useRef<number | null>(null);
  const callbacks = useRef({ onCommit, onPreview });
  callbacks.current = { onCommit, onPreview };
  const flush = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    // Only a model the chart engine draws is written (the window lists
    // what is wrong with the rest).
    if (next && validateChartBlockAttrsV2(next).valid) callbacks.current.onCommit(next);
  };
  const change = (next: ChartBlockAttrsV2) => {
    setDraft(next);
    pending.current = next;
    if (validateChartBlockAttrsV2(next).valid) callbacks.current.onPreview(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, PDF_CHART_DATA_WRITE_DELAY_MS);
  };
  // Closed by any path (another chart, the chart deleted, the window gone):
  // what was typed is written.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);
  return (
    <ChartDataWindow
      windowId={`pdf-chart-data-${chartId}`}
      windowTitle={t("block.chart.editData")}
      closeLabel={t("block.chart.done")}
      chartType={shown.chartType}
      title={shown.title ?? ""}
      data={shown.data}
      issues={validateChartBlockAttrsV2(shown).issues}
      labels={chartDataWindowLabels(t)}
      onTitleChange={(title) => change({ ...shown, title })}
      onChange={(data) => change({ ...shown, data })}
      onDone={() => { flush(); onDone(); }}
    />
  );
}
