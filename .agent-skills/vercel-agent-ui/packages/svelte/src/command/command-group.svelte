<!--
@component
A group of commands. It hides while none of its commands matches the search.
@stable
-->
<script lang="ts">
  import { command as commandPrimitive } from "@ui-sdk/core/command"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const command = useHandle(commandPrimitive)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(command, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
