<!--
@component
A group of items, named by its `ComboboxGroupLabel`, and hidden while none of its items shows.
@stable
-->
<script lang="ts">
  import { combobox as comboboxPrimitive } from "@ui-sdk/core/combobox"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const combobox = useHandle(comboboxPrimitive)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(combobox, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
