<script setup lang="ts">
import { Button } from "@ui-sdk/vue/button"
</script>

<template>
  <div data-slot="row">
    <Button>
      <template #render="{ props }"
        ><a v-bind="props" href="#installation">Get Started</a></template
      >
    </Button>
    <Button disabled>
      <template #render="{ props }"
        ><a v-bind="props" href="#changelog">Changelog</a></template
      >
    </Button>
  </div>
</template>
