"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Home ▸ Editing ▸ Select ▾ (PPT-A023): Select All, Select Objects,
 * Selection Pane..., as desktop PowerPoint lists them. The Docs editor's
 * Editing group carries the same Select menu over its own commands; this one
 * runs the deck's: Select All is Ctrl+A on the slide, Select Objects leaves
 * any ink or lasso tool so a press or a drag picks objects (the Draw tab's
 * Select tool), Selection Pane opens the pane.
 */
import { forwardRef } from "react";

import { DocsHomeIcon } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";

export interface PresentationHomeEditingSelectMenuProps {
  readonly labels: {
    readonly select: string;
    readonly selectAll: string;
    readonly selectObjects: string;
    readonly selectionPane: string;
  };
  readonly selectAllShortcut?: string;
  readonly selectAllDisabled?: boolean;
  readonly selectionPaneDisabled?: boolean;
  /** Select Objects is on while no ink or lasso tool is armed. */
  readonly selectObjectsActive: boolean;
  readonly onSelectAll: () => void;
  readonly onSelectObjects: () => void;
  readonly onSelectionPane: () => void;
}

export const PresentationHomeEditingSelectMenu = forwardRef<
  HTMLButtonElement,
  PresentationHomeEditingSelectMenuProps
>(function PresentationHomeEditingSelectMenu(props, ref) {
  const { labels } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          ref={ref}
          controlId="PPTCTL.RIBBON.HOME.EDITING.SELECT"
          variant="compact"
          hasMenuIndicator
          icon={<DocsHomeIcon name="selectAll" size={16} />}
          label={labels.select}
          testId="presentation-home-select-menu"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent align="start" data-testid="presentation-home-select-menu-content">
        <DropdownMenuItem
          disabled={props.selectAllDisabled}
          onSelect={props.onSelectAll}
          data-testid="presentation-home-select-all"
        >
          <DocsHomeIcon name="selectAll" size={16} />
          {labels.selectAll}
          {props.selectAllShortcut ? (
            <DropdownMenuShortcut>{props.selectAllShortcut}</DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={props.selectObjectsActive}
          onSelect={props.onSelectObjects}
          data-testid="presentation-home-select-objects"
        >
          <OfficeSemanticIcon semanticId="edit.select" size={16} />
          {labels.selectObjects}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={props.selectionPaneDisabled}
          onSelect={props.onSelectionPane}
          data-testid="presentation-home-select-selection-pane"
        >
          <OfficeSemanticIcon semanticId="object.selectionPane" size={16} />
          {labels.selectionPane}
        </DropdownMenuItem>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
});
