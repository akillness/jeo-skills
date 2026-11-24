<!--
@component
Renders a part: the `render` snippet with its props, state and content,
or the tag. `children` receives the state. `props` are the user's, `render`
and `children` included, which `slot()` leaves out when it merges the rest
with the part's attributes, so most parts need no more than
`<Part tag="div" part={item} {props} />`.
@stable
-->
<script lang="ts" generics="State">
  import type { Snippet } from "svelte"
  import type { PartBinding, SlotAttributes } from "./use-primitive.svelte"

  let {
    tag,
    part,
    props,
  }: {
    tag: string
    part: PartBinding<State>
    props: {
      render?: Snippet<
        [{ props: SlotAttributes; state: State; children?: Snippet<[State]> }]
      >
      children?: Snippet<[State]>
      [attribute: string]: unknown
    }
  } = $props()

  const attributes = $derived(part.slot(props))
</script>

{#if props.render}
  {@render props.render({
    props: attributes,
    state: part.state,
    children: props.children,
  })}
{:else if props.children}
  <svelte:element this={tag} {...attributes}
    >{@render props.children(part.state)}</svelte:element
  >
{:else}
  <svelte:element this={tag} {...attributes} />
{/if}
