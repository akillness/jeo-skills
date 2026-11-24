"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One chart block as the edit canvas draws it.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import {
  presentationChartAreaFillState,
  presentationChartFallbackPicture,
  presentationChartHostBackground,
  PresentationChartVisual,
} from "./PresentationChartVisual";
import {
  presentationChartV2DataWritable,
  presentationChartV2DataShapeWritable,
} from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import {
  dispatchOfficeChartHit,
  OFFICE_CHART_HIT_EVENT,
  officeChartPicturePartAt,
  type OfficeChartHitEventDetail,
} from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import { useEffect, useRef } from "react";
import { PresentationChartContextRibbon } from "./PresentationChartContextRibbon";
import { geometryNumber, hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { presentationImportedChartLook } from "@mrnote/core/web/lib/presentation-chart-display.ts";
import { readPreservedObjectNotice } from "@mrnote/core/web/lib/presentation-preserved-object.ts";
import { PresentationPreservedObjectNotice } from "./PresentationPreservedObjectNotice";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { DocumentChartAreaStyleKey } from "@mrnote/core/web/components/console/editor/native-document/DocumentChartFormatRibbon.tsx";
import type { PresentationChartBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import type { DocumentChartWorkbook } from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbook.ts";
import type { PresentationWebRibbonTab } from "../../../../lib/presentation/ribbon-tabs";
import type { BlockGeometry } from "@mrnote/core/web/lib/presentation-drag.ts";
import type { ChartTextPart } from "@mrnote/core/web/lib/engine-host/charts-types.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCanvasChartBlockCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  /** The Format ribbon's Current Selection memory key for a selected chart (PPT-B436). */
  chartRibbonIdentity: (blockId: string) => object;
  locale: string;
  setChartFormatFocus: Dispatch<SetStateAction<{ area: DocumentChartAreaStyleKey; token: number; } | null>>;
  chartFormatFocusTokenRef: RefObject<number>;
  chartTitleEdit: { blockId: string; kind: ChartTextPart } | null;
  setChartTitleEdit: Dispatch<SetStateAction<{ blockId: string; kind: ChartTextPart } | null>>;
  chartDesktopPreview: { blockId: string; attrs: NonNullable<PresentationChartBlock["chartV2"]>; } | null;
  setChartDesktopPreview: Dispatch<SetStateAction<{ blockId: string; attrs: NonNullable<PresentationChartBlock["chartV2"]>; } | null>>;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  themeAccentColors: string[];
  contextualChartBlock: PresentationChartBlock | null;
  chartDesktopAttrs: ChartBlockAttrsV2 | null;
  linkedChartDataReason: string;
  literalChartDataShapeReason: string;
  chartTypeLockReason: (block: PresentationChartBlock) => string | null;
  chartLockNotice: (block: PresentationChartBlock) => string | null;
  chartReadOnlyReason: (block: PresentationChartBlock) => string | null;
  chartTitleLockReason: (block: PresentationChartBlock) => string | null;
  commitChartDesktop: (expected: PresentationChartBlock, attrs: NonNullable<PresentationChartBlock["chartV2"]>, book?: DocumentChartWorkbook, resultsOnly?: boolean) => boolean;
  openChartWorkbook: (block: PresentationChartBlock) => void;
  /** Format Chart Area: the Format pane on the chart's own area. */
  openChartAreaFormat: () => void;
  selectPresentationRibbonTab: (key: PresentationWebRibbonTab, options?: { preserveFocus?: boolean; }) => void;
  block: PresentationChartBlock;
  isSelected: boolean;
  importedPptxBlock: boolean;
  previewGeom: BlockGeometry | undefined;
}

export function PresentationCanvasChartBlock({ ctl }: { ctl: PresentationCanvasChartBlockCtl }) {
  const {
    t,
    locale,
    setChartFormatFocus,
    chartFormatFocusTokenRef,
    chartDesktopPreview,
    setChartDesktopPreview,
    themeAccentColors,
    contextualChartBlock,
    chartDesktopAttrs,
    linkedChartDataReason,
    literalChartDataShapeReason,
    chartTypeLockReason,
    chartLockNotice,
    chartReadOnlyReason,
    chartRibbonIdentity,
    chartTitleLockReason,
    commitChartDesktop,
    openChartWorkbook,
    openChartAreaFormat,
    selectPresentationRibbonTab,
    block,
    isSelected,
    importedPptxBlock,
    previewGeom,
  } = ctl;
  // Whether the picture named an element for the double-click now being
  // handled: it reports one (a series, a point, the legend, the plot area...)
  // before the click bubbles up here, and opens the Format pane on it.
  const elementOpenedRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onHit = (event: Event) => {
      if ((event as CustomEvent<OfficeChartHitEventDetail>).detail?.open) elementOpenedRef.current = true;
    };
    body.addEventListener(OFFICE_CHART_HIT_EVENT, onHit);
    return () => body.removeEventListener(OFFICE_CHART_HIT_EVENT, onHit);
  }, []);
  return (
                    <div
                      ref={bodyRef}
                      className="presentation-window__chart-block"
                      data-testid="presentation-chart-block"
                      data-chart-area-fill={presentationChartAreaFillState(block)}
                      onDoubleClickCapture={() => {
                        elementOpenedRef.current = false;
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        // PowerPoint: a double-click on a chart element opens
                        // the Format pane on that element; on a title or an
                        // axis title it types in it, in the chart's own drawing
                        // of it (the picture's hit begins that edit). It never
                        // opens the chart's data (Edit Data does).
                        const part = officeChartPicturePartAt(event.currentTarget, event.clientX, event.clientY);
                        if (part === "title" || part === "axisX" || part === "axisY") {
                          // One the block handed here (its move gesture holds
                          // the pointer) never reached the picture: it is
                          // reported as the picture reports its own.
                          if (!(event.target instanceof Element && event.target.closest('[data-testid="presentation-chart-display"]')))
                            dispatchOfficeChartHit(event.currentTarget, { seriesName: "", dataIndex: null, part }, true, false, {
                              at: { clientX: event.clientX, clientY: event.clientY },
                            });
                          return;
                        }
                        // Nothing else under the pointer: the chart area,
                        // Format Chart Area.
                        if (!elementOpenedRef.current) openChartAreaFormat();
                      }}
                      style={{
                        background: presentationChartHostBackground(block, importedPptxBlock),
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                        padding: 0,
                      }}
                    >
                      {isSelected &&
                      contextualChartBlock?.id === block.id &&
                      chartDesktopAttrs ? (
                        // PowerPoint's Chart Elements, Chart Styles and Chart
                        // Filters buttons beside the selected chart, on the
                        // Chart Design tab's own rows, palettes and gallery.
                        <PresentationChartContextRibbon
                          tab="chart-quick"
                          locale={locale}
                          accentColors={themeAccentColors}
                          size={{
                            widthEmu: geometryNumber(block, "width") ?? 5_486_400,
                            heightEmu: geometryNumber(block, "height") ?? 3_127_200,
                          }}
                          onSize={() => false}
                          arrange={null}
                          insertShapes={null}
                          paneContainer={null}
                          attrs={chartDesktopAttrs}
                          workbook={block.chartWorkbook}
                          identity={chartRibbonIdentity(block.id)}
                          authority={block}
                          nativeLook={presentationImportedChartLook(block, chartDesktopAttrs)}
                          disabledReason={chartReadOnlyReason(block) ?? chartLockNotice(block)}
                          dataDisabledReason={presentationChartV2DataWritable(block) ? null : linkedChartDataReason}
                          dataShapeDisabledReason={presentationChartV2DataShapeWritable(block) ? null : literalChartDataShapeReason}
                          changeTypeDisabledReason={chartTypeLockReason(block)}
                          titleDisabledReason={chartTitleLockReason(block)}
                          onCommit={(attrs, book) => commitChartDesktop(block, attrs, book)}
                          onPreview={(attrs) =>
                            setChartDesktopPreview(attrs ? { blockId: block.id, attrs } : null)
                          }
                          onEditData={() => openChartWorkbook(block)}
                          onOpenFormat={(area) => {
                            chartFormatFocusTokenRef.current += 1;
                            setChartFormatFocus({ area, token: chartFormatFocusTokenRef.current });
                            selectPresentationRibbonTab("chart-format");
                          }}
                        />
                      ) : null}
                      <PresentationChartVisual
                        editor
                        selected={isSelected}
                        liveSize={previewGeom ? { width: previewGeom.width, height: previewGeom.height } : undefined}
                        block={chartDesktopPreview?.blockId===block.id ? {...block,chartV2:chartDesktopPreview.attrs} : block}
                      />
                      {(() => {
                        const preserved = readPreservedObjectNotice(
                          block as unknown as Record<string, unknown>,
                        );
                        // The picture PowerPoint saved of the chart is drawn
                        // in its place (PresentationChartVisual): no notice
                        // over it.
                        return preserved && !presentationChartFallbackPicture(block) ? (
                          <PresentationPreservedObjectNotice
                            notice={preserved}
                            label={t(
                              `presentation.preservedObject.${preserved.kind}`,
                            )}
                          />
                        ) : null;
                      })()}
                      {!hasLayoutGeometry(block) && block.ranges?.length ? (
                        <small>{block.ranges.slice(0, 2).join(" · ")}</small>
                      ) : null}
                    </div>
  );
}
