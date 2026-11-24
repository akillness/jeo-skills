<!--
@component
Removes its item's file, or the `file` it's given. It's named "Remove
<file name>" unless you name it.
@stable
-->
<script lang="ts">
  import {
    fileInput,
    type FileInputItemRemoveState,
  } from "@ui-sdk/core/file-input"
  import { fileKey } from "@ui-sdk/core/renderer"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItemFile } from "./context"

  let {
    file,
    ...rest
  }: PartProps<"button", FileInputItemRemoveState> & {
    /** The file to remove, outside an item. */
    file?: File
  } = $props()

  const fileOf = useItemFile("FileInputItemRemove", () => file)
  const remove = usePart(fileInput, "item-remove", () => ({
    file: fileOf(),
    value: fileKey(fileOf()),
  }))
</script>

<Part tag="button" part={remove} props={rest} />
