<script setup lang="ts">
import { Separator } from "@ui-sdk/vue/separator"
</script>

<template>
  <div data-slot="stack">
    <button type="button" data-variant="solid">Sign In with Passkey</button>
    <div data-slot="row">
      <Separator decorative />
      <span>or</span>
      <Separator decorative />
    </div>
    <button type="button">Email Me a Link</button>
  </div>
</template>
