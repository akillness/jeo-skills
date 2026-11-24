"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BotIcon,
  ListFilterIcon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { intlLocale, t } from "@/i18n";
import { api } from "@/lib/api";
import type {
  InterceptAction,
  InterceptRule,
  JudgeConfig,
  JudgeDayUsage,
  JudgeUsage,
  LLMProfile,
  Tool,
} from "@/lib/types";

// fmtTokens compacts token counts (1.2k / 3.4M) for approval usage stats.
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// tRich translates a sentence whose {placeholders} are rendered as React nodes (e.g. emphasised spans or code).
function tRich(key: string, nodes: Record<string, React.ReactNode>): React.ReactNode[] {
  return t(key)
    .split(/(\{\w+\})/)
    .map((part, i) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      // biome-ignore lint/suspicious/noArrayIndexKey: static sentence fragments
      return name && name in nodes ? <React.Fragment key={i}>{nodes[name]}</React.Fragment> : part;
    });
}

// JudgeStat is one stat tile (label + value).
function JudgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// JudgeSparkbars draws a mini bar chart of daily consumption (input+output) over the last N days with plain divs, avoiding a chart library dependency.
function JudgeSparkbars({ daily }: { daily: JudgeDayUsage[] }) {
  const max = Math.max(1, ...daily.map((d) => d.input_tokens + d.output_tokens));
  return (
    <div className="flex h-16 items-end gap-0.5">
      {daily.map((d) => {
        const total = d.input_tokens + d.output_tokens;
        const h = Math.max(2, Math.round((total / max) * 100));
        return (
          <div
            key={d.date}
            title={t("{date} · {calls} calls · {tokens} tokens", { date: d.date, calls: d.calls, tokens: fmtTokens(total) })}
            className="min-w-[2px] flex-1 rounded-sm bg-violet-500/60 hover:bg-violet-500"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

// ---- tool scope ----

// SDK tools are intentionally not seeded into the DB (they apply to every agent
// and have no per-agent binding). We hardcode them here so they still appear in
// the scope dialog.
function sdkTool(key: string, description: string): Tool {
  return { key, system: true, description, schema: {}, agents: [], enabled: true, kind: "builtin" };
}

const SDK_EXEC: Tool[] = [
  sdkTool("Bash",        t("Execute commands in a shell")),
  sdkTool("WebFetch",    t("Make HTTP/HTTPS requests (with proxy support)")),
  sdkTool("web_search",  t("Web search")),
  sdkTool("shell_open",  t("Open a persistent PTY interactive session")),
  sdkTool("shell_send",  t("Send input to an interactive session")),
  sdkTool("shell_read",  t("Read output from an interactive session")),
  sdkTool("shell_close", t("Close an interactive session")),
  sdkTool("shell_list",  t("List all interactive sessions")),
];

const SDK_WRITE: Tool[] = [
  sdkTool("Write",     t("Write files")),
  sdkTool("Edit",      t("Edit files (exact replacement)")),
  sdkTool("MultiEdit", t("Edit files in batch")),
];

const SDK_KEYS = new Set([...SDK_EXEC, ...SDK_WRITE].map((tool) => tool.key));

function groupTools(dbTools: Tool[]) {
  const sys: Tool[] = [], custom: Tool[] = [];
  for (const tool of dbTools) {
    if (SDK_KEYS.has(tool.key)) continue; // already covered by hardcoded groups
    if (tool.system) sys.push(tool);
    else             custom.push(tool);
  }
  return [
    { label: t("Execution"),    tools: SDK_EXEC },
    { label: t("Write/Edit"),   tools: SDK_WRITE },
    { label: t("System tools"), tools: sys },
    { label: t("Custom tools"), tools: custom },
  ].filter((g) => g.tools.length > 0);
}

// ---- form state ----

type RuleForm = {
  name: string;
  enabled: boolean;
  priority: number;
  match_target: "tool_name" | "tool_input";
  match_type: "string" | "regex" | "argv";
  pattern: string;
  action: InterceptAction;
  message: string;
  timeout_enabled: boolean;
  timeout_seconds: number;
  timeout_action: "deny" | "allow";
};

const defaultForm = (): RuleForm => ({
  name: "",
  enabled: true,
  priority: 0,
  match_target: "tool_name",
  match_type: "string",
  pattern: "",
  action: "deny",
  message: "",
  timeout_enabled: true,
  timeout_seconds: 60,
  timeout_action: "deny",
});

// An argv pattern (JSON array of tokens) shown as a prefix: ["nmap"] -> "nmap *".
function argvLabel(pattern: string): string {
  try {
    const tokens: unknown = JSON.parse(pattern);
    if (Array.isArray(tokens)) return `${tokens.join(" ")} *`;
  } catch {
    // not a JSON array: show the raw pattern
  }
  return pattern;
}

// ---- small components ----

function ActionBadge({ action }: { action: InterceptAction }) {
  if (action === "allow") return <Badge variant="secondary">{t("Allow")}</Badge>;
  if (action === "deny")  return <Badge variant="destructive">{t("Block")}</Badge>;
  return <Badge variant="outline" className="border-amber-400 text-amber-600">{t("Ask")}</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ---- LLM fallback judge card ----

const FOLLOW_ACTIVE = "0"; // profile_id 0 = follow the active/default profile

const defaultJudge = (): JudgeConfig => ({
  enabled: false,
  mode: "closed",
  profile_id: 0,
  prompt: "",
  timeout_seconds: 15,
  fail_action: "ask",
  ask_timeout_seconds: 300,
  ask_timeout_action: "deny",
});

function JudgeCard() {
  const [cfg, setCfg] = React.useState<JudgeConfig>(defaultJudge());
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [usage, setUsage] = React.useState<JudgeUsage | null>(null);

  // Approval usage stats: failures must not break the config page; fetched only when enabled.
  const loadUsage = React.useCallback(async () => {
    try {
      setUsage(await api.interceptJudgeUsage(30));
    } catch {
      // Ignore: stats being unavailable must not affect config editing
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [j, ps] = await Promise.all([api.interceptGetJudgeConfig(), api.llmProfiles()]);
      setCfg(j);
      setProfiles(ps);
    } catch (e) {
      toast.error(t("Failed to load model fallback config: {error}", { error: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Once enabled (including when the first load reads the switch as true), fetch approval usage stats.
  React.useEffect(() => {
    if (cfg.enabled) loadUsage();
  }, [cfg.enabled, loadUsage]);

  function patch(p: Partial<JudgeConfig>) {
    setCfg((c) => ({ ...c, ...p }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.interceptSetJudgeConfig(cfg);
      toast.success(t("Model fallback config saved"));
      await load(); // read back: if the prompt was cleared, the built-in template is refilled
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function restorePrompt() {
    // Clear the prompt and save → the server then returns the full built-in template, refilled into the input.
    setSaving(true);
    try {
      await api.interceptSetJudgeConfig({ ...cfg, prompt: "" });
      const j = await api.interceptGetJudgeConfig();
      setCfg(j);
      toast.success(t("Built-in default template restored"));
    } catch (e) {
      toast.error(t("Restore failed: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Enable switch — standalone highlighted bar */}
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          cfg.enabled ? "border-violet-400/50 bg-violet-50/40 dark:bg-violet-950/20" : "bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <BotIcon className={`h-5 w-5 shrink-0 ${cfg.enabled ? "text-violet-600" : "text-muted-foreground"}`} />
          <div>
            <p className="text-sm font-semibold leading-tight">{t("Model fallback approval")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tRich("Only commands inside the {scope} that {norule} are semantically judged by the model (allow / escalate to human / block)", {
                scope: <span className="font-medium text-foreground">{t("interception scope")}</span>,
                norule: <span className="font-medium text-foreground">{t("match no interception rule")}</span>,
              })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{cfg.enabled ? t("Enabled") : t("Disabled")}</span>
          <Switch checked={cfg.enabled} disabled={loading} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>
      </div>

      {/* Approval token usage stats (global cumulative, independent of per-model configs) */}
      {cfg.enabled && usage && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("Approval token consumption")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Cumulative model fallback approval usage, metered separately (worker=judge), not mixed with per-model config stats")}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadUsage}>
                {t("Refresh")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <JudgeStat label={t("Approval calls")} value={usage.calls.toLocaleString(intlLocale)} />
              <JudgeStat label={t("Input tokens")} value={fmtTokens(usage.input_tokens)} />
              <JudgeStat label={t("Output tokens")} value={fmtTokens(usage.output_tokens)} />
              <JudgeStat label={t("Cache read")} value={fmtTokens(usage.cache_read_tokens)} />
              <JudgeStat label={t("Cache write")} value={fmtTokens(usage.cache_write_tokens)} />
            </div>
            {usage.daily.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Daily consumption over the last 30 days (input + output)")}
                </p>
                <JudgeSparkbars daily={usage.daily} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {cfg.enabled && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Left: prompt editor (expanded inline, main area) */}
          <Card className="lg:col-span-3">
            <CardContent className="flex h-full flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("Approval prompt")}</p>
                  <p className="text-xs text-muted-foreground">{t("The model decides ALLOW / ASK / DENY based on this; directly editable")}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={restorePrompt} disabled={saving}>
                  {t("Restore default template")}
                </Button>
              </div>
              <Textarea
                className="min-h-[22rem] flex-1 resize-none font-mono text-xs leading-relaxed"
                value={cfg.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder={t("Leave empty to use the built-in template")}
                spellCheck={false}
              />
              <p className="text-right text-[11px] text-muted-foreground">{t("{count} chars", { count: cfg.prompt.length })}</p>
            </CardContent>
          </Card>

          {/* Right: decision parameters (settings column) */}
          <Card className="lg:col-span-2">
            <CardContent className="space-y-5 p-4">
              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Judge model and policy")}</p>
                <Field label={t("Approval model")}>
                  <Select value={String(cfg.profile_id || 0)} onValueChange={(v) => patch({ profile_id: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FOLLOW_ACTIVE}>{t("Follow active profile")}</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.model})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("Judge mode")}>
                  <Select value={cfg.mode ?? "closed"} onValueChange={(v) => patch({ mode: v as JudgeConfig["mode"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">{t("Closed questions (code decides; prompt is the operator policy; failure asks)")}</SelectItem>
                      <SelectItem value="freeform">{t("Free-form prompt (model decides)")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("Model judge timeout (seconds)")}>
                  <Input
                    type="number"
                    min={1}
                    value={cfg.timeout_seconds}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (n > 0) patch({ timeout_seconds: n });
                    }}
                  />
                </Field>
                <Field label={t("When the model fails (error / timeout / unparsable)")}>
                  <Select value={cfg.fail_action} onValueChange={(v) => patch({ fail_action: v as JudgeConfig["fail_action"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">{t("Allow")}</SelectItem>
                      <SelectItem value="ask">{t("Escalate to human approval")}</SelectItem>
                      <SelectItem value="deny">{t("Block")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Separator />

              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Human approval (when the model decides \"ask\")")}</p>
                <Field label={t("Approval wait timeout (seconds)")}>
                  <Input
                    type="number"
                    min={5}
                    value={cfg.ask_timeout_seconds}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (n > 0) patch({ ask_timeout_seconds: n });
                    }}
                  />
                </Field>
                <Field label={t("Default action after timeout")}>
                  <Select value={cfg.ask_timeout_action} onValueChange={(v) => patch({ ask_timeout_action: v as JudgeConfig["ask_timeout_action"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deny">{t("Block")}</SelectItem>
                      <SelectItem value="allow">{t("Allow")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving || loading}>
          {saving ? t("Saving…") : t("Save config")}
        </Button>
      </div>
    </div>
  );
}

// ---- page ----

export default function InterceptPage() {
  const [rules, setRules]     = React.useState<InterceptRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen]       = React.useState(false);
  const [editing, setEditing] = React.useState<InterceptRule | null>(null);
  const [form, setForm]       = React.useState<RuleForm>(defaultForm());
  const [saving, setSaving]   = React.useState(false);
  const [regexErr, setRegexErr] = React.useState("");
  const [regexWarn, setRegexWarn] = React.useState(false); // true = JS cannot parse it but it may be valid Go syntax

  // ---- tool scope dialog ----
  const [scopeOpen, setScopeOpen]       = React.useState(false);
  const [allTools, setAllTools]         = React.useState<Tool[]>([]);
  const [enabledTools, setEnabledTools] = React.useState<Set<string>>(new Set());
  const [scopeLoading, setScopeLoading] = React.useState(false);
  const [scopeSaving, setScopeSaving]   = React.useState(false);
  const [scopeTools, setScopeTools]     = React.useState<string[]>([]); // header info bar: tools currently under interception

  // ---- data ----

  const loadScope = React.useCallback(async () => {
    try {
      const cfg = await api.interceptGetToolConfig();
      setScopeTools(cfg.enabled_tools);
    } catch {
      // Info bar is non-critical; stay silent on failure
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await api.interceptRules();
      setRules(r);
    } catch {
      toast.error(t("Failed to load interception rules"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); loadScope(); }, [load, loadScope]);

  React.useEffect(() => {
    if (form.match_type !== "regex" || !form.pattern) { setRegexErr(""); setRegexWarn(false); return; }
    try {
      new RegExp(form.pattern);
      setRegexErr("");
      setRegexWarn(false);
    } catch {
      // JS RegExp does not support Go RE2 extended syntax (e.g. the (?i) inline flag).
      // This is only a preview validation failure, not proof of invalidity on the Go side; the server does the final check.
      setRegexErr("");
      setRegexWarn(true);
    }
  }, [form.pattern, form.match_type]);

  // ---- rule handlers ----

  function set(patch: Partial<RuleForm>) { setForm(f => ({ ...f, ...patch })); }

  function openNew() {
    setEditing(null);
    setForm(defaultForm());
    setRegexErr("");
    setOpen(true);
  }

  function openEdit(rule: InterceptRule) {
    setEditing(rule);
    setForm({
      name: rule.name, enabled: rule.enabled, priority: rule.priority,
      match_target: rule.match_target, match_type: rule.match_type,
      pattern: rule.pattern, action: rule.action, message: rule.message,
      timeout_enabled: rule.timeout_enabled, timeout_seconds: rule.timeout_seconds,
      timeout_action: rule.timeout_action,
    });
    setRegexErr("");
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim())    { toast.error(t("Name cannot be empty")); return; }
    if (!form.pattern.trim()) { toast.error(t("Pattern cannot be empty")); return; }
    if (regexErr)             { toast.error(t("Invalid regex syntax")); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.updateInterceptRule(editing.id, form);
        toast.success(t("Rule updated"));
      } else {
        await api.createInterceptRule(form);
        toast.success(t("Rule created"));
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteInterceptRule(id);
      toast.success(t("Rule deleted"));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleToggle(rule: InterceptRule) {
    try {
      await api.toggleInterceptRule(rule.id, !rule.enabled);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ---- scope handlers ----

  async function openScope() {
    setScopeOpen(true);
    setScopeLoading(true);
    try {
      const [tools, cfg] = await Promise.all([api.tools(), api.interceptGetToolConfig()]);
      setAllTools(tools);
      setEnabledTools(new Set(cfg.enabled_tools));
    } catch (e) {
      toast.error(t("Load failed: {error}", { error: (e as Error).message }));
    } finally {
      setScopeLoading(false);
    }
  }

  function toggleTool(key: string, val: boolean) {
    setEnabledTools(prev => {
      const next = new Set(prev);
      if (val) next.add(key); else next.delete(key);
      return next;
    });
  }

  async function saveScope() {
    setScopeSaving(true);
    try {
      await api.interceptSetToolConfig([...enabledTools]);
      toast.success(t("Interception scope saved"));
      setScopeTools([...enabledTools]);
      setScopeOpen(false);
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setScopeSaving(false);
    }
  }

  const toolGroups = React.useMemo(() => groupTools(allTools), [allTools]);

  // ---- render ----

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">

      {/* ---- header ---- */}
      <div className="flex items-center gap-2.5">
        <ShieldAlertIcon className="h-5 w-5 shrink-0" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">{t("Command interception")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("Tools are matched against interception rules before execution; unmatched commands can be judged by the model fallback")}
          </p>
        </div>
      </div>

      {/* ---- interception scope info bar (shared by rule matching and the model fallback: tools outside the scope are handled by neither) ---- */}
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${
          scopeTools.length === 0
            ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20"
            : "bg-muted/40"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <ListFilterIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium">{t("Interception scope")}</span>
          {scopeTools.length === 0 ? (
            <span className="text-amber-700 dark:text-amber-500">
              {t("No tools enabled — neither interception rules nor the model fallback take effect")}
            </span>
          ) : (
            <>
              <Badge variant="secondary" className="shrink-0">{t("{count} tools", { count: scopeTools.length })}</Badge>
              <span className="truncate text-muted-foreground" title={scopeTools.join(", ")}>
                {scopeTools.join(", ")}
              </span>
            </>
          )}
        </div>
        <Button
          variant={scopeTools.length === 0 ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={openScope}
        >
          <ListFilterIcon className="h-4 w-4" />
          {t("Adjust scope")}
        </Button>
      </div>

      <Tabs defaultValue="rules" className="flex-1">
        <TabsList>
          <TabsTrigger value="rules">{t("Interception rules")}</TabsTrigger>
          <TabsTrigger value="judge">{t("Model config")}</TabsTrigger>
        </TabsList>

        {/* ---- tab: interception rules ---- */}
        <TabsContent value="rules" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("Rules are matched one by one in priority order (higher numbers first); the first match wins")}
            </p>
            <Button onClick={openNew} size="sm" className="shrink-0">
              <PlusIcon className="h-4 w-4" />
              {t("Create rule")}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">{t("Loading…")}</p>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ShieldAlertIcon className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("No rules yet")}</p>
              <Button size="sm" variant="outline" onClick={openNew}>
                <PlusIcon className="h-4 w-4" />
                {t("Create the first rule")}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[72px]">{t("Priority")}</TableHead>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead className="w-[90px]">{t("Target")}</TableHead>
                  <TableHead className="w-[80px]">{t("Type")}</TableHead>
                  <TableHead>{t("Pattern")}</TableHead>
                  <TableHead className="w-[72px]">{t("Policy")}</TableHead>
                  <TableHead className="w-[64px] text-center">{t("Enabled")}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={!rule.enabled ? "opacity-40" : ""}>
                    <TableCell>
                      <span className="font-mono text-xs tabular-nums">{rule.priority}</span>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {rule.match_target === "tool_name" ? t("Tool name") : t("Input content")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {rule.match_type === "regex" ? t("Regex") : rule.match_type === "argv" ? t("Argv prefix") : t("String")}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <code className="block truncate rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {rule.match_type === "argv" ? argvLabel(rule.pattern) : rule.pattern}
                      </code>
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={rule.action} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => openEdit(rule)}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- tab: model config ---- */}
        <TabsContent value="judge" className="mt-4">
          <JudgeCard />
        </TabsContent>
      </Tabs>

      {/* ---- editor sheet ---- */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{editing ? t("Edit rule") : t("Create rule")}</SheetTitle>
            <SheetDescription className="text-xs">
              {t("Higher priority matches first; the first matching rule wins and the rest are skipped")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <Field label={t("Name")}>
              <Input
                placeholder={t("Give the rule a name")}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>

            <Field label={t("Priority (higher numbers match first)")}>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => set({ priority: parseInt(e.target.value) || 0 })}
              />
            </Field>

            <Separator />

            <Field label={t("Match target")}>
              <Select
                value={form.match_target}
                onValueChange={(v) => set({ match_target: v as RuleForm["match_target"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tool_name">{t("Tool name (tool_name)")}</SelectItem>
                  <SelectItem value="tool_input">{t("Input content (tool_input JSON)")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("Match type")}>
              <Select
                value={form.match_type}
                onValueChange={(v) => {
                  const match_type = v as RuleForm["match_type"];
                  // An argv rule always matches the Bash command in tool_input.
                  set(match_type === "argv" ? { match_type, match_target: "tool_input" } : { match_type });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">{t("String contains")}</SelectItem>
                  <SelectItem value="regex">{t("Regular expression")}</SelectItem>
                  <SelectItem value="argv">{t("Argv prefix (Bash only)")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("Pattern")}>
              <Input
                placeholder={form.match_type === "regex" ? "^Bash$" : form.match_type === "argv" ? '["git","push"]' : "rm -rf"}
                value={form.pattern}
                onChange={(e) => set({ pattern: e.target.value })}
                className={regexErr ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {regexErr && (
                <p className="text-xs text-destructive mt-1">{regexErr}</p>
              )}
              {regexWarn && (
                <p className="text-xs text-amber-600 mt-1">
                  {tRich("Contains Go RE2 extended syntax (e.g. {example}); the browser cannot preview it, and the server validates on submission", {
                    example: <code className="font-mono">(?i)</code>,
                  })}
                </p>
              )}
              {form.match_type === "argv" && (
                <p className="text-xs text-amber-600 mt-1">
                  {t("JSON array of 1 to 8 tokens: the program and its subcommands, no flags.")}{" "}
                  {tRich("Matches a single simple Bash command whose prefix is exactly {prefix}.", {
                    prefix: <code className="font-mono">{argvLabel(form.pattern)}</code>,
                  })}{" "}
                  {tRich("Flags are not constrained: {pattern} also covers {command}.", {
                    pattern: <code className="font-mono">[&quot;git&quot;,&quot;push&quot;]</code>,
                    command: <code className="font-mono">git push --force</code>,
                  })}
                </p>
              )}
            </Field>

            <Separator />

            <Field label={t("Interception policy")}>
              <Select
                value={form.action}
                onValueChange={(v) => set({ action: v as InterceptAction })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">{t("Allow — pass through directly, skipping the remaining rules")}</SelectItem>
                  <SelectItem value="deny">{t("Block — cut it off and return a denial message to the model")}</SelectItem>
                  <SelectItem value="ask">{t("Ask the user — wait for approval")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.action !== "allow" && (
              <Field label={form.action === "deny" ? t("Denial message (returned to the model)") : t("Approval note (optional)")}>
                <Textarea
                  placeholder={form.action === "deny" ? t("Blocked by the security policy") : ""}
                  value={form.message}
                  onChange={(e) => set({ message: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </Field>
            )}

            {form.action === "ask" && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t("Enable approval timeout")}</p>
                    <p className="text-xs text-muted-foreground">{t("Handle automatically after the timeout instead of waiting")}</p>
                  </div>
                  <Switch
                    checked={form.timeout_enabled}
                    onCheckedChange={(v) => set({ timeout_enabled: v })}
                  />
                </div>
                {form.timeout_enabled && (
                  <div className="flex items-end gap-3">
                    <Field label={t("Timeout (seconds)")}>
                      <Input
                        type="number"
                        min={5}
                        className="w-28"
                        value={form.timeout_seconds}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (n > 0) set({ timeout_seconds: n });
                        }}
                      />
                    </Field>
                    <Field label={t("Timeout action")}>
                      <Select
                        value={form.timeout_action}
                        onValueChange={(v) => set({ timeout_action: v as "deny" | "allow" })}
                      >
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deny">{t("Auto-deny")}</SelectItem>
                          <SelectItem value="allow">{t("Auto-allow")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                )}
              </>
            )}

            <Separator />

            <div className="flex items-center gap-3">
              <Switch
                id="rule-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => set({ enabled: v })}
              />
              <Label htmlFor="rule-enabled" className="cursor-pointer">{t("Enable this rule")}</Label>
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !!regexErr}>
              {saving ? t("Saving…") : t("Save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ---- scope dialog ---- */}
      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col overflow-hidden p-0 gap-0" style={{ maxHeight: "min(80vh, 560px)" }}>
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <ListFilterIcon className="h-4 w-4" />
              {t("Interception scope")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("Only tools with interception enabled go through rule matching; all other tools pass through directly")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
            {scopeLoading ? (
              <p className="text-sm text-muted-foreground py-4">{t("Loading…")}</p>
            ) : (
              toolGroups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <Separator className="mb-5" />}
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.tools.map((tool) => (
                      <div key={tool.key} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                        <Switch
                          id={`scope-${tool.key}`}
                          checked={enabledTools.has(tool.key)}
                          onCheckedChange={(v) => toggleTool(tool.key, v)}
                        />
                        <label htmlFor={`scope-${tool.key}`} className="flex-1 min-w-0 cursor-pointer">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm">{tool.key}</span>
                            {(tool.kind && tool.kind !== "builtin") && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px]">{tool.kind}</Badge>
                            )}
                          </div>
                          {tool.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setScopeOpen(false)}>{t("Cancel")}</Button>
            <Button size="sm" onClick={saveScope} disabled={scopeSaving || scopeLoading}>
              {scopeSaving ? t("Saving…") : t("Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
