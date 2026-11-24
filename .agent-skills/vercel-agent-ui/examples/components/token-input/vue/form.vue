<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  TokenInput,
  TokenInputEditor,
  type TokenInputValue,
} from "@ui-sdk/vue/token-input"
import { ref, useId } from "vue"
import { useLog } from "../../../shared/vue/log"

const draft: TokenInputValue = [
  "Explain ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " in two sentences.",
]

const log = useLog()
const disabled = ref(false)
const readOnly = ref(false)
const formId = useId()

function onSubmit(event: Event) {
  log(
    `Submitted ${new FormData(event.currentTarget as HTMLFormElement).get("prompt") ?? ""}`
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <label data-slot="label">
        <Checkbox
          :checked="disabled"
          @checked-change="(next) => (disabled = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Disabled
      </label>
      <label data-slot="label">
        <Checkbox
          :checked="readOnly"
          @checked-change="(next) => (readOnly = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Read-only
      </label>
    </div>
    <div data-slot="stack">
      <Field :disabled="disabled">
        <FieldLabel>Prompt</FieldLabel>
        <TokenInput
          :form="formId"
          name="prompt"
          required
          :default-value="draft"
          :read-only="readOnly"
        >
          <TokenInputEditor />
        </TokenInput>
      </Field>
      <form :id="formId" data-slot="row" @submit.prevent="onSubmit">
        <button type="submit" data-variant="solid">Submit</button>
        <button type="reset">Reset</button>
      </form>
    </div>
  </div>
</template>
