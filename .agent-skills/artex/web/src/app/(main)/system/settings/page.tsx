"use client";

import * as React from "react";

import { CpuIcon, FlaskConicalIcon, KeyboardIcon, RadioTowerIcon, SearchIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import { CHAT_SEND_MODE_OPTIONS, type ChatSendMode, setChatSendMode, useChatSendMode } from "@/lib/chat-send-mode";
import type { Settings } from "@/lib/types";

import { NoiseProfileCard } from "./noise-profile-card";

// Renders a translated string, turning <b>…</b> and <code>…</code> spans into elements, so a sentence with emphasis stays one key.
function rich(s: string): React.ReactNode[] {
  return s.split(/(<b>.*?<\/b>|<code>.*?<\/code>)/).map((part, i) => {
    const b = /^<b>(.*)<\/b>$/.exec(part);
    if (b) return <b key={i}>{b[1]}</b>;
    const c = /^<code>(.*)<\/code>$/.exec(part);
    if (c) return <code key={i}>{c[1]}</code>;
    return part;
  });
}

export default function SystemSettingsPage() {
  const [trafficCapture, setTrafficCapture] = React.useState(false);
  const [agentTrafficBinding, setAgentTrafficBinding] = React.useState(false);
  const [webSearch, setWebSearch] = React.useState(false);
  const [backend, setBackend] = React.useState("ddgs");
  const [braveKeySet, setBraveKeySet] = React.useState(false);
  const [braveKeyInput, setBraveKeyInput] = React.useState("");
  const [tavilyKeySet, setTavilyKeySet] = React.useState(false);
  const [tavilyKeyInput, setTavilyKeyInput] = React.useState("");
  const [savingTavilyKey, setSavingTavilyKey] = React.useState(false);
  const [keenableKeySet, setKeenableKeySet] = React.useState(false);
  const [keenableKeyInput, setKeenableKeyInput] = React.useState("");
  const [savingKeenableKey, setSavingKeenableKey] = React.useState(false);
  const [proxyInput, setProxyInput] = React.useState("");
  const [savingProxy, setSavingProxy] = React.useState(false);
  const [globalProxyInput, setGlobalProxyInput] = React.useState("");
  const [savingGlobalProxy, setSavingGlobalProxy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);
  const [pyInterp, setPyInterp] = React.useState("");
  const [workers, setWorkers] = React.useState("3");
  const [savingWorkers, setSavingWorkers] = React.useState(false);
  // Operation constraint injection scope (both on by default).
  const [injectPlanner, setInjectPlanner] = React.useState(true);
  const [injectWorker, setInjectWorker] = React.useState(true);
  // Experimental: noa context compaction (off by default).
  const [noaCompaction, setNoaCompaction] = React.useState(false);
  // Pure frontend preference: bypasses /api/settings, reads and writes localStorage directly.
  const sendMode = useChatSendMode();

  const apply = React.useCallback((s: Settings) => {
    setTrafficCapture(!!s.traffic_capture);
    setAgentTrafficBinding(!!s.agent_traffic_binding);
    setWebSearch(!!s.web_search_enabled);
    setBackend(s.web_search_backend || "ddgs");
    setBraveKeySet(!!s.brave_key_set);
    setTavilyKeySet(!!s.tavily_key_set);
    setKeenableKeySet(!!s.keenable_key_set);
    setProxyInput(s.web_search_proxy ?? "");
    setGlobalProxyInput(s.global_proxy ?? "");
    setPyInterp(s.python_interpreter ?? "");
    setWorkers(String(s.workers ?? 3));
    setInjectPlanner(s.constraints_inject_planner !== false);
    setInjectWorker(s.constraints_inject_worker !== false);
    setNoaCompaction(!!s.noa_compaction);
  }, []);

  const saveWorkers = () => {
    const n = Number(workers);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error(t("Concurrency must be an integer greater than 0"));
      return;
    }
    setSavingWorkers(true);
    api
      .setSettings({ workers: n })
      .then((s) => {
        apply(s);
        toast.success(t("Saved the concurrent worker agent count (applies to tasks started afterwards)"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSavingWorkers(false));
  };

  const savePython = () => {
    setSaving(true);
    api
      .setSettings({ python_interpreter: pyInterp.trim() })
      .then((s) => {
        apply(s);
        toast.success(t("Saved Python interpreter config"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSaving(false));
  };
  const detectPython = () => {
    setSaving(true);
    api
      .detectPython()
      .then((r) => setPyInterp(r.python_interpreter))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  React.useEffect(() => {
    api
      .settings()
      .then(apply)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [apply]);

  const toggleTraffic = (v: boolean) => {
    setTrafficCapture(v); // optimistic
    setSaving(true);
    api
      .setSettings({ traffic_capture: v })
      .then(apply)
      .catch(() => setTrafficCapture(!v)) // revert on failure
      .finally(() => setSaving(false));
  };

  const toggleInjectPlanner = (v: boolean) => {
    setInjectPlanner(v); // optimistic
    api
      .setSettings({ constraints_inject_planner: v })
      .then(apply)
      .catch(() => setInjectPlanner(!v)); // revert on failure
  };

  const toggleAgentTrafficBinding = (v: boolean) => {
    setAgentTrafficBinding(v);
    setSaving(true);
    api
      .setSettings({ agent_traffic_binding: v })
      .then((s) => {
        apply(s);
        toast.success(v ? t("Enabled automatic agent traffic binding") : t("Disabled automatic agent traffic binding"));
      })
      .catch((e) => {
        setAgentTrafficBinding(!v);
        toast.error(t("Save failed: {error}", { error: (e as Error).message }));
      })
      .finally(() => setSaving(false));
  };

  const toggleInjectWorker = (v: boolean) => {
    setInjectWorker(v); // optimistic
    api
      .setSettings({ constraints_inject_worker: v })
      .then(apply)
      .catch(() => setInjectWorker(!v)); // revert on failure
  };

  const toggleNoaCompaction = (v: boolean) => {
    setNoaCompaction(v); // optimistic
    api
      .setSettings({ noa_compaction: v })
      .then((s) => {
        apply(s);
        toast.success(
          v
            ? t("Enabled noa context compaction (applies to runs started afterwards)")
            : t("Disabled noa context compaction (built-in compaction restored)"),
        );
      })
      .catch((e) => {
        setNoaCompaction(!v); // revert on failure
        toast.error(t("Save failed: {error}", { error: (e as Error).message }));
      });
  };

  // Persist a web-search patch (enable and/or backend). Optimistic with refetch.
  const saveWebSearch = (patch: Partial<Settings>) => {
    setSaving(true);
    api
      .setSettings(patch)
      .then((s) => {
        apply(s);
        toast.success(t("Saved web search config"));
      })
      .catch((e) => {
        toast.error(t("Save failed: {error}", { error: (e as Error).message }));
        api
          .settings()
          .then(apply)
          .catch(() => undefined);
      })
      .finally(() => setSaving(false));
  };

  const saveBraveKey = () => {
    setSavingKey(true);
    api
      .setSettings({ brave_search_api_key: braveKeyInput })
      .then((s) => {
        apply(s);
        setBraveKeyInput("");
        toast.success(t("Saved Brave API Key"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSavingKey(false));
  };

  const saveTavilyKey = () => {
    setSavingTavilyKey(true);
    api
      .setSettings({ tavily_search_api_key: tavilyKeyInput })
      .then((s) => {
        apply(s);
        setTavilyKeyInput("");
        toast.success(t("Saved Tavily API Key"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSavingTavilyKey(false));
  };

  const saveKeenableKey = () => {
    setSavingKeenableKey(true);
    api
      .setSettings({ keenable_search_api_key: keenableKeyInput })
      .then((s) => {
        apply(s);
        setKeenableKeyInput("");
        toast.success(t("Saved Keenable API Key"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSavingKeenableKey(false));
  };

  const saveProxy = () => {
    setSavingProxy(true);
    api
      .setSettings({ web_search_proxy: proxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(proxyInput.trim() ? t("Saved egress proxy") : t("Cleared egress proxy (direct connection)"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSavingProxy(false));
  };

  const saveGlobalProxy = () => {
    setSavingGlobalProxy(true);
    api
      .setSettings({ global_proxy: globalProxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(globalProxyInput.trim() ? t("Saved global proxy") : t("Cleared global proxy (direct connection)"));
      })
      .catch((e) => toast.error(t("Save failed: {error}", { error: (e as Error).message })))
      .finally(() => setSavingGlobalProxy(false));
  };

  // Run a real "test" search ("test") against the CURRENT form values (backend +
  // proxy + entered key), falling back to saved values server-side. Toasts result.
  const runTest = () => {
    setTesting(true);
    api
      .testWebSearch({
        web_search_backend: backend,
        web_search_proxy: proxyInput.trim(),
        brave_search_api_key: braveKeyInput,
        tavily_search_api_key: tavilyKeyInput,
        keenable_search_api_key: keenableKeyInput,
      })
      .then((r) => {
        if (r.ok)
          toast.success(t("Search test succeeded · {backend} returned {count} results", { backend: r.backend ?? "", count: r.count ?? 0 }));
        else toast.error(t("Search test failed: {error}", { error: r.error || t("unknown error") }));
      })
      .catch((e) => toast.error(t("Search test failed: {error}", { error: (e as Error).message })))
      .finally(() => setTesting(false));
  };

  // brave-free selected but no key stored and none being entered → tool stays off.
  const braveNeedsKey = webSearch && backend === "brave-free" && !braveKeySet;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("System settings")}</h1>
        <p className="text-muted-foreground text-sm">{t("Global runtime switches")}</p>
      </div>

      {/* Multi-column instead of grid: the web search card is several times taller than the others and
          its height varies with the selected backend (brave/tavily key inputs are conditional). A grid
          would stretch the row to the tallest card and leave blank space beside the others, while columns
          balance-fill by content height. Card spacing uses mb rather than gap — in a multi-column layout
          column-gap only covers the gaps between columns; row spacing must come from the children. */}
      <div className="columns-1 gap-4 md:gap-6 lg:columns-2">
        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              {t("Traffic capture")}
            </CardTitle>
            <CardDescription>
              {t(
                "When enabled, every agent's HTTP traffic is stored in full through the recording proxy, and agents are injected with the traffic_search / traffic_get tools and proxy configuration (the prompt includes proxy notes).",
              )}
              <br />
              {rich(
                t(
                  "When off (default) no traffic is recorded: the agent does <b>not</b> receive proxy configuration or traffic tools, and the prompt contains <b>no</b> proxy-related content. Agents are rebuilt immediately after switching.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="traffic-capture" className="text-sm font-normal text-muted-foreground">
                {trafficCapture ? t("On · recording traffic and injecting proxy") : t("Off · no recording, no proxy injection")}
              </Label>
              <Switch
                id="traffic-capture"
                checked={trafficCapture}
                disabled={!loaded || saving}
                onCheckedChange={toggleTraffic}
              />
            </div>
            {loaded && !trafficCapture && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                {t("Traffic capture is off: findings stay recorded, but captured HTTP traffic is required for provable findings.")}
              </p>
            )}
          </CardContent>
        </Card>

        <NoiseProfileCard />

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              {t("Automatic agent traffic binding")}
            </CardTitle>
            <CardDescription id="agent-traffic-binding-description">
              {rich(
                t(
                  "Off by default. When enabled, the report agent triggered on vulnerability creation reviews existing HTTP requests/responses and links the matching traffic before writing the report. <b>Reading packets and the extra tool calls increase token consumption.</b>",
                ),
              )}
              <br />
              {t(
                "Reporting still works for TCP, uncaptured traffic, or when no traffic matches. This switch does not affect traffic capture, manual binding, or viewing saved evidence. It takes effect for the next round of agents; once disabled, new automatic bindings are rejected immediately.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="agent-traffic-binding" className="text-sm font-normal text-muted-foreground">
              {agentTrafficBinding ? t("On · increases token consumption") : t("Off · manual binding still available")}
            </Label>
            <Switch
              id="agent-traffic-binding"
              aria-describedby="agent-traffic-binding-description"
              checked={agentTrafficBinding}
              disabled={!loaded || saving}
              onCheckedChange={toggleAgentTrafficBinding}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              {t("Global proxy")}
            </CardTitle>
            <CardDescription>
              {rich(
                t(
                  "All agents' <b>target traffic</b> egresses through this proxy (hide the source IP / use a jump host). Supports <b>http / https / socks5</b>, optionally with <code>user:pass</code> authentication. Empty = direct connection.",
                ),
              )}
              <br />
              {rich(
                t(
                  "With <b>traffic capture</b> on, it acts as the recording proxy's <b>upstream</b> (traffic is still stored in full, then egresses through this proxy); with capture off, it is injected directly into the agent's bash / WebFetch egress. Independent of the web search proxy and the LLM proxy.",
                ),
              )}
              <br />
              {rich(
                t(
                  "<b>Note</b>: with <b>capture off</b>, socks5 relies on each CLI tool honoring <code>ALL_PROXY</code> (curl works; some tools may ignore it). If you mainly use socks5, enable traffic capture — on that path the MITM does the dialing itself, invisible to tools and reliably effective.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="global-proxy" className="text-sm font-normal text-muted-foreground">
              {t("Proxy address")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="global-proxy"
                autoComplete="off"
                placeholder={t("socks5://user:pass@host:1080 or http://host:port (empty = direct)")}
                value={globalProxyInput}
                disabled={!loaded || savingGlobalProxy}
                onChange={(e) => setGlobalProxyInput(e.target.value)}
              />
              <Button type="button" onClick={saveGlobalProxy} disabled={!loaded || savingGlobalProxy}>
                {t("Save")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {globalProxyInput.trim()
                ? t("Configured · all target traffic egresses through this proxy")
                : t("Not configured · target traffic egresses directly")}
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-4" />
              {t("Operation constraint injection")}
            </CardTitle>
            <CardDescription>
              {rich(
                t(
                  'When enabled, each task\'s <b>operation constraints</b> (the allow/deny entries maintained under "Operation constraints" in the task overview) are spliced into the corresponding agent\'s system prompt to bound the exploration scope (e.g. "only test the current port", "no brute forcing").',
                ),
              )}
              <br />
              {rich(
                t(
                  "You can control injection into the <b>planner</b> and the <b>worker</b> separately; both are on by default. Switching takes effect immediately (read on the next turn) without rebuilding agents. When off, the agent no longer sees the constraints.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="inject-planner" className="text-sm font-normal text-muted-foreground">
                {injectPlanner ? t("Inject into planner · On") : t("Inject into planner · Off")}
              </Label>
              <Switch
                id="inject-planner"
                checked={injectPlanner}
                disabled={!loaded}
                onCheckedChange={toggleInjectPlanner}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="inject-worker" className="text-sm font-normal text-muted-foreground">
                {injectWorker ? t("Inject into worker · On") : t("Inject into worker · Off")}
              </Label>
              <Switch
                id="inject-worker"
                checked={injectWorker}
                disabled={!loaded}
                onCheckedChange={toggleInjectWorker}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConicalIcon className="size-4" />
              {t("Experimental features")}
            </CardTitle>
            <CardDescription>
              {t(
                "Mechanisms still being validated, off by default. They may change agent behavior or affect stability; enable only after understanding the impact.",
              )}
              <br />
              {rich(
                t(
                  "<b>noa context compaction</b>: the model actively compacts long conversation history (norma v0.4.0). When enabled, the four agent types integrated into the platform (<b>planner / worker / main agent / chat</b>) switch to noa-managed context in place of the built-in compaction, and the pre-compaction originals are archived under the task working directory for later review. Switching takes effect immediately (for runs started afterwards) without rebuilding agents; when disabled, the built-in compaction is restored immediately.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="noa-compaction" className="text-sm font-normal text-muted-foreground">
              {noaCompaction ? t("noa context compaction · On") : t("noa context compaction · Off")}
            </Label>
            <Switch
              id="noa-compaction"
              checked={noaCompaction}
              disabled={!loaded}
              onCheckedChange={toggleNoaCompaction}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SearchIcon className="size-4" />
              {t("Web search")}
            </CardTitle>
            <CardDescription>
              {rich(
                t(
                  "This is the web search <b>master switch + source config</b>. Only when it is enabled can <b>each agent's config</b> separately choose whether to enable <b>web_search</b> (returns only titles/links/snippets without fetching bodies; fetching is handled by WebFetch). Web search does <b>not</b> go through the recording proxy and is independent of traffic capture.",
                ),
              )}
              <br />
              {rich(
                t(
                  "Sources: <b>DuckDuckGo (ddgs)</b> (no key needed), <b>Brave (free tier)</b> (requires a Brave API Key), <b>Tavily</b> (requires a Tavily API Key) or <b>DeepSeek</b> (reuses the current LLM config). When the master switch is off, the per-agent web search switches are unavailable.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="web-search" className="text-sm font-normal text-muted-foreground">
                {webSearch
                  ? t("Master switch on · can be enabled per agent config")
                  : t("Off · agents cannot enable web search")}
              </Label>
              <Switch
                id="web-search"
                checked={webSearch}
                disabled={!loaded || saving}
                onCheckedChange={(v) => {
                  setWebSearch(v); // optimistic
                  saveWebSearch({ web_search_enabled: v });
                }}
              />
            </div>

            {webSearch && (
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm font-normal text-muted-foreground">{t("Search source")}</Label>
                <Select
                  value={backend}
                  disabled={!loaded || saving}
                  onValueChange={(v) => {
                    setBackend(v); // optimistic
                    saveWebSearch({ web_search_backend: v });
                  }}
                >
                  <SelectTrigger className="w-48 shrink-0">
                    <SelectValue placeholder={t("Choose a source")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ddgs">{t("DuckDuckGo (ddgs · free, no key)")}</SelectItem>
                    <SelectItem value="brave-free">{t("Brave (free tier · requires key)")}</SelectItem>
                    <SelectItem value="tavily">{t("Tavily (requires key)")}</SelectItem>
                    <SelectItem value="keenable">{t("Keenable (keyless, optional key)")}</SelectItem>
                    <SelectItem value="deepseek">{t("DeepSeek (official)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {webSearch && backend === "deepseek" && (
              <div className="border-border/60 bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
                <p className="text-sm font-medium">{t("DeepSeek official web search")}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {rich(
                    t(
                      "This source directly reuses the <b>currently active LLM config</b>. It therefore supports <b>official DeepSeek models only</b>, and that config <b>must use the anthropic protocol</b> — DeepSeek's OpenAI-protocol endpoint does not support server-side search. This source may stop working after switching LLM configs.",
                    ),
                  )}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {rich(
                    t(
                      "Unlike other sources, the search runs <b>server-side on DeepSeek</b>: each search consumes an extra model call (incurring token costs), search requests <b>do not go through the egress proxy above</b> and are <b>not recorded as traffic</b>; results contain <b>titles and links only</b> (no snippets); use WebFetch when you need the page body.",
                    ),
                  )}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t(
                    'Verify these conditions yourself; the system does not block on them. Use the "Test search" button below to run a real search and check.',
                  )}
                </p>
              </div>
            )}

            {webSearch && backend === "brave-free" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="brave-key" className="text-sm font-normal text-muted-foreground">
                  Brave Search API Key
                  {braveKeySet && <span className="ml-2 text-xs text-emerald-500">{t("Configured")}</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="brave-key"
                    type="password"
                    autoComplete="off"
                    placeholder={braveKeySet ? t("Configured (leave empty to keep)") : t("Enter Brave API Key")}
                    value={braveKeyInput}
                    disabled={!loaded || savingKey}
                    onChange={(e) => setBraveKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveBraveKey}
                    disabled={!loaded || savingKey || braveKeyInput.trim() === ""}
                  >
                    {t("Save")}
                  </Button>
                </div>
                {braveNeedsKey && (
                  <p className="text-xs text-amber-500">
                    {t("Brave is selected but no key is configured — the search tool stays disabled until you save one.")}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  {t("The free tier allows about 2,000 queries/month. Get a key at https://brave.com/search/api/.")}
                </p>
              </div>
            )}

            {webSearch && backend === "tavily" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="tavily-key" className="text-sm font-normal text-muted-foreground">
                  Tavily Search API Key
                  {tavilyKeySet && <span className="ml-2 text-xs text-emerald-500">{t("Configured")}</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="tavily-key"
                    type="password"
                    autoComplete="off"
                    placeholder={tavilyKeySet ? t("Configured (leave empty to keep)") : t("Enter Tavily API Key (tvly-…)")}
                    value={tavilyKeyInput}
                    disabled={!loaded || savingTavilyKey}
                    onChange={(e) => setTavilyKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveTavilyKey}
                    disabled={!loaded || savingTavilyKey || tavilyKeyInput.trim() === ""}
                  >
                    {t("Save")}
                  </Button>
                </div>
                {webSearch && backend === "tavily" && !tavilyKeySet && (
                  <p className="text-xs text-amber-500">
                    {t("Tavily is selected but no key is configured — the search tool stays disabled until you save one.")}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">{t("Register and get an API key at https://tavily.com.")}</p>
              </div>
            )}

            {webSearch && backend === "keenable" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="keenable-key" className="text-sm font-normal text-muted-foreground">
                  {t("Keenable Search API Key (optional)")}
                  {keenableKeySet && <span className="ml-2 text-xs text-emerald-500">{t("Configured")}</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="keenable-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      keenableKeySet
                        ? t("Configured (leave empty to keep)")
                        : t("Optional: leave empty for the keyless endpoint")
                    }
                    value={keenableKeyInput}
                    disabled={!loaded || savingKeenableKey}
                    onChange={(e) => setKeenableKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveKeenableKey}
                    disabled={!loaded || savingKeenableKey || keenableKeyInput.trim() === ""}
                  >
                    {t("Save")}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {rich(
                    t(
                      "Queries leave this instance and go to api.keenable.ai. The request carries <b>X-Keenable-Title: ARTEX</b> so the provider can identify the caller. With no key, the public endpoint is rate-limited per IP; a key raises the limit, but the backend works without one.",
                    ),
                  )}
                </p>
              </div>
            )}

            {webSearch && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ws-proxy" className="text-sm font-normal text-muted-foreground">
                  {t("Egress proxy (optional)")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ws-proxy"
                    autoComplete="off"
                    placeholder={t("http://host:port or socks5://host:port (empty = direct)")}
                    value={proxyInput}
                    disabled={!loaded || savingProxy}
                    onChange={(e) => setProxyInput(e.target.value)}
                  />
                  <Button type="button" onClick={saveProxy} disabled={!loaded || savingProxy}>
                    {t("Save")}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "A dedicated egress proxy used only to reach search endpoints (VPN/SOCKS etc.). Unrelated to the traffic-recording MITM proxy; use it to reach endpoints when the network is blocked.",
                  )}
                </p>
              </div>
            )}

            {webSearch && (
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <p className="text-muted-foreground text-xs">
                  {t('Run a real "test" search with the current config (source + proxy + key) to verify it works.')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTest}
                  disabled={!loaded || testing}
                  className="shrink-0"
                >
                  {testing ? t("Testing…") : t("Test search")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              {t("Custom scripts · Python interpreter")}
            </CardTitle>
            <CardDescription>
              {rich(
                t(
                  "Custom <b>script</b> tools run Python with it. Auto-detected at startup (python3 first); you can enter an absolute path to a venv / specific version here; leave empty to auto-detect at runtime.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                className="font-mono text-sm"
                placeholder={t("/usr/bin/python3 (empty = auto-detect)")}
                value={pyInterp}
                disabled={!loaded || saving}
                onChange={(e) => setPyInterp(e.target.value)}
              />
              <Button variant="outline" onClick={detectPython} disabled={!loaded || saving}>
                {t("Re-detect")}
              </Button>
              <Button onClick={savePython} disabled={!loaded || saving}>
                {t("Save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CpuIcon className="size-4" />
              {t("Work concurrency · worker agent count")}
            </CardTitle>
            <CardDescription>
              {rich(
                t(
                  "The number of worker agents running concurrently per task (default 3). Higher values mean more parallel probing and higher consumption. Changes <b>apply to tasks started afterwards</b>; running tasks are unaffected.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-32 font-mono text-sm"
                placeholder="3"
                value={workers}
                disabled={!loaded || savingWorkers}
                onChange={(e) => setWorkers(e.target.value)}
              />
              <Button onClick={saveWorkers} disabled={!loaded || savingWorkers}>
                {t("Save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyboardIcon className="size-4" />
              {t("Chat input send key binding")}
            </CardTitle>
            <CardDescription>
              {t(
                "Shared by the main-agent chat inputs on the chat page and task details; takes effect immediately on selection, no saving needed.",
              )}
              <br />
              {rich(
                t(
                  "This preference <b>lives only in this browser</b>, does not sync with the account, and must be set again after switching browsers or clearing site data.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="chat-send-mode" className="text-sm font-normal text-muted-foreground">
              {t("Send mode")}
            </Label>
            <Select value={sendMode} onValueChange={(v) => setChatSendMode(v as ChatSendMode)}>
              <SelectTrigger id="chat-send-mode" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_SEND_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
