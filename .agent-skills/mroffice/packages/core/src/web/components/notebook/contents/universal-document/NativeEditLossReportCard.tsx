"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "../../../../../host/next-intl";
import { localizeLossReportText, lossKindLabel } from "../../../../lib/loss-report-copy";
import DocumentIssueNotice, {
  type DocumentIssue,
} from "../../DocumentIssueNotice";

export const NATIVE_EDIT_LOSS_REPORT_I18N_KEYS = [
  "ui.loss_report.invitation",
] as const;

type LossReportSurface = "native-edit" | "projection";

interface NativeEditLossReportCardProps {
  lossReport?: Record<string, unknown> | null;
  lossEntries?: unknown;
  surface?: LossReportSurface;
  enabled?: boolean;
  testId?: string;
}

interface NativeLossEntry {
  source_anchor: string;
  loss_kind: string;
  detail: string;
  severity?: string;
}

export function NativeEditLossReportCard({
  lossReport,
  lossEntries,
  surface = "native-edit",
  enabled,
  testId,
}: NativeEditLossReportCardProps) {
  const t = useTranslations("console-notebooks");
  const isEnabled =
    surface === "projection"
      ? true
      : enabled === undefined
        ? nativeEditLossReportEnabled()
        : enabled;
  if (!isEnabled) return null;
  const issues = nativeEditLossIssues({ lossReport, lossEntries, t });
  const noticeId =
    testId ||
    (surface === "native-edit"
      ? "native-edit-loss-report"
      : "docx-loss-report");

  return (
    <DocumentIssueNotice
      issues={issues}
      scopeKey={JSON.stringify([surface, lossReport?.ref, issues])}
      testId={noticeId}
      triggerTestId={`${noticeId}-toggle`}
    />
  );
}

export function nativeEditLossReportEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_NATIVE_EDIT_TRANSACTIONS_V1 !== "0";
}

/** Only an explicit, structurally readable info row may be quiet. */
export function nativeEditLossIssues({
  lossReport,
  lossEntries,
  reportedCount = 0,
  t,
}: {
  lossReport?: Record<string, unknown> | null;
  lossEntries?: unknown;
  reportedCount?: number;
  t: ReturnType<typeof useTranslations>;
}): DocumentIssue[] {
  const say = (text: string) => localizeLossReportText(text, t);
  const groups = lossEntryGroups(lossReport, lossEntries);
  const entries = uniqueEntries(groups.flat());
  const issues: DocumentIssue[] = entries
    .filter((entry) => entry.severity !== "info")
    .map((entry, index) => ({
      key: `loss-${index}`,
      label:
        entry.loss_kind === "unknown"
          ? t("documentIssues.unknownDetail")
          : lossKindLabel(entry.loss_kind, t),
      description: [say(entry.detail), entry.source_anchor]
        .filter(Boolean)
        .join("\n"),
      tone:
        entry.severity === "blocking" || entry.severity === "error"
          ? "error"
          : "warning",
    }));
  const totalReported = Math.max(
    finiteCount(reportedCount),
    finiteCount(lossReport?.entry_count),
  );
  // Mirrored arrays share a count; identical source rows remain covered even
  // though their repeated display text collapses to one item.
  const coveredCount = Math.max(
    entries.length,
    ...groups.map((group) => group.length),
  );
  const coveredActionableCount = Math.max(
    issues.length,
    ...groups.map(
      (group) => group.filter((entry) => entry.severity !== "info").length,
    ),
  );
  const severityCounts = detailObject(lossReport?.severity_counts)
    ? lossReport.severity_counts
    : {};
  const severityTotal = Object.values(severityCounts).reduce<number>(
    (sum, value) => sum + finiteCount(value),
    0,
  );
  const actionableTotal = Object.entries(severityCounts).reduce(
    (sum, [severity, count]) =>
      sum + (severity === "info" ? 0 : finiteCount(count)),
    0,
  );
  const remainder = Math.max(
    0,
    Math.max(totalReported, severityTotal) - coveredCount,
    actionableTotal - coveredActionableCount,
  );
  if (remainder > 0) {
    issues.push({
      key: "loss-unreported",
      label: t("importStatus.unreportedLosses", { count: remainder }),
      tone:
        finiteCount(severityCounts.blocking) +
          finiteCount(severityCounts.error) >
        0
          ? "error"
          : "warning",
    });
  }
  const userFacingText = stringValue(lossReport?.user_facing_text);
  const completeInfoOnly = entries.length > 0 && issues.length === 0;
  if (userFacingText && !completeInfoOnly) {
    issues.unshift({
      key: "loss-report-summary",
      label: t(NATIVE_EDIT_LOSS_REPORT_I18N_KEYS[0]),
      description: say(userFacingText),
    });
  }
  return issues;
}

