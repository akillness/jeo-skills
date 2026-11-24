<script setup lang="ts">
import { LoaderCircleIcon } from "@lucide/vue"
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/vue/command"
import { useLog } from "../../../shared/vue/log"

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const log = useLog()

async function deploy() {
  await wait(1200)
  log("Deployed to production")
}

async function sync() {
  await wait(600)
  log("Couldn't sync: offline")
  throw new Error("Offline")
}
</script>

<template>
  <div data-slot="stack">
    <Command>
      <CommandInput aria-label="Search actions" placeholder="Search actions…" />
      <CommandList>
        <CommandItem v-slot="{ state }" value="deploy" @select="deploy">
          Deploy to production
          <LoaderCircleIcon
            data-slot="spinner"
            aria-hidden="true"
            v-if="state.pending"
          />
        </CommandItem>
        <CommandItem v-slot="{ state }" value="sync" @select="sync">
          Sync with server
          <LoaderCircleIcon
            data-slot="spinner"
            aria-hidden="true"
            v-if="state.pending"
          />
          <span v-else-if="state.error !== undefined" data-slot="hint"
            >Failed, try again</span
          >
        </CommandItem>
      </CommandList>
    </Command>
  </div>
</template>
