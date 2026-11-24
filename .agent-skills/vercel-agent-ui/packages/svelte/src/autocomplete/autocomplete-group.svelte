<!--
@component
A group of items, named by its `AutocompleteGroupLabel`, and hidden while none of its items shows.
@stable
-->
<script lang="ts">
  import { autocomplete as autocompletePrimitive } from "@ui-sdk/core/autocomplete"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const autocomplete = useHandle(autocompletePrimitive)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(autocomplete, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
