<!-- Checked by svelte-check, never rendered: a Select's and a Combobox's value takes its type from `value`, `items` and `multiple`, never `any`. -->
<script lang="ts">
  import { Combobox } from "../../src/combobox"
  import { Select } from "../../src/select"

  type Status = "todo" | "done"
  let status: Status | null = $state("todo")
  let labels: string[] = $state([])
  const statuses: { value: Status; label: string }[] = [
    { value: "todo", label: "Todo" },
  ]

  function typed<V>(value: 0 extends 1 & V ? never : V) {
    return value
  }
</script>

<Select
  items={statuses}
  value={status}
  onValueChange={(value) => (status = typed<typeof value>(value))}
/>
<Select
  multiple
  value={labels}
  onValueChange={(value) => (labels = typed<typeof value>(value))}
/>
<Combobox
  items={statuses}
  value={status}
  onValueChange={(value) => (status = typed<typeof value>(value))}
/>
<Combobox
  multiple
  value={labels}
  onValueChange={(value) => (labels = typed<typeof value>(value))}
/>
