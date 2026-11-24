<script lang="ts">
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"
</script>

<Tooltip>
  <TooltipTrigger data-variant="link">
    {#snippet render({ props, state, children })}
      <a {...props} href="https://example.com/changelog"
        >{@render children?.(state)}</a
      >
    {/snippet}
    Changelog
  </TooltipTrigger>
  <TooltipContent>See what's new in 2.0</TooltipContent>
</Tooltip>
