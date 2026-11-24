<!--
@component
An area that opens the menu at the pointer on a right-click or a long
press, and on Shift+F10.
@stable
-->
<script lang="ts">
  import {
    menu as menuPrimitive,
    type MenuContextTriggerProps,
    type MenuContextTriggerState,
  } from "@ui-sdk/core/menu"
  import { menuContextTrigger } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import type { MenuContext } from "./context"
  import TriggerBinding from "./menu-trigger-binding.svelte"

  let {
    disabled,
    payload,
    controller,
    ...rest
  }: PartProps<"div", MenuContextTriggerState> & MenuContextTriggerProps =
    $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<MenuContext | undefined>(menuPrimitive)
  )
  const menu = $derived(connected())
</script>

{#if menu}
  <TriggerBinding
    owner={menu}
    partName="context-trigger"
    feature={menuContextTrigger}
    tag="div"
    {disabled}
    {payload}
    {...rest}
  />
{:else}
  <!-- Until the menu it names mounts, an area outside the menu is a plain element. A user
       attachment may be false or null, which `slot()` passes through the same way. -->
  <Part
    tag="div"
    part={plainPart({ open: false, disabled: !!disabled })}
    props={rest}
  />
{/if}
