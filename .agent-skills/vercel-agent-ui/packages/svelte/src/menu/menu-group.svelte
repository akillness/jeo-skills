<!--
@component
A group of items, named by its `MenuGroupLabel`.
@stable
-->
<script lang="ts">
  import { menu as menuPrimitive } from "@ui-sdk/core/menu"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const menu = useHandle(menuPrimitive)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(menu, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
