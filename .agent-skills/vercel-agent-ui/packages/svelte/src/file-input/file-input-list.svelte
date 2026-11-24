<!--
@component
The files, as a list. Its content renders once for each file, so put a
FileInputItem in it.
@stable
-->
<script lang="ts">
  import { fileInput, type FileInputState } from "@ui-sdk/core/file-input"
  import { fileKey } from "@ui-sdk/core/renderer"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import FileScope from "./file-input-file-scope.svelte"

  let { children, ...rest }: PartProps<"div", FileInputState> = $props()

  const list = usePart(fileInput, "list")
</script>

{#snippet rows(state: FileInputState)}
  {#each state.value as file (fileKey(file))}
    <FileScope {file}>{@render children?.(state)}</FileScope>
  {/each}
{/snippet}

<Part tag="div" part={list} props={{ ...rest, children: rows }} />
