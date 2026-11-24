<script setup lang="ts">
import { Separator } from "@ui-sdk/vue/separator"
</script>

<template>
  <div data-slot="row">
    <div data-slot="stack">
      <span>24</span>
      <span data-slot="hint">Projects</span>
    </div>
    <Separator orientation="vertical" />
    <div data-slot="stack">
      <span>1,280</span>
      <span data-slot="hint">Followers</span>
    </div>
    <Separator orientation="vertical" />
    <div data-slot="stack">
      <span>312</span>
      <span data-slot="hint">Following</span>
    </div>
  </div>
</template>
