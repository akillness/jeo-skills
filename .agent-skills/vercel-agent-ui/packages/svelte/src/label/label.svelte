<!--
@component
A native <label> that names any control, by `for` or by wrapping it. A
control a <label> can't reach, like a radio group or a slider, takes it as
its name, and a press on the label activates it.
@experimental
-->
<script lang="ts">
  import {
    label as labelPrimitive,
    type LabelOptions,
  } from "@ui-sdk/core/label"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let { debug, ...rest }: PartProps<"label"> & LabelOptions = $props()

  const id = $props.id()
  const label = usePrimitive(labelPrimitive, () => ({ id, debug }))
  const root = useHandlePart(label, "root")
</script>

<Part tag="label" part={root} props={rest} />
