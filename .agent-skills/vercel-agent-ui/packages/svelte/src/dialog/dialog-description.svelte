<!--
@component
Describes the dialog while it's rendered. A paragraph by default.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDialog } from "./context"

  let props: PartProps<"p"> = $props()

  const description = useHandlePart(useDialog().handle, "description")
</script>

<Part tag="p" part={description} {props} />
