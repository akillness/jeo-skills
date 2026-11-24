"use client";

import * as React from "react";

import {
  BuildingIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutTemplateIcon,
  LinkIcon,
  type LucideIcon,
  NetworkIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { AssetDslSearch } from "@/components/asset-dsl-search";
import { ScopeTextEditor } from "@/components/scope-text-editor";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { parseCompanyScopeText } from "@/lib/company-scope";
import { httpHref } from "@/lib/http-href";
import type { Asset, Company, CompanyScopeRule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActiveCompanyID } from "@/stores/company/company-store";
import { t } from "@/i18n";

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-orange-100 text-orange-700",
  DELETE: "bg-red-100 text-red-700",
  HEAD: "bg-purple-100 text-purple-700",
  OPTIONS: "bg-slate-100 text-slate-600",
};

function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none",
        METHOD_COLOR[m] ?? "bg-muted text-muted-foreground",
      )}
    >
      {m || "—"}
    </span>
  );
}

function statusTone(code: number) {
  if (code >= 500) return "text-red-500";
  if (code >= 400) return "text-amber-500";
  if (code >= 300) return "text-blue-500";
  if (code >= 200) return "text-emerald-500";
  return "text-muted-foreground";
}

const PAGE_SIZES = [25, 50, 100, 200];

const TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "company", label: t("Companies"), icon: BuildingIcon },
  { key: "root_domain", label: t("Root domains"), icon: GlobeIcon },
  { key: "ip", label: "IP", icon: NetworkIcon },
  { key: "subdomain", label: t("Subdomains"), icon: GlobeIcon },
  { key: "app", label: t("Apps"), icon: SmartphoneIcon },
  { key: "service", label: t("Services"), icon: LayoutTemplateIcon },
  { key: "endpoint", label: t("Endpoints"), icon: LinkIcon },
];

