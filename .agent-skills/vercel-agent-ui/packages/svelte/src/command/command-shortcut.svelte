<!--
@component
The keys of a command's shortcut, formatted for the platform. Inside a command, its `shortcut`.
@stable
-->
<script lang="ts">
  import {
    command as commandPrimitive,
    type CommandShortcutProps,
    type CommandShortcutState,
  } from "@ui-sdk/core/command"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemShortcutKey, type ItemShortcutContext } from "./context"

  let {
    shortcut,
    children,
    ...rest
  }: PartProps<"span", CommandShortcutState> & CommandShortcutProps = $props()

  const command = useHandle(commandPrimitive)
  const inherited = getContext<ItemShortcutContext | undefined>(ItemShortcutKey)
  const part = useHandlePart(command, "shortcut", () => ({
    shortcut: shortcut ?? inherited?.(),
  }))
</script>

{#snippet text(state: CommandShortcutState)}{state.text}{/snippet}

<Part tag="span" {part} props={{ ...rest, children: children ?? text }} />
