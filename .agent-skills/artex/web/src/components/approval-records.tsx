"use client";

import * as React from "react";

import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  CopyIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { TablePagination } from "@/components/table-pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type {
  InterceptApprovalFilter,
  InterceptApprovalRow,
  InterceptAudit,
  InterceptDetail,
  InterceptPending,
  InterceptReviewInput,
  InterceptRisk,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { setVisibleInterval } from "@/lib/polling";
import { intlLocale, t } from "@/i18n";

function fmtTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(intlLocale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function source(row: InterceptApprovalRow) {
  if (row.decision_source) return row.decision_source;
  if (row.rule_id) return "rule";
  return row.reason?.startsWith("[model]") ? "model" : "unknown";
}

function originLabel(row: InterceptApprovalRow) {
  if (row.task_id) return row.task_id;
  if (row.conversation_id) return t("Conversation #{id}", { id: row.conversation_id });
  return "—";
}

function ApprovalOrigin({ row, detail = false }: { row: InterceptApprovalRow; detail?: boolean }) {
  const [locating, setLocating] = React.useState(false);
  const label = detail && row.task_id ? t("Task {id}", { id: row.task_id }) : originLabel(row);
  const query = new URLSearchParams({ approval: String(row.id) });
  let href: string | undefined;
  if (row.conversation_id) {
    query.set("c", String(row.conversation_id));
    href = `/chat?${query}`;
  } else if (row.task_id) {
    query.set("id", row.task_id);
    href = `/function/tasks/detail?${query}`;
  }
  return href ? (
    <a
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      aria-label={t("Locate the source of approval #{id}: {label}", { id: row.id, label })}
      aria-busy={locating}
      onClick={async (e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (locating) return;
        setLocating(true);
        try {
          await api.interceptExecution(row.id, row.conversation_id ?? undefined);
          window.location.assign(href);
        } catch (error) {
          toast.error((error as Error).message || t("Unable to locate the corresponding execution"));
          setLocating(false);
        }
      }}
    >
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: t("Pending approval"),
    allowed: t("Allowed"),
    denied: t("Denied"),
    timeout: t("Timed out"),
  };
  let variant: "default" | "destructive" | "secondary" | "outline" = "outline";
  if (status === "allowed") variant = "default";
  if (status === "denied") variant = "destructive";
  if (status === "pending") variant = "secondary";
  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}

const decidedByLabels: Record<string, string> = {
  human: t("Human"),
  rule: t("Rule"),
  model: t("Model"),
  system: t("System"),
};

// decided_by is shown exactly as stored, so a row always sits under the
// "Decided by" filter option matching its badge. A decided row without an actor
// predates the column: it reads "Legacy" and matches no option.
function DecidedByBadge({ row }: { row: InterceptApprovalRow }) {
  if (row.status === "pending") return <span className="text-muted-foreground">—</span>;
  if (!row.decided_by) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("Legacy")}
      </Badge>
    );
  }
  return <Badge variant="outline">{decidedByLabels[row.decided_by] ?? row.decided_by}</Badge>;
}

const riskLabels: Record<InterceptRisk["level"], string> = { low: t("Low"), medium: t("Medium"), high: t("High") };

// RiskBadge shows the server's deterministic risk level of a pending request.
function RiskBadge({ risk }: { risk?: InterceptRisk }) {
  if (!risk) return null;
  let variant: "destructive" | "secondary" | "outline" = "outline";
  if (risk.level === "high") variant = "destructive";
  if (risk.level === "medium") variant = "secondary";
  return (
    <Badge variant={variant} title={t("Risk score {score}/100", { score: risk.score })}>
      {riskLabels[risk.level] ?? risk.level}
    </Badge>
  );
}

function MatchCell({ row, showReason = true }: { row: InterceptApprovalRow; showReason?: boolean }) {
  const reason = row.reason?.replace(/^\[model\]\s*/, "");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {source(row) === "model" ? (
        <Badge variant="outline">
          <BotIcon />
          {t("Model decision")}
        </Badge>
      ) : (
        <span className="truncate">{row.rule_name || t("Rule not recorded or deleted")}</span>
      )}
      {showReason ? (
        <p className="truncate text-muted-foreground text-xs" title={reason}>
          {reason || t("No reason recorded")}
        </p>
      ) : null}
    </div>
  );
}

