<script setup lang="ts">
import { FileIcon } from "@lucide/vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"

const files = [
  "Quarterly report, final revised version for the board.pdf",
  "Notes.txt",
  "Design review recording, October 2nd.mp4",
  "Budget.xlsx",
]

const names = new Map<string, HTMLElement>()

function fits(file: string) {
  const span = names.get(file)
  return !!span && span.scrollWidth <= span.clientWidth
}
</script>

<template>
  <ul>
    <li v-for="file in files" :key="file">
      <Tooltip
        type="label"
        @open-change="(open, details) => open && fits(file) && details.cancel()"
      >
        <TooltipTrigger>
          <FileIcon aria-hidden="true" />
          <span :ref="(el) => el && names.set(file, el as HTMLElement)">{{
            file
          }}</span>
        </TooltipTrigger>
        <TooltipContent>{{ file }}</TooltipContent>
      </Tooltip>
    </li>
  </ul>
</template>
