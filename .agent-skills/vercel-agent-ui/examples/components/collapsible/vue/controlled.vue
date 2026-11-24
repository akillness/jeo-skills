<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  createCollapsibleController,
} from "@ui-sdk/vue/collapsible"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const recoveryCodes = ["7KQ2-M9XD", "P4TR-8HZC", "W3NB-6JUE", "C5YF-2LSA"]

const log = useLog()
const collapsible = createCollapsibleController()
const open = ref(false)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="collapsible.toggle()">Toggle</button>
    </div>
    <Collapsible
      v-model:open="open"
      data-variant="card"
      :controller="collapsible"
      @open-change="
        (next: boolean, details: ChangeDetails) =>
          log(`${next ? 'Opened' : 'Closed'} (${details.reason})`)
      "
    >
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Recovery codes</span>
          <span data-slot="hint">Each code signs you in once</span>
        </span>
        <ChevronDownIcon />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div data-slot="stack">
          <ul>
            <li v-for="code in recoveryCodes" :key="code">{{ code }}</li>
          </ul>
          <button type="button" @click="collapsible.close()">Done</button>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  </div>
</template>
