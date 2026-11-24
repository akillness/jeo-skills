"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { officeChartHiddenEmptyCellsMenu } from "@mrnote/core/web/components/office-ribbon/OfficeChartDesignRibbon.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { DropdownMenu, DropdownMenuTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { chartWithElementIntent } from "@mrnote/core/web/lib/office-charts/chart-elements.ts";

/**
 * Select Data Source ▸ Hidden and Empty Cells... for a deck chart whose data
 * is its workbook: PowerPoint opens it from the chart's data source, not the
 * ribbon (PPT-A150), so it sits beside the data range on the chart's workbook
 * window. The one Show empty cells as list (`officeChartHiddenEmptyCellsMenu`)
 * the other hosts draw, applied as the deck applies every element intent.
 */
export function PresentationChartHiddenCellsMenu({
  attrs,
  onCommit,
}: {
  attrs: ChartBlockAttrsV2;
  onCommit: (attrs: ChartBlockAttrsV2) => boolean;
}) {
  const t = useTranslations("console-notebooks");
  const menu = officeChartHiddenEmptyCellsMenu(attrs, {
    translate: t,
    onIntent: (intent) => {
      const next = chartWithElementIntent(attrs, intent);
      if (next) onCommit(next);
    },
  });
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={menu.disabled}>
        <button
          type="button"
          disabled={menu.disabled}
          title={menu.disabledReason}
          data-testid="presentation-chart-workbook-hidden-empty"
        >
          {t("spreadsheet.selectDataSource.hiddenAndEmptyCells")}...
        </button>
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent align="start">
        {typeof menu.items === "function" ? menu.items() : menu.items}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}
