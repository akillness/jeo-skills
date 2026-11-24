"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * 插入 › 图表 on a PDF page: the presentation editor's Insert Chart (Office's
 * split command: the button opens Insert Chart's All Charts, the chevron the
 * chart gallery), its pick arming a chart's placement on the page.
 */
import { useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeAllChartsDialog } from "@mrnote/core/web/components/office-ribbon/OfficeAllChartsDialog.tsx";
import {
  CHART_INSERT_ENHANCEMENT_FAMILIES,
  CHART_INSERT_OFFICE_FAMILIES,
  OfficeChartInsertGallery,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartInsertGallery.tsx";
import { OfficeHomeCommand, OfficeHomeMenuTrigger, OfficeHomeSplitLayout } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { DocumentChartStylePreview } from "@mrnote/docs/web/components/console/editor/native-document/DocumentChartStyleGallery.tsx";
import { DropdownMenu, DropdownMenuTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  OFFICE_CHART_DEFAULT_LEAF,
  OFFICE_MAC_CHART_MENU_GROUPS,
  type ChartFamily,
  type ChartSubtype,
} from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { presentationChartFamilyLabel } from "@mrnote/slides/web/lib/presentation-chart-menu.ts";
import { createPresentationChartV2Leaf } from "@mrnote/core/web/lib/presentation-chart-v2.ts";

export function PdfInsertChartCommand({
  disabled,
  onPick,
}: {
  readonly disabled: boolean;
  readonly onPick: (family: ChartFamily, subtype: ChartSubtype) => void;
}) {
  const t = useTranslations("console-notebooks");
  const [allChartsOpen, setAllChartsOpen] = useState(false);
  const label = t("presentation.insert.chart");
  return (
    <>
      <DropdownMenu>
        <OfficeHomeSplitLayout
          testId="pdf-insert-chart-split"
          primary={
            <OfficeHomeCommand
              activation="click"
              variant="large"
              controlId="PDFCTL.RIBBON.INSERT.CHART"
              icon={<OfficeSemanticIcon semanticId="chart.insert" size={24} />}
              label={label}
              disabled={disabled}
              onClick={() => setAllChartsOpen(true)}
              testId="pdf-insert-chart"
            />
          }
          trigger={
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                data-control-id="PDFCTL.RIBBON.INSERT.CHART.MENU"
                disabled={disabled}
                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                label={label}
                title={label}
                testId="pdf-insert-chart-menu"
                variant="icon"
              />
            </DropdownMenuTrigger>
          }
        />
        <RibbonDropdownMenuContent align="start" data-testid="pdf-insert-chart-menu-content">
          <OfficeChartInsertGallery
            application="presentation"
            disabled={disabled}
            selectedFamily={OFFICE_CHART_DEFAULT_LEAF.family}
            selectedSubtype={OFFICE_CHART_DEFAULT_LEAF.subtype}
            familyGroups={OFFICE_MAC_CHART_MENU_GROUPS}
            familyLabel={(family) => presentationChartFamilyLabel(t, family)}
            subtypeLabel={(family, subtype) => t(`toolbar.chartV2.subtype.${family}.${subtype}` as "toolbar.chartV2.subtype.column.clustered")}
            onSelect={(family, subtype) => onPick(family, subtype)}
            testIdPrefix="pdf-chart-gallery"
          />
        </RibbonDropdownMenuContent>
      </DropdownMenu>
      {allChartsOpen ? (
        <OfficeAllChartsDialog
          mode="insert"
          initialFamily={OFFICE_CHART_DEFAULT_LEAF.family}
          initialSubtype={OFFICE_CHART_DEFAULT_LEAF.subtype}
          families={[...CHART_INSERT_OFFICE_FAMILIES, ...CHART_INSERT_ENHANCEMENT_FAMILIES]}
          leafState={() => (disabled ? { enabled: false } : { enabled: true })}
          preview={(family, subtype) => (
            <DocumentChartStylePreview attrs={createPresentationChartV2Leaf(family, subtype, t("toolbar.chartSampleTitle"))} />
          )}
          onConfirm={(choice) => {
            setAllChartsOpen(false);
            if (choice.kind === "template") {
              onPick(choice.template.chartType, choice.template.chartSubtype);
              return;
            }
            onPick(choice.family, choice.subtype);
          }}
          onCancel={() => setAllChartsOpen(false)}
          testIdPrefix="pdf-insert-all-charts"
        />
      ) : null}
    </>
  );
}
