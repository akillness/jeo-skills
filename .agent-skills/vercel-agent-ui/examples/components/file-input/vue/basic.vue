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
    <FileInputDropzone>
      <UploadIcon aria-hidden="true" />
      <p>Drag and drop files here</p>
      <p data-slot="hint">Or paste them from your clipboard.</p>
      <FileInputTrigger>Browse Files</FileInputTrigger>
    </FileInputDropzone>
    <FileInputList aria-label="Files">
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
