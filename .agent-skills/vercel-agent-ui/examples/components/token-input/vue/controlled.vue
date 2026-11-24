<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  toText,
  TokenInput,
  TokenInputEditor,
  type Token,
  type TokenInputValue,
  type TokenInputValueChangeDetails,
} from "@ui-sdk/vue/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/vue/trigger-menu"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const files = [
  { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
  { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
  { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
  { value: "README.md", label: "README.md" },
  { value: "package.json", label: "package.json" },
]

const draft: TokenInputValue = [
  "Explain ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " in two sentences.",
]

const log = useLog()
const value = ref<TokenInputValue>(draft)

function onValueChange(
  next: TokenInputValue,
  details: TokenInputValueChangeDetails
) {
  const removed = details.removed.map((token) => token.label).join(", ")
  log(
    `${toText(next)} (${details.reason}${removed ? `, removed ${removed}` : ""})`
  )
}
</script>

<template>
  <Field>
    <FieldLabel>Prompt</FieldLabel>
    <TokenInput
      v-model:value="value"
      :history="{ limit: 50, groupDelay: 1000 }"
      :get-token-description="
        (token: Token) => (token.type === 'file' ? 'attached file' : token.type)
      "
      @value-change="onValueChange"
    >
      <TokenInputEditor />
      <TriggerMenu :triggers="[{ char: '@', type: 'file', items: files }]">
        <TriggerMenuContent>
          <TriggerMenuList v-slot="{ state }">
            <TriggerMenuItem
              v-for="item in state.items as TriggerMenuDataItem[]"
              :key="item.value"
              :value="item.value"
              :label="item.label"
            >
              {{ item.label }}
            </TriggerMenuItem>
          </TriggerMenuList>
        </TriggerMenuContent>
      </TriggerMenu>
    </TokenInput>
  </Field>
</template>
