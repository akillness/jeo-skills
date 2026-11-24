<!--
@component
A group of items, named by its `ListboxGroupLabel`.
@stable
-->
<script lang="ts">
  import { listbox as listboxPrimitive } from "@ui-sdk/core/listbox"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const listbox = useHandle(listboxPrimitive)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(listbox, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
