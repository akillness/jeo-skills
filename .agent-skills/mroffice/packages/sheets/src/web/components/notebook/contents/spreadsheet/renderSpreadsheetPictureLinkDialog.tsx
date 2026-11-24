"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { parseInternalLink, parseNamedLink } from "@mrnote/core/web/lib/spreadsheet/sheet-interactions.ts";
import { sanitizeHyperlink } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetPictureLinkDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetPictureLinkDialogInputs {
  pictureLinkDraft: { objectId: string; address: string; tooltip: string; } | null;
  setPictureLinkDraft: Dispatch<SetStateAction<{ objectId: string; address: string; tooltip: string; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  writePictureLink: (objectId: string, address: string, tooltip: string) => boolean;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetPictureLinkDialog({
  pictureLinkDraft,
  setPictureLinkDraft,
  t,
  writePictureLink,
}: RenderSpreadsheetPictureLinkDialogInputs) {
  return (
       pictureLinkDraft ? (
        <OfficeDialogShell
          open
          title={t("spreadsheet.contextMenu.insertLink")}
          description={null}
          testIdPrefix="spreadsheet-picture-link"
          defaultActionTestId="spreadsheet-picture-link-ok"
          defaultActionLabel={t("spreadsheet.fmtOk")}
          cancelActionLabel={t("common.cancel")}
          onDefaultAction={() => {
            if (writePictureLink(pictureLinkDraft.objectId, pictureLinkDraft.address, pictureLinkDraft.tooltip)) {
              setPictureLinkDraft(null);
            }
          }}
          onCancel={() => setPictureLinkDraft(null)}
          className="sm:max-w-[420px]"
        >
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.uiCopy.pictureLinkAddress")}</span>
            <input
              value={pictureLinkDraft.address}
              onChange={(event) => setPictureLinkDraft({ ...pictureLinkDraft, address: event.target.value })}
              placeholder="https://"
              spellCheck={false}
              data-testid="spreadsheet-picture-link-address"
            />
          </label>
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.uiCopy.pictureLinkScreenTip")}</span>
            <input
              value={pictureLinkDraft.tooltip}
              maxLength={255}
              onChange={(event) => setPictureLinkDraft({ ...pictureLinkDraft, tooltip: event.target.value })}
              data-testid="spreadsheet-picture-link-tooltip"
            />
          </label>
          {pictureLinkDraft.address.trim() !== "" &&
          !sanitizeHyperlink(pictureLinkDraft.address.trim()) &&
          !parseInternalLink(pictureLinkDraft.address.trim()) &&
          parseNamedLink(pictureLinkDraft.address.trim()) === null ? (
            <span role="alert" className={dialogParts.error} data-testid="spreadsheet-picture-link-error">
              {t("spreadsheet.uiCopy.pictureLinkInvalid")}
            </span>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
