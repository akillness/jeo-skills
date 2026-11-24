<!--
@component
The check inside the checkbox. Rendered while it's checked or indeterminate, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import type {
    CheckboxIndicatorProps,
    CheckboxIndicatorState,
  } from "@ui-sdk/core/checkbox"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { CheckboxKey, type CheckboxContext } from "./context"

  let {
    keepMounted,
    ...rest
  }: PartProps<"span", CheckboxIndicatorState> & CheckboxIndicatorProps =
    $props()

  const checkbox = getContext<CheckboxContext | undefined>(CheckboxKey)
  if (!checkbox) {
    throw new Error("CheckboxIndicator must be used inside <Checkbox>.")
  }
  const indicator = useHandlePart(checkbox, "indicator", () => ({
    keepMounted,
  }))
</script>

{#if indicator.present}
  <Part tag="span" part={indicator} props={rest} />
{/if}
