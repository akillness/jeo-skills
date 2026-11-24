"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Zap } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { SpreadsheetOptionsButton } from "./SpreadsheetOptionsButton";

export type SpreadsheetTableAutoCorrectKind =
  | "expansion"
  | "calculated-column"
  | "calculated-overwrite";

const APPLY_LABEL: Record<SpreadsheetTableAutoCorrectKind, string> = {
  expansion: "spreadsheet.autoCorrect.undoTableAutoExpansion",
  "calculated-column": "spreadsheet.autoCorrect.undoCalculatedColumn",
  "calculated-overwrite": "spreadsheet.autoCorrect.overwriteCalculatedColumn",
};

/**
 * The AutoCorrect Options button Excel shows after a table grew to take an
 * entry or a formula filled (or could fill) a calculated column. The first
 * choice undoes or completes that action; the second is the matching "Stop
 * Automatically ..." option. "Control AutoCorrect Options..." is left out:
 * MRAI has no AutoCorrect dialog.
 */
export function SpreadsheetTableAutoCorrectButton({
  kind,
  left,
  top,
  onChoose,
  onDismiss,
}: {
  kind: SpreadsheetTableAutoCorrectKind;
  left: number;
  top: number;
  onChoose: (choice: "apply" | "stop") => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("console-notebooks");
  return (
    <SpreadsheetOptionsButton
      label={t("spreadsheet.autoCorrect.options")}
      icon={<Zap size={12} aria-hidden />}
      left={left}
      top={top}
      onDismiss={onDismiss}
      testId="spreadsheet-autocorrect-options"
      items={[
        {
          id: "apply",
          label: t(APPLY_LABEL[kind]),
          onSelect: () => onChoose("apply"),
          testId: "spreadsheet-autocorrect-apply",
        },
        {
          id: "stop",
          label: t(
            kind === "expansion"
              ? "spreadsheet.autoCorrect.stopExpandingTables"
              : "spreadsheet.autoCorrect.stopCreatingCalculatedColumns",
          ),
          onSelect: () => onChoose("stop"),
          testId: "spreadsheet-autocorrect-stop",
        },
      ]}
    />
  );
}
