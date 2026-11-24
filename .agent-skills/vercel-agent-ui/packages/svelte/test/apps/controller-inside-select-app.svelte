<script lang="ts">
  import type { SelectController } from "@ui-sdk/core/select"
  import { Select, SelectTrigger } from "../../src/select"

  let { other }: { other: SelectController<string> } = $props()
</script>

<Select items={["apple", "banana"]} defaultValue="apple">
  <SelectTrigger controller={other} id="trigger" />
</Select>
<Select controller={other} items={["apple", "banana"]} defaultValue="banana" />
