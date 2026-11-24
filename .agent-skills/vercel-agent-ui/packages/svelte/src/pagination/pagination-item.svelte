<!--
@component
One entry in the list, around a link, a step or an ellipsis.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let props: PartProps<"li", {}> = $props()

  const item = useHandlePart(usePagination("PaginationItem"), "item")
</script>

<Part tag="li" part={item} {props} />
