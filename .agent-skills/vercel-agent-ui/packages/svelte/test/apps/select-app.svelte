<script lang="ts">
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "../../src/select"

  let {
    onOpenChangeComplete,
  }: { onOpenChangeComplete: (open: boolean) => void } = $props()
</script>

<Select {onOpenChangeComplete}>
  <SelectTrigger>Fruit</SelectTrigger>
  <SelectContent><SelectItem value="apple">Apple</SelectItem></SelectContent>
</Select>
