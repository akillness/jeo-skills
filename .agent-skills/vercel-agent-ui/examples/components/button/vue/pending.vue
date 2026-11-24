<script setup lang="ts">
import { Button } from "@ui-sdk/vue/button"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
</script>

<template>
  <Button @click="() => wait(1500)" pending-announcement="Saving">Save</Button>
</template>
