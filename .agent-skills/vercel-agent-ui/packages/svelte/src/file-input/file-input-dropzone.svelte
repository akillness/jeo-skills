<!--
@component
Takes dropped and pasted files. Put the trigger inside it, which is how
keyboard and screen reader users choose files.
@stable
-->
<script lang="ts">
  import {
    fileInput,
    type FileInputDropzoneProps,
    type FileInputDropzoneState,
  } from "@ui-sdk/core/file-input"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    target,
    pasteTarget,
    ...rest
  }: PartProps<"div", FileInputDropzoneState> & FileInputDropzoneProps =
    $props()

  const id = $props.id()
  const zone = usePart(fileInput, "dropzone", () => ({
    id,
    target,
    pasteTarget,
  }))
</script>

<Part tag="div" part={zone} props={rest} />
