<script lang="ts">
  import type { ToastContent } from "./context"

  // Renders a toast's content: text as it is, a snippet by rendering it.
  let { content }: { content: ToastContent } = $props()
</script>

{#if typeof content === "function"}{@render content()}{:else}{content}{/if}
