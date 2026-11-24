<!--
@component
Ghost text at the caret for the arguments still to type. Without children, the hints.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuHintState,
  } from "@ui-sdk/core/trigger-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"span", TriggerMenuHintState> = $props()

  const hint = usePart(triggerMenu, "hint", () => ({ text: !children }))
</script>

{#if hint.present}
  <Part tag="span" part={hint} props={{ ...rest, children }} />
{/if}
