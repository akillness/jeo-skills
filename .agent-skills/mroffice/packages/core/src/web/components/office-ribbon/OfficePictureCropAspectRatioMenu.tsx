"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, type ReactNode } from "react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import { RibbonDropdownMenuSubContent as DropdownMenuSubContent } from "./CupertinoRibbonMenu";
import {
  PICTURE_CROP_ASPECT_RATIOS,
  type PictureCropAspectRatioId,
} from "../../lib/presentation-crop-group";

export interface OfficePictureCropAspectRatioLabels {
  readonly aspectRatio: string;
  readonly square: string;
  readonly portrait: string;
  readonly landscape: string;
}

/**
 * Picture Format > Crop > Aspect Ratio, as Word and PowerPoint draw it: a
 * submenu of the Office ratio catalog in three groups (Square, Portrait,
 * Landscape), each tile a small frame of its ratio. The host decides what a
 * ratio does to its picture model; this is the menu only.
 */
export function OfficePictureCropAspectRatioMenu({
  disabled,
  icon,
  labels,
  onSelect,
  testIdPrefix,
}: {
  readonly disabled: boolean;
  readonly icon?: ReactNode;
  readonly labels: OfficePictureCropAspectRatioLabels;
  readonly onSelect: (ratioId: PictureCropAspectRatioId) => void;
  /** `<prefix>` trigger, `<prefix>-gallery`, `<prefix>-<w>-<h>` tiles. */
  readonly testIdPrefix: string;
}) {
  const groups = [
    { id: "square", label: labels.square },
    { id: "portrait", label: labels.portrait },
    { id: "landscape", label: labels.landscape },
  ] as const;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled} data-testid={testIdPrefix}>
        {icon}
        {labels.aspectRatio}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-52"
        data-testid={`${testIdPrefix}-gallery`}
      >
        {groups.map((group, groupIndex) => (
          <Fragment key={group.id}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            <div
              role="group"
              aria-label={group.label}
              className="grid grid-cols-3 gap-1 px-1 pb-1"
            >
              {PICTURE_CROP_ASPECT_RATIOS.filter(
                (preset) => preset.group === group.id,
              ).map((preset) => {
                const previewScale = Math.min(
                  28 / preset.width,
                  20 / preset.height,
                );
                return (
                  <DropdownMenuItem
                    key={preset.id}
                    className="flex h-12 flex-col justify-center gap-1 px-1 py-1 text-xs"
                    disabled={disabled}
                    onSelect={() => onSelect(preset.id)}
                    data-testid={`${testIdPrefix}-${preset.id.replace(":", "-")}`}
                    aria-label={`${group.label} ${preset.id}`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-8 items-center justify-center"
                    >
                      <span
                        className="block rounded-[1px] border border-current bg-background"
                        style={{
                          width: `${preset.width * previewScale}px`,
                          height: `${preset.height * previewScale}px`,
                        }}
                      />
                    </span>
                    <span>{preset.id}</span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          </Fragment>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
