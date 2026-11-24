<script lang="ts">
  import type {
    TooltipTriggerProps,
    TooltipTriggerState,
  } from "@ui-sdk/core/tooltip"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { TooltipContext } from "./context"

  // The bound part of a trigger, once its tooltip is known. It follows `owner`, so a
  // trigger given another controller keeps its element and focus.
  let {
    owner,
    payload,
    ...rest
  }: PartProps<"button", TooltipTriggerState> &
    TooltipTriggerProps & { owner: TooltipContext } = $props()

  const id = $props.id()
  const trigger = useHandlePart(
    () => owner,
    "trigger",
    () => ({ id, payload })
  )
</script>

<Part tag="button" part={trigger} props={rest} />
