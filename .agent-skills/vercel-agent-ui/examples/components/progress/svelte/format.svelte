<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
  } from "@ui-sdk/svelte/progress"

  const bars = [
    {
      label: "Download",
      value: 120,
      max: 250,
      format: { style: "unit", unit: "gigabyte" },
    },
    {
      label: "Video render",
      value: 87.25,
      format: { style: "percent", maximumFractionDigits: 1 },
    },
    {
      label: "Backup",
      value: 45,
      max: 60,
      format: (minutes: number) => `${60 - minutes} min left`,
    },
    { label: "Synchronisierung", value: 40, locale: "de-DE" },
  ] satisfies {
    label: string
    value: number
    max?: number
    format?: Intl.NumberFormatOptions | ((value: number) => string)
    locale?: string
  }[]
</script>

<div data-slot="stack">
  {#each bars as { label, ...options } (label)}
    <Progress {...options}>
      <ProgressLabel>{label}</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  {/each}
</div>
