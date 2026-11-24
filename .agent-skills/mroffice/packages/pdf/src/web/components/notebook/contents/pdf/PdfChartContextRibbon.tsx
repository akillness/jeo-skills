"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { normalizeChartBlockAttrs } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import type { PdfChart } from "../../../../lib/pdf/managed-chart";
import type { OfficeTaskPaneDockRegistry } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";

export interface PdfChartContextRibbonProps {
  readonly tab: "chart-design" | "chart-format";
  readonly chart: PdfChart;
  /** The chart's page in points (its frame is a share of it). */
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly writable: boolean;
  readonly onChange: (chart: PdfChart) => void;
  /** A gallery's hovered pick drawn on the chart until the menu closes. */
  readonly onPreview: (attrs: ChartBlockAttrsV2 | null) => void;
  readonly onEditData: () => void;
  /** Format > More Options: the Format tab. */
  readonly onOpenFormat?: () => void;
  /** Where the Format pane docks (the reader's task pane dock). */
  readonly paneDock?: OfficeTaskPaneDockRegistry | null;
}

/** The chart's model as the chart engine reads it (a stored model checked whole). */
export function pdfChartAttrs(chart: PdfChart): ChartBlockAttrsV2 | null {
  const normalized = normalizeChartBlockAttrs(chart.attrs);
  return normalized.source === "v2" && normalized.validation.valid ? normalized.attrs : null;
}
