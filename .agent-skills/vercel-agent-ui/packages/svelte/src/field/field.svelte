<!--
@component
Ties a form control to its label, description and error messages.
@stable
-->
<script lang="ts">
  import { field as fieldPrimitive, type FieldState } from "@ui-sdk/core/field"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { DescribedKey, FieldKey, type FieldContext } from "./context"

  let {
    name,
    disabled,
    invalid,
    debug,
    ...rest
  }: PartProps<"div", FieldState> & {
    /** The name the field's control submits under. */
    name?: string
    /** Disables the control. */
    disabled?: boolean
    /** Whether the field shows as invalid, when your code decides. Leave it out for the browser's validation. */
    invalid?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const field = usePrimitive(fieldPrimitive, () => ({
    id,
    name,
    disabled,
    invalid,
    debug,
  }))
  const context: FieldContext = {
    ...field,
    name: () => name,
    disabled: () => disabled,
  }
  setContext(FieldKey, context)
  setContext(DescribedKey, context)
  const root = useHandlePart(field, "root")
</script>

<Part tag="div" part={root} props={rest} />
