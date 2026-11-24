<!--
@component
Shows a trigger's shortcut, like ⌘K, inside the trigger. Hidden from
screen readers, which hear aria-keyshortcuts.
@stable
-->
<script lang="ts">
  import type {
    DialogShortcutProps,
    DialogShortcutState,
  } from "@ui-sdk/core/dialog"
  import { getContext } from "svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import {
    DrawerKey,
    TriggerKey,
    type DrawerContext,
    type TriggerContext,
  } from "./context"
  import ShortcutBinding from "./drawer-shortcut-binding.svelte"

  let {
    shortcut,
    ...rest
  }: PartProps<"span", DialogShortcutState> & DialogShortcutProps = $props()

  const context = getContext<DrawerContext | undefined>(DrawerKey)
  const trigger = getContext<TriggerContext | undefined>(TriggerKey)
  if (!context && !trigger) {
    throw new Error("Drawer parts must be used inside <Drawer>.")
  }
  // A trigger outside the drawer finds it through its controller only on the
  // client. Until mounted, its shortcut renders nothing, as on the server, so
  // hydration matches.
  let mounted = $state(!!context)
  $effect(() => {
    mounted = true
  })
  const drawer = $derived(context ?? (mounted ? trigger?.drawer() : undefined))
</script>

<!-- Inside a trigger whose drawer hasn't mounted yet, there's no shortcut to show. -->
{#if drawer}
  <ShortcutBinding
    owner={drawer}
    shortcut={shortcut ?? trigger?.shortcut()}
    {...rest}
  />
{/if}
