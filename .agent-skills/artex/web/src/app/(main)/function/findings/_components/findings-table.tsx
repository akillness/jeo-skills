"use client";

import * as React from "react";

import Link from "next/link";

import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  FileTextIcon,
  FlaskConicalIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { statusMeta, type Tone, toneClasses } from "@/lib/status";
import type {
  ActiveFindingRetest,
  Finding,
  FindingReportState,
  FindingStatus,
  Severity,
  VerificationStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { intlLocale, t } from "@/i18n";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export const FINDING_STATUSES: FindingStatus[] = [
  "pending",
  "in_progress",
  "confirmed",
  "resolved",
  "fixed",
  "false_positive",
  "ignored",
  "duplicate",
  "risk_accepted",
];

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "verified",
  "unverified",
  "blocked",
  "not_assessed",
  "false_positive",
];

export const FINDING_REPORT_STATES: FindingReportState[] = [
  "none",
  "submitted",
  "accepted",
  "rejected",
  "duplicate",
];

export const REPORT_STATE_META: Record<FindingReportState, { label: string; tone: Tone }> = {
  none: { label: t("Not submitted"), tone: "slate" },
  submitted: { label: t("Submitted"), tone: "amber" },
  accepted: { label: t("Accepted"), tone: "green" },
  rejected: { label: t("Rejected"), tone: "red" },
  duplicate: { label: t("Duplicate report"), tone: "neutral" },
};

export function ReportStateBadge({ state }: { state?: FindingReportState }) {
  const value = state ?? "none";
  const meta = REPORT_STATE_META[value] ?? REPORT_STATE_META.none;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs",
        toneClasses[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

// Verification outcome → label/tone, on the same tone tokens StatusBadge uses.
export const VERIFICATION_META: Record<VerificationStatus, { label: string; tone: Tone }> = {
  verified: { label: t("Verified"), tone: "green" },
  unverified: { label: t("Unverified"), tone: "slate" },
  blocked: { label: t("Blocked"), tone: "amber" },
  not_assessed: { label: t("Not assessed"), tone: "red" },
  false_positive: { label: t("False positive"), tone: "neutral" },
};

// VerificationBadge shows the automated verification outcome ("Verified L3" when a
// proof-of-exploitation level is declared). It renders nothing when the finding carries
// no verification status (in-task nodes, payloads from before the column existed).
export function VerificationBadge({ finding }: { finding: Pick<Finding, "verification_status" | "poe_level"> }) {
  const meta = finding.verification_status ? VERIFICATION_META[finding.verification_status] : undefined;
  if (!meta) return null;
  const label =
    finding.verification_status === "verified" && finding.poe_level
      ? `${meta.label} L${finding.poe_level}`
      : meta.label;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-0.5 font-medium text-xs",
        toneClasses[meta.tone],
      )}
    >
      {label}
    </span>
  );
}

export const UNASSIGNED_TASK = "__unassigned__";

// Inline edit buffer: the expanded row's name/category/severity.
export interface FindingEdit {
  name: string;
  vulnclass: string;
  severity: Severity;
}

export type FindingReport = { status: "loading" | "done" | "error"; text: string };

// Exploration node ids are only unique inside a task. Prefer the persisted
// finding id and otherwise namespace the node id by task so editing one group
// cannot update a similarly-named node in another expanded group.
export function findingRowKey(finding: Finding): string {
  if (finding.finding_id) return `finding:${finding.finding_id}`;
  return `node:${finding.task_id ?? UNASSIGNED_TASK}:${finding.id}`;
}

export function isSameFinding(left: Finding, right: Finding): boolean {
  return findingRowKey(left) === findingRowKey(right);
}

