<!--
@component
The listbox. Without content, it renders the command's `items`, ranked as the user types.
@stable
-->
<script lang="ts">
  import {
    command as commandPrimitive,
    type CommandListState,
  } from "@ui-sdk/core/command"
  import { untrack } from "svelte"
  import { claimOwnPart } from "../own-part.svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { OwnListKey } from "./context"
  import CommandItems from "./command-items.svelte"

  let {
    fromRoot,
    children,
    ...rest
  }: PartProps<"div", CommandListState> & {
    /** @internal The list a data command renders itself, which doesn't count as the app's. */
    fromRoot?: boolean
  } = $props()

  const command = useHandle(commandPrimitive)
  // The root renders its own list when the app gives none, so one in the
  // app's children says it's there.
  if (!untrack(() => fromRoot)) {
    claimOwnPart(OwnListKey)
  }
  const list = useHandlePart(command, "list")
</script>

<!-- Without content, a data command renders its items. -->
{#snippet data(state: CommandListState)}
  {#if command.state.items}<CommandItems items={state.items} />{/if}
{/snippet}

<Part tag="div" part={list} props={{ ...rest, children: children ?? data }} />
