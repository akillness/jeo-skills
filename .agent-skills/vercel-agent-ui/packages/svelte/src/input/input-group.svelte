<!--
@component
Holds an Input or Textarea with icons, text and buttons around it. Presses
on its text and icons focus the field.
@stable
-->
<script lang="ts">
  import {
    inputGroup as inputGroupPrimitive,
    type InputGroupOptions,
    type InputGroupState,
  } from "@ui-sdk/core/input"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { InputGroupKey } from "./context"

  let {
    debug,
    ...rest
  }: PartProps<"div", InputGroupState> & InputGroupOptions = $props()

  const id = $props.id()
  const group = usePrimitive(inputGroupPrimitive, () => ({ id, debug }))
  setContext(InputGroupKey, group)
  const root = useHandlePart(group, "group")
</script>

<Part tag="div" part={root} props={rest} />
