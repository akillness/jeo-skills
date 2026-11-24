<!--
@component
A group of items, named by its `SelectGroupLabel`, and hidden while none of its items shows.
@stable
-->
<script lang="ts">
  import { select as selectPrimitive } from "@ui-sdk/core/select"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const select = useHandle(selectPrimitive)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(select, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
