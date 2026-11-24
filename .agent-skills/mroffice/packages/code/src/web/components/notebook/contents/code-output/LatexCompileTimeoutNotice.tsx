"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What a LaTeX compile that met its plan's time limit says under its output:
 * the limit it met, what shortens a compile, and the two ways on: compile
 * again in Fast [draft] mode, or a plan with longer compiles (Pro and Pro+
 * 30 s, Power 100 s), offered in the upgrade dialog every plan boundary uses.
 */

import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

import { CODE_OUTPUT_CHROME_CLASS, outputStyles } from "./codeOutputChrome";

/** The longest compile any plan grants (Power). */
const LONGEST_COMPILE_MS = 100_000;

export function LatexCompileTimeoutNotice({
  limitMs,
  draftMode,
  onUseDraftMode,
}: {
  limitMs: number;
  /** Whether the page already compiles in Fast [draft] mode. */
  draftMode: boolean;
  /** Switch to Fast [draft] mode and compile again. */
  onUseDraftMode?: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const seconds = Math.round(limitMs / 1_000);
  const offerLonger = limitMs < LONGEST_COMPILE_MS;
  return (
    <div
      role="note"
      data-testid="code-output-latex-timeout"
      className={`${CODE_OUTPUT_CHROME_CLASS} ${outputStyles.notice}`}
    >
      <div className={`${officeDialogParts.well} ${outputStyles.noticeWell}`}>
        <p className={officeDialogParts.sectionTitle}>
          {t("codeOutput.latex.timedOut", { seconds })}
        </p>
        <p className={officeDialogParts.description}>
          {t("codeOutput.latex.timedOutHint")}
        </p>
        {(!draftMode && onUseDraftMode) || offerLonger ? (
          <div className={outputStyles.noticeActions}>
            {!draftMode && onUseDraftMode ? (
              <button
                type="button"
                data-testid="code-output-latex-timeout-draft"
                onClick={onUseDraftMode}
                className={officeDialogParts.compactButton}
              >
                {t("codeOutput.latex.useDraftMode")}
              </button>
            ) : null}
            {offerLonger ? (
              <button
                type="button"
                data-testid="code-output-latex-timeout-upgrade"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("mrnote:plan-required", {
                      detail: {
                        code: "latex_compile_timeout",
                        details: { limit: seconds },
                      },
                    }),
                  )
                }
                className={officeDialogParts.compactButton}
              >
                {t("codeOutput.latex.longerCompiles")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
