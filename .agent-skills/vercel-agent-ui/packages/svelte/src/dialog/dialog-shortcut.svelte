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
    DialogKey,
    TriggerKey,
    type DialogContext,
    type TriggerContext,
  } from "./context"
  import ShortcutBinding from "./dialog-shortcut-binding.svelte"

  let {
    shortcut,
    ...rest
  }: PartProps<"span", DialogShortcutState> & DialogShortcutProps = $props()

  const context = getContext<DialogContext | undefined>(DialogKey)
  const trigger = getContext<TriggerContext | undefined>(TriggerKey)
  if (!context && !trigger) {
    throw new Error(
      "Dialog parts must be used inside <Dialog> or <AlertDialog>."
    )
  }
  // A trigger outside the dialog finds it through its controller only on the
  // client. Until mounted, its shortcut renders nothing, as on the server, so
  // hydration matches.
  let mounted = $state(!!context)
  $effect(() => {
    mounted = true
  })
  const dialog = $derived(context ?? (mounted ? trigger?.dialog() : undefined))
</script>

<!-- Inside a trigger whose dialog hasn't mounted yet, there's no shortcut to show. -->
{#if dialog}
  <ShortcutBinding
    owner={dialog}
    shortcut={shortcut ?? trigger?.shortcut()}
    {...rest}
  />
{/if}
