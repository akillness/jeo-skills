<!--
@component
Goes to the next page. `aria-disabled` on the last page, where it stays focusable.
@stable
-->
<script lang="ts">
  import type { PaginationStepState } from "@ui-sdk/core/pagination"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let props: PartProps<"a", PaginationStepState> = $props()

  const pagination = usePagination("PaginationNext")
  const step = useHandlePart(pagination, "next")
</script>

<Part tag={pagination.tag()} part={step} {props} />
