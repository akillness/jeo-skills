<script lang="ts">
  import type {
    PopoverShortcutProps,
    PopoverShortcutState,
  } from "@ui-sdk/core/popover"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { PopoverContext } from "./context"

  // The bound part of a shortcut, once its popover is known. It follows `owner`.
  let {
    owner,
    shortcut,
    children,
    ...rest
  }: PartProps<"span", PopoverShortcutState> &
    PopoverShortcutProps & { owner: PopoverContext } = $props()

  const part = useHandlePart(
    () => owner,
    "shortcut",
    () => ({ shortcut })
  )
</script>

{#snippet text(state: PopoverShortcutState)}{state.text}{/snippet}

<Part tag="span" {part} props={{ ...rest, children: children ?? text }} />
