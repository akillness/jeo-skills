<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/vue/collapsible"
import { useLog } from "../../../shared/vue/log"

const notes = [
  "Search now matches file contents, not only names.",
  "Shared links remember the folder they were opened from.",
  "Uploads resume after the connection drops.",
]

const log = useLog()
</script>

<template>
  <Collapsible
    data-variant="card"
    @open-change-complete="
      (open: boolean) => log(open ? 'Finished opening' : 'Finished closing')
    "
  >
    <CollapsibleTrigger>
      <span data-slot="stack">
        <span>Release notes</span>
        <span data-slot="hint">Version 2.4, released October 28</span>
      </span>
      <ChevronDownIcon />
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <ul>
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
    </CollapsiblePanel>
  </Collapsible>
</template>
