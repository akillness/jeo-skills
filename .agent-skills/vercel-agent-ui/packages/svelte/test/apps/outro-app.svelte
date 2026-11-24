<script lang="ts">
  import { fade } from "svelte/transition"
  import { Popover, PopoverContent, PopoverTrigger } from "../../src/popover"

  let {
    onOpenChangeComplete,
  }: { onOpenChangeComplete: (open: boolean) => void } = $props()
</script>

<Popover {onOpenChangeComplete}>
  <PopoverTrigger>Open</PopoverTrigger>
  <PopoverContent aria-label="Panel">
    {#snippet render({ props })}
      <div {...props} out:fade|global={{ duration: 100 }}>Panel</div>
    {/snippet}
  </PopoverContent>
</Popover>
