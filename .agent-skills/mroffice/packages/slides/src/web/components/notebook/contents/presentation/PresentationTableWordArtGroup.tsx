"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Table Design > WordArt Styles (PPT-A138): PowerPoint's group between Table
 * Styles and Draw Borders -- Quick Styles (the twenty WordArt styles under
 * the deck's theme, and Clear WordArt), Text Fill, Text Outline and Text
 * Effects -- on the selected cells' words (PowerPoint for Mac 16.86,
 * dumps/ppt-ax-ctx-table-表格设计.txt; Microsoft Support, "Add WordArt to
 * text in a table").
 *
 * Every command writes the cells' shared WordArt paint (`textPaint`, the
 * `OfficeTextPaint` text boxes and shapes wear) through the window's cell
 * writer; this group only draws the controls. The tiles are the WordArt
 * gallery's own previews (`OfficeWordArtPreview`), the colour menus the
 * Table Design colour menu the Shading group uses.
 */

import { useState, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  OfficeHomeCommandRow,
  OfficeHomeCommandStack,
  OfficeHomeMenuTrigger,
  OfficeHomeRibbonGroup,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeWordArtPreview } from "@mrnote/core/web/components/office-ribbon/OfficeWordArtStyleGallery.tsx";
import type { OfficeColorPalettePopoverLabels } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { officeTextPaintEffect } from "@mrnote/core/web/lib/document-wordart-style-adapter.ts";
import type { OfficeTextPaint } from "@mrnote/core/web/lib/office-text-paint.ts";

import { PresentationTableCellColorMenu } from "./PresentationTableCellMenus";

/** The Text Effects this group writes (the ribbon's flat effect list). */
export const PRESENTATION_TABLE_TEXT_EFFECTS = ["none", "shadow", "reflection", "glow", "bevel"] as const;
export type PresentationTableTextEffect = (typeof PRESENTATION_TABLE_TEXT_EFFECTS)[number];

export interface PresentationTableWordArtStyle {
  readonly id: string;
  readonly label: string;
  readonly paint: OfficeTextPaint;
}

export interface PresentationTableWordArtLabels {
  readonly group: string;
  readonly quickStyles: string;
  readonly clearWordArt: string;
  readonly textFill: string;
  readonly textOutline: string;
  readonly textEffects: string;
  readonly noFill: string;
  readonly noOutline: string;
  readonly mixed: string;
  readonly effect: (effect: PresentationTableTextEffect) => string;
  readonly palette: OfficeColorPalettePopoverLabels;
}