function CodeBlock({ label, text, truncated = false }: { label: string; text: string; truncated?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Copied"));
    } catch {
      toast.error(t("Copy failed; select the content manually to copy"));
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs">{label}</h3>
        {text ? (
          <Button variant="ghost" size="icon-xs" aria-label={t("Copy {label}", { label })} onClick={() => void copy()}>
            <CopyIcon />
          </Button>
        ) : null}
      </div>
      <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-mono text-xs leading-6 [overflow-wrap:anywhere]">
        {text || t("Not recorded")}
      </pre>
      {truncated ? (
        <p className="text-muted-foreground text-xs">{t("Content truncated; the above is the saved excerpt.")}</p>
      ) : null}
    </section>
  );
}

const contextLabels: Record<string, string> = {
  user: t("User message"),
  assistant: t("Agent message"),
  text: t("Agent message"),
  tool_use: t("Tool request"),
  tool_result: t("Tool output"),
};

const actionLabels: Record<string, string> = { allow: t("Allow"), ask: t("Escalate to human approval"), deny: t("Deny") };
const executionLabels: Record<InterceptAudit["execution_status"], string> = {
  not_started: t("Not started"),
  not_executed: t("Not executed"),
  awaiting_result: t("Allowed, awaiting execution result"),
  succeeded: t("Execution succeeded"),
  failed: t("Execution failed"),
  unknown: t("Execution result unknown"),
};

