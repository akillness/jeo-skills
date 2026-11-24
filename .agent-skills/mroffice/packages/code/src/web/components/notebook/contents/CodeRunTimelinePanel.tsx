"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { CodeRibbonIcon } from "./code-output/CodeRibbonIcons";
import styles from "./CodeRunTimelinePanel.module.css";

import type { PersistedCodeDebugTimelineEntry } from "../../../lib/code-runner/code-page-debug-persistence";
import {
  codePageRunInputIdentityIsCurrent,
  type PersistedCodeRunProfile,
  type PersistedCodeRunTimelineEntry,
} from "../../../lib/code-runner/code-page-output-persistence";
/*
 * Run history may show old receipts, but replay authority additionally binds
 * the caller's current stdin digest. The body itself never leaves CodeWindow.
 */
import {
  codeTestRunReceiptIsCurrent,
  type CodeTestSource,
  type PersistedCodeTestRunTimelineEntry,
} from "../../../lib/code-runner/code-test-explorer";
import { pageInterfaceLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";

function moveHorizontalTimelineFocus(
  event: ReactKeyboardEvent<HTMLElement>,
): void {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const group = target.dataset.horizontalFocusGroup;
  if (!group) return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      `[data-horizontal-focus-group="${group}"]:not(:disabled)`,
    ),
  );
  const currentIndex = controls.indexOf(target);
  if (currentIndex < 0 || controls.length === 0) return;
  let nextIndex: number;
  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % controls.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + controls.length) % controls.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = controls.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  controls[nextIndex]?.focus();
}

interface CodeRunTimelinePanelProps {
  entries: readonly PersistedCodeRunTimelineEntry[];
  profiles: readonly PersistedCodeRunProfile[];
  currentSourceFingerprint: string | null;
  currentLanguage: string;
  currentProviderId: string | null;
  partialExecutionAvailable: boolean;
  currentStdinSha256: string | null;
  currentStdinBytes: number;
  selectedIndex: number | null;
  runLabel: string;
  savedLabel: string;
  saveLabel: string;
  removeLabel: string;
  clearLabel: string;
  confirmClearLabel: string;
  profileLimitReached: boolean;
  profileLimitLabel: string;
  confirmRemoveLabel: string;
  cancelLabel: string;
  unavailableLabel: string;
  inputUnavailableLabel: string;
  scopeLabel: (entry: PersistedCodeRunTimelineEntry) => string;
  profileLabel: (profile: PersistedCodeRunProfile) => string;
  onSelect: (index: number) => void;
  onRerun: (index: number) => void;
  onSaveSelected: () => void;
  onRunProfile: (index: number) => void;
  onRemoveProfile: (index: number) => void;
  onClear: () => void;
  saveSelectedDisabled?: boolean;
  replayActionsBlocked?: boolean;
  mutationActionsBlocked?: boolean;
}

function entryTime(completedAt: number): string {
  try {
    return new Intl.DateTimeFormat(pageInterfaceLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(completedAt));
  } catch {
    return new Date(completedAt).toISOString().slice(11, 19);
  }
}

interface CodeExecutionTimelineItem {
  readonly key: string;
  readonly completedAt: number;
  readonly outcome: "success" | "error";
  readonly sourceIsCurrent: boolean;
  readonly canReplay: boolean;
  readonly label: string;
  readonly unavailableLabel?: string;
}

interface CodeExecutionTimelinePanelProps {
  readonly items: readonly CodeExecutionTimelineItem[];
  readonly selectedIndex: number | null;
  readonly timelineLabel: string;
  readonly unavailableLabel: string;
  readonly testIdPrefix: string;
  readonly onSelect: (index: number) => void;
  readonly onReplay: (index: number) => void;
  readonly clearLabel?: string;
  readonly confirmClearLabel?: string;
  readonly cancelClearLabel?: string;
  readonly onClear?: () => void;
  readonly clearDisabled?: boolean;
  /** "strip": chips across a panel's top edge; "list": rows, in a menu. */
  readonly layout?: "strip" | "list";
}

