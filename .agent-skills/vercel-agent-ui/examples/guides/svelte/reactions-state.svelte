<script lang="ts">
  import { createParts } from "@ui-sdk/svelte/primitive"
  import { reactions } from "../reactions-state"

  const { Root: Reactions, Reaction } = createParts(reactions, {
    root: "div",
    reaction: "button",
  })
</script>

<Reactions>
  <Reaction value="thumbs-up">👍</Reaction>
  <Reaction value="heart">❤️</Reaction>
  <Reaction value="laugh">😂</Reaction>
  <Reaction value="celebrate">🎉</Reaction>
</Reactions>
