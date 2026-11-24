<script setup lang="ts">
// A click handler reads how the button was pressed, for what it changes after an `await`.
import { Button, type ButtonActionDetails } from "../../src/button"
import { withSource } from "../../src/observe"

const save = () => new Promise((resolve) => setTimeout(resolve, 100))
const markSaved = () => {}
const saved = (source: ButtonActionDetails["source"]) =>
  withSource(source, markSaved)

async function publish(_event: MouseEvent, { source }: ButtonActionDetails) {
  await save()
  saved(source)
}
</script>

<template>
  <Button @click="publish">Publish</Button>
  <Button @click="async (_event, { source }) => (await save(), saved(source))"
    >Save</Button
  >
</template>