export function PresentationTableWordArtGroup({
  className,
  labels,
  styles,
  styleId,
  paint,
  mixed,
  disabled,
  recents,
  quickStylesIcon,
  onStyle,
  onClear,
  onFill,
  onOutline,
  onEffect,
}: {
  readonly className?: string;
  readonly labels: PresentationTableWordArtLabels;
  readonly styles: readonly PresentationTableWordArtStyle[];
  /** The gallery style every selected cell wears, or null. */
  readonly styleId: string | null;
  /** The paint every selected cell wears (null: plain, or mixed). */
  readonly paint: OfficeTextPaint | null;
  readonly mixed: boolean;
  readonly disabled: boolean;
  readonly recents: readonly string[];
  readonly quickStylesIcon: ReactNode;
  readonly onStyle: (styleId: string) => void;
  readonly onClear: () => void;
  readonly onFill: (color: string | null) => void;
  readonly onOutline: (color: string | null) => void;
  readonly onEffect: (effect: PresentationTableTextEffect) => void;
}) {
  const [palette, setPalette] = useState<"fill" | "outline" | null>(null);
  const effect = mixed ? null : (officeTextPaintEffect(paint) as PresentationTableTextEffect | null);
  return (
    <OfficeHomeRibbonGroup
      className={className}
      controlId="PPTCTL.CONTEXT.TABLE.DESIGN.WORDART"
      label={labels.group}
      size="narrow"
      testId="presentation-ribbon-table-wordart-group"
    >
      <OfficeHomeCommandRow>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <OfficeHomeMenuTrigger
              active={styleId !== null}
              controlId="PPTCTL.CONTEXT.TABLE.DESIGN.WORDART.QUICK_STYLES"
              disabled={disabled}
              displayLabel={labels.quickStyles}
              hasMenuIndicator
              icon={quickStylesIcon}
              label={labels.quickStyles}
              testId="presentation-ribbon-table-wordart-quick-styles"
              variant="large"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" data-testid="presentation-ribbon-table-wordart-quick-styles-menu">
            <div
              role="group"
              aria-label={labels.quickStyles}
              style={{ display: "grid", gridTemplateColumns: "repeat(5, 44px)", gap: 4, padding: 6 }}
            >
              {styles.map((style) => (
                <DropdownMenuItem
                  key={style.id}
                  aria-label={style.label}
                  title={style.label}
                  data-checked={style.id === styleId ? "true" : undefined}
                  data-testid={`presentation-ribbon-table-wordart-${style.id}`}
                  onSelect={() => onStyle(style.id)}
                  style={{ justifyContent: "center", height: 40, padding: 0 }}
                >
                  <OfficeWordArtPreview paint={style.paint} sample="A" />
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!mixed && paint === null}
              data-testid="presentation-ribbon-table-wordart-clear"
              onSelect={onClear}
            >
              {labels.clearWordArt}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <OfficeHomeCommandStack rows={3}>
          <OfficeHomeCommandRow>
            <PresentationTableCellColorMenu
              anchorClassName="presentation-window__table-wordart-anchor"
              disabled={disabled}
              displayLabel={labels.textFill}
              icon={<OfficeSemanticIcon semanticId="text.fontColor" size={18} />}
              label={labels.textFill}
              labels={labels.palette}
              menuControlId="PPTCTL.CONTEXT.TABLE.DESIGN.WORDART.TEXT_FILL"
              mixed={mixed}
              mixedLabel={labels.mixed}
              noFillLabel={labels.noFill}
              onDismiss={() => setPalette(null)}
              onPick={(color) => {
                setPalette(null);
                onFill(color);
              }}
              onToggle={() => setPalette((current) => (current === "fill" ? null : "fill"))}
              open={palette === "fill"}
              recents={recents}
              testId="presentation-ribbon-table-wordart-text-fill"
              triggerVariant="compact"
              value={paint && paint.fill !== "none" ? paint.fill : null}
            />
          </OfficeHomeCommandRow>
          <OfficeHomeCommandRow>
            <PresentationTableCellColorMenu
              anchorClassName="presentation-window__table-wordart-anchor"
              disabled={disabled}
              displayLabel={labels.textOutline}
              icon={<OfficeSemanticIcon semanticId="format.lineColor" size={18} />}
              label={labels.textOutline}
              labels={labels.palette}
              menuControlId="PPTCTL.CONTEXT.TABLE.DESIGN.WORDART.TEXT_OUTLINE"
              mixed={mixed}
              mixedLabel={labels.mixed}
              noFillLabel={labels.noOutline}
              onDismiss={() => setPalette(null)}
              onPick={(color) => {
                setPalette(null);
                onOutline(color);
              }}
              onToggle={() => setPalette((current) => (current === "outline" ? null : "outline"))}
              open={palette === "outline"}
              recents={recents}
              testId="presentation-ribbon-table-wordart-text-outline"
              triggerVariant="compact"
              value={paint && paint.outline !== "none" ? paint.outline : null}
            />
          </OfficeHomeCommandRow>
          <OfficeHomeCommandRow>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <OfficeHomeMenuTrigger
                  active={effect !== null && effect !== "none"}
                  controlId="PPTCTL.CONTEXT.TABLE.DESIGN.WORDART.TEXT_EFFECTS"
                  disabled={disabled}
                  displayLabel={labels.textEffects}
                  hasMenuIndicator
                  icon={<OfficeSemanticIcon semanticId="shape.effects" size={18} />}
                  label={labels.textEffects}
                  testId="presentation-ribbon-table-wordart-text-effects"
                  variant="compact"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={effect ?? ""}>
                  {PRESENTATION_TABLE_TEXT_EFFECTS.map((candidate) => (
                    <DropdownMenuRadioItem
                      key={candidate}
                      value={candidate}
                      data-testid={`presentation-ribbon-table-wordart-text-effect-${candidate}`}
                      onSelect={() => onEffect(candidate)}
                    >
                      {labels.effect(candidate)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </OfficeHomeCommandRow>
        </OfficeHomeCommandStack>
      </OfficeHomeCommandRow>
    </OfficeHomeRibbonGroup>
  );
}
