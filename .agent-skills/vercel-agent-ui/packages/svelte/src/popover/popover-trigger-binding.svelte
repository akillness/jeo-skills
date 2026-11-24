<script lang="ts">
  import type {
    PopoverTriggerProps,
    PopoverTriggerState,
  } from "@ui-sdk/core/popover"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { PopoverContext } from "./context"

  // The bound part of a trigger, once its popover is known. It follows `owner`, so a
  // trigger given another controller keeps its element and focus.
  let {
    owner,
    disabled,
    focusableWhenDisabled,
    payload,
    shortcut,
    ...rest
  }: PartProps<"button", PopoverTriggerState> &
    PopoverTriggerProps & { owner: PopoverContext } = $props()

  const id = $props.id()
  const trigger = useHandlePart(
    () => owner,
    "trigger",
    () => ({ id, disabled, focusableWhenDisabled, payload, shortcut })
  )
</script>

<Part tag="button" part={trigger} props={rest} />
