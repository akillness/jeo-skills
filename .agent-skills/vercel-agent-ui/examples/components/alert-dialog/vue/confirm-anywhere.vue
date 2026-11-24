<script setup lang="ts">
import { confirm } from "@ui-sdk/vue/alert-dialog"
import { OverlayHost } from "@ui-sdk/vue/overlays"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

async function archive() {
  const yes = await confirm({
    title: "Archive this project?",
    description: "It moves to Archived, and you can restore it anytime.",
    confirmLabel: "Archive",
  })
  log(yes ? "Archived the project" : "Kept the project")
}
</script>

<template>
  <button type="button" @click="archive">Archive Project</button>
  <OverlayHost />
</template>
