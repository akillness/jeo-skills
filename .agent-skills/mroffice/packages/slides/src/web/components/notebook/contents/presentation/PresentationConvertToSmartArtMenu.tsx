"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  RibbonDropdownMenuContent,
  RibbonDropdownMenuSubContent,
} from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSmartArtInsertGallery } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtInsertGallery.tsx";
import { OfficeSmartArtSeedPreview } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtSeedPreview.tsx";
import styles from "@mrnote/core/web/components/office-ribbon/OfficeInsertGallery.module.css";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  OFFICE_SMARTART_LAYOUT_GALLERY_GROUPS,
  type OfficeSmartArtPlaceholders,
} from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import { POWERPOINT_CONVERT_TO_SMARTART_LAYOUTS } from "../../../../lib/presentation-convert-to-smartart";

/**
 * Home ▸ Paragraph ▸ Convert to SmartArt ▾ (PPT-A019).
 *
 * PowerPoint's gallery of the twenty layouts it offers for slide text, in its
 * order, then More SmartArt Graphics..., which opens every layout the catalog
 * can build (the shared insert gallery's categories). A layout MRAI cannot
 * build yet is shown greyed with the reason, as PowerPoint greys what it
 * cannot do. The card is the ONE shared seed preview every SmartArt gallery
 * draws, so it shows the layout the pick builds.
 */
export function PresentationConvertToSmartArtMenu({
  labels,
  disabled,
  disabledReason,
  placeholders,
  previewBounds,
  onConvert,
}: {
  labels: {
    command: string;
    tooltip: string;
    more: string;
    unavailable: string;
    layoutName: (office: string) => string;
    categoryLabel: (category: string) => string;
    catalogLayoutName: (layoutId: string) => string;
    catalogLayoutDescription: (layoutId: string) => string;
  };
  disabled: boolean;
  disabledReason?: string;
  placeholders: OfficeSmartArtPlaceholders;
  previewBounds?: { width: number; height: number };
  /** Convert the selected text to this catalog layout. */
  onConvert: (layoutId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          controlId="PPTCTL.RIBBON.HOME.PARAGRAPH.CONVERT_TO_SMARTART"
          variant="icon"
          hasMenuIndicator
          icon={<OfficeSemanticIcon semanticId="diagram.smartArt.insert" size={14} />}
          label={labels.command}
          title={labels.tooltip}
          disabled={disabled}
          disabledReason={disabledReason}
          testId="presentation-ribbon-convert-to-smartart"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        className={styles.flyout}
        data-smartart-gallery-application="presentation"
        data-testid="presentation-ribbon-convert-to-smartart-menu"
      >
        <div className={styles.grid} role="group" aria-label={labels.tooltip}>
          {POWERPOINT_CONVERT_TO_SMARTART_LAYOUTS.map(({ office, layoutId }) => {
            const name = labels.layoutName(office);
            return (
              <DropdownMenuItem
                key={office}
                className={styles.card}
                disabled={!layoutId}
                aria-label={name}
                title={layoutId ? name : `${name}: ${labels.unavailable}`}
                data-disabled-reason={layoutId ? undefined : labels.unavailable}
                data-office-layout={office}
                onSelect={() => {
                  if (layoutId) onConvert(layoutId);
                }}
                data-testid={`presentation-convert-to-smartart-${office}`}
              >
                <span aria-hidden className={styles.preview} style={{ overflow: "hidden" }}>
                  {layoutId ? (
                    <OfficeSmartArtSeedPreview
                      layoutId={layoutId}
                      itemLabel={placeholders.itemLabel}
                      rootLabel={placeholders.rootLabel}
                      bounds={previewBounds}
                      fit="content"
                      labels="lines"
                    />
                  ) : null}
                </span>
                <span>{name}</span>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="presentation-convert-to-smartart-more">
            {labels.more}
          </DropdownMenuSubTrigger>
          <RibbonDropdownMenuSubContent>
            <OfficeSmartArtInsertGallery
              application="presentation"
              disabled={false}
              // Convert to SmartArt builds catalog layouts: no alias cards.
              groups={OFFICE_SMARTART_LAYOUT_GALLERY_GROUPS}
              categoryLabel={labels.categoryLabel}
              layoutLabel={labels.catalogLayoutName}
              layoutDescription={labels.catalogLayoutDescription}
              placeholders={placeholders}
              previewBounds={previewBounds}
              onSelect={onConvert}
              testIdPrefix="presentation-convert-to-smartart-gallery"
            />
          </RibbonDropdownMenuSubContent>
        </DropdownMenuSub>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}
