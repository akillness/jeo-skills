"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The question Word asks when the Paragraph or Font dialog's Set As Default
 * is pressed: change the defaults of "This document only?" or of "All
 * documents based on the Normal template?". OK writes the chosen scope;
 * Cancel returns to the dialog it was asked from.
 *
 * MRAI has no shared Normal template that new documents start from, so the
 * second scope is shown as Word shows it but cannot be chosen, with the
 * reason beside it.
 */

import { useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";

export type DocumentSetAsDefaultKind = "paragraph" | "font";

export interface DocumentSetAsDefaultDialogProps {
  readonly kind: DocumentSetAsDefaultKind;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DocumentSetAsDefaultDialog({
  kind,
  onConfirm,
  onCancel,
}: DocumentSetAsDefaultDialogProps) {
  const t = useTranslations("console-notebooks");
  const [scope, setScope] = useState<"document">("document");
  return (
    <OfficeDialogShell
      open
      title={t("toolbar.setAsDefaultTitle")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      onDefaultAction={() => {
        if (scope === "document") onConfirm();
      }}
      onCancel={onCancel}
      testIdPrefix={`document-${kind}-set-default`}
      className="sm:max-w-[460px]"
    >
      <fieldset className="office-dialog__group">
        <legend>
          {kind === "paragraph"
            ? t("toolbar.setAsDefaultParagraphPrompt")
            : t("toolbar.setAsDefaultFontPrompt")}
        </legend>
        <label className="office-dialog__check">
          <input
            type="radio"
            name={`document-${kind}-set-default-scope`}
            data-testid={`document-${kind}-set-default-document`}
            checked={scope === "document"}
            onChange={() => setScope("document")}
          />
          <DocumentDialogIcon icon="file.document" />
          {t("toolbar.setAsDefaultThisDocument")}
        </label>
        <label
          className="office-dialog__check"
          title={t("toolbar.setAsDefaultAllDocumentsUnavailable")}
        >
          <input
            type="radio"
            name={`document-${kind}-set-default-scope`}
            data-testid={`document-${kind}-set-default-template`}
            checked={false}
            disabled
            onChange={() => undefined}
          />
          <DocumentDialogIcon icon="file.multiple" />
          {t("toolbar.setAsDefaultAllDocuments")}
        </label>
        <p className="office-dialog__hint">
          {t("toolbar.setAsDefaultAllDocumentsUnavailable")}
        </p>
      </fieldset>
    </OfficeDialogShell>
  );
}
