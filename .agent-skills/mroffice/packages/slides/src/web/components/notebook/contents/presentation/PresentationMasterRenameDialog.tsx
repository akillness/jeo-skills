"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PowerPoint's Rename Slide Master / Rename Layout dialog (Slide Master view
 * ▸ Edit Master ▸ Rename, PPT-B030), which is also its Rename Section dialog:
 * one name field, Rename and Cancel. An empty name keeps Rename disabled, as
 * PowerPoint's does.
 */

import { useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

export interface PresentationMasterRenameDialogLabels {
  readonly title: string;
  readonly field: string;
  readonly rename: string;
  readonly cancel: string;
}

export function PresentationMasterRenameDialog({
  open,
  labels,
  initialName,
  onRename,
  onCancel,
  returnFocusRef,
  testIdPrefix = "presentation-master-rename",
}: {
  open: boolean;
  labels: PresentationMasterRenameDialogLabels;
  initialName: string;
  onRename: (name: string) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Home ▸ Section ▸ Rename Section is the same dialog under its own ids. */
  testIdPrefix?: string;
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmed = name.trim();
  return (
    <OfficeDialogShell
      open={open}
      description=""
      title={labels.title}
      defaultActionLabel={labels.rename}
      cancelActionLabel={labels.cancel}
      defaultActionDisabled={!trimmed}
      onDefaultAction={() => {
        if (trimmed) onRename(trimmed);
      }}
      onCancel={onCancel}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix={testIdPrefix}
    >
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>{labels.field}</span>
        <input
          ref={inputRef}
          type="text"
          value={name}
          maxLength={200}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setName(event.target.value)}
          data-testid={`${testIdPrefix}-input`}
          aria-label={labels.field}
        />
      </label>
    </OfficeDialogShell>
  );
}
