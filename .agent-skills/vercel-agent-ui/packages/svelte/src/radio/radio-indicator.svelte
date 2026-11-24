<!--
@component
The dot inside the radio. Rendered while it's checked, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import type {
    RadioIndicatorProps,
    RadioIndicatorState,
  } from "@ui-sdk/core/radio"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { RadioKey, useRadioGroup } from "./context"

  let {
    keepMounted,
    ...rest
  }: PartProps<"span", RadioIndicatorState> & RadioIndicatorProps = $props()

  const group = useRadioGroup()
  const value = getContext<(() => string) | undefined>(RadioKey)
  if (!value) {
    throw new Error("RadioIndicator must be used inside <Radio>.")
  }
  const indicator = useHandlePart(group, "indicator", () => ({
    value: value(),
    keepMounted,
  }))
</script>

{#if indicator.present}
  <Part tag="span" part={indicator} props={rest} />
{/if}