export function fmtTime(ts: string) {
  return new Date(ts).toLocaleString(intlLocale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COLUMN_COUNT = 10;

interface FindingsTableProps {
  items: Finding[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleSelectedPage: (ids: string[], checked: boolean) => void;
  /** The expanded row's findingRowKey; null = all collapsed. */
  expandedKey: string | null;
  onToggleRow: (finding: Finding) => void;
  reports: Record<string, FindingReport>;
  edit: FindingEdit | null;
  onEditChange: React.Dispatch<React.SetStateAction<FindingEdit | null>>;
  saving: boolean;
  onSave: (finding: Finding) => void;
  onStatusChange: (finding: Finding, next: FindingStatus) => void;
  onReportStateChange: (finding: Finding, next: FindingReportState) => void;
  onRetest: (finding: Finding) => void;
  activeRetests: Record<string, ActiveFindingRetest>;
  onDeepen: (finding: Finding) => void;
  onDelete: (finding: Finding) => void;
  /** The select-all checkbox's accessibility label; the flat and grouped views word it differently. */
  selectAllLabel?: string;
}

// FindingsTable is the findings list's table body; the flat view and the grouped-by-task view share the same row rendering
// (selection / inline expand / rename & status change / retest / deepen / delete), differing only in the outer container and pagination.
export function FindingsTable({
  items,
  selectedIds,
  onToggleSelected,
  onToggleSelectedPage,
  expandedKey,
  onToggleRow,
  reports,
  edit,
  onEditChange,
  saving,
  onSave,
  onStatusChange,
  onReportStateChange,
  onRetest,
  activeRetests,
  onDeepen,
  onDelete,
  selectAllLabel = t("Select all on this page"),
}: FindingsTableProps) {
  const selectableIds = items.map((finding) => finding.finding_id).filter((id): id is string => Boolean(id));
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  let headerChecked: boolean | "indeterminate" = false;
  if (selectableIds.length > 0 && selectedCount === selectableIds.length) {
    headerChecked = true;
  } else if (selectedCount > 0) {
    headerChecked = "indeterminate";
  }

  return (
    /* Fixed column widths keep expanded content from stretching the table; narrow screens scroll horizontally inside the table only. */
    <Table className="min-w-[68rem] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              checked={headerChecked}
              onCheckedChange={(checked) => onToggleSelectedPage(selectableIds, checked === true)}
              aria-label={selectAllLabel}
            />
          </TableHead>
          <TableHead className="w-8" />
          <TableHead className="w-20">{t("Severity")}</TableHead>
          <TableHead>{t("Vulnerability")}</TableHead>
          <TableHead className="w-44">{t("Asset")}</TableHead>
          <TableHead className="w-28">{t("Status")}</TableHead>
          <TableHead className="w-36">{t("Report")}</TableHead>
          <TableHead className="w-32">{t("Task")}</TableHead>
          <TableHead className="w-24">{t("Time")}</TableHead>
          <TableHead className="w-48">{t("Actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((f) => {
          const rowKey = findingRowKey(f);
          const open = expandedKey === rowKey;
          const retest = f.finding_id ? activeRetests[f.finding_id] : undefined;
          return (
            <React.Fragment key={rowKey}>
              <TableRow
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => onToggleRow(f)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  onToggleRow(f);
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {f.finding_id && (
                    <Checkbox
                      checked={selectedIds.has(f.finding_id)}
                      onCheckedChange={(c) => onToggleSelected(f.finding_id as string, c === true)}
                      aria-label={t("Select this vulnerability")}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRightIcon
                    className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge domain="severity" value={f.severity} dot />
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {f.finding_id ? (
                      <Link
                        href={`/function/findings/detail?id=${f.finding_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-medium hover:text-primary hover:underline"
                        title={t("View finding details")}
                      >
                        {f.name || f.vulnclass || t("Uncategorized")}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{f.name || f.vulnclass || t("Uncategorized")}</span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">{f.summary}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline">{t("Traffic evidence: {count}", { count: f.traffic_count ?? 0 })}</Badge>
                      <VerificationBadge finding={f} />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {f.assets && f.assets.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {f.assets.slice(0, 3).map((a) => (
                        <code
                          key={a.id}
                          className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                          title={`${a.type} · ${a.label}`}
                        >
                          {a.label}
                        </code>
                      ))}
                      {f.assets.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{f.assets.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {f.finding_id ? (
                    <Select value={f.status} onValueChange={(v) => onStatusChange(f, v as FindingStatus)}>
                      <SelectTrigger size="sm" className="h-7 w-full border-none px-1 shadow-none focus-visible:ring-0">
                        <StatusBadge domain="finding" value={f.status} dot />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        {FINDING_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {statusMeta("finding", st).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge domain="finding" value={f.status} dot />
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {f.finding_id ? (
                    <Select
                      value={f.report_state ?? "none"}
                      onValueChange={(v) => onReportStateChange(f, v as FindingReportState)}
                    >
                      <SelectTrigger size="sm" className="h-7 w-full border-none px-1 shadow-none focus-visible:ring-0">
                        <ReportStateBadge state={f.report_state} />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        {FINDING_REPORT_STATES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {REPORT_STATE_META[st].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <ReportStateBadge state={f.report_state} />
                  )}
                </TableCell>
                <TableCell>
                  {f.task_id ? (
                    <Link
                      href={`/function/tasks/detail?id=${f.task_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                      title={f.task_description}
                    >
                      <span className="truncate">{f.task_description}</span>
                      <ArrowUpRightIcon className="size-3 shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtTime(f.ts)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {retest ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/chat?c=${retest.conversation_id}`} title={t("View the retest in progress")}>
                          <Spinner data-icon="inline-start" />
                          {t("Retesting")}
                        </Link>
                      </Button>
                    ) : null}
                    {!retest && f.finding_id && !f.inherited ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRetest(f)}
                        title={t("Retest this vulnerability in a separate conversation")}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        {t("Retest")}
                      </Button>
                    ) : null}
                    {f.finding_id && f.task_id && (
                      <Button size="sm" variant="ghost" onClick={() => onDeepen(f)}>
                        <FlaskConicalIcon data-icon="inline-start" />
                        {t("Deepen")}
                      </Button>
                    )}
                    {f.finding_id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label={t("Delete vulnerability")}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("Delete this vulnerability?")}</AlertDialogTitle>
                            <AlertDialogDescription className="[overflow-wrap:anywhere]">
                              {t(
                                '"{name}" will be permanently deleted and removed from the findings list, the task findings tab, and the exploration graph. This action cannot be undone.',
                                { name: f.name || f.vulnclass || f.summary || `#${f.finding_id}` },
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(f)}>{t("Delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {open && (
                <TableRow className="hover:bg-transparent">
                  {/* whitespace-normal overrides TableCell's default nowrap, otherwise the expanded area's text
                      is forced onto one line and overflows the cell. */}
                  <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30 whitespace-normal">
                    <div className="flex flex-col gap-2 px-2 py-1">
                      {/* Inline edit: name/category/severity, editable and savable (standalone finding rows only). */}
                      {f.finding_id && edit && (
                        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-background px-3 py-2.5">
                          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">{t("Vulnerability")}</Label>
                            <Input
                              value={edit.name}
                              onChange={(e) => onEditChange((s) => (s ? { ...s, name: e.target.value } : s))}
                              placeholder={t("Readable title; falls back to category when empty")}
                            />
                          </div>
                          <div className="flex min-w-[10rem] flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">{t("Category")}</Label>
                            <Input
                              value={edit.vulnclass}
                              onChange={(e) => onEditChange((s) => (s ? { ...s, vulnclass: e.target.value } : s))}
                              placeholder={t("e.g. SQL Injection")}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">{t("Severity")}</Label>
                            <Select
                              value={edit.severity}
                              onValueChange={(v) => onEditChange((s) => (s ? { ...s, severity: v as Severity } : s))}
                            >
                              <SelectTrigger size="sm" className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SEVERITIES.map((sv) => (
                                  <SelectItem key={sv} value={sv}>
                                    {statusMeta("severity", sv).label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button size="sm" disabled={saving} onClick={() => onSave(f)}>
                            {saving ? t("Saving…") : t("Save")}
                          </Button>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <ShieldAlertIcon className="size-3.5" />
                        {t("Evidence")}
                        {f.vulnclass && (
                          <span>
                            · {t("Type:")}
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{f.vulnclass}</code>
                          </span>
                        )}
                        {f.param_id && <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{f.param_id}</code>}
                        {f.assets && f.assets.length > 0 && (
                          <span className="flex flex-wrap items-center gap-1">
                            · {t("Assets:")}
                            {f.assets.map((a) => (
                              <code key={a.id} className="rounded bg-muted px-1.5 py-0.5 font-mono" title={a.type}>
                                {a.label}
                              </code>
                            ))}
                          </span>
                        )}
                      </div>
                      <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                        {f.evidence}
                      </pre>

                      {/* Detailed report (Markdown): lazily loaded by finding_id on expand, viewable without entering the detail page. */}
                      {f.finding_id && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <FileTextIcon className="size-3.5" />
                              {t("Detailed report")}
                            </span>
                            {reports[rowKey]?.status === "done" && reports[rowKey]?.text.trim() && (
                              <CopyButton
                                text={reports[rowKey]?.text}
                                successMessage={t("Detailed report copied")}
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                              />
                            )}
                          </div>
                          {(() => {
                            const rep = reports[rowKey];
                            if (!rep || rep.status === "loading")
                              return <p className="text-xs text-muted-foreground">{t("Loading…")}</p>;
                            if (rep.status === "error")
                              return <p className="text-xs text-muted-foreground">{t("Failed to load the report.")}</p>;
                            if (!rep.text.trim())
                              return <p className="text-xs text-muted-foreground">{t("No detailed report yet.")}</p>;
                            return (
                              // break-words inherits into paragraphs/lists; pre additionally gets
                              // whitespace-pre-wrap so code blocks wrap too — otherwise long code lines/URLs
                              // would stretch the colSpan cell and push the whole table into horizontal scrolling.
                              <div className="min-w-0 break-words rounded-md border bg-background px-3 py-2 [&_pre]:whitespace-pre-wrap">
                                <Markdown text={rep.text} />
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          );
        })}
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="py-12 text-center text-sm text-muted-foreground">
              {t("No matching findings.")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
