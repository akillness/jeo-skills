import { createParts } from "@ui-sdk/vue/primitive"
import { reactions } from "../reactions"
import { reactions as keyboardReactions } from "../reactions-keyboard"
import { reactions as stateReactions } from "../reactions-state"

const elements = { root: "div", reaction: "button" } as const

const { Root: Reactions, Reaction } = createParts(reactions, elements)

const { Root: StateReactions, Reaction: StateReaction } = createParts(
  stateReactions,
  elements
)

const { Root: KeyboardReactions, Reaction: KeyboardReaction } = createParts(
  keyboardReactions,
  elements
)

export {
  KeyboardReaction,
  KeyboardReactions,
  Reaction,
  Reactions,
  StateReaction,
  StateReactions,
}
