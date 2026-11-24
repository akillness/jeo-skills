"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { THEME_HEADING_CELL_STYLE_IDS } from "../../../../lib/spreadsheet/theme-buttons";
import { type ComponentProps, type CSSProperties } from "react";
import { officeFormatPreviewHandlers, useOfficeFormatPreview } from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { type NamedCellStyle } from "../../../../lib/spreadsheet/cell-styles";
import { spreadsheetCellStyleLabel, spreadsheetCellStyleGroupLabel } from "../../../../lib/spreadsheet/gallery-labels";
import { DropdownMenuItem } from "./SpreadsheetRibbonControls";
import { type NamedCellStyleGroup } from "../../../../lib/spreadsheet/cell-styles";
import { type Dispatch, type SetStateAction } from "react";

/** What spreadsheetCellStyleGalleryRenderer reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetCellStyleGalleryRendererInputs {
  cellStyleGalleryGroups: readonly NamedCellStyleGroup[];
  cellStylePressed: (styleId: string) => boolean | "mixed" | undefined;
  executeHomeCellStyle: (styleId: string) => void;
  setCellStyleMenu: Dispatch<SetStateAction<{ x: number; y: number; styleId: string; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  visibleCommandMenuProps: (controlId: string, accessibleLabel?: string, selectionReason?: string) => { "data-control-id": string; "aria-label": string | undefined; disabled: boolean; hidden: boolean; title: string | undefined; };
  workbookThemeHeadingFontFamily: string;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
// What the press writes (applyNamedCellStyle), one object a style, so that a
// row entered and focused previews once.
const CELL_STYLE_PREVIEWS = new WeakMap<NamedCellStyle, Readonly<Record<string, unknown>>>();
function cellStylePreviewOf(style: NamedCellStyle) {
  let preview = CELL_STYLE_PREVIEWS.get(style);
  if (!preview) {
    preview = Object.freeze({ ...style.patch, themeFontRole: THEME_HEADING_CELL_STYLE_IDS.has(style.id) ? "heading" : undefined });
    CELL_STYLE_PREVIEWS.set(style, preview);
  }
  return preview;
}

function CellStyleGalleryTile({ cellStyle, ...props }: ComponentProps<typeof DropdownMenuItem> & { cellStyle: Readonly<Record<string, unknown>> }) {
  const preview = useOfficeFormatPreview();
  return <DropdownMenuItem {...props} {...officeFormatPreviewHandlers(preview, { cellStyle })} />;
}

export function spreadsheetCellStyleGalleryRenderer({
  cellStyleGalleryGroups,
  cellStylePressed,
  executeHomeCellStyle,
  setCellStyleMenu,
  t,
  visibleCommandMenuProps,
  workbookThemeHeadingFontFamily,
}: SpreadsheetCellStyleGalleryRendererInputs) {
  const cellStyleDisplayLabel = (style: NamedCellStyle) =>
    spreadsheetCellStyleLabel(style, t);
  const themedCellStyleDisplayOrder = (style: NamedCellStyle) => {
    const match = /^accent-(\d+)-(20|40|60|100)$/.exec(style.id);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const accent = Number(match[1]);
    const strength = Number(match[2]);
    const strengthIndex = [20, 40, 60, 100].indexOf(strength);
    return strengthIndex * 6 + accent;
  };
  const cellStyleSwatchStyle = (style: NamedCellStyle): CSSProperties => {
    const textDecorations = [
      style.patch.underline ? "underline" : null,
      style.patch.strikethrough ? "line-through" : null,
    ].filter(Boolean);
    return {
      background: style.patch.backgroundColor || "#ffffff",
      border: style.patch.border ? "1px solid currentColor" : undefined,
      borderBottom: style.patch.borderBottom
        ? "2px solid currentColor"
        : undefined,
      borderTop: style.patch.borderTop
        ? "2px solid currentColor"
        : undefined,
      color: style.patch.color || undefined,
      fontFamily:
        style.patch.fontFamily ||
        (THEME_HEADING_CELL_STYLE_IDS.has(style.id)
          ? workbookThemeHeadingFontFamily
          : undefined),
      fontSize:
        typeof style.patch.fontSize === "number"
          ? Math.min(style.patch.fontSize, 18)
          : undefined,
      fontStyle: style.patch.italic ? "italic" : undefined,
      fontWeight: style.patch.bold ? 700 : 400,
      textDecorationLine: textDecorations.length
        ? textDecorations.join(" ")
        : undefined,
      textDecorationStyle:
        style.patch.underlineStyle === "double" ? "double" : undefined,
    };
  };
  const renderCellStyleGallery = () => {
    return (
      <div
        className={spreadsheetHomeStyles.cellStyleGallery}
        data-office-text-format-control="true"
        data-testid="spreadsheet-ribbon-home-cell-style-gallery"
      >
        {cellStyleGalleryGroups.map((group) => {
          const displayStyles =
            group.id === "themed"
              ? [...group.styles].sort(
                  (left, right) =>
                    themedCellStyleDisplayOrder(left) -
                    themedCellStyleDisplayOrder(right),
                )
              : group.styles;
          return (
            <section
              key={group.id}
              className={spreadsheetHomeStyles.cellStyleGroup}
              data-cell-style-group={group.id}
            >
              <div
                className={spreadsheetHomeStyles.cellStyleGroupLabel}
                role="presentation"
              >
                {spreadsheetCellStyleGroupLabel(group, t)}
              </div>
              <div
                className={spreadsheetHomeStyles.cellStyleGroupGrid}
                role="group"
                aria-label={spreadsheetCellStyleGroupLabel(group, t)}
              >
                {displayStyles.map((named) => {
                const pressed = cellStylePressed(named.id);
                const label = cellStyleDisplayLabel(named);
                const swatch = (
                  <span
                    aria-hidden="true"
                    className={spreadsheetHomeStyles.cellStyleSwatch}
                    data-cell-style-label-inside="true"
                    style={cellStyleSwatchStyle(named)}
                  >
                    <span
                      className={spreadsheetHomeStyles.cellStyleSwatchLabel}
                    >
                      {label}
                    </span>
                  </span>
                );
                const active =
                  pressed === true
                    ? "true"
                    : pressed === "mixed"
                      ? "mixed"
                      : undefined;
                return (
                  <CellStyleGalleryTile
                    key={named.id}
                    cellStyle={cellStylePreviewOf(named)}
                    className={spreadsheetHomeStyles.cellStyleTile}
                    role="menuitemcheckbox"
                    aria-checked={pressed}
                    data-active={active}
                    data-testid={`spreadsheet-ribbon-home-cell-style-${named.id}`}
                    data-control-occurrence-id={`style:${named.id}`}
                    data-control-surface="home-ribbon-cell-style"
                    onSelect={() => executeHomeCellStyle(named.id)}
                    // XLS-A012: Excel's right-click menu on a gallery style
                    // (Apply, Modify…, Duplicate…, Delete for a custom one).
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setCellStyleMenu({ x: event.clientX, y: event.clientY, styleId: named.id });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
                      event.preventDefault();
                      const box = event.currentTarget.getBoundingClientRect();
                      setCellStyleMenu({ x: box.left, y: box.bottom, styleId: named.id });
                    }}
                    {...visibleCommandMenuProps(
                      "XLSCTL.HOME.STYLE.CELL_STYLE_APPLY",
                      label,
                    )}
                  >
                    {swatch}
                  </CellStyleGalleryTile>
                );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };
  return {
    renderCellStyleGallery,
  };
}
