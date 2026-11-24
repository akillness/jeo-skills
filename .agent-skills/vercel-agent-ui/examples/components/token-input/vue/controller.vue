<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  createTokenInputController,
  TokenInput,
  TokenInputEditor,
  type Token,
  type TokenInputValue,
} from "@ui-sdk/vue/token-input"

const draft: TokenInputValue = [
  "Compare ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " with ",
]

const loadFile = () => new Promise<void>((resolve) => setTimeout(resolve, 800))

const prompt = createTokenInputController()
const firstToken = () =>
  prompt
    .getValue()
    .find((segment): segment is Token => typeof segment !== "string")

function attachFile() {
  prompt.insert(
    { type: "file", value: "package.json", label: "package.json" },
    { at: "end", resolve: loadFile() }
  )
}

function showPath() {
  const token = firstToken()
  if (token) {
    prompt.updateToken(token.id!, { label: token.value })
  }
}

function removeFirst() {
  const token = firstToken()
  if (token) {
    prompt.removeToken(token.id!)
  }
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls" @mousedown.prevent>
      <button type="button" @click="attachFile">Attach File</button>
      <button type="button" @click="showPath">Show Path</button>
      <button type="button" @click="removeFirst">Remove First</button>
      <button type="button" @click="prompt.undo()">Undo</button>
      <button type="button" @click="prompt.clear()">Clear</button>
    </div>
    <Field>
      <FieldLabel>Prompt</FieldLabel>
      <TokenInput :controller="prompt" :default-value="draft">
        <TokenInputEditor />
      </TokenInput>
    </Field>
  </div>
</template>
