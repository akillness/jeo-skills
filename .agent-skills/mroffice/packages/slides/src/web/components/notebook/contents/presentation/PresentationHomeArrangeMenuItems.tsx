"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Home ▸ Drawing ▸ Arrange ▾, as desktop PowerPoint lays it out (PPT-A045):
 *
 *   Reorder Objects / Reorder Overlapping Objects
 *   ── Order Objects ──  Bring to Front · Send to Back · Bring Forward · Send Backward
 *   ── Group Objects ──  Group · Ungroup · Regroup
 *   ── Position Objects ── Align ▸ · Rotate ▸
 *   Selection Pane...
 *
 * Hide Selected / Show All are not PowerPoint's Arrange commands (hiding is
 * the Selection Pane's eye), so they are not here. Every entry runs the same
 * command its Shape Format, context-menu and keyboard twins run; the host
 * passes those commands in. Item test ids keep the ones the menu shipped with.
 */
import type { ReactNode } from "react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
// The deck's one Office menu chrome for submenus (as PresentationWindow).
import { RibbonDropdownMenuSubContent as DropdownMenuSubContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  OfficeRotateMenuItems,
  OfficeSectionedAlignMenuItems,
  type OfficeAlignMenuSectionLabels,
  type OfficeAlignTargetChoice,
  type OfficeObjectAlignAction,
  type OfficeObjectRotateAction,
} from "@mrnote/core/web/components/office-ribbon/OfficeObjectArrangeMenuItems.tsx";

export type PresentationArrangeOrderAction =
  | "bringToFront"
  | "sendToBack"
  | "bringForward"
  | "sendBackward";

interface MenuCommand {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onSelect: () => void;
}

export interface PresentationHomeArrangeMenuProps {
  readonly labels: {
    readonly reorderObjects: string;
    readonly reorderOverlapping: string;
    readonly orderObjects: string;
    readonly bringToFront: string;
    readonly sendToBack: string;
    readonly bringForward: string;
    readonly sendBackward: string;
    readonly groupObjects: string;
    readonly group: string;
    readonly ungroup: string;
    readonly regroup: string;
    readonly positionObjects: string;
    readonly align: string;
    readonly rotate: string;
    readonly selectionPane: string;
    readonly alignSections: OfficeAlignMenuSectionLabels;
    readonly alignAction: (action: OfficeObjectAlignAction) => string;
    readonly rotateAction: (action: OfficeObjectRotateAction) => string;
    readonly moreRotationOptions: string;
  };
  readonly icons: {
    readonly bringToFront: ReactNode;
    readonly sendToBack: ReactNode;
    readonly bringForward: ReactNode;
    readonly sendBackward: ReactNode;
    readonly group: ReactNode;
    readonly ungroup: ReactNode;
    readonly align: ReactNode;
    readonly rotate: ReactNode;
    readonly selectionPane: ReactNode;
  };
  readonly reorder: MenuCommand;
  readonly reorderOverlapping: MenuCommand;
  readonly order: {
    readonly isDisabled: (action: PresentationArrangeOrderAction) => boolean;
    readonly onAction: (action: PresentationArrangeOrderAction) => void;
  };
  readonly group: MenuCommand;
  readonly ungroup: MenuCommand;
  readonly regroup: MenuCommand;
  readonly align: {
    readonly disabled?: boolean;
    readonly isDisabled: (action: OfficeObjectAlignAction) => boolean;
    readonly onAction: (action: OfficeObjectAlignAction) => void;
    readonly target: OfficeAlignTargetChoice;
  };
  readonly rotate: {
    readonly disabled?: boolean;
    /** Why Rotate is greyed (a whole SmartArt graphic turns in no Office app). */
    readonly disabledReason?: string;
    readonly onAction: (action: OfficeObjectRotateAction) => void;
    readonly more: MenuCommand;
  };
  readonly selectionPane: MenuCommand & { readonly controlId?: string };
}

const SECTION_HEAD_CLASS =
  "px-2 pb-0.5 pt-1.5 text-xs font-semibold text-muted-foreground";

const ORDER_TEST_IDS: Record<PresentationArrangeOrderAction, string> = {
  bringToFront: "presentation-ribbon-home-bring-front",
  sendToBack: "presentation-ribbon-home-send-back",
  bringForward: "presentation-ribbon-home-bring-forward",
  sendBackward: "presentation-ribbon-home-send-backward",
};

