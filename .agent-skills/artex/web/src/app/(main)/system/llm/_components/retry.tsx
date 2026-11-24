"use client";

// Shared pieces of the LLM retry settings: "attempts + interval" for each of the five retry layers.
//
// The five layers, innermost to outermost: connect (SDK) → empty response (SDK) → same-provider safe window → pool breaker → intent rerun.
// The first three travel with the endpoint, so every model profile can override the global defaults; the last two are process-level and exist only once globally.
//
// All inputs follow the same "empty = unconfigured" semantics, matching the backend db.RetryRule:
//   attempts   empty/0 = built-in default | -1 = disable this layer's retries | >0 = use this count
//   interval   empty/0 = this layer's original exponential backoff | >0 = use this fixed interval in milliseconds

import * as React from "react";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { LLMRetryOverride, LLMRetryPolicy, LLMRetryRule } from "@/lib/types";

export const ZERO_RULE: LLMRetryRule = { attempts: 0, interval_ms: 0 };
export const ZERO_OVERRIDE: LLMRetryOverride = {
  connect: ZERO_RULE,
  empty: ZERO_RULE,
  stream: ZERO_RULE,
};
const ZERO_POLICY: LLMRetryPolicy = {
  ...ZERO_OVERRIDE,
  breaker: ZERO_RULE,
  intent: ZERO_RULE,
};

type LayerMeta = {
  title: string;
  /** Where this retry layer happens and who runs it */
  where: string;
  /** Which errors reach this layer — down to status codes, no guessing */
  trigger: string;
  /** Errors that look similar but do [not] go through this layer, so nobody thinks it is a bug after seeing no effect */
  skips?: string;
  desc: string;
  attemptsLabel: string;
  /** Default attempts when left empty, used for the placeholder */
  defAttempts: number;
  /** Default interval strategy when left empty, used for the placeholder */
  defInterval: string;
  /** Meaning of entering -1 for attempts */
  offHint: string;
};

export const RETRY_LAYERS = {
  connect: {
    title: t("Connect retry"),
    where: t("SDK · before a 200 arrives"),
    trigger: t("Cannot connect or no 200 yet: network-layer errors such as connection reset / read-write timeout / DNS failure, plus HTTP 408, 429, 500, 502, 503, 504."),
    skips: t("The remaining status codes (400 / 401 / 403 / 404 / 413 / 422 etc.) are deterministic rejections — resending fails the same way, so they bubble up directly."),
    desc: t("Resends the same request verbatim. Once the stream has started (a 200 was received), a mid-stream drop is no longer this layer's business."),
    attemptsLabel: t("Retry attempts"),
    defAttempts: 3,
    defInterval: t("0.5s→1s→2s exponential (capped at 8s)"),
    offHint: t("-1 = no retries at all; the failure bubbles up immediately"),
  },
  empty: {
    title: t("Empty-response retry"),
    where: t("SDK · openai format only"),
    trigger: t("HTTP 200 with a normal stop finish_reason, yet not a single content block in the response — gateway empty frames, dropped thinking-field frames and sampling hiccups all look like this."),
    skips: t("Empty because of max_tokens truncation does not count (fix that by raising the output cap; resending just hits it again)."),
    desc: t("Resends the entire prompt, so it is relatively expensive on long contexts; keep the count small."),
    attemptsLabel: t("Retry attempts"),
    defAttempts: 2,
    defInterval: t("0.5s→1s→2s exponential (capped at 8s)"),
    offHint: t("-1 = hand the empty response through as-is"),
  },
  stream: {
    title: t("Same-provider safe-window retry"),
    where: t("This project · before any output is delivered"),
    trigger: t("Trouble only after the stream is established (a 200 received): mid-stream disconnects, provider overloaded, in-stream 429 / 5xx error events — while not a single token has been handed to the caller yet."),
    skips: t("Quota exhausted (402 / insufficient_quota, handed to the pool to switch configs), context too long (413 / context length, handed to compression), and deterministic rejections (400 / 401 / 403 / 404 / 422) are never retried."),
    desc: t("Replays the same request on the same config. Since no output has been delivered yet, the replay cannot duplicate model output or tool executions."),
    attemptsLabel: t("Retry attempts"),
    defAttempts: 2,
    defInterval: t("0.5s→1s exponential (capped at 4s)"),
    offHint: t("-1 = a broken stream goes straight to the outer intent rerun"),
  },
  breaker: {
    title: t("Pool breaker"),
    where: t("This project · process-level, one global copy"),
    trigger: t("Trips when transient failures (429, 5xx, network errors) accumulate consecutively to the threshold; deterministic failures — insufficient balance (402), dead key (401 / 403), missing model (404) — ignore the threshold and trip on the first occurrence."),
    skips: t("One success resets the counter, so an occasionally flaky config is not slowly ground into tripping."),
    desc: t("After tripping it enters cooldown, and while cooling the pool skips the config outright. State is persisted, surviving restarts."),
    attemptsLabel: t("Consecutive failures to trip"),
    defAttempts: 3,
    defInterval: t("1min→5min→30min gradient"),
    offHint: t("-1 = transient failures never trip (deterministic failures still do)"),
  },
  intent: {
    title: t("Intent rerun"),
    where: t("This project · process-level, one global copy"),
    trigger: t("The earlier layers could not save it: the worker ends with model_error — inner retries all exhausted, or the stream broke only after output delivery had started (when replay is unsafe and only a full rerun works)."),
    skips: t("Quota exhaustion is already handled by the pool switching configs and is not rerun here; when the task is paused / aborted / wrapping up it yields immediately, spending no backoff time."),
    desc: t("Reruns the whole intent from scratch. It is the outermost layer, so one rerun multiplies the inner layers' attempt counts once more."),
    attemptsLabel: t("Rerun attempts"),
    defAttempts: 2,
    defInterval: t("Fixed 3s"),
    offHint: t("-1 = no rerun; the intent is marked blocked outright"),
  },
} satisfies Record<string, LayerMeta>;