export default function AssetsPage() {
  // The sidebar's company switcher narrows the data tabs to that company.
  const companyId = useActiveCompanyID();
  const [rows, setRows] = React.useState<Asset[]>([]);
  const [total, setTotal] = React.useState(0);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [tab, setTab] = React.useState("company");
  const [query, setQuery] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(50);
  const [dslError, setDslError] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const assetsRequestRef = React.useRef(0);
  const [rowsTab, setRowsTab] = React.useState("");

  // asset selection & delete
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [deleteIds, setDeleteIds] = React.useState<number[]>([]);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // company delete
  const [companyDeleteTarget, setCompanyDeleteTarget] = React.useState<Company | null>(null);
  const [companyDeleteAssets, setCompanyDeleteAssets] = React.useState(false);
  const [companyDeleting, setCompanyDeleting] = React.useState(false);

  // Companies + per-type counts (tab badges) — loaded on demand, no background polling.
  const loadMeta = React.useCallback(() => {
    api
      .companies()
      .then(setCompanies)
      .catch(() => {
        /* Keep the last successful company snapshot on a transient failure. */
      });
    api
      .assetCounts()
      .then(setCounts)
      .catch(() => {
        /* Keep the last successful counters on a transient failure. */
      });
  }, []);

  // Manual refresh: reload counts/companies and re-fetch the current page.
  const refresh = React.useCallback(() => {
    loadMeta();
    setRefreshKey((k) => k + 1);
    setSelected(new Set());
  }, [loadMeta]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: number[]) => {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => {
          next.delete(id);
        });
      } else {
        ids.forEach((id) => {
          next.add(id);
        });
      }
      return next;
    });
  };

  const openDelete = (ids: number[]) => {
    setDeleteIds(ids);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.deleteAssets(deleteIds);
      toast.success(t("Deleted {count} assets", { count: res.deleted }));
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast.error(t("Delete failed: {error}", { error: String((e as Error)?.message ?? e) }));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const confirmDeleteCompany = async () => {
    if (!companyDeleteTarget) return;
    setCompanyDeleting(true);
    try {
      const res = await api.deleteCompany(companyDeleteTarget.id, companyDeleteAssets);
      const msg =
        companyDeleteAssets && res.assets_deleted > 0
          ? t("Company deleted, along with {count} assets", { count: res.assets_deleted })
          : t("Company deleted");
      toast.success(msg);
      refresh();
    } catch (e) {
      toast.error(t("Delete failed: {error}", { error: String((e as Error)?.message ?? e) }));
    } finally {
      setCompanyDeleting(false);
      setCompanyDeleteTarget(null);
      setCompanyDeleteAssets(false);
    }
  };

  React.useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Reset query + page + selection when switching tabs
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab changes intentionally reset tab-local controls.
  React.useEffect(() => {
    setQuery("");
    setDslError("");
    setSelected(new Set());
    setRows([]);
    setRowsTab("");
    setTotal(0);
    setLoaded(false);
  }, [tab]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: these controls intentionally reset server pagination.
  React.useEffect(() => setPage(0), [tab, size, query, companyId]);

  const dslMode = query.trim() !== "";

  // Server-side paginated page loader for the active data tab (company tab excluded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an explicit manual-reload trigger.
  React.useEffect(() => {
    if (tab === "company") return;
    const request = ++assetsRequestRef.current;
    const dsl = query.trim();
    setLoading(true);
    const offset = page * size;
    const run = async () => {
      try {
        const r = dsl
          ? await api.searchAssets(dsl, tab, size, offset, companyId)
          : await api.assets(tab, size, offset, companyId);
        if (assetsRequestRef.current !== request) return;
        setRows(r.assets);
        setRowsTab(tab);
        setTotal(r.total);
        setDslError("");
      } catch (e) {
        if (assetsRequestRef.current !== request) return;
        setDslError(String((e as Error)?.message ?? e));
        setRows([]);
        setRowsTab(tab);
        setTotal(0);
      } finally {
        if (assetsRequestRef.current === request) {
          setLoading(false);
          setLoaded(true);
        }
      }
    };
    const tid = setTimeout(run, dsl ? 400 : 0);
    return () => {
      clearTimeout(tid);
      if (assetsRequestRef.current === request) assetsRequestRef.current++;
    };
  }, [tab, page, size, query, refreshKey, companyId]);

  React.useEffect(() => {
    if (tab === "company") return;
    const lastPage = Math.max(0, Math.ceil(total / size) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [page, size, tab, total]);

  const companyById = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companies) m.set(c.id, c.name);
    return m;
  }, [companies]);

  const companyName = (id?: number) => (id ? (companyById.get(id) ?? "") : "");

  const tabCounts: Record<string, number> = { ...counts, company: companies.length };
  const totalAssets = Object.values(counts).reduce((a, b) => a + b, 0);

  // rows are already the current server-side page.
  const tabData = (type: string): Asset[] => (rowsTab === type ? rows : []);
  const currentRows = tabData(tab);
  const slice = <T,>(list: T[]) => list;

  const searchBox = (
    <AssetDslSearch
      query={query}
      onChange={setQuery}
      loading={loading}
      error={dslError}
      count={dslMode ? total : undefined}
    />
  );

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Assets")}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("{count} assets in total", { count: totalAssets })}
          </span>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => openDelete(Array.from(selected) as number[])}>
              <Trash2Icon className="size-3.5" /> {t("Delete selected ({count})", { count: selected.size })}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} /> {t("Refresh")}
          </Button>
          <CompanyDialog onSaved={refresh} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList variant="default">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                <t.icon className="size-3.5" />
                {t.label}
                <span className="ml-1 tabular-nums text-muted-foreground">{tabCounts[t.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Companies */}
        <TabsContent value="company" className="mt-0 flex min-h-0 flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
            <div className="min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>{t("Company")}</TableHead>
                    <TableHead className="w-24 text-right">{t("Assets")}</TableHead>
                    <TableHead>{t("Asset scope")}</TableHead>
                    <TableHead className="w-36 text-right">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CompanyAvatar name={c.name} logo={c.logo} />
                          <span className="font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{c.asset_count}</TableCell>
                      <TableCell>
                        {c.scope?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {c.scope.map((s, i) => (
                              <Badge key={i} variant="secondary" className="font-mono text-[11px]">
                                {s.raw}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("No scope set")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <EditScopeDialog company={c} onSaved={refresh} />
                          <AppendScopeDialog company={c} onSaved={refresh} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setCompanyDeleteTarget(c);
                              setCompanyDeleteAssets(false);
                            }}
                            aria-label={t("Delete company {name}", { name: c.name })}
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {companies.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        {t(
                          'No companies yet. Click "Add company" in the top-right corner and fill in the asset scope; the system will automatically claim matching assets.',
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Root domains */}
        <TabsContent value="root_domain" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
          {searchBox}
          <AssetCard
            cols={["", "Domain", "ICP filing", "Company", ""]}
            loaded={loaded}
            total={total}
            page={page}
            size={size}
            onSize={setSize}
            onPage={setPage}
            rows={currentRows}
            selected={selected}
            onToggleAll={(ids) => toggleSelectAll(ids)}
          >
            {slice(tabData("root_domain")).map((a) => (
              <TableRow key={a.id} className={selected.has(a.id) ? "bg-muted/40" : undefined}>
                <TableCell className="w-8 pr-0">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                </TableCell>
                <TableCell className="font-mono text-xs font-medium">{a.domain}</TableCell>
                <TableCell className="text-xs">{a.icp || "—"}</TableCell>
                <TableCell className="text-xs">
                  {companyName(a.company_id) || <span className="text-muted-foreground">{t("Unassigned")}</span>}
                </TableCell>
                <TableCell className="w-8 pl-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => openDelete([a.id])}
                    aria-label={t("Delete asset {name}", { name: a.domain || a.id })}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        {/* IP */}
        <TabsContent value="ip" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
          {searchBox}
          <AssetCard
            cols={["", "IP", "C-segment", "Bound domains", "Open ports", ""]}
            loaded={loaded}
            total={total}
            page={page}
            size={size}
            onSize={setSize}
            onPage={setPage}
            rows={currentRows}
            selected={selected}
            onToggleAll={(ids) => toggleSelectAll(ids)}
          >
            {slice(tabData("ip")).map((a) => (
              <TableRow key={a.id} className={selected.has(a.id) ? "bg-muted/40" : undefined}>
                <TableCell className="w-8 pr-0">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                </TableCell>
                <TableCell className="font-mono text-xs font-medium">{a.ip}</TableCell>
                <TableCell className="font-mono text-xs">{a.c_segment || "—"}</TableCell>
                <TableCell>
                  <Chips items={a.bound_domains ?? []} mono />
                </TableCell>
                <TableCell>
                  <Chips
                    items={(a.open_ports ?? []).map((p) => (p.service ? `${p.port}/${p.service}` : String(p.port)))}
                    mono
                  />
                </TableCell>
                <TableCell className="w-8 pl-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => openDelete([a.id])}
                    aria-label={t("Delete asset {name}", { name: a.ip || a.id })}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        {/* Subdomains */}
        <TabsContent value="subdomain" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
          {searchBox}
          <AssetCard
            cols={["", "Domain", "Root domain", "Record type", "Record value", ""]}
            loaded={loaded}
            total={total}
            page={page}
            size={size}
            onSize={setSize}
            onPage={setPage}
            rows={currentRows}
            selected={selected}
            onToggleAll={(ids) => toggleSelectAll(ids)}
          >
            {slice(tabData("subdomain")).map((a) => (
              <TableRow key={a.id} className={selected.has(a.id) ? "bg-muted/40" : undefined}>
                <TableCell className="w-8 pr-0">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                </TableCell>
                <TableCell className="font-mono text-xs font-medium">{a.domain}</TableCell>
                <TableCell className="font-mono text-xs">{a.root_domain || "—"}</TableCell>
                <TableCell className="text-xs">{a.record_type || "—"}</TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs">
                  {(Array.isArray(a.record_value) ? a.record_value.join(", ") : a.record_value) || "—"}
                </TableCell>
                <TableCell className="w-8 pl-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => openDelete([a.id])}
                    aria-label={t("Delete asset {name}", { name: a.domain || a.id })}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        {/* Apps */}
        <TabsContent value="app" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
          {searchBox}
          <AssetCard
            cols={["", "App name", "Bundle ID", "Category", "ICP filing", ""]}
            loaded={loaded}
            total={total}
            page={page}
            size={size}
            onSize={setSize}
            onPage={setPage}
            rows={currentRows}
            selected={selected}
            onToggleAll={(ids) => toggleSelectAll(ids)}
          >
            {slice(tabData("app")).map((a) => (
              <TableRow key={a.id} className={selected.has(a.id) ? "bg-muted/40" : undefined}>
                <TableCell className="w-8 pr-0">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                </TableCell>
                <TableCell className="text-xs font-medium">{a.app_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{a.bundle_id || "—"}</TableCell>
                <TableCell className="text-xs">{a.category || "—"}</TableCell>
                <TableCell className="text-xs">{a.app_icp || "—"}</TableCell>
                <TableCell className="w-8 pl-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => openDelete([a.id])}
                    aria-label={t("Delete asset {name}", { name: a.app_name || a.id })}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>

        {/* Services */}
        <TabsContent value="service" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
          {searchBox}
          <AssetCard
            cols={["", "Service", "Domain", "IP", "Port", "Status", "Title", "Fingerprint", "Auth", ""]}
            loaded={loaded}
            total={total}
            page={page}
            size={size}
            onSize={setSize}
            onPage={setPage}
            rows={currentRows}
            selected={selected}
            onToggleAll={(ids) => toggleSelectAll(ids)}
          >
            {slice(tabData("service")).map((a) => {
              const isHttp = a.service_type === "http";
              const svc = a.service_name || (isHttp ? "http" : "") || a.service_type || "";
              let domainCell: React.ReactNode = "—";
              const href = isHttp ? httpHref(a.url) : undefined;
              if (href) {
                domainCell = (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {a.domain || a.url}
                  </a>
                );
              } else if (a.domain || a.url) {
                domainCell = a.domain || a.url;
              }
              return (
                <TableRow key={a.id} className={selected.has(a.id) ? "bg-muted/40" : undefined}>
                  <TableCell className="w-8 pr-0">
                    <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={isHttp ? "default" : "secondary"} className="font-mono text-[10px]">
                      {svc || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate font-mono text-xs" title={a.domain || a.url}>
                    {domainCell}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.ip || "—"}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{a.port || "—"}</TableCell>
                  <TableCell>
                    {a.status_code != null ? (
                      <span className={cn("font-mono text-xs font-semibold tabular-nums", statusTone(a.status_code))}>
                        {a.status_code}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs" title={a.page_title}>
                    {a.page_title || "—"}
                  </TableCell>
                  <TableCell>
                    <Chips items={a.technologies ?? []} />
                  </TableCell>
                  <TableCell>
                    {(a.auth ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      (a.auth ?? []).map((authItem, i) => {
                        const item = authItem as Record<string, string>;
                        const label = item.type || item.username || t("Auth");
                        return (
                          <span key={i} className="inline-flex items-center gap-1 text-[11px]">
                            <KeyRoundIcon className="size-3 text-muted-foreground" />
                            <span className="font-mono">{label}</span>
                          </span>
                        );
                      })
                    )}
                  </TableCell>
                  <TableCell className="w-8 pl-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => openDelete([a.id])}
                      aria-label={t("Delete asset {name}", { name: a.url || a.id })}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </AssetCard>
        </TabsContent>

        {/* Endpoints */}
        <TabsContent value="endpoint" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
          {searchBox}
          <AssetCard
            cols={["", "Method", "Full URL", "Params", ""]}
            loaded={loaded}
            total={total}
            page={page}
            size={size}
            onSize={setSize}
            onPage={setPage}
            rows={currentRows}
            selected={selected}
            onToggleAll={(ids) => toggleSelectAll(ids)}
          >
            {slice(tabData("endpoint")).map((a) => (
              <TableRow key={a.id} className={selected.has(a.id) ? "bg-muted/40" : undefined}>
                <TableCell className="w-8 pr-0">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                </TableCell>
                <TableCell className="w-16">
                  <MethodBadge method={a.method || ""} />
                </TableCell>
                <TableCell className="max-w-sm truncate font-mono text-xs" title={a.url}>
                  {a.url || "—"}
                </TableCell>
                <TableCell>
                  <Chips
                    items={(a.params ?? []).map((p) => {
                      const item = p as Record<string, string>;
                      return item.name ? `${item.name}(${item.location || "?"})` : "?";
                    })}
                    mono
                  />
                </TableCell>
                <TableCell className="w-8 pl-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => openDelete([a.id])}
                    aria-label={t("Delete asset {name}", { name: a.url || a.id })}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </AssetCard>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Confirm delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This will permanently delete {count} asset records. This action cannot be undone.", {
                count: deleteIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("Deleting…") : t("Confirm delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!companyDeleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCompanyDeleteTarget(null);
            setCompanyDeleteAssets(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete company · {name}", { name: companyDeleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t(
                    "This will permanently delete the company and its asset scope configuration. This action cannot be undone.",
                  )}
                </p>
                <label
                  htmlFor="delete-assets-opt"
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border p-3 hover:bg-muted/50"
                >
                  <Checkbox
                    id="delete-assets-opt"
                    checked={companyDeleteAssets}
                    onCheckedChange={(v) => setCompanyDeleteAssets(!!v)}
                  />
                  <span className="text-sm leading-snug">
                    {t("Also delete all assets under this company")}
                    <span className="block text-xs text-muted-foreground">
                      {t("Leave unchecked to keep the assets and only remove the ownership")}
                    </span>
                  </span>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={companyDeleting}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteCompany();
              }}
              disabled={companyDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {companyDeleting ? t("Deleting…") : t("Confirm delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AssetCard({
  cols,
  loaded,
  total,
  page,
  size,
  onSize,
  onPage,
  rows: dataRows,
  selected,
  onToggleAll,
  children,
}: {
  cols: string[];
  loaded: boolean;
  total: number;
  page: number;
  size: number;
  onSize: React.Dispatch<React.SetStateAction<number>>;
  onPage: React.Dispatch<React.SetStateAction<number>>;
  rows?: Asset[];
  selected?: Set<number>;
  onToggleAll?: (ids: number[]) => void;
  children: React.ReactNode;
}) {
  const childRows = React.Children.toArray(children);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const start = total === 0 ? 0 : page * size + 1;
  const end = page * size + childRows.length;

  const pageIds = dataRows?.map((r) => r.id) ?? [];
  const allSelected = pageIds.length > 0 && selected != null && pageIds.every((id) => selected.has(id));
  const someSelected = selected != null && pageIds.some((id) => selected.has(id));

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin scrollbar-track-transparent">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {cols.map((c, i) =>
                c === "" && i === 0 && onToggleAll ? (
                  <TableHead key={i} className="w-8 pr-0">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={() => onToggleAll(pageIds)}
                    />
                  </TableHead>
                ) : (
                  <TableHead key={c + i}>{c && t(c)}</TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {childRows.length > 0 ? (
              childRows
            ) : (
              <TableRow>
                <TableCell colSpan={cols.length} className="py-12 text-center text-sm text-muted-foreground">
                  {loaded ? t("No data.") : t("Loading…")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {total > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
          <Select value={String(size)} onValueChange={(v) => onSize(Number(v))}>
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
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page <= 0}
                onClick={() => onPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page + 1 >= pageCount}
                onClick={() => onPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Chips({ items, mono }: { items: string[]; mono?: boolean }) {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {clean.map((s, i) => (
        <Badge key={i} variant="outline" className={cn("text-[10px]", mono && "font-mono")}>
          {s}
        </Badge>
      ))}
    </div>
  );
}

function CompanyAvatar({ name, logo }: { name: string; logo?: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <Avatar className="size-7 shrink-0">
      {logo ? <AvatarImage src={logo} alt={name} /> : null}
      <AvatarFallback className="text-xs">{initial}</AvatarFallback>
    </Avatar>
  );
}

// Warnings from the backend describe pre-existing data problems (not errors in the submitted lines); the save itself
// already succeeded. Show them longer because the user must fix specific assets — a glance at the title is not enough.
function showScopeWarnings(warnings?: string[]) {
  for (const warning of warnings ?? []) {
    toast.warning(warning, { duration: 15000 });
  }
}

function savedScopeRules(company: Company): CompanyScopeRule[] {
  return (company.scope ?? [])
    .map((scope) => ({ kind: scope.kind, value: scope.raw.trim() }))
    .filter((scope) => scope.value);
}

function savedScopeText(company: Company): string {
  return savedScopeRules(company)
    .map((scope) => scope.value)
    .join("\n");
}

// Creating a company uses the same right-side drawer as tasks and LLM editing.
function CompanyDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopeText, setScopeText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const parsedScope = React.useMemo(() => parseCompanyScopeText(scopeText), [scopeText]);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setScopeText("");
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("Please enter a company name"));
      return;
    }
    if (parsedScope.errors.length > 0) {
      toast.error(t("Please fix the invalid asset scope"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.createCompany(name.trim(), parsedScope.rules);
      const added = res.scope_added ?? 0;
      const invalid = res.scope_invalid ?? 0;
      if (invalid > 0)
        toast.warning(t("Company created, {added} scopes added; {invalid} invalid lines", { added, invalid }));
      else toast.success(t("Company created, {added} scopes added", { added }));
      setOpen(false);
      onSaved();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/:\s*409$/.test(msg)) toast.error(t("Company already exists; try a different name"));
      else toast.error(t("Save failed: {error}", { error: msg }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <BuildingIcon data-icon="inline-start" /> {t("Add company")}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full! max-w-none! gap-0 p-0 sm:w-[520px]! sm:max-w-[520px]!">
        <SheetHeader className="border-b p-6">
          <SheetTitle>{t("Add company")}</SheetTitle>
          <SheetDescription>
            {t(
              "Configure the company and its asset scope. Keywords only serve as agent hints and do not automatically assign assets.",
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cn-name">{t("Company name")}</FieldLabel>
              <Input
                id="cn-name"
                placeholder={t("e.g. Acme Corp (name must be unique)")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <ScopeTextEditor id="cn-scope" value={scopeText} onValueChange={setScopeText} parsed={parsedScope} />
          </FieldGroup>
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim() || parsedScope.errors.length > 0}>
            {busy ? t("Saving…") : t("Save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Edit (overwrite) asset scope dialog
function EditScopeDialog({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [scopeText, setScopeText] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const preservedScopeRules = React.useMemo(() => savedScopeRules(company), [company]);
  const parsedScope = React.useMemo(
    () => parseCompanyScopeText(scopeText, { preservedRules: preservedScopeRules }),
    [preservedScopeRules, scopeText],
  );

  React.useEffect(() => {
    if (!open) return;
    setScopeText(savedScopeText(company));
    setReason("");
  }, [open, company]);

  const submit = async () => {
    if (parsedScope.errors.length > 0) {
      toast.error(t("Please fix the invalid asset scope"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.updateCompanyScope(company.id, parsedScope.rules, reason);
      const errCount = res.invalid ?? 0;
      if (errCount > 0) toast.warning(t("Saved; {count} invalid lines", { count: errCount }));
      else toast.success(t("Scope updated, {count} entries in total", { count: res.added }));
      showScopeWarnings(res.warnings);
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7">
          {t("Edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Edit asset scope · {name}", { name: company.name })}</DialogTitle>
          <DialogDescription>
            {t(
              "Saving replaces all existing scopes. ICP matches assets exactly; company keywords only serve as agent hints.",
            )}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="py-2">
          <ScopeTextEditor
            id={`edit-company-scope-${company.id}`}
            value={scopeText}
            onValueChange={setScopeText}
            parsed={parsedScope}
          />
          <Field>
            <FieldLabel htmlFor="es-reason">{t("Attribution basis (optional)")}</FieldLabel>
            <Input
              id="es-reason"
              placeholder={t("e.g. certificate / whois / ASN evidence")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || parsedScope.errors.length > 0}>
            {busy ? t("Saving…") : t("Overwrite save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Append asset scope dialog
function AppendScopeDialog({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [scopeText, setScopeText] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const parsedScope = React.useMemo(() => parseCompanyScopeText(scopeText), [scopeText]);

  React.useEffect(() => {
    if (!open) return;
    setScopeText("");
    setReason("");
  }, [open]);

  const submit = async () => {
    if (parsedScope.rules.length === 0) {
      toast.error(t("Please enter the scopes to append"));
      return;
    }
    if (parsedScope.errors.length > 0) {
      toast.error(t("Please fix the invalid asset scope"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.addCompanyScope(company.id, parsedScope.rules, reason);
      const errCount = res.invalid ?? 0;
      if (errCount > 0) toast.warning(t("Saved; {count} invalid lines", { count: errCount }));
      else toast.success(t("Appended {count} scopes", { count: res.added }));
      showScopeWarnings(res.warnings);
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7">
          {t("Append")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Append asset scope · {name}", { name: company.name })}</DialogTitle>
          <DialogDescription>
            {t(
              "New scopes are appended to the existing ones. ICP matches assets exactly; company keywords only serve as agent hints.",
            )}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="py-2">
          <ScopeTextEditor
            id={`append-company-scope-${company.id}`}
            value={scopeText}
            onValueChange={setScopeText}
            parsed={parsedScope}
          />
          <Field>
            <FieldLabel htmlFor="as-reason">{t("Attribution basis (optional)")}</FieldLabel>
            <Input
              id="as-reason"
              placeholder={t("e.g. certificate / whois / ASN evidence")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || parsedScope.rules.length === 0 || parsedScope.errors.length > 0}>
            {busy ? t("Saving…") : t("Append")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
