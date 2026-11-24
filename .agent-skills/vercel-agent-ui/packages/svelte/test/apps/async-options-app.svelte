<script lang="ts">
  import { useAsyncOptions } from "../../src/async-options.svelte"

  let {
    load,
  }: {
    load: (query: string, context: { signal: AbortSignal }) => Promise<string[]>
  } = $props()

  const options = useAsyncOptions((query, context) => load(query, context), {
    immediate: true,
  })
</script>

<p>{options.state.status}</p>
