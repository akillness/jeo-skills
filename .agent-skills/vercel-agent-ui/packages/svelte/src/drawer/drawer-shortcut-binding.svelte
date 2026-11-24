<script lang="ts">
  import type {
    DialogShortcutProps,
    DialogShortcutState,
  } from "@ui-sdk/core/dialog"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { DrawerContext } from "./context"

  // The bound part of a shortcut, once its drawer is known. It follows `owner`.
  let {
    owner,
    shortcut,
    children,
    ...rest
  }: PartProps<"span", DialogShortcutState> &
    DialogShortcutProps & { owner: DrawerContext } = $props()

  const part = useHandlePart(
    () => owner.handle,
    "shortcut",
    () => ({ shortcut })
  )
</script>

{#snippet text(state: DialogShortcutState)}{state.text}{/snippet}

<Part tag="span" {part} props={{ ...rest, children: children ?? text }} />
