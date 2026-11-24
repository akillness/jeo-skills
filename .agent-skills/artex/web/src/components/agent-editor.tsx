"use client";

import * as React from "react";
import { toast } from "sonner";
import { EyeIcon, GitCompareIcon, PencilIcon, RotateCcwIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Markdown } from "@/components/markdown";
import { intlLocale, t } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Agent, AgentDetail, AgentTrigger, MCPServer, PromptVar, PromptVersion, Settings, SkillItem, Tool } from "@/lib/types";

// Renders a translated string, turning <b>…</b> spans into bold elements, so a sentence with emphasis stays one key.
function rich(s: string): React.ReactNode[] {
  return s.split(/<b>(.*?)<\/b>/).map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

// Traffic tools are host tools gated by the global traffic capture switch: bindable, but
// only usable when capture is on. Keep this list in sync with traffic.SeedToolMetas.
const TRAFFIC_TOOL_KEYS = new Set(["traffic_search", "traffic_get"]);

// AgentEditor is the tabbed editor for one agent, used inside the agents-page
// drawer (and reused full-page for deep links). Tabs: Config & Prompt / MCP / Skill /
// Tools. Config + prompt save as before; visibility + tool bindings toggle live.
export function AgentEditor({ agentKey, onSaved }: { agentKey: string; onSaved?: () => void }) {
  const [detail, setDetail] = React.useState<AgentDetail | null>(null);
  const [versions, setVersions] = React.useState<PromptVersion[]>([]);
  const [variables, setVariables] = React.useState<PromptVar[]>([]);
  const [mcp, setMcp] = React.useState<MCPServer[]>([]);
  const [skills, setSkills] = React.useState<SkillItem[]>([]);
  const [tools, setTools] = React.useState<Tool[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [viewVer, setViewVer] = React.useState<PromptVersion | null>(null);
  const [diffVer, setDiffVer] = React.useState<PromptVersion | null>(null);

  const [prompt, setPrompt] = React.useState("");
  const [mcpVisible, setMcpVisible] = React.useState<number[]>([]);
  const [skillVisible, setSkillVisible] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState("");
  const [maxTurns, setMaxTurns] = React.useState("0");
  const [runSecs, setRunSecs] = React.useState("600");
  // "" = follow (unbound); otherwise a profile id string
  const [llmProfileId, setLlmProfileId] = React.useState("");
  const [llmProfiles, setLlmProfiles] = React.useState<NonNullable<AgentDetail["llm_profiles"]>>([]);
  const [webSearch, setWebSearch] = React.useState(false);
  const [interactiveShell, setInteractiveShell] = React.useState(false);
  const [wrapup, setWrapup] = React.useState("");
  const [wrapupDefault, setWrapupDefault] = React.useState("");
  const [wrapupTurns, setWrapupTurns] = React.useState("0");
  const [wrapupTurnsDefault, setWrapupTurnsDefault] = React.useState(5);
  // task-level timeout wrap-up prompt (worker/planner only)
  const [ttSupported, setTtSupported] = React.useState(false);
  const [ttWrapup, setTtWrapup] = React.useState("");
  const [ttWrapupDefault, setTtWrapupDefault] = React.useState("");
  const [ttTurns, setTtTurns] = React.useState("0");
  const [ttTurnsDefault, setTtTurnsDefault] = React.useState(5);
  const [settings, setSettings] = React.useState<Settings | null>(null);

  React.useEffect(() => {
    api.mcpServers().then(setMcp).catch(() => {});
    api.skills().then(setSkills).catch(() => {});
    api.tools().then(setTools).catch(() => {});
    api.settings().then(setSettings).catch(() => {});
  }, []);
  // global gates: traffic tools need traffic capture, web search needs the master switch.
  const captureOn = !!settings?.traffic_capture;
  const webSearchGlobalOn = !!settings?.web_search_enabled;

  const reload = React.useCallback(() => {
    api
      .getAgent(agentKey)
      .then((d) => {
        setDetail(d);
        setPrompt(d.prompt ?? "");
        setVariables(d.variables ?? []);
        setVersions(d.versions ?? []);
        setMcpVisible(d.visibility?.mcp ?? []);
        setSkillVisible(d.visibility?.skill ?? []);
        setMaxTurns(String(d.agent?.max_turns ?? 0));
        setRunSecs(String(d.agent?.run_seconds ?? 600));
        setLlmProfileId(d.agent?.llm_profile_id != null ? String(d.agent.llm_profile_id) : "");
        setLlmProfiles(d.llm_profiles ?? []);
        setWebSearch(!!d.agent?.web_search);
        setInteractiveShell(!!d.agent?.interactive_shell);
        setWrapup(d.wrapup_prompt ?? "");
        setWrapupDefault(d.wrapup_default ?? "");
        setWrapupTurns(String(d.wrapup_max_turns ?? 0));
        setWrapupTurnsDefault(d.wrapup_max_turns_default ?? 5);
        setTtSupported(!!d.task_timeout_wrapup_supported);
        setTtWrapup(d.task_timeout_wrapup_prompt ?? "");
        setTtWrapupDefault(d.task_timeout_wrapup_default ?? "");
        setTtTurns(String(d.task_timeout_wrapup_max_turns ?? 0));
        setTtTurnsDefault(d.task_timeout_wrapup_max_turns_default ?? 5);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoaded(true));
  }, [agentKey]);
  React.useEffect(() => {
    reload();
  }, [reload]);

  async function doPreview() {
    try {
      const r = await api.previewAgentPrompt(agentKey, prompt);
      setPreview(r.error ? t("Render error: {error}", { error: r.error }) : r.rendered);
    } catch (e) {
      setPreview(t("Preview failed: {error}", { error: (e as Error).message }));
    }
  }
  async function savePrompt() {
    try {
      const r = await api.saveAgentPrompt(agentKey, prompt);
      toast.success(t("Saved as version v{version}", { version: r.version }));
      reload();
      onSaved?.();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    }
  }
  async function resetPrompt() {
    try {
      const r = await api.resetAgentPrompt(agentKey);
      toast.success(t("Restored to built-in default (v{version})", { version: r.version }));
      reload();
    } catch (e) {
      toast.error(t("Restore failed: {error}", { error: (e as Error).message }));
    }
  }
  async function saveWrapup() {
    try {
      const turns = Math.max(0, Math.floor(Number(wrapupTurns) || 0));
      await api.saveAgentWrapup(agentKey, wrapup, turns);
      toast.success(
        wrapup.trim() || turns > 0
          ? t("Wrap-up config saved (takes effect on the next run)")
          : t("Cleared; the built-in default will be used"),
      );
      reload();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    }
  }
  async function resetWrapup() {
    try {
      await api.resetAgentWrapup(agentKey);
      toast.success(t("Restored to built-in default"));
      reload();
    } catch (e) {
      toast.error(t("Restore failed: {error}", { error: (e as Error).message }));
    }
  }
  async function saveTaskTimeoutWrapup() {
    try {
      const turns = Math.max(0, Math.floor(Number(ttTurns) || 0));
      await api.saveAgentTaskTimeoutWrapup(agentKey, ttWrapup, turns);
      toast.success(t("Task timeout wrap-up config saved (takes effect on the next run)"));
      reload();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    }
  }
  async function resetTaskTimeoutWrapup() {
    try {
      await api.resetAgentTaskTimeoutWrapup(agentKey);
      toast.success(t("Restored to built-in default"));
      reload();
    } catch (e) {
      toast.error(t("Restore failed: {error}", { error: (e as Error).message }));
    }
  }
  async function saveConfig() {
    try {
      // Only submit the fields this agent actually displays, to avoid overwriting hidden items (such as max_turns for goals) with defaults.
      const patch: Parameters<typeof api.saveAgentConfig>[1] = {
        llm_profile_id: llmProfileId === "" ? null : Number(llmProfileId),
      };
      if (showConfig) {
        patch.max_turns = Math.max(0, Math.floor(Number(maxTurns) || 0));
        patch.run_seconds = Math.max(0, Math.floor(Number(runSecs) || 0));
      }
      if (showWebSearch) patch.web_search = webSearch;
      if (showInteractiveShell) patch.interactive_shell = interactiveShell;
      await api.saveAgentConfig(agentKey, patch);
      toast.success(t("Run config saved (effective immediately)"));
      reload();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    }
  }
  // applyVis optimistically updates, persists, and toasts success/failure. On
  // failure it reverts to the prior selection so the UI never lies about state.
  async function applyVis(nextMcp: number[], nextSkill: string[], okMsg: string) {
    const prevMcp = mcpVisible;
    const prevSkill = skillVisible;
    setMcpVisible(nextMcp);
    setSkillVisible(nextSkill);
    try {
      await api.setAgentVisibility(agentKey, nextMcp, nextSkill);
      toast.success(okMsg);
      onSaved?.(); // refresh the list so the card's MCP/Skill counts stay in sync
    } catch (e) {
      setMcpVisible(prevMcp);
      setSkillVisible(prevSkill);
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    }
  }
  function toggleMcp(id: number) {
    const on = mcpVisible.includes(id);
    const name = mcp.find((m) => m.id === id)?.name ?? String(id);
    applyVis(
      on ? mcpVisible.filter((x) => x !== id) : [...mcpVisible, id],
      skillVisible,
      on ? t('Revoked MCP "{name}" visibility', { name }) : t('Granted MCP "{name}" visibility', { name }),
    );
  }
  function toggleSkill(name: string) {
    const on = skillVisible.includes(name);
    applyVis(
      mcpVisible,
      on ? skillVisible.filter((x) => x !== name) : [...skillVisible, name],
      on ? t('Revoked Skill "{name}" visibility', { name }) : t('Granted Skill "{name}" visibility', { name }),
    );
  }
  async function toggleTool(tool: Tool) {
    const on = tool.agents.includes(agentKey);
    const nextAgents = on ? tool.agents.filter((k) => k !== agentKey) : [...tool.agents, agentKey];
    // optimistic update
    setTools((ts) => ts.map((x) => (x.key === tool.key ? { ...x, agents: nextAgents } : x)));
    try {
      await api.saveTool(tool.key, {
        description: tool.description,
        schema: tool.schema,
        agents: nextAgents,
        enabled: tool.enabled,
      });
      toast.success(on ? t('Unbound tool "{key}"', { key: tool.key }) : t('Bound tool "{key}"', { key: tool.key }));
      onSaved?.(); // refresh the list so the card's tool count stays in sync
    } catch (e) {
      toast.error(t("Failed to save tool bindings: {error}", { error: (e as Error).message }));
      reload();
      api.tools().then(setTools).catch(() => {});
    }
  }

  if (loaded && !detail) {
    return (
      <div className="text-muted-foreground p-6 text-center text-sm">{t("Agent not found: {key}", { key: agentKey })}</div>
    );
  }
  // config is meaningless for the conversational main agent and the fixed-budget
  // goals decomposer; every other agent (workers, custom assistants) honors it.
  const showConfig = agentKey !== "mainagent" && agentKey !== "goals";
  // web search applies to every conversational/executing agent except the one-shot
  // goals decomposer; it's gated by the global master switch.
  const showWebSearch = agentKey !== "goals";
  // interactive shell (persistent PTY session tool family) is likewise open to all agents except goals; no global gate.
  const showInteractiveShell = agentKey !== "goals";
  // Every agent (including goals/mainagent) runs on some LLM, so the "default model" binding is open to all agents.
  const showLLM = true;
  // triggers (P3) only attach to custom agents.
  const isCustom = !!detail && !detail.agent?.builtin;

  return (
    <Tabs defaultValue="prompt" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mx-4 mt-2 w-fit">
        <TabsTrigger value="prompt">{t("Config & Prompt")}</TabsTrigger>
        <TabsTrigger value="wrapup">{t("Wrap-up Prompt")}</TabsTrigger>
        <TabsTrigger value="mcp">MCP</TabsTrigger>
        <TabsTrigger value="skill">{t("Skill")}</TabsTrigger>
        <TabsTrigger value="tools">{t("Tools")}</TabsTrigger>
        {isCustom && <TabsTrigger value="triggers">{t("Triggers")}</TabsTrigger>}
      </TabsList>

      {/* config + prompt */}
      <TabsContent value="prompt" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-4">
          {(showLLM || showConfig || showWebSearch || showInteractiveShell) && (
            <div className="grid gap-3 rounded-md border p-3">
              {showLLM && (
                <div className="grid gap-1.5">
                  <Label htmlFor="llm-profile" className="text-xs">{t("Default model (LLM profile)")}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={llmProfileId || "__follow__"} onValueChange={(v) => setLlmProfileId(v === "__follow__" ? "" : v)}>
                      <SelectTrigger id="llm-profile" className="h-8 w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__follow__">{t("Follow task / globally active profile")}</SelectItem>
                        {llmProfiles.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.is_default
                              ? t("{name} ({model}) · default", { name: p.name, model: p.model })
                              : `${p.name} (${p.model})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground max-w-md text-xs">
                      {t(
                        'Bind a fixed LLM profile to this Agent (click "Save config" to apply). Priority: Agent binding > task/session override > global active.',
                      )}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                {showConfig && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="max-turns" className="text-xs">{t("Max loop turns (0 = unlimited)")}</Label>
                      <Input id="max-turns" type="number" min={0} className="h-8 w-32"
                        value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="run-seconds" className="text-xs">{t("Run duration (seconds, 0 = unlimited)")}</Label>
                      <Input id="run-seconds" type="number" min={0} className="h-8 w-32"
                        value={runSecs} onChange={(e) => setRunSecs(e.target.value)} />
                    </div>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={saveConfig}>
                  <SaveIcon /> {t("Save config")}
                </Button>
              </div>
              {showWebSearch && (
                <div className="flex items-center gap-3 border-t pt-3">
                  <Switch
                    id="web-search"
                    checked={webSearch}
                    disabled={!webSearchGlobalOn}
                    onCheckedChange={setWebSearch}
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor="web-search" className="text-sm">{t("Web search")}</Label>
                    <span className="text-muted-foreground text-xs">
                      {webSearchGlobalOn
                        ? t("Once enabled for this Agent (click Save above to apply), web_search can search the internet")
                        : t("Enable web search in System settings and configure a backend before enabling it here")}
                    </span>
                  </div>
                </div>
              )}
              {showInteractiveShell && (
                <div className="flex items-center gap-3 border-t pt-3">
                  <Switch
                    id="interactive-shell"
                    checked={interactiveShell}
                    onCheckedChange={setInteractiveShell}
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor="interactive-shell" className="text-sm">{t("Interactive shell")}</Label>
                    <span className="text-muted-foreground text-xs">
                      {t(
                        "Once enabled for this Agent (click Save above to apply), persistent PTY session tools (shell_open/send/read/close/list) can drive interactive programs such as msfconsole/ssh/REPL",
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label className="text-muted-foreground text-xs">
              {t("Variables (click to insert a placeholder; replaced with runtime data when rendered)")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <Tooltip key={v.name}>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => setPrompt((p) => `${p}{{.${v.name}}}`)}
                      className="hover:bg-muted inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs">
                      {`{{.${v.name}}}`}
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">{t(v.source)}</Badge>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium">{v.description}</p>
                    <p className="text-muted-foreground mt-1">{t("Example: {example}", { example: v.example })}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {variables.length === 0 && <span className="text-muted-foreground text-xs">{t("(no variables)")}</span>}
            </div>
          </div>

          <Textarea className="font-mono text-xs" rows={16} value={prompt}
            placeholder={t("Leave empty to use the built-in default prompt")} onChange={(e) => setPrompt(e.target.value)} />

          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={doPreview}>
                  <EyeIcon /> {t("Render preview")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("Render preview")}</DialogTitle>
                  <DialogDescription>
                    {t("All {var} have been replaced by the backend with sample values.", { var: "{{.Var}}" })}
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3">
                  <Markdown text={preview} />
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" onClick={savePrompt}>
              <SaveIcon /> {t("Save as new version")}
            </Button>
            <Button variant="outline" size="sm" onClick={resetPrompt}>
              <RotateCcwIcon /> {t("Restore default")}
            </Button>
          </div>


          <Separator />
          <div className="grid gap-2">
            <Label className="text-muted-foreground text-xs">{t("Version history")}</Label>
            <ul className="grid gap-1">
              {versions.map((ver, i) => (
                <li key={ver.version} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted/50">
                  <span className="font-mono shrink-0">v{ver.version}</span>
                  {i === 0 && <Badge variant="secondary" className="px-1.5 py-0 shrink-0">{t("Current")}</Badge>}
                  <span className="text-muted-foreground truncate flex-1">{ver.note}</span>
                  {ver.ts && (
                    <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                      {new Date(ver.ts).toLocaleDateString(intlLocale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <Button variant="ghost" size="icon-sm" className="size-6 shrink-0" onClick={() => setViewVer(ver)}
                    aria-label={t("View version")} title={t("View version")}>
                    <EyeIcon className="size-3" />
                  </Button>
                  {i > 0 && versions[0] && (
                    <Button variant="ghost" size="icon-sm" className="size-6 shrink-0" onClick={() => setDiffVer(ver)}
                      aria-label={t("Compare with current")} title={t("Compare with current")}>
                      <GitCompareIcon className="size-3" />
                    </Button>
                  )}
                </li>
              ))}
              {versions.length === 0 && (
                <li className="text-muted-foreground text-xs">{t("(no saved versions; using the built-in default)")}</li>
              )}
            </ul>
          </div>

          {/* view-version dialog */}
          <Dialog open={!!viewVer} onOpenChange={(o) => { if (!o) setViewVer(null); }}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  v{viewVer?.version}
                  {viewVer?.version === versions[0]?.version && (
                    <Badge variant="secondary" className="ml-2 px-1.5 py-0 align-middle">{t("Current")}</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {viewVer?.note || t("(no note)")}
                  {viewVer?.ts && (
                    <span className="ml-2 text-muted-foreground/60">
                      {new Date(viewVer.ts).toLocaleString(intlLocale)}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <pre className="bg-muted max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md p-3 font-mono text-xs">
                {viewVer?.template_text || t("(empty)")}
              </pre>
              <div className="flex gap-2 justify-end">
                {viewVer && viewVer.version !== versions[0]?.version && (
                  <Button variant="outline" size="sm" onClick={() => {
                    if (viewVer) { setDiffVer(viewVer); setViewVer(null); }
                  }}>
                    <GitCompareIcon className="mr-1 size-3.5" /> {t("Compare with current")}
                  </Button>
                )}
                <Button size="sm" onClick={() => {
                  if (viewVer) {
                    setPrompt(viewVer.template_text);
                    setViewVer(null);
                    toast.success(
                      t('Loaded v{version} into the editor; click "Save as new version" to confirm', { version: viewVer.version }),
                    );
                  }
                }}>
                  {t("Load into editor")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* version-diff dialog */}
          <Dialog open={!!diffVer} onOpenChange={(o) => { if (!o) setDiffVer(null); }}>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {t("Version diff: v{from} → v{to} (current)", {
                    from: diffVer?.version ?? "",
                    to: versions[0]?.version ?? "",
                  })}
                </DialogTitle>
                <DialogDescription>
                  <span className="inline-flex items-center gap-3 text-xs">
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400">{t("- removed")}</span>
                    <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-green-600 dark:text-green-400">{t("+ added")}</span>
                  </span>
                </DialogDescription>
              </DialogHeader>
              <DiffView oldText={diffVer?.template_text ?? ""} newText={versions[0]?.template_text ?? ""} />
            </DialogContent>
          </Dialog>
        </div>
      </TabsContent>

      {/* wrap-up prompt */}
      <TabsContent value="wrapup" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {rich(
              t(
                'When this Agent is terminated due to <b>timeout</b> or <b>exhausted turns</b>, the system injects this "wrap-up prompt" for one wrap-up round: It first writes back anything identified but not yet stored, then outputs a one-line summary (to avoid an abrupt ending). Leave empty to use the built-in default.',
              ),
            )}
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs">{t("Wrap-up prompt body")}</Label>
            {wrapup.trim() ? (
              <Badge variant="secondary" className="px-1.5 py-0">{t("Custom")}</Badge>
            ) : (
              <Badge variant="outline" className="px-1.5 py-0">{t("Using built-in default")}</Badge>
            )}
          </div>
          <Textarea
            className="font-mono text-xs"
            rows={10}
            value={wrapup}
            placeholder={wrapupDefault || t("Leave empty to use the built-in default wrap-up prompt")}
            onChange={(e) => setWrapup(e.target.value)}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="wrapup-turns" className="text-xs">
              {t(
                "Wrap-up turns (max turns for the wrap-up phase itself; 0 = built-in default of {count} turns)",
                { count: wrapupTurnsDefault },
              )}
            </Label>
            <Input id="wrapup-turns" type="number" min={0} className="h-8 w-32"
              value={wrapupTurns} onChange={(e) => setWrapupTurns(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveWrapup}>{t("Save")}</Button>
            <Button size="sm" variant="outline" onClick={resetWrapup}>{t("Restore default")}</Button>
          </div>
          {wrapupDefault && (
            <>
              <Separator />
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground text-xs">{t("Built-in default (read-only, for reference)")}</Label>
                <pre className="text-muted-foreground max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                  {wrapupDefault}
                </pre>
              </div>
            </>
          )}

          {ttSupported && (
            <>
              <Separator className="my-2" />
              <p className="text-muted-foreground text-xs leading-relaxed">
                {rich(
                  t(
                    "<b>Task timeout wrap-up</b> (<b>separate</b> from the per-run wrap-up above): injected when the <b>entire task</b> hits its timeout cap and is about to end. Its semantics are often the opposite of per-run (e.g. planner: per-run says \"don't stop, keep planning\", task timeout says \"time's up, stop and make the final call\"). Leave empty to use the built-in default.",
                  ),
                )}
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t("Task timeout wrap-up prompt body")}</Label>
                {ttWrapup.trim() ? (
                  <Badge variant="secondary" className="px-1.5 py-0">{t("Custom")}</Badge>
                ) : (
                  <Badge variant="outline" className="px-1.5 py-0">{t("Using built-in default")}</Badge>
                )}
              </div>
              <Textarea
                className="font-mono text-xs"
                rows={10}
                value={ttWrapup}
                placeholder={ttWrapupDefault || t("Leave empty to use the built-in default task timeout wrap-up prompt")}
                onChange={(e) => setTtWrapup(e.target.value)}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="tt-turns" className="text-xs">
                  {t("Wrap-up turns (0 = built-in default of {count} turns)", { count: ttTurnsDefault })}
                </Label>
                <Input id="tt-turns" type="number" min={0} className="h-8 w-32"
                  value={ttTurns} onChange={(e) => setTtTurns(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveTaskTimeoutWrapup}>{t("Save")}</Button>
                <Button size="sm" variant="outline" onClick={resetTaskTimeoutWrapup}>{t("Restore default")}</Button>
              </div>
              {ttWrapupDefault && (
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground text-xs">{t("Built-in default (read-only, for reference)")}</Label>
                  <pre className="text-muted-foreground max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                    {ttWrapupDefault}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </TabsContent>

      {/* MCP visibility */}
      <TabsContent value="mcp" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-muted-foreground mb-3 text-xs">{t("Check the MCP servers visible to this Agent.")}</p>
        <div className="grid gap-2">
          {mcp.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox checked={mcpVisible.includes(m.id)} onCheckedChange={() => toggleMcp(m.id)} />
              {m.name}
              <span className="text-muted-foreground ml-auto text-xs">{m.transport}</span>
            </label>
          ))}
          {mcp.length === 0 && <span className="text-muted-foreground text-xs">{t("(no MCP servers)")}</span>}
        </div>
      </TabsContent>

      {/* Skill visibility */}
      <TabsContent value="skill" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-muted-foreground mb-3 text-xs">{t("Check the Skills visible to this Agent.")}</p>
        <div className="grid gap-2">
          {skills.map((s) => (
            <label key={s.name} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox checked={skillVisible.includes(s.name)} onCheckedChange={() => toggleSkill(s.name)} />
              <span className="font-mono text-xs">{s.name}</span>
              {s.description && <span className="text-muted-foreground ml-auto truncate text-xs">{s.description}</span>}
            </label>
          ))}
          {skills.length === 0 && <span className="text-muted-foreground text-xs">{t("(no Skills)")}</span>}
        </div>
      </TabsContent>

      {/* Tools bindings */}
      <TabsContent value="tools" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-muted-foreground mb-3 text-xs">{t("Check the built-in tools bound to this Agent.")}</p>
        <div className="grid gap-2">
          {tools.map((tool) => {
            const isTraffic = TRAFFIC_TOOL_KEYS.has(tool.key);
            const gated = isTraffic && !captureOn; // traffic tools need traffic capture on
            return (
              <label
                key={tool.key}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2 text-sm",
                  gated && "opacity-60",
                )}
              >
                <Checkbox
                  checked={tool.agents.includes(agentKey)}
                  disabled={gated}
                  onCheckedChange={() => toggleTool(tool)}
                />
                <span className="font-mono text-xs">{tool.key}</span>
                {isTraffic && (
                  <Badge variant="secondary" className="px-1 py-0 text-[9px]">{t("Traffic")}</Badge>
                )}
                {!tool.enabled && (
                  <Badge variant="outline" className="text-destructive px-1 py-0 text-[9px]">{t("Disabled")}</Badge>
                )}
                {gated ? (
                  <span className="text-muted-foreground ml-auto text-xs">{t("Requires traffic capture")}</span>
                ) : (
                  tool.description && (
                    <span className="text-muted-foreground ml-auto line-clamp-1 max-w-[55%] text-xs">
                      {tool.description}
                    </span>
                  )
                )}
              </label>
            );
          })}
          {tools.length === 0 && <span className="text-muted-foreground text-xs">{t("(no tools)")}</span>}
        </div>
      </TabsContent>

      {/* Triggers (P3, custom agents only) */}
      {isCustom && (
        <TabsContent value="triggers" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <AgentTriggersTab agentKey={agentKey} agent={detail?.agent} />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ---------- Diff helpers ----------

type DiffLine = { type: "same" | "add" | "del"; text: string };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "same", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: "del", text: a[i - 1] });
      i--;
    }
  }
  return result;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = React.useMemo(() => computeDiff(oldText, newText), [oldText, newText]);
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs leading-5">
      {lines.map((l, idx) => (
        <div
          key={idx}
          className={cn(
            "whitespace-pre-wrap px-1",
            l.type === "del" && "bg-red-500/15 text-red-700 dark:text-red-400",
            l.type === "add" && "bg-green-500/15 text-green-700 dark:text-green-400",
            l.type === "same" && "text-muted-foreground",
          )}
        >
          <span className="select-none mr-1 opacity-50">{l.type === "del" ? "-" : l.type === "add" ? "+" : " "}</span>
          {l.text}
        </div>
      ))}
    </pre>
  );
}

// AgentTriggersTab manages a custom agent's P3 triggers: list + add + delete.
// Each trigger fires (schedule/finding found/goal met/task timeout/tool call, multi-select) → a new conversation runs
// in parallel with the base user message + auto context appended by the backend.
function AgentTriggersTab({ agentKey, agent }: { agentKey: string; agent?: Agent }) {
  const [triggers, setTriggers] = React.useState<AgentTrigger[]>([]);
  const [tools, setTools] = React.useState<Tool[]>([]);
  // post-trigger handling policy (per agent); initial value comes from agent detail, saved on change.
  const [runMode, setRunMode] = React.useState<"serial" | "parallel">(agent?.trigger_run_mode ?? "serial");
  const [mergeMode, setMergeMode] = React.useState<"by_task" | "all" | "none">(agent?.trigger_merge_mode ?? "all");
  const [maxParallel, setMaxParallel] = React.useState(String(agent?.trigger_max_parallel ?? 5));
  React.useEffect(() => {
    setRunMode(agent?.trigger_run_mode ?? "serial");
    setMergeMode(agent?.trigger_merge_mode ?? "all");
    setMaxParallel(String(agent?.trigger_max_parallel ?? 5));
  }, [agent?.trigger_run_mode, agent?.trigger_merge_mode, agent?.trigger_max_parallel]);

  async function saveBehavior(patch: {
    trigger_run_mode?: "serial" | "parallel";
    trigger_merge_mode?: "by_task" | "all" | "none";
    trigger_max_parallel?: number;
  }) {
    try {
      await api.saveAgentConfig(agentKey, patch);
    } catch (e) {
      toast.error(t("Failed to save policy: {error}", { error: (e as Error).message }));
    }
  }
  const [onInterval, setOnInterval] = React.useState(false);
  const [intervalSec, setIntervalSec] = React.useState("60");
  const [onFinding, setOnFinding] = React.useState(false);
  const [onGoalMet, setOnGoalMet] = React.useState(false);
  const [onTaskTimeout, setOnTaskTimeout] = React.useState(false);
  const [onToolCall, setOnToolCall] = React.useState(false);
  const [onTaskCreate, setOnTaskCreate] = React.useState(false);
  const [intervalMsg, setIntervalMsg] = React.useState("");
  const [findingMsg, setFindingMsg] = React.useState("");
  const [goalMsg, setGoalMsg] = React.useState("");
  const [taskTimeoutMsg, setTaskTimeoutMsg] = React.useState("");
  const [toolCallMsg, setToolCallMsg] = React.useState("");
  const [taskCreateMsg, setTaskCreateMsg] = React.useState("");
  const [toolNames, setToolNames] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  // null = create mode; non-null = editing the trigger with that id.
  const [editingId, setEditingId] = React.useState<number | null>(null);

  const reload = React.useCallback(() => {
    api.agentTriggers(agentKey).then(setTriggers).catch(() => setTriggers([]));
  }, [agentKey]);
  React.useEffect(() => {
    reload();
  }, [reload]);
  React.useEffect(() => {
    api.tools().then(setTools).catch(() => setTools([]));
  }, []);

  function toggleTool(key: string) {
    setToolNames((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // resetForm clears the form and returns to "create" mode.
  function resetForm() {
    setEditingId(null);
    setOnInterval(false);
    setIntervalSec("60");
    setOnFinding(false);
    setOnGoalMet(false);
    setOnTaskTimeout(false);
    setOnToolCall(false);
    setOnTaskCreate(false);
    setIntervalMsg("");
    setFindingMsg("");
    setGoalMsg("");
    setTaskTimeoutMsg("");
    setToolCallMsg("");
    setTaskCreateMsg("");
    setToolNames([]);
  }

  // startEdit fills the form with an existing trigger and enters "edit" mode.
  function startEdit(trg: AgentTrigger) {
    setEditingId(trg.id);
    setOnInterval(trg.interval_sec > 0);
    setIntervalSec(trg.interval_sec > 0 ? String(trg.interval_sec) : "60");
    setOnFinding(trg.on_finding);
    setOnGoalMet(trg.on_goal_met);
    setOnTaskTimeout(trg.on_task_timeout);
    setOnToolCall(trg.on_tool_call);
    setOnTaskCreate(trg.on_task_create);
    setIntervalMsg(trg.interval_message);
    setFindingMsg(trg.finding_message);
    setGoalMsg(trg.goal_message);
    setTaskTimeoutMsg(trg.task_timeout_message);
    setToolCallMsg(trg.tool_call_message);
    setTaskCreateMsg(trg.task_create_message);
    setToolNames(trg.tool_names ?? []);
  }

  // submit creates or saves changes based on editingId; editing keeps the trigger's enabled state.
  async function submit() {
    const n = onInterval ? Math.max(1, Math.floor(Number(intervalSec) || 0)) : 0;
    if (n === 0 && !onFinding && !onGoalMet && !onTaskTimeout && !onToolCall && !onTaskCreate) {
      toast.error(t("Select at least one trigger condition"));
      return;
    }
    if (onToolCall && toolNames.length === 0) {
      toast.error(t("Tool-call triggers require at least one tool"));
      return;
    }
    const body = {
      interval_sec: n,
      on_finding: onFinding,
      on_goal_met: onGoalMet,
      on_task_timeout: onTaskTimeout,
      on_tool_call: onToolCall,
      on_task_create: onTaskCreate,
      interval_message: intervalMsg.trim(),
      finding_message: findingMsg.trim(),
      goal_message: goalMsg.trim(),
      task_timeout_message: taskTimeoutMsg.trim(),
      tool_call_message: toolCallMsg.trim(),
      task_create_message: taskCreateMsg.trim(),
      tool_names: onToolCall ? toolNames : [],
    };
    setSaving(true);
    try {
      if (editingId != null) {
        const cur = triggers.find((x) => x.id === editingId);
        await api.updateTrigger(editingId, { ...body, enabled: cur?.enabled ?? true });
        toast.success(t("Changes saved"));
      } else {
        await api.createTrigger(agentKey, { ...body, enabled: true });
        toast.success(t("Trigger added"));
      }
      resetForm();
      reload();
    } catch (e) {
      const error = (e as Error).message;
      toast.error(editingId != null ? t("Save failed: {error}", { error }) : t("Add failed: {error}", { error }));
    } finally {
      setSaving(false);
    }
  }
  async function toggleEnabled(trg: AgentTrigger) {
    try {
      await api.updateTrigger(trg.id, {
        enabled: !trg.enabled,
        interval_sec: trg.interval_sec,
        on_finding: trg.on_finding,
        on_goal_met: trg.on_goal_met,
        on_task_timeout: trg.on_task_timeout,
        on_tool_call: trg.on_tool_call,
        on_task_create: trg.on_task_create,
        interval_message: trg.interval_message,
        finding_message: trg.finding_message,
        goal_message: trg.goal_message,
        task_timeout_message: trg.task_timeout_message,
        tool_call_message: trg.tool_call_message,
        task_create_message: trg.task_create_message,
        tool_names: trg.tool_names,
      });
      reload();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    }
  }
  async function del(id: number) {
    try {
      await api.deleteTrigger(id);
      if (editingId === id) resetForm();
      reload();
    } catch (e) {
      toast.error(t("Delete failed: {error}", { error: (e as Error).message }));
    }
  }

  function condLabel(trg: AgentTrigger): string {
    const parts: string[] = [];
    if (trg.interval_sec > 0) parts.push(t("every {n}s", { n: trg.interval_sec }));
    if (trg.on_finding) parts.push(t("finding found"));
    if (trg.on_goal_met) parts.push(t("goal met"));
    if (trg.on_task_timeout) parts.push(t("task timeout"));
    if (trg.on_tool_call) parts.push(t("tool call ({count})", { count: trg.tool_names.length }));
    if (trg.on_task_create) parts.push(t("task created"));
    return parts.join(" · ") || t("(no conditions)");
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-xs">
        {rich(
          t(
            'Triggers make this custom Agent run automatically: each trigger <b>starts a new conversation</b> (visible on the Chat page). Multiple trigger conditions can be selected; the system automatically appends "why this fired + related task/finding/goal" to the base message you write.',
          ),
        )}
      </p>

      {/* post-trigger handling policy */}
      <div className="grid gap-3 rounded-md border p-3">
        <Label className="text-muted-foreground text-xs">
          {t("Post-trigger handling policy (how triggers are queued/merged to run)")}
        </Label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid gap-1">
            <Label className="text-xs">{t("Run mode")}</Label>
            <Select
              value={runMode}
              onValueChange={(v) => {
                const rm = v as "serial" | "parallel";
                setRunMode(rm);
                saveBehavior({ trigger_run_mode: rm });
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="serial">{t("Serial (queued, one at a time)")}</SelectItem>
                <SelectItem value="parallel">{t("Parallel (independent concurrent sessions)")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">{t("Merge mode")}</Label>
            <Select
              value={mergeMode}
              disabled={runMode === "parallel"}
              onValueChange={(v) => {
                const mm = v as "by_task" | "all" | "none";
                setMergeMode(mm);
                saveBehavior({ trigger_merge_mode: mm });
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="by_task">{t("Merge by task")}</SelectItem>
                <SelectItem value="all">{t("Merge all into one")}</SelectItem>
                <SelectItem value="none">{t("No merge")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {runMode === "parallel" && (
            <div className="grid gap-1">
              <Label htmlFor="tr-maxpar" className="text-xs">{t("Max concurrency (0 = unlimited)")}</Label>
              <Input
                id="tr-maxpar"
                type="number"
                min={0}
                className="h-8 w-28"
                value={maxParallel}
                onChange={(e) => setMaxParallel(e.target.value)}
                onBlur={() => {
                  const n = Math.max(0, Math.floor(Number(maxParallel) || 0));
                  setMaxParallel(String(n));
                  saveBehavior({ trigger_max_parallel: n });
                }}
              />
            </div>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {runMode === "parallel"
            ? t(
                "Parallel: each trigger immediately starts its own concurrent session, no merging; triggers beyond the max concurrency queue for a free slot.",
              )
            : mergeMode === "by_task"
              ? t(
                  "Serial · merge by task: one run at a time per agent; queued events for the same task merge into one conversation.",
                )
              : mergeMode === "all"
                ? t(
                    "Serial · merge all: one run at a time per agent; when dequeuing, all currently queued triggers merge into one conversation.",
                  )
                : t("Serial · no merge: one run at a time per agent; each trigger gets its own conversation.")}
        </p>
      </div>

      {/* create / edit trigger */}
      <div className="grid gap-3 rounded-md border p-3">
        <Label className="text-muted-foreground text-xs">
          {editingId != null
            ? t('Edit trigger #{id} (click "Save changes" when done)', { id: editingId })
            : t("New trigger (each condition can have its own user message)")}
        </Label>

        {/* schedule */}
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onInterval} onCheckedChange={(v) => setOnInterval(!!v)} /> {t("Scheduled trigger")}
          </label>
          {onInterval && (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="tr-interval" className="text-xs">{t("Every")}</Label>
                <Input id="tr-interval" type="number" min={1} className="h-8 w-24"
                  value={intervalSec} onChange={(e) => setIntervalSec(e.target.value)} />
                <span className="text-muted-foreground text-xs">{t("seconds")}</span>
              </div>
              <Textarea className="text-xs" rows={2} value={intervalMsg}
                placeholder={t("Message sent to the agent when the schedule fires, e.g. inspect all tasks")} onChange={(e) => setIntervalMsg(e.target.value)} />
            </div>
          )}
        </div>

        {/* finding */}
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onFinding} onCheckedChange={(v) => setOnFinding(!!v)} /> {t("Trigger on finding")}
          </label>
          {onFinding && (
            <Textarea className="text-xs" rows={2} value={findingMsg}
              placeholder={t("Message sent to the agent when a finding is found (the system attaches task and finding details)")} onChange={(e) => setFindingMsg(e.target.value)} />
          )}
        </div>

        {/* goal met */}
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onGoalMet} onCheckedChange={(v) => setOnGoalMet(!!v)} /> {t("Trigger on goal met")}
          </label>
          {onGoalMet && (
            <Textarea className="text-xs" rows={2} value={goalMsg}
              placeholder={t("Message sent to the agent when a goal is met (the system attaches the task and the met goal)")} onChange={(e) => setGoalMsg(e.target.value)} />
          )}
        </div>

        {/* task timeout */}
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onTaskTimeout} onCheckedChange={(v) => setOnTaskTimeout(!!v)} /> {t("Trigger on task timeout")}
          </label>
          {onTaskTimeout && (
            <Textarea className="text-xs" rows={2} value={taskTimeoutMsg}
              placeholder={t("Message sent to the agent on task timeout (the system attaches the task id and goals)")} onChange={(e) => setTaskTimeoutMsg(e.target.value)} />
          )}
        </div>

        {/* tool call */}
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onToolCall} onCheckedChange={(v) => setOnToolCall(!!v)} /> {t("Trigger on tool call")}
          </label>
          {onToolCall && (
            <div className="grid gap-1.5">
              <div className="text-muted-foreground text-xs">
                {rich(
                  t(
                    "Select the tools to watch (at least one); each time these tools finish a <b>call</b> during task execution, a trigger fires. {count} selected.",
                    { count: toolNames.length },
                  ),
                )}
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                {tools.length === 0 && <span className="text-muted-foreground text-xs">{t("(tool list is empty)")}</span>}
                <div className="grid gap-1">
                  {tools.map((tool) => (
                    <label key={tool.key} className="flex items-start gap-2 text-xs">
                      <Checkbox className="mt-0.5" checked={toolNames.includes(tool.key)}
                        onCheckedChange={() => toggleTool(tool.key)} />
                      <span className="min-w-0">
                        <span className="font-medium">{tool.key}</span>
                        {tool.description && <span className="text-muted-foreground line-clamp-1"> {tool.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <Textarea className="text-xs" rows={2} value={toolCallMsg}
                placeholder={t("Message sent to the agent when a tool is called (the system attaches task info, tool input and output)")} onChange={(e) => setToolCallMsg(e.target.value)} />
            </div>
          )}
        </div>

        {/* task created */}
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onTaskCreate} onCheckedChange={(v) => setOnTaskCreate(!!v)} /> {t("Trigger on task created")}
          </label>
          {onTaskCreate && (
            <Textarea className="text-xs" rows={2} value={taskCreateMsg}
              placeholder={t("Message sent to the agent when a task is created (the system attaches the task id and goals)")} onChange={(e) => setTaskCreateMsg(e.target.value)} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={submit} disabled={saving}>
            <SaveIcon /> {editingId != null ? t("Save changes") : t("Add trigger")}
          </Button>
          {editingId != null && (
            <Button size="sm" variant="ghost" onClick={resetForm} disabled={saving}>
              <XIcon /> {t("Cancel edit")}
            </Button>
          )}
        </div>
      </div>

      {/* existing triggers */}
      <div className="grid gap-2">
        <Label className="text-muted-foreground text-xs">{t("Existing triggers")}</Label>
        {triggers.length === 0 && <span className="text-muted-foreground text-xs">{t("(none)")}</span>}
        {triggers.map((trg) => (
          <div
            key={trg.id}
            className={cn(
              "flex items-start gap-2 rounded-md border p-2 text-sm",
              editingId === trg.id && "border-primary bg-primary/5",
            )}
          >
            <Switch checked={trg.enabled} onCheckedChange={() => toggleEnabled(trg)} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{condLabel(trg)}</span>
                {!trg.enabled && (
                  <Badge variant="outline" className="text-destructive px-1 py-0 text-[9px]">{t("Disabled")}</Badge>
                )}
              </div>
              <div className="text-muted-foreground grid gap-0.5 text-xs">
                {trg.interval_sec > 0 && trg.interval_message && (
                  <div className="line-clamp-1">{t("Schedule: {message}", { message: trg.interval_message })}</div>
                )}
                {trg.on_finding && trg.finding_message && (
                  <div className="line-clamp-1">{t("Finding: {message}", { message: trg.finding_message })}</div>
                )}
                {trg.on_goal_met && trg.goal_message && (
                  <div className="line-clamp-1">{t("Goal: {message}", { message: trg.goal_message })}</div>
                )}
                {trg.on_task_timeout && trg.task_timeout_message && (
                  <div className="line-clamp-1">{t("Timeout: {message}", { message: trg.task_timeout_message })}</div>
                )}
                {trg.on_task_create && trg.task_create_message && (
                  <div className="line-clamp-1">{t("Task created: {message}", { message: trg.task_create_message })}</div>
                )}
                {trg.on_tool_call && (
                  <>
                    <div className="line-clamp-1">
                      {t("Tools: {tools}", { tools: trg.tool_names.join(", ") || t("(none selected)") })}
                    </div>
                    {trg.tool_call_message && (
                      <div className="line-clamp-1">{t("Message: {message}", { message: trg.tool_call_message })}</div>
                    )}
                  </>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
              onClick={() => startEdit(trg)} title={t("Edit")} aria-label={t("Edit")}>
              <PencilIcon className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive"
              onClick={() => del(trg.id)} title={t("Delete")} aria-label={t("Delete")}>
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
