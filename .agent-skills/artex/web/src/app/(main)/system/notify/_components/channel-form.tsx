"use client";

import { CheckIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import type { NotificationFilter } from "@/lib/types";

// asText / inputType are value helpers local to this file (tightly coupled to control rendering); they do not belong in channel-fields.
import { type FieldDef, type FieldKind, SEVERITY_OPTIONS } from "./channel-fields";

// asText renders any config value as a string an input can use.
// config comes from JSON; values may be string / number / boolean / array / null.
// All it cares about is "can it go into a text box" — actual serialization is buildConfig's job.
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

// inputType maps a field kind to the input's type attribute.
function inputType(kind: FieldKind): "text" | "password" | "number" {
  if (kind === "password") return "password";
  if (kind === "number") return "number";
  return "text";
}

// ConfigField renders the control matching a field definition.
//
// Masked fields are the one subtlety here: the input **does not show** the masked value itself, only a
// "Saved" line. That leaves one rule on screen — text in the box means the user typed it,
// an empty box means an empty value. Putting "__masked__:…abc123" into the input would look like placeholder
// text to delete, making accidental credential wipes more likely.
export function ConfigField({
  def,
  value,
  isSecret,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  isSecret: boolean;
  onChange: (v: unknown) => void;
}) {
  const id = `n-cfg-${def.key}`;
  const raw = asText(value);
  // Backend-echoed masked value: shaped like "__masked__:…abc123", with a recognizable tail of the original value.
  const masked = isSecret && raw.startsWith("__masked__");
  const maskedTail = masked ? (raw.split("…")[1] ?? "") : "";

  if (def.kind === "switch") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Switch checked={value === true} onCheckedChange={onChange} aria-label={def.label} />
        {def.label}
        {def.help && <span className="text-muted-foreground">({def.help})</span>}
      </div>
    );
  }

  if (def.kind === "select") {
    return (
      <div className="grid gap-2">
        <Label>{def.label}</Label>
        <Select value={raw || def.options?.[0]?.value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Controls dispatch on field kind. An if chain rather than nested ternaries, because four controls need distinguishing
  // and a three-deep ternary already forces the reader to stop and count brackets.
  function control() {
    if (def.kind === "textarea" || def.kind === "kv") {
      return (
        <Textarea
          id={id}
          className="font-mono"
          placeholder={def.placeholder}
          value={masked ? "" : raw}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (def.kind === "list") {
      return (
        <Input
          id={id}
          value={Array.isArray(value) ? (value as string[]).join(", ") : raw}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
        />
      );
    }
    return (
      <Input
        id={id}
        className={def.kind === "text" ? "font-mono" : ""}
        type={inputType(def.kind)}
        placeholder={def.placeholder}
        value={masked ? "" : raw}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const hint = masked ? (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <CheckIcon className="size-3" />
      {maskedTail
        ? t("Saved (tail {tail}) · enter a new value to overwrite, clear to remove it", { tail: maskedTail })
        : t("Saved · enter a new value to overwrite, clear to remove it")}
    </p>
  ) : (
    def.help && <p className="text-muted-foreground text-xs">{def.help}</p>
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{def.label}</Label>
      {control()}
      {hint}
    </div>
  );
}

// FilterSummary condenses the filter into one line so the card shows what a channel pushes without expanding it.
export function FilterSummary({ filter }: { filter: NotificationFilter }) {
  const parts: string[] = [];
  if (filter.min_severity) {
    parts.push(SEVERITY_OPTIONS.find((o) => o.value === filter.min_severity)?.label ?? filter.min_severity);
  }
  if (filter.vulnclass_include?.length) parts.push(t("{count} type keywords", { count: filter.vulnclass_include.length }));
  if (filter.vulnclass_exclude?.length) parts.push(t("excludes {count} keywords", { count: filter.vulnclass_exclude.length }));
  if (filter.task_ids?.length) parts.push(t("{count} tasks", { count: filter.task_ids.length }));
  if (filter.asset_ids?.length) parts.push(t("{count} assets", { count: filter.asset_ids.length }));
  if (filter.on_status_change) parts.push(t("includes status changes"));
  if (parts.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("All vulnerabilities")}</p>;
  }
  return <p className="text-muted-foreground text-sm">{parts.join(" · ")}</p>;
}
