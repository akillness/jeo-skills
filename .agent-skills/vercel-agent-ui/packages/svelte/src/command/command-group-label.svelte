<!--
@component
A group's heading, which names it.
@stable
-->
<script lang="ts">
  import { command as commandPrimitive } from "@ui-sdk/core/command"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const command = useHandle(commandPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error("<CommandGroupLabel> must be used inside <CommandGroup>.")
  }
  const label = useHandlePart(command, "group-label", () => ({
    id: group,
    group,
  }))
</script>

<Part tag="div" part={label} {props} />
