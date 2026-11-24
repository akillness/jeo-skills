<script lang="ts">
  import { setContext, type Snippet } from "svelte"
  import { ItemKey } from "./context"

  let {
    index,
    step,
    children,
  }: { index: number; step: () => number; children?: Snippet } = $props()
  setContext(ItemKey, {
    get index() {
      return index
    },
    step: () => step(),
  })
</script>

{@render children?.()}
