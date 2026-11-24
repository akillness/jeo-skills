<!--
@component
A button inside a chip that removes its value. Name it with `aria-label`.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxClearState,
  } from "@ui-sdk/core/combobox"
  import { comboboxChips } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ChipKey, type ChipContext } from "./context"

  let props: PartProps<"button", ComboboxClearState> = $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxChips)
  const chip = getContext<ChipContext | undefined>(ChipKey)
  if (!chip) {
    throw new Error("<ComboboxChipRemove> must be used inside <ComboboxChip>.")
  }
  const remove = useHandlePart(combobox, "chip-remove", () => ({
    id: combobox.api.internal.keyOf(chip()),
    value: chip(),
  }))
</script>

<Part tag="button" part={remove} {props} />
