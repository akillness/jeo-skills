<!--
@component
An element that follows the drawer, like the page behind it. Outside the drawer, pass its `controller`.
@stable
-->
<script lang="ts">
  import type {
    DrawerOutletProps,
    DrawerOutletState,
  } from "@ui-sdk/core/drawer"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import { DrawerKey, type DrawerContext } from "./context"
  import OutletBinding from "./drawer-outlet-binding.svelte"

  let {
    keyframes,
    controller,
    ...rest
  }: PartProps<"div", DrawerOutletState> & DrawerOutletProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<DrawerContext | undefined>(DrawerKey)
  )
  const drawer = $derived(connected())
</script>

{#if drawer}
  <!-- A binding takes its drawer once, so another drawer gets a new one. -->
  {#key drawer}
    <OutletBinding owner={drawer} {keyframes} {...rest} />
  {/key}
{:else}
  <!-- Until the drawer it names mounts, an outlet outside the drawer is a plain
  element with the user's attributes alone, which nothing binds. -->
  <Part tag="div" part={plainPart({ open: false })} props={rest} />
{/if}
