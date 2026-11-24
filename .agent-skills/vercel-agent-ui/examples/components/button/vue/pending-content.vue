<script setup lang="ts">
import { ArrowDownToLineIcon, LoaderCircleIcon } from "@lucide/vue"
import { Button } from "@ui-sdk/vue/button"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
</script>

<template>
  <Button @click="() => wait(1500)" pending-announcement="Saving">
    <ArrowDownToLineIcon data-show="idle" aria-hidden="true" />
    <LoaderCircleIcon
      data-show="pending"
      data-slot="spinner"
      aria-hidden="true"
    />
    Save
  </Button>
</template>
