"use client";

import * as React from "react";

import Link from "next/link";

import {
  ActivityIcon,
  ArrowUpRightIcon,
  BugIcon,
  ClockIcon,
  NetworkIcon,
  ShieldCheckIcon,
  TargetIcon,
  ZapIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import type {
  Activity,
  Agent,
  ConvTokenSummary,
  Finding,
  InterceptPending,
  LLMProfile,
  MCPServer,
  Settings,
  SkillItem,
  Stats,
  Task,
  TokenTotal,
  Tool,
  TrafficExchange,
  UsageStats,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { setVisibleInterval } from "@/lib/polling";
import { useActiveCompany } from "@/stores/company/company-store";

// ── chart constants ───────────────────────────────────────────────────────────

const dailyTrendConfig = {
  input: { label: t("Input"), color: "hsl(217 91% 60%)" },
  output: { label: t("Output"), color: "hsl(263 70% 60%)" },
  cacheRead: { label: t("Cache read"), color: "hsl(160 60% 45%)" },
} satisfies ChartConfig;

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtRel(ts?: string | number): string {
  if (!ts) return "—";
  const ms = Date.now() - (typeof ts === "number" ? ts * 1000 : Date.parse(ts as string));
  const s = Math.floor(ms / 1000);
  if (s < 60) return t("{n}s ago", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("{n}m ago", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("{n}h ago", { n: h });
  return t("{n}d ago", { n: Math.floor(h / 24) });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  root_domain: t("Root domain"),
  ip: "IP",
  subdomain: t("Subdomain"),
  app: t("App"),
  service: t("Service"),
  endpoint: t("Endpoint"),
};

const ASSET_COLORS: Record<string, string> = {
  root_domain: "bg-blue-500",
  ip: "bg-indigo-400",
  subdomain: "bg-violet-500",
  app: "bg-orange-400",
  service: "bg-cyan-500",
  endpoint: "bg-emerald-500",
};

function statusColor(code: number): string {
  if (code < 300) return "text-emerald-500";
  if (code < 400) return "text-blue-400";
  if (code < 500) return "text-amber-400";
  return "text-red-400";
}

function statusBg(code: number): string {
  if (code < 300) return "bg-emerald-500";
  if (code < 400) return "bg-blue-400";
  if (code < 500) return "bg-amber-400";
  return "bg-red-400";
}

// ── sub-components ────────────────────────────────────────────────────────────

function LiveDot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-blue-400", className)} />;
}

function SectionTitle({
  icon: Icon,
  children,
  sub,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5 text-muted-foreground" />
        {children}
      </div>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // The sidebar's company switcher narrows the finding-derived panels to that
  // company (server-side `company` filter). Undefined means all companies.
  const company = useActiveCompany();
  // data state
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [findings, setFindings] = React.useState<Finding[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [pending, setPending] = React.useState<InterceptPending[]>([]);
  const [activity, setActivity] = React.useState<Activity[]>([]);
  const [tokens, setTokens] = React.useState<TokenTotal | null>(null);
  const [convTokens, setConvTokens] = React.useState<ConvTokenSummary[]>([]);
  const [usageStats, setUsageStats] = React.useState<UsageStats | null>(null);
  const [assetCounts, setAssetCounts] = React.useState<Record<string, number>>({});
  const [traffic, setTraffic] = React.useState<TrafficExchange[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [mcpServers, setMcpServers] = React.useState<MCPServer[]>([]);
  const [skills, setSkills] = React.useState<SkillItem[]>([]);
  const [tools, setTools] = React.useState<Tool[]>([]);
  const [llmProfiles, setLLMProfiles] = React.useState<LLMProfile[]>([]);

  // The task list is the most expensive dashboard source. Poll it independently
  // so a large history cannot hold back every other dashboard panel.
  React.useEffect(() => {
    let alive = true;
    let loading = false;
    let signature = "";
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const tr = await api.tasks();
        if (!alive) return;
        const nextSignature = JSON.stringify(tr.tasks);
        if (nextSignature !== signature) {
          signature = nextSignature;
          setTasks(tr.tasks);
        }
      } catch {
        /* transient errors — next poll retries */
      } finally {
        loading = false;
      }
    };
    void load();
    const stopPolling = setVisibleInterval(load, 5000);
    return () => {
      alive = false;
      stopPolling();
    };
  }, []);

  // The remaining fast sources stay batched so one poll causes a single render.
  React.useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const [findings, stats, settings, pending, activity, tokens, conversationTokens] = await Promise.all([
          api.findings(undefined, company),
          api.stats(),
          api.settings(),
          api.interceptPending(),
          api.activity(undefined, { limit: 30 }),
          api.tokenStats(),
          api.conversationTokens(),
        ]);
        if (!alive) return;
        setFindings(findings);
        setStats(stats);
        setSettings(settings);
        setPending(pending);
        setActivity(activity.items);
        setTokens(tokens.total ?? null);
        setConvTokens(conversationTokens);
      } catch {
        // Preserve stale data and retry on the next interval.
      } finally {
        loading = false;
      }
    };
    void load();
    const stopPolling = setVisibleInterval(load, 5000);
    return () => {
      alive = false;
      stopPolling();
    };
  }, [company]);

  // slow poll: traffic, assets, system-static (every 15s)
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [traf, counts, agentList, mcpList, skillList, toolList, profileList, usage] = await Promise.all([
          api.traffic(0, 50),
          api.assetCounts(),
          api.agents(),
          api.mcpServers(),
          api.skills(),
          api.tools(),
          api.llmProfiles(),
          api.usageStats(365),
        ]);
        if (!alive) return;
        setTraffic(traf.exchanges ?? []);
        setAssetCounts(counts ?? {});
        setAgents(agentList);
        setMcpServers(mcpList);
        setSkills(skillList);
        setTools(toolList);
        setLLMProfiles(profileList);
        setUsageStats(usage);
      } catch {
        /* transient errors */
      }
    };
    void load();
    const stopPolling = setVisibleInterval(load, 15000);
    return () => {
      alive = false;
      stopPolling();
    };
  }, []);

  // ── derived ───────────────────────────────────────────────────────────────

  const tasksByStatus = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [tasks]);

  const findingsBySev = React.useMemo(() => {
    const m = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      if (f.severity in m) m[f.severity as keyof typeof m]++;
    }
    return m;
  }, [findings]);

  const sortedTasks = React.useMemo(
    () =>
      [...tasks]
        .sort((a, b) => (b.last_activity_unix ?? b.created_unix ?? 0) - (a.last_activity_unix ?? a.created_unix ?? 0))
        .slice(0, 5),
    [tasks],
  );

  const recentFindings = React.useMemo(
    () => [...findings].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 8),
    [findings],
  );

  const recentActivity = React.useMemo(
    () =>
      [...activity]
        .filter((a) => a.kind !== "usage")
        .sort((a, b) => b.seq - a.seq)
        .slice(0, 6),
    [activity],
  );

  const totalAssets = React.useMemo(() => Object.values(assetCounts).reduce((a, b) => a + b, 0), [assetCounts]);

  // asset type breakdown
  const assetByType = React.useMemo(() => {
    return Object.entries(assetCounts)
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [assetCounts]);

  const assetMax = assetByType[0]?.[1] ?? 1;

  // traffic status code breakdown
  const trafficByCodes = React.useMemo(() => {
    const m: Record<number, number> = {};
    for (const e of traffic) {
      const bucket = Math.floor(e.status / 100) * 100;
      m[bucket] = (m[bucket] ?? 0) + 1;
    }
    return Object.entries(m)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([code, n]) => ({ code: Number(code), n }));
  }, [traffic]);

  const trafficMax = Math.max(...trafficByCodes.map((x) => x.n), 1);
  const recentTraffic = [...traffic].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 5);

  // system
  const activeProfile = llmProfiles.find((p) => p.is_default);
  const enabledTools = tools.filter((t) => t.enabled);
  const pendingCount = pending.length;

  // ── token stats per LLM profile ──────────────────────────────────────────
  // tasks whose llm_profile_id is null/undefined used the active default profile
  const defaultProfileId = activeProfile ? Number(activeProfile.id) : null;

  // Data source toggle: old = activity (task.tokens + conversations), new = the llm_usage metering ledger.
  const [tokenVersion, setTokenVersion] = React.useState<"old" | "new">("old");
  // selected profile tab: "all" = all; number = specific profile id
  const [tokenTab, setTokenTab] = React.useState<number | null | "all">("all");
  // day range for the daily bar chart
  const [tokenDays, setTokenDays] = React.useState<7 | 30 | 90 | 180 | 365>(30);

  // profile name → id, mapping llm_usage profile_name to the existing profile tabs.
  const profileIdByName = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of llmProfiles) m.set(p.name, Number(p.id));
    return m;
  }, [llmProfiles]);

  type Bucket = { input: number; output: number; cacheRead: number; cacheWrite: number; taskCount: number };

  // Old: bucketed by profile (task.tokens from activity + conversation usage).
  const tokenByProfileOld = React.useMemo<Map<number | null, Bucket>>(() => {
    const m = new Map<number | null, Bucket>();
    const fold = (key: number | null, inp: number, out: number, cr: number, cw: number, addTask: boolean) => {
      const prev = m.get(key) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, taskCount: 0 };
      m.set(key, {
        input: prev.input + inp,
        output: prev.output + out,
        cacheRead: prev.cacheRead + cr,
        cacheWrite: prev.cacheWrite + cw,
        taskCount: prev.taskCount + (addTask ? 1 : 0),
      });
    };
    for (const t of tasks) {
      fold(
        t.llm_profile_id ?? defaultProfileId,
        t.tokens?.input_tokens ?? 0,
        t.tokens?.output_tokens ?? 0,
        t.tokens?.cache_read_tokens ?? 0,
        t.tokens?.cache_write_tokens ?? 0,
        true,
      );
    }
    for (const c of convTokens) {
      fold(
        c.llm_profile_id ?? defaultProfileId,
        c.input_tokens,
        c.output_tokens,
        c.cache_read_tokens,
        c.cache_write_tokens,
        false,
      );
    }
    return m;
  }, [tasks, convTokens, defaultProfileId]);

  // New: bucketed by profile (from the llm_usage global aggregate, exact per call).
  const tokenByProfileNew = React.useMemo<Map<number | null, Bucket>>(() => {
    const m = new Map<number | null, Bucket>();
    for (const p of usageStats?.by_profile ?? []) {
      // No matching profile (renamed/deleted/empty name) → falls into the default bucket, still counted in "All".
      const key = profileIdByName.get(p.profile_name) ?? defaultProfileId;
      const prev = m.get(key) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, taskCount: 0 };
      m.set(key, {
        input: prev.input + p.input_tokens,
        output: prev.output + p.output_tokens,
        cacheRead: prev.cacheRead + p.cache_read_tokens,
        cacheWrite: prev.cacheWrite + p.cache_write_tokens,
        taskCount: prev.taskCount + p.tasks,
      });
    }
    return m;
  }, [usageStats, profileIdByName, defaultProfileId]);

  const tokenByProfile = tokenVersion === "new" ? tokenByProfileNew : tokenByProfileOld;

  const displayedTokens = React.useMemo(() => {
    if (tokenTab === "all") {
      let input = 0,
        output = 0,
        cacheRead = 0,
        cacheWrite = 0,
        taskCount = 0;
      for (const v of tokenByProfile.values()) {
        input += v.input;
        output += v.output;
        cacheRead += v.cacheRead;
        cacheWrite += v.cacheWrite;
        taskCount += v.taskCount;
      }
      return { input, output, cacheRead, cacheWrite, taskCount };
    }
    const v = tokenByProfile.get(tokenTab as number | null);
    return v
      ? { input: v.input, output: v.output, cacheRead: v.cacheRead, cacheWrite: v.cacheWrite, taskCount: v.taskCount }
      : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, taskCount: 0 };
  }, [tokenTab, tokenByProfile]);

  // Old daily: buckets each task/conversation's total by its creation date (approximate, not real daily spend).
  const dailyTokenDataOld = React.useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() - tokenDays);
    const cutoff = now.toISOString().slice(0, 10);
    const m = new Map<string, { input: number; output: number; cacheRead: number }>();
    const fold = (date: string, inp: number, out: number, cr: number) => {
      if (date < cutoff) return;
      const prev = m.get(date) ?? { input: 0, output: 0, cacheRead: 0 };
      m.set(date, { input: prev.input + inp, output: prev.output + out, cacheRead: prev.cacheRead + cr });
    };
    for (const t of tasks) {
      if (tokenTab !== "all" && (t.llm_profile_id ?? defaultProfileId) !== tokenTab) continue;
      fold(
        t.created_at.slice(0, 10),
        t.tokens?.input_tokens ?? 0,
        t.tokens?.output_tokens ?? 0,
        t.tokens?.cache_read_tokens ?? 0,
      );
    }
    for (const c of convTokens) {
      if (tokenTab !== "all" && (c.llm_profile_id ?? defaultProfileId) !== tokenTab) continue;
      fold(c.created_at.slice(0, 10), c.input_tokens, c.output_tokens, c.cache_read_tokens);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date: date.slice(5), ...v }));
  }, [tasks, convTokens, tokenDays, tokenTab, defaultProfileId]);

  // New daily: real daily spend from llm_usage (ts is the actual call time).
  const dailyTokenDataNew = React.useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() - tokenDays);
    const cutoff = now.toISOString().slice(0, 10);
    const m = new Map<string, { input: number; output: number; cacheRead: number }>();
    for (const d of usageStats?.daily ?? []) {
      if (d.date < cutoff) continue;
      if (tokenTab !== "all" && (profileIdByName.get(d.profile_name) ?? defaultProfileId) !== tokenTab) continue;
      const prev = m.get(d.date) ?? { input: 0, output: 0, cacheRead: 0 };
      m.set(d.date, {
        input: prev.input + d.input_tokens,
        output: prev.output + d.output_tokens,
        cacheRead: prev.cacheRead + d.cache_read_tokens,
      });
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date: date.slice(5), ...v }));
  }, [usageStats, tokenDays, tokenTab, profileIdByName, defaultProfileId]);

  const dailyTokenData = tokenVersion === "new" ? dailyTokenDataNew : dailyTokenDataOld;

  // activity kind label
  function kindLabel(a: Activity): string {
    if (a.kind === "tool_use") return a.tool ?? t("tool_use");
    if (a.kind === "tool_result") return t("tool_result");
    return t(a.kind);
  }

  function workerColor(w: string): string {
    if (w === "planner") return "text-violet-400";
    if (w === "mainagent") return "text-cyan-400";
    return "text-blue-400";
  }

  function workerBg(w: string): string {
    if (w === "planner") return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    if (w === "mainagent") return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
    return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      {/* ── Header ── */}
      <div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("Overview")}</h1>
          <p className="text-xs text-muted-foreground">{t("System-wide status · live refresh")}</p>
        </div>
      </div>

      {/* ── Row 1: 5 stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Active tasks */}
        <Card className="gap-1">
          <CardHeader className="pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <TargetIcon className="size-3" /> {t("Active tasks")}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums">{tasksByStatus.running ?? 0}</span>
              <span className="text-xs text-muted-foreground">/ {tasks.length}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
            {(tasksByStatus.running ?? 0) > 0 && (
              <span className="text-blue-400">{t("Exploring {count}", { count: tasksByStatus.running })}</span>
            )}
            {(tasksByStatus.paused ?? 0) > 0 && (
              <span className="text-amber-400">{t("Paused {count}", { count: tasksByStatus.paused })}</span>
            )}
            {(tasksByStatus.done ?? 0) > 0 && (
              <span className="text-emerald-400">{t("Completed {count}", { count: tasksByStatus.done })}</span>
            )}
            {tasks.length === 0 && <span className="text-muted-foreground">{t("No tasks")}</span>}
          </CardContent>
        </Card>

        {/* Confirmed findings */}
        <Card className="gap-1">
          <CardHeader className="pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <BugIcon className="size-3" /> {t("Confirmed findings")}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{findings.length}</div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2.5 text-[10px]">
            <span className="text-rose-500">{t("Critical {count}", { count: findingsBySev.critical })}</span>
            <span className="text-red-400">{t("High {count}", { count: findingsBySev.high })}</span>
            <span className="text-amber-400">{t("Medium {count}", { count: findingsBySev.medium })}</span>
            <span className="text-slate-400">{t("Low {count}", { count: findingsBySev.low })}</span>
          </CardContent>
        </Card>

        {/* Asset nodes */}
        <Card className="gap-1">
          <CardHeader className="pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <NetworkIcon className="size-3" /> {t("Asset nodes")}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{totalAssets}</div>
          </CardHeader>
          <CardContent className="text-[10px] text-muted-foreground">{t("Shared across tasks")}</CardContent>
        </Card>

        {/* Traffic exchanges */}
        <Card className="gap-1">
          <CardHeader className="pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ActivityIcon className="size-3" /> {t("Traffic exchanges")}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{traffic.length}</div>
          </CardHeader>
          <CardContent className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {settings?.traffic_capture ? (
              <>
                <LiveDot />
                <span>{t("Recording")}</span>
              </>
            ) : (
              <Link href="/system/settings" className="text-amber-500 hover:underline">
                {t("Capture is off · required for provable findings")}
              </Link>
            )}
          </CardContent>
        </Card>

        {/* LLM usage */}
        <Card className="gap-1">
          <CardHeader className="pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ZapIcon className="size-3" /> {t("Token usage")}
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {fmtTokens(displayedTokens.input + displayedTokens.output) || "—"}
            </div>
          </CardHeader>
          <CardContent className="text-[10px] text-muted-foreground">
            {t("In {input} (incl. cache {cache}) · Out {output}", {
              input: fmtTokens(displayedTokens.input),
              cache: fmtTokens(displayedTokens.cacheRead),
              output: fmtTokens(displayedTokens.output),
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: LLM token usage ── */}
      <Card className="p-4">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <ZapIcon className="size-3.5 text-muted-foreground" />
            {t("LLM token usage")}
            {/* Data source toggle: old = activity stats (includes historical tasks), new = the llm_usage metering ledger (more accurate, only covers data since it was enabled) */}
            <div className="ml-1 flex gap-0.5 rounded-md border bg-muted/30 p-0.5">
              {(
                [
                  { v: "old", label: t("Old") },
                  { v: "new", label: t("New") },
                ] as const
              ).map(({ v, label }) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setTokenVersion(v)}
                  title={
                    v === "new"
                      ? t(
                          "New: from the llm_usage metering ledger, exact per call and including aborted runs; only covers data since it was enabled",
                        )
                      : t(
                          "Old: from activity stats (includes historical tasks); aborted runs are not counted and it cannot break down by model",
                        )
                  }
                  className={cn(
                    "rounded px-2 py-0.5 text-[9px] font-medium transition-colors",
                    tokenVersion === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-normal text-muted-foreground">
              {tokenVersion === "new" ? "llm_usage" : "activity"}
            </span>
          </div>
          {/* Profile tabs */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTokenTab("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors",
                tokenTab === "all"
                  ? "bg-foreground text-background"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground",
              )}
            >
              {t("All")}
            </button>
            {llmProfiles.map((p) => {
              const key = Number(p.id);
              const hasData = tokenByProfile.has(key) || (p.is_default && tokenByProfile.has(defaultProfileId));
              const resolvedKey = tokenByProfile.has(key) ? key : p.is_default ? defaultProfileId : key;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setTokenTab(resolvedKey)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors",
                    tokenTab === resolvedKey
                      ? "bg-foreground text-background"
                      : "bg-muted/30 text-muted-foreground hover:text-foreground",
                    !hasData && "opacity-40",
                  )}
                >
                  {p.name}
                  {p.is_default && (
                    <span
                      className={cn(
                        "rounded px-1 py-0 text-[8px]",
                        tokenTab === resolvedKey
                          ? "bg-background/20 text-background"
                          : "bg-emerald-500/20 text-emerald-400",
                      )}
                    >
                      {t("Default")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body: metrics left + bar chart right */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          {/* Left: key metrics */}
          <div className="flex flex-col gap-4">
            {/* Total */}
            <div>
              <div className="text-[10px] text-muted-foreground">{t("Total (input+output)")}</div>
              <div className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight">
                {fmtTokens(displayedTokens.input + displayedTokens.output) || "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {t("{count} tasks", { count: displayedTokens.taskCount })}
              </div>
            </div>

            {/* Per-type bars */}
            <div className="space-y-3">
              {(() => {
                // input already includes cache; split into three non-overlapping segments: uncached input + cache hits + output = total.
                const total = displayedTokens.input + displayedTokens.output;
                return [
                  {
                    label: t("Input (uncached)"),
                    value: displayedTokens.input - displayedTokens.cacheRead,
                    barColor: dailyTrendConfig.input.color!,
                    text: "text-blue-400",
                  },
                  {
                    label: t("Cache hits"),
                    value: displayedTokens.cacheRead,
                    barColor: dailyTrendConfig.cacheRead.color!,
                    text: "text-emerald-400",
                  },
                  {
                    label: t("Output"),
                    value: displayedTokens.output,
                    barColor: dailyTrendConfig.output.color!,
                    text: "text-violet-400",
                  },
                ].map(({ label, value, barColor, text }) => {
                  const pct = total > 0 ? (value / total) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{label}</span>
                        <span className={cn("font-mono font-semibold tabular-nums", text)}>{fmtTokens(value)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Cache hit rate */}
            {(() => {
              // input already includes cache → hit rate = cache hits / total input.
              const denominator = displayedTokens.input;
              const hitPct = denominator > 0 ? Math.round((displayedTokens.cacheRead / denominator) * 100) : 0;
              return (
                <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-[10px]">
                  <span className="text-muted-foreground">{t("Cache hit rate")}</span>
                  <span
                    className={cn("font-semibold tabular-nums", hitPct > 50 ? "text-emerald-400" : "text-amber-400")}
                  >
                    {hitPct}%
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Right: daily bar chart */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex gap-3 text-[9px] text-muted-foreground">
                {(["input", "output", "cacheRead"] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    <span
                      className="inline-block size-2 rounded-sm"
                      style={{ background: dailyTrendConfig[k].color }}
                    />
                    {dailyTrendConfig[k].label}
                  </span>
                ))}
              </div>
              <div className="flex gap-0.5 rounded-md border bg-muted/30 p-0.5">
                {(
                  [
                    { days: 7, label: t("7d") },
                    { days: 30, label: t("30d") },
                    { days: 90, label: t("3mo") },
                    { days: 180, label: t("6mo") },
                    { days: 365, label: t("1y") },
                  ] as const
                ).map(({ days, label }) => (
                  <button
                    type="button"
                    key={days}
                    onClick={() => setTokenDays(days)}
                    className={cn(
                      "rounded px-2.5 py-0.5 text-[9px] font-medium transition-colors",
                      tokenDays === days
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {dailyTokenData.length === 0 ? (
              <div
                className="flex flex-1 items-center justify-center rounded-lg border bg-muted/10 text-xs text-muted-foreground"
                style={{ minHeight: 180 }}
              >
                {t("No data")}
              </div>
            ) : (
              <ChartContainer config={dailyTrendConfig} className="h-[200px] w-full">
                <BarChart data={dailyTokenData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} maxBarSize={40}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    tickMargin={6}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => fmtTokens(Number(v))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    width={44}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        formatter={(value, name) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span>
                              {(dailyTrendConfig as Record<string, { label: string }>)[String(name)]?.label ??
                                String(name)}
                            </span>
                            <span className="font-mono font-semibold tabular-nums">{fmtTokens(Number(value))}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="input" stackId="1" fill="var(--color-input)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="output" stackId="1" fill="var(--color-output)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="cacheRead" stackId="1" fill="var(--color-cacheRead)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </div>
      </Card>

      {/* ── Row 3: Activity feed | Findings ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Activity feed */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <ActivityIcon className="size-3.5 text-muted-foreground" />
              {t("Activity feed")}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {t("{count} events", { count: activity.filter((a) => a.kind !== "usage").length })}
              </span>
              <Link
                href="/function/tasks"
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {t("View tasks")} <ArrowUpRightIcon className="size-3" />
              </Link>
            </div>
          </div>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {(["tool_use", "tool_result", "text", "thinking", "result"] as const).map((kind) => {
              const count = activity.filter((a) => a.kind === kind).length;
              if (count === 0) return null;
              return (
                <span key={kind} className="rounded border bg-muted/20 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {t(kind)} <strong className="text-foreground/70">{count}</strong>
                </span>
              );
            })}
          </div>

          <div className="divide-y">
            {recentActivity.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t("No activity records")}</div>
            ) : (
              recentActivity.map((a) => (
                <div key={a.seq} className="flex gap-2.5 py-2">
                  <span
                    className={cn(
                      "shrink-0 self-start rounded border px-1.5 py-0.5 font-mono text-[9px]",
                      workerBg(a.worker),
                    )}
                  >
                    {a.worker}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium">{kindLabel(a)}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{a.summary}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-muted-foreground">
                      {t(a.kind)}
                    </Badge>
                    <div className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">{fmtRel(a.ts)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Findings */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <BugIcon className="size-3.5 text-muted-foreground" />
              {t("Findings")}
            </div>
            <Link
              href="/function/findings"
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {t("All")} <ArrowUpRightIcon className="size-3" />
            </Link>
          </div>

          <div className="divide-y">
            {recentFindings.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">{t("No findings")}</div>
            ) : (
              recentFindings.map((f) => (
                <div key={f.id} className="flex items-start gap-2 py-2">
                  <StatusBadge
                    domain="severity"
                    value={f.severity}
                    className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold">{f.vulnclass}</span>
                      {f.task_description && (
                        <span className="truncate text-[10px] text-muted-foreground">{f.task_description}</span>
                      )}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                      {f.summary}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">{fmtRel(f.ts)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ── Row 4: Task table ── */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <ClockIcon className="size-3.5 text-muted-foreground" />
            {t("Tasks")}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{t("{count} tasks", { count: tasks.length })}</span>
            <Link
              href="/function/tasks"
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {t("All")} <ArrowUpRightIcon className="size-3" />
            </Link>
          </div>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b">
              {["Task", "Status", "Engine", "Goal progress", "In flight", "Last activity"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground first:pl-4"
                >
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("No tasks")}
                </td>
              </tr>
            ) : (
              sortedTasks.map((t) => {
                const goalsPct = t.goals_total ? Math.round(((t.goals_met ?? 0) / t.goals_total) * 100) : null;
                return (
                  <tr key={t.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                    <td className="max-w-xs px-4 py-3">
                      <Link href={`/function/tasks/detail?id=${t.id}`} className="group flex flex-col">
                        <span className="truncate font-medium group-hover:underline">{t.description}</span>
                        <span className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{t.id}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge domain="task" value={t.status} dot className="px-1.5 py-0 text-[10px]" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        domain="engine"
                        value={t.engine_mode ?? "idle"}
                        className="px-1.5 py-0 text-[10px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {goalsPct !== null ? (
                        <div className="flex items-center gap-2">
                          <Progress value={goalsPct} className="h-1 w-14" />
                          <span className="tabular-nums text-muted-foreground">
                            {t.goals_met ?? 0}/{t.goals_total}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {(t.in_flight ?? 0) > 0 ? (
                        <span className="font-semibold">{t.in_flight}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {fmtRel(t.last_activity_unix ?? t.created_unix)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* ── Row 5: Asset distribution | Traffic status codes | Interception & pending approvals ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Asset distribution */}
        <Card className="p-4">
          <SectionTitle icon={NetworkIcon} sub={t("By type")}>
            {t("Asset distribution")}
          </SectionTitle>

          {assetByType.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{t("No asset data")}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {assetByType.map(([type, count]) => (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground">
                    {ASSET_TYPE_LABELS[type] ?? type}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", ASSET_COLORS[type] ?? "bg-slate-400")}
                      style={{ width: `${(count / assetMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-4 text-right tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 border-t pt-3 text-[10px] text-muted-foreground">
            {t("{count} nodes in total", { count: totalAssets })}
          </div>
        </Card>

        {/* Traffic status codes */}
        <Card className="p-4">
          <SectionTitle icon={ActivityIcon} sub={t("{count} requests", { count: traffic.length })}>
            {t("Traffic status codes")}
          </SectionTitle>

          {/* bar chart */}
          {trafficByCodes.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{t("No traffic data")}</div>
          ) : (
            <>
              <div className="mb-3 flex items-end gap-2" style={{ height: 52 }}>
                {trafficByCodes.map(({ code, n }) => (
                  <div key={code} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] tabular-nums text-muted-foreground">{n}</span>
                    <div
                      className={cn("w-full min-h-1 rounded-sm", statusBg(code), "opacity-80")}
                      style={{ height: Math.max(4, (n / trafficMax) * 36) }}
                    />
                    <span className={cn("text-[9px] font-mono", statusColor(code))}>{code}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-2.5">
                <div className="mb-1.5 text-[10px] text-muted-foreground">{t("Recent requests")}</div>
                <div className="flex flex-col gap-1.5">
                  {recentTraffic.map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5 text-[10px]">
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 py-0 font-mono text-[9px]",
                          e.method === "GET"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-blue-500/30 bg-blue-500/10 text-blue-400",
                        )}
                      >
                        {e.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {e.host}
                        {e.url.replace(/^https?:\/\/[^/]+/, "").substring(0, 30)}
                      </span>
                      <span className={cn("shrink-0 font-mono text-[9px]", statusColor(e.status))}>{e.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>

        {/* System status & pending approvals */}
        <Card className="p-4">
          <SectionTitle icon={ShieldCheckIcon}>{t("System status")}</SectionTitle>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{t("LLM config")}</div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  stats?.llm_configured
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400",
                )}
              >
                {stats?.llm_configured ? t("Configured") : t("Not configured")}
              </Badge>
            </div>

            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground">{t("Traffic capture")}</div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    settings?.traffic_capture
                      ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-500",
                  )}
                >
                  {settings?.traffic_capture ? t("On") : t("Off")}
                </Badge>
              </div>
              {settings && !settings.traffic_capture && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-amber-500">
                  {t("Traffic capture is off: findings stay recorded, but captured HTTP traffic is required for provable findings.")}{" "}
                  <Link href="/system/settings" className="underline">
                    {t("Enable in settings")}
                  </Link>
                </p>
              )}
            </div>

            {activeProfile && (
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{t("Active model")}</div>
                <span className="font-mono text-[10px]">{activeProfile.model}</span>
              </div>
            )}
          </div>

          {/* pending approvals */}
          {pendingCount > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[10px] font-medium text-amber-400">
                {t("Pending approvals ({count})", { count: pendingCount })}
              </div>
              <div className="flex flex-col gap-1.5">
                {pending.slice(0, 3).map((p) => (
                  <Link
                    key={p.id}
                    href="/system/intercept/approvals"
                    className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 hover:bg-amber-500/10"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium">{p.tool_name}</div>
                      <div className="text-[9px] text-muted-foreground">{p.agent_name}</div>
                    </div>
                    <ArrowUpRightIcon className="size-3 shrink-0 text-amber-400" />
                  </Link>
                ))}
                {pendingCount > 3 && (
                  <Link
                    href="/system/intercept/approvals"
                    className="text-center text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {t("{count} more…", { count: pendingCount - 3 })}
                  </Link>
                )}
              </div>
            </div>
          )}

          {pendingCount === 0 && (
            <div className="mt-3 rounded-lg border bg-muted/10 px-3 py-3 text-center text-[10px] text-muted-foreground">
              <ShieldCheckIcon className="mx-auto mb-1 size-4 text-emerald-500/50" />
              {t("No pending interception approvals")}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
