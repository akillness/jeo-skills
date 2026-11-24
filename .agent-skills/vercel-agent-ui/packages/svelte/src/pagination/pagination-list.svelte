<!--
@component
The list of pages and steps. Its children get the state, whose `items` are the pages to show.
@stable
-->
<script lang="ts">
  import type { PaginationState } from "@ui-sdk/core/pagination"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let props: PartProps<"ul", PaginationState> = $props()

  const list = useHandlePart(usePagination("PaginationList"), "list")
</script>

<Part tag="ul" part={list} {props} />
