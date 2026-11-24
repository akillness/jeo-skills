<!--
@component
Lays fields out. It has no role: a FieldSet is what names and disables a group.
@stable
-->
<script lang="ts">
  import { fieldGroup as fieldGroupPrimitive } from "@ui-sdk/core/field"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const id = $props.id()
  const group = usePrimitive(fieldGroupPrimitive, () => ({ id }))
  const root = useHandlePart(group, "group")
</script>

<Part tag="div" part={root} {props} />
