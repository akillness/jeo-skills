<script lang="ts" generics="State">
  import type { Snippet } from "svelte"
  import Part from "./part.svelte"
  import { plainPart, type SlotAttributes } from "./use-primitive.svelte"

  // A text field's <input>, written as a static element so the compiler knows
  // it's one: the server then renders `defaultValue` as the `value` attribute,
  // and the client keeps that attribute for a form reset. A `render` snippet
  // renders through Part instead.
  let {
    render,
    children,
    props,
    state,
  }: {
    render?: Snippet<
      [{ props: SlotAttributes; state: State; children?: Snippet<[State]> }]
    >
    children?: Snippet<[State]>
    props: SlotAttributes
    state: State
  } = $props()
</script>

{#if render}
  <Part
    tag="input"
    part={plainPart(state)}
    props={{ ...props, render, children }}
  />
{:else}
  <input {...props} />
{/if}
