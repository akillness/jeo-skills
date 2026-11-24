"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { BUILTIN_CJK_FILL_LISTS } from "../../../../lib/spreadsheet/fill-series";
import { type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { OfficeHomeMenuTrigger } from "./SpreadsheetRibbonControls";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetCustomListsDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetCustomListsDialogInputs {
  addCustomList: () => void;
  customListDraft: string;
  customListDraftRef: RefObject<HTMLTextAreaElement | null>;
  customListsOpen: boolean;
  gridActiveCellFocusTarget: () => HTMLElement | null;
  removeCustomList: (index: number) => void;
  setCustomListDraft: Dispatch<SetStateAction<string>>;
  setCustomListsOpen: Dispatch<SetStateAction<boolean>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  viewOptions: SpreadsheetViewOptions;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetCustomListsDialog({
  addCustomList,
  customListDraft,
  customListDraftRef,
  customListsOpen,
  gridActiveCellFocusTarget,
  removeCustomList,
  setCustomListDraft,
  setCustomListsOpen,
  t,
  viewOptions,
}: RenderSpreadsheetCustomListsDialogInputs) {
  return (
       customListsOpen ? (
        <OfficeDialogShell
          open
          title={t("spreadsheet.customListsMenu")}
          description={t("spreadsheet.customListsHint")}
          testIdPrefix="spreadsheet-custom-lists"
          defaultActionTestId="spreadsheet-custom-lists-add"
          cancelActionTestId="spreadsheet-custom-lists-close"
          defaultActionLabel={t("spreadsheet.customListsAdd")}
          cancelActionLabel={t("common.close")}
          onDefaultAction={addCustomList}
          onCancel={() => setCustomListsOpen(false)}
          initialFocusRef={customListDraftRef}
          returnFocusTarget={gridActiveCellFocusTarget}
          className="sm:max-w-[360px] max-h-[calc(100dvh-32px)] overflow-y-auto"
        >
          {/* Built-in CJK lists (read-only): a preview so the user sees what
              drag-fill already recognizes without re-adding them. */}
          <span
            data-testid="spreadsheet-custom-lists-builtin"
            className={dialogParts.hint}
            style={{ display: "flex", flexDirection: "column", gap: 1 }}
          >
            {BUILTIN_CJK_FILL_LISTS.map((list) => (
              <span
                key={list.id}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {`${list.members.slice(0, 4).join("、")}…`}
              </span>
            ))}
          </span>
          {viewOptions.customLists.length > 0 ? (
            <span
              className={dialogParts.list}
              style={{ gap: 2, padding: "2px 2px 2px 8px" }}
              data-testid="spreadsheet-custom-lists-existing"
            >
              {viewOptions.customLists.map((list, index) => (
                <span
                  key={index}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {list.join(", ")}
                  </span>
                  <OfficeHomeMenuTrigger
                    type="button"
                    onClick={() => removeCustomList(index)}
                    title={t("spreadsheet.customListsRemove")}
                    data-testid={`spreadsheet-custom-list-remove-${index}`}
                    label={t("spreadsheet.customListsRemove")}
                    variant="icon"
                    icon={<X size={11} />}
                  />
                </span>
              ))}
            </span>
          ) : null}
          <textarea
            ref={customListDraftRef}
            value={customListDraft}
            onChange={(event) => setCustomListDraft(event.target.value)}
            placeholder={t("spreadsheet.customListsPlaceholder")}
            aria-label={t("spreadsheet.customListsNewLabel")}
            data-testid="spreadsheet-custom-lists-draft"
            rows={3}
            style={{ resize: "vertical" }}
          />
        </OfficeDialogShell>
      ) : null
  );
}