function ModelReviewContext({ input }: { input: InterceptReviewInput }) {
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("Model review context")}>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">{t("Model review context")}</h3>
        <p className="text-muted-foreground text-xs">
          {t("Below is the snapshot of the input actually sent to the review model for this decision. The background only helps it understand the current action; the verdict follows the review policy.")}
          {input.version < 4
            ? ` ${t("This record used the legacy input format; the content actually sent at the time is preserved.")}`
            : null}
        </p>
      </div>
      <CodeBlock
        label={t("Call under review")}
        text={JSON.stringify({ tool_name: input.tool_name, arguments: input.arguments }, null, 2)}
      />
      {input.version >= 2 ? (
        input.background ? (
          <div className="flex min-w-0 flex-col gap-2">
            <CodeBlock
              label={
                input.background.source === "user_message"
                  ? t("Background · user message")
                  : t("Background · Worker intent summary (legacy)")
              }
              text={input.background.text}
              truncated={input.background.truncated}
            />
            <p className="text-muted-foreground text-xs">
              {input.background.source === "user_message"
                ? t("Taken from the current user message.")
                : t("This is the legacy Worker intent summary that used to be sent; the new Worker review no longer sends it.")}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{t("No background message was attached to this review.")}</p>
        )
      ) : (
        <>
          {input.turn_input ? (
            <CodeBlock label={t("Current turn input (legacy)")} text={input.turn_input} truncated={input.background_truncated} />
          ) : null}
          {input.task ? (
            <>
              <CodeBlock label={t("Task description (legacy)")} text={input.task.description} truncated={input.task.truncated} />
              <CodeBlock label={t("Task goals (legacy)")} text={input.task.goal} truncated={input.task.truncated} />
              <CodeBlock label={t("Task operation constraints (legacy)")} text={JSON.stringify(input.task.constraints, null, 2)} />
            </>
          ) : null}
          {input.worker_intent ? (
            <CodeBlock label={t("Worker intent (legacy)")} text={input.worker_intent} truncated={input.background_truncated} />
          ) : null}
        </>
      )}
      {input.working_directory ? <CodeBlock label={t("Working directory")} text={input.working_directory} /> : null}
      {input.version >= 3 ? (
        <p className="text-muted-foreground text-xs">{t("No past calls or execution results were sent for this review.")}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <h4 className="font-medium text-muted-foreground text-xs">{t("Past calls provided to the model at the time (legacy)")}</h4>
          {input.history?.length ? (
            input.history.map((entry) => (
              <div key={entry.tool_use_id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                <p className="break-words font-medium text-xs">
                  {entry.tool} · {entry.status === "succeeded" ? t("Succeeded") : t("Failed (may have partial side effects)")}
                </p>
                <CodeBlock label={t("Past call arguments")} text={entry.arguments_preview} truncated={entry.truncated} />
                <CodeBlock label={t("Past execution result")} text={entry.result} truncated={entry.truncated} />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">{t("No paired past tool executions were provided.")}</p>
          )}
          {input.history_truncated ? (
            <p className="text-muted-foreground text-xs">{t("History is a limited window; some content is truncated.")}</p>
          ) : null}
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <ChevronDownIcon data-icon="inline-start" />
            {t("View full model review input JSON")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <CodeBlock label={t("Model review input")} text={JSON.stringify(input, null, 2)} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

type Decide = (id: number, decision: "allowed" | "denied") => Promise<void>;

function DecisionActions({ row, busy, decide }: { row: InterceptApprovalRow; busy: boolean; decide: Decide }) {
  if (row.status !== "pending") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => void decide(row.id, "allowed")}>
        <CheckIcon data-icon="inline-start" />
        {t("Allow")}
      </Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide(row.id, "denied")}>
        <XIcon data-icon="inline-start" />
        {t("Deny")}
      </Button>
    </div>
  );
}

// AlwaysAllowAction creates an argv allow rule from a pending Bash request.
// The prefix comes from the server; the request itself stays pending.
function AlwaysAllowAction({ id, prefix }: { id: number; prefix?: string }) {
  const [busy, setBusy] = React.useState(false);
  async function create() {
    setBusy(true);
    try {
      const res = await api.interceptAlwaysAllow(id);
      toast.success(
        res.created
          ? t("Rule created, the request is still pending approval")
          : t("Rule already exists, the request is still pending approval"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => void create()}>
        {prefix ? t('Always allow "{prefix} *"', { prefix }) : t("Always allow")}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t("The prefix does not constrain flags, and it does not cover what the program does next (git hooks, npm scripts, docker images).")}
      </p>
    </div>
  );
}

export function ApprovalDetail({
  row,
  busy,
  decide,
  revision,
  readOnly = false,
  defaultExpanded = false,
  onResolved,
}: {
  row: InterceptApprovalRow;
  busy: boolean;
  decide: Decide;
  revision: number;
  readOnly?: boolean;
  defaultExpanded?: boolean;
  onResolved?: (status: "allowed" | "denied" | "timeout") => void;
}) {
  const [detail, setDetail] = React.useState<InterceptDetail | null>(null);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  const [more, setMore] = React.useState(defaultExpanded);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Status, refresh and retry invalidate details without closing the panel.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const next = await api.interceptDetail(row.id);
        if (cancelled) return;
        setDetail(next);
        setError("");
        if (next.status !== "pending") onResolved?.(next.status);
        if (next.status === "pending" || next.audit?.execution_status === "awaiting_result")
          timer = setTimeout(() => void load(), 5000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || t("Failed to load details"));
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [row.id, row.status, revision, retry, onResolved]);

  // Row updates are authoritative until the lazy detail has caught up.
  const current = detail?.status === row.status ? detail : row;
  const audit = detail?.audit;
  let execution = audit ? executionLabels[audit.execution_status] : t("Not recorded");
  if (row.status === "pending") execution = t("Not started");
  if (audit && audit.correlation !== "exact" && audit.effective_action === "allow") execution = t("No linked execution result");
  const command = typeof row.tool_input?.command === "string" ? row.tool_input.command : undefined;
  let initialLabel = source(row) === "model" ? t("Model initial decision") : t("Rule initial decision");
  if (audit?.model_fallback) initialLabel = t("Model error fallback");

  return (
    <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="grid min-w-0 gap-5 rounded-xl border bg-muted/20 p-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock
            label={t("{agent} · tool request", { agent: current.agent_name || current.conv_agent_key || t("Agent") })}
            text={JSON.stringify(row.tool_input ?? {}, null, 2)}
          />
          {command ? (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  <ChevronDownIcon data-icon="inline-start" />
                  {t("View command content")}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <CodeBlock label={t("Command content")} text={command} />
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("Execution result:")} <span className="text-foreground">{detail ? execution : t("Loading…")}</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:pl-5">
          <h3 className="font-medium text-muted-foreground text-xs">
            {current.status === "pending" ? t("Review status") : t("Approval decision")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={current.status} />
            <MatchCell row={current} showReason={false} />
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
            {current.reason?.replace(/^\[model\]\s*/, "") || t("No approval reason recorded")}
          </p>
          {audit?.decision_reason ? <p className="text-sm">{audit.decision_reason}</p> : null}
          {audit?.effective_action ? (
            <p className="text-sm">{t("Final action: {action}", { action: actionLabels[audit.effective_action] })}</p>
          ) : null}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted-foreground">{t("Source")}</dt>
            <dd className="break-words">
              <ApprovalOrigin row={current} detail />
            </dd>
            <dt className="text-muted-foreground">{t("Requested at")}</dt>
            <dd>{fmtTime(row.created_at)}</dd>
            <dt className="text-muted-foreground">{t("Decided at")}</dt>
            <dd>{fmtTime(current.decided_at)}</dd>
            <dt className="text-muted-foreground">{t("Decided by")}</dt>
            <dd>
              <DecidedByBadge row={current} />
            </dd>
            {row.risk ? (
              <>
                <dt className="text-muted-foreground">{t("Risk")}</dt>
                <dd className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <RiskBadge risk={row.risk} />
                    <span className="text-muted-foreground">{row.risk.score}/100</span>
                  </span>
                  {row.risk.reasons.length ? (
                    <ul className="list-disc pl-4">
                      {row.risk.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </dd>
              </>
            ) : null}
            {audit?.rule_name ? (
              <>
                <dt className="text-muted-foreground">{t("Rule snapshot")}</dt>
                <dd>{audit.rule_name}</dd>
              </>
            ) : null}
            {audit?.profile_id ? (
              <>
                <dt className="text-muted-foreground">{t("Approval model profile")}</dt>
                <dd>#{audit.profile_id}</dd>
              </>
            ) : null}
          </dl>
          {!readOnly ? <DecisionActions row={current} busy={busy} decide={decide} /> : null}
          {!readOnly && current.status === "pending" && row.tool_name === "Bash" ? (
            <AlwaysAllowAction id={row.id} prefix={detail?.always_allow_prefix} />
          ) : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("Failed to load details: {error}", { error })}</span>
              <Button variant="outline" size="sm" onClick={() => setRetry((v) => v + 1)}>
                {t("Retry")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {!detail && !error ? <Skeleton className="h-8 w-60" /> : null}
      {detail && !audit ? (
        <Alert>
          <AlertDescription>
            {t("This record has no saved approval detail snapshot, so the context, model initial decision, and execution output at the time cannot be restored.")}
          </AlertDescription>
        </Alert>
      ) : null}
      {audit ? (
        <Collapsible open={more} onOpenChange={setMore}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <ChevronDownIcon data-icon="inline-start" className={cn(more && "rotate-180")} />
              {more ? t("Collapse context") : t("View context and execution result")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="flex min-w-0 flex-col gap-5">
              {audit.model_input ? (
                <ModelReviewContext input={audit.model_input} />
              ) : (
                <Alert>
                  <AlertDescription>
                    {audit.model_input_digest
                      ? t("This legacy record saved only the review input fingerprint, not the input itself, so the context sent to the model at the time cannot be restored. This does not mean the review had no context; newly produced model decisions keep an input snapshot.")
                      : t("This record has no saved model review input; it may have been decided directly by a rule, failed before the model call, or come from an old version.")}
                  </AlertDescription>
                </Alert>
              )}
              {audit.user_message || audit.context?.length ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <ChevronDownIcon data-icon="inline-start" />
                      {audit.model_input && audit.model_input.version >= 3
                        ? t("View conversation audit excerpt (not sent to model)")
                        : t("View conversation audit excerpt")}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="flex min-w-0 flex-col gap-3">
                      {audit.user_message ? (
                        <CodeBlock
                          label={t("Conversation current-turn input (audit excerpt)")}
                          text={audit.user_message}
                          truncated={audit.user_truncated}
                        />
                      ) : null}
                      <section className="flex min-w-0 flex-col gap-3">
                        <h3 className="font-medium text-muted-foreground text-xs">{t("Visible conversation context")}</h3>
                        <p className="text-muted-foreground text-xs">
                          {t('Conversation record excerpt saved at {time}. What the model actually used follows "Model review input".', {
                            time: fmtTime(audit.captured_at),
                          })}
                        </p>
                        {audit.context_truncated ? (
                          <p className="text-muted-foreground text-xs">
                            {t("Only the most recent context is saved; some content is truncated.")}
                          </p>
                        ) : null}
                        {audit.context?.length ? (
                          audit.context.map((entry, index) => (
                            <CodeBlock
                              key={`${entry.kind}-${entry.tool_use_id || index}`}
                              label={`${contextLabels[entry.kind] ?? entry.kind}${entry.tool ? ` · ${entry.tool}` : ""}${entry.is_error ? ` · ${t("error")}` : ""}`}
                              text={entry.text}
                              truncated={entry.truncated}
                            />
                          ))
                        ) : (
                          <p className="text-muted-foreground text-sm">{t("No linkable context recorded")}</p>
                        )}
                      </section>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              <CodeBlock
                label={`${initialLabel}: ${actionLabels[audit.initial_action] ?? audit.initial_action}`}
                text={audit.initial_reason.replace(/^\[model\]\s*/, "")}
              />
              {audit.judge_answers?.length ? (
                <CodeBlock
                  label={t("Judge answers")}
                  text={audit.judge_answers.map((a) => `${a.id}: ${a.answer}${a.evidence ? ` - ${a.evidence}` : ""}`).join("\n")}
                />
              ) : null}
              <CodeBlock
                label={t("Execution output")}
                text={
                  audit.output ??
                  (audit.execution_status === "not_executed" ? t("Tool not executed.") : t("No execution output yet"))
                }
                truncated={audit.output_truncated}
              />
              {audit.correlation !== "exact" ? (
                <Alert>
                  <AlertDescription>
                    {audit.correlation === "ambiguous"
                      ? t("Concurrent calls with identical arguments exist, so the tool call cannot be uniquely linked; this record does not show a guessed execution result.")
                      : t("No uniquely linkable tool call ID recorded.")}
                  </AlertDescription>
                </Alert>
              ) : null}
              <dl className="grid gap-2 text-muted-foreground text-xs [overflow-wrap:anywhere]">
                <div>{t("Tool call ID: {value}", { value: audit.tool_use_id || t("Not recorded") })}</div>
                <div>{t("Arguments digest SHA-256: {value}", { value: audit.input_digest })}</div>
                <div>{t("Review config fingerprint SHA-256: {value}", { value: audit.config_digest || t("Not recorded") })}</div>
                {audit.model_input_digest ? (
                  <div>{t("Model review input SHA-256: {value}", { value: audit.model_input_digest })}</div>
                ) : null}
                {audit.execution_ended_at ? (
                  <div>{t("Result recorded at: {time}", { time: fmtTime(audit.execution_ended_at) })}</div>
                ) : null}
              </dl>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

// Hidden cells do not occupy table columns. Keep the detail span in sync so
// expansion cannot create empty columns and leave a gap in the selected row.
const approvalBreakpoints = ["(min-width: 40rem)", "(min-width: 48rem)", "(min-width: 64rem)", "(min-width: 80rem)"];
function subscribeColumns(onChange: () => void) {
  const queries = approvalBreakpoints.map((query) => window.matchMedia(query));
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}
function visibleColumnCount() {
  const matches = approvalBreakpoints.map((query) => window.matchMedia(query).matches);
  return 3 + Number(matches[0]) + Number(matches[1]) + 3 * Number(matches[2]) + 2 * Number(matches[3]);
}
function serverColumnCount() {
  return 10;
}

type Selection = { selected: Set<number>; toggle: (id: number) => void; toggleAll: () => void };

// Server limit on ids per batch-decide call (maxBatchDecide in server/intercept.go).
const batchDecideMax = 100;

function ApprovalTable({
  rows,
  busy,
  decide,
  revision,
  label,
  selection,
}: {
  rows: InterceptApprovalRow[];
  busy: boolean;
  decide: Decide;
  revision: number;
  label: string;
  selection?: Selection;
}) {
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set());
  const columns =
    React.useSyncExternalStore(subscribeColumns, visibleColumnCount, serverColumnCount) + (selection ? 1 : 0);
  const selectedCount = selection ? rows.filter((row) => selection.selected.has(row.id)).length : 0;
  let allChecked: boolean | "indeterminate" = selectedCount > 0 ? "indeterminate" : false;
  if (selectedCount > 0 && selectedCount === rows.length) allChecked = true;
  const prefix = React.useId();
  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <Table className="table-fixed" aria-label={label}>
      <TableHeader>
        <TableRow>
          {selection ? (
            <TableHead className="w-10">
              <Checkbox
                aria-label={t("Select all pending approvals on this page")}
                checked={allChecked}
                disabled={busy || !rows.length}
                onCheckedChange={() => selection.toggleAll()}
              />
            </TableHead>
          ) : null}
          <TableHead className="w-10">
            <span className="sr-only">{t("Expand details")}</span>
          </TableHead>
          <TableHead className="hidden w-14 sm:table-cell">#</TableHead>
          <TableHead className="w-28">{t("Tool")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("Source")}</TableHead>
          <TableHead className="hidden lg:table-cell">{t("Matched rule")}</TableHead>
          <TableHead className="hidden xl:table-cell">{t("Arguments")}</TableHead>
          <TableHead className="w-24">{t("Status")}</TableHead>
          <TableHead className="hidden w-24 lg:table-cell">{t("Decided by")}</TableHead>
          <TableHead className="hidden w-36 lg:table-cell">{t("Requested at")}</TableHead>
          <TableHead className="hidden w-36 xl:table-cell">{t("Decided at")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const open = expanded.has(row.id);
          const panelID = `${prefix}-${row.id}`;
          return (
            <React.Fragment key={row.id}>
              <TableRow
                data-state={open ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => toggle(row.id)}
              >
                {selection ? (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={t("Select approval #{id}", { id: row.id })}
                      checked={selection.selected.has(row.id)}
                      disabled={busy || row.status !== "pending"}
                      onCheckedChange={() => selection.toggle(row.id)}
                    />
                  </TableCell>
                ) : null}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      open ? t("Collapse approval #{id}", { id: row.id }) : t("Expand approval #{id}", { id: row.id })
                    }
                    aria-expanded={open}
                    aria-controls={open ? panelID : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(row.id);
                    }}
                  >
                    {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </Button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{row.id}</TableCell>
                <TableCell>
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <code className="block max-w-full truncate text-xs">{row.tool_name}</code>
                    <RiskBadge risk={row.risk} />
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-col gap-1">
                    <span className="truncate" title={originLabel(row)}>
                      <ApprovalOrigin row={row} />
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {row.agent_name || row.conv_agent_key}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <MatchCell row={row} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <code className="block truncate text-muted-foreground text-xs">{JSON.stringify(row.tool_input)}</code>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <DecidedByBadge row={row} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs lg:table-cell">
                  {fmtTime(row.created_at)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs xl:table-cell">
                  {fmtTime(row.decided_at)}
                </TableCell>
              </TableRow>
              {open ? (
                <TableRow className="hover:bg-transparent has-aria-expanded:bg-transparent">
                  <TableCell colSpan={columns} className="whitespace-normal p-0">
                    <section id={panelID} aria-label={t("Approval details #{id}", { id: row.id })}>
                      <ApprovalDetail row={row} busy={busy} decide={decide} revision={revision} />
                    </section>
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ApprovalRecords({ taskId }: { taskId?: string }) {
  const [rows, setRows] = React.useState<InterceptApprovalRow[]>([]);
  const [pendingRows, setPendingRows] = React.useState<InterceptPending[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [filter, setFilter] = React.useState<InterceptApprovalFilter>({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pendingError, setPendingError] = React.useState("");
  const [deciding, setDeciding] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set());
  const [batchDecision, setBatchDecision] = React.useState<"allowed" | "denied" | null>(null);
  const [batchErrors, setBatchErrors] = React.useState<{ id: number; error: string }[]>([]);
  const request = React.useRef(0);
  const decisionLock = React.useRef(false);
  const filterID = React.useId();
  const filtered = Boolean(filter.status || filter.decision_source || filter.decided_by);

  // A task can stay mounted while the user switches between task details.
  // Reset the cursor so the new scope always starts at its newest records.
  // biome-ignore lint/correctness/useExhaustiveDependencies: taskId intentionally resets pagination when scope changes.
  React.useEffect(() => {
    setPage(1);
  }, [taskId]);

  const load = React.useCallback(
    async (manual = false) => {
      const id = ++request.current;
      if (manual) setRefreshing(true);
      try {
        // The approval queue is independent of the current history page and its
        // filter. Older requests must remain actionable even when newer decisions
        // fill the page or a filter would hide them.
        const [history, pending] = await Promise.allSettled([
          taskId ? api.interceptTaskPage(taskId, page, pageSize, filter) : api.interceptHistoryPage(page, pageSize, filter),
          api.interceptPending(),
        ]);
        if (id !== request.current) return;
        if (history.status === "fulfilled") {
          setRows(history.value.items);
          setTotal(history.value.total);
          setError("");
        } else {
          setError((history.reason as Error).message || t("Failed to load"));
        }
        if (pending.status === "fulfilled") {
          setPendingRows(pending.value);
          setPendingError("");
        } else {
          setPendingError((pending.reason as Error).message || t("Failed to load"));
        }
        if (manual) setRevision((v) => v + 1);
      } catch (e) {
        if (id === request.current) setError((e as Error).message || t("Failed to load"));
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [taskId, page, pageSize, filter],
  );
  const latestLoad = React.useRef(load);
  latestLoad.current = load;

  React.useEffect(() => {
    void load();
    const stopPolling = setVisibleInterval(() => void load(), 5000);
    return () => {
      request.current++;
      stopPolling();
    };
  }, [load]);

  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

  const changeFilter = (next: InterceptApprovalFilter) => {
    // An in-flight response for the old filter must not repopulate the table.
    request.current++;
    setFilter(next);
    setPage(1);
    setRows([]);
    setTotal(0);
    setError("");
    setLoading(true);
  };

  const decide: Decide = async (id, decision) => {
    if (decisionLock.current) return;
    decisionLock.current = true;
    setDeciding(true);
    try {
      await api.interceptDecide(id, decision);
      // Invalidate a list request started before this decision.
      request.current++;
      // Optimistically drop the decided item from the independent pending queue
      // for instant feedback; the re-fetch below reconciles with server truth.
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, status: decision, decided_by: "human", decided_at: new Date().toISOString() } : row,
        ),
      );
      setPendingRows((prev) => prev.filter((row) => row.id !== id));
      setRevision((v) => v + 1);
      toast.success(decision === "allowed" ? t("Execution allowed") : t("Execution denied"));
      // Re-fetch counts and rows: a decided item may no longer match the filter.
      await latestLoad.current(true);
    } catch (e) {
      toast.error((e as Error).message);
      await latestLoad.current(true);
    } finally {
      decisionLock.current = false;
      setDeciding(false);
    }
  };

  const historyById = new Map(rows.map((row) => [row.id, row]));
  const pending: InterceptApprovalRow[] = pendingRows
    .filter((row) => !taskId || row.task_id === taskId)
    .map((row) => ({
      conv_title: "",
      conv_agent_key: "",
      rule_name: row.rule_id ? t("Rule #{id}", { id: row.rule_id }) : "",
      ...historyById.get(row.id),
      ...row,
    }));
  // Only rows still in the pending queue count as selected.
  const selectedRows = pending.filter((row) => selected.has(row.id));
  const selectedHigh = selectedRows.filter((row) => row.risk?.level === "high").length;
  const selection: Selection = {
    selected,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () =>
      setSelected(selectedRows.length === pending.length ? new Set() : new Set(pending.map((row) => row.id))),
  };

  // Each id is decided by the server exactly like a single decision. The server
  // takes at most 100 ids per call (maxBatchDecide in server/intercept.go) and
  // the pending queue is not paginated, so the selection goes out in sequential
  // chunks of at most batchDecideMax ids. If a chunk cannot be sent (network
  // error, 400), sending stops: its ids and the later ones stay selected with
  // the error, and chunks already decided stay decided. A failed id stays
  // pending and selected, with its error listed.
  const batchDecide = async (decision: "allowed" | "denied") => {
    const ids = selectedRows.map((row) => row.id);
    if (!ids.length || decisionLock.current) return;
    decisionLock.current = true;
    setDeciding(true);
    let decided = 0;
    const failed: { id: number; error: string }[] = [];
    try {
      for (let start = 0; start < ids.length; start += batchDecideMax) {
        try {
          const res = await api.interceptBatchDecide(ids.slice(start, start + batchDecideMax), decision);
          decided += res.decided;
          for (const r of res.results) if (!r.ok) failed.push({ id: r.id, error: r.error || t("Not decided") });
        } catch (e) {
          const error = t("Not sent: {error}", { error: (e as Error).message || t("request failed") });
          for (const id of ids.slice(start)) failed.push({ id, error });
          break;
        }
      }
      request.current++;
      setBatchErrors(failed);
      setSelected(new Set(failed.map((f) => f.id)));
      setRevision((v) => v + 1);
      if (failed.length)
        toast.error(
          decision === "allowed"
            ? t("{decided} allowed, {failed} not decided (see the errors listed above)", { decided, failed: failed.length })
            : t("{decided} denied, {failed} not decided (see the errors listed above)", { decided, failed: failed.length }),
        );
      else toast.success(decision === "allowed" ? t("{count} allowed", { count: decided }) : t("{count} denied", { count: decided }));
    } finally {
      decisionLock.current = false;
      setDeciding(false);
      setBatchDecision(null);
      await latestLoad.current(true);
    }
  };
  const title = taskId ? t("Interception approval") : t("Approval records");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardListIcon className="size-5 text-muted-foreground" />
          <h1 className="font-semibold text-xl">{title}</h1>
          {pending.length ? (
            <Badge variant="secondary">{t("{count} pending", { count: pending.length })}</Badge>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
          {t("Refresh")}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {t("Expand a record to view the tool request and approval decision, along with the context and execution result at the time.")}
      </p>
      <FieldGroup className="flex-row flex-wrap items-end gap-3" aria-label={t("Approval record filters")}>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-status`}>{t("Approval status")}</FieldLabel>
          <Select
            value={filter.status ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                status: value === "all" ? undefined : (value as InterceptApprovalFilter["status"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("All statuses")}</SelectItem>
                <SelectItem value="denied">{t("Denied")}</SelectItem>
                <SelectItem value="pending">{t("Pending approval")}</SelectItem>
                <SelectItem value="allowed">{t("Allowed")}</SelectItem>
                <SelectItem value="timeout">{t("Timed out")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-source`}>{t("Decision source")}</FieldLabel>
          <Select
            value={filter.decision_source ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                decision_source: value === "all" ? undefined : (value as InterceptApprovalFilter["decision_source"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-source`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("All sources")}</SelectItem>
                <SelectItem value="model">{t("Model decision")}</SelectItem>
                <SelectItem value="rule">{t("Rule decision")}</SelectItem>
                <SelectItem value="unknown">{t("Unknown source")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-decided-by`}>{t("Decided by")}</FieldLabel>
          <Select
            value={filter.decided_by ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                decided_by: value === "all" ? undefined : (value as InterceptApprovalFilter["decided_by"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-decided-by`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("All actors")}</SelectItem>
                <SelectItem value="model">{t("AI-decided")}</SelectItem>
                <SelectItem value="human">{t("Human")}</SelectItem>
                <SelectItem value="rule">{t("Rule")}</SelectItem>
                <SelectItem value="system">{t("System")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => changeFilter({})}>
            {t("Clear filters")}
          </Button>
        ) : null}
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t("Failed to load records: {error}. Click Refresh to retry.", { error })}</AlertDescription>
        </Alert>
      ) : null}
      {pendingError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("Failed to load pending approvals: {error}. Click Refresh to retry.", { error: pendingError })}
          </AlertDescription>
        </Alert>
      ) : null}
      {batchErrors.length ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>
              {t("{count} selected request(s) were not decided and stay pending:", { count: batchErrors.length })}
            </p>
            <ul className="list-disc pl-4">
              {batchErrors.map((f) => (
                <li key={f.id}>
                  #{f.id}: {f.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {pending.length ? (
        <section className="overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 font-medium text-sm">
            <ShieldAlertIcon className="size-4" />
            {t("Pending ({count})", { count: pending.length })}
            <span className="text-muted-foreground text-xs">{t("expand to allow or deny")}</span>
          </div>
          <ApprovalTable
            rows={pending}
            busy={deciding}
            decide={decide}
            revision={revision}
            label={t("Pending approvals")}
            selection={selection}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t("{count} selected", { count: selectedRows.length })}</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={deciding || !selectedRows.length} onClick={() => setBatchDecision("allowed")}>
                <CheckIcon data-icon="inline-start" />
                {t("Approve selected")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deciding || !selectedRows.length}
                onClick={() => setBatchDecision("denied")}
              >
                <XIcon data-icon="inline-start" />
                {t("Deny selected")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      <AlertDialog
        open={batchDecision != null}
        onOpenChange={(open) => {
          if (!open && !deciding) setBatchDecision(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchDecision === "denied"
                ? t("Deny {count} request(s)?", { count: selectedRows.length })
                : t("Approve {count} request(s)?", { count: selectedRows.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedHigh
                ? t("{count} of them are high risk.", { count: selectedHigh })
                : t("None of them is high risk.")}{" "}
              {t("Each request is decided on its own; one that cannot be decided stays pending and is listed.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deciding}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={batchDecision === "denied" ? "destructive" : "default"}
              disabled={deciding || !selectedRows.length}
              onClick={(event) => {
                event.preventDefault();
                if (batchDecision) void batchDecide(batchDecision);
              }}
            >
              {batchDecision === "denied" ? t("Deny selected") : t("Approve selected")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3 font-medium text-sm">
          {filtered ? t("Filtered results ({total})", { total }) : t("All records ({total})", { total })}
        </div>
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}
        {!loading && !rows.length && !error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardListIcon />
              </EmptyMedia>
              <EmptyTitle>{filtered ? t("No approval records match the filters") : t("No approval records")}</EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? t("Adjust the approval status, decision source or deciding actor, or clear the filters to see all records.")
                  : t("Records will appear here once a rule or model makes an approval decision.")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {rows.length ? (
          <ApprovalTable rows={rows} busy={deciding} decide={decide} revision={revision} label={t("Approval record list")} />
        ) : null}
        {!loading && !error ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
            pageSizeOptions={[10, 20, 50]}
          />
        ) : null}
      </section>
    </div>
  );
}
