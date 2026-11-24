"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactElement } from "react";

import {
  OfficeStyleGallery,
  type OfficeStyleGalleryItem,
} from "./OfficeStyleGallery";
import {
  OFFICE_CHART_QUICK_LAYOUT_IDS,
  officeChartQuickLayoutRecipe,
  type OfficeChartQuickLayoutId,
} from "../../lib/office-charts/chart-layout";
import { officeChartQuickLayoutPatch } from "../../lib/office-charts/quick-layout";

/**
 * One Quick Layout tile, drawn from the layout's own recipe so the tile shows
 * exactly what the pick lays out. A column / bar chart's tiles are Excel's
 * calibrated eleven (title, axis titles, legend edge, gridlines major and
 * minor, tick marks, gap width, overlap, series and point labels, data
 * table); any other chart's are the five generic element switches. The three
 * editors draw this one tile.
 */
export function OfficeChartQuickLayoutPreview({
  layoutId,
  calibrated = false,
}: {
  layoutId: OfficeChartQuickLayoutId;
  calibrated?: boolean;
}) {
  const patch = officeChartQuickLayoutPatch(layoutId);
  return calibrated || !patch ? (
    <CalibratedTile layoutId={layoutId} />
  ) : (
    <GenericTile layoutId={layoutId} />
  );
}

