<!--
@component
A line between groups of content, announced as a separator unless it's `decorative`.
@stable
-->
<script lang="ts">
  import {
    separator as separatorPrimitive,
    type SeparatorOptions,
    type SeparatorState,
  } from "@ui-sdk/core/separator"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    orientation,
    decorative,
    debug,
    ...rest
  }: PartProps<"div", SeparatorState> & SeparatorOptions = $props()

  const id = $props.id()
  const separator = usePrimitive(separatorPrimitive, () => ({
    id,
    orientation,
    decorative,
    debug,
  }))
  const root = useHandlePart(separator, "root")
</script>

<Part tag="div" part={root} props={rest} />
