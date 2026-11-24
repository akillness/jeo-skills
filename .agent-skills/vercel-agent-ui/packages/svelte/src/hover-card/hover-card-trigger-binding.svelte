<script lang="ts">
  import type {
    HoverCardTriggerProps,
    HoverCardTriggerState,
  } from "@ui-sdk/core/hover-card"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { HoverCardContext } from "./context"

  // The bound part of a trigger, once its card is known. It follows `owner`, so a
  // trigger given another controller keeps its element and focus.
  let {
    owner,
    payload,
    ...rest
  }: PartProps<"a", HoverCardTriggerState> &
    HoverCardTriggerProps & { owner: HoverCardContext } = $props()

  const id = $props.id()
  const trigger = useHandlePart(
    () => owner,
    "trigger",
    () => ({ id, payload })
  )
</script>

<Part tag="a" part={trigger} props={rest} />