/** Shared accessible timeline shell; Run and Debug retain their own authority. */
function CodeExecutionTimelinePanel({
  items,
  selectedIndex,
  timelineLabel,
  unavailableLabel,
  testIdPrefix,
  onSelect,
  onReplay,
  clearLabel,
  confirmClearLabel,
  cancelClearLabel,
  onClear,
  clearDisabled = false,
  layout = "strip",
}: CodeExecutionTimelinePanelProps) {
  const [clearPending, setClearPending] = useState(false);
  if (items.length === 0) return null;
  const clearConfirmationVisible = clearPending && !clearDisabled;

  return (
    <section
      aria-label={timelineLabel}
      data-testid={`${testIdPrefix}-timeline`}
      data-layout={layout}
      onKeyDown={moveHorizontalTimelineFocus}
      className={styles.section}
    >
      <span aria-hidden="true" className={styles.heading}>
        {timelineLabel}
      </span>
      {onClear && clearLabel && confirmClearLabel && cancelClearLabel ? (
        clearConfirmationVisible ? (
          <span
            data-testid={`${testIdPrefix}-timeline-clear-confirmation`}
            className={styles.confirm}
          >
            <span role="status">{confirmClearLabel}</span>
            <button
              type="button"
              onClick={() => {
                if (clearDisabled || !clearPending) return;
                setClearPending(false);
                onClear();
              }}
              data-testid={`${testIdPrefix}-timeline-clear-confirm`}
              title={confirmClearLabel}
              aria-label={confirmClearLabel}
              className={styles.tool}
            >
              <CodeRibbonIcon name="runRemove" size={16} />
            </button>
            <button
              type="button"
              onClick={() => setClearPending(false)}
              data-testid={`${testIdPrefix}-timeline-clear-cancel`}
              title={cancelClearLabel}
              aria-label={cancelClearLabel}
              className={styles.tool}
            >
              <CodeRibbonIcon name="outputClose" size={16} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setClearPending(true)}
            disabled={clearDisabled}
            data-testid={`${testIdPrefix}-timeline-clear`}
            title={clearLabel}
            aria-label={clearLabel}
            className={styles.tool}
          >
            <CodeRibbonIcon name="runClearHistory" size={16} />
          </button>
        )
      ) : null}
      {items.map((item, index) => {
        const selected = selectedIndex === index;
        const time = entryTime(item.completedAt);
        return (
          <div
            key={item.key}
            data-testid={`${testIdPrefix}-timeline-entry`}
            data-state={item.sourceIsCurrent ? "current" : "stale"}
            data-outcome={item.outcome}
            data-selected={selected ? "true" : undefined}
            className={styles.entry}
          >
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-pressed={selected}
              data-horizontal-focus-group={`${testIdPrefix}-timeline`}
              data-testid={`${testIdPrefix}-timeline-select-${index}`}
              title={`${item.label} · ${time}`}
              className={styles.main}
            >
              <CodeRibbonIcon
                name={item.outcome === "error" ? "runFailed" : "runSucceeded"}
                size={18}
              />
              <span className={styles.label}>{item.label}</span>
              <span
                className={styles.meta}
                data-stale={item.sourceIsCurrent ? undefined : "true"}
              >
                {item.sourceIsCurrent
                  ? time
                  : (item.unavailableLabel ?? unavailableLabel)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onReplay(index)}
              disabled={!item.canReplay}
              data-testid={`${testIdPrefix}-timeline-rerun-${index}`}
              title={
                item.canReplay
                  ? item.label
                  : (item.unavailableLabel ?? unavailableLabel)
              }
              aria-label={`${timelineLabel}: ${item.label}`}
              className={styles.action}
            >
              <CodeRibbonIcon name="runRerun" size={16} />
            </button>
          </div>
        );
      })}
    </section>
  );
}

