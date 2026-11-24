"use client";

import * as React from "react";

import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EraserIcon,
  FilterXIcon,
  ListChecksIcon,
  Loader2Icon,
  RadioTowerIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { LinkTrafficDialog } from "@/components/link-traffic-dialog";
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
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SortableHead } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { setVisibleInterval } from "@/lib/polling";
import { useStoredSortPreference } from "@/lib/sort-preference";
import type { TrafficDetail, TrafficExchange, TrafficHARImportResult, TrafficHost, TrafficResp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActiveCompanyID } from "@/stores/company/company-store";
import { intlLocale, t } from "@/i18n";

import { ReplayPanel } from "./_components/replay-panel";
import { StreamMessagesPanel } from "./_components/stream-messages";
import { TamperHooksPanel } from "./_components/tamper-hooks-panel";

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString(intlLocale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtBytes(n: number) {
  if (n <= 0) return "0 B";
  // GB matters for the reclaimed-space figure a full purge reports; a capture-heavy
  // instance can hand back several.
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

function statusTone(status: number) {
  if (status >= 500) return "text-red-500";
  if (status >= 400) return "text-amber-500";
  if (status >= 300) return "text-blue-500";
  if (status >= 200) return "text-emerald-500";
  return "text-muted-foreground";
}

function MethodBadge({ method }: { method: string }) {
  return <Badge className="shrink-0 font-mono">{method}</Badge>;
}

// Older captures may predate Host persistence because net/http keeps Host
// outside Request.Header. Fill it for display while newly recorded traffic is
// fixed at the recorder layer as well.
function requestWithHost(raw: string, exchange: TrafficExchange): string {
  if (!raw.trim() || /^host\s*:/im.test(raw)) return raw;
  let host = exchange.host;
  try {
    host = new URL(exchange.url).host || host;
  } catch {
    // Relative or legacy URLs fall back to the indexed host.
  }
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const firstLineEnd = raw.indexOf(newline);
  if (firstLineEnd < 0) return `${raw}${newline}Host: ${host}`;
  return `${raw.slice(0, firstLineEnd + newline.length)}Host: ${host}${newline}${raw.slice(firstLineEnd + newline.length)}`;
}

// Fixed method set (server filters exact-match); avoids deriving options from a
// single page, which would only ever list the methods on that page.
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
const PAGE_SIZES = [25, 50, 100, 200];
type HostCountSortDirection = "asc" | "desc";

// Server-sortable columns. The list is sent to the backend verbatim as `sort`,
// which whitelists these same names, so keep them in sync with traffic.Page.
const SORT_FIELDS = ["ts", "status", "resp_len"] as const;
type SortField = (typeof SORT_FIELDS)[number];
const SORT_STORAGE_KEY = "traffic-sort";

// Status-class buckets for the filter dropdown; the value is sent as `status`,
// which the backend reads as either an exact code or an "Nxx" class band.
const STATUS_BUCKETS = ["2xx", "3xx", "4xx", "5xx"];

export default function TrafficPage() {
  const [viewTab, setViewTab] = React.useState<"exchanges" | "hooks">("exchanges");
  // The sidebar's company switcher narrows the list to that company's hosts.
  const companyId = useActiveCompanyID();
  const [selectedFlows, setSelectedFlows] = React.useState<Set<string>>(() => new Set());
  const [linking, setLinking] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(50);
  const [host, setHost] = React.useState(""); // raw host input
  const [hostQ, setHostQ] = React.useState(""); // debounced → server
  const [query, setQuery] = React.useState(""); // raw free-text input
  const [queryQ, setQueryQ] = React.useState(""); // debounced → server
  const [method, setMethod] = React.useState("all");

  // Advanced filters (issue #177): response-body content, path, status class and
  // response-size range. Text inputs are debounced like host/query; the status
  // select applies immediately.
  const [body, setBody] = React.useState("");
  const [bodyQ, setBodyQ] = React.useState("");
  const [path, setPath] = React.useState("");
  const [pathQ, setPathQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [rewrittenFilter, setRewrittenFilter] = React.useState("all");
  const [respMin, setRespMin] = React.useState("");
  const [respMinQ, setRespMinQ] = React.useState("");
  const [respMax, setRespMax] = React.useState("");
  const [respMaxQ, setRespMaxQ] = React.useState("");
  const [sort, setSort] = useStoredSortPreference<SortField>(SORT_STORAGE_KEY, SORT_FIELDS, "ts", "desc");

  const [traffic, setTraffic] = React.useState<TrafficResp | null>(null);
  const [selected, setSelected] = React.useState<TrafficExchange | null>(null);
  const [detail, setDetail] = React.useState<TrafficDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailTab, setDetailTab] = React.useState("request");
  const streamKind = detail?.stream_kind === "websocket" || detail?.stream_kind === "sse" ? detail.stream_kind : null;
  const hasStream = streamKind !== null;

  const [hosts, setHosts] = React.useState<TrafficHost[]>([]); // target picker
  const [selectedHosts, setSelectedHosts] = React.useState<string[]>([]); // checked in picker
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [hostCountSortDirection, setHostCountSortDirection] = React.useState<HostCountSortDirection>("desc");

  const [deleteMode, setDeleteMode] = React.useState<"filter" | "selected" | "all" | null>(null); // null = dialog closed
  const [deleting, setDeleting] = React.useState(false);
  const [reloadTick, setReloadTick] = React.useState(0); // manual refetch trigger

  // HAR 1.2 import/export state
  const harInputRef = React.useRef<HTMLInputElement | null>(null);
  const [harImporting, setHarImporting] = React.useState(false);
  const [harExporting, setHarExporting] = React.useState(false);
  const [harSummary, setHarSummary] = React.useState<TrafficHARImportResult | null>(null);
  const [harError, setHarError] = React.useState<string | null>(null);

  // Debounce both filters so we don't refetch on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setHostQ(host.trim()), 300);
    return () => clearTimeout(t);
  }, [host]);
  React.useEffect(() => {
    const t = setTimeout(() => setQueryQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  React.useEffect(() => {
    const t = setTimeout(() => setBodyQ(body.trim()), 300);
    return () => clearTimeout(t);
  }, [body]);
  React.useEffect(() => {
    const t = setTimeout(() => setPathQ(path.trim()), 300);
    return () => clearTimeout(t);
  }, [path]);
  React.useEffect(() => {
    const t = setTimeout(() => setRespMinQ(respMin.trim()), 300);
    return () => clearTimeout(t);
  }, [respMin]);
  React.useEffect(() => {
    const t = setTimeout(() => setRespMaxQ(respMax.trim()), 300);
    return () => clearTimeout(t);
  }, [respMax]);

  const hasAdvancedFilter =
    Boolean(bodyQ || pathQ || respMinQ || respMaxQ) || statusFilter !== "all" || rewrittenFilter !== "all";
  const resetAdvancedFilters = () => {
    setBody("");
    setBodyQ("");
    setPath("");
    setPathQ("");
    setStatusFilter("all");
    setRewrittenFilter("all");
    setRespMin("");
    setRespMinQ("");
    setRespMax("");
    setRespMaxQ("");
  };

  // Any filter/size/sort change resets to the first page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these values intentionally trigger a page reset.
  React.useEffect(() => {
    setPage(0);
  }, [hostQ, queryQ, method, size, bodyQ, pathQ, statusFilter, rewrittenFilter, respMinQ, respMaxQ, sort, companyId]);

  // Load the current page. Auto-refresh only on page 0 (newest) so paging back
  // through history isn't yanked out from under the user.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an explicit manual-refetch trigger.
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .traffic(page, size, hostQ, method, queryQ, {
          body: bodyQ,
          path: pathQ,
          status: statusFilter,
          rewritten: rewrittenFilter,
          respMin: respMinQ,
          respMax: respMaxQ,
          sort: sort.field,
          order: sort.direction,
          company: companyId,
        })
        .then((r) => {
          if (alive) setTraffic(r);
        })
        .catch(() => {
          // Keep the last successful snapshot during transient refresh failures.
        });
      api
        .trafficHosts()
        .then((r) => {
          if (alive) setHosts(r.hosts ?? []);
        })
        .catch(() => {
          // Keep the last successful host list during transient refresh failures.
        });
    };
    load();
    const stopPolling = setVisibleInterval(() => {
      if (page !== 0) return; // only auto-refresh the newest page
      load();
    }, 5000);
    return () => {
      alive = false;
      stopPolling();
    };
  }, [
    page,
    size,
    hostQ,
    method,
    queryQ,
    bodyQ,
    pathQ,
    statusFilter,
    rewrittenFilter,
    respMinQ,
    respMaxQ,
    sort,
    reloadTick,
    companyId,
  ]);

  // Delete traffic for the current host filter (substring) or the checked
  // hosts (exact batch), then refetch.
  const allSelected = hosts.length > 0 && hosts.every((h) => selectedHosts.includes(h.host));
  const sortedHosts = React.useMemo(
    () =>
      [...hosts].sort((a, b) => {
        const countOrder = hostCountSortDirection === "asc" ? a.count - b.count : b.count - a.count;
        return countOrder || a.host.localeCompare(b.host);
      }),
    [hosts, hostCountSortDirection],
  );

  // "Purge" for the unfiltered purge, "Delete" for the host-scoped ones — the dialog's
  // title and its confirm button both follow from which is in play.
  const purging = deleteMode === "all";
  const deleteTitle = deleteMode
    ? {
        all: t("Purge all traffic records?"),
        selected: t("Delete all traffic for the {count} selected targets?", { count: selectedHosts.length }),
        filter: t("Delete all traffic for this target?"),
      }[deleteMode]
    : "";

  // `reclaimed` only comes back from the full purge; the host-scoped deletions
  // report the row count alone.
  const requestDelete = (mode: "filter" | "selected" | "all"): Promise<{ deleted: number; reclaimed?: number }> => {
    if (mode === "all") return api.trafficDeleteAll();
    if (mode === "selected") return api.trafficDeleteHosts(selectedHosts);
    return api.trafficDeleteHost(hostQ);
  };

  const confirmDelete = () => {
    if (!deleteMode) return;
    setDeleting(true);
    const mode = deleteMode;
    requestDelete(mode)
      .then((r) => {
        setDeleteMode(null);
        setSelected(null);
        setDetail(null);
        if (mode !== "filter") {
          setSelectedHosts([]);
          setPickerOpen(false);
        }
        if (mode === "all") {
          // Reclaimed space is the whole point of compacting an emptied index, so say so.
          const reclaimed = r.reclaimed ?? 0;
          toast.success(
            reclaimed > 0
              ? t("Purged {count} traffic records, freeing {size} of storage", {
                  count: r.deleted,
                  size: fmtBytes(reclaimed),
                })
              : t("Purged {count} traffic records", { count: r.deleted }),
          );
        }
        setPage(0);
        setReloadTick((t) => t + 1);
      })
      .catch((e) => {
        // Keep the confirmation open so the user can retry a failed deletion.
        if (mode === "all") toast.error(t("Purge failed: {error}", { error: (e as Error).message }));
      })
      .finally(() => setDeleting(false));
  };

  // Lazy-load the raw request/response for the selected exchange. A new
  // selection opens on Request; a WebSocket/SSE exchange then opens on Stream.
  React.useEffect(() => {
    setDetailTab("request");
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetail(null);
    api
      .trafficExchange(selected.id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        if (d.stream_kind === "websocket" || d.stream_kind === "sse") setDetailTab("stream");
      })
      .catch(() => {
        if (alive) setDetail({ req: t("(failed to load the messages)"), resp: "" });
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  // Toggle direction when re-clicking the active column, else sort the new column
  // newest/largest-first.
  const toggleSort = (field: SortField) =>
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "desc" },
    );

  const handleHarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setHarError(null);
    setHarSummary(null);
    if (file.size > 32 * 1024 * 1024) {
      const msg = t("HAR file exceeds the 32 MiB limit");
      setHarError(msg);
      toast.error(msg);
      return;
    }
    setHarImporting(true);
    try {
      const raw = await file.text();
      const res = await api.trafficImportHAR(raw);
      setHarSummary(res);
      const summary = t("HAR import complete: {imported} imported, {skipped} skipped, {failed} failed", {
        imported: res.imported,
        skipped: res.skipped,
        failed: res.failed,
      });
      if (res.failed > 0 || res.truncated) {
        toast.warning(summary);
      } else {
        toast.success(summary);
      }
      setPage(0);
      setReloadTick((n) => n + 1);
    } catch (e) {
      const msg = t("HAR import failed: {error}", { error: (e as Error).message });
      setHarError(msg);
      toast.error(msg);
    } finally {
      setHarImporting(false);
    }
  };

  const handleHarExport = async () => {
    setHarExporting(true);
    try {
      const meta = await api.trafficExportHAR({
        host: hostQ,
        method,
        q: queryQ,
        body: bodyQ,
        path: pathQ,
        status: statusFilter,
        rewritten: rewrittenFilter,
        respMin: respMinQ,
        respMax: respMaxQ,
      });
      if (meta.truncated) {
        toast.warning(
          t("Exported {exported} of {matched} matching exchanges (truncated: {reason})", {
            exported: meta.exported,
            matched: meta.matched,
            reason: meta.truncatedReason ?? "limit",
          }),
        );
      } else {
        toast.success(t("Exported {count} exchanges to HAR", { count: meta.exported }));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHarExporting(false);
    }
  };

  const exchanges = React.useMemo(() => traffic?.exchanges ?? [], [traffic]);
  const total = traffic?.total ?? exchanges.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const rangeStart = total === 0 ? 0 : page * size + 1;
  const rangeEnd = page * size + exchanges.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Traffic")}</h1>
          <p className="text-muted-foreground text-sm">{t("Global recording proxy · all HTTP traffic")}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
              traffic?.enabled
                ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "border-transparent bg-muted text-muted-foreground",
            )}
          >
            <RadioTowerIcon className="size-3.5" />
            {traffic?.enabled ? t("Recording") : t("Disabled")}
          </span>
          {traffic?.proxy && <span className="font-mono text-xs text-muted-foreground">{traffic.proxy}</span>}
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("{count} records", { count: traffic?.count ?? 0 })}
          </span>
          <input
            ref={harInputRef}
            type="file"
            accept=".har,application/json"
            className="hidden"
            onChange={(e) => void handleHarFileChange(e)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={harImporting}
            onClick={() => harInputRef.current?.click()}
          >
            {harImporting ? <Loader2Icon className="size-3.5 animate-spin" /> : <UploadIcon className="size-3.5" />}
            {harImporting ? t("Importing HAR…") : t("Import HAR")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={harExporting || !traffic?.count}
            onClick={() => void handleHarExport()}
          >
            {harExporting ? <Loader2Icon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
            {harExporting ? t("Exporting HAR…") : t("Export HAR")}
          </Button>
        </div>
      </div>

      <Tabs
        value={viewTab}
        onValueChange={(v) => setViewTab(v as "exchanges" | "hooks")}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="exchanges">{t("Exchanges")}</TabsTrigger>
          <TabsTrigger value="hooks">{t("Hooks")}</TabsTrigger>
        </TabsList>

        <TabsContent value="hooks" className="mt-0 flex min-h-0 flex-1 flex-col gap-4">
          <TamperHooksPanel recentExchanges={exchanges} />
        </TabsContent>

        <TabsContent value="exchanges" className="mt-0 flex min-h-0 flex-1 flex-col gap-4">

      {harError ? (
        <Alert variant="destructive" className="flex items-center justify-between gap-2 py-2">
          <AlertDescription className="text-xs">{harError}</AlertDescription>
          <Button variant="ghost" size="icon-xs" aria-label={t("Dismiss")} onClick={() => setHarError(null)}>
            <XIcon className="size-3.5" />
          </Button>
        </Alert>
      ) : null}

      {harSummary ? (
        <Alert className="flex items-start justify-between gap-2 py-2">
          <AlertDescription className="space-y-1 text-xs">
            <p>
              {t("HAR import complete: {imported} imported, {skipped} skipped, {failed} failed", {
                imported: harSummary.imported,
                skipped: harSummary.skipped,
                failed: harSummary.failed,
              })}
            </p>
            {harSummary.truncated ? (
              <p className="text-amber-600 dark:text-amber-400">
                {t("HAR import stopped early at the 32 MiB decoded body cap.")}
              </p>
            ) : null}
            {harSummary.errors && harSummary.errors.length > 0 ? (
              <ul className="list-disc pl-4 text-muted-foreground">
                {harSummary.errors.slice(0, 5).map((item) => (
                  <li key={`${item.index}-${item.reason}`} className="font-mono">
                    #{item.index}: {item.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
          <Button variant="ghost" size="icon-xs" aria-label={t("Dismiss")} onClick={() => setHarSummary(null)}>
            <XIcon className="size-3.5" />
          </Button>
        </Alert>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <ListChecksIcon className="size-3.5" />
              {selectedHosts.length > 0
                ? t("Select targets ({count})", { count: selectedHosts.length })
                : t("Select targets…")}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[calc(100vw-2rem)] p-0 data-open:animate-none data-closed:animate-none sm:w-80"
            align="start"
            collisionPadding={16}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">{t("Batch delete by target")}</span>
              <div className="flex items-center gap-1">
                {hosts.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setHostCountSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
                        aria-label={
                          hostCountSortDirection === "desc"
                            ? t("Packet count is currently descending; click to switch to ascending")
                            : t("Packet count is currently ascending; click to switch to descending")
                        }
                      >
                        {hostCountSortDirection === "desc" ? <ArrowDownWideNarrowIcon /> : <ArrowUpNarrowWideIcon />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {hostCountSortDirection === "desc"
                        ? t("By packet count, descending")
                        : t("By packet count, ascending")}
                    </TooltipContent>
                  </Tooltip>
                )}
                {hosts.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setSelectedHosts(allSelected ? [] : hosts.map((h) => h.host))}
                  >
                    {allSelected ? t("Clear all") : t("Select all")}
                  </Button>
                )}
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {hosts.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("No traffic records")}</div>
              ) : (
                sortedHosts.map((h, index) => (
                  <label
                    key={h.host}
                    htmlFor={`traffic-host-${index}`}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    <Checkbox
                      id={`traffic-host-${index}`}
                      checked={selectedHosts.includes(h.host)}
                      onCheckedChange={() =>
                        setSelectedHosts((prev) =>
                          prev.includes(h.host) ? prev.filter((x) => x !== h.host) : [...prev, h.host],
                        )
                      }
                    />
                    <span className="truncate font-mono">{h.host}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{h.count}</span>
                  </label>
                ))
              )}
            </div>
            <div className="border-t p-2">
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={selectedHosts.length === 0}
                onClick={() => {
                  setDeleteMode("selected");
                  setPickerOpen(false);
                }}
              >
                {t("Delete selected ({count})", { count: selectedHosts.length })}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="relative w-48">
          <Input placeholder="host…" value={host} onChange={(e) => setHost(e.target.value)} className="h-8" />
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="h-8"
          disabled={!hostQ || deleting}
          title={hostQ ? undefined : t("Select a target on the left or enter a host first")}
          onClick={() => setDeleteMode("filter")}
        >
          <Trash2Icon className="size-3.5" />
          {t("Delete this target")}
        </Button>
        {/* Outline rather than a second destructive button: this one ignores every
            filter, so it must not look one mis-click away from "Delete this target". */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={!traffic?.count || deleting}
          title={traffic?.count ? t("Delete all traffic and compact storage") : t("No traffic records yet")}
          onClick={() => setDeleteMode("all")}
        >
          <EraserIcon className="size-3.5" />
          {t("Purge all")}
        </Button>
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("Search everything (URL / method / type / status…)")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder={t("Method")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All methods")}</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {t("{count} / page", { count: n })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {rangeStart}–{rangeEnd} / {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {/* Advanced filters (issue #177): narrow 660k+ exchanges down to the one packet. */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
        <span className="pl-1 text-xs font-medium text-muted-foreground">{t("Advanced filters")}</span>
        <div className="relative w-56">
          <Input
            placeholder={t("Response content (body keyword, ≥3 chars)")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="relative w-52">
          <Input
            placeholder={t("Path (e.g. /api/user/…)")}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="h-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder={t("Status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            {STATUS_BUCKETS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rewrittenFilter} onValueChange={setRewrittenFilter}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder={t("Rewritten")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All traffic")}</SelectItem>
            <SelectItem value="rewritten">{t("Rewritten")}</SelectItem>
            <SelectItem value="original">{t("Original")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{t("Response size")}</span>
          <Input
            type="number"
            min={0}
            placeholder={t("Min (B)")}
            value={respMin}
            onChange={(e) => setRespMin(e.target.value)}
            className="h-8 w-24"
          />
          <span>–</span>
          <Input
            type="number"
            min={0}
            placeholder={t("Max (B)")}
            value={respMax}
            onChange={(e) => setRespMax(e.target.value)}
            className="h-8 w-24"
          />
        </div>
        {hasAdvancedFilter ? (
          <Button variant="ghost" size="sm" className="h-8" onClick={resetAdvancedFilters}>
            <FilterXIcon className="size-3.5" />
            {t("Clear filters")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t("{count} flows selected", { count: selectedFlows.size })}
        </span>
        <Button variant="outline" size="sm" disabled={selectedFlows.size === 0} onClick={() => setLinking(true)}>
          {t("Link to finding")}
        </Button>
        {selectedFlows.size > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setSelectedFlows(new Set())}>
            {t("Clear selection")}
          </Button>
        ) : null}
      </div>
      {/* History table */}
      <div className="flex h-[calc(100vh-15rem)] min-h-0 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t("Select this page's traffic")}
                      checked={exchanges.length > 0 && exchanges.every((e) => selectedFlows.has(e.id))}
                      onCheckedChange={(checked) =>
                        setSelectedFlows((previous) => {
                          const next = new Set(previous);
                          for (const e of exchanges) {
                            if (checked === true) next.add(e.id);
                            else next.delete(e.id);
                          }
                          return next;
                        })
                      }
                    />
                  </TableHead>
                  <SortableHead
                    field="ts"
                    label={t("Time")}
                    activeField={sort.field}
                    direction={sort.direction}
                    onSort={toggleSort}
                    className="w-36"
                  />
                  <TableHead className="w-44">host</TableHead>
                  <TableHead className="w-20">{t("Method")}</TableHead>
                  <TableHead>URL</TableHead>
                  <SortableHead
                    field="status"
                    label={t("Status")}
                    activeField={sort.field}
                    direction={sort.direction}
                    onSort={toggleSort}
                    className="w-20"
                  />
                  <TableHead className="w-36">content-type</TableHead>
                  <SortableHead
                    field="resp_len"
                    label={t("Response size")}
                    activeField={sort.field}
                    direction={sort.direction}
                    onSort={toggleSort}
                    align="right"
                    className="w-24 text-right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exchanges.map((e) => (
                  <TableRow
                    key={e.id}
                    className={cn("cursor-pointer", selected?.id === e.id && "bg-accent hover:bg-accent")}
                    onClick={() => setSelected(e)}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={t("Select traffic {id}", { id: e.id })}
                        checked={selectedFlows.has(e.id)}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) =>
                          setSelectedFlows((previous) => {
                            const next = new Set(previous);
                            if (checked === true) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtTime(e.ts)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.host}</TableCell>
                    <TableCell>
                      <MethodBadge method={e.method} />
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate font-mono text-xs">{e.url}</span>
                        {e.rewritten ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                          >
                            {t("Rewritten")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("font-mono text-xs font-semibold tabular-nums", statusTone(e.status))}>
                        {e.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.content_type}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtBytes(e.resp_len)}</TableCell>
                  </TableRow>
                ))}
                {exchanges.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      {traffic === null ? t("Loading…") : t("No matching traffic.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {linking ? (
        <LinkTrafficDialog
          trafficIds={[...selectedFlows]}
          onClose={() => setLinking(false)}
          onBound={() => setSelectedFlows(new Set())}
        />
      ) : null}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full! max-w-none! gap-0 p-0 sm:w-[48rem]! sm:max-w-[48rem]!">
          {selected && (
            <>
              <SheetHeader className="border-b px-5 py-4">
                <div className="flex items-center gap-2 pr-8">
                  <MethodBadge method={selected.method} />
                  <Badge variant="secondary" className={cn("font-mono tabular-nums", statusTone(selected.status))}>
                    {selected.status}
                  </Badge>
                  {selected.rewritten ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    >
                      {t("Rewritten")}
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{fmtTime(selected.ts)}</span>
                </div>
                <SheetTitle className="break-all font-mono">{selected.host}</SheetTitle>
                <SheetDescription className="break-all font-mono">{selected.url}</SheetDescription>
              </SheetHeader>
              <Tabs value={detailTab} onValueChange={setDetailTab} className="min-h-0 flex-1 gap-0">
                <TabsList className={cn("mx-5 mt-4 grid w-auto", hasStream ? "grid-cols-4" : "grid-cols-3")}>
                  <TabsTrigger value="request">{t("Request")}</TabsTrigger>
                  <TabsTrigger value="response">{t("Response")}</TabsTrigger>
                  {hasStream && (
                    <TabsTrigger value="stream">
                      {t("Stream")}
                      {(detail?.stream_count ?? 0) > 0 && (
                        <span className="text-muted-foreground text-xs tabular-nums">{detail?.stream_count}</span>
                      )}
                    </TabsTrigger>
                  )}
                  {hasStream ? (
                    <span title={t("stream replay is not supported")} className="flex">
                      <TabsTrigger value="replay" disabled>
                        {t("Replay")}
                      </TabsTrigger>
                    </span>
                  ) : (
                    <TabsTrigger value="replay">{t("Replay")}</TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="request" className="min-h-0 overflow-auto">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 p-5 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {t("Loading messages…")}
                    </div>
                  ) : (
                    <HttpCodeBlock raw={requestWithHost(detail?.req ?? "", selected)} />
                  )}
                </TabsContent>
                <TabsContent value="response" className="min-h-0 overflow-auto">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 p-5 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {t("Loading messages…")}
                    </div>
                  ) : (
                    <HttpCodeBlock raw={detail?.resp ?? ""} />
                  )}
                </TabsContent>
                {streamKind && (
                  <TabsContent value="stream" className="min-h-0 overflow-auto">
                    <StreamMessagesPanel exchangeId={selected.id} kind={streamKind} />
                  </TabsContent>
                )}
                {!hasStream && (
                  // Kept mounted so edits survive a look at another tab.
                  <TabsContent value="replay" forceMount className="min-h-0 overflow-auto data-[state=inactive]:hidden">
                    {detailLoading || !detail ? (
                      <div className="flex items-center gap-2 p-5 text-muted-foreground text-xs">
                        <Loader2Icon className="size-3.5 animate-spin" />
                        {t("Loading…")}
                      </div>
                    ) : (
                      <ReplayPanel
                        exchange={selected}
                        raw={requestWithHost(detail.req, selected)}
                        methods={METHODS}
                        onRecorded={() => setReloadTick((n) => n + 1)}
                      />
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteMode !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "all" && (
                <>
                  {t(
                    "This will permanently delete all {count} traffic records (including raw requests/responses), ignoring the current filters. This action cannot be undone. Traffic evidence already bound to findings lives in a separate evidence store and is unaffected.",
                    { count: traffic?.count ?? 0 },
                  )}
                  <br />
                  <span className="text-muted-foreground">
                    {t(
                      "Purging also compacts storage, returning the index's disk space to the system; traffic recording pauses briefly during this time.",
                    )}
                  </span>
                </>
              )}
              {deleteMode === "selected" && (
                <>
                  {t(
                    "This will permanently delete all traffic records for {count} targets ({hosts}), including raw requests/responses. This action cannot be undone.",
                    {
                      count: selectedHosts.length,
                      hosts: `${selectedHosts.slice(0, 3).join(", ")}${selectedHosts.length > 3 ? "…" : ""}`,
                    },
                  )}
                </>
              )}
              {deleteMode === "filter" && (
                <>
                  {t(
                    "This will permanently delete all traffic records for hosts containing {host} (including raw requests/responses). This action cannot be undone.",
                    { host: hostQ },
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? purging
                  ? t("Purging…")
                  : t("Deleting…")
                : purging
                  ? t("Confirm purge")
                  : t("Confirm delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
