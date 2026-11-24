<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
import { computed, ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const title = ref("")
const blocked = computed(() => !title.value.trim())

function publish() {
  if (!blocked.value) {
    log(`Published “${title.value.trim()}”`)
  }
}
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Post title</FieldLabel>
      <Input v-model:value="title" />
    </Field>
    <Tooltip :disabled="!blocked">
      <TooltipTrigger
        data-variant="solid"
        :aria-disabled="blocked || undefined"
        @click="publish"
      >
        Publish
      </TooltipTrigger>
      <TooltipContent side="right">Add a title to publish</TooltipContent>
    </Tooltip>
  </div>
</template>
