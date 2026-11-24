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
  <div data-slot="row">
    <p data-slot="hint">Drop files anywhere.</p>
    <FileInputTrigger>Upload Files</FileInputTrigger>
  </div>
  <FileInputDropzone target="document" data-variant="overlay">
    <div data-slot="stack">
      <UploadIcon aria-hidden="true" />
      <p>Drop to attach</p>
    </div>
  </FileInputDropzone>
  <FileInputList aria-label="Attachments">
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
