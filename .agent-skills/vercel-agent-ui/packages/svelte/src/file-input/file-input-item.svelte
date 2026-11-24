<!--
@component
One file. Its state has the file, for its name, size and preview. Arrow
keys move between items, and Backspace or Delete removes the focused one.
@stable
-->
<script lang="ts">
  import { fileInput, type FileInputItemState } from "@ui-sdk/core/file-input"
  import { fileKey } from "@ui-sdk/core/renderer"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { FileKey, useItemFile } from "./context"

  let {
    file,
    ...rest
  }: PartProps<"div", FileInputItemState> & {
    /** The file this item shows. The list passes it to the items it renders. */
    file?: File
  } = $props()

  const fileOf = useItemFile("FileInputItem", () => file)
  setContext(FileKey, fileOf)
  const item = usePart(fileInput, "item", () => ({
    file: fileOf(),
    value: fileKey(fileOf()),
  }))
</script>

<Part tag="div" part={item} props={rest} />
