"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * 插入 › 智能图形 (ONLYOFFICE's and Office's Insert SmartArt) on a PDF page:
 * the Office editors' own gallery (the presentation's Insert tab mounts the
 * same one), its pick armed to place the graphic where the page is pressed,
 * as a chart is placed. The graphic is the Docs editor's SmartArt shape
 * group (lib/pdf/managed-chart.ts, kind "smartart").
 */
import { useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeHomeCommand, OfficeHomeMenuTrigger, OfficeHomeSplitLayout } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeSmartArtGalleryPrefetch, OfficeSmartArtInsertGallery } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtInsertGallery.tsx";
import { useOfficeSmartArtPlaceholders } from "@mrnote/core/web/components/office-ribbon/officeSmartArtPlaceholders.ts";
import { DropdownMenu, DropdownMenuTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { OFFICE_SMARTART_GALLERY_GROUPS } from "@mrnote/core/web/lib/office-smartart/catalog.ts";

export function PdfInsertSmartArtCommand({
  active = false,
  disabled,
  onPick,
}: {
  readonly active?: boolean;
  readonly disabled: boolean;
  readonly onPick: (layoutId: string) => void;
}) {
  const t = useTranslations("console-notebooks");
  const placeholders = useOfficeSmartArtPlaceholders();
  const [open, setOpen] = useState(false);
  const label = t("toolbar.smartArt");
  return (
    <>
      {/* The category cards, asked for while the button shows. */}
      <OfficeSmartArtGalleryPrefetch placeholders={placeholders} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <OfficeHomeSplitLayout
          testId="pdf-insert-smartart-split"
          primary={
            <OfficeHomeCommand
              activation="click"
              active={open || active}
              variant="large"
              controlId="PDFCTL.RIBBON.INSERT.SMARTART"
              icon={<OfficeSemanticIcon semanticId="diagram.smartArt.insert" size={24} />}
              label={label}
              disabled={disabled}
              onClick={() => setOpen((current) => !current)}
              testId="pdf-insert-smartart"
            />
          }
          trigger={
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                data-control-id="PDFCTL.RIBBON.INSERT.SMARTART.MENU"
                disabled={disabled}
                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                label={label}
                title={label}
                testId="pdf-insert-smartart-menu"
                variant="icon"
              />
            </DropdownMenuTrigger>
          }
        />
        <RibbonDropdownMenuContent align="start" data-testid="pdf-insert-smartart-menu-content">
          <OfficeSmartArtInsertGallery
            application="docs"
            disabled={disabled}
            groups={OFFICE_SMARTART_GALLERY_GROUPS}
            categoryLabel={(category) => t(`toolbar.smartArtCategory_${category}` as "toolbar.smartArtCategory_list")}
            layoutLabel={(layoutId) => t(`toolbar.smartArtLayoutName_${layoutId}` as "toolbar.smartArtLayoutName_basic-list")}
            layoutDescription={(layoutId) => t(`toolbar.smartArtLayoutDesc_${layoutId}` as "toolbar.smartArtLayoutDesc_basic-list")}
            placeholders={placeholders}
            onSelect={(layoutId) => {
              setOpen(false);
              onPick(layoutId);
            }}
            testIdPrefix="pdf-smartart-gallery"
          />
        </RibbonDropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
