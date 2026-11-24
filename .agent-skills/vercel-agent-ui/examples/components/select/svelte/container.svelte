<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const fonts = [
    { value: "inter", label: "Inter" },
    { value: "geist", label: "Geist" },
    { value: "source-serif", label: "Source Serif" },
    { value: "geist-mono", label: "Geist Mono" },
  ]

  let container = $state<HTMLDivElement | null>(null)
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Font</FieldLabel>
    <Select {container} defaultValue="inter">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each fonts as font (font.value)}
          <SelectItem value={font.value}>
            {font.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
  <div bind:this={container} data-slot="card"></div>
</div>
