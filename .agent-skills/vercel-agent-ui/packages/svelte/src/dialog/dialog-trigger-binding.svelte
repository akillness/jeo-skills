<script lang="ts">
  import type {
    DialogTriggerProps,
    DialogTriggerState,
  } from "@ui-sdk/core/dialog"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { DialogContext } from "./context"

  // The bound part of a trigger, once its dialog is known. It follows `owner`, so a
  // trigger given another controller keeps its element and focus.
  let {
    owner,
    disabled,
    focusableWhenDisabled,
    payload,
    shortcut,
    ...rest
  }: PartProps<"button", DialogTriggerState> &
    DialogTriggerProps & { owner: DialogContext } = $props()

  const id = $props.id()
  const trigger = useHandlePart(
    () => owner.handle,
    "trigger",
    () => ({ id, disabled, focusableWhenDisabled, payload, shortcut })
  )
</script>

<Part tag="button" part={trigger} props={rest} />
