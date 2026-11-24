"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef } from "react";

import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";

import { IconSectionMenu } from "../PresentationRibbonIcons";
import {
  PresentationSectionMenuItems,
  type PresentationSectionCommand,
  type PresentationSectionMenuLabels,
  type PresentationSectionMenuState,
} from "./PresentationSectionMenuItems";

/**
 * Home ▸ Slides ▸ Section ▾ (PPT-A016).
 *
 * PowerPoint's Section menu: Add Section, Rename Section | Remove Section,
 * Remove All Sections | Collapse All, Expand All ("Organize your PowerPoint
 * slides into sections", Microsoft Support), each with its icon. The commands
 * act on the active slide's section, as the ribbon's do in PowerPoint; the
 * editor says which can run (`enabled`) and runs them (`onCommand`).
 */
export function PresentationSectionRibbonMenu({
  label,
  labels,
  enabled,
  onCommand,
}: {
  label: string;
  labels: PresentationSectionMenuLabels;
  enabled: PresentationSectionMenuState;
  onCommand: (command: PresentationSectionCommand) => void;
}) {
  // Add Section hands the keyboard to the new section's name, Rename Section
  // to its dialog: the menu does not take it back to its button.
  const handedOffRef = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          controlId="PPTCTL.RIBBON.HOME.SLIDES.SECTION"
          variant="compact"
          hasMenuIndicator
          icon={<IconSectionMenu size={16} />}
          label={label}
          testId="presentation-ribbon-section-menu"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[11rem]"
        data-testid="presentation-ribbon-section-menu-content"
        onCloseAutoFocus={(event) => {
          if (!handedOffRef.current) return;
          handedOffRef.current = false;
          event.preventDefault();
        }}
      >
        <PresentationSectionMenuItems
          variant="ribbon"
          labels={labels}
          enabled={enabled}
          testIdPrefix="presentation-ribbon-section"
          onCommand={(command) => {
            handedOffRef.current = command === "add" || command === "rename";
            onCommand(command);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