export function nativeEditLossEntries(
  lossReport?: Record<string, unknown> | null,
  lossEntries?: unknown,
): NativeLossEntry[] {
  return uniqueEntries(lossEntryGroups(lossReport, lossEntries).flat());
}

function lossEntryGroups(
  lossReport?: Record<string, unknown> | null,
  lossEntries?: unknown,
): NativeLossEntry[][] {
  return [
    coerceLossEntries(lossEntries),
    coerceLossEntries(lossReport?.entries),
    [
      ...coerceStructuredEntries(lossReport?.dropped_objects, "dropped"),
      ...coerceStructuredEntries(
        lossReport?.unsupported_features,
        "unsupported",
      ),
      ...coerceStructuredEntries(
        lossReport?.approximated_formatting,
        "formatting",
      ),
    ],
  ];
}

function uniqueEntries(entries: NativeLossEntry[]): NativeLossEntry[] {
  const unique = new Map<string, NativeLossEntry>();
  for (const entry of entries) {
    unique.set(
      JSON.stringify([
        entry.source_anchor,
        entry.loss_kind,
        entry.detail,
        entry.severity,
      ]),
      entry,
    );
  }
  return [...unique.values()];
}

function rows(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function unknownEntry(raw: unknown): NativeLossEntry {
  return { source_anchor: "", loss_kind: "unknown", detail: stringValue(raw) };
}

function coerceLossEntries(rawEntries: unknown): NativeLossEntry[] {
  return rows(rawEntries).map((raw) => {
    if (!detailObject(raw)) return unknownEntry(raw);
    const sourceAnchor = stringValue(raw.source_anchor);
    const lossKind = stringValue(raw.loss_kind);
    const severity = stringValue(raw.severity);
    return {
      source_anchor: sourceAnchor,
      loss_kind: lossKind || "unknown",
      detail: stringValue(raw.detail),
      ...(sourceAnchor && lossKind && severity ? { severity } : {}),
    };
  });
}

function coerceStructuredEntries(
  rawEntries: unknown,
  kind: "dropped" | "unsupported" | "formatting",
): NativeLossEntry[] {
  return rows(rawEntries).map((raw) => {
    if (!detailObject(raw)) return unknownEntry(raw);
    const sourceAnchor = allAnchors(raw.source_anchors);
    const lossKind = stringValue(
      kind === "dropped"
        ? raw.object_kind
        : kind === "unsupported"
          ? raw.feature_id
          : raw.human_label,
    );
    const detail =
      kind === "formatting"
        ? [stringValue(raw.before_summary), stringValue(raw.after_summary)]
            .filter(Boolean)
            .join(" -> ")
        : stringValue(raw.human_label || raw.why_not_supported);
    const severity = stringValue(raw.severity);
    return {
      source_anchor: sourceAnchor,
      loss_kind: lossKind || "unknown",
      detail,
      ...(lossKind && severity ? { severity } : {}),
    };
  });
}

function allAnchors(rawAnchors: unknown): string {
  if (!Array.isArray(rawAnchors)) return "";
  return rawAnchors
    .map((raw) => (detailObject(raw) ? stringValue(raw.locator) : ""))
    .filter(Boolean)
    .join("\n");
}

function detailObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}
