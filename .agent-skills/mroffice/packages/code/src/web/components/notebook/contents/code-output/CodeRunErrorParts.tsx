"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What the Code window adds to a failed run's error card (CellOutput's
 * TracebackBlock): the compiler's located problems, each a jump to its line,
 * and the AI action that explains the failure and proposes a fix.
 */

import { WandSparkles } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import styles from "./CodeRunErrorParts.module.css";

/** A located compiler problem (lib/code-runner/compiler-diagnostics). */
export interface RunErrorProblem {
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly col: number;
  readonly message: string;
}

/** Problems listed in the card; the rest are a click away in Problems. */
const LISTED_PROBLEMS = 5;

/**
 * `P` may carry more than the location (a LaTeX log entry with its file); the
 * labels and the reveal get the problem as passed.
 */
export function CodeRunProblemList<P extends RunErrorProblem>({
  problems,
  lineLabel,
  jumpLabel,
  moreLabel,
  onReveal,
  onShowAll,
}: {
  problems: readonly P[];
  lineLabel: (problem: P) => string;
  jumpLabel: (problem: P) => string;
  moreLabel: (count: number) => string;
  onReveal: (problem: P) => void;
  onShowAll?: () => void;
}) {
  if (problems.length === 0) return null;
  const listed = problems.slice(0, LISTED_PROBLEMS);
  const more = problems.length - listed.length;
  return (
    <div
      role="list"
      data-testid="code-run-error-problems"
      className={styles.problems}
    >
      {listed.map((problem, index) => (
        <button
          key={`${problem.from}:${problem.to}:${index}`}
          type="button"
          role="listitem"
          data-testid="code-run-error-problem"
          className={styles.problem}
          onClick={() => onReveal(problem)}
          title={jumpLabel(problem)}
        >
          <span className={styles.problemLine}>{lineLabel(problem)}</span>
          <span className={styles.problemMessage}>{problem.message}</span>
        </button>
      ))}
      {more > 0 && onShowAll ? (
        <button
          type="button"
          data-testid="code-run-error-problems-more"
          className={styles.more}
          onClick={onShowAll}
        >
          {moreLabel(more)}
        </button>
      ) : null}
    </div>
  );
}

export function CodeRunErrorAiAction({
  label,
  accessibleLabel,
  disabledReason,
  onClick,
}: {
  label: string;
  accessibleLabel: string;
  disabledReason: string | null;
  onClick: () => void;
}) {
  return (
    null
  );
}

/**
 * A Run the browser runtime can never carry out (a GUI window, a terminal
 * UI, a subprocess), said before it starts: the AI rewrite that runs in the
 * page, and running it anyway (code-runtime-guard).
 */
export function CodeRunRuntimeGuardActions({
  rewriteLabel,
  rewriteAccessibleLabel,
  rewriteDisabledReason,
  onRewrite,
  runAnywayLabel,
  runAnywayHint,
  onRunAnyway,
}: {
  rewriteLabel: string;
  rewriteAccessibleLabel: string;
  rewriteDisabledReason: string | null;
  onRewrite: () => void;
  runAnywayLabel: string;
  runAnywayHint: string;
  onRunAnyway: () => void;
}) {
  return (
    <span className={styles.guardActions} data-testid="code-runtime-guard">
      <button
        type="button"
        onClick={onRewrite}
        disabled={Boolean(rewriteDisabledReason)}
        data-testid="code-runtime-guard-rewrite"
        data-disabled-reason={rewriteDisabledReason ?? undefined}
        title={rewriteAccessibleLabel}
        aria-label={rewriteAccessibleLabel}
        className={styles.aiAction}
      >
        <span className={styles.aiActionFace}>
          <WandSparkles size={14} aria-hidden="true" />
          {rewriteLabel}
        </span>
      </button>
      <button
        type="button"
        onClick={onRunAnyway}
        data-testid="code-runtime-guard-run-anyway"
        title={runAnywayHint}
        className={styles.guardRunAnyway}
      >
        {runAnywayLabel}
      </button>
    </span>
  );
}

export function CodeRunErrorAiFailure({ message }: { message: string }) {
  return (
    null
  );
}