function CalibratedTile({ layoutId }: { layoutId: OfficeChartQuickLayoutId }) {
  const recipe = officeChartQuickLayoutRecipe(layoutId);
  const layout = recipe.layout;
  const rightLegend = recipe.legend === "right";
  const topLegend = recipe.legend === "top";
  const bottomLegend = recipe.legend === "bottom";
  const left = layout.axisTitleY ? 28 : 18;
  const right = rightLegend ? 117 : 145;
  const top = layout.title ? (topLegend ? 55 : 39) : 24;
  const bottom = recipe.dataTable
    ? 112
    : bottomLegend || layout.axisTitleX
      ? 127
      : 141;
  const height = bottom - top;
  const barWidth = layout.gapWidth === 0 ? 18 : layout.gapWidth === 300 ? 10 : 14;
  const xs =
    layout.gapWidth === 0
      ? [left + 3, left + 21, left + 39, left + 57, left + 75, left + 93]
      : [left + 8, left + 24, right - 39, right - 23];
  const heights =
    layout.gapWidth === 0
      ? [24, 39, 48, 24, 33, 44]
      : [height * 0.48, height * 0.72, height * 0.59, height * 0.41];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 164 164"
      style={{ width: "100%", height: "100%" }}
      data-chart-quick-layout-preview={layoutId}
    >
      {layout.title ? <rect x="43" y="20" width="75" height="8" fill="#b5d5f3" /> : null}
      {recipe.gridlinesY
        ? Array.from({ length: 4 }, (_, i) => (
            <line key={i} x1={left} y1={top + (i * height) / 4} x2={right} y2={top + (i * height) / 4} stroke="#96bceb" strokeWidth="1.4" />
          ))
        : null}
      {layout.minorGridlinesY
        ? Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={left} y1={top + ((i + 0.5) * height) / 7} x2={right} y2={top + ((i + 0.5) * height) / 7} stroke="#c5d9ed" strokeWidth=".7" />
          ))
        : null}
      {recipe.axisY ? <line x1={left} y1={top} x2={left} y2={bottom} stroke="#80a8d5" strokeWidth="1.5" /> : null}
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#80a8d5" strokeWidth="1.5" />
      {xs.map((x, i) => (
        <rect
          key={i}
          x={x - (layout.overlap > 0 && i % 2 ? 6 : 0)}
          y={bottom - heights[i]}
          width={barWidth}
          height={heights[i]}
          fill={i % 2 ? "#5575aa" : "#b4d2ed"}
          stroke={i % 2 ? "#3f5e93" : "#7298c8"}
          strokeWidth="1.4"
        />
      ))}
      {recipe.axisY
        ? [0, 1, 2, 3].map((i) => (
            <line key={i} x1={left - 10} y1={bottom - (i * height) / 3} x2={left - 4} y2={bottom - (i * height) / 3} stroke="#bad6f1" strokeWidth="3" />
          ))
        : null}
      {[left + 13, (left + right) / 2, right - 17].map((x, i) => (
        <line key={i} x1={x} y1={bottom + 6} x2={x + 12} y2={bottom + 6} stroke="#bad6f1" strokeWidth="3" />
      ))}
      {recipe.dataLabels
        ? xs.map((x, i) => (
            <line key={i} x1={x + 1} y1={bottom - heights[i] - 5} x2={x + barWidth - 1} y2={bottom - heights[i] - 5} stroke="#7596c2" strokeWidth="3" />
          ))
        : null}
      {layoutId === "layout-6"
        ? [0, 1].map((i) => (
            <line key={i} x1={right - 23} y1={top + 13 + i * 18} x2={right + 5} y2={top + 13 + i * 18} stroke="#7596c2" strokeWidth="3" />
          ))
        : null}
      {layoutId === "layout-10"
        ? [0, 2].map((i) => (
            <line key={i} x1={xs[i] + 2} y1={bottom - heights[i] + 12} x2={xs[i] + barWidth - 2} y2={bottom - heights[i] + 12} stroke="#7596c2" strokeWidth="3" />
          ))
        : null}
      {layout.axisTitleY ? <rect x="8" y={top + 8} width="5" height={height - 16} fill="#bad6f1" /> : null}
      {layout.axisTitleX ? <rect x={(left + right) / 2 - 30} y="153" width="60" height="5" fill="#bad6f1" /> : null}
      {recipe.legend !== "none" ? (
        <g transform={rightLegend ? "translate(125 64)" : topLegend ? "translate(47 36)" : "translate(46 148)"}>
          <rect width={rightLegend ? 27 : 73} height={rightLegend ? 34 : 12} fill="#d5e6f7" stroke="#83a9d8" />
          {(rightLegend ? [8, 17, 26] : [7, 23, 39, 55]).map((v, i) => (
            <g key={i} transform={rightLegend ? `translate(5 ${v})` : `translate(${v} 6)`}>
              <rect width="4" height="3" y="-1.5" fill="#5575aa" />
              <line x1="7" y1="0" x2="13" y2="0" stroke="#80a8d5" strokeWidth="1.8" />
            </g>
          ))}
        </g>
      ) : null}
      {recipe.dataTable ? (
        <g>
          <rect x="10" y="118" width="145" height="29" fill="none" stroke="#83a9d8" />
          <path d="M10 132H155 M34 118V147 M76 118V147 M115 118V147" stroke="#83a9d8" />
          {[125, 140].map((y) => (
            <g key={y}>
              <rect x="17" y={y - 2} width="5" height="4" fill="#7596c2" />
              {[47, 87, 127].map((x) => (
                <line key={x} x1={x} y1={y} x2={x + 17} y2={y} stroke="#7596c2" strokeWidth="3" />
              ))}
            </g>
          ))}
        </g>
      ) : null}
      {layout.majorTickY === "out"
        ? [0, 1, 2, 3].map((i) => (
            <line key={i} x1={left - 4} y1={bottom - (i * height) / 3} x2={left} y2={bottom - (i * height) / 3} stroke="#7596c2" />
          ))
        : null}
      {layout.majorTickX === "out"
        ? [left + 16, (left + right) / 2, right - 14].map((x) => (
            <line key={x} x1={x} y1={bottom} x2={x} y2={bottom + 4} stroke="#5575aa" />
          ))
        : null}
    </svg>
  );
}

