<script lang="ts">
  import {
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from "@ui-sdk/svelte/scroll-area"

  const tags = Array.from(
    { length: 50 },
    (_, index) => `v1.2.0-beta.${50 - index}`
  )
</script>

<ScrollArea>
  {#snippet render({ props, state, children })}
    <section {...props}>{@render children?.(state)}</section>
  {/snippet}
  {#snippet children(state)}
    <ScrollAreaViewport aria-label="Releases">
      {#snippet render({ props, state, children })}
        <article {...props}>{@render children?.(state)}</article>
      {/snippet}
      <ScrollAreaContent>
        <ul>
          {#each tags as tag (tag)}
            <li>{tag}</li>
          {/each}
        </ul>
      </ScrollAreaContent>
    </ScrollAreaViewport>
    <p data-slot="hint" aria-hidden="true">
      {state.atStart ? "Scroll for older releases" : "More releases below"}
    </p>
    <ScrollAreaScrollbar>
      <ScrollAreaThumb />
    </ScrollAreaScrollbar>
  {/snippet}
</ScrollArea>
