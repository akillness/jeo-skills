import { createParts } from "@ui-sdk/solid/primitive"
import { reactions } from "../reactions-state"

const { Root: Reactions, Reaction } = createParts(reactions, {
  root: "div",
  reaction: "button",
})

function Example() {
  return (
    <Reactions>
      <Reaction value="thumbs-up">👍</Reaction>
      <Reaction value="heart">❤️</Reaction>
      <Reaction value="laugh">😂</Reaction>
      <Reaction value="celebrate">🎉</Reaction>
    </Reactions>
  )
}

export { Example }
