"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";

import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { officeThemeLabel } from "@mrnote/core/web/lib/office-theme-catalog.ts";
import type { OfficeThemeFontSet } from "@mrnote/core/web/lib/office-theme-fonts.ts";
import {
  SPREADSHEET_THEME_COLOR_GALLERY,
  spreadsheetThemePalettePreviewColors,
} from "@mrnote/core/web/lib/spreadsheet/color-palette.ts";
import {
  SPREADSHEET_THEME_FONT_GALLERY,
  type SpreadsheetThemeFontSetId,
} from "@mrnote/core/web/lib/spreadsheet/workbook-theme.ts";

import styles from "./SpreadsheetThemeAxisGallery.module.css";

export interface SpreadsheetThemeColorGalleryProps {
  readonly disabled?: boolean;
  readonly locale?: string;
  readonly onValueChange: (colorId: string) => void;
  /** The gallery entry with the workbook's colors, or "" for its own. */
  readonly value: string;
  /**
   * The gallery is Office's one Colors list, shared with PowerPoint's
   * Design > Variants > Colors; each host names its own test ids.
   */
  readonly testId?: string;
  readonly itemTestIdPrefix?: string;
}

export interface SpreadsheetThemeFontGalleryProps {
  readonly disabled?: boolean;
  readonly locale?: string;
  readonly showEastAsianFaces: boolean;
  /** The Fonts list as this host's application has it (Word's Office body font is Aptos). */
  readonly fonts?: readonly OfficeThemeFontSet[];
  readonly onValueChange: (fontId: SpreadsheetThemeFontSetId) => void;
  readonly value: SpreadsheetThemeFontSetId;
  /**
   * The gallery is Office's one Fonts list, shared with PowerPoint's
   * Design > Variants > Fonts; each host names its own test ids.
   */
  readonly testId?: string;
  readonly itemTestIdPrefix?: string;
  /**
   * Office's Custom section, above the Office one: the theme font sets the
   * host holds by name (Create New Theme Fonts' saves), each a value of
   * its own (`custom:<id>`).
   */
  readonly customFonts?: readonly SpreadsheetThemeCustomFontSet[];
  readonly customHeading?: string;
  /** Customize Fonts...: the gallery's last command, opening Create New Theme Fonts. */
  readonly onCustomize?: () => void;
  readonly customizeLabel?: string;
}

/** One Custom-section entry of the Fonts gallery. */
export interface SpreadsheetThemeCustomFontSet {
  readonly id: string;
  readonly name: string;
  readonly headingLatin: string;
  readonly bodyLatin: string;
  readonly headingEastAsia?: string;
  readonly bodyEastAsia?: string;
}

export function SpreadsheetThemeColorGallery({
  disabled = false,
  locale,
  onValueChange,
  value,
  testId = "spreadsheet-theme-color-gallery",
  itemTestIdPrefix = "spreadsheet-ribbon-page-layout-color-",
}: SpreadsheetThemeColorGalleryProps) {
  return (
    <div className={styles.body} data-testid={testId}>
      <div className={styles.heading}>Office</div>
      <div
        className={styles.scrollArea}
        data-testid={testId + "-scroll"}
      >
        <DropdownMenuRadioGroup
          className={styles.colorList}
          value={value}
          onValueChange={onValueChange}
        >
          {SPREADSHEET_THEME_COLOR_GALLERY.map((palette) => {
            const label = officeThemeLabel(palette.name, locale);
            return (
              <DropdownMenuRadioItem
                key={palette.id}
                value={palette.id}
                aria-label={label}
                className={styles.colorRow}
                data-selected={palette.id === value ? "true" : undefined}
                data-testid={itemTestIdPrefix + palette.id}
                disabled={disabled}
                title={label}
              >
                <span className={styles.swatches} aria-hidden="true">
                  {spreadsheetThemePalettePreviewColors(palette.id).map(
                    (color, index) => (
                      <span
                        key={palette.id + ":" + index}
                        data-theme-color-swatch={index}
                        style={{ backgroundColor: color }}
                      />
                    ),
                  )}
                </span>
                <span className={styles.colorLabel}>{label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </div>
    </div>
  );
}

export function SpreadsheetThemeFontGallery({
  disabled = false,
  locale,
  showEastAsianFaces,
  fonts = SPREADSHEET_THEME_FONT_GALLERY,
  onValueChange,
  value,
  testId = "spreadsheet-theme-font-gallery",
  itemTestIdPrefix = "spreadsheet-ribbon-page-layout-font-",
  customFonts = [],
  customHeading,
  onCustomize,
  customizeLabel,
}: SpreadsheetThemeFontGalleryProps) {
  const row = (
    id: string,
    label: string,
    headingFace: string,
    bodyFace: string,
    headingFamily: string,
    bodyFamily: string,
  ) => (
    <DropdownMenuRadioItem
      key={id}
      value={id}
      aria-label={label + ": " + headingFace + ", " + bodyFace}
      className={styles.fontRow}
      data-selected={id === value ? "true" : undefined}
      data-testid={itemTestIdPrefix + id}
      disabled={disabled}
      title={label}
    >
      <span
        className={styles.fontPreview}
        aria-hidden="true"
        style={{ fontFamily: headingFamily } as CSSProperties}
      >
        Aa
      </span>
      <span className={styles.fontDetails}>
        <span className={styles.fontName}>{label}</span>
        <span className={styles.fontFace} style={{ fontFamily: headingFamily } as CSSProperties}>
          {headingFace}
        </span>
        <span className={styles.fontFace} style={{ fontFamily: bodyFamily } as CSSProperties}>
          {bodyFace}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
  const quoted = (family: string) => `"${family.replace(/["\\]/g, "")}"`;
  return (
    <div className={styles.body} data-testid={testId}>
      {/* With no Custom section the one heading stays above the list. */}
      {customFonts.length ? null : <div className={styles.heading}>Office</div>}
      <div
        className={styles.scrollArea}
        data-testid={testId + "-scroll"}
      >
        <DropdownMenuRadioGroup
          className={styles.fontList}
          value={value}
          onValueChange={(fontId) =>
            onValueChange(fontId as SpreadsheetThemeFontSetId)
          }
        >
          {customFonts.length ? (
            <>
              <div className={styles.heading} data-testid={testId + "-custom-heading"}>
                {customHeading ?? "Custom"}
              </div>
              {customFonts.map((font) => {
                const headingFace = (showEastAsianFaces && font.headingEastAsia) || font.headingLatin;
                const bodyFace = (showEastAsianFaces && font.bodyEastAsia) || font.bodyLatin;
                return row(
                  `custom:${font.id}`,
                  font.name,
                  headingFace,
                  bodyFace,
                  quoted(headingFace),
                  quoted(bodyFace),
                );
              })}
            </>
          ) : null}
          {customFonts.length ? <div className={styles.heading}>Office</div> : null}
          {fonts.map((font) => {
            const label = officeThemeLabel(font.label, locale);
            const headingFace =
              (showEastAsianFaces && font.headingEastAsia) || font.headingLatin;
            const bodyFace =
              (showEastAsianFaces && font.bodyEastAsia) || font.bodyLatin;
            return row(font.id, label, headingFace, bodyFace, font.headingFamily, font.bodyFamily);
          })}
        </DropdownMenuRadioGroup>
      </div>
      {onCustomize ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => onCustomize()}
            data-testid={testId + "-customize"}
          >
            {customizeLabel ?? "Customize Fonts..."}
          </DropdownMenuItem>
        </>
      ) : null}
    </div>
  );
}
