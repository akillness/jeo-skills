<script setup lang="ts">
import { FileIcon, UploadIcon, XIcon } from "@lucide/vue"
import {
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
  formatFileSize,
} from "@ui-sdk/vue/file-input"
</script>

<template>
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
      <FileInputItem v-slot="{ state }">
        <FileIcon aria-hidden="true" />
        <span>{{ state.file.name }}</span>
        <span data-slot="hint">{{ formatFileSize(state.file.size) }}</span>
        <FileInputItemRemove>
          <XIcon aria-hidden="true" />
        </FileInputItemRemove>
      </FileInputItem>
    </FileInputList>
  </FileInput>
</template>
