"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment } from "react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";

import {
  PresentationSectionIcon,
  type PresentationSectionIconName,
} from "./PresentationSectionIcons";

/**
 * PowerPoint's Section commands, as its two menus list them.
 *
 *  - Home ▸ Slides ▸ Section ▾: Add Section, Rename Section | Remove Section,
 *    Remove All Sections | Collapse All, Expand All.
 *  - A section header's right-click menu: Rename Section, Remove Section,
 *    Remove Section & Slides, Remove All Sections | Move Section Up, Move
 *    Section Down | Collapse All, Expand All.
 *
 * Both act on one section -- the active slide's on the ribbon, the clicked
 * header's in its menu -- and each row is unavailable exactly when
 * PowerPoint's is (see `PresentationSectionMenuState`).
 */
export type PresentationSectionCommand =
  | "add"
  | "rename"
  | "remove"
  | "removeWithSlides"
  | "removeAll"
  | "moveUp"
  | "moveDown"
  | "collapseAll"
  | "expandAll";

export type PresentationSectionMenuLabels = Readonly<Record<PresentationSectionCommand, string>>;

/** Which commands can run now; a missing one is unavailable. */
export type PresentationSectionMenuState = Readonly<Partial<Record<PresentationSectionCommand, boolean>>>;

const RIBBON_ROWS: readonly (readonly PresentationSectionCommand[])[] = [
  ["add", "rename"],
  ["remove", "removeAll"],
  ["collapseAll", "expandAll"],
];

const HEADER_ROWS: readonly (readonly PresentationSectionCommand[])[] = [
  ["rename", "remove", "removeWithSlides", "removeAll"],
  ["moveUp", "moveDown"],
  ["collapseAll", "expandAll"],
];

const TEST_IDS: Readonly<Record<PresentationSectionCommand, string>> = {
  add: "add",
  rename: "rename",
  remove: "remove",
  removeWithSlides: "remove-with-slides",
  removeAll: "remove-all",
  moveUp: "move-up",
  moveDown: "move-down",
  collapseAll: "collapse-all",
  expandAll: "expand-all",
};

export function PresentationSectionMenuItems({
  variant,
  labels,
  enabled,
  onCommand,
  testIdPrefix,
  iconClassName,
}: {
  variant: "ribbon" | "header";
  labels: PresentationSectionMenuLabels;
  enabled: PresentationSectionMenuState;
  onCommand: (command: PresentationSectionCommand) => void;
  testIdPrefix: string;
  /** The icon column the host menu draws its icons in, when it has one. */
  iconClassName?: string;
}) {
  const rows = variant === "ribbon" ? RIBBON_ROWS : HEADER_ROWS;
  return (
    <>
      {rows.map((row, index) => (
        <Fragment key={row.join("-")}>
          {index > 0 ? <DropdownMenuSeparator /> : null}
          {row.map((command) => {
            const icon = (
              <PresentationSectionIcon name={command as PresentationSectionIconName} />
            );
            return (
              <DropdownMenuItem
                key={command}
                disabled={!enabled[command]}
                onSelect={() => onCommand(command)}
                data-testid={`${testIdPrefix}-${TEST_IDS[command]}`}
                data-section-command={command}
              >
                {iconClassName ? (
                  <span className={iconClassName} aria-hidden="true">
                    {icon}
                  </span>
                ) : (
                  icon
                )}
                <span>{labels[command]}</span>
              </DropdownMenuItem>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
