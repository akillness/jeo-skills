"use client";

import * as React from "react";
import { toast } from "sonner";
import { PlusIcon, RefreshCwIcon, ServerIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { intlLocale, t } from "@/i18n";
import { api } from "@/lib/api";
import type { MCPServer, MCPTool, Agent } from "@/lib/types";

type Transport = "stdio" | "http" | "sse";
type FormState = {
  name: string;
  transport: Transport;
  command: string;
  args: string;
  url: string;
  env: string;
  insecure: boolean;
  timeoutSeconds: string;
};
const emptyForm: FormState = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  env: "",
  insecure: false,
  timeoutSeconds: "",
};

export default function MCPPage() {
  const [servers, setServers] = React.useState<MCPServer[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [visibility, setVisibility] = React.useState<Record<number, string[]>>({});

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MCPServer | null>(null); // null = add mode
  const [tab, setTab] = React.useState<"config" | "tools">("config");
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [tools, setTools] = React.useState<MCPTool[]>([]);
  const [toolsLoading, setToolsLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(() => {
    api.agents().then(setAgents).catch(() => {});
    api
      .mcpServers()
      .then((ss) => {
        setServers(ss);
        ss.forEach((s) =>
          api
            .resourceVisibility("mcp", s.id)
            .then((ids) => setVisibility((v) => ({ ...v, [s.id]: ids })))
            .catch(() => {}),
        );
      })
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  function setF(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function parseEnv(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        if (key) out[key] = trimmed.slice(idx + 1).trim();
      }
    }
    return out;
  }
  function envToText(env: Record<string, string> | undefined): string {
    return Object.entries(env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setTools([]);
    setTab("config");
    setOpen(true);
  }

  function openEdit(s: MCPServer) {
    setEditing(s);
    setForm({
      name: s.name,
      transport: s.transport,
      command: s.command ?? "",
      args: (s.args ?? []).join(" "),
      url: s.url ?? "",
      env: envToText(s.env),
      insecure: s.insecure ?? false,
      timeoutSeconds: s.timeout_seconds ? String(s.timeout_seconds) : "",
    });
    setTab("config");
    setOpen(true);
    loadTools(s.id);
  }

  async function loadTools(id: number) {
    setToolsLoading(true);
    try {
      setTools(await api.mcpTools(id));
    } catch {
      setTools([]);
    } finally {
      setToolsLoading(false);
    }
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error(t("Please fill in the name"));
      return;
    }
    if (form.transport === "stdio" && !form.command.trim()) {
      toast.error(t("Please fill in the command"));
      return;
    }
    if (form.transport !== "stdio" && !form.url.trim()) {
      toast.error(t("Please fill in the remote URL"));
      return;
    }
    setSaving(true);
    try {
      const base =
        form.transport !== "stdio"
          ? {
              transport: form.transport,
              url: form.url.trim(),
              command: "",
              args: [] as string[],
              env: parseEnv(form.env), // in remote mode env holds request headers
              insecure: form.insecure,
              ...(Number.isFinite(Number(form.timeoutSeconds)) && Number(form.timeoutSeconds) > 0
                ? { timeout_seconds: Number(form.timeoutSeconds) }
                : {}),
            }
          : {
              transport: "stdio" as const,
              command: form.command.trim(),
              args: form.args.trim() ? form.args.trim().split(/\s+/) : [],
              env: parseEnv(form.env),
              insecure: false,
            };
      await api.saveMcpServer({
        ...(editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        enabled: editing ? editing.enabled : true,
        ...base,
      });
      toast.success(editing ? t("Saved") : t("MCP server added"));
      if (!editing) setOpen(false);
      load();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function refreshTools() {
    if (!editing) return;
    setRefreshing(true);
    try {
      const found = await api.refreshMcpServer(editing.id);
      setTools(found);
      toast.success(t("Found {count} tools", { count: found.length }));
      load();
    } catch (e) {
      toast.error(t("Refresh failed: {error}", { error: (e as Error).message }));
    } finally {
      setRefreshing(false);
    }
  }

  async function removeServer(s: MCPServer) {
    try {
      await api.deleteMcpServer(s.id);
      toast.success(t("Deleted: {name}", { name: s.name }));
      setOpen(false);
      load();
    } catch (e) {
      toast.error(t("Delete failed: {error}", { error: (e as Error).message }));
    }
  }

  async function toggleEnabled(s: MCPServer) {
    try {
      await api.saveMcpServer({ ...s, enabled: !s.enabled });
      load();
    } catch (e) {
      toast.error(t("Operation failed: {error}", { error: (e as Error).message }));
    }
  }

  async function toggleVisibility(serverId: number, agentId: string, agentName: string) {
    const on = (visibility[serverId] ?? []).includes(agentId);
    try {
      await api.toggleVisibility(agentId, "mcp", serverId, !on);
      toast.success(
        on
          ? t("Revoked visibility from \"{agent}\"", { agent: agentName })
          : t("Granted visibility to \"{agent}\"", { agent: agentName }),
      );
      load();
    } catch (e) {
      toast.error(t("Operation failed: {error}", { error: (e as Error).message }));
    }
  }

  function renderForm() {
    return (
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>{t("Transport")}</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={form.transport === "stdio" ? "default" : "outline"}
              onClick={() => setF({ transport: "stdio" })}
            >
              {t("stdio (local)")}
            </Button>
            <Button
              type="button"
              variant={form.transport === "http" ? "default" : "outline"}
              onClick={() => setF({ transport: "http" })}
            >
              {t("http (remote)")}
            </Button>
            <Button
              type="button"
              variant={form.transport === "sse" ? "default" : "outline"}
              onClick={() => setF({ transport: "sse" })}
            >
              {t("sse (legacy)")}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="m-name">{t("Name")}</Label>
          <Input
            id="m-name"
            placeholder="filesystem"
            value={form.name}
            onChange={(e) => setF({ name: e.target.value })}
          />
        </div>
        {form.transport === "stdio" ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="m-cmd">{t("Command")}</Label>
              <Input
                id="m-cmd"
                className="font-mono"
                placeholder="npx"
                value={form.command}
                onChange={(e) => setF({ command: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-args">{t("Arguments (space-separated)")}</Label>
              <Input
                id="m-args"
                className="font-mono"
                placeholder="-y @modelcontextprotocol/server-filesystem /data"
                value={form.args}
                onChange={(e) => setF({ args: e.target.value })}
              />
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="m-url">{t("Remote URL")}</Label>
            <Input
              id="m-url"
              className="font-mono"
              placeholder="https://mcp.example.com/mcp"
              value={form.url}
              onChange={(e) => setF({ url: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.insecure}
                onCheckedChange={(v) => setF({ insecure: v === true })}
              />
              {t("Skip TLS certificate verification (self-signed certs)")}
            </label>
            <Label htmlFor="m-timeout">{t("Request timeout (seconds, default 120)")}</Label>
            <Input
              id="m-timeout"
              type="number"
              min={5}
              placeholder="120"
              value={form.timeoutSeconds}
              onChange={(e) => setF({ timeoutSeconds: e.target.value })}
            />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="m-env">
            {form.transport !== "stdio"
              ? t("Request headers (one KEY=VALUE per line, e.g. Authorization=Bearer xxx)")
              : t("Environment variables (one KEY=VALUE per line)")}
          </Label>
          <Textarea
            id="m-env"
            className="font-mono"
            placeholder={
              form.transport !== "stdio" ? "Authorization=Bearer xxxx" : "API_KEY=xxxx\nFOO=bar"
            }
            value={form.env}
            onChange={(e) => setF({ env: e.target.value })}
          />
        </div>
      </div>
    );
  }

  function renderTools() {
    return (
      <div className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{t("{count} tools", { count: tools.length })}</span>
          <Button size="sm" variant="outline" disabled={refreshing} onClick={refreshTools}>
            <RefreshCwIcon className={refreshing ? "animate-spin" : ""} /> {t("Refresh")}
          </Button>
        </div>
        {toolsLoading ? (
          <p className="text-muted-foreground text-sm">{t("Loading…")}</p>
        ) : tools.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("No tools discovered yet; click refresh to fetch again.")}</p>
        ) : (
          <div className="flex flex-col divide-y">
            {tools.map((tool) => (
              <div key={tool.name} className="py-2.5">
                <code className="font-mono text-sm">{tool.name}</code>
                {tool.description && (
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {tool.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">MCP</h1>
        <p className="text-muted-foreground text-sm">{t("External MCP tool servers · visibility granted per agent")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={openAdd}
          className="text-foreground/70 border-foreground/70 hover:bg-muted/60 hover:shadow-sm flex min-h-[116px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition"
        >
          <PlusIcon className="size-6" />
          <span className="text-sm">{t("Add MCP")}</span>
        </button>

        {servers.map((s) => (
          <Card
            key={s.id}
            onClick={() => openEdit(s)}
            className="hover:border-primary/60 cursor-pointer gap-3 transition hover:shadow-sm"
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <ServerIcon className="text-muted-foreground size-4 shrink-0" />
                <CardTitle className="truncate text-base">{s.name}</CardTitle>
                <Badge variant="outline" className="uppercase" lang="en">
                  {s.transport}
                </Badge>
                {s.last_connect_ok === false ? (
                  <Badge variant="destructive" className="max-w-55 truncate font-normal" title={s.last_connect_err ?? t("connect failed")}>
                    {t("down: {error}", { error: s.last_connect_err ? s.last_connect_err.slice(0, 60) : t("connect failed") })}
                  </Badge>
                ) : s.last_connect_ok === true ? (
                  <Badge variant="secondary" className="font-normal">
                    {t("ok {time}", { time: s.last_connect_at ? new Date(s.last_connect_at).toLocaleTimeString(intlLocale) : "" })}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground font-normal">
                    {t("not connected yet")}
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={() => toggleEnabled(s)}
                    aria-label={t("Enable")}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={t("Delete")}
                    onClick={() => removeServer(s)}
                  >
                    <Trash2Icon className="text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-muted-foreground text-sm">
                {s.tools && s.tools.length > 0 ? t("{count} tools", { count: s.tools.length }) : t("No tools discovered yet")}
              </p>
              <div className="grid gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-muted-foreground text-xs">{t("Visibility (granted per agent)")}</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {agents.map((a) => (
                    <label key={a.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(visibility[s.id] ?? []).includes(a.id)}
                        onCheckedChange={() => toggleVisibility(s.id, a.id, a.name)}
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full data-[side=right]:sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>{editing ? editing.name : t("Add MCP server")}</SheetTitle>
            <SheetDescription>
              {t("stdio (local process) or http (remote Streamable HTTP)")}
            </SheetDescription>
          </SheetHeader>

          {editing ? (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "config" | "tools")}
              className="flex min-h-0 flex-1 flex-col px-4"
            >
              <TabsList>
                <TabsTrigger value="config">{t("Config")}</TabsTrigger>
                <TabsTrigger value="tools">
                  {tools.length ? t("Tools ({count})", { count: tools.length }) : t("Tools")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="config" className="min-h-0 flex-1 overflow-y-auto">
                {renderForm()}
                <div className="flex gap-2 pt-2 pb-6">
                  <Button onClick={saveForm} disabled={saving}>
                    {t("Save")}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="tools" className="min-h-0 flex-1 overflow-y-auto">
                {renderTools()}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
              {renderForm()}
              <div className="pt-2 pb-6">
                <Button onClick={saveForm} disabled={saving}>
                  <PlusIcon /> {t("Add")}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
