"use client";

import * as React from "react";

import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { LLMProfile } from "@/lib/types";

interface TaskLLMProfileChainProps {
  rotate?: boolean;
  onRotateChange?: (rotate: boolean) => void;
  profiles: LLMProfile[];
  value: string[];
  onValueChange: (value: string[]) => void;
  activeProfileId?: string;
  onActiveProfileChange?: (value: string) => void;
  disabled?: boolean;
  inputId?: string;
  portalContainer?: React.RefObject<HTMLElement | null>;
}

function ProfileRoleBadge({ index, currentIndex }: { index: number; currentIndex: number }) {
  if (index === currentIndex) return <Badge variant="default">{t("Current")}</Badge>;
  if (index < currentIndex) {
    return (
      <Badge variant="outline" title={t("Profiles before the current cursor are not picked by automatic failover")}>
        {t("Skipped")}
      </Badge>
    );
  }
  return <Badge variant="secondary">{t("Fallback {n}", { n: index - currentIndex })}</Badge>;
}

export function TaskLLMProfileChain({
  rotate = false,
  onRotateChange,
  profiles,
  value,
  onValueChange,
  activeProfileId,
  onActiveProfileChange,
  disabled = false,
  inputId,
  portalContainer,
}: TaskLLMProfileChainProps) {
  const rotationID = React.useId();
  const [workerBinding, setWorkerBinding] = React.useState<number | null>(null);
  const [bindingCheckFailed, setBindingCheckFailed] = React.useState(false);
  React.useEffect(() => {
    api
      .agents()
      .then((agents) => setWorkerBinding(agents.find((a) => a.key === "worker")?.llm_profile_id ?? null))
      .catch(() => setBindingCheckFailed(true));
  }, []);
  const profilesByID = React.useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const itemIDs = React.useMemo(() => profiles.map((profile) => profile.id), [profiles]);
  const profilesUnavailable = profiles.length === 0;
  const currentProfileID = activeProfileId && value.includes(activeProfileId) ? activeProfileId : value[0];
  const currentIndex = value.indexOf(currentProfileID);
  // api_key_hint is display-only and is empty for valid keys shorter than four
  // characters. The task API remains authoritative for profile validation.

  const profileLabel = React.useCallback(
    (id: string) => {
      const profile = profilesByID.get(id);
      return profile ? `${profile.name} ${profile.model}` : t("Profile #{id}", { id });
    },
    [profilesByID],
  );

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onValueChange(next);
  };

  const remove = (id: string) => {
    const next = value.filter((profileID) => profileID !== id);
    onValueChange(next);
    if (activeProfileId === id) onActiveProfileChange?.(next[0] ?? "");
  };

  const handleValueChange = (next: string[]) => {
    onValueChange(next);
    if (activeProfileId && !next.includes(activeProfileId)) {
      onActiveProfileChange?.(next[0] ?? "");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {onRotateChange && (
        <div className="flex flex-col gap-2">
          <label htmlFor={rotationID} className="flex items-center justify-between gap-3 font-medium text-sm">
            {t("Enable multi-LLM worker rotation")}
            <Switch id={rotationID} checked={rotate} onCheckedChange={onRotateChange} disabled={disabled} />
          </label>
          <p className="text-muted-foreground text-xs">
            {rotate
              ? t(
                  "New worker intents use the selected profiles in round-robin order. Independent workers can run on different providers simultaneously. Other roles keep the current profile.",
                )
              : t(
                  "Ordered failover: workers share the current profile and switch after quota exhaustion or repeated provider failures.",
                )}
          </p>
          {rotate && value.length < 2 && (
            <p className="text-amber-600 text-xs">{t("Select at least two profiles to distribute work across providers.")}</p>
          )}
          {rotate && workerBinding != null && (
            <p role="alert" className="text-amber-600 text-xs">
              {t(
                "Worker has a fixed model binding, which overrides rotation. Set Worker’s model to follow the task in Agent settings to use these profiles.",
              )}
            </p>
          )}
          {rotate && bindingCheckFailed && (
            <p className="text-amber-600 text-xs">
              {t("Worker binding could not be checked. A fixed Worker model overrides rotation; verify Agent settings.")}
            </p>
          )}
          {rotate && (
            <p className="text-muted-foreground text-xs">
              {t(
                "Set concurrent worker count to at least 2 in System settings before starting the task. In-flight calls keep their provider. Exhausted profiles are skipped until the chain is reset.",
              )}
            </p>
          )}
        </div>
      )}
      <Combobox
        items={itemIDs}
        itemToStringValue={profileLabel}
        multiple
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <ComboboxChips>
          <ComboboxValue>
            {value.map((id) => (
              <ComboboxChip key={id}>{profilesByID.get(id)?.name ?? `#${id}`}</ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            id={inputId}
            placeholder={profiles.length > 0 ? t("Search and add LLM profiles") : t("No LLM profiles available")}
            disabled={disabled ? true : profilesUnavailable}
          />
        </ComboboxChips>
        <ComboboxContent portalContainer={portalContainer}>
          <ComboboxEmpty>{t("No matching LLM profiles")}</ComboboxEmpty>
          <ComboboxList>
            {(id) => {
              const profile = profilesByID.get(id);
              return (
                <ComboboxItem key={id} value={id} disabled={!profile}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">
                        {profile?.is_default
                          ? t("{name} (active)", { name: profile.name })
                          : (profile?.name ?? t("Profile #{id}", { id }))}
                      </span>
                    </span>
                    {profile && <span className="truncate text-muted-foreground text-xs">{profile.model}</span>}
                  </div>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {value.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("When no profile is set, the task follows the agent or the global active profile.")}
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {value.map((id, index) => {
            const profile = profilesByID.get(id);
            return (
              <div
                key={id}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 sm:flex"
              >
                <span className="w-5 shrink-0 text-center text-muted-foreground text-xs tabular-nums">{index + 1}</span>
                <div className="min-w-0 sm:flex-1">
                  <p className="truncate font-medium text-sm">{profile?.name ?? t("Profile #{id}", { id })}</p>
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-muted-foreground text-xs">{profile?.model ?? t("Profile unavailable")}</p>
                  </div>
                </div>
                {rotate ? (
                  <Badge variant="secondary">{t("Rotation {n}", { n: index + 1 })}</Badge>
                ) : (
                  <ProfileRoleBadge index={index} currentIndex={currentIndex} />
                )}
                <div className="col-span-2 col-start-2 flex shrink-0 items-center gap-1 justify-self-end sm:col-auto sm:justify-self-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("Move profile up")}
                    onClick={() => move(index, -1)}
                    disabled={disabled ? true : index === 0}
                  >
                    <ArrowUpIcon data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("Move profile down")}
                    onClick={() => move(index, 1)}
                    disabled={disabled ? true : index === value.length - 1}
                  >
                    <ArrowDownIcon data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("Remove profile")}
                    onClick={() => remove(id)}
                    disabled={disabled}
                  >
                    <XIcon data-icon="inline-start" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onActiveProfileChange && value.length > 0 && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="font-medium text-sm">{rotate ? t("Planner / failover profile") : t("Current profile")}</span>
          <Select
            value={activeProfileId && value.includes(activeProfileId) ? activeProfileId : value[0]}
            onValueChange={onActiveProfileChange}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-full sm:min-w-48 sm:max-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {value.map((id) => {
                  const profile = profilesByID.get(id);
                  return (
                    <SelectItem key={id} value={id} disabled={!profile}>
                      {profile?.name ?? t("Profile #{id}", { id })}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
