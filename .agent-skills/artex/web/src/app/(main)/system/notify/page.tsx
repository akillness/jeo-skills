"use client";

import * as React from "react";

import { BellIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { NotificationChannel, NotificationFilter, NotificationMeta } from "@/lib/types";

import {
  CHANNEL_FIELDS,
  type ChannelForm,
  emptyForm,
  KIND_LABEL,
  parseIDs,
  parseKeywords,
  parseKV,
  SEVERITY_OPTIONS,
} from "./_components/channel-fields";
import { ConfigField, FilterSummary } from "./_components/channel-form";
import { DeliveryList } from "./_components/delivery-list";
import { formatBacklog, StatTile } from "./_components/stat-tile";

// Upper bounds of the two message render limits. They mirror the backend, which answers 400 outside [0, max].
const SUMMARY_LIMIT_MAX = 4000;
const ASSETS_LIMIT_MAX = 50;

// limitInvalid reports whether a limit input holds anything other than a whole number in [0, max].
// Empty is valid: it is not submitted, so the stored value stays as it is.
function limitInvalid(raw: string, max: number): boolean {
  if (raw.trim() === "") return false;
  const n = Number(raw);
  return !Number.isInteger(n) || n < 0 || n > max;
}

// This page only orchestrates: loading data, holding form state, calling the API.
// Field definitions and parsing live in _components/channel-fields.ts, controls and the filter summary in
// _components/channel-form.tsx, and the delivery log in _components/delivery-list.tsx —
// they are split out because each stays readable on its own, whereas crammed into one file this page neared 1100 lines.
export default function NotifyPage() {
  const [meta, setMeta] = React.useState<NotificationMeta | null>(null);
  const [channels, setChannels] = React.useState<NotificationChannel[]>([]);
  const [tab, setTab] = React.useState<"channels" | "deliveries">("channels");

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NotificationChannel | null>(null);
  const [form, setForm] = React.useState<ChannelForm>(emptyForm("dingtalk"));
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const [globalSaving, setGlobalSaving] = React.useState(false);
  const [baseURL, setBaseURL] = React.useState("");
  const [digestMin, setDigestMin] = React.useState("");
  const [summaryMax, setSummaryMax] = React.useState("");
  const [assetsMax, setAssetsMax] = React.useState("");

  const load = React.useCallback(() => {
    api
      .notifyMeta()
      .then((m) => {
        setMeta(m);
        setBaseURL(m.public_base_url);
        setDigestMin(m.digest_interval_min);
      })
      .catch((e) => toast.error(t("Failed to load notification settings: {error}", { error: (e as Error).message })));
    // The two render limits are not part of /notify/meta; they are only exposed through /api/settings.
    api
      .settings()
      .then((s) => {
        setSummaryMax(String(s.notify_summary_max_runes ?? ""));
        setAssetsMax(String(s.notify_assets_max_shown ?? ""));
      })
      .catch((e) => toast.error(t("Failed to load message limits: {error}", { error: (e as Error).message })));
    // Channel-list load failures must be reported: failing silently would render as "no channels at all",
    // and users would think their config was lost — scarier than a straight-up error.
    api
      .notifyChannels()
      .then(setChannels)
      .catch((e) => toast.error(t("Failed to load channels: {error}", { error: (e as Error).message })));
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  function setF(patch: Partial<ChannelForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function setCfg(key: string, value: unknown) {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm(meta?.kinds[0]?.kind ?? "dingtalk"));
    setOpen(true);
  }

  function openEdit(ch: NotificationChannel) {
    setEditing(ch);
    // filter is a Go struct on the backend and always serializes as an object (never null), so no fallback is needed.
    const f = ch.filter;
    setForm({
      name: ch.name,
      kind: ch.kind,
      mode: ch.mode,
      enabled: ch.enabled,
      ratePerMin: String(ch.rate_per_min),
      // Credentials in the backend-echoed config are masked values; put them into the form as-is and send them back as-is on submit,
      // which tells the backend to keep the stored values.
      config: { ...ch.config },
      minSeverity: f.min_severity ?? "",
      includeText: (f.vulnclass_include ?? []).join("\n"),
      excludeText: (f.vulnclass_exclude ?? []).join("\n"),
      taskIDsText: (f.task_ids ?? []).join(","),
      assetIDsText: (f.asset_ids ?? []).join(","),
      onStatusChange: f.on_status_change ?? false,
    });
    setOpen(true);
  }

  // buildConfig turns form state into the channel config.
  //
  // One rule, two kinds of values:
  //   - masked values ("__masked__...") are sent back verbatim → the backend reads this as "field unchanged, keep the stored value"
  //   - everything else is submitted as user input, where an empty string means "clear this field"
  //
  // Credential fields get no special treatment (no "skip when empty") because that would make it **impossible** to clear
  // a mis-set key — no action in the UI could express "I want this gone". Under the current rule,
  // emptying the input equals clearing the field: one unambiguous, user-controlled semantic.
  // Masked values never appear in inputs (see ConfigField), so "text in the box" always means
  // "the user typed it".
  function buildConfig(): Record<string, unknown> {
    const defs = CHANNEL_FIELDS[form.kind] ?? [];
    const out: Record<string, unknown> = {};
    for (const d of defs) {
      const raw = form.config[d.key];
      if (d.kind === "switch") {
        out[d.key] = raw === true;
        continue;
      }
      if (typeof raw === "string" && raw.startsWith("__masked__")) {
        out[d.key] = raw;
        continue;
      }
      if (d.kind === "number") {
        const n = Number(raw);
        out[d.key] = Number.isFinite(n) && n > 0 ? n : 0;
        continue;
      }
      if (d.kind === "kv") {
        out[d.key] = parseKV(String(raw ?? ""));
        continue;
      }
      if (d.kind === "list") {
        out[d.key] = String(raw ?? "")
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        continue;
      }
      out[d.key] = String(raw ?? "").trim();
    }
    return out;
  }

  function buildFilter(): NotificationFilter {
    return {
      min_severity: form.minSeverity || undefined,
      vulnclass_include: parseKeywords(form.includeText),
      vulnclass_exclude: parseKeywords(form.excludeText),
      task_ids: parseIDs(form.taskIDsText),
      asset_ids: parseIDs(form.assetIDsText),
      on_status_change: form.onStatusChange,
    };
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error(t("Please fill in a channel name"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        mode: form.mode,
        enabled: form.enabled,
        config: buildConfig(),
        filter: buildFilter(),
        rate_per_min: form.ratePerMin.trim() === "" ? undefined : Number(form.ratePerMin),
      };
      if (editing) {
        await api.notifyUpdateChannel(editing.id, payload);
        toast.success(t("Saved"));
        setOpen(false);
      } else {
        await api.notifyCreateChannel(payload);
        toast.success(t("Channel added"));
        setOpen(false);
      }
      load();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function testChannel() {
    if (!editing) return;
    setTesting(true);
    try {
      const r = await api.notifyTestChannel(editing.id);
      toast.success(t("Test message sent ({ms} ms); check the group to confirm", { ms: r.latency_ms }));
    } catch (e) {
      // The backend relays the raw error returned by the channel verbatim — the only clue for debugging the config — so show it as-is.
      toast.error(t("Test failed: {error}", { error: (e as Error).message }), { duration: 12000 });
    } finally {
      setTesting(false);
    }
  }

  async function removeChannel(ch: NotificationChannel) {
    try {
      await api.notifyDeleteChannel(ch.id);
      toast.success(t("Deleted: {name}", { name: ch.name }));
      setOpen(false);
      load();
    } catch (e) {
      toast.error(t("Delete failed: {error}", { error: (e as Error).message }));
    }
  }

  async function toggleEnabled(ch: NotificationChannel) {
    try {
      await api.notifyUpdateChannel(ch.id, { enabled: !ch.enabled });
      load();
    } catch (e) {
      toast.error(t("Operation failed: {error}", { error: (e as Error).message }));
    }
  }

  async function toggleGlobal(on: boolean) {
    setGlobalSaving(true);
    try {
      await api.setSettings({ notify_enabled: on });
      setMeta((m) => (m ? { ...m, enabled: on } : m));
      toast.success(on ? t("Push enabled") : t("Push paused"));
    } catch (e) {
      toast.error(t("Operation failed: {error}", { error: (e as Error).message }));
    } finally {
      setGlobalSaving(false);
    }
  }

  async function saveGlobal() {
    // Checked before anything is sent: the backend applies the fields of one PUT in order,
    // so a 400 on a limit would leave the URL and digest interval already saved.
    if (limitInvalid(summaryMax, SUMMARY_LIMIT_MAX)) {
      toast.error(t("Summary length must be a whole number between 0 and {max}", { max: SUMMARY_LIMIT_MAX }));
      return;
    }
    if (limitInvalid(assetsMax, ASSETS_LIMIT_MAX)) {
      toast.error(t("Assets listed must be a whole number between 0 and {max}", { max: ASSETS_LIMIT_MAX }));
      return;
    }
    setGlobalSaving(true);
    try {
      const patch: Record<string, unknown> = { notify_public_base_url: baseURL.trim() };
      const n = Number(digestMin);
      if (Number.isFinite(n) && n > 0) patch.notify_digest_interval_min = n;
      if (summaryMax.trim() !== "") patch.notify_summary_max_runes = Number(summaryMax);
      if (assetsMax.trim() !== "") patch.notify_assets_max_shown = Number(assetsMax);
      await api.setSettings(patch);
      toast.success(t("Saved"));
      load();
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setGlobalSaving(false);
    }
  }

  const fields = CHANNEL_FIELDS[form.kind] ?? [];
  const secretKeys = new Set(meta?.kinds.find((k) => k.kind === form.kind)?.secret_keys ?? []);
  const defaultRate = meta?.kinds.find((k) => k.kind === form.kind)?.default_rate_per_min ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Notifications")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("Push findings to DingTalk / Feishu / WeCom and other channels · each channel has its own delivery timing and filter rules")}
          </p>
        </div>
        {meta && (
          // A div, not a label: the Switch carries its own aria-label, and wrapping it in a label
          // would associate it with no native control while making the text look like it should toggle.
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Master switch")}</span>
            <Switch
              checked={meta.enabled}
              disabled={globalSaving}
              onCheckedChange={toggleGlobal}
              aria-label={t("Push master switch")}
            />
          </div>
        )}
      </div>

      {meta && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label={t("Channels")} value={`${meta.stats.channels_on} / ${meta.stats.channels}`} hint={t("On / total")} />
          <StatTile label={t("Sent today")} value={String(meta.stats.sent_today)} />
          <StatTile label={t("Pending")} value={String(meta.stats.pending)} />
          <StatTile label={t("Failed")} value={String(meta.stats.failed)} tone={meta.stats.failed > 0 ? "red" : undefined} />
          <StatTile
            label={t("Oldest backlog")}
            value={formatBacklog(meta.stats.backlog_age_ms)}
            // Backlog age is far more useful than backlog count: 3 backlogged items could mean 3 seconds or 3 hours.
            hint={meta.stats.backlog_age_ms > 5 * 60_000 ? t("Push may be stuck") : undefined}
            tone={meta.stats.backlog_age_ms > 5 * 60_000 ? "red" : undefined}
          />
        </div>
      )}

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">{t("Global settings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="n-base">{t("Link-back URL")}</Label>
            <Input
              id="n-base"
              placeholder="https://artex.example.com"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("The address the \"View details\" button in messages points to. Leave empty to omit the button.")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-digest">{t("Digest interval (minutes)")}</Label>
            <Input
              id="n-digest"
              type="number"
              min={1}
              max={1440}
              placeholder="30"
              value={digestMin}
              onChange={(e) => setDigestMin(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("Only applies to channels in \"digest\" mode.")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-summary-max">{t("Summary length (characters)")}</Label>
            <Input
              id="n-summary-max"
              type="number"
              min={0}
              max={SUMMARY_LIMIT_MAX}
              step={1}
              placeholder="120"
              value={summaryMax}
              onChange={(e) => setSummaryMax(e.target.value)}
              aria-invalid={limitInvalid(summaryMax, SUMMARY_LIMIT_MAX)}
            />
            <p className="text-muted-foreground text-xs">
              {t("Longest finding summary shown in a message, 0–{max}. 0 = no truncation.", { max: SUMMARY_LIMIT_MAX })}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-assets-max">{t("Assets listed per finding")}</Label>
            <Input
              id="n-assets-max"
              type="number"
              min={0}
              max={ASSETS_LIMIT_MAX}
              step={1}
              placeholder="3"
              value={assetsMax}
              onChange={(e) => setAssetsMax(e.target.value)}
              aria-invalid={limitInvalid(assetsMax, ASSETS_LIMIT_MAX)}
            />
            <p className="text-muted-foreground text-xs">
              {t("Most asset names listed for a finding, 0–{max}. 0 = no truncation (all assets listed).", { max: ASSETS_LIMIT_MAX })}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={saveGlobal} disabled={globalSaving}>
              {t("Save global settings")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "channels" | "deliveries")} className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="channels">{t("Channels")}</TabsTrigger>
          <TabsTrigger value="deliveries">{t("Delivery log")}</TabsTrigger>
        </TabsList>

        <TabsContent value="channels">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={openAdd}
              className="text-foreground/70 border-foreground/70 hover:bg-muted/60 hover:shadow-sm flex min-h-[130px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition"
            >
              <PlusIcon className="size-6" />
              <span className="text-sm">{t("Add channel")}</span>
            </button>

            {channels.map((ch) => (
              <Card
                key={ch.id}
                onClick={() => openEdit(ch)}
                className="hover:border-primary/60 cursor-pointer gap-3 transition hover:shadow-sm"
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BellIcon className="text-muted-foreground size-4 shrink-0" />
                    <CardTitle className="truncate text-base">{ch.name}</CardTitle>
                    {/* The whole card is clickable (opens the editor), so these two controls must each swallow the bubbling click,
                        otherwise toggling/deleting would also trigger editing. stopPropagation hangs off the controls themselves
                        rather than a wrapping div: a div wrapper would create a static element that "looks interactive but has no
                        role", tripping a11y warnings and making no semantic sense either. */}
                    <div className="ml-auto flex items-center gap-2">
                      <Switch
                        checked={ch.enabled}
                        onCheckedChange={() => toggleEnabled(ch)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("Enable")}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("Delete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          // void explicitly discards the Promise: removeChannel catches and toasts on its own,
                          // so no await is needed here (onClick is not async).
                          void removeChannel(ch);
                        }}
                      >
                        <Trash2Icon className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{KIND_LABEL[ch.kind] ?? ch.kind}</Badge>
                    <Badge variant="outline">{ch.mode === "digest" ? t("Digest") : t("Realtime")}</Badge>
                    {!ch.enabled && <Badge variant="outline">{t("Disabled")}</Badge>}
                  </div>
                  <FilterSummary filter={ch.filter} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="deliveries">
          <DeliveryList channels={channels} />
        </TabsContent>
      </Tabs>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? editing.name : t("Add notification channel")}</SheetTitle>
            <SheetDescription>
              {KIND_LABEL[form.kind] ?? form.kind}
              {" · "}
              {defaultRate > 0 ? t("default rate limit {rate}/min", { rate: defaultRate }) : t("no rate limit")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{t("Channel type")}</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => {
                    // Switching type means switching to a different set of credential fields; the old config cannot be merged in.
                    setF({ kind: v, config: {} });
                  }}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(meta?.kinds ?? []).map((k) => (
                      <SelectItem key={k.kind} value={k.kind}>
                        {KIND_LABEL[k.kind] ?? k.kind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing && (
                  <p className="text-muted-foreground text-xs">
                    {t("The channel type cannot be changed — a different type means a different set of credentials; create a new channel instead.")}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="n-name">{t("Channel name")}</Label>
                <Input
                  id="n-name"
                  placeholder={t("Incident response group / Daily broadcast group")}
                  value={form.name}
                  onChange={(e) => setF({ name: e.target.value })}
                />
              </div>

              {fields.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("The form for this channel type is not defined yet (the frontend is missing a CHANNEL_FIELDS entry); add it and retry.")}
                </p>
              ) : (
                fields.map((d) => (
                  <ConfigField
                    key={d.key}
                    def={d}
                    value={form.config[d.key]}
                    isSecret={secretKeys.has(d.key)}
                    onChange={(v) => setCfg(d.key, v)}
                  />
                ))
              )}

              <div className="grid gap-2">
                <Label>{t("Delivery timing")}</Label>
                <Select value={form.mode} onValueChange={(v) => setF({ mode: v as "realtime" | "digest" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realtime">{t("Realtime · one message per finding")}</SelectItem>
                    <SelectItem value="digest">{t("Digest · merged into one message per interval")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {t("For \"realtime for High, digest for the rest\", create two channels: one realtime with a High threshold, one digest with no severity limit.")}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="n-rate">{t("Rate limit (messages/min)")}</Label>
                <Input
                  id="n-rate"
                  type="number"
                  min={0}
                  placeholder={defaultRate > 0 ? String(defaultRate) : t("0 = unlimited")}
                  value={form.ratePerMin}
                  onChange={(e) => setF({ ratePerMin: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">
                  {t("Leave empty to use the channel default; 0 means no limit. Going over the limit never drops messages, only delays them.")}
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium">{t("Filter rules (empty = no filtering)")}</p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>{t("Minimum severity")}</Label>
                    <Select
                      value={form.minSeverity || "all"}
                      onValueChange={(v) => setF({ minSeverity: v === "all" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value || "all"} value={o.value || "all"}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="n-inc">{t("Only these vulnerability types")}</Label>
                    <Textarea
                      id="n-inc"
                      placeholder={"SQL injection\ncommand execution"}
                      value={form.includeText}
                      onChange={(e) => setF({ includeText: e.target.value })}
                    />
                    <p className="text-muted-foreground text-xs">
                      {t("One keyword per line, matched case-insensitively as a substring. Leave empty for all types.")}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="n-exc">{t("Exclude these vulnerability types")}</Label>
                    <Textarea
                      id="n-exc"
                      placeholder={"Information disclosure"}
                      value={form.excludeText}
                      onChange={(e) => setF({ excludeText: e.target.value })}
                    />
                    <p className="text-muted-foreground text-xs">{t("Exclusion beats inclusion: an item matching both is excluded.")}</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="n-tasks">{t("Restrict to task IDs")}</Label>
                    <Input
                      id="n-tasks"
                      placeholder="1, 2, 3"
                      value={form.taskIDsText}
                      onChange={(e) => setF({ taskIDsText: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="n-assets">{t("Restrict to asset IDs")}</Label>
                    <Input
                      id="n-assets"
                      placeholder="10, 11"
                      value={form.assetIDsText}
                      onChange={(e) => setF({ assetIDsText: e.target.value })}
                    />
                    <p className="text-muted-foreground text-xs">{t("Empty task/asset = no restriction; when filled, the finding must intersect them.")}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={form.onStatusChange}
                      onCheckedChange={(v) => setF({ onStatusChange: v })}
                      aria-label={t("Include status changes")}
                    />
                    {t("Also push when a finding's status changes (realtime mode only)")}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Switch checked={form.enabled} onCheckedChange={(v) => setF({ enabled: v })} aria-label={t("Enable")} />
                {t("Enable this channel")}
              </div>
            </div>

            <div className="flex gap-2 pt-2 pb-6">
              <Button onClick={saveForm} disabled={saving}>
                {editing ? t("Save") : t("Add")}
              </Button>
              {editing && (
                <Button variant="outline" onClick={testChannel} disabled={testing}>
                  <SendIcon /> {t("Send test message")}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
