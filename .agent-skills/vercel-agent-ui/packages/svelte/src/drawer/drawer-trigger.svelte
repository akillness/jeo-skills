<!--
@component
The button that opens the drawer. A trigger outside the drawer, like one per table row, connects through
`controller`.
@stable
-->
<script lang="ts">
  import type { DialogTriggerState } from "@ui-sdk/core/dialog"
  import type { DrawerTriggerProps } from "@ui-sdk/core/drawer"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import {
    DrawerKey,
    TriggerKey,
    type DrawerContext,
    type TriggerContext,
  } from "./context"
  import TriggerBinding from "./drawer-trigger-binding.svelte"

  let {
    disabled,
    focusableWhenDisabled,
    payload,
    shortcut,
    controller,
    ...rest
  }: PartProps<"button", DialogTriggerState> & DrawerTriggerProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<DrawerContext | undefined>(DrawerKey)
  )
  const drawer = $derived(connected())
  setContext<TriggerContext>(TriggerKey, {
    shortcut: () => shortcut,
    drawer: () => drawer,
  })
</script>

{#if drawer}
  <TriggerBinding
    owner={drawer}
    {disabled}
    {focusableWhenDisabled}
    {payload}
    {shortcut}
    {...rest}
  />
{:else}
  <!-- Until the drawer it names mounts, a trigger outside the drawer is a plain button. -->
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
