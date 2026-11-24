"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PowerPoint's Home ▸ New Slide ▾ ▸ Outline… ("Insert Slides from Outline").
 * PowerPoint asks for an outline file; here the outline is pasted as markdown
 * ('# Title' starts a slide, '- point' adds a bullet) and the editor turns it
 * into slides without a model call. The dialog owns only the text; the
 * window parses it, commits the slides in one undo step and either closes the
 * dialog or hands back the reason nothing was inserted.
 */

import { useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

export interface PresentationOutlineImportDialogLabels {
  readonly title: string;
  /** How the outline is written: '# Title' starts a slide, '- point' a bullet. */
  readonly hint: string;
  readonly insert: string;
  readonly cancel: string;
}

export function PresentationOutlineImportDialog({
  open,
  labels,
  error,
  onInsert,
  onCancel,
  returnFocusRef,
}: {
  open: boolean;
  labels: PresentationOutlineImportDialogLabels;
  /** Why the last Insert changed nothing (an outline without a heading). */
  error: string | null;
  onInsert: (outline: string) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [text, setText] = useState("");
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const empty = !text.trim();
  return (
    <OfficeDialogShell
      open={open}
      description=""
      title={labels.title}
      defaultActionLabel={labels.insert}
      cancelActionLabel={labels.cancel}
      defaultActionDisabled={empty}
      defaultActionTestId="presentation-outline-import-run"
      onDefaultAction={() => {
        if (!empty) onInsert(text);
      }}
      onCancel={onCancel}
      initialFocusRef={textRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="presentation-outline-import"
    >
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>{labels.hint}</span>
        <textarea
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={10}
          maxLength={20000}
          data-testid="presentation-outline-import-text"
          aria-label={labels.title}
          aria-invalid={error ? true : undefined}
          style={{ width: "100%", resize: "vertical" }}
        />
      </label>
      {error ? (
        <div role="alert" className={officeDialogParts.error}>
          {error}
        </div>
      ) : null}
    </OfficeDialogShell>
  );
}