function GenericTile({ layoutId }: { layoutId: OfficeChartQuickLayoutId }) {
  const patch = officeChartQuickLayoutPatch(layoutId)!;
  const plotBottom = patch.dataTable ? 33 : 40;
  return (
    <svg
      aria-hidden="true"
      data-chart-quick-layout-preview={layoutId}
      viewBox="0 0 72 48"
      width="72"
      height="48"
    >
      <rect x="0.5" y="0.5" width="71" height="47" rx="3" fill="#fff" stroke="#cbd5e1" />
      <rect x="25" y="4" width="22" height="2" rx="1" fill="#64748b" />
      {patch.legend === "top" ? (
        <g fill="#64748b">
          <circle cx="29" cy="9" r="1.3" />
          <circle cx="43" cy="9" r="1.3" />
        </g>
      ) : null}
      {patch.axes ? (
        <path d={`M14 12V${plotBottom}H61`} fill="none" stroke="#64748b" strokeWidth="1" />
      ) : null}
      {patch.gridlines ? (
        <g stroke="#cbd5e1" strokeWidth="0.7">
          <line x1="14" y1="18" x2="61" y2="18" />
          <line x1="14" y1="25" x2="61" y2="25" />
        </g>
      ) : null}
      <g>
        <rect x="20" y={plotBottom - 10} width="7" height="10" rx="1" fill="#2563eb" />
        <rect x="32" y={plotBottom - 16} width="7" height="16" rx="1" fill="#0f766e" />
        <rect x="44" y={plotBottom - 13} width="7" height="13" rx="1" fill="#f59e0b" />
      </g>
      {patch.dataLabels ? (
        <g fill="#334155" fontSize="4" textAnchor="middle">
          <text x="23.5" y={plotBottom - 11}>4</text>
          <text x="35.5" y={plotBottom - 17}>7</text>
          <text x="47.5" y={plotBottom - 14}>6</text>
        </g>
      ) : null}
      {patch.dataTable ? (
        <g fill="none" stroke="#94a3b8" strokeWidth="0.6">
          <rect x="14" y="35" width="47" height="9" />
          <line x1="14" y1="39.5" x2="61" y2="39.5" />
          <line x1="29.5" y1="35" x2="29.5" y2="44" />
          <line x1="45" y1="35" x2="45" y2="44" />
        </g>
      ) : null}
      {patch.legend === "bottom" ? (
        <g fill="#64748b">
          <circle cx="29" cy="44" r="1.3" />
          <circle cx="43" cy="44" r="1.3" />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * Chart Design ▸ Quick Layout, the one gallery of the three editors: the
 * catalogue's layouts as tiles, Office's Live Preview on hover and focus
 * (`onPreview`), and a pick committed by the host (`onCommit`). A host passes
 * which layouts its chart takes and why the rest are refused, its trigger, and
 * its own test ids.
 */
export function OfficeChartQuickLayoutGallery({
  application,
  calibrated,
  available,
  disabledReason,
  value,
  labels,
  trigger,
  className,
  menuClassName,
  menuMode,
  testIdPrefix,
  onPreview,
  onCommit,
}: {
  application: "docs" | "spreadsheet" | "presentation";
  calibrated: boolean;
  /** The reason a layout is refused, or null when the chart takes it. */
  available: (id: OfficeChartQuickLayoutId) => string | null;
  disabledReason?: string | null;
  value: OfficeChartQuickLayoutId | null;
  labels: {
    ariaLabel: string;
    more: string;
    item: (index: number) => string;
  };
  trigger: ReactElement;
  className?: string;
  menuClassName?: string;
  menuMode?: "labeled" | "preview-only";
  testIdPrefix: string;
  onPreview: (id: OfficeChartQuickLayoutId | null) => void;
  onCommit: (id: OfficeChartQuickLayoutId) => void;
}) {
  const items: OfficeStyleGalleryItem<OfficeChartQuickLayoutId>[] =
    OFFICE_CHART_QUICK_LAYOUT_IDS.map((id, index) => {
      const reason = disabledReason ?? available(id);
      return {
        id,
        label: labels.item(index + 1),
        ...(reason ? { disabled: true, disabledReason: reason } : {}),
      };
    });
  return (
    <OfficeStyleGallery<OfficeChartQuickLayoutId>
      application={application}
      ariaLabel={labels.ariaLabel}
      className={className}
      menuClassName={menuClassName}
      // Office's Quick Layout sheet: three square thumbnails a row.
      menuGrid={{ columns: 3, thumbnail: [100, 100] }}
      menuMode={menuMode}
      disabled={Boolean(disabledReason)}
      items={items}
      labels={{ more: labels.more }}
      quickIds={[]}
      menuTrigger={trigger}
      renderPreview={(item) => (
        <OfficeChartQuickLayoutPreview layoutId={item.id} calibrated={calibrated} />
      )}
      testIdPrefix={testIdPrefix}
      value={value}
      onPreviewChange={onPreview}
      onCommit={onCommit}
    />
  );
}
