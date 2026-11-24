"use client";

import * as React from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
  BugIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  FlagIcon,
  FlaskConicalIcon,
  LayersIcon,
  LightbulbIcon,
  type LucideIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  TargetIcon,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { type Tone, toneClasses, toneDot } from "@/lib/status";
import { taskAssetTypeLabel } from "@/lib/task-assets";
import type { Edge, ExploreKind, FindingAsset, NewAssetType, TaskNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setVisibleInterval } from "@/lib/polling";
import { intlLocale, t } from "@/i18n";

const PAGE_SIZES = [20, 50, 100];
const POLL_MS = 8000;

type KindMeta = { label: string; icon: LucideIcon; dot: string; chip: string };

// The broadcast board's own display metadata, deliberately not reusing the exploration graph's copy: the graph is a topology view (node cards, edge colors),
// the broadcast a stream view (timeline rows); the two differ in information density and color needs, so they evolve separately.
const KIND_META: Record<string, KindMeta> = {
  begin: {
    label: t("Start"),
    icon: FlagIcon,
    dot: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
  task: {
    label: t("Root task"),
    icon: FlagIcon,
    dot: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
  goal: {
    label: t("Goal"),
    icon: TargetIcon,
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  intent: {
    label: t("Intent"),
    icon: CompassIcon,
    dot: "bg-blue-500",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  fact: {
    label: t("Fact"),
    icon: FlaskConicalIcon,
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  finding: {
    label: t("Vulnerability"),
    icon: BugIcon,
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  hint: {
    label: t("Hint"),
    icon: LightbulbIcon,
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  digest: {
    label: t("Digest"),
    icon: LayersIcon,
    dot: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
};

// Filterable kinds. The start (fact/state=origin) is not listed separately; it is filtered together with "Fact".
const FILTER_KINDS: ExploreKind[] = ["goal", "intent", "fact", "finding", "hint", "digest"];

const REL_LABEL: Record<string, string> = {
  spawns: t("Spawns"),
  derived_from: t("Intent chain"),
  yields: t("Yields"),
  proves: t("Proves"),
  covers: t("Compresses"),
};

// State semantics for goal / intent come from the global status table (StatusBadge); the other kinds' states only
// appear in the graph and broadcast, so they are defined here.
const STATE_META: Record<string, Record<string, { label: string; tone: Tone }>> = {
  fact: {
    origin: { label: t("Start"), tone: "slate" },
    confirmed: { label: t("Confirmed"), tone: "green" },
    dismissed: { label: t("Dismissed"), tone: "slate" },
  },
  finding: {
    confirmed: { label: t("Confirmed"), tone: "red" },
    dismissed: { label: t("Excluded"), tone: "slate" },
  },
  hint: {
    active: { label: t("Pending adoption"), tone: "violet" },
    consumed: { label: t("Adopted"), tone: "slate" },
  },
  digest: {
    active: { label: t("Active"), tone: "green" },
    superseded: { label: t("Superseded"), tone: "slate" },
  },
};

// The task root is a fact with state=origin, shown as "Start" in the broadcast.
function viewKind(n: TaskNode): string {
  return n.type === "fact" && n.state === "origin" ? "begin" : n.type;
}

const SUMMARY_FIELDS: Record<string, string[]> = {
  begin: ["summary", "description"],
  task: ["summary", "description"],
  goal: ["text"],
  intent: ["summary"],
  fact: ["summary"],
  finding: ["name", "summary"],
  hint: ["text", "summary"],
  digest: ["body", "summary"],
};

function summaryOf(n: TaskNode): string {
  const raw = n.payload ?? "";
  if (!raw.trim()) return "";
  for (const field of SUMMARY_FIELDS[viewKind(n)] ?? []) {
    try {
      const obj: unknown = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        const v = (obj as Record<string, unknown>)[field];
        if (typeof v === "string" && v.trim()) return v;
      }
    } catch {
      return raw; // non-JSON payload: broadcast as-is
    }
  }
  return raw;
}

function prettyPayload(raw?: string): string {
  if (!raw?.trim()) return t("(no payload)");
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function relTime(ts: number, now: number): string {
  if (!now || !ts) return "";
  const sec = Math.max(0, (now - ts) / 1000);
  if (sec < 60) return t("just now");
  if (sec < 3600) return t("{count} minutes ago", { count: Math.floor(sec / 60) });
  if (sec < 86400) return t("{count} hours ago", { count: Math.floor(sec / 3600) });
  return t("{count} days ago", { count: Math.floor(sec / 86400) });
}

const dayFmt = new Intl.DateTimeFormat(intlLocale, { month: "long", day: "numeric", weekday: "short" });
const clockFmt = new Intl.DateTimeFormat(intlLocale, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function NodeStateBadge({ node }: { node: TaskNode }) {
  if (node.type === "goal") return <StatusBadge domain="goal" value={node.state} dot />;
  if (node.type === "intent") return <StatusBadge domain="intent" value={node.state} dot />;
  const meta = STATE_META[node.type]?.[node.state];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[meta.tone],
      )}
    >
      <span className={cn("size-1.5 rounded-full", toneDot[meta.tone])} />
      {meta.label}
    </span>
  );
}

function KindChip({ kind }: { kind: string }) {
  const meta = KIND_META[kind] ?? KIND_META.fact;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", meta.chip)}>{meta.label}</span>
  );
}

// Assets anchored to a node: type label + identifiable text. The data ships with the broadcast page (node id → assets),
// and is shown on expand without extra requests.
function AssetList({ assets, dense = false }: { assets: FindingAsset[]; dense?: boolean }) {
  if (assets.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t("Assets involved · {count}", { count: assets.length })}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {assets.map((a) => {
          // At runtime a.type may be a kind not covered by the label table; fall back to the raw string. The type cast keeps the fallback from being flagged as redundant.
          const typeLabel =
            (taskAssetTypeLabel as (t: NewAssetType) => string | undefined)(a.type as NewAssetType) || a.type;
          return (
            <li
              key={a.id}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5",
                dense && "text-xs",
              )}
              title={`${typeLabel} · ${a.label}`}
            >
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{typeLabel}</span>
              <code className="truncate font-mono text-xs">{a.label}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Node card shown when hovering an upstream/downstream entry: type/state/source/time + summary + payload snippet + involved assets.
// Data comes from refs already fetched on this page — the broadcast API returns neighbor nodes in full.
function RelatedNodeCard({ node, assets }: { node: TaskNode; assets: FindingAsset[] }) {
  const kind = viewKind(node);
  const meta = KIND_META[kind] ?? KIND_META.fact;
  const ts = Date.parse(node.ts);
  const summary = summaryOf(node);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <KindChip kind={kind} />
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{node.id}</code>
        <NodeStateBadge node={node} />
        {node.priority > 0 && (kind === "goal" || kind === "intent") && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">P{node.priority}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>{t("Type {type}", { type: meta.label })}</span>
        <span>{t("Source {source}", { source: node.origin || "system" })}</span>
        <span>{Number.isNaN(ts) ? node.ts : new Date(ts).toLocaleString(intlLocale)}</span>
      </div>
      <p className="line-clamp-4 text-xs break-words">{summary || t("(no summary)")}</p>
      <AssetList assets={assets} dense />
      <pre className="max-h-40 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
        {prettyPayload(node.payload)}
      </pre>
    </div>
  );
}

// Upstream/downstream of a broadcast entry: upstream = edges pointing to this node, downstream = edges this node points out.
function RelatedList({
  title,
  rows,
  refs,
  assets,
}: {
  title: string;
  rows: Array<{ rel: string; id: string }>;
  refs: Record<string, TaskNode>;
  assets: Record<string, FindingAsset[]>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const node = refs[row.id];
          return (
            <li key={`${row.rel}-${row.id}`} className="flex min-w-0 items-center gap-2 text-xs">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {REL_LABEL[row.rel] ?? row.rel}
              </span>
              {node ? (
                <HoverCard openDelay={150} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 cursor-help items-center gap-2 text-left hover:underline"
                    >
                      <KindChip kind={viewKind(node)} />
                      <span className="truncate">{summaryOf(node) || t("Node #{id}", { id: node.id })}</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" className="w-96">
                    <RelatedNodeCard node={node} assets={assets[node.id] ?? []} />
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <span className="text-muted-foreground">{t("Node #{id}", { id: row.id })}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BroadcastRow({
  node,
  edges,
  refs,
  assets,
  now,
  fresh,
}: {
  node: TaskNode;
  edges: Edge[];
  refs: Record<string, TaskNode>;
  assets: Record<string, FindingAsset[]>;
  now: number;
  fresh: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const kind = viewKind(node);
  const meta = KIND_META[kind] ?? KIND_META.fact;
  const Icon = meta.icon;
  const ts = Date.parse(node.ts);
  const summary = summaryOf(node);
  const upstream = edges.filter((e) => e.dst === node.id).map((e) => ({ rel: e.rel, id: e.src }));
  const downstream = edges.filter((e) => e.src === node.id).map((e) => ({ rel: e.rel, id: e.dst }));

  return (
    <div className={cn("relative grid grid-cols-[4.5rem_1.75rem_1fr] gap-x-2", fresh && "bg-primary/5")}>
      {/* Time column */}
      <div className="py-3 text-right text-xs text-muted-foreground tabular-nums">
        <div>{Number.isNaN(ts) ? "--:--:--" : clockFmt.format(ts)}</div>
        <div className="text-[11px] opacity-70">{relTime(ts, now)}</div>
      </div>

      {/* Timeline: vertical line + type dot */}
      <div className="relative flex justify-center">
        <span className="absolute inset-y-0 w-px bg-border" />
        <span
          className={cn(
            "relative mt-3.5 flex size-6 items-center justify-center rounded-full text-white ring-4 ring-background",
            meta.dot,
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>

      {/* Content column */}
      <div className="min-w-0 border-b py-3 pr-1 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full min-w-0 items-start gap-2 text-left"
        >
          <ChevronRightIcon
            className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <KindChip kind={kind} />
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{node.id}</code>
              <NodeStateBadge node={node} />
              {node.priority > 0 && (kind === "goal" || kind === "intent") && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">P{node.priority}</span>
              )}
              {fresh && (
                <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {t("New")}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{node.origin || "system"}</span>
            </div>
            <p className={cn("mt-1 text-sm", !open && "line-clamp-2")}>{summary || t("Node #{id}", { id: node.id })}</p>
          </div>
        </button>

        {open && (
          <div className="mt-2 ml-5 flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("Node")} <code className="font-mono">#{node.id}</code>
              </span>
              <span>{t("Type {type}", { type: meta.label })}</span>
              <span>{t("Source {source}", { source: node.origin || "system" })}</span>
              <span>{Number.isNaN(ts) ? node.ts : new Date(ts).toLocaleString(intlLocale)}</span>
            </div>
            {node.state === "deleted" && node.delete_reason && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                <span className="font-medium text-destructive">{t("Deletion reason")}</span>
                <span className="ml-2 break-words text-muted-foreground">{node.delete_reason}</span>
              </div>
            )}
            <AssetList assets={assets[node.id] ?? []} />
            {(upstream.length > 0 || downstream.length > 0) && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <RelatedList title={t("Upstream · comes from these")} rows={upstream} refs={refs} assets={assets} />
                <RelatedList title={t("Downstream · produced by this")} rows={downstream} refs={refs} assets={assets} />
              </div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">payload</div>
              <pre className="max-h-64 overflow-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                {prettyPayload(node.payload)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BroadcastTab({ taskId }: { taskId: string }) {
  const [kinds, setKinds] = React.useState<ExploreKind[]>([]);
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [order, setOrder] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(20);
  const [live, setLive] = React.useState(true);

  const [items, setItems] = React.useState<TaskNode[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  const [refs, setRefs] = React.useState<Record<string, TaskNode>>({});
  const [assets, setAssets] = React.useState<Record<string, FindingAsset[]>>({});
  const [total, setTotal] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  const [freshIDs, setFreshIDs] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(0);
  const [now, setNow] = React.useState(0);

  const seenRef = React.useRef<Set<string>>(new Set());
  const baselineRef = React.useRef<number | null>(null);
  const streamRef = React.useRef("");
  // Only "newest-first page 1" is the real live seat; every other position only updates the unread count,
  // leaving the list alone so content does not shift under pagination/expand.
  const atLive = page === 1 && order === "desc";

  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Input debounce: the query fires 300ms after typing stops, and returns to page 1.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  React.useEffect(() => {
    let alive = true;
    let rendered = false; // whether this query has already rendered its content
    // Switching task/filters/sort = switching to a different broadcast stream: clear "new" marks and the unread baseline. Paging is not a stream switch,
    // otherwise there would be no unread count to compute when returning to the latest.
    const stream = `${taskId}|${kinds.join(",")}|${query}|${order}`;
    if (streamRef.current !== stream) {
      streamRef.current = stream;
      seenRef.current = new Set();
      baselineRef.current = null;
      setPending(0);
    }
    const load = () =>
      api
        .explorationNodes(taskId, { page, size, kinds, q: query, order })
        .then((r) => {
          if (!alive) return;
          // The live seat refreshes every round; other positions render only the first time, then polls just update the unread count.
          if (atLive || !rendered) {
            rendered = true;
            setItems(r.items);
            setEdges(r.edges);
            setRefs(r.refs);
            setAssets(r.assets);
          }
          setTotal(r.total);
          if (atLive) {
            const seen = seenRef.current;
            setFreshIDs(seen.size === 0 ? new Set() : new Set(r.items.filter((n) => !seen.has(n.id)).map((n) => n.id)));
            seenRef.current = new Set(r.items.map((n) => n.id));
            baselineRef.current = r.total;
            setPending(0);
          } else {
            const base = baselineRef.current;
            setPending(base === null ? 0 : Math.max(0, r.total - base));
          }
          setLoaded(true);
        })
        .catch(() => {
          // Polling is best-effort: keep the last successful broadcast content and retry automatically next round.
        });
    void load();
    if (!live) {
      return () => {
        alive = false;
      };
    }
    const stopPolling = setVisibleInterval(load, POLL_MS);
    return () => {
      alive = false;
      stopPolling();
    };
  }, [taskId, page, size, kinds, query, order, live, atLive]);

  const toggleKind = (kind: ExploreKind) => {
    setKinds((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
    setPage(1);
  };

  const backToLive = () => {
    setPage(1);
    setOrder("desc");
    setPending(0);
  };

  // Server-side refs only fill in "neighbors not on this page"; references between same-page nodes must fall back to items,
  // otherwise adjacent broadcasts referencing each other degrade to a bare "Node #id".
  const nodeIndex = React.useMemo(() => {
    const idx: Record<string, TaskNode> = { ...refs };
    for (const n of items) idx[n.id] = n;
    return idx;
  }, [refs, items]);

  const pageCount = Math.max(1, Math.ceil(total / size));
  const start = total === 0 ? 0 : (page - 1) * size + 1;
  const end = (page - 1) * size + items.length;

  // When switching tasks or filters shrinks the count, pull the page number back in bounds.
  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // Group by day: the stream breaks at date boundaries, so paging a long task still shows which day things happened.
  const groups: Array<{ day: string; rows: TaskNode[] }> = [];
  for (const node of items) {
    const ts = Date.parse(node.ts);
    const day = Number.isNaN(ts) ? t("Unknown date") : dayFmt.format(ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(node);
    else groups.push({ day, rows: [node] });
  }

  return (
    <Card className="overflow-hidden py-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={t("Search content / source / node id")}
            className="h-8 pl-8"
            aria-label={t("Search broadcasts")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            const active = kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                aria-pressed={active}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                  active ? meta.chip : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                {meta.label}
              </button>
            );
          })}
          {kinds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setKinds([]);
                setPage(1);
              }}
            >
              {t("Clear")}
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              setOrder((o) => (o === "desc" ? "asc" : "desc"));
              setPage(1);
            }}
            aria-label={
              order === "desc"
                ? t("Currently newest first; click to switch to oldest first")
                : t("Currently oldest first; click to switch to newest first")
            }
          >
            {order === "desc" ? <ArrowDownIcon /> : <ArrowUpIcon />}
            {order === "desc" ? t("Newest first") : t("Oldest first")}
          </Button>
          <Button
            variant={live ? "outline" : "secondary"}
            size="sm"
            className="h-8"
            onClick={() => setLive((v) => !v)}
            aria-label={live ? t("Pause auto-refresh") : t("Resume auto-refresh")}
          >
            {live ? <PauseIcon /> : <PlayIcon />}
            {live ? t("Auto-refresh") : t("Paused")}
          </Button>
        </div>
      </div>

      {/* Unread hint shown when away from the live seat */}
      {!atLive && pending > 0 && (
        <button
          type="button"
          onClick={backToLive}
          className="flex w-full items-center justify-center gap-1.5 border-b bg-primary/10 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
        >
          <ArrowUpToLineIcon className="size-3.5" />
          {t("{count} new broadcasts · Back to latest", { count: pending > 99 ? "99+" : pending })}
        </button>
      )}

      <CardContent className="px-4 py-0">
        {!loaded ? (
          <div className="flex flex-col gap-3 py-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {query || kinds.length > 0
              ? t("No broadcasts match the filters.")
              : t("This task has not produced any exploration nodes yet.")}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.day}>
              <div className="py-2 pl-[6.25rem] text-xs font-medium text-muted-foreground">{group.day}</div>
              {group.rows.map((node) => (
                <BroadcastRow
                  key={node.id}
                  node={node}
                  edges={edges}
                  refs={nodeIndex}
                  assets={assets}
                  now={now}
                  fresh={freshIDs.has(node.id)}
                />
              ))}
            </div>
          ))
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <Select
          value={String(size)}
          onValueChange={(v) => {
            setSize(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("{count} / page", { count: n })}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          {start}–{end} / {total}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label={t("Previous page")}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            aria-label={t("Next page")}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
