<!--
@component
Goes to the previous page. `aria-disabled` on the first page, where it stays focusable.
@stable
-->
<script lang="ts">
  import type { PaginationStepState } from "@ui-sdk/core/pagination"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let props: PartProps<"a", PaginationStepState> = $props()

  const pagination = usePagination("PaginationPrevious")
  const step = useHandlePart(pagination, "previous")
</script>

<Part tag={pagination.tag()} part={step} {props} />
