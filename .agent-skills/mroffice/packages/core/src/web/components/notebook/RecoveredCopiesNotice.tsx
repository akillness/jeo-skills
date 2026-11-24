"use client";














/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import WindowNotice from "./WindowNotice";
import windowNoticeStyles from "./DocumentIssueNotice.module.css";
import ConfirmDialog from "../ui/ConfirmDialog";
import type { AutoRecoverCopy } from "../../lib/autorecover-store";
import { pageInterfaceLocale } from "../../lib/i18n/content-locale";

export interface RecoveredCopyAction {
  /** The action's test id is `${testIdPrefix}-recovered-copy-${id}`. */
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Asked first: the dialog's words, for this copy. */
  readonly confirm?: (copy: AutoRecoverCopy, time: string) => {
    readonly title: string;
    readonly body: string;
    readonly confirmLabel: string;
  };
  readonly run: (copy: AutoRecoverCopy) => void;
}

export function recoveredCopyTime(copy: Pick<AutoRecoverCopy, "savedAt">): string {
  return new Date(copy.savedAt).toLocaleString(pageInterfaceLocale());
}

export default function RecoveredCopiesNotice({
  pageId,
  copies,
  testIdPrefix,
  actions,
  description,
}: {
  pageId: string;
  copies: readonly AutoRecoverCopy[];
  testIdPrefix: string;
  /** In the order shown; the first is the recommended one. */
  actions: readonly RecoveredCopyAction[];
  /** The notice's body, when the editor's choices differ from Restore / Delete. */
  description?: string;
}) {
  const t = useTranslations("console-notebooks");
  const [asking, setAsking] = useState<{ copy: AutoRecoverCopy; action: RecoveredCopyAction } | null>(null);
  if (copies.length === 0) return null;
  const words = asking?.action.confirm?.(asking.copy, recoveredCopyTime(asking.copy)) ?? null;
  return (
    <WindowNotice
      title={t("pages.recoveredCopy.title")}
      label={t("pages.recoveredCopy.title")}
      description={description ?? t("pages.recoveredCopy.body")}
      scopeKey={`${pageId}:recovered-copy:${copies.map((copy) => copy.slot).join(",")}`}
      autoOpen
      passive
      testId={`${testIdPrefix}-recovered-copy-notice`}
    >
      <ul className={windowNoticeStyles.list}>
        {copies.map((copy) => (
          <li key={copy.slot} data-testid={`${testIdPrefix}-recovered-copy`} data-slot={copy.slot} className={windowNoticeStyles.issue}>
            <p>{t("pages.recoveredCopy.savedAt", { time: recoveredCopyTime(copy) })}</p>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={windowNoticeStyles.action}
                data-testid={`${testIdPrefix}-recovered-copy-${action.id}`}
                disabled={action.disabled}
                onClick={() => (action.confirm ? setAsking({ copy, action }) : action.run(copy))}
              >
                {action.label}
              </button>
            ))}
          </li>
        ))}
      </ul>
      {asking && words ? (
        <ConfirmDialog
          open
          title={words.title}
          body={words.body}
          confirmLabel={words.confirmLabel}
          confirmVariant="destructive"
          autoFocusConfirm={false}
          onConfirm={() => {
            const { copy, action } = asking;
            setAsking(null);
            action.run(copy);
          }}
          onCancel={() => setAsking(null)}
        />
      ) : null}
    </WindowNotice>
  );
}
