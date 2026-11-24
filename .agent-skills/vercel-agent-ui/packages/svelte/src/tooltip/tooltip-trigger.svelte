<!--
@component
The element the tooltip names or describes, usually a button.
@stable
-->
<script lang="ts">
  import {
    tooltip as tooltipPrimitive,
    type TooltipTriggerProps,
    type TooltipTriggerState,
  } from "@ui-sdk/core/tooltip"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import {
    TriggerKey,
    type TooltipContext,
    type TriggerContext,
  } from "./context"
  import TriggerBinding from "./tooltip-trigger-binding.svelte"

  let {
    payload,
    controller,
    ...rest
  }: PartProps<"button", TooltipTriggerState> & TooltipTriggerProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<TooltipContext | undefined>(tooltipPrimitive)
  )
  const tooltip = $derived(connected())
  setContext<TriggerContext>(TriggerKey, () => tooltip)
</script>

{#if tooltip}
  <TriggerBinding owner={tooltip} {payload} {...rest} />
{:else}
  <!-- Until the tooltip it names mounts, a trigger outside the tooltip is a plain button. -->
  <Part
    tag="button"
    part={plainPart({ open: false }, { type: "button" })}
    props={rest}
  />
{/if}
