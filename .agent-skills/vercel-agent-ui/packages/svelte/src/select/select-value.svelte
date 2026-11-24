<!--
@component
The selected item's label, or the placeholder. Renders it for you when it has no children.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectValueProps,
    type SelectValueState,
  } from "@ui-sdk/core/select"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import {
    plainPart,
    useHandlePart,
    type PartProps,
  } from "../use-primitive.svelte"
  import type { SelectContext } from "./context"

  let {
    placeholder,
    maxLabels,
    getMoreLabel,
    children,
    ...rest
  }: PartProps<"span", SelectValueState> & SelectValueProps = $props()

  const select = getContext<SelectContext | undefined>(selectPrimitive)
  // An external trigger renders before its controller's select connects.
  const value = select
    ? useHandlePart(select, "value", () => ({
        placeholder,
        maxLabels,
        getMoreLabel,
      }))
    : plainPart<SelectValueState>({
        value: null,
        label: "",
        labels: [],
        placeholder: true,
      })
</script>

{#snippet text(state: SelectValueState)}
  {state.placeholder
    ? (placeholder ?? select?.state.placeholder ?? "")
    : state.label}
{/snippet}

<Part tag="span" part={value} props={{ ...rest, children: children ?? text }} />
