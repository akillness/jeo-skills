<!--
@component
A native <fieldset>, so `disabled` disables every control inside it.
@stable
-->
<script lang="ts">
  import {
    fieldSet as fieldSetPrimitive,
    type FieldSetState,
  } from "@ui-sdk/core/field"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { DescribedKey, FieldSetKey } from "./context"

  let {
    disabled,
    debug,
    ...rest
  }: PartProps<"fieldset", FieldSetState> & {
    /** Disables every control inside the set. */
    disabled?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const set = usePrimitive(fieldSetPrimitive, () => ({ id, disabled, debug }))
  setContext(FieldSetKey, set)
  setContext(DescribedKey, set)
  const root = useHandlePart(set, "set")
</script>

<Part tag="fieldset" part={root} props={rest} />
