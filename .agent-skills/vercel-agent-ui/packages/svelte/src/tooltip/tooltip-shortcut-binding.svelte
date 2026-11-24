<script lang="ts">
  import type {
    TooltipShortcutProps,
    TooltipShortcutState,
  } from "@ui-sdk/core/tooltip"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { TooltipContext } from "./context"

  // The bound part of a shortcut, once its tooltip is known. It follows `owner`.
  let {
    owner,
    shortcut,
    children,
    ...rest
  }: PartProps<"span", TooltipShortcutState> &
    TooltipShortcutProps & { owner: TooltipContext } = $props()

  const part = useHandlePart(
    () => owner,
    "shortcut",
    () => ({ shortcut })
  )
</script>

{#snippet text(state: TooltipShortcutState)}{state.text}{/snippet}

<Part tag="span" {part} props={{ ...rest, children: children ?? text }} />
