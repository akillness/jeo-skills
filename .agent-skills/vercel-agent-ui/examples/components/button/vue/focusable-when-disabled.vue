<script setup lang="ts">
import { Button } from "@ui-sdk/vue/button"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { computed, ref, useId } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const title = ref("")
const hint = useId()
const ready = computed(() => title.value.trim() !== "")
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Title</FieldLabel>
      <Input v-model:value="title" />
    </Field>
    <div data-slot="row">
      <Button
        :disabled="!ready"
        focusable-when-disabled
        :aria-describedby="hint"
        @click="log(`Published “${title}”`)"
      >
        Publish
      </Button>
      <p :id="hint" data-slot="hint">
        {{ ready ? "Ready to publish." : "Add a title to publish." }}
      </p>
    </div>
  </div>
</template>
