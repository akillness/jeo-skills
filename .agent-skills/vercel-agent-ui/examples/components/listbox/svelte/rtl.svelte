<script lang="ts">
  import { Listbox, ListboxItem } from "@ui-sdk/svelte/listbox"

  const views = [
    { value: "day", label: "יום" },
    { value: "week", label: "שבוע" },
    { value: "month", label: "חודש" },
  ]
</script>

<div dir="rtl">
  <Listbox orientation="horizontal" defaultValue="day" aria-label="תצוגה">
    {#each views as view (view.value)}
      <ListboxItem value={view.value}>
        {view.label}
      </ListboxItem>
    {/each}
  </Listbox>
</div>
