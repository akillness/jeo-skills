"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useState } from "react";
import {
  FileDiff,
  Search,
  Undo2,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import LineDiffView from "@mrnote/core/web/components/console/editor/LineDiffView.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  type CodeRefactorPreviewPlan,
  type CodeRefactorUndoReceipt,
} from "../../../lib/code-runner/code-refactor-preview";
import { computeLineDiff } from "@mrnote/core/web/__cut__/mf8df84de44.ts";

import styles from "./CodeSidePanels.module.css";

export default function CodeRefactorPreviewPanel({
  plan,
  planCurrent,
  receipt,
  receiptCurrent,
  busy,
  onApply,
  onDiscard,
  onUndo,
  onRunSuggested,
}: {
  readonly plan: CodeRefactorPreviewPlan | null;
  readonly planCurrent: boolean;
  readonly receipt: CodeRefactorUndoReceipt | null;
  readonly receiptCurrent: boolean;
  readonly busy: boolean;
  readonly onApply: () => void;
  readonly onDiscard: () => void;
  readonly onUndo: () => void;
  readonly onRunSuggested?: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const [selection, setSelection] = useState<{
    readonly planId: string;
    readonly bufferId: string;
  } | null>(null);
  const [dismissedReceiptId, setDismissedReceiptId] = useState<string | null>(
    null,
  );
  const [runConfirmationReceiptId, setRunConfirmationReceiptId] = useState<
    string | null
  >(null);
  const [fileFilter, setFileFilter] = useState<{
    readonly planId: string;
    readonly value: string;
  } | null>(null);
  const fileQuery =
    plan && fileFilter?.planId === plan.id ? fileFilter.value : "";
  const normalizedFileQuery = fileQuery.trim().toLowerCase();
  const visibleChanges = useMemo(
    () =>
      plan
        ? plan.changes.filter(
            (change) =>
              normalizedFileQuery.length === 0 ||
              change.label.toLowerCase().includes(normalizedFileQuery),
          )
        : [],
    [normalizedFileQuery, plan],
  );
  const selectedBufferId =
    plan &&
    selection?.planId === plan.id &&
    visibleChanges.some((change) => change.bufferId === selection.bufferId)
      ? selection.bufferId
      : (visibleChanges[0]?.bufferId ?? null);

  const selectedChange =
    visibleChanges.find((change) => change.bufferId === selectedBufferId) ??
    visibleChanges[0] ??
    null;
  const diff = useMemo(
    () =>
      selectedChange
        ? computeLineDiff(selectedChange.before, selectedChange.after)
        : null,
    [selectedChange],
  );

  // The undo receipt is the dialog chrome's glass card (code tone) laid out
  // as one row; the preview is the shared OfficeDialogShell, its body the
  // chrome's parts (an error message, a well holding the file list box and
  // the diff, the panes' search field).
  return (
    <>
      {receipt && dismissedReceiptId !== receipt.id ? (
        <div
          data-testid="code-refactor-receipt"
          data-current={receiptCurrent ? "true" : "false"}
          role="status"
          aria-live="polite"
          className={`${officeDialogClassName({ tone: "code" })} ${styles.receipt}`}
        >
          <FileDiff size={14} aria-hidden className={styles.accent} />
          <span className={styles.grow}>
            {receiptCurrent
              ? t("code.refactor.preview.applied", {
                  count: receipt.changes.length,
                })
              : t("code.refactor.preview.undoStale")}
          </span>
          <button
            type="button"
            data-testid="code-refactor-undo"
            disabled={!receiptCurrent || busy}
            onClick={onUndo}
            title={t("code.refactor.preview.undo")}
            className={officeDialogParts.compactButton}
          >
            <Undo2 size={12} aria-hidden />
            {t("code.refactor.preview.undo")}
          </button>
          {onRunSuggested && receiptCurrent ? (
            <button
              type="button"
              data-testid="code-refactor-run-suggestion"
              disabled={busy}
              onClick={() => {
                if (runConfirmationReceiptId !== receipt.id) {
                  setRunConfirmationReceiptId(receipt.id);
                  return;
                }
                setRunConfirmationReceiptId(null);
                onRunSuggested();
              }}
              className={
                runConfirmationReceiptId === receipt.id
                  ? `${officeDialogParts.primaryButton} ${officeDialogParts.compactButton}`
                  : officeDialogParts.compactButton
              }
            >
              {t(
                runConfirmationReceiptId === receipt.id
                  ? "ai.copilot.code.confirmRun"
                  : "ai.copilot.code.suggestRun",
              )}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="code-refactor-receipt-dismiss"
            onClick={() => setDismissedReceiptId(receipt.id)}
            title={t("common.close")}
            aria-label={t("common.close")}
            className={officeDialogParts.iconButton}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      <OfficeDialogShell
        open={plan !== null}
        title={t("code.refactor.preview.title")}
        description={
          plan?.description ?? t("code.refactor.preview.description")
        }
        defaultActionLabel={t("code.refactor.preview.apply")}
        cancelActionLabel={t("code.refactor.preview.discard")}
        busy={busy}
        busyActionLabel={t("code.refactor.preview.applying")}
        defaultActionDisabled={!planCurrent}
        onDefaultAction={onApply}
        onCancel={onDiscard}
        initialFocus="cancel"
        testIdPrefix="code-refactor-preview"
        className="sm:max-w-[860px]"
      >
        {!planCurrent ? (
          <p
            data-testid="code-refactor-preview-stale"
            role="alert"
            className={officeDialogParts.message}
            data-tone="error"
          >
            {t("code.refactor.preview.stale")}
          </p>
        ) : null}

        {plan ? (
          <div
            data-testid="code-refactor-preview-workspace"
            className={`${officeDialogParts.well} ${styles.refactorWorkspace}`}
          >
            <aside
              aria-label={t("code.refactor.preview.files")}
              className={styles.refactorFiles}
            >
              <strong
                data-testid="code-refactor-preview-file-count"
                className={officeDialogParts.sectionTitle}
              >
                {t("code.refactor.preview.files")} ({visibleChanges.length}/
                {plan.changes.length})
              </strong>
              <div className={officeDialogParts.inputGroup} role="search">
                <Search size={14} aria-hidden />
                <input
                  type="search"
                  value={fileQuery}
                  maxLength={128}
                  onChange={(event) =>
                    setFileFilter({
                      planId: plan.id,
                      value: event.currentTarget.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Escape" || fileQuery.length === 0)
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    setFileFilter({ planId: plan.id, value: "" });
                  }}
                  placeholder={t("code.find.findPlaceholder")}
                  aria-label={t("code.find.findPlaceholder")}
                  data-testid="code-refactor-preview-file-search"
                />
              </div>
              <div
                role="listbox"
                aria-label={t("code.refactor.preview.files")}
                className={styles.refactorFileList}
                onKeyDown={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey) return;
                  const target = event.target;
                  if (!(target instanceof HTMLButtonElement)) return;
                  const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button[data-refactor-buffer-id]",
                    ),
                  );
                  const currentIndex = controls.indexOf(target);
                  if (currentIndex < 0 || controls.length === 0) return;
                  let nextIndex: number;
                  if (event.key === "ArrowDown") {
                    nextIndex = (currentIndex + 1) % controls.length;
                  } else if (event.key === "ArrowUp") {
                    nextIndex =
                      (currentIndex - 1 + controls.length) % controls.length;
                  } else if (event.key === "Home") {
                    nextIndex = 0;
                  } else if (event.key === "End") {
                    nextIndex = controls.length - 1;
                  } else {
                    return;
                  }
                  const next = controls[nextIndex];
                  const bufferId = next?.dataset.refactorBufferId;
                  if (
                    !next ||
                    !bufferId ||
                    !plan.changes.some((change) => change.bufferId === bufferId)
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  setSelection({ planId: plan.id, bufferId });
                  next.focus();
                }}
              >
                {visibleChanges.length === 0 ? (
                  <p
                    data-testid="code-refactor-preview-file-empty"
                    role="status"
                    className={officeDialogParts.message}
                  >
                    {t("code.findInFiles.empty")}
                  </p>
                ) : null}
                {visibleChanges.map((change) => {
                  const selected = change.bufferId === selectedChange?.bufferId;
                  return (
                    <button
                      key={change.bufferId}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      data-testid="code-refactor-preview-file"
                      data-refactor-buffer-id={change.bufferId}
                      data-selected={selected ? "true" : undefined}
                      onClick={() =>
                        setSelection({
                          planId: plan.id,
                          bufferId: change.bufferId,
                        })
                      }
                      className={`${officeDialogParts.listItem} ${styles.refactorFile}`}
                    >
                      <FileDiff size={12} aria-hidden />
                      <span title={change.label} className={styles.ellipsis}>
                        {change.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section
              aria-label={selectedChange?.label}
              className={styles.refactorDiff}
            >
              {selectedChange && diff ? (
                <>
                  <div className={styles.refactorDiffHeader}>
                    <strong className={styles.grow}>
                      {selectedChange.label}
                    </strong>
                    <span className={styles.passed}>+{diff.added}</span>
                    <span className={styles.failed}>−{diff.removed}</span>
                  </div>
                  <LineDiffView
                    diff={diff}
                    wrap={false}
                    testId="code-refactor-preview-diff"
                  />
                </>
              ) : null}
            </section>
          </div>
        ) : null}
      </OfficeDialogShell>
    </>
  );
}
