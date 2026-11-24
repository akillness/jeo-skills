"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { officeDialogParts } from "./officeDialogChrome";

export interface OfficeLinkScreenTipDialogProps {
  readonly open: boolean;
  /** The ScreenTip the link has now ("" for none). */
  readonly value: string;
  readonly maxLength: number;
  readonly onApply: (value: string) => void;
  readonly onCancel: () => void;
  readonly testIdPrefix: string;
}

/**
 * Office's "Set Hyperlink ScreenTip" (Insert Hyperlink > ScreenTip...): one
 * "ScreenTip text" box over the link dialog; OK hands the typed text back.
 * Word's link dialog draws the same small dialog inline
 * (DocumentHyperlinkDialog); the slide editor's link dialog uses this one.
 * Its own form submits and closes it; the wrapper keeps that submit from
 * reaching the link dialog's form through the React tree.
 */
export function OfficeLinkScreenTipDialog({
  open,
  value,
  maxLength,
  onApply,
  onCancel,
  testIdPrefix,
}: OfficeLinkScreenTipDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState(value);
  const [openedWith, setOpenedWith] = useState<string | null>(open ? value : null);
  if (open && openedWith === null) {
    setOpenedWith(value);
    setDraft(value);
  } else if (!open && openedWith !== null) {
    setOpenedWith(null);
  }
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div style={{ display: "contents" }} onSubmit={(event) => event.stopPropagation()}>
      <OfficeDialogShell
        open={open}
        title={t("toolbar.linkScreenTipDialogTitle")}
        description={
          <span className="sr-only">{t("toolbar.linkScreenTipDialogDescription")}</span>
        }
        defaultActionLabel={t("toolbar.dialogOk")}
        cancelActionLabel={t("toolbar.dialogCancel")}
        onDefaultAction={() => onApply(draft)}
        onCancel={onCancel}
        initialFocusRef={inputRef}
        testIdPrefix={testIdPrefix}
        className="w-[min(400px,calc(100vw-32px))]"
      >
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("toolbar.linkScreenTipText")}</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={maxLength}
            data-testid={`${testIdPrefix}-text`}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
      </OfficeDialogShell>
    </div>
  );
}
