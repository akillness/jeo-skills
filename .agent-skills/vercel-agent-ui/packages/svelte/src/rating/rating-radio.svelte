<script lang="ts">
  import { rating } from "@ui-sdk/core/rating"
  import { usePart } from "../instance"
  import Part from "../part.svelte"

  let { value }: { value: string } = $props()

  const radio = usePart(rating, "radio", () => ({ value }))
  const input = usePart(rating, "input", () => ({ value }))
</script>

<Part tag="button" part={radio} props={{}} />
<input {...input.slot()} />
