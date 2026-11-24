"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { t } from "@/i18n";
import type { AssetInterceptKind, AssetInterceptRuleInput } from "@/lib/types";

// Uses NativeSelect (a native <select>) instead of shadcn Select: this editor is used inside a Sheet drawer,
// the shadcn Select dropdown portals to body and an outside click would trigger the drawer's "close on outside click" and close it by mistake; a native dropdown has no such issue.
export const ASSET_INTERCEPT_KIND_OPTIONS: {
  value: AssetInterceptKind;
  label: string;
  placeholder: string;
}[] = [
  { value: "exact_domain", label: t("Domain (exact)"), placeholder: "example.gov.cn" },
  { value: "exact_ip", label: t("IP (exact)"), placeholder: "203.0.113.10" },
  { value: "exact_url", label: t("URL (exact)"), placeholder: "https://example.com/login" },
  { value: "fuzzy_domain", label: t("Domain (fuzzy)"), placeholder: ".gov.cn" },
  { value: "fuzzy_ip", label: t("IP (fuzzy)"), placeholder: "203.0.113." },
  { value: "fuzzy_url", label: t("URL (fuzzy)"), placeholder: "/admin" },
  { value: "cidr", label: t("CIDR range"), placeholder: "192.168.0.0/16" },
];

// AssetInterceptRulesEditor is a controlled multi-row editor for block/allow rules (block/allow +
// type + match content + note), with no built-in persistence — the parent decides when to submit.
export function AssetInterceptRulesEditor({
  value,
  onChange,
}: {
  value: AssetInterceptRuleInput[];
  onChange: (v: AssetInterceptRuleInput[]) => void;
}) {
  function update(i: number, patch: Partial<AssetInterceptRuleInput>) {
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...value, { action: "block", kind: "fuzzy_domain", pattern: "", note: "", enabled: true }]);
  }
  return (
    <div className="grid gap-2">
      {value.map((r, i) => {
        const ph = ASSET_INTERCEPT_KIND_OPTIONS.find((o) => o.value === r.kind)?.placeholder ?? "";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id, controlling by index is fine
          <div key={i} className="flex items-center gap-2">
            <NativeSelect
              size="sm"
              className="w-[84px] shrink-0"
              value={r.action}
              onChange={(e) => update(i, { action: e.target.value as "block" | "allow" })}
            >
              <NativeSelectOption value="block">{t("Block")}</NativeSelectOption>
              <NativeSelectOption value="allow">{t("Allow")}</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="w-[120px] shrink-0"
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as AssetInterceptKind })}
            >
              {ASSET_INTERCEPT_KIND_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              className="flex-1"
              placeholder={ph}
              value={r.pattern}
              onChange={(e) => update(i, { pattern: e.target.value })}
            />
            <Input
              className="w-[120px] shrink-0"
              placeholder={t("Note (optional)")}
              value={r.note}
              onChange={(e) => update(i, { note: e.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive hover:text-destructive size-8 shrink-0"
              onClick={() => remove(i)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={add}>
        <PlusIcon className="size-4" /> {t("Add row")}
      </Button>
    </div>
  );
}