const ALIGN_TEST_IDS: Record<OfficeObjectAlignAction, string> = {
  left: "presentation-ribbon-arrange-align-left",
  center: "presentation-ribbon-arrange-align-hcenter",
  right: "presentation-ribbon-arrange-align-right",
  top: "presentation-ribbon-arrange-align-top",
  middle: "presentation-ribbon-arrange-align-vcenter",
  bottom: "presentation-ribbon-arrange-align-bottom",
  distributeHorizontal: "presentation-ribbon-arrange-distribute-horizontal",
  distributeVertical: "presentation-ribbon-arrange-distribute-vertical",
};

const ROTATE_TEST_IDS: Record<OfficeObjectRotateAction, string> = {
  rotateRight90: "presentation-ribbon-arrange-rotate-right",
  rotateLeft90: "presentation-ribbon-arrange-rotate-left",
  flipVertical: "presentation-ribbon-arrange-flip-v",
  flipHorizontal: "presentation-ribbon-arrange-flip-h",
};

function commandItem(
  command: MenuCommand,
  label: string,
  testId: string,
  icon?: ReactNode,
) {
  return (
    <DropdownMenuItem
      disabled={command.disabled}
      title={command.disabled ? command.disabledReason : undefined}
      data-disabled-reason={command.disabled ? command.disabledReason : undefined}
      onSelect={command.onSelect}
      data-testid={testId}
    >
      {icon}
      {label}
    </DropdownMenuItem>
  );
}

export function PresentationHomeArrangeMenuItems(props: PresentationHomeArrangeMenuProps) {
  const { labels, icons } = props;
  const orderRows: readonly [PresentationArrangeOrderAction, string, ReactNode][] = [
    ["bringToFront", labels.bringToFront, icons.bringToFront],
    ["sendToBack", labels.sendToBack, icons.sendToBack],
    ["bringForward", labels.bringForward, icons.bringForward],
    ["sendBackward", labels.sendBackward, icons.sendBackward],
  ];
  return (
    <>
      {commandItem(props.reorder, labels.reorderObjects, "presentation-ribbon-home-reorder-objects")}
      {commandItem(
        props.reorderOverlapping,
        labels.reorderOverlapping,
        "presentation-ribbon-home-reorder-overlapping",
      )}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className={SECTION_HEAD_CLASS} data-office-menu-section="order">
        {labels.orderObjects}
      </DropdownMenuLabel>
      {orderRows.map(([action, label, icon]) => (
        <DropdownMenuItem
          key={action}
          disabled={props.order.isDisabled(action)}
          onSelect={() => props.order.onAction(action)}
          data-testid={ORDER_TEST_IDS[action]}
        >
          {icon}
          {label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className={SECTION_HEAD_CLASS} data-office-menu-section="group">
        {labels.groupObjects}
      </DropdownMenuLabel>
      {commandItem(props.group, labels.group, "presentation-ribbon-home-group", icons.group)}
      {commandItem(props.ungroup, labels.ungroup, "presentation-ribbon-home-ungroup", icons.ungroup)}
      {commandItem(props.regroup, labels.regroup, "presentation-ribbon-home-regroup", icons.group)}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className={SECTION_HEAD_CLASS} data-office-menu-section="position">
        {labels.positionObjects}
      </DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          disabled={props.align.disabled}
          data-testid="presentation-ribbon-home-arrange-align"
        >
          {icons.align}
          {labels.align}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent data-testid="presentation-ribbon-home-arrange-align-menu">
          <OfficeSectionedAlignMenuItems
            sections={labels.alignSections}
            label={labels.alignAction}
            isDisabled={props.align.isDisabled}
            onAction={props.align.onAction}
            target={props.align.target}
            testIdFor={(action) => ALIGN_TEST_IDS[action]}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          disabled={props.rotate.disabled}
          title={props.rotate.disabled ? props.rotate.disabledReason : undefined}
          data-testid="presentation-ribbon-home-arrange-rotate"
        >
          {icons.rotate}
          {labels.rotate}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent data-testid="presentation-ribbon-home-arrange-rotate-menu">
          <OfficeRotateMenuItems
            label={labels.rotateAction}
            onAction={props.rotate.onAction}
            disabled={props.rotate.disabled}
            testIdFor={(action) => ROTATE_TEST_IDS[action]}
            more={{
              label: labels.moreRotationOptions,
              onSelect: props.rotate.more.onSelect,
              disabled: props.rotate.more.disabled,
              testId: "presentation-ribbon-arrange-rotate-more",
            }}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={props.selectionPane.disabled}
        onSelect={props.selectionPane.onSelect}
        data-control-id={props.selectionPane.controlId}
        data-testid="presentation-ribbon-home-selection-pane"
      >
        {icons.selectionPane}
        {labels.selectionPane}
      </DropdownMenuItem>
    </>
  );
}
