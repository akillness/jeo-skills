<script lang="ts">
  import { setContext, type Snippet } from "svelte"
  import { FileKey } from "./context"

  // Provides one file to the list's content, rendered once for each file.
  let { file, children }: { file: File; children?: Snippet } = $props()

  setContext(FileKey, () => file)
</script>

{@render children?.()}
