<script setup lang="ts">
import { Reaction, Reactions } from "./reactions-parts"
</script>

<template>
  <Reactions aria-label="Reactions">
    <Reaction value="thumbs-up" aria-label="Thumbs up">👍</Reaction>
    <Reaction value="heart" aria-label="Heart">❤️</Reaction>
    <Reaction value="laugh" aria-label="Laugh">😂</Reaction>
    <Reaction value="celebrate" aria-label="Celebrate">🎉</Reaction>
  </Reactions>
</template>
