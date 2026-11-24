"use client";

import * as React from "react";

import {
  Loader2Icon,
  PlugZapIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  StarIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { LLMPoolMember, LLMPoolStatus, LLMProfile, LLMRetryOverride } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProfileRetryFields, RetryPolicyPanel, ZERO_OVERRIDE } from "./_components/retry";
import { setVisibleInterval } from "@/lib/polling";

// Renders a translated string, turning <b>…</b> spans into bold elements, so a sentence with emphasis stays one key.
function rich(s: string): React.ReactNode[] {
  return s.split(/<b>(.*?)<\/b>/).map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

// The thinking switch (thinking.type) and the thinking effort (reasoning_effort) are two [independent] fields,
// each set on its own — some APIs have no thinking field and activate thinking via the effort parameter alone, hence the decoupling.
// An empty string in storage = the field is [not sent]; Radix Select rejects an empty value, so the UI uses "none"
// as the sentinel for not sent, converted to and from "" on load and save (NONE / fromStore / toStore).
const NONE = "none";
const fromStore = (v?: string) => (v ? v : NONE);
const toStore = (v: string) => (v === NONE ? "" : v);
const THINKING_TYPES: { value: string; label: string }[] = [
  { value: NONE, label: t("Not sent (default)") },
  { value: "disabled", label: t("Disabled") },
  { value: "enabled", label: t("Enabled") },
];
// Which request field name carries the output cap (only meaningful for the openai format). NONE ↔ "" shares the same sentinel conversion.
const MAX_TOKENS_FIELDS: { value: string; label: string }[] = [
  { value: NONE, label: t("max_tokens (default)") },
  { value: "max_completion_tokens", label: "max_completion_tokens" },
];
// The other formats hard-code their field names, so the option is meaningless for them; the hint texts spell this out.
const MAX_TOKENS_FIELD_HINTS: Record<string, string> = {
  openai: t(
    "Which key carries the cap. max_tokens is the default and the vast majority of compatible gateways only accept it; OpenAI's official reasoning models (the o series / GPT-5) conversely only accept max_completion_tokens and fail outright with unsupported_parameter when they receive max_tokens.",
  ),
  anthropic: t("Only selectable for the openai format. Anthropic's field name is fixed as max_tokens."),
  "openai-responses": t("Only selectable for the openai format. The Responses API's field name is fixed as max_output_tokens."),
  ollama: t("Only selectable for the openai format. Ollama's field name is fixed as max_tokens."),
};
// LLM profile formats. The default in the create form is "anthropic"; "ollama" is the
// keyless local-server format (base URL defaults to http://127.0.0.1:11434/v1).
type ProfileFormat = "anthropic" | "openai" | "openai-responses" | "ollama" | "bedrock-gateway";
const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
const EFFORT_LEVELS: { value: string; label: string }[] = [
  { value: NONE, label: t("Not sent (default)") },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
  { value: "max", label: "max" },
];

function cooldownText(secs: number) {
  if (secs <= 0) return "";
  if (secs < 60) return t("{n}s", { n: secs });
  return t("{n}min", { n: Math.ceil(secs / 60) });
}

// The "healthy or not" badge a profile shows on its card. A profile without a Key cannot send any request at all — say that before the breaker;
// the exception is Ollama, a keyless local server that IS callable without a key. The other states come from the pool's breaker
// records (with polling off no new records appear, so "healthy" = no known failure).
type Health = { label: string; cls: string; hint?: string };
function healthOf(p: LLMProfile, m?: LLMPoolMember): Health {
  if (!p.api_key_hint && p.format !== "ollama") {
    return {
      label: t("No Key configured"),
      cls: "border-muted-foreground/40 text-muted-foreground",
      hint: t("No API Key set; cannot be called"),
    };
  }
  if (m?.state === "tripped") {
    return {
      label: m.cooldown_secs > 0 ? t("Tripped · {cooldown}", { cooldown: cooldownText(m.cooldown_secs) }) : t("Tripped"),
      cls: "border-destructive/50 text-destructive",
      hint: m.last_error,
    };
  }
  if (m?.state === "degraded") {
    return {
      label: t("Degraded · failed {count} times", { count: m.fails }),
      cls: "border-amber-500/50 text-amber-600 dark:text-amber-400",
      hint: m.last_error,
    };
  }
  return { label: t("Healthy"), cls: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool settings drawer
// ─────────────────────────────────────────────────────────────────────────────

function PoolSheet({
  open,
  onOpenChange,
  pool,
  onReload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pool: LLMPoolStatus | null;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  // The cooldown countdown is the remaining seconds computed by the backend — fetched on a timer only while the drawer is open and some profile is unhealthy, to keep it ticking.
  React.useEffect(() => {
    if (!open || !pool?.enabled || !pool.chain.some((m) => m.state !== "ok")) return;
    const stopPolling = setVisibleInterval(() => void onReload(), 10_000);
    return stopPolling;
  }, [open, pool, onReload]);

  async function toggle(patch: { llm_pool_enabled?: boolean; llm_pool_bind_fallback?: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      await api.setSettings(patch);
      await onReload();
      if (patch.llm_pool_enabled !== undefined) {
        toast.success(patch.llm_pool_enabled ? t("LLM pool enabled") : t("LLM pool disabled"));
      } else {
        toast.success(t("Fallback settings updated"));
      }
    } catch (e) {
      toast.error(t("Failed to apply settings: {error}", { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  async function recover(id?: string) {
    try {
      await api.resetLLMPool(id);
      await onReload();
      toast.success(id ? t("Profile recovered") : t("All profiles recovered"));
    } catch (e) {
      toast.error(t("Recovery failed: {error}", { error: (e as Error).message }));
    }
  }

  const enabled = pool?.enabled ?? false;
  const chain = pool?.chain ?? [];
  // Members taking part in the pool (excluding those flagged "excluded from pool"), in the exact order the backend tries them.
  const inChain = chain.filter((m) => m.active || !m.excluded);
  const tripped = chain.filter((m) => m.state === "tripped");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="px-4">
          <SheetTitle className="flex items-center gap-2">
            <ZapIcon className="size-4" /> {t("LLM Pool · Failover")}
          </SheetTitle>
          <SheetDescription>
            {rich(
              t(
                "When enabled, an Agent <b>without a pinned model</b> automatically fails over to the next config when the current one is unusable (insufficient balance / dead Key / rate limiting / service error).",
              ),
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="grid gap-0.5">
              <Label className="text-sm">{t("Enable pool")}</Label>
              <p className="text-muted-foreground text-xs">{t("Off by default. When off, only the active profile is ever used and a failure stays a failure.")}</p>
            </div>
            <Switch
              checked={enabled}
              disabled={busy}
              onCheckedChange={(v) => void toggle({ llm_pool_enabled: v })}
              aria-label={t("LLM pool toggle")}
            />
          </div>

          {enabled && (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="grid gap-0.5">
                  <Label className="text-sm">{t("Also fall back when a pinned config fails")}</Label>
                  <p className="text-muted-foreground text-xs">
                    {t(
                      "Off by default: when an Agent or task pins a config, only that config is used and a failure stays a failure (no silent switch to another model). When enabled, a failing pinned config also falls back to the pool chain below.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={pool?.bind_fallback ?? false}
                  disabled={busy}
                  onCheckedChange={(v) => void toggle({ llm_pool_bind_fallback: v })}
                  aria-label={t("Bound-config failure fallback toggle")}
                />
              </div>

              <Separator />

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t("Pool order")}</Label>
                  {tripped.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => void recover()}>
                      <RotateCcwIcon /> {t("Recover all")}
                    </Button>
                  )}
                </div>
                {inChain.length < 2 && (
                  <p className="text-muted-foreground text-xs">
                    {t(
                      "Only {count} usable profile(s) right now, so the pool has no effect — at least 2 usable profiles (API Key set, or Ollama) with pool participation are required.",
                      { count: inChain.length },
                    )}
                  </p>
                )}
                {chain.map((m) => {
                  const excluded = m.excluded && !m.active;
                  const order = excluded ? null : inChain.findIndex((x) => x.profile_id === m.profile_id) + 1;
                  return (
                    <div
                      key={m.profile_id}
                      className={cn(
                        "grid gap-1 rounded-lg border p-2.5 text-sm",
                        excluded && "opacity-55",
                        m.state === "tripped" && "border-destructive/40",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="w-5 shrink-0 text-center font-mono text-muted-foreground text-xs">
                          {order ?? "—"}
                        </span>
                        <span className="font-medium">{m.name}</span>
                        {m.active && (
                          <Badge variant="outline" className="border-amber-400/50 text-amber-500">
                            {t("Active")}
                          </Badge>
                        )}
                        {excluded && <Badge variant="outline">{t("Excluded from pool")}</Badge>}
                        <div className="ml-auto flex items-center gap-2">
                          {m.state === "tripped" && m.cooldown_secs > 0 && (
                            <span className="text-muted-foreground text-xs">
                              {t("Cooldown {time}", { time: cooldownText(m.cooldown_secs) })}
                            </span>
                          )}
                          {m.state === "degraded" && (
                            <span className="text-muted-foreground text-xs">
                              {t("{count} consecutive failures", { count: m.fails })}
                            </span>
                          )}
                          {m.state !== "ok" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              aria-label={t("Recover now")}
                              title={t("Recover now: clears the breaker so the next call retries this profile")}
                              onClick={() => void recover(m.profile_id)}
                            >
                              <RotateCcwIcon className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 pl-7 text-muted-foreground text-xs">
                        <code className="truncate font-mono">{m.model}</code>
                        {!m.active && <span>{t("Priority {priority}", { priority: m.priority })}</span>}
                      </div>
                      {m.last_error && (
                        <p className="truncate pl-7 font-mono text-muted-foreground text-xs" title={m.last_error}>
                          {m.last_error}
                        </p>
                      )}
                    </div>
                  );
                })}
                {chain.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                    {t("No profiles yet")}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs leading-relaxed">
                {t(
                  "The active profile is always first; the rest follow priority from high to low (set per profile). After a failure a profile enters a cooldown (60s → 5min → 30min), is skipped while cooling down, and switches back automatically once recovered. Profiles whose context window cannot fit the current request are skipped. Agents and tasks with a pinned model do not join the pool by default.",
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Model profile drawer (create / edit share the same form)
// ─────────────────────────────────────────────────────────────────────────────

function ProfileSheet({
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: LLMProfile | null; // null = create
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const isNew = !profile;
  const [name, setName] = React.useState("");
  const [format, setFormat] = React.useState<ProfileFormat>("anthropic");
  const [model, setModel] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [proxy, setProxy] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [keyHint, setKeyHint] = React.useState("");
  const [rps, setRps] = React.useState("0");
  const [rpm, setRpm] = React.useState("0");
  const [cw, setCw] = React.useState("0"); // context window (K tokens); 0 = default 200K
  const [thinkingType, setThinkingType] = React.useState(NONE);
  const [effort, setEffort] = React.useState(NONE);
  const [priority, setPriority] = React.useState("0"); // pool order; higher = tried earlier
  const [poolExclude, setPoolExclude] = React.useState(false);
  const [streaming, setStreaming] = React.useState(true); // true = streaming (default); false = non-streaming
  const [maxTokens, setMaxTokens] = React.useState("0"); // per-reply output cap; 0 = not sent
  const [maxTokensField, setMaxTokensField] = React.useState(NONE); // which field name carries the cap; NONE = max_tokens
  const [sessionHeaderKey, setSessionHeaderKey] = React.useState(""); // custom session header name; empty = not sent
  const [userAgent, setUserAgent] = React.useState(""); // custom User-Agent; empty = keep the default UA
  const [customHeaders, setCustomHeaders] = React.useState("");
  const [clearCustomHeaders, setClearCustomHeaders] = React.useState(false);
  const [retry, setRetry] = React.useState<LLMRetryOverride>(ZERO_OVERRIDE); // retry override for this profile; all 0 = follow the global
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [models, setModels] = React.useState<string[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [modelsOpen, setModelsOpen] = React.useState(false);
  const [modelQuery, setModelQuery] = React.useState(""); // filter text for the loaded model list; reset on open/close

  // Every time it opens, the form is re-filled from the passed-in profile (reset to defaults when creating). Closing and reopening
  // the drawer is a clean start, leaving no leftovers from the previous profile.
  React.useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? "");
    setFormat(
      profile?.format === "openai" || profile?.format === "openai-responses" || profile?.format === "ollama" || profile?.format === "bedrock-gateway"
        ? profile.format
        : "anthropic",
    );
    setModel(profile?.model ?? "");
    setBaseUrl(profile?.base_url ?? "");
    setProxy(profile?.proxy ?? "");
    setRps(String(profile?.rate_per_second ?? 0));
    setRpm(String(profile?.rate_per_minute ?? 0));
    setCw(String(profile?.context_window_k ?? 0));
    setThinkingType(fromStore(profile?.thinking_type));
    setEffort(fromStore(profile?.reasoning_effort));
    setPriority(String(profile?.priority ?? 0));
    setPoolExclude(profile?.pool_exclude ?? false);
    setStreaming(profile?.streaming ?? true);
    setMaxTokens(String(profile?.max_tokens ?? 0));
    setMaxTokensField(fromStore(profile?.max_tokens_field));
    setSessionHeaderKey(profile?.session_header_key ?? "");
    setUserAgent(profile?.user_agent ?? "");
    setCustomHeaders("");
    setClearCustomHeaders(false);
    setRetry(profile?.retry ?? ZERO_OVERRIDE);
    setApiKey("");
    setKeyHint(profile?.api_key_hint ?? "");
    setModels([]);
    setModelsOpen(false);
    setModelQuery("");
  }, [open, profile]);

  const profileId = profile ? Number(profile.id) : undefined;

  // Case-insensitive substring filter, so a provider prefix ("deepseek/") or a
  // fragment ("flash") is enough to narrow a 400-entry list.
  const filteredModels = React.useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, modelQuery]);

  async function loadModels() {
    if (loadingModels) return;
    setLoadingModels(true);
    setModels([]);
    setModelQuery("");
    try {
      const r = await api.fetchLLMModels(format, baseUrl, apiKey, proxy, profileId);
      if (r.ok && r.models && r.models.length > 0) {
        setModels(r.models);
        setModelsOpen(true);
        toast.success(t("Loaded {count} models", { count: r.models.length }));
      } else {
        toast.error(t("Failed to load models: {error}", { error: r.error ?? t("no models returned") }));
      }
    } catch (e) {
      toast.error(t("Error loading models: {error}", { error: (e as Error).message }));
    } finally {
      setLoadingModels(false);
    }
  }

  async function testConnection() {
    if (testing) return;
    setTesting(true);
    try {
      // Test with the thinking parameters the profile would actually run, so a model that does not support the field fails here,
      // not when a task is already running. Pass the profile id: with the Key input left empty, the stored Key is used.
      const r = await api.testLLM(
        format,
        model,
        baseUrl,
        apiKey,
        proxy,
        toStore(thinkingType),
        toStore(effort),
        profileId,
        streaming,
        sessionHeaderKey.trim(),
        userAgent.trim(),
        customHeaders,
      );
      // Show the reply too: only when the model demonstrably spoke is this the same as working inside a session.
      if (r.ok)
        toast.success(t("Connected · {latency}ms · {model}", { latency: r.latency_ms ?? "?", model: r.model ?? model }), {
          description: r.reply ? t("Reply: {reply}", { reply: r.reply }) : undefined,
        });
      else toast.error(t("Connection failed: {error}", { error: r.error ?? t("unknown") }));
    } catch (e) {
      toast.error(t("Test error: {error}", { error: (e as Error).message }));
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!name.trim() || !model.trim()) {
      toast.error(t("Please fill in a name and a model"));
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const { id } = await api.saveLLMProfile({
        ...(profile ? { id: Number(profile.id) } : {}),
        name: name.trim(),
        format,
        model: model.trim(),
        base_url: baseUrl.trim(),
        proxy: proxy.trim(),
        api_key: apiKey,
        rate_per_second: Number(rps) || 0,
        rate_per_minute: Number(rpm) || 0,
        context_window_k: Number(cw) || 0,
        thinking_type: toStore(thinkingType),
        reasoning_effort: toStore(effort),
        priority: Number(priority) || 0,
        pool_exclude: poolExclude,
        streaming,
        max_tokens: Math.max(0, Number(maxTokens) || 0),
        // The field-name switch only matters for openai (Chat Completions); every other format falls back to the default,
        // and the backend re-applies the same normalization; this just keeps the UI from sending contradictory values.
        max_tokens_field: format === "openai" ? toStore(maxTokensField) : "",
        session_header_key: sessionHeaderKey.trim(),
        user_agent: userAgent.trim(),
        custom_headers: format === "bedrock-gateway" ? customHeaders : "",
        clear_custom_headers: clearCustomHeaders,
        retry,
      });
      if (isNew) toast.success(t('Created: {name} (use "Set as active" on its card to enable it)', { name: name.trim() }));
      else
        toast.success(
          profile?.is_default ? t("Saved; the active profile takes effect immediately, no restart needed") : t("Saved"),
        );
      onSaved(String(id));
      onOpenChange(false);
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  let keyPlaceholder = "sk-…";
  let keyLabel = "API Key";
  let basePlaceholder = "https://api.openai.com/v1";
  if (format === "ollama") {
    keyPlaceholder = t("optional — a local Ollama server runs keyless");
    keyLabel = t("API Key (optional for Ollama)");
    basePlaceholder = OLLAMA_DEFAULT_BASE_URL;
  } else if (format === "bedrock-gateway") {
    keyLabel = "Bearer token";
    basePlaceholder = "https://gateway.example.com/bedrock";
    if (keyHint) keyPlaceholder = t("Set ({hint}); leave empty to keep it", { hint: keyHint });
  } else if (keyHint) {
    keyPlaceholder = t("Set ({hint}); leave empty to keep it", { hint: keyHint });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:min-w-[420px] data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="px-4">
          <SheetTitle className="flex items-center gap-2">
            {isNew ? t("New model profile") : t("Edit: {name}", { name: profile?.name ?? "" })}
            {profile?.is_default && (
              <Badge variant="outline" className="border-amber-400/50 text-amber-500">
                {t("Active")}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {isNew
              ? t("New profiles are not activated automatically; use 'Set as active' on its card to enable it.")
              : t("Click save after editing; saving the active profile takes effect immediately for all agents.")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-name">{t("Name")}</Label>
              <Input
                id="p-name"
                placeholder={t("e.g. OpenAI production")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("Format")}</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ProfileFormat)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select a format")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI (Chat Completions)</SelectItem>
                  <SelectItem value="openai-responses">OpenAI (Responses API)</SelectItem>
                  <SelectItem value="ollama">{t("Ollama (local, no key needed)")}</SelectItem>
                  <SelectItem value="bedrock-gateway">Bedrock gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-model">{t("Model")}</Label>
            <div className="flex gap-2">
              <Input
                id="p-model"
                className="font-mono"
                placeholder={format === "ollama" ? "llama3.2" : "claude-opus-4-8"}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              {/* modal: this Popover's content is portaled to <body>, outside the Sheet's scroll lock,
                  so without modal the list renders but cannot scroll. modal lets it hold the topmost scroll lock itself. */}
              <Popover
                open={modelsOpen}
                onOpenChange={(o) => {
                  setModelsOpen(o);
                  if (!o) setModelQuery("");
                }}
                modal
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    disabled={loadingModels || format === "bedrock-gateway"}
                    onClick={loadModels}
                    title={t("Load available models from the API")}
                  >
                    {loadingModels ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                  </Button>
                </PopoverTrigger>
                {models.length > 0 && (
                  <PopoverContent className="w-80 gap-0 p-0" align="end">
                    <div className="border-b p-1">
                      <Input
                        autoFocus
                        className="h-8 border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                        placeholder={t("Search {count} models…", { count: models.length })}
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                        spellCheck={false}
                        aria-label={t("Search models")}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
                      {filteredModels.length === 0 ? (
                        <p className="px-2 py-6 text-center text-muted-foreground text-xs">
                          {t("No model matches “{query}”", { query: modelQuery.trim() })}
                        </p>
                      ) : (
                        filteredModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="w-full shrink-0 rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                              setModel(m);
                              setModelsOpen(false);
                            }}
                          >
                            {m}
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                )}
              </Popover>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-base-url">{format === "bedrock-gateway" ? "Gateway base URL (required)" : t("Base URL (optional)")}</Label>
            <Input
              id="p-base-url"
              className="font-mono"
              placeholder={basePlaceholder}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {format === "bedrock-gateway" && (
            <div className="grid gap-2">
              <Label htmlFor="p-custom-headers">Custom gateway headers (optional)</Label>
              <textarea id="p-custom-headers" className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm" placeholder="X-Example-Route: demo" value={customHeaders} onChange={(e) => { setCustomHeaders(e.target.value); setClearCustomHeaders(false); }} spellCheck={false} />
              <p className="text-muted-foreground text-xs">One Name: Value per line. Values are encrypted and cannot be viewed after saving. Leave blank to keep saved headers.</p>
              {profile?.custom_headers_set && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={clearCustomHeaders} onChange={(e) => { setClearCustomHeaders(e.target.checked); if (e.target.checked) setCustomHeaders(""); }} />Clear saved custom headers</label>}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="p-proxy">{t("Proxy (optional)")}</Label>
            <Input
              id="p-proxy"
              className="font-mono"
              placeholder="socks5://user:pass@127.0.0.1:1080 · http://127.0.0.1:8080"
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t(
                "Only outbound LLM requests go through this proxy; http/https/socks5 are supported, optionally with credentials (e.g. socks5://user:pass@host:port — URL-encode the password if it contains special characters). Leave empty for no proxy (direct connection).",
              )}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-session-header">{t("Custom session header (optional)")}</Label>
            <Input
              id="p-session-header"
              className="font-mono"
              placeholder={t("e.g. x-session-id (empty = not sent)")}
              value={sessionHeaderKey}
              onChange={(e) => setSessionHeaderKey(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {rich(
                t(
                  "Once a header name is set, every request carries this HTTP header, with the value filled in automatically as the <b>current session's session id</b> (chat sessions like conv-12, workers like exp3-worker-i87). Meant for gateways that do prompt caching / sticky routing on a session-id header; stable across turns of one session, distinct across sessions. Leave empty to not send it.",
                ),
              )}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-user-agent">{t("Custom User-Agent (optional)")}</Label>
            <Input
              id="p-user-agent"
              className="font-mono"
              placeholder={t("e.g. my-app/1.0 (empty = default UA)")}
              value={userAgent}
              onChange={(e) => setUserAgent(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {rich(
                t(
                  "Overrides the <b>User-Agent</b> header on every outbound LLM request. Useful for gateways that route or allow-list by User-Agent. Leave empty to keep the default User-Agent unchanged.",
                ),
              )}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-api-key">
              {keyLabel}
            </Label>
            <Input
              id="p-api-key"
              type="password"
              placeholder={keyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              // A masked field with no autocomplete hint looks like this site's
              // login password: password managers fill it and Save persists the
              // wrong secret over the stored key. new-password keeps them out.
              autoComplete="new-password"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="p-rps">{t("Rate limit per second")}</Label>
              <Input id="p-rps" type="number" min={0} value={rps} onChange={(e) => setRps(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-rpm">{t("Rate limit per minute")}</Label>
              <Input id="p-rpm" type="number" min={0} value={rpm} onChange={(e) => setRpm(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-cw">{t("Context window (K)")}</Label>
              <Input
                id="p-cw"
                type="number"
                min={0}
                max={1000}
                value={cw}
                onChange={(e) => setCw(e.target.value)}
                placeholder="200"
              />
            </div>
          </div>
          <p className="-mt-2 text-muted-foreground text-xs">
            {t(
              "Rate limits of 0 mean unlimited, shared across all agents. The context window is in K (thousand tokens); 0 = the 200K default, capped at 1000 (i.e. 1M). Setting it too high keeps compression from ever triggering.",
            )}
          </p>

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label htmlFor="p-priority" className="text-sm">
                  {t("Pool priority")}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "Higher numbers are picked first; the active profile is always first regardless of this value. Profiles with equal priority take turns leading, spreading quota naturally.",
                  )}
                </p>
              </div>
              <Input
                id="p-priority"
                type="number"
                className="w-24 shrink-0"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">{t("Excluded from pool")}</Label>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "When enabled, this profile is never used as a failover target (Agents / tasks can still pin it explicitly). Suited to expensive profiles reserved for one specific Agent that should not be burned through by other agents' failures.",
                  )}
                </p>
              </div>
              <Switch checked={poolExclude} onCheckedChange={setPoolExclude} aria-label={t("Excluded from pool")} />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">{t("Streaming output")}</Label>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "On (default) streams over SSE, with live in-flight progress and real-time token counting. Off uses true non-streaming (stream:false, returning the full response in one shot) — a way around gateways with broken SSE implementations (empty frames / dropped thinking-field frames), at the cost of losing live in-flight progress.",
                  )}
                </p>
              </div>
              <Switch checked={streaming} onCheckedChange={setStreaming} aria-label={t("Streaming output")} />
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label htmlFor="p-max-tokens" className="text-sm">
                  {t("Output cap · max tokens")}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {t(
                    'How many tokens a single reply may generate at most; sent with every request. 0 (default) = the field is not sent, leaving it to the server default. This is not the same thing as the "context window" above: that is the model\'s total capacity, used only locally to compute the compression threshold. Set it too low and a reasoning model gets truncated mid-thinking, unable to emit even a one-word answer.',
                  )}
                </p>
              </div>
              <Input
                id="p-max-tokens"
                type="number"
                min={0}
                className="w-28 shrink-0"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">{t("Cap field name")}</Label>
                <p className="text-muted-foreground text-xs">{MAX_TOKENS_FIELD_HINTS[format]}</p>
              </div>
              <Select
                value={format === "openai" ? maxTokensField : NONE}
                onValueChange={setMaxTokensField}
                disabled={format !== "openai"}
              >
                <SelectTrigger className="w-56 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_TOKENS_FIELDS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label className="text-sm">{t("Thinking switch · thinking.type")}</Label>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "Controls whether the thinking field is sent. Not sent = the field is omitted (compatible with models like MiniMax that lack support); Disabled = send disabled; Enabled = send enabled. Independent of the effort below.",
                  )}
                </p>
              </div>
              <Select value={thinkingType} onValueChange={setThinkingType}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THINKING_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">{t("Thinking effort · reasoning_effort")}</Label>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "A separate effort knob (OpenAI reasoning_effort / Anthropic output_config.effort). Some APIs have no thinking field and activate thinking via effort alone, so it can be set on its own without sending the thinking switch.",
                  )}
                </p>
              </div>
              <Select value={effort} onValueChange={setEffort}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFORT_LEVELS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ProfileRetryFields value={retry} onChange={setRetry} />
        </div>

        <div className="flex gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
            {testing ? t("Testing…") : t("Test connection")}
          </Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving && <Loader2Icon className="animate-spin" />}
            {!saving && (isNew ? <PlusIcon /> : <SaveIcon />)}
            {isNew ? t("Create") : t("Save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LLMPage() {
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [pool, setPool] = React.useState<LLMPoolStatus | null>(null);
  const [poolOpen, setPoolOpen] = React.useState(false);
  // The drawer's open flag and its content are stored separately: editing stays put on close, otherwise during the closing animation the title would flash
  // from "Edit X" to "New". editing = null means create.
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LLMProfile | null>(null);
  const openEditor = React.useCallback((p: LLMProfile | null) => {
    setEditing(p);
    setEditOpen(true);
  }, []);

  const loadPool = React.useCallback(async () => {
    try {
      setPool(await api.llmPool());
    } catch {
      /* ignore */
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      setProfiles(await api.llmProfiles());
    } catch {
      /* ignore */
    }
    await loadPool();
  }, [loadPool]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The health badge on each card reads pool state by profile id.
  const health = React.useMemo(() => {
    const m = new Map<string, LLMPoolMember>();
    for (const c of pool?.chain ?? []) m.set(c.profile_id, c);
    return m;
  }, [pool]);

  async function activate(id: string, name: string) {
    try {
      await api.activateLLMProfile(id);
      toast.success(t("Activated: {name}", { name }));
      await load();
    } catch (e) {
      toast.error(t("Activation failed: {error}", { error: (e as Error).message }));
    }
  }

  async function remove(p: LLMProfile) {
    if (p.is_default) {
      toast.error(t("Cannot delete the active profile"));
      return;
    }
    try {
      await api.deleteLLMProfile(p.id);
      toast.success(t("Deleted: {name}", { name: p.name }));
      await load();
    } catch (e) {
      toast.error(t("Delete failed: {error}", { error: (e as Error).message }));
    }
  }

  const poolOn = pool?.enabled ?? false;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">LLM</h1>
          <p className="text-muted-foreground text-sm">
            {t(
              "Format / model / rate-limit settings shared by all agents. Click a card to edit it; the starred card is the active profile.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPoolOpen(true)}>
            <ZapIcon /> {t("Pool settings")}
            {poolOn && (
              <Badge variant="outline" className="ml-1 border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                {t("On")}
              </Badge>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
            <PlusIcon /> {t("Create")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="profiles" className="flex-1">
        <TabsList>
          <TabsTrigger value="profiles">{t("Model profiles")}</TabsTrigger>
          <TabsTrigger value="retry">{t("Retry & backoff")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((p) => {
              const h = healthOf(p, health.get(p.id));
              return (
                // biome-ignore lint/a11y/useSemanticElements: the card contains its own action buttons; a native <button> would nest buttons (invalid HTML)
                <Card
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditor(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditor(p);
                    }
                  }}
                  className={cn(
                    "cursor-pointer gap-0 py-4 outline-none transition-colors hover:border-foreground/30",
                    p.is_default && "border-amber-400/50 bg-amber-400/5",
                  )}
                >
                  <CardContent className="grid gap-2 px-4">
                    <div className="flex items-start gap-2">
                      <StarIcon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          p.is_default ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-sm">{p.name}</span>
                          <Badge variant="outline" className="uppercase" lang="en">
                            {p.format}
                          </Badge>
                          <Badge variant="outline" className={cn("ml-auto", h.cls)} title={h.hint}>
                            {h.label}
                          </Badge>
                        </div>
                        <code className="mt-1 block truncate font-mono text-muted-foreground text-xs">{p.model}</code>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-muted-foreground text-xs">
                      {p.api_key_hint && <span>{p.api_key_hint}</span>}
                      <span>
                        {t("{rps}/s · {rpm}/min", { rps: p.rate_per_second, rpm: p.rate_per_minute })}
                      </span>
                      {p.proxy && <span className="truncate">{t("Proxy {proxy}", { proxy: p.proxy })}</span>}
                      {p.reasoning_effort && (
                        <span>
                          {t("Thinking {effort}", {
                            effort: p.reasoning_effort === "off" ? t("off") : p.reasoning_effort,
                          })}
                        </span>
                      )}
                      {/* The two pool-related fields only matter when the pool is on; when it is off they take no space */}
                      {poolOn &&
                        !p.is_default &&
                        (p.pool_exclude ? (
                          <span>{t("Excluded from pool")}</span>
                        ) : (
                          <span>{t("Priority {priority}", { priority: p.priority ?? 0 })}</span>
                        ))}
                    </div>

                    <div className="mt-1 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={p.is_default}
                        onClick={(e) => {
                          e.stopPropagation();
                          void activate(p.id, p.name);
                        }}
                      >
                        {p.is_default ? t("Active") : t("Set as active")}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("Delete profile")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(p);
                        }}
                      >
                        <Trash2Icon className="text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {profiles.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
                {t('No model profiles yet — click "Create" in the top right to add the first one.')}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="retry" className="mt-4">
          <RetryPolicyPanel />
        </TabsContent>
      </Tabs>

      <ProfileSheet profile={editing} open={editOpen} onOpenChange={setEditOpen} onSaved={() => void load()} />
      <PoolSheet open={poolOpen} onOpenChange={setPoolOpen} pool={pool} onReload={loadPool} />
    </div>
  );
}
