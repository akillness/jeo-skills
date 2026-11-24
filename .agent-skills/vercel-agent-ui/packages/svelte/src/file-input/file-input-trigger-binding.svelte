<script lang="ts">
  import type { FileInputState } from "@ui-sdk/core/file-input"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import type { FileInputContext } from "./context"

  // The bound part of a trigger, once its file input is known. It follows `owner`, so a
  // trigger given another controller keeps its element and focus.
  let {
    owner,
    ...rest
  }: PartProps<"button", FileInputState> & { owner: FileInputContext } =
    $props()

  const field = useFieldControl()
  const trigger = useHandlePart(() => owner, "trigger")
  const control = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="button" part={wrapPart(trigger, control)} props={rest} />
