<script setup lang="ts">
import { Separator } from "@ui-sdk/vue/separator"
</script>

<template>
  <nav aria-label="Legal" data-slot="row">
    <a href="#">Privacy</a>
    <Separator orientation="vertical" />
    <a href="#">Terms</a>
    <Separator orientation="vertical" />
    <a href="#">Cookies</a>
  </nav>
</template>
