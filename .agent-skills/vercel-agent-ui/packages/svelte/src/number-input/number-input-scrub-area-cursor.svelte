<!--
@component
Stands in for the mouse cursor while a scrub locks the pointer. Rendered
in the body, so transformed ancestors can't move it.
@stable
-->
<script lang="ts">
  import type { NumberInputState } from "@ui-sdk/core/number-input"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { portalTo } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { NumberInputKey, type NumberInputContext } from "./context"

  let props: PartProps<"span", NumberInputState> = $props()

  // A scrub area outside its number input renders before that mounts, with no cursor yet.
  const numberInput = getContext<NumberInputContext | undefined>(NumberInputKey)
  const cursor = numberInput
    ? useHandlePart(
        numberInput,
        "scrub-area-cursor",
        undefined,
        portalTo(() => document.body)
      )
    : undefined
</script>

{#if cursor?.present}
  <Part tag="span" part={cursor} {props} />
{/if}
