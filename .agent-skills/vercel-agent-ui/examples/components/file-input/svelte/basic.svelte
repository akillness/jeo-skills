<script lang="ts">
  import { FileIcon, UploadIcon, XIcon } from "@lucide/svelte"
  import {
    FileInput,
    FileInputDropzone,
    FileInputItem,
    FileInputItemRemove,
    FileInputList,
    FileInputTrigger,
    formatFileSize,
  } from "@ui-sdk/svelte/file-input"
</script>

<FileInput multiple>
  <FileInputDropzone>
    <UploadIcon aria-hidden="true" />
    <p>Drag and drop files here</p>
    <p data-slot="hint">Or paste them from your clipboard.</p>
    <FileInputTrigger>Browse Files</FileInputTrigger>
  </FileInputDropzone>
  <FileInputList aria-label="Files">
    <FileInputItem>
      {#snippet children(state)}
        <FileIcon aria-hidden="true" />
        <span>{state.file.name}</span>
        <span data-slot="hint">{formatFileSize(state.file.size)}</span>
        <FileInputItemRemove>
          <XIcon aria-hidden="true" />
        </FileInputItemRemove>
      {/snippet}
    </FileInputItem>
  </FileInputList>
</FileInput>
