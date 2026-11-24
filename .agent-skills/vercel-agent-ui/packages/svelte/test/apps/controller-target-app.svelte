<script lang="ts">
  import type { PopoverController } from "@ui-sdk/core/popover"
  import { Popover, PopoverContent, PopoverTrigger } from "../../src/popover"

  let {
    first,
    second,
  }: { first: PopoverController; second: PopoverController } = $props()
  let swapped = $state(false)
  export const swap = () => (swapped = true)
</script>

<Popover controller={first}><PopoverContent>First</PopoverContent></Popover>
<Popover controller={second}><PopoverContent>Second</PopoverContent></Popover>
<PopoverTrigger controller={swapped ? second : first}>Open</PopoverTrigger>
