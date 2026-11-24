<!--
@component
The group's heading, which names the group.
@stable
-->
<script lang="ts">
  import { autocomplete as autocompletePrimitive } from "@ui-sdk/core/autocomplete"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const autocomplete = useHandle(autocompletePrimitive)
  const group = getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error(
      "<AutocompleteGroupLabel> must be used inside <AutocompleteGroup>."
    )
  }
  const label = useHandlePart(autocomplete, "group-label", () => ({
    id: group,
    group,
  }))
</script>

<Part tag="div" part={label} {props} />
