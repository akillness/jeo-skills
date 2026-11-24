<!--
@component
The listbox. Without children, it renders the current trigger's items, filtered.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuContentState,
  } from "@ui-sdk/core/trigger-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import TriggerMenuItems from "./trigger-menu-items.svelte"

  let { children, ...rest }: PartProps<"div", TriggerMenuContentState> =
    $props()

  const list = usePart(triggerMenu, "list")
</script>

{#snippet data(state: TriggerMenuContentState)}
  <TriggerMenuItems items={state.items} />
{/snippet}

<Part tag="div" part={list} props={{ ...rest, children: children ?? data }} />