export default function CodeRunTimelinePanel({
  entries,
  profiles,
  currentSourceFingerprint,
  currentLanguage,
  currentProviderId,
  partialExecutionAvailable,
  currentStdinSha256,
  currentStdinBytes,
  selectedIndex,
  runLabel,
  savedLabel,
  saveLabel,
  removeLabel,
  clearLabel,
  confirmClearLabel,
  profileLimitReached,
  profileLimitLabel,
  confirmRemoveLabel,
  cancelLabel,
  unavailableLabel,
  inputUnavailableLabel,
  scopeLabel,
  profileLabel,
  onSelect,
  onRerun,
  onSaveSelected,
  onRunProfile,
  onRemoveProfile,
  onClear,
  saveSelectedDisabled = false,
  replayActionsBlocked = false,
  mutationActionsBlocked = false,
}: CodeRunTimelinePanelProps) {
  const [pendingProfileRemoval, setPendingProfileRemoval] = useState<
    string | null
  >(null);
  const items = entries.map((entry, index) => {
    const sourceIsCurrent =
      currentSourceFingerprint !== null &&
      entry.language === currentLanguage &&
      entry.navigation.sourceFingerprint === currentSourceFingerprint;
    const inputIsCurrent = codePageRunInputIdentityIsCurrent(
      entry.input,
      currentStdinSha256,
      currentStdinBytes,
    );
    const providerIsCurrent = entry.providerId === currentProviderId;
    const scopeIsSupported =
      entry.navigation.selection === null ||
      (partialExecutionAvailable &&
        entry.navigation.selection.rangeCount === 1);
    const entryIsCurrent =
      sourceIsCurrent &&
      providerIsCurrent &&
      inputIsCurrent &&
      scopeIsSupported;
    return {
      key: `${entry.completedAt}:${entry.providerId}:${index}`,
      completedAt: entry.completedAt,
      outcome: entry.outcome,
      sourceIsCurrent: entryIsCurrent,
      canReplay: entryIsCurrent && !replayActionsBlocked,
      label: scopeLabel(entry),
      unavailableLabel: sourceIsCurrent && providerIsCurrent && scopeIsSupported
        ? inputUnavailableLabel
        : unavailableLabel,
    };
  });
  return (
    <>
      {profiles.length > 0 || entries.length > 0 ? (
        <section
          aria-label={savedLabel}
          data-testid="code-run-profiles"
          data-layout="list"
          onKeyDown={moveHorizontalTimelineFocus}
          className={styles.section}
        >
          <span aria-hidden="true" className={styles.heading}>
            {savedLabel}
          </span>
          <button
            type="button"
            onClick={onSaveSelected}
            disabled={
              saveSelectedDisabled ||
              mutationActionsBlocked ||
              profileLimitReached
            }
            data-testid="code-run-profile-save"
            title={profileLimitReached ? profileLimitLabel : saveLabel}
            aria-label={saveLabel}
            className={styles.tool}
          >
            <CodeRibbonIcon name="runSave" size={16} />
          </button>
          {profileLimitReached ? (
            <span
              role="status"
              data-testid="code-run-profile-limit"
              className={styles.note}
            >
              {profileLimitLabel}
            </span>
          ) : null}
          {profiles.map((profile, index) => {
            const profileKey = `${profile.savedAt}:${profile.sourceSha256}`;
            const removalPending =
              !mutationActionsBlocked && pendingProfileRemoval === profileKey;
            const sourceIsCurrent =
              currentSourceFingerprint !== null &&
              profile.language === currentLanguage &&
              profile.providerId === currentProviderId &&
              profile.navigation.sourceFingerprint ===
                currentSourceFingerprint;
            const inputIsCurrent = codePageRunInputIdentityIsCurrent(
              profile.input,
              currentStdinSha256,
              currentStdinBytes,
            );
            const scopeIsSupported =
              profile.navigation.selection === null ||
              partialExecutionAvailable;
            const profileIsCurrent =
              sourceIsCurrent && inputIsCurrent && scopeIsSupported;
            const canRun = profileIsCurrent && !replayActionsBlocked;
            const label = profileLabel(profile);
            return (
              <div
                key={`${profileKey}:${index}`}
                data-testid="code-run-profile"
                data-state={profileIsCurrent ? "current" : "stale"}
                className={styles.entry}
              >
                <button
                  type="button"
                  onClick={() => onRunProfile(index)}
                  disabled={!canRun}
                  data-horizontal-focus-group="code-run-profiles"
                  data-testid={`code-run-profile-run-${index}`}
                  title={
                    canRun
                      ? label
                      : sourceIsCurrent
                        ? inputUnavailableLabel
                        : unavailableLabel
                  }
                  aria-label={`${runLabel}: ${label}`}
                  className={styles.main}
                >
                  <CodeRibbonIcon name="runFile" size={18} />
                  <span className={styles.label}>{label}</span>
                  <span
                    className={styles.meta}
                    data-stale={sourceIsCurrent ? undefined : "true"}
                  >
                    {profileIsCurrent
                      ? entryTime(profile.savedAt)
                      : sourceIsCurrent
                        ? inputUnavailableLabel
                        : unavailableLabel}
                  </span>
                </button>
                {removalPending ? (
                  <>
                    <span
                      role="status"
                      data-testid={`code-run-profile-remove-prompt-${index}`}
                      className={styles.prompt}
                    >
                      {confirmRemoveLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          mutationActionsBlocked ||
                          pendingProfileRemoval !== profileKey ||
                          profiles[index] !== profile
                        ) {
                          return;
                        }
                        setPendingProfileRemoval(null);
                        onRemoveProfile(index);
                      }}
                      data-testid={`code-run-profile-remove-confirm-${index}`}
                      title={confirmRemoveLabel}
                      aria-label={`${confirmRemoveLabel}: ${label}`}
                      className={styles.action}
                    >
                      <CodeRibbonIcon name="runRemove" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingProfileRemoval(null)}
                      data-testid={`code-run-profile-remove-cancel-${index}`}
                      title={cancelLabel}
                      aria-label={cancelLabel}
                      className={styles.action}
                    >
                      <CodeRibbonIcon name="outputClose" size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingProfileRemoval(profileKey)}
                    disabled={mutationActionsBlocked}
                    data-testid={`code-run-profile-remove-${index}`}
                    title={removeLabel}
                    aria-label={`${removeLabel}: ${label}`}
                    className={styles.action}
                  >
                    <CodeRibbonIcon name="runRemove" size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ) : null}
      <CodeExecutionTimelinePanel
        items={items}
        selectedIndex={selectedIndex}
        timelineLabel={runLabel}
        unavailableLabel={unavailableLabel}
        testIdPrefix="code-run"
        onSelect={onSelect}
        onReplay={onRerun}
        clearLabel={clearLabel}
        confirmClearLabel={confirmClearLabel}
        cancelClearLabel={cancelLabel}
        onClear={onClear}
        clearDisabled={mutationActionsBlocked}
        layout="list"
      />
    </>
  );
}



interface CodeDebugTimelinePanelProps {
  entries: readonly PersistedCodeDebugTimelineEntry[];
  /** Trusted current-source SHA-256; legacy prop name is kept for the panel host. */
  currentSourceFingerprint: string | null;
  currentLanguage: string;
  selectedIndex: number | null;
  debugLabel: string;
  unavailableLabel: string;
  clearLabel: string;
  confirmClearLabel: string;
  cancelLabel: string;
  entryLabel: (entry: PersistedCodeDebugTimelineEntry) => string;
  onSelect: (index: number) => void;
  onDebugAgain: (index: number) => void;
  onClear: () => void;
  actionsBlocked?: boolean;
}

export function CodeDebugTimelinePanel({
  entries,
  currentSourceFingerprint,
  currentLanguage,
  selectedIndex,
  debugLabel,
  unavailableLabel,
  clearLabel,
  confirmClearLabel,
  cancelLabel,
  entryLabel,
  onSelect,
  onDebugAgain,
  onClear,
  actionsBlocked = false,
}: CodeDebugTimelinePanelProps) {
  const items = entries.map((entry, index) => {
    const sourceIsCurrent =
      currentSourceFingerprint !== null &&
      entry.language === currentLanguage &&
      entry.sourceFingerprint === currentSourceFingerprint;
    return {
      key: `${entry.completedAt}:${entry.sourceFingerprint}:${index}`,
      completedAt: entry.completedAt,
      outcome: entry.outcome,
      sourceIsCurrent,
      canReplay: sourceIsCurrent && !actionsBlocked,
      label: entryLabel(entry),
    };
  });
  return (
    <CodeExecutionTimelinePanel
      items={items}
      selectedIndex={selectedIndex}
      timelineLabel={debugLabel}
      unavailableLabel={unavailableLabel}
      testIdPrefix="code-debug"
      onSelect={onSelect}
      onReplay={onDebugAgain}
      clearLabel={clearLabel}
      confirmClearLabel={confirmClearLabel}
      cancelClearLabel={cancelLabel}
      onClear={onClear}
      clearDisabled={actionsBlocked}
    />
  );
}

interface CodeTestRunTimelinePanelProps {
  entries: readonly PersistedCodeTestRunTimelineEntry[];
  currentSources: readonly CodeTestSource[];
  selectedIndex: number | null;
  timelineLabel: string;
  unavailableLabel: string;
  clearLabel: string;
  confirmClearLabel: string;
  cancelLabel: string;
  entryLabel: (entry: PersistedCodeTestRunTimelineEntry) => string;
  onSelect: (index: number) => void;
  onRerun: (index: number) => void;
  onClear: () => void;
  actionsBlocked?: boolean;
}

/** Test history reuses the same timeline shell while retaining test authority. */
export function CodeTestRunTimelinePanel({
  entries,
  currentSources,
  selectedIndex,
  timelineLabel,
  unavailableLabel,
  clearLabel,
  confirmClearLabel,
  cancelLabel,
  entryLabel,
  onSelect,
  onRerun,
  onClear,
  actionsBlocked = false,
}: CodeTestRunTimelinePanelProps) {
  const items = entries.map((entry, index) => {
    const sourcePageIds = new Set(
      entry.receipt.sources.map((source) => source.pageId),
    );
    const sourceIsCurrent = codeTestRunReceiptIsCurrent(
      entry.receipt,
      currentSources.filter((source) => sourcePageIds.has(source.pageId)),
    );
    return {
      key: `${entry.receipt.completedAt}:${entry.receipt.runId}:${index}`,
      completedAt: Date.parse(entry.receipt.completedAt),
      outcome: entry.receipt.results.some((result) => result.status === "failed")
        ? ("error" as const)
        : ("success" as const),
      sourceIsCurrent,
      canReplay: sourceIsCurrent && !actionsBlocked,
      label: entryLabel(entry),
    };
  });
  return (
    <CodeExecutionTimelinePanel
      items={items}
      selectedIndex={selectedIndex}
      timelineLabel={timelineLabel}
      unavailableLabel={unavailableLabel}
      testIdPrefix="code-test"
      onSelect={onSelect}
      onReplay={onRerun}
      clearLabel={clearLabel}
      confirmClearLabel={confirmClearLabel}
      cancelClearLabel={cancelLabel}
      onClear={onClear}
      clearDisabled={actionsBlocked}
    />
  );
}
