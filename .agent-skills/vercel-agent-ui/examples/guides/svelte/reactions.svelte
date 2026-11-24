<script lang="ts">
  import { createParts } from "@ui-sdk/svelte/primitive"
  import { reactions } from "../reactions"

  const { Root: Reactions, Reaction } = createParts(reactions, {
    root: "div",
    reaction: "button",
  })
</script>

<Reactions aria-label="Reactions">
  <Reaction value="thumbs-up" aria-label="Thumbs up">👍</Reaction>
  <Reaction value="heart" aria-label="Heart">❤️</Reaction>
  <Reaction value="laugh" aria-label="Laugh">😂</Reaction>
  <Reaction value="celebrate" aria-label="Celebrate">🎉</Reaction>
</Reactions>