type LayerKey = keyof typeof RETRY_LAYERS;

/** Milliseconds in human terms, only echoed next to the input so nobody counts zeros. */
function humanMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return t("{n}ms", { n: ms });
  if (ms < 60_000) return t("{n}s", { n: Number((ms / 1000).toFixed(2)) });
  return t("{n}min", { n: Number((ms / 60_000).toFixed(2)) });
}

/** Controlled numeric input: empty string ↔ 0; intermediate states ("-", "1e") stay local and never bother the parent. */
function NumField({
  id,
  value,
  onChange,
  placeholder,
  min,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  placeholder: string;
  min: number;
}) {
  const [text, setText] = React.useState(value === 0 ? "" : String(value));
  // Keeps up when the parent swaps in a whole new set of values (policy loaded, profile switched); typing never reaches this,
  // because by then value already equals the parsed result of the local text.
  React.useEffect(() => {
    const incoming = value === 0 ? "" : String(value);
    setText((cur) => (Number(cur || 0) === value ? cur : incoming));
  }, [value]);
  return (
    <Input
      id={id}
      type="number"
      min={min}
      className="w-28 shrink-0"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? 0 : Math.trunc(n));
      }}
    />
  );
}

/** The two knobs of one retry layer. idPrefix keeps the label's htmlFor unique when it appears multiple times on one page. */
export function RetryRuleFields({
  layer,
  idPrefix,
  value,
  onChange,
  compact,
}: {
  layer: LayerKey;
  idPrefix: string;
  value: LLMRetryRule;
  onChange: (r: LLMRetryRule) => void;
  /** true = compact version inside the profile drawer: skips the expanded explanations, keeping only the "which errors reach this layer" line */
  compact?: boolean;
}) {
  const meta = RETRY_LAYERS[layer];
  const human = humanMs(value.interval_ms);
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 rounded-lg border p-3"}>
      <div className="grid gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <Label className="text-sm">{meta.title}</Label>
          <span className="text-muted-foreground text-xs">{meta.where}</span>
        </div>
        {/* Which errors reach this layer, down to status codes — if the knobs seem to have no effect, the error most likely does not land on this layer at all. */}
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground">{t("Triggers")}</span>: {meta.trigger}
        </p>
        {!compact && meta.skips && (
          <p className="text-muted-foreground text-xs">
            <span className="font-medium text-foreground">{t("Skipped here")}</span>: {meta.skips}
          </p>
        )}
        {!compact && <p className="text-muted-foreground text-xs">{meta.desc}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-n`} className="text-muted-foreground text-xs">
            {meta.attemptsLabel}
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-n`}
            min={-1}
            value={value.attempts}
            placeholder={t("Default {count}", { count: meta.defAttempts })}
            onChange={(n) => onChange({ ...value, attempts: n })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-ms`} className="text-muted-foreground text-xs">
            {t("Interval ms")}
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-ms`}
            min={0}
            value={value.interval_ms}
            placeholder={t("Default backoff")}
            onChange={(n) => onChange({ ...value, interval_ms: n })}
          />
          <span className="text-muted-foreground text-xs">
            {human ? t("Fixed {value}", { value: human }) : meta.defInterval}
          </span>
        </div>
      </div>
      {!compact && (
        <p className="text-muted-foreground text-xs">{t("Empty = use the default; {hint}.", { hint: meta.offHint })}</p>
      )}
    </div>
  );
}

