<script lang="ts">
  import { CornerDownLeftIcon } from "@lucide/svelte"
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandItemText,
    CommandList,
  } from "@ui-sdk/svelte/command"

  const pages = ["Composition", "Installation", "Styling"]
</script>

<Command>
  <CommandInput aria-label="Search docs" placeholder="Search docs…" />
  <CommandList>
    {#each pages as page (page)}
      <CommandItem value={page}>
        {#snippet render({ props, state, children })}
          <a {...props} href="#{page.toLowerCase()}"
            >{@render children?.(state)}</a
          >
        {/snippet}
        {#snippet children(state)}
          <CommandItemText>
            {#snippet render({ props, state: text })}
              <span {...props}>
                {#each text.segments as segment, index (index)}
                  {#if segment.match}<strong>{segment.text}</strong
                    >{:else}{segment.text}{/if}
                {/each}
              </span>
            {/snippet}
          </CommandItemText>
          {#if state.highlighted}<CornerDownLeftIcon aria-hidden="true" />{/if}
        {/snippet}
      </CommandItem>
    {/each}
  </CommandList>
</Command>
