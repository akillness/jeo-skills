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
  import { useLog } from "../../../shared/svelte/log"

  const languages = [
    { value: "en", label: "English" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "ja", label: "Japanese" },
    { value: "pt", label: "Portuguese" },
    { value: "es", label: "Spanish" },
  ]

  const log = useLog()
</script>

<Field>
  <FieldLabel>Languages</FieldLabel>
  <Select
    multiple
    defaultValue={["en", "ja"]}
    placeholder="Select languages"
    onValueChange={(value) => log(`value: ${JSON.stringify(value)}`)}
  >
    <SelectTrigger>
      <SelectValue>
        {#snippet children(state)}
          {state.placeholder
            ? "Select languages"
            : state.labels.length > 2
              ? `${state.labels[0]} and ${state.labels.length - 1} more`
              : state.label}
        {/snippet}
      </SelectValue>
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      {#each languages as language (language.value)}
        <SelectItem value={language.value}>
          {language.label}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
