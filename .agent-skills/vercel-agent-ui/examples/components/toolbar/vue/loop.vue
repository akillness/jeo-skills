<script setup lang="ts">
import { Toolbar, ToolbarButton } from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Toolbar :loop="false" aria-label="Pages">
    <ToolbarButton
      v-for="label in ['First', 'Previous', 'Next', 'Last']"
      :key="label"
      @click="log(`${label} page`)"
    >
      {{ label }}
    </ToolbarButton>
  </Toolbar>
</template>
