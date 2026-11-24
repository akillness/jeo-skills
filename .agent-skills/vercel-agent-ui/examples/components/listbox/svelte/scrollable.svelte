<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Listbox,
    ListboxItem,
    ListboxItemIndicator,
  } from "@ui-sdk/svelte/listbox"
  import { useLog } from "../../../shared/svelte/log"

  const timezones = Array.from({ length: 27 }, (_, index) => {
    const offset = index - 12
    const label = `UTC${offset < 0 ? "−" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`
    return { value: `utc${offset}`, label }
  })

  const log = useLog()
</script>

<Listbox
  defaultValue="utc9"
  onHighlight={(value, details) => {
    if (value) {
      log(
        `Focused ${timezones[details.index].label} (${details.index + 1} of ${timezones.length})`
      )
    }
  }}
  aria-label="Time zone"
>
  {#each timezones as zone, index (zone.value)}
    <ListboxItem value={zone.value} {index}>
      {zone.label}
      <ListboxItemIndicator>
        <CheckIcon aria-hidden="true" />
      </ListboxItemIndicator>
    </ListboxItem>
  {/each}
</Listbox>
