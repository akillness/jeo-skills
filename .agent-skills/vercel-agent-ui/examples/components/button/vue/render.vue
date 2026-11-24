<script setup lang="ts">
import { Button } from "@ui-sdk/vue/button"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function save() {
  await wait(1000)
  log("Couldn't save. Check your connection and try again.")
  throw new Error("Couldn't save")
}
</script>

<template>
  <div data-slot="stack">
    <Button @click="save">
      <template #render="{ props, state }">
        <button v-bind="props">
          {{
            state.pending
              ? "Saving…"
              : state.error
                ? "Try Again"
                : "Save Changes"
          }}
        </button>
      </template>
    </Button>
  </div>
</template>
