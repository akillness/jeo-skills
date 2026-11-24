"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useState } from "react";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

type Translate = ReturnType<typeof useTranslations<"console-notebooks">>;

/** Where 「不再提示」 is kept: this reader's own choice, on this device. */
export const PDF_ERASE_COVER_NOTICE_HIDDEN_KEY = "mrai.pdf.erase.coverNoticeHidden";

export function pdfEraseCoverNoticeHidden(): boolean {
  try {
    return window.localStorage.getItem(PDF_ERASE_COVER_NOTICE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberHidden(): void {
  try {
    window.localStorage.setItem(PDF_ERASE_COVER_NOTICE_HIDDEN_KEY, "1");
  } catch {
    /* the notice simply shows again next time */
  }
}

/**
 * WPS's notice after an erase that could not take everything away:
 * 「存在无法擦除内容」 -- what could not be erased was covered; text and
 * pictures are what an erase takes off the page. 「不再提示」 keeps it quiet.
 */
export function PdfEraseCoverNotice({
  open,
  onClose,
  t,
  returnFocusTo,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly t: Translate;
  /** Where the keyboard goes when the notice closes: inside the window whose
   * shortcuts must hear the next key (Cmd+Z undoes the erase, as in WPS). A
   * dialog left to itself hands focus back to the page body, where no
   * window listens. */
  readonly returnFocusTo?: () => HTMLElement | null;
}) {
  const [quiet, setQuiet] = useState(false);
  const checkboxId = useId();
  const close = () => {
    if (quiet) rememberHidden();
    setQuiet(false);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        skin="none"
        className={officeDialogClassName({ tone: "pdf", size: "sm", modal: true })}
        showCloseButton={false}
        data-testid="pdf-erase-cover-notice"
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.();
          if (!target) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
      >
        <div className={officeDialogParts.header}>
          <DialogTitle className={officeDialogParts.title}>
            {t("pdf.erase.coverNoticeTitle")}
          </DialogTitle>
        </div>
        <div className={officeDialogParts.body}>
          <DialogDescription skin="none" className={officeDialogParts.description}>
            {t("pdf.erase.coverNoticeBody")}
          </DialogDescription>
          <p className={officeDialogParts.hint}>{t("pdf.erase.coverNoticeErasable")}</p>
        </div>
        <div className={officeDialogParts.footer}>
          <label className={`${officeDialogParts.check} ${officeDialogParts.footerStart}`} htmlFor={checkboxId}>
            <input
              id={checkboxId}
              type="checkbox"
              checked={quiet}
              data-testid="pdf-erase-cover-notice-quiet"
              onChange={(event) => setQuiet(event.target.checked)}
            />
            <span>{t("pdf.erase.coverNoticeQuiet")}</span>
          </label>
          <button
            type="button"
            className={officeDialogParts.primaryButton}
            data-testid="pdf-erase-cover-notice-ok"
            onClick={close}
          >
            {t("pdf.erase.coverNoticeOk")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
