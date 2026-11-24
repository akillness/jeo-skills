<!--
@component
Goes to the last page. `aria-disabled` there.
@stable
-->
<script lang="ts">
  import type { PaginationStepState } from "@ui-sdk/core/pagination"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let props: PartProps<"a", PaginationStepState> = $props()

  const pagination = usePagination("PaginationLast")
  const step = useHandlePart(pagination, "last")
</script>

<Part tag={pagination.tag()} part={step} {props} />