/** The three-layer override in the model profile drawer (the three layers that travel with the endpoint). */
export function ProfileRetryFields({
  value,
  onChange,
}: {
  value: LLMRetryOverride;
  onChange: (o: LLMRetryOverride) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label className="text-sm">{t("Retry overrides")}</Label>
        <p className="text-muted-foreground text-xs">
          {t(
            'Applies only to this profile, overriding the global defaults from "Retry & backoff". Each field left empty = follow the global; attempts -1 = disable this layer; a filled interval replaces the exponential backoff with a fixed one. The breaker and intent rerun are process-level and can only be tuned on the global page.',
          )}
        </p>
      </div>
      {(["connect", "empty", "stream"] as const).map((k) => (
        <div key={k} className="border-t pt-3 first:border-t-0 first:pt-0">
          <RetryRuleFields
            compact
            layer={k}
            idPrefix="pf"
            value={value[k]}
            onChange={(r) => onChange({ ...value, [k]: r })}
          />
        </div>
      ))}
    </div>
  );
}

/** The "Retry & backoff" tab: global defaults for the five layers. */
export function RetryPolicyPanel() {
  const [policy, setPolicy] = React.useState<LLMRetryPolicy>(ZERO_POLICY);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.llmRetryPolicy();
      setPolicy({ ...ZERO_POLICY, ...p });
    } catch (e) {
      toast.error(t("Failed to load retry policy: {error}", { error: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // The backend clamps out-of-range values back into the interval and returns them; refresh straight from the reply so what you see is what is stored.
      const saved = await api.saveLLMRetryPolicy(policy);
      setPolicy({ ...ZERO_POLICY, ...saved });
      toast.success(t("Saved; takes effect immediately (calls already in flight still use the old parameters)"));
    } catch (e) {
      toast.error(t("Save failed: {error}", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: LayerKey) => (r: LLMRetryRule) => setPolicy((p) => ({ ...p, [k]: r }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-10 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" /> {t("Loading retry policy…")}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-xs leading-relaxed">
        {t(
          "A failed model call passes through five retry layers in turn, innermost to outermost: <b>connect → empty response → same-provider safe window → pool breaker → intent rerun</b>. An outer layer only gets what the inner ones exhausted, so the attempt counts <b>multiply</b> — max out every layer and a single hiccup can burn dozens of requests. Leaving everything empty keeps the current defaults, identical to the behavior before this page existed. The first three layers can be overridden per model profile.",
        )
          .split(/<b>(.*?)<\/b>/)
          .map((part, i) =>
            i % 2 === 1 ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: static split of one translated sentence
              <span key={i} className="text-foreground">
                {part}
              </span>
            ) : (
              part
            ),
          )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(RETRY_LAYERS) as LayerKey[]).map((k) => (
          <RetryRuleFields key={k} layer={k} idPrefix="gl" value={policy[k]} onChange={set(k)} />
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {t("Save")}
        </Button>
        <Button variant="outline" onClick={() => setPolicy(ZERO_POLICY)} disabled={saving}>
          {t("Reset all to defaults")}
        </Button>
      </div>
    </div>
  );
}
