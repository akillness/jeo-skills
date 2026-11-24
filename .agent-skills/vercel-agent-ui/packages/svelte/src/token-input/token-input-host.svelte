<script lang="ts">
  import type { Token } from "@ui-sdk/core/token-input"
  import type { Snippet } from "svelte"

  // A token's content, mounted into its host inside the editor. `token` is
  // the live token, and `render` the input's `token` snippet.
  let { token, render }: { token: Token; render: Snippet<[Token]> } = $props()
</script>

{@render render(token)}
