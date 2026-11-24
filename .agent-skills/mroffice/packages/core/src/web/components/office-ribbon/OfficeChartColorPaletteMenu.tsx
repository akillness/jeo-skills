"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment } from "react";
import { useTranslations } from "../../../host/next-intl";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../ui/dropdown-menu";
import {
  CHART_COLOR_PALETTE_IDS,
  CHART_COLOR_PALETTES,
  DEFAULT_CHART_THEME_ACCENTS,
  chartColorPaletteColors,
  type ChartColorPaletteId,
} from "../../lib/office-charts/chart-color-palettes";
import { officePreviewIgnoresPointer } from "./officeFormatPreview";

const GROUPS = ["colorful", "monochromatic"] as const;

/** The swatches a gallery row shows: Office's row of six. */
const ROW_SWATCHES = 6;

/**
 * Chart Design ▸ Change Colors, in the Docs, deck and worksheet ribbons: the
 * four Colorful and thirteen Monochromatic palettes of the one shared table,
 * laid out as Office's gallery - each palette a row of six swatches drawn
 * against the chart's own theme accents, its name on the tooltip, the picked
 * row outlined. Docs and the deck commit the pick as
 * `format.colorPalette` through `chartWithColorPalette`; the worksheet writes
 * it as its chart's `chartColorPalette`.
 *
 * Office's Live Preview shows a gallery choice on the chart while the pointer
 * rests on it, before anything is committed. A host that can preview
 * passes `onPreview`; it is told the hovered or focused palette and `null`
 * when the pointer or focus leaves. The words come from the catalogue
 * (`office.chartColors.*`); `labels` lets a host supply its own.
 */
export function OfficeChartColorPaletteMenuItems({
  active,
  accents = DEFAULT_CHART_THEME_ACCENTS,
  onSelect,
  onPreview,
  labels,
  testIdPrefix,
}: {
  active: ChartColorPaletteId | null;
  accents?: readonly string[];
  onSelect: (paletteId: ChartColorPaletteId) => void;
  onPreview?: (paletteId: ChartColorPaletteId | null) => void;
  labels?: {
    group: (group: (typeof GROUPS)[number]) => string;
    palette: (group: (typeof GROUPS)[number], index: number) => string;
  };
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const groupLabel = (group: (typeof GROUPS)[number]) =>
    labels?.group(group) ??
    t(
      group === "colorful"
        ? "office.chartColors.colorful"
        : "office.chartColors.monochromatic",
    );
  const paletteLabel = (group: (typeof GROUPS)[number], index: number) =>
    labels?.palette(group, index) ??
    t(
      group === "colorful"
        ? "office.chartColors.colorfulPalette"
        : "office.chartColors.monochromaticPalette",
      { index },
    );
  return (
    <DropdownMenuRadioGroup
      value={active ?? ""}
      // Office's gallery: a heading per group and one row of large swatches
      // per palette, its name only on the tooltip, the whole list scrolling
      // under a fixed height (seventeen rows do not fit a menu).
      className="office-chart-color-gallery"
      style={{ maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain" }}
    >
      {GROUPS.map((group) => (
        <Fragment key={group}>
          <DropdownMenuLabel>{groupLabel(group)}</DropdownMenuLabel>
          {CHART_COLOR_PALETTE_IDS.filter(
            (id) => CHART_COLOR_PALETTES[id].group === group,
          ).map((id, index) => {
            const name = paletteLabel(group, index + 1);
            const selected = active === id;
            return (
              <DropdownMenuRadioItem
                key={id}
                value={id}
                title={name}
                aria-label={name}
                data-testid={`${testIdPrefix}-${id}`}
                data-selected={selected ? "true" : undefined}
                // The shared item, through the same menu module as the rest of
                // the ribbon; a palette row shows its swatches, not the radio
                // dot (the first span is the item's indicator).
                className="px-2 py-1 text-base [&>span:first-child]:hidden"
                style={{
                  boxShadow: selected
                    ? "inset 0 0 0 2px var(--user-theme-accent, #2563eb)"
                    : undefined,
                }}
                onSelect={() => {
                  onPreview?.(null);
                  onSelect(id);
                }}
                onPointerEnter={
                  onPreview
                    ? (event) => {
                        if (!officePreviewIgnoresPointer(event)) onPreview(id);
                      }
                    : undefined
                }
                onPointerLeave={onPreview ? () => onPreview(null) : undefined}
                onFocus={onPreview ? () => onPreview(id) : undefined}
                onBlur={onPreview ? () => onPreview(null) : undefined}
              >
                <span aria-hidden="true" style={{ display: "flex", gap: 3 }}>
                  {chartColorPaletteColors(id, accents, ROW_SWATCHES).map((color, swatch) => (
                    <span
                      key={swatch}
                      style={{
                        background: color,
                        border: "1px solid rgb(15 23 42 / 14%)",
                        height: 22,
                        width: 32,
                      }}
                    />
                  ))}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </Fragment>
      ))}
    </DropdownMenuRadioGroup>
  );
}
