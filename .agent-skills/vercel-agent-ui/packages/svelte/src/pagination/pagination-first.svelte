<!--
@component
Goes to the first page. `aria-disabled` there.
@stable
-->
<script lang="ts">
  import type { PaginationStepState } from "@ui-sdk/core/pagination"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let props: PartProps<"a", PaginationStepState> = $props()

  const pagination = usePagination("PaginationFirst")
  const step = useHandlePart(pagination, "first")
</script>

<Part tag={pagination.tag()} part={step} {props} />
