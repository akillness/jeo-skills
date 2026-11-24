<script lang="ts">
  import type { Component } from "svelte"

  let {
    root: Root,
    trigger: Trigger,
    content: Content,
    around,
    other,
  }: {
    root: Component<any>
    trigger: Component<any>
    content?: Component<any>
    around?: object
    other: object
  } = $props()
</script>

<Root controller={around}
  ><Trigger controller={other} id="trigger">Open</Trigger></Root
>
{#if other !== around}
  <Root controller={other}>
    {#if Content}<Content id="other-content" />{/if}
  </Root>
{/if}
