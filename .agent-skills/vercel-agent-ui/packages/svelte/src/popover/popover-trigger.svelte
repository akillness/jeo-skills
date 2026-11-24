<!--
@component
The button that opens the popover. A trigger outside the popover connects through `controller`.
@stable
-->
<script lang="ts">
  import {
    popover as popoverPrimitive,
    type PopoverTriggerProps,
    type PopoverTriggerState,
  } from "@ui-sdk/core/popover"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import {
    TriggerKey,
    type PopoverContext,
    type TriggerContext,
  } from "./context"
  import TriggerBinding from "./popover-trigger-binding.svelte"

  let {
    disabled,
    focusableWhenDisabled,
    payload,
    shortcut,
    controller,
    ...rest
  }: PartProps<"button", PopoverTriggerState> & PopoverTriggerProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<PopoverContext | undefined>(popoverPrimitive)
  )
  const popover = $derived(connected())
  setContext<TriggerContext>(TriggerKey, {
    shortcut: () => shortcut,
    popover: () => popover,
  })
</script>

{#if popover}
  <TriggerBinding
    owner={popover}
    {disabled}
    {focusableWhenDisabled}
    {payload}
    {shortcut}
    {...rest}
  />
{:else}
  <!-- Until the popover it names mounts, a trigger outside the popover is a plain button. -->
  <Part
    tag="button"
    part={plainPart(
      { open: false, disabled: !!disabled },
      {
        type: "button",
        disabled: disabled && !focusableWhenDisabled,
        "aria-disabled": (disabled && focusableWhenDisabled) || undefined,
      }
    )}
    props={rest}
  />
{/if}
