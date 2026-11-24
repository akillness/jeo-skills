"use client";

import * as React from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ArrowLeftIcon, ArrowUpRightIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { FindingRetestPanel } from "@/components/finding-retest-panel";
import { FindingTrafficPanel } from "@/components/finding-traffic-panel";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { statusMeta } from "@/lib/status";
import type { Finding, FindingReportState, FindingStatus, Severity } from "@/lib/types";
import { intlLocale, t } from "@/i18n";

import {
  FINDING_REPORT_STATES,
  REPORT_STATE_META,
  ReportStateBadge,
  VerificationBadge,
} from "../_components/findings-table";
import { FindingLineageView } from "./lineage";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const FINDING_STATUSES: FindingStatus[] = [
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

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString(intlLocale);
}

// FieldRow is one label/value line in the right-hand status panel.
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-col items-end gap-1 text-right text-sm">{children}</div>
    </div>
  );
}

function FindingDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const contextTaskId = searchParams.get("context_task") ?? "";
  const [finding, setFinding] = React.useState<Finding | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [tab, setTab] = React.useState("overview");

  const load = React.useCallback(() => {
    if (!id) {
      setLoaded(true);
      return;
    }
    api
      .getFinding(id, contextTaskId || undefined)
      .then((f) => setFinding(f))
      .catch(() => setFinding(null))
      .finally(() => setLoaded(true));
  }, [contextTaskId, id]);
  React.useEffect(() => {
    load();
  }, [load]);

  const changeSeverity = React.useCallback(
    async (next: Severity) => {
      if (!finding || finding.inherited || next === finding.severity) return;
      const prev = finding.severity;
      setFinding({ ...finding, severity: next });
      try {
        const updated = await api.setFindingSeverity(id, next);
        setFinding(updated);
        toast.success(t('Severity changed to "{label}"', { label: statusMeta("severity", next).label }));
      } catch (e) {
        setFinding((cur) => (cur ? { ...cur, severity: prev } : cur));
        toast.error(t("Update failed: {error}", { error: (e as Error).message }));
      }
    },
    [finding, id],
  );

  const changeStatus = React.useCallback(
    async (next: FindingStatus) => {
      if (!finding || finding.inherited || next === finding.status) return;
      const prev = finding.status;
      setFinding({ ...finding, status: next });
      try {
        const updated = await api.setFindingStatus(id, next);
        setFinding(updated);
        toast.success(t('Status changed to "{label}"', { label: statusMeta("finding", next).label }));
      } catch (e) {
        setFinding((cur) => (cur ? { ...cur, status: prev } : cur));
        toast.error(t("Update failed: {error}", { error: (e as Error).message }));
      }
    },
    [finding, id],
  );

  const changeReportState = React.useCallback(
    async (next: FindingReportState) => {
      if (!finding || finding.inherited || next === (finding.report_state ?? "none")) return;
      const prev = finding.report_state ?? "none";
      setFinding({ ...finding, report_state: next });
      try {
        const updated = await api.setFindingReportState(id, next);
        setFinding(updated);
        toast.success(t('Report stage changed to "{label}"', { label: REPORT_STATE_META[next].label }));
      } catch (e) {
        setFinding((cur) => (cur ? { ...cur, report_state: prev } : cur));
        toast.error(t("Update failed: {error}", { error: (e as Error).message }));
      }
    },
    [finding, id],
  );

  if (!finding) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-muted-foreground">{loaded ? t("Finding {id} not found", { id }) : t("Loading…")}</p>
        {loaded && (
          <Button asChild variant="outline">
            <Link href="/function/findings">
              <ArrowLeftIcon /> {t("Back to findings")}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const title = finding.name || finding.vulnclass || t("Uncategorized");

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col gap-0">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Button asChild variant="ghost" size="icon" className="size-7">
            <Link href="/function/findings">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <ShieldAlertIcon className="size-4 text-muted-foreground" />
          <h1 className="max-w-md truncate text-sm font-semibold" title={title}>
            {title}
          </h1>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{finding.id}</code>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <StatusBadge domain="severity" value={finding.severity} dot />
          <StatusBadge domain="finding" value={finding.status} dot />
          <ReportStateBadge state={finding.report_state} />
          <VerificationBadge finding={finding} />
          {finding.inherited && finding.source_task_id && (
            <Badge variant="outline">{t("Source task #{id} · read-only", { id: finding.source_task_id })}</Badge>
          )}
        </div>
        <TabsList>
          <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
          <TabsTrigger value="lineage">{t("Exploration graph")}</TabsTrigger>
        </TabsList>
      </header>

      {/* Tab content */}
      <div className="flex-1 p-4 lg:p-6">
        {/* Overview: left (digest + evidence) / right (status panel) */}
        <TabsContent value="overview" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Left column */}
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t("Digest")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{finding.summary || t("(no digest)")}</p>
                </CardContent>
              </Card>
              <FindingRetestPanel key={id} findingId={id} readOnly={finding.inherited} onCompleted={load} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t("Evidence / PoC")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {finding.evidence ? (
                    <pre className="max-h-[46vh] overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                      {finding.evidence}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("(no evidence)")}</p>
                  )}
                </CardContent>
              </Card>
              {finding.counterevidence?.trim() && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t("Counterevidence")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{finding.counterevidence}</p>
                  </CardContent>
                </Card>
              )}
              {finding.confidence_rationale?.trim() && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t("Confidence rationale")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{finding.confidence_rationale}</p>
                  </CardContent>
                </Card>
              )}
              <FindingTrafficPanel
                key={id}
                findingId={id}
                contextTask={contextTaskId || undefined}
                readOnly={finding.inherited}
                onChanged={load}
              />
              {/* Below evidence: detailed report (rendered Markdown) */}
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">{t("Detailed report")}</CardTitle>
                  {finding.report && <CopyButton text={finding.report} successMessage={t("Detailed report copied")} />}
                </CardHeader>
                <CardContent>
                  {finding.report_stale ? (
                    <Alert>
                      <AlertDescription>
                        {t("Traffic evidence has changed; the detailed report is pending an update.")}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {finding.report ? (
                    <Markdown text={finding.report} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("No detailed report yet.")}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right column: status panel */}
            <Card className="h-fit lg:sticky lg:top-24">
              <CardHeader>
                <CardTitle className="text-sm">{t("Status")}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {/* Vulnerability ID */}
                <FieldRow label={t("Vulnerability ID")}>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    #{finding.id}
                  </code>
                </FieldRow>

                {/* Severity */}
                <FieldRow label={t("Severity")}>
                  {finding.inherited ? (
                    <StatusBadge domain="severity" value={finding.severity} dot />
                  ) : (
                    <Select value={finding.severity} onValueChange={(v) => changeSeverity(v as Severity)}>
                      <SelectTrigger size="sm" className="h-7 w-auto border-none px-1 shadow-none focus-visible:ring-0">
                        <StatusBadge domain="severity" value={finding.severity} dot />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        <SelectGroup>
                          {SEVERITIES.map((sv) => (
                            <SelectItem key={sv} value={sv}>
                              {statusMeta("severity", sv).label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>

                {/* Triage status */}
                <FieldRow label={t("Triage status")}>
                  {finding.inherited ? (
                    <StatusBadge domain="finding" value={finding.status} dot />
                  ) : (
                    <Select value={finding.status} onValueChange={(v) => changeStatus(v as FindingStatus)}>
                      <SelectTrigger size="sm" className="h-7 w-auto border-none px-1 shadow-none focus-visible:ring-0">
                        <StatusBadge domain="finding" value={finding.status} dot />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        <SelectGroup>
                          {FINDING_STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {statusMeta("finding", st).label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>

                <FieldRow label={t("Report stage")}>
                  {finding.inherited ? (
                    <ReportStateBadge state={finding.report_state} />
                  ) : (
                    <Select
                      value={finding.report_state ?? "none"}
                      onValueChange={(v) => changeReportState(v as FindingReportState)}
                    >
                      <SelectTrigger size="sm" className="h-7 w-auto border-none px-1 shadow-none focus-visible:ring-0">
                        <ReportStateBadge state={finding.report_state} />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        <SelectGroup>
                          {FINDING_REPORT_STATES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {REPORT_STATE_META[st].label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>

                {/* Verification: automated outcome; the note explains any state other than verified */}
                {finding.verification_status && (
                  <FieldRow label={t("Verification")}>
                    <VerificationBadge finding={finding} />
                    {finding.verification_status !== "verified" && finding.verification_note?.trim() && (
                      <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
                        {finding.verification_note}
                      </p>
                    )}
                  </FieldRow>
                )}

                {/* Vulnerability type */}
                <FieldRow label={t("Vulnerability type")}>
                  {finding.vulnclass ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{finding.vulnclass}</code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </FieldRow>

                {/* Assets */}
                <FieldRow label={t("Assets")}>
                  {finding.assets && finding.assets.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {finding.assets.map((a) => (
                        <code
                          key={a.id}
                          className="max-w-[16rem] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                          title={`${a.type} · ${a.label}`}
                        >
                          {a.label}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </FieldRow>

                {/* Task */}
                <FieldRow label={t("Task")}>
                  {finding.task_id ? (
                    <Link
                      href={`/function/tasks/detail?id=${finding.task_id}`}
                      className="inline-flex max-w-[16rem] items-center gap-1 text-primary hover:underline"
                      title={finding.task_description}
                    >
                      <span className="truncate">{finding.task_description || `#${finding.task_id}`}</span>
                      <ArrowUpRightIcon className="size-3 shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t("— (task deleted)")}</span>
                  )}
                </FieldRow>

                {/* Found at */}
                <FieldRow label={t("Found at")}>
                  <span className="tabular-nums">{fmtTime(finding.ts)}</span>
                </FieldRow>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Exploration graph: the attack chain traced back from the task's initial node to this finding's node */}
        <TabsContent value="lineage" className="mt-0">
          <FindingLineageView findingId={finding.id} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// useSearchParams must sit under a Suspense boundary for static export.
export default function FindingDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <FindingDetailInner />
    </React.Suspense>
  );
}
